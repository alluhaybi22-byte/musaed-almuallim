import { action as uiAction, prepareAction } from './ui.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
let pw;
try {
  pw = await import('@playwright/test');
} catch {
  pw = await import(
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'
  );
}
const production = process.env.READING_TEST_PRODUCTION === '1';
const command = production
  ? [
      resolve(process.env.APPDEPLOY_TOOL_MODULES, 'vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      '4196',
      '--strictPort',
    ]
  : ['scripts/serve.mjs'];
const server = spawn(process.execPath, command, {
  cwd: production
    ? new URL('../deploy/appdeploy/stage/', import.meta.url)
    : undefined,
  env: { ...process.env, PORT: '4196' },
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const action = name => uiAction(page, name);
const button = (name) =>
  page.getByRole('button', { name, exact: true }).first().click();
try {
  await page.goto('http://localhost:4196');
  await page.locator('[data-action="grade"][data-grade="2"]').click();
  await page.locator('.nav [data-route="students"]').click();
  for (const name of ['قارئ الدرس', 'قارئ تالٍ']) {
    await action('add-student');
    await page.locator('#student-form [name="name"]').fill(name);
    await page.locator('#student-form button[type="submit"]').click();
    await page.locator('#student-form').waitFor({ state: 'detached' });
  }
  await page
    .locator('.student-row')
    .filter({ hasText: 'قارئ الدرس' })
    .getByRole('button', { name: 'بدء اختبار', exact: true })
    .click();
  assert.equal(await page.locator('#setup-lesson option').count(), 4);
  await page.locator('#setup-lesson').selectOption('g2-u1-l2');
  await page.locator('.setup-custom').evaluate(el=>el.open=true);
  await page.locator('[data-skill$="-passages"]').check();
  assert.equal(await page.locator('[data-skill]:checked').count(), 1);
  await page.screenshot({
    path: 'test-results/reading-lesson-setup-mobile.png',
    fullPage: true,
  });
  await action('preview-cards');
  assert.equal(await page.locator('[data-card-edit]').count(), 3);
  assert(
    (await page.locator('[data-card-edit]').first().inputValue()).includes(
      'مَكْتَبَةِ الْمَدْرَسَةِ',
    ),
  );
  await page
    .locator('[data-card-edit]')
    .first()
    .fill('تَعْدِيلٌ خَاصٌّ بِدَرْسٍ وَاحِدٍ.');
  await action('save-preview');
  await page.locator('#setup-unit').selectOption('2');
  assert.equal(await page.locator('#setup-lesson').inputValue(), '');
  assert.equal(await page.locator('[data-skill]:checked').count(), 0);
  await page.locator('#setup-lesson').selectOption('g2-u2-l1');
  await page.locator('.setup-custom').evaluate(el=>el.open=true);
  await page.locator('[data-skill$="-passages"]').check();
  await action('preview-cards');
  assert(
    (await page.locator('[data-card-edit]').first().inputValue()).includes(
      'بِقِطَارِهِ الْجَدِيدِ',
    ),
  );
  assert(
    !(await page.locator('#dialog-root').innerText()).includes('عذرًا يا جدي'),
  );
  await action('close-modal');
  await page.locator('#setup-semester').selectOption('2');
  assert.equal(await page.locator('#setup-lesson').inputValue(), '');
  assert(
    (await page.locator('#setup-lesson').innerText()).includes('آداب الزيارة'),
  );
  await page.locator('#setup-unit').selectOption('8');
  assert(
    (await page.locator('#setup-lesson').innerText()).includes('الطبيبة نورة'),
  );
  await page.locator('#setup-unit').selectOption('6');
  await page.locator('#setup-lesson').selectOption('g2-u6-l1');
  await page.locator('.setup-custom').evaluate(el=>el.open=true);
  await page.locator('[data-skill$="-passages"]').check();
  await action('start-assessment');
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await action('review');
  await action('finish');
  await page.locator('.assessment-head h1').filter({hasText:'قارئ تالٍ'}).waitFor();
  await page.locator('.mobile-brand[data-route="home"]').click();
  await page.locator('[data-action="grade"][data-grade="2"]').click();
  await page.locator('.nav [data-route="students"]').click();
  await page
    .locator('.student-row')
    .filter({ hasText: 'قارئ الدرس' })
    .getByRole('button', { name: 'بدء اختبار', exact: true })
    .click();
  await page.locator('#setup-semester').selectOption('1');
  await page.locator('#setup-lesson').selectOption('g2-u1-l2');
  await page.locator('.setup-custom').evaluate(el=>el.open=true);
  await page.locator('[data-skill$="-passages"]').check();
  await action('start-assessment');
  await page.screenshot({
    path: 'test-results/reading-passage-mobile.png',
    fullPage: true,
  });
  assert(
    (await page.locator('.stimulus').innerText()).includes(
      'مَكْتَبَةِ الْمَدْرَسَةِ',
    ),
  );
  assert(
    !(await page.locator('.stimulus').innerText()).includes('تَعْدِيلٌ خَاصٌّ'),
  );
  await button('متمكن');
  await page.waitForFunction(() =>
    document
      .querySelector('.assessment-body .row.between small')
      ?.textContent.includes('٢'),
  );
  await action('pause');
  await page.reload();
  await page.locator('.secondary-details').evaluateAll(xs=>xs.forEach(el=>el.open=true));
  await page.locator('.student-row').filter({ hasText: 'قارئ الدرس' }).locator('[data-action="resume"]').click();
  assert(
    (await page.locator('.badge.blue').innerText()).includes('عذرًا يا جدي'),
  );
  await button('غير مجتاز');
  await page.waitForFunction(() =>
    document
      .querySelector('.assessment-body .row.between small')
      ?.textContent.includes('٣'),
  );
  await button('متمكن');
  await page.locator('.assessment-head h1').filter({hasText:'قارئ تالٍ'}).waitFor();
  assert.equal(await page.locator('#report').count(),0);
  await action('pause');
  await page.locator('.nav [data-route="results"]').click();
  await action('student-report');
  await page.locator('#report').waitFor();
  const report = await page.locator('#report').innerText();
  assert(report.includes('الدرس القرائي:'));
  assert(report.includes('عذرًا يا جدي'));
  assert(report.includes('٦٧٪'));
  await action('close-modal');
  await page.locator('.nav [data-route="home"]').click();
  await page.locator('.secondary-details').evaluateAll(xs=>xs.forEach(el=>el.open=true));
  await page.locator('.student-row').filter({hasText:'قارئ تالٍ'}).locator('[data-action="resume"]').last().click();
  assert(
    (await page.locator('.assessment-head h1').innerText()).includes(
      'قارئ تالٍ',
    ),
  );
  assert(
    (await page.locator('.stimulus').innerText()).includes(
      'مَكْتَبَةِ الْمَدْرَسَةِ',
    ),
  );
  assert.equal(await page.locator('.score-btn.selected').count(), 0);
  await action('pause');
  await page.reload();
  await contextOfflineCheck();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: mobile lesson/unit/semester selection, excerpts and reset of edits, scoring, draft reload, lesson report and fresh next student; offline lessons available.',
  );
} finally {
  await browser.close();
  server.kill();
}
async function contextOfflineCheck() {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.context().setOffline(true);
  await page.reload();
  await page.locator('.secondary-details').evaluateAll(xs=>xs.forEach(el=>el.open=true));
  await page.locator('.student-row').filter({ hasText: 'قارئ تالٍ' }).locator('[data-action="resume"]').last().click();
  assert(
    (await page.locator('.badge.blue').innerText()).includes('عذرًا يا جدي'),
  );
}

