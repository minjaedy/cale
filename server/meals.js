import {database} from './firebase.js';
import {sql,problem} from './auth.js';
export async function removeMeal(env,person,id,token,read=database){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw problem('식단을 다시 선택해 주세요.');
  const path='tempo/coaching/feed/'+person.sub;
  const meal=await read(env,path+'/'+id,{token});
  if(meal&&(meal.kind!=='meal'||meal.authorUid!==person.sub))throw problem('직접 등록한 식단만 삭제할 수 있어요.',403);
  // Remove the parent first so a racing trainer cannot create a new comment.
  await read(env,path+'/'+id,{token,method:'DELETE'});
  const comments=await read(env,path,{token,query:{orderBy:'mealId',equalTo:id}});
  const ids=[id,...Object.keys(comments||{})];
  if(ids.length>1)await read(env,path,{token,method:'PATCH',body:Object.fromEntries(ids.slice(1).map(k=>[k,null]))});
  await sql(env,"UPDATE deliveries SET state='skipped',lease_until=0 WHERE member=? AND state!='sent' AND message_id IN (SELECT value FROM json_each(?))",person.sub,JSON.stringify(ids)).run();
  return {ok:true,removed:ids};
}
