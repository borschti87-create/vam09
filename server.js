import express from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const production = process.env.NODE_ENV === 'production';
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionKey = process.env.SESSION_KEY || randomBytes(32);
const port = Number(process.env.PORT || 3000);
const site = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
const mailSettings = process.env.RESEND_API_KEY && process.env.BOOKING_FROM;
const paypalName = /^[A-Za-z0-9]{1,40}$/.test(process.env.PAYPAL_ME || '') ? process.env.PAYPAL_ME : '';
if (!adminPassword || adminPassword.length < 24) throw new Error('ADMIN_PASSWORD benötigt mindestens 24 Zeichen.');
if (production && (!process.env.DATABASE_URL || !process.env.SESSION_KEY || !site)) {
    throw new Error('Im Produktionsbetrieb sind DATABASE_URL, SESSION_KEY und die öffentliche URL erforderlich.');
}

const postgres = process.env.DATABASE_URL
    ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000 })
    : null;
postgres?.on('error', () => console.error('Eine inaktive Datenbankverbindung wurde unterbrochen.'));
const localDb = postgres ? null : new PGlite(process.env.LOCAL_DB_PATH || './.kuh-data');
const db = postgres || localDb;
const schema = `
    CREATE TABLE IF NOT EXISTS bookings (
        id uuid PRIMARY KEY,
        room text NOT NULL CHECK (room IN ('proberaum', 'werkstatt')),
        day date NOT NULL,
        start_hour smallint NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
        hours smallint NOT NULL CHECK (hours BETWEEN 1 AND 8),
        name text NOT NULL,
        email text NOT NULL,
        cents integer NOT NULL CHECK (cents > 0),
        cancelled boolean NOT NULL DEFAULT false,
        paid boolean NOT NULL DEFAULT false,
        email_sent boolean NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS slots (
        room text NOT NULL CHECK (room IN ('proberaum', 'werkstatt')),
        day date NOT NULL,
        hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
        booking_id uuid REFERENCES bookings(id),
        PRIMARY KEY (room, day, hour)
    );
    CREATE INDEX IF NOT EXISTS bookings_day ON bookings(day);
`;
await (localDb ? localDb.exec(schema) : postgres.query(schema));

async function transaction(work) {
    if (localDb) return localDb.transaction(work);
    const client = await postgres.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

const rooms = new Map([['proberaum', 'KuH-Proberaum'], ['werkstatt', 'KuH-DIY-Werkstatt']]);
const clock = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});
const roomDate = () => clock.format(new Date()).replace(' kl. ', ' ').split(' ');
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const reference = id => id.slice(0, 8).toUpperCase();
const limited = new Map();

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}

function dateValue(value) {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail(400, 'Bitte ein gültiges Datum wählen.');
    const time = Date.parse(value);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail(400, 'Bitte ein gültiges Datum wählen.');
    return value;
}

function incrementDay(day, offset) {
    return new Date(Date.parse(day) + offset * 86400000).toISOString().slice(0, 10);
}

function slotInput(input) {
    const { room, day, hour } = input;
    if (!rooms.has(room) || !Number.isInteger(hour) || hour < 0 || hour > 23) fail(400, 'Raum oder Uhrzeit ungültig.');
    return { room, day: dateValue(day), hour };
}

function ensureFuture(day, hour) {
    const [today, currentHour] = roomDate();
    if (day < today || day > incrementDay(today, 365) || (day === today && hour <= Number(currentHour))) {
        fail(400, 'Die Startzeit muss innerhalb der nächsten 365 Tage liegen.');
    }
}

function duration(value) {
    if (!Number.isInteger(value) || value < 1 || value > 8) fail(400, 'Bitte zwischen 1 und 8 Stunden wählen.');
    return value;
}

function rateLimit(req, group, max, windowMs) {
    const now = Date.now();
    if (limited.size >= 10000) {
        for (const [key, value] of limited) if (value.until <= now) limited.delete(key);
        if (limited.size >= 10000) fail(429, 'Gerade sind zu viele Anfragen unterwegs. Bitte später erneut versuchen.');
    }
    const key = `${group}:${req.ip}`;
    const previous = limited.get(key);
    const entry = previous?.until > now ? previous : { count: 0, until: now + windowMs };
    if (entry.count >= max) fail(429, 'Zu viele Versuche. Bitte später erneut versuchen.');
    entry.count++;
    limited.set(key, entry);
}

function sign(value) {
    return createHmac('sha256', sessionKey).update(value).digest('base64url');
}

function matches(left, right) {
    const digest = value => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(left), digest(right));
}

function requireAdmin(req, res, next) {
    const cookie = req.headers.cookie?.split('; ').find(value => value.startsWith('kuh_admin='))?.slice(10) || '';
    const [expires, nonce, signature] = cookie.split('.');
    if (!signature || Number(expires) <= Date.now() || !matches(signature, sign(`${expires}.${nonce}`))) {
        fail(401, 'Bitte im Admin-Bereich anmelden.');
    }
    next();
}

