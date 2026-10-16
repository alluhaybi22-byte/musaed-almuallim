import {
  VERSION,
  GRADES,
  GRADE_NAMES,
  SCORES,
  DOMAINS,
  DEFAULT_SETTINGS,
  uid,
  escapeHTML as e,
  normalizeName,
  validateSettings,
  summarize,
  overall,
  latestResult,
  assessmentSignature,
  facetSummary,
  skillProgress,
  localDateKey,
  rosterFromText,
  addStudents,
  csvCell,
  validateBackup,
  mergeBackup,
} from './domain.js';
import { readState, writeState } from './storage.js';
import { questionsFor } from './questions.js';
import { applyListeningEdits, safeListeningAudio } from './listening.js';
import {
  readRosterFile,
  inferRosterColumns,
  rosterFromRows,
} from './roster-file.js';
import { nextRosterStudent } from './domain.js';

const app = document.querySelector('#app'),
  dialogs = document.querySelector('#dialog-root');
let state,
  curriculum,
  route = 'home',
  grade = 1,
  section = '',
  query = '',
  semester = 1,
  unit = 1,
  domain = '',
  cumulative = false,
  selected = new Set(),
  studentId = '',
  active = null,
  cardIndex = 0,
  review = false,
  busy = false,
  pendingUpdate = null;
let studentDisplay = false;
let resultFilters = { query: '', semester: '', from: '', to: '', section: '' };
let reportScope = {
  skill: '',
  test: '',
  section: '',
  semester: '',
  from: '',
  to: '',
};
let rosterReviewData = null;
const channel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('al-musaed-state')
    : null;
