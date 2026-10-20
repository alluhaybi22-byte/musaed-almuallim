import { action as uiAction, prepareAction } from './ui.mjs';
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
const action = a => uiAction(page, a);
const text = () => page.locator('.stimulus').innerText();
try {
  await page.goto('http://localhost:4198');
  await page.locator('[data-action="grade"][data-grade="2"]').click();
  await page.locator('.nav [data-route="students"]').click();
  for (const name of ['غائب', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الأخير']) {
    await action('add-student');
    await page.locator('#student-form [name="name"]').fill(name);
    await page.locator('#student-form button[type="submit"]').click();
    await page.locator('#student-form').waitFor({ state: 'detached' });
  }
  await page.locator('.student-row').filter({hasText:'غائب'}).getByRole('button',{name:'بدء اختبار',exact:true}).click();
  await page.locator('#setup-lesson').selectOption('g2-u1-l2');
  await action('start-assessment');
  const skippedSentence = await text();
  await action('skip-student');
  await page.locator('.assessment-head h1').filter({hasText:'الأول'}).waitFor();
  assert.notEqual(await text(), skippedSentence);
  await action('student-display');
  await page.keyboard.press('1');
  await action('student-display');
  await page.locator('.assessment-options > summary').click();
  await page.locator('#answer-note').fill('ملاحظة ');
  await page.locator('#answer-note').press('2');
  assert.equal(await page.locator('.grading').count(),1);
  await page.locator('#answer-note').blur();
  for (const [i,key] of ['1','٢','3','4'].entries()) {
    if (key === '٢') await page.locator('body').dispatchEvent('keydown', {key});
    else await page.keyboard.press(key);
    await page.locator('.assessment-head h1').filter({hasText:['الثاني','الثالث','الرابع','الأخير'][i]}).waitFor();
    assert.equal(await page.locator('#report').count(),0);
    assert.equal(await page.locator('[data-action="finish"]').count(),0);
    assert.equal(await page.locator('.score-btn[aria-pressed="true"]').count(),0);
    if(i===1) {
      const sentence=await text();
      await page.reload();
      await page.locator('.secondary-details').evaluateAll(xs=>xs.forEach(el=>el.open=true));
  await page.locator('.student-row').filter({hasText:'الثالث'}).locator('[data-action="resume"]').click();
      assert.equal(await text(),sentence);
    }
  }
  await action('skip-student');
  await page.locator('[data-action="resume"]').first().waitFor();
  await page.reload();
  await page.locator('[data-action="resume"]').first().waitFor();
  await action('resume');
  await page.locator('.grading').waitFor();
  await page.locator('.nav [data-route="settings"]').click();
  const downloaded = page.waitForEvent('download');
  await action('backup');
  const file=await downloaded;
  const data=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(data.results.length,4);
  assert.equal(data.drafts.length,2);
  assert.deepEqual(data.results.map(r=>Object.values(r.answers)[0].score), ['excellent','advanced','proficient','incorrect']);
  assert.deepEqual(errors,[]);
  console.log('PASS skip draft, sentence advance, four keyboard ratings including Arabic digits, typing/student guards, reports and backup after reload.');
} finally {
  await browser.close();
  server.kill();
}