const app = express();
app.disable('x-powered-by');
if (production) app.set('trust proxy', 1);
app.use((req, res, next) => {
    res.set({
        'Content-Security-Policy': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
    });
    next();
});
app.use(['/api', '/healthz'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && (req.get('X-KuH-Request') !== '1' || !req.is('application/json') || req.get('Sec-Fetch-Site') === 'cross-site')) {
        fail(403, 'Diese Anfrage ist nur über die KuH-Website möglich.');
    }
    next();
});
app.use('/api', express.json({ limit: '8kb' }));
app.get('/healthz', async (req, res) => {
    await db.query('SELECT 1');
    res.send('ok');
});
app.get('/api/availability', async (req, res) => {
    const { room, day } = slotInput({ ...req.query, hour: 0 });
    const hours = duration(Number(req.query.hours));
    const [today, currentHour] = roomDate();
    if (day < today || day > incrementDay(today, 365)) fail(400, 'Bitte einen Tag innerhalb der nächsten 365 Tage wählen.');
    const { rows } = await db.query('SELECT hour FROM slots WHERE room=$1 AND day=$2 AND booking_id IS NULL ORDER BY hour', [room, day]);
    const open = new Set(rows.map(row => row.hour));
    const starts = rows.map(row => row.hour).filter(hour => {
        if (day === today && hour <= Number(currentHour)) return false;
        return Array.from({ length: hours }, (_, offset) => hour + offset).every(value => open.has(value));
    });
    res.json({ starts, cents: 500 + (hours - 1) * 300 });
});

