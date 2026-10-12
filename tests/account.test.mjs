import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isLegacyOwner,initialCalendar,routineEdit,routineDelete,profileInput} from '../account-core.mjs';
import {parseFood,calorieTarget,currentWeight,dailyNutrition} from '../nutrition-core.mjs';
import {cutoffs,pruneDays,pruneQueue,DAY} from '../retention-core.mjs';
import {canMoveBack,clampSelection,hasHistory,shiftDate} from '../calendar-core.mjs';
import {customFoodInput,customCatalog} from '../custom-foods.mjs';
const catalog=JSON.parse(await readFile(new URL('../food-catalog.json',import.meta.url))).foods;
test('legacy seeding is limited to the verified owner and never replaces an existing account',async()=>{
  assert.equal(await isLegacyOwner({email:'kmj843337@gmail.com',emailVerified:true}),true);
  assert.equal(await isLegacyOwner({email:'kmj843337@gmail.com',emailVerified:false}),false);
  assert.equal(await isLegacyOwner({email:'other@example.com',emailVerified:true}),false);
  assert.equal(initialCalendar({meta:{initialized:true}},{events:[{id:'d0'}]}),undefined);
  assert.deepEqual(initialCalendar(null,{events:[],logs:{}}),{meta:{initialized:true}});
});
test('editing a weekly series retains completion IDs and changes only the selected series',()=>{
  let n=0;const id=()=> 'id'+ ++n,base={title:'근력',start:'18:00',end:'19:00',cat:'str',note:'',days:[0,2,6]};
  const a=routineEdit([],null,base,id),sunday=a.find(e=>e.day===6);
  const b=routineEdit([...a,{id:'other',day:1}],a[0].id,{...base,days:[2,6,5]},id);
  assert.equal(b.find(e=>e.day===6).id,sunday.id);assert.equal(b.filter(e=>e.seriesId===sunday.seriesId).length,3);
  assert.deepEqual(routineDelete(b,sunday.id),[{id:'other',day:1}]);
});
test('natural Korean quantities calculate supported foods and expose unknown items',()=>{
  const result=parseFood('김치찌개 1인분에 밥 한공기',catalog);assert.equal(result.complete,true);assert.equal(result.total,576);assert.deepEqual(result.items.map(x=>x.grams),[400,200]);
  assert.equal(parseFood('밥 반 공기',catalog).total,166);
  assert.equal(parseFood('밥 150g',catalog).total,249);
  assert.equal(parseFood('김치찌개 2인분',catalog).total,488);
  assert.equal(parseFood('밥 한 공기 반',catalog).total,498);
  const unknown=parseFood('밥 한 공기, 외계인특제스무디 한잔',catalog);assert.equal(unknown.complete,false);assert.ok(unknown.unknown.length);
  assert.equal(parseFood('김치찌개 0g',catalog).complete,false);
});
test('adult calorie estimate follows weight changes and preserves manual goals',()=>{
  const p={nutritionMode:'auto',age:30,height:175,startWeight:90,targetWeight:75,formulaSex:'male',activity:'moderate'};
  const a=calorieTarget(p),b=calorieTarget(p,80);assert.equal(a.bmr,1849);assert.ok(b.goal<a.goal);
  assert.equal(calorieTarget({...p,age:15}),null);assert.equal(calorieTarget({...p,nutritionMode:'manual',calorieGoal:2350},80).goal,2350);
  assert.equal(currentWeight(p,{'2026-10-05':{weeklyWeight:85},'2026-10-12':{weeklyWeight:84}}),84);
  assert.throws(()=>profileInput({name:'민재',calendarName:'루틴',nutritionMode:'auto'},'member'));
  const d=dailyNutrition({a:{kind:'meal',date:'2026-10-12',calories:576,nutritionComplete:true,calorieGoal:2350},b:{kind:'meal',date:'2026-10-12',nutritionComplete:false},c:{kind:'meal',date:'2026-10-11',calories:1000}},'2026-10-12');
  assert.equal(d.total,576);assert.equal(d.complete,false);assert.equal(d.goal,2350);
});

