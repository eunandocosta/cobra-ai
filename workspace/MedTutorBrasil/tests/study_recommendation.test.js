require('dotenv').config();
const assert = require('assert');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const quizzesService = require('../src/modules/quizzes/quizzes.service');
const quizzesController = require('../src/modules/quizzes/quizzes.controller');

(async () => {
  console.log('🧪 Testando sugestão pedagógica de geração...');
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalGetModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  let capturedPrompt = '';

  try {
    process.env.GEMINI_API_KEY = 'test-api-key';
    GoogleGenerativeAI.prototype.getGenerativeModel = function (options) {
      assert.strictEqual(options.model, 'gemini-3.5-flash-lite');
      return {
        generateContent: async prompt => {
          capturedPrompt = prompt;
          return { response: { text: () => JSON.stringify({
            generationMode: 'science_based',
            examStyle: 'bloom',
            difficulty: 'balanced',
            suggestedCount: 12,
            confidence: 84,
            contentProfile: 'basico',
            rationale: 'O material enfatiza estruturas e relações conceituais.'
          }) } };
        }
      };
    };

    const result = await quizzesService.recommendStudyGeneration({ materials: [
      { name: 'Anatomia do tronco', text: 'Conteúdo real distribuído ao longo da aula. '.repeat(20) }
    ] });
    assert.strictEqual(result.generationMode, 'science_based');
    assert.strictEqual(result.suggestedCount, 12);
    assert.strictEqual(result.difficulty, 'balanced');
    assert.strictEqual(result.model, 'gemini-3.5-flash-lite');
    assert(capturedPrompt.includes('Conteúdo real distribuído'));
    console.log('  [PASS] Serviço prioriza Flash-Lite para recomendação e valida saída estruturada');

    await assert.rejects(
      () => quizzesService.recommendStudyGeneration({ materials: [{ name: 'Aula', text: 'curto' }] }),
      error => error.statusCode === 400
    );
    await assert.rejects(
      () => quizzesService.recommendStudyGeneration({ materials: [{ name: 'Aula', text: 'x'.repeat(12001) }] }),
      error => error.statusCode === 413
    );
    console.log('  [PASS] Serviço recusa amostras ausentes/curtas e excedentes');

    let status = 0;
    let body = null;
    await quizzesController.recommendStudyGeneration({ body: { materials: [{ name: 'Aula', text: 'curto' }] } }, {
      status(code) { status = code; return this; },
      json(value) { body = value; return this; }
    });
    assert.strictEqual(status, 400);
    assert(body.error);
    console.log('  [PASS] Controller responde com erro de validação explícito');
  } finally {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetModel;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalApiKey;
  }
  console.log('🎉 Testes de sugestão pedagógica concluídos.');
})().catch(error => {
  console.error('❌ Testes de sugestão pedagógica falharam:', error);
  process.exit(1);
});
