package br.edu.verificador.data

import br.edu.verificador.core.PageFetcher
import br.edu.verificador.core.SearchProvider
import br.edu.verificador.core.SearchResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.jsoup.Jsoup
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

private const val USER_AGENT = "VerificadorAcademico/1.0 (uso academico)"
private const val TIMEOUT_MS = 15_000

/**
 * Busca usando a Google Programmable Search (API oficial, com chave do próprio usuário).
 * Não faz raspagem de páginas de resultados do Google.
 */
class GoogleSearchProvider(
    private val apiKey: String,
    private val engineId: String,
) : SearchProvider {

    override suspend fun search(query: String, limit: Int): List<SearchResult> {
        val url = "https://www.googleapis.com/customsearch/v1" +
            "?key=${enc(apiKey)}&cx=${enc(engineId)}&num=${limit.coerceIn(1, 10)}&q=${enc(query)}"
        val body = httpGet(url) ?: return emptyList()
        val items = JSONObject(body).optJSONArray("items") ?: return emptyList()
        return (0 until items.length()).map { i ->
            val item = items.getJSONObject(i)
            SearchResult(item.getString("link"), item.optString("title", item.getString("link")))
        }
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}

/** Baixa a página e extrai somente o texto visível. */
class WebPageFetcher : PageFetcher {
    override suspend fun fetchText(url: String): String? {
        val html = httpGet(url) ?: return null
        val doc = Jsoup.parse(html, url)
        doc.select("script, style, noscript, nav, header, footer, aside, form").remove()
        return doc.body()?.text()?.takeIf { it.isNotBlank() }
    }
}

/** GET simples com timeout. Retorna null em qualquer falha de rede. */
internal suspend fun httpGet(address: String): String? = withContext(Dispatchers.IO) {
    try {
        val conn = URL(address).openConnection() as HttpURLConnection
        conn.connectTimeout = TIMEOUT_MS
        conn.readTimeout = TIMEOUT_MS
        conn.setRequestProperty("User-Agent", USER_AGENT)
        conn.instanceFollowRedirects = true
        try {
            if (conn.responseCode in 200..299) conn.inputStream.bufferedReader().use { it.readText() } else null
        } finally {
            conn.disconnect()
        }
    } catch (e: Exception) {
        null
    }
}
