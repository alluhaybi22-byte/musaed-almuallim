import { mkdir, writeFile } from 'node:fs/promises';
import * as XLSX from '../src/vendor/xlsx.mjs';
import { zipSync, strToU8 } from '../src/vendor/fflate.mjs';
export async function createRosterFixtures() {
  await mkdir('test-results', { recursive: true });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), 'فارغة');
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ['مدرسة تجريبية'],
      ['رقم', 'ولي الأمر', 'اسم الطالب'],
      [1, 'ولي ألف', 'طالب ألف'],
      [2, 'ولي باء', 'طالب باء'],
      ['', '', 'عدد الطلاب: ٢'],
      ['', '', 'معلم المادة : معلم تجريبي', 'مدير المدرسة : مدير تجريبي'],
    ]),
    'الطلاب',
  );
  for (const ext of ['xlsx', 'xls'])
    await writeFile(
      'test-results/roster.' + ext,
      XLSX.write(book, { bookType: ext, type: 'buffer' }),
    );
  const cell = (t) => '<w:tc><w:p><w:r><w:t>' + t + '</w:t></w:r></w:p></w:tc>';
  const row = (items) => '<w:tr>' + items.map(cell).join('') + '</w:tr>';
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>' +
    row(['رقم', 'ولي الأمر', 'اسم الطالب']) +
    row(['١', 'ولي وورد', 'طالب وورد']) +
    row(['', '', 'معلم المادة : معلم وورد']) +
    '</w:tbl></w:body></w:document>';
  await writeFile(
    'test-results/roster.docx',
    zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      'word/document.xml': strToU8(xml),
    }),
  );
  await writeFile('test-results/broken.xlsx', 'not an Excel file');
}
