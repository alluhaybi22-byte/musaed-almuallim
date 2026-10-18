'use strict';

// تبيان - مساعد التحضير: تخزين محلي، دون اتصالات بالشبكة.
const STORAGE_KEY = 'tibyan_preparations_v1';
const FIELD_IDS = ['title', 'subject', 'grade', 'className', 'date', 'period', 'objectives', 'warmup', 'activities', 'strategies', 'assessment', 'homework', 'enrichment', 'resourceLink'];
const LONG_FIELDS = ['objectives', 'warmup', 'activities', 'strategies', 'assessment', 'homework', 'enrichment'];
const LABELS = {
  objectives: 'نواتج التعلم والأهداف', warmup: 'التهيئة والتمهيد', activities: 'الأنشطة وخطوات الدرس',
  strategies: 'استراتيجيات التدريس', assessment: 'التحقق من التعلم والتقويم',
  homework: 'الواجب المنزلي', enrichment: 'الإثراء ومراعاة الفروق الفردية', resourceLink: 'رابط مورد تعليمي'
};
const TEMPLATES = {
  reading: {
    name: 'القراءة والفهم', icon: '📖', desc: 'فهم المقروء والمفردات والأفكار',
    objectives: 'يقرأ المتعلم النص قراءة سليمة مناسبة لمستواه.\nيحدد الفكرة العامة ويجيب عن أسئلة الفهم.\nيستنتج معاني مفردات في سياقها.',
    warmup: 'أعرض صورة أو سؤالًا مرتبطًا بموضوع النص، وأستثير خبرات الطلاب السابقة.',
    activities: 'قراءة نموذجية، ثم قراءة موجهة وفردية.\nمناقشة المفردات الجديدة والأفكار.\nنشاط ثنائي للإجابة عن أسئلة الفهم.',
    strategies: 'التعلم التعاوني، المناقشة، القراءة الموجهة، فكر–زاوج–شارك.',
    assessment: 'أسئلة شفهية قصيرة حول النص، وبطاقة تحقق من القراءة والفهم.',
    homework: 'قراءة النص في المنزل والتدرب على الكلمات المستهدفة.',
    enrichment: 'دعم القراءة بتجزئة الجمل للمتعثرين، وتحدٍّ بأسئلة استنتاجية للمتقنين.'
  },
  phonics: {
    name: 'الظواهر اللغوية', icon: '🔤', desc: 'مدود وتنوين وشدة ولام شمسية وقمرية',
    objectives: 'يميز المتعلم الظاهرة اللغوية المستهدفة في أمثلة مناسبة.\nيستخرج كلمات تتضمن الظاهرة من النص.\nيوظف كلمات صحيحة في نشاط كتابي.',
    warmup: 'أعرض كلمتين مختلفتين وأطلب من الطلاب ملاحظة الفرق بينهما.',
    activities: 'عرض أمثلة من نص الدرس.\nتلوين مواضع الظاهرة اللغوية.\nفرز كلمات في مجموعات ثم كتابة أمثلة جديدة.',
    strategies: 'التعلم بالاكتشاف، التصنيف، التعلم باللعب، التدريب المتدرج.',
    assessment: 'بطاقة خروج: استخراج ثلاث كلمات وتصنيفها وفق الظاهرة.',
    homework: 'جمع خمس كلمات تتضمن الظاهرة من قراءة مناسبة.',
    enrichment: 'بطاقات مصورة للمتعثرين، وتحدي تركيب جمل للطلاب المتقنين.'
  },
  spelling: {
    name: 'الإملاء والخط', icon: '✍️', desc: 'دقة الكتابة وتحسين خط النسخ',
    objectives: 'يكتب المتعلم الكلمات والجمل المستهدفة كتابة صحيحة.\nيراعي مواضع الحروف على السطر في خط النسخ.\nيراجع كتابته ويصحح أخطاءها.',
    warmup: 'أراجع شكل حرف أو كلمتين من درس سابق مع الطلاب.',
    activities: 'عرض نموذج واضح على السبورة.\nتدريب موجّه على كتابة الكلمات.\nإملاء جملة قصيرة، ثم مراجعة ذاتية وفق نموذج.',
    strategies: 'النمذجة، التدريب الموجه، التصحيح الذاتي، التعلم بالممارسة.',
    assessment: 'إملاء قصير مع رصد المهارة المستهدفة وتصحيح فردي.',
    homework: 'نسخ جملتين بخط واضح والتدرب على الكلمات الصعبة.',
    enrichment: 'سطور إرشادية للطلاب المحتاجين للدعم، وأنشطة تحرير للمتقنين.'
  },
  expression: {
    name: 'التعبير والتحدث', icon: '💬', desc: 'وصف ومحادثة وترتيب الأفكار',
    objectives: 'يعبر المتعلم شفهيًا بجمل مترابطة وواضحة.\nيرتب أحداثًا أو أفكارًا في تسلسل مناسب.\nيستمع للآخرين ويحترم دور الحديث.',
    warmup: 'أعرض مشهدًا مصورًا وأطرح سؤالًا مفتوحًا لإثارة التعبير.',
    activities: 'وصف الصورة في مجموعات.\nتنظيم الأفكار قبل التحدث.\nتقديم قصير مع تبادل تغذية راجعة بناءة.',
    strategies: 'التعلم التعاوني، لعب الأدوار، الحوار الموجه.',
    assessment: 'قائمة ملاحظة: وضوح الفكرة، ترتيب الجمل، آداب الحوار.',
    homework: 'وصف موقف يومي بثلاث جمل أمام أحد أفراد الأسرة.',
    enrichment: 'بطاقات مفردات مساعدة، وفرصة لإضافة تفاصيل للطلاب المتقنين.'
  }
};
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
let state = {version: 1, profile: {teacher: '', school: ''}, lessons: []};
let weekAnchor = new Date();
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const normalized = (value, max = 2500) => typeof value === 'string' ? value.slice(0, max).trim() : '';
const safeText = (obj, key, max = 2500) => normalized(obj?.[key], max);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `lesson_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseLocalDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  const val = new Date(y, m - 1, d, 12, 0, 0);
  return val.getFullYear() === y && val.getMonth() === m - 1 && val.getDate() === d ? val : null;
}
function addDays(d, count) { const r = new Date(d); r.setDate(r.getDate() + count); return r; }
function weekStart(date) { const d = new Date(date); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }
const formatDate = (date, opts = {}) => date.toLocaleDateString('ar-SA-u-ca-gregory', {day: 'numeric', month: 'short', ...opts});
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function notify(message, error = false) {
  const n = $('toast'); n.textContent = message; n.classList.toggle('error', !!error); n.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => n.hidden = true, 3300);
}
async function readStored() {
  try {
    if (globalThis.TibyanPlatform?.storage?.local) {
      const result = await TibyanPlatform.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || null;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { notify('تعذر قراءة البيانات المخزنة.', true); return null; }
}
async function writeStored() {
  try {
    if (globalThis.TibyanPlatform?.storage?.local) {
      await TibyanPlatform.storage.local.set({[STORAGE_KEY]: state});
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    return true;
  } catch (e) { notify('تعذر حفظ البيانات. تحقق من مساحة المتصفح واحتفظ بنسخة احتياطية.', true); return false; }
}
function sanitizeLesson(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = {id: safeText(raw, 'id', 100) || uid(), createdAt: safeText(raw, 'createdAt', 50), updatedAt: safeText(raw, 'updatedAt', 50)};
  for (const f of FIELD_IDS) item[f] = safeText(raw, f, LONG_FIELDS.includes(f) ? 2500 : (f === 'resourceLink' ? 500 : 160));
  if (!item.title || !parseLocalDate(item.date)) return null;
  if (item.resourceLink && !/^https?:\/\//i.test(item.resourceLink)) item.resourceLink = '';
  if (!/^\d+$/.test(item.period) || Number(item.period) > 10 || Number(item.period) < 1) item.period = '1';
  return item;
}
function switchTab(tab) {
  for (const button of document.querySelectorAll('.tab')) {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
  }
  for (const panel of document.querySelectorAll('.panel')) panel.classList.toggle('active', panel.id === tab);
  window.scrollTo(0, 0);
}
function renderTemplateCards() {
  const target = $('templateCards'); target.replaceChildren();
  for (const [key, template] of Object.entries(TEMPLATES)) {
    const button = el('button', 'template-card'); button.type = 'button'; button.dataset.template = key;
    const symbol = el('span', 'template-icon', template.icon);
    const copy = el('span', 'template-copy'); copy.append(el('strong', '', template.name), el('small', '', template.desc));
    button.append(symbol, copy); target.append(button);
  }
}
function weekLessons(anchor = weekAnchor) {
  const start = weekStart(anchor), end = addDays(start, 4);
  return state.lessons.filter(x => x.date >= isoLocal(start) && x.date <= isoLocal(end));
}
function renderHome() {
  $('totalCount').textContent = String(state.lessons.length);
  $('weekCount').textContent = String(weekLessons(new Date()).length);
  $('templatesCount').textContent = String(Object.keys(TEMPLATES).length);
}
function makeAction(label, action, id, extra = '') {
  const button = el('button', `action-btn ${extra}`, label);
  button.type = 'button'; button.dataset.action = action; button.dataset.id = id;
  return button;
}
function renderLibrary() {
  const term = $('searchLessons').value.trim().toLowerCase();
  const list = $('lessonList'); list.replaceChildren();
  const found = state.lessons
    .filter(x => [x.title, x.subject, x.grade, x.className].join(' ').toLowerCase().includes(term))
    .sort((a,b) => b.date.localeCompare(a.date) || Number(b.period) - Number(a.period));
  if (!found.length) {
    const empty = el('div', 'empty'); empty.append(el('strong', '', term ? 'لا توجد نتائج مطابقة' : 'مكتبتك جاهزة لاستقبال التحاضير'),
      el('span', '', term ? 'جرّب كلمة بحث أخرى.' : 'ابدأ بتحضير جديد أو اختر أحد القوالب الجاهزة.'));
    list.append(empty); return;
  }
  for (const lesson of found) {
    const card = el('article', 'lesson-card');
    card.append(el('h3', '', lesson.title));
    const meta = el('div', 'meta');
    for (const item of [lesson.subject, lesson.grade, lesson.className, lesson.date, `الحصة ${lesson.period}`]) {
      if (item) meta.append(el('span', '', item));
    }
    card.append(meta);
    const actions = el('div', 'card-actions');
    actions.append(makeAction('تعديل', 'edit', lesson.id), makeAction('نسخ النص', 'copy', lesson.id),
      makeAction('توزيع للشعب', 'schedule', lesson.id), makeAction('تكرار', 'duplicate', lesson.id), makeAction('طباعة', 'print', lesson.id), makeAction('حذف', 'remove', lesson.id, 'danger'));
    card.append(actions); list.append(card);
  }
}
function renderWeek() {
  const start = weekStart(weekAnchor), end = addDays(start, 4);
  $('weekRange').textContent = `${formatDate(start)} — ${formatDate(end, {year: 'numeric'})}`;
  const days = $('weekDays'); days.replaceChildren();
  for (let index = 0; index < 5; index++) {
    const date = addDays(start, index), iso = isoLocal(date);
    const day = el('div', 'day'), header = el('div', 'day-header');
    header.append(el('strong', '', DAY_NAMES[index]), el('span', '', formatDate(date)));
    day.append(header);
    const lessons = state.lessons.filter(x => x.date === iso).sort((a,b) => Number(a.period) - Number(b.period));
    if (!lessons.length) day.append(el('p', 'no-lesson', 'لا توجد حصص مضافة'));
    for (const lesson of lessons) {
      const node = el('div', 'day-lesson', lesson.title);
      node.append(el('small', '', `الحصة ${lesson.period} • ${lesson.className || lesson.grade || lesson.subject}`)); day.append(node);
    }
    days.append(day);
  }
}
function renderAll() { renderHome(); renderLibrary(); renderWeek(); }
function clearForm() {
  $('lessonForm').reset(); $('editId').value = ''; $('editor-heading').textContent = 'تحضير درس جديد';
  $('date').value = isoLocal(new Date()); $('subject').value = 'لغتي الجميلة';
  $('grade').value = 'الثاني الابتدائي'; $('period').value = '1';
}
function formAsLesson() {
  const record = {};
  for (const field of FIELD_IDS) record[field] = $(field).value.trim().slice(0, LONG_FIELDS.includes(field) ? 2500 : 500);
  return record;
}
function fillForm(item) {
  clearForm();
  for (const field of FIELD_IDS) $(field).value = item[field] || '';
  $('editId').value = item.id || ''; $('editor-heading').textContent = item.id ? `تعديل تحضير: ${item.title}` : 'تحضير درس جديد';
  switchTab('editor');
}
function applyTemplate(key) {
  const template = TEMPLATES[key];
  if (!template) { notify('اختر قالبًا أولًا.', true); return; }
  for (const field of LONG_FIELDS) $(field).value = template[field] || '';
  notify('تمت تعبئة عناصر القالب. عدّلها بما يناسب درسك.');
}
function lessonText(lesson) {
  const lines = ['تحضير درس', `الدرس: ${lesson.title}`, `المادة: ${lesson.subject || '—'}`,
    `الصف: ${lesson.grade || '—'}`, `الشعبة: ${lesson.className || '—'}`,
    `التاريخ: ${lesson.date}`, `الحصة: ${lesson.period || '—'}`];
  for (const field of [...LONG_FIELDS, 'resourceLink']) if (lesson[field]) lines.push('', `${LABELS[field]}:`, lesson[field]);
  return lines.join('\n');
}
async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
    else {
      const area = el('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.append(area); area.focus(); area.select();
      if (!document.execCommand('copy')) throw new Error('copy failed'); area.remove();
    }
    notify('تم نسخ التحضير. يمكنك لصقه في حقول المنصة بعد مراجعته.');
  } catch (e) { notify('لم ينجح النسخ. افتح التطبيق في تبويب كامل ثم أعد المحاولة.', true); }
}
async function saveLesson(event) {
  event.preventDefault();
  const raw = formAsLesson();
  if (!raw.title) { notify('اكتب عنوان الدرس.', true); $('title').focus(); return; }
  if (!parseLocalDate(raw.date)) { notify('اختر تاريخًا صحيحًا.', true); return; }
  if (raw.resourceLink && !/^https?:\/\//i.test(raw.resourceLink)) { notify('الرابط يجب أن يبدأ بـ http:// أو https://', true); return; }
  const existingId = $('editId').value;
  const index = state.lessons.findIndex(x => x.id === existingId);
  const now = new Date().toISOString();
  const updated = sanitizeLesson({...raw, id: index >= 0 ? existingId : uid(), createdAt: index >= 0 ? state.lessons[index].createdAt : now, updatedAt: now});
  if (!updated) { notify('تحقق من معلومات الحصة.', true); return; }
  const old = [...state.lessons];
  if (index >= 0) state.lessons[index] = updated;
  else {
    if (state.lessons.length >= 2000) { notify('بلغت الحد الأقصى: ٢٠٠٠ تحضير.', true); return; }
    state.lessons.push(updated);
  }
  if (!await writeStored()) { state.lessons = old; return; }
  clearForm(); renderAll(); switchTab('library'); notify(index >= 0 ? 'حُفظ تعديل التحضير.' : 'تم حفظ التحضير بنجاح.');
}
function getLesson(id) { return state.lessons.find(x => x.id === id); }
async function libraryAction(action, id) {
  const lesson = getLesson(id); if (!lesson) {notify('التحضير غير موجود.', true);return;}
  if (action === 'edit') return fillForm(lesson);
  if (action === 'schedule') return openSchedule(lesson);
  if (action === 'copy') return copyText(lessonText(lesson));
  if (action === 'print') return printLesson(lesson);
  if (action === 'duplicate') {
    if (state.lessons.length >= 2000) { notify('بلغت الحد الأقصى: ٢٠٠٠ تحضير.', true); return; }
    const record = {...lesson, id: uid(), title: `${lesson.title} (نسخة)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
    state.lessons.push(record);
    if (!await writeStored()) { state.lessons.pop(); return; }
    renderAll(); fillForm(record); notify('أُنشئت نسخة قابلة للتعديل، غيّر الشعبة أو التاريخ ثم احفظ.'); return;
  }
  if (action === 'remove') {
    if (!confirm(`هل تريد حذف تحضير «${lesson.title}»؟ لا يمكن التراجع إلا باستيراد نسخة احتياطية.`)) return;
    const old = [...state.lessons]; state.lessons = state.lessons.filter(x => x.id !== id);
    if (!await writeStored()) { state.lessons = old; return; }
    renderAll(); notify('حُذف التحضير.');
  }
}
function printLesson(lesson) {
  const root = $('printSheet'); root.replaceChildren();
  root.append(el('h1', '', 'المملكة العربية السعودية'), el('h2', '', 'تحضير درس – تبيان'));
  const meta = el('div', 'print-meta');
  for (const [key, value] of [
    ['المدرسة', state.profile.school], ['المعلم', state.profile.teacher], ['المادة', lesson.subject],
    ['الدرس', lesson.title], ['الصف', lesson.grade], ['الشعبة', lesson.className],
    ['التاريخ', lesson.date], ['الحصة', lesson.period]]) {
    meta.append(el('div', '', `${key}: ${value || '........................'}`));
  }
  root.append(meta);
  for (const field of [...LONG_FIELDS, 'resourceLink']) {
    if (!lesson[field]) continue;
    const section = el('section', 'print-item');
    section.append(el('h3', '', LABELS[field]), el('p', '', lesson[field])); root.append(section);
  }
  const foot = el('div', 'print-footer'); foot.append(el('div', '', 'توقيع المعلم: __________________'), el('div', '', 'التاريخ: __________________'));
  root.append(foot);
  window.print();
}
function downloadJson() {
  const content = JSON.stringify({app:'tibyan-tahdir', version:1, exportedAt:new Date().toISOString(), profile:state.profile, lessons:state.lessons}, null, 2);
  const blob = new Blob([content], {type: 'application/json;charset=utf-8'}), url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tibyan-tahdir-backup-${isoLocal(new Date())}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  notify('تم إعداد ملف النسخة الاحتياطية للتنزيل.');
}
async function importJson(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 50 * 1024 * 1024) throw new Error('حجم الملف كبير جدًا (الحد 50 ميجابايت).');
    const data = JSON.parse(await file.text());
    if (data?.app !== 'tibyan-tahdir' || !Array.isArray(data.lessons) || data.lessons.length > 2000) {
      throw new Error('هذا الملف ليس نسخة احتياطية صالحة من تبيان.');
    }
    if (data.version !== 1) throw new Error('إصدار النسخة الاحتياطية غير مدعوم.');
    let added = 0, invalid = 0;
    const known = new Set(state.lessons.map(x => x.id));
    const incoming = [];
    for (const raw of data.lessons) {
      const item = sanitizeLesson(raw);
      if (!item) { invalid++; continue; }
      if (known.has(item.id)) continue;
      known.add(item.id); incoming.push(item); added++;
    }
    if (state.lessons.length + incoming.length > 2000) throw new Error('الحد الأقصى ٢٠٠٠ تحضير.');
    const old = {lessons:[...state.lessons], profile:{...state.profile}};
    state.lessons.push(...incoming);
    if ($('importProfile').checked && data.profile && typeof data.profile === 'object') {
      state.profile = {teacher: normalized(data.profile.teacher, 140), school: normalized(data.profile.school, 140)};
    }
    if (!await writeStored()) { state.lessons = old.lessons; state.profile = old.profile; return; }
    $('teacherName').value = state.profile.teacher; $('schoolName').value = state.profile.school;
    renderAll(); notify(`تم استيراد ${added} تحضير جديد دون حذف الموجود${invalid ? `؛ تم تجاوز ${invalid} سجل غير صالح` : ''}.`);
  } catch (e) { notify(`فشل الاستيراد: ${e.message}`, true); }
  finally {event.target.value = '';}
}
function openSchedule(lesson) {
  $('scheduleLessonId').value = lesson.id;
  $('scheduleTitle').textContent = `توزيع «${lesson.title}»`;
  $('scheduleRows').replaceChildren();
  addScheduleRow(lesson);
  $('scheduleDialog').showModal();
}
function addScheduleRow(lesson = getLesson($('scheduleLessonId').value)) {
  if ($('scheduleRows').children.length >= 40) return notify('الحد ٤٠ حصة في المرة الواحدة.', true);
  const row = el('div', 'schedule-row');
  for (const [key, label, type, value] of [
    ['className', 'الشعبة', 'text', ''], ['date', 'التاريخ', 'date', lesson?.date || isoLocal(new Date())],
    ['period', 'الحصة', 'number', lesson?.period || '1']]) {
    const wrapper = el('label', '', label), input = el('input');
    input.type = type; input.dataset.field = key; input.value = value; input.required = true;
    if (type === 'number') {input.min = '1'; input.max = '10';}
    if (key === 'className') input.maxLength = 50;
    wrapper.append(input); row.append(wrapper);
  }
  const remove = el('button', 'btn btn-secondary', 'إزالة'); remove.type = 'button';
  remove.addEventListener('click', () => row.remove()); row.append(remove); $('scheduleRows').append(row);
}
async function saveSchedule(event) {
  event.preventDefault();
  const source = getLesson($('scheduleLessonId').value);
  if (!source) return notify('التحضير الأصلي غير موجود.', true);
  const rows = [...$('scheduleRows').children];
  if (!rows.length) return notify('أضف حصة واحدة على الأقل.', true);
  const occupied = new Set(state.lessons.map(x => JSON.stringify([x.className, x.date, x.period])));
  const records = [];
  for (const row of rows) {
    const raw = {...source};
    for (const input of row.querySelectorAll('input')) raw[input.dataset.field] = input.value.trim();
    const item = sanitizeLesson({...raw, id:uid(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()});
    if (!item || !item.className || !/^(?:[1-9]|10)$/.test(raw.period)) return notify('تحقق من بيانات كل حصة.', true);
    const key = JSON.stringify([item.className, item.date, item.period]);
    if (occupied.has(key)) return notify(`تعارض: ${item.className}، ${item.date}، الحصة ${item.period}. غيّر الموعد.`, true);
    occupied.add(key); records.push(item);
  }
  if (state.lessons.length + records.length > 2000) return notify('الحد الأقصى ٢٠٠٠ تحضير.', true);
  const old = [...state.lessons]; state.lessons.push(...records);
  if (!await writeStored()) {state.lessons = old; return;}
  $('scheduleDialog').close(); renderAll(); notify(`أُضيفت ${records.length} حصة إلى جدولك المحلي.`);
}
function setupEvents() {
  $('scheduleForm').addEventListener('submit', saveSchedule);
  $('addScheduleRow').addEventListener('click', () => addScheduleRow());
  $('closeSchedule').addEventListener('click', () => $('scheduleDialog').close());
  document.querySelectorAll('.tab').forEach(x => x.addEventListener('click', () => switchTab(x.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(x => x.addEventListener('click', () => {
    if (x.dataset.goto === 'editor') clearForm(); switchTab(x.dataset.goto);
  }));
  $('templateCards').addEventListener('click', e => {
    const button = e.target.closest('[data-template]'); if (!button) return;
    clearForm(); applyTemplate(button.dataset.template); switchTab('editor');
  });
  $('applyTemplate').addEventListener('click', () => applyTemplate($('templatePicker').value));
  $('lessonForm').addEventListener('submit', saveLesson);
  $('resetForm').addEventListener('click', () => {clearForm();notify('تم تفريغ النموذج.');});
  $('copyDraft').addEventListener('click', () => {
    const raw = formAsLesson(); if (!raw.title) { notify('اكتب عنوان الدرس أولًا.', true); return; }
    copyText(lessonText(raw));
  });
  $('searchLessons').addEventListener('input', renderLibrary);
  $('lessonList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]'); if (btn) libraryAction(btn.dataset.action, btn.dataset.id);
  });
  $('prevWeek').addEventListener('click', () => {weekAnchor = addDays(weekAnchor, -7);renderWeek();});
  $('nextWeek').addEventListener('click', () => {weekAnchor = addDays(weekAnchor, 7);renderWeek();});
  $('goThisWeek').addEventListener('click', () => {weekAnchor = new Date();renderWeek();});
  $('profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const old = {...state.profile}; state.profile.teacher = normalized($('teacherName').value, 140); state.profile.school = normalized($('schoolName').value, 140);
    if (!await writeStored()) {state.profile = old;return;} notify('حُفظت بيانات المعلم.');
  });
  $('exportBackup').addEventListener('click', downloadJson);
  $('importBackup').addEventListener('change', importJson);
  $('openFull').addEventListener('click', () => {
    if (globalThis.TibyanPlatform?.tabs?.create && TibyanPlatform.runtime?.getURL) {
      TibyanPlatform.tabs.create({url: TibyanPlatform.runtime.getURL('index.html')});
    } else {
      window.open(location.href, '_blank', 'noopener');
    }
  });
}
async function start() {
  const saved = await readStored();
  if (saved && typeof saved === 'object' && Array.isArray(saved.lessons)) {
    state = {version:1, profile:{teacher: normalized(saved.profile?.teacher, 140), school: normalized(saved.profile?.school, 140)},
      lessons:saved.lessons.slice(0, 2000).map(sanitizeLesson).filter(Boolean)};
  }
  $('teacherName').value = state.profile.teacher; $('schoolName').value = state.profile.school;
  clearForm(); renderTemplateCards(); setupEvents(); renderAll();
}
document.addEventListener('DOMContentLoaded', start);
