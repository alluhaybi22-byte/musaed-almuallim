import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
let pw;
try {
  pw = await import('@playwright/test');
} catch {
  pw = await import(
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'
  );
}
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: '4191' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('server timeout')), 15000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('http://localhost')) {
      clearTimeout(timer);
      resolve();
    }
  });
});
let browser;
try {
  browser = await pw.chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4191');
  await page
    .getByRole('heading', { name: 'مساحة معلمك', exact: true })
    .waitFor();
  await page.evaluate(async () => {
    const { readState, writeState } = await import('/src/storage.js');
    const { questionsFor } = await import('/src/questions.js');
    const state = await readState();
    const curriculum = await fetch('/curriculum.json').then((r) => r.json());
    const skill = curriculum.skills.find(
      (s) => s.grade === 2 && s.unit === 2 && s.kind === 'listening',
    );
    state.students = [
      { id: 'listen-student', name: 'طالب تجريبي', grade: 2, section: 'أ' },
    ];
    state.drafts = [
      {
        id: 'listen-draft',
        studentId: 'listen-student',
        grade: 2,
        semester: 1,
        cards: questionsFor(skill),
        answers: {},
        scoring: state.settings,
        startedAt: new Date().toISOString(),
      },
    ];
    await writeState(state);
  });
  await page.reload();
  const click = (action) =>
    page.locator(`[data-action="${action}"]`).first().click();
  await click('resume');
  await page.locator('.listening-panel').waitFor();
  await page.locator('#listening-audio').waitFor();
  assert(
    (await page.locator('#listening-audio').getAttribute('src')).includes(
      'listening-g2-u2-v1.mp3',
    ),
  );
  await click('listening-read');
  await page.waitForFunction(
    () =>
      document.querySelector('.listening-panel strong')?.textContent === '١',
  );
  await page.locator('#listening-audio').evaluate(async a => { await a.play(); });
  await page.waitForFunction(() => document.querySelector('#listening-audio').currentTime > 0.2);
  const beforeView = await page.locator('#listening-audio').evaluate(a => a.currentTime);
  await click('student-display');
  assert.equal(await page.locator('#listening-audio').count(), 1);
  await page.waitForFunction(() => !document.querySelector('#listening-audio').paused);
  assert((await page.locator('#listening-audio').evaluate(a => a.currentTime)) >= beforeView);
  const text = await page.locator('#app').innerText();
  assert(
    !text.includes('مَنْ رَأَى') &&
      !text.includes('خَالِدٌ') &&
      !text.includes('الإجابة:'),
  );
  await click('student-display');
  await page.locator('#listening-audio').evaluate(a => a.pause());
  assert.equal(await page.locator('.listening-panel strong').innerText(), '١');
  // A valid, silent WAV fixture validates file attachment and decoding, not narration quality.
  const wav = Buffer.alloc(844);
  wav.write('RIFF');
  wav.writeUInt32LE(836, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(800, 40);
  await page
    .locator('#listening-file')
    .setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: wav });
  await page.locator('#listening-audio').waitFor();
  await page.locator('#listening-audio').evaluate((audio) => audio.play());
  await page.waitForFunction(
    () =>
      document.querySelector('.listening-panel strong')?.textContent === '١',
  );
  await page.locator('[data-action="score"][data-score="incorrect"]').click();
  await page.waitForFunction(() =>
    document
      .querySelector('.badge.blue')
      ?.textContent.includes('تسلسل الأحداث'),
  );
  assert.equal(await page.locator('#listening-audio').count(), 1);
  await page.locator('.assessment-options').evaluate((el) => (el.open = true));
  await page.locator('.teacher-hint').evaluate((el) => (el.open = true));
  await click('edit-active-card');
  await page
    .locator('#edit-teacher')
    .fill('نَصٌّ مُعَدَّلٌ لِاخْتِبَارِ الْحِفْظِ.');
  await click('save-active-card');
  await page.waitForFunction(() => !document.querySelector('#listening-audio'));
  await page.evaluate(async () => {
    const state = await (await import('/src/storage.js')).readState();
    const draft = state.drafts[0];
    if (
      !draft.cards.every(
        (c) =>
          c.teacherText === 'نَصٌّ مُعَدَّلٌ لِاخْتِبَارِ الْحِفْظِ.' &&
          !c.audioData,
      )
    )
      throw Error('shared text not synchronized');
    if (Object.keys(draft.answers).length) throw Error('old answers retained');
    if (Object.keys(draft.listeningDelivery).length)
      throw Error('old delivery retained');
  });
  await click('pause');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  const durations = await page.evaluate(async () => {
    const { LISTENING_RECORDINGS } =
      await import('/src/listening-recordings.js');
    const values = [];
    for (const record of Object.values(LISTENING_RECORDINGS)) {
      values.push(
        await new Promise((resolve, reject) => {
          const audio = new Audio(record.path);
          audio.onloadedmetadata = () => resolve(audio.duration);
          audio.onerror = () =>
            reject(Error('Offline audio failed: ' + record.path));
        }),
      );
    }
    return values;
  });
  assert.equal(durations.length, 9);
  assert(
    durations.every((d) => d > 5 && d < 90),
    String(durations),
  );
  await click('resume');
  await page.locator('.listening-panel').waitFor();
  await mkdir('test-results', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/listening-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: mobile listening, hidden student questions, local WAV playback/count, shared text edits, invalidated audio/answers, draft persistence, offline reload.',
  );
} finally {
  await browser?.close();
  server.kill();
}

