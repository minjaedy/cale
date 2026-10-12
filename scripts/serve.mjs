import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),allowed=new Set(['/','/index.html','/styles.css','/firebase-config.js','/firebase-sync.js','/sync-core.mjs','/manifest.webmanifest','/icon.svg','/icon-180.png','/icon-192.png','/icon-512.png','/icon-1024.png','/sw.js','/offline.html']);
const contentType=file=>file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/javascript; charset=utf-8';
http.createServer(async(req,res)=>{const url=new URL(req.url,'http://127.0.0.1');if(!allowed.has(url.pathname)){res.writeHead(404);return res.end('Not found');}const file=url.pathname==='/'?'index.html':url.pathname.slice(1);try{const body=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':contentType(file),'Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}}).listen(8765,'127.0.0.1',()=>console.log('TEMPO: http://127.0.0.1:8765'));
