'use strict';

const assert = require('node:assert/strict');
const { mapWithConcurrency, withTransientAiRetry } = require('../src/modules/relatorios/revision-pipeline');

async function run() {
  let active = 0;
  let peak = 0;
  const ordered = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async value => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(ordered, [0, 2, 4, 6, 8, 10], 'a concorrência deve preservar a ordem original dos resultados');
  assert.equal(peak, 2, 'o pool deve respeitar o máximo de duas chamadas simultâneas');

  let calls = 0;
  let retries = 0;
  const value = await withTransientAiRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error('temporarily unavailable'), { status: 503 });
    return 'ok';
  }, {
    baseDelayMs: 1,
    maxDelayMs: 1,
    wait: async () => {},
    onRetry: () => { retries += 1; }
  });
  assert.equal(value, 'ok');
  assert.equal(calls, 3, 'a falha transitória deve receber duas novas tentativas');
  assert.equal(retries, 2);

  calls = 0;
  await assert.rejects(() => withTransientAiRetry(async () => {
    calls += 1;
    throw Object.assign(new Error('invalid request'), { status: 400 });
  }, { wait: async () => {} }));
  assert.equal(calls, 1, 'erros permanentes não devem ser repetidos');

  console.log('✅ Pipeline da revisão: concorrência limitada, ordem estável e retry transitório validados.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
