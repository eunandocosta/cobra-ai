(function attachMedTutorGamificationRules(root, factory) {
  const rules = factory();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  if (root) root.MedTutorGamificationRules = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMedTutorGamificationRules() {
  const FLASHCARD_XP = { easy: 8, medium: 10, hard: 12 };
  const QUIZ_XP = { easy: 2, medium: 3, hard: 4 };
  const OVERDUE_MULTIPLIER = 0.7;
  const DAILY_DECK_BONUS = { today: 8, overdue: 4 };
  const DAILY_COMBO_BONUS_CAP = 20;
  const MAX_COMBO_XP_PER_EVENT = 2;
  const COMBO_SESSION_GAP_MS = 30 * 60 * 1000;
  const MAX_STORED_DECKS = 20;
  const MAX_RECENT_EVENTS = 500;
  const MAX_STUDY_SESSIONS = 250;

  function normalizeDifficulty(value) {
    const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/avanc|dificil|hard|advanced/.test(normalized)) return 'hard';
    if (/inter|medium|moderad/.test(normalized)) return 'medium';
    return 'easy';
  }

  function baseXp({ kind, difficulty, reviewStatus = 'today' } = {}) {
    const level = normalizeDifficulty(difficulty);
    if (kind === 'flashcard') {
      const base = FLASHCARD_XP[level];
      return reviewStatus === 'overdue' ? Math.round(base * OVERDUE_MULTIPLIER) : base;
    }
    if (kind === 'quiz') return QUIZ_XP[level];
    return 0;
  }

  function createInitialState() {
    return {
      version: 1,
      totalXp: 0,
      totalStudySeconds: 0,
      studySessionProgress: {},
      combo: 0,
      lastActivityAt: null,
      lastActivityDay: '',
      comboBonusDay: '',
      comboBonusAwardedToday: 0,
      recentEventIds: [],
      dailyDecks: {}
    };
  }

  function normalizeState(value) {
    const state = value && typeof value === 'object' ? value : {};
    return {
      ...createInitialState(),
      ...state,
      version: 1,
      totalXp: Math.max(0, Math.floor(Number(state.totalXp) || 0)),
      totalStudySeconds: Math.max(0, Math.floor(Number(state.totalStudySeconds) || 0)),
      studySessionProgress: normalizeStudySessionProgress(state.studySessionProgress),
      combo: Math.max(0, Math.floor(Number(state.combo) || 0)),
      comboBonusAwardedToday: Math.max(0, Math.min(DAILY_COMBO_BONUS_CAP, Math.floor(Number(state.comboBonusAwardedToday) || 0))),
      recentEventIds: Array.isArray(state.recentEventIds) ? state.recentEventIds.map(String).slice(-MAX_RECENT_EVENTS) : [],
      dailyDecks: state.dailyDecks && typeof state.dailyDecks === 'object' ? state.dailyDecks : {}
    };
  }

  function normalizeStudySessionProgress(value) {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value)
      .filter(([id, entry]) => /^[a-z0-9-]{8,80}$/i.test(id) && entry && typeof entry === 'object')
      .map(([id, entry]) => [id, {
        seconds: Math.max(0, Math.floor(Number(entry.seconds) || 0)),
        updatedAt: Math.max(0, Number(entry.updatedAt) || 0)
      }])
      .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
      .slice(-MAX_STUDY_SESSIONS));
  }

  function applyStudyTimeProgress(previousState, sessionId, cumulativeSeconds, now = Date.now()) {
    const state = normalizeState(previousState);
    const id = String(sessionId || '').trim();
    const targetSeconds = Math.max(0, Math.floor(Number(cumulativeSeconds) || 0));
    if (!/^[a-z0-9-]{8,80}$/i.test(id) || !targetSeconds) return { state, duplicate: true, deltaSeconds: 0 };

    const previousSeconds = state.studySessionProgress[id]?.seconds || 0;
    const deltaSeconds = Math.max(0, targetSeconds - previousSeconds);
    if (!deltaSeconds) return { state, duplicate: true, deltaSeconds: 0 };

    state.totalStudySeconds += deltaSeconds;
    state.studySessionProgress[id] = { seconds: targetSeconds, updatedAt: Number(now) || Date.now() };
    state.studySessionProgress = normalizeStudySessionProgress(state.studySessionProgress);
    return { state, duplicate: false, deltaSeconds };
  }

  function getLevel(totalXp) {
    const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
    let level = 1;
    let xpAtLevelStart = 0;
    let xpToNextLevel = 150;
    let remaining = xp;
    while (remaining >= xpToNextLevel) {
      remaining -= xpToNextLevel;
      xpAtLevelStart += xpToNextLevel;
      level += 1;
      xpToNextLevel = 150 + ((level - 1) * 75);
    }
    return { level, xpIntoLevel: remaining, xpToNextLevel, xpAtLevelStart, totalXp: xp };
  }

  function applyEvent(previousState, event, now = Date.now()) {
    const state = normalizeState(previousState);
    const eventId = String(event?.eventId || '').trim();
    if (!eventId) return { state, duplicate: true, award: null };
    if (state.recentEventIds.includes(eventId)) return { state, duplicate: true, award: null };

    const dateKey = String(event.dayKey || new Date(now).toISOString().slice(0, 10));
    if (state.comboBonusDay !== dateKey) {
      state.comboBonusDay = dateKey;
      state.comboBonusAwardedToday = 0;
    }

    const lastActivityAt = Number(state.lastActivityAt) || 0;
    state.combo = lastActivityAt && state.lastActivityDay === dateKey && now - lastActivityAt <= COMBO_SESSION_GAP_MS
      ? state.combo + 1
      : 1;
    state.lastActivityAt = now;
    state.lastActivityDay = dateKey;

    const base = baseXp(event);
    const comboTarget = state.combo >= 5 ? 2 : (state.combo >= 3 ? 1 : 0);
    const comboBonus = Math.min(comboTarget, MAX_COMBO_XP_PER_EVENT, DAILY_COMBO_BONUS_CAP - state.comboBonusAwardedToday);
    state.comboBonusAwardedToday += comboBonus;

    let deckBonus = 0;
    let deckCompleted = false;
    if (event.kind === 'flashcard' && event.deck?.subjectKey && event.deck?.bucket && event.deck?.cardId) {
      const deckKey = `${dateKey}:${event.deck.subjectKey}:${event.deck.bucket}`;
      let deck = state.dailyDecks[deckKey];
      if (!deck) {
        const expectedIds = [...new Set((event.deck.expectedCardIds || []).map(String).filter(Boolean))];
        deck = state.dailyDecks[deckKey] = {
          dayKey: dateKey,
          subjectKey: String(event.deck.subjectKey),
          bucket: event.deck.bucket === 'overdue' ? 'overdue' : 'today',
          expectedCardIds: expectedIds,
          completedCardIds: [],
          bonusAwarded: false
        };
      }
      if (!deck.completedCardIds.includes(String(event.deck.cardId))) deck.completedCardIds.push(String(event.deck.cardId));
      deckCompleted = deck.expectedCardIds.length > 0 && deck.expectedCardIds.every(id => deck.completedCardIds.includes(id));
      if (deckCompleted && !deck.bonusAwarded) {
        deck.bonusAwarded = true;
        deckBonus = DAILY_DECK_BONUS[deck.bucket] || 0;
      }
      const deckEntries = Object.entries(state.dailyDecks);
      if (deckEntries.length > MAX_STORED_DECKS) {
        deckEntries.sort((a, b) => Number(a[1].bonusAwarded) - Number(b[1].bonusAwarded));
        while (Object.keys(state.dailyDecks).length > MAX_STORED_DECKS) delete state.dailyDecks[deckEntries.shift()[0]];
      }
    }

    const earnedXp = base + comboBonus + deckBonus;
    const previousLevel = getLevel(state.totalXp).level;
    state.totalXp += earnedXp;
    const currentLevel = getLevel(state.totalXp).level;
    state.recentEventIds.push(eventId);
    state.recentEventIds = state.recentEventIds.slice(-MAX_RECENT_EVENTS);

    return {
      state,
      duplicate: false,
      award: {
        base,
        comboBonus,
        deckBonus,
        earnedXp,
        combo: state.combo,
        deckCompleted,
        level: currentLevel,
        levelUp: currentLevel > previousLevel
      }
    };
  }

  return {
    FLASHCARD_XP,
    QUIZ_XP,
    DAILY_DECK_BONUS,
    DAILY_COMBO_BONUS_CAP,
    baseXp,
    createInitialState,
    normalizeState,
    applyStudyTimeProgress,
    getLevel,
    applyEvent
  };
});
