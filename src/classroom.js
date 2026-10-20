// Session helpers use saved records; legacy assessments without a session remain readable.
export function sessionRows(state, sessionId) {
  if (!sessionId) return [];
  const records = [...state.results, ...state.drafts].filter(r => r.sessionId === sessionId);
  const anchor = records[0];
  if (!anchor) return [];
  const ids = anchor.rosterIds || [anchor.studentId];
  return [...new Set(ids)].flatMap(id => {
    const student = state.students.find(s => s.id === id && s.grade === anchor.grade && (!anchor.sectionAtTest || s.section === anchor.sectionAtTest));
    if (!student) return [];
    const result = state.results.filter(r => r.sessionId === sessionId && r.studentId === id)
      .sort((a,b) => b.completedAt.localeCompare(a.completedAt))[0] || null;
    const draft = state.drafts.find(r => r.sessionId === sessionId && r.studentId === id) || null;
    return [{student, result, draft}];
  });
}
export function nextSessionStudent(state, current) {
  const student = state.students.find(s => s.id === current.studentId);
  if (!student) return null;
  const ids = current.rosterIds || state.students.filter(s => s.grade === current.grade && s.section === student.section).map(s => s.id);
  const index = ids.indexOf(current.studentId);
  if (index < 0) return null;
  for (const id of ids.slice(index + 1)) {
    const candidate = state.students.find(s => s.id === id && !s.archived && s.grade === current.grade && s.section === student.section);
    if (!candidate) continue;
    if (current.sessionId && state.results.some(r => r.sessionId === current.sessionId && r.studentId === id)) continue;
    if (current.sessionId && state.drafts.some(r => r.sessionId === current.sessionId && r.studentId === id && r.deferred)) continue;
    return candidate;
  }
  return null;
}
export function performanceCounts(result) {
  const counts = {};
  for (const card of result?.cards || []) {
    const score = result.answers?.[card.id]?.score;
    if (score) counts[score] = (counts[score] || 0) + 1;
  }
  return counts;
}
