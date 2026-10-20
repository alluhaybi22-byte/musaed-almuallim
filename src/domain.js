export const VERSION = '0.8.0';
export const GRADES = [1, 2, 3];
export const GRADE_NAMES = {
  1: 'الأول الابتدائي',
  2: 'الثاني الابتدائي',
  3: 'الثالث الابتدائي',
};
export const SCORES = {
  independent: 'متقن',
  assisted: 'بمساعدة',
  incorrect: 'غير متقن',
  not_assessed: 'غير مقيم',
  not_taught: 'غير مدرس',
};
export const DOMAINS = [
  'الحروف والأصوات',
  'الكلمات والظواهر',
  'الجمل والنصوص',
  'الفهم والاستماع',
  'الكتابة والإملاء',
  'التعبير والتراكيب',
];
export const DEFAULT_SETTINGS = {
  school: '',
  teacher: '',
  principal: '',
  signature: '',
  fontSize: 76,
  mastery: 80,
  medium: 50,
  minSamples: 5,
};
export const emptyState = () => ({
  schemaVersion: 1,
  revision: 0,
  students: [],
  results: [],
  drafts: [],
  settings: { ...DEFAULT_SETTINGS },
});
export const uid = () => crypto.randomUUID();
export function localDateKey(
  value,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
export function classify(percent, settings = DEFAULT_SETTINGS) {
  if (percent === null) return 'غير مقيم';
  return percent >= settings.mastery
    ? 'متقن'
    : percent >= settings.medium
      ? 'متوسط'
      : 'ضعيف';
}
export function summarize(cards, answers, settings = DEFAULT_SETTINGS) {
  const groups = new Map();
  for (const card of cards) {
    if (!groups.has(card.skillId))
      groups.set(card.skillId, {
        skillId: card.skillId,
        title: card.skillTitle,
        domain: card.domain,
        independent: 0,
        assisted: 0,
        incorrect: 0,
        not_assessed: 0,
        not_taught: 0,
      });
    const g = groups.get(card.skillId),
      score = answers[card.id]?.score;
    g[Object.hasOwn(SCORES, score) ? score : 'not_assessed']++;
  }
  return [...groups.values()].map((g) => {
    const attempted = g.independent + g.assisted + g.incorrect;
    const percent = attempted
      ? Math.round((100 * g.independent) / attempted)
      : null;
    return {
      ...g,
      attempted,
      percent,
      label: classify(percent, settings),
      limited: attempted > 0 && attempted < settings.minSamples,
    };
  });
}
export function overall(summary, settings = DEFAULT_SETTINGS) {
  const attempts = summary.reduce((n, s) => n + s.attempted, 0),
    independent = summary.reduce((n, s) => n + s.independent, 0);
  const percent = attempts ? Math.round((100 * independent) / attempts) : null;
  return { percent, label: classify(percent, settings) };
}
export function latestResult(results, studentId) {
  return (
    results
      .filter((r) => r.studentId === studentId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] || null
  );
}
// Comparison requires identical material and thresholds, rather than equal percentages alone.
export function assessmentSignature(result, skillId = '') {
  return JSON.stringify([
    result.grade,
    result.semester,
    result.cards
      .filter((c) => !skillId || c.skillId === skillId)
      .map((c) => [
        c.skillId,
        c.display,
        c.instruction,
        c.teacherText || '',
        c.expected,
        c.facet || '',
        ...(c.kind === 'listening'
          ? [
              c.audioData || c.audioPath || '',
              result.listeningDelivery?.[c.passageId]?.mode || 'unrecorded',
              result.listeningDelivery?.[c.passageId]?.count || 0,
            ]
          : []),
      ]),
    result.scoring?.mastery ?? 80,
    result.scoring?.medium ?? 50,
    result.scoring?.minSamples ?? 5,
  ]);
}
export function facetSummary(result) {
  const cards = result.cards
    .filter((c) => c.facet)
    .map((c) => ({
      ...c,
      skillId: c.skillId + ':' + c.facet,
      skillTitle: c.skillTitle + ' · ' + c.facet,
    }));
  return summarize(cards, result.answers, result.scoring);
}
export function skillProgress(result, results) {
  return summarize(result.cards, result.answers, result.scoring).map(
    (current) => {
      const previous = results
        .filter(
          (r) =>
            r.id !== result.id &&
            r.studentId === result.studentId &&
            r.grade === result.grade &&
            r.semester === result.semester &&
            r.completedAt < result.completedAt &&
            r.cards.some((c) => c.skillId === current.skillId) &&
            JSON.stringify(
              r.cards
                .filter(
                  (c) =>
                    c.skillId === current.skillId &&
                    ['independent', 'assisted', 'incorrect'].includes(
                      r.answers[c.id]?.score,
                    ),
                )
                .map((c) => c.id),
            ) ===
              JSON.stringify(
                result.cards
                  .filter(
                    (c) =>
                      c.skillId === current.skillId &&
                      ['independent', 'assisted', 'incorrect'].includes(
                        result.answers[c.id]?.score,
                      ),
                  )
                  .map((c) => c.id),
              ) &&
            assessmentSignature(r, current.skillId) ===
              assessmentSignature(result, current.skillId),
        )
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
      const prior =
        previous &&
        summarize(previous.cards, previous.answers, previous.scoring).find(
          (s) => s.skillId === current.skillId,
        );
      return {
        ...current,
        previousAt: previous?.completedAt,
        previousPercent: prior?.percent ?? null,
        delta:
          prior?.percent != null && current.percent != null
            ? current.percent - prior.percent
            : null,
      };
    },
  );
}
export const escapeHTML = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export function normalizeName(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}
export function validateSettings(s) {
  if (
    !s ||
    !Number.isFinite(s.mastery) ||
    !Number.isFinite(s.medium) ||
    s.mastery > 100 ||
    s.mastery <= s.medium ||
    s.medium < 0
  )
    throw Error('أدخل حدودًا صحيحة: المتقن أعلى من المتوسط ومن صفر إلى ١٠٠.');
  if (!Number.isInteger(s.minSamples) || s.minSamples < 1 || s.minSamples > 50)
    throw Error('الحد الأدنى للعينات من ١ إلى ٥٠.');
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    fontSize: Math.min(120, Math.max(36, Number(s.fontSize) || 76)),
  };
}
export function parseCSV(text) {
  const delimiter = text.split(/\r?\n/)[0].includes('\t')
    ? '\t'
    : text.split(/\r?\n/)[0].includes(';')
      ? ';'
      : text.split(/\r?\n/)[0].includes('،')
        ? '،'
        : ',';
  const rows = [];
  let row = [],
    cell = '',
    quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') quoted = !quoted;
      else cell += c;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((s) => s.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('علامة اقتباس غير مغلقة في الملف.');
  row.push(cell);
  if (row.some((s) => s.trim())) rows.push(row);
  return rows;
}
export function rosterFromText(text, grade, section = 'أ') {
  if (!GRADES.includes(Number(grade))) throw Error('الصف غير صالح.');
  const rows = parseCSV(text),
    first = rows[0] || [],
    hasHeader = first.some((x) => /الاسم|اسم الطالب|name/i.test(x));
  const nameIndex = hasHeader
    ? Math.max(
        0,
        first.findIndex((x) => /الاسم|اسم الطالب|name/i.test(x)),
      )
    : 0;
  const parentIndex = hasHeader
    ? first.findIndex((x) => /ولي|guardian|parent/i.test(x))
    : -1;
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r) => ({
      name: normalizeName(r[nameIndex]),
      guardian: parentIndex >= 0 ? normalizeName(r[parentIndex]) : '',
      grade: Number(grade),
      section: normalizeName(section) || 'أ',
    }))
    .filter((s) => s.name);
}
export function addStudents(existing, incoming) {
  const out = [...existing],
    seen = new Set(
      out.map((s) => `${s.grade}|${s.section}|${normalizeName(s.name)}`),
    );
  let added = 0;
  for (const s of incoming) {
    const name = normalizeName(s.name);
    if (!name || name.length > 150 || !GRADES.includes(s.grade))
      throw Error('اسم الطالب أو صفه غير صالح.');
    const key = `${s.grade}|${s.section}|${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        ...s,
        name,
        id: s.id || uid(),
        archived: false,
        createdAt: s.createdAt || new Date().toISOString(),
      });
      added++;
    }
  }
  return { students: out, added };
}
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function validateBackup(data) {
  if (
    !data ||
    data.app !== 'al-musaed' ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.students) ||
    !Array.isArray(data.results) ||
    !Array.isArray(data.drafts)
  )
    throw Error('هذا الملف ليس نسخة احتياطية صالحة للمساعد.');
  if (
    data.students.length > 10000 ||
    data.results.length > 10000 ||
    data.drafts.length > 10000
  )
    throw Error('الملف أكبر من الحد المسموح.');
  const ids = new Set(),
    safeId = (x) => typeof x === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(x);
  for (const s of data.students) {
    if (
      !s ||
      !safeId(s.id) ||
      ids.has(s.id) ||
      typeof s.name !== 'string' ||
      !s.name.trim() ||
      s.name.length > 150 ||
      !GRADES.includes(s.grade) ||
      typeof s.section !== 'string' ||
      s.section.length > 50
    )
      throw Error('بيانات الطلاب في النسخة غير صالحة.');
    ids.add(s.id);
  }
  for (const kind of ['results', 'drafts']) {
    const rids = new Set();
    for (const r of data[kind]) {
      if (
        !r ||
        !safeId(r.id) ||
        rids.has(r.id) ||
        !ids.has(r.studentId) ||
        !GRADES.includes(r.grade) ||
        ![1, 2].includes(r.semester) ||
        !Array.isArray(r.cards) ||
        !r.cards.length ||
        r.cards.length > 3000 ||
        typeof r.answers !== 'object' ||
        !r.answers
      )
        throw Error('بيانات الاختبارات في النسخة غير صالحة.');
      if (
        kind === 'results' &&
        (typeof r.completedAt !== 'string' ||
          !Number.isFinite(Date.parse(r.completedAt)))
      )
        throw Error('تاريخ الاختبار غير صالح.');
      const cards = new Set();
      for (const c of r.cards) {
        if (
          !c ||
          !safeId(c.id) ||
          !safeId(c.skillId) ||
          typeof c.skillTitle !== 'string' ||
          typeof c.display !== 'string' ||
          typeof c.instruction !== 'string' ||
          typeof c.expected !== 'string' ||
          typeof c.domain !== 'string' ||
          !c.source ||
          !Number.isFinite(c.source.page) ||
          cards.has(c.id)
        )
          throw Error('بطاقات غير صالحة.');
        cards.add(c.id);
      }
      for (const [id, a] of Object.entries(r.answers)) {
        if (
          !cards.has(id) ||
          !a ||
          !Object.hasOwn(SCORES, a.score) ||
          typeof (a.note ?? '') !== 'string'
        )
          throw Error('أحكام غير صالحة.');
      }
      if (r.scoring) validateSettings(r.scoring);
      rids.add(r.id);
    }
  }
  validateSettings(data.settings);
  return data;
}
export function mergeBackup(state, data) {
  validateBackup(data);
  const students = [...state.students],
    mapping = new Map();
  for (const s of data.students) {
    const match = students.find(
      (x) =>
        x.grade === s.grade &&
        x.section === s.section &&
        normalizeName(x.name) === normalizeName(s.name),
    );
    if (match) mapping.set(s.id, match.id);
    else {
      const id = students.some((x) => x.id === s.id) ? uid() : s.id;
      students.push({ ...s, id });
      mapping.set(s.id, id);
    }
  }
  const merged = { ...state, students };
  for (const kind of ['results', 'drafts']) {
    merged[kind] = [...state[kind]];
    for (const r of data[kind])
      if (!merged[kind].some((x) => x.id === r.id))
        merged[kind].push({
          ...r,
          studentId: mapping.get(r.studentId),
          rosterIds: r.rosterIds?.map((id) => mapping.get(id) || id),
        });
  }
  return merged;
}

export function nextRosterStudent(students, result) {
  const current = students.find((s) => s.id === result.studentId);
  if (!current) return null;
  const ids =
    result.rosterIds ||
    students
      .filter((s) => s.grade === result.grade && s.section === current.section)
      .map((s) => s.id);
  const index = ids.indexOf(current.id);
  if (index < 0) return null;
  for (const id of ids.slice(index + 1)) {
    const candidate = students.find(
      (s) =>
        s.id === id &&
        !s.archived &&
        s.grade === result.grade &&
        s.section === current.section,
    );
    if (candidate) return candidate;
  }
  return null;
}


// Suggestions reflect observed items, not a diagnosis or automatic grading.
export function trainingPlan(result) {
  const groups = new Map();
  for (const c of result.cards) {
    if (!['incorrect', 'assisted'].includes(result.answers[c.id]?.score)) continue;
    const key = c.skillId + ':' + (c.facet || '');
    if (groups.has(key)) continue;
    const label = c.facet || c.skillTitle;
    let activity = 'قدّم نموذجًا واحدًا للمهمة، ثم تدريبًا موجهًا، ثم محاولات مستقلة مع تغذية راجعة.';
    if (c.kind === 'listening') {
      activity = /تسلسل/.test(label) ? 'استمع إلى قصة قصيرة، ثم رتّب ثلاثة أحداث وعبّر عنها: أولًا، ثم، أخيرًا.'
        : /سبب|نتيجة/.test(label) ? 'استمع إلى موقف قصير، ثم أكمل: حدث ذلك لأن… مع تقليل التلميح تدريجيًا.'
        : /فكرة/.test(label) ? 'استمع إلى نص قصير، ثم اختر عنوانًا مناسبًا ولخّصه بجملة.'
        : /استنتاج|صفة/.test(label) ? 'استمع إلى موقف، ثم اذكر صفة للشخصية ودليلًا من فعلها.'
        : 'استمع إلى نص قصير، ثم أجب عن: من؟ أين؟ ماذا؟ دون عرض النص.';
    } else if (c.domain === 'الحروف والأصوات') activity = 'انطق الصوت واعرض الحرف، ثم ميّزه بين ثلاثة حروف واقرأ مقطعين يتضمنانه.';
    else if (c.kind === 'dictation' || /الإملاء/.test(label)) activity = 'حلّل كلمة إلى أصواتها، ثم اكتبها من الذاكرة وقارنها بالنموذج، وكرّر بكلمة جديدة.';
    else if (c.kind === 'copy') activity = 'تتبّع نموذج الحرف على السطر، ثم انسخ كلمة مع مراعاة موضع الحرف والمسافة.';
    else if (c.domain === 'الكلمات والظواهر') activity = 'قارن مثالين للظاهرة، ثم صنّف ثلاث كلمات جديدة واقرأها مستقلًا.';
    else if (c.domain === 'الجمل والنصوص') activity = 'اقرأ جملة قصيرة قراءة نموذجية، ثم يقرأها الطالب ويطبّق على جملة جديدة.';
    else if (c.domain === 'الفهم والاستماع') activity = 'اقرأ نصًا قصيرًا، ثم حدّد الإجابة ودليلها من النص، وكرّر بنص جديد.';
    groups.set(key, {title: c.skillTitle + (c.facet ? ' · ' + c.facet : ''), activity,
      sample: c.kind === 'listening' ? c.display : (c.teacherText || c.display),
      check: 'قدّم ثلاث محاولات جديدة دون تلقين، وسجّل المستقل وبمساعدة وغير المتقن. تحقق إضافيًا إذا بقيت العينة محدودة.'});
  }
  return [...groups.values()];
}
