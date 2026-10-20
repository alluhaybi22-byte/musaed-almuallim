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
  for(const grade of [1,2,3]) {
    await page.locator('[data-action="grade"][data-grade="'+grade+'"]').click();
  await page.locator('.nav [data-route="students"]').click();
    for(const name of ['أول '+grade,'تال '+grade]) {
      await action('add-student');
      await page.locator('#student-form [name="name"]').fill(name);
      await page.locator('#student-form button[type="submit"]').click();
      await page.locator('#student-form').waitFor({state:'detached'});
    }
    await page.locator('.student-row').filter({hasText:'أول '+grade}).locator('[data-action="assess-student"]').click();
    await action('clear-selection');
    await page.locator('[data-skill]').first().check();
    await action('preview-cards');
    const count=await page.locator('[data-card-edit]').count();
    assert(count>1);
    await action('save-preview');
    await action('start-assessment');
    for(let i=0;i<count-1;i++) {
      const before=await page.locator('.assessment-body .row.between small').innerText();
      await page.keyboard.press('3');
      await page.waitForFunction(before=>document.querySelector('.assessment-body .row.between small')?.textContent!==before,before);
      assert((await page.locator('.assessment-head h1').innerText()).includes('أول'));
    }
    if(grade===3) {
      await page.evaluate(()=>{
        const original=IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction=function(...args){
          if(args[1]==='readwrite'){
            IDBDatabase.prototype.transaction=original;
            throw new Error('اختبار فشل الحفظ المؤقت');
          }
          return original.apply(this,args);
        };
      });
      await page.keyboard.press('1');
      await page.getByText('اختبار فشل الحفظ المؤقت',{exact:true}).waitFor();
      assert((await page.locator('.assessment-head h1').innerText()).includes('أول'));
    }
    await page.keyboard.press('1');
    await page.locator('.assessment-head h1').filter({hasText:'تال '+grade}).waitFor();
    assert.equal(await page.locator('#report').count(),0);
    for(let i=0;i<count;i++){
      const before=await page.locator('.assessment-body .row.between small').innerText();
      await page.keyboard.press('4');
      await page.waitForFunction(before=>document.querySelector('.assessment-body .row.between small')?.textContent!==before,before);
    }
    await page.locator('#session-sheet').waitFor();
    assert.equal(await page.locator('#report').count(),0);
    await page.locator('.nav [data-route="home"]').click();
  }
  await page.reload();
  await page.locator('.nav [data-route="settings"]').click();
  const download=page.waitForEvent('download');
  await action('backup');
  const file=await download;
  const data=JSON.parse(await readFile(await file.path(),'utf8'));
  assert.equal(data.results.length,6);
  assert.equal(data.drafts.length,0);
  for(const grade of [1,2,3]) assert.equal(data.results.filter(r=>r.grade===grade).length,2);
  assert.deepEqual(errors.filter(e=>!e.includes('اختبار فشل الحفظ المؤقت')),[]);
  console.log('PASS multi-card auto-save/next/end in all grades; atomic failure retains student and retry succeeds; six durable results and no automatic report.');
} finally {
  await browser.close();
  server.kill();
}

