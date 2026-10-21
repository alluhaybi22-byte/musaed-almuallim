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
  trainingPlan,
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
import { GOOGLE_DRIVE_CLIENT_ID } from './drive-config.js';
import {
  readingLessonsFor,
  lessonReadingSkills,
  readingCardSourceLabel,
} from './reading-lessons.js';
import { createDriveStorage } from './drive-storage.js';
import {
  startSentenceRotation,
  advanceSentenceRotation,
  sentenceWordCount,
} from './reading-rotation.js';

import { sessionRows, nextSessionStudent, performanceCounts } from './classroom.js';
import {eligibleRoster, instantiatePlan, pendingPlanCards, matchingDraft} from './completion.js';
import {lessonAssessmentSkills} from './lesson-assessment.js';

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
  readingLessonId = '',
  readingLessonIds = [],
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
let currentSessionId = '', lastJudgement = null, setupAdvanced = false, resultFiltersOpen = false;
const PREF_KEY = 'al-musaed-classroom-v1';
let classroomPreferences = {sections: {}, setups: {}};
try {
  const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
  if (saved && typeof saved === 'object') classroomPreferences = {
    grade: GRADES.includes(saved.grade) ? saved.grade : 1,
    sections: saved.sections && typeof saved.sections === 'object' ? saved.sections : {},
    setups: saved.setups && typeof saved.setups === 'object' ? saved.setups : {},
  };
} catch {}
function rememberClassroom() {
  classroomPreferences.grade = grade;
  classroomPreferences.sections[grade] = section;
  if (route === 'setup') classroomPreferences.setups[grade] = {
    semester, unit, readingLessonId, readingLessonIds, cumulative, selected: [...selected],
  };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(classroomPreferences)); } catch {}
}
function chooseGrade(value) {
  grade = value;
  query = '';
  section = typeof classroomPreferences.sections[grade] === 'string' ? classroomPreferences.sections[grade] : '';
  if (section && !state.students.some(s => s.grade === grade && !s.archived && s.section === section)) section = '';
  rememberClassroom();
}
function recordInSection(record) {
  return !section || (record.sectionAtTest || state.students.find(s => s.id === record.studentId)?.section) === section;
}
function sectionOptions(value = section) {
  const sections = [...new Set(state.students.filter(s => s.grade === grade && !s.archived).map(s => s.section))];
  return sections.map(s => '<option value="' + e(s) + '" ' + (s === value ? 'selected' : '') + '>' + e(s) + '</option>').join('');
}
function undoButton() {
  return lastJudgement && lastJudgement.revision === state.revision
    ? btn('تراجع عن آخر تقييم', 'undo-judgement', 'secondary small') : '';
}
function performanceHTML(result) {
  const counts = performanceCounts(result);
  const labels = Object.entries(counts).map(([score, count]) => e(SCORES[score] || score) + (result.cards.length > 1 ? ' ' + ar(count) : ''));
  return '<span class="performance-rating">' + labels.join(' · ') + '</span>';
}
function sessionSummary() {
  const rows = sessionRows(state, currentSessionId);
  const completed = rows.filter(x => x.result).length;
  const anchor = rows.find(x => x.result || x.draft);
  const record = anchor?.result || anchor?.draft;
  return `${heading('نتائج الجلسة', record ? GRADE_NAMES[record.grade] + ' · الشعبة ' + e(record.sectionAtTest || '') + ' · ' + e(record.cards[0]?.lessonTitle || record.cards[0]?.skillTitle || '') : 'اختر جلسة من النتائج.', undoButton())}
  <div class="metrics"><div class="metric"><strong>${ar(completed)}</strong><small>تم تقييمهم</small></div><div class="metric"><strong>${ar(rows.length - completed)}</strong><small>بانتظار التقييم</small></div><div class="metric"><strong>${ar(rows.length)}</strong><small>طلاب الجلسة</small></div></div>
  <section class="panel session-sheet" id="session-sheet"><table><thead><tr><th>الطالب</th><th>تقدير الأداء</th><th>نسبة الإتقان</th><th>الإجراء</th></tr></thead><tbody>${rows.map(x => {
    const o = x.result ? overall(summarize(x.result.cards, x.result.answers, x.result.scoring), x.result.scoring) : null;
    return `<tr><td>${e(x.student.name)}</td><td>${x.result ? performanceHTML(x.result) : x.completedElsewhere ? 'اختُبر سابقًا' : x.draft?.deferred ? 'تم تجاوزه' : x.student.archived ? 'مؤرشف' : 'لم يُختبر'}</td><td>${o?.percent != null ? ar(o.percent) + '٪' : '—'}</td><td>${x.result ? btn('التقرير', 'student-report', 'small secondary', 'data-id="' + e(x.result.id) + '"') : x.draft && !x.student.archived && !x.completedElsewhere ? btn('استكمال', 'resume', 'small', 'data-id="' + e(x.draft.id) + '"') : !x.student.archived && !x.completedElsewhere ? btn('اختبار الطالب', 'session-start-student', 'small', 'data-id="' + e(x.student.id) + '"') : '—'}</td></tr>`;
  }).join('')}</tbody></table></section>
  <div class="row session-actions">${btn('العودة إلى صفي', 'nav', 'secondary', 'data-route="home"')}${rows.length ? btn('طباعة ملخص الجلسة', 'print-session', 'secondary') : ''}</div>
  <p class="muted">تقدير الأداء هو اختيار المعلم لكل بند. نسبة الإتقان هي نسبة البنود المجتازة؛ متفوق ومتقدم ومتمكن تُحسب اجتيازًا بالقيمة نفسها، وتظهر تفاصيلها مستقلة.</p>`;
}

let assessmentBusy = false;
let driveBusy = false,
  drivePreparing = false,
  driveFiles = [],
  driveNextPage = '',
  driveMessage = '',
  pendingDriveBackup = null;
