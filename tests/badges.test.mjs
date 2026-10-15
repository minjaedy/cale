import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createBadgeClient} from '../badge-client.js';
const worker=readFileSync(new URL('../badge-worker.js',import.meta.url),'utf8'),sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function fixture({store=new Map(),unsupported=false,failIcon=false,failStorage=false}={}){
  const handlers={},icons=[],notices=[],closed=[],clients=[],posts=[],opened=[];
  const scope='https://minjaedy.github.io/cale/';
  const cache={match:async key=>store.has(key)?new Response(store.get(key)):undefined,put:async(key,response)=>{if(failStorage)throw Error('quota');store.set(key,await response.text())},addAll:async()=>{}};
  const self={registration:{scope,showNotification:async(title,options)=>{notices.push({title,...options})},getNotifications:async()=>notices.map(n=>({...n,close(){closed.push(n.tag)}}))},navigator:unsupported?{}:{setAppBadge:async n=>{icons.push(n);if(failIcon)throw Error('denied')},clearAppBadge:async()=>icons.push(0)},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url),claim:async()=>{}},skipWaiting(){},addEventListener:(name,fn)=>handlers[name]=fn};
  const context=vm.createContext({self,URL,Response,Date,Set,Map,Promise,Number,Array,String,JSON,caches:{open:async()=>cache,keys:async()=>['tempo-badges-v1'],delete:async()=>true},fetch:async()=>new Response(''),importScripts(){vm.runInContext(worker,context)}});vm.runInContext(sw,context);
  const fire=async(name,extra={})=>{const promises=[];handlers[name]({...extra,waitUntil:p=>promises.push(p)});await Promise.all(promises)};
  const push=async(tag,kind='comment',extra={})=>fire('push',{data:{json:()=>({tag,kind,recipient:'member',member:'member',screen:kind==='routine'?'routine':'coaching',createdAt:Date.now(),...extra})}});
  const message=async data=>fire('message',{source:{url:scope},data});
  const sync=async(unread=[],seen=[],members=['member'])=>message({type:'tempo-badge-sync',uid:'member',at:Date.now(),unread:unread.map(tag=>({tag,kind:'comment',member:'member',at:Date.now()})),seen,members});
  return {self,store,icons,notices,closed,clients,posts,opened,fire,push,message,sync};
}
test('background pushes set a numeric icon badge, deduplicate, and survive service-worker restart',async()=>{
  const x=fixture();await x.push('tempo-c1');await x.push('tempo-c1');await x.push('tempo-c2');assert.equal(x.icons.at(-1),2);assert.equal(x.notices.length,3);
  const restarted=fixture({store:x.store});await restarted.fire('activate');assert.equal(restarted.icons.at(-1),2);
  const stored=JSON.parse([...x.store.values()][0]);assert.equal(stored.items.length,2);assert.equal(stored.items[0].text,undefined);assert.equal(stored.items[0].body,undefined);
});
test('live unread items and pushes are counted once; read receipts clear icons and late duplicate pushes',async()=>{
  const x=fixture();await x.message({type:'tempo-badge-account',uid:'member'});await x.push('tempo-c1');await x.sync(['tempo-c1','tempo-c2']);assert.equal(x.icons.at(-1),2);
  await x.sync(['tempo-c2'],['tempo-c1']);assert.equal(x.icons.at(-1),1);assert.ok(x.closed.includes('tempo-c1'));
  await x.push('tempo-c1');assert.equal(x.icons.at(-1),1);await x.sync([],['tempo-c1','tempo-c2']);assert.equal(x.icons.at(-1),0);
});
test('a push that arrives before the feed is not erased by an older live snapshot',async()=>{
  const x=fixture();await x.push('tempo-new');await x.sync([]);assert.equal(x.icons.at(-1),1);
  await x.sync(['tempo-new']);assert.equal(x.icons.at(-1),1);
});
test('clicking and dismissing notices acknowledge only that badge; stale snapshots cannot resurrect it',async()=>{
  const x=fixture();await x.push('tempo-one');await x.push('tempo-two');await x.fire('notificationclick',{notification:{tag:'tempo-one',data:{url:'https://minjaedy.github.io/cale/#coaching'},close(){}}});assert.equal(x.icons.at(-1),1);assert.equal(x.opened.length,1);
  await x.sync(['tempo-one','tempo-two']);assert.equal(x.icons.at(-1),1);await x.fire('notificationclose',{notification:{tag:'tempo-two'}});assert.equal(x.icons.at(-1),0);
});
test('routine/test badges clear when their screen is viewed without clearing unread comments',async()=>{
  const x=fixture();await x.push('tempo-r','routine');await x.push('tempo-test-a','test');await x.push('tempo-c');
  await x.message({type:'tempo-badge-visible',uid:'member',screen:'routine'});assert.equal(x.icons.at(-1),2);
  await x.message({type:'tempo-badge-visible',uid:'member',screen:'coaching'});assert.equal(x.icons.at(-1),1);
});
test('logout and account switches clear badges and ignore old-account pushes and snapshots',async()=>{
  const x=fixture();await x.push('tempo-c');await x.message({type:'tempo-badge-account',uid:null});assert.equal(x.icons.at(-1),0);
  await x.push('tempo-old');assert.equal(x.icons.at(-1),0);await x.message({type:'tempo-badge-account',uid:'second'});await x.sync(['tempo-other']);assert.equal(x.icons.at(-1),0);
  await x.push('tempo-second','comment',{recipient:'second'});assert.equal(x.icons.at(-1),1);
});
test('deleted feed items and unlinked members disappear; a subsequently loaded item can return',async()=>{
  const x=fixture();await x.message({type:'tempo-badge-account',uid:'member'});await x.sync(['tempo-c']);await x.sync([]);assert.equal(x.icons.at(-1),0);
  await x.sync(['tempo-c']);assert.equal(x.icons.at(-1),1);await x.sync([],[],[]);assert.equal(x.icons.at(-1),0);
});
test('unsupported or denied badge APIs and storage failures never block visible notifications',async()=>{
  for(const options of [{unsupported:true},{failIcon:true},{failStorage:true}]){const x=fixture(options);await x.push('tempo-c');assert.equal(x.notices.length,1);await x.push('tempo-next');if(!options.unsupported)assert.equal(x.icons.at(-1),2)}
});
test('demo and unrelated pages cannot acknowledge installed-app notifications; expired identifiers are pruned',async()=>{
  const x=fixture();await x.push('tempo-c');for(const url of ['https://minjaedy.github.io/dydy/','https://minjaedy.github.io/cale/demo.html','https://example.com/cale/'])await x.fire('message',{source:{url},data:{type:'tempo-badge-account',uid:null}});assert.equal(x.icons.at(-1),1);
  await x.push('tempo-expired','routine',{createdAt:Date.now()-366*86400000});assert.equal(x.icons.at(-1),1);
});
test('client sync uses the correct registration, protects hidden/locked screens and excludes demo',async()=>{
  const messages=[],listeners={},location={href:'https://minjaedy.github.io/cale/',pathname:'/cale/'},document={body:{dataset:{}},visibilityState:'visible'};
  const navigator={serviceWorker:{getRegistration:async()=>({scope:location.href,active:{postMessage:m=>messages.push(m)}}),addEventListener:(name,fn)=>listeners[name]=fn}};
  const c=createBadgeClient({navigator,document,location});await c.account('member');await c.sync({uid:'member',unread:[],seen:[],members:['member']});await c.visible('routine',false);document.visibilityState='hidden';await c.visible('routine',true);assert.equal(messages.length,2);
  document.visibilityState='visible';await c.visible('routine',true);assert.equal(messages.at(-1).type,'tempo-badge-visible');document.body.dataset.demo='true';await c.visible('coaching',true);assert.equal(messages.length,3);
  delete document.body.dataset.demo;await c.clear();listeners.controllerchange();await new Promise(setImmediate);assert.equal(messages.at(-1).uid,null);
});