async function confirmByEmail(booking) {
    if (!mailSettings || booking.email_sent || booking.cancelled) return booking.email_sent;
    const text = [
        `Deine KuH-Buchung ${reference(booking.id)} ist bestätigt.`,
        `${rooms.get(booking.room)} · ${booking.day.split('-').reverse().join('.')} · ${booking.start_hour}:00 Uhr · ${booking.hours} Std.`,
        `Preis: ${euro.format(booking.cents / 100)}`,
        'Bei Rückfragen erreichst du den Verein unter info@vam09.de.'
    ].join('\n');
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `kuh-booking/${booking.id}`
            },
            body: JSON.stringify({
                from: process.env.BOOKING_FROM,
                to: [booking.email],
                reply_to: 'info@vam09.de',
                subject: `Deine KuH-Buchung ${reference(booking.id)}`,
                text
            }),
            signal: AbortSignal.timeout(6500)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await db.query('UPDATE bookings SET email_sent=true WHERE id=$1', [booking.id]);
        return true;
    } catch (error) {
        console.error('Buchungs-E-Mail fehlgeschlagen:', error.message);
        return false;
    }
}

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
app.post('/api/bookings', async (req, res) => {
    rateLimit(req, 'booking', 30, 60 * 60 * 1000);
    const { room, day, hour } = slotInput(req.body || {});
    const hours = duration(req.body.hours);
    const { id } = req.body;
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
    if (!uuid.test(id) || !name || name.length > 100 || /[\r\n]/.test(name) ||
        email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Bitte Name und gültige E-Mail-Adresse angeben.');
    if (hour + hours > 24) fail(400, 'Eine Buchung muss am selben Tag enden.');
    const cents = 500 + (hours - 1) * 300;
    const booking = await transaction(async client => {
        const existing = await client.query('SELECT *, day::text AS day FROM bookings WHERE id=$1', [id]);
        if (existing.rows.length) {
            const value = existing.rows[0];
            if (value.room !== room || value.day !== day || value.start_hour !== hour || value.hours !== hours ||
                value.name !== name || value.email !== email || value.cancelled) fail(409, 'Die Buchungsanfrage ist nicht mehr gültig.');
            return value;
        }
        ensureFuture(day, hour);
        const insert = await client.query(
            `INSERT INTO bookings (id, room, day, start_hour, hours, name, email, cents)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *, day::text AS day`,
            [id, room, day, hour, hours, name, email, cents]
        );
        if (!insert.rows.length) fail(409, 'Die Anfrage wird bereits verarbeitet. Bitte kurz warten und erneut versuchen.');
        const { rows } = await client.query(
            `UPDATE slots SET booking_id=$1 WHERE room=$2 AND day=$3 AND hour >= $4 AND hour < $5
             AND booking_id IS NULL RETURNING hour`,
            [id, room, day, hour, hour + hours]
        );
        if (rows.length !== hours) fail(409, 'Diese Zeit ist inzwischen vergeben. Bitte wähle einen anderen Termin.');
        return insert.rows[0];
    });
    const emailSent = await confirmByEmail(booking);
    res.status(201).json({
        reference: reference(booking.id), room: rooms.get(room), day, hour, hours, cents, emailSent,
        paypal: paypalName && !booking.paid ? `https://www.paypal.com/paypalme/${paypalName}/${(cents / 100).toFixed(2)}EUR` : null
    });
});

const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: production, path: '/api/admin' };
app.post('/api/admin/login', (req, res) => {
    rateLimit(req, 'login', 8, 15 * 60 * 1000);
    const password = req.body?.password;
    if (typeof password !== 'string' || !matches(password, adminPassword)) fail(401, 'Das Passwort stimmt nicht.');
    const expires = Date.now() + 8 * 60 * 60 * 1000;
    const value = `${expires}.${randomBytes(16).toString('hex')}`;
    res.cookie('kuh_admin', `${value}.${sign(value)}`, { ...cookieOptions, expires: new Date(expires) });
    res.json({ ok: true });
});
app.use('/api/admin', requireAdmin);
app.get('/api/admin/session', (req, res) => res.json({ ok: true }));
app.post('/api/admin/logout', (req, res) => {
    res.clearCookie('kuh_admin', cookieOptions);
    res.json({ ok: true });
});
app.get('/api/admin/schedule', async (req, res) => {
    const day = dateValue(req.query.day);
    const [hours, bookings] = await Promise.all([
        db.query('SELECT room, hour FROM slots WHERE day=$1 AND booking_id IS NULL ORDER BY room, hour', [day]),
        db.query(`SELECT id, room, start_hour, hours, name, email, cents, cancelled, paid, email_sent
                  FROM bookings WHERE day=$1 ORDER BY start_hour, room`, [day])
    ]);
    res.json({ hours: hours.rows, bookings: bookings.rows.map(booking => ({ ...booking, reference: reference(booking.id) })) });
});
app.post('/api/admin/slots', async (req, res) => {
    const { room, day, hour } = slotInput(req.body || {});
    const end = req.body.end;
    if (!Number.isInteger(end) || end <= hour || end > 24) fail(400, 'Bitte eine gültige Endzeit wählen.');
    if (req.body.open === true) {
        ensureFuture(day, hour);
        await db.query(`INSERT INTO slots (room, day, hour)
                        SELECT $1, $2::date, n FROM generate_series($3::integer, $4::integer) AS n
                        ON CONFLICT DO NOTHING`, [room, day, hour, end - 1]);
    } else if (req.body.open === false) {
        await db.query('DELETE FROM slots WHERE room=$1 AND day=$2 AND hour >= $3 AND hour < $4 AND booking_id IS NULL',
            [room, day, hour, end]);
    } else fail(400, 'Bitte Zeiten freigeben oder sperren.');
    res.json({ ok: true });
});
app.post('/api/admin/bookings/:id', async (req, res) => {
    const { id } = req.params;
    const action = req.body?.action;
    if (!uuid.test(id) || !['cancel', 'paid', 'unpaid'].includes(action)) fail(400, 'Ungültige Buchungsaktion.');
    await transaction(async client => {
        const { rows } = await client.query('SELECT paid, cancelled FROM bookings WHERE id=$1 FOR UPDATE', [id]);
        if (!rows.length) fail(404, 'Buchung nicht gefunden.');
        if (rows[0].cancelled) fail(409, 'Die Buchung ist bereits storniert.');
        if (action === 'cancel') {
            if (rows[0].paid) fail(409, 'Bitte zuerst die Zahlung erstatten und den Zahlungsstatus zurücksetzen.');
            await client.query('UPDATE bookings SET cancelled=true WHERE id=$1', [id]);
            await client.query('UPDATE slots SET booking_id=NULL WHERE booking_id=$1', [id]);
        } else {
            await client.query('UPDATE bookings SET paid=$2 WHERE id=$1', [id, action === 'paid']);
        }
    });
    res.json({ ok: true });
});

const root = fileURLToPath(new URL('.', import.meta.url));
const pages = ['index.html', 'buchung.html', 'admin.html', 'archiv.html', 'impressum.html', 'datenschutz.html', 'satzung.html'];
const files = [...pages, 'style.css', 'buchung.js', 'admin.js'];
app.get('/', (req, res) => res.sendFile(join(root, 'index.html')));
for (const file of files) app.get(`/${file}`, (req, res) => res.sendFile(join(root, file)));
for (const dir of ['assets', 'downloads']) app.use(`/${dir}`, express.static(join(root, dir), { index: false }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Anfrage nicht gefunden.' }));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || 500;
    if (status >= 500) console.error(error.code || error.message);
    res.status(status).json({ error: status >= 500 ? 'Der Server ist gerade nicht erreichbar. Bitte später erneut versuchen.' : error.message });
});
const server = app.listen(port, process.env.BIND_HOST || '0.0.0.0');
server.on('listening', () => console.log(`KuH läuft auf Port ${server.address().port}.`));
