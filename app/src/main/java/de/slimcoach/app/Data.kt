package de.slimcoach.app

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.room.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import org.json.JSONObject

@Entity(tableName = "meals")
data class Meal(
    @PrimaryKey(autoGenerate = true) val id: Long = 0, val day: Long, val category: String,
    val name: String, val brand: String, val amount: Double, val unit: String,
    val portions: Double, val kcal: Double, val protein: Double, val carbs: Double, val fat: Double,
    val barcode: String? = null
) {
    fun nutrients() = Nutrients(kcal, protein, carbs, fat)
}

@Entity(tableName = "weights")
data class Weight(@PrimaryKey val day: Long, val kg: Double)

@Entity(tableName = "water")
data class Water(@PrimaryKey(autoGenerate = true) val id: Long = 0, val day: Long, val ml: Int)

@Entity(tableName = "food_products")
data class FoodProductEntity(
    @PrimaryKey val code: String, val name: String, val brand: String,
    val pack: Double?, val unit: String, val kcal: Double?, val protein: Double?,
    val carbs: Double?, val fat: Double?, val source: String, val fetched: Long,
    val converted: Boolean = false, val favorite: Boolean = false,
    val fiber: Double? = null, val sugar: Double? = null, val salt: Double? = null
)

@Dao
interface DiaryDao {
    @Query("SELECT * FROM meals ORDER BY day DESC, id DESC") fun meals(): Flow<List<Meal>>
    @Query("SELECT * FROM weights ORDER BY day DESC") fun weights(): Flow<List<Weight>>
    @Query("SELECT * FROM water ORDER BY day DESC, id DESC") fun water(): Flow<List<Water>>
    @Upsert suspend fun save(meal: Meal)
    @Upsert suspend fun save(weight: Weight)
    @Upsert suspend fun save(water: Water)
    @Delete suspend fun delete(meal: Meal)
    @Delete suspend fun delete(weight: Weight)
    @Delete suspend fun delete(water: Water)
}

@Dao
interface ProductDao {
    @Query("SELECT * FROM food_products ORDER BY favorite DESC, name COLLATE NOCASE") fun observe(): Flow<List<FoodProductEntity>>
    @Query("SELECT * FROM food_products WHERE code = :code") suspend fun get(code: String): FoodProductEntity?
    @Upsert suspend fun save(product: FoodProductEntity)
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun cache(product: FoodProductEntity)
    @Query("UPDATE food_products SET favorite = :favorite WHERE code = :code") suspend fun favorite(code: String, favorite: Boolean)
    @Query("UPDATE food_products SET name=:name, brand=:brand, pack=:pack, unit=:unit, kcal=:kcal, protein=:protein, carbs=:carbs, fat=:fat, source='local', converted=0, fiber=NULL, sugar=NULL, salt=NULL WHERE code=:code")
    suspend fun correct(code: String, name: String, brand: String, pack: Double?, unit: String,
                        kcal: Double, protein: Double, carbs: Double, fat: Double)
}

@Database(entities = [Meal::class, Weight::class, Water::class], version = 1, exportSchema = false)
abstract class DiaryDatabase : RoomDatabase() {
    abstract fun diary(): DiaryDao
}

@Database(entities = [FoodProductEntity::class], version = 1, exportSchema = false)
abstract class ProductDatabase : RoomDatabase() {
    abstract fun products(): ProductDao
}

private val Context.preferences by preferencesDataStore("settings")

class ProfileStore(private val context: Context) {
    private val key = stringPreferencesKey("profile")
    val profile = context.preferences.data.map { preferences ->
        preferences[key]?.let { raw ->
            val json = JSONObject(raw)
            Profile(json.getString("name"), json.getInt("year"), json.getDouble("height"),
                json.getDouble("start"), json.getDouble("current"), json.getDouble("goal"),
                json.getInt("formula"), json.getInt("activity"), json.getInt("pace"),
                json.getString("preference"), json.getString("routine"), json.getBoolean("ready"),
                json.getInt("steps"), json.getInt("water"), json.getBoolean("restricted"),
                if (json.isNull("target")) null else json.getInt("target"),
                if (json.isNull("confirmedTarget")) null else json.getInt("confirmedTarget"),
                if (json.isNull("targetUpdatedDay")) null else json.getLong("targetUpdatedDay"))
        }
    }

    suspend fun save(p: Profile) {
        val json = JSONObject().put("name", p.name).put("year", p.birthYear)
            .put("height", p.height).put("start", p.start).put("current", p.current)
            .put("goal", p.goal).put("formula", p.formula).put("activity", p.activity)
            .put("pace", p.pace).put("preference", p.preference).put("routine", p.routine)
            .put("ready", p.readyMeals).put("steps", p.stepGoal).put("water", p.waterGoal)
            .put("restricted", p.restricted).put("target", p.manualTarget)
        context.preferences.edit { it[key] = json.toString() }
    }
}
