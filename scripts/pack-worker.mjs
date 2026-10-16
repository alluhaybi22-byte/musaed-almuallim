import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {gzipSync} from 'node:zlib';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'dist'),assets={};
const types={'.mp3':'audio/mpeg','.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
async function walk(dir){for(const name of await readdir(dir)){const p=resolve(dir,name);if((await stat(p)).isDirectory())await walk(p);else if(name!=='private-worker.mjs'){const original=await readFile(p),gz=gzipSync(original,{level:9}),compressed=gz.length<original.length;assets['/'+relative(out,p)]={body:(compressed?gz:original).toString('base64'),type:types[extname(p)]||'application/octet-stream',encoding:compressed?'gzip':null};}}}
await walk(out);const code=await readFile(resolve(root,'worker.js'),'utf8');await writeFile(resolve(out,'private-worker.mjs'),'globalThis.__MUSAED_ASSETS__='+JSON.stringify(assets)+';\n'+code);console.log('Private worker packed; assets',Object.keys(assets).length);
