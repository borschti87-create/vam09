package de.slimcoach.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val model by viewModels<SlimViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val palette = if (isSystemInDarkTheme()) darkColorScheme(
                primary = Color(0xFF73DCCA), onPrimary = Color(0xFF003730),
                surface = Color(0xFF131C1A), surfaceContainer = Color(0xFF1E2A27),
                secondary = Color(0xFFA5D6A7)
            ) else lightColorScheme(
                primary = Color(0xFF00695F), onPrimary = Color.White,
                surface = Color(0xFFF5FAF8), surfaceContainer = Color(0xFFE8F1EE),
                secondary = Color(0xFF386644)
            )
            MaterialTheme(colorScheme = palette) { SlimCoach(model) }
        }
    }

    override fun onResume() {
        super.onResume()
        model.updateToday()
    }
}

fun LocalDate.germanDate(): String = format(DateTimeFormatter.ofPattern("d. MMMM uuuu", Locale.GERMANY))

private val tabs = listOf("Heute", "Ernährung", "Fortschritt", "Coach")
private val icons = listOf(Icons.Default.Home, Icons.Default.List, Icons.Default.DateRange, Icons.Default.Info)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SlimCoach(model: SlimViewModel) {
    val profileState by model.profile.collectAsStateWithLifecycle()
    val meals by model.meals.collectAsStateWithLifecycle()
    val weights by model.weights.collectAsStateWithLifecycle()
    val water by model.water.collectAsStateWithLifecycle()
    val products by model.products.collectAsStateWithLifecycle()
    val today by model.deviceDay.collectAsStateWithLifecycle()
    val selectedDay by model.day.collectAsStateWithLifecycle()
    val error by model.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(error) {
        error?.let {
            snackbar.showSnackbar(it)
            model.dismissMessage()
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            model.updateToday()
            delay(30_000)
        }
    }
    val profile = (profileState as? ProfileState.Ready)?.profile
    if (profile == null) {
        Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
            Page(Modifier.padding(padding)) {
                if (profileState == ProfileState.Loading) CircularProgressIndicator()
                else ProfileForm(null, null) { model.saveProfile(it) {} }
            }
        }
        return
    }

    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val current = weights.firstOrNull()?.kg
    val estimate = CalorieTargetEngine.estimate(profile, current ?: profile.current)
    val target = estimate?.let { e -> profile.manualTarget?.takeIf { CalorieTargetEngine.acceptsManual(it, e) } ?: e.recommended }
    val todayMeals = meals.filter { it.day == today }
    val total = todayMeals.totals()
    val days = meals.map { it.day }
    val streak = streaks(days, today)
    val consumedWater = water.filter { it.day == today }.sumOf { it.ml.toLong() }
    val tip = CoachingEngine.tip(todayMeals.size, profile.readyMeals, total, target)
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(if (route in tabs) "SlimCoach" else entry?.destination?.let {
                    when (it.route) {
                        "profile" -> "Profil"
                        "library" -> "Produktbibliothek"
                        "scanner" -> "Barcode scannen"
                        "weight?day={day}" -> "Gewicht"
                        "water" -> "Wasser"
                        else -> "Ernährung"
                    }
                } ?: "SlimCoach") },
                navigationIcon = {
                    if (route != null && route !in tabs) IconButton(onClick = { nav.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Zurück")
                    }
                },
                actions = {
                    if (route in tabs) IconButton(onClick = { nav.navigate("profile") }) {
                        Icon(Icons.Default.Settings, "Profil und Einstellungen")
                    }
                }
            )
        },
        bottomBar = {
            if (route in tabs) NavigationBar {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = route == tab,
                        onClick = {
                            nav.navigate(tab) {
                                popUpTo(nav.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(icons[index], contentDescription = null) },
                        label = { Text(tab) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(nav, startDestination = tabs.first(), modifier = Modifier.padding(padding)) {
            composable("Heute") {
                Page {
                    Text(LocalDate.ofEpochDay(today).germanDate(), color = MaterialTheme.colorScheme.primary)
                    Text(if (profile.name.isBlank()) "Hallo!" else "Hallo, ${profile.name}!",
                        style = MaterialTheme.typography.headlineLarge)
                    Panel("Dein Tagesbudget") {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                            if (target != null) CircularProgressIndicator(
                                progress = { (total.kcal / target).toFloat().coerceIn(0f, 1f) },
                                modifier = Modifier.size(70.dp), strokeWidth = 8.dp,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant, strokeCap = StrokeCap.Round
                            )
                            Column {
                                Text("${total.kcal.display()} kcal", style = MaterialTheme.typography.headlineMedium)
                                if (target == null) Text("Kein geschätztes Tagesziel verfügbar")
                                else Text("Ziel $target kcal · ${maxOf(0.0, target - total.kcal).display()} kcal übrig")
                            }
                        }
                        if (target != null && total.kcal > target) Text("${(total.kcal - target).display()} kcal über dem geschätzten Ziel")
                        Text("${total.protein.display()} g Eiweiß · ${total.carbs.display()} g KH · ${total.fat.display()} g Fett")
                    }
                    Button(onClick = { nav.navigate("meal/$today") }, Modifier.fillMaxWidth()) { Text("Lebensmittel hinzufügen") }
                    OutlinedButton(onClick = { model.day.value = today; nav.navigate("scanner") }, Modifier.fillMaxWidth()) { Text("Barcode scannen") }
                    Panel("Gewicht") {
                        Text("${(current ?: profile.current).display()} kg · Ziel ${profile.goal.display()} kg")
                        val span = profile.start - profile.goal
                        if (span > 0) LinearProgressIndicator(
                            progress = { ((profile.start - (current ?: profile.current)) / span).toFloat().coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth()
                        )
                        TextButton(onClick = { nav.navigate("weight") }) { Text("Gewicht eintragen") }
                    }
                    Panel("Wasser") {
                        Text("$consumedWater ml${if (profile.waterGoal > 0) " von ${profile.waterGoal} ml" else ""}")
                        if (profile.waterGoal > 0) LinearProgressIndicator(
                            progress = { (consumedWater.toFloat() / profile.waterGoal).coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth()
                        )
                        OutlinedButton(onClick = { model.saveWater(Water(day = today, ml = 250)) }) { Text("+ 250 ml") }
                        TextButton(onClick = { nav.navigate("water") }) { Text("Wasser und Verlauf") }
                    }
                    Panel("Dein Coach") {
                        Text("${streak.first} Tage in Folge dokumentiert")
                        Text(tip)
                    }
                }
            }
            composable("Ernährung") {
                Page {
                    DaySelector(selectedDay, today) { model.day.value = it }
                    Button(onClick = { nav.navigate("scanner") }, Modifier.fillMaxWidth()) { Text("Barcode scannen") }
                    OutlinedButton(onClick = { nav.navigate("meal/$selectedDay") }, Modifier.fillMaxWidth()) { Text("Lebensmittel hinzufügen") }
                    OutlinedButton(onClick = { nav.navigate("library") }, Modifier.fillMaxWidth()) { Text("Produktbibliothek") }
                    val entries = meals.filter { it.day == selectedDay }
                    val previousWeek = meals.filter { it.day in selectedDay - 6..selectedDay }
                    Panel("7 Tage bis zum gewählten Tag") {
                        Text("${previousWeek.map { it.day }.distinct().size} dokumentierte Tage · ${previousWeek.totals().kcal.display()} kcal erfasst")
                    }
                    categories.forEach { category ->
                        Panel(category) {
                            val group = entries.filter { it.category == category }
                            if (group.isEmpty()) Text("Keine Einträge")
                            group.forEach { meal ->
                                key(meal.id) {
                                Text(meal.name, style = MaterialTheme.typography.titleMedium)
                                Text("${meal.amount.display()} ${meal.unit} · ${meal.kcal.display()} kcal")
                                EntryActions(
                                    edit = { nav.navigate("meal/${meal.day}?id=${meal.id}") },
                                    delete = { model.delete(meal) },
                                    copy = { model.copy(meal, today) }
                                )
                                }
                            }
                        }
                    }
                }
            }
            composable("Fortschritt") {
                Page {
                    ProgressPage(profile, weights, meals, today, { nav.navigate("weight") },
                        { nav.navigate("weight?day=$it") }, { model.delete(it) })
                }
            }
            composable("Coach") {
                Page {
                    Panel("Heute") { Text(tip) }
                    Panel("Energiebedarf · Schätzung") {
                        if (estimate == null) Text("Für deine Angaben ist derzeit keine automatische Kalorienempfehlung verfügbar.")
                        else {
                            Text("Grundumsatz ${estimate.basal} kcal")
                            Text("Gesamtenergiebedarf ${estimate.total} kcal")
                            Text("Empfohlenes Ziel ${estimate.recommended} kcal")
                            Text("Geplantes Defizit ${estimate.total - (target ?: estimate.recommended)} kcal")
                            Text("Schätzung anhand von Profil, Aktivitätsniveau und zuletzt erfasstem Gewicht.")
                        }
                    }
                    Panel("Deine Gewohnheiten") {
                        Text("Aktuell ${streak.first} Tage · längste Serie ${streak.second} Tage")
                        val week = meals.filter { it.day in today - 6..today }
                        Text("${week.map { it.day }.distinct().size} dokumentierte Tage in den letzten 7 Tagen")
                        if (meals.isNotEmpty()) Text("✓ Erster Ernährungseintrag")
                        if (meals.any { it.barcode != null }) Text("✓ Erstes Barcode-Produkt eingetragen")
                        if (meals.mapNotNull { it.barcode }.distinct().size >= 10) Text("✓ Zehn verschiedene Barcode-Produkte eingetragen")
                        if (streak.second >= 7) Text("✓ Sieben Tage in Folge dokumentiert")
                    }
                    OpenFoodFactsAttribution()
                }
            }
            composable("profile") {
                Page { ProfileForm(profile, current) { model.saveProfile(it) { nav.popBackStack() } } }
            }
            composable("weight?day={day}", arguments = listOf(navArgument("day") {
                type = NavType.LongType
                defaultValue = Long.MIN_VALUE
            })) { weightEntry ->
                val existing = weightEntry.arguments?.getLong("day")?.let { d -> weights.find { it.day == d } }
                Page {
                    WeightForm(existing, today, weights) { model.saveWeight(it) { nav.popBackStack() } }
                }
            }
            composable("water") {
                Page {
                    val fields = Fields("Menge (ml)" to "")
                    var editId by rememberSaveable { mutableStateOf<Long?>(null) }
                    var waterError by rememberSaveable { mutableStateOf("") }
                    Text("Wasserverlauf", style = MaterialTheme.typography.headlineMedium)
                    Field(fields, "Menge (ml)", true)
                    ErrorText(waterError)
                    Button(onClick = {
                        val ml = fields["Menge (ml)"]?.trim()?.toIntOrNull()?.takeIf { it in 1..2000 }
                        if (ml == null) waterError = "Bitte gib 1 bis 2.000 ml pro Eintrag ein."
                        else {
                            val existing = water.find { it.id == editId }
                            model.saveWater(Water(existing?.id ?: 0, existing?.day ?: today, ml)) {
                                fields["Menge (ml)"] = ""
                                waterError = ""
                                editId = null
                            }
                        }
                    }) { Text(if (editId == null) "Hinzufügen" else "Änderung speichern") }
                    water.take(100).forEach { item ->
                        Panel("${item.ml} ml · ${LocalDate.ofEpochDay(item.day).germanDate()}") {
                            EntryActions(edit = { editId = item.id; fields["Menge (ml)"] = item.ml.toString() },
                                delete = { model.delete(item); if (editId == item.id) editId = null })
                        }
                    }
                }
            }
            composable("scanner") {
                ScannerScreen { code -> nav.navigate("meal/$selectedDay?code=$code") { popUpTo("scanner") { inclusive = true } } }
            }
            composable("library") {
                Page {
                    val fields = Fields("Lokale Produktsuche" to "")
                    Field(fields, "Lokale Produktsuche")
                    OpenFoodFactsAttribution()
                    val search = fields["Lokale Produktsuche"].orEmpty().trim()
                    val visible = products.filter { "${it.name} ${it.brand} ${it.code}".contains(search, ignoreCase = true) }
                    if (visible.isEmpty()) Text("Keine passenden gespeicherten Produkte.")
                    visible.forEach { product ->
                        Panel(product.name.ifBlank { product.code }) {
                            Text(listOf(product.brand, product.code).filter { it.isNotBlank() }.joinToString(" · "))
                            Row {
                                TextButton(onClick = { nav.navigate("meal/$selectedDay?code=${product.code}") }) { Text("Verwenden") }
                                TextButton(onClick = { model.favorite(product) }) {
                                    Text(if (product.favorite) "Aus Favoriten entfernen" else "Favorisieren")
                                }
                            }
                        }
                    }
                }
            }
            composable("meal/{day}?id={id}&code={code}", arguments = listOf(
                navArgument("day") { type = NavType.LongType },
                navArgument("id") { type = NavType.LongType; defaultValue = 0L },
                navArgument("code") { type = NavType.StringType; defaultValue = "" }
            )) { mealEntry ->
                val args = requireNotNull(mealEntry.arguments)
                val id = args.getLong("id")
                val existing = meals.find { it.id == id }
                val code = args.getString("code").orEmpty().takeIf { it.isNotBlank() } ?: existing?.barcode
                val result by produceState<ProductLookup?>(null, code, id) {
                    if (code != null && id == 0L) {
                        value = try {
                            model.lookup(code)
                        } catch (_: Exception) {
                            currentCoroutineContext().ensureActive()
                            ProductLookup.Unavailable
                        }
                    }
                }
                val saveError by model.message.collectAsStateWithLifecycle()
                Page {
                    when {
                        id != 0L && existing == null -> Text("Eintrag wird geladen …")
                        code != null && id == 0L && result == null -> {
                            CircularProgressIndicator()
                            Text("Produkt wird gesucht …")
                        }
                        else -> MealForm(args.getLong("day"), existing, (result as? ProductLookup.Found)?.product,
                            code, result.message(), saveError != null) { meal, correction ->
                            model.saveMeal(meal, correction) { nav.popBackStack() }
                        }
                    }
                }
            }
        }
    }
}

private fun ProductLookup?.message() = when (this) {
    ProductLookup.Missing -> "Bei Open Food Facts nicht gefunden. Du kannst die Verpackungsdaten hier lokal speichern."
    ProductLookup.Network -> "Keine Verbindung zu Open Food Facts. Trage die Daten bei Bedarf manuell ein."
    ProductLookup.Unavailable -> "Produktdaten derzeit nicht verfügbar. Du kannst die Daten manuell erfassen."
    ProductLookup.Limited -> "Open Food Facts begrenzt gerade die Abfragen. Versuche es später oder erfasse das Produkt manuell."
    else -> ""
}

@Composable
fun Page(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

@Composable
fun Panel(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}

@Composable
fun OpenFoodFactsAttribution() {
    val uri = LocalUriHandler.current
    Column {
        TextButton(onClick = { uri.openUri("https://world.openfoodfacts.org") }) { Text("Produktinformationen: Open Food Facts") }
        TextButton(onClick = { uri.openUri("https://world.openfoodfacts.org/terms-of-use") }) { Text("Nutzungsbedingungen · ODbL") }
    }
}

@Composable
private fun DaySelector(day: Long, today: Long, change: (Long) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { change(day - 1) }) { Text("Zurück") }
        Text(LocalDate.ofEpochDay(day).germanDate())
        TextButton(onClick = { change(day + 1) }, enabled = day < today) { Text("Weiter") }
    }
}

@Composable
private fun EntryActions(edit: () -> Unit, delete: () -> Unit, copy: (() -> Unit)? = null) {
    var confirm by remember { mutableStateOf(false) }
    Row {
        TextButton(onClick = edit) { Text("Bearbeiten") }
        TextButton(onClick = { confirm = true }) { Text("Löschen") }
    }
    copy?.let { TextButton(onClick = it) { Text("Für heute kopieren") } }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false },
        title = { Text("Eintrag löschen?") },
        confirmButton = { TextButton(onClick = { confirm = false; delete() }) { Text("Löschen") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Abbrechen") } })
}

private fun List<Meal>.totals() = fold(Nutrients(0.0, 0.0, 0.0, 0.0)) { sum, item -> sum + item.nutrients() }

@Composable
private fun WeightForm(existing: Weight?, today: Long, weights: List<Weight>, save: (Weight) -> Unit) {
    val fields = Fields("Gewicht (kg)" to existing?.kg.input(),
        "Datum (JJJJ-MM-TT)" to LocalDate.ofEpochDay(existing?.day ?: today).toString())
    var error by rememberSaveable { mutableStateOf("") }
    Field(fields, "Gewicht (kg)", true)
    if (existing == null) Field(fields, "Datum (JJJJ-MM-TT)")
    else Text(LocalDate.ofEpochDay(existing.day).germanDate())
    ErrorText(error)
    Button(onClick = {
        val kg = fields["Gewicht (kg)"]?.number()?.takeIf { it in 30.0..500.0 }
        val day = runCatching { LocalDate.parse(fields["Datum (JJJJ-MM-TT)"]).toEpochDay() }.getOrNull()
        when {
            kg == null || day == null || day !in LocalDate.of(1900, 1, 1).toEpochDay()..today ->
                error = "Bitte prüfe Gewicht und Datum."
            existing == null && weights.any { it.day == day } -> error = "Für diesen Tag gibt es bereits einen Eintrag. Bearbeite ihn im Verlauf."
            else -> save(Weight(day, kg))
        }
    }) { Text("Gewicht speichern") }
}

@Composable
private fun ProgressPage(profile: Profile, weights: List<Weight>, meals: List<Meal>, today: Long,
                         add: () -> Unit, edit: (Long) -> Unit, delete: (Weight) -> Unit) {
    var window by rememberSaveable { mutableIntStateOf(1) }
    val startDay = if (window == 3) Long.MIN_VALUE else today - listOf(6, 29, 89)[window]
    val samples = weights.filter { it.day in startDay..today }.sortedBy { it.day }
    val current = weights.firstOrNull()?.kg ?: profile.current
    Panel("Dein Gewichtsverlauf") {
        Text("${current.display()} kg", style = MaterialTheme.typography.headlineMedium)
        Text("Start ${profile.start.display()} kg · Ziel ${profile.goal.display()} kg")
        Text("${(current - profile.start).display()} kg seit Beginn")
        Choice("Zeitraum", listOf("7 Tage", "30 Tage", "90 Tage", "Gesamt"), window) { window = it }
        if (samples.size < 2) Text("Für eine Verlaufslinie sind zwei Messungen nötig.")
        else {
            val color = MaterialTheme.colorScheme.primary
            val min = samples.minOf { it.kg }
            val max = samples.maxOf { it.kg }
            Canvas(Modifier.fillMaxWidth().height(110.dp).padding(6.dp)) {
                val range = (samples.last().day - samples.first().day).toFloat()
                val points = samples.map { item ->
                    Offset(size.width * (item.day - samples.first().day) / range,
                        if (max == min) size.height / 2 else size.height * ((max - item.kg) / (max - min)).toFloat())
                }
                points.zipWithNext().forEach { (a, b) -> drawLine(color, a, b, 3.dp.toPx(), StrokeCap.Round) }
                points.forEach { drawCircle(color, 3.dp.toPx(), it) }
            }
            Text("${min.display()} bis ${max.display()} kg · ${samples.size} Messungen")
        }
        val week = weights.filter { it.day in today - 6..today }
        if (week.isNotEmpty()) Text("7-Tage-Mittel aus ${week.size} Messungen · ${week.map { it.kg }.average().display()} kg")
        Button(onClick = add) { Text("Gewicht eintragen") }
    }
    Panel("Ernährungsstatistik") {
        val count = meals.map { it.day }.distinct().size
        Text("$count dokumentierte Tage · ${meals.size} Mahlzeiteneinträge")
        if (count > 0) Text("${(meals.totals().kcal / count).display()} kcal je dokumentiertem Tag")
    }
    samples.asReversed().forEach {
        key(it.day) {
            Panel("${it.kg.display()} kg · ${LocalDate.ofEpochDay(it.day).germanDate()}") {
                EntryActions(edit = { edit(it.day) }, delete = { delete(it) })
            }
        }
    }
}
