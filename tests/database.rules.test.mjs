import {before,after,beforeEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';

let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-tempo',database:{host:'127.0.0.1',port:9000,rules:await readFile('database.rules.json','utf8')}});});
after(async()=>env?.cleanup());
beforeEach(async()=>env.clearDatabase());
const owner=()=>env.authenticatedContext('alice',{firebase:{sign_in_provider:'google.com'}}).database();
const other=()=>env.authenticatedContext('bob',{firebase:{sign_in_provider:'google.com'}}).database();
const root='tempo/users/alice';
const event={day:0,title:'근력',start:'19:30',end:'20:30',cat:'str',note:''};
const record={items:{diet:true,run:false},weight:89.5,lunch:'밥과 닭가슴살',updatedAt:Date.now()};

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
  const db=owner();for(const bad of [{...event,day:5},{...event,day:0.5},{...event,start:'99:00'},{...event,end:'18:00'},{...event,cat:'admin'},{...event,title:'x'.repeat(41)},{...event,admin:true}])await assertFails(db.ref(root+'/events/d0').set(bad));
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
