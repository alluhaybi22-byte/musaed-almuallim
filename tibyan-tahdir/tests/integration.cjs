const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let playwright;
try{playwright=require('playwright');}catch(e){if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw e;playwright=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'));}
const folder=path.join(__dirname,'../extension');
let browser;
beforeEach(async()=>{browser=await playwright.chromium.launch({headless:true,args:process.env.TIBYAN_BROWSER_ARGS?JSON.parse(process.env.TIBYAN_BROWSER_ARGS):['--no-sandbox'],executablePath:process.env.TIBYAN_BROWSER_PATH||undefined});});
afterEach(async()=>{await browser?.close();});
async function newApp(){
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  await context.addInitScript(()=>{
    window.browser={storage:{local:{
      get:async key=>({[key]:JSON.parse(localStorage.getItem(key)||'null')}),
      set:async data=>{for(const [k,v] of Object.entries(data))localStorage.setItem(k,JSON.stringify(v));}
    }}};
  });
  await context.route('**/*',route=>{
    const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
    if(!['index.html','styles.css','platform.js','app.js'].includes(name))return route.abort();
    route.fulfill({contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(folder,name))});
  });
  const page=await context.newPage();await page.goto('http://tibyan.test/index.html');
  await page.locator('.template-card').first().waitFor();
  if(process.env.TIBYAN_QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.TIBYAN_QA_SCREENSHOTS,'home.png'),fullPage:true});
  return {context,page};
}
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('tibyan_preparations_v1')));
test('mobile library: create, persist, schedule, conflicts, backup merge and profile restore',async()=>{
  const {context,page}=await newApp();
  try{
    assert.equal(await page.locator('#totalCount').textContent(),'0');
    await page.locator('.template-card').first().click();
    await page.locator('#title').fill('الصديقان');await page.locator('#className').fill('ثاني أ');
    await page.locator('#date').fill('2026-10-18');
    await page.locator('#lessonForm button[type=submit]').click();
    await page.locator('.lesson-card').waitFor();
    let data=await saved(page);assert.equal(data.lessons.length,1);assert.ok(data.lessons[0].objectives);
    await page.reload();await page.locator('.template-card').first().waitFor();
    await page.locator('[data-tab=library]').click();assert.equal(await page.locator('.lesson-card').count(),1);
    await page.locator('[data-action=schedule]').click();
    await page.locator('#scheduleRows [data-field=className]').fill('ثاني ب');
    await page.locator('#addScheduleRow').click();
    await page.locator('#scheduleRows [data-field=className]').nth(1).fill('ثاني ج');
    await page.locator('#scheduleForm button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelectorAll('.lesson-card').length===3);
    assert.equal((await saved(page)).lessons.length,3);
    await page.locator('[data-action=schedule]').first().click();
    await page.locator('#scheduleRows [data-field=className]').fill('ثاني ب');
    await page.locator('#scheduleForm button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('تعارض'));
    assert.equal((await saved(page)).lessons.length,3);await page.locator('#closeSchedule').click();
    await page.locator('[data-tab=weekly]').click();
    await page.locator('#goThisWeek').click();
    // Current runtime date is irrelevant to the explicit schedule storage assertion.
    await page.locator('[data-tab=settings]').click();
    const downloadPromise=page.waitForEvent('download');await page.locator('#exportBackup').click();
    const download=await downloadPromise;const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.equal(backup.lessons.length,3);assert.equal(backup.app,'tibyan-tahdir');
    const incoming={...backup,profile:{teacher:'معلم تجريبي',school:'مدرسة تجريبية'},lessons:[...backup.lessons,{...backup.lessons[0],id:'new-import',title:'درس مستورد'}]};
    const upload=()=>page.locator('#importBackup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
    await page.locator('#importProfile').check();await upload();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('tibyan_preparations_v1')).lessons.length===4);
    assert.equal((await saved(page)).profile.teacher,'معلم تجريبي');
    await upload();await page.waitForFunction(()=>document.querySelector('#importBackup').value==='');
    assert.equal((await saved(page)).lessons.length,4);
    await page.locator('#importBackup').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('فشل الاستيراد'));
    assert.equal((await saved(page)).lessons.length,4);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');
  }finally{await context.close();}
});

