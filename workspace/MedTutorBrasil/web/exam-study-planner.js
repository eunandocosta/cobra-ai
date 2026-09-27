(function attachExamStudyPlanner(root, factory) {
  const planner = factory();
  if (typeof module === 'object' && module.exports) module.exports = planner;
  if (root) root.ExamStudyPlanner = planner;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createExamStudyPlanner() {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  function parseLocalDate(value) {
    if (value instanceof Date) {
      const date = new Date(value);
      date.setHours(0, 0, 0, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setHours(0, 0, 0, 0);
    if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function calendarDayDifference(from, to) {
    const start = parseLocalDate(from);
    const end = parseLocalDate(to);
    if (!start || !end) return null;
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endUtc - startUtc) / DAY_MS);
  }

  function reviewBucketForOffset(dayOffset) {
    const offset = Number(dayOffset);
    if (!Number.isFinite(offset)) return null;
    if (offset <= 0) return 'today';
    if (offset === 1) return 'tomorrow';
    if (offset === 2) return 'twoDays';
    if (offset === 3) return 'threeDays';
    if (offset === 4) return 'fourDays';
    return 'later';
  }

  function isExamPlanExpired(plan, today = new Date()) {
    const exam = parseLocalDate(plan?.examDate);
    const currentDay = parseLocalDate(today);
    if (!exam || !currentDay) return false;
    const purgeDay = addDays(exam, 2);
    return dateKey(currentDay) >= dateKey(purgeDay);
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizePlanLabel(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[º°]/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function planKey({ examDate = '', period = '', subject = '' } = {}) {
    return [String(examDate), normalizePlanLabel(period), normalizePlanLabel(subject)].join('|');
  }

  function mergeMaterialsById(existing = [], additions = []) {
    const byId = new Map();
    [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(additions) ? additions : [])]
      .filter(material => material && material.id != null && String(material.id).trim())
      .forEach(material => byId.set(String(material.id), material));
    return [...byId.values()];
  }

  function estimateMaterialMinutes(material) {
    const explicit = Number(material?.estimatedMinutes);
    if (Number.isFinite(explicit) && explicit > 0) return clamp(Math.ceil(explicit), 20, 150);
    const cardCount = Math.max(0, Number(material?.cardCount) || 0);
    if (cardCount) return clamp(20 + Math.ceil(cardCount * 1.4), 25, 120);
    const textLength = Math.max(0, Number(material?.textLength) || 0);
    if (textLength) return clamp(20 + Math.ceil(textLength / 2500 * 12), 25, 120);
    return 35;
  }

  function buildSchedule({ materials = [], examDate, dailyMinutes = 60, today = new Date(), completedTaskIds = [] } = {}) {
    const start = parseLocalDate(today);
    const exam = parseLocalDate(examDate);
    const cleanMaterials = (Array.isArray(materials) ? materials : []).filter(item => item && item.id && item.name);
    const cap = clamp(Math.round(Number(dailyMinutes) || 60), 20, 240);

    if (!start || !exam) return { ok: false, error: 'Informe uma data válida para a prova.' };
    if (exam <= start) return { ok: false, error: 'A prova precisa estar marcada para pelo menos amanhã.' };
    if (exam.getTime() - start.getTime() > 366 * DAY_MS) return { ok: false, error: 'Escolha uma data de prova dentro dos próximos 12 meses.' };
    if (!cleanMaterials.length) return { ok: false, error: 'Selecione ao menos um material de estudo.' };

    const completed = new Set((Array.isArray(completedTaskIds) ? completedTaskIds : []).map(String));
    const lastPrepDate = addDays(exam, -1);
    const prepDates = [];
    for (let date = new Date(start); date <= lastPrepDate; date = addDays(date, 1)) prepDates.push(new Date(date));
    if (prepDates.length === 0) prepDates.push(new Date(start));
    const finalReviewKey = dateKey(lastPrepDate);

    // Uma revisão cumulativa a cada quatro dias, além da revisão geral na véspera.
    const checkpointDates = prepDates.filter((date, index) => index >= 2 && index < prepDates.length - 1 && index % 4 === 2);
    const reviewKeys = new Set([...checkpointDates.map(dateKey), finalReviewKey]);
    let studyDates = prepDates.filter(date => !reviewKeys.has(dateKey(date)));
    // Em prazos muito curtos, permite estudar e revisar no mesmo dia, deixando a
    // sobrecarga explícita em vez de omitir material do roteiro.
    if (!studyDates.length) studyDates = [new Date(start)];

    const dayLoads = new Map(prepDates.map(date => [dateKey(date), 0]));
    const tasks = [];
    const materialCompletionDates = new Map();
    const lastPartDate = new Map();
    const sessionLimit = 35;

    cleanMaterials.forEach(material => {
      const totalMinutes = estimateMaterialMinutes(material);
      const partCount = Math.max(1, Math.ceil(totalMinutes / sessionLimit));
      const sectionTitles = (Array.isArray(material.sections) ? material.sections : [])
        .map(title => String(title || '').trim()).filter(Boolean).slice(0, 24);
      let remaining = totalMinutes;
      for (let part = 1; part <= partCount; part++) {
        const duration = Math.min(sessionLimit, remaining);
        remaining -= duration;
        const previousPartDate = lastPartDate.get(String(material.id));
        const eligibleDates = studyDates.filter(date => !previousPartDate || date >= previousPartDate);
        const candidates = eligibleDates.length ? eligibleDates : studyDates;
        const date = candidates.reduce((best, candidate) => {
          const currentLoad = dayLoads.get(dateKey(candidate)) || 0;
          const bestLoad = dayLoads.get(dateKey(best)) || 0;
          return currentLoad < bestLoad ? candidate : best;
        }, candidates[0]);
        const key = dateKey(date);
        const id = `study:${encodeURIComponent(String(material.id))}:${part}`;
        const sectionStart = Math.floor((part - 1) * sectionTitles.length / partCount);
        const sectionEnd = Math.floor(part * sectionTitles.length / partCount);
        const focusSection = sectionTitles.length
          ? sectionTitles.slice(sectionStart, Math.max(sectionStart + 1, sectionEnd)).join(' · ')
          : '';
        tasks.push({
          id,
          kind: 'study',
          date: key,
          minutes: duration,
          materialIds: [String(material.id)],
          materialName: String(material.name),
          subject: String(material.subject || ''),
          period: String(material.period || ''),
          focusSection,
          part,
          parts: partCount,
          completed: completed.has(id)
        });
        dayLoads.set(key, (dayLoads.get(key) || 0) + duration);
        lastPartDate.set(String(material.id), date);
        materialCompletionDates.set(String(material.id), date);
      }
    });

    const reviewDates = [...checkpointDates, lastPrepDate]
      .filter((date, index, list) => list.findIndex(item => dateKey(item) === dateKey(date)) === index);
    reviewDates.forEach((date, index) => {
      const isFinal = dateKey(date) === finalReviewKey;
      const coveredMaterials = cleanMaterials.filter(material => isFinal
        || (materialCompletionDates.get(String(material.id)) && materialCompletionDates.get(String(material.id)) <= date));
      if (!coveredMaterials.length) return;
      const materialIds = coveredMaterials.map(material => String(material.id));
      const id = isFinal ? 'review:final' : `review:spaced:${index + 1}`;
      const minutes = Math.min(90, Math.max(15, Math.ceil(materialIds.length * (isFinal ? 5 : 6))));
      const key = dateKey(date);
      tasks.push({
        id,
        kind: isFinal ? 'final-review' : 'review',
        date: key,
        minutes,
        materialIds,
        materialName: isFinal ? 'Revisão geral de todos os materiais' : 'Revisão cumulativa do conteúdo estudado',
        subject: '',
        period: '',
        completed: completed.has(id)
      });
      dayLoads.set(key, (dayLoads.get(key) || 0) + minutes);
    });

    const taskOrder = task => task.kind === 'study' ? 0 : (task.kind === 'review' ? 1 : 2);
    tasks.sort((a, b) => a.date.localeCompare(b.date)
      || taskOrder(a) - taskOrder(b)
      || a.materialName.localeCompare(b.materialName, 'pt-BR')
      || a.id.localeCompare(b.id));
    const overloadedDays = [...dayLoads.entries()]
      .filter(([, minutes]) => minutes > cap)
      .map(([date, minutes]) => ({ date, minutes, excessMinutes: minutes - cap }));

    return {
      ok: true,
      examDate: dateKey(exam),
      generatedAt: new Date().toISOString(),
      dailyMinutes: cap,
      materials: cleanMaterials.map(material => ({
        id: String(material.id), name: String(material.name), subject: String(material.subject || ''),
        period: String(material.period || ''), estimatedMinutes: estimateMaterialMinutes(material),
        cardCount: Math.max(0, Number(material.cardCount) || 0)
      })),
      tasks,
      overloadedDays,
      totalStudyMinutes: tasks.filter(task => task.kind === 'study').reduce((sum, task) => sum + task.minutes, 0),
      totalReviewMinutes: tasks.filter(task => task.kind !== 'study').reduce((sum, task) => sum + task.minutes, 0)
    };
  }

  function rescheduleIncompleteTasks(plan, today = new Date()) {
    if (!plan || !Array.isArray(plan.tasks)) return plan;
    const start = parseLocalDate(today);
    const exam = parseLocalDate(plan.examDate);
    if (!start || !exam || exam <= start) return plan;
    const lastPrepDate = addDays(exam, -1);
    const tasks = plan.tasks.map(task => ({ ...task, materialIds: [...(task.materialIds || [])] }));
    const loads = new Map();
    tasks.forEach(task => {
      if (!task.completed && task.date >= dateKey(start) && task.date <= dateKey(lastPrepDate)) {
        loads.set(task.date, (loads.get(task.date) || 0) + (Number(task.minutes) || 0));
      }
    });
    const taskOrder = task => task.kind === 'study' ? 0 : (task.kind === 'review' ? 1 : 2);
    const overdue = tasks.filter(task => !task.completed && task.kind !== 'final-review' && task.date < dateKey(start))
      .sort((a, b) => taskOrder(a) - taskOrder(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    overdue.forEach(task => {
      const candidates = [];
      for (let date = new Date(start); date <= lastPrepDate; date = addDays(date, 1)) candidates.push(dateKey(date));
      const cap = clamp(Math.round(Number(plan.dailyMinutes) || 60), 20, 240);
      const available = candidates.filter(key => (loads.get(key) || 0) + (Number(task.minutes) || 0) <= cap);
      const targetDates = available.length ? available : candidates;
      if (!targetDates.length) return;
      task.date = targetDates.reduce((best, key) => (loads.get(key) || 0) < (loads.get(best) || 0) ? key : best, targetDates[0]);
      loads.set(task.date, (loads.get(task.date) || 0) + (Number(task.minutes) || 0));
    });
    const overloadedDays = [...loads.entries()]
      .filter(([, minutes]) => minutes > (Number(plan.dailyMinutes) || 60))
      .map(([date, minutes]) => ({ date, minutes, excessMinutes: minutes - (Number(plan.dailyMinutes) || 60) }));
    return { ...plan, tasks, overloadedDays, generatedAt: new Date().toISOString() };
  }

  return { parseLocalDate, dateKey, calendarDayDifference, reviewBucketForOffset, isExamPlanExpired, estimateMaterialMinutes, planKey, mergeMaterialsById, buildSchedule, rescheduleIncompleteTasks };
});
