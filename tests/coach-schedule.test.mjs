import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduleForDate,createScheduleWatcher} from '../coach-schedule.mjs';

const events={late:{day:0,title:'근력',start:'19:00',end:'20:00',cat:'str'},early:{day:0,title:'출근',start:'08:00',end:'09:00',cat:'commute'},other:{day:1,title:'산책',start:'07:00',end:'08:00',cat:'cardio'}};
test('trainer sees the selected weekday, ordered times and independent completion including unchecked values',()=>{
  const result=scheduleForDate(events,{completed:{late:false,early:true},items:{str:true}},'2026-10-12','2026-10-13');
  assert.deepEqual(result.map(e=>[e.id,e.done]),[['early',true],['late',false]]);
  assert.equal(scheduleForDate(events,{items:{str:true}},'2026-10-12','2026-10-13')[1].done,true);
  assert.equal(scheduleForDate(events,{completed:{early:true},items:{str:true}},'2026-10-12','2026-10-13')[1].done,false);
  assert.deepEqual(scheduleForDate(events,{},'2026-10-14','2026-10-13'),[]);
  assert.ok(scheduleForDate(events,{items:{str:true}},'2026-10-19','2026-10-13').every(e=>e.upcoming&&!e.done));
});
test('switching date/member drops old responses; revocation clears data and all subscriptions',()=>{
  const subscriptions=[],updates=[];
  const watcher=createScheduleWatcher((path,next,error)=>{const entry={path,next,error,stopped:false};subscriptions.push(entry);return()=>entry.stopped=true;},value=>updates.push(value));
  watcher.watch('alice','2026-10-12');
  assert.deepEqual(subscriptions.map(s=>s.path),['tempo/users/alice/events','tempo/users/alice/days/2026-10-12/completed','tempo/users/alice/days/2026-10-12/items']);
  subscriptions[0].next(events);subscriptions[1].next({early:true});subscriptions[2].next(null);
  assert.equal(updates.at(-1).loading,false);
  watcher.watch('bob','2026-10-13');assert.ok(subscriptions.slice(0,3).every(s=>s.stopped));
  const count=updates.length;subscriptions[0].next(events);assert.equal(updates.length,count);
  subscriptions[3].next(events);subscriptions[4].error(new Error('permission_denied'));
  assert.equal(updates.at(-1).events,undefined);assert.match(updates.at(-1).error,/연결/);
  assert.ok(subscriptions.every(s=>s.stopped));
  const denied=updates.length;subscriptions[5].next({str:true});assert.equal(updates.length,denied);
  watcher.clear();
});
