# VAM 09 und KuH-Raumbuchung

Die Vereinswebsite und die Buchungsverwaltung laufen gemeinsam auf einem Node.js-Server. Der öffentliche Kalender zeigt nur vom Vorstand freigegebene Stunden. Der Server reserviert jede Stunde einer Buchung in einer einzigen Datenbanktransaktion. Die Oberfläche zeigt anschließend eine Buchungsnummer.

## Lokal starten

Node.js 24 installieren, dann im Projektordner ausführen.

```sh
npm ci
ADMIN_PASSWORD='<eigenes Passwort mit mindestens 24 Zeichen>' npm start
```

Die Website ist unter http://localhost:3000 erreichbar. Unter http://localhost:3000/admin.html mit `vam09-vorstand` und dem gewählten Passwort anmelden und für einen zukünftigen Termin Stunden freigeben. Danach lässt sich der Termin unter http://localhost:3000/buchung.html buchen. Lokal speichert die eingebettete PostgreSQL-Datenbank die Daten im Git-ignorierten Ordner `.kuh-data`.

```sh
npm test
```

## Hosting für den Verein

Der Render-Blueprint legt einen kostenlosen Webdienst und eine kostenlose, nur intern erreichbare PostgreSQL-Datenbank in Frankfurt an. Die Datenbank übersteht Neustarts und Deployments, läuft aber 30 Tage nach der Erstellung ab. Vor Ablauf die Buchungsdaten sichern und bei Bedarf zu einer dauerhaft verfügbaren PostgreSQL-Datenbank umziehen.

Im Render-Dashboard den Blueprint aus dem GitHub-Repository und dem gewünschten Branch auswählen. Render hinterlegt die Datenbankverbindung als `DATABASE_URL` und erzeugt `ADMIN_PASSWORD` und `SESSION_KEY`. Der Benutzername für die Buchungsverwaltung lautet standardmäßig `vam09-vorstand` und kann über die optionale Variable `ADMIN_USERNAME` geändert werden. Das Passwort für die Buchungsverwaltung steht auf der Environment-Seite des Webdienstes und kann dort durch ein eigenes Passwort mit mindestens 24 Zeichen ersetzt werden. Nach einer Änderung von Benutzername oder Passwort müssen sich alle Admins neu anmelden. Die Website verwendet die von Render gesetzte öffentliche URL. Nach Leerlauf kann der erste Seitenaufruf länger dauern.

| Optionale Variable | Wirkung |
| --- | --- |
| `RESEND_API_KEY` und `BOOKING_FROM` | Optionale Startwerte für E-Mail-Bestätigungen. |
| `PAYPAL_ME` | Optionaler Startwert für den PayPal.Me-Namen des Vereins. |
| `PUBLIC_URL` | Außerhalb von Render die öffentliche URL des Dienstes angeben. |

Unter „Zahlung und E-Mail“ in der Buchungsverwaltung können der Vorstand PayPal.Me und Bestätigungs-E-Mails einrichten, einzeln ein- oder ausschalten und eine Test-E-Mail senden. Für E-Mails werden eine bei Resend verifizierte Absenderadresse und ein API-Schlüssel benötigt. Der Schlüssel wird verschlüsselt gespeichert und erscheint nach dem Speichern nicht mehr im Formular. Bei einem Wechsel von `SESSION_KEY` muss der Schlüssel erneut hinterlegt werden. Bei aktivem PayPal.Me erscheint nach der Buchung ein Zahlungslink mit Betrag. Der Vorstand gleicht eingegangene Zahlungen anhand der Buchungsnummer ab und markiert sie als bezahlt. Erstattungen erfolgen direkt beim Zahlungsanbieter.

Für die manuelle Freigabe zuerst die verifizierte Absenderadresse und einen Resend-Schlüssel mit Sendeberechtigung speichern, den E-Mail-Versand einschalten und eine Test-E-Mail senden. Anschließend unter „Buchungsfreigabe“ die Vereinsadresse für neue Anfragen hinterlegen und „Buchungen erst nach Zusage bestätigen“ aktivieren. Die Zeiten bleiben bis zur Entscheidung vorgemerkt. Ein Link in der Vereins-E-Mail öffnet die Anfrage in der geschützten Verwaltung. Eine Zusage verschickt die Bestätigung mit einem gegebenenfalls aktivierten PayPal-Link. Eine Absage verschickt eine Nachricht und gibt die Zeiten wieder frei. Sollte ein Versand fehlschlagen, kann die E-Mail in der Verwaltung erneut gesendet werden.

Bestätigungs-E-Mails enthalten einen PDF-Buchungsbeleg. Der Kalender entfernt Namen und E-Mail-Adressen einen Kalendermonat nach Terminende beim Serverstart und anschließend stündlich. Buchungsnummer, Termin, Betrag und Status bleiben für die Zuordnung der Zahlungen erhalten. Für Aufbewahrung und Löschung von Abrechnungsunterlagen, versandten E-Mails und Sicherungskopien ist der Verein zuständig.

Vor Öffnung des Kalenders für echte Buchungen die Rechtstexte mit den tatsächlichen Anbietern und Vereinsdaten vervollständigen. In der Monatsübersicht kann der Vorstand jeden Tag anklicken. Unter „Zeitfenster verwalten“ sind Freigaben und Sperren für einen Tag oder einen Datumsbereich mit ausgewählten Wochentagen möglich. Eine Sperre erfasst freie Stunden. Eine Stornierung gibt den gebuchten Zeitraum wieder frei. Die buchende Person wird vom Vorstand über eine Stornierung informiert.

Für den Regelbetrieb die vollständige Geschäftsanschrift und die Vereinsregisternummer ergänzen. Außerdem die Zahlungsbedingungen, das für die Raumangebote geltende Widerrufsrecht, die Form der Vertragsbestätigung und gegebenenfalls die elektronische Widerrufsfunktion fachlich prüfen. Bei zusätzlichen externen Einbettungen oder Analysewerkzeugen den Cookie-Hinweis und die Einwilligung vor Aktivierung prüfen.
