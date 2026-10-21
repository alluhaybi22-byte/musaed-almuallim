import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
let pw;
try {pw=await import('@playwright/test');} catch {pw=await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/index.mjs');}
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4203'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('http://localhost')){clearTimeout(timer);resolve();}});});
const browser=await pw.chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
const action=a=>page.locator('[data-action="'+a+'"]:visible').first().click();
const state=()=>page.evaluate(async()=>(await import('/src/storage.js')).readState());
async function setup(lesson='g2-u1-l2',skill='single') {
 await page.locator('.nav [data-route="setup"]').click();
 if(await page.locator('#setup-unit').inputValue()!=='1') await page.locator('#setup-unit').selectOption('1');
 await page.locator('#setup-lesson').selectOption(lesson);
 await page.locator('#setup-skill').selectOption(skill);
}
async function gradeRemaining(score='proficient') {
 const name=await page.locator('.assessment-head h1').innerText();
 for(let guard=0;guard<30;guard++){
  if(!(await page.locator('.assessment-head h1').count()) || await page.locator('.assessment-head h1').innerText()!==name) return;
  const before=await page.locator('.assessment-body .row.between small').innerText();
  await page.locator('[data-action="score"][data-score="'+score+'"]').click();
  await page.waitForFunction(before=>document.querySelector('.assessment-body .row.between small')?.textContent!==before,before);
 }
 throw Error('Student did not finish');
}
try {
 await page.goto('http://localhost:4203');await page.getByRole('heading',{name:'صفي',exact:true}).waitFor();
 await page.evaluate(async()=>{
  const storage=await import('/src/storage.js'),{lessonReadingSkills,lessonReadingCards}=await import('/src/reading-lessons.js'),{instantiatePlan}=await import('/src/completion.js');
  const s=await storage.readState();s.students=[{id:'a',name:'أسامة',grade:2,section:'أ'},{id:'b',name:'إلياس',grade:2,section:'أ'},{id:'c',name:'طالب ثالث',grade:2,section:'أ'},{id:'outside',name:'طالب شعبة أخرى',grade:2,section:'ب'}];
  const make=(id,lessons)=>{
   const plan={grade:2,semester:1,unit:1,cards:lessons.flatMap(l=>lessonReadingCards(lessonReadingSkills(l).find(x=>x.readingLevel==='single')))};
   const {cards}=instantiatePlan({results:[]},plan,id);
   return {id:'old-'+id,studentId:id,...plan,cards,answers:Object.fromEntries(cards.map(c=>[c.id,{score:'incorrect'}])),startedAt:'2026-10-20T10:00:00Z',completedAt:'2026-10-20T10:01:00Z',scoring:s.settings};
  };
  s.results=[make('a',['g2-u1-l1']),make('b',['g2-u1-l1','g2-u1-l2'])];await storage.writeState(s);
 });
 await page.reload();await page.locator('.nav [data-route="setup"]').click();await page.locator('[data-action="grade"][data-grade="2"]').click();
 await page.locator('#setup-section').selectOption('أ');
 await page.locator('#setup-lesson').selectOption('all');
 assert.equal(await page.locator('#setup-student').count(),0);
 assert(await page.evaluate(()=>document.querySelector('.setup-side').getBoundingClientRect().top > document.querySelector('.setup>section').getBoundingClientRect().top),'mobile setup must show class and skill before students');
 assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'٢');
 await page.locator('.pending-students').evaluate(el=>el.open=true);
 assert.deepEqual(await page.locator('.pending-students li').allTextContents(),['أسامة','طالب ثالث']);
 await action('start-assessment');
 assert.equal(await page.locator('.assessment-head h1').innerText(),'أسامة');
 assert((await page.locator('.badge.blue').innerText()).includes('عذرًا يا جدي'));
 await gradeRemaining('incorrect');
 assert.equal(await page.locator('.assessment-head h1').innerText(),'طالب ثالث');
 assert((await page.locator('.assessment-body .row.between small').innerText()).includes('٢'));
 await gradeRemaining();await page.locator('#session-sheet').waitFor();
 await setup('all');assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'٠');assert(await page.locator('[data-action="start-assessment"]').isDisabled());
 await setup('g2-u1-l2');assert(await page.locator('[data-action="start-assessment"]').isDisabled());
 await page.locator('#setup-skill').selectOption('dictation');
 assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'٣');
 await action('start-assessment');await page.locator('[data-action="score"][data-score="excellent"]').click();
 await page.waitForFunction(()=>document.querySelector('.assessment-body .row.between small')?.textContent.includes('٢'));
 const paused=(await state()).drafts.find(d=>d.studentId==='a');
 await action('pause');await page.locator('.nav [data-route="setup"]').click();
 await action('start-assessment');
 assert.equal((await state()).drafts.filter(d=>d.studentId==='a').length,1);
 assert.equal((await state()).drafts.find(d=>d.studentId==='a').id,paused.id);
 await gradeRemaining();assert.equal(await page.locator('.assessment-head h1').innerText(),'إلياس');
 await action('skip-student');await page.locator('.assessment-head h1').filter({hasText:'طالب ثالث'}).waitFor();assert.equal(await page.locator('.assessment-head h1').innerText(),'طالب ثالث');await gradeRemaining();
 await setup('g2-u1-l2','dictation');assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'١');
 await action('start-assessment');assert.equal(await page.locator('.assessment-head h1').innerText(),'إلياس');await gradeRemaining();
 await page.reload();await setup('g2-u1-l2','dictation');assert(await page.locator('[data-action="start-assessment"]').isDisabled());
 await page.locator('#setup-skill').selectOption('listening');assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'٣');
 await action('start-assessment');await action('student-display');
 assert(!(await page.locator('#app').innerText()).includes('اذكر شخصية'));assert(!(await page.locator('#app').innerText()).includes('مَكْتَبَةِ الْمَدْرَسَةِ'));
 await action('student-display');await action('listening-read');await gradeRemaining('advanced');
 await action('skip-student');await page.locator('.assessment-head h1').filter({hasText:'طالب ثالث'}).waitFor();await action('skip-student');await page.locator('#session-sheet').waitFor();
 await setup('g2-u1-l2','listening');assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'٢');
 await page.locator('#setup-unit').selectOption('2');await page.locator('#setup-lesson').selectOption('g2-u2-l1');
 assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'٣');
 await page.locator('#setup-section').selectOption('ب');assert.equal(await page.locator('#pending-roster-summary strong').innerText(),'١');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/skill-first-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS grade→unit→lesson(s)→skill→automatic remaining roster; legacy completion; multi-lesson partial coverage; separate dictation/listening; pause/restart reuse; skipped students; reload; section isolation; student-view privacy');
}catch(error){await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/skill-flow-failure.png',fullPage:true});console.log((await page.locator('body').innerText()).slice(-4500));throw error;}
finally{await browser.close();server.kill();}
