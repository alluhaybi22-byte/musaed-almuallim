import { action as uiAction, prepareAction } from './ui.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import * as XLSX from '../src/vendor/xlsx.mjs';
import { zipSync, strToU8 } from '../src/vendor/fflate.mjs';
let pw;
try { pw = await import('@playwright/test'); }
catch { pw = await import(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/index.mjs'); }
await mkdir('test-results', {recursive:true});
const names = Array.from({length:25},(_,i)=>`محمد أحمد علي التجريبي ${i+1}`);
const head = ['م','اسم الطالب','ولي الأمر'];
const rows = names.map((n,i)=>[i+1,n,`ولي تجريبي ${i+1}`]);
const book=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([head,...rows.slice(0,12)]),'الجزء الأول');
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([head,...rows.slice(12)]),'الجزء الثاني');
await writeFile('test-results/complete.xlsx',XLSX.write(book,{bookType:'xlsx',type:'buffer'}));
const wide = [['م','اسم الطالب','ولي الأمر','م','اسم الطالب','ولي الأمر']];
for(let i=0;i<13;i++) wide.push([...rows[i],...(rows[i+13]||['','',''])]);
const xls=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(xls,XLSX.utils.aoa_to_sheet(wide),'الكشف');
await writeFile('test-results/complete.xls',XLSX.write(xls,{bookType:'xls',type:'buffer'}));
const cell=t=>`<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const row=r=>`<w:tr>${r.map(cell).join('')}</w:tr>`;
const title='<w:tr><w:tc><w:tcPr><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>كشف تجريبي</w:t></w:r></w:p></w:tc></w:tr>';
const xml=`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>${title}${row(head)}${rows.slice(0,12).map(row).join('')}${row(['','','معلم المادة : معلم تجريبي'])}</w:tbl><w:p/><w:tbl>${row(head)}${rows.slice(12).map(row).join('')}</w:tbl></w:body></w:document>`;
await writeFile('test-results/complete.docx',zipSync({'word/document.xml':strToU8(xml)}));
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'4192'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),15000);server.stdout.on('data',d=>{if(String(d).includes('http://localhost')){clearTimeout(timer);resolve();}});});
let browser;
try {
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
 for(const ext of ['docx','xlsx','xls']){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(); page.setDefaultTimeout(10000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4192');
  const click=a=>uiAction(page,a);
  await page.locator('[data-action="grade"][data-grade="2"]').click();
  await page.locator('.nav [data-route="students"]').click();
  const open=async()=>{
   await click('roster');
   await page.locator('#roster-file').setInputFiles('test-results/complete.'+ext);
   await page.locator('[data-roster-sheet-include]').first().waitFor();
   if(ext==='xlsx') await page.locator('[data-roster-sheet-include="1"]').check();
   await page.locator('#import-roster').click();
   await page.locator('#roster-confirm-form').waitFor();
   const inputs=page.locator('[data-roster-name]');
   assert.equal(await inputs.count(),25,ext+' complete review');
   assert.deepEqual((await inputs.evaluateAll(xs=>xs.map(x=>x.value))).sort(),[...names].sort());
   await page.getByRole('button',{name:'اعتماد الكشف',exact:true}).click();
   await page.locator('#roster-confirm-form').waitFor({state:'detached'});
  };
  await open(); await page.reload(); await page.locator('[data-action="grade"][data-grade="2"]').click();
  await page.locator('.nav [data-route="students"]').click(); await page.locator('.student-row').first().waitFor();
  assert.equal(await page.locator('.student-row').count(),25,ext+' persisted roster');
  await open(); assert.equal(await page.locator('.student-row').count(),25,ext+' duplicate prevention');
  assert.deepEqual(errors,[]); console.log('PASS',ext,'25 full names reviewed, saved, reloaded, reimported without duplicates');
  await context.close();
 }
}finally {await browser?.close();server.kill();}
