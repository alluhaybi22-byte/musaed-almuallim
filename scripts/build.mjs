import {mkdir,cp,rm,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(resolve(root,'public'),out,{recursive:true});await cp(resolve(root,'src'),resolve(out,'src'),{recursive:true});
async function files(dir){const list=[];for(const name of await readdir(dir)){const p=resolve(dir,name);if((await stat(p)).isDirectory())list.push(...await files(p));else list.push(p);}return list;}
const assets=await files(out),urls=assets.map(p=>'/'+relative(out,p).replaceAll('\\','/'));
const hash=createHash('sha256');for(const file of assets)hash.update(await readFile(file));const version=hash.digest('hex').slice(0,14);
const sw=`const CACHE='al-musaed-${version}';const ASSETS=${JSON.stringify(['/',...urls])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('al-musaed-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(event.request,{ignoreSearch:true});if(hit)return hit;try{return await fetch(event.request);}catch(error){if(event.request.mode==='navigate')return cache.match('/');throw error;}}));});`;
await writeFile(resolve(out,'sw.js'),sw);console.log(`Built ${urls.length+1} local assets · cache ${version}`);
