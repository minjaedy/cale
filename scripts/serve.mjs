import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),allowed=new Set(['/','/index.html','/firebase-config.js','/firebase-sync.js','/sync-core.mjs']);
http.createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(!allowed.has(url.pathname)){res.writeHead(404);return res.end('Not found');}const file=url.pathname==='/'?'index.html':url.pathname.slice(1);try{const body=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(8765,'127.0.0.1',()=>console.log('TEMPO: http://127.0.0.1:8765'));
