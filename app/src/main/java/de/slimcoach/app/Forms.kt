package de.slimcoach.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.mapSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import java.time.LocalDate

val categories = listOf("Frühstück", "Mittagessen", "Abendessen", "Snacks")
val activityLabels = listOf("Überwiegend sitzend", "Leicht aktiv", "Mäßig aktiv", "Sehr aktiv")
val paceLabels = listOf("Gewicht halten", "Behutsam", "Moderat")

@Composable
fun Fields(vararg values: Pair<String, String>): MutableMap<String, String> =
    rememberSaveable(saver = mapSaver(
        save = { it.toMap() },
        restore = { restored -> mutableStateMapOf<String, String>().apply {
            restored.forEach { (key, value) -> put(key, value as String) }
        } }
    )) { mutableStateMapOf(*values) }

@Composable
fun Field(fields: MutableMap<String, String>, label: String, numeric: Boolean = false) {
    OutlinedTextField(fields[label].orEmpty(), { fields[label] = it }, Modifier.fillMaxWidth(),
        label = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (numeric) KeyboardType.Decimal else KeyboardType.Text))
}

@Composable
fun Choice(label: String, options: List<String>, index: Int, select: (Int) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        OutlinedButton(onClick = { expanded = true }, Modifier.fillMaxWidth()) {
            Text("$label · ${options[index]}")
        }
        DropdownMenu(expanded, { expanded = false }) {
            options.forEachIndexed { position, value ->
                DropdownMenuItem(text = { Text(value) }, onClick = {
                    select(position)
                    expanded = false
                })
            }
        }
    }
}

@Composable
fun Toggle(label: String, checked: Boolean, update: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f).padding(end = 12.dp))
        Switch(checked, update)
    }
}

@Composable
fun ProfileForm(profile: Profile?, weight: Double?, save: (Profile) -> Unit) {
    val fields = Fields(
        "Spitzname" to profile?.name.orEmpty(), "Geburtsjahr" to (profile?.birthYear?.toString() ?: ""),
        "Größe (cm)" to profile?.height.input(), "Startgewicht (kg)" to profile?.start.input(),
        "Aktuelles Gewicht (kg)" to (weight ?: profile?.current).input(), "Zielgewicht (kg)" to profile?.goal.input(),
        "Ernährungspräferenzen" to profile?.preference.orEmpty(), "Typischer Alltag" to profile?.routine.orEmpty(),
        "Schrittziel" to (profile?.stepGoal?.toString() ?: ""),
        "Trinkziel (ml)" to (profile?.waterGoal?.toString() ?: ""),
        "Manuelles Kalorienziel (kcal)" to (profile?.manualTarget?.toString() ?: "")
    )
    var formula by rememberSaveable { mutableIntStateOf(profile?.formula ?: 2) }
    var activity by rememberSaveable { mutableIntStateOf(profile?.activity ?: 0) }
    var pace by rememberSaveable { mutableIntStateOf(profile?.pace ?: 1) }
    var restricted by rememberSaveable { mutableStateOf(profile?.restricted ?: false) }
    var ready by rememberSaveable { mutableStateOf(profile?.readyMeals ?: false) }
    var error by rememberSaveable { mutableStateOf("") }

    Text(if (profile == null) "Willkommen bei SlimCoach" else "Persönliches Profil",
        style = MaterialTheme.typography.headlineMedium)
    Text("Für Erwachsene. Deine Angaben werden auf diesem Gerät gespeichert.")
    listOf("Spitzname", "Geburtsjahr", "Größe (cm)", "Startgewicht (kg)", "Aktuelles Gewicht (kg)",
        "Zielgewicht (kg)").forEach { Field(fields, it, it != "Spitzname") }
    Choice("Formelparameter", listOf("Weiblich (−161)", "Männlich (+5)", "Überspringen"), formula) { formula = it }
    Text("Der Parameter dient der Mifflin-St-Jeor-Schätzung des Grundumsatzes.")
    Choice("Aktivität", activityLabels, activity) { activity = it }
    Choice("Abnehmtempo", paceLabels, pace) { pace = it }
    Field(fields, "Ernährungspräferenzen")
    Field(fields, "Typischer Alltag")
    Toggle("Ich esse häufig Fertiggerichte", ready) { ready = it }
    Field(fields, "Schrittziel", true)
    Field(fields, "Trinkziel (ml)", true)
    Toggle("Schwangerschaft, Stillzeit, Essstörungsrisiko oder medizinische Besonderheiten", restricted) { restricted = it }
    Text("Hole in diesen Fällen oder bei Minderjährigkeit fachlichen Rat ein. SlimCoach empfiehlt dann kein Kalorienziel.")
    if (profile != null && !restricted) Field(fields, "Manuelles Kalorienziel (kcal)", true)
    ErrorText(error)
    Button(onClick = {
        val year = fields["Geburtsjahr"]?.trim()?.toIntOrNull()
        val now = LocalDate.now().year
        val height = fields["Größe (cm)"]?.number()?.takeIf { it in 100.0..250.0 }
        val start = fields["Startgewicht (kg)"]?.number()?.takeIf { it in 30.0..500.0 }
        val current = fields["Aktuelles Gewicht (kg)"]?.number()?.takeIf { it in 30.0..500.0 }
        val goal = fields["Zielgewicht (kg)"]?.number()?.takeIf { it in 30.0..500.0 }
        val steps = fields["Schrittziel"].orEmpty().trim().ifEmpty { "0" }.toIntOrNull()
        val water = fields["Trinkziel (ml)"].orEmpty().trim().ifEmpty { "0" }.toIntOrNull()
        if (year == null || year !in now - 120..now || height == null || start == null ||
            current == null || goal == null || steps == null || steps !in 0..50000 ||
            water == null || water !in 0..5000) {
            error = "Bitte prüfe Geburtsjahr, Größe und Gewicht sowie die optionalen Tagesziele."
            return@Button
        }
        val p = Profile(fields["Spitzname"].orEmpty().trim(), year, height, start, current, goal,
            formula, activity, pace, fields["Ernährungspräferenzen"].orEmpty(),
            fields["Typischer Alltag"].orEmpty(), ready, steps, water, restricted, null)
        val estimate = CalorieTargetEngine.estimate(p, current)
        val rawTarget = fields["Manuelles Kalorienziel (kcal)"].orEmpty().trim()
        val manual = rawTarget.toIntOrNull()
        if (estimate != null && rawTarget.isNotEmpty() &&
            (manual == null || !CalorieTargetEngine.acceptsManual(manual, estimate))) {
            error = "Das manuelle Ziel liegt außerhalb des moderaten Bereichs für deinen geschätzten Bedarf."
            return@Button
        }
        save(p.copy(manualTarget = manual.takeIf { estimate != null }))
    }, Modifier.fillMaxWidth()) { Text("Profil speichern") }
}

