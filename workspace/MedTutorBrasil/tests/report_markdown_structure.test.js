const assert = require('node:assert/strict');
const {
  normalizeGeneratedStructuralHtml,
  normalizeReportTextArtifacts
} = require('../src/modules/relatorios/relatorios.service');

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

console.log('Normalização de estrutura, cifrões, parênteses e Markdown validada.');
