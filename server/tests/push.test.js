import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes} from 'node:crypto';
import webpush from 'web-push';
import {environment} from './helpers.js';
import {subscribe,queuePush,deliver,validSubscription,cleanup} from '../push.js';
import {publish,messageInput} from '../worker.js';
import {localClock,syncRoutine,scheduleRoutines} from '../reminders.js';
function sub(){const e=createECDH('prime256v1');e.generateKeys();return {endpoint:'https://web.push.apple.com/test-'+crypto.randomUUID(),keys:{p256dh:e.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
test('push delivery is deduplicated, retries failures, respects unlink and removes expired subscriptions',async()=>{
  const env=environment(),vapid=webpush.generateVAPIDKeys();env.VAPID_PUBLIC_KEY=vapid.publicKey;env.VAPID_PRIVATE_KEY=vapid.privateKey;
  let sent=0,linked=true,response=201;const services={database:async()=>linked?{createdAt:1}:null,fetch:async()=>{sent++;return new Response(null,{status:response})}};
  try{
    await subscribe(env,'coach',sub());const meal={id:'meal1',kind:'meal',authorUid:'member',createdAt:Date.now()};
    await queuePush(env,'member',meal,['coach']);await queuePush(env,'member',meal,['coach']);await deliver(env,null,services);await deliver(env,null,services);assert.equal(sent,1);
    response=503;await queuePush(env,'member',{...meal,id:'meal2'},['coach']);await deliver(env,null,services);assert.equal(sent,2);env.sqlite.exec('UPDATE deliveries SET next_at=0');response=201;await deliver(env,null,services);assert.equal(sent,3);
    linked=false;await queuePush(env,'member',{...meal,id:'meal3'},['coach']);await deliver(env,null,services);assert.equal(sent,3);
    linked=true;response=410;await queuePush(env,'member',{...meal,id:'meal4'},['coach']);await deliver(env,null,services);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM devices').get().n,0);
    assert.equal(validSubscription({...sub(),endpoint:'https://localhost/secret'}),false);assert.equal(validSubscription({...sub(),endpoint:'https://web.push.apple.com.attacker.test/x'}),false);
    env.sqlite.exec('UPDATE deliveries SET created_at=1');await cleanup(env);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM deliveries').get().n,0);
  }finally{env.sqlite.close()}
});
test('meals notify linked trainers; comments notify the member; retry does not rewrite the record',async()=>{
  let store={},writes=0,recipients=[];const services={database:async(_,path,options={})=>{if(path.includes('/links/'))return {coach:{createdAt:1}};if(options.method==='PUT'){writes++;store[path]={...options.body,createdAt:Date.now()};return store[path]}return store[path]||null},queuePush:async(_,member,message,to)=>recipients=to};
  const env=environment(),date=new Date().toISOString().slice(0,10),meal={id:'m1',member:'member',kind:'meal',date,meal:'lunch',text:'밥'};
  try{await publish(meal,{sub:'member'},env,'token',services);assert.deepEqual(recipients,['coach']);await publish(meal,{sub:'member'},env,'token',services);assert.equal(writes,1);await assert.rejects(()=>publish({...meal,text:'tampered'},{sub:'member'},env,'token',services));
    await publish({id:'c1',member:'member',kind:'comment',date,mealId:'m1',text:'잘 드셨어요.'},{sub:'coach'},env,'token',services);assert.deepEqual(recipients,['member']);assert.throws(()=>messageInput({...meal,member:'other'},{sub:'member'}));
  }finally{env.sqlite.close()}
});
test('routine schedules use the user timezone, skip weekends, deduplicate and honor edits and disabled settings',async()=>{
  const env=environment(),person={sub:'member'},at=Date.parse('2026-10-12T10:30:00Z');
  try{
    assert.deepEqual(localClock(at,'Asia/Seoul'),{date:'2026-10-12',day:0,minute:1170});
    await subscribe(env,'member',sub());let events={e1:{day:0,start:'19:30',title:'근력 · 하체',cat:'str'}};
    await syncRoutine(env,person,{enabled:true,timeZone:'Asia/Seoul'},'token',async()=>events);
    await scheduleRoutines(env,at);await scheduleRoutines(env,at+60000);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM deliveries').get().n,1);assert.equal(env.sqlite.prepare('SELECT title FROM deliveries').get().title,'19:30 · 근력');
    events={};await syncRoutine(env,person,{enabled:true,timeZone:'Asia/Seoul'},'token',async()=>events);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM routine_events').get().n,0);
    await syncRoutine(env,person,{enabled:false,timeZone:'Asia/Seoul'},'token',async()=>({e2:{day:0,start:'19:31',title:'준비',cat:'life'}}));await scheduleRoutines(env,at+60000);assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM deliveries').get().n,1);
    await assert.rejects(()=>syncRoutine(env,person,{enabled:true,timeZone:'INVALID'},'token',async()=>events));
  }finally{env.sqlite.close()}
});
