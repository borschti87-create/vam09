package de.slimcoach.app

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.*
import org.junit.Test

class OpenFoodFactsTest {
    private val code = "3017620422003"
    private val response = """
        {"result":{"id":"product_found"},"product":{"code":"3017620422003","product_name":"Testgericht",
        "product_quantity":400,"product_quantity_unit":"g","nutrition_data_per":"100g",
        "nutriments":{"energy-kj_100g":627.6,"proteins_100g":8,"carbohydrates_100g":12,"fat_100g":6}}}
    """.trimIndent()

    @Test fun decodesNutrientsAndConvertsEnergy() {
        val p = (OpenFoodFacts().decode(code, response) as ProductLookup.Found).product
        assertEquals(400.0, p.pack!!, 0.0)
        assertEquals(150.0, p.kcal!!, 0.001)
        assertTrue(p.converted)
        assertEquals(8.0, p.protein!!, 0.0)
    }

    @Test fun missingFieldsAndAmbiguousBasisStayEmpty() {
        val withoutFields = response.replace("627.6", "null").replace("\"product_quantity\":400,", "")
        val p = (OpenFoodFacts().decode(code, withoutFields) as ProductLookup.Found).product
        assertNull(p.kcal)
        assertNull(p.pack)
        val volume = (OpenFoodFacts().decode(code, response.replace("\"g\"", "\"ml\"")) as ProductLookup.Found).product
        assertNull(volume.kcal)
    }

    @Test fun handlesFoundMissingRateLimitServerAndNetworkErrors() = runBlocking {
        val client = OkHttpClient.Builder().retryOnConnectionFailure(false).build()
        lateinit var api: OpenFoodFacts
        MockWebServer().use { server ->
            api = OpenFoodFacts(server.url("/").toString().trimEnd('/'), "SlimCoach/test", client)
            server.enqueue(MockResponse().setBody(response))
            server.enqueue(MockResponse().setResponseCode(404))
            server.enqueue(MockResponse().setResponseCode(429))
            server.enqueue(MockResponse().setResponseCode(503))
            assertTrue(api.find(code) is ProductLookup.Found)
            val request = server.takeRequest()
            assertTrue(request.path.orEmpty().startsWith("/api/v3/product/$code?fields="))
            assertEquals("SlimCoach/test", request.getHeader("User-Agent"))
            assertEquals(ProductLookup.Missing, api.find(code))
            assertEquals(ProductLookup.Limited, api.find(code))
            assertEquals(ProductLookup.Unavailable, api.find(code))
        }
        assertEquals(ProductLookup.Network, api.find(code))
    }
}
