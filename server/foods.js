import {createRemoteJWKSet,jwtVerify} from 'jose';
import {customFoodInput} from '../custom-foods.mjs';
import {sql,problem} from './auth.js';
import {hash} from './push.js';
const REPO='minjaedy/cale',AUDIENCE='tempo-food-sync';
const githubKeys=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'));
export async function githubIdentity(token,keySet=githubKeys){
  const {payload:p}=await jwtVerify(token,keySet,{algorithms:['RS256'],issuer:'https://token.actions.githubusercontent.com',audience:AUDIENCE,maxTokenAge:'10m'});
  if(p.repository!==REPO||String(p.repository_id)!=='1415255546'||String(p.repository_owner_id)!=='310518298'||p.ref!=='refs/heads/main'||p.workflow_ref!==REPO+'/.github/workflows/foods.yml@refs/heads/main'||!['schedule','workflow_dispatch'].includes(p.event_name))throw problem('허용되지 않은 동기화 작업입니다.',403);
  return p;
}
export function publicFood(id,food,revision,updatedAt){return {id,...customFoodInput(food),revision,updatedAt,source:'community'};}
export async function publishedFoods(env,commit){
  if(!commit)return {};
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid food revision');
  const url='https://raw.githubusercontent.com/'+REPO+'/'+commit+'/community-foods.json';
  const response=await fetch(url,{cf:{cacheTtl:86400,cacheEverything:true},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw problem('공용 음식 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',503);
  const data=await response.json();if(data.version!==1||!Array.isArray(data.foods)||data.foods.length>20000)throw Error('Invalid food catalog');
  return Object.fromEntries(data.foods.map(f=>[f.id,publicFood(f.id,f,f.revision,f.updatedAt)]));
}
async function revision(env){return (await sql(env,"SELECT value FROM food_meta WHERE key='commit'").first())?.value||null;}
export async function communityCatalog(env,uid,load=publishedFoods){
  const commit=await revision(env),base=await load(env,commit),rows=(await sql(env,'SELECT id,payload,deleted FROM community_foods WHERE dirty=1 ORDER BY updated_at LIMIT 500').all()).results;
  for(const row of rows){if(row.deleted)delete base[row.id];else base[row.id]=JSON.parse(row.payload);}
  const mine=uid?(await sql(env,'SELECT id FROM community_foods WHERE owner_hash=? AND deleted=0',await hash(uid)).all()).results.map(r=>r.id):[];
  return {foods:base,mine,commit,pending:rows.length};
}
export async function saveCommunity(env,uid,b,now=Date.now()){
  let food;try{food=customFoodInput(b.food||{})}catch(e){throw problem(e.message)}const owner=await hash(uid),id=b.id||await hash(food.name.replace(/\s/g,'').normalize('NFC').toLowerCase());
  if(!/^[a-f0-9]{64}$/.test(id))throw problem('음식을 다시 선택해 주세요.');
  if(/https?:|www\.|@|\d{3}[- ]?\d{3,4}[- ]?\d{4}/i.test(food.name))throw problem('음식 이름에 연락처나 주소를 넣지 마세요.');
  const old=await sql(env,'SELECT * FROM community_foods WHERE id=?',id).first();
  if(old&&old.owner_hash!==owner)throw problem('이미 등록된 음식입니다. 다른 제품이면 제품명을 포함해 주세요.',409);
  // A stable normalized-name id makes retries and simultaneous first submissions safe.
  if(b.id&&await hash(food.name.replace(/\s/g,'').normalize('NFC').toLowerCase())!==id)throw problem('이름을 바꾸려면 새 음식으로 등록해 주세요.');
  if(!old&&(await sql(env,'SELECT COUNT(*) AS n FROM community_foods WHERE owner_hash=? AND deleted=0',owner).first()).n>=200)throw problem('등록한 음식은 200개까지 관리할 수 있어요.');
  if(!old&&(await sql(env,'SELECT COUNT(*) AS n FROM community_foods WHERE dirty=1').first()).n>=500)throw problem('음식 DB 저장 중입니다. 잠시 후 등록해 주세요.',503);
  const rev=crypto.randomUUID(),value=publicFood(id,food,rev,now);
  const result=await sql(env,'INSERT INTO community_foods(id,owner_hash,payload,revision,dirty,deleted,updated_at) VALUES(?,?,?,?,1,0,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,dirty=1,deleted=0,updated_at=excluded.updated_at WHERE community_foods.owner_hash=excluded.owner_hash',id,owner,JSON.stringify(value),rev,now).run();
  if(!result.meta.changes)throw problem('이미 등록된 음식입니다.',409);
  return {ok:true,food:value};
}
export async function removeCommunity(env,uid,id,now=Date.now()){
  const r=await sql(env,'UPDATE community_foods SET payload=NULL,revision=?,dirty=1,deleted=1,updated_at=? WHERE id=? AND owner_hash=?',crypto.randomUUID(),now,String(id||''),await hash(uid)).run();
  if(!r.meta.changes)throw problem('직접 등록한 음식만 삭제할 수 있어요.',403);return {ok:true};
}
export async function pendingFoods(env){return {commit:await revision(env),changes:(await sql(env,'SELECT id,payload,revision,deleted FROM community_foods WHERE dirty=1 ORDER BY updated_at LIMIT 500').all()).results.map(r=>({id:r.id,revision:r.revision,deleted:!!r.deleted,food:r.payload?JSON.parse(r.payload):null}))};}
export async function acknowledgeFoods(env,b,load=publishedFoods){
  if(!/^[a-f0-9]{40}$/.test(b.commit||'')||!Array.isArray(b.changes)||b.changes.length>500)throw problem('잘못된 동기화 결과입니다.');
  const stored=await load(env,b.commit);
  for(const change of b.changes)if(change.deleted?stored[change.id]:stored[change.id]?.revision!==change.revision)throw problem('GitHub 데이터 확인에 실패했습니다.',409);
  // One batch: readers see either the old commit plus pending rows or the new commit.
  await env.DB.batch([
    env.DB.prepare("INSERT INTO food_meta(key,value) VALUES('commit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.commit),
    env.DB.prepare("UPDATE community_foods SET dirty=0,payload=NULL WHERE EXISTS(SELECT 1 FROM json_each(?) c WHERE json_extract(c.value,'$.id')=community_foods.id AND json_extract(c.value,'$.revision')=community_foods.revision)").bind(JSON.stringify(b.changes))
  ]);return {ok:true};
}
