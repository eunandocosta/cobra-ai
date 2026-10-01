'use strict';

const assert = require('node:assert/strict');
const { splitTextForCompleteReading } = require('../src/modules/relatorios/revision.service');

const source = `${'A'.repeat(18000)}\n\n${'B'.repeat(21000)}\n\n${'C'.repeat(4000)}`;
const chunks = splitTextForCompleteReading(source, 18000, 700);
assert.ok(chunks.length > 2, 'documento longo deve ser dividido em vários trechos');
assert.equal(chunks[0].start, 0, 'a leitura deve começar no início do documento');
assert.equal(chunks.at(-1).end, source.trim().length, 'a leitura deve terminar no final do documento');
for (let index = 1; index < chunks.length; index += 1) {
  assert.ok(chunks[index].start <= chunks[index - 1].end, 'trechos adjacentes precisam ter sobreposição, sem lacunas');
}
for (const chunk of chunks) {
  assert.ok(chunk.end > chunk.start, 'cada trecho precisa cobrir caracteres');
  assert.ok(source.trim().slice(chunk.start, chunk.end).includes(chunk.content), 'o texto enviado precisa corresponder ao intervalo de origem');
}

console.log(`✅ Leitura integral: ${chunks.length} trechos sobrepostos cobrem ${source.trim().length.toLocaleString('pt-BR')} caracteres sem lacunas.`);
