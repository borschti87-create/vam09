function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export function createBookingEmail({ reference, room, date, time, price, payment, contact, approvalLink, test = false }) {
    const title = approvalLink ? 'Neue KuH-Buchungsanfrage' : test ? 'Muster einer Buchungsbestätigung' : 'Deine KuH-Buchung ist bestätigt';
    const introduction = approvalLink ? 'Der Termin ist vorgemerkt. Die Buchung wird mit deiner Zusage bestätigt. Der Anfragebeleg liegt als PDF bei.'
        : test ? 'Dies ist eine Test-E-Mail. Es wurde kein Termin gebucht.' : 'Den Buchungsbeleg findest du als PDF im Anhang.';
    const memberNote = 'Für Vereinsmitglieder ist die Raumnutzung kostenlos. Wenn du Mitglied bist, melde dich vor einer Zahlung beim KuH-Team.';
    const onsite = 'Zahlung vor Ort ist nach Absprache möglich.';
    const paymentNote = `Wenn du per PayPal zahlst, gib ${reference} als Buchungsnummer im Zahlungsbetreff an.`;
    const fields = [
        ['Buchungsnummer', reference], ['Raum', room], ['Datum', date],
        ['Uhrzeit', `${time} (Ortszeit)`], ['Gesamtpreis für Gäste', price]
    ];
    const address = 'Schlachthofstraße 10, 39418 Staßfurt';
    const club = 'Verein Aktiver Musiker 2009 e. V.';
    const detailsTitle = approvalLink ? 'Daten zur Anfrage' : 'Deine Buchungsdaten';
    const actionHint = 'Nach der Anmeldung kannst du die Zusage für diesen Termin bestätigen.';
    const actionLines = approvalLink ? ['Buchung zusagen', actionHint, approvalLink] : [
        'Zahlung', memberNote,
        ...(payment ? [`Sofortzahlung per PayPal: ${payment}`, paymentNote] : []), onsite
    ];
    const text = [
        title, introduction, '', detailsTitle,
        ...fields.map(([label, value]) => `${label}: ${value}`),
        '', ...actionLines,
        '', 'Kultur- und Innovationshof', club, address, contact
    ].join('\n');
    const rows = fields.map(([label, value]) => `
        <tr>
            <th scope="row" align="left" style="width:46%;padding:9px 10px;border-bottom:1px solid #e8dcc0;font-weight:600">${escapeHtml(label)}</th>
            <td style="padding:9px 10px;border-bottom:1px solid #e8dcc0">${escapeHtml(value)}</td>
        </tr>`).join('');
    const paymentLink = payment ? `
        <p style="margin:14px 0 8px"><a href="${escapeHtml(payment)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#e5b74f;color:#211b1a;font-weight:bold;text-decoration:none">Mit PayPal bezahlen</a></p>
        <p style="margin:0 0 10px;font-size:14px">${escapeHtml(paymentNote)}</p>` : '';
    const actionSection = approvalLink ? `
        <p style="margin:20px 0 8px"><a href="${escapeHtml(approvalLink)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#e5b74f;color:#211b1a;font-weight:bold;text-decoration:none">Buchung zusagen</a></p>
        <p style="margin:0;font-size:14px">${actionHint}</p>` : `
        <h2 style="margin:20px 0 6px;font-size:17px">Zahlung</h2>
        <p style="margin:0 0 8px">${escapeHtml(memberNote)}</p>${paymentLink}
        <p style="margin:0">${escapeHtml(onsite)}</p>`;
    const html = `<!doctype html>
    <html lang="de"><body style="margin:0;padding:0;background:#fff7e2">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;text-align:left;background:#fffdf7;color:#211b1a;font:16px/1.5 Arial,sans-serif;border:1px solid #e8dcc0">
                <tr><td style="padding:20px;background:#e5b74f">
                    <p style="margin:0 0 4px;font-size:14px;font-weight:bold">Kultur- und Innovationshof</p>
                    <h1 style="margin:0;font-size:24px;line-height:1.2">${escapeHtml(title)}</h1>
                </td></tr>
                <tr><td style="padding:20px">
                    <p style="margin:0 0 16px">${escapeHtml(introduction)}</p>
                    <h2 style="margin:0 0 6px;font-size:17px">${detailsTitle}</h2>
                    <table width="100%" cellspacing="0" cellpadding="0" style="background:#fff5d9;font-size:15px">${rows}</table>
                    ${actionSection}
                </td></tr>
                <tr><td style="padding:14px 20px;border-top:1px solid #e8dcc0;font-size:14px">
                    <strong>${club}</strong><br>${address}<br>
                    <a href="mailto:${escapeHtml(contact)}" style="color:#674909">${escapeHtml(contact)}</a>
                </td></tr>
            </table>
        </td></tr></table>
    </body></html>`;
    return { text, html };
}
