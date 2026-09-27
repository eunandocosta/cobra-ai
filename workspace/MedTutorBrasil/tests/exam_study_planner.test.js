'use strict';

const assert = require('node:assert/strict');
const Planner = require('../web/exam-study-planner.js');

const materials = [
  { id: 'mat-1', name: 'Neuroanatomia', subject: 'Sistema Nervoso', period: '2º Período', cardCount: 30,
    sections: ['Tronco encefálico', 'Nervos cranianos', 'Vias motoras'] },
  { id: 'mat-2', name: 'Meninges', subject: 'Sistema Nervoso', period: '2º Período', textLength: 8000 }
];

assert.equal(Planner.parseLocalDate('2026-09-22').getDate(), 22);
assert.equal(Planner.parseLocalDate('2026-02-31'), null, 'datas impossíveis não devem ser normalizadas');
assert.equal(Planner.estimateMaterialMinutes({ cardCount: 30 }), 62);
assert.equal(Planner.isExamPlanExpired({ examDate: '2026-10-06' }, '2026-10-07'), false,
  'roteiro permanece salvo durante o dia seguinte à prova');
assert.equal(Planner.isExamPlanExpired({ examDate: '2026-10-06' }, '2026-10-08'), true,
  'roteiro expira ao iniciar o segundo dia após a prova');
assert.equal(Planner.planKey({ examDate: '2026-10-06', period: '2º Período', subject: 'Sistema Nervoso' }),
  Planner.planKey({ examDate: '2026-10-06', period: '2o periodo', subject: 'Sistema Nervoso' }),
  'variações de acento/símbolo devem localizar a mesma prova');
assert.notEqual(Planner.planKey({ examDate: '2026-10-06', period: '2º Período', subject: 'Sistema Nervoso' }),
  Planner.planKey({ examDate: '2026-10-06', period: '2º Período', subject: 'Sistema Tegumentar' }),
  'disciplinas diferentes podem ter provas independentes no mesmo dia');
assert.deepEqual(Planner.mergeMaterialsById(
  [{ id: 'mat-1', name: 'Neuroanatomia' }],
  [{ id: 'mat-1', name: 'Neuroanatomia atualizada' }, { id: 'mat-2', name: 'Meninges' }]
).map(material => material.id), ['mat-1', 'mat-2'], 'novos materiais devem ser acrescentados sem duplicar os já selecionados');

const plan = Planner.buildSchedule({ materials, examDate: '2026-10-06', dailyMinutes: 60, today: '2026-09-22' });
assert.equal(plan.ok, true);
assert.deepEqual(plan.materials.map(material => material.id), ['mat-1', 'mat-2']);
assert.ok(plan.tasks.some(task => task.kind === 'study'));
const completedStudyTaskId = `study:${encodeURIComponent('mat-1')}:1`;
const appendedMaterials = Planner.mergeMaterialsById(materials, [{ id: 'mat-3', name: 'Nervos cranianos', subject: 'Sistema Nervoso', period: '2º Período', textLength: 4000 }]);
const appendedPlan = Planner.buildSchedule({ materials: appendedMaterials, examDate: '2026-10-06', dailyMinutes: 60,
  today: '2026-09-22', completedTaskIds: [completedStudyTaskId] });
assert.deepEqual(appendedPlan.materials.map(material => material.id), ['mat-1', 'mat-2', 'mat-3'], 'adicionar material expande a mesma prova');
assert.equal(appendedPlan.tasks.find(task => task.id === completedStudyTaskId)?.completed, true, 'recalcular após adicionar material preserva tarefa concluída');
assert.ok(plan.tasks.some(task => task.kind === 'study' && task.focusSection), 'sessões devem priorizar títulos reais do material quando existirem');
assert.ok(plan.tasks.some(task => task.kind === 'review'), 'deve criar revisão cumulativa antes da prova');
const finalReview = plan.tasks.find(task => task.kind === 'final-review');
assert.equal(finalReview.date, '2026-10-05', 'a revisão geral fica na véspera');
assert.deepEqual(new Set(finalReview.materialIds), new Set(['mat-1', 'mat-2']));
assert.ok(plan.overloadedDays.every(day => day.minutes > plan.dailyMinutes));
for (let i = 1; i < plan.tasks.length; i++) {
  const previous = plan.tasks[i - 1];
  const current = plan.tasks[i];
  assert.ok(previous.date <= current.date, 'tarefas devem ficar em ordem cronológica');
  if (previous.date === current.date) {
    const rank = task => task.kind === 'study' ? 0 : task.kind === 'review' ? 1 : 2;
    assert.ok(rank(previous) <= rank(current), 'estudo precede revisão no mesmo dia');
  }
}

assert.equal(Planner.buildSchedule({ materials, examDate: '2026-09-22', today: '2026-09-22' }).ok, false);
assert.equal(Planner.buildSchedule({ materials: [], examDate: '2026-10-01', today: '2026-09-22' }).ok, false);

const latePlan = {
  examDate: '2026-09-28',
  dailyMinutes: 60,
  tasks: [
    { id: 'done', kind: 'study', date: '2026-09-20', minutes: 30, completed: true, materialIds: ['mat-1'] },
    { id: 'late-study', kind: 'study', date: '2026-09-21', minutes: 35, completed: false, materialIds: ['mat-1'] },
    { id: 'late-review', kind: 'review', date: '2026-09-21', minutes: 15, completed: false, materialIds: ['mat-1'] },
    { id: 'future', kind: 'study', date: '2026-09-25', minutes: 30, completed: false, materialIds: ['mat-2'] },
    { id: 'final', kind: 'final-review', date: '2026-09-27', minutes: 15, completed: false, materialIds: ['mat-1', 'mat-2'] }
  ]
};
const rescheduled = Planner.rescheduleIncompleteTasks(latePlan, '2026-09-23');
assert.equal(rescheduled.tasks.find(task => task.id === 'done').date, '2026-09-20', 'tarefas concluídas não são movidas');
assert.ok(rescheduled.tasks.find(task => task.id === 'late-study').date >= '2026-09-23');
assert.ok(rescheduled.tasks.find(task => task.id === 'late-review').date >= '2026-09-23');
assert.equal(rescheduled.tasks.find(task => task.id === 'final').date, '2026-09-27', 'revisão final preserva a véspera');
assert.ok(rescheduled.tasks.some(task => task.id === 'future'));

console.log('✅ Planejador de prova: datas, sessões, revisões e redistribuição validadas.');
