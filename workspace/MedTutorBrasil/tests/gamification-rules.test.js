const assert = require('assert');
const rules = require('../web/gamification-rules');

function run() {
  assert.strictEqual(rules.baseXp({ kind: 'flashcard', difficulty: 'Fácil', reviewStatus: 'today' }), 8);
  assert.strictEqual(rules.baseXp({ kind: 'flashcard', difficulty: 'intermediario', reviewStatus: 'today' }), 10);
  assert.strictEqual(rules.baseXp({ kind: 'flashcard', difficulty: 'avancado', reviewStatus: 'overdue' }), 8);
  assert.strictEqual(rules.baseXp({ kind: 'quiz', difficulty: 'avancado' }), 4);
  assert.deepStrictEqual(rules.QUIZ_MISTAKE_PENALTY_XP, { easy: 1, medium: 2, hard: 3 });
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const flashcard = rules.baseXp({ kind: 'flashcard', difficulty, reviewStatus: 'overdue' });
    const quizMaximum = rules.baseXp({ kind: 'quiz', difficulty }) + 2;
    assert.ok(quizMaximum < flashcard, `Quiz deve render menos que flashcard atrasado (${difficulty})`);
  }

  const levelOne = rules.getLevel(0);
  const levelTwo = rules.getLevel(150);
  const levelThree = rules.getLevel(375);
  assert.deepStrictEqual([levelOne.level, levelOne.xpToNextLevel], [1, 150]);
  assert.deepStrictEqual([levelTwo.level, levelTwo.xpToNextLevel], [2, 225]);
  assert.strictEqual(levelThree.level, 3);

  let state = rules.createInitialState();
  assert.strictEqual(state.totalStudySeconds, 0);
  let timeResult = rules.applyStudyTimeProgress(state, 'session-study-001', 35, 1000);
  state = timeResult.state;
  assert.strictEqual(timeResult.deltaSeconds, 35);
  assert.strictEqual(state.totalStudySeconds, 35);
  timeResult = rules.applyStudyTimeProgress(state, 'session-study-001', 35, 2000);
  assert.strictEqual(timeResult.duplicate, true);
  assert.strictEqual(state.totalStudySeconds, 35);
  timeResult = rules.applyStudyTimeProgress(state, 'session-study-001', 80, 3000);
  assert.strictEqual(timeResult.deltaSeconds, 45);
  state = timeResult.state;
  timeResult = rules.applyStudyTimeProgress(state, 'session-study-002', 20, 4000);
  assert.strictEqual(timeResult.deltaSeconds, 20);
  state = timeResult.state;
  assert.strictEqual(state.totalStudySeconds, 100);
  assert.strictEqual(rules.applyStudyTimeProgress(state, 'invalid', 100, 5000).deltaSeconds, 0);

  state = rules.createInitialState();
  let outcome;
  const expected = ['c1', 'c2'];
  outcome = rules.applyEvent(state, {
    eventId: 'day-fc-c1', dayKey: '2026-10-02', kind: 'flashcard', difficulty: 'easy', reviewStatus: 'today',
    deck: { subjectKey: 'm009', bucket: 'today', cardId: 'c1', expectedCardIds: expected }
  }, 1_000_000);
  state = outcome.state;
  assert.strictEqual(outcome.award.deckBonus, 0);
  outcome = rules.applyEvent(state, {
    eventId: 'day-fc-c2', dayKey: '2026-10-02', kind: 'flashcard', difficulty: 'medium', reviewStatus: 'today',
    deck: { subjectKey: 'm009', bucket: 'today', cardId: 'c2', expectedCardIds: expected }
  }, 1_001_000);
  state = outcome.state;
  assert.strictEqual(outcome.award.deckBonus, 8);
  assert.strictEqual(outcome.award.deckCompleted, true);
  const duplicate = rules.applyEvent(state, {
    eventId: 'day-fc-c2', dayKey: '2026-10-02', kind: 'flashcard', difficulty: 'medium', reviewStatus: 'today',
    deck: { subjectKey: 'm009', bucket: 'today', cardId: 'c2', expectedCardIds: expected }
  }, 1_002_000);
  assert.strictEqual(duplicate.duplicate, true);
  assert.strictEqual(duplicate.state.totalXp, state.totalXp);

  state = rules.createInitialState();
  const comboResults = [];
  for (let index = 0; index < 30; index += 1) {
    outcome = rules.applyEvent(state, { eventId: `combo-${index}`, dayKey: '2026-10-02', kind: 'quiz', difficulty: 'easy' }, 2_000_000 + index * 1_000);
    state = outcome.state;
    comboResults.push(outcome.award.comboBonus);
  }
  assert.strictEqual(comboResults[0], 0);
  assert.strictEqual(comboResults[1], 0);
  assert.strictEqual(comboResults[2], 1);
  assert.strictEqual(comboResults[4], 2);
  assert.strictEqual(comboResults.reduce((sum, points) => sum + points, 0), 20);

  outcome = rules.applyEvent(state, { eventId: 'new-day', dayKey: '2026-10-03', kind: 'quiz', difficulty: 'easy' }, 2_001_000);
  assert.strictEqual(outcome.award.combo, 1);
  assert.strictEqual(outcome.award.comboBonus, 0);
  assert.strictEqual(outcome.state.comboBonusAwardedToday, 0);

  state = rules.createInitialState();
  state.totalXp = 20;
  for (const [index, difficulty, penalty] of [[0, 'easy', 1], [1, 'medium', 2], [2, 'hard', 3]]) {
    outcome = rules.applyEvent(state, {
      eventId: `wrong-${index}`,
      dayKey: '2026-10-03',
      kind: 'quiz',
      difficulty,
      outcome: 'incorrect'
    }, 3_000_000 + index * 1_000);
    assert.strictEqual(outcome.award.earnedXp, -penalty, `Resposta errada ${difficulty} deve remover ${penalty} XP`);
    assert.strictEqual(outcome.award.comboBonus, 0, 'Resposta errada não deve receber bônus de combo');
    assert.strictEqual(outcome.state.totalXp, state.totalXp - penalty);
    state = outcome.state;
  }
  assert.strictEqual(state.combo, 0, 'Resposta errada deve quebrar o combo');
  const duplicatePenalty = rules.applyEvent(state, {
    eventId: 'wrong-2', dayKey: '2026-10-03', kind: 'quiz', difficulty: 'hard', outcome: 'incorrect'
  }, 3_004_000);
  assert.strictEqual(duplicatePenalty.duplicate, true, 'Penalidade duplicada deve ser idempotente');
  assert.strictEqual(duplicatePenalty.state.totalXp, state.totalXp);

  state.totalXp = 1;
  outcome = rules.applyEvent(state, {
    eventId: 'wrong-floor', dayKey: '2026-10-03', kind: 'quiz', difficulty: 'hard', outcome: 'incorrect'
  }, 3_005_000);
  assert.strictEqual(outcome.award.earnedXp, -1, 'A penalidade deve ser limitada ao XP disponível');
  assert.strictEqual(outcome.state.totalXp, 0, 'O XP total não pode ficar negativo');

  console.log('✅ Regras de XP, níveis, deck diário, combo e idempotência validadas.');
}

run();
