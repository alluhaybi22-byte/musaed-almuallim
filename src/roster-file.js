import { normalizeName, parseCSV, GRADES } from './domain.js';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const key = (value) =>
  normalizeName(value)
    .replace(/[\u064b-\u065f\s_.:،-]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .toLowerCase();
const isName = (value) =>
  /^(اسم(ال)?(طالب|تلميذ)|اسماءالطلاب|الاسمالكامل|اسمكامل|الاسم|اسم|studentname|fullname|name)$/.test(
    key(value),
  );
const isGuardian = (value) => /ولي|guardian|parent|father/.test(key(value));
export function inferRosterColumns(rows) {
  let header = -1,
    nameColumn = -1,
    guardianColumn = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const col = rows[i].findIndex(isName);
    if (col >= 0) {
      header = i;
      nameColumn = col;
      guardianColumn = rows[i].findIndex(isGuardian);
      break;
    }
  }
  if (nameColumn < 0) {
    const width = Math.max(0, ...rows.slice(0, 20).map((r) => r.length));
    for (let col = 0; col < width; col++)
      if (
        rows
          .slice(0, 20)
          .some(
            (r) =>
              /[\p{L}]{2}/u.test(normalizeName(r[col])) &&
              normalizeName(r[col]).length >= 3,
          )
      ) {
        nameColumn = col;
        break;
      }
  }
  return {
    nameColumn: Math.max(0, nameColumn),
    guardianColumn,
    startRow: header + 1,
  };
}
export function rosterFromRows(rows, mapping, grade, section) {
  if (!GRADES.includes(Number(grade))) throw Error('الصف غير صالح.');
  return rows
    .slice(mapping.startRow)
    .map((row) => ({
      name: normalizeName(row[mapping.nameColumn]),
      guardian:
        mapping.guardianColumn >= 0
          ? normalizeName(row[mapping.guardianColumn])
          : '',
      grade: Number(grade),
      section: normalizeName(section) || 'أ',
    }))
    .filter(
      (s) =>
        s.name &&
        !isName(s.name) &&
        /[\p{L}]/u.test(s.name) &&
        !/^((اجمالي|إجمالي|المجموع|عدد الطلاب|كشف الطلاب|قائمة الطلاب)(?:\s|:|$)|الصف (الأول|الثاني|الثالث))/.test(
          s.name,
        ),
    );
}
export async function readRosterFile(file) {
  if (file.size > 10 * 1024 * 1024)
    throw Error('حجم الملف أكبر من ١٠ ميجابايت.');
  const ext = file.name.split('.').at(-1).toLowerCase();
  if (['csv', 'tsv', 'txt'].includes(ext))
    return [{ name: file.name, rows: parseCSV(await file.text()) }];
  if (ext === 'doc')
    throw Error('ملف Word قديم (.doc). احفظه بصيغة DOCX ثم استورده.');
  if (!['xlsx', 'xls', 'docx'].includes(ext))
    throw Error(
      'اختر ملف Excel بصيغة XLSX أو XLS، أو Word بصيغة DOCX، أو CSV.',
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === 'xlsx' && !(bytes[0] === 0x50 && bytes[1] === 0x4b))
    throw Error('ملف Excel غير صالح. اختر ملف XLSX حقيقيًا.');
  if (
    ext === 'xls' &&
    !(bytes[0] === 0xd0 && bytes[1] === 0xcf) &&
    bytes[0] !== 0x09
  )
    throw Error('ملف Excel القديم غير صالح.');
  const { unzipSync, strFromU8 } = await import('./vendor/fflate.mjs');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let total = 0;
    unzipSync(bytes, {
      filter: (entry) => {
        total += entry.originalSize;
        if (total > 25 * 1024 * 1024)
          throw Error('محتوى الملف كبير جدًا. استورد كشفًا أصغر.');
        return false;
      },
    });
  }
  if (ext === 'docx') {
    const entries = unzipSync(bytes, {
      filter: (entry) => entry.name === 'word/document.xml',
    });
    if (!entries['word/document.xml'])
      throw Error('ملف Word غير صالح أو محمي.');
    const xml = new DOMParser().parseFromString(
      strFromU8(entries['word/document.xml']),
      'application/xml',
    );
    if (xml.querySelector('parsererror')) throw Error('تعذر قراءة ملف Word.');
    const text = (node) =>
      [...node.getElementsByTagNameNS(WORD_NS, 't')]
        .map((n) => n.textContent)
        .join('');
    const tables = [...xml.getElementsByTagNameNS(WORD_NS, 'tbl')].filter(
      (n) => {
        for (let p = n.parentElement; p; p = p.parentElement)
          if (p.localName === 'tbl') return false;
        return true;
      },
    );
    if (tables.length)
      return tables.map((table, i) => ({
        name: 'جدول ' + (i + 1),
        rows: [...table.children]
          .filter((n) => n.localName === 'tr')
          .map((row) =>
            [...row.children].filter((n) => n.localName === 'tc').map(text),
          )
          .filter((row) => row.some(Boolean)),
      }));
    const rows = [...xml.getElementsByTagNameNS(WORD_NS, 'p')]
      .map((p) =>
        [...p.children]
          .map((n) =>
            n.localName === 'r'
              ? [...n.children]
                  .map((t) =>
                    t.localName === 'tab'
                      ? '\t'
                      : t.localName === 't'
                        ? t.textContent
                        : '',
                  )
                  .join('')
              : '',
          )
          .join(''),
      )
      .filter((t) => t.trim())
      .map((t) => t.split('\t'));
    return [{ name: 'أسماء مستند Word', rows }];
  }
  const XLSX = await import('./vendor/xlsx.mjs');
  const workbook = XLSX.read(bytes, {
    type: 'array',
    sheetRows: 5001,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });
  return workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    }),
  }));
}
