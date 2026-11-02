const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'web', 'styles.css'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'web', 'service-worker.js'), 'utf8');
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
const shown = [];
const sandbox = vm.createContext({
  Date, Math, Number, String, JSON, Object, Array,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  MedTutorFirebaseService: { getUserId: () => 'aluno-1' },
  sharedQuestionsBank: [],
  dueCount: 0,
  getSrsQueueCounts: () => ({ due: sandbox.dueCount }),
  showStudyReminderNotification: (title, body) => shown.push(body)
});
vm.runInContext(`var DAILY_GOAL_OPTIONS = [10, 20, 30, 50, 100];
  ${['localDayKey', 'dailyGoalStorageKey', 'readDailyGoalSettings', 'writeDailyGoalSettings', 'countTodayStudyAnswers', 'getDailyGoalStatus', 'checkStudyReminder'].map(extractFunction).join('\n')}`, sandbox);

console.log('🧪 Iniciando testes de meta diária, anotações e chat inativado...');

const settings = sandbox.readDailyGoalSettings();
assert.strictEqual(settings.goal, 20);
assert.strictEqual(settings.reminderEnabled, false);
storage.set('medtutor_daily_goal_v1_aluno-1', JSON.stringify({ goal: 7, reminderTime: '25h' }));
assert.strictEqual(sandbox.readDailyGoalSettings().goal, 20, 'meta fora das opções volta ao padrão');
assert.strictEqual(sandbox.readDailyGoalSettings().reminderTime, '19:00', 'horário inválido volta ao padrão');
console.log('  [PASS] Configurações da meta têm padrão e validação');

const now = new Date(2026, 10, 2, 20, 0);
const yesterday = new Date(2026, 10, 1, 20, 0);
const bank = [
  { quizStats: { history: [{ d: '2026-11-02', ok: true }, { d: '2026-11-02', ok: false }, { d: '2026-11-01', ok: true }] },
    srs: { history: [{ date: now.toISOString(), rating: 3 }, { date: now.toISOString(), rating: 1, source: 'quiz' }, { date: yesterday.toISOString(), rating: 3 }] } },
  { srs: { history: [{ date: now.toISOString(), rating: 4 }] } }
];
const today = sandbox.countTodayStudyAnswers(bank, now);
assert.deepStrictEqual(JSON.parse(JSON.stringify(today)), { quiz: 2, cards: 2, total: 4 }, 'conta quiz e cards de hoje, sem contar o erro de quiz duas vezes');
console.log('  [PASS] Meta conta respostas de hoje no Quiz e nos Flashcards');

storage.set('medtutor_daily_goal_v1_aluno-1', JSON.stringify({ goal: 10, reminderEnabled: true, reminderTime: '19:30' }));
vm.runInContext('sharedQuestionsBank = this.bank', Object.assign(sandbox, { bank }));
sandbox.dueCount = 3;
assert.strictEqual(sandbox.checkStudyReminder(new Date(2026, 10, 2, 19, 0)), false, 'antes do horário não lembra');
assert.strictEqual(sandbox.checkStudyReminder(new Date(2026, 10, 2, 19, 45)), true, 'depois do horário lembra');
assert(/3 revisões esperando e fez 4 de 10/.test(shown.at(-1)), shown.at(-1));
assert.strictEqual(sandbox.checkStudyReminder(new Date(2026, 10, 2, 21, 0)), false, 'lembra só uma vez por dia');
assert.strictEqual(sandbox.checkStudyReminder(new Date(2026, 10, 3, 20, 0)), true, 'no dia seguinte lembra de novo');
storage.set('medtutor_daily_goal_v1_aluno-1', JSON.stringify({ goal: 10, reminderEnabled: true, reminderTime: '07:00' }));
sandbox.dueCount = 0;
const quietBank = Array.from({ length: 10 }, () => ({ quizStats: { history: [{ d: '2026-11-04', ok: true }] } }));
vm.runInContext('sharedQuestionsBank = this.quietBank', Object.assign(sandbox, { quietBank }));
const before = shown.length;
sandbox.checkStudyReminder(new Date(2026, 10, 4, 8, 0));
assert.strictEqual(shown.length, before, 'meta batida e sem revisões: não incomoda');
console.log('  [PASS] Lembrete respeita horário, uma vez por dia, e não avisa quem já cumpriu tudo');

assert(indexHtml.includes('id="homeGoalCard"') && /saveSharedQuestionsBank\(\) \{\s*scheduleDailyGoalRefresh\(\);/.test(appSource), 'a Home mostra a meta e cada resposta a atualiza');
assert(serviceWorker.includes("addEventListener('notificationclick'"), 'tocar no lembrete abre o app');
console.log('  [PASS] Cartão da meta na Home e notificação que abre o app');

assert(/\$\{questionNoteSlotHtml\(item\)\}/.test(appSource) && /renderStudySupportImage\(item\) \+ questionNoteSlotHtml\(item\)/.test(appSource), 'anotação aparece no Quiz e no verso do Flashcard');
assert(indexHtml.includes('onclick="editCurrentCardNote()"'), 'o Flashcard tem o botão Anotar');
assert(/if \(typeof q\.userNote === 'string'\) \{\s*payload\.userNote = q\.userNote\.slice\(0, 2000\);/.test(appSource), 'anotação vai para a nuvem, inclusive apagada');
assert(/\$\{escapeHtml\(note\)\}/.test(appSource), 'anotação é escapada ao exibir');
console.log('  [PASS] Anotações pessoais no Quiz e nos Flashcards, sincronizadas e seguras');

assert(/var CHAT_MODULE_ENABLED = false;/.test(appSource), 'chat inativado');
assert(/if \(tabId === 'chat' && !CHAT_MODULE_ENABLED\) tabId = 'home';/.test(appSource), 'qualquer navegação ao chat vai para o Início');
assert(/APP_TAB_BY_ROUTE\['\/chat-ia'\] = 'home'/.test(appSource), 'o endereço /chat-ia leva ao Início');
assert(/#tab-chat, #navLinkChat \{ display: none !important; \}/.test(styles), 'a aba do chat fica invisível');
console.log('  [PASS] Chat IA invisível e inacessível');
console.log('🎉 Testes de meta diária, anotações e chat concluídos!\n');
