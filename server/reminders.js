import {sql,problem} from './auth.js';
import {database} from './firebase.js';
export function localClock(at,timeZone){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at).map(p=>[p.type,p.value]));
  return {date:parts.year+'-'+parts.month+'-'+parts.day,day:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday),minute:+parts.hour*60 + +parts.minute};
}
export async function syncRoutine(env,person,b,token,read=database){
  if(b.enabled!==undefined&&typeof b.enabled!=='boolean'||typeof b.timeZone!=='string'||b.timeZone.length>80)throw problem('알림 설정을 확인해 주세요.');
  try{localClock(Date.now(),b.timeZone)}catch{throw problem('시간대 설정을 확인해 주세요.')}
  const events=await read(env,'tempo/users/'+person.sub+'/events',{token});
  const rows=[];
  for(const [id,e] of Object.entries(events||{})){
    if(!Number.isInteger(e.day)||e.day<0||e.day>4||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.start)||typeof e.title!=='string')continue;
    const [h,m]=e.start.split(':').map(Number),title=e.cat==='str'?'근력':e.cat==='cardio'?'유산소':e.title.slice(0,40);
    rows.push({id,day:e.day,minute:h*60+m,title});
  }
  if(rows.length>200)throw problem('루틴은 200개까지 지원합니다.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM routine_events WHERE uid=?').bind(person.sub),
    env.DB.prepare('INSERT INTO routine_settings(uid,enabled,timezone) VALUES(?,COALESCE(?,1),?) ON CONFLICT(uid) DO UPDATE SET enabled=COALESCE(?,routine_settings.enabled),timezone=excluded.timezone').bind(person.sub,b.enabled===undefined?null:+b.enabled,b.timeZone,b.enabled===undefined?null:+b.enabled),
    env.DB.prepare("INSERT INTO routine_events(uid,id,day,minute,title) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.day'),json_extract(value,'$.minute'),json_extract(value,'$.title') FROM json_each(?)").bind(person.sub,JSON.stringify(rows))
  ]);
  return {ok:true,enabled:(await sql(env,'SELECT enabled FROM routine_settings WHERE uid=?',person.sub).first()).enabled===1};
}
export async function scheduleRoutines(env,now=Date.now()){
  const zones=(await sql(env,'SELECT DISTINCT timezone FROM routine_settings WHERE enabled=1').all()).results;
  const clocks=zones.flatMap(({timezone})=>[0,1,2].map(offset=>({...localClock(now-offset*60000,timezone),timezone})));
  // Bulk fan-out stays within free-plan query limits and deduplicates cron overlap.
  await sql(env,`INSERT OR IGNORE INTO deliveries(id,device_id,recipient,member,author,kind,message_id,created_at,title)
    SELECT e.uid||'|routine-'||e.id||'-'||json_extract(c.value,'$.date')||'-'||e.minute||'|'||d.id,
      d.id,e.uid,e.uid,e.uid,'routine','routine-'||e.id||'-'||json_extract(c.value,'$.date')||'-'||e.minute,?,printf('%02d:%02d',e.minute/60,e.minute%60)||' · '||e.title
    FROM json_each(?) c JOIN routine_settings s ON s.enabled=1 AND s.timezone=json_extract(c.value,'$.timezone')
    JOIN routine_events e ON e.uid=s.uid AND e.day=json_extract(c.value,'$.day') AND e.minute=json_extract(c.value,'$.minute')
    JOIN devices d ON d.uid=e.uid`,now,JSON.stringify(clocks)).run();
}
