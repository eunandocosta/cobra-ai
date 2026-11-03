const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const R = require('../web/academic-report-renderer');
const { normalizeReportMarkdownForPrint } = require('../src/modules/relatorios/relatorios.service');

console.log('🧪 Iniciando testes de tabelas dos relatórios...');
const tableCount = html => (html.match(/<table class="academic-report-table"/g) || []).length;
const strayPipes = html => /\|/.test(html.replace(/<table[\s\S]*?<\/table>/g, '').replace(/<[^>]+>/g, ''));

// Formatos que a IA produz e que antes viravam lista ou texto com barras soltas.
const formats = {
  'quatro colunas': '| Fármaco | Classe | Mecanismo | Efeito adverso |\n| --- | --- | --- | --- |\n| Enalapril | IECA | Inibe a ECA | Tosse seca |',
  'células de ~20 palavras': `| Fase | O que ocorre | Achado |\n| --- | --- | --- |\n| Inflamação | ${'vasodilatação e permeabilidade aumentada '.repeat(5)}| Edema |`,
  '<br> na célula': '| Doença | Sinais |\n| --- | --- |\n| Asma | Sibilos<br>Dispneia |\n| DPOC | Tosse<br/>Expectoração |',
  'sem barras nas pontas': 'Estrutura | Função\n--- | ---\nMitocôndria | Produção de ATP',
  'linha com célula a menos': '| Vitamina | Fonte | Deficiência |\n| --- | --- | --- |\n| A | Fígado | Cegueira noturna |\n| C | Frutas |',
  'separador com um traço': '| Exame | Valor |\n|-|-|\n| Sódio | 135–145 mEq/L |',
  'alinhamento': '| Classe | Exemplo |\n|:---|---:|\n| Betabloqueador | Metoprolol |',
  'colada no parágrafo': 'Veja abaixo:\n| Achado | Significado |\n| --- | --- |\n| Febre | Inflamação |',
  'tabela HTML sem <th>': '<table><tr><td>Órgão</td><td>Função</td></tr><tr><td>Fígado</td><td>Metabolismo</td></tr></table>'
};
for (const [label, markdown] of Object.entries(formats)) {
  const html = R.render(markdown);
  assert.equal(tableCount(html), 1, `${label}: deve virar tabela\n${html}`);
  assert.ok(!strayPipes(html), `${label}: não pode sobrar "|" no texto\n${html}`);
}
console.log('  [PASS] Nove formatos comuns de tabela saem como tabela, sem barras soltas');

const brHtml = R.render(formats['<br> na célula']);
assert.match(brHtml, /<td>Sibilos<br>Dispneia<\/td>/);
assert.match(brHtml, /<td>Tosse<br>Expectoração<\/td>/);
assert.match(R.normalize(formats['<br> na célula']), /\| Asma \| Sibilos<br>Dispneia \|/, 'o Markdown salvo preserva a quebra na célula');
const shortRow = R.render(formats['linha com célula a menos']);
assert.match(shortRow, /<td>C<\/td><td>Frutas<\/td><td><\/td>/, 'célula que falta vira célula vazia');
assert.match(R.render('| A | B |\n| --- | --- |\n| y | z | sobra |'), /<td>z \/ sobra<\/td>/, 'célula que sobra vai para a última coluna');
assert.match(R.render('| Escala | Pontos |\n| --- | --- |\n| Glasgow \\| ocular | 1–4 |'), /<td>Glasgow \| ocular<\/td>/, 'barra escapada fica dentro da célula');
console.log('  [PASS] Quebras de linha, células faltando/sobrando e barras escapadas');

