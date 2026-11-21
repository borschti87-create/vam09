import express from 'express';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const production = process.env.NODE_ENV === 'production';
const adminUsername = (process.env.ADMIN_USERNAME || 'vam09-vorstand').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionKey = process.env.SESSION_KEY || randomBytes(32);
const port = Number(process.env.PORT || 3000);
const site = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
if (!adminPassword || adminPassword.length < 24) throw new Error('ADMIN_PASSWORD benötigt mindestens 24 Zeichen.');
if (!/^[a-z0-9_.-]{3,64}$/.test(adminUsername)) throw new Error('ADMIN_USERNAME benötigt 3 bis 64 Zeichen aus a–z, 0–9, Punkt, Unter- oder Bindestrich.');
if (production && (!process.env.DATABASE_URL || !process.env.SESSION_KEY || !site)) {
    throw new Error('Im Produktionsbetrieb sind DATABASE_URL, SESSION_KEY und die öffentliche URL erforderlich.');
}
const settingsKey = createHmac('sha256', process.env.SESSION_KEY || adminPassword).update('vam09-settings-v1').digest();

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
    CREATE INDEX IF NOT EXISTS slots_day ON slots(day);
    CREATE TABLE IF NOT EXISTS booking_settings (
        id smallint PRIMARY KEY CHECK (id = 1),
        settings jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    INSERT INTO booking_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
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

function monthRange(month) {
    if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) fail(400, 'Bitte einen gültigen Monat wählen.');
    const start = `${month}-01`;
    const end = new Date(Date.parse(start));
    end.setUTCMonth(end.getUTCMonth() + 1);
    return [start, end.toISOString().slice(0, 10)];
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

function startTimes(openHours, hours, earliest) {
    const open = new Set(openHours);
    return openHours.filter(hour => hour > earliest &&
        Array.from({ length: hours }, (_, offset) => hour + offset).every(value => open.has(value)));
}

const paypalPattern = /^(?:(?:https:\/\/)?(?:www\.)?paypal\.(?:me\/|com\/paypalme\/))?([A-Za-z0-9]{1,40})\/?$/i;
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const providerKeyPattern = /^re_[A-Za-z0-9_-]{8,200}$/;

function seal(value) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', settingsKey, nonce);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function unseal(value) {
    const encrypted = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', settingsKey, encrypted.subarray(0, 12));
    cipher.setAuthTag(encrypted.subarray(12, 28));
    return Buffer.concat([cipher.update(encrypted.subarray(28)), cipher.final()]).toString('utf8');
}

async function readSettings(client = db, lock = false) {
    const { rows } = await client.query(`SELECT settings FROM booking_settings WHERE id=1${lock ? ' FOR UPDATE' : ''}`);
    return rows[0].settings;
}

function displaySettings(saved) {
    const paypal = saved.paypal ?? (process.env.PAYPAL_ME || '').match(paypalPattern)?.[1] ?? '';
    const fallbackFrom = process.env.BOOKING_FROM ?? '';
    const emailFrom = saved.emailFrom ?? (fallbackFrom.match(/<([^<>]+)>$/)?.[1] ?? fallbackFrom);
    const emailKeySet = saved.emailKey === undefined ? Boolean(process.env.RESEND_API_KEY) : Boolean(saved.emailKey);
    return {
        paypal, paypalEnabled: saved.paypalEnabled ?? Boolean(paypal),
        emailFrom, emailKeySet, emailEnabled: saved.emailEnabled ?? Boolean(emailFrom && emailKeySet)
    };
}

function paypalAvailable(settings) {
    return Boolean(settings.paypalEnabled && settings.paypal);
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

const adminSessionKey = createHmac('sha256', sessionKey).update(JSON.stringify(['kuh-admin', adminUsername, adminPassword])).digest();

function sign(value) {
    return createHmac('sha256', adminSessionKey).update(value).digest('base64url');
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
    const starts = startTimes(rows.map(row => row.hour), hours, day === today ? Number(currentHour) : -1);
    res.json({ starts, cents: 500 + (hours - 1) * 300 });
});

