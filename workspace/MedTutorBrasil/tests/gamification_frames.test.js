const assert = require('assert');
const catalog = require('../web/gamification-frames.js');

console.log('🧪 Iniciando testes do catálogo de molduras...');

const now = new Date(2026, 9, 24, 12); // 24/10/2026
const definitions = catalog.getDefinitions({ now });
const byFamily = family => definitions.filter(item => item.family === family);
assert.strictEqual(byFamily('asclepio').length, 20, 'o Bastão de Asclépio deve ter 20 níveis');
assert.strictEqual(byFamily('maratonista').length, 5, 'Maratonista deve ter 5 níveis');
assert.strictEqual(byFamily('curadoria').length, 5, 'Curadoria deve ter 5 níveis');
assert.strictEqual(byFamily('laco').length, 12, 'deve existir um laço para cada mês do ano corrente');
assert.deepStrictEqual(byFamily('conquistas').map(item => item.id), ['ecg', 'chama', 'raio', 'desafiador', 'sinapse'], 'o estetoscópio foi removido');
assert.strictEqual(new Set(definitions.map(item => item.id)).size, definitions.length, 'ids de moldura devem ser únicos');
assert.deepStrictEqual(byFamily('asclepio').map(item => item.rule.min), Array.from({ length: 20 }, (_, index) => (index + 1) * 5), 'um Asclépio a cada 5 níveis, do 5 ao 100');
console.log('  [PASS] Catálogo com 47 molduras novas no ano (20 Asclépio, 5 conquistas, 5+5 níveis, 12 laços)');