test('drink units and packaged foods use their source basis without treating ml as grams',()=>{
  assert.equal(parseFood('콜라 500ml',catalog).total,215);
  assert.equal(parseFood('제로콜라 500ml',catalog).total,0);
  assert.equal(parseFood('카페라떼 350ml',catalog).total,133);
  assert.equal(parseFood('아메리카노 1잔',catalog).complete,true);
  assert.equal(parseFood('콜라 0.5리터',catalog).total,215);
  assert.equal(parseFood('바나나 1개, 신라면 1봉지',catalog).complete,true);
  assert.equal(parseFood('밥 200ml',catalog).complete,false);
  assert.equal(parseFood('에너지바 1개',customCatalog({a:{name:'에너지바',amount:1,unit:'개',calories:200}})).total,200);
  assert.equal(parseFood('카페라떼 특제시럽',catalog).complete,false);
});
test('custom food scales servings and overrides only the owner catalogue, including zero calories',()=>{
  const food=customFoodInput({name:'나의 쉐이크',amount:250,unit:'ml',calories:180});
  const own=[...customCatalog({a:food,b:{name:'밥',amount:200,unit:'g',calories:280}}),...catalog];
  assert.equal(parseFood('나의 쉐이크 500ml',own).total,360);
  assert.equal(parseFood('밥 200g',own).total,280);
  assert.equal(parseFood('밥 200g',catalog).total,332);
  assert.equal(parseFood('밥 200g',[...customCatalog({b:{name:'밥',amount:200,unit:'g',calories:280}},true),...catalog]).total,332);
  assert.equal(parseFood('나의 쉐이크 250ml',catalog).complete,false);
  assert.throws(()=>customFoodInput({...food,calories:''}));
  assert.throws(()=>customFoodInput({...food,amount:0}));
  assert.equal(customFoodInput({...food,calories:0}).calories,0);
});
test('all dated records remain for 365 days and stale offline writes cannot restore expired dates',()=>{
  const now=Date.parse('2026-10-12T10:00:00Z'),{before,weightBefore}=cutoffs(now);
  const days={ [before]:{lunch:'보관',updatedAt:now},'2026-09-01':{weeklyWeight:80,lunch:'삭제',completed:{a:true},updatedAt:now},'2025-01-01':{weight:90,updatedAt:now}};
  assert.deepEqual(pruneDays(days,now),{[before]:days[before],'2026-09-01':days['2026-09-01']});
  const q=pruneQueue({'days/2026-09-01/lunch':{value:'삭제'},'days/2026-09-01/weeklyWeight':{value:80},'events/id':{value:{title:'유지'}}},now);
  assert.equal(Object.keys(q).length,3);assert.equal(weightBefore,'2025-10-13');
  const all=Object.fromEntries(Array.from({length:800},(_,i)=>[shiftDate('2026-10-12',-i),{lunch:'기록',completed:{a:true},weeklyWeight:80}]));
  assert.equal(Object.keys(pruneDays(all,now)).length,365);
  const tomorrow=pruneDays(all,now+DAY);assert.equal(tomorrow[before],undefined);assert.deepEqual(tomorrow['2026-10-12'],all['2026-10-12']);
  assert.deepEqual(pruneQueue({'days/2025-10-12/weeklyWeight':{value:80},'days/2025-10-12/completed/a':{value:true},'events/id':{value:{title:'유지'}}},now),{'events/id':{value:{title:'유지'}}});
});
test('calendar permits last year and future planning, clamps only expired dates, including partial weeks and leap years',()=>{
  const today='2026-10-12';
  assert.equal(hasHistory('2026-05-12',today),true);assert.equal(hasHistory('2025-10-12',today),false);
  assert.equal(hasHistory('2026-05-12','2028-01-01'),false);
  assert.equal(canMoveBack('2025-10-13',today),false);
  assert.deepEqual(clampSelection('2025-01-06',0,today),{week:'2025-10-13',day:0,date:'2025-10-13'});
  assert.deepEqual(clampSelection('2025-10-13',0,'2026-10-13'),{week:'2025-10-13',day:1,date:'2025-10-14'});
  assert.deepEqual(clampSelection('2026-10-12',1,today),{week:'2026-10-12',day:1,date:'2026-10-13'});
  assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');
});
