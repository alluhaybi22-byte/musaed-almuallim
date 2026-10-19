import test from 'node:test';
import assert from 'node:assert/strict';
import { questionsFor } from '../src/questions.js';
import {
  DEFAULT_SETTINGS,
  facetSummary,
  skillProgress,
  localDateKey,
  trainingPlan,
} from '../src/domain.js';
const skill = {
  id: 'solar',
  title: 'يميز ال الشمسية والقمرية',
  domain: 'الكلمات والظواهر',
  grade: 2,
  kind: 'curriculum',
  source: { page: 18 },
};
function result(id, completedAt, bad = []) {
  const cards = questionsFor(skill);
  return {
    id,
    studentId: 'student',
    grade: 2,
    semester: 1,
    completedAt,
    cards,
    scoring: { ...DEFAULT_SETTINGS },
    answers: Object.fromEntries(
      cards.map((c, i) => [
        c.id,
        { score: bad.includes(i) ? 'incorrect' : 'independent' },
      ]),
    ),
  };
}
test('solar and lunar branches have balanced independent samples and reveal a hidden weakness', () => {
  const r = result('a', '2026-10-01', [5, 6, 7]);
  assert(r.cards.every((c) => c.instruction === 'حدد نوع ال: شمسية أم قمرية؟'));
  const summary = facetSummary(r);
  assert.deepEqual(
    summary.map((x) => [x.attempted, x.percent, x.limited]),
    [
      [5, 100, false],
      [5, 40, false],
    ],
  );
});
test('progress compares identical material and assessed items only, preserving old snapshots', () => {
  const old = result('old', '2026-10-01', [5, 6]);
  const now = result('now', '2026-10-02');
  assert.equal(skillProgress(now, [old, now])[0].delta, 20);
  const edited = structuredClone(now);
  edited.cards[0].display = 'الْجَبَلُ';
  assert.equal(skillProgress(edited, [old, edited])[0].delta, null);
  const skipped = structuredClone(now);
  skipped.answers[skipped.cards[0].id].score = 'not_assessed';
  assert.equal(skillProgress(skipped, [old, skipped])[0].delta, null);
  const thresholds = structuredClone(now);
  thresholds.scoring.mastery = 90;
  assert.equal(skillProgress(thresholds, [old, thresholds])[0].delta, null);
  assert.equal(old.cards[0].display, 'الْقَمَرُ');
});
test('listening and dictation include editable material and an explicit criterion for each card', () => {
  const cards = questionsFor({ ...skill, kind: 'listening' });
  assert.equal(new Set(cards.map((c) => c.teacherText)).size, 5);
  assert(
    cards.every(
      (c) =>
        c.display.includes('من الشخصية') && c.expected.includes('الإجابة:'),
    ),
  );
  const dictation = questionsFor({ ...skill, kind: 'dictation' });
  assert(
    dictation.every((c) => c.teacherText && c.expected.includes(c.teacherText)),
  );
});
test('a combined reading-and-writing outcome gives independent judgements without revealing dictation', () => {
  const cards = questionsFor({ ...skill, title: 'يقرأ ويكتب التنوين' });
  assert.equal(cards.length, 10);
  assert.equal(new Set(cards.map((c) => c.id)).size, 10);
  assert(
    cards.slice(0, 5).every((c) => c.facet === 'القراءة' && !c.teacherText),
  );
  assert(
    cards
      .slice(5)
      .every(
        (c) =>
          c.facet === 'الإملاء' &&
          c.teacherText &&
          !c.display.includes(c.teacherText),
      ),
  );
  const r = {
    cards,
    scoring: DEFAULT_SETTINGS,
    answers: Object.fromEntries(
      cards.map((c, i) => [
        c.id,
        { score: i < 5 ? 'independent' : 'incorrect' },
      ]),
    ),
  };
  assert.deepEqual(
    facetSummary(r).map((s) => s.percent),
    [100, 0],
  );
});
test('compound comprehension and transformations include every independently judged task', () => {
  for (const [title, expected] of [
    [
      'يحدد فكرة النص وصفة الشخصية بدليل',
      ['الفكرة الرئيسة', 'صفة الشخصية', 'الدليل من النص'],
    ],
    ['يحول بين الماضي والمضارع والأمر', ['الماضي', 'المضارع', 'الأمر']],
    ['يستخدم المفرد والمثنى والجمع', ['المفرد', 'المثنى', 'الجمع']],
  ]) {
    const cards = questionsFor({ ...skill, title });
    assert.deepEqual([...new Set(cards.map((c) => c.facet))], expected);
    assert(cards.every((c) => c.expected && c.instruction));
  }
});
test('date filtering respects the local day across UTC midnight', () => {
  assert.equal(
    localDateKey('2026-10-14T22:30:00Z', 'Asia/Riyadh'),
    '2026-10-15',
  );
  assert.equal(localDateKey('2026-10-14T22:30:00Z', 'UTC'), '2026-10-14');
});


test('training plan includes observed errors and assistance only, grouping each facet once', () => {
  const r = result('plan','2026-10-19',[5,6,7]);
  r.answers[r.cards[8].id].score = 'not_assessed';
  r.answers[r.cards[9].id].score = 'not_taught';
  r.answers[r.cards[5].id].score = 'assisted';
  const plan = trainingPlan(r);
  assert.equal(plan.length, 1);
  assert(plan[0].title.includes('الشمسية'));
  assert(plan[0].sample);
  assert.equal(trainingPlan(result('ok','2026-10-19')).length, 0);
});
