'use strict';

const assert = require('node:assert/strict');
const { selectTopicallyRelevantMaterials, normalizeTopicText } = require('../src/modules/relatorios/revision-relevance');

assert.equal(normalizeTopicText('Síndrome de Stevens–Johnson'), 'sindrome de stevens johnson');

const source = `O trato corticoespinhal lateral cruza na decussação das pirâmides e participa do controle voluntário dos movimentos finos dos membros. Lesões medulares podem causar déficit motor abaixo do nível acometido.`;
const materials = [
  { name: 'Vias motoras descendentes', text: 'O trato corticoespinhal lateral controla movimentos voluntários dos membros e cruza na decussação piramidal.' },
  { name: 'Imunidade inata', text: 'Receptores Toll reconhecem padrões moleculares e iniciam a produção de citocinas inflamatórias.' },
  { name: 'Semiologia neurológica', text: 'Avaliação dos membros, movimentos voluntários, trato corticoespinhal lateral e sinais de lesão medular.' }
];

const result = selectTopicallyRelevantMaterials(source, materials);
assert.deepEqual(result.map(item => item.relevant), [true, false, true]);
assert.ok(result[0].matches >= 3);

const broadSource = 'Introdução geral à medicina e conceitos básicos de saúde.';
assert.equal(selectTopicallyRelevantMaterials(broadSource, materials).some(item => item.relevant), false);

console.log('✅ Filtro temático da revisão: fontes pertinentes incluídas e assunto alheio excluído.');
