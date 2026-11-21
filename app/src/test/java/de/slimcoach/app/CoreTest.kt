package de.slimcoach.app

import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test

class CoreTest {
    private val profile = Profile("", 1990, 180.0, 90.0, 90.0, 80.0, 1, 1, 1,
        "", "", true, 0, 0, false, null)

    @Test fun mifflinAndModerateDeficit() {
        val estimate = CalorieTargetEngine.estimate(profile, 90.0, LocalDate.of(2026, 1, 1))!!
        assertEquals(1850, estimate.basal)
        assertEquals(2544, estimate.total)
        assertEquals(2294, estimate.recommended)
        assertFalse(CalorieTargetEngine.acceptsManual(1200, estimate))
        assertTrue(CalorieTargetEngine.acceptsManual(2300, estimate))
        assertTrue(CalorieTargetEngine.estimate(profile, 85.0, LocalDate.of(2026, 1, 1))!!.total < estimate.total)
    }

    @Test fun restrictedProfilesHaveNoTarget() {
        val today = LocalDate.of(2026, 6, 1)
        assertNull(CalorieTargetEngine.estimate(profile.copy(restricted = true), 90.0, today))
        assertNull(CalorieTargetEngine.estimate(profile.copy(birthYear = 2008), 90.0, today))
        assertNull(CalorieTargetEngine.estimate(profile.copy(goal = 55.0), 90.0, today))
    }

    @Test fun portionUsesConsumedAmount() {
        val nutrients = Nutrients(150.0, 8.0, 12.0, 6.0)
        assertEquals(Nutrients(600.0, 32.0, 48.0, 24.0), nutrients.portion(400.0))
        assertEquals(Nutrients(300.0, 16.0, 24.0, 12.0), nutrients.portion(200.0))
        assertEquals(12.5, "12,5".number()!!, 0.001)
        assertNull("Infinity".number())
    }

    @Test fun gtinChecksumsAndCanonicalUpc() {
        assertEquals("3017620422003", BarcodeCode.normalize(" 3017620422003 "))
        assertEquals("96385074", BarcodeCode.normalize("96385074"))
        assertEquals("0036000291452", BarcodeCode.normalize("036000291452"))
        assertEquals("0042100005264", BarcodeCode.normalize("04252614", upce = true))
        assertNull(BarcodeCode.normalize("3017620422004"))
    }

    @Test fun missedDayPreservesLongestStreak() {
        assertEquals(2 to 3, streaks(listOf(2, 3, 4, 8, 9, 9), 10))
        assertEquals(0 to 3, streaks(listOf(2, 3, 4, 8, 9), 11))
    }

    @Test fun coachingUsesAvailableEntries() {
        val empty = Nutrients(0.0, 0.0, 0.0, 0.0)
        assertTrue(CoachingEngine.tip(0, true, empty, 2000).contains("erster Eintrag"))
        assertTrue(CoachingEngine.tip(1, true, empty, null).contains("Fertiggerichten"))
    }
}
