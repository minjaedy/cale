// Legacy defaults are selected only for the verified original account.
const LEGACY_EMAIL_HASH='0e79ca5a7aff82990fb4a52d5f772baef8ca07df263af4c17412f363f82584e6';
export async function isLegacyOwner(user){
  if(!user?.emailVerified||!user.email)return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')===LEGACY_EMAIL_HASH;
}
export const legacyProfile=()=>({role:'member',name:'김민재',registered:true,calendarName:'민재의 루틴',height:175,startWeight:90,targetWeight:70,calorieGoal:2350,proteinGoal:150,fatGoal:65,carbGoal:290});
export const NUMBER_FIELDS={age:[1,120,'만 나이'],height:[100,250,'키'],startWeight:[30,200,'등록 체중'],targetWeight:[30,200,'목표 체중'],calorieGoal:[0,10000,'섭취 목표'],proteinGoal:[0,1000,'단백질'],fatGoal:[0,1000,'지방'],carbGoal:[0,1000,'탄수화물']};
export function profileInput(input,role){
  if(!['member','trainer'].includes(role))throw Error('계정 유형을 선택해 주세요.');
  const name=String(input.name||'').trim();
  if(!name||name.length>60)throw Error('이름을 입력해 주세요.');
  const result={role,name,registered:true};
  if(role==='member'){
    result.calendarName=String(input.calendarName||'').trim();
    if(!result.calendarName||result.calendarName.length>30)throw Error('캘린더 이름은 1–30자로 입력해 주세요.');
    for(const [key,[min,max,label]] of Object.entries(NUMBER_FIELDS)){
      if(!(key in input))continue;
      if(input[key]===''||input[key]===null){result[key]=null;continue;}
      const value=Number(input[key]);
      if(!Number.isFinite(value)||value<min||value>max)throw Error(label+' 입력 범위를 확인해 주세요.');
      result[key]=Math.round(value*10)/10;
    }
    for(const [key,allowed] of Object.entries({nutritionMode:['auto','manual'],formulaSex:['male','female'],activity:['low','light','moderate','high']}))if(key in input){if(!allowed.includes(input[key]))throw Error('계산 설정을 확인해 주세요.');result[key]=input[key];}
    if(result.nutritionMode==='auto'&&(!result.age||result.age<19||result.age>78||!result.height||!result.startWeight||!result.targetWeight||!result.formulaSex||!result.activity))throw Error('자동 계산은 만 19–78세 성인 기준입니다. 나머지 항목도 입력하거나 직접 설정을 선택해 주세요.');
  }
  return result;
}
export function initialCalendar(current,seed){
  // Transactions may rerun after another device has created the calendar.
  if(current!==null&&current!==undefined)return;
  const days={};
  for(const [date,log] of Object.entries(seed.logs||{})){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!log)continue;
    const record={updatedAt:Date.now()};
    for(const key of ['breakfast','lunch','snack','dinner'])if(typeof log[key]==='string')record[key]=log[key].slice(0,60);
    for(const key of ['weight','weeklyWeight'])if(typeof log[key]==='number'&&log[key]>=30&&log[key]<=200)record[key]=log[key];
    const items=Object.fromEntries(Object.entries(log.items||{}).filter(([k,v])=>['str','run','diet','steps','jp','sleep'].includes(k)&&typeof v==='boolean'));
    if(Object.keys(items).length)record.items=items;
    const completed=Object.fromEntries(Object.entries(log.completed||{}).filter(([k,v])=>/^[A-Za-z0-9_-]{1,100}$/.test(k)&&typeof v==='boolean'));
    if(Object.keys(completed).length)record.completed=completed;
    days[date]=record;
  }
  return {meta:{initialized:true},...(seed.events?.length?{events:Object.fromEntries(seed.events.map(({id,...e})=>[id,e]))}:{}),...(Object.keys(days).length?{days}:{})};
}
export function routineEdit(events,editingId,input,newId=()=> 'u'+crypto.randomUUID()){
  const days=[...new Set(input.days)].sort((a,b)=>a-b);
  if(!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error('반복 요일을 선택해 주세요.');
  const original=events.find(e=>e.id===editingId),series=original?.seriesId||newId();
  if(editingId&&!original)throw Error('변경된 루틴입니다. 다시 열어 주세요.');
  const same=e=>original&&(original.seriesId?e.seriesId===original.seriesId:e.id===editingId);
  const previous=events.filter(same),others=events.filter(e=>!same(e));
  const {days:_,...base}=input;
  const next=[...others,...days.map(day=>({id:previous.find(e=>e.day===day)?.id||newId(),...base,seriesId:series,day}))];
  if(next.length>200)throw Error('일정은 최대 200개까지 등록할 수 있어요.');
  return next;
}
export function routineDelete(events,id){
  const item=events.find(e=>e.id===id);
  return events.filter(e=>item?.seriesId?e.seriesId!==item.seriesId:e.id!==id);
}
