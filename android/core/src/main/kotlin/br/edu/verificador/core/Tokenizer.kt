package br.edu.verificador.core

import java.text.Normalizer

/** Palavra normalizada com a posição original no texto (offsets de caractere). */
data class Token(val norm: String, val start: Int, val end: Int)

/** Intervalo de caracteres no texto original. */
data class Span(val start: Int, val end: Int)

object Tokenizer {
    private val wordRegex = Regex("[\\p{L}\\p{N}]+")
    private val diacritics = Regex("\\p{M}+")

    fun tokenize(text: String): List<Token> =
        wordRegex.findAll(text)
            .map { Token(normalizeWord(it.value), it.range.first, it.range.last + 1) }
            .filter { it.norm.isNotEmpty() }
            .toList()

    /** Minúsculas e sem acentos: "Açúcar" -> "acucar". */
    fun normalizeWord(word: String): String =
        Normalizer.normalize(word.lowercase(), Normalizer.Form.NFD).replace(diacritics, "")

    /** Divide em sentenças (pontuação final, ponto e vírgula ou parágrafo). */
    fun sentences(text: String): List<String> =
        text.split(Regex("(?<=[.!?;])\\s+|\\n\\s*\\n"))
            .map { it.trim() }
            .filter { it.isNotEmpty() }
}
