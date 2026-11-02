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

// Palavras comuns não podem virar conceitos de outra área.
const embryology = generateIndex('O embrião irá formar os folhetos. As células teriam origem no epiblasto e o processo é vago no início; o tecido acessório se forma na ponte entre estruturas.', 'a.pdf', '', '');
assert.deepEqual(embryology.keyConcepts, [], '"irá", "teriam", "vago", "acessório" e "ponte" não são IAM, KDIGO, nervos cranianos nem tronco encefálico');
const ards = generateIndex('A SARA (síndrome da angústia respiratória aguda) cursa com hipoxemia refratária.', 'a.pdf', '', '');
assert.ok(!ards.keyConcepts.some(concept => /reticular/i.test(concept)), 'SARA respiratória não é formação reticular');

// PowerPoint: título do slide vira seção e a descrição é a primeira frase do slide.
const pptx = generateIndex([
  '## Slide 1: Slide 1: Eletrocardiograma no infarto', '', 'Supradesnivelamento do segmento ST em derivações contíguas indica oclusão coronariana aguda.',
  '## Slide 2: Derivações e paredes', '', 'Parede inferior: DII, DIII e aVF.', 'Parede anterior: V1 a V4.',
  '## Slide 3', '', 'Troponina ultrassensível', 'Dosar na admissão e repetir em 1 a 3 horas.',
  '## Slide 4: Referências', '', 'Diretriz brasileira.'
].join('\n'), 'aula.pptx', '', '');
assert.deepEqual(pptx.sections.map(section => section.title), ['Eletrocardiograma no infarto', 'Derivações e paredes', 'Troponina ultrassensível'], 'títulos de slide, sem "Slide N:" e sem Referências');
assert.match(pptx.sections[0].description, /^Supradesnivelamento do segmento ST/, 'descrição vem do próprio slide');
assert.ok(pptx.sections.every(section => !/Conteúdo programático extraído/.test(section.description)), 'sem frase genérica fixa');
assert.match(pptx.summaryText, /\(4 slides\).*Aborda: Eletrocardiograma no infarto; Derivações e paredes/);

// PDF de slides sem marcação: primeira linha curta de cada bloco é o título.
const pdf = generateIndex([
  'Farmacocinética dos Antibióticos', 'Prof. Dr. João Silva - Universidade X', '',
  'Absorção e Biodisponibilidade', 'A biodisponibilidade oral dos betalactâmicos varia conforme a formulação e a presença de alimentos.', '',
  'Distribuição Tecidual', 'O volume de distribuição indica a extensão da distribuição tecidual.', 'Aminoglicosídeos têm baixo volume de distribuição.', '',
  'Concentração Inibitória Mínima', 'A concentração inibitória mínima orienta a dose.', 'Betalactâmicos dependem do tempo acima da concentração inibitória mínima.', '',
  'Referências', 'Goodman & Gilman.'
].join('\n'), 'farmaco.pdf', '', '');
assert.deepEqual(pdf.sections.map(section => section.title), ['Farmacocinética dos Antibióticos', 'Absorção e Biodisponibilidade', 'Distribuição Tecidual', 'Concentração Inibitória Mínima']);
assert.ok(!/Prof\.|Universidade/.test(pdf.sections[0].description), 'nome de professor e universidade não viram descrição');
assert.ok(pdf.keyConcepts.includes('Concentração inibitória mínima'), `conceitos repetidos no próprio texto entram no índice: ${pdf.keyConcepts}`);
assert.ok(!pdf.keyConcepts.some(concept => /indica|orienta/i.test(concept)), 'pedaços de frase com verbo não são conceitos');

console.log('✅ Índice descritivo: conceitos e seções limitados ao conteúdo textual enviado.');