async function fixture(){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let network=0;await context.route('**/*',route=>{network++;return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="ar" dir="rtl"><body>
    <form id="form"><label for="objectives">الأهداف</label><textarea id="objectives"></textarea>
    <label for="homework">الواجب المنزلي</label><textarea id="homework">واجب قديم</textarea>
    <label for="warmup">التهيئة</label><textarea id="warmup"></textarea>
    <input type="password" id="password"><input type="text" id="username"><label for="id9">اسم المستخدم</label><input type="text" id="id9"><textarea hidden id="hidden"></textarea>
    <iframe title="الأنشطة" srcdoc='<body contenteditable="true">محتوى المحرر القديم</body>'></iframe>
    <button id="save" type="submit">حفظ</button></form></body></html>`});});
  const page=await context.newPage();await page.goto('https://schools.madrasati.sa/test');
  await page.evaluate(()=>{
    window.saveCount=0;document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();window.saveCount++});
    // Any credential-value access fails this integration test.
    for(const id of ['password','username','id9'])Object.defineProperty(document.getElementById(id),'value',{get(){throw new Error('credentials accessed')},set(){throw new Error('credentials changed')}});
    const lesson={id:'one',title:'درس تجريبي',className:'ثاني أ',date:'2026-10-18',objectives:'يقرأ النص',warmup:'تمهيد جديد',homework:'واجب جديد',activities:'نشاط أول\nنشاط ثان'};
    window.browser={runtime:{getURL:p=>'https://extension.invalid/'+p},storage:{local:{get:async key=>({[key]:{lessons:[lesson]}})}}};
  });
  await page.addScriptTag({path:path.join(folder,'platform.js')});await page.addScriptTag({path:path.join(folder,'content.js')});
  await page.locator('#tibyan-tahdir-host .toggle').click();
  await page.locator('#tibyan-tahdir-host [role=status]').filter({hasText:'تم العثور'}).waitFor();
  if(process.env.TIBYAN_QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.TIBYAN_QA_SCREENSHOTS,'panel.png'),fullPage:true});
  return {page,context,network:()=>network,host:page.locator('#tibyan-tahdir-host')};
}
test('page assistant: excludes credentials, previews, protects existing content, fills iframe and supports undo',async()=>{
  const {page,context,host,network}=await fixture();
  try{
    const optionText=await host.locator('select[data-field=objectives] option').allTextContents();
    assert.ok(!optionText.join().includes('username'));assert.ok(!optionText.join().includes('password'));assert.ok(!optionText.join().includes('hidden'));assert.ok(!optionText.join().includes('اسم المستخدم'));
    await host.getByRole('button',{name:'معاينة التعبئة',exact:true}).click();
    assert.ok(await host.locator('[role=status]').textContent().then(s=>s.includes('يحتوي نص')));
    assert.equal(await page.locator('#objectives').inputValue(),'');
    await host.locator('input[type=checkbox]').check();
    await host.getByRole('button',{name:'معاينة التعبئة',exact:true}).click();
    await host.getByRole('button',{name:'تعبئة الحقول المعروضة',exact:true}).click();
    assert.equal(await page.locator('#objectives').inputValue(),'يقرأ النص');
    assert.equal(await page.locator('#homework').inputValue(),'واجب جديد');
    assert.equal(await page.frameLocator('iframe').locator('body').innerText(),'نشاط أول\nنشاط ثان');
    assert.equal(await page.evaluate(()=>window.saveCount),0);
    await page.locator('#homework').fill('تعديل يدوي');
    await host.getByRole('button',{name:'التراجع عن آخر تعبئة',exact:true}).click();
    assert.equal(await page.locator('#objectives').inputValue(),'');
    assert.equal(await page.locator('#homework').inputValue(),'تعديل يدوي');
    assert.equal(await page.frameLocator('iframe').locator('body').innerText(),'محتوى المحرر القديم');
    assert.equal(network(),1,'no request from assistant');
  }finally{await context.close();}
});
test('page assistant: duplicate targets and stale previews never write',async()=>{
  const {page,context,host}=await fixture();
  try{
    await host.locator('input[type=checkbox]').check();
    const objectives=await host.locator('[data-field=objectives]').inputValue();
    await host.locator('[data-field=warmup]').selectOption(objectives);
    await host.getByRole('button',{name:'معاينة التعبئة',exact:true}).click();
    assert.ok((await host.locator('[role=status]').textContent()).includes('مكرر'));
    assert.equal(await page.locator('#objectives').inputValue(),'');
    await host.getByRole('button',{name:'تحديث التحاضير والحقول',exact:true}).click();
    await page.waitForTimeout(30);
    await host.getByRole('button',{name:'معاينة التعبئة',exact:true}).click();
    await page.locator('#objectives').fill('تغيير بعد المعاينة');
    await host.getByRole('button',{name:'تعبئة الحقول المعروضة',exact:true}).click();
    assert.ok((await host.locator('[role=status]').textContent()).includes('تغيرت الصفحة'));
    assert.equal(await page.locator('#objectives').inputValue(),'تغيير بعد المعاينة');
    assert.equal(await page.locator('#homework').inputValue(),'واجب قديم');
  }finally{await context.close();}
});
