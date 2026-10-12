// Mifflin–St Jeor (1990), adult estimate; targets can also be entered manually.
export const ACTIVITIES={low:1.2,light:1.375,moderate:1.55,high:1.725};
export function calorieTarget(profile,weight=profile.startWeight){
  if(profile.nutritionMode!=='auto')return Number(profile.calorieGoal)>0?{goal:Number(profile.calorieGoal),mode:'manual',weight}:null;
  const {age,height,formulaSex,activity,targetWeight}=profile;
  if(![age,height,weight,targetWeight].every(Number.isFinite)||age<19||age>78||height<100||height>250||weight<30||weight>200||!['male','female'].includes(formulaSex)||!ACTIVITIES[activity]||!targetWeight)return null;
  const bmr=10*weight+6.25*height-5*age+(formulaSex==='male'?5:-161),maintenance=bmr*ACTIVITIES[activity];
  const adjustment=weight-targetWeight>1?-300:targetWeight-weight>1?200:0;
  const floor=formulaSex==='male'?1500:1200;
  return {goal:Math.round(Math.max(floor,maintenance+adjustment)/10)*10,bmr:Math.round(bmr),maintenance:Math.round(maintenance),mode:'auto',weight};
}
export function currentWeight(profile,logs={},through='9999-99-99'){
  const rows=Object.entries(logs).filter(([d,v])=>d<=through&&(typeof v.weeklyWeight==='number'||typeof v.weight==='number')).sort(([a],[b])=>a.localeCompare(b));
  const last=rows.at(-1)?.[1];return last?.weeklyWeight??last?.weight??profile.startWeight;
}
const numeric=s=>({한:1,하나:1,두:2,둘:2,세:3,셋:3,네:4,넷:4,반:.5}[s]??Number(s));
const amountRE=/^(\d+(?:\.\d+)?|한|하나|두|둘|세|셋|네|넷|반)\s*(인분|공기|그릇|줄|개|장|조각|컵|잔|캔|병|팩|봉지|kg|g|그램|ml|밀리리터|리터|l)(?:\s*(반))?/i;
const norm=s=>s.replace(/[\s_()]/g,'').toLowerCase();
const indexes=new WeakMap();
function foodIndex(catalog){
  if(indexes.has(catalog))return indexes.get(catalog);
  const index=new Map();
  for(const food of catalog)for(const name of [food.name,...(food.aliases||[])]){const key=norm(name);if(!key)continue;const list=index.get(key[0])||[];list.push({key,food});index.set(key[0],list);}
  for(const list of index.values())list.sort((a,b)=>b.key.length-a.key.length||(b.food.custom?2:b.food.community?0:1)-(a.food.custom?2:a.food.community?0:1));
  indexes.set(catalog,index);return index;
}
export function parseFood(text,catalog){
  const index=foodIndex(catalog),compact=norm(text.replace(/\n/g,',')),items=[],unknown=[];
  const match=at=>(index.get(compact[at])||[]).find(x=>compact.startsWith(x.key,at));
  let at=0;
  while(at<compact.length){
    const rest=compact.slice(at);
    const hit=match(at);
    const sep=rest.match(/^(?:[,，+·/\n]|그리고|이랑|랑|하고|와|과|에|먹었어요|먹음|먹었어|먹었습니다|먹었음|먹었|먹고|먹은)+/);
    if(sep&&!hit){at+=sep[0].length;continue;}
    if(!hit){let end=at+1;while(end<compact.length&&!match(end)&&!/[,，+·/]/.test(compact[end]))end++;unknown.push(compact.slice(at,end));at=end;continue;}
    at+=hit.key.length;const amount=compact.slice(at).match(amountRE);const food=hit.food;
    let quantity=amount?numeric(amount[1])+(amount[3] ? .5 : 0):1,unit=amount?.[2]?.toLowerCase()||'인분';
    if(amount)at+=amount[0].length;
    const grams=unit===food.unit?quantity:['g','그램'].includes(unit)&&food.unit==='g'?quantity:unit==='kg'&&food.unit==='g'?quantity*1000:['ml','밀리리터'].includes(unit)&&food.unit==='ml'?quantity:['리터','l'].includes(unit)&&food.unit==='ml'?quantity*1000:food.portions?.[unit]?quantity*food.portions[unit]:['인분','그릇'].includes(unit)?quantity*food.serving:null;
    if(!Number.isFinite(grams)||grams<=0||grams>10000){unknown.push(hit.key+(amount?.[0]||''));continue;}
    items.push({id:food.id,name:food.name,grams:Math.round(grams*100)/100,unit:food.unit||'g',calories:Math.round(food.kcal*grams/100),custom:!!food.custom,community:!!food.community,assumed:!amount||!['g','그램','kg','ml','밀리리터','리터','l'].includes(unit)});
  }
  return {items,unknown,total:items.reduce((s,x)=>s+x.calories,0),complete:items.length>0&&!unknown.length};
}
export function dailyNutrition(feed,date){
  const meals=Object.values(feed||{}).filter(x=>x.kind==='meal'&&x.date===date).sort((a,b)=>a.createdAt-b.createdAt);
  const known=meals.filter(x=>Number.isFinite(x.calories));
  return {total:known.reduce((s,x)=>s+x.calories,0),count:meals.length,complete:meals.length>0&&known.length===meals.length&&meals.every(x=>x.nutritionComplete===true),goal:meals.find(x=>x.calorieGoal>0)?.calorieGoal||null};
}
