import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyPatch,eventDiff,mergeOutbox,acknowledge,queuedPatch} from '../sync-core.mjs';

test('updates a single habit without overwriting other device fields',()=>{
  const original={days:{'2026-10-12':{items:{diet:true},weight:89.1}}};
  const next=applyPatch(original,{'days/2026-10-12/items/run':true});
  assert.equal(next.days['2026-10-12'].items.diet,true);
  assert.equal(next.days['2026-10-12'].weight,89.1);
  assert.equal(next.days['2026-10-12'].items.run,true);
  assert.equal(original.days['2026-10-12'].items.run,undefined);
});
test('a newer offline edit survives acknowledgement of an older in-flight write',()=>{
  const first=mergeOutbox({}, {'days/2026-10-12/weight':89},1);
  const second=mergeOutbox(first, {'days/2026-10-12/weight':88.8},2);
  assert.deepEqual(queuedPatch(acknowledge(second,first)),{'days/2026-10-12/weight':88.8});
});
test('collapses parent and child writes into a valid non-overlapping RTDB update',()=>{
  let queue=mergeOutbox({}, {'days/2026-10-12':{items:{diet:true},weight:89}},1);
  queue=mergeOutbox(queue,{'days/2026-10-12/items/run':true},2);
  assert.equal(Object.keys(queue).length,1);
  assert.deepEqual(queue['days/2026-10-12'].value.items,{diet:true,run:true});
  queue=mergeOutbox(queue,{'days/2026-10-12':{weight:88}},3);
  assert.deepEqual(queuedPatch(queue),{'days/2026-10-12':{weight:88}});
});
test('event diff preserves unchanged events from another client',()=>{
  const base={id:'d0',day:0,title:'운동',start:'19:00',end:'20:00',cat:'str',note:''};
  const second={...base,id:'d1',day:1};
  assert.deepEqual(eventDiff([base,second],[{...base,title:'근력'},second]),{'events/d0':{day:0,title:'근력',start:'19:00',end:'20:00',cat:'str',note:''}});
  assert.deepEqual(eventDiff([base],[]),{'events/d0':null});
});
test('patch ignores prototype paths and supports explicit field removal',()=>{
  assert.deepEqual(applyPatch({days:{x:{weight:90}}},{'__proto__/polluted':true,'days/x/weight':null}),{days:{x:{}}});
  assert.equal({}.polluted,undefined);
});
