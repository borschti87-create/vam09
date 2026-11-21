const form = document.querySelector('#buchungsformular');
const room = form.elements.raum;
const hours = form.elements.stunden;
const submit = form.elements.buchen;
const price = document.querySelector('#buchung-preis');
const calendarStatus = document.querySelector('#kalender-status');
const bookingStatus = document.querySelector('#buchung-status');
const calendar = document.querySelector('#kalender-tage');
const monthTitle = document.querySelector('#kalender-monat');
const previous = document.querySelector('#monat-zurueck');
const next = document.querySelector('#monat-weiter');
const dateLabel = document.querySelector('#termin-datum');
const times = document.querySelector('#termin-zeiten');
const summaryRoom = document.querySelector('#buchung-raum');
const summaryDate = document.querySelector('#buchung-datum');
const summaryTime = document.querySelector('#buchung-zeitraum');
const paymentNotice = document.querySelector('#buchung-zahlung');
const paymentDescription = document.createTextNode('');
paymentNotice.prepend(paymentDescription);
const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const monthLabel = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone: 'UTC' });
const roomLabels = { proberaum: 'Proberaum', werkstatt: 'DIY-Werkstatt' };

const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const firstMonth = today.slice(0, 7);
const lastMonth = new Date(Date.parse(today) + 365 * 86400000).toISOString().slice(0, 7);

let month = firstMonth;
let selectedDay = '';
let selectedHour;
let availability = {};
let calendarRequest;
let pendingBooking;
let submitting = false;
let confirmation;

const requestedRoom = new URLSearchParams(location.search).get('raum');
if (['proberaum', 'werkstatt'].includes(requestedRoom)) room.value = requestedRoom;

async function api(path, options = {}) {
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error), { status: response.status });
    return result;
}

function timeLabel(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
}

function renderTimes() {
    selectedHour = undefined;
    submit.disabled = true;
    dateLabel.textContent = selectedDay ? fullDate.format(new Date(selectedDay)) : 'Wähle einen verfügbaren Tag.';
    summaryRoom.textContent = roomLabels[room.value];
    summaryDate.textContent = selectedDay ? fullDate.format(new Date(selectedDay)) : 'Noch nicht gewählt';
    summaryTime.textContent = 'Noch nicht gewählt';
    times.replaceChildren();
    for (const hour of availability[selectedDay] || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'time-choice';
        button.textContent = timeLabel(hour);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
            selectedHour = hour;
            summaryTime.textContent = `${timeLabel(hour)}–${timeLabel(hour + hours.valueAsNumber)} Uhr`;
            submit.disabled = false;
            for (const option of times.children) option.setAttribute('aria-pressed', String(option === button));
        });
        times.append(button);
    }
}

function renderCalendar() {
    const firstDay = new Date(`${month}-01`);
    const count = new Date(Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0)).getUTCDate();
    monthTitle.textContent = monthLabel.format(firstDay);
    previous.disabled = month <= firstMonth;
    next.disabled = month >= lastMonth;
    const placeholders = (firstDay.getUTCDay() + 6) % 7;
    const elements = Array.from({ length: placeholders }, () => document.createElement('span'));
    for (let number = 1; number <= count; number++) {
        const day = `${month}-${String(number).padStart(2, '0')}`;
        const starts = availability[day];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'calendar-day';
        button.textContent = number;
        button.disabled = !starts?.length;
        button.setAttribute('aria-pressed', String(day === selectedDay));
        button.setAttribute('aria-label', `${fullDate.format(new Date(day))}, ${starts?.length
            ? `${starts.length} ${starts.length === 1 ? 'freie Startzeit' : 'freie Startzeiten'}`
            : 'keine freie Startzeit'}`);
        if (day === today) button.setAttribute('aria-current', 'date');
        button.addEventListener('click', () => {
            selectedDay = day;
            for (const option of calendar.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option === button));
            renderTimes();
        });
        elements.push(button);
    }
    calendar.replaceChildren(...elements);
    renderTimes();
}

