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
