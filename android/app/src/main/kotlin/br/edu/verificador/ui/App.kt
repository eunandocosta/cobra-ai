package br.edu.verificador.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Compare
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.edu.verificador.core.CheckReport
import br.edu.verificador.core.LocalComparator
import br.edu.verificador.core.LocalComparison
import br.edu.verificador.core.PlagiarismChecker
import br.edu.verificador.core.ReportFormatter
import br.edu.verificador.core.Span
import br.edu.verificador.data.GoogleSearchProvider
import br.edu.verificador.data.Settings
import br.edu.verificador.data.WebPageFetcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.runtime.rememberCoroutineScope

private val HIGHLIGHT = Color(0xFFFFD54F)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(settings: Settings) {
    var tab by remember { mutableIntStateOf(0) }
    Scaffold(
        topBar = { TopAppBar(title = { Text("Verificador Acadêmico") }) },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0, onClick = { tab = 0 },
                    icon = { Icon(Icons.Default.Search, null) }, label = { Text("Verificar") },
                )
                NavigationBarItem(
                    selected = tab == 1, onClick = { tab = 1 },
                    icon = { Icon(Icons.Default.Compare, null) }, label = { Text("Comparar") },
                )
                NavigationBarItem(
                    selected = tab == 2, onClick = { tab = 2 },
                    icon = { Icon(Icons.Default.Settings, null) }, label = { Text("Ajustes") },
                )
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                0 -> VerifyScreen(settings)
                1 -> CompareScreen()
                else -> SettingsScreen(settings)
            }
        }
    }
}

@Composable
private fun VerifyScreen(settings: Settings) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var report by remember { mutableStateOf<CheckReport?>(null) }

    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            text = try {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: ""
            } catch (e: Exception) {
                error = "Não foi possível ler o arquivo. Use arquivos .txt."
                ""
            }
        }
    }

    val current = report
    if (current != null) {
        ResultScreen(current, onBack = { report = null })
        return
    }

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Cole o texto do trabalho ou abra um arquivo .txt. O aplicativo pesquisa trechos na web e mostra as coincidências.")
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.fillMaxWidth().height(260.dp),
            placeholder = { Text("Texto a verificar") },
            enabled = !busy,
        )
        OutlinedButton(onClick = { pickFile.launch(arrayOf("text/plain")) }, enabled = !busy) {
            Text("Abrir arquivo .txt")
        }
        Button(
            enabled = !busy && text.isNotBlank(),
            onClick = {
                error = null
                if (!settings.isSearchConfigured) {
                    error = "Configure a chave de API e o ID do mecanismo de busca em Ajustes."
                    return@Button
                }
                busy = true
                scope.launch {
                    try {
                        val checker = PlagiarismChecker(
                            search = GoogleSearchProvider(settings.apiKey, settings.searchEngineId),
                            fetcher = WebPageFetcher(),
                        )
                        val snapshot = text
                        report = withContext(Dispatchers.Default) {
                            checker.check(snapshot) { progress = it }
                        }
                    } catch (e: Exception) {
                        error = "Falha na verificação: ${e.message ?: "erro desconhecido"}"
                    } finally {
                        busy = false
                    }
                }
            },
        ) { Text("Verificar semelhança") }

        if (busy) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CircularProgressIndicator(modifier = Modifier.height(24.dp))
                Text(progress.ifBlank { "Iniciando..." })
            }
        }
        error?.let { Text(it, color = androidx.compose.material3.MaterialTheme.colorScheme.error) }
    }
}

