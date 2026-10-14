import test from 'node:test';
import assert from 'node:assert/strict';
import { inferRosterColumns, rosterFromRows } from '../src/roster-file.js';
import { nextRosterStudent, rosterFromText } from '../src/domain.js';
test('Arabic roster title and serial column do not become student names', () => {
  const rows = [
    ['مدرسة تجريبية'],
    ['رقم', 'ولي الأمر', 'اسم الطالب'],
    [1, 'ولي ألف', 'طالب ألف'],
    [2, 'ولي باء', 'طالب باء'],
    ['', '', 'عدد الطلاب: ٢'],
  ];
  const m = inferRosterColumns(rows);
  assert.deepEqual(m, { nameColumn: 2, guardianColumn: 1, startRow: 2 });
  assert.deepEqual(
    rosterFromRows(rows, m, 1, 'أ').map((x) => [x.name, x.guardian]),
    [
      ['طالب ألف', 'ولي ألف'],
      ['طالب باء', 'ولي باء'],
    ],
  );
});
test('headerless names with serial numbers select the text column', () => {
  const rows = [
    [1, 'طالب ألف'],
    [2, 'طالب باء'],
  ];
  const m = inferRosterColumns(rows);
  assert.equal(m.nameColumn, 1);
  assert.equal(rosterFromRows(rows, m, 2, 'ب').length, 2);
});
test('next student follows saved roster order and skips archived or other-section records, without wrapping', () => {
  const students = [
    { id: 'a', grade: 1, section: 'أ' },
    { id: 'b', grade: 1, section: 'ب' },
    { id: 'c', grade: 1, section: 'أ', archived: true },
    { id: 'd', grade: 1, section: 'أ' },
  ];
  const r = { studentId: 'a', grade: 1, rosterIds: ['a', 'b', 'c', 'd'] };
  assert.equal(nextRosterStudent(students, r).id, 'd');
  assert.equal(nextRosterStudent(students, { ...r, studentId: 'd' }), null);
});

test('Arabic comma paste keeps guardian separate', () => {
  const incoming = rosterFromText('اسم الطالب،ولي الأمر\nطالب،ولي', 1, 'أ');
  assert.equal(incoming[0].name, 'طالب');
  assert.equal(incoming[0].guardian, 'ولي');
});
