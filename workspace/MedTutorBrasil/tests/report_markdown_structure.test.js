const assert = require('node:assert/strict');
const { normalizeGeneratedStructuralHtml } = require('../src/modules/relatorios/relatorios.service');

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

const codeSample = '```html\n<h4>Não converter dentro do código</h4>\n<ul><li>Exemplo</li></ul>\n```';
assert.equal(normalizeGeneratedStructuralHtml(codeSample), codeSample);

console.log('Normalização de títulos/listas HTML em Markdown validada.');
