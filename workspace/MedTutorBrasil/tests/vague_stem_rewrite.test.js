const assert = require('node:assert/strict');
const { isVagueQuestionStem, rewriteVagueQuestionStems } = require('../src/modules/quizzes/vague-stem.rewrite');

const validators = {
  isValidStem: stem => stem.length >= 18 && /^\p{Lu}/u.test(stem) && /\?$/.test(stem),
  hasUnresolvedContext: () => false
};

assert.equal(isVagueQuestionStem('Quais os neurotransmissores envolvidos?'), true, 'enunciado genérico é vago');
assert.equal(isVagueQuestionStem('Quais neurotransmissores participam da via nigroestriatal que liga a substância negra ao estriado?'), false, 'enunciado com estrutura nomeada não é vago');

(async () => {
  const questions = [
    { pergunta: 'Quais os neurotransmissores envolvidos?', alternativas: ['A', 'B'], gabarito: 'A' },
    { pergunta: 'Quais neurotransmissores participam da via nigroestriatal que liga a substância negra ao estriado?', alternativas: ['A', 'B'], gabarito: 'A' }
  ];
  let calls = 0;
  const rewritten = await rewriteVagueQuestionStems(questions, {
    genAI: {}, materialText: 'Texto sobre a via nigroestriatal.', subject: 'Neuroanatomia', validators,
    modelOptions: {},
    generateWithFallback: async () => {
      calls++;
      return { result: { response: { text: () => JSON.stringify({ reescritas: [
        { indice: 0, pergunta: 'Quais neurotransmissores são liberados pela via nigroestriatal dos núcleos da base?' },
        { indice: 1, pergunta: 'Esta pergunta mudou sem motivo?' }
      ] }) } } };
    }
  });
  assert.equal(calls, 1, 'uma única chamada à IA para todos os enunciados genéricos');
  assert.equal(rewritten[0].pergunta, 'Quais neurotransmissores são liberados pela via nigroestriatal dos núcleos da base?', 'enunciado genérico é reescrito');
  assert.equal(rewritten[0].gabarito, 'A', 'gabarito é mantido');
  assert.equal(rewritten[1].pergunta, questions[1].pergunta, 'enunciado que já era bom não é alterado');

  const failing = await rewriteVagueQuestionStems(questions, {
    genAI: {}, materialText: '', subject: '', modelOptions: {}, validators,
    generateWithFallback: async () => { throw new Error('indisponível'); }
  });
  assert.equal(failing[0].pergunta, questions[0].pergunta, 'se a IA falhar, a pergunta original é mantida');
  console.log('  [PASS] Enunciado genérico é reescrito pela IA, com gabarito mantido, e sem reescrita quando a IA falha');
})().catch(error => { console.error(error); process.exit(1); });
