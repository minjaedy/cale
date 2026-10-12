import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await import('./build.mjs');
const folder='qa/preview-public';await mkdir(folder,{recursive:true});
// Only mock UI dependencies are published. No live auth/sync, worker or secret files.
const files=['demo.js','routine-plan.js','calendar-core.mjs','styles.css','coaching.css','coaching-ui.js','account-core.mjs','account-ui.js','stickers.js','nutrition-core.mjs','nutrition-ui.js','retention-core.mjs','custom-foods.mjs','food-catalog.json','icon.svg','icon-180.png'];
for(const file of files)await copyFile('dist/'+file,folder+'/'+file);
let html=await readFile('dist/demo.html','utf8');
html=html.replace('<meta name="description"','<meta name="robots" content="noindex,nofollow">\n<meta name="description"');
if(/firebase-(config|sync)|updates\.js|serviceWorker\.register/.test(html))throw Error('Preview must not connect to production');
await writeFile(folder+'/index.html',html);await writeFile(folder+'/demo.html',html);
await writeFile('qa/firebase-preview.json',JSON.stringify({hosting:{site:'cale-b2c40',public:'preview-public',ignore:['**/.*'],headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Robots-Tag',value:'noindex,nofollow'},{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}]}]}},null,2));
console.log('Isolated preview prepared:',createHash('sha256').update(html).digest('hex').slice(0,16));
