package br.edu.verificador.data

import android.content.Context

/**
 * Configurações guardadas localmente no aparelho.
 * A chave de API fica só no aparelho e nunca é enviada a terceiros além do Google.
 */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("verificador", Context.MODE_PRIVATE)

    var apiKey: String
        get() = prefs.getString(KEY_API, "") ?: ""
        set(value) { prefs.edit().putString(KEY_API, value.trim()).apply() }

    var searchEngineId: String
        get() = prefs.getString(KEY_CX, "") ?: ""
        set(value) { prefs.edit().putString(KEY_CX, value.trim()).apply() }

    val isSearchConfigured: Boolean
        get() = apiKey.isNotBlank() && searchEngineId.isNotBlank()

    companion object {
        private const val KEY_API = "google_api_key"
        private const val KEY_CX = "google_cx"
    }
}
