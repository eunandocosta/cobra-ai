const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const service = require('../src/modules/relatorios/relatorios.service');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'relatorios', 'relatorios.service.js'), 'utf8');
function extract(name) {
  const match = appSource.match(new RegExp(`function\\s+${name}\\s*\\(`));
  let depth = 0;
  for (let i = appSource.indexOf('{', match.index); i < appSource.length; i++) {
    if (appSource[i] === '{') depth++;
    else if (appSource[i] === '}' && --depth === 0) return appSource.slice(match.index, i + 1);
  }
  throw new Error(`Função ${name} sem fechamento`);
}
const ctx = vm.createContext({ extractPersistedImagesFromMarkdown: () => [] });
vm.runInContext(['measurePdfPageFigures', 'filterAndProcessClinicalImages', 'getMaterialPageTexts', 'collectPersistedReportFigures'].map(extract).join('\n'), ctx);
const plain = value => JSON.parse(JSON.stringify(value));

console.log('🧪 Iniciando testes das figuras dos relatórios...');

// 1. Página do PDF: só entra como figura se houver imagem relevante.
const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, constructPath: 5 };
const pageArea = 720 * 405;
const ops = (width, height) => ({ fnArray: [1, 3, 4, 2], argsArray: [null, [width, 0, 0, height, 10, 10], null, null] });
const logo = ops(60, 60);
const figure = ops(400, 300);
assert.equal(ctx.measurePdfPageFigures(logo.fnArray, logo.argsArray, OPS, pageArea).hasFigure, false, 'capa com logo pequeno não é figura');
assert.equal(ctx.measurePdfPageFigures([], [], OPS, pageArea).hasFigure, false, 'slide só de texto não é figura');
assert.equal(ctx.measurePdfPageFigures(figure.fnArray, figure.argsArray, OPS, pageArea).hasFigure, true, 'corte anatômico grande é figura');
assert.equal(ctx.measurePdfPageFigures(Array(200).fill(5), [], OPS, pageArea).hasFigure, true, 'desenho vetorial (muitos traços) é figura');
const kept = plain(ctx.filterAndProcessClinicalImages([
  { id: 'p1', title: 'Página 1 do material', page: 1, hasFigure: false, width: 900, height: 500, src: 'data:a' },
  { id: 'p6', title: 'Página 6 do material', page: 6, hasFigure: true, width: 900, height: 500, src: 'data:b' }
]).clinicalImages);
assert.deepEqual(kept.map(image => image.id), ['p6'], 'página sem figura não é guardada');
assert.equal(kept[0].page, 6, 'a figura guarda a página de origem');
console.log('  [PASS] Capa e slides de texto ficam de fora; a figura guarda a página');

// 2. Cada figura leva o título e o texto da própria página.
const material = {
  markdownText: '## Página 6\n\nAnatômica\n• Anterior\n• Posterior\n• Flóculo-nodular\n\n## Página 7\n\nFuncional\n• Vestibulocerebelo',
  clinicalImages: [
    { imageUrl: 'https://img/p6.jpg', title: 'Página 6 do material' },
    { imageUrl: 'https://img/p7.jpg', page: 7, title: 'x', visualAssociation: 'Zonas funcionais do cerebelo', visibleStructures: ['zona medial', 'zona lateral'] }
  ]
};
const figures = plain(ctx.collectPersistedReportFigures(material));
assert.equal(figures[0].page, 6, 'página recuperada do título de materiais antigos');
assert.equal(figures[0].pageTitle, 'Anatômica');
assert.equal(figures[0].pageText, 'Anterior; Posterior; Flóculo-nodular');
assert.deepEqual(figures[1].visibleStructures, ['zona medial', 'zona lateral']);
const pptxPages = plain([...ctx.getMaterialPageTexts('## Slide 3: Estruturas\n\nVermis\nHemisférios').entries()]);
assert.deepEqual(pptxPages[0], [3, { page: 3, title: 'Estruturas', text: 'Vermis; Hemisférios' }]);
assert.match(appSource, /fullPdfText \+= `## Página \$\{pageNum\}\\n\\n\$\{pageText\}\\n\\n`;/, 'o texto do PDF marca o início de cada página');
const repaired = plain(ctx.collectPersistedReportFigures({ markdownText: 'Texto antigo sem marcação.', clinicalImages: [
  { imageUrl: 'https://img/capa.jpg', title: 'Capa da aula', page: 1, hiddenFromFigures: true, visualAnalysisCompleted: true },
  { imageUrl: 'https://img/p4.jpg', title: 'Flóculo, nódulo e tonsila', page: 4, visualAnalysisCompleted: true, transcription: 'Flóculo, nódulo e tonsila; pode herniar pelo forame magno' }
] }));
assert.deepEqual(repaired.map(item => item.url), ['https://img/p4.jpg'], 'página ocultada (capa) não entra no relatório');
assert.equal(repaired[0].pageTitle, 'Flóculo, nódulo e tonsila', 'título da análise visual vira título da página');
assert.match(repaired[0].pageText, /forame magno/, 'transcrição vira o texto da página em materiais antigos');
assert.match(appSource, /\(material\.clinicalImages \|\| \[\]\)\.filter\(image => !image\?\.hiddenFromFigures\)/, 'questões não são ligadas a páginas ocultadas');
assert.match(appSource, /hiddenFromFigures: association\.isVisualStudyMaterial === false/, 'a análise visual oculta capa e slide de texto');
console.log('  [PASS] Figuras levam título e texto da página de origem; páginas ocultadas ficam de fora');