const widths = [...R.render(formats['quatro colunas']).matchAll(/<col style="width:([\d.]+)%">/g)].map(match => Number(match[1]));
assert.equal(widths.length, 4);
assert.ok(Math.abs(widths.reduce((sum, value) => sum + value, 0) - 100) < 1, `larguras somam 100%: ${widths}`);
const classWidths = [...R.render('| Classe | Mecanismo |\n| --- | --- |\n| Betabloqueador | Reduz a frequência cardíaca e a contratilidade do miocárdio ao bloquear receptores beta-1 |').matchAll(/width:([\d.]+)%/g)].map(match => Number(match[1]));
assert.ok(classWidths[1] > classWidths[0], 'coluna com mais texto fica mais larga');
assert.ok(classWidths[0] >= (14 * 4.8 + 14) / 453 * 100 - 0.1, 'coluna cabe a palavra mais longa ("Betabloqueador")');
console.log('  [PASS] Larguras de coluna proporcionais ao conteúdo');

const unsafe = R.render('| Campo | Valor |\n| --- | --- |\n| <img src=x onerror=alert(1)> | <br onclick=alert(1)>ok |\n| <script>alert(2)</script> | a |');
assert.doesNotMatch(unsafe, /<img|<script|onclick=|onerror=/i, 'HTML de célula nunca é executado');
assert.equal(tableCount(R.render('| A | B | C | D | E | F |\n| - | - | - | - | - | - |\n| 1 | 2 | 3 | 4 | 5 | 6 |')), 0, '6 colunas não cabem em A4: vira lista rotulada');
assert.match(R.render(`| Termo | Explicação |\n| --- | --- |\n| A | ${'descrição muito longa '.repeat(25)} |`), /<strong>Explicação:<\/strong> descrição muito longa/, 'célula enorme vira lista rotulada');
assert.equal(tableCount(R.render('A relação PaO2|FiO2 avalia a oxigenação.')), 0, 'barra no meio do texto não é tabela');
assert.match(R.render('Título\n---\nTexto.'), /<p class="academic-report-paragraph">Título<\/p>\s*<p class="academic-report-paragraph">Texto\.<\/p>/, 'linha horizontal não é colada no parágrafo');
console.log('  [PASS] Segurança, tabelas largas demais e textos com barra');

const server = normalizeReportMarkdownForPrint('| Escala | Uso (exemplo |\n| --- | --- |\n| Glasgow (ocular | 1 a 4 (pontos. |\n| Custo | R$ 20,00 |\n\nParágrafo (aberto.');
assert.match(server, /\| Escala \| Uso \(exemplo\) \|/);
assert.match(server, /\| Glasgow \(ocular\) \| 1 a 4 \(pontos\)\. \|/);
assert.match(server, /\| Custo \| R\$ 20,00 \|\n/, 'nada de ")))" depois da última linha da tabela');
assert.match(server, /Parágrafo \(aberto\)\./);
console.log('  [PASS] Servidor fecha parênteses célula a célula, sem quebrar a tabela');

const styles = readFileSync(require.resolve('../web/styles.css'), 'utf8');
const app = readFileSync(require.resolve('../web/app.js'), 'utf8');
const service = readFileSync(require.resolve('../src/modules/relatorios/relatorios.service.js'), 'utf8');
assert.match(styles, /#readerModal \.academic-article-container \.academic-report-table td,[\s\S]*?font-size: 9\.5pt !important;[\s\S]*?overflow-wrap: break-word !important;/, 'impressão: tabela do relatório vence as regras genéricas');
assert.match(styles, /\.academic-report-table thead \{ display: table-header-group !important; \}/, 'cabeçalho repete em cada página');
assert.match(styles, /\.academic-report-table tr \{ break-inside: avoid !important;/, 'linha da tabela não se parte entre páginas');
assert.match(app, /<div class="academic-article-container">\$\{window\.AcademicReportRenderer\.render\(result\.markdown/, 'revisão da disciplina usa o estilo do relatório');
assert.match(service, /Formato obrigatório de tabela em Markdown/, 'o pedido à IA descreve o formato exato da tabela');
console.log('  [PASS] Impressão, revisão da disciplina e pedido à IA');
console.log('🎉 Testes de tabelas dos relatórios concluídos!\n');
