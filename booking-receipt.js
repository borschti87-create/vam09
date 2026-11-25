import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function createBookingReceipt({ reference, room, date, time, price, contact, test = false }) {
    const document = await PDFDocument.create({ updateMetadata: false });
    document.setTitle(`KuH-Buchungsbeleg ${reference}`);
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
    text('Kultur- und Innovationshof', margin, 785, 13, bold);
    text('Buchungsbeleg', margin, 731, 34, bold);
    text(test ? 'MUSTERBELEG · Keine Buchung' : 'Dein Termin ist bestätigt.', margin, 701);

    const fields = [
        ['Buchungsnummer', reference],
        ['Raum', room],
        ['Datum', date],
        ['Uhrzeit', `${time} (Ortszeit)`],
        ['Gesamtpreis', price]
    ];
    fields.forEach(([label, value], index) => {
        const y = 620 - index * 39;
        text(label, margin, y, 12, bold);
        text(value, 225, y);
    });

    if (test) {
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