fun Double?.input(): String = this?.toString()?.removeSuffix(".0") ?: ""

@Composable
fun ErrorText(error: String) {
    if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
}

@Composable
fun MealForm(day: Long, meal: Meal?, product: FoodProductEntity?, code: String?,
             lookupMessage: String, saveFailed: Boolean, save: (Meal, FoodProductEntity?) -> Unit) {
    val fields = Fields(
        "Lebensmittel" to (meal?.name ?: product?.name.orEmpty()),
        "Marke" to (meal?.brand ?: product?.brand.orEmpty()),
        "Menge" to (meal?.amount ?: 100.0).input(), "Portionen" to (meal?.portions ?: 1.0).input(),
        "Packungsmenge" to product?.pack.input(),
        "Kalorien" to (meal?.let { it.kcal * 100 / it.amount } ?: product?.kcal).input(),
        "Eiweiß" to (meal?.let { it.protein * 100 / it.amount } ?: product?.protein).input(),
        "Kohlenhydrate" to (meal?.let { it.carbs * 100 / it.amount } ?: product?.carbs).input(),
        "Fett" to (meal?.let { it.fat * 100 / it.amount } ?: product?.fat).input()
    )
    var unit by rememberSaveable { mutableIntStateOf(if ((meal?.unit ?: product?.unit) == "ml") 1 else 0) }
    var category by rememberSaveable { mutableIntStateOf(categories.indexOf(meal?.category).coerceAtLeast(0)) }
    var error by rememberSaveable { mutableStateOf("") }
    val unitLabel = if (unit == 0) "g" else "ml"
    val name = fields["Lebensmittel"].orEmpty().trim()
    val brand = fields["Marke"].orEmpty().trim()
    val amount = fields["Menge"]?.number()?.takeIf { it > 0 && it <= 10000 }
    val servings = fields["Portionen"]?.number()?.takeIf { it > 0 && it <= 100 }
    val pack = fields["Packungsmenge"]?.number()?.takeIf { it > 0 && it <= 100000 }
    val kcal = fields["Kalorien"]?.number()?.takeIf { it in 0.0..1000.0 }
    val protein = fields["Eiweiß"]?.number()?.takeIf { it in 0.0..100.0 }
    val carbs = fields["Kohlenhydrate"]?.number()?.takeIf { it in 0.0..100.0 }
    val fat = fields["Fett"]?.number()?.takeIf { it in 0.0..100.0 }
    val values = if (kcal != null && protein != null && carbs != null && fat != null) Nutrients(kcal, protein, carbs, fat) else null
    val total = if (amount != null) values?.portion(amount) else null

    Text(if (meal != null) "Eintrag bearbeiten" else "Lebensmittel erfassen", style = MaterialTheme.typography.headlineMedium)
    Text(LocalDate.ofEpochDay(day).germanDate())
    ErrorText(lookupMessage)
    code?.let { Text("Barcode $it") }
    if (product?.source == "off") {
        OpenFoodFactsAttribution()
        if (product.converted) Text("Energie aus kJ in kcal umgerechnet.")
        if (System.currentTimeMillis() - product.fetched > 90L * 24 * 60 * 60 * 1000)
            Text("Der Cache ist älter als 90 Tage. Prüfe die Verpackungsangaben.")
    }
    Field(fields, "Lebensmittel")
    Field(fields, "Marke")
    Choice("Mahlzeit", categories, category) { category = it }
    Choice("Einheit", listOf("Gramm", "Milliliter"), unit) { selected ->
        if (selected != unit) {
            listOf("Packungsmenge", "Kalorien", "Eiweiß", "Kohlenhydrate", "Fett").forEach { fields[it] = "" }
            unit = selected
        }
    }
    if (code != null && meal == null) {
        Field(fields, "Packungsmenge", true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { fields["Menge"] = pack.input() }, enabled = pack != null,
                modifier = Modifier.weight(1f)) { Text("Ganze Packung") }
            OutlinedButton(onClick = { fields["Menge"] = pack?.div(2).input() }, enabled = pack != null,
                modifier = Modifier.weight(1f)) { Text("Halbe Packung") }
        }
        OutlinedButton(onClick = { fields["Menge"] = "100" }) { Text("100 $unitLabel") }
    }
    Field(fields, "Menge", true)
    Text("Tatsächlich gegessene Gesamtmenge in $unitLabel. Die Anzahl der Portionen dient der Dokumentation.")
    Field(fields, "Portionen", true)
    Text("Nährwerte pro 100 $unitLabel", style = MaterialTheme.typography.titleMedium)
    Text("Prüfe die Werte anhand der Verpackung. Trage fehlende Angaben ein.")
    listOf("Kalorien", "Eiweiß", "Kohlenhydrate", "Fett").forEach { Field(fields, it, true) }
    total?.let { Text("${it.kcal.display()} kcal · ${it.protein.display()} g Eiweiß · ${it.carbs.display()} g KH · ${it.fat.display()} g Fett") }
    ErrorText(error)
    var saving by remember { mutableStateOf(false) }
    LaunchedEffect(saveFailed) { if (saveFailed) saving = false }
    Button(onClick = {
        if (name.isEmpty() || amount == null || servings == null || total == null || values == null ||
            (fields["Packungsmenge"].orEmpty().isNotBlank() && pack == null)) {
            error = "Bitte ergänze Name, Menge, Portionen und alle Nährwerte."
            return@Button
        }
        val changed = product == null || name != product.name || brand != product.brand || pack != product.pack ||
            unitLabel != product.unit || kcal != product.kcal || protein != product.protein ||
            carbs != product.carbs || fat != product.fat
        val local = code?.takeIf { meal == null && changed }?.let {
            FoodProductEntity(it, name, brand, pack, unitLabel, values.kcal, values.protein, values.carbs,
                values.fat, "local", System.currentTimeMillis(), favorite = product?.favorite == true)
        }
        saving = true
        save(Meal(meal?.id ?: 0, day, categories[category], name, brand, amount, unitLabel,
            servings, total.kcal, total.protein, total.carbs, total.fat, code), local)
    }, Modifier.fillMaxWidth(), enabled = !saving) { Text("Eintrag speichern") }
}
