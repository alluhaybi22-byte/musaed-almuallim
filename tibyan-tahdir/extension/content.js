/* Independent, local-only form assistant. No Madrasati API or save action. */
(() => {
  'use strict';
  if (window !== window.top || document.getElementById('tibyan-tahdir-host')) return;
  const api = globalThis.TibyanPlatform;
  const KEY = 'tibyan_preparations_v1';
  const fields = [
    ['objectives', 'نواتج التعلم والأهداف', ['الأهداف', 'نواتج التعلم', 'objectives', 'learning outcomes']],
    ['warmup', 'التهيئة والتمهيد', ['التهيئة', 'التمهيد', 'warmup']],
    ['activities', 'الأنشطة وخطوات الدرس', ['الأنشطة', 'خطوات الدرس', 'activities']],
    ['strategies', 'استراتيجيات التدريس', ['استراتيجيات التدريس', 'الاستراتيجيات', 'strategies']],
    ['assessment', 'التقويم', ['التقويم', 'التحقق من التعلم', 'assessment']],
    ['homework', 'الواجب المنزلي', ['الواجب', 'الواجب المنزلي', 'homework']],
    ['enrichment', 'الإثراء', ['الإثراء', 'الاثراءات', 'enrichment']],
    ['resourceLink', 'رابط المورد', ['رابط المورد', 'رابط الإثراء', 'resource link']]
  ];
  const host = document.createElement('div'); host.id = 'tibyan-tahdir-host';
  host.style.cssText = 'all:initial;position:fixed;bottom:20px;right:16px;z-index:2147483646;direction:rtl';
  const root = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = `
    :host{font-family:Arial,sans-serif;color:#173550;line-height:1.7;font-size:15px}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}
    button{cursor:pointer;border:1px solid #cbdce4;background:#edf5f8;color:#173550;border-radius:9px;padding:9px 12px;min-height:44px}
    button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #46b8af}
    .primary{background:#116f9b;color:white;border-color:#116f9b}.toggle{background:#173550;color:#fff;box-shadow:0 4px 18px #0003}
    .panel{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));width:min(450px,calc(100vw - 24px));max-height:88vh;max-height:88dvh;overflow:auto;background:#fff;border:1px solid #ccdce6;border-radius:16px;box-shadow:0 8px 50px #0004;padding:18px;direction:rtl;text-align:right}
    [hidden]{display:none!important}h2{font-size:20px;margin:0}h3{font-size:16px;margin:14px 0 8px}p{font-size:14px;margin:8px 0}
    .head,.buttons{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    label{display:block;margin:10px 0;font-weight:bold;font-size:14px}select,textarea{display:block;width:100%;padding:9px;border:1px solid #b5cbd8;border-radius:8px;background:#fff;color:#173550;font-size:16px}
    textarea{font-weight:normal;white-space:pre-wrap;min-height:80px;resize:vertical}input[type=checkbox]{width:20px;height:20px;vertical-align:middle}
    .status{background:#eef5f8;padding:10px;border-radius:8px;white-space:pre-wrap}.mapping{border-top:1px solid #dce7ed;padding-top:4px}.preview{border:1px solid #dce7ed;border-radius:8px;margin:8px 0;padding:10px}.preview pre{font:14px Arial;white-space:pre-wrap;overflow-wrap:anywhere}.old{color:#677a86}.note{color:#566e7c;font-size:13px}
  `;
  root.append(style);
  const make = (tag, text, cls) => {const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
  const toggle = make('button', 'تبيان · التحضير', 'toggle'); toggle.type='button'; toggle.setAttribute('aria-expanded','false');
  const panel = make('section', '', 'panel'); panel.hidden=true; panel.setAttribute('role','region'); panel.setAttribute('aria-label','مساعد التحضير');
  const head = make('div','','head'), close = make('button','إغلاق'); close.type='button';
  head.append(make('h2','تبيان · مساعد التحضير'),close);
  const status = make('p','اختر تحضيرًا محفوظًا.','status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const lessonSelect=make('select'); lessonSelect.setAttribute('aria-label','التحضير المحفوظ');
  const refresh=make('button','تحديث التحاضير والحقول'); refresh.type='button';
  const library=make('button','فتح مكتبة التحضير'); library.type='button';
  const topButtons=make('div','','buttons'); topButtons.append(refresh,library);
  const mapping=make('div','','mapping'), preview=make('div');
  const allowLabel=make('label'), allowOverwrite=make('input'); allowOverwrite.type='checkbox';
  allowLabel.append(allowOverwrite,document.createTextNode(' السماح باستبدال محتوى الحقول غير الفارغة'));
  const prepare=make('button','معاينة التعبئة','primary'); prepare.type='button';
  const apply=make('button','تعبئة الحقول المعروضة','primary'); apply.type='button'; apply.disabled=true;
  const undo=make('button','التراجع عن آخر تعبئة'); undo.type='button'; undo.disabled=true;
  const actions=make('div','','buttons'); actions.append(prepare,apply,undo);
  panel.append(head,make('p','افتح إعداد الدرس أولًا. اربط كل عنصر بحقل الصفحة، ثم راجع المعاينة. بعد التعبئة راجع الدرس واحفظه من زر مدرستي.', 'note'),status,lessonSelect,topButtons,mapping,allowLabel,actions,preview);
  root.append(toggle,panel); document.documentElement.append(host);
  let lessons=[], candidates=[], mappings=new Map(), pending=[], last=[];
  const norm = s => String(s||'').replace(/[\u064b-\u065f\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ـ/g,'').trim().replace(/\s+/g,' ').toLowerCase();
  const clean = (v,max=2500)=>typeof v==='string'?v.slice(0,max).trim():'';
  function visible(node) {
    if (!node.isConnected || node.closest('[hidden],[inert]')) return false;
    const w=node.ownerDocument.defaultView;
    const css=w.getComputedStyle(node);
    return css.display!=='none' && css.visibility!=='hidden' && css.visibility!=='collapse' && node.getClientRects().length>0;
  }
  function eligible(node) {
    if (!visible(node) || node.disabled || node.readOnly || node.getAttribute('aria-disabled')==='true') return false;
    if (node.tagName==='INPUT' && !['text','url'].includes(node.type)) return false;
    if (node.tagName!=='INPUT' && node.tagName!=='TEXTAREA' && !node.isContentEditable) return false;
    if (node.getAttribute('contenteditable')==='false') return false;
    return !/(password|username|login|search|email|كلمة.?المرور|اسم.?المستخدم|البحث)/i.test([node.id,node.name,node.getAttribute('autocomplete'),node.getAttribute('aria-label'),labelFor(node)].join(' '));
  }
  function labelFor(node, fallback='') {
    const doc=node.ownerDocument;
    const labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'').join(' ').trim();
    const labels=node.labels ? [...node.labels].map(l=>l.textContent.trim()).join(' ') : '';
    return clean(labelled||labels||node.getAttribute('aria-label')||node.getAttribute('placeholder')||fallback||node.name||node.id||'حقل نصي',160);
  }
  function scanDocument(doc, fallback='', depth=0) {
    if(depth>3) return;
    for(const node of doc.querySelectorAll('textarea,input,[contenteditable="true"],[contenteditable=""]')) {
      if(node.parentElement?.closest('[contenteditable="true"],[contenteditable=""]')) continue;
      if(eligible(node)) candidates.push({node,label:labelFor(node,fallback)});
    }
    for(const frame of doc.querySelectorAll('iframe')) {
      if(!visible(frame)) continue;
      try {if(frame.contentDocument)scanDocument(frame.contentDocument,labelFor(frame,frame.title||'محرر داخل إطار'),depth+1);} catch {/* Cross-origin editors require manual copying. */}
    }
  }
  function invalidate() {pending=[];preview.replaceChildren();apply.disabled=true;}
  function renderMappings() {
    invalidate(); mappings=new Map(); mapping.replaceChildren(); candidates=[]; scanDocument(document);
    const lesson=lessons.find(x=>x.id===lessonSelect.value);
    for(const [key,label,aliases] of fields) {
      if(!lesson?.[key])continue;
      const wrapper=make('label',label), select=make('select'); select.dataset.field=key; select.setAttribute('aria-label',label);
      select.append(new Option('لا تعبئ هذا العنصر',''));
      candidates.forEach((c,i)=>select.append(new Option(`${i+1}. ${c.label}`,String(i))));
      const hits=candidates.map((c,i)=>aliases.some(a=>norm(c.label)===norm(a))?i:-1).filter(i=>i>=0);
      if(hits.length===1)select.value=String(hits[0]);
      select.addEventListener('change',invalidate); mappings.set(key,select); wrapper.append(select);mapping.append(wrapper);
    }
    status.textContent=lesson?`الدرس: ${lesson.title} · ${lesson.className||lesson.grade||''} · ${lesson.date||''}\nتم العثور على ${candidates.length} حقل نصي ظاهر. راجع الربط قبل المعاينة.`:'لا توجد تحاضير محفوظة. افتح مكتبة التحضير وأضف درسًا، ثم عد واضغط تحديث.';
  }
  async function load() {
    try {
      const data=await api.storage.local.get(KEY), saved=data[KEY];
      const selected=lessonSelect.value;
      lessons=(Array.isArray(saved?.lessons)?saved.lessons:[]).slice(0,2000).filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&typeof x.title==='string').map(x=>{
        const l={id:clean(x.id,100),title:clean(x.title,160),className:clean(x.className,50),grade:clean(x.grade,80),date:clean(x.date,50)};
        for(const [key] of fields)l[key]=clean(x[key],key==='resourceLink'?500:2500);
        if(l.resourceLink&&!/^https?:\/\//i.test(l.resourceLink))l.resourceLink='';
        return l;
      });
      lessonSelect.replaceChildren();
      lessons.forEach(x=>lessonSelect.append(new Option(`${x.title} · ${x.className||x.grade} · ${x.date}`,x.id)));
      if(lessons.some(x=>x.id===selected))lessonSelect.value=selected;
      renderMappings();
    } catch {status.textContent='تعذر قراءة مكتبة التحضير. أعد فتح الإضافة وتحقق من الإذن.';invalidate();}
  }
  const read = node => node.isContentEditable ? node.textContent : node.value;
  function write(node,value) {
    if(node.isContentEditable) {
      node.replaceChildren();
      for(const line of value.split('\n')){const div=node.ownerDocument.createElement('div');div.textContent=line||'\u200b';node.append(div);}
    } else {
      const w=node.ownerDocument.defaultView;
      const proto=node.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);
    }
    const w=node.ownerDocument.defaultView;
    node.dispatchEvent(new w.Event('input',{bubbles:true})); node.dispatchEvent(new w.Event('change',{bubbles:true}));
  }
  prepare.addEventListener('click',()=>{
    invalidate();const lesson=lessons.find(x=>x.id===lessonSelect.value);if(!lesson)return;
    const used=new Set(), items=[];
    for(const [key,label] of fields) {
      const index=mappings.get(key)?.value;if(index===undefined||index==='')continue;
      const c=candidates[Number(index)];
      if(!c||!eligible(c.node)){status.textContent='تغيرت حقول الصفحة. اضغط تحديث وأعد الربط.';return;}
      if(used.has(c.node)){status.textContent='اختر حقلًا مختلفًا لكل عنصر؛ يوجد ربط مكرر.';return;}
      used.add(c.node);
      const old=read(c.node);
      if(old.trim()&&!allowOverwrite.checked){status.textContent='أحد الحقول المختارة يحتوي نصًا. ألغ ربطه أو فعّل السماح بالاستبدال ثم راجع المعاينة.';return;}
      items.push({key,label,node:c.node,target:c.label,value:lesson[key],old,oldNodes:c.node.isContentEditable?[...c.node.childNodes].map(n=>n.cloneNode(true)):null});
    }
    if(!items.length){status.textContent='اختر حقلًا واحدًا على الأقل للتعبئة.';return;}
    pending=items;
    preview.append(make('h3','المعاينة قبل التعبئة'));
    for(const item of pending){const card=make('article','','preview');card.append(make('strong',`${item.label} ← ${item.target}`),make('pre',`الحالي: ${item.old||'(فارغ)'}`,'old'),make('pre',`الجديد: ${item.value}`));preview.append(card);}
    apply.disabled=false;status.textContent=`جاهز لتعبئة ${pending.length} حقل. لن يُضغط زر حفظ الدرس.`;
  });
  apply.addEventListener('click',()=>{
    if(!pending.length)return;
    if(pending.some(x=>!eligible(x.node)||read(x.node)!==x.old)){invalidate();status.textContent='تغيرت الصفحة أو محتويات الحقول بعد المعاينة. أعد المعاينة قبل التعبئة.';return;}
    last=[];
    for(const item of pending){
      try {write(item.node,item.value);item.written=read(item.node);last.push(item);}catch{break;}
    }
    const count=last.length,total=pending.length;invalidate();undo.disabled=!count;
    status.textContent=`تمت تعبئة ${count} من ${total} حقل. راجعها ثم احفظ من زر مدرستي. يمكنك التراجع هنا.`;
  });
  undo.addEventListener('click',()=>{
    let count=0;
    for(const item of last){
      if(!eligible(item.node)||read(item.node)!==item.written)continue;
      if(item.oldNodes){item.node.replaceChildren(...item.oldNodes);const w=item.node.ownerDocument.defaultView;item.node.dispatchEvent(new w.Event('input',{bubbles:true}));item.node.dispatchEvent(new w.Event('change',{bubbles:true}));}
      else write(item.node,item.old);
      count++;
    }
    const total=last.length;last=[];undo.disabled=true;invalidate();
    status.textContent=`استُعيد ${count} من ${total} حقل. تُركت الحقول التي تغيرت يدويًا أو لم تعد ظاهرة.`;
  });
  lessonSelect.addEventListener('change',renderMappings); allowOverwrite.addEventListener('change',invalidate);
  refresh.addEventListener('click',load);
  library.addEventListener('click',()=>window.open(api.runtime.getURL('index.html'),'_blank','noopener'));
  toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){load();close.focus();}});
  close.addEventListener('click',()=>{panel.hidden=true;toggle.hidden=false;toggle.setAttribute('aria-expanded','false');toggle.focus();});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')close.click();});
})();
