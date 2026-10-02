'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const match = source.match(/function generateDescriptiveIndexForMaterial\(text, fileName, diseaseTopic, matchedSubject\) \{[\s\S]*?\n    \}\n\n    \/\/ 6\.3/);
assert.ok(match, 'o gerador do índice descritivo deve existir');
const functionSource = match[0].replace(/\n\n    \/\/ 6\.3[\s\S]*$/, '');
const generateIndex = new Function(`${functionSource}\nreturn generateDescriptiveIndexForMaterial;`)();

const index = generateIndex(
  'O texto descreve o sinal de Auspitz e sua observação após remoção da escama.',
  'Neuroanatomia e Cardiologia.pdf',
  'Acidente vascular cerebral',
  'Disciplina de Cardiologia'
);
assert.deepEqual(index.keyConcepts, ['Sinal de Auspitz'], 'conceitos devem ser extraídos apenas do corpo do material, nunca dos metadados');
assert.ok(index.sections.every(section => !/neuro|cardio|vascular|nervo craniano/i.test(`${section.title} ${section.description}`)), 'seções não podem herdar conceitos de outras disciplinas');
assert.match(index.summaryText, /exclusivamente no texto extraído/i, 'o resumo deve declarar a origem limitada ao texto');

const noConcepts = generateIndex(
  'Este arquivo aborda métodos de conservação de manuscritos históricos e catalogação.',
  'Aula de neurologia e cardiologia.pdf',
  'Dermatologia',
  'Medicina Clínica'
);
assert.deepEqual(noConcepts.keyConcepts, [], 'não se devem fabricar conceitos quando o corpo não contém conceitos reconhecidos');
assert.deepEqual(noConcepts.sections, [], 'não se devem fabricar eixos de especialidades para completar o índice');
assert.match(noConcepts.summaryText, /Nenhum tópico externo foi acrescentado/i);

console.log('✅ Índice descritivo: conceitos e seções limitados ao conteúdo textual enviado.');