const drive = createDriveStorage({
  clientId: GOOGLE_DRIVE_CLIENT_ID,
  onChange: () => refreshDrivePanel(),
});
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
    ['متقن', 'متفوق', 'متقدم', 'متمكن'].includes(label)
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
async function completeAssessment() {
  const result = {
    ...structuredClone(active),
    completedAt: new Date().toISOString(),
  };
  const view = {...state, results: [...state.results.filter(r => r.id !== result.id), result]};
  const next = nextSessionStudent(view, result);
  const nextTest = next ? studentDraft(result, next, view) : null;
  // Commit both transitions together: no lost result or unfinished handoff.
  await persist({
    ...state,
    results: [...state.results.filter((r) => r.id !== result.id), result],
    drafts: [
      ...state.drafts.filter((d) => d.id !== result.id && d.id !== nextTest?.id),
      ...(nextTest ? [nextTest] : []),
    ],
  });
  active = nextTest;
  cardIndex = active ? Math.max(0, active.cards.findIndex(c => !active.answers[c.id])) : 0;
  review = false;
  studentDisplay = false;
  closeModal();
  grade = result.grade;
  if (next) {
    studentId = next.id;
    route = 'assessment';
    render();
    toast('حُفظ تقييم الطالب؛ الآن ' + next.name);
  } else {
    currentSessionId = result.sessionId || '';
    nav(result.sessionId ? 'session' : 'students');
    toast('حُفظت النتائج؛ يمكنك استكمال الطلاب المتبقين من ملخص الجلسة.');
  }
}
function nav(name) {
  if (name === 'setup') { initializeSetup(); return; }
  route = name;
  query = '';
  if (name === 'results') resultFilters.section = section;
  rememberClassroom();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function shell(body) {
  const navs = [
    ['home', 'صفي', 'home'],
    ['setup', 'الاختبار', 'book'],
    ['students', 'إدارة الطلاب', 'students'],
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
  const roster = state.students.filter(s => s.grade === grade && !s.archived && (!section || s.section === section));
  const drafts = state.drafts.filter(d => d.grade === grade && recordInSection(d) && state.students.some(s => s.id === d.studentId && !s.archived) && (!d.sessionTemplate || pendingPlanCards(state, d.sessionTemplate, d.studentId).length));
  const recent = state.results.filter(r => r.grade === grade && recordInSection(r)).slice(-3).reverse();
  return `${heading('صفي', 'اختر الدرس مرة واحدة، ثم قيّم طلاب شعبتك بالتتابع.')}${gradeTabs()}
  <section class="classroom-banner"><div><span class="eyebrow">جلسة الحصة</span><h2>${GRADE_NAMES[grade]}</h2><p>اختبار قصير، حفظ تلقائي، وانتقال إلى الطالب التالي.</p></div><img src="./assets/learning-hero.webp" alt="" aria-hidden="true"></section>
  <div class="classroom-toolbar"><label>الشعبة<select id="section-filter"><option value="">اختر الشعبة</option>${sectionOptions()}</select></label><div class="row">${btn('ابدأ اختبارًا', 'start-session', '', roster.length && section ? '' : 'disabled')}${drafts.length ? btn('استكمل الجلسة', 'resume', 'secondary', 'data-id="' + e(drafts.at(-1).id) + '"') : ''}${btn('نتائج صفي', 'nav', 'secondary', 'data-route="results"')}</div></div>
  ${!section && roster.length ? '<p class="notice">اختر الشعبة ليبدأ اختبار طلابها بالترتيب.</p>' : ''}
  <div class="metrics"><div class="metric"><strong>${ar(roster.length)}</strong><small>طالب في النطاق</small></div><div class="metric"><strong>${ar(recent.length ? state.results.filter(r => r.grade === grade && recordInSection(r)).length : 0)}</strong><small>اختبار محفوظ</small></div><div class="metric"><strong>${ar(drafts.length)}</strong><small>اختبار للاستكمال</small></div></div>
  <div class="section-head"><h2>طلاب ${section ? 'الشعبة ' + e(section) : 'الصف'}</h2>${btn('إدارة الطلاب', 'nav', 'ghost small', 'data-route="students"')}</div>
  ${roster.length ? '<label class="classroom-search">البحث عن طالب<input id="student-search" type="search" placeholder="اكتب اسم الطالب" value="' + e(query) + '"></label><div id="student-list" class="student-list">' + studentRows(students()) + '</div>' : empty('أضف طلابك للبدء', 'استورد كشف Excel أو Word مرة واحدة، ثم ابدأ الحصة.', btn('استيراد كشف الطلاب', 'roster'))}
  ${drafts.length ? '<details class="panel secondary-details"><summary>الاختبارات المحفوظة للاستكمال</summary>' + drafts.map(d => '<div class="student-row"><strong>' + e(state.students.find(s => s.id === d.studentId)?.name || 'طالب') + '</strong>' + btn('استكمال', 'resume', 'small', 'data-id="' + e(d.id) + '"') + '</div>').join('') + '</details>' : ''}
  ${recent.length ? '<div class="section-head"><h2>آخر النتائج</h2></div>' + resultRows(recent) : ''}
  ${backupNotice()}`;
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
  return `${heading('إدارة الطلاب', 'استورد كشفك مرة واحدة، وعدّل أسماء الطلاب عند الحاجة.', btn(icon('add') + ' إضافة طالب', 'add-student'))}${gradeTabs()}<div class="row">${btn('استيراد Excel أو Word / لصق كشف', 'roster', 'secondary small')}${btn('الطلاب المؤرشفون', 'archives', 'ghost small')}</div><div class="filters"><label>البحث عن طالب<input id="student-search" type="search" placeholder="اكتب اسم الطالب" value="${e(query)}"></label><label>الشعبة<select id="section-filter"><option value="">جميع الشعب</option>${sections.map((s) => `<option ${section === s ? 'selected' : ''}>${e(s)}</option>`).join('')}</select></label></div><div class="student-list" id="student-list">${studentRows(list)}</div>`;
}
function studentRows(list) {
  return list.length
    ? list
        .map((s) => {
          const r = latestResult(state.results, s.id),
            o = r
              ? overall(summarize(r.cards, r.answers, r.scoring), r.scoring)
              : { percent: null, label: 'غير مختبر' };
          return `<div class="student-row"><div class="student-info"><div class="avatar">${e(s.name[0])}</div><div><strong>${e(s.name)}</strong><small>الشعبة ${e(s.section)}${s.guardian ? ' · ولي الأمر: ' + e(s.guardian) : ''}</small></div></div><div class="row student-actions">${r ? `<div class="last-test"><small>آخر اختبار · ${e([...new Set(r.cards.map((c) => c.skillTitle))].join('، '))}</small>${performanceHTML(r)}<small>نسبة الإتقان: ${o.percent == null ? '—' : ar(o.percent) + '٪'}</small></div>` : badge(o.label, o.percent)}${btn('بدء اختبار', 'assess-student', 'small', 'data-id="' + s.id + '"')}${btn(icon('settings'), 'edit-student', 'secondary small', 'data-id="' + s.id + '" aria-label="تعديل ' + e(s.name) + '"')}</div></div>`;
        })
        .join('')
    : empty(
        'لا يوجد طلاب في هذا النطاق',
        'استورد ملف Word أو Excel، أو أضف الأسماء يدويًا.',
        btn(icon('add') + ' إضافة طالب', 'add-student'),
      );
}
function availableSkills() {
  const skills = curriculum.skills.filter(s => s.grade === grade && (cumulative ? s.unit <= unit : s.semester === semester && s.unit === unit));
  return [...skills, ...readingLessonIds.flatMap(lessonAssessmentSkills)];
}
function selectedLessons() {
  return readingLessonsFor(grade, semester, unit).filter(l => readingLessonIds.includes(l.id));
}
function setLessonSelection(value) {
  const lessons = readingLessonsFor(grade, semester, unit);
  readingLessonIds = value === 'all' ? lessons.map(l => l.id) : lessons.filter(l => l.id === value).map(l => l.id);
  readingLessonId = readingLessonIds[0] || '';
  selected = new Set(readingLessonIds.flatMap(lessonAssessmentSkills).filter(s => s.readingLevel === 'single').map(s => s.id));
  customCards = null; domain = '';
}
function presetFilter(id, s) {
  if (id === 'single') return s.readingLevel === 'single';
  if (id === 'words') return readingLessonIds.length ? s.kind === 'lesson-reading' && s.readingLevel === 'words' : s.kind === 'reading';
  if (id === 'dictation') return s.kind === 'lesson-dictation';
  if (id === 'listening') return s.kind === 'lesson-listening';
  if (id === 'passages') return s.kind === 'lesson-reading' && s.readingLevel === 'passages';
  if (id === 'lesson') return s.kind === 'lesson-reading' && s.readingLevel !== 'single';
  if (id === 'writing') return ['copy','dictation'].includes(s.kind);
  if (id === 'comprehension') return ['listening','literal'].includes(s.kind);
  if (id === 'all') return s.readingLevel !== 'single';
  return grade === 1 ? s.kind === 'letter' : s.kind === 'reading' || /الشمسية|القمرية|تنوين|ه وت وة/.test(s.title);
}
function applyPreset(id) {
  if (id === 'custom') {setupAdvanced = true; render(); return;}
  selected = new Set(availableSkills().filter(s => presetFilter(id, s)).map(s => s.id));
  customCards = null; domain = ''; render();
}
function assessmentPlan() {
  const cards = availableSkills().filter(s => selected.has(s.id)).flatMap(questionsFor).flatMap(c => {
    if (c.lessonId || !readingLessonIds.length) return [c];
    return selectedLessons().map(l => ({...c, id: c.id + '-ctx-' + l.id, contextLessonId: l.id, lessonTitle: l.title}));
  });
  return {grade, semester, unit, cumulative, cards: applyListeningEdits(cards, customCards || {})};
}
function setupRoster(plan = assessmentPlan()) {
  return section ? eligibleRoster(state, plan, section) : [];
}
function studentDraft(reference, student, view = state) {
  const plan = reference.sessionTemplate;
  const previous = plan ? matchingDraft(view, plan, student.id) : view.drafts.find(d => reference.sessionId && d.sessionId === reference.sessionId && d.studentId === student.id) || null;
  const roster = view.students.filter(s => s.grade === reference.grade && s.section === student.section && !s.archived);
  const generated = plan ? instantiatePlan(view, plan, student.id, roster.findIndex(s => s.id === student.id)) : advanceSentenceRotation(reference);
  const allowed = plan ? new Set(pendingPlanCards(view, plan, student.id).map(c => c.id)) : null;
  const retained = previous?.cards.filter(c => !allowed || allowed.has(c.id));
  const selection = retained?.length ? {...previous, cards: retained} : generated;
  const cards = selection.cards;
  const answers = Object.fromEntries(Object.entries(previous?.answers || {}).filter(([id]) => cards.some(c => c.id === id)));
  return {...selection, id: previous?.id || uid(), sessionId: reference.sessionId, sessionTemplate: plan, studentId: student.id, sectionAtTest: student.section, grade: reference.grade, semester: reference.semester, unit: reference.unit, cumulative: reference.cumulative, rosterIds: reference.rosterIds, cards, answers, deferred: false, scoring: previous?.scoring || {...state.settings}, note: previous?.note || '', startedAt: previous?.startedAt || new Date().toISOString()};
}
function initializeSetup(sid = '') {
  const target = state.students.find(s => s.id === sid && !s.archived);
  if (target) {grade = target.grade; section = target.section;}
  const saved = classroomPreferences.setups[grade] || {};
  semester = [1, 2].includes(saved.semester) ? saved.semester : 1;
  const units = curriculum.units.filter(u => u.grade === grade && u.semester === semester);
  unit = units.some(u => u.unit === saved.unit) ? saved.unit : units[0].unit;
  const lessons = readingLessonsFor(grade, semester, unit);
  const ids = Array.isArray(saved.readingLessonIds) ? saved.readingLessonIds : [saved.readingLessonId];
  readingLessonIds = lessons.filter(l => ids.includes(l.id)).map(l => l.id);
  readingLessonId = readingLessonIds[0] || '';
  cumulative = saved.cumulative === true; domain = '';
  const list = availableSkills();
  selected = new Set(Array.isArray(saved.selected) ? saved.selected.filter(id => list.some(s => s.id === id)) : []);
  if (!selected.size && readingLessonIds.length) selected = new Set(list.filter(s => s.readingLevel === 'single').map(s => s.id));
  if (!selected.size) selected = new Set(list.filter(s => grade === 1 ? s.kind === 'letter' : s.kind === 'reading').map(s => s.id));
  if (!section) section = state.students.find(s => s.grade === grade && !s.archived)?.section || '';
  studentId = ''; customCards = null; setupAdvanced = false; route = 'setup'; render();
}
function setup() {
  const us = curriculum.units.filter(u => u.grade === grade && u.semester === semester);
  const all = availableSkills(), shown = all.filter(s => !domain || s.domain === domain), chosen = all.filter(s => selected.has(s.id));
  const lessons = readingLessonsFor(grade, semester, unit), lessonCount = readingLessonIds.length;
  const modes = lessonCount ? [['single','قراءة جمل متنوعة — جملة لكل طالب'],['words','قراءة كلمات من الدرس'],['dictation','الإملاء من كلمات الدرس'],['listening','الاستماع إلى نص الدرس'],['passages','قراءة مقطع من الدرس']] : [['core',grade === 1 ? 'حروف الوحدة' : 'القراءة والظواهر'],['words','قراءة كلمات'],['writing','الكتابة والإملاء'],['comprehension','الفهم والاستماع'],['all','اختبار شامل']];
  const matched = modes.find(([id]) => chosen.length && selected.size === all.filter(s => presetFilter(id,s)).length && all.filter(s => presetFilter(id,s)).every(s => selected.has(s.id)))?.[0] || 'custom';
  const plan = assessmentPlan(), pending = setupRoster(plan);
  const total = state.students.filter(s => !s.archived && s.grade === grade && s.section === section).length;
  const finished = total - pending.length;
  return `${heading('إعداد الاختبار', 'الصف والدرس، ثم المهارة، ثم الطلاب غير المختبرين.', btn('العودة إلى صفي', 'nav', 'secondary small', 'data-route="home"'))}
  <div class="setup"><section class="panel"><h2>١. اختر الصف والدرس</h2>${gradeTabs()}<div class="form-grid">
  <label>الشعبة<select id="setup-section"><option value="">اختر الشعبة</option>${sectionOptions()}</select></label>
  <label>الفصل الدراسي<select id="setup-semester">${[1,2].map(n => '<option value="' + n + '" ' + (semester === n ? 'selected' : '') + '>الفصل ' + (n === 1 ? 'الأول' : 'الثاني') + '</option>').join('')}</select></label>
  <label class="span2">الوحدة<select id="setup-unit">${us.map(u => '<option value="' + u.unit + '" ' + (unit === u.unit ? 'selected' : '') + '>' + ar(u.unit) + ' · ' + e(u.name) + '</option>').join('')}</select></label>
  ${lessons.length ? '<label class="span2">الدرس<select id="setup-lesson"><option value="">مهارات الوحدة دون درس محدد</option>' + lessons.map(l => '<option value="' + e(l.id) + '" ' + (readingLessonIds.length === 1 && readingLessonId === l.id ? 'selected' : '') + '>' + e(l.title) + '</option>').join('') + (lessons.length > 1 ? '<option value="all" ' + (readingLessonIds.length > 1 ? 'selected' : '') + '>درسا الوحدة معًا</option>' : '') + '</select></label>' : ''}
  </div><h2 class="step-heading">٢. اختر المهارة</h2><label>المهارة<select id="setup-skill">${modes.map(([id,label]) => '<option value="' + id + '" ' + (matched === id ? 'selected' : '') + '>' + e(label) + '</option>').join('')}<option value="custom" ${matched === 'custom' ? 'selected' : ''}>مهارات مخصصة</option></select></label>
  ${matched === 'single' ? '<p class="muted">جملة من ست كلمات لكل طالب من كل درس مختار، وتتغير الجمل بالتناوب.</p>' : ''}
  ${matched === 'listening' ? '<p class="muted">يقرأ المعلم نص الدرس أو يرفق تسجيلًا مطابقًا، ثم يسأل الطالب شفهيًا.</p>' : ''}
  <details class="setup-custom secondary-details" ${setupAdvanced ? 'open' : ''}><summary>تخصيص الاختبار والمهارات</summary>
  <label class="checkline"><input type="checkbox" id="setup-cumulative" ${cumulative ? 'checked' : ''}>اختبار تراكمي يشمل الوحدات السابقة</label>
  <div class="row preset-actions">${btn('الفهم والاستماع', 'preset-comprehension', 'secondary small')}${btn('الكتابة والإملاء', 'preset-writing', 'secondary small')}${lessonCount ? btn('مستويات قراءة الدرس', 'preset-lesson', 'secondary small') : ''}</div>
  <div class="row between"><h3>المهارات</h3><div class="checks-control">${btn('تحديد الظاهر', 'select-visible', 'ghost small')}${btn('إلغاء الكل', 'clear-selection', 'ghost small')}</div></div>
  <label>مجال المهارة<select id="setup-domain"><option value="">جميع المجالات</option>${DOMAINS.map(d => '<option ' + (domain === d ? 'selected' : '') + '>' + e(d) + '</option>').join('')}</select></label>
  <div class="skills-list">${shown.map(s => '<label class="skill-option"><input type="checkbox" data-skill="' + e(s.id) + '" ' + (selected.has(s.id) ? 'checked' : '') + '><span><strong>' + e(s.title) + '</strong><small>' + e(s.domain) + ' · ص ' + ar(s.source.page) + '</small></span></label>').join('')}</div></details></section>
  <aside class="panel setup-side"><h2>٣. الطلاب غير المختبرين</h2><div id="pending-roster-summary" role="status"><strong>${ar(pending.length)}</strong> طالبًا متبقيًا${chosen.length ? '<p class="muted">اختُبر ' + ar(finished) + ' طالبًا في الدرس والمهارة المحددين، ولن يتكرروا.</p>' : '<p>اختر المهارة لعرض الطلاب.</p>'}</div>
  ${pending.length && chosen.length ? '<p>يبدأ الاختبار بـ <strong>' + e(pending[0].name) + '</strong>، ثم بقية الأسماء بترتيب الكشف.</p><details class="pending-students"><summary>عرض الأسماء المتبقية</summary><ol>' + pending.map(s => '<li>' + e(s.name) + '</li>').join('') + '</ol></details>' : total && chosen.length ? '<div class="notice">جميع طلاب الشعبة اختُبروا في هذه المهارة والدرس. اختر مهارة أو درسًا آخر.</div>' : !total ? '<div class="notice">أضف طلاب الشعبة من إدارة الطلاب أولًا.</div>' : ''}
  ${btn('بدء الاختبار', 'start-assessment', '', chosen.length && pending.length && section ? '' : 'disabled')}
  ${btn('مراجعة عينات الاختبار', 'preview-cards', 'secondary', chosen.length ? '' : 'disabled')}
  <small>الطالب المتجاوز أو صاحب الاختبار غير المكتمل يبقى ضمن غير المختبرين. التقدير غير المجتاز يُعد محاولة مكتملة.</small></aside></div>`;
}
let customCards = null;

function chosenCards() {
  return chosenSelection().cards;
}
function chosenSelection() {
  const plan = assessmentPlan();
  const roster = state.students.filter(s => !s.archived && s.grade === grade && s.section === section);
  const first = setupRoster(plan)[0] || roster[0];
  return instantiatePlan(first && setupRoster(plan).length ? state : {...state, results: []}, plan, first?.id || '', roster.findIndex(s => s.id === first?.id));
}
function listeningPlayer(c) {
  const src = safeListeningAudio(c);
  return src
    ? `<audio id="listening-audio" controls preload="metadata" src="${e(src)}" data-delivery-key="${e(active.id + ':' + (c.passageId || c.id))}" aria-label="مقطع الاستماع"></audio>`
    : '';
}
function listeningPanel(c) {
  if (c.kind !== 'listening') return '';
  const src = safeListeningAudio(c);
  const count = active.listeningDelivery?.[c.passageId]?.count || 0;
  return `<section class="panel listening-panel"><h2>استمع ثم أجب · ${e(c.passageTitle)}</h2><p class="muted">${e(c.provenance)}</p><p>استمع الطالب إلى المقطع كاملًا: <strong>${ar(count)}</strong> مرة. وحّد عدد مرات الاستماع بين الطلاب؛ المقترح مرتان قبل الأسئلة.</p>${src ? listeningPlayer(c) : '<div class="notice warning">لم يُرفق تسجيل لهذا المقطع بعد. اقرأ النص من دليل المعلم، أو أرفق ملفًا صوتيًا مطابقًا له. لا يوجد توليد صوت أو رفع بيانات من التطبيق.</div>'}<div class="row">${btn('تسجيل قراءة كاملة بصوت المعلم', 'listening-read', 'secondary small')}${btn('إرفاق صوت مطابق للنص', 'listening-attach', 'secondary small')}</div><input id="listening-file" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm" hidden><small>الملف محلي ويحفظ مع الاختبار والنسخة الاحتياطية؛ حتى ٢ ميجابايت. تأكد من مطابقته للنص قبل إرفاقه. تعديل النص يلغي الصوت وأحكام أسئلته.</small></section>`;
}
function assessment() {
  const student = state.students.find((s) => s.id === active.studentId);
  if (review) {
    const summaries = summarize(active.cards, active.answers, active.scoring),
      remaining = active.cards.filter((c) => !active.answers[c.id]).length;
    return `${heading('مراجعة الاختبار', e(student?.name || ''), btn('العودة للبطاقات', 'review-back', 'secondary'))}<section class="panel"><div class="notice">${remaining ? `بقيت ${ar(remaining)} بطاقات بلا حكم. عند الحفظ ستظل غير مقيمة.` : 'اكتملت أحكام جميع البطاقات.'} النتائج مبنية على الأداء المستقل.</div><div class="finish-summary">${summaries.map((s) => `<div class="summary-row"><span>${e(s.title)}</span><span>${badge(s.label, s.percent, s.limited)}</span></div>`).join('')}</div><label>ملاحظة عامة<textarea id="final-note" placeholder="توصية تدريبية أو ملاحظة للمتابعة">${e(active.note || '')}</textarea></label><div class="row" style="margin-top:20px">${btn(icon('check') + ' حفظ نتيجة الاختبار', 'finish')}${btn('حفظ واستكمال لاحقًا', 'pause', 'secondary')}</div></section>`;
  }
  const session = active.sessionId ? sessionRows(state, active.sessionId) : [];
  const completedCount = session.filter(x => x.result).length;
  const sessionProgress = session.length ? '<div class="session-progress">تم تقييم ' + ar(completedCount) + ' من ' + ar(session.length) + ' · الشعبة ' + e(active.sectionAtTest || '') + '</div>' : '';
  const c = active.cards[cardIndex],
    answer = active.answers[c.id],
    pct = Math.round((100 * (cardIndex + 1)) / active.cards.length);
  if (studentDisplay && c.kind === 'listening')
    return `<section class="student-display"><div class="row between"><small>مهارة الاستماع</small>${btn('العودة للمعلم', 'student-display', 'secondary small')}</div><div class="prompt-card"><div class="stimulus">استمع جيدًا، ثم أجب شفهيًا.</div><p>استمع إلى المقطع، ثم أجب عن أسئلة المعلم.</p>${listeningPlayer(c) || '<p>يقرأ المعلم النص بصوته.</p>'}</div></section>`;
  if (studentDisplay)
    return `<section class="student-display"><div class="row between"><small>البطاقة ${ar(cardIndex + 1)} من ${ar(active.cards.length)}</small>${btn('العودة للمعلم', 'student-display', 'secondary small')}</div><div class="prompt-card"><p class="instruction">${e(c.instruction)}</p><div class="stimulus ${c.display.length > 45 ? 'long' : ''}" style="--stimulus-size:${state.settings.fontSize}px">${e(c.display)}</div></div></section>`;
  return `<section class="assessment-body"><div class="assessment-head"><div><h1>${e(student?.name || 'الطالب')}</h1>${sessionProgress}<p>${GRADE_NAMES[active.grade]} · الفصل ${ar(active.semester)} · ${e(c.domain)}</p></div><div class="row">${btn('عرض الطالب', 'student-display', 'secondary small')}${btn('تجاوز الطالب', 'skip-student', 'secondary small')}${btn('حفظ واستكمال لاحقًا', 'pause', 'secondary small')}${btn('إنهاء الجلسة', 'end-session', 'secondary small')}${undoButton()}</div></div><div class="row between"><span class="badge blue">${e(c.skillTitle)}${c.facet ? ' · ' + e(c.facet) : ''}</span><small>البطاقة ${ar(cardIndex + 1)} من ${ar(active.cards.length)}</small></div><div class="progress"><i style="width:${pct}%"></i></div><div class="prompt-card"><small>المهمة</small><p class="instruction">${e(c.instruction)}</p><div class="stimulus ${c.display.length > 45 ? 'long' : ''}" style="--stimulus-size:${state.settings.fontSize}px">${e(c.display)}</div></div><div class="grading">${['excellent', 'advanced', 'proficient', 'incorrect'].map((k, i) => `<button class="score-btn ${answer?.score === k ? 'selected' : ''}" data-action="score" data-score="${k}" aria-label="${SCORES[k]}" aria-keyshortcuts="${i + 1}" aria-pressed="${answer?.score === k}">${i + 1} · ${SCORES[k]}</button>`).join('')}</div><small class="grading-help">١ متفوق · ٢ متقدم · ٣ متمكن · ٤ غير مجتاز — تُحفظ النتيجة تلقائيًا.</small><details class="assessment-options"><summary>خيارات التقييم والملاحظات</summary><div class="row between"><div class="row">${['assisted', 'not_assessed', 'not_taught'].map((k) => btn(SCORES[k], 'score', 'ghost small', 'data-score="' + k + '" aria-pressed="' + (answer?.score === k) + '"')).join('')}</div><div class="font-controls"><label for="font-size">حجم العرض</label><input id="font-size" type="range" min="36" max="120" value="${state.settings.fontSize}"></div></div><details class="teacher-hint"><summary>دليل المعلم والإجابة المتوقعة</summary>${c.teacherText ? `<p class="teacher-text">${e(c.teacherText)}</p>` : ''}<p>${e(c.expected)}</p><small>طبعة ${e(c.source.edition)} · ${c.lessonId ? e(c.provenance || readingCardSourceLabel(c)) : 'دليل الوحدة ص ' + ar(c.source.page) + ' · العينة من إعداد المساعد'}</small>${btn('تعديل هذه البطاقة', 'edit-active-card', 'ghost small')}</details><label class="assessment-note">ملاحظة على هذه البطاقة<textarea id="answer-note" placeholder="اختياري">${e(answer?.note || '')}</textarea></label></details><div class="assessment-tools">${btn(icon('back') + ' السابقة', 'previous', 'secondary', cardIndex === 0 ? 'disabled' : '')}${btn('مراجعة الاختبار', 'review', 'ghost')}${btn(cardIndex === active.cards.length - 1 ? 'مراجعة وحفظ' : 'التالية ' + icon('arrow'), 'next')}</div></section>`;
}
function resultRows(rs) {
  return `<div class="results-list">${rs
    .map((r) => {
      const s = state.students.find((x) => x.id === r.studentId),
        o = overall(summarize(r.cards, r.answers, r.scoring), r.scoring);
      return `<div class="result-row"><div><strong>${e(s?.name || 'طالب مؤرشف')}</strong><small>${GRADE_NAMES[r.grade]} · الفصل الدراسي ${ar(r.semester)} · ${date(r.completedAt)}</small></div><div class="row">${performanceHTML(r)}<small>نسبة الإتقان: ${o.percent == null ? '—' : ar(o.percent) + '٪'}</small>${btn(icon('print') + ' التقرير', 'student-report', 'small secondary', 'data-id="' + r.id + '"')}</div></div>`;
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
  return `<div class="filters result-filters"><label>اسم الطالب<input id="result-query" type="search" value="${e(resultFilters.query)}"></label><label>الفصل الدراسي<select id="result-semester"><option value="">الفصلان</option>${[1, 2].map((n) => `<option value="${n}" ${String(n) === resultFilters.semester ? 'selected' : ''}>الفصل ${ar(n)}</option>`).join('')}</select></label><label>الشعبة<select id="result-section"><option value="">جميع الشعب</option>${sections.map((x) => `<option ${x === resultFilters.section ? 'selected' : ''}>${e(x)}</option>`).join('')}</select></label><label>من تاريخ<input id="result-from" type="date" value="${e(resultFilters.from)}"></label><label>إلى تاريخ<input id="result-to" type="date" value="${e(resultFilters.to)}"></label></div>`;
}
function resultsView() {
  const rs = filteredResults();
  const sessions = [...new Set([...state.results, ...state.drafts].filter(r => r.grade === grade && recordInSection(r)).map(r => r.sessionId).filter(Boolean))].reverse();
  const sessionList = sessions.slice(0, 10).map(id => {
    const rows = sessionRows(state, id);
    const anchor = rows.find(x => x.result || x.draft);
    const record = anchor?.result || anchor?.draft;
    return '<div class="student-row"><div><strong>' + e(record?.cards[0]?.lessonTitle || record?.cards[0]?.skillTitle || 'جلسة اختبار') + '</strong><small> · الشعبة ' + e(record?.sectionAtTest || '') + ' · ' + (record ? date(record.startedAt) : '') + '</small><p class="muted">' + ar(rows.filter(x => x.result).length) + ' من ' + ar(rows.length) + ' طالبًا</p></div>' + btn('فتح الجلسة', 'open-session', 'small', 'data-id="' + e(id) + '"') + '</div>';
  }).join('');
  return `${heading('نتائج التشخيص', 'ابحث عن الطالب وحدد نطاق الاختبارات.', btn(icon('print') + ' تقرير الصف', 'class-report', 'secondary'))}${gradeTabs()}${sessionList ? '<section class="panel"><h2>جلسات الصف</h2>' + sessionList + '</section>' : ''}<details class="secondary-details result-filter-details" ${resultFiltersOpen ? 'open' : ''}><summary>تصفية النتائج</summary>${resultFilterHTML()}</details><div id="filtered-results">${rs.length ? resultRows(rs) : empty('لا توجد نتائج في هذا النطاق', 'غيّر المرشحات أو ابدأ اختبارًا جديدًا.')}</div>`;
}
function backupNotice() {
  if (!state.students.length && !state.results.length) return '';
  const last = state.settings.lastBackupAt;
  if (last && Date.now() - Date.parse(last) < 7 * 86400000) return '';
  return `<div class="notice warning backup-reminder">${last ? 'مر أسبوع على آخر تصدير للنسخة الاحتياطية.' : 'لم تُصدّر نسخة احتياطية من هذا الجهاز بعد.'} ${btn('تصدير نسخة', 'backup', 'secondary small')}</div>`;
}

function drivePanelBody() {
  const status = drive.status();
  const disabled = driveBusy || status.connecting ? 'disabled' : '';
  const supported =
    location.protocol === 'https:' || location.hostname === 'localhost';
  return `<h2>الحفظ في Google Drive</h2><p>احفظ نسخة من الطلاب والنتائج والمسودات والإعدادات في مساحة خاصة بالمساعد داخل حساب Google الذي تختاره. تستعيدها على جهاز آخر عند الحاجة؛ الحفظ المحلي مستمر.</p><p class="muted">هذا حفظ واستعادة للنسخ، ولا يدمج تغييرات الأجهزة تلقائيًا. لا يرفع التطبيق بياناتك حتى تضغط حفظ نسخة.</p>
    ${!supported ? '<div class="notice">الربط متاح من رابط الويب الآمن. نسخة الكمبيوتر المحلية تواصل الحفظ والتصدير على الجهاز.</div>' : !status.configured ? '<div class="notice">لم يُفعّل ربط Google Drive لهذا الإصدار بعد. تظل بياناتك محفوظة محليًا ويمكن تصدير نسخة.</div>' : `<div class="row">${status.connected ? `${btn('حفظ نسخة على Google Drive', 'drive-save', 'secondary small', disabled)}${btn('عرض النسخ المحفوظة', 'drive-list', 'secondary small', disabled)}${btn('إنهاء جلسة Google', 'drive-disconnect', 'ghost small', disabled)}` : btn(status.connecting ? 'أكمل نافذة Google…' : status.ready ? 'ربط Google Drive' : 'تجهيز تسجيل دخول Google', 'drive-connect', 'secondary small', disabled)}</div>`}
    <p>آخر حفظ ناجح على درايف: ${state.settings.lastDriveBackupAt ? date(state.settings.lastDriveBackupAt) : 'لم يُحفظ بعد'}</p>
    <p role="status">${driveBusy ? 'جارٍ تنفيذ العملية…' : e(driveMessage)}</p>
    ${status.connected && driveFiles.length ? `<h3>النسخ المحفوظة</h3><ul class="drive-backups">${driveFiles.map((file) => `<li><span>${e(file.name)} · ${e(file.createdTime ? date(file.createdTime) : '')}</span>${btn('معاينة الاستعادة', 'drive-read', 'ghost small', `data-id="${e(file.id)}" ${disabled}`)}</li>`).join('')}</ul>` : ''}
    ${status.connected && driveNextPage ? btn('عرض نسخ أقدم', 'drive-more', 'ghost small', disabled) : ''}
    <small>تنتهي جلسة Google عند إغلاق الصفحة أو انتهاء صلاحيتها؛ أعد الربط عند الطلب. ملفاتك تبقى في درايف.</small>`;
}
function refreshDrivePanel() {
  const panel = document.querySelector('#drive-panel');
  if (panel && state) panel.innerHTML = drivePanelBody();
}
function mountDrivePanel() {
  const parent = app.querySelector('.settings-grid > div:last-child');
  if (!parent) return;
  parent.insertAdjacentHTML(
    'afterbegin',
    '<section class="panel" id="drive-panel"></section>',
  );
  refreshDrivePanel();
}
async function driveOperation(operation) {
  if (driveBusy) return;
  driveBusy = true;
  driveMessage = '';
  refreshDrivePanel();
  try {
    await operation();
  } catch (error) {
    driveMessage = error.message;
    toast(error.message);
  } finally {
    driveBusy = false;
    refreshDrivePanel();
  }
}
async function loadDriveBackups(append = false) {
  const page = await drive.listBackups(append ? driveNextPage : '');
  driveFiles = append ? [...driveFiles, ...page.files] : page.files;
  driveNextPage = page.nextPageToken;
  if (!driveFiles.length)
    driveMessage = 'لا توجد نسخ للمساعد في حساب Google المختار بعد.';
}
function settingsView() {
  const s = state.settings;
  return `${heading('إعدادات المساعد', 'بيانات المدرسة والتقييم والنسخ الاحتياطي.')}
 <div class="settings-grid"><form id="settings-form" class="panel"><h2>المدرسة والتقارير</h2><div class="form-grid"><label class="span2">اسم المدرسة<input name="school" value="${e(s.school)}" maxlength="150"></label><label>اسم المعلم<input name="teacher" value="${e(s.teacher)}" maxlength="150"></label><label>اسم المدير<input name="principal" value="${e(s.principal)}" maxlength="150"></label><label class="span2">اسم الموقّع أسفل التقرير<input name="signature" value="${e(s.signature)}" placeholder="يترك مكان التوقيع اليدوي أسفل التقرير" maxlength="150"></label></div><div class="divider"></div><details class="secondary-details"><summary>إعدادات التقييم المتقدمة</summary><h2>حدود تصنيف نسبة الإتقان</h2><div class="form-grid"><label>متقن من نسبة<input name="mastery" type="number" min="1" max="100" required value="${s.mastery}"></label><label>متوسط من نسبة<input name="medium" type="number" min="0" max="99" required value="${s.medium}"></label><label>الحد الأدنى للعينات<input name="minSamples" type="number" min="1" max="50" step="1" required value="${s.minSamples}"></label><label>حجم بطاقة القراءة<input name="fontSize" type="number" min="36" max="120" required value="${s.fontSize}"></label></div><div class="notice">حدود تشخيصية مقترحة وليست لائحة تقويم رسمية. يحتفظ كل اختبار بالحدود التي أُجري بها.</div></details><button class="btn" type="submit">حفظ الإعدادات</button></form><div><section class="panel"><h2>نسخة تحفظ عملك</h2><p id="last-backup">آخر تصدير: ${s.lastBackupAt ? date(s.lastBackupAt) : 'لم يُصدّر بعد'}</p><p class="muted">الطلاب والنتائج على هذا المتصفح والجهاز. صدّر نسخة احتياطية بانتظام، وانقلها لجهازك الآخر عند الحاجة.</p><div class="row" style="margin-top:18px">${btn(icon('download') + ' تصدير نسخة', 'backup', 'secondary')}${btn(icon('restore') + ' استعادة نسخة', 'restore', 'secondary')}</div><input type="file" id="restore-file" accept=".json,application/json" hidden><div class="notice">الاستعادة تدمج السجلات وتحتفظ بالبيانات الموجودة. لا تُرفع النسخة إلى خادم.</div>${btn('طلب حفظ دائم على الجهاز', 'persist-storage', 'ghost small')}</section><section class="panel"><h2>عن التطبيق</h2><p>المساعد · مساعد المعلم</p><p class="muted">لغتي للصفوف الأولية · الإصدار ${VERSION}</p><p class="muted">${ar(curriculum.units.length)} وحدة · ${ar(curriculum.skills.length)} بند مهارة مع فروع القراءة والكتابة.</p><small>المصدر: كتب لغتي المرفوعة بطبعة ١٤٤٨. قراءة دروس الصف الثاني تستخدم مقتطفات من الدرس المحدد، والمهارات العامة تستخدم أمثلة المساعد. يمكن مراجعة العينات وتعديلها قبل الاختبار.</small></section></div></div>`;
}
function render() {
  const existingFilters = app.querySelector('.result-filter-details');
  if (existingFilters) resultFiltersOpen = existingFilters.open;
  if (route === 'setup') rememberClassroom();
  const oldAudio = app.querySelector('#listening-audio');
  const wasPlaying = oldAudio && !oldAudio.paused && !oldAudio.ended;
  // Reuse the same player when changing views/questions for the same passage.
  oldAudio?.remove();
  if (studentDisplay && active && !review) {
    app.innerHTML = assessment();
  } else
    app.innerHTML = shell(
      route === 'session'
        ? sessionSummary()
        : route === 'home'
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
  if (route === 'settings') mountDrivePanel();
  if (route === 'assessment' && active && !review) {
    const c = active.cards[cardIndex];
    app
      .querySelector('.assessment-body')
      ?.classList.toggle('listening-assessment', c.kind === 'listening');
    if (!studentDisplay)
      app
        .querySelector('.grading')
        ?.insertAdjacentHTML('beforebegin', listeningPanel(c));
    let audio = app.querySelector('#listening-audio');
    if (
      oldAudio &&
      audio &&
      oldAudio.dataset.deliveryKey === audio.dataset.deliveryKey &&
      oldAudio.getAttribute('src') === audio.getAttribute('src')
    ) {
      audio.replaceWith(oldAudio);
      audio = oldAudio;
      if (wasPlaying)
        audio.play().catch(() => toast('اضغط تشغيل لمتابعة المقطع.'));
    }
    if (audio !== oldAudio) oldAudio?.pause();
    if (audio)
      audio.onended = async () => {
        try {
          await recordListeningDelivery(c, 'recording');
        } catch (error) {
          toast(error.message);
        }
      };
    if (audio)
      audio.onerror = () => {
        toast(
          'تعذر تشغيل الملف. جرّب MP3 أو اقرأ النص بصوتك؛ لم تُسجّل قراءة مكتملة.',
        );
      };
  } else oldAudio?.pause();
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
    `<form id="student-form"><input type="hidden" name="id" value="${s?.id || ''}"><div class="form-grid"><label class="span2">اسم الطالب<input name="name" required maxlength="150" value="${e(s?.name || '')}" autocomplete="off"></label><label>الصف<select name="grade">${GRADES.map((g) => `<option value="${g}" ${(s?.grade || grade) === g ? 'selected' : ''}>${GRADE_NAMES[g]}</option>`).join('')}</select></label><label>الشعبة<input name="section" required maxlength="50" value="${e(s?.section || 'أ')}"></label><label class="span2">اسم ولي الأمر<input name="guardian" maxlength="150" value="${e(s?.guardian || '')}"></label></div><div class="modal-actions">${s ? btn('أرشفة الطالب', 'archive', 'danger', 'data-id="' + s.id + '"') : ''}<button type="submit" class="btn">حفظ الطالب</button></div><p class="error" id="form-error" role="alert"></p></form>`,
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
    <label>الصف المستهدف<select id="roster-grade">${[1, 2, 3].map((g) => `<option value="${g}" ${grade === g ? 'selected' : ''}>${GRADE_NAMES[g]}</option>`).join('')}</select></label>
    <label>الشعبة<input name="section" value="أ" maxlength="50" required></label>
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
  return importedRoster.sheets.flatMap((sheet, i) =>
    importedRoster.included.has(i)
      ? rosterFromRows(
          sheet.rows,
          importedRoster.mappings[i],
          grade,
          dialogs.querySelector('[name="section"]').value,
        )
      : [],
  );
}
function renderRosterPreview() {
  const out = dialogs.querySelector('#roster-preview');
  if (!out || !importedRoster) return;
  const { sheets, sheet } = importedRoster;
  const mapping = importedRoster.mappings[sheet];
  const rows = sheets[sheet].rows;
  const width = rows.reduce((width, row) => Math.max(width, row.length), 0);
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
  const detected = inferRosterColumns(rows).nameColumns || [];
  out.innerHTML = `<div class="form-grid" style="margin-top:18px">
    <label>ورقة Excel أو جدول Word<select id="roster-sheet">${sheets.map((x, i) => `<option value="${i}" ${i === sheet ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label>
    <label>عمود اسم الطالب<select id="roster-name-column">${options(mapping.nameColumn)}</select></label>
    <label>عمود ولي الأمر${(mapping.nameColumns?.length || 0) > 1 ? ' (يُحدّد تلقائيًا لكل عمود أسماء)' : ''}<select id="roster-guardian-column" ${(mapping.nameColumns?.length || 0) > 1 ? 'disabled' : ''}><option value="-1">غير موجود</option>${options(mapping.guardianColumn)}</select></label>
    <label>تجاوز أسطر العنوان<input id="roster-start-row" type="number" min="0" max="${rows.length}" value="${mapping.startRow}"></label></div>
    <fieldset><legend>الجداول والأوراق التي سيُستورد منها الطلاب</legend>${sheets.map((x, i) => `<label class="checkline"><input type="checkbox" data-roster-sheet-include="${i}" ${importedRoster.included.has(i) ? 'checked' : ''}>${e(x.name)} · ${ar(rosterFromRows(x.rows, importedRoster.mappings[i], grade, 'أ').length)} اسم</label>`).join('')}</fieldset>
    ${detected.length > 1 ? `<fieldset><legend>أعمدة الأسماء في الجدول المعروض</legend>${detected.map((col) => `<label class="checkline"><input type="checkbox" data-roster-name-include="${col}" ${(mapping.nameColumns || [mapping.nameColumn]).includes(col) ? 'checked' : ''}>عمود ${ar(col + 1)}</label>`).join('')}</fieldset>` : ''}
    <div class="notice">معاينة ${ar(candidates.length)} اسم من ${ar(importedRoster.included.size)} جدول/ورقة محددة. جميع الأسماء ظاهرة في القائمة التالية. الوجهة: ${GRADE_NAMES[grade]}.</div><div class="notice">معاينة ${ar(rosterFromRows(rows, mapping, grade, 'أ').length)} اسم صالح في الجدول المعروض. لا تُضاف العناوين والصفوف الفارغة وبيانات المعلم. جميع الأسماء متاحة للمراجعة والتعديل في الخطوة التالية. اختر الأعمدة إن لم تظهر الأسماء الصحيحة.</div>
    <div style="max-height:360px;overflow:auto"><table class="roster-table"><thead><tr><th>اسم الطالب</th><th>ولي الأمر</th></tr></thead><tbody>${candidates
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
    `<p class="muted" style="margin-bottom:15px">عدّل النص والمهمة والإجابة لتناسب ما درّسته. عند تغيير النص المسموع أو الإملائي حدّث الإجابة المتوقعة أيضًا. تعديل البطاقة يخص هذا الاختبار.</p><div class="preview-list">${cards.map((c) => `<div class="preview-card"><strong>${e(c.skillTitle)}</strong>${c.kind === 'lesson-reading' ? `<small>${e(readingCardSourceLabel(c))}</small>` : ''}<p>${e(c.instruction)}</p><label>نص البطاقة<textarea data-card-edit="${c.id}">${e(c.display)}</textarea></label><label>المهمة<input data-card-instruction="${c.id}" value="${e(c.instruction)}"></label>${c.teacherText ? `<label>النص المسموع أو الإملائي للمعلم<textarea data-card-teacher="${c.id}">${e(c.teacherText)}</textarea></label>` : ''}<label>الإجابة المتوقعة ومعيار الحكم<textarea data-card-expected="${c.id}">${e(c.expected)}</textarea></label></div>`).join('')}</div>`,
    { wide: true, actions: btn('حفظ تعديلات العينات', 'save-preview') },
  );
}
function studentReportHTML(r) {
  const s = state.students.find((s) => s.id === r.studentId),
    summary = summarize(r.cards, r.answers, r.scoring);
  return `<article class="report-sheet" id="report"><header class="report-title"><p>المملكة العربية السعودية · وزارة التعليم</p><p>${e(state.settings.school || 'المدرسة')}</p><h2>تقرير اختبار لغتي التشخيصي</h2></header><div class="report-meta"><p><strong>الطالب:</strong> ${e(s?.name || '')}</p><p><strong>الصف وقت الاختبار:</strong> ${GRADE_NAMES[r.grade]}</p><p><strong>الفصل الدراسي:</strong> ${ar(r.semester)}</p><p><strong>تاريخ الاختبار:</strong> ${date(r.completedAt)}</p>${r.cards.some((c) => c.lessonTitle) ? `<p><strong>الدرس القرائي:</strong> ${e([...new Set(r.cards.filter((c) => c.lessonTitle).map((c) => c.lessonTitle))].join('، '))}</p>` : ''}${s?.guardian ? '<p><strong>ولي الأمر:</strong> ' + e(s.guardian) + '</p>' : ''}<p><strong>المعلم:</strong> ${e(state.settings.teacher)}</p></div><table><thead><tr><th>المهارة</th><th>نسبة الإتقان</th><th>التصنيف</th><th>ملاحظة</th></tr></thead><tbody>${summary.map((x) => `<tr><td>${e(x.title)}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${e(x.label)}</td><td>${x.limited ? 'عينة محدودة تحتاج تحققًا' : ''}</td></tr>`).join('')}</tbody></table>${detailedReportHTML(r)}${r.note ? '<p class="report-note"><strong>ملاحظة المعلم:</strong> ' + e(r.note) + '</p>' : ''}<p class="report-note">نسبة الإتقان تعتمد على الإجابات الصحيحة المستقلة. المهارات غير المختبرة أو غير المدرّسة لا تُحسب ضعفًا.</p><footer class="report-foot"><p>المعلم: ${e(state.settings.signature || state.settings.teacher)}<br>التوقيع: __________________</p><p>مدير المدرسة: ${e(state.settings.principal)}<br>التوقيع: __________________</p></footer></article>`;
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
  )}</select></label><label>الشعبة<select id="report-section"><option value="">جميع الشعب</option>${options(
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
  return `<article class="report-sheet" id="report"><header class="report-title"><p>وزارة التعليم · ${e(state.settings.school || 'المدرسة')}</p><h2>تقرير الصف في لغتي</h2><p>${GRADE_NAMES[grade]} · ${date(new Date().toISOString())}</p><p>${reportScope.test ? 'نفس عينات الاختبار' : reportScope.skill ? 'مهارة محددة' : 'آخر اختبار لكل طالب'}</p></header><table><thead><tr><th>الطالب</th><th>الشعبة</th><th>نطاق الاختبار</th><th>البنود المقيمة</th><th>نسبة الإتقان</th><th>الحالة</th><th>آخر اختبار</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${e(x.student.name)}</td><td>${e(x.student.section)}</td><td>${e(x.scope)}</td><td>${x.result ? ar(x.attempted) + ' من ' + ar(x.total) : '—'}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${e(x.label)}${x.limited ? ' · عينة محدودة' : ''}</td><td>${x.result ? date(x.result.completedAt) : '—'}</td></tr>`).join('') || '<tr><td colspan="7">لا يوجد طلاب في هذا النطاق.</td></tr>'}</tbody></table><p class="report-note">${reportScope.test ? 'يشمل النتائج ذات البطاقات ومعايير التصنيف المطابقة للاختبار المختار.' : 'حدد نفس عينات الاختبار للمقارنة الموحدة؛ قد تختلف مهارات وعينات آخر اختبار بين الطلاب.'} غير المختبر لا يُحسب ضعيفًا. راجع عدد البنود المقيمة؛ اختلافه يعني أن الاختبار غير مكتمل للمقارنة. ${reportScope.from || reportScope.to ? 'نطاق التاريخ: ' + e(reportScope.from || 'البداية') + ' إلى ' + e(reportScope.to || 'اليوم') : ''}</p><footer class="report-foot"><p>المعلم: ${e(state.settings.teacher)}</p><p>التوقيع: __________________</p></footer></article>`;
}
function trainingPlanHTML(r) {
  const plan = trainingPlan(r);
  if (!plan.length) return '';
  return `<section class="training-plan"><h3>خطة تدريب مقترحة</h3><p>٥ دقائق يوميًا لمدة أسبوع. عدّل الأنشطة بحسب حاجة الطالب؛ البنود غير المقيمة وغير المدرّسة لا تدخل الخطة.</p><table><thead><tr><th>المهارة المستهدفة</th><th>النشاط</th><th>عينة للتدريب</th><th>التحقق بعد التدريب</th></tr></thead><tbody>${plan.map((x) => `<tr><td>${e(x.title)}</td><td>${e(x.activity)}</td><td>${e(x.sample)}</td><td>${e(x.check)}</td></tr>`).join('')}</tbody></table><p>موعد مقترح لإعادة القياس: ${date(new Date(new Date(r.completedAt).getTime() + 7 * 86400000).toISOString())}. استخدم عينات جديدة للتحقق من انتقال التعلم؛ مقارنة النسب في التطبيق تتطلب نفس العينات والشروط.</p></section>`;
}
function detailedReportHTML(r) {
  const failures = r.cards.filter((c) =>
    ['incorrect', 'assisted'].includes(r.answers[c.id]?.score),
  );
  const facets = facetSummary(r);
  const progress = skillProgress(r, state.results);
  return `${facets.length ? `<h3>تفصيل الظواهر</h3><table><thead><tr><th>الفرع</th><th>نسبة الإتقان</th><th>ملاحظة</th></tr></thead><tbody>${facets.map((x) => `<tr><td>${e(x.title)}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${x.limited ? 'عينة محدودة تحتاج تحققًا' : ''}</td></tr>`).join('')}</tbody></table>` : ''}<h3>تقديرات بنود الاختبار</h3><table><thead><tr><th>المهمة</th><th>التقدير</th></tr></thead><tbody>${r.cards.map((c) => `<tr><td>${e(c.display)}</td><td>${e(SCORES[r.answers[c.id]?.score] || SCORES.not_assessed)}</td></tr>`).join('')}</tbody></table><h3>بنود تحتاج تدريبًا</h3>${failures.length ? `<table class="item-details"><thead><tr><th>المهارة والعينة</th><th>المهمة ومعيار الحكم</th><th>الحكم</th><th>ملاحظة المعلم</th></tr></thead><tbody>${failures.map((c) => `<tr><td>${e(c.skillTitle)}${c.facet ? ' · ' + e(c.facet) : ''}<br>${e(c.teacherText || c.display)}</td><td>${e(c.instruction)}<br><small>${e(c.expected)}</small></td><td>${e(SCORES[r.answers[c.id].score])}</td><td>${e(r.answers[c.id].note || '')}</td></tr>`).join('')}</tbody></table>` : '<p>لم تسجل إجابات خاطئة أو بمساعدة في البنود المقيمة.</p>'}${trainingPlanHTML(r)}<h3>متابعة نفس المهارة والعينات</h3><table><thead><tr><th>المهارة</th><th>السابقة</th><th>الحالية</th><th>التغير</th></tr></thead><tbody>${progress.map((x) => `<tr><td>${e(x.title)}</td><td>${x.previousPercent === null ? 'لا توجد نتيجة مطابقة' : ar(x.previousPercent) + '٪ · ' + date(x.previousAt)}</td><td>${x.percent === null ? '—' : ar(x.percent) + '٪'}</td><td>${x.delta === null ? '—' : (x.delta > 0 ? '+' : '') + ar(x.delta) + ' نقطة مئوية'}</td></tr>`).join('')}</tbody></table><p class="report-note">تُحسب المقارنة فقط عند تطابق العينات والمهمات والمعايير والبنود المقيمة. اختلاف العينات يحتاج قراءة النتائج كلٌّ على حدة.</p>`;
}

function reportModal(html, kind, id = '') {
  const result =
    kind === 'student' ? state.results.find((r) => r.id === id) : null;
  const next = result ? nextSessionStudent(state, result) : null;
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
  const openCustomization = app.querySelector('.setup-custom')?.open;
  if (route === 'setup' && openCustomization != null) setupAdvanced = openCustomization;
  if (busy || assessmentBusy || (a === 'score' && event.detail > 1)) return;
  const assessmentMutation = [
    'score',
    'skip-student',
    'next-student',
    'finish',
    'undo-judgement',
    'end-session',
  ].includes(a);
  if (assessmentMutation) assessmentBusy = true;
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
      chooseGrade(Number(t.dataset.grade));
      if (route === 'setup') initializeSetup(); else render();
    } else if (a === 'open-grade') {
      chooseGrade(Number(t.dataset.grade));
      nav('home');
    } else if (a === 'start-session') {
      if (!section) throw Error('اختر الشعبة أولًا.');
      initializeSetup();
    } else if (a === 'session-start-student') {
      const rows = sessionRows(state, currentSessionId);
      const target = rows.find(x => x.student.id === t.dataset.id && !x.student.archived && !x.result && !x.completedElsewhere);
      if (!target) throw Error('الطالب غير متاح في هذه الجلسة.');
      const anchor = rows.map(x => x.result || x.draft).find(Boolean);
      active = studentDraft({...anchor, sessionId: currentSessionId}, target.student);
      await saveDraft();
      grade = active.grade; section = active.sectionAtTest; studentId = active.studentId;
      cardIndex = Math.max(0, active.cards.findIndex(c => !active.answers[c.id])); review = false; studentDisplay = false; lastJudgement = null;
      route = 'assessment'; render();
    } else if (a === 'open-session') {
      currentSessionId = t.dataset.id;
      nav('session');
    } else if (a === 'undo-judgement') {
      if (!lastJudgement || state.revision !== lastJudgement.revision) throw Error('توجد تغييرات أحدث؛ تعذر التراجع.');
      const snapshot = lastJudgement;
      await persist({...structuredClone(snapshot.state), revision: state.revision});
      active = structuredClone(snapshot.active);
      cardIndex = snapshot.cardIndex;
      currentSessionId = active.sessionId || '';
      grade = active.grade;
      section = active.sectionAtTest;
      studentId = active.studentId;
      route = 'assessment'; review = false; studentDisplay = false;
      lastJudgement = null;
      closeModal(); render(); toast('أُلغي آخر تقييم؛ صحح الحكم ثم تابع.');
    } else if (a === 'print-session') {
      document.body.classList.add('printing-session');
      const clean = () => document.body.classList.remove('printing-session');
      window.addEventListener('afterprint', clean, {once: true});
      try { window.print(); } catch (error) { clean(); throw error; }
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
      applyPreset(a.slice(7));
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
        if (
          chosenCards().find((c) => c.id === id)?.readingLevel === 'single' &&
          sentenceWordCount(area.value) !== 6
        )
          throw Error('اكتب جملة من ست كلمات بالضبط.');
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
      const plan = assessmentPlan(), roster = setupRoster(plan);
      if (!section || !plan.cards.length) throw Error('اختر الصف والشعبة والمهارة.');
      if (!roster.length) throw Error('لا يوجد طلاب لم يُختبروا في هذا الدرس والمهارة.');
      if (plan.cards.length > 1000) throw Error('اختر نطاقًا أقصر للاختبار، حتى ألف بطاقة.');
      const first = roster[0], saved = matchingDraft(state, plan, first.id);
      currentSessionId = saved?.sessionId || uid();
      const reference = {sessionId: currentSessionId, sessionTemplate: plan, grade, semester, unit, cumulative, rosterIds: roster.map(s => s.id)};
      active = studentDraft(reference, first);
      studentId = first.id; lastJudgement = null;
      cardIndex = Math.max(0, active.cards.findIndex(c => !active.answers[c.id]));
      studentDisplay = false; review = false;
      await saveDraft(); route = 'assessment'; render();
    } else if (a === 'listening-attach') {
      document.querySelector('#listening-file')?.click();
    } else if (a === 'listening-read') {
      const c = active?.cards[cardIndex];
      if (c?.kind === 'listening') await recordListeningDelivery(c, 'teacher');
    } else if (a === 'score') {
      if (!active || review) return;
      const undo = {state: structuredClone(state), active: structuredClone(active), cardIndex};
      const c = active.cards[cardIndex];
      active.answers[c.id] = {
        score: t.dataset.score,
        note: document.querySelector('#answer-note')?.value || '',
        updatedAt: new Date().toISOString(),
      };
      if (
        c.kind === 'listening' &&
        !active.listeningDelivery?.[c.passageId]?.count
      )
        toast(
          'لم تُوثّق قراءة مكتملة لهذا المقطع؛ سجّل قراءة المعلم أو شغّل الصوت كاملًا.',
        );
      if (
        cardIndex === active.cards.length - 1 &&
        active.cards.every((card) => active.answers[card.id])
      ) {
        await completeAssessment();
        lastJudgement = {...undo, revision: state.revision};
        render();
        return;
      }
      await saveDraft();
      lastJudgement = {...undo, revision: state.revision};
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
    } else if (a === 'pause' || a === 'end-session') {
      if (review)
        active.note = document.querySelector('#final-note')?.value || '';
      else await saveCurrentNote();
      await saveDraft();
      currentSessionId = active.sessionId || '';
      active = null;
      review = false;
      nav(a === 'end-session' && currentSessionId ? 'session' : 'home');
      toast('حُفظ الاختبار لاستكماله لاحقًا.');
    } else if (a === 'resume') {
      active = structuredClone(state.drafts.find((d) => d.id === t.dataset.id));
      if (!active) throw Error('المسودة غير موجودة.');
      const resumedStudent = state.students.find(s => s.id === active.studentId && !s.archived);
      if (!resumedStudent) { active = null; throw Error('الطالب مؤرشف أو غير موجود.'); }
      if (active.sessionTemplate && !pendingPlanCards(state, active.sessionTemplate, active.studentId).length) { active = null; toast('اكتملت هذه المهارة للطالب في جلسة أخرى.'); nav('home'); return; }
      if (active.sessionTemplate) active = studentDraft(active, resumedStudent);
      grade = active.grade;
      section = resumedStudent.section;
      currentSessionId = active.sessionId || '';
      active.deferred = false;
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
      await completeAssessment();
    } else if (a === 'next-student' || a === 'skip-student') {
      const skipping = a === 'skip-student';
      if (skipping && (!active || studentDisplay)) return;
      if (skipping) {
        if (review)
          active.note =
            document.querySelector('#final-note')?.value || active.note;
        else await saveCurrentNote();
        active.deferred = true;
        await saveDraft();
      }
      lastJudgement = null;
      const result = skipping
        ? structuredClone(active)
        : state.results.find((r) => r.id === t.dataset.id);
      if (skipping && !nextSessionStudent(state, result)) {
        active = null;
        review = false;
        currentSessionId = result.sessionId || '';
        nav(currentSessionId ? 'session' : 'home');
        toast('حُفظ الطالب للاستكمال؛ لم تُسجّل له نتيجة.');
        return;
      }
      const next = result && nextSessionStudent(state, result);
      if (!next) throw Error('لا يوجد طالب تالٍ في هذا الكشف.');
      active = studentDraft(result, next);
      cardIndex = Math.max(0, active.cards.findIndex(c => !active.answers[c.id]));
      studentDisplay = false;
      review = false;
      grade = result.grade;
      studentId = next.id;
      await saveDraft();
      closeModal();
      route = 'assessment';
      render();
      if (skipping) toast('تم تجاوز الطالب وحفظ اختباره للاستكمال لاحقًا.');
    } else if (a === 'student-report') {
      const r = state.results.find((r) => r.id === t.dataset.id);
      reportModal(studentReportHTML(r), 'student', r.id);
    } else if (a === 'class-report') {
      const latest = state.results
        .filter((r) => r.grade === grade)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
      reportScope = {
        skill:
          latest?.cards[0]?.readingLevel === 'single'
            ? latest.cards[0].skillId
            : '',
        test:
          latest?.cards[0]?.readingLevel === 'single' ? '' : latest?.id || '',
        section,
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
    } else if (a === 'drive-connect') {
      if (driveBusy) return;
      if (!drive.status().ready) {
        if (drivePreparing) return;
        drivePreparing = true;
        await driveOperation(async () => {
          try {
            await drive.prepare();
            driveMessage = 'جاهز. اضغط ربط Google Drive لفتح نافذة الحساب.';
          } finally {
            drivePreparing = false;
          }
        });
      } else {
        await driveOperation(async () => {
          driveFiles = [];
          driveNextPage = '';
          await drive.connect();
          await loadDriveBackups();
          driveMessage =
            'تم ربط جلسة Google. اختر حفظ نسخة أو استعادة نسخة سابقة.';
        });
      }
    } else if (a === 'drive-save') {
      await driveOperation(async () => {
        const snapshotRevision = state.revision;
        const file = await drive.saveBackup(state);
        await persist({
          ...state,
          settings: { ...state.settings, lastDriveBackupAt: file.createdTime },
        });
        driveMessage =
          state.revision > snapshotRevision + 1
            ? 'حُفظت نسخة وقت بدء العملية. توجد تغييرات أحدث على هذا الجهاز تحتاج حفظ نسخة أخرى.'
            : 'أكد Google Drive حفظ نسخة جديدة. تظل النسخ السابقة محفوظة.';
        await loadDriveBackups();
      });
    } else if (a === 'drive-list' || a === 'drive-more') {
      await driveOperation(() => loadDriveBackups(a === 'drive-more'));
    } else if (a === 'drive-read') {
      await driveOperation(async () => {
        pendingDriveBackup = await drive.readBackup(t.dataset.id);
        modal(
          'معاينة استعادة نسخة Google Drive',
          `<p>تحتوي النسخة على ${ar(pendingDriveBackup.students.length)} طالب و${ar(pendingDriveBackup.results.length)} اختبار و${ar(pendingDriveBackup.drafts.length)} مسودة.</p><p>ستُضاف السجلات غير الموجودة على هذا الجهاز. السجلات والمسودات الموجودة لا تُستبدل، ولا تُحذف بياناتك المحلية.</p><label class="checkline"><input id="drive-restore-settings" type="checkbox">استعادة إعدادات المدرسة والمعلم والتقييم من النسخة أيضًا</label>`,
          { actions: btn('دمج النسخة مع هذا الجهاز', 'confirm-drive-restore') },
        );
      });
    } else if (a === 'confirm-drive-restore') {
      if (!pendingDriveBackup) return;
      const next = mergeBackup(state, pendingDriveBackup);
      if (document.querySelector('#drive-restore-settings')?.checked)
        next.settings = { ...pendingDriveBackup.settings };
      await persist(next);
      pendingDriveBackup = null;
      closeModal();
      render();
      toast('دُمجت نسخة Google Drive مع هذا الجهاز.');
    } else if (a === 'drive-disconnect') {
      if (driveBusy) return;
      drive.disconnect();
      driveFiles = [];
      driveNextPage = '';
      pendingDriveBackup = null;
      driveMessage =
        'انتهت جلسة الربط على هذه الصفحة. ملفات Google Drive محفوظة.';
      refreshDrivePanel();
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
      if (c.readingLevel === 'single' && sentenceWordCount(display) !== 6)
        throw Error('اكتب جملة من ست كلمات بالضبط.');
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
          delete card.audioPath;
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
  } finally {
    if (assessmentMutation) assessmentBusy = false;
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
      grade = rosterReviewData.grade;
      query = '';
      section = '';
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
      query = '';
      rememberClassroom();
      render();
    } else if (t.id === 'roster-grade') {
      grade = Number(t.value);
      renderRosterPreview();
    } else if (t.id === 'setup-section') {
      section = t.value;
      studentId = ''; 
      rememberClassroom();
      render();
    } else if (t.id === 'setup-skill') {
      applyPreset(t.value);
    } else if (t.id === 'setup-student') {
      studentId = t.value;
      render();
    } else if (t.id === 'setup-semester') {
      semester = Number(t.value);
      readingLessonId = ''; readingLessonIds = [];
      unit = curriculum.units.find(
        (u) => u.grade === grade && u.semester === semester,
      ).unit;
      selected = new Set();
      customCards = null;
      render();
    } else if (t.id === 'setup-unit') {
      unit = Number(t.value);
      readingLessonId = ''; readingLessonIds = [];
      selected = new Set();
      customCards = null;
      render();
    } else if (t.id === 'setup-lesson') {
      setLessonSelection(t.value);
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
      const skill = availableSkills().find((s) => s.id === t.dataset.skill);
      if (t.checked && skill?.readingLevel === 'single') availableSkills().filter(s => s.readingLevel !== 'single').forEach(s => selected.delete(s.id));
      else if (t.checked)
        availableSkills()
          .filter((s) => s.readingLevel === 'single')
          .forEach((s) => selected.delete(s.id));
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
          mappings: sheets.map((x) => inferRosterColumns(x.rows)),
          included: new Set(
            file.name.toLowerCase().endsWith('.docx')
              ? sheets.flatMap((x, i) =>
                  rosterFromRows(x.rows, inferRosterColumns(x.rows), grade, 'أ')
                    .length
                    ? [i]
                    : [],
                )
              : [sheet],
          ),
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
    } else if (t.dataset.rosterSheetInclude !== undefined) {
      if (!importedRoster) return;
      const i = Number(t.dataset.rosterSheetInclude);
      t.checked
        ? importedRoster.included.add(i)
        : importedRoster.included.delete(i);
      renderRosterPreview();
    } else if (t.dataset.rosterNameInclude !== undefined) {
      if (!importedRoster) return;
      const mapping = importedRoster.mappings[importedRoster.sheet];
      const cols = new Set(mapping.nameColumns || [mapping.nameColumn]);
      t.checked
        ? cols.add(Number(t.dataset.rosterNameInclude))
        : cols.delete(Number(t.dataset.rosterNameInclude));
      mapping.nameColumns = [...cols].sort((a, b) => a - b);
      renderRosterPreview();
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
      } else {
        const field = {
          'roster-name-column': 'nameColumn',
          'roster-guardian-column': 'guardianColumn',
          'roster-start-row': 'startRow',
        }[t.id];
        const mapping = importedRoster.mappings[importedRoster.sheet];
        if (field === 'nameColumn') delete mapping.nameColumns;
        mapping[field] = Math.max(
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
  if (!dialogs.children.length) {
    if (
      route !== 'assessment' ||
      !active ||
      review ||
      studentDisplay ||
      busy ||
      assessmentBusy ||
      ev.repeat ||
      ev.ctrlKey ||
      ev.metaKey ||
      ev.altKey ||
      ev.shiftKey ||
      ev.isComposing ||
      ev.target.closest('input, textarea, select, [contenteditable]')
    )
      return;
    const index = '1234'.indexOf(ev.key);
    const arabicIndex = '١٢٣٤'.indexOf(ev.key);
    const score = ['excellent', 'advanced', 'proficient', 'incorrect'][
      index < 0 ? arabicIndex : index
    ];
    const button =
      score &&
      app.querySelector('[data-action="score"][data-score="' + score + '"]');
    if (button) {
      ev.preventDefault();
      button.click();
    }
    return;
  }
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
  chooseGrade(classroomPreferences.grade || 1);
  if (!section) section = state.students.find(s => s.grade === grade && !s.archived)?.section || '';
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
