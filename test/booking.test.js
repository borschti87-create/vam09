import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';

const password = 'nur-fuer-den-lokalen-buchungstest-2026';
const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
const urlQuery = new URLSearchParams({ room: 'proberaum', day: tomorrow, hours: '2' });
const month = tomorrow.slice(0, 7);
const mailKey = 're_testProviderKey123';
const mailFrom = 'booking@example.invalid';

test('Öffnungszeiten, konkurrierende Reservierungen und Verwaltung', async t => {
    const mockEmailProvider = `
        const original = globalThis.fetch;
        globalThis.fetch = async (url, options) => {
            if (url !== 'https://api.resend.com/emails') return original(url, options);
            const data = JSON.parse(options.body);
            const valid = options.headers.Authorization === 'Bearer ${mailKey}' &&
                options.headers['Idempotency-Key'].startsWith('kuh-') && data.from === '${mailFrom}' &&
                data.to[0].endsWith('@example.invalid');
            return new Response(null, { status: valid ? 202 : 400 });
        };
    `;
    const process = spawn('node', ['--import', 'data:text/javascript,' + encodeURIComponent(mockEmailProvider), 'server.js'], {
        env: {
            PATH: globalThis.process.env.PATH,
            ADMIN_PASSWORD: password,
            PORT: '0',
            BIND_HOST: '127.0.0.1',
            LOCAL_DB_PATH: 'memory://',
            PAYPAL_ME: 'TestVerein'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    t.after(() => process.kill());
    const port = await new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error('Serverstart dauerte zu lange.')), 15000);
        process.stderr.on('data', chunk => { output += chunk; });
        process.stdout.on('data', chunk => {
            output += chunk;
            const match = output.match(/Port (\d+)/);
            if (match) {
                clearTimeout(timer);
                resolve(match[1]);
            }
        });
        process.once('exit', code => {
            clearTimeout(timer);
            reject(new Error(`Server beendete sich mit Code ${code}: ${output}`));
        });
    });
    const origin = `http://127.0.0.1:${port}`;
    let cookie;
    async function api(path, method = 'GET', body, admin = false) {
        const headers = {};
        if (admin) headers.cookie = cookie;
        if (method !== 'GET') {
            headers['Content-Type'] = 'application/json';
            headers['X-KuH-Request'] = '1';
        }
        const response = await fetch(origin + path, { method, headers, body: JSON.stringify(body) });
        return { status: response.status, headers: response.headers, body: await response.json() };
    }
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    assert.equal((await fetch(origin + '/server.js')).status, 404);
    assert.equal((await fetch(origin + '/downloads/mitgliedsantrag.pdf')).status, 200);
    assert.equal((await api(`/api/admin/schedule?day=${tomorrow}`)).status, 401);
    assert.equal((await fetch(origin + '/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    })).status, 403);
    assert.equal((await api('/api/admin/login', 'POST', { password: 'wrong' })).status, 401);
    const auth = await api('/api/admin/login', 'POST', { password });
    assert.equal(auth.status, 200);
    cookie = auth.headers.get('set-cookie').split(';')[0];
    const savedSettings = { paypal: 'paypal.me/TestVerein', paypalEnabled: true,
        emailFrom: mailFrom, emailEnabled: true, emailKey: mailKey, removeEmailKey: false };
    assert.equal((await api('/api/admin/settings')).status, 401);
    assert.equal((await api('/api/admin/test-email', 'POST', { email: 'board@example.invalid' }, true)).status, 400);
    const setup = await api('/api/admin/settings', 'POST', savedSettings, true);
    assert.equal(setup.status, 200);
    assert.deepEqual(setup.body, {
        paypal: 'TestVerein', paypalEnabled: true, emailFrom: mailFrom, emailEnabled: true, emailKeySet: true
    });
    assert.deepEqual((await api('/api/admin/settings', 'GET', undefined, true)).body, setup.body);
    assert.equal((await api('/api/admin/test-email', 'POST', { email: 'board@example.invalid' }, true)).status, 200);

    const slot = { room: 'proberaum', day: tomorrow, hour: 16, end: 20 };
    assert.deepEqual((await api(`/api/availability?${urlQuery}`)).body.starts, []);
    assert.equal((await api('/api/admin/slots', 'POST', { ...slot, open: true }, true)).status, 200);
    assert.deepEqual((await api(`/api/availability?${urlQuery}`)).body, { starts: [16, 17, 18], cents: 800 });
    const calendar = `/api/calendar?room=proberaum&month=${month}&hours=2`;
    assert.deepEqual((await api(calendar)).body, { days: { [tomorrow]: [16, 17, 18] }, cents: 800 });
    assert.equal((await api('/api/calendar?room=proberaum&month=2026-15&hours=2')).status, 400);

    const base = { ...slot, hour: 17, hours: 2, name: 'Test', email: 'booking@example.invalid' };
    const first = { ...base, id: randomUUID() };
    const second = { ...base, id: randomUUID() };
    const results = await Promise.all([first, second].map(payload => api('/api/bookings', 'POST', payload)));
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const winner = results.findIndex(result => result.status === 201);
    const booked = results[winner].body;
    const successful = [first, second][winner];
    assert.match(booked.reference, /^[0-9A-F]{8}$/);
    assert.equal(booked.emailSent, true);
    assert.match(booked.paypal, /TestVerein\/8\.00EUR$/);
    assert.equal((await api('/api/bookings', 'POST', successful)).body.reference, booked.reference);
    assert.deepEqual((await api(`/api/availability?${urlQuery}`)).body.starts, []);
    assert.deepEqual((await api(calendar)).body.days, {});
    assert.deepEqual((await api(`/api/admin/month?month=${month}`, 'GET', undefined, true)).body, {
        times: [{ day: tomorrow, free: 2 }], bookings: [{ day: tomorrow, booked: 1, unpaid: 1, cancelled: 0 }]
    });

    const list = await api(`/api/admin/schedule?day=${tomorrow}`, 'GET', undefined, true);
    assert.equal(list.body.bookings.length, 1);
    assert.equal(list.body.bookings[0].email, base.email);
    const action = `/api/admin/bookings/${successful.id}`;
    assert.equal((await api(action, 'POST', { action: 'paid' }, true)).status, 200);
    assert.equal((await api(action, 'POST', { action: 'cancel' }, true)).status, 409);
    assert.equal((await api(action, 'POST', { action: 'unpaid' }, true)).status, 200);
    assert.equal((await api(action, 'POST', { action: 'cancel' }, true)).status, 200);
    assert.deepEqual((await api(`/api/availability?${urlQuery}`)).body.starts, [16, 17, 18]);
    const off = await api('/api/admin/settings', 'POST', { ...savedSettings, emailKey: '', emailEnabled: false, paypalEnabled: false }, true);
    assert.equal(off.body.emailKeySet, true);
    assert.equal((await api('/api/admin/test-email', 'POST', { email: 'board@example.invalid' }, true)).status, 400);
    const noIntegrations = await api('/api/bookings', 'POST', { ...base, id: randomUUID(), hour: 16 });
    assert.equal(noIntegrations.status, 201);
    assert.equal(noIntegrations.body.emailSent, false);
    assert.equal(noIntegrations.body.paypal, null);
    const remove = await api('/api/admin/settings', 'POST', { ...savedSettings, emailKey: '', emailEnabled: false, removeEmailKey: true }, true);
    assert.equal(remove.body.emailKeySet, false);
    assert.equal((await api('/api/admin/settings', 'POST', { ...savedSettings, emailKey: '' }, true)).status, 400);
    assert.equal((await api('/api/admin/slots', 'POST', { ...slot, open: false }, true)).status, 200);
    assert.deepEqual((await api(`/api/availability?${urlQuery}`)).body.starts, []);

    assert.equal((await api('/api/admin/logout', 'POST', {}, true)).status, 200);
    const exit = once(process, 'exit');
    process.kill();
    await exit;
});
