import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
let pw;
try {
  pw = await import('@playwright/test');
} catch {
  pw = await import(
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'
  );
}
const production = process.env.READING_TEST_PRODUCTION === '1';
const args = production
  ? [
      resolve(process.env.APPDEPLOY_TOOL_MODULES, 'vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '4198',
      '--strictPort',
    ]
  : ['scripts/serve.mjs'];
const server = spawn(process.execPath, args, {
  cwd: production
    ? new URL('../deploy/appdeploy/stage/', import.meta.url)
    : undefined,
  env: { ...process.env, PORT: '4198' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('server timeout')), 15000);
  server.stdout.on('data', (data) => {
    if (/http:\/\/(localhost|127\.0\.0\.1)/.test(String(data))) {
      clearTimeout(timer);
      resolve();
    }
  });
});
const browser = await pw.chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_EXECUTABLE,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const action = (a) => page.locator(`[data-action="${a}"]`).first().click();
const text = () => page.locator('.stimulus').innerText();
try {
  await page.goto('http://localhost:4198');
  await page.locator('[data-action="open-grade"][data-grade="2"]').click();
  for (const name of ['قارئ أول', 'قارئ ثان', 'قارئ ثالث']) {
    await action('add-student');
    await page.locator('#student-form [name="name"]').fill(name);
    await page.locator('#student-form button[type="submit"]').click();
    await page.locator('#student-form').waitFor({ state: 'detached' });
  }
  await page
    .locator('.student-row')
    .filter({ hasText: 'قارئ أول' })
    .getByRole('button', { name: 'بدء اختبار', exact: true })
    .click();
  await page.locator('#setup-lesson').selectOption('g2-u1-l2');
  assert.equal(await page.locator('[data-skill]:checked').count(), 1);
  assert(
    (
      await page.locator('[data-skill]:checked').getAttribute('data-skill')
    ).endsWith('-single'),
  );
  await action('preview-cards');
  assert.equal(await page.locator('[data-card-edit]').count(), 1);
  const original = await page.locator('[data-card-edit]').inputValue();
  await page.locator('[data-card-edit]').fill('هذه جملة قصيرة');
  await action('save-preview');
  await page
    .getByText('اكتب جملة من ست كلمات بالضبط.', { exact: true })
    .waitFor();
  assert.equal(await page.locator('[data-card-edit]').count(), 1);
  await page.locator('[data-card-edit]').fill(original);
  await action('save-preview');
  await action('start-assessment');
  const first = await text();
  assert.equal(first.trim().split(/\s+/).length, 6);
  await page.getByRole('button', { name: 'متقن', exact: true }).click();
  await action('finish');
  assert((await page.locator('#report').innerText()).includes('١٠٠٪'));
  await action('next-student');
  const second = await text();
  assert.notEqual(first, second);
  assert.equal(second.trim().split(/\s+/).length, 6);
  await action('pause');
  await page.reload();
  await action('resume');
  assert.equal(await text(), second);
  await page.getByRole('button', { name: 'غير متقن', exact: true }).click();
  await action('finish');
  await action('next-student');
  const third = await text();
  assert.notEqual(second, third);
  assert.notEqual(first, third);
  await page.getByRole('button', { name: 'متقن', exact: true }).click();
  await action('finish');
  await page.locator('#report').waitFor();
  assert((await page.locator('#dialog-root').innerText()).includes('آخر طالب'));
  await action('close-modal');
  await page.locator('.nav [data-route="settings"]').click();
  const downloaded = page.waitForEvent('download');
  await action('backup');
  const file = await downloaded;
  const data = JSON.parse(await readFile(await file.path(), 'utf8'));
  assert.equal(data.results.length, 3);
  assert(
    data.results.every(
      (r) => r.cards.length === 1 && r.sentenceRotation.pool.length === 4,
    ),
  );
  assert.equal(new Set(data.results.map((r) => r.cards[0].display)).size, 3);
  assert.deepEqual(errors, []);
  console.log(
    'PASS six-word mode: one card/student, exact word-count validation, three distinct successive sentences, reload/resume, result/report/backup with rotation snapshot.',
  );
} finally {
  await browser.close();
  server.kill();
}
