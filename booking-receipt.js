import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const logoBytes = await readFile(new URL('./assets/kuh-logo-beleg.png', import.meta.url));

export async function createBookingReceipt({ reference, room, date, time, price, contact, test = false, pending = false }) {
    const document = await PDFDocument.create({ updateMetadata: false });
    const title = pending ? 'Anfragebeleg' : 'Buchungsbeleg';
    document.setTitle(`KuH-${title} ${reference}`);
    document.setProducer('Verein Aktiver Musiker 2009 e. V.');
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const page = document.addPage([595.28, 841.89]);
    const ink = rgb(0.13, 0.11, 0.1);
    const mustard = rgb(0.9, 0.72, 0.31);
    const margin = 56;

    function text(value, x, y, size = 12, font = regular) {
        page.drawText(value, { x, y, size, font, color: ink });
    }

    page.drawRectangle({ x: 0, y: 670, width: page.getWidth(), height: 172, color: mustard });
    const logo = await document.embedPng(logoBytes);
    const logoSize = logo.scaleToFit(96, 72);
    const logoX = page.getWidth() - margin - 104;
    page.drawRectangle({ x: logoX, y: 719, width: 104, height: 80, color: rgb(1, 1, 1) });
    page.drawImage(logo, { x: logoX + (104 - logoSize.width) / 2, y: 719 + (80 - logoSize.height) / 2, ...logoSize });
    text('Kultur- und Innovationshof', margin, 785, 13, bold);
    text(title, margin, 731, 34, bold);
    text(pending ? 'Vorgemerkt · Zusage ausstehend' : test ? 'MUSTERBELEG · Keine Buchung' : 'Dein Termin ist bestätigt.', margin, 701);

    const fields = [
        ['Buchungsnummer', reference],
        ['Raum', room],
        ['Datum', date],
        ['Uhrzeit', `${time} (Ortszeit)`],
        ['Gesamtpreis für Gäste', price]
    ];
    fields.forEach(([label, value], index) => {
        const y = 620 - index * 39;
        text(label, margin, y, 12, bold);
        text(value, 225, y);
    });

    if (pending) {
        text('Der Beleg dokumentiert die Anfrage. Der Verein muss den Termin noch zusagen.', margin, 386, 11);
    } else if (test) {
        text('Dieser Musterbeleg dient nur dem Test des E-Mail-Versands.', margin, 386, 11);
    } else {
        text('Dieser Beleg bestätigt deine Buchung. Eine Zahlung wird damit nicht quittiert.', margin, 386, 11);
        text('Die Zahlungsoptionen findest du in der Bestätigungs-E-Mail.', margin, 365, 11);
    }
    page.drawLine({ start: { x: margin, y: 328 }, end: { x: page.getWidth() - margin, y: 328 }, color: mustard, thickness: 1.5 });
    text('Verein Aktiver Musiker 2009 e. V.', margin, 301, 12, bold);
    text('Schlachthofstraße 10, 39418 Staßfurt', margin, 280);
    text(contact, margin, 259);

    return document.save();
}
