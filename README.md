# SlimCoach – Dein intelligenter Abnehm-Coach

SlimCoach ist eine deutschsprachige native Android-App ab Android 8. Die App speichert Profil, Mahlzeiten, Gewicht und Wasser auf dem Gerät. Sie braucht kein Konto.

## Funktionsumfang

- Onboarding und bearbeitbares Profil, Mifflin-St-Jeor-Schätzung, moderates und manuelles Kalorienziel.
- Tagesübersicht, Ernährungstagebuch mit vier Mahlzeitentypen, Bearbeiten, Löschen, Kopieren und Sieben-Tage-Übersicht.
- Gewichtshistorie mit Zeitfiltern, Verlaufslinie und Sieben-Tage-Mittel.
- Barcode-Scanner mit CameraX und mitgeliefertem ML-Kit-Modell, manuelle Code-Eingabe, Produktcache, Favoriten und Portionserfassung.
- Wassertracking, einfache Offline-Coaching-Hinweise sowie Ernährungsserien und erste Erfolge.

## Produktdaten und Datenschutz

SlimCoach fragt bei einem Cache-Miss über HTTPS die [Open Food Facts API v3](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/) ab. Der Dienst erhält den Barcode, angeforderte Feldnamen und technische Verbindungsdaten einschließlich User-Agent. Der Kontakt im User-Agent kann über die Gradle-Eigenschaft `slimcoach.offContact` konfiguriert werden.

Die Produktbibliothek liegt in einer separaten Room-Datenbank. Open Food Facts stellt seine Datenbank unter der [Open Database License](https://world.openfoodfacts.org/terms-of-use) bereit. Produktbilder werden derzeit nicht abgerufen. Bei einer künftigen Weitergabe des Caches sind Attribution und gegebenenfalls Share-Alike zu berücksichtigen. Tagebucheinträge speichern die für die verzehrte Menge bestätigten Werte als eigene Momentaufnahme. Korrekturen werden lokal gespeichert. Bei uneindeutiger Nährwertbasis werden Verpackungsangaben benötigt.

Profil und App-Einstellungen liegen in DataStore. Android-App-Backups sind deaktiviert. Die Kamera wird für den Scan angefragt. Die Kerndaten bleiben offline verfügbar. Health Connect, Fotos, Export und Import sind geplant.

## Architektur und Build

Ein Kotlin-Modul mit Jetpack Compose, Material 3, Navigation Compose, AndroidViewModel, StateFlow, Room und DataStore. GitHub Actions verwendet JDK 17, Android SDK 35 und den Gradle Wrapper. Der Workflow prüft den Wrapper und führt `./gradlew testDebugUnitTest assembleDebug --no-daemon` aus.

## APK auf dem Android-Handy installieren

1. Änderungen nach GitHub übernehmen und den Pull Request gegebenenfalls mergen.
2. Im Repository **Actions** → **Build Android APK** öffnen.
3. Einen erfolgreichen Lauf öffnen und **SlimCoach-debug-apk** herunterladen.
4. Die ZIP-Datei entpacken und `app-debug.apk` öffnen.
5. Android gegebenenfalls die Installation aus dieser Quelle erlauben und SlimCoach starten.

Die Debug-Signierung kann sich zwischen GitHub-Runnern ändern. Android akzeptiert Updates nur mit demselben Signaturschlüssel. Eine Deinstallation kann lokale Daten löschen. Für ein Release einen dedizierten, gesicherten Signaturschlüssel verwenden, Zugangsdaten als GitHub-Secrets hinterlegen und private Schlüssel aus dem Repository heraushalten.

## Weitere Entwicklung

Offen sind insbesondere Kalorien-Trendvorschläge mit Bestätigung, erweiterte Statistiken und Prognosen, Gerätestests des Scanners, explizite Cache-Aktualisierung, eigene Rezeptvorlagen, Erinnerungen, Health Connect, Fortschritts- und Essensfotos, ChatGPT-Weitergabe, Datenexport, Import und vollständige Löschung über die App.
