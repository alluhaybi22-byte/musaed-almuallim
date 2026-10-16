import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTENING_PASSAGES,
  applyListeningEdits,
  safeListeningAudio,
} from '../src/listening.js';
import { questionsFor } from '../src/questions.js';
import { LISTENING_RECORDINGS } from '../src/listening-recordings.js';
import { readFile } from 'node:fs/promises';
import { assessmentSignature } from '../src/domain.js';

const skill = (grade = 2, unit = 2) => ({
  id: `g${grade}-u${unit}`,
  title: 'فهم نص مسموع',
  kind: 'listening',
  grade,
  unit,
  domain: 'الفهم والاستماع',
  source: { page: 54, edition: '1448' },
});
test('all nine narration files are bundled and match their pinned transcripts', async () => {
  assert.equal(Object.keys(LISTENING_RECORDINGS).length, 9);
  for (const p of LISTENING_PASSAGES) {
    const record = LISTENING_RECORDINGS[p.id];
    assert.equal(record.text, p.text);
    assert(
      (
        await readFile(
          new URL('../public/' + record.path.slice(2), import.meta.url),
        )
      ).length > 1000,
    );
    assert(
      questionsFor(skill(p.grade, p.unit)).every(
        (c) => safeListeningAudio(c) === record.path,
      ),
    );
  }
});
test('nine unit-specific passages produce 27 independent questions and grade progression', () => {
  assert.equal(LISTENING_PASSAGES.length, 9);
  const all = [];
  for (const g of [1, 2, 3])
    for (const u of [1, 2, 3]) {
      const cards = questionsFor(skill(g, u));
      assert.equal(cards.length, 3);
      assert.equal(new Set(cards.map((c) => c.passageId)).size, 1);
      assert.equal(new Set(cards.map((c) => c.teacherText)).size, 1);
      assert.equal(new Set(cards.map((c) => c.display)).size, 3);
      assert(
        cards.every(
          (c) =>
            c.expected.includes('الإجابة:') &&
            c.provenance.includes('ليس نصًا رسميًا'),
        ),
      );
      assert.equal(
        cards[2].facet,
        g === 1 ? 'تذكر معلومة مباشرة' : g === 2 ? 'فهم السبب' : 'الاستنتاج',
      );
      all.push(...cards);
    }
  assert.equal(new Set(all.map((c) => c.id)).size, 27);
});
test('editing one shared passage synchronizes questions and invalidates mismatching audio', () => {
  const cards = questionsFor(skill());
  for (const c of cards) {
    c.audioData = 'data:audio/mpeg;base64,AAAA';
    c.audioText = c.teacherText;
  }
  const edited = applyListeningEdits(cards, {
    [cards[0].id]: { teacherText: 'نص جديد' },
  });
  assert(edited.every((c) => c.teacherText === 'نص جديد' && !c.audioData));
  assert(cards.every((c) => c.teacherText !== 'نص جديد')); // original/saved snapshots unchanged
  assert.throws(() =>
    applyListeningEdits(cards, {
      [cards[0].id]: { teacherText: 'أ' },
      [cards[1].id]: { teacherText: 'ب' },
    }),
  );
});
test('audio accepts only local audio data matching the current transcript', () => {
  const c = {
    teacherText: 'نص',
    audioText: 'نص',
    audioData: 'data:audio/mpeg;base64,AAAA',
  };
  assert.equal(safeListeningAudio(c), c.audioData);
  for (const audioData of [
    'https://example.com/audio.mp3',
    'javascript:alert(1)',
    'data:text/html;base64,AAAA',
  ])
    assert.equal(safeListeningAudio({ ...c, audioData }), '');
  assert.equal(safeListeningAudio({ ...c, teacherText: 'معدل' }), '');
  const local = {
    teacherText: 'نص',
    audioText: 'نص',
    audioPath: './assets/listening/listening-g1-u1-v1.mp3',
  };
  assert.equal(safeListeningAudio(local), local.audioPath);
  for (const audioPath of [
    'https://remote/audio.mp3',
    '../private.mp3',
    './assets/listening/../../other.mp3',
  ])
    assert.equal(safeListeningAudio({ ...local, audioPath }), '');
});
test('progress separates recordings and delivery counts; untouched other-unit bank remains compatible', () => {
  const cards = questionsFor(skill());
  const r = { grade: 2, semester: 1, cards };
  const recorded = {
    ...r,
    listeningDelivery: { [cards[0].passageId]: { mode: 'teacher', count: 2 } },
  };
  assert.notEqual(assessmentSignature(r), assessmentSignature(recorded));
  assert.equal(questionsFor(skill(2, 4)).length, 5);
});