// 3. Servidor: a IA só escolhe onde a figura entra; legenda vem do material.
const reportFigures = service.sanitizeReportFigures([
  { url: 'https://img/p18.jpg', page: 18, pageTitle: 'Estruturas', pageText: 'Flóculo, nódulo e tonsila; Pode herniar pelo forame magno' },
  { url: 'https://img/p1.jpg', page: 1 },
  { url: 'javascript:alert(1)', page: 2, pageTitle: 'x' }
]);
assert.equal(reportFigures.length, 2, 'URL que não é http(s) é descartada');
const catalog = service.buildFigureCatalogText(reportFigures);
assert.match(catalog, /\[\[FIGURA_1\]\] → página 18 do material \| título da página: "Estruturas" \| texto da página: "Flóculo, nódulo e tonsila; Pode herniar pelo forame magno"/);
assert.match(catalog, /\[\[FIGURA_2\]\] → página 1 do material \| SEM DESCRIÇÃO: não insira/);
assert.doesNotMatch(catalog, /https?:/, 'a IA não recebe URLs para copiar');
const generated = 'As tonsilas podem herniar.\n[[FIGURA_1]]\n*Figura: Visão detalhada da fossa posterior e emergência dos nervos cranianos.*\n\n![Inventada](https://img/p1.jpg)\n\n![Externa](https://outro.site/x.png)\n\n[[FIGURA_1]]';
const placed = service.applyReportFigurePlaceholders(generated, reportFigures);
assert.match(placed.markdown, /!\[Estruturas: Flóculo, nódulo e tonsila; Pode herniar pelo forame magno — página 18 do material\]\(https:\/\/img\/p18\.jpg\)\n\*Figura 1: Estruturas: Flóculo, nódulo e tonsila; Pode herniar pelo forame magno — página 18 do material\.\*/);
assert.doesNotMatch(placed.markdown, /nervos cranianos|Inventada|outro\.site/, 'legendas inventadas e imagens fora do catálogo somem');
assert.match(placed.markdown, /Figura 2: Imagem da página 1 do material\./, 'imagem do catálogo escrita pela IA ganha legenda factual');
assert.equal((placed.markdown.match(/img\/p18\.jpg/g) || []).length, 1, 'cada figura entra uma vez');
assert.deepEqual(placed.usedFigureIds, ['FIGURA_1', 'FIGURA_2']);
assert.match(serviceSource, /Você NÃO vê as imagens/);
assert.doesNotMatch(serviceSource, /Descrição técnica detalhada\]\(URL_EXATA_DO_CATÁLOGO\)/, 'o pedido não manda mais a IA descrever imagens');
assert.match(serviceSource, /applyReportFigurePlaceholders\(generatedMarkdown, reportFigures\)/);
console.log('  [PASS] Servidor insere imagem e legenda factual; IA só escolhe a posição');

assert.match(appSource, /const appendixFigures = reportFigures\.filter\(figure => !usedFigureUrls\.has\(figure\.url\)\);/, 'apêndice sem repetir as figuras do texto');
assert.doesNotMatch(appSource, /\*Figura \$\{index \+ 1\}\$\{figure\.page/, 'apêndice não renumera "Figura 1" de novo');
console.log('  [PASS] Apêndice só com as figuras não usadas, com legenda pela página');
console.log('🎉 Testes das figuras dos relatórios concluídos!\n');

// Figura sem descrição continua no apêndice, com legenda explicando a falta de descrição.
assert.match(appSource, /\(sem descrição do conteúdo\)`;/, 'figura sem descrição tem legenda própria no apêndice');
assert.match(appSource, /const appendixFigures = reportFigures\.filter\(figure => !usedFigureUrls\.has\(figure\.url\)\);/);
assert.doesNotMatch(appSource.slice(appSource.indexOf('materialFigureLabel(figure) {'), appSource.indexOf('renderMaterialFiguresHtml(figures = [])')), /hiddenFromFigures|filter\(/, 'o apêndice não descarta figuras sem descrição');
console.log('  [PASS] Figuras sem descrição continuam no apêndice');
