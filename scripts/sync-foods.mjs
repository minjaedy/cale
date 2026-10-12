// Runs only in this repository's GitHub Actions job. No durable GitHub token
// is sent to the app, Firebase, or Cloudflare.
const REPO='minjaedy/cale',SERVER='https://tempo-coach.couple-private-push.workers.dev';
async function response(r){if(!r.ok)throw Error('HTTP '+r.status+' from '+new URL(r.url).hostname);return r.status===204?{}:r.json();}
const oidcURL=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);oidcURL.searchParams.set('audience','tempo-food-sync');
const {value:oidc}=await response(await fetch(oidcURL,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}}));
const server=(path,body={})=>fetch(SERVER+path,{method:'POST',headers:{Authorization:'Bearer '+oidc,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)}).then(response);
const github=(path,body,method=body?'POST':'GET')=>fetch('https://api.github.com/repos/'+REPO+path,{method,headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)}).then(response);
const pending=await server('/foods/sync/pending');
if(!pending.changes.length&&pending.commit){console.log('Food data is current.');process.exit(0);}
let ref=null;
const refResponse=await fetch('https://api.github.com/repos/'+REPO+'/git/ref/heads/food-data',{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'}});
if(refResponse.status!==404)ref=await response(refResponse);
let foods={};
if(ref){const head=await github('/git/commits/'+ref.object.sha),tree=await github('/git/trees/'+head.tree.sha),entry=tree.tree.find(f=>f.path==='community-foods.json');if(!entry)throw Error('Missing community food data');const blob=await github('/git/blobs/'+entry.sha),data=JSON.parse(Buffer.from(blob.content,'base64'));foods=Object.fromEntries(data.foods.map(f=>[f.id,f]));}
for(const change of pending.changes){if(change.deleted)delete foods[change.id];else{
  const f=change.food;
  // Explicit allowlist: never export account ids, email, meals or ownership data.
  foods[change.id]={id:change.id,name:f.name,amount:f.amount,unit:f.unit,calories:f.calories,revision:change.revision,updatedAt:f.updatedAt,source:'community'};
}}
const content=JSON.stringify({version:1,updatedAt:new Date().toISOString(),foods:Object.values(foods).sort((a,b)=>a.id.localeCompare(b.id))},null,2)+'\n';
const blob=await github('/git/blobs',{content,encoding:'utf-8'});
const tree=await github('/git/trees',{tree:[{path:'community-foods.json',mode:'100644',type:'blob',sha:blob.sha}]});
const commit=await github('/git/commits',{message:'Update shared food catalog ('+pending.changes.length+' changes)',tree:tree.sha,parents:ref?[ref.object.sha]:[]});
if(ref)await github('/git/refs/heads/food-data',{sha:commit.sha,force:false},'PATCH');else await github('/git/refs',{ref:'refs/heads/food-data',sha:commit.sha});
const changes=pending.changes.map(({id,revision,deleted})=>({id,revision,deleted}));
for(let attempt=0;;attempt++)try{await server('/foods/sync/ack',{commit:commit.sha,changes});break}catch(e){if(attempt===4)throw e;await new Promise(resolve=>setTimeout(resolve,4000));}
console.log('GitHub food catalog saved:',Object.keys(foods).length,'foods;',changes.length,'changes.');