app.get('/api/calendar', async (req, res) => {
    const [start, end] = monthRange(req.query.month);
    const room = req.query.room;
    if (!rooms.has(room)) fail(400, 'Bitte einen gültigen Raum wählen.');
    const hours = duration(Number(req.query.hours));
    const [today, currentHour] = roomDate();
    const last = incrementDay(today, 365);
    if (end <= today || start > last) fail(400, 'Bitte einen Monat innerhalb der nächsten 365 Tage wählen.');
    const [{ rows }, saved] = await Promise.all([
        db.query('SELECT day::text, hour FROM slots WHERE room=$1 AND day >= $2 AND day < $3 AND booking_id IS NULL ORDER BY day, hour',
            [room, start, end]),
        readSettings()
    ]);
    const grouped = new Map();
    for (const { day, hour } of rows) {
        if (day < today || day > last) continue;
        if (!grouped.has(day)) grouped.set(day, []);
        grouped.get(day).push(hour);
    }
    const days = {};
    for (const [day, openHours] of grouped) {
        const starts = startTimes(openHours, hours, day === today ? Number(currentHour) : -1);
        if (starts.length) days[day] = starts;
    }
    res.json({ days, cents: 500 + (hours - 1) * 300, paypalAvailable: paypalAvailable(displaySettings(saved)) });
});

async function sendEmail(saved, to, subject, body, key) {
    const settings = displaySettings(saved);
    if (!settings.emailEnabled || !settings.emailFrom || !settings.emailKeySet) return false;
    const token = saved.emailKey === undefined ? process.env.RESEND_API_KEY : saved.emailKey && unseal(saved.emailKey);
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': key
        },
        body: JSON.stringify({ from: saved.emailFrom ?? process.env.BOOKING_FROM, to: [to], reply_to: 'info@vam09.de', subject, text: body }),
        signal: AbortSignal.timeout(6500)
    });
    if (!response.ok) throw new Error(`E-Mail-Anbieter antwortet mit HTTP ${response.status}.`);
    return true;
}

async function confirmByEmail(booking, saved) {
    if (booking.email_sent || booking.cancelled) return booking.email_sent;
    const text = [
        'Verein Aktiver Musiker 2009 e. V.',
        `Deine KuH-Buchung ${reference(booking.id)} ist bestätigt.`,
        `${rooms.get(booking.room)} · ${booking.day.split('-').reverse().join('.')} · ${booking.start_hour}:00 bis ${booking.start_hour + booking.hours}:00 Uhr (Ortszeit)`,
        `Gesamtpreis: ${euro.format(booking.cents / 100)}`,
        'Bei Rückfragen erreichst du den Verein unter info@vam09.de.'
    ].join('\n');
    try {
        const sent = await sendEmail(saved, booking.email, `Deine KuH-Buchung ${reference(booking.id)}`, text, `kuh-booking/${booking.id}`);
        if (!sent) return false;
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
    const saved = await readSettings();
    const settings = displaySettings(saved);
    const emailSent = await confirmByEmail(booking, saved);
    res.status(201).json({
        reference: reference(booking.id), room: rooms.get(room), day, hour, hours, cents, emailSent,
        paypal: paypalAvailable(settings) && !booking.paid
            ? `https://www.paypal.com/paypalme/${settings.paypal}/${(cents / 100).toFixed(2)}EUR` : null
    });
});

