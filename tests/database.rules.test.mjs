import {before,after,beforeEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import assert from 'node:assert/strict';
import {claimInvite} from '../invite-core.mjs';

let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-tempo',database:{host:'127.0.0.1',port:9000,rules:await readFile('database.rules.json','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>env.clearDatabase());
const owner=()=>env.authenticatedContext('alice',{firebase:{sign_in_provider:'google.com'}}).database();
const other=()=>env.authenticatedContext('bob',{firebase:{sign_in_provider:'google.com'}}).database();
const root='tempo/users/alice';
const event={day:0,title:'근력',start:'19:30',end:'20:30',cat:'str',note:''};
const record={items:{diet:true,run:false},weight:89.5,lunch:'밥과 닭가슴살',updatedAt:Date.now()};

test('first registration creates an empty or seeded calendar atomically, never overwrites an existing root',async()=>{
  const db=owner();await assertSucceeds(db.ref(root).set({meta:{initialized:true},events:{sunday:{...event,day:6,seriesId:'series1'}}}));
  await assertFails(db.ref(root).set({meta:{initialized:true}}));
  await assertSucceeds(db.ref(root+'/days/2026-10-12').set({weeklyWeight:84,updatedAt:Date.now()}));
  await assertFails(other().ref(root+'/days/2026-10-12/weeklyWeight').set(50));
});

test('profile registration stores personal goals but role cannot be switched later',async()=>{
  const p='tempo/coaching/profiles/alice';await assertSucceeds(owner().ref(p).set({role:'member',name:'민재',registered:true,calendarName:'내 루틴',age:30,height:175,startWeight:90,targetWeight:75,formulaSex:'male',activity:'moderate',nutritionMode:'auto'}));
  await assertFails(owner().ref(p+'/role').set('trainer'));await assertFails(other().ref(p).once('value'));
});

test('retention token deletes only its assigned records older than 365 days and preserves all recent fields',async()=>{
  const today=new Date().toISOString().slice(0,10),old='2026-01-01',ancient='2024-01-01';
  await env.withSecurityRulesDisabled(async c=>{await c.database().ref(root).set({events:{e:event},days:{[old]:record,[ancient]:record,[today]:record}});await c.database().ref('tempo/coaching/feed/alice').set({expired:{kind:'meal',date:ancient},recent:{kind:'meal',date:old}});});
  const db=env.authenticatedContext('tempo-maintenance',{firebase:{sign_in_provider:'custom'},tempo_retention:true,ownerUid:'alice',before:'2025-10-13',weightBefore:'2025-10-13',seenBefore:Date.now()-365*86400000}).database();
  await assertSucceeds(db.ref(root+'/days').once('value'));await assertFails(db.ref('tempo/users/bob/days').once('value'));
  await assertFails(db.ref(root+'/days/'+old).update({items:null,lunch:null}));
  await assertFails(db.ref(root+'/days/'+old).remove());await assertFails(db.ref(root+'/days/'+old+'/weight').set(75));
  await assertSucceeds(db.ref(root+'/days/'+ancient).remove());await assertFails(db.ref(root+'/days/'+today).remove());await assertFails(db.ref(root+'/events/e').remove());
  await assertSucceeds(db.ref('tempo/coaching/feed/alice/expired').remove());await assertFails(db.ref('tempo/coaching/feed/alice/recent').remove());await assertFails(db.ref('tempo/coaching/profiles/alice').set({name:'override',role:'trainer'}));
});

test('legacy users path keeps its existing owner-only access',async()=>{
  const path='users/alice/existing';
  await assertSucceeds(owner().ref(path).set({value:'legacy'}));
  await assertSucceeds(owner().ref(path).once('value'));
  await assertFails(other().ref(path).once('value'));
  await assertFails(other().ref(path).set({value:'other'}));
  await assertFails(env.unauthenticatedContext().database().ref(path).once('value'));
});