const ar = (n) => new Intl.NumberFormat('ar-SA').format(n);
const date = (d) =>
  new Date(d).toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const icons = {
  home: 'M3 10 12 3l9 7M5 9v11h5v-6h4v6h5V9',
  students:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  results: 'M4 4h16v16H4zM8 15v2M12 11v6M16 7v10',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  arrow: 'M5 12h14M14 7l5 5-5 5',
  add: 'M12 4v16M4 12h16',
  book: 'M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v15',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18',
  download: 'M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4',
  print: 'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z',
  back: 'M19 12H5m5-5-5 5 5 5',
  restore: 'M3 11a9 9 0 1 1 2 7M3 4v7h7',
};
const icon = (n) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[n] || icons.book}"/></svg>`;
const btn = (label, action, cls = '', attrs = '') =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
function toast(text) {
  const t = document.querySelector('#toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4500);
}
function badge(label, percent = null, limited = false) {
  const c =
    label === 'متقن'
      ? 'good'
      : label === 'متوسط'
        ? 'mid'
        : label === 'ضعيف'
          ? 'weak'
          : '';
  return `<span class="badge ${c}">${e(label)}${percent !== null ? ' · ' + ar(percent) + '٪' : ''}</span>${limited ? '<small> عينة محدودة</small>' : ''}`;
}
function students() {
  return state.students.filter(
    (s) =>
      s.grade === grade &&
      !s.archived &&
      (!section || s.section === section) &&
      (!query || s.name.includes(query)),
  );
}
async function persist(next) {
  if (busy) throw Error('انتظر اكتمال الحفظ.');
  busy = true;
  try {
    state = await writeState(next);
    channel?.postMessage(state.revision);
  } finally {
    busy = false;
  }
}
async function saveDraft() {
  if (active)
    await persist({
      ...state,
      drafts: [
        ...state.drafts.filter((d) => d.id !== active.id),
        structuredClone(active),
      ],
    });
}
function nav(name) {
  route = name;
  query = '';
  section = '';
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function shell(body) {
  const navs = [
    ['home', 'الرئيسية', 'home'],
    ['students', 'الطلاب', 'students'],
    ['results', 'النتائج', 'results'],
    ['settings', 'الإعدادات', 'settings'],
  ];
  const navItems = navs
    .map(
      ([r, label, i]) =>
        `<button class="${route === r ? 'active' : ''}" data-action="nav" data-route="${r}" ${route === r ? 'aria-current="page"' : ''}>${icon(i)}<span>${label}</span></button>`,
    )
    .join('');
  return `<div class="layout"><aside class="sidebar"><a class="brand" href="#" data-action="nav" data-route="home"><img src="./assets/icon.svg" alt=""><span><strong>المساعد</strong><small>مساعد المعلم للصفوف الأولية</small></span></a><nav class="nav" aria-label="التنقل الرئيسي">${navItems}</nav><div class="sidebar-foot"><p><span class="privacy-dot"></span>البيانات على هذا الجهاز</p><p>لغتي · طبعة ١٤٤٨</p><small>نسخة تجريبية ${VERSION}</small></div></aside><div class="work"><header class="topbar"><a class="brand mobile-brand" href="#" data-action="nav" data-route="home"><img src="./assets/icon.svg" alt=""><strong>المساعد</strong></a><div class="topbar-title"><span class="avatar">${e((state.settings.teacher || 'م').slice(0, 1))}</span><div><strong>${e(state.settings.teacher || 'أهلًا بمعلم الصفوف الأولية')}</strong><div class="version">${e(state.settings.school || 'ابدأ بإضافة بيانات مدرستك')}</div></div></div>${pendingUpdate ? btn('تحديث التطبيق', 'update', 'small secondary') : btn(icon('settings'), 'nav', 'small ghost', 'data-route="settings" aria-label="الإعدادات"')}</header><main id="main" class="main" tabindex="-1">${body}</main></div></div>`;
}
function heading(title, sub, action = '') {
  return `<div class="heading"><div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function empty(title, sub, button = '') {
  return `<div class="empty"><div class="empty-icon">${icon('book')}</div><h3>${title}</h3><p>${sub}</p>${button}</div>`;
}
function gradeTabs() {
  return `<div class="tabs" aria-label="اختيار الصف">${GRADES.map((g) => `<button data-action="grade" data-grade="${g}" class="${grade === g ? 'active' : ''}">الصف ${['', 'الأول', 'الثاني', 'الثالث'][g]}</button>`).join('')}</div>`;
}
function home() {
  const count = state.students.filter((s) => !s.archived).length;
  return `${heading('مساحة معلمك', 'تشخيص واضح، وتدريب يبدأ من حاجة الطالب.')}${backupNotice()}
 <section class="hero"><div class="hero-copy"><div class="eyebrow">${icon('book')} لغتي للصفوف الأولية</div><h2>اعرف أين يبدأ طالبك.</h2><p>اختبارات قصيرة لكل مهارة، ونتيجة تساعدك على اختيار الخطوة التالية. ابدأ بالصف ثم الطالب.</p>${btn('اختر الصف ' + icon('arrow'), 'scroll-grades')}</div><img src="./assets/learning-hero.webp" alt="كتاب مفتوح مع قلم وقطع تعليمية ونبتة"></section>
 <div class="metrics"><div class="metric"><strong>${ar(count)}</strong><small>طالب مسجل</small></div><div class="metric"><strong>${ar(state.results.length)}</strong><small>اختبار محفوظ</small></div><div class="metric"><strong>${ar(state.drafts.length)}</strong><small>اختبار يمكن استكماله</small></div></div>
 <div class="section-head" id="grades"><h2>اختر الصف</h2><small>ثلاثة صفوف · فصلان لكل صف</small></div><section class="grid3">${GRADES.map((g) => `<button class="grade-card" data-action="open-grade" data-grade="${g}"><div class="grade-card-head"><span class="grade-number">${ar(g)}</span>${icon('arrow')}</div><h3>الصف ${['', 'الأول', 'الثاني', 'الثالث'][g]}</h3><p class="muted">${['', 'الحروف والأصوات وبدايات القراءة', 'القراءة والظواهر والكتابة', 'الفهم والتراكيب والتعبير'][g]}</p><div class="card-footer"><span>${ar(state.students.filter((s) => s.grade === g && !s.archived).length)} طالب</span><span>فتح الصف</span></div></button>`).join('')}</section>
 <div class="section-head"><h2>اختباراتك الأخيرة</h2>${btn('عرض النتائج', 'nav', 'ghost small', 'data-route="results"')}</div>${state.results.length ? resultRows(state.results.slice(-3).reverse()) : empty('البداية من هنا', 'أضف طلابك، ثم اختر مهارة مما انتهى تدريسُه وابدأ التشخيص.', btn(icon('add') + ' إضافة الطلاب', 'nav', '', 'data-route="students"'))}
 ${state.drafts.length ? `<div class="section-head"><h2>استكمال الاختبارات</h2></div>${state.drafts.map((d) => `<div class="student-row"><div><strong>${e(state.students.find((s) => s.id === d.studentId)?.name || 'طالب')}</strong><small class="muted"> ${GRADE_NAMES[d.grade]} · ${date(d.startedAt)}</small></div>${btn('استكمال', 'resume', 'small', 'data-id="' + d.id + '"')}</div>`).join('')}` : ''}`;
}
function studentView() {
  const list = students(),
    sections = [
      ...new Set(
        state.students
          .filter((s) => s.grade === grade && !s.archived)
          .map((s) => s.section),
      ),
    ];
  return `${heading('طلاب الصف', 'أضف كشفك مرة واحدة، وابدأ اختبار أي طالب.', btn(icon('add') + ' إضافة طالب', 'add-student'))}${gradeTabs()}<div class="row">${btn('استيراد Excel أو Word / لصق كشف', 'roster', 'secondary small')}${btn('الطلاب المؤرشفون', 'archives', 'ghost small')}</div><div class="filters"><label>البحث عن طالب<input id="student-search" type="search" placeholder="اكتب اسم الطالب" value="${e(query)}"></label><label>الفصل<select id="section-filter"><option value="">جميع الفصول</option>${sections.map((s) => `<option ${section === s ? 'selected' : ''}>${e(s)}</option>`).join('')}</select></label></div><div class="student-list" id="student-list">${studentRows(list)}</div>`;
}
function studentRows(list) {
  return list.length
    ? list
        .map((s) => {
          const r = latestResult(state.results, s.id),
            o = r
              ? overall(summarize(r.cards, r.answers, r.scoring), r.scoring)
              : { percent: null, label: 'غير مختبر' };
          return `<div class="student-row"><div class="student-info"><div class="avatar">${e(s.name[0])}</div><div><strong>${e(s.name)}</strong><small>الفصل ${e(s.section)}${s.guardian ? ' · ولي الأمر: ' + e(s.guardian) : ''}</small></div></div><div class="row student-actions">${r ? `<div class="last-test"><small>آخر اختبار · ${e([...new Set(r.cards.map((c) => c.skillTitle))].join('، '))}</small>${badge(o.label, o.percent)}</div>` : badge(o.label, o.percent)}${btn('بدء اختبار', 'assess-student', 'small', 'data-id="' + s.id + '"')}${btn(icon('settings'), 'edit-student', 'secondary small', 'data-id="' + s.id + '" aria-label="تعديل ' + e(s.name) + '"')}</div></div>`;
        })
        .join('')
    : empty(
        'لا يوجد طلاب في هذا النطاق',
        'استورد ملف Word أو Excel، أو أضف الأسماء يدويًا.',
        btn(icon('add') + ' إضافة طالب', 'add-student'),
      );
}
function availableSkills() {
  return curriculum.skills.filter(
    (s) =>
      s.grade === grade &&
      (cumulative
        ? s.unit <= unit
        : s.semester === semester && s.unit === unit),
  );
}
function initializeSetup(sid = '') {
  studentId = sid;
  semester = 1;
  unit = 1;
  domain = '';
  cumulative = false;
  selected = new Set(
    availableSkills()
      .slice(0, 3)
      .map((s) => s.id),
  );
  route = 'setup';
  render();
}
function setup() {
  const us = curriculum.units.filter(
      (u) => u.grade === grade && u.semester === semester,
    ),
    ss = state.students.filter((s) => s.grade === grade && !s.archived),
    all = availableSkills(),
    shown = all.filter((s) => !domain || s.domain === domain),
    chosen = all.filter((s) => selected.has(s.id));
  const cardCount = chosen.reduce((n, s) => n + questionsFor(s).length, 0);
  return `${heading('إعداد الاختبار', GRADE_NAMES[grade] + ' · اختر ما انتهى تدريسُه.', btn(icon('back') + ' الطلاب', 'nav', 'secondary small', 'data-route="students"'))}<div class="setup"><div class="panel"><div class="form-grid"><label class="span2">الطالب<select id="setup-student"><option value="">اختر الطالب</option>${ss.map((s) => `<option value="${s.id}" ${studentId === s.id ? 'selected' : ''}>${e(s.name)} · ${e(s.section)}</option>`).join('')}</select></label><label>الفصل الدراسي<select id="setup-semester"><option value="1" ${semester === 1 ? 'selected' : ''}>الفصل الأول</option><option value="2" ${semester === 2 ? 'selected' : ''}>الفصل الثاني</option></select></label><label>الوحدة<select id="setup-unit">${us.map((u) => `<option value="${u.unit}" ${unit === u.unit ? 'selected' : ''}>${ar(u.unit)} · ${e(u.name)}</option>`).join('')}</select></label></div><label class="checkline"><input type="checkbox" id="setup-cumulative" ${cumulative ? 'checked' : ''}>اختبار تراكمي يشمل الوحدات السابقة</label><div class="divider"></div><div class="row preset-actions">${btn(grade === 1 ? 'حروف الوحدة' : 'تشخيص القراءة والظواهر', 'preset-core', 'secondary small')}${btn('الفهم والاستماع', 'preset-comprehension', 'secondary small')}${btn('الكتابة والإملاء', 'preset-writing', 'secondary small')}</div><small>اختيارات جاهزة من الوحدة الحالية، يمكن تعديلها.</small><div class="row between"><h2>المهارات</h2><div class="checks-control">${btn('تحديد الظاهر', 'select-visible', 'ghost small')}${btn('إلغاء الكل', 'clear-selection', 'ghost small')}</div></div><label>مجال المهارة<select id="setup-domain"><option value="">جميع المجالات</option>${DOMAINS.map((d) => `<option ${domain === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label><div class="skills-list" style="margin-top:16px">${shown.map((s) => `<label class="skill-option"><input type="checkbox" data-skill="${s.id}" ${selected.has(s.id) ? 'checked' : ''}><span><strong>${e(s.title)}</strong><small>${e(s.domain)} · الوحدة ${ar(s.unit)} · دليل الوحدة ص ${ar(s.source.page)}</small></span></label>`).join('')}</div></div><aside class="panel setup-side"><div class="eyebrow">اختبار حسب المنهج</div><h2>${ar(chosen.length)} مهارة مختارة</h2><p class="muted">${ar(cardCount)} بطاقة قابلة للتعديل</p><div class="notice">العينات من إعداد المساعد. راجع ملاءمتها لما درّسته، وتأكد من النص والإجابة المتوقعة قبل البدء.</div>${btn('مراجعة عينات الاختبار', 'preview-cards', 'secondary', chosen.length ? '' : 'disabled')}${btn('بدء الاختبار ' + icon('arrow'), 'start-assessment', '', !chosen.length || !studentId ? 'disabled' : '')}<small>تصحيح يدوي · حفظ تلقائي للأحكام</small>${!ss.length ? `<div class="notice warning">أضف طالبًا أولًا.${btn('إضافة طالب', 'add-student', 'ghost small')}</div>` : ''}</aside></div>`;
}
let customCards = null;
function chosenCards() {
  const cards = availableSkills()
    .filter((s) => selected.has(s.id))
    .flatMap(questionsFor);
  return applyListeningEdits(cards, customCards || {});
}
function listeningPanel(c) {
  if (c.kind !== 'listening') return '';
  const src = safeListeningAudio(c);
  const count = active.listeningDelivery?.[c.passageId]?.count || 0;
  return `<section class="panel listening-panel"><h2>استمع ثم أجب · ${e(c.passageTitle)}</h2><p class="muted">${e(c.provenance)}</p><p>استمع الطالب إلى المقطع كاملًا: <strong>${ar(count)}</strong> مرة. وحّد عدد مرات الاستماع بين الطلاب؛ المقترح مرتان قبل الأسئلة.</p>${src ? `<audio id="listening-audio" controls preload="metadata" src="${e(src)}" aria-label="مقطع الاستماع"></audio>` : '<div class="notice warning">لم يُرفق تسجيل لهذا المقطع بعد. اقرأ النص من دليل المعلم، أو أرفق ملفًا صوتيًا مطابقًا له. لا يوجد توليد صوت أو رفع بيانات من التطبيق.</div>'}<div class="row">${btn('تسجيل قراءة كاملة بصوت المعلم', 'listening-read', 'secondary small')}${btn('إرفاق صوت مطابق للنص', 'listening-attach', 'secondary small')}</div><input id="listening-file" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm" hidden><small>الملف محلي ويحفظ مع الاختبار والنسخة الاحتياطية؛ حتى ٢ ميجابايت. تأكد من مطابقته للنص قبل إرفاقه. تعديل النص يلغي الصوت وأحكام أسئلته.</small></section>`;
}
function assessment() {
  const student = state.students.find((s) => s.id === active.studentId);
  if (review) {
    const summaries = summarize(active.cards, active.answers, active.scoring),
      remaining = active.cards.filter((c) => !active.answers[c.id]).length;
    return `${heading('مراجعة الاختبار', e(student?.name || ''), btn('العودة للبطاقات', 'review-back', 'secondary'))}<section class="panel"><div class="notice">${remaining ? `بقيت ${ar(remaining)} بطاقات بلا حكم. عند الحفظ ستظل غير مقيمة.` : 'اكتملت أحكام جميع البطاقات.'} النتائج مبنية على الأداء المستقل.</div><div class="finish-summary">${summaries.map((s) => `<div class="summary-row"><span>${e(s.title)}</span><span>${badge(s.label, s.percent, s.limited)}</span></div>`).join('')}</div><label>ملاحظة عامة<textarea id="final-note" placeholder="توصية تدريبية أو ملاحظة للمتابعة">${e(active.note || '')}</textarea></label><div class="row" style="margin-top:20px">${btn(icon('check') + ' حفظ نتيجة الاختبار', 'finish')}${btn('حفظ واستكمال لاحقًا', 'pause', 'secondary')}</div></section>`;
  }
  const c = active.cards[cardIndex],
    answer = active.answers[c.id],
    pct = Math.round((100 * (cardIndex + 1)) / active.cards.length);
  if (studentDisplay && c.kind === 'listening')
    return `<section class="student-display"><div class="row between"><small>مهارة الاستماع</small>${btn('العودة للمعلم', 'student-display', 'secondary small')}</div><div class="prompt-card"><div class="stimulus">استمع جيدًا، ثم أجب شفهيًا.</div><p>يقرأ المعلم المقطع أو يشغله من شاشة المعلم.</p></div></section>`;
  if (studentDisplay)
    return `<section class="student-display"><div class="row between"><small>البطاقة ${ar(cardIndex + 1)} من ${ar(active.cards.length)}</small>${btn('العودة للمعلم', 'student-display', 'secondary small')}</div><div class="prompt-card"><p class="instruction">${e(c.instruction)}</p><div class="stimulus ${c.display.length > 45 ? 'long' : ''}" style="--stimulus-size:${state.settings.fontSize}px">${e(c.display)}</div></div></section>`;
  return `<section class="assessment-body"><div class="assessment-head"><div><h1>${e(student?.name || 'الطالب')}</h1><p>${GRADE_NAMES[active.grade]} · الفصل ${ar(active.semester)} · ${e(c.domain)}</p></div><div class="row">${btn('عرض الطالب', 'student-display', 'secondary small')}${btn('حفظ واستكمال لاحقًا', 'pause', 'secondary small')}</div></div><div class="row between"><span class="badge blue">${e(c.skillTitle)}${c.facet ? ' · ' + e(c.facet) : ''}</span><small>البطاقة ${ar(cardIndex + 1)} من ${ar(active.cards.length)}</small></div><div class="progress"><i style="width:${pct}%"></i></div><div class="prompt-card"><small>المهمة</small><p class="instruction">${e(c.instruction)}</p><div class="stimulus ${c.display.length > 45 ? 'long' : ''}" style="--stimulus-size:${state.settings.fontSize}px">${e(c.display)}</div></div><div class="grading">${['independent', 'incorrect'].map((k) => `<button class="score-btn ${answer?.score === k ? 'selected' : ''}" data-action="score" data-score="${k}" aria-pressed="${answer?.score === k}">${SCORES[k]}</button>`).join('')}</div><details class="assessment-options"><summary>خيارات التقييم والملاحظات</summary><div class="row between"><div class="row">${['assisted', 'not_assessed', 'not_taught'].map((k) => btn(SCORES[k], 'score', 'ghost small', 'data-score="' + k + '" aria-pressed="' + (answer?.score === k) + '"')).join('')}</div><div class="font-controls"><label for="font-size">حجم العرض</label><input id="font-size" type="range" min="36" max="120" value="${state.settings.fontSize}"></div></div><details class="teacher-hint"><summary>دليل المعلم والإجابة المتوقعة</summary>${c.teacherText ? `<p class="teacher-text">${e(c.teacherText)}</p>` : ''}<p>${e(c.expected)}</p><small>طبعة ${e(c.source.edition)} · دليل الوحدة ص ${ar(c.source.page)} · العينة من إعداد المساعد</small>${btn('تعديل هذه البطاقة', 'edit-active-card', 'ghost small')}</details><label class="assessment-note">ملاحظة على هذه البطاقة<textarea id="answer-note" placeholder="اختياري">${e(answer?.note || '')}</textarea></label></details><div class="assessment-tools">${btn(icon('back') + ' السابقة', 'previous', 'secondary', cardIndex === 0 ? 'disabled' : '')}${btn('مراجعة الاختبار', 'review', 'ghost')}${btn(cardIndex === active.cards.length - 1 ? 'مراجعة وحفظ' : 'التالية ' + icon('arrow'), 'next')}</div></section>`;
}
function resultRows(rs) {
  return `<div class="results-list">${rs
    .map((r) => {
      const s = state.students.find((x) => x.id === r.studentId),
        o = overall(summarize(r.cards, r.answers, r.scoring), r.scoring);
      return `<div class="result-row"><div><strong>${e(s?.name || 'طالب مؤرشف')}</strong><small>${GRADE_NAMES[r.grade]} · الفصل الدراسي ${ar(r.semester)} · ${date(r.completedAt)}</small></div><div class="row">${badge(o.label, o.percent)}${btn(icon('print') + ' التقرير', 'student-report', 'small secondary', 'data-id="' + r.id + '"')}</div></div>`;
    })
    .join('')}</div>`;
}
function filteredResults() {
  return state.results
    .filter((r) => {
      const student = state.students.find((s) => s.id === r.studentId);
      const day = localDateKey(r.completedAt);
      return (
        r.grade === grade &&
        (!resultFilters.semester ||
          r.semester === Number(resultFilters.semester)) &&
        (!resultFilters.section ||
          (r.sectionAtTest || student?.section) === resultFilters.section) &&
        (!resultFilters.from || day >= resultFilters.from) &&
        (!resultFilters.to || day <= resultFilters.to) &&
        (!resultFilters.query ||
          normalizeName(student?.name).includes(
            normalizeName(resultFilters.query),
          ))
      );
    })
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
function resultFilterHTML() {
  const sections = [
    ...new Set(
      state.students.filter((s) => s.grade === grade).map((s) => s.section),
    ),
  ];
  return `<div class="filters result-filters"><label>اسم الطالب<input id="result-query" type="search" value="${e(resultFilters.query)}"></label><label>الفصل الدراسي<select id="result-semester"><option value="">الفصلان</option>${[1, 2].map((n) => `<option value="${n}" ${String(n) === resultFilters.semester ? 'selected' : ''}>الفصل ${ar(n)}</option>`).join('')}</select></label><label>الفصل<select id="result-section"><option value="">جميع الفصول</option>${sections.map((x) => `<option ${x === resultFilters.section ? 'selected' : ''}>${e(x)}</option>`).join('')}</select></label><label>من تاريخ<input id="result-from" type="date" value="${e(resultFilters.from)}"></label><label>إلى تاريخ<input id="result-to" type="date" value="${e(resultFilters.to)}"></label></div>`;
}
function resultsView() {
  const rs = filteredResults();
  return `${heading('نتائج التشخيص', 'ابحث عن الطالب وحدد نطاق الاختبارات.', btn(icon('print') + ' تقرير الصف', 'class-report', 'secondary'))}${gradeTabs()}${resultFilterHTML()}<div id="filtered-results">${rs.length ? resultRows(rs) : empty('لا توجد نتائج في هذا النطاق', 'غيّر المرشحات أو ابدأ اختبارًا جديدًا.')}</div>`;
}
function backupNotice() {
  if (!state.students.length && !state.results.length) return '';
  const last = state.settings.lastBackupAt;
  if (last && Date.now() - Date.parse(last) < 7 * 86400000) return '';
  return `<div class="notice warning backup-reminder">${last ? 'مر أسبوع على آخر تصدير للنسخة الاحتياطية.' : 'لم تُصدّر نسخة احتياطية من هذا الجهاز بعد.'} ${btn('تصدير نسخة', 'backup', 'secondary small')}</div>`;
}

function settingsView() {
  const s = state.settings;
  return `${heading('إعدادات المساعد', 'بيانات المدرسة والتقييم والنسخ الاحتياطي.')}
 <div class="settings-grid"><form id="settings-form" class="panel"><h2>المدرسة والتقارير</h2><div class="form-grid"><label class="span2">اسم المدرسة<input name="school" value="${e(s.school)}" maxlength="150"></label><label>اسم المعلم<input name="teacher" value="${e(s.teacher)}" maxlength="150"></label><label>اسم المدير<input name="principal" value="${e(s.principal)}" maxlength="150"></label><label class="span2">اسم الموقّع أسفل التقرير<input name="signature" value="${e(s.signature)}" placeholder="يترك مكان التوقيع اليدوي أسفل التقرير" maxlength="150"></label></div><div class="divider"></div><h2>حدود التصنيف</h2><div class="form-grid"><label>متقن من نسبة<input name="mastery" type="number" min="1" max="100" required value="${s.mastery}"></label><label>متوسط من نسبة<input name="medium" type="number" min="0" max="99" required value="${s.medium}"></label><label>الحد الأدنى للعينات<input name="minSamples" type="number" min="1" max="50" step="1" required value="${s.minSamples}"></label><label>حجم بطاقة القراءة<input name="fontSize" type="number" min="36" max="120" required value="${s.fontSize}"></label></div><div class="notice">حدود تشخيصية مقترحة وليست لائحة تقويم رسمية. يحتفظ كل اختبار بالحدود التي أُجري بها.</div><button class="btn" type="submit">حفظ الإعدادات</button></form><div><section class="panel"><h2>نسخة تحفظ عملك</h2><p id="last-backup">آخر تصدير: ${s.lastBackupAt ? date(s.lastBackupAt) : 'لم يُصدّر بعد'}</p><p class="muted">الطلاب والنتائج على هذا المتصفح والجهاز. صدّر نسخة احتياطية بانتظام، وانقلها لجهازك الآخر عند الحاجة.</p><div class="row" style="margin-top:18px">${btn(icon('download') + ' تصدير نسخة', 'backup', 'secondary')}${btn(icon('restore') + ' استعادة نسخة', 'restore', 'secondary')}</div><input type="file" id="restore-file" accept=".json,application/json" hidden><div class="notice">الاستعادة تدمج السجلات وتحتفظ بالبيانات الموجودة. لا تُرفع النسخة إلى خادم.</div>${btn('طلب حفظ دائم على الجهاز', 'persist-storage', 'ghost small')}</section><section class="panel"><h2>عن التطبيق</h2><p>المساعد · مساعد المعلم</p><p class="muted">لغتي للصفوف الأولية · الإصدار ${VERSION}</p><p class="muted">${ar(curriculum.units.length)} وحدة · ${ar(curriculum.skills.length)} بند مهارة مع فروع القراءة والكتابة.</p><small>المصدر: أدلة الوحدات من الكتب المرفوعة بطبعة ١٤٤٨. البطاقات أمثلة من إعداد المساعد؛ يمكن تعديلها قبل الاختبار.</small></section></div></div>`;
}
function render() {
  if (studentDisplay && active && !review) {
    app.innerHTML = assessment();
    return;
  }
  app.innerHTML = shell(
    route === 'home'
      ? home()
      : route === 'students'
        ? studentView()
        : route === 'setup'
          ? setup()
          : route === 'assessment'
            ? assessment()
            : route === 'results'
              ? resultsView()
              : settingsView(),
  );
  if (route === 'assessment' && active && !review) {
    const c = active.cards[cardIndex];
    app
      .querySelector('.assessment-body')
      ?.classList.toggle('listening-assessment', c.kind === 'listening');
    app
      .querySelector('.grading')
      ?.insertAdjacentHTML('beforebegin', listeningPanel(c));
    app
      .querySelector('#listening-audio')
      ?.addEventListener('ended', async () => {
        try {
          await recordListeningDelivery(c, 'recording');
        } catch (error) {
          toast(error.message);
        }
      });
    app.querySelector('#listening-audio')?.addEventListener('error', () => {
      toast(
        'تعذر تشغيل الملف. جرّب MP3 أو اقرأ النص بصوتك؛ لم تُسجّل قراءة مكتملة.',
      );
    });
  }
}
async function recordListeningDelivery(c, mode) {
  if (!active || !active.cards.includes(c)) return;
  await saveCurrentNote();
  active.listeningDelivery ||= {};
  const old = active.listeningDelivery[c.passageId];
  active.listeningDelivery[c.passageId] = {
    count: (old?.count || 0) + 1,
    mode: old?.mode && old.mode !== mode ? 'mixed' : mode,
    updatedAt: new Date().toISOString(),
  };
  await saveDraft();
  render();
}

document.addEventListener('change', async (event) => {
  if (event.target.id !== 'listening-file') return;
  const file = event.target.files?.[0];
  const draft = active,
    c = draft?.cards[cardIndex];
  if (!file || c?.kind !== 'listening' || busy) return;
  try {
    if (file.size > 2 * 1024 * 1024 || !file.size)
      throw Error('اختر ملفًا صوتيًا غير فارغ لا يتجاوز ٢ ميجابايت.');
    const text = c.teacherText;
    const audioData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('تعذرت قراءة الصوت.'));
      reader.readAsDataURL(file);
    });
    if (!safeListeningAudio({ teacherText: text, audioText: text, audioData }))
      throw Error(
        'صيغة الصوت غير مدعومة. استخدم MP3 أو WAV أو OGG أو M4A أو WebM.',
      );
    if (active !== draft || c.teacherText !== text) return;
    for (const card of active.cards.filter(
      (x) => x.passageId === c.passageId,
    )) {
      card.audioData = audioData;
      card.audioText = text;
      delete active.answers[card.id];
    }
    if (active.listeningDelivery) delete active.listeningDelivery[c.passageId];
    await saveDraft();
    render();
    toast('أُرفق الصوت محليًا؛ أُعيدت أحكام المقطع لتقييمه بالصوت الجديد.');
  } catch (error) {
    toast(error.message);
  }
});
let dialogReturnFocus;
function modal(title, body, { wide = false, actions = '' } = {}) {
  dialogReturnFocus = document.activeElement;
  dialogs.innerHTML = `<div class="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${title}</h2><button data-action="close-modal" aria-label="إغلاق">${icon('close')}</button></div>${body}${actions ? '<div class="modal-actions">' + actions + '</div>' : ''}</section></div>`;
  dialogs.querySelector('input,textarea,select,button')?.focus();
}
function closeModal() {
  dialogs.innerHTML = '';
  dialogReturnFocus?.focus?.();
}
function studentDialog(s = null) {
  modal(
    s ? 'تعديل الطالب' : 'إضافة طالب',
    `<form id="student-form"><input type="hidden" name="id" value="${s?.id || ''}"><div class="form-grid"><label class="span2">اسم الطالب<input name="name" required maxlength="150" value="${e(s?.name || '')}" autocomplete="off"></label><label>الصف<select name="grade">${GRADES.map((g) => `<option value="${g}" ${(s?.grade || grade) === g ? 'selected' : ''}>${GRADE_NAMES[g]}</option>`).join('')}</select></label><label>الفصل<input name="section" required maxlength="50" value="${e(s?.section || 'أ')}"></label><label class="span2">اسم ولي الأمر<input name="guardian" maxlength="150" value="${e(s?.guardian || '')}"></label></div><div class="modal-actions">${s ? btn('أرشفة الطالب', 'archive', 'danger', 'data-id="' + s.id + '"') : ''}<button type="submit" class="btn">حفظ الطالب</button></div><p class="error" id="form-error" role="alert"></p></form>`,
  );
}
let importedRoster = null;
let importGeneration = 0;
function rosterDialog() {
  importedRoster = null;
  importGeneration++;
  modal(
    'استيراد كشف الطلاب',
    `<form id="roster-form">
    <div class="notice">اختر كشف Excel أو Word من جهازك. تُقرأ الأسماء هنا دون رفع الملف إلى خادم.</div>
    <label>الفصل<input name="section" value="أ" maxlength="50" required></label>
    <label>ملف الكشف<input type="file" id="roster-file" accept=".xlsx,.xls,.docx,.csv,.tsv,.txt"></label>
    <small>Excel: XLSX وXLS · Word: DOCX · CSV وTSV</small>
    <div id="roster-preview" aria-live="polite"></div>
    <details style="margin-top:18px"><summary>النسخ واللصق بدلًا من الملف</summary>
    <label>الأسماء أو الجدول<textarea name="roster" id="roster-text" rows="6" placeholder="اسم الطالب،ولي الأمر&#10;اسم الطالب الأول،اسم ولي أمره"></textarea></label></details>
    <div class="modal-actions"><button type="submit" class="btn" id="import-roster">إضافة الكشف إلى الصف</button></div>
    <p class="error" id="form-error" role="alert"></p></form>`,
  );
}
function fileRosterRows() {
  if (!importedRoster) return [];
  const sheet = importedRoster.sheets[importedRoster.sheet];
  return rosterFromRows(
    sheet.rows,
    importedRoster.mapping,
    grade,
    dialogs.querySelector('[name="section"]').value,
  );
}
function renderRosterPreview() {
  const out = dialogs.querySelector('#roster-preview');
  if (!out || !importedRoster) return;
  const { sheets, sheet, mapping } = importedRoster;
  const rows = sheets[sheet].rows;
  const width = Math.min(
    30,
    Math.max(0, ...rows.slice(0, 20).map((r) => r.length)),
  );
  const labels = Array.from(
    { length: width },
    (_, i) =>
      `${i + 1} · ${rows[mapping.startRow - 1]?.[i] || rows[0]?.[i] || 'عمود'}`,
  );
  const options = (selected) =>
    labels
      .map(
        (label, i) =>
          `<option value="${i}" ${i === selected ? 'selected' : ''}>${e(label)}</option>`,
      )
      .join('');
  const candidates = fileRosterRows();
  out.innerHTML = `<div class="form-grid" style="margin-top:18px">
    <label>ورقة Excel أو جدول Word<select id="roster-sheet">${sheets.map((x, i) => `<option value="${i}" ${i === sheet ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label>
    <label>عمود اسم الطالب<select id="roster-name-column">${options(mapping.nameColumn)}</select></label>
    <label>عمود ولي الأمر<select id="roster-guardian-column"><option value="-1">غير موجود</option>${options(mapping.guardianColumn)}</select></label>
    <label>تجاوز أسطر العنوان<input id="roster-start-row" type="number" min="0" max="${rows.length}" value="${mapping.startRow}"></label></div>
    <div class="notice">معاينة ${ar(candidates.length)} اسم صالح. استُبعد ${ar(Math.max(0, rows.length - mapping.startRow - candidates.length))} صف فارغ أو بيانات غير طلابية. جميع الأسماء متاحة للمراجعة والتعديل في الخطوة التالية. اختر الأعمدة إن لم تظهر الأسماء الصحيحة.</div>
    <div style="overflow:auto"><table class="roster-table"><thead><tr><th>اسم الطالب</th><th>ولي الأمر</th></tr></thead><tbody>${candidates
      .slice(0, 6)
      .map((x) => `<tr><td>${e(x.name)}</td><td>${e(x.guardian)}</td></tr>`)
      .join('')}</tbody></table></div>`;
}
function rosterReviewDialog(incoming, sectionName) {
  rosterReviewData = { incoming, grade, section: sectionName };
  const duplicate =
    incoming.length - addStudents(state.students, incoming).added;
  modal(
    'مراجعة أسماء الكشف',
    `<form id="roster-confirm-form"><div class="notice">${ar(incoming.length)} اسم صالح للمراجعة. ${ar(duplicate)} اسم موجود مسبقًا لن يضاف مرة أخرى. عدّل الاسم أو ألغِ اختياره قبل الاعتماد.</div><div class="roster-review-scroll"><table><thead><tr><th>إضافة</th><th>اسم الطالب</th><th>ولي الأمر</th></tr></thead><tbody>${incoming.map((x, i) => `<tr><td><input type="checkbox" data-roster-include="${i}" checked aria-label="إضافة الاسم ${i + 1}"></td><td><input data-roster-name="${i}" value="${e(x.name)}" maxlength="150" aria-label="اسم الطالب ${i + 1}"></td><td><input data-roster-guardian="${i}" value="${e(x.guardian)}" maxlength="150" aria-label="ولي الأمر ${i + 1}"></td></tr>`).join('')}</tbody></table></div><p class="error" id="form-error" role="alert"></p><div class="modal-actions"><button type="submit" class="btn">اعتماد الكشف</button></div></form>`,
    { wide: true },
  );
}
function previewDialog() {
  const cards = chosenCards();
  modal(
    'راجع عينات الاختبار',
    `<p class="muted" style="margin-bottom:15px">عدّل النص والمهمة والإجابة لتناسب ما درّسته. عند تغيير النص المسموع أو الإملائي حدّث الإجابة المتوقعة أيضًا. تعديل البطاقة يخص هذا الاختبار.</p><div class="preview-list">${cards.map((c) => `<div class="preview-card"><strong>${e(c.skillTitle)}</strong><p>${e(c.instruction)}</p><label>نص البطاقة<textarea data-card-edit="${c.id}">${e(c.display)}</textarea></label><label>المهمة<input data-card-instruction="${c.id}" value="${e(c.instruction)}"></label>${c.teacherText ? `<label>النص المسموع أو الإملائي للمعلم<textarea data-card-teacher="${c.id}">${e(c.teacherText)}</textarea></label>` : ''}<label>الإجابة المتوقعة ومعيار الحكم<textarea data-card-expected="${c.id}">${e(c.expected)}</textarea></label></div>`).join('')}</div>`,
    { wide: true, actions: btn('حفظ تعديلات العينات', 'save-preview') },
  );
}
function studentReportHTML(r) {
  const s = state.students.find((s) => s.id === r.studentId),
    summary = summarize(r.cards, r.answers, r.scoring);
  return `<article class="report-sheet" id="report"><header class="report-title"><p>المملكة العربية السعودية · وزارة التعليم</p><p>${e(state.settings.school || 'المدرسة')}</p><h2>تقرير اختبار لغتي التشخيصي</h2></header><div class="report-meta"><p><strong>الطالب:</strong> ${e(s?.name || '')}</p><p><strong>الصف وقت الاختبار:</strong> ${GRADE_NAMES[r.grade]}</p><p><strong>الفصل الدراسي:</strong> ${ar(r.semester)}</p><p><strong>تاريخ الاختبار:</strong> ${date(r.completedAt)}</p>${s?.guardian ? '<p><strong>ولي الأمر:</strong> ' + e(s.guardian) + '</p>' : ''}<p><strong>المعلم:</strong> ${e(state.settings.teacher)}</p></div><table><thead><tr><th>المهارة</th><th>نسبة الإتقان</th><th>التصنيف</th><th>ملاحظة</th></tr></thead><tbody>${summary.map((x) => `<tr><td>${e(x.title)}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${e(x.label)}</td><td>${x.limited ? 'عينة محدودة تحتاج تحققًا' : ''}</td></tr>`).join('')}</tbody></table>${detailedReportHTML(r)}${r.note ? '<p class="report-note"><strong>ملاحظة المعلم:</strong> ' + e(r.note) + '</p>' : ''}<p class="report-note">نسبة الإتقان تعتمد على الإجابات الصحيحة المستقلة. المهارات غير المختبرة أو غير المدرّسة لا تُحسب ضعفًا.</p><footer class="report-foot"><p>المعلم: ${e(state.settings.signature || state.settings.teacher)}<br>التوقيع: __________________</p><p>مدير المدرسة: ${e(state.settings.principal)}<br>التوقيع: __________________</p></footer></article>`;
}
function reportScopeControls() {
  const rs = state.results.filter((r) => r.grade === grade);
  const skills = new Map(
    rs.flatMap((r) => r.cards.map((c) => [c.skillId, c.skillTitle])),
  );
  const tests = new Map();
  for (const r of rs)
    if (!tests.has(assessmentSignature(r)))
      tests.set(assessmentSignature(r), r);
  const options = (values, value) =>
    values
      .map(
        ([id, title]) =>
          `<option value="${e(id)}" ${id === value ? 'selected' : ''}>${e(title)}</option>`,
      )
      .join('');
  return `<div class="filters report-scope"><label>مهارة محددة<select id="report-skill"><option value="">كل المهارات</option>${options([...skills], reportScope.skill)}</select></label><label>نفس عينات الاختبار<select id="report-test"><option value="">آخر اختبار لكل طالب</option>${options(
    [...tests.values()].map((r) => [
      r.id,
      date(r.completedAt) +
        ' · ' +
        [...new Set(r.cards.map((c) => c.skillTitle))].join('، '),
    ]),
    reportScope.test,
  )}</select></label><label>الفصل الدراسي<select id="report-semester"><option value="">الفصلان</option>${options(
    [
      ['1', 'الفصل الأول'],
      ['2', 'الفصل الثاني'],
    ],
    reportScope.semester,
  )}</select></label><label>الفصل<select id="report-section"><option value="">جميع الفصول</option>${options(
    [
      ...new Set(
        state.students.filter((s) => s.grade === grade).map((s) => s.section),
      ),
    ].map((x) => [x, x]),
    reportScope.section,
  )}</select></label><label>من تاريخ<input id="report-from" type="date" value="${e(reportScope.from)}"></label><label>إلى تاريخ<input id="report-to" type="date" value="${e(reportScope.to)}"></label></div>`;
}
function scopedClassRows() {
  const anchor = state.results.find((r) => r.id === reportScope.test);
  return state.students
    .filter(
      (s) =>
        s.grade === grade &&
        !s.archived &&
        (!reportScope.section || s.section === reportScope.section),
    )
    .map((s) => {
      const eligible = state.results.filter(
        (r) =>
          r.grade === grade &&
          r.studentId === s.id &&
          (!reportScope.from ||
            localDateKey(r.completedAt) >= reportScope.from) &&
          (!reportScope.to || localDateKey(r.completedAt) <= reportScope.to) &&
          (!reportScope.semester ||
            r.semester === Number(reportScope.semester)) &&
          (!reportScope.skill ||
            r.cards.some((c) => c.skillId === reportScope.skill)) &&
          (!anchor || assessmentSignature(r) === assessmentSignature(anchor)),
      );
      const r = latestResult(eligible, s.id);
      const summary = r
        ? summarize(r.cards, r.answers, r.scoring).filter(
            (x) => !reportScope.skill || x.skillId === reportScope.skill,
          )
        : [];
      const o = r
        ? overall(summary, r.scoring)
        : { percent: null, label: 'غير مختبر' };
      return {
        student: s,
        result: r,
        ...o,
        attempted: summary.reduce((n, x) => n + x.attempted, 0),
        total: r
          ? r.cards.filter(
              (c) => !reportScope.skill || c.skillId === reportScope.skill,
            ).length
          : 0,
        scope: r
          ? [
              ...new Set(
                r.cards
                  .filter(
                    (c) =>
                      !reportScope.skill || c.skillId === reportScope.skill,
                  )
                  .map((c) => c.skillTitle),
              ),
            ].join('، ')
          : '—',
        limited: summary.some((x) => x.limited),
      };
    });
}
function classReportHTML() {
  const rows = scopedClassRows();
  return `<article class="report-sheet" id="report"><header class="report-title"><p>وزارة التعليم · ${e(state.settings.school || 'المدرسة')}</p><h2>تقرير الصف في لغتي</h2><p>${GRADE_NAMES[grade]} · ${date(new Date().toISOString())}</p><p>${reportScope.test ? 'نفس عينات الاختبار' : reportScope.skill ? 'مهارة محددة' : 'آخر اختبار لكل طالب'}</p></header><table><thead><tr><th>الطالب</th><th>الفصل</th><th>نطاق الاختبار</th><th>البنود المقيمة</th><th>نسبة الإتقان</th><th>الحالة</th><th>آخر اختبار</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${e(x.student.name)}</td><td>${e(x.student.section)}</td><td>${e(x.scope)}</td><td>${x.result ? ar(x.attempted) + ' من ' + ar(x.total) : '—'}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${e(x.label)}${x.limited ? ' · عينة محدودة' : ''}</td><td>${x.result ? date(x.result.completedAt) : '—'}</td></tr>`).join('') || '<tr><td colspan="7">لا يوجد طلاب في هذا النطاق.</td></tr>'}</tbody></table><p class="report-note">${reportScope.test ? 'يشمل النتائج ذات البطاقات ومعايير التصنيف المطابقة للاختبار المختار.' : 'حدد نفس عينات الاختبار للمقارنة الموحدة؛ قد تختلف مهارات وعينات آخر اختبار بين الطلاب.'} غير المختبر لا يُحسب ضعيفًا. راجع عدد البنود المقيمة؛ اختلافه يعني أن الاختبار غير مكتمل للمقارنة. ${reportScope.from || reportScope.to ? 'نطاق التاريخ: ' + e(reportScope.from || 'البداية') + ' إلى ' + e(reportScope.to || 'اليوم') : ''}</p><footer class="report-foot"><p>المعلم: ${e(state.settings.teacher)}</p><p>التوقيع: __________________</p></footer></article>`;
}
function detailedReportHTML(r) {
  const failures = r.cards.filter((c) =>
    ['incorrect', 'assisted'].includes(r.answers[c.id]?.score),
  );
  const facets = facetSummary(r);
  const progress = skillProgress(r, state.results);
  return `${facets.length ? `<h3>تفصيل الظواهر</h3><table><thead><tr><th>الفرع</th><th>نسبة الإتقان</th><th>ملاحظة</th></tr></thead><tbody>${facets.map((x) => `<tr><td>${e(x.title)}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${x.limited ? 'عينة محدودة تحتاج تحققًا' : ''}</td></tr>`).join('')}</tbody></table>` : ''}<h3>بنود تحتاج تدريبًا</h3>${failures.length ? `<table class="item-details"><thead><tr><th>المهارة والعينة</th><th>المهمة ومعيار الحكم</th><th>الحكم</th><th>ملاحظة المعلم</th></tr></thead><tbody>${failures.map((c) => `<tr><td>${e(c.skillTitle)}${c.facet ? ' · ' + e(c.facet) : ''}<br>${e(c.teacherText || c.display)}</td><td>${e(c.instruction)}<br><small>${e(c.expected)}</small></td><td>${e(SCORES[r.answers[c.id].score])}</td><td>${e(r.answers[c.id].note || '')}</td></tr>`).join('')}</tbody></table>` : '<p>لم تسجل إجابات خاطئة أو بمساعدة في البنود المقيمة.</p>'}<h3>متابعة نفس المهارة والعينات</h3><table><thead><tr><th>المهارة</th><th>السابقة</th><th>الحالية</th><th>التغير</th></tr></thead><tbody>${progress.map((x) => `<tr><td>${e(x.title)}</td><td>${x.previousPercent === null ? 'لا توجد نتيجة مطابقة' : ar(x.previousPercent) + '٪ · ' + date(x.previousAt)}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${x.delta === null ? '—' : (x.delta > 0 ? '+' : '') + ar(x.delta) + ' نقطة مئوية'}</td></tr>`).join('')}</tbody></table><p class="report-note">تُحسب المقارنة فقط عند تطابق العينات والمهمات والمعايير والبنود المقيمة. اختلاف العينات يحتاج قراءة النتائج كلٌّ على حدة.</p>`;
}

function reportModal(html, kind, id = '') {
  const result =
    kind === 'student' ? state.results.find((r) => r.id === id) : null;
  const next = result ? nextRosterStudent(state.students, result) : null;
  const nextAction = next
    ? btn(
        'الطالب التالي: ' + e(next.name),
        'next-student',
        '',
        'data-id="' + id + '"',
      )
    : result
      ? '<small>آخر طالب في هذا الكشف</small>'
      : '';
  modal(
    kind === 'class' ? 'تقرير الصف' : 'تقرير الطالب',
    `<div class="row report-actions">${btn(icon('print') + ' طباعة أو حفظ PDF', 'print')}${btn(icon('download') + ' تصدير الجدول CSV', 'export-csv', 'secondary', 'data-kind="' + kind + '" data-id="' + id + '"')}${kind === 'class' ? btn('تحديث التقرير', 'refresh-report', 'ghost') : ''}${nextAction}</div>${kind === 'class' ? reportScopeControls() : ''}${html}`,
    { wide: true },
  );
}
function download(data, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportCSV(kind, id) {
  let rows;
  if (kind === 'class') {
    rows = [
      [
        'الطالب',
        'الفصل',
        'نطاق الاختبار',
        'البنود المقيمة',
        'إجمالي البنود',
        'نسبة الإتقان',
        'الحالة',
      ],
      ...scopedClassRows().map((x) => [
        x.student.name,
        x.student.section,
        x.scope,
        x.attempted,
        x.total,
        x.percent ?? '',
        x.label,
      ]),
    ];
  } else {
    const r = state.results.find((r) => r.id === id);
    rows = [
      ['المهارة', 'نسبة الإتقان', 'التصنيف'],
      ...summarize(r.cards, r.answers, r.scoring).map((s) => [
        s.title,
        s.percent ?? '',
        s.label,
      ]),
    ];
  }
  download(
    '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
    'المساعد-تقرير.csv',
    'text/csv;charset=utf-8',
  );
}

document.addEventListener('click', async (event) => {
  const t = event.target.closest('[data-action]');
  if (!t || t.disabled) return;
  event.preventDefault();
  const a = t.dataset.action;
  if (busy || (a === 'score' && event.detail > 1)) return;
  try {
    if (a === 'nav') {
      if (active && route === 'assessment') {
        if (review)
          active.note =
            document.querySelector('#final-note')?.value || active.note;
        else await saveCurrentNote();
        await saveDraft();
        active = null;
        review = false;
      }
      nav(t.dataset.route);
    } else if (a === 'grade') {
      grade = Number(t.dataset.grade);
      query = '';
      section = '';
      render();
    } else if (a === 'open-grade') {
      grade = Number(t.dataset.grade);
      nav('students');
    } else if (a === 'scroll-grades')
      document.querySelector('#grades').scrollIntoView({ behavior: 'smooth' });
    else if (a === 'add-student') studentDialog();
    else if (a === 'edit-student')
      studentDialog(state.students.find((s) => s.id === t.dataset.id));
    else if (a === 'close-modal') closeModal();
    else if (a === 'roster') rosterDialog();
    else if (a === 'archive') {
      await persist({
        ...state,
        students: state.students.map((s) =>
          s.id === t.dataset.id ? { ...s, archived: true } : s,
        ),
      });
      closeModal();
      render();
      toast('أُرشف الطالب مع الاحتفاظ بجميع نتائجه.');
    } else if (a === 'unarchive') {
      await persist({
        ...state,
        students: state.students.map((s) =>
          s.id === t.dataset.id ? { ...s, archived: false } : s,
        ),
      });
      closeModal();
      render();
      toast('أُعيد الطالب إلى الصف.');
    } else if (a === 'archives')
      modal(
        'الطلاب المؤرشفون',
        state.students
          .filter((s) => s.archived)
          .map(
            (s) =>
              `<div class="student-row"><strong>${e(s.name)}</strong>${btn('إعادة للصف', 'unarchive', 'small', 'data-id="' + s.id + '"')}</div>`,
          )
          .join('') || '<p class="muted">لا يوجد طلاب مؤرشفون.</p>',
      );
    else if (a === 'assess-student') {
      customCards = null;
      initializeSetup(t.dataset.id);
    } else if (a === 'student-display') {
      if (!studentDisplay) await saveCurrentNote();
      studentDisplay = !studentDisplay;
      render();
    } else if (a.startsWith('preset-')) {
      const list = availableSkills();
      selected = new Set(
        list
          .filter((s) =>
            a === 'preset-writing'
              ? ['copy', 'dictation'].includes(s.kind)
              : a === 'preset-comprehension'
                ? ['listening', 'literal'].includes(s.kind)
                : grade === 1
                  ? s.kind === 'letter'
                  : s.kind === 'reading' ||
                    /الشمسية|القمرية|تنوين|ه وت وة/.test(s.title),
          )
          .map((s) => s.id),
      );
      customCards = null;
      domain = '';
      render();
    } else if (a === 'select-visible') {
      availableSkills()
        .filter((s) => !domain || s.domain === domain)
        .forEach((s) => selected.add(s.id));
      render();
    } else if (a === 'clear-selection') {
      selected.clear();
      customCards = null;
      render();
    } else if (a === 'preview-cards') previewDialog();
    else if (a === 'save-preview') {
      customCards = customCards || {};
      for (const area of dialogs.querySelectorAll('[data-card-edit]')) {
        if (!area.value.trim()) throw Error('لا تترك بطاقة فارغة.');
        if (
          !dialogs
            .querySelector(
              `[data-card-expected="${CSS.escape(area.dataset.cardEdit)}"]`,
            )
            .value.trim()
        )
          throw Error('اكتب الإجابة المتوقعة ومعيار الحكم لكل بطاقة.');
        const id = area.dataset.cardEdit;
        const teacherArea = dialogs.querySelector(
          `[data-card-teacher="${CSS.escape(id)}"]`,
        );
        if (teacherArea && !teacherArea.value.trim())
          throw Error('اكتب النص المسموع أو الإملائي.');
        customCards[id] = {
          expected: dialogs
            .querySelector(`[data-card-expected="${CSS.escape(id)}"]`)
            .value.trim(),
          teacherText:
            dialogs
              .querySelector(`[data-card-teacher="${CSS.escape(id)}"]`)
              ?.value.trim() || '',
          display: area.value.trim(),
          instruction: dialogs
            .querySelector(`[data-card-instruction="${CSS.escape(id)}"]`)
            .value.trim(),
        };
      }
      closeModal();
      toast('حُفظت تعديلات العينات لهذا الاختبار.');
    } else if (a === 'start-assessment') {
      const cards = chosenCards();
      if (!studentId || !cards.length) throw Error('اختر طالبًا ومهارة.');
      if (cards.length > 1000)
        throw Error('اختر نطاقًا أقصر للاختبار، حتى ألف بطاقة.');
      active = {
        id: uid(),
        studentId,
        sectionAtTest:
          state.students.find((s) => s.id === studentId)?.section || '',
        grade,
        semester,
        unit,
        cumulative,
        rosterIds: state.students
          .filter(
            (s) =>
              !s.archived &&
              s.grade === grade &&
              s.section ===
                state.students.find((x) => x.id === studentId)?.section,
          )
          .map((s) => s.id),
        cards,
        answers: {},
        startedAt: new Date().toISOString(),
        scoring: { ...state.settings },
        note: '',
      };
      cardIndex = 0;
      studentDisplay = false;
      review = false;
      await saveDraft();
      route = 'assessment';
      render();
    } else if (a === 'listening-attach') {
      document.querySelector('#listening-file')?.click();
    } else if (a === 'listening-read') {
      const c = active?.cards[cardIndex];
      if (c?.kind === 'listening') await recordListeningDelivery(c, 'teacher');
    } else if (a === 'score') {
      if (!active || review) return;
      const c = active.cards[cardIndex];
      active.answers[c.id] = {
        score: t.dataset.score,
        note: document.querySelector('#answer-note')?.value || '',
        updatedAt: new Date().toISOString(),
      };
      await saveDraft();
      if (cardIndex === active.cards.length - 1) review = true;
      else cardIndex++;
      render();
    } else if (a === 'next') {
      const c = active.cards[cardIndex];
      if (!active.answers[c.id]) {
        toast('اختر حكمًا، أو غير مقيم، قبل الانتقال.');
        return;
      }
      await saveCurrentNote();
      if (cardIndex === active.cards.length - 1) review = true;
      else cardIndex++;
      render();
    } else if (a === 'previous') {
      await saveCurrentNote();
      cardIndex = Math.max(0, cardIndex - 1);
      render();
    } else if (a === 'review') {
      await saveCurrentNote();
      review = true;
      render();
    } else if (a === 'review-back') {
      active.note = document.querySelector('#final-note')?.value || active.note;
      await saveDraft();
      review = false;
      render();
    } else if (a === 'pause') {
      if (review)
        active.note = document.querySelector('#final-note')?.value || '';
      else await saveCurrentNote();
      await saveDraft();
      active = null;
      review = false;
      nav('home');
      toast('حُفظ الاختبار لاستكماله لاحقًا.');
    } else if (a === 'resume') {
      active = structuredClone(state.drafts.find((d) => d.id === t.dataset.id));
      grade = active.grade;
      studentDisplay = false;
      cardIndex = Math.max(
        0,
        active.cards.findIndex((c) => !active.answers[c.id]),
      );
      review = active.cards.every((c) => active.answers[c.id]);
      route = 'assessment';
      render();
    } else if (a === 'finish') {
      active.note = document.querySelector('#final-note')?.value || '';
      const result = {
        ...structuredClone(active),
        completedAt: new Date().toISOString(),
      };
      await persist({
        ...state,
        results: [...state.results.filter((r) => r.id !== result.id), result],
        drafts: state.drafts.filter((d) => d.id !== result.id),
      });
      active = null;
      review = false;
      nav('results');
      toast('حُفظت نتيجة الاختبار.');
      reportModal(studentReportHTML(result), 'student', result.id);
    } else if (a === 'next-student') {
      const result = state.results.find((r) => r.id === t.dataset.id);
      const next = result && nextRosterStudent(state.students, result);
      if (!next) throw Error('لا يوجد طالب تالٍ في هذا الكشف.');
      active = {
        id: uid(),
        studentId: next.id,
        sectionAtTest: next.section,
        grade: result.grade,
        semester: result.semester,
        unit: result.unit,
        cumulative: result.cumulative,
        rosterIds: result.rosterIds,
        cards: structuredClone(result.cards),
        answers: {},
        startedAt: new Date().toISOString(),
        scoring: { ...state.settings },
        note: '',
      };
      cardIndex = 0;
      studentDisplay = false;
      review = false;
      grade = result.grade;
      studentId = next.id;
      await saveDraft();
      closeModal();
      route = 'assessment';
      render();
    } else if (a === 'student-report') {
      const r = state.results.find((r) => r.id === t.dataset.id);
      reportModal(studentReportHTML(r), 'student', r.id);
    } else if (a === 'class-report') {
      const latest = state.results
        .filter((r) => r.grade === grade)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
      reportScope = {
        skill: '',
        test: latest?.id || '',
        section: '',
        semester: '',
        from: '',
        to: '',
      };
      reportModal(classReportHTML(), 'class');
    } else if (a === 'refresh-report') {
      const fresh = await readState();
      state = fresh;
      dialogs.querySelector('#report').outerHTML = classReportHTML();
      toast('حُدّث التقرير في النافذة نفسها.');
    } else if (a === 'print') window.print();
    else if (a === 'export-csv') exportCSV(t.dataset.kind, t.dataset.id);
    else if (a === 'backup') {
      download(
        JSON.stringify(
          { app: 'al-musaed', exportedAt: new Date().toISOString(), ...state },
          null,
          2,
        ),
        'المساعد-نسخة-' + new Date().toISOString().slice(0, 10) + '.json',
      );
      await persist({
        ...state,
        settings: { ...state.settings, lastBackupAt: new Date().toISOString() },
      });
      render();
      toast('بدأ تنزيل النسخة الاحتياطية. تحقق من حفظ الملف في التنزيلات.');
    } else if (a === 'restore') document.querySelector('#restore-file').click();
    else if (a === 'confirm-restore') {
      const next = mergeBackup(state, pendingBackup);
      await persist(next);
      pendingBackup = null;
      closeModal();
      render();
      toast('دُمجت النسخة الاحتياطية مع بياناتك.');
    } else if (a === 'persist-storage') {
      const granted = await navigator.storage?.persist?.();
      toast(
        granted
          ? 'وافق المتصفح على الحفظ الدائم.'
          : 'لم يمنح المتصفح الحفظ الدائم. واصل تصدير النسخ الاحتياطية.',
      );
    } else if (a === 'edit-active-card') {
      const c = active.cards[cardIndex];
      modal(
        'تعديل بطاقة الاختبار',
        `<label>النص<textarea id="edit-display">${e(c.display)}</textarea></label><label>المهمة<input id="edit-instruction" value="${e(c.instruction)}"></label>${c.teacherText ? `<label>النص المسموع أو الإملائي للمعلم<textarea id="edit-teacher">${e(c.teacherText)}</textarea></label>` : ''}<label>الإجابة المتوقعة ومعيار الحكم<textarea id="edit-expected">${e(c.expected)}</textarea></label>`,
        { actions: btn('حفظ البطاقة', 'save-active-card') },
      );
    } else if (a === 'save-active-card') {
      const c = active.cards[cardIndex],
        display = document.querySelector('#edit-display').value.trim();
      if (!display) throw Error('لا تترك البطاقة فارغة.');
      if (!document.querySelector('#edit-expected').value.trim())
        throw Error('اكتب الإجابة المتوقعة ومعيار الحكم.');
      if (
        c.teacherText &&
        !document.querySelector('#edit-teacher').value.trim()
      )
        throw Error('اكتب النص المسموع أو الإملائي.');
      const previousText = c.teacherText;
      c.display = display;
      c.instruction = document.querySelector('#edit-instruction').value;
      c.expected = document.querySelector('#edit-expected').value;
      if (c.teacherText)
        c.teacherText = document.querySelector('#edit-teacher').value.trim();
      if (c.passageId && c.teacherText !== previousText) {
        for (const card of active.cards.filter(
          (x) => x.passageId === c.passageId,
        )) {
          card.teacherText = c.teacherText;
          delete card.audioData;
          delete card.audioText;
          delete active.answers[card.id];
        }
        if (active.listeningDelivery)
          delete active.listeningDelivery[c.passageId];
      }
      delete active.answers[c.id];
      await saveDraft();
      closeModal();
      render();
      toast(
        c.passageId
          ? 'حُفظ التعديل. عند تغيير المقطع راجع إجابات جميع أسئلته؛ أُلغي صوته وأحكامه السابقة.'
          : 'عُدلت البطاقة، وأعيد حكمها ليقيّمها المعلم من جديد.',
      );
    } else if (a === 'update') {
      if (active) {
        if (!review) await saveCurrentNote();
        await saveDraft();
      }
      pendingUpdate.postMessage({ type: 'ACTIVATE_UPDATE' });
    }
  } catch (error) {
    console.error(error);
    toast(error.message || 'تعذر تنفيذ العملية.');
  }
});
async function saveCurrentNote() {
  if (!active || review) return;
  const c = active.cards[cardIndex],
    a = active.answers[c.id];
  if (a) {
    a.note = document.querySelector('#answer-note')?.value || a.note || '';
    await saveDraft();
  }
}
let pendingBackup;
document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    const f = ev.target,
      d = new FormData(f),
      formId = f.getAttribute('id');
    if (formId === 'student-form') {
      const input = {
          name: normalizeName(d.get('name')),
          grade: Number(d.get('grade')),
          section: normalizeName(d.get('section')) || 'أ',
          guardian: normalizeName(d.get('guardian')),
        },
        id = d.get('id');
      if (!input.name) throw Error('أدخل اسم الطالب.');
      const duplicate = state.students.find(
        (s) =>
          s.id !== id &&
          s.grade === input.grade &&
          s.section === input.section &&
          normalizeName(s.name) === input.name,
      );
      if (duplicate) throw Error('يوجد طالب بهذا الاسم في الفصل نفسه.');
      const next = id
        ? state.students.map((s) => (s.id === id ? { ...s, ...input } : s))
        : addStudents(state.students, [input]).students;
      await persist({ ...state, students: next });
      grade = input.grade;
      closeModal();
      render();
      toast('حُفظ الطالب.');
    } else if (formId === 'roster-form') {
      const pasted = String(d.get('roster') || '').trim();
      const incoming = pasted
        ? rosterFromText(pasted, grade, d.get('section'))
        : fileRosterRows();
      if (!incoming.length) throw Error('لم توجد أسماء صالحة.');
      rosterReviewDialog(incoming, d.get('section'));
    } else if (formId === 'roster-confirm-form') {
      const incoming = rosterReviewData.incoming.flatMap((x, i) => {
        if (!dialogs.querySelector(`[data-roster-include="${i}"]`).checked)
          return [];
        const name = normalizeName(
          dialogs.querySelector(`[data-roster-name="${i}"]`).value,
        );
        if (!name) throw Error('اكتب الاسم أو ألغِ اختياره.');
        return [
          {
            ...x,
            name,
            guardian: normalizeName(
              dialogs.querySelector(`[data-roster-guardian="${i}"]`).value,
            ),
          },
        ];
      });
      if (!incoming.length) throw Error('اختر اسمًا واحدًا على الأقل.');
      const out = addStudents(state.students, incoming);
      await persist({ ...state, students: out.students });
      closeModal();
      render();
      toast(`أضيف ${ar(out.added)} طالب. لم تتكرر الأسماء الموجودة.`);
    } else if (formId === 'settings-form') {
      const settings = validateSettings({
        ...state.settings,
        school: normalizeName(d.get('school')),
        teacher: normalizeName(d.get('teacher')),
        principal: normalizeName(d.get('principal')),
        signature: normalizeName(d.get('signature')),
        mastery: Number(d.get('mastery')),
        medium: Number(d.get('medium')),
        minSamples: Number(d.get('minSamples')),
        fontSize: Number(d.get('fontSize')),
      });
      await persist({ ...state, settings });
      render();
      toast('حُفظت الإعدادات.');
    }
  } catch (error) {
    const out = document.querySelector('#form-error');
    if (out) out.textContent = error.message;
    else toast(error.message);
  }
});
document.addEventListener('change', async (ev) => {
  const t = ev.target;
  try {
    if (
      t.id.startsWith('report-') &&
      [
        'report-skill',
        'report-test',
        'report-section',
        'report-semester',
        'report-from',
        'report-to',
      ].includes(t.id)
    ) {
      reportScope[t.id.slice(7)] = t.value;
      dialogs.querySelector('#report').outerHTML = classReportHTML();
    } else if (
      [
        'result-semester',
        'result-section',
        'result-from',
        'result-to',
      ].includes(t.id)
    ) {
      resultFilters[t.id.slice(7)] = t.value;
      render();
    } else if (t.id === 'section-filter') {
      section = t.value;
      document.querySelector('#student-list').innerHTML =
        studentRows(students());
    } else if (t.id === 'setup-student') {
      studentId = t.value;
      render();
    } else if (t.id === 'setup-semester') {
      semester = Number(t.value);
      unit = curriculum.units.find(
        (u) => u.grade === grade && u.semester === semester,
      ).unit;
      selected = new Set();
      customCards = null;
      render();
    } else if (t.id === 'setup-unit') {
      unit = Number(t.value);
      selected = new Set();
      customCards = null;
      render();
    } else if (t.id === 'setup-domain') {
      domain = t.value;
      render();
    } else if (t.id === 'setup-cumulative') {
      cumulative = t.checked;
      selected = new Set();
      customCards = null;
      render();
    } else if (t.dataset.skill) {
      t.checked
        ? selected.add(t.dataset.skill)
        : selected.delete(t.dataset.skill);
      render();
    } else if (t.id === 'font-size') {
      await persist({
        ...state,
        settings: { ...state.settings, fontSize: Number(t.value) },
      });
    } else if (t.id === 'roster-file') {
      const file = t.files[0];
      if (!file) return;
      const generation = ++importGeneration;
      importedRoster = null;
      const preview = dialogs.querySelector('#roster-preview');
      const button = dialogs.querySelector('#import-roster');
      button.disabled = true;
      preview.textContent = 'جارٍ قراءة الكشف…';
      dialogs.querySelector('#form-error').textContent = '';
      dialogs.querySelector('#roster-text').value = '';
      try {
        const sheets = await readRosterFile(file);
        if (
          generation !== importGeneration ||
          !dialogs.querySelector('#roster-preview')
        )
          return;
        if (!sheets.length || !sheets.some((x) => x.rows.length))
          throw Error('لم توجد أسماء في الملف.');
        let sheet = sheets.findIndex(
          (x) => inferRosterColumns(x.rows).startRow > 0,
        );
        if (sheet < 0) sheet = sheets.findIndex((x) => x.rows.length);
        importedRoster = {
          sheets,
          sheet,
          mapping: inferRosterColumns(sheets[sheet].rows),
        };
        renderRosterPreview();
      } catch (error) {
        if (
          generation === importGeneration &&
          dialogs.querySelector('#roster-preview')
        ) {
          preview.textContent = '';
          dialogs.querySelector('#form-error').textContent =
            error.message || 'تعذر قراءة الملف. جرّب ملفًا صالحًا.';
        }
      } finally {
        if (generation === importGeneration) button.disabled = false;
      }
    } else if (
      [
        'roster-sheet',
        'roster-name-column',
        'roster-guardian-column',
        'roster-start-row',
      ].includes(t.id)
    ) {
      if (!importedRoster) return;
      if (t.id === 'roster-sheet') {
        importedRoster.sheet = Number(t.value);
        importedRoster.mapping = inferRosterColumns(
          importedRoster.sheets[importedRoster.sheet].rows,
        );
      } else {
        const field = {
          'roster-name-column': 'nameColumn',
          'roster-guardian-column': 'guardianColumn',
          'roster-start-row': 'startRow',
        }[t.id];
        importedRoster.mapping[field] = Math.max(
          field === 'guardianColumn' ? -1 : 0,
          Number(t.value) || 0,
        );
      }
      renderRosterPreview();
    } else if (t.id === 'restore-file') {
      const file = t.files[0];
      if (!file) return;
      if (file.size > 20000000) throw Error('النسخة أكبر من ٢٠ ميجابايت.');
      pendingBackup = validateBackup(JSON.parse(await file.text()));
      modal(
        'استعادة النسخة الاحتياطية',
        `<p>ستُدمج سجلات ${ar(pendingBackup.students.length)} طالب و${ar(pendingBackup.results.length)} اختبار مع البيانات الحالية. تظل إعدادات جهازك كما هي، ولا تحذف سجلاتك.</p>`,
        { actions: btn('دمج النسخة', 'confirm-restore') },
      );
      t.value = '';
    }
  } catch (error) {
    toast(error.message || 'تعذر قراءة الملف.');
  }
});
document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'result-query') {
    resultFilters.query = t.value;
    const rs = filteredResults();
    document.querySelector('#filtered-results').innerHTML = rs.length
      ? resultRows(rs)
      : '<p>لا توجد نتائج في هذا النطاق.</p>';
  } else if (t.id === 'student-search') {
    query = t.value;
    document.querySelector('#student-list').innerHTML = studentRows(students());
  } else if (t.id === 'font-size') {
    document
      .querySelector('.stimulus')
      ?.style.setProperty('--stimulus-size', t.value + 'px');
  }
});
document.addEventListener('keydown', (ev) => {
  if (!dialogs.children.length) return;
  if (ev.key === 'Escape') {
    closeModal();
    return;
  }
  if (ev.key === 'Tab') {
    const focus = [
      ...dialogs.querySelectorAll('button,input,textarea,select,a[href]'),
    ].filter((x) => !x.disabled && !x.hidden);
    const first = focus[0],
      last = focus.at(-1);
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last?.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first?.focus();
    }
  }
});
channel &&
  (channel.onmessage = async (ev) => {
    if (ev.data > state.revision) {
      if (active)
        toast('حُفظت تغييرات في نافذة أخرى. أعد التحميل قبل متابعة الحفظ.');
      else {
        state = await readState();
        render();
      }
    }
  });
try {
  [state, curriculum] = await Promise.all([
    readState(),
    fetch('./curriculum.json').then((r) => {
      if (!r.ok) throw Error('تعذر تحميل المنهج.');
      return r.json();
    }),
  ]);
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
  render();
  if ('serviceWorker' in navigator) {
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const reg = await navigator.serviceWorker.register('./sw.js');
      if (reg.waiting) {
        pendingUpdate = reg.waiting;
        render();
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && hadController) {
            pendingUpdate = worker;
            render();
          }
        });
      });
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !refreshing) {
          refreshing = true;
          location.reload();
        }
      });
    } catch {
      toast(
        'تعذر تفعيل العمل دون اتصال. يمكنك استخدام التطبيق الآن وتصدير نسخة احتياطية.',
      );
    }
  }
} catch (error) {
  console.error(error);
  app.innerHTML = `<section class="fatal"><h1>تعذر فتح المساعد</h1><p>${e(error.message)}</p><p>تحقق من السماح بتخزين الموقع، وافتح النسخة من رابطها في نافذة عادية.</p><button class="btn" id="retry">إعادة المحاولة</button></section>`;
  document.querySelector('#retry').onclick = () => location.reload();
}