@Composable
private fun ResultScreen(report: CheckReport, onBack: () -> Unit) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Semelhança geral: ${"%.1f".format(report.percent)}%", fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(
            "Frases pesquisadas: ${report.queriesRun} · Fontes analisadas: ${report.sourcesAnalyzed}",
            fontSize = 13.sp,
        )
        HorizontalDivider()
        Text("Texto com trechos coincidentes destacados", fontWeight = FontWeight.SemiBold)
        Text(highlight(report.document, report.spans))

        HorizontalDivider()
        Text("Fontes encontradas (${report.hits.size})", fontWeight = FontWeight.SemiBold)
        if (report.hits.isEmpty()) Text("Nenhuma coincidência encontrada na web.")
        report.hits.forEach { hit ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("${"%.1f".format(hit.percent)}% · ${hit.title}", fontWeight = FontWeight.SemiBold)
                    Text(hit.url, fontSize = 12.sp)
                    TextButton(onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(hit.url)))
                    }) { Text("Abrir fonte") }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { shareReport(context, report) }) { Text("Compartilhar relatório") }
            OutlinedButton(onClick = onBack) { Text("Nova verificação") }
        }
    }
}

@Composable
private fun CompareScreen() {
    var a by remember { mutableStateOf("") }
    var b by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<LocalComparison?>(null) }
    val comparator = remember { LocalComparator() }

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Compara dois textos entre si, sem usar a internet (ex.: seu trabalho e o de um colega).")
        OutlinedTextField(a, { a = it; result = null }, Modifier.fillMaxWidth().height(160.dp), placeholder = { Text("Documento A") })
        OutlinedTextField(b, { b = it; result = null }, Modifier.fillMaxWidth().height(160.dp), placeholder = { Text("Documento B") })
        Button(enabled = a.isNotBlank() && b.isNotBlank(), onClick = { result = comparator.compare(a, b) }) {
            Text("Comparar")
        }
        result?.let { r ->
            Text("A em B: ${"%.1f".format(r.percentOfAInB)}% das palavras de A aparecem em B", fontWeight = FontWeight.SemiBold)
            Text(highlight(a, r.spansInA))
            Text("B em A: ${"%.1f".format(r.percentOfBInA)}% das palavras de B aparecem em A", fontWeight = FontWeight.SemiBold)
            Text(highlight(b, r.spansInB))
        }
    }
}

@Composable
private fun SettingsScreen(settings: Settings) {
    var apiKey by remember { mutableStateOf(settings.apiKey) }
    var cx by remember { mutableStateOf(settings.searchEngineId) }
    var saved by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "A busca na web usa a Google Programmable Search (API oficial). Crie uma chave de API " +
                "e um mecanismo de busca gratuitos no Google Cloud e no painel do Programmable Search, " +
                "e informe os dois valores abaixo. Eles ficam somente neste aparelho."
        )
        OutlinedTextField(apiKey, { apiKey = it; saved = false }, Modifier.fillMaxWidth(),
            label = { Text("Chave de API") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
        OutlinedTextField(cx, { cx = it; saved = false }, Modifier.fillMaxWidth(),
            label = { Text("ID do mecanismo de busca (cx)") }, singleLine = true)
        Button(onClick = {
            settings.apiKey = apiKey
            settings.searchEngineId = cx
            saved = true
        }) { Text("Salvar") }
        if (saved) Text("Configurações salvas.")
        Text(
            "Uso acadêmico: verifique os direitos de uso das fontes e cite corretamente os trechos " +
                "reproduzidos. O percentual indica coincidência textual, não prova de plágio.",
            fontSize = 12.sp,
        )
    }
}

/** Texto com os trechos indicados em destaque. */
private fun highlight(text: String, spans: List<Span>): AnnotatedString = buildAnnotatedString {
    append(text)
    spans.forEach { addStyle(SpanStyle(background = HIGHLIGHT, fontWeight = FontWeight.SemiBold), it.start, it.end) }
}

private fun shareReport(context: Context, report: CheckReport) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, "Relatório de verificação de semelhança")
        putExtra(Intent.EXTRA_TEXT, ReportFormatter.toPlainText(report))
    }
    context.startActivity(Intent.createChooser(intent, "Compartilhar relatório"))
}
