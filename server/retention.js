import {customToken,database} from './firebase.js';
import {sql} from './auth.js';
import {cutoffs,pruneDays} from '../retention-core.mjs';
export async function registerAccount(env,uid){await sql(env,'INSERT OR IGNORE INTO account_maintenance(uid,last_run) VALUES(?,0)',uid).run();}
export function dayRemovals(days,now){
  const kept=pruneDays(days,now),patch={};
  for(const [date,day] of Object.entries(days||{})){
    if(!kept[date]){patch[date]=null;continue;}
    for(const key of Object.keys(day))if(!(key in kept[date]))patch[date+'/'+key]=null;
  }
  return patch;
}
async function retentionToken(env,uid,now){
  const claims={tempo_retention:true,ownerUid:uid,...cutoffs(now)};
  const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+env.FIREBASE_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:await customToken(env,'tempo-maintenance',claims),returnSecureToken:true}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('Retention authentication failed');return (await r.json()).idToken;
}
export async function maintainAccount(env,uid,now=Date.now(),services={database,retentionToken}){
  const token=await services.retentionToken(env,uid,now),{before,seenBefore}=cutoffs(now),endAt=new Date(Date.parse(before+'T00:00:00Z')-86400000).toISOString().slice(0,10),options={token};
  // At most 365 date nodes. Older fields are removed without rewriting retained weights.
  const path='tempo/users/'+uid+'/days',days=await services.database(env,path,{...options,query:{orderBy:'$key',endAt,limitToFirst:400}});
  const patch=dayRemovals(days,now);if(Object.keys(patch).length)await services.database(env,path,{...options,method:'PATCH',body:patch});
  const feedPath='tempo/coaching/feed/'+uid,feed=await services.database(env,feedPath,{...options,query:{orderBy:'date',endAt,limitToFirst:100}});
  if(Object.keys(feed||{}).length)await services.database(env,feedPath,{...options,method:'PATCH',body:Object.fromEntries(Object.keys(feed).map(id=>[id,null]))});
  const seenPath='tempo/coaching/seen/'+uid,seen=await services.database(env,seenPath,{...options,query:{orderBy:'$value',endAt:seenBefore-1,limitToFirst:100}});
  if(Object.keys(seen||{}).length)await services.database(env,seenPath,{...options,method:'PATCH',body:Object.fromEntries(Object.keys(seen).map(id=>[id,null]))});
  return Object.keys(feed||{}).length===100||Object.keys(seen||{}).length===100||Object.keys(days||{}).length===400;
}
export async function maintenanceTick(env,now=Date.now()){
  const row=await sql(env,'SELECT uid FROM account_maintenance WHERE last_run < ? ORDER BY last_run LIMIT 1',now-3600000).first();if(!row)return;
  try{const more=await maintainAccount(env,row.uid,now);await sql(env,'UPDATE account_maintenance SET last_run=? WHERE uid=?',more?now-3600000:now,row.uid).run();}
  catch(error){await sql(env,'UPDATE account_maintenance SET last_run=? WHERE uid=?',now-3500000,row.uid).run();console.error('Account retention retry scheduled:',String(error?.message||'unknown').slice(0,120));}
}
export async function cleanupInvites(env,now=Date.now()){
  // Allow for clock skew between Workers and RTDB's rules clock.
  const path='tempo/coaching/invites',rows=await database(env,path,{query:{orderBy:'expiresAt',endAt:now-60000,limitToFirst:100}});
  if(Object.keys(rows||{}).length)await database(env,path,{method:'PATCH',body:Object.fromEntries(Object.keys(rows).map(id=>[id,null]))});
}
