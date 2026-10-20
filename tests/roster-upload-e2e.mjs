import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as XLSX from '../src/vendor/xlsx.mjs';
const input = process.env.ROSTER_TEST_FILE;
if (!input)
  throw Error(
    'Set ROSTER_TEST_FILE to the private local test workbook. It is never copied into the repository.',
  );
const workbook = XLSX.read(await readFile(input), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
  header: 1,
  defval: '',
  raw: false,
});
const expected = rows
  .filter(
    (row) =>
      /^\$?\d+$/.test(String(row[1]).trim()) && String(row[2] || '').trim(),
  )
  .map((row) => String(row[2]).trim());
assert.equal(expected.length, 28);
let pw;
try {
  pw = await import('@playwright/test');
} catch {
  pw = await import(
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'
  );
}
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: '4197' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('server timeout')), 15000);
  server.stdout.on('data', (data) => {
    if (String(data).includes('http://localhost')) {
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
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  for (const grade of [1, 2, 3]) {
    await page.goto('http://localhost:4197');
    await page
      .locator(`[data-action="open-grade"][data-grade="${grade}"]`)
      .click();
    const importFile = async () => {
      await page.locator('[data-action="roster"]').first().click();
      await page.locator('#roster-file').setInputFiles(input);
      await page.locator('#roster-name-column').waitFor();
      if (process.env.ROSTER_EXPECT_FULL_PREVIEW === '1')
        assert.equal(await page.locator('.roster-table tbody tr').count(), 28);
      assert.equal(await page.locator('#roster-name-column').inputValue(), '2');
      await page.locator('#import-roster').click();
      await page.locator('#roster-confirm-form').waitFor();
      const actual = await page
        .locator('[data-roster-name]')
        .evaluateAll((inputs) => inputs.map((x) => x.value));
      assert.deepEqual(actual, expected);
      await page
        .getByRole('button', { name: 'اعتماد الكشف', exact: true })
        .click();
      await page.locator('#roster-confirm-form').waitFor({ state: 'detached' });
    };
    await importFile();
    assert.equal(await page.locator('.student-row').count(), 28);
    await page.reload();
    await page
      .locator(`[data-action="open-grade"][data-grade="${grade}"]`)
      .click();
    assert.deepEqual(
      await page.locator('.student-info strong').allTextContents(),
      expected,
    );
    await page.locator('#student-search').fill('اسم غير موجود مطلقًا');
    await importFile();
    assert.equal(await page.locator('.student-row').count(), 28);
    console.log(
      `PASS attached workbook: grade ${grade}, all 28 names reviewed, saved, reloaded, reimported without duplicates.`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.kill();
}
