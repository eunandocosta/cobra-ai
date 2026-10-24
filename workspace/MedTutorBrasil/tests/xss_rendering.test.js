const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Extrai do web/app.js as funções de renderização e as executa isoladas.
const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
function extractFunction(name) {
  const match = appSource.match(new RegExp(`function\\s+${name}\\s*\\(`));
  if (!match) throw new Error(`Função ${name} não encontrada em web/app.js`);
  let depth = 0;
  for (let i = appSource.indexOf('{', match.index); i < appSource.length; i++) {
    if (appSource[i] === '{') depth++;
    else if (appSource[i] === '}' && --depth === 0) return appSource.slice(match.index, i + 1);
  }
  throw new Error(`Função ${name} sem fechamento`);
}
const sandbox = vm.createContext({});
vm.runInContext([
  'escapeHtml', 'jsAttrArg', 'formatAITextToHTML', 'formatInlineMd',
  'normalizeGeneratedStructuralHtml', 'normalizeAsciiDiagramsForReading', 'reflowSlideText'
].map(extractFunction).join('\n'), sandbox);
const { jsAttrArg, formatAITextToHTML } = sandbox;

// Simula o navegador: o atributo HTML é decodificado e o resultado vira código JS.
function decodeAttribute(value) {
  return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

console.log('🧪 Iniciando testes de renderização segura (XSS)...');

const hostileValues = [
  'Ana" onmouseover="alert(1)" x="',
  "');alert(1);//",
  "\\');alert(1);//",
  'linha\nquebrada </script><img src=x onerror=alert(1)>',
  'acentuação & símbolos ≥ μg',
  ''
];
for (const value of hostileValues) {
  const attribute = jsAttrArg(value);
  assert(!/["<>]/.test(attribute), `jsAttrArg não pode deixar aspas duplas ou tags cruas no atributo: ${attribute}`);
  assert.strictEqual(new Function(`return ${decodeAttribute(attribute)};`)(), value, 'o handler deve receber exatamente o valor original');
}
assert.strictEqual(new Function(`return ${decodeAttribute(jsAttrArg(null))};`)(), '', 'valores ausentes viram string vazia');
console.log('  [PASS] jsAttrArg gera argumentos seguros para handlers inline');

const injectedLines = [
  'Texto <img src=x onerror="alert(1)"></pre>',
  '<pre class="gemini-code-block"><img src=x onerror="alert(1)">',
  'MEDTUTORCODEBLOCK0END <script>alert(1)</script>'
];
for (const line of injectedLines) {
  const html = formatAITextToHTML(line);
  assert(!/<img\b/i.test(html) && !/<script\b/i.test(html), `texto da IA/material não pode virar HTML ativo: ${html}`);
}
console.log('  [PASS] Linhas com <pre> ou </pre> não escapam do formatador');

const codeHtml = formatAITextToHTML('Exemplo:\n```\nif (a < b) return "<b>ok</b>";\n```\nFim.');
assert(codeHtml.includes('<pre class="gemini-code-block"><code>if (a &lt; b) return &quot;&lt;b&gt;ok&lt;/b&gt;&quot;;</code></pre>'), `bloco de código deve continuar renderizado e escapado: ${codeHtml}`);
assert(!/MEDTUTORCODEBLOCK/.test(codeHtml), 'marcadores internos não podem aparecer no HTML final');
console.log('  [PASS] Blocos de código legítimos continuam renderizados e escapados');

assert(!/openDirectChallenge\('\$\{/.test(appSource), 'o cartão de colega deve usar jsAttrArg nos argumentos do onclick');
assert(!/startChallengeReview\('\$\{/.test(appSource), 'o desafio recebido deve usar jsAttrArg no onclick');
assert(!/addCommunityQuestionToDeck\('\$\{/.test(appSource), 'o banco comunitário deve usar jsAttrArg no onclick');
console.log('  [PASS] Handlers com dados de outras contas usam jsAttrArg');

console.log('🎉 Testes de renderização segura concluídos!\n');
