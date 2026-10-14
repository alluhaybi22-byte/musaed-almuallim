import assert from 'node:assert/strict';import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
let pw;try{pw=await import('@playwright/test');}catch{pw=await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/index.mjs');}
const browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']}),context=await browser.newContext({viewport:{width:1440,height:1024}}),page=await context.newPage();
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Dev server did not start')),15000);server.stdout.on('data',d=>{if(String(d).includes('http://localhost')){clearTimeout(timeout);resolve();}});server.on('exit',code=>{if(code)reject(Error('Dev server failed'));});});
await mkdir('test-results',{recursive:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(10000);
async function click(name){await page.getByRole('button',{name,exact:true}).first().click();}
async function screenshot(name){await page.screenshot({path:`test-results/${name}.png`,fullPage:true});}
try{
 await page.goto('http://localhost:4173');await page.getByRole('heading',{name:'مساحة معلمك'}).waitFor();await screenshot('home-desktop');await page.setViewportSize({width:390,height:844});await screenshot('home-mobile-empty');await page.setViewportSize({width:1440,height:1024});
 assert.equal(await page.locator('.grade-card').count(),3);assert.equal(await page.locator('.metric strong').first().textContent(),'٠');
 await page.locator('[data-action="open-grade"][data-grade="1"]').click();await click('إضافة طالب');
 await page.getByLabel('اسم الطالب',{exact:true}).fill('الطالب التجريبي');await page.getByLabel('اسم ولي الأمر').fill('ولي أمر تجريبي');await click('حفظ الطالب');await page.getByText('الطالب التجريبي',{exact:true}).waitFor();
 await click('بدء اختبار');await click('إلغاء الكل');await page.locator('[data-skill$="-fatha"]').first().check();await click('بدء الاختبار');await page.locator('.stimulus').waitFor();await screenshot('assessment-desktop');
 await click('صحيح مستقل');await click('التالية');await click('بمساعدة');await click('حفظ واستكمال لاحقًا');await page.reload();await page.getByRole('heading',{name:'مساحة معلمك'}).waitFor();await click('استكمال');
 // أول بطاقة بلا حكم هي الثالثة. يعود إلى الثانية ثم الأولى ويغير حكم الأولى.
 await click('السابقة');await click('السابقة');await click('غير صحيح');await click('التالية');await click('التالية');
 for(let i=2;i<6;i++){await click('صحيح مستقل');await click(i===5?'مراجعة وحفظ':'التالية');}
 await page.locator('#final-note').fill('تحتاج الفتحة إلى تدريب إضافي.');await click('حفظ نتيجة الاختبار');await page.getByRole('dialog').waitFor();
 assert.ok((await page.locator('#report').innerText()).includes('٦٧٪'));assert.ok((await page.locator('#report').innerText()).includes('متوسط'));
 const reportText=await page.locator('#report').innerText();assert.ok(!reportText.includes('مدة الاختبار'));assert.ok(!reportText.includes('عدد البنود'));await screenshot('student-report');
 await page.pdf({path:'test-results/student-report.pdf',format:'A4',printBackground:true});await click('إغلاق');
 await page.locator('.nav [data-route="settings"]').click();const download=page.waitForEvent('download');await click('تصدير نسخة');await (await download).saveAs('test-results/backup.json');
 await page.locator('.nav [data-route="results"]').click();await click('تقرير الصف');assert.ok((await page.locator('#report').innerText()).includes('٦٧٪'));await screenshot('class-report');await click('إغلاق');
 // Offline reload and mobile layout, without putting test data into published source.
 await page.locator('.nav [data-route="home"]').click();await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.getByRole('heading',{name:'مساحة معلمك'}).waitFor();await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'مساحة معلمك'}).waitFor();await context.setOffline(false);
 await page.setViewportSize({width:390,height:844});await screenshot('home-mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Restore in a clean browser context; backup merge must not double student/result records.
 const fresh=await browser.newContext({viewport:{width:390,height:844}}),p=await fresh.newPage();await p.goto('http://localhost:4173');await p.getByRole('heading',{name:'مساحة معلمك'}).waitFor();
 await p.locator('.nav [data-route="settings"]').click();await p.locator('#restore-file').setInputFiles('test-results/backup.json');await p.getByRole('button',{name:'دمج النسخة',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});
 await p.locator('#restore-file').setInputFiles('test-results/backup.json');await p.getByRole('button',{name:'دمج النسخة',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});await p.locator('.nav [data-route="home"]').click();assert.equal(await p.locator('.metric strong').nth(0).textContent(),'١');assert.equal(await p.locator('.metric strong').nth(1).textContent(),'١');
 for(const g of [2,3]){await p.locator(`[data-action="open-grade"][data-grade="${g}"]`).click();await p.getByRole('button',{name:'إضافة طالب',exact:true}).first().click();await p.getByLabel('اسم الطالب',{exact:true}).fill('اختبار الصف '+g);await p.getByRole('button',{name:'حفظ الطالب',exact:true}).click();await p.getByText('اختبار الصف '+g,{exact:true}).waitFor();await p.getByRole('button',{name:'بدء اختبار',exact:true}).click();await p.locator('#setup-semester').selectOption('2');if(g===3)await p.locator('#setup-unit').selectOption('8');await p.locator(`[data-skill="common-g${g}-s2-u${g===3?8:5}-reading"]`).check();await p.getByRole('button',{name:'بدء الاختبار',exact:true}).click();await p.locator('.stimulus').waitFor();assert.ok((await p.locator('.assessment-head p').innerText()).includes('٢'));await p.getByRole('button',{name:'حفظ واستكمال لاحقًا',exact:true}).click();await p.getByRole('heading',{name:'مساحة معلمك'}).waitFor();}
 await fresh.close();assert.deepEqual(errors,[]);console.log('PASS: empty start, roster, manual assessment, previous-answer correction, saved draft, reload, report PDF, CSV/backup UI, offline, mobile, restore deduplication and second-semester routes for grades 2/3.');
}catch(error){await screenshot('failure');console.log('UI at failure:',(await page.locator('body').innerText()).slice(-3000));console.log('Browser errors:',errors);throw error;}finally{await browser.close();server.kill();}
