'use strict';

const form = document.querySelector('#buchungsformular');
const room = form.elements.raum;
const date = form.elements.datum;
const time = form.elements.uhrzeit;
const hours = form.elements.stunden;
const price = document.querySelector('#buchung-preis');

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

function updateDateLimits() {
    const parts = Object.fromEntries(localTime.formatToParts(new Date()).map(({ type, value }) => [type, value]));
    date.min = [parts.year, parts.month, parts.day].join('-');
    time.min = date.value === date.min ? [parts.hour, parts.minute].join(':') : '';
}

function updatePrice() {
    if (!hours.validity.valid || !Number.isSafeInteger(hours.valueAsNumber)) {
        price.value = '–';
        return;
    }
    price.value = currency.format(5 + (hours.valueAsNumber - 1) * 3);
}

const requestedRoom = new URLSearchParams(window.location.search).get('raum');
if (Array.from(room.options).some(option => option.value === requestedRoom)) {
    room.value = requestedRoom;
}

// Im Formular werden die Angaben nur lokal verarbeitet.
date.addEventListener('input', updateDateLimits);
hours.addEventListener('input', updatePrice);
form.addEventListener('submit', event => {
    event.preventDefault();
    updateDateLimits();
    updatePrice();
    if (!form.reportValidity() || price.value === '–') return;

    const roomName = room.selectedOptions[0].textContent;
    const formattedDate = date.value.split('-').reverse().join('.');
    const subject = `KuH-Terminanfrage – ${roomName}`;
    const body = [
        'Hallo VAM-09-Team,',
        '',
        'ich möchte folgenden Termin im Kultur- und Innovationshof anfragen:',
        '',
        `Raum: ${roomName}`,
        `Datum: ${formattedDate}`,
        `Beginn: ${time.value} Uhr (Ortszeit Staßfurt)`,
        `Dauer: ${hours.valueAsNumber} Std.`,
        `Voraussichtlicher Preis: ${price.value}`,
        '',
        'Ist der Raum zu dieser Zeit frei?',
        '',
        'Viele Grüße'
    ].join('\r\n');
    window.location.href = `mailto:info@vam09.de?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
updateDateLimits();
updatePrice();
form.hidden = false;
