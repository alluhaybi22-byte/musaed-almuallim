import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRosterFixtures } from './fixtures.mjs';
import { emptyState, DEFAULT_SETTINGS } from '../src/domain.js';
let pw;
try {
  pw = await import('@playwright/test');
} catch {
  pw = await import(
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'
  );
}
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
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
const browser = await pw.chromium.launch({
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
async function click(name) {
  await page.getByRole('button', { name, exact: true }).first().click();
}
async function close() {
  await click('إغلاق');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function score(name) {
  const before = await page
    .locator('.assessment-body .row.between small')
    .textContent();
  await click(name);
  await page.waitForFunction(
    (old) =>
      document.querySelector('.assessment-body .row.between small')
        ?.textContent !== old,
    before,
  );
}
async function startSolar() {
  await page.locator('.nav [data-route="students"]').click();
  await click('الصف الثاني');
  await page
    .locator('.student-row')
    .filter({ hasText: 'عينة مراجعة' })
    .getByRole('button', { name: 'بدء اختبار', exact: true })
    .click();
  await click('إلغاء الكل');
  await page
    .getByRole('checkbox', { name: /يميز ال الشمسية والقمرية/ })
    .check();
  await click('بدء الاختبار');
  await page.locator('.assessment-body').waitFor();
}
try {
  await createRosterFixtures();
  await mkdir('test-results', { recursive: true });
  await page.goto('http://localhost:4173');
  await page
    .getByRole('heading', { name: 'مساحة معلمك', exact: true })
    .waitFor();
  await click('الطلاب');
  await click('الصف الثاني');
  await click('استيراد Excel أو Word / لصق كشف');
  await page.locator('#roster-file').setInputFiles('test-results/roster.xlsx');
  await page.getByText('طالب ألف', { exact: true }).waitFor();
  await click('إضافة الكشف إلى الصف');
  await page.getByRole('heading', { name: 'مراجعة أسماء الكشف' }).waitFor();
  assert.equal(await page.locator('[data-roster-name]').count(), 2);
  await page.locator('[data-roster-name="0"]').fill('عينة مراجعة');
  await page.locator('[data-roster-guardian="0"]').fill('ولي معدل');
  await page.locator('[data-roster-include="1"]').uncheck();
  await click('اعتماد الكشف');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.student-row').count(), 1);
  await page.reload();
  await click('الطلاب');
  await click('الصف الثاني');
  await page.getByText('عينة مراجعة', { exact: true }).waitFor();
  assert((await page.locator('.student-row').innerText()).includes('ولي معدل'));
  // Restore a version-0.2 style snapshot with no facets/templateVersion/new settings.
  const legacy = emptyState();
  legacy.students = [
    { id: 'legacy', name: 'طالب سابق', grade: 2, section: 'ب', guardian: '' },
  ];
  const card = {
    id: 'old-q1',
    skillId: 'old-skill',
    skillTitle: 'مهارة سابقة',
    domain: 'الكلمات والظواهر',
    display: 'قَلَمٌ',
    instruction: 'اقرأ',
    expected: 'قراءة مستقلة',
    teacherText: '',
    source: { page: 18, edition: '1448' },
  };
  legacy.results = [
    {
      id: 'old-result',
      studentId: 'legacy',
      grade: 2,
      semester: 1,
      unit: 1,
      cards: [card],
      answers: { 'old-q1': { score: 'independent', note: '' } },
      startedAt: '2026-10-01T08:00:00Z',
      completedAt: '2026-10-01T08:01:00Z',
      scoring: { ...DEFAULT_SETTINGS },
      note: '',
    },
  ];
  await writeFile(
    'test-results/legacy-review.json',
    JSON.stringify({ app: 'al-musaed', ...legacy }),
  );
  await page.locator('.nav [data-route="settings"]').click();
  await page
    .locator('#restore-file')
    .setInputFiles('test-results/legacy-review.json');
  await click('دمج النسخة');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await startSolar();
  await click('عرض الطالب');
  assert.equal(
    await page
      .locator('.sidebar, .grading, .teacher-hint, #answer-note')
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'العودة للمعلم', exact: true })
      .count(),
    1,
  );
  await click('العودة للمعلم');
  for (let i = 0; i < 10; i++) {
    if (i === 5) {
      await page.locator('.assessment-options > summary').click();
      await page.locator('#answer-note').fill('تدريب على الشمسية');
    }
    await score(i >= 5 && i <= 7 ? 'غير متقن' : 'متقن');
  }
  await click('حفظ نتيجة الاختبار');
  await page
    .getByRole('heading', { name: 'تقرير الطالب', exact: true })
    .waitFor();
  assert.equal(await page.locator('.item-details tbody tr').count(), 3);
  assert((await page.locator('#report').innerText()).includes('٤٠٪'));
  assert(
    (await page.locator('#report').innerText()).includes('تدريب على الشمسية'),
  );
  await close();
  await startSolar();
  for (let i = 0; i < 10; i++) await score('متقن');
  await click('حفظ نتيجة الاختبار');
  await page
    .getByRole('heading', { name: 'تقرير الطالب', exact: true })
    .waitFor();
  assert(
    (await page.locator('#report').innerText()).includes('+٣٠ نقطة مئوية'),
  );
  await page.pdf({
    path: 'test-results/review-report.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.screenshot({
    path: 'test-results/review-report-mobile.png',
    fullPage: true,
  });
  await close();
  await page.locator('#result-query').fill('عينة مراجعة');
  assert.equal(await page.locator('.result-row').count(), 2);
  await page.locator('#result-semester').selectOption('2');
  assert.equal(await page.locator('.result-row').count(), 0);
  await page.locator('#result-semester').selectOption('');
  await page.locator('#result-query').fill('');
  await click('تقرير الصف');
  const opts = await page
    .locator('#report-test option')
    .evaluateAll((els) =>
      els.map((e) => ({ value: e.value, text: e.textContent })),
    );
  const matched = opts.find((x) => x.text.includes('الشمسية'));
  assert(matched);
  await page.locator('#report-test').selectOption(matched.value);
  const legacyRow = page
    .locator('#report tbody tr')
    .filter({ hasText: 'طالب سابق' });
  assert((await legacyRow.innerText()).includes('غير مختبر'));
  assert(
    (
      await page
        .locator('#report tbody tr')
        .filter({ hasText: 'عينة مراجعة' })
        .innerText()
    ).includes('١٠٠٪'),
  );
  await page.locator('#report-section').selectOption('أ');
  assert.equal(await page.locator('#report tbody tr').count(), 1);
  assert((await page.locator('#report').innerText()).includes('١٠ من ١٠'));
  await page.locator('#report-from').fill('2099-01-01');
  await page.locator('#report-from').dispatchEvent('change');
  assert(
    (await page.locator('#report tbody').innerText()).includes('غير مختبر'),
  );
  await page.locator('#report-from').fill('');
  await page.locator('#report-from').dispatchEvent('change');
  assert((await page.locator('#report tbody').innerText()).includes('١٠٠٪'));
  const csvEvent = page.waitForEvent('download');
  await click('تصدير الجدول CSV');
  assert((await csvEvent).suggestedFilename().endsWith('.csv'));
  await close();
  await page.locator('.nav [data-route="students"]').click();
  await click('الصف الثاني');
  await page
    .locator('.student-row')
    .filter({ hasText: 'عينة مراجعة' })
    .getByRole('button', { name: 'بدء اختبار', exact: true })
    .click();
  await click('الفهم والاستماع');
  assert.equal(
    await page.getByRole('checkbox', { name: /فهم نص مسموع/ }).isChecked(),
    true,
  );
  await click('مراجعة عينات الاختبار');
  assert.equal(await page.locator('[data-card-teacher]').count(), 5);
  await page
    .locator('[data-card-teacher]')
    .first()
    .fill('زَارَ عَلِيٌّ صَدِيقَهُ.');
  await page
    .locator('[data-card-expected]')
    .first()
    .fill('الإجابة: علي؛ يقبل الاسم مستقلًا.');
  await click('حفظ تعديلات العينات');
  await click('بدء الاختبار');
  await page.locator('.assessment-options > summary').click();
  await page.locator('.teacher-hint summary').click();
  assert((await page.locator('.teacher-text').innerText()).includes('عَلِيٌّ'));
  await click('تعديل هذه البطاقة');
  await page.locator('#edit-teacher').fill('زَارَ حَسَنٌ صَدِيقَهُ.');
  await page.locator('#edit-expected').fill('الإجابة: حسن.');
  await click('حفظ البطاقة');
  await page.locator('.assessment-options > summary').click();
  await page.locator('.teacher-hint summary').click();
  assert((await page.locator('.teacher-text').innerText()).includes('حَسَنٌ'));
  await click('حفظ واستكمال لاحقًا');
  await page
    .getByRole('heading', { name: 'مساحة معلمك', exact: true })
    .waitFor();
  await page.reload();
  await click('استكمال');
  await page.locator('.assessment-options > summary').click();
  await page.locator('.teacher-hint summary').click();
  assert((await page.locator('.teacher-text').innerText()).includes('حَسَنٌ'));
  await click('حفظ واستكمال لاحقًا');
  await page
    .getByRole('heading', { name: 'مساحة معلمك', exact: true })
    .waitFor();
  assert.equal(await page.locator('.backup-reminder').count(), 1);
  const downloadPromise = page.waitForEvent('download');
  await click('تصدير نسخة');
  await downloadPromise;
  await page.locator('.backup-reminder').waitFor({ state: 'hidden' });
  await page.locator('.nav [data-route="settings"]').click();
  assert(
    !(await page.locator('#last-backup').innerText()).includes('لم يُصدّر بعد'),
  );
  await page.reload();
  await page.locator('.nav [data-route="home"]').click();
  assert.equal(await page.locator('.backup-reminder').count(), 0);
  await page.locator('.nav [data-route="students"]').click();
  await click('الصف الثاني');
  await page
    .locator('.student-row')
    .filter({ hasText: 'عينة مراجعة' })
    .getByRole('button', { name: 'بدء اختبار', exact: true })
    .click();
  await page.locator('#setup-unit').selectOption('3');
  await click('إلغاء الكل');
  await page.getByRole('checkbox', { name: /يقرأ ويكتب التنوين/ }).check();
  await click('بدء الاختبار');
  for (let i = 0; i < 10; i++) {
    assert(
      (await page.locator('.instruction').innerText()).includes(
        i < 5 ? 'اقرأ' : 'اكتب',
      ),
    );
    if (i === 5) {
      await click('عرض الطالب');
      assert(!(await page.locator('body').innerText()).includes('كِتَابٌ'));
      await click('العودة للمعلم');
    }
    await score(i < 5 ? 'متقن' : 'غير متقن');
  }
  await click('حفظ نتيجة الاختبار');
  assert((await page.locator('#report').innerText()).includes('٥٠٪'));
  assert((await page.locator('#report').innerText()).includes('١٠٠٪'));
  assert((await page.locator('#report').innerText()).includes('٠٪'));
  assert.equal(await page.locator('.item-details tbody tr').count(), 5);
  assert(
    (await page.locator('.item-details').innerText()).includes(
      'المهمة ومعيار الحكم',
    ),
  );
  await page.pdf({
    path: 'test-results/review-compound-report.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.screenshot({
    path: 'test-results/review-compound-mobile.png',
    fullPage: true,
  });
  await close();
  await page.locator('.nav [data-route="home"]').click();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole('heading', { name: 'مساحة معلمك', exact: true })
    .waitFor();
  assert.equal(await page.locator('.metric strong').first().textContent(), '٢');
  await context.setOffline(false);
  const fallbackContext = await browser.newContext();
  await fallbackContext.addInitScript(() => {
    if (navigator.serviceWorker)
      navigator.serviceWorker.register = () =>
        Promise.reject(Error('simulated registration failure'));
  });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.goto('http://localhost:4173');
  await fallbackPage
    .getByRole('heading', { name: 'مساحة معلمك', exact: true })
    .waitFor();
  assert.equal(
    await fallbackPage
      .getByRole('heading', { name: 'تعذر فتح المساعد', exact: true })
      .count(),
    0,
  );
  await fallbackContext.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: full roster review/edit/exclusion, old snapshot restore, student-only DOM, balanced facets, item failure notes, matched progress, result filters, same-test class scope, editable listening and criterion, draft retention and backup reminder.',
  );
} finally {
  await browser.close();
  server.kill();
}
