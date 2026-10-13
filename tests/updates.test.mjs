import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {demoHTML} from '../scripts/demo-page.mjs';
const code=readFileSync(new URL('../updates.js',import.meta.url),'utf8');
async function fixture({version='bbbbbbbbbbbbbbbb',href='https://minjaedy.github.io/cale/'}={}){
  const span={textContent:''},timeouts=[],intervals=new Map(),events={},replaced=[],stored={};
  const banner={hidden:true,setAttribute(){},querySelector:()=>span};
  const listen=(event,fn)=>{(events[event]??=[]).push(fn)};
  const server={id:version,ok:true,fetches:0};
  const context={URL,Date,AbortSignal,sessionStorage:{setItem:(k,v)=>stored[k]=v},location:{href,replace:s=>replaced.push(s)},navigator:{onLine:true},document:{visibilityState:'visible',querySelector:()=>({content:'aaaaaaaaaaaaaaaa'}),createElement:()=>banner,body:{append(){}},addEventListener:listen},window:{Tempo:{canUpdate:true,currentPage:'coaching',notify(){}},TempoCloud:{pending:false},TempoCoach:{pending:false,hasDraft:false},addEventListener:listen},fetch:async()=>{server.fetches++;return {ok:server.ok,json:async()=>({id:server.id})}},setInterval:(fn,ms)=>intervals.set(ms,fn),setTimeout:fn=>timeouts.push(fn)};
  vm.runInNewContext(code,context);await tick();
  return {context,timeouts,intervals,replaced,banner,stored,server,fire:event=>events[event]?.forEach(fn=>fn())};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('new version reloads automatically and keeps the path, query, hash and selected page',async()=>{
  const x=await fixture({href:'https://minjaedy.github.io/cale/demo.html?sample=1#coaching'});
  x.timeouts.shift()();assert.equal(x.replaced.length,1);
  assert.equal(x.replaced[0],'https://minjaedy.github.io/cale/demo.html?sample=1&v=bbbbbbbbbbbbbbbb#coaching');
  assert.equal(x.stored['tempo-update-page'],'coaching');
  x.intervals.get(2000)();assert.equal(x.timeouts.length,0);
});
test('update waits for drafts and both write queues, then applies without a click',async()=>{
  const x=await fixture();x.context.window.TempoCoach.hasDraft=true;x.timeouts.shift()();assert.equal(x.replaced.length,0);
  x.context.window.TempoCoach.hasDraft=false;x.context.window.TempoCloud.pending=true;x.intervals.get(2000)();assert.equal(x.timeouts.length,0);
  x.context.window.TempoCloud.pending=false;x.context.window.TempoCoach.pending=true;x.intervals.get(2000)();assert.equal(x.timeouts.length,0);
  x.context.window.TempoCoach.pending=false;x.intervals.get(2000)();x.timeouts.shift()();assert.equal(x.replaced.length,1);
});
test('typing, going offline or leaving the app during the countdown cancels reload',async()=>{
  const x=await fixture();x.context.window.Tempo.canUpdate=false;x.timeouts.shift()();assert.equal(x.replaced.length,0);
  x.context.window.Tempo.canUpdate=true;x.intervals.get(2000)();x.context.document.visibilityState='hidden';x.timeouts.shift()();assert.equal(x.replaced.length,0);
  x.context.document.visibilityState='visible';x.intervals.get(2000)();x.context.navigator.onLine=false;x.timeouts.shift()();assert.equal(x.replaced.length,0);
  x.context.navigator.onLine=true;x.fire('online');await tick();x.timeouts.shift()();assert.equal(x.replaced.length,1);
});
test('foreground polling and returning to the app detect a newly deployed version',async()=>{
  const x=await fixture({version:'aaaaaaaaaaaaaaaa'});assert.equal(x.timeouts.length,0);assert.equal(x.banner.hidden,true);
  x.context.document.visibilityState='hidden';x.intervals.get(15000)();assert.equal(x.server.fetches,1);
  x.context.document.visibilityState='visible';x.server.id='bbbbbbbbbbbbbbbb';x.fire('visibilitychange');await tick();
  assert.equal(x.timeouts.length,1);assert.equal(x.banner.hidden,false);
});
test('invalid, unavailable and unchanged versions do not cause a reload loop',async()=>{
  const x=await fixture({version:'invalid'});assert.equal(x.timeouts.length,0);
  x.server.id='aaaaaaaaaaaaaaaa';await x.context.window.TempoUpdate.check();assert.equal(x.timeouts.length,0);
  x.server.ok=false;x.server.id='bbbbbbbbbbbbbbbb';await x.context.window.TempoUpdate.check();assert.equal(x.timeouts.length,0);
  x.server.ok=true;await x.context.window.TempoUpdate.check();assert.equal(x.timeouts.length,1);
  x.server.id='aaaaaaaaaaaaaaaa';await x.context.window.TempoUpdate.check();x.timeouts.shift()();assert.equal(x.replaced.length,0);assert.equal(x.banner.hidden,true);
});
test('the demo ships the real updater while staying disconnected from Firebase',()=>{
  const html=demoHTML(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  assert.match(html,/<script type="module" src="\.\/updates\.js\?v=3"><\/script>/);
  assert.match(html,/src="\.\/demo\.js\?v=3"/);
  assert.doesNotMatch(html,/<script src="\.\/firebase-config\.js"|import\('\.\/firebase-sync\.js/);
  assert.doesNotMatch(readFileSync(new URL('../demo.js',import.meta.url),'utf8'),/TempoUpdate\s*=/);
});
