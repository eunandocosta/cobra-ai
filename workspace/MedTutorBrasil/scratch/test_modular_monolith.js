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
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'styles.css'), 'utf-8');
const webIndexMarkup = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf-8');
const serviceWorkerSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'service-worker.js'), 'utf-8');
const productionMiddlewareSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'shared', 'production.middleware.js'), 'utf-8');
const announcementsClientSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'announcements.js'), 'utf-8');
const announcementsControllerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'announcements', 'announcements.controller.js'), 'utf-8');
assert(webIndexMarkup.includes('id="adminPanelMenuEntry" href="/anuncios#annAdmin" hidden') && webIndexMarkup.includes('Painel de Administração'), 'o menu deve incluir o atalho administrativo oculto por padrão');
assert(appSource.includes("fetch('/api/announcements/admin/status'") && appSource.includes('result?.isAdmin === true') && appSource.includes('entry.hidden = !isAdmin'), 'a visibilidade do atalho depende da confirmação autenticada do servidor');
assert(announcementsControllerSource.includes("profile.get('role') !== 'admin'") && announcementsClientSource.includes('adminPanel.hidden = result.isAdmin !== true'), 'o painel permanece protegido por role estrito no servidor e oculto para não-admin');
assert(announcementsClientSource.includes("location.hash === '#annAdmin'") && announcementsClientSource.includes('adminPanel.scrollIntoView'), 'o atalho deve abrir diretamente a área do painel de administração');
assert(styleSource.includes('width: 270px;') && styleSource.includes('.app-root.sidebar-collapsed .sidebar'), 'telas amplas devem manter sidebar lateral expansível e recolhível');
assert(/\.app-root\.sidebar-collapsed \.nav-link \.icon,[\s\S]*?font-size: 20px;[\s\S]*?flex: 0 0 20px;/.test(styleSource), 'ícones Material da sidebar devem manter tamanho explícito quando font-size: 0 oculta os rótulos no modo recolhido');
assert(/@media \(max-width: 1280px\)\s*\{\s*\.sidebar\s*\{\s*display:\s*none;/.test(styleSource), 'telas compactas devem ocultar a sidebar lateral');
assert(/\.mobile-bottom-nav\s*\{\s*display:\s*none;/.test(styleSource) && /\.mobile-bottom-nav\s*\{\s*display:\s*flex;/.test(styleSource) && (webIndexMarkup.match(/class="mobile-nav-btn\b/g) || []).length === 6, 'os seis recursos devem estar acessíveis pela navegação inferior em telas compactas');
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
assert(persistenceLoader.includes('await Promise.all(['), 'hidratar caches IndexedDB independentes em paralelo');
assert(persistenceLoader.includes('await yieldToBrowser()'), 'ceder tempo ao navegador ao processar coleções grandes');
assert(persistenceLoader.includes('renderActiveTabContent()'), 'sincronização de dados deve renderizar apenas a seção ativa');
assert(appSource.includes('function renderActiveTabContent()'), 'renderização incremental por seção deve estar disponível');
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

const renderFlashcardDisplay = appSource.match(/function updateCardDisplay\(filteredList\) \{[\s\S]*?\n    \}/)?.[0] || '';
const renderSceDeckCard = appSource.match(/function renderSceReviewDeckCard\(\) \{[\s\S]*?\n    \}/)?.[0] || '';
const renderSceCard = appSource.match(/function renderSceReviewCard\(card, index\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(renderFlashcardDisplay.includes("if (ansInput) ansInput.value = '';"), 'Flashcards deve limpar a resposta digitada ao trocar ou reabrir um card');
assert(!renderFlashcardDisplay.includes('item.lastStudentAnswer'), 'Flashcards não deve reexibir tentativas anteriores no campo de resposta');
assert(renderSceDeckCard.includes("if (answerInput) answerInput.value = '';"), 'o deck SCE deve forçar o campo de resposta a iniciar vazio ao renderizar cada card');
assert(renderSceDeckCard.includes("oldFeedback.style.display = 'none'"), 'o deck SCE não deve reapresentar feedback de uma tentativa anterior');
assert(renderSceCard.includes('autocomplete="off"') && !renderSceCard.includes('lastStudentAnswer'), 'o campo de resposta do SCE não deve restaurar texto anterior via conteúdo ou autofill');
const sceReviewMarkup = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf-8');
assert(sceReviewMarkup.includes('sidebar-settings-btn') && /id="topbarConfigButton"[^>]*hidden/.test(sceReviewMarkup) && !sceReviewMarkup.includes('id="themeLabel"'), 'Configurações deve ficar na sidebar e o tema não deve ocupar o cabeçalho');
assert(sceReviewMarkup.includes('id="themeSettingsToggle"') && sceReviewMarkup.includes('id="themeSettingsDescription"') && sceReviewMarkup.includes('id="themeSettingsLabel"'), 'o controle de tema deve estar disponível dentro das configurações');
assert(sceReviewMarkup.includes('class="btn-icon sce-review-close"') && sceReviewMarkup.includes('aria-label="Fechar flashcards"'), 'o modal de revisão deve ter um botão de fechar identificável e acessível');
assert(/\.sce-review-modal \.sce-review-close[\s\S]*?width: 44px;[\s\S]*?height: 44px;/.test(fs.readFileSync(path.join(__dirname, '..', 'web', 'styles.css'), 'utf-8')), 'o botão de fechar do modal de revisão deve ter área de toque confortável');
const appBundleVersion = sceReviewMarkup.match(/<script defer src="\/app\.min\.js\?v=([^\"]+)"/)?.[1] || '';
assert(appBundleVersion === '20261005-progressive-startup-v1', 'o bundle deve invalidar o cache após mudanças no app');
assert(serviceWorkerSource.includes("medtutor-static-v106") && serviceWorkerSource.includes('/app.min.js?v=20261005-progressive-startup-v1') && serviceWorkerSource.includes('/styles.css?v=20261005-announcements-admin-v1') && serviceWorkerSource.includes('/announcement-prompt.js?v=20261005-consent-prompt-v1') && serviceWorkerSource.includes('/gamification-rules.js?v=20261005-daily-quiz-multiplier-v1') && productionMiddlewareSource.includes("path === '/service-worker.js'") && productionMiddlewareSource.includes("res.setHeader('Cache-Control', 'no-cache')"), 'o service worker deve descartar o shell antigo e ser sempre revalidado');
const materialIconScript = fs.readFileSync(path.join(__dirname, '..', 'web', 'material-icons.js'), 'utf-8');
const materialIconsCss = fs.readFileSync(path.join(__dirname, '..', 'web', 'material-icons.css'), 'utf-8');
assert(sceReviewMarkup.includes('family=Material+Symbols+Rounded') && sceReviewMarkup.includes('icon_names=') && sceReviewMarkup.includes('/material-icons.js?v=20261004-material-symbols-v2'), 'a interface do app deve carregar ícones Material Symbols Rounded subsetados pelo Google Fonts');
assert(materialIconScript.includes('new MutationObserver') && materialIconScript.includes('convertSvg') && materialIconScript.includes('convertLeadingEmoji'), 'ícones estáticos e controles dinâmicos devem ser migrados ao sistema Material');
assert(materialIconScript.includes('.brand-logo') && materialIconScript.includes('.google-icon') && materialIconsCss.includes("font-family: 'Material Symbols Rounded'"), 'logotipos permanecem intactos e os símbolos usam a família Material dedicada');
for (const page of ['login.html', 'landing.html']) {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'web', page), 'utf-8');
  assert(markup.includes('/material-icons.js?v=20261004-material-symbols-v2') && markup.includes('family=Material+Symbols+Rounded'), `${page} deve compartilhar os ícones Material do app`);
}
assert(sceReviewMarkup.includes('id="levelUpModal"') && /id="levelUpContinueButton"[^>]*>Vamos continuar aprendendo juntos!/.test(sceReviewMarkup), 'a subida de nível deve abrir um painel central com CTA de continuidade');
assert(appSource.includes('MedTutorStudyTimeTracker.init()') && appSource.includes("['flashcards', 'quizzes', 'sce'].includes(currentTab)"), 'o tempo de estudo deve ser rastreado apenas nas áreas de estudo');
assert(appSource.includes('commitStudyTime') && appSource.includes('applyStudyTimeProgress'), 'o tempo ativo deve sincronizar em nuvem de forma idempotente');
assert(sceReviewMarkup.includes('id="gamificationSoundsToggle"') && sceReviewMarkup.includes('id="gamificationAlertsToggle"'), 'configurações devem expor controles independentes para sons e alertas de gamificação');
assert(appSource.includes('medtutor_gamification_sounds_v1') && appSource.includes('medtutor_gamification_alerts_v1'), 'preferências de som e alertas devem persistir entre sessões');
assert(appSource.includes("award?.levelUp ? 'levelUp'") && appSource.includes("event?.outcome === 'correct' ? 'correct'") && appSource.includes("outcome: isCorrect ? 'correct' : 'incorrect'"), 'subida de nível e respostas corretas/incorretas devem iniciar os sons correspondentes');
assert(appSource.includes('function animateGamificationTopbar(previousState, nextState)') && appSource.includes('function animateCasinoCounter('), 'o total e a barra de XP devem avançar com animação durante a recompensa');
assert(appSource.includes('outcome: \'correct\'') && appSource.includes('gamification-reward-value'), 'a revisão de flashcard deve sincronizar o aviso de XP com o som e a contagem animada');
assert(appSource.includes('gamification-reward-icon') && appSource.includes('<svg viewBox="0 0 24 24"') && appSource.includes('gamification-reward-unit'), 'o aviso de XP deve renderizar um ícone visual estável e manter a unidade fora da contagem animada');
assert(sceReviewMarkup.includes('id="btnOpenClassmates"') && sceReviewMarkup.includes('id="btnOpenDoubts"') && sceReviewMarkup.includes('class="topbar-utility-action"') && !sceReviewMarkup.includes('class="classmates-fab"'), 'Colegas e Dúvidas devem ficar agrupados no cabeçalho, fora da área dos avisos flutuantes');
assert(appSource.includes('MedTutorGamificationPreferences.play(soundType).catch(() => false)') && !appSource.includes('soundStarted.finally'), 'áudio opcional não deve bloquear a aparição do card de XP ou da passagem de nível');
assert(appSource.includes('function ensureAppNotificationStack()') && !appSource.includes('showDiscreteExpensePopup') && !appSource.includes('discreteExpensePopup') && !sceReviewMarkup.includes('showLastExpensePopup') && appSource.includes('this.updateConfigModalUI();'), 'o card de custo não deve mais aparecer, mas o monitoramento detalhado permanece nas configurações');
assert(styleSource.includes('#appNotificationStack {') && appSource.includes('}, 5000);') && styleSource.includes('animation: gamificationRewardTimer 5s linear both'), 'o aviso de XP deve permanecer visível por pelo menos cinco segundos');
assert(sceReviewMarkup.includes('class="level-up-fireworks"') && sceReviewMarkup.includes('id="levelUpTransition"') && sceReviewMarkup.includes('id="levelUpProgressTrack"'), 'a passagem de nível deve mostrar transição, fogos discretos e progresso acumulado');
assert(sceReviewMarkup.includes('XP total') && sceReviewMarkup.includes('Tempo ativo de estudo') && !sceReviewMarkup.includes('id="levelUpCloseButton"'), 'o modal de nível mantém apenas dados da jornada e CTA, sem botão de fechar separado');
assert(appSource.includes("frontImageEl.innerHTML = renderStudySupportImage(item, { asStimulus: true });"), 'a frente do flashcard deve renderizar a figura sem revelar a explicação do gabarito');
const sceReviewCardRenderer = appSource.match(/function renderSceReviewCard\(card, index\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(sceReviewCardRenderer.includes('${stimulusImage}') && sceReviewCardRenderer.indexOf('${stimulusImage}') < sceReviewCardRenderer.indexOf('class="sce-review-answer"'), 'a figura do card SCE deve aparecer na frente, fora do gabarito oculto');
assert(sceReviewMarkup.includes('id="fcFrontImage"') && appBundleVersion, 'o espaço de imagem e o bundle de Flashcards devem estar presentes');
console.log('[PASS] Campos de recuperação ativa abrem vazios e botão de fechar do SCE tem tamanho acessível');

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
assert((appSource.includes("if (!item.disciplina || !Array.isArray(item.materias)) return;") || appSource.includes("if (!item.disciplina || !Array.isArray(item.materias)) continue;")) && !appSource.includes("if (item.origem !== 'gemini-upload') return;"), 'ementas legadas válidas devem continuar visíveis mesmo sem metadado de origem');
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
assert(chatSaveMethod.includes("collection('historico_chats')") && chatSaveMethod.includes('markCloudDataRevision(uid)'), 'alterações de chats devem ser salvas e sinalizadas para outros dispositivos');
assert(appSource.includes("collection('historico_chats').get()") && appSource.includes('getChatsCacheHydratedKey(uid)'), 'o histórico remoto deve ser importado inclusive em instalações antigas sem cache de chats');
assert(appSource.includes("classList.toggle('chat-view-active', tabId === 'chat')") && styleSource.includes('.view-content.chat-view-active'), 'a aba de chat deve ocupar toda a área de conteúdo disponível');
assert(styleSource.includes('border-radius: 0 !important') && webIndexMarkup.includes('20261005-announcements-admin-v1'), 'o chat deve ser full-bleed e os estilos devem invalidar a versão anterior em cache');
assert(styleSource.includes('chat-flow {\n    max-width: 1440px;') && webIndexMarkup.includes('20261005-announcements-admin-v1'), 'o fluxo do chat deve usar mais largura em telas grandes e invalidar o CSS anterior');
assert(webIndexMarkup.includes('family=Fredoka:wght@600;700') && styleSource.includes("font-family: 'Fredoka', 'Plus Jakarta Sans'"), 'o nível novo deve usar tipografia arredondada própria, com fallback da fonte principal');
assert(styleSource.includes('.topbar-utility-action { width: 40px;') && styleSource.includes('#appNotificationStack { bottom: calc(76px + env(safe-area-inset-bottom)); }') && !styleSource.includes('.doubts-fab,'), 'Colegas e Dúvidas devem sair da área flutuante inferior, e o aviso de XP deve ficar acima da navegação móvel');
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
assert(appSource.includes('supabaseStorageUnavailableUntil') && appSource.includes('clinicalImageStorageCircuitUntil'), 'upload de imagens precisa abrir circuito após falha para evitar uma tempestade de requisições');
assert(appSource.includes('startOperation') && appSource.includes("AppRequestFeedback.startOperation('Excluindo aulas'"), 'exclusões demoradas precisam exibir cartão de processamento ao estudante');
assert(appSource.includes('Deseja continuar processando?') && appSource.includes('return await taskPromise'), 'extrações demoradas precisam permitir que o estudante continue aguardando sem limite de tempo');
assert(indexContent.includes('hasSupabasePlaceholders'), 'valores de exemplo do Supabase não podem ser enviados ao navegador como configuração válida');
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
quizService.generateDerivedQuestion = async (payload) => {
  if (!payload.originalQuestion && !payload.originalExplanation) {
    const err = new Error('Pergunta ou explicação de referência não fornecida.');
    err.statusCode = 400;
    throw err;
  }
  if (!payload.contexts || payload.contexts.length === 0) {
    const err = new Error('Informe ao menos um novo contexto para a geração da pergunta derivada.');
    err.statusCode = 400;
    throw err;
  }
  return {
    success: true,
    question: {
      id: 'deriv_test_123',
      question: 'Questão derivada de teste?',
      quizOptions: ['A', 'B', 'C', 'D'],
      correctIndex: 0
    }
  };
};
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

    const derivedBad = await makeRequest('POST', '/api/quizzes/gerar-derivada', {});
    assert.strictEqual(derivedBad.statusCode, 400);
    console.log('[PASS] POST /api/quizzes/gerar-derivada sem contextos -> 400 Bad Request');

    const derivedGood = await makeRequest('POST', '/api/quizzes/gerar-derivada', {
      originalQuestion: 'Caso clínico base',
      originalExplanation: 'Gabarito base',
      contexts: ['Novo contexto teste']
    });
    assert.strictEqual(derivedGood.statusCode, 200);
    assert.strictEqual(derivedGood.body.success, true);
    console.log('[PASS] POST /api/quizzes/gerar-derivada com contextos -> 200 OK');

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