for (const definition of definitions) {
  const svg = catalog.buildSvg(definition.id);
  assert(svg.startsWith('<svg class="profile-frame-svg') && svg.endsWith('</svg>'), `${definition.id}: SVG inválido`);
  assert.strictEqual((svg.match(/<g\b/g) || []).length, (svg.match(/<\/g>/g) || []).length, `${definition.id}: grupos SVG desbalanceados`);
  assert(!/NaN|undefined/.test(svg), `${definition.id}: SVG com valores inválidos`);
  assert(/class="pf-|pf-glow|pf-iridescent/.test(svg), `${definition.id}: toda moldura nova deve ser animada por CSS`);
}
assert(catalog.buildSvg('laco-2026-10').includes('>2026</text>'), 'o laço mostra o ano no topo');
assert(catalog.buildSvg('asclepio-20').includes('pf-iridescent'), 'o Asclépio nível 100 é iridescente');
assert.strictEqual(catalog.buildSvg('estetoscopio'), '', 'moldura removida não existe');
console.log('  [PASS] Todas as molduras geram SVG válido e animado');

const progressEmpty = catalog.createProgress();
const evaluateId = (id, metrics, progress = progressEmpty) => catalog.evaluate(catalog.getDefinition(id), metrics, progress, now);
assert.strictEqual(evaluateId('asclepio-5', { level: 24 }).unlocked, false);
assert.strictEqual(evaluateId('asclepio-5', { level: 25 }).unlocked, true);
assert.strictEqual(evaluateId('ecg', { level: 10 }).unlocked, true);
assert.strictEqual(evaluateId('maratonista-3', { answered: 999 }).unlocked, false);
assert.strictEqual(evaluateId('maratonista-3', { answered: 1000 }).unlocked, true);
assert.strictEqual(evaluateId('curadoria-1', { curatedAnswered: 25 }).unlocked, true);
assert.strictEqual(evaluateId('desafiador', { challengerVotes: 9 }).unlocked, false);
assert.strictEqual(evaluateId('sinapse', { neuroAnswered: 100 }).unlocked, true);
assert.strictEqual(evaluateId('laco-2026-10', { monthAnswered: { '2026-10': 30 } }).unlocked, true, 'laço do mês atual com 30 questões');
assert.strictEqual(evaluateId('laco-2026-09', { monthAnswered: { '2026-09': 40 } }).unlocked, false, 'laço de mês encerrado não é mais conquistável');
assert(evaluateId('laco-2026-09', {}).requirement.startsWith('Campanha encerrada'));
assert(evaluateId('laco-2026-12', {}).requirement.startsWith('Disponível em'));
console.log('  [PASS] Regras de desbloqueio respeitam os limites de cada nível e o mês da campanha');

let progress = catalog.createProgress();
for (let index = 0; index < 30; index++) progress = catalog.recordQuizAnswer(progress, { questionId: `q${index}`, correct: true, curated: index < 10, neuro: index < 5, dayKey: '2026-10-24' });
progress = catalog.recordQuizAnswer(progress, { questionId: 'q0', correct: true, dayKey: '2026-10-24' });
assert.strictEqual(progress.answeredIds.length, 30, 'repetir a mesma questão não conta de novo');
assert.strictEqual(progress.curatedIds.length, 10);
assert.strictEqual(progress.neuroIds.length, 5);
assert.strictEqual(progress.monthAnswered['2026-10'].length, 30);
assert.strictEqual(progress.bestCombo, 31, 'acertos seguidos contam o combo');
progress = catalog.recordQuizAnswer(progress, { questionId: 'q99', correct: false, dayKey: '2026-10-24' });
assert.strictEqual(progress.comboRun, 0, 'um erro zera a sequência atual');
assert.strictEqual(progress.bestCombo, 31, 'o recorde de combo é mantido');
console.log('  [PASS] Progresso conta questões únicas, curadoria, neuro, mês e combo');

let days = catalog.createProgress();
['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
  .forEach(day => { days = catalog.recordActiveDay(days, day); });
assert.strictEqual(days.bestStreak, 7, 'a maior sequência de dias seguidos é 7 (05 a 11)');
assert.strictEqual(catalog.longestStreak(['2026-12-31', '2027-01-01']), 2, 'a sequência atravessa a virada do ano');
console.log('  [PASS] Sequência de dias seguidos');

const metrics = catalog.metricsFromProgress(progress, { level: 12, answered: 10 });
const first = catalog.collectNewUnlocks(progress, metrics, now);
assert(first.newlyUnlocked.includes('asclepio-2') && first.newlyUnlocked.includes('ecg') && first.newlyUnlocked.includes('raio') && first.newlyUnlocked.includes('laco-2026-10'));
assert(!first.newlyUnlocked.includes('asclepio-3'), 'nível 12 ainda não libera o Asclépio do nível 15');
const lowerXp = catalog.evaluate(catalog.getDefinition('asclepio-2'), { level: 3 }, first.progress, now);
assert.strictEqual(lowerXp.unlocked, true, 'moldura conquistada continua liberada mesmo se o nível cair');
assert.strictEqual(catalog.collectNewUnlocks(first.progress, metrics, now).newlyUnlocked.length, 0, 'conquistas não se repetem');
const nextYear = catalog.getDefinitions({ now: new Date(2027, 0, 5), unlockedIds: Object.keys(first.progress.unlocked) });
assert(nextYear.some(item => item.id === 'laco-2027-01') && nextYear.some(item => item.id === 'laco-2026-10'), 'no ano seguinte surgem novos laços e os conquistados continuam na coleção');
console.log('  [PASS] Conquistas são permanentes e os laços se renovam a cada ano');

const normalized = catalog.normalizeProgress({ unlocked: { 'asclepio-1': 5, 'estetoscopio': 9, hack: 1 }, answeredIds: 'x', activeDays: ['2026-10-01', 'bad'] });
assert.deepStrictEqual(Object.keys(normalized.unlocked), ['asclepio-1'], 'ids desconhecidos são descartados');
assert.deepStrictEqual(normalized.answeredIds, []);
assert.deepStrictEqual(normalized.activeDays, ['2026-10-01']);
console.log('  [PASS] Progresso salvo é normalizado com segurança');

const anuais = byFamily('anual');
assert.deepStrictEqual(anuais.map(item => item.id), [1, 2, 3, 4, 5, 6].map(tier => `anual-2026-${tier}`), 'a Moldura Anual tem 6 níveis no ano corrente');
assert.deepStrictEqual(anuais.map(item => item.rule.min), [15, 45, 90, 130, 200, 500]);
assert(catalog.buildSvg('anual-2026-1').includes('>2026</text>'), 'o ano aparece na placa');
const svgA = catalog.buildSvg('anual-2026-6');
const svgB = catalog.buildSvg('anual-2026-6');
assert.notStrictEqual(svgA.match(/id="(pfan[^"]+)p"/)[1], svgB.match(/id="(pfan[^"]+)p"/)[1], 'cada instância usa ids próprios nos gradientes');
assert(!catalog.buildSvg('anual-2026-2').includes('pf-sweep') && catalog.buildSvg('anual-2026-3').includes('pf-sweep'), 'o reflexo na placa começa no nível 3');
assert(catalog.buildSvg('anual-2026-5').includes('pf-digits-glow') && svgA.includes('pf-iridescent'), 'números brilham no nível 5 e o nível 6 é prisma');
const yearMetrics = catalog.metricsFromProgress({ monthAnswered: { '2026-11': Array.from({ length: 50 }, (_, i) => `y${i}`), '2026-12': Array.from({ length: 50 }, (_, i) => `y${i + 25}`) } });
assert.strictEqual(yearMetrics.yearAnswered['2026'], 75, 'o ano soma questões únicas de todos os meses');
assert.strictEqual(catalog.evaluate(catalog.getDefinition('anual-2026-2'), yearMetrics, catalog.createProgress(), now).unlocked, true);
assert.strictEqual(catalog.evaluate(catalog.getDefinition('anual-2026-3'), yearMetrics, catalog.createProgress(), now).unlocked, false);
const in2027 = catalog.evaluate(catalog.getDefinition('anual-2026-1'), yearMetrics, catalog.createProgress(), new Date(2027, 0, 2));
assert.strictEqual(in2027.unlocked, false, 'depois do ano a moldura não pode mais ser conquistada');
assert(in2027.requirement.startsWith('Ano encerrado'));
const kept = catalog.getDefinitions({ now: new Date(2027, 0, 2), unlockedIds: ['anual-2026-2'] }).map(item => item.id);
assert(kept.includes('anual-2027-1') && kept.includes('anual-2026-2') && !kept.includes('anual-2026-3'), 'em 2027 surge a anual nova e a de 2026 conquistada continua');
console.log('  [PASS] Moldura Anual: 6 níveis, ano em destaque, reflexo e conquista só durante o ano');

for (let period = 1; period <= 12; period++) {
  const svg = catalog.buildLegacySvg(`laurel-${period}`, ['#59402c', '#9a7044', '#d2ae76']);
  assert(svg.includes('pf-leaf') && svg.includes(`>${period}º</text>`), `louro ${period}: folhas animadas e selo do período`);
  assert.strictEqual((svg.match(/<g\b/g) || []).length, (svg.match(/<\/g>/g) || []).length);
}
assert(catalog.buildLegacySvg('laurel-9', ['#1c677a', '#72ccdd', '#e8fcff']).includes('pf-shine'), 'louros a partir do 9º têm brilho percorrendo a coroa');
assert(catalog.buildLegacySvg('neon', ['#00f477', '#b2ffd2', '#07552d']).includes('pf-comet'), 'o novo Pulso Neon tem cometa de luz');
assert.strictEqual(catalog.buildLegacySvg('laurel-13', ['#000', '#000', '#000']), '');
console.log('  [PASS] Novos Louros e Pulso Neon');

const history = catalog.backfillProgress(catalog.createProgress(), {
  answeredIds: ['h1', 'h2'], curatedIds: ['h1'], neuroIds: ['h2'], bestCombo: 12,
  eventIds: [...Array.from({ length: 30 }, (_, i) => `2026-08-${String(1 + (i % 7)).padStart(2, '0')}:quiz:h${encodeURIComponent('q/' + i)}`), '2026-10-20:flashcard:f1', 'inválido']
});
assert.strictEqual(history.monthAnswered['2026-08'].length, 30, 'eventos datados de quiz contam no mês em que aconteceram');
assert(history.monthAnswered['2026-08'].includes('hq/0'), 'ids de eventos são decodificados');
assert.strictEqual(history.bestStreak, 7, 'dias de eventos (quiz e flashcard) formam a sequência');
assert.strictEqual(history.bestCombo, 12);
assert.deepStrictEqual(history.curatedIds, ['h1']);
const historyMetrics = catalog.metricsFromProgress(history, { level: 1 });
const october = new Date(2026, 9, 25);
assert(!catalog.collectNewUnlocks(history, historyMetrics, october).newlyUnlocked.includes('laco-2026-08'), 'sem o modo retroativo, laço de mês encerrado não é concedido');
assert(catalog.collectNewUnlocks(history, historyMetrics, october, { retroactive: true }).newlyUnlocked.includes('laco-2026-08'), 'no modo retroativo, o histórico concede o laço do mês já cumprido');
assert(!catalog.collectNewUnlocks(history, historyMetrics, october, { retroactive: true }).newlyUnlocked.includes('laco-2026-11'), 'o retroativo não concede meses futuros');
assert.strictEqual(catalog.evaluate(catalog.getDefinition('laco-2027-03'), { monthAnswered: { '2027-03': 99 } }, catalog.createProgress(), new Date(2027, 5, 1), { retroactive: true }).unlocked, false, 'o retroativo vale só para 2026');
const normalizedFlags = catalog.normalizeProgress({ legacySeen: ['laurel-3', 'neon', 'x'], retroGiftShown: true });
assert.deepStrictEqual(normalizedFlags.legacySeen, ['laurel-3', 'neon']);
assert.strictEqual(normalizedFlags.retroGiftShown, true);
assert.strictEqual(catalog.normalizeProgress({}).legacySeen, null, 'louros vistos começam não inicializados');
console.log('  [PASS] Entrega retroativa única: histórico, laços já cumpridos de 2026 e flags');

const appJs = require('fs').readFileSync(require('path').join(__dirname, '..', 'web', 'app.js'), 'utf8');
const indexHtml = require('fs').readFileSync(require('path').join(__dirname, '..', 'web', 'index.html'), 'utf8');
assert(indexHtml.includes('id="frameUnlockModal"') && indexHtml.includes('equipUnlockedFrameFromModal()'), 'existe o modal de moldura conquistada com botão de equipar');
assert(appJs.includes("Date.parse('2026-10-26T03:00:00Z')") && appJs.includes('user.metadata?.creationTime'), 'o retroativo vale só para contas criadas até 25/10/2026');
assert(appJs.includes('setupQuizCarousel(quizDeck, list)') && appJs.includes("event.key === 'ArrowRight'"), 'o quiz mostra uma questão por vez com setas e teclado');
console.log('  [PASS] Modal de conquista e quiz em carrossel presentes');

const fs = require('fs');
const path = require('path');
const iconScript = fs.readFileSync(path.join(__dirname, '..', 'web', 'material-icons.js'), 'utf8');
assert(iconScript.includes("svg.closest('.profile-frame-svg"), 'o conversor de ícones não pode trocar o SVG das molduras por um ícone de fonte');
console.log('  [PASS] Conversor de ícones preserva o SVG das molduras');

console.log('🎉 Testes do catálogo de molduras concluídos!\n');
