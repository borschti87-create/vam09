const form = document.querySelector('#buchungsformular');
const room = form.elements.raum;
const date = form.elements.datum;
const hours = form.elements.stunden;
const starts = form.elements.uhrzeit;
const submit = form.elements.buchen;
const price = document.querySelector('#buchung-preis');
const calendarStatus = document.querySelector('#kalender-status');
const bookingStatus = document.querySelector('#buchung-status');
const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
let availabilityRequest;
let pendingBooking;

const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
date.min = today;
date.value = today;

const selectedRoom = new URLSearchParams(location.search).get('raum');
if (Array.from(room.options).some(option => option.value === selectedRoom)) room.value = selectedRoom;

async function api(path, options = {}) {
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
    return result;
}

async function updateAvailability() {
    availabilityRequest?.abort();
    const request = new AbortController();
    availabilityRequest = request;
    starts.replaceChildren(new Option('Bitte wählen', ''));
    starts.disabled = true;
    submit.disabled = true;
    if (!date.validity.valid || !hours.validity.valid) {
        price.value = '–';
        calendarStatus.textContent = 'Bitte gib ein gültiges Datum und die gewünschte Dauer an.';
        return;
    }
    calendarStatus.textContent = 'Freie Zeiten werden geladen …';
    try {
        const query = new URLSearchParams({ room: room.value, day: date.value, hours: hours.value });
        const result = await api(`/api/availability?${query}`, { signal: request.signal });
        if (request.signal.aborted) return;
        price.value = currency.format(result.cents / 100);
        for (const hour of result.starts) starts.add(new Option(`${String(hour).padStart(2, '0')}:00 Uhr`, hour));
        starts.disabled = !result.starts.length;
        calendarStatus.textContent = result.starts.length ? '' : 'An diesem Tag ist für diese Dauer keine Zeit frei.';
    } catch (error) {
        if (!request.signal.aborted) calendarStatus.textContent = error.status ? error.message : 'Der Buchungsserver konnte nicht erreicht werden.';
    }
}

for (const field of [room, date, hours]) field.addEventListener('change', updateAvailability);
starts.addEventListener('change', () => { submit.disabled = !starts.value; });
form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!starts.value || submit.disabled) return;
    const payload = {
        room: room.value, day: date.value, hour: Number(starts.value), hours: hours.valueAsNumber,
        name: form.elements.name.value.trim(), email: form.elements.email.value.trim()
    };
    const serialized = JSON.stringify(payload);
    if (pendingBooking?.serialized !== serialized) pendingBooking = { serialized, id: crypto.randomUUID() };
    const fields = Array.from(form.elements);
    fields.forEach(field => { field.disabled = true; });
    bookingStatus.textContent = 'Die Buchung wird gespeichert …';
    try {
        const result = await api('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-KuH-Request': '1' },
            body: JSON.stringify({ ...payload, id: pendingBooking.id })
        });
        const formattedDate = result.day.split('-').reverse().join('.');
        document.querySelector('#bestaetigung-daten').textContent =
            `Buchungsnummer ${result.reference} · ${result.room} · ${formattedDate}, ${result.hour}:00 Uhr · ${result.hours} Std. · ${currency.format(result.cents / 100)}`;
        document.querySelector('#bestaetigung-mail').textContent = result.emailSent
            ? 'Eine Bestätigung wurde per E-Mail verschickt.'
            : 'Speichere deine Buchungsnummer für Rückfragen an info@vam09.de.';
        if (result.paypal) {
            const payment = document.querySelector('#bestaetigung-paypal');
            payment.href = result.paypal;
            payment.hidden = false;
            document.querySelector('#bestaetigung-paypal-hinweis').hidden = false;
        }
        form.hidden = true;
        document.querySelector('#bestaetigung').hidden = false;
        document.querySelector('#bestaetigung-titel').focus();
    } catch (error) {
        fields.forEach(field => { field.disabled = false; });
        bookingStatus.textContent = error.status ? error.message : 'Die Verbindung wurde unterbrochen. Bitte versuche dieselbe Anfrage erneut.';
        if (error.status === 409) await updateAvailability();
    }
});
updateAvailability();
