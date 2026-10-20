import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READING_LESSONS,
  readingLessonsFor,
  lessonReadingSkills,
  readingCardSourceLabel,
} from '../src/reading-lessons.js';
import { questionsFor } from '../src/questions.js';
import {
  assessmentSignature,
  emptyState,
  validateBackup,
} from '../src/domain.js';

test('all eight second-grade units offer their two distinct lessons, reading levels and quick sentence mode', () => {
  assert.equal(READING_LESSONS.length, 16);
  const ids = new Set();
  for (let unit = 1; unit <= 8; unit++) {
    const lessons = readingLessonsFor(2, unit <= 4 ? 1 : 2, unit);
    assert.equal(lessons.length, 2);
    for (const lesson of lessons) {
      const skills = lessonReadingSkills(lesson.id);
      assert.deepEqual(
        skills.map((s) => s.readingLevel),
        ['words', 'sentences', 'passages', 'single'],
      );
      for (const skill of skills) {
        const cards = questionsFor(skill);
        assert(cards.length >= 3);
        assert.equal(
          cards.length,
          skill.readingLevel === 'words'
            ? 8
            : skill.readingLevel === 'passages'
              ? 3
              : cards.length,
        );
        for (const card of cards) {
          assert(!ids.has(card.id));
          ids.add(card.id);
          assert.equal(card.lessonTitle, lesson.title);
          assert(
            card.source.book.includes(
              unit <= 4 ? 'SM1-lang.pdf' : 'part2-v2.pdf',
            ),
          );
          if (skill.readingLevel === 'single') {
            assert.equal(card.display.trim().split(/\s+/).length, 6);
            assert(readingCardSourceLabel(card).startsWith('جملة تدريبية'));
            continue;
          }
          assert(
            lesson.fragments.some(
              (f) =>
                f.page === card.source.page && f.text.includes(card.display),
            ),
          );
          assert(readingCardSourceLabel(card).startsWith('من نص درس'));
        }
      }
    }
  }
  assert.deepEqual(readingLessonsFor(1, 1, 1), []);
  assert.deepEqual(readingLessonsFor(2, 2, 1), []);
});

test('named lessons use their own book excerpts and do not substitute general reading examples', () => {
  assert.deepEqual(
    readingLessonsFor(2, 1, 1).map((x) => x.title),
    ['صلة الرحم', 'عذرًا يا جدي'],
  );
  assert.deepEqual(
    readingLessonsFor(2, 1, 2).map((x) => x.title),
    ['الصديقان', 'الجار الصغير'],
  );
  const grandfather = questionsFor(lessonReadingSkills('g2-u1-l2')[2]);
  const friends = questionsFor(lessonReadingSkills('g2-u2-l1')[2]);
  assert(grandfather[0].display.includes('مَكْتَبَةِ الْمَدْرَسَةِ'));
  assert(friends[0].display.includes('بِقِطَارِهِ الْجَدِيدِ'));
  assert.deepEqual(
    questionsFor({ ...lessonReadingSkills('g2-u1-l2')[2], unit: 2 }),
    [],
  );
  const result = (cards) => ({ grade: 2, semester: 1, cards });
  assert.notEqual(
    assessmentSignature(result(grandfather)),
    assessmentSignature(result(friends)),
  );
});

test('backups retain the lesson context and edited cards are identified as teacher changes', () => {
  const cards = questionsFor(lessonReadingSkills('g2-u1-l2')[2]);
  const backup = {
    ...emptyState(),
    app: 'al-musaed',
    students: [{ id: 'student', name: 'عينة', grade: 2, section: 'أ' }],
    drafts: [
      {
        id: 'draft',
        studentId: 'student',
        grade: 2,
        semester: 1,
        unit: 1,
        cards,
        answers: {},
      },
    ],
  };
  validateBackup(backup);
  const restored = JSON.parse(JSON.stringify(backup));
  assert.equal(restored.drafts[0].cards[0].lessonTitle, 'عذرًا يا جدي');
  const edited = { ...cards[0], display: 'نَصٌّ عَدَّلَهُ الْمُعَلِّمُ.' };
  assert(readingCardSourceLabel(edited).startsWith('عدّله المعلم'));
  assert(readingCardSourceLabel(cards[0]).startsWith('من نص درس'));
});