const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: production, path: '/api/admin' };
app.post('/api/admin/login', (req, res) => {
    rateLimit(req, 'login', 8, 15 * 60 * 1000);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const usernameMatches = matches(username, adminUsername);
    const passwordMatches = matches(password, adminPassword);
    if (!usernameMatches || !passwordMatches) fail(401, 'Die Anmeldedaten stimmen nicht.');
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
app.get('/api/admin/settings', async (req, res) => res.json(displaySettings(await readSettings())));
app.post('/api/admin/settings', async (req, res) => {
    const { paypalEnabled, emailEnabled, removeEmailKey } = req.body || {};
    const paypalInput = typeof req.body?.paypal === 'string' ? req.body.paypal.trim() : '';
    const paypal = paypalInput.match(paypalPattern)?.[1] ?? '';
    const emailFrom = typeof req.body?.emailFrom === 'string' ? req.body.emailFrom.trim() : '';
    const emailKey = typeof req.body?.emailKey === 'string' ? req.body.emailKey.trim() : '';
    if (typeof paypalEnabled !== 'boolean' || typeof emailEnabled !== 'boolean' || typeof removeEmailKey !== 'boolean') {
        fail(400, 'Bitte gültige Einstellungen übergeben.');
    }
    if ((paypalInput || paypalEnabled) && !paypal) fail(400, 'Bitte einen gültigen PayPal.Me-Namen oder -Link eingeben.');
    if ((emailFrom || emailEnabled) && (emailFrom.length > 254 || !emailPattern.test(emailFrom))) {
        fail(400, 'Bitte eine gültige Absenderadresse eingeben.');
    }
    if (emailKey && (!providerKeyPattern.test(emailKey) || removeEmailKey)) fail(400, 'Bitte einen gültigen Resend-API-Schlüssel eingeben oder den bisherigen entfernen.');
    const updated = await transaction(async client => {
        const current = await readSettings(client, true);
        const next = { ...current, paypal, paypalEnabled, emailFrom, emailEnabled };
        if (removeEmailKey) next.emailKey = null;
        if (emailKey) next.emailKey = seal(emailKey);
        const result = displaySettings(next);
        if (emailEnabled && !result.emailKeySet) fail(400, 'Für E-Mail-Bestätigungen ist ein Resend-API-Schlüssel erforderlich.');
        await client.query('UPDATE booking_settings SET settings=$1::jsonb WHERE id=1', [JSON.stringify(next)]);
        return result;
    });
    res.json(updated);
});
app.post('/api/admin/test-email', async (req, res) => {
    rateLimit(req, 'mail-test', 5, 60 * 60 * 1000);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (email.length > 254 || !emailPattern.test(email)) fail(400, 'Bitte eine gültige Test-E-Mail-Adresse eingeben.');
    const saved = await readSettings();
    if (!displaySettings(saved).emailEnabled) fail(400, 'Bitte den E-Mail-Versand zuerst aktivieren und speichern.');
    try {
        const sent = await sendEmail(saved, email, 'KuH: Test der Buchungsbestätigung',
            'Der E-Mail-Versand für die KuH-Raumbuchung ist eingerichtet.', `kuh-test/${randomBytes(16).toString('hex')}`);
        if (!sent) fail(502, 'Der E-Mail-Versand ist nicht vollständig eingerichtet.');
    } catch {
        return res.status(502).json({ error: 'Die Test-E-Mail konnte nicht gesendet werden. Bitte prüfe Absender und Resend-Schlüssel.' });
    }
    res.json({ ok: true });
});
app.get('/api/admin/month', async (req, res) => {
    const [start, end] = monthRange(req.query.month);
    const [times, bookings] = await Promise.all([
        db.query(`SELECT day::text, COUNT(*)::int AS free FROM slots
                  WHERE day >= $1 AND day < $2 AND booking_id IS NULL GROUP BY day ORDER BY day`, [start, end]),
        db.query(`SELECT day::text, COUNT(*) FILTER (WHERE NOT cancelled)::int AS booked,
                  COUNT(*) FILTER (WHERE NOT cancelled AND NOT paid)::int AS unpaid,
                  COUNT(*) FILTER (WHERE cancelled)::int AS cancelled
                  FROM bookings WHERE day >= $1 AND day < $2 GROUP BY day ORDER BY day`, [start, end])
    ]);
    res.json({ times: times.rows, bookings: bookings.rows });
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
const files = [...pages, 'style.css', 'buchung.js', 'admin.js', 'home.js'];
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
