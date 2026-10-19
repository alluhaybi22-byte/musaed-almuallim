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
test('staff footer rows are excluded while Arabic and English students remain', () => {
  const rows = [
    ['م', 'اسم الطالب'],
    [1, 'طالب عربي'],
    [2, 'AABID TEST STUDENT'],
    [3, ''],
    ['', 'معلم المادة :   معلم تجريبي', '', 'مدير المدرسة :'],
    ['اسم المعلم', 'اسم الموظف'],
    ['مدير المدرسة : مدير تجريبي', 'اسم المدير'],
    ['', 'teacher name: Test Teacher'],
  ];
  assert.deepEqual(
    rosterFromRows(rows, inferRosterColumns(rows), 2, 'أ').map((s) => s.name),
    ['طالب عربي', 'AABID TEST STUDENT'],
  );
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


test('all 25 names in side-by-side columns are retained, including separate guardians', () => {
  const rows = [['م', 'اسم الطالب', 'ولي الأمر', 'م', 'اسم الطالب', 'ولي الأمر']];
  for (let i = 0; i < 13; i++) rows.push([i+1, 'طالب يمين '+i, 'ولي يمين '+i,
    i < 12 ? i+14 : '', i < 12 ? 'طالب يسار '+i : '', i < 12 ? 'ولي يسار '+i : '']);
  const mapping = inferRosterColumns(rows);
  assert.deepEqual(mapping.nameColumns, [1, 4]);
  const names = rosterFromRows(rows, mapping, 2, 'أ');
  assert.equal(names.length, 25);
  assert.equal(names.find(x => x.name === 'طالب يسار 11').guardian, 'ولي يسار 11');
  mapping.nameColumns = [4];
  assert.equal(rosterFromRows(rows, mapping, 2, 'أ').length, 12);
});
test('repeated headers and empty rows do not truncate the remainder of a roster', () => {
  const rows = [...Array.from({length: 22}, () => ['عنوان']), ['م','الاسم الرباعي'],
    [1,'محمد أحمد علي سعيد'], [], ['م','الاسم الرباعي'], [2,'عبد الله عبد الرحمن علي']];
  const mapping = inferRosterColumns(rows);
  assert.equal(mapping.startRow, 23);
  assert.deepEqual(rosterFromRows(rows, mapping, 2, 'أ').map(x => x.name),
    ['محمد أحمد علي سعيد', 'عبد الله عبد الرحمن علي']);
});
