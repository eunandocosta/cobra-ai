'use strict';

const assert = require('node:assert/strict');

async function run() {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'test-only-key';
  let calls = 0;
  global.fetch = async url => {
    calls += 1;
    assert.match(String(url), /generativelanguage\.googleapis\.com\/v1beta\/models/);
    assert.match(String(url), /key=test-only-key/);
    return {
      ok: true,
      json: async () => ({ models: [
        { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.9-flash-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.6-flash-lite', supportedGenerationMethods: ['embedContent'] }
      ] })
    };
  };

  try {
    const service = require('../src/modules/chat/chat.service');
    const catalog = await service.listAvailableModels();
    assert.deepEqual(catalog, ['gemini-3.8-flash', 'gemini-3.7-flash']);
    assert.deepEqual(await service.listAvailableModels(), catalog);
    assert.equal(calls, 1, 'o catálogo deve permanecer em cache e evitar chamadas repetidas ao Google');
    console.log('[PASS] Catálogo do chat acompanha modelos Flash estáveis e ignora versões preview/incompatíveis');
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
