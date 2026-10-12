export const FOOD_UNITS=['g','ml','인분','개','잔','공기','조각','봉지','팩'];
export function customFoodInput(input){
  const name=String(input.name||'').trim(),amount=Number(input.amount),calories=Number(input.calories),unit=input.unit;
  if(!name||name.length>60)throw Error('음식 이름은 1–60자로 입력해 주세요.');
  if(!FOOD_UNITS.includes(unit)||!Number.isFinite(amount)||amount<=0||amount>10000)throw Error('기준량과 단위를 확인해 주세요.');
  if(input.calories===''||!Number.isFinite(calories)||calories<0||calories>10000)throw Error('칼로리는 0–10,000 사이로 입력해 주세요.');
  return {name,amount,unit,calories:Math.round(calories)};
}
export function customCatalog(foods,community=false){
  return Object.entries(foods||{}).map(([id,f])=>({id:(community?'community-':'custom-')+id,name:f.name,unit:f.unit,kcal:f.calories/f.amount*100,serving:f.amount,custom:!community,community,portions:{[f.unit]:1}}));
}
