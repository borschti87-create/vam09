const login = document.querySelector('#admin-login');
const panel = document.querySelector('#admin-panel');
const schedule = document.querySelector('#admin-slots');
const message = document.querySelector('#admin-status');
const bookings = document.querySelector('#admin-bookings');
const monthInput = document.querySelector('#admin-month');
const settingsForm = document.querySelector('#admin-settings');
const testEmailForm = document.querySelector('#admin-test-email');
const monthStatus = document.querySelector('#admin-month-status');
const settingsStatus = document.querySelector('#admin-settings-status');
const testStatus = document.querySelector('#admin-test-status');
const monthDays = document.querySelector('#admin-month-days');
const monthTotals = document.querySelector('#admin-month-totals');
const dateLabel = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });
let monthRequest;
let canSendTest = false;
const rooms = { proberaum: 'KuH-Proberaum', werkstatt: 'KuH-DIY-Werkstatt' };
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const hourLabel = hour => `${String(hour).padStart(2, '0')}:00`;
let loadRequest;
schedule.elements.day.value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
monthInput.value = schedule.elements.day.value.slice(0, 7);

for (let hour = 0; hour <= 24; hour++) {
    if (hour < 24) schedule.elements.hour.add(new Option(hourLabel(hour), hour, hour === 16, hour === 16));
    if (hour > 0) schedule.elements.end.add(new Option(hourLabel(hour), hour, hour === 20, hour === 20));
}

async function api(path, data, signal) {
    const response = await fetch(path, data === undefined ? { signal } : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-KuH-Request': '1' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
    return result;
}

function showLogin() {
    loadRequest?.abort();
    monthRequest?.abort();
    settingsForm.reset();
    settingsForm.querySelector('button').disabled = true;
    testEmailForm.reset();
    monthDays.replaceChildren();
    monthTotals.replaceChildren();
    settingsStatus.textContent = '';
    testStatus.textContent = '';
    login.hidden = false;
    panel.hidden = true;
    schedule.reset();
    bookings.replaceChildren();
    document.querySelector('#admin-hours').textContent = '';
}

function showError(error, authenticated = true) {
    if (error.status === 401 && authenticated) showLogin();
    message.textContent = error.status ? error.message : 'Der Buchungsserver konnte nicht erreicht werden.';
}

function text(tag, content) {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
}

function bookingAction(booking, label, action, confirmText) {
    const button = text('button', label);
    button.type = 'button';
    button.className = 'button button-small button-line';
    button.addEventListener('click', async () => {
        if (confirmText && !window.confirm(confirmText)) return;
        button.disabled = true;
        try {
            await api(`/api/admin/bookings/${booking.id}`, { action });
            message.textContent = 'Buchung aktualisiert.';
            await Promise.all([load(), loadMonth()]);
        } catch (error) {
            showError(error);
            button.disabled = false;
        }
    });
    return button;
}

function displayBooking(booking) {
    const card = document.createElement('article');
    card.className = 'admin-booking';
    const paymentStatus = booking.paid ? 'bezahlt' : 'unbezahlt';
    const status = booking.cancelled ? 'Storniert' : `Bestätigt · ${paymentStatus}`;
    card.append(
        text('h3', `${hourLabel(booking.start_hour)}–${hourLabel(booking.start_hour + booking.hours)} · ${rooms[booking.room]}`),
        text('p', `${booking.reference} · ${status} · ${euro.format(booking.cents / 100)}`),
        text('p', `${booking.name} · ${booking.email}`)
    );
    if (!booking.cancelled) {
        const actions = document.createElement('div');
        actions.className = 'admin-actions';
        actions.append(
            booking.paid
                ? bookingAction(booking, 'Zahlungsstatus zurücksetzen', 'unpaid', 'Hast du die Zahlung bereits erstattet oder möchtest du einen Erfassungsfehler korrigieren?')
                : bookingAction(booking, 'Zahlung verbuchen', 'paid'),
            bookingAction(booking, 'Stornieren', 'cancel', 'Termin stornieren und die Stunden wieder freigeben? Bitte informiere die buchende Person.')
        );
        card.append(actions);
    }
    return card;
}

async function load() {
    if (!schedule.elements.day.validity.valid) return;
    loadRequest?.abort();
    const request = new AbortController();
    loadRequest = request;
    const day = schedule.elements.day.value;
    try {
        const result = await api(`/api/admin/schedule?${new URLSearchParams({ day })}`, undefined, request.signal);
        if (request.signal.aborted) return;
        const open = result.hours.filter(entry => entry.room === schedule.elements.room.value).map(entry => hourLabel(entry.hour));
        document.querySelector('#admin-hours').textContent = open.length
            ? `Freie Stunden im gewählten Raum: ${open.join(', ')}`
            : 'Im gewählten Raum sind keine freien Stunden hinterlegt.';
        bookings.replaceChildren(...(result.bookings.length ? result.bookings.map(displayBooking) : [text('p', 'Für diesen Tag gibt es keine Buchungen.')]));
    } catch (error) {
        if (!request.signal.aborted) showError(error);
    }
}

async function showPanel() {
    login.hidden = true;
    panel.hidden = false;
    if (!schedule.elements.day.value) {
        schedule.elements.day.value = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
    }
    if (!monthInput.value) monthInput.value = schedule.elements.day.value.slice(0, 7);
    await Promise.all([load(), loadMonth(), loadSettings()]);
}

async function loadMonth() {
    if (!monthInput.validity.valid) return;
    monthRequest?.abort();
    const request = new AbortController();
    monthRequest = request;
    monthStatus.textContent = 'Monat wird geladen …';
    try {
        const result = await api(`/api/admin/month?${new URLSearchParams({ month: monthInput.value })}`, undefined, request.signal);
        if (request.signal.aborted) return;
        const all = new Map(result.times.map(item => [item.day, {free: item.free, booked: 0, unpaid: 0, cancelled: 0}]));
        for (const item of result.bookings) {
            all.set(item.day, {free: 0, ...all.get(item.day), booked: item.booked, unpaid: item.unpaid, cancelled: item.cancelled});
        }
        const totals = {free: 0, booked: 0, unpaid: 0, cancelled: 0};
        for (const entry of all.values()) for (const key of Object.keys(totals)) totals[key] += entry[key];
        const labels = { free: 'Freie Stunden', booked: 'Buchungen', unpaid: 'Unbezahlt', cancelled: 'Storniert' };
        monthTotals.replaceChildren(...Object.entries(labels).map(([key, label]) => {
            const card = document.createElement('div');
            card.append(text('dt', label), text('dd', totals[key]));
            return card;
        }));
        monthDays.replaceChildren(...Array.from(all.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([day, item]) => {
            const button = text('button', `${dateLabel.format(new Date(day))} · ${item.free} Std. frei · ${item.booked} ${item.booked === 1 ? 'Buchung' : 'Buchungen'}`);
            button.type = 'button';
            button.addEventListener('click', () => {
                schedule.elements.day.value = day;
                schedule.scrollIntoView();
                schedule.elements.day.focus({ preventScroll: true });
                load();
            });
            return button;
        }));
        monthStatus.textContent = all.size ? '' : 'Für diesen Monat gibt es noch keine Zeiten oder Buchungen.';
    } catch (error) {
        if (request.signal.aborted) return;
        monthStatus.textContent = '';
        showError(error);
    }
}

function displaySettings(result) {
    settingsForm.elements.paypal.value = result.paypal;
    settingsForm.elements.paypalEnabled.checked = result.paypalEnabled;
    settingsForm.elements.emailFrom.value = result.emailFrom;
    settingsForm.elements.emailEnabled.checked = result.emailEnabled;
    settingsForm.elements.emailKey.value = '';
    settingsForm.elements.removeEmailKey.checked = false;
    document.querySelector('#admin-key-status').textContent = result.emailKeySet
        ? 'Ein Schlüssel ist hinterlegt. Lass das Feld leer, um ihn zu behalten.'
        : 'Noch kein Schlüssel hinterlegt.';
    canSendTest = result.emailEnabled && result.emailKeySet;
    testEmailForm.querySelector('button').disabled = !canSendTest;
}

async function loadSettings() {
    try {
        displaySettings(await api('/api/admin/settings'));
        settingsForm.querySelector('button').disabled = false;
    } catch (error) {
        showError(error);
    }
}

settingsForm.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = settingsForm.elements;
    const button = event.submitter;
    button.disabled = true;
    settingsStatus.textContent = '';
    testStatus.textContent = '';
    try {
        displaySettings(await api('/api/admin/settings', {
            paypal: fields.paypal.value, paypalEnabled: fields.paypalEnabled.checked,
            emailFrom: fields.emailFrom.value, emailEnabled: fields.emailEnabled.checked,
            emailKey: fields.emailKey.value, removeEmailKey: fields.removeEmailKey.checked
        }));
        settingsStatus.textContent = 'Einstellungen gespeichert.';
    } catch (error) {
        if (error.status === 401) showLogin();
        settingsStatus.textContent = error.status ? error.message : 'Einstellungen konnten nicht gespeichert werden.';
    } finally {
        button.disabled = false;
    }
});

testEmailForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    testStatus.textContent = 'Test-E-Mail wird gesendet …';
    try {
        await api('/api/admin/test-email', { email: testEmailForm.elements.email.value });
        testStatus.textContent = 'Der E-Mail-Anbieter hat die Test-E-Mail angenommen.';
    } catch (error) {
        if (error.status === 401) showLogin();
        testStatus.textContent = error.status ? error.message : 'Die Test-E-Mail konnte nicht gesendet werden.';
    } finally {
        button.disabled = !canSendTest;
    }
});

monthInput.addEventListener('change', loadMonth);
login.addEventListener('submit', async event => {
    event.preventDefault();
    try {
        await api('/api/admin/login', { password: login.elements.password.value });
        login.reset();
        message.textContent = '';
        await showPanel();
    } catch (error) {
        showError(error, false);
    }
});
document.querySelector('#admin-logout').addEventListener('click', async () => {
    try {
        await api('/api/admin/logout', {});
        message.textContent = 'Du bist abgemeldet.';
        showLogin();
    } catch (error) {
        showError(error);
    }
});
schedule.elements.day.addEventListener('change', () => {
    if (!schedule.elements.day.validity.valid) return;
    const selectedMonth = schedule.elements.day.value.slice(0, 7);
    if (monthInput.value !== selectedMonth) {
        monthInput.value = selectedMonth;
        loadMonth();
    }
    load();
});
schedule.elements.room.addEventListener('change', load);
schedule.addEventListener('submit', async event => {
    event.preventDefault();
    try {
        const open = event.submitter.value === 'open';
        await api('/api/admin/slots', {
            day: schedule.elements.day.value, room: schedule.elements.room.value,
            hour: Number(schedule.elements.hour.value), end: Number(schedule.elements.end.value), open
        });
        message.textContent = open ? 'Zeiten freigegeben.' : 'Freie Stunden im gewählten Zeitraum gesperrt.';
        await Promise.all([load(), loadMonth()]);
    } catch (error) {
        showError(error);
    }
});

api('/api/admin/session').then(showPanel).catch(error => {
    showLogin();
    if (error.status !== 401) showError(error, false);
});
