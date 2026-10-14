import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../dist');
const build=spawnSync(process.execPath,[resolve(import.meta.dirname,'build.mjs')],{stdio:'inherit'});if(build.status)process.exit(build.status);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname),file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/'))throw Error('path');const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(Number(process.env.PORT)||4173,'0.0.0.0',()=>console.log('المساعد http://localhost:'+(process.env.PORT||4173)));
