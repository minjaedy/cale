import {demoHTML} from './demo-page.mjs';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const files=['demo.js','routine-plan.js','calendar-core.mjs','index.html','styles.css','coaching.css','coaching-ui.js','coaching.js','invite-core.mjs','coach-schedule.mjs','passkey-browser.js','updates.js','firebase-config.js','firebase-sync.js','sync-core.mjs','account-core.mjs','account-ui.js','stickers.js','nutrition-core.mjs','nutrition-ui.js','retention-core.mjs','custom-foods.mjs','food-catalog.json','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png','icon-1024.png','sw.js','offline.html'];
const html=await readFile('index.html','utf8');
for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script);
JSON.parse(await readFile('database.rules.json','utf8'));
await mkdir('dist',{recursive:true});
const hash=createHash('sha256');for(const file of files)hash.update((await readFile(file)).toString().replace(/\r\n/g,'\n'));
const version=hash.digest('hex').slice(0,16);
for(const file of files){if(/\.(html|css|js|mjs)$/.test(file))await writeFile('dist/'+file,(await readFile(file,'utf8')).replaceAll('__TEMPO_BUILD__',version).replaceAll('?v=3','?v='+version));else await copyFile(file,'dist/'+file);}
await writeFile('dist/version.json',JSON.stringify({id:version,version:'1.2.0'})+'\n');
await writeFile('dist/demo.html',demoHTML(html).replaceAll('__TEMPO_BUILD__',version).replaceAll('?v=3','?v='+version));
await writeFile('dist/.nojekyll','');
console.log('TEMPO static build ready: dist/');
