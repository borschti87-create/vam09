# VAM 09 und KuH-Raumbuchung

Die Vereinswebsite und die Buchungsverwaltung laufen gemeinsam auf einem Node.js-Server. Der öffentliche Kalender zeigt nur vom Vorstand freigegebene Stunden. Der Server reserviert jede Stunde einer Buchung in einer einzigen Datenbanktransaktion. Die Oberfläche zeigt anschließend eine Buchungsnummer.

## Lokal starten

Node.js 24 installieren, dann im Projektordner ausführen.

```sh
npm ci
ADMIN_PASSWORD='<eigenes Passwort mit mindestens 24 Zeichen>' npm start
```

Die Website ist unter http://localhost:3000 erreichbar. Unter http://localhost:3000/admin.html anmelden und für einen zukünftigen Termin Stunden freigeben. Danach lässt sich der Termin unter http://localhost:3000/buchung.html buchen. Lokal speichert die eingebettete PostgreSQL-Datenbank die Daten im Git-ignorierten Ordner `.kuh-data`.

```sh
npm test
```

## Hosting für den Verein

Der Render-Blueprint legt einen kostenlosen Web Service in Frankfurt an. Für Buchungen, die Neustarts und Deployments überstehen sollen, braucht er eine externe PostgreSQL-Datenbank. Ein kostenloser Neon-Tarif in einer EU-Region ist eine Möglichkeit. Die kostenlose Render-eigene PostgreSQL-Datenbank läuft nach 30 Tagen aus.

Im Render-Dashboard den Blueprint aus dem GitHub-Repository und dem gewünschten Branch auswählen. Die PostgreSQL-Verbindungs-URL mit TLS als `DATABASE_URL` und ein eigenes Vereinspasswort als `ADMIN_PASSWORD` in Render hinterlegen. Render erzeugt `SESSION_KEY` für die Admin-Sitzungen. Die Produktionsinstanz verwendet niemals lokalen Dateispeicher für Buchungen. Die Website verwendet die von Render gesetzte öffentliche URL. Nach Leerlauf kann der erste Seitenaufruf länger dauern.

| Optionale Variable | Wirkung |
| --- | --- |
| `RESEND_API_KEY` und `BOOKING_FROM` | Sendet eine E-Mail-Bestätigung über Resend. Für `BOOKING_FROM` eine Absenderadresse aus einer beim Anbieter verifizierten Domain verwenden. Die Buchungsbestätigung im Browser ist unabhängig vom Versand. |
| `PAYPAL_ME` | Nur den PayPal.Me-Namen des Vereins eintragen, zum Beispiel `meinverein`. Nach bestätigter Buchung erscheint ein PayPal-Zahlungslink mit Betrag. Der Vorstand gleicht eingegangene Zahlungen anhand der Buchungsnummer ab und markiert sie als bezahlt. Erstattungen erfolgen direkt beim Zahlungsanbieter. |
| `PUBLIC_URL` | Außerhalb von Render die öffentliche URL des Dienstes angeben. |

Vor Öffnung des Kalenders für echte Buchungen die Rechtstexte mit den tatsächlichen Anbietern, Aufbewahrungsfristen und Vereinsdaten vervollständigen. Der Vorstand gibt Zeitfenster je Raum und Tag frei, kann freie Stunden sperren und sieht Buchungen sowie deren Zahlungsstatus im Admin-Bereich. Eine Stornierung gibt den Zeitraum wieder frei. Die buchende Person wird vom Vorstand über eine Stornierung informiert.
