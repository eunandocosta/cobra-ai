'use strict';

const assert = require('assert');
const { hasVisualLocator, removeUnsupportedVisualLocator } = require('../src/modules/quizzes/visual-reference.guard');

const referencedFigure = 'Qual estrutura anexa da pele, responsável pela produção de secreção holócrina, é evidenciada na Figura 2 do material original?';
const cleanedFigureQuestion = removeUnsupportedVisualLocator(referencedFigure);
assert.strictEqual(cleanedFigureQuestion, 'Qual estrutura anexa da pele, responsável pela produção de secreção holócrina?');
assert.strictEqual(hasVisualLocator(cleanedFigureQuestion), false, 'Pergunta saneada não deve carregar localizador visual');

assert.strictEqual(removeUnsupportedVisualLocator('Qual estrutura está indicada na Figura 2?'), null,
  'Descarta pergunta que fica vaga sem a figura');
assert.strictEqual(removeUnsupportedVisualLocator('Qual sequência é apresentada na página 3?'), null,
  'Descarta pergunta que continua dependendo do conteúdo visual após remover a página');
assert.strictEqual(removeUnsupportedVisualLocator('Como a secreção holócrina é produzida pelas glândulas sebáceas?'),
  'Como a secreção holócrina é produzida pelas glândulas sebáceas?', 'Perguntas sem localizador devem permanecer intactas');
assert.strictEqual(removeUnsupportedVisualLocator('Como o quadro clínico da doença se manifesta?'),
  'Como o quadro clínico da doença se manifesta?', 'A expressão médica "quadro clínico" não é uma referência a quadro/tabela');
assert.strictEqual(removeUnsupportedVisualLocator('Qual achado de imagem é descrito no laudo radiológico?'),
  'Qual achado de imagem é descrito no laudo radiológico?', 'Imagem como modalidade clínica não deve ser confundida com figura do documento');
assert.strictEqual(removeUnsupportedVisualLocator('Compare as estruturas observadas na Figura 2 com a Figura 3?'), null,
  'Descarta referência visual no meio da pergunta que não pode ser removida com segurança');

console.log('✅ Referências visuais ausentes são removidas somente quando o enunciado permanece autossuficiente.');

// Perguntas que dependem de imagem do material são descartadas, não só limpas.
const { dependsOnMaterialImage } = require('../src/modules/quizzes/visual-reference.guard');
const fromCard = 'Quais estruturas anatômicas são visualizadas na representação virtual das imagens extraídas do material em relação aos núcleos da base?';
assert.strictEqual(removeUnsupportedVisualLocator(fromCard), null, 'pergunta do cartão "representação virtual das imagens extraídas" é descartada');
assert.strictEqual(removeUnsupportedVisualLocator('Quais estruturas são observadas nas figuras enviadas pelo estudante?'), null, 'figuras enviadas pelo estudante não sustentam o cartão');
assert.strictEqual(dependsOnMaterialImage('Qual achado é observado na tomografia de crânio de um paciente com cefaleia?'), false, 'exame clínico descrito no enunciado continua válido');
assert.strictEqual(removeUnsupportedVisualLocator('Qual achado é observado na tomografia de crânio de um paciente com cefaleia?'),
  'Qual achado é observado na tomografia de crânio de um paciente com cefaleia?', 'exame clínico não é descartado');
console.log('✅ Enunciados que dependem de imagem do material são descartados; exames clínicos continuam.');

// Referências por número/letra/seta e "primeira imagem clínica integrada" dependem de imagem.
assert.strictEqual(removeUnsupportedVisualLocator('Qual é a estrutura anatômica identificada pelo número 2?'), null, 'pergunta que aponta por número depende da imagem');
assert.strictEqual(removeUnsupportedVisualLocator('Qual estrutura neuroanatômica está em destaque na primeira imagem clínica integrada extraída do material?'), null, 'primeira imagem integrada do material não se sustenta sozinha');
assert.strictEqual(removeUnsupportedVisualLocator('Qual é o neurotransmissor liberado pela via nigroestriatal?'),
  'Qual é o neurotransmissor liberado pela via nigroestriatal?', 'pergunta de conteúdo continua válida');
console.log('✅ Perguntas que apontam para imagem por número, letra ou posição também são descartadas.');
