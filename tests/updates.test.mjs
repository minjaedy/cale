import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../updates.js',import.meta.url),'utf8');
async function fixture(){
  const spans={span:{textContent:''},button:{disabled:false}},timeouts=[],intervals=[],replaced=[];
  const banner={hidden:true,setAttribute(){},querySelector:s=>spans[s]};
  const context={URL,Date,AbortSignal,sessionStorage:{setItem(){}},location:{href:'https://minjaedy.github.io/cale/',replace:s=>replaced.push(s)},navigator:{onLine:true},document:{visibilityState:'visible',querySelector:()=>({content:'aaaaaaaaaaaaaaaa'}),createElement:()=>banner,body:{append(){}},addEventListener(){}},window:{Tempo:{canUpdate:true,currentPage:'coaching',notify(){}},TempoCloud:{pending:false},TempoCoach:{pending:false,hasDraft:false},addEventListener(){}},fetch:async()=>({ok:true,json:async()=>({id:'bbbbbbbbbbbbbbbb'})}),setInterval:fn=>intervals.push(fn),setTimeout:fn=>timeouts.push(fn)};
  vm.runInNewContext(code,context);await new Promise(resolve=>setImmediate(resolve));
  return {context,timeouts,intervals,replaced,banner};
}
test('update waits for drafts, edits and pending writes, then restores the page',async()=>{
  const x=await fixture();x.context.window.TempoCoach.hasDraft=true;x.timeouts.shift()();assert.equal(x.replaced.length,0);
  x.context.window.TempoCoach.hasDraft=false;x.context.window.TempoCloud.pending=true;x.intervals[0]();assert.equal(x.timeouts.length,0);
  x.context.window.TempoCloud.pending=false;x.intervals[0]();x.timeouts.shift()();assert.equal(x.replaced.length,1);assert.match(x.replaced[0],/v=bbbbbbbbbbbbbbbb/);
});
test('typing or leaving the app during the update countdown cancels reload',async()=>{
  const x=await fixture();x.context.window.Tempo.canUpdate=false;x.timeouts.shift()();assert.equal(x.replaced.length,0);
  x.context.window.Tempo.canUpdate=true;x.intervals[0]();x.context.document.visibilityState='hidden';x.timeouts.shift()();assert.equal(x.replaced.length,0);
});
