const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const {
  normalizeGeneratedStructuralHtml,
  normalizeReportTextArtifacts,
  normalizeReportMarkdownForPrint
} = require('../src/modules/relatorios/relatorios.service');
const AcademicReportRenderer = require('../web/academic-report-renderer');

const generated = String.raw`\<h4 class="gemini-h4">2. Via Dependente de TRIF (<em>TIR-domain-containing adapter-inducing interferon-β</em>)</h4>
\<ul class="gemini-ul">\<li>\<strong>Receptores envolvidos:</strong> TLR3 e TLR4.</li>\<li>\<strong>Cascata:</strong> O adaptador TRIF recruta TBK1.</li>\</ul>
\<ol><li>Primeiro</li><li>Segundo</li></ol>
`;
const normalized = normalizeGeneratedStructuralHtml(generated);

assert.match(normalized, /\n#### 2\. Via Dependente de TRIF/);
assert.match(normalized, /- <strong>Receptores envolvidos:<\/strong> TLR3 e TLR4\./);
assert.match(normalized, /- <strong>Cascata:<\/strong> O adaptador TRIF recruta TBK1\./);
assert.match(normalized, /1\. Primeiro[\s\S]*2\. Segundo/);
assert.doesNotMatch(normalized, /<\/?(?:h4|ul|ol|li)\b/i);
assert.match(normalized, /<em>TIR-domain-containing adapter-inducing interferon-β<\/em>/);

const doubleEscaped = String.raw`\\<h4>2. Via com escape duplo
&lt;ul class=&quot;gemini-ul&quot;&gt;&lt;li&gt;Primeiro item&lt;/li&gt;&lt;li&gt;Segundo item&lt;/li&gt;&lt;/ul&gt;
<h3>Seção sem fechamento`;
const normalizedEscaped = normalizeGeneratedStructuralHtml(doubleEscaped);
assert.match(normalizedEscaped, /#### 2\. Via com escape duplo/);
assert.match(normalizedEscaped, /- Primeiro item[\s\S]*- Segundo item/);
assert.match(normalizedEscaped, /### Seção sem fechamento/);
assert.doesNotMatch(normalizedEscaped, /&lt;\/?(?:h[1-6]|ul|ol|li)\b|<\/?(?:h[1-6]|ul|ol|li)\b/i);

const codeSample = '```html\n<h4>Não converter dentro do código</h4>\n<ul><li>Exemplo</li></ul>\n```';
assert.equal(normalizeGeneratedStructuralHtml(codeSample), codeSample);

const clinicalValues = normalizeReportTextArtifacts(
  'Temperatura de $39,2°C; pressão de $90× 55 mmHg; lactato de $4,2 mmol/L$.'
);
assert.equal(clinicalValues, 'Temperatura de 39,2°C; pressão de 90× 55 mmHg; lactato de 4,2 mmol/L.');

const currencyText = normalizeReportTextArtifacts('Custo estimado: R$ 20,00 (aproximadamente $100).');
assert.equal(currencyText, 'Custo estimado: R$ 20,00 (aproximadamente $100).');

const incompleteParenthesis = normalizeReportTextArtifacts(
  'A resposta envolve reconhecimento de estruturas (incluindo TLR3 e TLR4.\n\nSegundo parágrafo sem alterações.'
);
assert.equal(incompleteParenthesis, 'A resposta envolve reconhecimento de estruturas (incluindo TLR3 e TLR4).\n\nSegundo parágrafo sem alterações.');

const untouchedCode = 'Exemplo `custo $10 (valor)` e bloco:\n\n```txt\n$39,2°C (sem alteração\n```';
assert.equal(normalizeReportTextArtifacts(untouchedCode), untouchedCode);

const reportMarkdown = String.raw`## 1 INTRODUÇÃO
Texto de relatório que continua
na linha seguinte sem depender de br.

### 1.1 Organização
- Primeiro elemento
  - Subalínea descritiva
- Segundo elemento

## 2 COMPARAÇÃO
| Estrutura | Região | Função |
| --- | --- | --- |
| TLR3 | Endossomo | Reconhece RNA viral |
| TLR4 | Membrana | Reconhece componentes bacterianos |

| Campo extenso | Explicação |
| --- | --- |
| A | ${'descrição muito longa '.repeat(12)} |

\<h4 class="gemini-h4">2.1.1 Via TRIF (<em>interna</em>)</h4>
\<ul><li><strong>Receptores:</strong> TLR3 e TLR4.</li></ul>
Conclusão A → conclusão B.
\<script>alert(1)</script>

![Figura](https://storage.example.org/material/figura.png)`;
const reportHtml = AcademicReportRenderer.render(reportMarkdown, { allowedImageUrls: ['https://storage.example.org/material/figura.png'] });
const reportNormalized = AcademicReportRenderer.normalize(reportMarkdown);
const serverNormalizedReport = normalizeReportMarkdownForPrint(reportMarkdown);
assert.match(reportHtml, /class="academic-report-heading report-heading-primary">1 INTRODUÇÃO<\/h2>/);
assert.match(reportHtml, /Texto de relatório que continua na linha seguinte sem depender de br\./);
assert.match(reportHtml, /class="academic-report-list report-list-alineas"/);
assert.match(reportHtml, /report-list-subalineas/);
assert.match(reportHtml, /report-list-subalineas"><li>Subalínea descritiva<\/li>/);
assert.match(reportHtml, /class="academic-report-table"/);
assert.match(reportNormalized, /\*\*Explicação:\*\* descrição muito longa/);
assert.match(serverNormalizedReport, /\*\*Explicação:\*\* descrição muito longa/);
assert.match(reportHtml, /2\.1\.1 Via TRIF \(<em>interna<\/em>\)/);
assert.match(reportHtml, /TLR3 e TLR4/);
assert.match(reportHtml, /Conclusão A leva a conclusão B\./);
assert.match(reportHtml, /<figure class="academic-report-figure"><img src="https:\/\/storage\.example\.org\/material\/figura\.png"/);
assert.doesNotMatch(AcademicReportRenderer.render(reportMarkdown, { allowedImageUrls: [] }), /<figure class="academic-report-figure"/);
assert.doesNotMatch(reportHtml, /<h4 class="gemini-h4"|<ul><li>|<script|graph TD|<br\b/i);

const sourceFileTitle = 'ORGANIZAÇÃO MORFOFUNCIONAL DO SISTEMA IMUNOLÓGICO OK 2 - ARTIGO CIENTÍFICO & TRATADO ACADÊMICO DE MEDICINA.pdf';
const reportWithEditorialTitle = `# Organização e função do sistema imunológico\n\nDisciplina: Imunologia\n\n## 1 INTRODUÇÃO\nTexto introdutório.\n\n## 2 Organização morfofuncional do sistema imune\nO sistema imune é formado por órgãos linfoides e células especializadas.`;
assert.equal(
  AcademicReportRenderer.extractReportTitle(reportWithEditorialTitle, sourceFileTitle, 'Imunologia'),
  'Organização e função do sistema imunológico'
);
assert.equal(
  AcademicReportRenderer.extractReportTitle(`# ${sourceFileTitle}\n\n## 1 INTRODUÇÃO\nTexto introdutório.\n\n## 2 Arquitetura dos órgãos linfoides e circulação celular\nDescrição.`, sourceFileTitle, 'Imunologia'),
  'Arquitetura dos órgãos linfoides e circulação celular'
);
assert.doesNotMatch(
  AcademicReportRenderer.extractReportTitle('A composição dos órgãos linfoides determina como as células imunes encontram antígenos.', sourceFileTitle, 'Imunologia'),
  /ORGANIZAÇÃO MORFOFUNCIONAL|ARTIGO CIENTÍFICO|\.pdf/i
);

const reportStyles = readFileSync(require.resolve('../web/styles.css'), 'utf8');
const appSource = readFileSync(require.resolve('../web/app.js'), 'utf8');
const reportService = readFileSync(require.resolve('../src/modules/relatorios/relatorios.service.js'), 'utf8');
assert.match(appSource, /const contentTitle = window\.AcademicReportRenderer\?\.extractReportTitle\(markdownText, cleanTitle, subjectName\)/);
assert.match(appSource, /<h1 class="academic-title abnt-title">\$\{escapeHtml\(typeof renderMedicalMathAndSymbols === 'function' \? renderMedicalMathAndSymbols\(contentTitle\) : contentTitle\)\}<\/h1>/);
assert.match(appSource, /title: contentTitle,[\s\S]*?markdown: `# \$\{contentTitle\}/);
assert.match(reportService, /TÍTULO EDITORIAL:[\s\S]*?Não copie o nome do arquivo/);
assert.match(reportService, /title: generatedTitle/);
assert.match(reportStyles, /\.academic-article-container \.report-list-subalineas > li\s*\{\s*display:\s*list-item;/);
assert.match(reportStyles, /\.academic-article-container \.academic-report-list > li\s*\{[^}]*break-inside:\s*auto;/s);
assert.doesNotMatch(reportStyles, /\.academic-article-container \.report-list-subalineas > li\s*\{[^}]*display:\s*grid/s);
assert.match(reportStyles, /@page \{ size: A4 portrait; margin: 3cm 2cm 2cm 3cm; \}/);
assert.match(reportStyles, /\.academic-article-container \.academic-report-paragraph,\s*\.academic-article-container p\s*\{[^}]*font-family: "Times New Roman", Times, serif;/s);
assert.match(appSource, /function getMedTutorReportPrintFooterHtml\(\)/);
assert.match(appSource, /class="academic-report-print-footer"/);
assert.match(appSource, /MedTutor Brasil ·/);
assert.match(reportStyles, /\.academic-report-container \.academic-institution[\s\S]*?background:\s*transparent/);
assert.match(reportStyles, /\.academic-report-print-footer\s*\{[\s\S]*?position:\s*fixed/s);
assert.match(reportStyles, /\.academic-report-page-number span::after\s*\{\s*content:\s*counter\(page\)/);
assert.doesNotMatch(reportStyles, /\.academic-institution\s*\{[^}]*background:\s*#7f1d1d/s);
assert.doesNotMatch(appSource, /\.academic-institution\s*\{ background:\s*#7f1d1d/);
assert.match(appSource, /mso-footer:\s*medtutorFooter/);
const chatWordExport = appSource.slice(appSource.indexOf('function downloadChatReportWord'), appSource.indexOf('function emitMessageAsPdf'));
assert.match(chatWordExport, /<h1 class="academic-title">\$\{escapeHtml\(title\)\}<\/h1>/);
assert.match(chatWordExport, /<div class="academic-institution abnt-institution medtutor-report-brand">MedTutor Brasil<\/div>/);

console.log('Normalização de estrutura, cifrões, parênteses e Markdown validada.');
console.log('Renderizador dedicado de relatórios, listas e limites de tabela A4 validado.');
console.log('Padrão tipográfico, cabeçalho MedTutor, títulos no Word e rodapés paginados validados.');