test('owner can create and read a routine and a dated record',async()=>{
  const db=owner();await assertSucceeds(db.ref(root+'/events/d0').set(event));
  await assertSucceeds(db.ref(root+'/days/2026-10-12').set(record));
  await assertSucceeds(db.ref(root).once('value'));
});
test('signed-out and anonymous clients cannot access records',async()=>{
  const guest=env.unauthenticatedContext().database();
  const anonymous=env.authenticatedContext('alice',{firebase:{sign_in_provider:'anonymous'}}).database();
  await assertFails(guest.ref(root).once('value'));
  await assertFails(guest.ref(root+'/events/d0').set(event));
  await assertFails(anonymous.ref(root+'/days/2026-10-12').set(record));
  await assertFails(anonymous.ref(root).once('value'));
});
test('another account cannot read, overwrite or delete owner data',async()=>{
  await owner().ref(root+'/days/2026-10-12').set(record);
  const db=other();await assertFails(db.ref(root).once('value'));
  await assertFails(db.ref(root+'/days/2026-10-12').set(record));
  await assertFails(db.ref(root+'/days/2026-10-12').remove());
});
test('owner cannot erase a dated record, all records, or user root',async()=>{
  const db=owner();await db.ref(root+'/days/2026-10-12').set(record);
  await assertFails(db.ref(root+'/days/2026-10-12').remove());
  await assertFails(db.ref(root+'/days').remove());
  await assertFails(db.ref(root).remove());
});
test('routine editing and deletion remain available without deleting logs',async()=>{
  const db=owner();await db.ref(root+'/events/d0').set(event);
  await assertSucceeds(db.ref(root+'/events/d0/title').set('하체 운동'));
  await assertSucceeds(db.ref(root+'/events/d0').remove());
});
test('malformed event fields, unknown keys and reversed times are rejected',async()=>{
  const db=owner();for(const bad of [{...event,day:7},{...event,day:0.5},{...event,start:'99:00'},{...event,end:'18:00'},{...event,cat:'admin'},{...event,title:'x'.repeat(41)},{...event,admin:true}])await assertFails(db.ref(root+'/events/d0').set(bad));
  await assertSucceeds(db.ref(root+'/events/d0').set({...event,start:'23:30',end:'24:00'}));
});
test('records validate dates, numeric weight, boolean habits and meal length',async()=>{
  const db=owner();for(const bad of [{...record,weight:300},{...record,weight:'90'},{...record,items:{diet:'true'}},{...record,items:'bad'},{...record,lunch:'x'.repeat(61)},{...record,admin:true},{...record,updatedAt:Date.now()+3600000}])await assertFails(db.ref(root+'/days/2026-10-12').set(bad));
  await assertFails(db.ref(root+'/days/not-a-date').set(record));
  await assertFails(db.ref(root+'/days/2026-13-12').set(record));
});
test('field-level multi-location writes preserve other fields and use server time',async()=>{
  const db=owner();await db.ref(root+'/days/2026-10-12').set(record);
  await assertSucceeds(db.ref(root).update({'days/2026-10-12/items/str':true,'days/2026-10-12/updatedAt':{'.sv':'timestamp'}}));
  const snapshot=await db.ref(root+'/days/2026-10-12').once('value');
  if(snapshot.val().weight!==89.5)throw new Error('Existing weight lost');
  await assertSucceeds(db.ref(root+'/meta/initialized').set(true));
  await assertFails(db.ref(root+'/meta/initialized').remove());
});
test('clearing one weight is allowed without deleting the dated record',async()=>{
  const db=owner();await db.ref(root+'/days/2026-10-12').set(record);
  await assertSucceeds(db.ref(root+'/days/2026-10-12/weight').remove());
});

