import webpush from 'web-push';
import {sql,problem} from './auth.js';
import {database} from './firebase.js';
export const hash=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
export function validSubscription(s){
  if(!s||typeof s.endpoint!=='string'||s.endpoint.length>2048||!s.keys)return false;
  try{const u=new URL(s.endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))&&/^[A-Za-z0-9_-]{80,100}$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]{20,30}$/.test(s.keys.auth);}catch{return false;}
}
export async function subscribe(env,uid,s){
  if(!validSubscription(s))throw problem('이 브라우저의 알림 주소를 확인해 주세요.');
  const id=await hash(s.endpoint),old=await sql(env,'SELECT uid FROM devices WHERE id=?',id).first();
  const count=await sql(env,'SELECT COUNT(*) AS n FROM devices WHERE uid=?',uid).first();
  if(!old&&count.n>=10)throw problem('알림은 계정당 기기 10개까지 연결할 수 있어요.');
  await sql(env,'INSERT INTO devices(id,uid,subscription,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET uid=excluded.uid,subscription=excluded.subscription,updated_at=excluded.updated_at',id,uid,JSON.stringify(s),Date.now()).run();return {ok:true};
}
export async function queuePush(env,member,message,recipients){
  if(message.createdAt<Date.now()-7*86400000)return;
  await sql(env,"INSERT OR IGNORE INTO deliveries(id,device_id,recipient,member,author,kind,message_id,created_at) SELECT ?||'|'||?||'|'||id,id,uid,?,?,?,?,? FROM devices WHERE uid IN (SELECT value FROM json_each(?))",member,message.id,member,message.authorUid,message.kind,message.id,Date.now(),JSON.stringify(recipients)).run();
}
export async function deliver(env,onlyMessage=null,services={database,fetch:(...args)=>fetch(...args)}){
  const now=Date.now();
  // Bound the per-invocation queries to the Workers/D1 free-plan budget.
  const jobs=(await sql(env,"SELECT * FROM deliveries WHERE state!='sent' AND state!='skipped' AND attempts<8 AND next_at<=? AND lease_until<? AND (? IS NULL OR message_id=?) ORDER BY created_at LIMIT 3",now,now,onlyMessage,onlyMessage).all()).results;
  for(const job of jobs){
    let phase='prepare';
    const claim=await sql(env,"UPDATE deliveries SET state='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND lease_until<? AND state NOT IN ('sent','skipped')",now+60000,job.id,now).run();
    if(!claim.meta.changes)continue;
    try{
      const device=await sql(env,'SELECT * FROM devices WHERE id=? AND uid=?',job.device_id,job.recipient).first();
      const trainer=job.kind==='meal'?job.recipient:job.author;
      let link=['test','routine'].includes(job.kind)?true:await services.database(env,'tempo/coaching/links/'+job.member+'/'+trainer);
      if(link&&['meal','comment'].includes(job.kind)){
        const message=await services.database(env,'tempo/coaching/feed/'+job.member+'/'+job.message_id);
        link=!!message;
        if(message?.kind==='comment')link=!!await services.database(env,'tempo/coaching/feed/'+job.member+'/'+message.mealId);
      }
      if(job.kind==='routine'){
        const setting=await sql(env,'SELECT enabled FROM routine_settings WHERE uid=?',job.recipient).first();
        const event=(await sql(env,'SELECT id,minute FROM routine_events WHERE uid=?',job.recipient).all()).results.find(e=>job.message_id.startsWith('routine-'+e.id+'-')&&job.message_id.endsWith('-'+e.minute));
        link=setting?.enabled===1&&!!event&&job.created_at>Date.now()-10*60000;
      }
      const presence=await sql(env,'SELECT * FROM presence WHERE uid=? AND active_until>?',job.recipient,Date.now()).first();
      if(!device||!link||(['meal','comment'].includes(job.kind)&&presence&&(presence.member===job.member||presence.member==='*'))){await sql(env,"UPDATE deliveries SET state='skipped',lease_until=0 WHERE id=?",job.id).run();continue;}
      const title=job.kind==='meal'?'새 식단':job.kind==='comment'?'새 코멘트':job.kind==='routine'?'루틴 시작':'알림 테스트';
      const payload={title,body:job.kind==='test'?'TEMPO 알림 · 앱 아이콘 배지 확인':job.kind==='routine'?job.title:'코칭에서 확인',member:job.member,recipient:job.recipient,kind:job.kind,createdAt:job.created_at,screen:job.kind==='routine'?'routine':'coaching',tag:'tempo-'+job.message_id};
      phase='encrypt';
      const req=webpush.generateRequestDetails(JSON.parse(device.subscription),JSON.stringify(payload),{TTL:86400,vapidDetails:{subject:env.APP_URL,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});
      phase='send';
      const r=await services.fetch(req.endpoint,{method:'POST',headers:req.headers,body:req.body,redirect:'manual',signal:AbortSignal.timeout(12000)});
      if(r.status===404||r.status===410){await sql(env,'DELETE FROM devices WHERE id=?',device.id).run();await sql(env,"UPDATE deliveries SET state='skipped',lease_until=0 WHERE id=?",job.id).run();continue;}
      if(!r.ok)throw Error('Push delivery HTTP '+r.status+' '+(await r.text()).replace(/https?:\/\/\S+|[A-Za-z0-9_=-]{50,}/g,'[redacted]').slice(0,100));
      await sql(env,"UPDATE deliveries SET state='sent',lease_until=0 WHERE id=?",job.id).run();
    }catch(error){
      console.error('Push failure',phase,String(error?.message||'unknown').replace(/https?:\/\/\S+|[A-Za-z0-9_=-]{50,}/g,'[redacted]').slice(0,160));
      await sql(env,"UPDATE deliveries SET state='failed',lease_until=0,next_at=? WHERE id=?",Date.now()+Math.min(3600000,30000*2**job.attempts),job.id).run();
    }
  }
}
export async function cleanup(env){
  for(const [q,n] of [['DELETE FROM challenges WHERE expires<?',Date.now()],['DELETE FROM rates WHERE expires<?',Date.now()],['DELETE FROM presence WHERE active_until<?',Date.now()-86400000],['DELETE FROM deliveries WHERE created_at<?',Date.now()-7*86400000]])await sql(env,q,n).run();
}
