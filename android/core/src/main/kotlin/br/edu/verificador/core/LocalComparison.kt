package br.edu.verificador.core

/** Resultado da comparação direta entre dois documentos locais. */
data class LocalComparison(
    val percentOfAInB: Double,
    val percentOfBInA: Double,
    val spansInA: List<Span>,
    val spansInB: List<Span>,
)

/**
 * Compara dois textos entre si (sem internet).
 * "percentOfAInB" = porcentagem das palavras de A que também aparecem em B.
 */
class LocalComparator(private val engine: SimilarityEngine = SimilarityEngine()) {

    fun compare(a: String, b: String): LocalComparison {
        val tokensA = Tokenizer.tokenize(a)
        val tokensB = Tokenizer.tokenize(b)
        val gramsA = engine.grams(tokensA)
        val gramsB = engine.grams(tokensB)
        val maskA = engine.coveredMask(tokensA, gramsB)
        val maskB = engine.coveredMask(tokensB, gramsA)
        return LocalComparison(
            percentOfAInB = engine.percent(maskA),
            percentOfBInA = engine.percent(maskB),
            spansInA = engine.spansOf(tokensA, maskA),
            spansInB = engine.spansOf(tokensB, maskB),
        )
    }
}
