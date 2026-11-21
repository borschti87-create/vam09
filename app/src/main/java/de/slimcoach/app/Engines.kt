package de.slimcoach.app

import java.time.LocalDate
import kotlin.math.roundToInt

data class Profile(
    val name: String, val birthYear: Int, val height: Double, val start: Double,
    val current: Double, val goal: Double, val formula: Int, val activity: Int,
    val pace: Int, val preference: String, val routine: String, val readyMeals: Boolean,
    val stepGoal: Int, val waterGoal: Int, val restricted: Boolean, val manualTarget: Int?
)

data class CalorieEstimate(val basal: Int, val total: Int, val recommended: Int) {
    val deficit get() = total - recommended
}

object CalorieTargetEngine {
    val factors = listOf(1.2, 1.375, 1.55, 1.725)
    val deficits = listOf(0, 250, 400)

    fun estimate(profile: Profile, weight: Double, today: LocalDate = LocalDate.now()): CalorieEstimate? {
        // With only a birth year, use the youngest possible age for the adult eligibility gate.
        val age = today.year - profile.birthYear
        if (profile.restricted || age !in 19..120 || profile.formula !in 0..1) return null
        if (profile.height !in 100.0..250.0 || weight !in 30.0..500.0 ||
            profile.goal / (profile.height / 100).let { it * it } < 18.5) return null
        val basal = (10 * weight + 6.25 * profile.height - 5 * age +
            if (profile.formula == 0) -161 else 5).roundToInt()
        val total = (basal * factors[profile.activity]).roundToInt()
        if (total < 1500) return null
        val floor = maxOf(1500, basal, (total * .8).roundToInt(), total - 500)
        val deficit = if (weight > profile.goal) deficits[profile.pace] else 0
        return CalorieEstimate(basal, total, (total - deficit).coerceIn(floor, total))
    }

    fun acceptsManual(target: Int, estimate: CalorieEstimate): Boolean =
        target in maxOf(1500, estimate.basal, (estimate.total * .8).roundToInt(), estimate.total - 500)..estimate.total
}

data class Nutrients(val kcal: Double, val protein: Double, val carbs: Double, val fat: Double) {
    fun portion(amount: Double) = Nutrients(kcal * amount / 100, protein * amount / 100,
        carbs * amount / 100, fat * amount / 100)

    operator fun plus(other: Nutrients) =
        Nutrients(kcal + other.kcal, protein + other.protein, carbs + other.carbs, fat + other.fat)
}

fun String.number(): Double? = trim().replace(',', '.').toDoubleOrNull()?.takeIf { it.isFinite() }
fun Double.display(): String = java.text.NumberFormat.getNumberInstance(java.util.Locale.GERMANY)
    .apply { maximumFractionDigits = 1 }.format(this)

fun streaks(days: Collection<Long>, today: Long): Pair<Int, Int> {
    var previous: Long? = null
    var run = 0
    var longest = 0
    for (day in days.filter { it <= today }.distinct().sorted()) {
        run = if (previous == day - 1) run + 1 else 1
        longest = maxOf(longest, run)
        previous = day
    }
    return (if (previous == today || previous == today - 1) run else 0) to longest
}

object CoachingEngine {
    fun tip(count: Int, readyMeals: Boolean, food: Nutrients, target: Int?): String = when {
        count == 0 -> "Ein erster Eintrag hilft dir, deine Mahlzeiten im Blick zu behalten."
        target != null && food.kcal >= target -> "Dein geschätztes Tagesbudget ist erreicht. Einzelne Tage sind Teil eines längeren Verlaufs."
        readyMeals -> "Prüfe bei Fertiggerichten die tatsächlich gegessene Menge. Gemüse oder Hülsenfrüchte sind einfache ballaststoffreiche Ergänzungen."
        else -> "Eine regelmäßige Dokumentation kann dir helfen, deine Gewohnheiten zu erkennen."
    }
}
