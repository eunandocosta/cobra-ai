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
const storage = new Map();
const sandbox = vm.createContext({
  Date, Math, Map, Number, String, Boolean, JSON, Array, Object,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  MedTutorFirebaseService: { getUserId: () => 'aluno-1' },
  resolveQuizCorrectIndex: question => (typeof question.correctIndex === 'number' ? question.correctIndex : -1),
  sharedQuestionsBank: [],
  getFilteredQuestions: () => [],
  currentStudySubject: 'Cardiologia',
  currentStudyPeriodFilter: 'all',
  getDisciplinesForPeriod: () => [],
  isSameCurriculumSubject: (a, b) => a === b
});
vm.runInContext(['getStartOfDay', 'normalizeVisualMatchText', 'isQuizMistake', 'isQuizCapableQuestion', 'shuffleQuestions',
  'getExamQuestionPool', 'getExamScopeLabel', 'formatExamClock', 'examHistoryStorageKey', 'readExamHistory', 'recordExamHistory',
  'recordQuizAnswerHistory', 'getStudyTopicLabel', 'getTopicPerformance', 'getWeeklyAccuracy'].map(extractFunction).join('\n'), sandbox);

// Objetos criados dentro do vm vêm de outro realm; compara pelo conteúdo.
const plain = value => JSON.parse(JSON.stringify(value));

console.log('🧪 Iniciando testes de simulado e desempenho...');

const q = (id, extra = {}) => ({ id, subject: 'Cardiologia', topic: 'Infarto', quizOptions: ['A', 'B', 'C', 'D'], correctIndex: 0, ...extra });
const bank = [q('a'), q('b', { subject: 'Pneumologia', topic: 'Asma' }), q('c', { flashcardOnly: true }), q('d', { correctIndex: undefined })];
vm.runInContext('sharedQuestionsBank = this.bank; getFilteredQuestions = () => sharedQuestionsBank.filter(x => x.subject === "Cardiologia");', Object.assign(sandbox, { bank }));
assert.deepStrictEqual(plain(sandbox.getExamQuestionPool('all').map(x => x.id)), ['a', 'b'], 'simulado ignora flashcards e questões sem gabarito');
assert.deepStrictEqual(plain(sandbox.getExamQuestionPool('subject').map(x => x.id)), ['a'], 'escopo da disciplina usa o filtro atual');
assert.strictEqual(sandbox.getExamScopeLabel('all'), 'Todas as disciplinas');
const shuffled = sandbox.shuffleQuestions([1, 2, 3, 4, 5]);
assert.deepStrictEqual(plain([...shuffled].sort()), [1, 2, 3, 4, 5], 'o sorteio mantém todas as questões');
assert.strictEqual(sandbox.formatExamClock(3 * 60 * 20), '1:00:00');
assert.strictEqual(sandbox.formatExamClock(-5), '00:00', 'o relógio nunca fica negativo');
console.log('  [PASS] Simulado sorteia questões válidas por escopo e formata o tempo');

for (let index = 0; index < 32; index++) sandbox.recordExamHistory({ date: new Date().toISOString(), pct: index, total: 10, correct: 1 });
const history = sandbox.readExamHistory();
assert.strictEqual(history.length, 30, 'guarda os 30 simulados mais recentes');
assert.strictEqual(history.at(-1).pct, 31);
assert(storage.has('medtutor_exam_history_v1_aluno-1'), 'histórico separado por conta');
console.log('  [PASS] Histórico de simulados é guardado e limitado');

const now = new Date(2026, 10, 4, 10); // quarta-feira
const ans = q('h1');
sandbox.recordQuizAnswerHistory(ans, false, new Date(2026, 10, 3));
sandbox.recordQuizAnswerHistory(ans, true, new Date(2026, 10, 4));
sandbox.recordQuizAnswerHistory(ans, true, new Date(2026, 9, 28));
assert.deepStrictEqual(plain(ans.quizStats.history.map(entry => entry.d)), ['2026-11-03', '2026-11-04', '2026-10-28']);
for (let index = 0; index < 30; index++) sandbox.recordQuizAnswerHistory(ans, true, now);
assert.strictEqual(ans.quizStats.history.length, 20, 'cada questão guarda só as 20 últimas respostas');
const weeklyQuestion = { quizStats: { history: [{ d: '2026-11-03', ok: false }, { d: '2026-11-04', ok: true }, { d: '2026-10-28', ok: true }, { d: '2026-08-01', ok: false }] } };
const weekly = sandbox.getWeeklyAccuracy([weeklyQuestion], 8, now);
assert.strictEqual(weekly.length, 8);
assert.strictEqual(weekly[7].start.getDate(), 2, 'a semana começa na segunda-feira');
assert.deepStrictEqual([weekly[7].answered, weekly[7].pct], [2, 50]);
assert.deepStrictEqual([weekly[6].answered, weekly[6].pct], [1, 100]);
assert.strictEqual(weekly[0].pct, null, 'semanas sem respostas ficam vazias e respostas antigas ficam de fora');
console.log('  [PASS] Acerto por semana agrupa as respostas de segunda a domingo');

const topics = sandbox.getTopicPerformance([
  q('t1', { quizStats: { attempts: 3, correct: 1, lastStatus: 'incorrect' } }),
  q('t2', { quizStats: { attempts: 2, correct: 2, lastStatus: 'correct' } }),
  q('t3', { subject: 'Pneumologia', topic: 'Asma', quizStats: { attempts: 1, correct: 0, lastStatus: 'incorrect' } }),
  q('t4', { topic: 'Arritmia' })
]);
const infarto = topics.find(topic => topic.label === 'Infarto');
assert.deepStrictEqual([infarto.attempts, infarto.correct, infarto.errors, infarto.accuracy, infarto.mistakes], [5, 3, 2, 60, 1]);
assert.deepStrictEqual(plain(infarto.ids), ['t1', 't2']);
assert(!topics.some(topic => topic.label === 'Arritmia'), 'temas nunca respondidos não entram no ranking');
console.log('  [PASS] Desempenho por tema soma acertos, erros e Caderno de Erros');

assert(indexHtml.includes('id="sceTopicPerformance"'), 'o SCE deve ter o painel de desempenho');
assert(/const list = getActiveQuizSetItems\(\) \|\| getFilteredQuestions\(\);/.test(appSource), 'o simulado corrige só as questões sorteadas');
assert(/setItems \|\| filteredList \|\| getFilteredQuestions\(\)/.test(appSource), 'o conjunto ativo tem prioridade sobre a lista da disciplina');
assert(/startConfiguredExam\(\{ scope: 'subject', count: 10, timeMode: 'free' \}\)/.test(appSource), 'o Banco Global usa o simulado configurado');
console.log('  [PASS] Quiz respeita o simulado sorteado e o treino de tema');
console.log('🎉 Testes de simulado e desempenho concluídos!\n');
