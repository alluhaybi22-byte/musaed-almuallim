const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../extension/app.js'),'utf8');
const context=vm.createContext({document:{addEventListener(){}},setTimeout,clearTimeout,console});
vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context);
test('validates leap days, real dates and Sunday week boundaries',()=>{
  assert.equal(run("parseLocalDate('2026-02-29')"),null);
  assert.equal(run("isoLocal(parseLocalDate('2024-02-29'))"),'2024-02-29');
  assert.equal(run("isoLocal(weekStart(parseLocalDate('2026-10-22')))"),'2026-10-18');
  assert.equal(run("isoLocal(addDays(parseLocalDate('2026-12-31'),1))"),'2027-01-01');
});
test('rejects malformed lessons and strips unsafe links and unexpected properties',()=>{
  assert.equal(run('sanitizeLesson(null)'),null);
  assert.equal(run("sanitizeLesson({title:'درس',date:'2026-02-30'})"),null);
  const record=run("sanitizeLesson({id:'one',title:'درس',date:'2026-10-18',resourceLink:'javascript:alert(1)',period:'11',password:'secret'})");
  assert.equal(record.resourceLink,'');assert.equal(record.period,'1');assert.equal(record.password,undefined);
  assert.equal(run("sanitizeLesson({title:'x',date:'2026-10-18',objectives:'a'.repeat(3000)}).objectives.length"),2500);
});
test('lesson export includes content and class without HTML interpretation',()=>{
  const text=run("lessonText({title:'<img src=x onerror=alert(1)>',date:'2026-10-18',className:'ثاني أ',objectives:'قراءة النص'})");
  assert.ok(text.includes('ثاني أ'));assert.ok(text.includes('قراءة النص'));assert.ok(text.includes('<img'));
});
test('Safari storage takes precedence over localStorage and writes full state',async()=>{
  let value;
  context.TibyanPlatform={storage:{local:{get:async key=>({[key]:{lessons:[{id:'existing'}]}}),set:async data=>{value=data}}}};
  assert.equal((await run('readStored()')).lessons[0].id,'existing');
  assert.equal(await run('writeStored()'),true);assert.ok(Array.isArray(value.tibyan_preparations_v1.lessons));
});
