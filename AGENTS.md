# SlimCoach

Native, deutschsprachige Android-App für Erwachsene. Priorität hat eine installierbare APK über GitHub Actions.

- Ein App-Modul, Kotlin, Compose, Material 3, AndroidViewModel und StateFlow.
- Room für Tagebuch und getrennten Produktcache. DataStore für das Profil.
- Build und Tests mit `./gradlew testDebugUnitTest assembleDebug --no-daemon`.
- APK-Artefakt im Workflow **Build Android APK** unter **SlimCoach-debug-apk**.
- Offline-Kernfunktionen, keine Geheimnisse oder Gesundheitsdaten in Logs. Nährwertangaben verifizieren und Tagebucheinträge als Momentaufnahmen speichern.
- Phase 1 implementiert. Barcode, Produktcache und Portionen aus Phase 2 sowie Wasser und Basis-Coaching aus Phase 3 sind vorhanden.
- Offene Aufgaben stehen in der README. Prüfergebnisse und Gerätestatus separat angeben.
