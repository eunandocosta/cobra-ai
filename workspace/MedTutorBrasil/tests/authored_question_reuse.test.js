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
        generateContent: async () => ({ response: { text: () => JSON.stringify([
          makeQuestion('Versão parafraseada pelo modelo que deve ser substituída.', 1, 'reaproveitada_da_fonte', 'Fascículo grácil e cuneiforme'),
          makeQuestion('Como a organização das colunas dorsais se relaciona ao trajeto sensitivo?', 0, 'inspirada_na_fonte', 'Transmissão de propriocepção e tato discriminativo')
        ]) } })
      };
    };

    const generated = await quizzesService.generateQuestions({
      materialText: `${sourceLine}\nAs fibras sobem ipsilateralmente pelas colunas dorsais até os núcleos grácil e cuneiforme no bulbo.`,
      quantidade: 1,
      generationMode: 'science_based',
      difficulty: 'balanced'
    });

    const reused = generated.find(item => item.sourceQuestionOrigin === 'reaproveitada_da_fonte');
    const inspired = generated.find(item => item.sourceQuestionOrigin === 'inspirada_na_fonte');
    assert(reused, 'A questão autoral deve ser mantida no resultado');
    assert.strictEqual(reused.question, 'No caso 1, qual estrutura anatômica conduz as fibras da coluna dorsal até o bulbo?');
    assert.strictEqual(reused.sourceQuestionText, sourceLine);
    assert(inspired, 'O lote também deve conter uma questão adicional inspirada');
    console.log('  [PASS] Questão autoral com "no caso 1" não é descartada pelo filtro de questões novas');
    console.log('  [PASS] Enunciado-fonte é preservado e questão inspirada permanece adicional');
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
