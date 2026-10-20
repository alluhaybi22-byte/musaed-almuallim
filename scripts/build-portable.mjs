// نسخة كمبيوتر مستقلة؛ نفس المصدر والمنهج، دون طلب ملفات خارجية.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..'),
  out = resolve(root, 'dist');
await mkdir(out, { recursive: true });
const assets = {};
for (const [name, type] of Object.entries({
  'icon.svg': 'image/svg+xml',
  'icon-192.png': 'image/png',
  'learning-hero.webp': 'image/webp',
  'NotoNaskhArabic-Regular.ttf': 'font/ttf',
}))
  assets['/assets/' + name] =
    'data:' +
    type +
    ';base64,' +
    (await readFile(resolve(root, 'public/assets', name))).toString('base64');
let css = await readFile(resolve(root, 'public/styles.css'), 'utf8');
for (const name of await readdir(
  resolve(root, 'public/assets/listening'),
).catch(() => [])) {
  if (!name.endsWith('.mp3')) continue;
  assets['/assets/listening/' + name] =
    'data:audio/mpeg;base64,' +
    (await readFile(resolve(root, 'public/assets/listening', name))).toString(
      'base64',
    );
}
let app = await readFile(resolve(root, 'src/app.js'), 'utf8');
app = app
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
  .replace(
    /fetch\(['"]\.?\/curriculum\.json['"]\)\.then\([\s\S]*?\}\)/,
    'Promise.resolve(PORTABLE_CURRICULUM)',
  )
  .replace(/if\s*\('serviceWorker' in navigator\)/, 'if(false)');
app = app.replace('نسخة تجريبية ${VERSION}', 'نسخة الكمبيوتر ${VERSION}');
const modules = [];
for (const name of [
  'domain.js',
  'classroom.js',
  'drive-config.js',
  'drive-storage.js',
  'storage.js',
  'task-cards.js',
  'listening-recordings.js',
  'listening.js',
  'questions.js',
  'reading-lessons.js',
  'reading-rotation.js',
  'roster-file.js',
])
  modules.push(
    (await readFile(resolve(root, 'src', name), 'utf8'))
      .replace(/^import[\s\S]*?from ['"][^'"]+['"];\s*/gm, '')
      .replace(/^export /gm, ''),
  );
const curriculum = (
  await readFile(resolve(root, 'public/curriculum.json'), 'utf8')
).replaceAll('<', '\\u003c');
let code =
  'const PORTABLE_CURRICULUM=' +
  curriculum +
  ';\n' +
  modules.join('\n') +
  '\nconst e=escapeHTML;\n' +
  app;
let html = await readFile(resolve(root, 'public/index.html'), 'utf8');
html = html
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(
    '<link rel="stylesheet" href="/styles.css">',
    '<style>' + css + '</style>',
  )
  .replace(
    '<script type="module" src="/src/app.js"></script>',
    '<script>(async()=>{' +
      code.replaceAll('</script', '<\\/script') +
      '})();</script>',
  );
for (const [path, uri] of Object.entries(assets))
  html = html.replaceAll('.' + path, uri).replaceAll(path, uri);
for (const name of ['xlsx', 'fflate']) {
  const uri =
    'data:text/javascript;base64,' +
    (await readFile(resolve(root, 'src/vendor', name + '.mjs'))).toString(
      'base64',
    );
  html = html.replaceAll('./vendor/' + name + '.mjs', uri);
}
await writeFile(resolve(out, 'Al-Musaed-Desktop.html'), html);
console.log('Portable desktop HTML built; all assets and curriculum embedded.');

