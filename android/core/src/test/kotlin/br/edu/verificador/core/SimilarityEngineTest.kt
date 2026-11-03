package br.edu.verificador.core

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SimilarityEngineTest {

    private val engine = SimilarityEngine(k = 4)

    @Test
    fun normalizaAcentosEPontuacao() {
        val tokens = Tokenizer.tokenize("Açúcar, É bom!")
        assertEquals(listOf("acucar", "e", "bom"), tokens.map { it.norm })
    }

    @Test
    fun textoIdenticoTemCoberturaTotal() {
        val text = "a fotossíntese converte luz solar em energia química nas plantas"
        val result = LocalComparator(engine).compare(text, text)
        assertEquals(100.0, result.percentOfAInB, 0.001)
        assertEquals(100.0, result.percentOfBInA, 0.001)
    }

    @Test
    fun textoSemRelacaoTemCoberturaZero() {
        val result = LocalComparator(engine).compare(
            "o mitocôndria produz trifosfato de adenosina",
            "rios amazônicos abrigam espécies raras de peixes"
        )
        assertEquals(0.0, result.percentOfAInB, 0.001)
    }

    @Test
    fun trechoCopiadoAparecePreciso() {
        val source = "Estudos recentes mostram que o exercício regular reduz o risco cardiovascular em adultos."
        val doc = "Segundo a literatura, o exercício regular reduz o risco cardiovascular em adultos, " +
            "e isso já foi discutido por muitos autores diferentes."
        val tokens = Tokenizer.tokenize(doc)
        val mask = engine.coveredMask(tokens, engine.grams(Tokenizer.tokenize(source)))
        val spans = engine.spansOf(tokens, mask)

        assertEquals(1, spans.size)
        val copied = doc.substring(spans[0].start, spans[0].end)
        assertEquals("o exercício regular reduz o risco cardiovascular em adultos", copied.replace(",", ""))
    }

    @Test
    fun pickQueriesIgnoraFrasesCurtas() {
        val checker = PlagiarismChecker(NoSearch, NoFetch, engine = engine, minWordsPerSentence = 5)
        val queries = checker.pickQueries("Oi. Esta frase tem bastante coisa para ser pesquisada aqui.")
        assertEquals(1, queries.size)
        assertTrue(queries[0].startsWith("\"Esta frase"))
    }

    @Test
    fun checkAgregaFontesEPercentual() = runBlocking {
        val doc = "A fotossíntese converte energia luminosa em energia química armazenada nas plantas verdes. " +
            "Esse processo ocorre nos cloroplastos das células vegetais durante o dia."
        val page = "Resumo: A fotossíntese converte energia luminosa em energia química armazenada nas plantas verdes."
        val search = object : SearchProvider {
            override suspend fun search(query: String, limit: Int) =
                listOf(SearchResult("https://exemplo.org/a", "Exemplo"))
        }
        val fetcher = object : PageFetcher {
            override suspend fun fetchText(url: String) = page
        }
        val report = PlagiarismChecker(search, fetcher, engine = engine, clock = { 0L }).check(doc)

        assertEquals(1, report.hits.size)
        assertTrue(report.percent > 0.0 && report.percent < 100.0)
        assertEquals(report.hits[0].percent, report.percent, 0.001)
    }

    private object NoSearch : SearchProvider {
        override suspend fun search(query: String, limit: Int) = emptyList<SearchResult>()
    }

    private object NoFetch : PageFetcher {
        override suspend fun fetchText(url: String): String? = null
    }
}