const coachRoot='tempo/coaching';
test('every event completion is independent, persistent and owner-only',async()=>{
  const db=owner(),path=root+'/days/2026-10-12';
  await assertSucceeds(db.ref(path).set({updatedAt:Date.now(),completed:{d0:true,d1:false,d2:true},items:{str:true}}));
  await assertSucceeds(db.ref(path).update({'completed/d1':true,updatedAt:{'.sv':'timestamp'}}));
  const saved=(await db.ref(path).once('value')).val();
  if(!saved.completed.d0||!saved.completed.d1||!saved.completed.d2||!saved.items.str)throw Error('Independent completion lost');
  await assertFails(other().ref(path+'/completed/d0').set(false));
  await assertFails(db.ref(path+'/completed/d0').set('true'));
  await assertFails(db.ref(path+'/completed/bad key').set(true));
});
const client=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).database();
const code='a'.repeat(32);
const inviteStore=db=>({read:async()=>(await db.ref(coachRoot+'/invites/'+code).get()).val(),write:value=>db.ref(coachRoot+'/invites/'+code).set(value)});
async function freshInvite(){
  const member=client('alice'),trainer=client('coach');
  await member.ref(coachRoot+'/profiles/alice').set({role:'member',name:'회원'});
  await trainer.ref(coachRoot+'/profiles/coach').set({role:'trainer',name:'트레이너'});
  const invitation={member:'alice',name:'회원',expiresAt:Date.now()+3600000};
  await member.ref(coachRoot+'/invites/'+code).set(invitation);
  return {member,trainer,invitation};
}
test('a valid invite connects from an empty SDK cache and setup can resume after a claimed invite',async()=>{
  const {trainer}=await freshInvite();
  // Reproduce the original false-expiry bug: no listener or read on this client.
  const values=[];
  const old=await trainer.ref(coachRoot+'/invites/'+code).transaction(value=>{values.push(value);if(!value)return;return {...value,claimedBy:'coach'};},undefined,false);
  assert.equal(values[0],null);
  assert.equal(old.committed,false);
  const cold=client('coach'),claimed=await claimInvite(inviteStore(cold),'coach');
  assert.equal(claimed.member,'alice');
  const link=coachRoot+'/links/alice/coach';
  await cold.ref(link).set({code,memberName:claimed.name,trainerName:'트레이너',createdAt:Date.now()});
  const retry=client('coach');
  await claimInvite(inviteStore(retry),'coach');
  assert.ok((await retry.ref(link).get()).exists());
  await retry.ref(coachRoot+'/roster/coach/alice').set(true);
  await retry.ref(coachRoot+'/invites/'+code).remove();
  assert.equal((await retry.ref(coachRoot+'/roster/coach/alice').get()).val(),true);
  await assert.rejects(claimInvite(inviteStore(client('coach')),'coach'),/없는 코드/);
});
test('simultaneous trainers can claim an invite only once',async()=>{
  await freshInvite();const bob=client('bob');
  await bob.ref(coachRoot+'/profiles/bob').set({role:'trainer',name:'다른 트레이너'});
  let arrived=0,release;const barrier=new Promise(r=>release=r);
  const stores=['coach','bob'].map(uid=>{const store=inviteStore(client(uid));return {...store,read:async()=>{const value=await store.read();if(++arrived===2)release();await barrier;return value;}}});
  const results=await Promise.allSettled(stores.map((s,i)=>claimInvite(s,['coach','bob'][i])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/다른 트레이너/);
});
test('a revoked invite cannot be recreated between reading and claiming',async()=>{
  const {member}=await freshInvite(),store=inviteStore(client('coach'));let reads=0;
  await assert.rejects(claimInvite({...store,read:async()=>{const value=await store.read();if(++reads===1)await member.ref(coachRoot+'/invites/'+code).remove();return value;}},'coach'),/없는 코드/);
  assert.equal(await inviteStore(member).read(),null);
});
test('expired, own and already-used invites return distinct errors',async()=>{
  const {member,trainer,invitation}=await freshInvite();
  await assert.rejects(claimInvite(inviteStore(member),'alice'),/본인의/);
  await claimInvite(inviteStore(trainer),'coach');
  await assert.rejects(claimInvite(inviteStore(client('bob')),'bob'),/다른 트레이너/);
  await env.withSecurityRulesDisabled(c=>c.database().ref(coachRoot+'/invites/'+code).set({...invitation,expiresAt:Date.now()-1000}));
  await assert.rejects(claimInvite(inviteStore(client('coach')),'coach'),/24시간/);
});
async function connectedPair(){
  const member=client('alice'),trainer=client('coach');
  await member.ref(coachRoot+'/profiles/alice').set({role:'member',name:'회원'});
  await trainer.ref(coachRoot+'/profiles/coach').set({role:'trainer',name:'트레이너'});
  const invitation={member:'alice',name:'회원',expiresAt:Date.now()+3600000};
  await member.ref(coachRoot+'/invites/'+code).set(invitation);
  await trainer.ref(coachRoot+'/invites/'+code).set({...invitation,claimedBy:'coach'});
  await trainer.ref(coachRoot+'/links/alice/coach').set({code,memberName:'회원',trainerName:'트레이너',createdAt:Date.now()});
  await trainer.ref(coachRoot+'/roster/coach/alice').set(true);
  return {member,trainer,invitation};
}
const meal=()=>({kind:'meal',authorUid:'alice',authorName:'회원',date:'2026-10-12',text:'점심',meal:'lunch',createdAt:Date.now()});
const comment=()=>({kind:'comment',authorUid:'coach',authorName:'트레이너',date:'2026-10-12',text:'코멘트',mealId:'meal-1',createdAt:Date.now()});

test('linked trainer reads only routine templates and selected-date completion, never personal records or writes',async()=>{
  const {member,trainer}=await connectedPair(),day=root+'/days/2026-10-12';
  await member.ref(root+'/events/d0').set(event);
  await member.ref(day).set({...record,completed:{d0:true},weeklyWeight:85});
  for(const path of [root+'/events',day+'/completed',day+'/items'])await assertSucceeds(trainer.ref(path).get());
  for(const path of [root,root+'/days',day,day+'/weeklyWeight',day+'/weight',day+'/lunch',root+'/meta'])await assertFails(trainer.ref(path).get());
  await assertFails(trainer.ref(root+'/events/d0/title').set('변경'));
  await assertFails(trainer.ref(day+'/completed/d0').set(false));
  await assertFails(trainer.ref(day+'/items/str').set(true));
  await assertFails(trainer.ref(root+'/events/d0').remove());
  const stranger=client('unlinked');await stranger.ref(coachRoot+'/profiles/unlinked').set({name:'다른 코치',role:'trainer'});
  for(const path of [root+'/events',day+'/completed',day+'/items']){
    await assertFails(stranger.ref(path).get());
    await assertFails(env.unauthenticatedContext().database().ref(path).get());
    await assertFails(env.authenticatedContext('anon',{firebase:{sign_in_provider:'anonymous'}}).database().ref(path).get());
  }
  await member.ref(coachRoot+'/links/alice/coach').remove();
  for(const path of [root+'/events',day+'/completed',day+'/items'])await assertFails(client('coach').ref(path).get());
});

test('custom food library is private, bounded per entry, editable and independent of retained logs',async()=>{
  const {member,trainer}=await connectedPair(),path='tempo/users/alice/foods/shake',food={name:'내 쉐이크',amount:250,unit:'ml',calories:180,updatedAt:Date.now()};
  await assertSucceeds(member.ref(path).set(food));
  await assertSucceeds(member.ref(path).update({calories:190}));
  await assertFails(trainer.ref(path).once('value'));
  await assertFails(client('bob').ref(path).set(food));
  await assertFails(member.ref(path).set({...food,amount:0}));
  await assertFails(member.ref(path).set({...food,calories:10001}));
  await assertFails(member.ref(path).set({...food,unit:'invalid'}));
  const maintenance=env.authenticatedContext('tempo-maintenance',{firebase:{sign_in_provider:'custom'},tempo_retention:true,ownerUid:'alice',before:'2026-09-12',weightBefore:'2025-10-12',seenBefore:Date.now()}).database();
  await assertFails(maintenance.ref(path).remove());
  await assertSucceeds(member.ref(path).remove());
});
test('coaching profiles are owner-only, validate roles and reject extra fields',async()=>{
  const db=client('alice'),path=coachRoot+'/profiles/alice';
  await assertSucceeds(db.ref(path).set({role:'member',name:'회원'}));
  await assertFails(client('bob').ref(path).once('value'));
  await assertFails(db.ref(path).set({role:'admin',name:'회원'}));
  await assertFails(db.ref(path).set({role:'member',name:'회원',admin:true}));
});
test('private invite connects one trainer and supports interrupted setup retry',async()=>{
  const {member,trainer,invitation}=await connectedPair();
  await assertFails(trainer.ref(coachRoot+'/invites').once('value'));
  await assertSucceeds(trainer.ref(coachRoot+'/invites/'+code).set({...invitation,claimedBy:'coach'}));
  await client('bob').ref(coachRoot+'/profiles/bob').set({role:'trainer',name:'다른 트레이너'});
  await assertFails(client('bob').ref(coachRoot+'/invites/'+code).set({...invitation,claimedBy:'bob'}));
  await assertFails(client('bob').ref(coachRoot+'/links/alice/bob').set({code,memberName:'회원',trainerName:'다른 트레이너',createdAt:Date.now()}));
  await assertSucceeds(member.ref(coachRoot+'/links/alice').once('value'));
  await assertSucceeds(trainer.ref(coachRoot+'/roster/coach').once('value'));
});
test('trainer cannot connect without an unexpired claimed invite',async()=>{
  const trainer=client('coach');await trainer.ref(coachRoot+'/profiles/coach').set({role:'trainer',name:'코치'});
  const link={code,memberName:'회원',trainerName:'코치',createdAt:Date.now()};
  await assertFails(trainer.ref(coachRoot+'/links/alice/coach').set(link));
  await env.withSecurityRulesDisabled(c=>c.database().ref(coachRoot+'/invites/'+code).set({member:'alice',name:'회원',claimedBy:'coach',expiresAt:Date.now()-1000}));
  await assertFails(trainer.ref(coachRoot+'/links/alice/coach').set(link));
});
test('meals and comments are shared only with the linked pair and remain immutable',async()=>{
  const {member,trainer}=await connectedPair();
  const feed=coachRoot+'/feed/alice';await assertSucceeds(member.ref(feed+'/meal-1').set(meal()));
  await assertSucceeds(trainer.ref(feed+'/comment-1').set(comment()));
  await assertSucceeds(member.ref(feed).once('value'));await assertSucceeds(trainer.ref(feed).once('value'));
  await assertFails(client('bob').ref(feed).once('value'));
  await assertFails(member.ref(feed+'/meal-1/text').set('changed'));
  await assertFails(trainer.ref(feed+'/meal-1').remove());await assertFails(trainer.ref(feed+'/comment-1').remove());
  await assertFails(member.ref(feed+'/fake').set(comment()));
  await assertFails(trainer.ref(feed+'/other').set({...comment(),mealId:'missing'}));
  await assertFails(trainer.ref(feed+'/wrong-date').set({...comment(),date:'2026-10-11'}));
});
test('revoking a link immediately removes trainer feed access and posting',async()=>{
  const {member,trainer}=await connectedPair();const feed=coachRoot+'/feed/alice';await member.ref(feed+'/meal-1').set(meal());
  await assertSucceeds(member.ref().update({[coachRoot+'/links/alice/coach']:null,[coachRoot+'/roster/coach/alice']:null,[coachRoot+'/invites/'+code]:null}));
  await assertFails(trainer.ref(feed).once('value'));await assertFails(trainer.ref(feed+'/c1').set(comment()));
  await assertSucceeds(member.ref(feed).once('value'));
});
test('feed rejects oversized, malformed and forged records, and seen state stays private',async()=>{
  const {member}=await connectedPair();let n=0;for(const value of [{...meal(),text:'x'.repeat(301)},{...meal(),authorUid:'coach'},{...meal(),admin:true},{...meal(),mealId:'fake'},{...meal(),createdAt:1}])await assertFails(member.ref(coachRoot+'/feed/alice/m'+n++).set(value));
  await assertSucceeds(member.ref(coachRoot+'/seen/alice/m1').set(true));
  await assertFails(client('coach').ref(coachRoot+'/seen/alice').once('value'));
  await assertFails(client('coach').ref(coachRoot+'/seen/alice/m1').set(true));
});
test('service claims can read only required coaching paths and cannot write or read personal logs',async()=>{
  const {member}=await connectedPair();await member.ref(coachRoot+'/feed/alice/meal-1').set(meal());
  const service=env.authenticatedContext('tempo-service',{firebase:{sign_in_provider:'custom'},tempo_service:true}).database();
  for(const path of ['profiles/coach','links/alice','feed/alice'])await assertSucceeds(service.ref(coachRoot+'/'+path).once('value'));
  await assertFails(service.ref(coachRoot+'/profiles/coach').set({role:'member',name:'server'}));
  await assertFails(service.ref(coachRoot+'/feed/alice/meal-1').remove());
  await assertFails(service.ref('tempo/users/alice').once('value'));
  await assertFails(service.ref(coachRoot+'/invites/'+code).once('value'));
  await assertSucceeds(service.ref(coachRoot+'/invites').orderByChild('expiresAt').endAt(Date.now()-60000).limitToFirst(100).once('value'));
});
test('only the member can delete a meal and its now orphaned comments',async()=>{
  const {member,trainer}=await connectedPair(),feed=coachRoot+'/feed/alice';
  await member.ref(feed+'/meal-1').set(meal());await trainer.ref(feed+'/comment-1').set(comment());
  await assertFails(client('bob').ref(feed+'/meal-1').remove());
  await assertFails(trainer.ref(feed+'/meal-1').remove());
  await assertFails(member.ref(feed+'/comment-1').remove());
  await assertSucceeds(member.ref(feed+'/meal-1').remove());
  await assertFails(trainer.ref(feed+'/late-comment').set(comment()));
  await assertSucceeds(member.ref(feed).orderByChild('mealId').equalTo('meal-1').once('value'));
  await assertSucceeds(member.ref(feed+'/comment-1').remove());
});
