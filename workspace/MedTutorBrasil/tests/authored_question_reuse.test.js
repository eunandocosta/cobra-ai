require('dotenv').config();
const assert = require('assert');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const quizzesService = require('../src/modules/quizzes/quizzes.service');

(async () => {
  console.log('🧪 Testando preservação integral de questão autoral...');
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalQuizModel = process.env.MODEL_QUIZ;
  const originalBalancedModel = process.env.MODEL_BALANCED;
  const originalGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  const sourceLine = 'Questão 1: No caso 1, qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?';
  let mockQuestions;
  const makeQuestion = (question, sourceIndex, origin, answer) => ({
    pergunta: question,
    alternativas: [answer, 'Alternativa incorreta A', 'Alternativa incorreta B', 'Alternativa incorreta C'],
    gabarito: 'A',
    texto_resposta_correta: answer,
    justificativa: `A resposta se apoia no conteúdo: ${answer}.`,
    analise_distratores: [
      { alternativa: 'Alternativa incorreta A', explicacao: 'Confunde a função descrita.' },
      { alternativa: 'Alternativa incorreta B', explicacao: 'Indica outra estrutura.' },
      { alternativa: 'Alternativa incorreta C', explicacao: 'Não corresponde ao trajeto.' }
    ],
    perola_clinica: 'Relacione estrutura e função.',
    titulo_flashcard: 'Trajeto das fibras',
    origem_pergunta: origin,
    indice_questao_fonte: sourceIndex,
    nivel_dificuldade: 'iniciante',
    secao_origem: 'Vias sensitivas',
    eixo_aprendizagem: 'base'
  });

  try {
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.MODEL_QUIZ = 'gemini-test-quiz';
    GoogleGenerativeAI.prototype.getGenerativeModel = function () {
      return {
        generateContent: async () => ({ response: { text: () => JSON.stringify(mockQuestions) } })
      };
    };

    mockQuestions = [
      makeQuestion('No caso 1, qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?', 0, 'reaproveitada_da_fonte', 'Fascículo grácil e cuneiforme'),
      makeQuestion('Como a organização das colunas dorsais se relaciona ao trajeto sensitivo?', 0, 'inspirada_na_fonte', 'Transmissão de propriocepção e tato discriminativo')
    ];
    const generated = await quizzesService.generateQuestions({
      materialText: `Caso 1: Homem de 19 anos apresenta perda sensitiva vibratória distal.\n${sourceLine}\nAs fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.`,
      quantidade: 1,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });

    const reused = generated.find(item => item.sourceQuestionOrigin === 'reaproveitada_da_fonte');
    const inspired = generated.find(item => item.sourceQuestionOrigin === 'inspirada_na_fonte');
    assert(reused, 'A questão autoral deve ser mantida no resultado');
    assert.strictEqual(reused.question, 'Contexto: Homem de 19 anos apresenta perda sensitiva vibratória distal. Qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?');
    assert.strictEqual(reused.sourceQuestionText, sourceLine);
    assert(inspired, 'O lote também deve conter uma questão adicional inspirada');
    console.log('  [PASS] Questão autoral com "no caso 1" e índice omitido é reconciliada pelo enunciado');
    console.log('  [PASS] Referência a caso é substituída pelos achados correspondentes da fonte');
    console.log('  [PASS] Questão inspirada permanece adicional');

    mockQuestions = [
      makeQuestion('Qual estrutura anexa da pele, responsável pela produção de secreção holócrina, é evidenciada na Figura 2 do material original?', 0, 'inspirada_na_fonte', 'Glândula sebácea'),
      makeQuestion('Qual estrutura está indicada na Figura 2?', 0, 'inspirada_na_fonte', 'Estrutura visual')
    ];
    const visualReferenceQuestions = await quizzesService.generateQuestions({
      materialText: 'As glândulas sebáceas produzem secreção holócrina.',
      quantidade: 2,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });
    assert.strictEqual(visualReferenceQuestions.length, 1, 'A questão impossível deve ser descartada sem eliminar as demais');
    assert.strictEqual(visualReferenceQuestions[0].question, 'Qual estrutura anexa da pele, responsável pela produção de secreção holócrina?');
    assert(!/Figura\s*2/i.test(visualReferenceQuestions[0].question), 'A referência à figura ausente deve sair do enunciado');
    console.log('  [PASS] Referência a figura removida quando o enunciado continua completo');
    console.log('  [PASS] Questão dependente exclusivamente de figura é descartada individualmente');

    const withoutCaseDetails = await quizzesService.generateQuestions({
      materialText: `${sourceLine}\nAs fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.`,
      quantidade: 1,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });
    assert.strictEqual(withoutCaseDetails.length, 1, 'A questão com contexto não recuperável deve ser descartada sem cancelar o lote');
    assert.strictEqual(withoutCaseDetails[0].sourceQuestionOrigin, 'inspirada_na_fonte');
    console.log('  [PASS] Sem contexto recuperável, apenas a questão problemática é descartada');

    mockQuestions = [
      makeQuestion('sintoma do paciente está associado a cada um deles?', 0, 'inspirada_na_fonte', 'Relação anatômico-funcional'),
      makeQuestion('(ipsilateral) ou do lado oposto (contralateral) à lesão?', 0, 'inspirada_na_fonte', 'Depende do nível de decussação'),
      makeQuestion('Como a decussação da via determina o lado do déficit sensitivo?', 0, 'inspirada_na_fonte', 'A decussação define se o déficit é ipsilateral ou contralateral')
    ];
    const completeQuestions = await quizzesService.generateQuestions({
      materialText: 'As fibras da via cruzam na decussação sensitiva e seguem pelo lado oposto.',
      quantidade: 3,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });
    assert.strictEqual(completeQuestions.length, 1, 'Fragmentos devem ser descartados individualmente');
    assert.strictEqual(completeQuestions[0].question, 'Como a decussação da via determina o lado do déficit sensitivo?');
    console.log('  [PASS] Fragmentos iniciados em minúscula ou parênteses são descartados; questão completa é mantida');
  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetModel;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalQuizModel === undefined) delete process.env.MODEL_QUIZ; else process.env.MODEL_QUIZ = originalQuizModel;
    if (originalBalancedModel === undefined) delete process.env.MODEL_BALANCED; else process.env.MODEL_BALANCED = originalBalancedModel;
  }
  console.log('🎉 Testes de reaproveitamento de questão autoral concluídos.');
})().catch(error => {
  console.error('❌ Teste de questão autoral falhou:', error);
  process.exit(1);
});
