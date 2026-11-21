package de.slimcoach.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

object BarcodeCode {
    fun normalize(raw: String, upce: Boolean = false): String? {
        val code = raw.trim().filterNot(Char::isWhitespace)
        if (code.any { it !in '0'..'9' }) return null
        val expanded = if (upce) expandUpce(code) ?: return null else code
        if (expanded.length !in listOf(8, 12, 13)) return null
        val sum = expanded.dropLast(1).reversed().mapIndexed { index, char ->
            char.digitToInt() * if (index % 2 == 0) 3 else 1
        }.sum()
        if ((10 - sum % 10) % 10 != expanded.last().digitToInt()) return null
        return if (expanded.length == 12) "0" + expanded else expanded
    }

    private fun expandUpce(code: String): String? {
        if (code.length != 8 || code.first() !in '0'..'1') return null
        val d = code[6]
        val expanded = when (d) {
            '0', '1', '2' -> code.take(3) + d + "0000" + code.substring(3, 6)
            '3' -> code.take(4) + "00000" + code.substring(4, 6)
            '4' -> code.take(5) + "00000" + code[5]
            else -> code.take(6) + "0000" + d
        }
        return expanded + code.last()
    }
}

sealed interface ProductLookup {
    data class Found(val product: FoodProductEntity) : ProductLookup
    data object Missing : ProductLookup
    data object Network : ProductLookup
    data object Unavailable : ProductLookup
    data object Limited : ProductLookup
}

class OpenFoodFacts(
    private val baseUrl: String = "https://world.openfoodfacts.org",
    private val userAgent: String = "SlimCoach/${BuildConfig.VERSION_NAME} (${BuildConfig.OFF_CONTACT})",
    private val http: OkHttpClient = OkHttpClient.Builder().callTimeout(12, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false).followRedirects(false).build()
) {
    suspend fun find(code: String): ProductLookup = withContext(Dispatchers.IO) {
        require(BarcodeCode.normalize(code) == code)
        val fields = "code,product_name,brands,quantity,product_quantity,product_quantity_unit,nutrition_data_per,nutriments"
        val request = Request.Builder().url("$baseUrl/api/v3/product/$code?fields=$fields")
            .header("User-Agent", userAgent).build()
        try {
            http.newCall(request).execute().use { response ->
                when {
                    response.code == 404 -> ProductLookup.Missing
                    response.code == 429 -> ProductLookup.Limited
                    !response.isSuccessful -> ProductLookup.Unavailable
                    else -> decode(code, response.body?.string().orEmpty())
                }
            }
        } catch (_: IOException) {
            ProductLookup.Network
        } catch (_: JSONException) {
            ProductLookup.Unavailable
        }
    }

    internal fun decode(code: String, body: String): ProductLookup {
        val json = JSONObject(body)
        val result = json.optJSONObject("result")?.optString("id")
        if (result == "product_not_found") return ProductLookup.Missing
        val product = json.optJSONObject("product") ?: return ProductLookup.Unavailable
        if (BarcodeCode.normalize(product.optString("code")) != code) return ProductLookup.Unavailable
        val n = product.optJSONObject("nutriments") ?: JSONObject()
        fun nutrient(key: String, max: Double) = n.optDouble(key + "_100g").takeIf { it in 0.0..max }
        val kcal = nutrient("energy-kcal", 1000.0)
        val converted = if (kcal == null) (nutrient("energy-kj", 4184.0)
            ?: nutrient("energy", 4184.0).takeIf { n.optString("energy_unit").equals("kJ", true) })
            ?.let { it / 4.184 } else null
        val packUnit = product.optString("product_quantity_unit").lowercase()
        val basis = product.optString("nutrition_data_per").lowercase()
        val volume = packUnit in listOf("ml", "cl", "dl", "l")
        // The API typically labels both mass and volume with the _100g suffix.
        val unit = if (basis.contains("ml") || (basis != "100g" && volume)) "ml" else "g"
        val factor = when (packUnit) {
            "g" -> if (unit == "g") 1.0 else null
            "kg" -> if (unit == "g") 1000.0 else null
            "ml" -> if (unit == "ml") 1.0 else null
            "cl" -> if (unit == "ml") 10.0 else null
            "dl" -> if (unit == "ml") 100.0 else null
            "l" -> if (unit == "ml") 1000.0 else null
            else -> null
        }
        val pack = factor?.let { product.optDouble("product_quantity") * it }?.takeIf { it > 0 && it <= 100000 }
        // Ambiguous volume, serving and unknown bases require checking the package.
        val usable = (basis == "100g" && !volume) || basis == "100ml"
        return ProductLookup.Found(FoodProductEntity(code,
            product.optString("product_name"), product.optString("brands"), pack, unit,
            (kcal ?: converted).takeIf { usable }, nutrient("proteins", 100.0).takeIf { usable },
            nutrient("carbohydrates", 100.0).takeIf { usable }, nutrient("fat", 100.0).takeIf { usable },
            "off", System.currentTimeMillis(), converted = converted != null && usable,
            fiber = nutrient("fiber", 100.0).takeIf { usable },
            sugar = nutrient("sugars", 100.0).takeIf { usable },
            salt = nutrient("salt", 100.0).takeIf { usable }))
    }
}