async function loadCalendar() {
    calendarRequest?.abort();
    const request = new AbortController();
    calendarRequest = request;
    availability = {};
    renderCalendar();
    if (!hours.validity.valid) {
        price.value = '–';
        calendarStatus.textContent = 'Bitte eine Dauer von 1 bis 8 Stunden wählen.';
        return;
    }
    calendarStatus.textContent = 'Freie Zeiten werden geladen …';
    try {
        const query = new URLSearchParams({ room: room.value, month, hours: hours.value });
        const result = await api(`/api/calendar?${query}`, { signal: request.signal });
        if (request.signal.aborted) return;
        availability = result.days;
        if (!availability[selectedDay]) selectedDay = '';
        price.value = currency.format(result.cents / 100);
        paymentDescription.textContent = result.paypalAvailable ? 'Zahlung per PayPal nach der Buchung möglich. ' : '';
        calendarStatus.textContent = Object.keys(availability).length ? '' : 'In diesem Monat sind für diese Dauer keine Termine frei.';
        renderCalendar();
    } catch (error) {
        if (!request.signal.aborted) calendarStatus.textContent = error.status ? error.message : 'Der Buchungsserver konnte nicht erreicht werden.';
    }
}

function moveMonth(direction) {
    const target = new Date(`${month}-01`);
    target.setUTCMonth(target.getUTCMonth() + direction);
    month = target.toISOString().slice(0, 7);
    selectedDay = '';
    loadCalendar();
}

previous.addEventListener('click', () => moveMonth(-1));
next.addEventListener('click', () => moveMonth(1));
for (const choice of room) choice.addEventListener('change', loadCalendar);
hours.addEventListener('input', loadCalendar);

document.querySelector('#bestaetigung-download').addEventListener('click', () => {
    if (!confirmation) return;
    const file = new Blob([confirmation.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KuH-Buchung-${confirmation.reference}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || selectedHour === undefined || submit.disabled) return;
    const payload = {
        room: room.value, day: selectedDay, hour: selectedHour, hours: hours.valueAsNumber,
        name: form.elements.name.value.trim(), email: form.elements.email.value.trim()
    };
    const serialized = JSON.stringify(payload);
    if (pendingBooking?.serialized !== serialized) pendingBooking = { serialized, id: crypto.randomUUID() };
    const fields = Array.from(form.elements).filter(field => !field.disabled);
    submitting = true;
    fields.forEach(field => { field.disabled = true; });
    bookingStatus.textContent = 'Die Buchung wird gespeichert …';
    try {
        const result = await api('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-KuH-Request': '1' },
            body: JSON.stringify({ ...payload, id: pendingBooking.id })
        });
        const formattedDate = result.day.split('-').reverse().join('.');
        const timeRange = `${timeLabel(result.hour)}–${timeLabel(result.hour + result.hours)} Uhr`;
        const total = currency.format(result.cents / 100);
        document.querySelector('#bestaetigung-daten').textContent =
            `Buchungsnummer ${result.reference} · ${result.room} · ${formattedDate}, ${timeRange} · ${result.hours} Std. · ${total}`;
        confirmation = {
            reference: result.reference,
            text: [
                'Buchungsbestätigung – Verein Aktiver Musiker 2009 e. V.',
                `Buchungsnummer: ${result.reference}`,
                `Raum: ${result.room}`,
                `Termin: ${formattedDate}, ${timeRange} (Ortszeit)`,
                `Gesamtpreis: ${total}`,
                `Zahlung: ${result.paypal || 'Bitte Zahlungsdetails beim Verein erfragen.'}`,
                'Kontakt: info@vam09.de · +49 157 86890347'
            ].join('\n')
        };
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
        submitting = false;
        bookingStatus.textContent = error.status ? error.message : 'Die Verbindung wurde unterbrochen. Bitte versuche dieselbe Anfrage erneut.';
        if (error.status === 409) await loadCalendar();
    }
});
loadCalendar();
