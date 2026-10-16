// PREVIEW_PASSWORD يُحفظ في Cloudflare Secrets وحدها، ولا يدخل ملفات التطبيق.
const securityHeaders={
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
export async function authorized(request,password){
 if(!password)return false;
 const value=request.headers.get('Authorization')||'';if(!value.startsWith('Basic '))return false;
 let credential;try{credential=atob(value.slice(6));}catch{return false;}
 const expected='teacher:'+password;
 const hashes=await Promise.all([credential,expected].map(s=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
 const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
export function assetResponse(request,assets){
 const url=new URL(request.url);let path;try{path=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
 if(path==='/')path='/index.html';
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...securityHeaders,Allow:'GET, HEAD'}});
 const asset=assets[path];if(!asset)return new Response('Not found',{status:404,headers:securityHeaders});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{...securityHeaders,'Content-Type':asset.type,...(asset.encoding?{'Content-Encoding':asset.encoding}:{}),'Cache-Control':path==='/sw.js'?'no-cache':'private, max-age=0, must-revalidate','Service-Worker-Allowed':'/'}});
}
export default {
 async fetch(request,env){
  if(!await authorized(request,env.PREVIEW_PASSWORD))return new Response('Private preview',{status:401,headers:{...securityHeaders,'WWW-Authenticate':'Basic realm="Al Musaed private preview", charset="UTF-8"','Cache-Control':'no-store'}});
  return assetResponse(request,globalThis.__MUSAED_ASSETS__||{});
 }
};
