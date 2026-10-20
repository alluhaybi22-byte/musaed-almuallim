import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIX_WORD_SENTENCES,
  sentenceWordCount,
  startSentenceRotation,
  advanceSentenceRotation,
} from '../src/reading-rotation.js';
import {
  READING_LESSONS,
  lessonReadingSkills,
} from '../src/reading-lessons.js';
import { questionsFor } from '../src/questions.js';
test('every lesson has four distinct six-word training sentences', () => {
  assert.equal(Object.keys(SIX_WORD_SENTENCES).length, READING_LESSONS.length);
  for (const lesson of READING_LESSONS) {
    const pool = questionsFor(
      lessonReadingSkills(lesson.id).find((s) => s.readingLevel === 'single'),
    );
    assert.equal(pool.length, 4);
    assert.equal(new Set(pool.map((c) => c.display)).size, 4);
    assert(pool.every((c) => sentenceWordCount(c.display) === 6));
    let selection = startSentenceRotation(pool);
    const seen = [];
    for (let i = 0; i < 28; i++) {
      assert.equal(selection.cards.length, 1);
      assert.equal(selection.cards[0].display, pool[i % 4].display);
      seen.push(selection.cards[0].id);
      selection = advanceSentenceRotation(
        JSON.parse(JSON.stringify(selection)),
      );
    }
    assert.notEqual(seen[0], seen[1]);
    assert.deepEqual(startSentenceRotation(pool, 5).cards, [pool[1]]);
  }
});
test('ordinary assessments keep their cards; malformed or mixed quick pools are rejected', () => {
  const skills = lessonReadingSkills('g2-u1-l2');
  const passages = questionsFor(skills[2]);
  assert.deepEqual(startSentenceRotation(passages), { cards: passages });
  assert.deepEqual(advanceSentenceRotation({ cards: passages }), {
    cards: passages,
  });
  const pool = questionsFor(skills.find((s) => s.readingLevel === 'single'));
  assert.throws(() => startSentenceRotation([...pool, ...passages]));
  assert.throws(() =>
    startSentenceRotation([{ ...pool[0], display: 'نص قصير' }]),
  );
  const result = startSentenceRotation(pool);
  result.sentenceRotation.pool[1].display = 'ناقص';
  assert.throws(() => advanceSentenceRotation(result));
});
