import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
let pw;try{pw=await import('@playwright/test');}catch{pw=await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/index.mjs');}
assert.equal(spawnSync(process.execPath,['scripts/build-portable.mjs'],{stdio:'inherit'}).status,0);
const browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox']}),context=await browser.newContext(),page=await context.newPage(),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
try{
 await page.goto(pathToFileURL(resolve('dist/Al-Musaed-Desktop.html')).href);await page.getByRole('heading',{name:'مساحة معلمك'}).waitFor();
 assert.equal(await page.locator('.grade-card').count(),3);
 await page.locator('[data-action="open-grade"][data-grade="1"]').click();await page.getByRole('button',{name:'إضافة طالب',exact:true}).first().click();
 await page.getByLabel('اسم الطالب',{exact:true}).fill('طالب نسخة الكمبيوتر');await page.getByRole('button',{name:'حفظ الطالب',exact:true}).click();await page.getByText('طالب نسخة الكمبيوتر',{exact:true}).waitFor();
 await page.getByRole('button',{name:'بدء اختبار',exact:true}).click();await page.getByRole('button',{name:'إلغاء الكل',exact:true}).click();await page.locator('[data-skill$="-fatha"]').first().check();await page.getByRole('button',{name:'بدء الاختبار',exact:true}).click();
 for(let i=0;i<6;i++){const before=await page.locator('.assessment-body .row.between small').textContent();await page.getByRole('button',{name:'متقن',exact:true}).click();await page.waitForFunction(old=>document.querySelector('.assessment-body .row.between small')?.textContent!==old,before);}
 await page.getByRole('button',{name:'حفظ نتيجة الاختبار',exact:true}).click();await page.getByRole('dialog').waitFor();assert.ok((await page.locator('#report').innerText()).includes('١٠٠٪'));
 await page.reload();await page.getByRole('heading',{name:'مساحة معلمك'}).waitFor();assert.equal(await page.locator('.metric strong').nth(0).textContent(),'١');assert.equal(await page.locator('.metric strong').nth(1).textContent(),'١');
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);console.log('PASS: desktop file opens directly, performs assessment, retains data after reload and makes no network requests.');
 await page.locator('[data-action="open-grade"][data-grade="1"]').click();
 await page.getByRole('button',{name:'بدء اختبار',exact:true}).click();
 await page.getByRole('button',{name:'إلغاء الكل',exact:true}).click();
 await page.locator('[data-skill$="-listening"]').check();
 await page.getByRole('button',{name:'بدء الاختبار',exact:true}).click();
 await page.locator('#listening-audio').waitFor();
 assert((await page.locator('#listening-audio').getAttribute('src')).startsWith('data:audio/mpeg;base64,'));
 await page.waitForFunction(()=>Number.isFinite(document.querySelector('#listening-audio')?.duration));
 const duration=await page.locator('#listening-audio').evaluate(a=>a.duration);
 assert(duration>5&&duration<90);
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 console.log('PASS: portable narration is embedded and decodes without any external requests.');
}finally{await browser.close();}
