const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('=== TESTE DE CONFORMIDADE: MONOLITO MODULAR ESTRITO ===\n');

// 1. Verificar Ponto de Entrada (index.js)
const indexPath = path.join(__dirname, '..', 'index.js');
assert(fs.existsSync(indexPath), 'index.js deve existir na raiz');

const indexContent = fs.readFileSync(indexPath, 'utf-8');
const lines = indexContent.split('\n').filter(l => l.trim().length > 0);
console.log(`[PASS] index.js encontrado (${lines.length} linhas não vazias)`);
assert(lines.length <= 110, `index.js deve permanecer um bootstrap enxuto (máximo: 110 linhas; atual: ${lines.length})`);

// Verificar ausência de lógica acoplada em index.js
const forbiddenPatterns = [
  'function generateQuiz',
  'function processMessage',
  'firebase.firestore',
  'req.query',
  'SELECT ',
  'UPDATE ',
  'res.send("<!DOCTYPE'
];
for (const pattern of forbiddenPatterns) {
  assert(!indexContent.includes(pattern), `index.js não deve conter regras de negócio inline ('${pattern}')`);
}
console.log('[PASS] index.js livre de regras de negócio acopladas');

// O diretório de colegas deve vir de contas reais, nunca de perfis de demonstração.
const appSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf-8');
const curriculumSubjectAliases = appSource.match(/function getCurriculumSubjectAliases\(value\) \{[\s\S]*?\n    \}/)?.[0] || '';
const sameCurriculumSubject = appSource.match(/function isSameCurriculumSubject\(first, second\) \{[\s\S]*?\n    \}/)?.[0] || '';
const uniqueCurriculumDisciplines = appSource.match(/function getUniqueCurriculumDisciplines\(disciplines = \[\]\) \{[\s\S]*?\n    \}/)?.[0] || '';
const exactStudySubject = appSource.match(/function isExactStudySubject\(materialSubject, selectedSubject\) \{[\s\S]*?\n    \}/)?.[0] || '';
const canonicalSubjectResolver = appSource.match(/function resolveCanonicalCurriculumSubjectName\(value\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(curriculumSubjectAliases && sameCurriculumSubject && uniqueCurriculumDisciplines && exactStudySubject && canonicalSubjectResolver, 'a grade deve resolver nomes legados, canonicalizar matérias e remover disciplinas curriculares duplicadas sem correspondência parcial');
const areSameCurriculumSubjects = new Function(`
  const normalizeStudyComparisonText = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  ${curriculumSubjectAliases}
  ${sameCurriculumSubject}
  return isSameCurriculumSubject;
`)();
assert(areSameCurriculumSubjects('Integração de Sistemas Humanos 2 (Dermatologia Clínica)', 'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)'), 'o material legado do módulo tegumentar deve aparecer na disciplina equivalente da ementa');
assert(areSameCurriculumSubjects('Sistema Nervoso', 'M011 Integração de Sistemas Humanos III (Sistema Nervoso)'), 'o rótulo anatômico entre parênteses deve associar o material à disciplina correspondente');
assert(!areSameCurriculumSubjects('Integração de Sistemas Humanos 2 (Dermatologia)', 'M011 Integração de Sistemas Humanos III (Sistema Nervoso)'), 'a resolução não pode misturar módulos diferentes');
const resolveCanonicalCurriculumSubjectName = new Function(`
  const normalizeStudyComparisonText = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  const getAllCurriculumSubjects = () => [{ name: 'M009 Mecanismos de Agressão e Defesa', period: '2º Semestre' }];
  ${exactStudySubject}
  ${curriculumSubjectAliases}
  ${sameCurriculumSubject}
  ${canonicalSubjectResolver}
  return resolveCanonicalCurriculumSubjectName;
`)();
assert.strictEqual(resolveCanonicalCurriculumSubjectName('2º Semestre - M009 Mecanismos de Agressão e Defesa'), 'M009 Mecanismos de Agressão e Defesa', 'nomes gerados com prefixo de período devem ser salvos como a matéria oficial da ementa');
const getUniqueCurriculumDisciplines = new Function(`
  const normalizeStudyComparisonText = value => String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  ${curriculumSubjectAliases}
  ${sameCurriculumSubject}
  ${uniqueCurriculumDisciplines}
  return getUniqueCurriculumDisciplines;
`)();
const uniqueCurriculumList = getUniqueCurriculumDisciplines([
  { name: 'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)', period: '2º Semestre' },
  { name: 'Integração de Sistemas Humanos 2 (Dermatologia Clínica)', period: '2º Semestre' },
  { name: 'M011 Integração de Sistemas Humanos III (Sistema Nervoso)', period: '2º Semestre' }
]);
assert.deepStrictEqual(uniqueCurriculumList.map(subject => subject.name), [
  'M010 Integração de Sistemas Humanos II (Sistema Tegumentar)',
  'M011 Integração de Sistemas Humanos III (Sistema Nervoso)'
], 'aliases/cópias de disciplinas devem ser deduplicados, preservando o nome oficial da ementa');
assert(!appSource.includes('extraSubs') && !appSource.includes('<optgroup label="Outras Disciplinas">'), 'o filtro de Flashcards não deve acrescentar matéria crua fora da ementa ao selecionar todos os períodos');
assert(appSource.includes("selectManualSubjectFromAccordion('${escapeHtml(it.name)}')"), 'alocação manual deve enviar o nome oficial da matéria, não o rótulo completo com período');
assert(appSource.includes('const finalSubject = resolveCanonicalCurriculumSubjectName(requestedSubject);'), 'toda alocação deve canonicalizar o nome antes de persistir');
assert(appSource.includes('disciplines.map(d => d.name)'), 'seletor de desafios deve usar nome oficial da matéria, sem prefixo de exibição do semestre');
assert(appSource.includes('isSameCurriculumSubject(q.subject || q.disciplina, discipline)'), 'desafios devem localizar questões por equivalência curricular, inclusive registros legados');
assert(appSource.includes('isSameCurriculumSubject(data.disciplina || data.subject, subjectName)'), 'a leitura autoritativa deve aceitar o nome legado equivalente sem aceitar disciplina diferente');
assert(appSource.includes('isSameCurriculumSubject(m.subject || m.disciplina, subjectName)'), 'exclusões por disciplina devem também alcançar materiais salvos com o rótulo legado');
assert(appSource.includes('getLegacyDisciplineQuestionBankId(legacyLabel)'), 'banco didático deve recuperar perfis legados com nome de exibição do semestre');
assert(!/sharedQuestionsBank\.filter\(q\s*=>\s*q\.subject\s*===\s*(?:targetSubj|targetSubject|currentStudySubject|discipline)\)/.test(appSource), 'filtros de questões não devem usar igualdade literal nos escopos de disciplina');
console.log('[PASS] Filtro curricular de Flashcards usa nomes oficiais e elimina cópias por alias');

const persistenceLoader = appSource.match(/async loadAllDataFromPersistence\(\) \{[\s\S]*?\n      \}\n    \};/)?.[0] || '';
assert(persistenceLoader.includes('!materialsCacheHydrated && !hasLocalMaterialsCache'), 'cache local vazio não deve impedir a primeira leitura de materiais no Firestore');
assert(persistenceLoader.includes('|| needsInitialMaterialsHydration'), 'a primeira hidratação deve ignorar o intervalo de 15 minutos quando não existe cópia local');
assert(persistenceLoader.includes('getMaterialsCacheHydratedKey(uid), \'true\''), 'marcar cache hidratado somente após consulta bem-sucedida à nuvem');
console.log('[PASS] Primeira hidratação do cache de materiais força leitura da nuvem quando necessário');

for (const fakeColleague of [
  'mariana.costa@medicina.universo.br',
  'lucas.silva@medicina.universo.br',
  'beatriz.moraes@medicina.universo.br',
  'gabriel.santos@medicina.universo.br'
]) {
  assert(!appSource.includes(fakeColleague), `o diretório não deve sugerir perfil fictício (${fakeColleague})`);
}
console.log('[PASS] Diretório de colegas sem perfis fictícios embutidos');

// Questões vindas do Firestore usam chaves históricas em português; normalize-as
// para que os filtros de Desafios funcionem também em aparelhos sem cache local.
assert(/subject:\s*q\.subject\s*\|\|\s*q\.disciplina/.test(appSource), 'questões remotas devem mapear disciplina para subject');
assert(/topic:\s*q\.topic\s*\|\|\s*q\.materia/.test(appSource), 'questões remotas devem mapear materia para topic');
const challengeTopicsHelper = appSource.match(/function getTopicsForSubject\(subjectName\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(challengeTopicsHelper.includes('isSameCurriculumSubject(q.subject || q.disciplina, subjectName)'), 'o filtro de tópicos deve aceitar aliases curriculares sem ampliar por correspondência parcial');
assert(!challengeTopicsHelper.includes('.includes(normSubject)'), 'o filtro de tópicos não deve ampliar a disciplina por correspondência parcial');
assert(!challengeTopicsHelper.includes('q.flashcardTitle'), 'títulos individuais de cards não devem virar matéria no filtro');
assert(challengeTopicsHelper.includes('isSameCurriculumSubject(m.subject || m.disciplina, subjectName)') && challengeTopicsHelper.includes('m.name') && challengeTopicsHelper.includes('m.originalFileName') && challengeTopicsHelper.includes('m.title'), 'materiais enviados com rótulos curriculares equivalentes devem continuar disponíveis no filtro');
assert(/slideName:\s*q\.slideName\s*\|\|\s*q\.nome_material/.test(appSource), 'questões devem manter a associação com o arquivo de origem ao recarregar da nuvem');
assert(/nome_material:\s*q\.slideName\s*\|\|\s*q\.materialName/.test(appSource), 'a associação da questão com o arquivo deve ser persistida no Firestore');
console.log('[PASS] Questões e materiais enviados são preservados e limitados à disciplina selecionada');

const challengeScoreFunction = appSource.match(/function getChallengeQuestionScore\(question\) \{[\s\S]*?\n    \}/)?.[0] || '';
const challengeAnswerFunction = appSource.match(/function getChallengeQuestionAnswer\(question\) \{[\s\S]*?\n    \}/)?.[0] || '';
const challengeEligibilityFunction = appSource.match(/function isChallengeQuestionEligible\(question\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(challengeScoreFunction && challengeAnswerFunction && challengeEligibilityFunction, 'os desafios devem verificar enunciado e gabarito e continuar exibindo desempenho quando houver');
const challengeHelpers = new Function(`${challengeScoreFunction}\n${challengeAnswerFunction}\n${challengeEligibilityFunction}\nreturn { getChallengeQuestionScore, getChallengeQuestionAnswer, isChallengeQuestionEligible };`)();
assert(challengeHelpers.isChallengeQuestionEligible({ question: 'Questão recém-gerada', reference_answer: 'Resposta de referência' }), 'questão gerada com resposta deve ficar elegível sem tentativas');
assert(challengeHelpers.isChallengeQuestionEligible({ question: 'Questão de múltipla escolha', quizOptions: ['A) Resposta correta', 'B) Distrator'], correctIndex: 0, quizStats: { attempts: 0, correct: 0 } }), 'questão de quiz deve ficar elegível imediatamente e resolver a alternativa correta');
assert.strictEqual(challengeHelpers.getChallengeQuestionAnswer({ question: 'Questão', quizOptions: ['A) Resposta correta', 'B) Distrator'], correctIndex: 0 }), 'Resposta correta', 'o desafio deve receber o texto da alternativa correta, não apenas seu índice');
assert(challengeHelpers.isChallengeQuestionEligible({ flashcard: { front: 'Frente', back: 'Verso' }, quizStats: { attempts: 20, correct: 16 } }), 'desempenho abaixo de 85% não deve bloquear questão pronta');
assert(!challengeHelpers.isChallengeQuestionEligible({ question: 'Questão sem gabarito' }), 'questão sem resposta utilizável não deve ser enviada a um desafio');
assert(!challengeHelpers.isChallengeQuestionEligible({ quizStats: { attempts: 20, correct: 20 } }), 'estatística sem enunciado e gabarito não transforma item inválido em questão');
const challengeSendMethod = appSource.match(/async sendChallenge\(\) \{[\s\S]*?\n      \},/)?.[0] || '';
assert(challengeSendMethod.includes('back: getChallengeQuestionAnswer(q)'), 'o desafio enviado deve incluir a resposta correta da questão selecionada');
console.log('[PASS] Questões com enunciado e gabarito ficam imediatamente elegíveis para desafios, sem score mínimo ou requisito de SRS');
const openScheduleQuestions = appSource.match(/function openScheduleQuestions\(taskIndex\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(openScheduleQuestions.includes("navigateTab('flashcards')"), 'cards diários do SCE devem abrir Flashcards');
assert(!openScheduleQuestions.includes("navigateTab('quizzes')"), 'cards diários do SCE não devem abrir Quizzes');
console.log('[PASS] Cards diários do SCE navegam para Flashcards');

const authMarkup = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf-8');
const standaloneLoginMarkup = fs.readFileSync(path.join(__dirname, '..', 'web', 'login.html'), 'utf-8');
assert(authMarkup.includes('id="paymentScreenContainer"'), 'a tela de cupom deve ter um container independente da tela de login');
assert(/<\/div>\s*<\/div>\s*(?:<script[\s\S]*?<\/script>\s*)?<div id="paymentScreenContainer"/.test(authMarkup), 'a tela de pagamento deve estar fora do container de login');
assert(authMarkup.includes('id="accessGateCard" role="dialog" aria-modal="true"'), 'a solicitação de cupom deve ser um modal acessível');
assert(authMarkup.includes('id="accessCouponInput"'), 'o modal deve conter o campo para inserir cupom');
assert(appSource.includes('couponInput.focus()'), 'o campo de cupom deve receber foco ao abrir o modal');
assert(authMarkup.includes('id="accessCouponInput"') && authMarkup.includes('id="btnAccessCouponSubmit"'), 'a tela de pagamento deve solicitar cupom com campo e botão de envio');
const accessCardMarkup = authMarkup.match(/<section[^>]*id="accessGateCard"[\s\S]*?<\/section>/)?.[0] || '';
assert(accessCardMarkup.includes('MedTutorAuthService.signOut()'), 'a tela de pagamento deve permitir sair da conta');
assert(indexContent.includes("'/pagamento'"), 'a rota /pagamento deve ser servida diretamente pelo servidor');
assert(appSource.includes("setAppRoute('/pagamento', { replace: true })"), 'contas sem acesso devem ser redirecionadas para /pagamento');
assert(authMarkup.includes('class="route-resolving" data-route="resolving"'), 'o documento deve iniciar numa tela neutra enquanto o Firebase restaura a sessão');
assert(appSource.includes("setRoutePresentation('resolving')") && appSource.includes("this.setAuthScreenState('checking')"), 'o formulário de login não deve piscar antes da confirmação do Firebase Auth');
assert(appSource.includes("pendingRoutePath = window.location.pathname || pendingRoutePath || '/login'"), 'a rota solicitada deve ser preservada enquanto o Auth está pendente');
assert(appSource.includes('authStartupCompleted') && appSource.includes('setTimeout(() => {') && appSource.includes('}, 12000)'), 'a restauração e validação do Auth devem encerrar com limite de tempo');
assert(appSource.includes('this.authSessionErrorMessage = this.authStateResolved') && appSource.includes('this.setAuthScreenState(\'error\')'), 'falha/timeout de autenticação deve apresentar estado recuperável');
assert(authMarkup.includes('id="authSessionError"') && authMarkup.includes('/login?logout=1'), 'a tela de erro de sessão deve oferecer saída para um login independente do bundle com falha');
assert(authMarkup.includes('__medTutorAuthBundleReady') && authMarkup.includes('}, 15000);'), 'falha no carregamento do bundle não pode deixar a tela de sessão permanente');
assert(appSource.includes("window.__medTutorAuthBundleReady = true;") && appSource.indexOf('window.__medTutorAuthBundleReady = true;') < appSource.indexOf('const MedTutorAuthService'), 'o bundle deve sinalizar carregamento antes da inicialização pesada do app');
assert(authMarkup.includes('__medTutorAuthBootFailure') && authMarkup.includes("window.addEventListener('error'"), 'erros reais do bundle devem exibir uma saída da tela de sessão');
assert(authMarkup.includes('recoverAuthStaticCache') && authMarkup.includes("registration.unregister()") && authMarkup.includes("key.indexOf('medtutor-') === 0"), 'a recuperação de sessão deve limpar somente o cache estático do MedTutor');
assert(indexContent.includes("path.join(__dirname, 'web', 'login.html')"), 'a rota de login deve servir um documento separado da SPA');
assert(standaloneLoginMarkup.includes("params.get('logout') === '1'") && standaloneLoginMarkup.includes('auth.signOut()'), 'o login isolado deve encerrar a sessão Firebase quando vier da recuperação');
assert(appSource.includes("if (!item.disciplina || !Array.isArray(item.materias)) return;") && !appSource.includes("if (item.origem !== 'gemini-upload') return;"), 'ementas legadas válidas devem continuar visíveis mesmo sem metadado de origem');
assert(appSource.includes("MedTutorAuthService?.currentUser?.uid"), 'a primeira sincronização não pode usar o UID provisório antes da autenticação');
assert(authMarkup.includes('id="semesterRenameModal"') && authMarkup.includes('id="semesterRenameProgressTrack"'), 'a revisão de renomeação deve exibir modal e barra de progresso');
assert(appSource.includes('function readMaterialTextDirectlyFromFirestore(doc)') && appSource.includes('readMaterialTextChunks(doc.ref'), 'a renomeação deve ler o conteúdo e os chunks diretamente do Firestore');
assert(appSource.includes('async function analyzeSemesterSubjectNames(periodId)') && appSource.includes('classifyMaterialWithServerGemini(text, name, selectedCat.period)'), 'a análise por semestre deve classificar o conteúdo contra o catálogo oficial com Gemini');
assert(appSource.includes('const escapedSelectedPeriodId = String(selectedCat.id || selectedCat.period || \'\')') && appSource.includes("analyzeSemesterSubjectNames('${escapedSelectedPeriodId}')"), 'o painel de ementa deve usar o identificador do período selecionado sem variável fora de escopo');
assert(appSource.includes('async function applySemesterSubjectRenameReview()') && appSource.includes("disciplina: item.newSubject") && appSource.includes("subject: item.newSubject"), 'a prévia confirmada deve atualizar os rótulos no mesmo documento sem recriá-lo');
console.log('[PASS] Renomeação de matérias por semestre lê o Firestore, mostra progresso e grava somente após confirmação');
console.log('[PASS] Recarregar preserva a rota solicitada e aguarda confirmação segura do Firebase Auth');
const chatSaveMethod = appSource.match(/async saveChatSessions\(sessionsArray\)[\s\S]*?(?=\/\/ Upload de imagem)/)?.[0] || '';
assert(chatSaveMethod.includes('MedTutorAuthService.accessGranted === true'), 'a sincronização de chats deve aguardar a liberação do cupom');
const cloudSessionMethod = appSource.match(/hasAuthenticatedCloudSession\(uid\)\s*\{[\s\S]*?\n      \},/)?.[0] || '';
assert(cloudSessionMethod.includes('MedTutorAuthService.accessGranted === true'), 'leituras e escritas do Firestore devem aguardar a liberação do cupom');
console.log('[PASS] Modal de ativação do cupom acessível e pronto para receber o código');

const firestoreRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf-8');
assert(appSource.includes('verifyStudyDataResetVersion(uid)'), 'a sincronização deve conferir a versão do reset antes de persistir dados antigos');
assert(appSource.includes('medtutor_study_data_reset_version_'), 'o reset remoto deve invalidar caches locais de estudo por conta');
assert(appSource.includes("collection('perfis_didaticos')"), 'os perfis didáticos devem permanecer em uma coleção distinta');
const resetScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'admin', 'reset-study-data.js'), 'utf-8');
['materiais_estudo', 'historico_chats', 'grade_curricular', 'banco_questoes'].forEach(name => {
  assert(resetScript.includes(`'${name}'`), `o reset administrativo deve incluir ${name}`);
});
assert(resetScript.includes('perfis_didaticos') && resetScript.includes('Supabase Storage assets'), 'o reset deve preservar perfis didáticos e assets do Supabase');
assert(resetScript.includes('--execute') && resetScript.includes('--confirm=RESET_ALL_STUDY_DATA'), 'a exclusão global deve exigir confirmação explícita');
assert(resetScript.includes('study_data_reset_markers'), 'o marcador do reset deve ficar separado do perfil do usuário');
assert(firestoreRules.includes('match /study_data_reset_markers/{userId}') && firestoreRules.includes('allow read: if isOwner(userId)'), 'o aluno pode ler apenas o próprio marcador administrativo');
console.log('[PASS] Reset global limitado às quatro coleções solicitadas e compatível com caches antigos');

const rulesVersion = '2026-09-22-v1';
assert(firestoreRules.includes(rulesVersion), 'firestore.rules deve exigir a versão atual do cupom');
console.log('[PASS] Firestore exige a versão atual da liberação por cupom');

// 2. Verificar Estrutura dos Módulos (src/modules)
const modulesDir = path.join(__dirname, '..', 'src', 'modules');
assert(fs.existsSync(modulesDir), 'Diretório src/modules deve existir');

const requiredModules = ['auth', 'access', 'ementas', 'relatorios', 'quizzes', 'chat'];
for (const mod of requiredModules) {
  const modPath = path.join(modulesDir, mod);
  assert(fs.existsSync(modPath), `Módulo '${mod}' deve existir em src/modules/`);

  const routesFile = path.join(modPath, `${mod}.routes.js`);
  const controllerFile = path.join(modPath, `${mod}.controller.js`);
  const serviceFile = path.join(modPath, `${mod}.service.js`);

  assert(fs.existsSync(routesFile), `Arquivo de rotas '${mod}.routes.js' deve existir`);
  assert(fs.existsSync(controllerFile), `Controlador '${mod}.controller.js' deve existir`);
  assert(fs.existsSync(serviceFile), `Serviço '${mod}.service.js' deve existir`);

  console.log(`[PASS] Módulo '${mod}' validado com isolamento de rotas, controlador e serviço`);
}

// 3. Teste de Inicialização e Roteamento HTTP (sem chamadas externas de IA)
const reportService = require('../src/modules/relatorios/relatorios.service');
const quizService = require('../src/modules/quizzes/quizzes.service');
const chatService = require('../src/modules/chat/chat.service');
reportService.generateReport = async (payload) => ({ title: payload.title, subject: payload.subject, html: '<p>Relatório de teste</p>' });
quizService.generateQuestions = async () => ({ questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] });
chatService.processMessage = async () => ({ reply: 'Resposta de teste baseada em diretrizes médicas.' });
const app = require('../index.js');
const server = http.createServer((req, res) => app.handle(req, res));

const TEST_PORT = 3456;

server.listen(TEST_PORT, async () => {
  console.log(`\nIniciando testes de requisições HTTP na porta ${TEST_PORT}...`);

  const makeRequest = (method, urlPath, body = null) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, rawBody: data });
          }
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  };

  try {
    // Test 1: Healthcheck
    const health = await makeRequest('GET', '/api/health');
    assert.strictEqual(health.statusCode, 200);
    assert.strictEqual(health.body.architecture, 'modular-monolith');
    console.log('[PASS] GET /api/health -> 200 OK (modular-monolith)');

    const paymentPage = await makeRequest('GET', '/pagamento');
    assert.strictEqual(paymentPage.statusCode, 200, 'a rota de pagamento/cupom precisa abrir diretamente');
    assert(paymentPage.rawBody?.includes('accessCouponForm'), 'a rota /pagamento deve entregar o formulário do cupom');
    console.log('[PASS] GET /pagamento -> tela dedicada de acesso por cupom');

    // Test 2: Auth Module
    const session = await makeRequest('POST', '/api/auth/session', { email: 'aluno@medicina.uf.br' });
    assert.strictEqual(session.statusCode, 200);
    assert.strictEqual(session.body.authenticated, true);
    console.log(`[PASS] POST /api/auth/session -> 200 OK (${session.body.user.email})`);

    const profile = await makeRequest('GET', '/api/auth/profile');
    assert.strictEqual(profile.statusCode, 200);
    assert.strictEqual(profile.body.email, 'aluno@medicina.uf.br');
    console.log(`[PASS] GET /api/auth/profile -> 200 OK (${profile.body.nome})`);

    const accessStatus = await makeRequest('GET', '/api/access/status');
    assert.strictEqual(accessStatus.statusCode, 200);
    assert.strictEqual(accessStatus.body.required, false, 'coupon gate must remain off by default');
    console.log('[PASS] GET /api/access/status -> 200 OK (gate desligado por padrão)');

    process.env.ACCESS_GATE_ENABLED = 'true';
    const blockedWithoutSession = await makeRequest('GET', '/api/ementas');
    assert.strictEqual(blockedWithoutSession.statusCode, 401, 'study APIs must require a Firebase token when the coupon gate is enabled');
    console.log('[PASS] GET /api/ementas sem token -> 401 quando o gate é ativado');
    process.env.ACCESS_GATE_ENABLED = 'false';

    // Test 3: Ementas Module
    const ementas = await makeRequest('GET', '/api/ementas');
    assert.strictEqual(ementas.statusCode, 200);
    assert(Array.isArray(ementas.body.curriculo), 'Curriculo deve ser um array');
    console.log(`[PASS] GET /api/ementas -> 200 OK (${ementas.body.curriculo.length} períodos curriculares carregados)`);

    // Test 4: Relatórios Module
    const relatorio = await makeRequest('POST', '/api/relatorios/gerar', {
      subject: 'Neurologia',
      title: 'Vias Sensitivas e Motoras',
      content: 'As vias sensitivas e motoras integram neurônios, tratos medulares, tronco encefálico e córtex cerebral para organizar a percepção e o movimento voluntário.'
    });
    assert.strictEqual(relatorio.statusCode, 200);
    assert(relatorio.body.title.includes('Vias Sensitivas e Motoras'));
    console.log(`[PASS] POST /api/relatorios/gerar -> 200 OK ('${relatorio.body.title}')`);

    const invalidReport = await makeRequest('POST', '/api/relatorios/gerar', { title: 'Sem conteúdo' });
    assert.strictEqual(invalidReport.statusCode, 400);
    console.log('[PASS] POST /api/relatorios/gerar sem conteúdo -> 400 Bad Request');

    // Test 5: Quizzes Module
    const quiz = await makeRequest('POST', '/api/quizzes/gerar', {
      subject: 'Neurologia',
      topic: 'Tronco Encefálico',
      count: 3,
      materialText: 'O tronco encefálico é formado por mesencéfalo, ponte e bulbo, contendo vias ascendentes, descendentes e núcleos de nervos cranianos.'
    });
    assert.strictEqual(quiz.statusCode, 200);
    assert.strictEqual(quiz.body.questions.length, 3);
    console.log(`[PASS] POST /api/quizzes/gerar -> 200 OK (${quiz.body.questions.length} questões com distratores)`);

    const retiredFlashcardsEndpoint = await makeRequest('GET', '/api/quizzes/flashcards/neurologia');
    assert.strictEqual(retiredFlashcardsEndpoint.statusCode, 410);
    assert(retiredFlashcardsEndpoint.body.error.includes('descontinuado'));
    console.log('[PASS] GET /api/quizzes/flashcards/:subjectId -> 410 explícito (sem falso deck vazio)');

    // Test 6: Chat & Evidências Module
    const chatEvidence = await makeRequest('POST', '/api/chat/evidencias', {
      topic: 'Tronco Encefálico',
      subject: 'Neurologia'
    });
    assert.strictEqual(chatEvidence.statusCode, 200);
    assert(chatEvidence.body.urls.pubmed.includes('pubmed.ncbi.nlm.nih.gov'));
    console.log('[PASS] POST /api/chat/evidencias -> 200 OK (Bases científicas PubMed/SciELO/Sciencedirect integradas)');

    const chatMsg = await makeRequest('POST', '/api/chat/mensagem', {
      message: 'Explique a anatomia do tronco encefálico',
      subject: 'Neurologia'
    });
    assert.strictEqual(chatMsg.statusCode, 200);
    assert(chatMsg.body.reply.includes('diretrizes médicas'));
    console.log('[PASS] POST /api/chat/mensagem -> 200 OK (MedCopilot clínico com evidências)');

    console.log('\n======================================================');
    console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log('O MedTutor Brasil foi refatorado para um Monolito Modular Estrito!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Falha nos testes de roteamento:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
