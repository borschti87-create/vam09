const login = document.querySelector('#admin-login');
const panel = document.querySelector('#admin-panel');
const schedule = document.querySelector('#admin-slots');
const message = document.querySelector('#admin-status');
const bookings = document.querySelector('#admin-bookings');
const rooms = { proberaum: 'KuH-Proberaum', werkstatt: 'KuH-DIY-Werkstatt' };
const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const hourLabel = hour => `${String(hour).padStart(2, '0')}:00`;
let loadRequest;
schedule.elements.day.value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

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
            await load();
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
    await load();
}

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
schedule.elements.day.addEventListener('change', load);
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
        await load();
    } catch (error) {
        showError(error);
    }
});

api('/api/admin/session').then(showPanel).catch(error => {
    showLogin();
    if (error.status !== 401) showError(error, false);
});
