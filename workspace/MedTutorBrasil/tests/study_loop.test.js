const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
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
const sandbox = vm.createContext({ Date, Math, Object, Array, parseFloat });
vm.runInContext(['getStartOfDay', 'calculateSrsNext', 'scheduleQuizMistakeReview', 'isQuizMistake'].map(extractFunction).join('\n'), sandbox);
const DAY = 86400000;

console.log('🧪 Iniciando testes do ciclo errar → revisar → acertar...');

const fresh = { id: 'q1' };
assert.strictEqual(sandbox.scheduleQuizMistakeReview(fresh), true);
const dueInDays = (new Date(fresh.srs.dueDate) - Date.now()) / DAY;
assert(dueInDays > 0.9 && dueInDays < 1.1, `erro deve agendar revisão para amanhã (${dueInDays})`);
assert.strictEqual(fresh.srs.lapses, 1);
assert.strictEqual(fresh.srs.history.at(-1).source, 'quiz');
assert(fresh.srs.lastReviewed, 'a questão sai da fila de inéditos e entra na de revisão');
console.log('  [PASS] Errar uma questão nova agenda revisão para amanhã');

assert.strictEqual(sandbox.scheduleQuizMistakeReview(fresh), false, 'dois erros no mesmo dia contam como um');
assert.strictEqual(fresh.srs.lapses, 1);
console.log('  [PASS] Vários erros no mesmo dia não acumulam penalidade');

const overdueDate = new Date(Date.now() - 2 * DAY).toISOString();
const overdue = { id: 'q2', srs: { reps: 3, interval: 10, easeFactor: 2.5, lapses: 0, lastReviewed: new Date(Date.now() - 12 * DAY).toISOString(), dueDate: overdueDate, history: [] } };
sandbox.scheduleQuizMistakeReview(overdue);
assert.strictEqual(overdue.srs.dueDate, overdueDate, 'card já vencido continua na revisão de hoje');
assert.strictEqual(overdue.srs.interval, 1);
assert.strictEqual(overdue.srs.easeFactor, 2.3, 'o erro reduz a facilidade do card');
console.log('  [PASS] Card já vencido não é adiado pelo erro');

assert.strictEqual(sandbox.isQuizMistake({ quizStats: { lastStatus: 'incorrect' } }), true);
assert.strictEqual(sandbox.isQuizMistake({ quizStats: { lastStatus: 'correct' } }), false);
assert.strictEqual(sandbox.isQuizMistake({}), false);
assert(indexHtml.includes('id="qzMistakesBtn"') && indexHtml.includes('toggleMistakeNotebookFilter()'), 'o quiz deve ter o botão do Caderno de Erros');
assert(/if \(isMistakeNotebookFilterActive\) list = list\.filter\(isQuizMistake\);[\s\S]{0,80}updateMistakeNotebookCount\(\)/.test(appSource), 'a lista do quiz deve aplicar o Caderno de Erros');
assert(/!isCorrect && scheduleQuizMistakeReview\(item\)/.test(appSource), 'modo Tutor deve agendar a revisão do erro');
assert(/typeof userChoice === 'number' && !isCorrect\) scheduleQuizMistakeReview\(item\)/.test(appSource), 'Simulado deve agendar só as respondidas erradas');
console.log('  [PASS] Caderno de Erros filtra a última resposta errada no Tutor e no Simulado');

assert(!indexHtml.includes('hoje às 08:30') && !indexHtml.includes('2 Tarefas Atrasadas'), 'o SCE não pode exibir horário ou atraso fixos');
assert(/Última otimização: hoje às \$\{lastStudyRouteRebuildAt\.toLocaleTimeString/.test(appSource), 'o SCE deve mostrar o horário real do cálculo');
console.log('  [PASS] SCE mostra o horário real da última otimização');
console.log('🎉 Testes do ciclo de estudo concluídos!\n');

// A correção da questão no estudo ativo não mostra mais a "Pérola Clínica de Plantão".
{
  const appCode = require('fs').readFileSync(require('path').join(__dirname, '..', 'web', 'app.js'), 'utf8');
  require('assert').ok(!/Pérola Clínica de Plantão|class="commentary-pearl"/.test(appCode), 'a pérola clínica saiu da correção do estudo ativo');
  console.log('  [PASS] Correção do estudo ativo sem a Pérola Clínica de Plantão');
}

// Curadoria: a questão enviada nunca leva referências circulares.
{
  const appCode = require('fs').readFileSync(require('path').join(__dirname, '..', 'web', 'app.js'), 'utf8');
  const start = appCode.indexOf('function buildCurationQuestionPayload(');
  let depth = 0; let end = appCode.indexOf(') {', start) + 2;
  for (; end < appCode.length; end++) { if (appCode[end] === '{') depth++; else if (appCode[end] === '}' && --depth === 0) break; }
  const build = new Function(`${appCode.slice(start, end + 1)}; return buildCurationQuestionPayload;`)();
  const question = { id: 'q1', question: 'Qual estrutura coordena o equilíbrio?', answer: 'Vestibulocerebelo', quizOptions: ['A', { text: 'B' }], correctAnswerIndex: 1, topic: 'Cerebelo' };
  question.self = question;
  question.medicalImage = { owner: question };
  const payload = build(question, 'quizzes');
  require('assert').doesNotThrow(() => JSON.stringify(payload));
  require('assert').deepEqual(payload.quizOptions, ['A', 'B']);
  require('assert').equal(payload.correctAnswerIndex, 1);
  require('assert').equal(payload.__curationType, 'quizzes');
  require('assert').ok(appCode.includes('question: buildCurationQuestionPayload(item, type)'));
  console.log('  [PASS] Curadoria envia só os campos da questão, sem referências circulares');
}
