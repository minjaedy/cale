import test from 'node:test';
import assert from 'node:assert/strict';
import {dayRemovals,maintainAccount,registerAccount} from '../retention.js';
import {environment} from './helpers.js';
import {messageInput,runScheduled} from '../worker.js';
import {syncRoutine,scheduleRoutines} from '../reminders.js';
test('cleanup removes daily records together but preserves weights under one year',async()=>{
  const now=Date.parse('2026-10-12T10:00:00Z'),days={'2026-09-01':{weight:80,weeklyWeight:79,lunch:'밥',items:{a:true},completed:{b:true},updatedAt:now},'2024-01-01':{weight:90,updatedAt:1},'2026-10-12':{lunch:'오늘',updatedAt:now}};
  assert.deepEqual(dayRemovals(days,now),{'2026-09-01/lunch':null,'2026-09-01/items':null,'2026-09-01/completed':null,'2024-01-01':null});
  const calls=[],service={retentionToken:async()=> 'scoped',database:async(e,p,o)=>{calls.push([p,o]);if(o.method)return null;return p.endsWith('/days')?days:p.includes('/feed/')?{meal:{},comment:{}}:{seen:1}}};
  assert.equal(await maintainAccount({},'member',now,service),false);
  const feed=calls.find(([p,o])=>p.includes('/feed/')&&o.method);assert.deepEqual(feed[1].body,{meal:null,comment:null});assert.equal(feed[1].token,'scoped');
  const env=environment();try{await registerAccount(env,'member');await registerAccount(env,'member');assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM account_maintenance').get().n,1)}finally{env.sqlite.close()}
});
test('server rejects expired meals and invalid nutrition, accepts sticker with text',()=>{
  const base={id:'m',member:'user',kind:'meal',date:new Date().toISOString().slice(0,10),meal:'lunch',text:'밥',calories:332,nutritionComplete:true};
  assert.equal(messageInput(base,{sub:'user'}).calories,332);assert.throws(()=>messageInput({...base,calories:-1},{sub:'user'}));assert.throws(()=>messageInput({...base,date:'2024-01-01'},{sub:'user'}));
  const comment=messageInput({id:'c',member:'user',kind:'comment',mealId:'m',date:base.date,text:'꾸준히 해봐요',sticker:'steady'},{sub:'coach'});assert.equal(comment.sticker,'steady');assert.equal(comment.text,'꾸준히 해봐요');
});
test('Sunday routine is scheduled like weekdays',async()=>{
  const env=environment();try{
    await syncRoutine(env,{sub:'member'},{timeZone:'Asia/Seoul'},'token',async()=>({sun:{day:6,start:'09:00',title:'산책',cat:'cardio'}}));
    env.sqlite.prepare('INSERT INTO devices(id,uid,subscription,updated_at) VALUES(?,?,?,?)').run('dev','member','{}',1);
    await scheduleRoutines(env,Date.parse('2026-10-18T00:00:00Z'));assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM deliveries').get().n,1);
  }finally{env.sqlite.close()}
});
test('a push failure does not prevent retention, and minute status stays bounded',async()=>{
  const env=environment(),called=[];
  const jobs=Object.fromEntries(['scheduleRoutines','deliver','maintenanceTick','cleanup','cleanupInvites'].map(name=>[name,async()=>{called.push(name);if(name==='deliver')throw Error('Test delivery failure')} ]));
  try{
    await assert.rejects(()=>runScheduled({scheduledTime:Date.parse('2026-10-12T10:00:00Z')},env,jobs));
    assert.deepEqual(called,['scheduleRoutines','deliver','maintenanceTick','cleanup','cleanupInvites']);
    assert.equal(env.sqlite.prepare('SELECT failed FROM job_status').get().failed,'deliver');
    jobs.deliver=async()=>{};await runScheduled({scheduledTime:Date.parse('2026-10-12T10:01:00Z')},env,jobs);
    assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM job_status').get().n,1);
    assert.equal(env.sqlite.prepare('SELECT failed FROM job_status').get().failed,'');
  }finally{env.sqlite.close()}
});
