package de.slimcoach.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.Room
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate

sealed interface ProfileState {
    data object Loading : ProfileState
    data class Ready(val profile: Profile?) : ProfileState
}

class SlimViewModel(application: Application) : AndroidViewModel(application) {
    private val diary = Room.databaseBuilder(application, DiaryDatabase::class.java, "diary.db").build().diary()
    private val catalog = Room.databaseBuilder(application, ProductDatabase::class.java, "products.db").build().products()
    private val store = ProfileStore(application)
    private val api = OpenFoodFacts()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()

    val profile = store.profile.map<Profile?, ProfileState> { ProfileState.Ready(it) }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ProfileState.Loading)
    val meals = diary.meals().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val weights = diary.weights().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val water = diary.water().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val products = catalog.observe().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val day = MutableStateFlow(LocalDate.now().toEpochDay())
    val deviceDay = MutableStateFlow(LocalDate.now().toEpochDay())

    fun updateToday() {
        val value = LocalDate.now().toEpochDay()
        if (day.value == deviceDay.value) day.value = value
        deviceDay.value = value
    }

    private fun write(after: () -> Unit = {}, action: suspend () -> Unit) {
        viewModelScope.launch {
            try {
                action()
                after()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (_: Exception) {
                _message.value = "Die Änderung konnte nicht gespeichert werden."
            }
        }
    }

    fun dismissMessage() { _message.value = null }
    fun saveProfile(p: Profile, after: () -> Unit) = write(after) {
        val previous = (profile.value as? ProfileState.Ready)?.profile
        if (previous == null || (weights.value.firstOrNull()?.kg ?: previous.current) != p.current) diary.save(Weight(deviceDay.value, p.current))
        store.save(p)
    }
    fun saveWeight(weight: Weight, after: () -> Unit) = write(after) { diary.save(weight) }
    fun delete(weight: Weight) = write { diary.delete(weight) }
    fun saveWater(entry: Water, after: () -> Unit = {}) = write(after) { diary.save(entry) }
    fun delete(entry: Water) = write { diary.delete(entry) }
    fun delete(meal: Meal) = write { diary.delete(meal) }
    fun copy(meal: Meal, to: Long) = write { diary.save(meal.copy(id = 0, day = to)) }
    fun favorite(product: FoodProductEntity) = write { catalog.favorite(product.code, !product.favorite) }

    suspend fun lookup(code: String): ProductLookup {
        catalog.get(code)?.let { return ProductLookup.Found(it) }
        val result = api.find(code)
        if (result is ProductLookup.Found) {
            catalog.cache(result.product)
            return ProductLookup.Found(catalog.get(code) ?: result.product)
        }
        return result
    }

    fun saveMeal(meal: Meal, product: FoodProductEntity?, after: () -> Unit) = write(after) {
        if (product != null) {
            if (catalog.get(product.code) == null) catalog.cache(product)
            if (product.source == "local") {
                catalog.correct(product.code, product.name, product.brand, product.pack, product.unit,
                    requireNotNull(product.kcal), requireNotNull(product.protein),
                    requireNotNull(product.carbs), requireNotNull(product.fat))
            }
        }
        diary.save(meal)
    }
}
