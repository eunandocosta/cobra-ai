const assert = require('assert');
const {
  GENERAL_FLASH_MODELS,
  IMAGE_FLASH_MODELS,
  generateContentWithFallback
} = require('../src/shared/gemini-model-fallback');

async function run() {
  assert.deepStrictEqual(GENERAL_FLASH_MODELS, [
    'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'
  ]);
  assert.deepStrictEqual(IMAGE_FLASH_MODELS, ['gemini-3.5-flash', 'gemini-3.6-flash']);

  const attempted = [];
  const fakeGenAI = {
    getGenerativeModel({ model }) {
      return {
        async generateContent() {
          attempted.push(model);
          if (model === IMAGE_FLASH_MODELS[0]) {
            const error = new Error('Model not found');
            error.status = 404;
            throw error;
          }
          return { response: { text: () => 'ok' } };
        }
      };
    }
  };
  const generated = await generateContentWithFallback(fakeGenAI, {}, 'test', IMAGE_FLASH_MODELS);
  assert.deepStrictEqual(attempted, IMAGE_FLASH_MODELS);
  assert.strictEqual(generated.modelName, 'gemini-3.6-flash');

  let requestCount = 0;
  const invalidInputGenAI = {
    getGenerativeModel() {
      return { async generateContent() { requestCount += 1; const error = new Error('invalid input'); error.status = 400; throw error; } };
    }
  };
  await assert.rejects(() => generateContentWithFallback(invalidInputGenAI, {}, 'bad input', IMAGE_FLASH_MODELS));
  assert.strictEqual(requestCount, 1, 'erros de payload não devem disparar tentativas redundantes em outros modelos');

  console.log('✅ Prioridade Flash geral, prioridade de imagem e fallback por indisponibilidade validados.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
