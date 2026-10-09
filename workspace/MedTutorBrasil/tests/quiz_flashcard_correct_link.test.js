require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const quizzesService = require('../src/modules/quizzes/quizzes.service');

// Carrega o código do web/app.js e extrai resolveQuizCorrectIndex e healQuestionsBankIntegrity
const appJsPath = path.join(__dirname, '..', 'web', 'app.js');
const appJsSource = fs.readFileSync(appJsPath, 'utf8');

// Cria ambiente isolado para testar resolveQuizCorrectIndex e syncItemCorrectIndexMetadata
const vm = require('vm');
const sandbox = {
  console,
  Array,
  String,
  Number,
  parseInt,
  Math
};
vm.createContext(sandbox);

// Extrai as funções do app.js para execução no sandbox
const extractFunction = (source, fnName) => {
  const match = source.match(new RegExp(`function\\s+${fnName}\\s*\\([^{]*\\)\\s*\\{`));
  if (!match) throw new Error(`Função ${fnName} não encontrada em web/app.js`);
  const startIndex = match.index;
  let braceCount = 0;
  let endIndex = -1;
  for (let i = startIndex; i < source.length; i++) {
    if (source[i] === '{') braceCount++;
    else if (source[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  return source.substring(startIndex, endIndex);
};

const syncCode = extractFunction(appJsSource, 'syncItemCorrectIndexMetadata');
const resolveCode = extractFunction(appJsSource, 'resolveQuizCorrectIndex');
const healCode = extractFunction(appJsSource, 'healQuestionsBankIntegrity');

vm.runInContext(`${syncCode}\n${resolveCode}\n${healCode}`, sandbox);
const { resolveQuizCorrectIndex, syncItemCorrectIndexMetadata, healQuestionsBankIntegrity } = sandbox;

(async () => {
  console.log('🧪 Iniciando testes de Vínculo de Gabarito em Questões de Flashcard & Quiz...');

  // Cenário 1: Questão com correctIndex como string numérica "1" (deve resolver 1 e auto-sincronizar)
  const item1 = {
    id: 'test-q-1',
    question: 'Qual o fármaco indicado no choque anafilático?',
    quizOptions: ['Noradrenalina', 'Adrenalina intramuscular', 'Dopamina', 'Atropina'],
    correctIndex: '1' // String numérica
  };
  const resolvedIdx1 = resolveQuizCorrectIndex(item1);
  assert.strictEqual(resolvedIdx1, 1, 'Deve resolver índice 1 a partir da string "1"');
  assert.strictEqual(item1.gabarito, 'B', 'Deve sincronizar gabarito como "B"');
  assert.strictEqual(item1.correctAnswerText, 'Adrenalina intramuscular', 'Deve sincronizar correctAnswerText');
  assert(Array.isArray(item1.alternativas), 'Deve sincronizar alternativas');
  console.log('  [PASS] Cenário 1: String numérica "1" em correctIndex resolvida e sincronizada com sucesso.');

  // Cenário 2: Questão com gabarito textual "Opção C" ou letra pura "C" sem correctIndex
  const item2 = {
    id: 'test-q-2',
    question: 'Qual a lesão elementar clássica da psoríase vulgar?',
    quizOptions: ['Mácula hipercrômica', 'Vesícula agrupada', 'Placa eritematoescamosa', 'Pústula folicular'],
    gabarito: 'Opção C'
  };
  const resolvedIdx2 = resolveQuizCorrectIndex(item2);
  assert.strictEqual(resolvedIdx2, 2, 'Deve resolver índice 2 a partir de "Opção C"');
  assert.strictEqual(item2.correctIndex, 2, 'Deve salvar correctIndex numérico 2');
  assert.strictEqual(item2.correctAnswerText, 'Placa eritematoescamosa', 'Deve sincronizar texto da opção C');
  console.log('  [PASS] Cenário 2: Gabarito "Opção C" resolvido para índice 2 com sincronização.');

  // Cenário 3: Questão gerada a partir de Flashcard com resposta no flashcard.back
  const item3 = {
    id: 'test-q-3',
    question: 'Qual o mecanismo de ação da espironolactona?',
    quizOptions: [
      'Inibição do co-transportador Na-K-2Cl na alça de Henle',
      'Antagonismo competitivo dos receptores de aldosterona no túbulo coletor',
      'Bloqueio do cotransporte Na-Cl no túbulo contorcido distal',
      'Inibição da anidrase carbônica no túbulo proximal'
    ],
    flashcard: {
      front: 'Qual o mecanismo de ação da espironolactona?',
      back: 'Antagonismo competitivo dos receptores de aldosterona no túbulo coletor\n\n💡 Ponto-chave: poupador de potássio.'
    }
  };
  const resolvedIdx3 = resolveQuizCorrectIndex(item3);
  assert.strictEqual(resolvedIdx3, 1, 'Deve identificar a opção correta pelo verso do flashcard');
  assert.strictEqual(item3.correctIndex, 1, 'Deve definir correctIndex como 1');
  assert.strictEqual(item3.gabarito, 'B', 'Deve definir gabarito B');
  console.log('  [PASS] Cenário 3: Flashcard.back identificou corretamente a alternativa B do Quiz.');

  // Cenário 4: Questão com alternativas no campo options em vez de quizOptions
  const item4 = {
    id: 'test-q-4',
    question: 'Qual o tratamento de primeira linha para pneumonia adquirida na comunidade em paciente hígido ambulatorial?',
    options: ['Ceftriaxona EV', 'Amoxicilina oral', 'Ciprofloxacino oral', 'Vancomicina EV'],
    correct_index: 1
  };
  const resolvedIdx4 = resolveQuizCorrectIndex(item4);
  assert.strictEqual(resolvedIdx4, 1, 'Deve resolver correct_index com opções em item.options');
  assert(Array.isArray(item4.quizOptions), 'Deve preencher quizOptions a partir de options');
  assert.strictEqual(item4.gabarito, 'B', 'Deve preencher gabarito B');
  console.log('  [PASS] Cenário 4: Compatibilidade com item.options e correct_index.');

  // Cenário 5: Fallback seguro quando há 4 opções mas nenhum indicador específico
  const item5 = {
    id: 'test-q-5',
    question: 'Caso clínico sem metadado prévio',
    quizOptions: ['Conduta A', 'Conduta B', 'Conduta C', 'Conduta D']
  };
  const resolvedIdx5 = resolveQuizCorrectIndex(item5);
  assert(resolvedIdx5 >= 0 && resolvedIdx5 < 4, 'Nunca deve retornar -1 se houver opções no Quiz');
  assert.strictEqual(item5.gabarito, 'A', 'Fallback seguro define opção A como padrão');
  assert.strictEqual(item5.correctIndex, 0, 'Fallback seguro define índice 0');
  console.log('  [PASS] Cenário 5: Fallback seguro impede que todas as alternativas fiquem marcadas como erradas.');

  // Cenário 6: Auto-cura do banco de questões (healQuestionsBankIntegrity)
  const legacyBank = [
    { id: 'leg-1', question: 'Q1', quizOptions: ['A1', 'A2', 'A3', 'A4'], correctIndex: '2' },
    { id: 'leg-2', question: 'Q2', quizOptions: ['B1', 'B2', 'B3', 'B4'], gabarito: 'D' },
    { id: 'leg-3', question: 'Q3', options: ['C1', 'C2', 'C3', 'C4'], correctAnswerText: 'C2' }
  ];
  healQuestionsBankIntegrity(legacyBank);
  assert.strictEqual(legacyBank[0].correctIndex, 2);
  assert.strictEqual(legacyBank[0].gabarito, 'C');
  assert.strictEqual(legacyBank[1].correctIndex, 3);
  assert.strictEqual(legacyBank[1].gabarito, 'D');
  assert.strictEqual(legacyBank[2].correctIndex, 1);
  assert.strictEqual(legacyBank[2].gabarito, 'B');
  console.log('  [PASS] Cenário 6: Auto-cura healQuestionsBankIntegrity repara banco legado com integridade total.');

  // Cenário 7: Geração de Pergunta Derivada no backend
  const mockDerived = await quizzesService.generateDerivedQuestion({
    originalQuestion: 'Paciente com febre e sopro cardíaco novo pós-procedimento dentário.',
    originalExplanation: 'Endocardite infecciosa de valva nativa por Streptococcus viridans requer ampicilina ou ceftriaxona.',
    contexts: ['Paciente é alérgico a beta-lactâmicos com anafilaxia prévia.'],
    subject: 'Infectologia',
    topic: 'Endocardite Infecciosa'
  });
  assert(mockDerived.success, 'Backend deve retornar success: true');
  assert(mockDerived.question, 'Backend deve retornar question');
  const q = mockDerived.question;
  assert(typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4, 'correctIndex deve ser número entre 0 e 3');
  assert(/^[A-D]$/.test(q.gabarito), 'gabarito deve ser letra A, B, C ou D');
  assert.strictEqual(q.gabarito, ['A', 'B', 'C', 'D'][q.correctIndex], 'gabarito e correctIndex devem ser estritamente equivalentes');
  assert.strictEqual(q.correctAnswerText, q.quizOptions[q.correctIndex], 'correctAnswerText deve corresponder à opção indicada');
  assert.strictEqual(q.resposta_correta, q.quizOptions[q.correctIndex], 'resposta_correta deve corresponder à opção indicada');
  assert.strictEqual(q.answer, q.quizOptions[q.correctIndex], 'answer deve corresponder à opção indicada');
  assert(Array.isArray(q.alternativas) && q.alternativas.length === 4, 'alternativas deve conter 4 opções');
  assert(Array.isArray(q.options) && q.options.length === 4, 'options deve conter 4 opções');
  assert(q.pergunta && q.pergunta.length > 10, 'pergunta deve estar preenchida');
  
  // Testando o resolveQuizCorrectIndex na pergunta gerada pelo backend
  const backendResolved = resolveQuizCorrectIndex(q);
  assert.strictEqual(backendResolved, q.correctIndex, 'resolveQuizCorrectIndex deve resolver com precisão o gabarito da questão do backend');
  console.log(`  [PASS] Cenário 7: Pergunta derivada do backend gerada com gabarito sincronizado (Letra ${q.gabarito}, índice ${q.correctIndex}).`);

  console.log('🎉 Todos os testes de vínculo de gabarito para Flashcard & Quiz foram concluídos com sucesso!\n');
})().catch(err => {
  console.error('❌ Falha nos testes de vínculo de gabarito:', err);
  process.exit(1);
});
