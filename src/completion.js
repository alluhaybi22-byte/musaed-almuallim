// Completion is scoped to a grade, semester, unit, lesson and assessed skill.
// A failed attempt counts as tested. Deferred, untaught and unassessed items do not.
const ATTEMPTED = new Set(['excellent', 'advanced', 'proficient', 'independent', 'assisted', 'incorrect']);

export function completionKey(scope, card) {
  if (!card?.skillId || !Number.isInteger(scope?.grade) || !Number.isInteger(scope?.semester) || !Number.isInteger(scope?.unit)) return '';
  const lesson = card.lessonId || card.contextLessonId || '';
  const skill = card.kind === 'lesson-reading'
    ? 'reading:' + (['single', 'sentences'].includes(card.readingLevel) ? 'sentences' : card.readingLevel)
    : card.lessonAssessment === 'dictation' ? 'dictation'
    : card.lessonAssessment === 'listening' ? 'listening'
    : card.skillId + ':' + (card.kind || 'task');
  return JSON.stringify([scope.grade, scope.semester, scope.unit, lesson, skill]);
}

export function completedSkills(results, studentId) {
  const done = new Set();
  for (const result of results) {
    if (result.studentId !== studentId || !result.completedAt || result.deferred) continue;
    const groups = new Map();
    for (const card of result.cards || []) {
      const key = completionKey(result, card);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    }
    for (const [key, cards] of groups) {
      if (cards.length && cards.every(c => ATTEMPTED.has(result.answers?.[c.id]?.score))) done.add(key);
    }
  }
  return done;
}

export function pendingPlanCards(state, plan, studentId) {
  const done = completedSkills(state.results, studentId);
  return (plan.cards || []).filter(card => !done.has(completionKey(plan, card)));
}

export function planSignature(plan) {
  return JSON.stringify([...new Set((plan.cards || []).map(c => completionKey(plan, c)))].sort());
}

export function eligibleRoster(state, plan, section, ids = null) {
  const order = ids ? [...new Set(ids)].map(id => state.students.find(s => s.id === id)).filter(Boolean) : state.students;
  return order.filter(s => !s.archived && s.grade === plan.grade && s.section === section && pendingPlanCards(state, plan, s.id).length);
}

export function instantiatePlan(state, plan, studentId, studentIndex = 0) {
  const pending = pendingPlanCards(state, plan, studentId);
  const pools = new Map(), cards = [];
  for (const card of pending) {
    if (card.readingLevel !== 'single') { cards.push(structuredClone(card)); continue; }
    const key = completionKey(plan, card);
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(card);
  }
  const rotations = [];
  for (const pool of pools.values()) {
    const index = Math.max(0, studentIndex) % pool.length;
    cards.push(structuredClone(pool[index]));
    rotations.push({index, pool: structuredClone(pool)});
  }
  return {cards, ...(rotations.length === 1 ? {sentenceRotation: rotations[0]} : rotations.length ? {sentenceRotations: rotations} : {})};
}

export function matchingDraft(state, plan, studentId) {
  return state.drafts.find(d => d.studentId === studentId && planSignature(d.sessionTemplate || d) === planSignature(plan) && pendingPlanCards(state, plan, studentId).length) || null;
}
