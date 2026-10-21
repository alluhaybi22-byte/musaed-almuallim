// PREVIEW_PASSWORD يُحفظ في Cloudflare Secrets وحدها، ولا يدخل ملفات التطبيق.
const securityHeaders={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',
 'Content-Security-Policy':"default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data:; font-src 'self'; connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/; frame-src https://accounts.google.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
 'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
const SESSION_NAME='__Host-musaed_session',SESSION_SECONDS=7*24*60*60;
async function equalSecret(actual,expected){
 const hashes=await Promise.all([actual,expected].map(s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
 const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export async function authorized(request,password){
 if(!password)return false;
 const value=request.headers.get('Authorization')||'';if(!value.startsWith('Basic '))return false;
 let credential;try{credential=atob(value.slice(6));}catch{return false;}
 return equalSecret(credential,'teacher:'+password);
}
async function sessionKey(password){
 return crypto.subtle.importKey('raw',new TextEncoder().encode(password),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
function sessionMessage(host,expires,nonce){return new TextEncoder().encode('musaed-session:'+host+':'+expires+':'+nonce);}
async function makeSession(request,password){
 const expires=Math.floor(Date.now()/1000)+SESSION_SECONDS,nonce=crypto.randomUUID().replaceAll('-','');
 const signature=await crypto.subtle.sign('HMAC',await sessionKey(password),sessionMessage(new URL(request.url).host,expires,nonce));
 const encoded=btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 return `${SESSION_NAME}=${expires}.${nonce}.${encoded}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}
async function hasSession(request,password){
 if(!password)return false;
 const value=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(SESSION_NAME+'='))?.slice(SESSION_NAME.length+1);
 if(!value)return false;
 const parts=value.split('.');if(parts.length!==3)return false;
 const [expires,nonce,encoded]=parts,now=Math.floor(Date.now()/1000);
 if(!/^\d{10,12}$/.test(expires)||!/^\w{32}$/.test(nonce)||!/^[\w-]{43}$/.test(encoded)||Number(expires)<=now||Number(expires)>now+SESSION_SECONDS+60)return false;
 try{
  const signature=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')+'='),c=>c.charCodeAt(0));
  return await crypto.subtle.verify('HMAC',await sessionKey(password),signature,sessionMessage(new URL(request.url).host,expires,nonce));
 }catch{return false;}
}
function loginPage(request,message='',status=200){
 const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#1461c7"><title>الدخول إلى مساعد المعلم</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#f3f7fd;color:#173554;font:17px/1.8 Arial,sans-serif;padding:24px}.card{width:100%;max-width:420px;background:#fff;border:1px solid #dbe5f2;border-radius:24px;padding:32px;box-shadow:0 18px 60px #163e6c12}.mark{display:grid;place-items:center;width:64px;height:64px;border-radius:18px;background:#1461c7;color:#fff;margin-bottom:20px}.mark svg{width:36px;height:36px}h1{font-size:28px;margin:0 0 8px}p{margin:0 0 24px;color:#5b6e86}label{display:block;font-weight:bold;margin-bottom:8px}input,button{width:100%;font:inherit;border-radius:12px;min-height:52px}input{border:1px solid #aabdd5;padding:10px 14px;direction:ltr;text-align:left}input:focus{outline:3px solid #d4e7ff;border-color:#1461c7}button{margin-top:18px;background:#1461c7;color:white;border:0;font-weight:bold;cursor:pointer}button:hover{background:#104fa4}.error{color:#a32031;background:#fff0f2;border-radius:10px;padding:10px;margin-bottom:18px}.foot{font-size:14px;color:#667b94;margin:22px 0 0}@media(max-width:420px){body{padding:18px}.card{padding:26px}}</style></head><body><main class="card"><div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1Zm0 0v15"/></svg></div><h1>مساعد المعلم</h1><p>أدخل كلمة مرور التطبيق للمتابعة.</p>${message?'<p class="error" role="alert">'+message+'</p>':''}<form action="/login" method="post"><input type="hidden" name="username" value="teacher" autocomplete="username"><label for="password">كلمة المرور</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">دخول إلى التطبيق</button></form><p class="foot">الطلاب والنتائج محفوظون على هذا الجهاز.</p></main></body></html>`;
 return new Response(request.method==='HEAD'?null:html,{status,headers:{...securityHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}
async function login(request,password){
 if(!password)return new Response('الدخول غير متاح حاليًا',{status:503,headers:{...securityHeaders,'Cache-Control':'no-store'}});
 const origin=request.headers.get('Origin');
 if(origin&&origin!==new URL(request.url).origin)return new Response('Forbidden',{status:403,headers:securityHeaders});
 if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type')||''))return new Response('Unsupported form',{status:415,headers:securityHeaders});
 const reader=request.body?.getReader();let bytes=0,text='';const decoder=new TextDecoder();
 if(reader){try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){await reader.cancel();return new Response('Form too large',{status:413,headers:securityHeaders});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}
 const form=new URLSearchParams(text);
 if(form.get('username')!=='teacher'||!await equalSecret(form.get('password')||'',password))return loginPage(request,'كلمة المرور غير صحيحة. حاول مرة أخرى.',401);
 return new Response(null,{status:303,headers:{...securityHeaders,Location:'/','Cache-Control':'no-store','Set-Cookie':await makeSession(request,password)}});
}
export function assetResponse(request,assets){
 const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
 if(path==='/')path='/index.html';
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...securityHeaders,Allow:'GET, HEAD'}});
 const asset=assets[path];if(!asset)return new Response('Not found',{status:404,headers:securityHeaders});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{...securityHeaders,'Content-Type':asset.type,...(asset.encoding?{'Content-Encoding':asset.encoding}:{}),'Cache-Control':path==='/sw.js'?'no-cache':'private, max-age=0, must-revalidate','Service-Worker-Allowed':'/'}});
}
export async function boundAssetResponse(request,assets){
 const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400,headers:securityHeaders});}
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...securityHeaders,Allow:'GET, HEAD'}});
 if(path==='/')url.pathname='/index.html';
 const response=await assets.fetch(new Request(url,request));
 const headers=new Headers(response.headers);
 for(const [name,value] of Object.entries(securityHeaders))headers.set(name,value);
 headers.set('Cache-Control',path==='/sw.js'?'no-cache':'private, max-age=0, must-revalidate');
 headers.set('Service-Worker-Allowed','/');
 return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/login'&&request.method==='POST')return login(request,env.PREVIEW_PASSWORD);
  const allowed=await authorized(request,env.PREVIEW_PASSWORD)||await hasSession(request,env.PREVIEW_PASSWORD);
  if(!allowed){
   if(env.PREVIEW_PASSWORD&&['/','/index.html','/login'].includes(path)&&['GET','HEAD'].includes(request.method))return loginPage(request);
   return new Response('Private preview',{status:401,headers:{...securityHeaders,'WWW-Authenticate':'Basic realm="Al Musaed private preview", charset="UTF-8"','Cache-Control':'no-store'}});
  }
  if(path==='/login'&&['GET','HEAD'].includes(request.method))return new Response(null,{status:303,headers:{...securityHeaders,Location:'/','Cache-Control':'no-store'}});
  return env.ASSETS ? boundAssetResponse(request,env.ASSETS) : assetResponse(request,globalThis.__MUSAED_ASSETS__||{});
 }
};

