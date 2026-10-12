import test from 'node:test';
import assert from 'node:assert/strict';
import {removeMeal} from '../meals.js';
import {environment} from './helpers.js';
test('meal deletion removes its parent before all comments, cancels queued notifications and can be retried',async()=>{
  const env=environment(),calls=[];let parent={kind:'meal',authorUid:'member'};
  const read=async(_,path,options)=>{calls.push({path,...options});if(path.endsWith('/m')){if(options.method==='DELETE'){parent=null;return}return parent}if(options.query)return {c:{kind:'comment',mealId:'m'}};};
  try{
    env.sqlite.prepare("INSERT INTO deliveries(id,device_id,recipient,member,author,kind,message_id,created_at) VALUES('d','dev','coach','member','member','meal','m',1)").run();
    assert.deepEqual((await removeMeal(env,{sub:'member'},'m','token',read)).removed,['m','c']);
    assert.equal(calls[1].method,'DELETE');assert.equal(calls[2].query.equalTo,'m');assert.deepEqual(calls[3].body,{c:null});
    assert.equal(env.sqlite.prepare('SELECT state FROM deliveries').get().state,'skipped');
    await removeMeal(env,{sub:'member'},'m','token',read);
    await assert.rejects(()=>removeMeal(env,{sub:'other'},'m','token',async()=>({kind:'meal',authorUid:'member'})),e=>e.status===403);
  }finally{env.sqlite.close()}
});
