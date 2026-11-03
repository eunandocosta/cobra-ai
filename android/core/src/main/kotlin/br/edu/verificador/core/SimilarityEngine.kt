package br.edu.verificador.core

/**
 * Compara textos por k-gramas de palavras (shingles).
 *
 * Para cada posição do texto analisado verifica se ela faz parte de algum
 * k-grama que também existe na fonte. O percentual é a fração de palavras
 * cobertas por trechos idênticos (sequências de k palavras normalizadas).
 */
class SimilarityEngine(val k: Int = DEFAULT_K) {

    init {
        require(k >= 2) { "k deve ser >= 2" }
    }

    /** Conjunto de k-gramas presentes na lista de tokens. */
    fun grams(tokens: List<Token>): Set<String> {
        if (tokens.size < k) return emptySet()
        val result = HashSet<String>(tokens.size)
        for (i in 0..tokens.size - k) {
            result.add(gramAt(tokens, i))
        }
        return result
    }

    /** Para cada token, indica se ele está coberto por algum k-grama da fonte. */
    fun coveredMask(tokens: List<Token>, sourceGrams: Set<String>): BooleanArray {
        val mask = BooleanArray(tokens.size)
        if (tokens.size < k || sourceGrams.isEmpty()) return mask
        for (i in 0..tokens.size - k) {
            if (gramAt(tokens, i) in sourceGrams) {
                for (j in i until i + k) mask[j] = true
            }
        }
        return mask
    }

    /** Converte a máscara em trechos contínuos no texto original. */
    fun spansOf(tokens: List<Token>, mask: BooleanArray): List<Span> {
        val spans = mutableListOf<Span>()
        var runStart = -1
        for (i in tokens.indices) {
            if (mask[i] && runStart == -1) {
                runStart = i
            } else if (!mask[i] && runStart != -1) {
                spans.add(Span(tokens[runStart].start, tokens[i - 1].end))
                runStart = -1
            }
        }
        if (runStart != -1) spans.add(Span(tokens[runStart].start, tokens[tokens.size - 1].end))
        return spans
    }

    /** Percentual (0 a 100) de palavras cobertas. */
    fun percent(mask: BooleanArray): Double {
        if (mask.isEmpty()) return 0.0
        return mask.count { it } * 100.0 / mask.size
    }

    private fun gramAt(tokens: List<Token>, start: Int): String {
        val sb = StringBuilder()
        for (j in start until start + k) {
            if (j > start) sb.append(' ')
            sb.append(tokens[j].norm)
        }
        return sb.toString()
    }

    companion object {
        /** 6 palavras consecutivas iguais já caracterizam cópia, com pouco falso positivo. */
        const val DEFAULT_K = 6
    }
}
