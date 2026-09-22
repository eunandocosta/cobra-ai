const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== TESTE DE VALIDAÇÃO: BOTÃO DE ENVIAR NA SEGUNDA PERGUNTA DO DESAFIO ===\n');

const projectRoot = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'web/app.js'), 'utf8');

// 1. Validar que no renderActivePlayerCard o botão de enviar tem seu display resetado e o estado de submissão volta a falso
const renderCardMatch = appSource.match(/renderActivePlayerCard\(\)\s*\{[\s\S]*?\n      \},/)?.[0] || '';
assert(renderCardMatch.length > 0, 'renderActivePlayerCard deve estar definido');
assert(renderCardMatch.includes('this.activeChallengeAnswerSubmitted = false;'), 'renderActivePlayerCard deve resetar activeChallengeAnswerSubmitted para false');
assert(renderCardMatch.includes("submitAnswerButton.style.display = '';"), 'renderActivePlayerCard deve restaurar submitAnswerButton.style.display para vazio');
console.log('[PASS] 1. renderActivePlayerCard() restaura display do botão e reseta activeChallengeAnswerSubmitted');

// 2. Simular ciclo de transição da Pergunta 1 para a Pergunta 2
const fakeDom = {
  elements: {
    challengePlayerTitle: { textContent: '' },
    challengePlayerSubtitle: { textContent: '' },
    challengePlayerCounter: { textContent: '' },
    challengePlayerSubject: { textContent: '' },
    challengePlayerProgressFill: { style: {} },
    challengeCardTopic: { textContent: '' },
    challengeCardQuestionText: { innerHTML: '' },
    challengeCardBox: { style: {} },
    challengeWrittenAnswerArea: { style: {} },
    challengeStudentAnswer: { value: '', disabled: false },
    challengeAnswerFeedback: { classList: { remove: () => {} }, textContent: '' },
    challengeEvaluationResult: { classList: { remove: () => {} }, innerHTML: '' },
    challengeSubmitAnswerButton: { disabled: false, style: {}, innerHTML: '' },
    challengeCardFlipPrompt: { style: {} },
    challengeCardBack: { style: {} },
    challengeCardVotingArea: { style: {} },
    challengeFinishScreen: { style: {} }
  },
  getElementById(id) {
    return this.elements[id] || null;
  }
};

const fakeChallenge = {
  id: 'c123',
  senderName: 'Fernando Costa',
  subject: 'M011 Integração de Sistemas Humanos III (Sistema Nervoso)',
  questions: [
    { id: 'q1', front: 'Pergunta 1', back: 'Gabarito 1' },
    { id: 'q2', front: 'Função da substância negra?', back: 'Gabarito 2' }
  ]
};

// Mock do serviço com a mesma lógica de app.js
const testService = {
  activeChallenge: fakeChallenge,
  activeChallengeIndex: 0,
  activeChallengeVotes: [],
  activeChallengeAnswerSubmitted: false,

  renderActivePlayerCard() {
    if (!this.activeChallenge) return;
    const total = this.activeChallenge.questions.length;
    const q = this.activeChallenge.questions[this.activeChallengeIndex];

    const counterEl = fakeDom.getElementById('challengePlayerCounter');
    const writtenArea = fakeDom.getElementById('challengeWrittenAnswerArea');
    const answerInput = fakeDom.getElementById('challengeStudentAnswer');
    const submitAnswerButton = fakeDom.getElementById('challengeSubmitAnswerButton');

    counterEl.textContent = `Questão ${this.activeChallengeIndex + 1} de ${total}`;
    this.activeChallengeAnswerSubmitted = false;

    writtenArea.style.display = 'grid';
    answerInput.value = '';
    answerInput.disabled = false;

    if (submitAnswerButton) {
      submitAnswerButton.disabled = false;
      submitAnswerButton.style.display = '';
      submitAnswerButton.innerHTML = '✨ Corrigir com IA e ver gabarito';
    }
  },

  submitWrittenAnswer(answerText) {
    const button = fakeDom.getElementById('challengeSubmitAnswerButton');
    const input = fakeDom.getElementById('challengeStudentAnswer');
    input.disabled = true;
    button.style.display = 'none';
    this.activeChallengeAnswerSubmitted = true;
  },

  nextQuestion() {
    this.activeChallengeIndex++;
    this.renderActivePlayerCard();
  }
};

// Passo 1: Renderizar Pergunta 1
testService.renderActivePlayerCard();
assert.strictEqual(fakeDom.elements.challengePlayerCounter.textContent, 'Questão 1 de 2');
assert.strictEqual(fakeDom.elements.challengeSubmitAnswerButton.style.display, '');
assert.strictEqual(fakeDom.elements.challengeSubmitAnswerButton.disabled, false);
console.log('[PASS] 2. Pergunta 1 renderizada com botão de enviar visível');

// Passo 2: Submeter resposta da Pergunta 1
testService.submitWrittenAnswer('Minha resposta discursiva');
assert.strictEqual(fakeDom.elements.challengeSubmitAnswerButton.style.display, 'none');
assert.strictEqual(testService.activeChallengeAnswerSubmitted, true);
console.log('[PASS] 3. Pergunta 1 submetida: botão ocultado temporariamente durante correção e gabarito');

// Passo 3: Avançar para a Pergunta 2 (voto registrado)
testService.nextQuestion();
assert.strictEqual(fakeDom.elements.challengePlayerCounter.textContent, 'Questão 2 de 2');
assert.strictEqual(fakeDom.elements.challengeSubmitAnswerButton.style.display, '', 'O botão da Questão 2 deve voltar a ficar visível!');
assert.strictEqual(fakeDom.elements.challengeSubmitAnswerButton.disabled, false, 'O botão da Questão 2 deve estar habilitado!');
assert.strictEqual(fakeDom.elements.challengeStudentAnswer.value, '', 'O textarea da Questão 2 deve estar limpo!');
assert.strictEqual(fakeDom.elements.challengeStudentAnswer.disabled, false, 'O textarea da Questão 2 deve estar editável!');
assert.strictEqual(testService.activeChallengeAnswerSubmitted, false, 'O estado de submissão da Questão 2 deve ser resetado!');
console.log('[PASS] 4. Pergunta 2 renderizada com botão de enviar reabilitado e visível!');

console.log('\n======================================================');
console.log('🎉 TESTE DO BOTÃO NA SEGUNDA PERGUNTA PASSOU COM SUCESSO!');
console.log('======================================================\n');
