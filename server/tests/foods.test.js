import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {environment} from './helpers.js';
import {saveCommunity,removeCommunity,communityCatalog,pendingFoods,acknowledgeFoods,githubIdentity} from '../foods.js';
const food={name:'검증 음식',amount:250,unit:'ml',calories:180};
test('community food is immediately shared, deduplicated and editable only by its contributor',async()=>{
  const env=environment();try{
    const a=await saveCommunity(env,'member-a',{food});
    await assert.rejects(()=>saveCommunity(env,'member-b',{food}),e=>e.status===409);
    const catalog=await communityCatalog(env,'member-b',async()=>({}));assert.equal(catalog.foods[a.food.id].calories,180);assert.deepEqual(catalog.mine,[]);
    assert.equal(JSON.stringify(catalog).includes('member-a'),false);assert.equal(JSON.stringify(await pendingFoods(env)).includes('owner_hash'),false);
    await assert.rejects(()=>removeCommunity(env,'member-b',a.food.id),e=>e.status===403);
    await saveCommunity(env,'member-a',{id:a.food.id,food:{...food,calories:190}});
    assert.equal((await communityCatalog(env,'member-a',async()=>({}))).foods[a.food.id].calories,190);
    await removeCommunity(env,'member-a',a.food.id);assert.deepEqual((await communityCatalog(env,'member-a',async()=>({}))).foods,{});
  }finally{env.sqlite.close()}
});
test('GitHub acknowledgement never drops a concurrent food edit and clears synced payload storage',async()=>{
  const env=environment();try{
    const first=await saveCommunity(env,'member',{food}),snapshot=await pendingFoods(env),commit='a'.repeat(40),base={[first.food.id]:first.food};
    await saveCommunity(env,'member',{id:first.food.id,food:{...food,calories:200}});
    await acknowledgeFoods(env,{commit,changes:snapshot.changes},async()=>base);
    assert.equal((await pendingFoods(env)).changes.length,1);
    const updated=(await communityCatalog(env,'member',async()=>structuredClone(base))).foods;assert.equal(updated[first.food.id].calories,200);
    const next=await pendingFoods(env);await acknowledgeFoods(env,{commit:'b'.repeat(40),changes:next.changes},async()=>updated);
    assert.equal((await pendingFoods(env)).changes.length,0);assert.equal(env.sqlite.prepare('SELECT payload FROM community_foods').get().payload,null);
    assert.equal((await communityCatalog(env,'member',async()=>updated)).foods[first.food.id].calories,200);
  }finally{env.sqlite.close()}
});
test('food publishing trusts only the signed repository workflow on main',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256'),claims={repository:'minjaedy/cale',repository_id:'1415255546',repository_owner_id:'310518298',ref:'refs/heads/main',workflow_ref:'minjaedy/cale/.github/workflows/foods.yml@refs/heads/main',event_name:'schedule'};
  const token=extra=>new SignJWT({...claims,...extra}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience('tempo-food-sync').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  await githubIdentity(await token({}),publicKey);
  for(const extra of [{repository:'other/cale'},{repository_id:'0'},{ref:'refs/pull/1/merge'},{workflow_ref:'minjaedy/cale/.github/workflows/untrusted.yml@refs/heads/main'},{event_name:'pull_request'}])await assert.rejects(()=>token(extra).then(t=>githubIdentity(t,publicKey)));
});
