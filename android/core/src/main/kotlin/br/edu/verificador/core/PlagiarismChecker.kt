package br.edu.verificador.core

/** Resultado de busca: um endereço encontrado para uma frase. */
data class SearchResult(val url: String, val title: String)

/** Busca na web (implementação concreta fica na camada Android). */
interface SearchProvider {
    suspend fun search(query: String, limit: Int): List<SearchResult>
}

/** Baixa o texto puro de uma página. Retorna null se não for possível. */
interface PageFetcher {
    suspend fun fetchText(url: String): String?
}

/** Trecho de uma fonte encontrada na internet. */
data class SourceHit(
    val url: String,
    val title: String,
    val percent: Double,
    val spans: List<Span>,
)

/** Relatório completo de uma verificação. */
data class CheckReport(
    val document: String,
    val percent: Double,
    val spans: List<Span>,
    val hits: List<SourceHit>,
    val queriesRun: Int,
    val sourcesAnalyzed: Int,
    val generatedAt: Long,
)

/**
 * Fluxo da verificação:
 * 1. escolhe frases representativas do documento;
 * 2. pesquisa cada frase entre aspas na web;
 * 3. baixa as páginas encontradas e extrai o texto;
 * 4. calcula quais palavras do documento aparecem em cada fonte.
 */
class PlagiarismChecker(
    private val search: SearchProvider,
    private val fetcher: PageFetcher,
    private val engine: SimilarityEngine = SimilarityEngine(),
    private val maxQueries: Int = 8,
    private val resultsPerQuery: Int = 5,
    private val maxSources: Int = 15,
    private val minWordsPerSentence: Int = 8,
    private val clock: () -> Long = { System.currentTimeMillis() },
) {

    suspend fun check(document: String, onProgress: (String) -> Unit = {}): CheckReport {
        val tokens = Tokenizer.tokenize(document)
        val queries = pickQueries(document)

        // 1. Coleta de URLs candidatas (sem repetição, preservando a ordem)
        val candidates = LinkedHashMap<String, String>()
        queries.forEachIndexed { i, q ->
            onProgress("Pesquisando frase ${i + 1} de ${queries.size}")
            search.search(q, resultsPerQuery).forEach { r ->
                if (candidates.size < maxSources) candidates.putIfAbsent(r.url, r.title)
            }
        }

        // 2. Comparação com cada página
        val union = BooleanArray(tokens.size)
        val hits = mutableListOf<SourceHit>()
        var analyzed = 0
        candidates.entries.forEachIndexed { i, (url, title) ->
            onProgress("Analisando fonte ${i + 1} de ${candidates.size}")
            val text = fetcher.fetchText(url) ?: return@forEachIndexed
            analyzed++
            val mask = engine.coveredMask(tokens, engine.grams(Tokenizer.tokenize(text)))
            if (mask.any { it }) {
                for (j in mask.indices) if (mask[j]) union[j] = true
                hits.add(
                    SourceHit(
                        url = url,
                        title = title,
                        percent = engine.percent(mask),
                        spans = engine.spansOf(tokens, mask),
                    )
                )
            }
        }

        return CheckReport(
            document = document,
            percent = engine.percent(union),
            spans = engine.spansOf(tokens, union),
            hits = hits.sortedByDescending { it.percent },
            queriesRun = queries.size,
            sourcesAnalyzed = analyzed,
            generatedAt = clock(),
        )
    }

    /**
     * Escolhe até [maxQueries] frases com pelo menos [minWordsPerSentence] palavras,
     * espaçadas ao longo do documento, e as envolve em aspas para busca exata.
     */
    fun pickQueries(document: String): List<String> {
        val candidates = Tokenizer.sentences(document)
            .filter { Tokenizer.tokenize(it).size >= minWordsPerSentence }
        if (candidates.isEmpty()) return emptyList()
        val chosen = if (candidates.size <= maxQueries) {
            candidates
        } else {
            val step = candidates.size.toDouble() / maxQueries
            (0 until maxQueries).map { candidates[(it * step).toInt()] }
        }
        return chosen.map { sentence ->
            val words = sentence.split(Regex("\\s+")).take(MAX_QUERY_WORDS)
            "\"" + words.joinToString(" ") + "\""
        }
    }

    companion object {
        const val MAX_QUERY_WORDS = 12
    }
}

/** Relatório de texto simples para compartilhar ou salvar. */
object ReportFormatter {
    fun toPlainText(report: CheckReport): String = buildString {
        appendLine("RELATÓRIO DE VERIFICAÇÃO DE SEMELHANÇA")
        appendLine("Gerado em: ${java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.Builder().setLanguage("pt").setRegion("BR").build()).format(java.util.Date(report.generatedAt))}")
        appendLine("Frases pesquisadas: ${report.queriesRun}")
        appendLine("Fontes analisadas: ${report.sourcesAnalyzed}")
        appendLine("Semelhança geral: ${"%.1f".format(report.percent)}%")
        appendLine()
        appendLine("FONTES ENCONTRADAS (${report.hits.size})")
        if (report.hits.isEmpty()) appendLine("Nenhuma coincidência encontrada.")
        report.hits.forEachIndexed { i, h ->
            appendLine("${i + 1}. ${"%.1f".format(h.percent)}% - ${h.title}")
            appendLine("   ${h.url}")
        }
        appendLine()
        appendLine(
            "Aviso: o percentual indica apenas coincidência textual. Trechos citados " +
                "corretamente (com aspas e referência) não configuram plágio. A análise " +
                "final cabe ao professor ou à banca."
        )
    }
}
