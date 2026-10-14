import { mkdir, cp, rm, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const prettier = process.env.APPDEPLOY_TOOL_MODULES
  ? await import(
      resolve(process.env.APPDEPLOY_TOOL_MODULES, 'prettier/index.mjs')
    )
  : await import('prettier');
const root = resolve(import.meta.dirname, '..');
const stage = resolve(root, 'deploy/appdeploy/stage');
await rm(stage, { recursive: true, force: true });
await mkdir(resolve(stage, 'src'), { recursive: true });
await mkdir(resolve(stage, 'tests'), { recursive: true });
await cp(resolve(root, 'public'), resolve(stage, 'public'), {
  recursive: true,
});
await rm(resolve(stage, 'public/index.html'));
await rm(resolve(stage, 'public/styles.css'));
const write = async (path, source, parser) =>
  writeFile(
    resolve(stage, path),
    await prettier.format(source, { parser, singleQuote: true }),
  );
for (const name of [
  'domain.js',
  'storage.js',
  'questions.js',
  'task-cards.js',
  'app.js',
  'roster-file.js',
]) {
  let source = await readFile(resolve(root, 'src', name), 'utf8');
  if (name === 'app.js')
    source = source
      .replace(/(?<!\.)\/assets\//g, './assets/')
      .replace("fetch('/curriculum.json')", "fetch('./curriculum.json')")
      .replace("register('/sw.js')", "register('./sw.js')");
  await write('src/' + name, source, 'babel');
}
await cp(resolve(root, 'src/vendor'), resolve(stage, 'src/vendor'), {
  recursive: true,
});
await write(
  'src/main.ts',
  "import './styles.css';\nimport './app.js';\n",
  'typescript',
);
await write(
  'src/styles.css',
  await readFile(resolve(root, 'public/styles.css'), 'utf8'),
  'css',
);
let html = await readFile(resolve(root, 'public/index.html'), 'utf8');
html = html
  .replaceAll('href="/', 'href="./')
  .replace('./styles.css', './src/styles.css')
  .replace('/src/app.js', './src/main.ts');
await write('index.html', html, 'html');
const manifest = JSON.parse(
  await readFile(resolve(root, 'public/manifest.webmanifest'), 'utf8'),
);
manifest.start_url = './';
manifest.scope = './';
for (const item of manifest.icons) item.src = item.src.replace(/^\//, './');
await write('public/manifest.webmanifest', JSON.stringify(manifest), 'json');
await write(
  'public/curriculum.json',
  await readFile(resolve(root, 'public/curriculum.json'), 'utf8'),
  'json',
);
const tests = JSON.parse(
  await readFile(resolve(root, 'deploy/appdeploy/tests.json'), 'utf8'),
);
if (
  tests.length !== 5 ||
  tests.filter((t) => t.sanity).length !== 1 ||
  tests.some((t) => !t.covers.length || !t.steps.length)
)
  throw Error('Invalid QA tests');
await write('tests/tests.json', JSON.stringify(tests), 'json');
await write(
  'package.json',
  JSON.stringify({
    name: 'al-musaed-appdeploy',
    private: true,
    version: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
      .version,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    devDependencies: { vite: '^6.0.0' },
  }),
  'json',
);
await write(
  'vite.config.ts',
  `
import { defineConfig } from 'vite';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
let outputDirectory;
export default defineConfig({
 base: './',
 build: {target: 'es2022', outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist', sourcemap: process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false, rollupOptions:{maxParallelFileOps:128}},
 plugins: [{name: 'al-musaed-offline', configResolved(config){outputDirectory=resolve(config.root,config.build.outDir);}, async closeBundle(){
  const out = outputDirectory;
  async function walk(dir){const items=[]; for(const name of await readdir(dir)){const p=resolve(dir,name);if((await stat(p)).isDirectory())items.push(...await walk(p));else if(name!=='sw.js')items.push(p);}return items;}
  const files=await walk(out); const hash=createHash('sha256'); for(const file of files)hash.update(await readFile(file));
  const version=hash.digest('hex').slice(0,14),paths=files.map(p=>relative(out,p).replaceAll('\\\\','/'));
  const sw = "const CACHE='al-musaed-"+version+"'; const BASE=self.registration.scope; const ASSETS="+JSON.stringify(['',...paths])+".map(path=>new URL(path,BASE).href);\\n"+
   "self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));\\n"+
   "self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('al-musaed-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));\\n"+
   "self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});\\n"+
   "self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});if(hit)return hit;try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return cache.match(BASE);throw error;}}));});\\n";
  await writeFile(resolve(out,'sw.js'),sw);
 }}]
});`,
  'typescript',
);
console.log('AppDeploy staging ready with five QA workflows; no student data.');
