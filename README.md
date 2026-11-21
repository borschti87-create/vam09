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

Der Render-Blueprint legt einen kostenlosen Webdienst und eine kostenlose, nur intern erreichbare PostgreSQL-Datenbank in Frankfurt an. Die Datenbank übersteht Neustarts und Deployments, läuft aber 30 Tage nach der Erstellung ab. Vor Ablauf die Buchungsdaten sichern und bei Bedarf zu einer dauerhaft verfügbaren PostgreSQL-Datenbank umziehen.

Im Render-Dashboard den Blueprint aus dem GitHub-Repository und dem gewünschten Branch auswählen. Render hinterlegt die Datenbankverbindung als `DATABASE_URL` und erzeugt `ADMIN_PASSWORD` und `SESSION_KEY`. Das Passwort für die Buchungsverwaltung steht auf der Environment-Seite des Webdienstes und kann dort durch ein eigenes Passwort mit mindestens 24 Zeichen ersetzt werden. Die Website verwendet die von Render gesetzte öffentliche URL. Nach Leerlauf kann der erste Seitenaufruf länger dauern.

| Optionale Variable | Wirkung |
| --- | --- |
| `RESEND_API_KEY` und `BOOKING_FROM` | Optionale Startwerte für E-Mail-Bestätigungen. |
| `PAYPAL_ME` | Optionaler Startwert für den PayPal.Me-Namen des Vereins. |
| `PUBLIC_URL` | Außerhalb von Render die öffentliche URL des Dienstes angeben. |

Unter „Zahlung und E-Mail“ in der Buchungsverwaltung können der Vorstand PayPal.Me und Bestätigungs-E-Mails einrichten, einzeln ein- oder ausschalten und eine Test-E-Mail senden. Für E-Mails werden eine bei Resend verifizierte Absenderadresse und ein API-Schlüssel benötigt. Der Schlüssel wird verschlüsselt gespeichert und erscheint nach dem Speichern nicht mehr im Formular. Bei einem Wechsel von `SESSION_KEY` muss der Schlüssel erneut hinterlegt werden. Bei aktivem PayPal.Me erscheint nach der Buchung ein Zahlungslink mit Betrag. Der Vorstand gleicht eingegangene Zahlungen anhand der Buchungsnummer ab und markiert sie als bezahlt. Erstattungen erfolgen direkt beim Zahlungsanbieter.

Vor Öffnung des Kalenders für echte Buchungen die Rechtstexte mit den tatsächlichen Anbietern, Aufbewahrungsfristen und Vereinsdaten vervollständigen. Der Vorstand gibt Zeitfenster je Raum und Tag frei, kann freie Stunden sperren und sieht Buchungen sowie deren Zahlungsstatus in der Monats- und Tagesübersicht. Eine Stornierung gibt den Zeitraum wieder frei. Die buchende Person wird vom Vorstand über eine Stornierung informiert.

Für den Regelbetrieb die vollständige Geschäftsanschrift und die Vereinsregisternummer ergänzen. Außerdem die Zahlungsbedingungen, das für die Raumangebote geltende Widerrufsrecht, die Form der Vertragsbestätigung und gegebenenfalls die elektronische Widerrufsfunktion fachlich prüfen. Bei zusätzlichen externen Einbettungen oder Analysewerkzeugen den Cookie-Hinweis und die Einwilligung vor Aktivierung prüfen.
