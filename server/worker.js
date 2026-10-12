import {registerAccount,maintenanceTick,cleanupInvites} from './retention.js';
import {cutoffs} from '../retention-core.mjs';
import {removeMeal} from './meals.js';
import {identity,database} from './firebase.js';
import {authAction,sql,problem} from './auth.js';
import {hash,subscribe,queuePush,deliver,cleanup} from './push.js';
import {syncRoutine,scheduleRoutines} from './reminders.js';
import {githubIdentity,communityCatalog,saveCommunity,removeCommunity,pendingFoods,acknowledgeFoods} from './foods.js';
const idOK=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const dayOK=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function messageInput(b,person){
  if(!idOK(b.id)||!idOK(b.member)||!['meal','comment'].includes(b.kind)||!dayOK(b.date)||typeof b.text!=='string'||!b.text.trim()||b.text.length>(b.kind==='meal'?300:600))throw problem('내용과 날짜를 확인해 주세요.');
  if(b.date>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw problem('미래 날짜에는 등록할 수 없어요.');
  if(b.date<cutoffs().before)throw problem('1년이 지난 기록은 등록할 수 없어요.');
  if(b.kind==='meal'&&(b.member!==person.sub||!['breakfast','lunch','snack','dinner'].includes(b.meal)))throw problem('내 식단만 등록할 수 있어요.',403);
  if(b.kind==='comment'&&!idOK(b.mealId))throw problem('코멘트를 남길 식단을 선택해 주세요.');
  const extra={};
  if(b.sticker!==undefined){if(b.kind!=='comment'||!['good','best','cheer','seen','miss','retry','rest','steady'].includes(b.sticker))throw problem('이모티콘을 확인해 주세요.');extra.sticker=b.sticker;}
  for(const key of ['calories','calorieGoal'])if(b[key]!==undefined){if(b.kind!=='meal'||!Number.isFinite(b[key])||b[key]<0||b[key]>10000)throw problem('칼로리를 확인해 주세요.');extra[key]=Math.round(b[key]);}
  if(b.nutritionComplete!==undefined){if(b.kind!=='meal'||typeof b.nutritionComplete!=='boolean')throw problem('계산 결과를 확인해 주세요.');extra.nutritionComplete=b.nutritionComplete;}
  if(b.nutritionMethod!==undefined){if(b.kind!=='meal'||!['manual','mfds-20260828','catalog-v1'].includes(b.nutritionMethod))throw problem('계산 기준을 확인해 주세요.');extra.nutritionMethod=b.nutritionMethod;}
  return {...extra,kind:b.kind,date:b.date,text:b.text.trim(),authorUid:person.sub,authorName:String(person.name||person.email?.split('@')[0]||'TEMPO').slice(0,60),...(b.kind==='meal'?{meal:b.meal}:{mealId:b.mealId})};
}
export async function publish(b,person,env,token,services={database,queuePush}){
  const profile=await services.database(env,'tempo/coaching/profiles/'+person.sub,{token});
  const data=messageInput(b,{...person,name:profile?.name||person.name}),path='tempo/coaching/feed/'+b.member+'/'+b.id;
  const previous=await services.database(env,path,{token});
  if(previous){
    // Retry the same durable client ID after a lost response, without editing history.
    for(const k of ['kind','date','text','authorUid','meal','mealId','sticker','calories','calorieGoal','nutritionComplete','nutritionMethod'])if(previous[k]!==data[k])throw problem('같은 등록 번호에 다른 내용이 있어요.',409);
  }else await services.database(env,path,{token,method:'PUT',body:{...data,createdAt:{'.sv':'timestamp'}}});
  const saved=previous||await services.database(env,path,{token});
  const links=await services.database(env,'tempo/coaching/links/'+b.member);
  const recipients=data.kind==='meal'?Object.keys(links||{}):links?.[person.sub]?[b.member]:[];
  await services.queuePush(env,b.member,{...saved,id:b.id},recipients);
  return {ok:true,recipients:recipients.length};
}
async function readBody(request,max=16000){const reader=request.body?.getReader();if(!reader)return {};let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw problem('요청 내용이 너무 커요.',413)}parts.push(value)}const all=new Uint8Array(size);let at=0;for(const p of parts){all.set(p,at);at+=p.length}try{return JSON.parse(new TextDecoder().decode(all)||'{}')}catch{throw problem('잘못된 요청이에요.')}}
async function rate(env,key,max){const bucket=await hash(key)+'-'+Math.floor(Date.now()/600000);await sql(env,'INSERT INTO rates(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1',bucket,Date.now()+600000).run();if((await sql(env,'SELECT count FROM rates WHERE id=?',bucket).first()).count>max)throw problem('요청이 많아요. 잠시 후 다시 시도해 주세요.',429);}
export default {
  async fetch(request,env,ctx){
    const origin=request.headers.get('Origin'),path=new URL(request.url).pathname;
    const headers={'Access-Control-Allow-Origin':env.APP_ORIGIN,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    const answer=(data,status=200)=>Response.json(data,{status,headers});
    if(origin&&origin!==env.APP_ORIGIN)return answer({error:'허용되지 않은 사이트예요.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{
      if(path==='/health'&&request.method==='GET'){await sql(env,'SELECT 1').first();return answer({ok:true,version:'1.2.0'});}
      if(path==='/config'&&request.method==='GET')return answer({publicKey:env.VAPID_PUBLIC_KEY});
      if(path==='/foods/catalog'&&request.method==='GET')return answer(await communityCatalog(env));
      if(!['POST','DELETE'].includes(request.method))throw problem('지원하지 않는 요청이에요.',405);
      const b=await readBody(request,path==='/foods/sync/ack'?128000:16000);
      if(path==='/jobs/run'){
        await githubIdentity((request.headers.get('Authorization')||'').replace(/^Bearer /,''));
        await runScheduled({scheduledTime:Math.floor(Date.now()/900000)*900000},env);
        return answer({ok:true});
      }
      if(path==='/foods/sync/pending'||path==='/foods/sync/ack'){
        await githubIdentity((request.headers.get('Authorization')||'').replace(/^Bearer /,''));
        return answer(path.endsWith('/pending')?await pendingFoods(env):await acknowledgeFoods(env,b));
      }
      if(path.startsWith('/auth/login/')){await rate(env,'login-'+(request.headers.get('CF-Connecting-IP')||'unknown'),30);return answer(await authAction(path.slice(6),b,env,null));}
      const person=await identity(request,env),token=request.headers.get('Authorization').slice(7);
      await rate(env,person.sub,360);
      if(path==='/foods/catalog')return answer(await communityCatalog(env,person.sub));
      if(path==='/foods/save'||path==='/foods/remove'){
        await rate(env,'food-'+person.sub,20);
        const profile=await database(env,'tempo/coaching/profiles/'+person.sub,{token});if(!profile?.registered)throw problem('사용자 등록을 먼저 완료해 주세요.',403);
        return answer(path.endsWith('/save')?await saveCommunity(env,person.sub,b):await removeCommunity(env,person.sub,b.id));
      }
      if(path.startsWith('/auth/'))return answer(await authAction(path.slice(6),b,env,person));
      if(path==='/account/ready'){await registerAccount(env,person.sub);return answer({ok:true});}
      if(path==='/publish'){const result=await publish(b,person,env,token);ctx.waitUntil(deliver(env,b.id));return answer(result);}
      if(path==='/meal/remove')return answer(await removeMeal(env,person,b.id,token));
      if(path==='/routine/sync'){await registerAccount(env,person.sub);return answer(await syncRoutine(env,person,b,token));}
      if(path==='/routine/settings'){const settings=await sql(env,'SELECT enabled FROM routine_settings WHERE uid=?',person.sub).first();return answer({enabled:settings?settings.enabled===1:true});}
      if(path==='/push/subscribe')return answer(await subscribe(env,person.sub,b));
      if(path==='/push/unsubscribe'){if(typeof b.endpoint!=='string')throw problem('기기 정보가 없어요.');await sql(env,'DELETE FROM devices WHERE id=? AND uid=?',await hash(b.endpoint),person.sub).run();return answer({ok:true});}
      if(path==='/push/test'){
        const id='test-'+crypto.randomUUID();const d=await sql(env,'SELECT id FROM devices WHERE id=? AND uid=?',await hash(String(b.endpoint||'')),person.sub).first();
        if(!d)throw problem('이 기기에서 먼저 알림을 켜 주세요.');
        await sql(env,'INSERT INTO deliveries(id,device_id,recipient,member,author,kind,message_id,created_at) VALUES(?,?,?,?,?,?,?,?)',id,d.id,person.sub,person.sub,person.sub,'test',id,Date.now()).run();
        await deliver(env,id);const row=await sql(env,'SELECT state FROM deliveries WHERE id=?',id).first();return answer({ok:true,state:row.state});
      }
      if(path==='/presence'){
        const member=b.member==='*'?'*':idOK(b.member)?b.member:person.sub;
        await sql(env,'INSERT INTO presence(uid,member,active_until) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET member=excluded.member,active_until=excluded.active_until',person.sub,member,b.active===true?Date.now()+45000:0).run();return answer({ok:true});
      }
      throw problem('지원하지 않는 요청이에요.',404);
    }catch(error){return answer({error:error.status?error.message:'처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'},error.status||500);}
  },
  async scheduled(event,env){await runScheduled(event,env);}
};
export async function runScheduled(event,env,jobs={scheduleRoutines,deliver,maintenanceTick,cleanup,cleanupInvites}){
  const stages=['scheduleRoutines','deliver','maintenanceTick'];
  if(new Date(event.scheduledTime).getUTCMinutes()%15===0)stages.push('cleanup','cleanupInvites');
  const failed=[];
  for(const stage of stages){try{await jobs[stage](env)}catch(error){failed.push(stage);console.error('Scheduled task failed:',stage,String(error?.message||'unknown').slice(0,120))}}
  // Overwrite one status row; no personal data or growing execution log.
  await sql(env,"INSERT INTO job_status(name,last_run,failed) VALUES('minute',?,?) ON CONFLICT(name) DO UPDATE SET last_run=excluded.last_run,failed=excluded.failed",Date.now(),failed.join(',')).run();
  if(failed.length)throw Error('Scheduled tasks failed: '+failed.join(','));
}
