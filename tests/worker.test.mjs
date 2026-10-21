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
  assert.equal(response.status,['/','/index.html'].includes(path)?200:401);
  if(response.status===200){const html=await response.text();assert(html.includes('action="/login"'));assert(!response.headers.has('WWW-Authenticate'));}
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

const postLogin=(password,extra={})=>new Request('https://app/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://app',...extra},body:new URLSearchParams({username:'teacher',password})});
test('Arabic login form works without a browser authentication popup and keeps assets private',async()=>{
 const env={PREVIEW_PASSWORD:'correct',ASSETS:{fetch:async()=>new Response('private-app')}};
 const page=await worker.fetch(new Request('https://app/'),env);
 assert.equal(page.status,200);assert.equal(page.headers.get('Cache-Control'),'no-store');assert(!page.headers.has('WWW-Authenticate'));
 const html=await page.text();assert(html.includes('lang="ar"'));assert(html.includes('type="password"'));assert(!html.includes('correct'));
 const wrong=await worker.fetch(postLogin('wrong'),env);assert.equal(wrong.status,401);assert(!wrong.headers.has('WWW-Authenticate'));assert(!wrong.headers.has('Set-Cookie'));assert((await wrong.text()).includes('كلمة المرور غير صحيحة'));
 const signedIn=await worker.fetch(postLogin('correct'),env);assert.equal(signedIn.status,303);assert.equal(signedIn.headers.get('Location'),'/');
 const cookie=signedIn.headers.get('Set-Cookie');for(const flag of ['__Host-musaed_session=','Secure','HttpOnly','SameSite=Lax','Path=/'])assert(cookie.includes(flag));assert(!cookie.includes('correct'));
 const session=cookie.split(';')[0];
 for(const path of ['/','/src/app.js','/sw.js']){
  const response=await worker.fetch(new Request('https://app'+path,{headers:{Cookie:session}}),env);assert.equal(response.status,200);assert.equal(await response.text(),'private-app');
 }
 assert.equal((await worker.fetch(new Request('https://app/src/app.js'),env)).status,401);
});
test('session signatures reject tampering, other hosts, password changes and expired sessions',async()=>{
 const env={PREVIEW_PASSWORD:'correct',ASSETS:{fetch:async()=>new Response('private-app')}};
 const response=await worker.fetch(postLogin('correct'),env),cookie=response.headers.get('Set-Cookie').split(';')[0];
 const denied=async(value,host='app',settings=env)=>assert.equal((await worker.fetch(new Request('https://'+host+'/src/app.js',{headers:{Cookie:value}}),settings)).status,401);
 await denied(cookie.replace(/([^.])([^.]{42})$/,(_,first,rest)=>(first==='A'?'B':'A')+rest));await denied(cookie,'other');await denied(cookie,'app',{...env,PREVIEW_PASSWORD:'changed'});await denied('__Host-musaed_session=invalid');
 const now=Date.now();const clock=test.mock.method(Date,'now',()=>now+8*24*60*60*1000);
 try{await denied(cookie);}finally{clock.mock.restore();}
});
test('login rejects foreign-origin requests and bounds submitted form data',async()=>{
 const env={PREVIEW_PASSWORD:'correct'};
 assert.equal((await worker.fetch(postLogin('correct',{Origin:'https://other'}),env)).status,403);
 assert.equal((await worker.fetch(postLogin('correct',{'Content-Type':'text/plain'}),env)).status,415);
 assert.equal((await worker.fetch(postLogin('x'.repeat(3000)),env)).status,413);
 assert.equal((await worker.fetch(postLogin('correct'),{})).status,503);
});
