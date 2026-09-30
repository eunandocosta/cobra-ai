require('dotenv').config();
const assert = require('assert');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const quizzesService = require('../src/modules/quizzes/quizzes.service');

(async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.MODEL_FAST;
  const originalGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  let capturedPrompt = '';

  try {
    process.env.GEMINI_API_KEY = 'test-api-key';
    process.env.MODEL_FAST = 'gemini-flashcard-evaluation-test';
    GoogleGenerativeAI.prototype.getGenerativeModel = function (options) {
      assert.strictEqual(options.model, 'gemini-flashcard-evaluation-test');
      return {
        generateContent: async prompt => {
          capturedPrompt = prompt;
          return { response: { text: () => JSON.stringify({
            accuracy: 100,
            score: 1,
            status: 'completamente_correta',
            strengths: 'Resposta cientificamente correta para o enunciado visível.',
            gaps: 'O enunciado poderia delimitar melhor a via pretendida.',
            feedback: 'Trato corticoespinhal é uma resposta válida; a pergunta está ampla.'
          }) } };
        }
      };
    };

    const evaluation = await quizzesService.evaluateFlashcardAnswer({
      question: 'Qual trato motor descendente da medula espinhal participa especificamente do controle dos movimentos dos membros?',
      referenceAnswer: 'Trato rubroespinhal',
      keyConcepts: ['trato rubroespinhal'],
      studentAnswer: 'Trato corticoespinhal'
    });

    assert.strictEqual(evaluation.accuracy, 100);
    assert.strictEqual(evaluation.score, 1);
    assert(capturedPrompt.includes('A resposta de referência é um gabarito esperado, NÃO uma lista exclusiva'));
    assert(capturedPrompt.includes('Não infira nem cobre alternativas que não estão no enunciado visível'));
    assert(capturedPrompt.includes('dê crédito integral'));
    console.log('✅ Avaliação do flashcard orienta aceitar respostas médicas corretas e sinalizar enunciado ambíguo.');
  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetModel;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.MODEL_FAST; else process.env.MODEL_FAST = originalModel;
  }
})().catch(error => {
  console.error('❌ Teste de avaliação discursiva falhou:', error);
  process.exit(1);
});
