const assert = require('assert');
const rules = require('../web/gamification-rules');

function run() {
  assert.strictEqual(rules.baseXp({ kind: 'flashcard', difficulty: 'Fácil', reviewStatus: 'today' }), 8);
  assert.strictEqual(rules.baseXp({ kind: 'flashcard', difficulty: 'intermediario', reviewStatus: 'today' }), 10);
  assert.strictEqual(rules.baseXp({ kind: 'flashcard', difficulty: 'avancado', reviewStatus: 'overdue' }), 8);
  assert.strictEqual(rules.baseXp({ kind: 'quiz', difficulty: 'avancado' }), 4);
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

  console.log('✅ Regras de XP, níveis, deck diário, combo e idempotência validadas.');
}

run();
