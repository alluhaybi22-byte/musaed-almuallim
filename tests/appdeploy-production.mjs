import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { VERSION } from '../src/domain.js';

let server;
if (!process.env.APP_BASE_URL) {
  server = spawn(process.execPath, [
    process.env.APPDEPLOY_TOOL_MODULES
      ? resolve(process.env.APPDEPLOY_TOOL_MODULES, 'vite/bin/vite.js')
      : new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname,
    'preview', '--host', '127.0.0.1', '--port', '4195', '--strictPort',
  ], { cwd: new URL('../deploy/appdeploy/stage/', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('preview timeout')), 15000);
    server.stdout.on('data', data => {
      if (String(data).includes('http://127.0.0.1:4195')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.on('exit', code => { clearTimeout(timer); reject(Error('preview exited: ' + code)); });
  });
}

let playwright;
try { playwright = await import('@playwright/test'); }
catch { playwright = await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'); }
const { chromium } = playwright;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_EXECUTABLE || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [], googleRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  if (/^https:\/\/((accounts|www)\.google(apis)?\.com)\//.test(request.url())) {
    googleRequests.push(request.url());
  }
});
const url = process.env.APP_BASE_URL || 'http://localhost:4195/';
const settings = () => page.locator('[data-action="nav"][data-route="settings"]').first().click();
try {
  await page.goto(url);
  await page.getByRole('heading', { name: 'مساحة معلمك', exact: true }).waitFor();
  assert.equal(await page.locator('.metric strong').first().textContent(), '٠');
  await settings();
  assert((await page.locator('body').innerText()).includes(VERSION));
  await page.getByRole('button', { name: 'تجهيز تسجيل دخول Google', exact: true }).waitFor();
  assert.equal(await page.locator('[data-action="drive-save"]').count(), 0);
  assert.equal(await page.locator('[data-action="drive-list"]').count(), 0);
  assert.deepEqual(googleRequests, []);

  await page.locator('.mobile-brand[data-route="home"]').click();
  await page.locator('[data-action="open-grade"][data-grade="2"]').click();
  async function importRoster() {
    await page.locator('[data-action="roster"]').first().click();
    await page.locator('#roster-file').setInputFiles('test-results/complete.docx');
    await page.locator('[data-roster-sheet-include]').first().waitFor();
    await page.locator('#import-roster').click();
    await page.locator('#roster-confirm-form').waitFor();
    assert.equal(await page.locator('[data-roster-name]').count(), 25);
    await page.getByRole('button', { name: 'اعتماد الكشف', exact: true }).click();
    await page.locator('#roster-confirm-form').waitFor({ state: 'detached' });
  }
  await importRoster();
  await page.reload();
  await page.locator('[data-action="open-grade"][data-grade="2"]').click();
  await page.locator('.student-row').first().waitFor();
  assert.equal(await page.locator('.student-row').count(), 25);
  await importRoster();
  assert.equal(await page.locator('.student-row').count(), 25);
  await settings();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير نسخة', exact: true }).click();
  assert((await download).suggestedFilename().endsWith('.json'));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('heading', { name: 'مساحة معلمك', exact: true }).waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'مساحة معلمك', exact: true }).waitFor();
  await page.locator('[data-action="open-grade"][data-grade="2"]').click();
  assert.equal(await page.locator('.student-row').count(), 25);
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  assert.deepEqual(googleRequests, []);
  console.log(`PASS production ${VERSION}: configured Drive opt-in with no Google requests, complete 25-name Word import, persistence, no duplicates, backup download and offline reload. Real Google consent/upload not tested.`);
} finally {
  await browser.close();
  server?.kill();
}
