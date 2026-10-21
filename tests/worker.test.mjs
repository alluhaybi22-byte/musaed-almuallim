import test from 'node:test';import assert from 'node:assert/strict';
import worker,{authorized,assetResponse} from '../worker.js';
const auth=p=>'Basic '+btoa('teacher:'+p);
test('private preview denies requests before password is configured and rejects wrong credentials',async()=>{assert.equal(await authorized(new Request('https://app/'),undefined),false);assert.equal(await authorized(new Request('https://app/',{headers:{Authorization:auth('wrong')}}),'correct'),false);assert.equal((await worker.fetch(new Request('https://app/'),{})).status,401);});
test('credentials compared and assets served only after authentication',async()=>{assert.equal(await authorized(new Request('https://app/',{headers:{Authorization:auth('correct')}}),'correct'),true);globalThis.__MUSAED_ASSETS__={'/index.html':{body:btoa('<html></html>'),type:'text/html'}};const response=await worker.fetch(new Request('https://app/',{headers:{Authorization:auth('correct')}}),{PREVIEW_PASSWORD:'correct'});assert.equal(response.status,200);assert.equal(await response.text(),'<html></html>');assert.ok(response.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));});
test('unknown paths do not fall back to exposing source; POST rejected',()=>{assert.equal(assetResponse(new Request('https://app/.env'),{}).status,404);assert.equal(assetResponse(new Request('https://app/',{method:'POST'}),{}).status,405);});

test('native assets remain behind authentication on every route',async()=>{
 let reads=0;const ASSETS={fetch:async()=>{reads++;return new Response('asset');}};
 for(const path of ['/','/index.html','/src/app.js','/sw.js','/assets/icon.svg']){
  const response=await worker.fetch(new Request('https://app'+path),{PREVIEW_PASSWORD:'correct',ASSETS});
  assert.equal(response.status,401);
 }
 assert.equal(reads,0);
 const request=new Request('https://app/',{method:'POST',headers:{Authorization:auth('correct')}});
 assert.equal((await worker.fetch(request,{PREVIEW_PASSWORD:'correct',ASSETS})).status,405);
 assert.equal(reads,0);
});
test('native assets preserve headers, root mapping, HEAD, missing paths and private caching',async()=>{
 const ASSETS={fetch:async request=>{
  const path=new URL(request.url).pathname;
  return path==='/missing' ? new Response('Not found',{status:404}) : new Response(path,{headers:{'Content-Type':'text/plain','Cache-Control':'public, max-age=31536000'}});
 }};
 const env={PREVIEW_PASSWORD:'correct',ASSETS},headers={Authorization:auth('correct')};
 const root=await worker.fetch(new Request('https://app/',{headers}),env);
 assert.equal(await root.text(),'/index.html');
 assert.equal(root.headers.get('Cache-Control'),'private, max-age=0, must-revalidate');
 assert(root.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
 assert.equal(root.headers.get('Service-Worker-Allowed'),'/');
 assert.equal((await worker.fetch(new Request('https://app/sw.js',{headers}),env)).headers.get('Cache-Control'),'no-cache');
 assert.equal((await worker.fetch(new Request('https://app/missing',{headers}),env)).status,404);
 assert.equal(await (await worker.fetch(new Request('https://app/',{headers,method:'HEAD'}),env)).text(),'');
});
