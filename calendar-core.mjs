import {DAY,historyStart} from './retention-core.mjs?v=3';
export const shiftDate=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*DAY).toISOString().slice(0,10);
export function hasHistory(date,today){return date>=historyStart(today)}
export function canMoveBack(week,today){return hasHistory(shiftDate(week,-1),today)}
export function clampSelection(week,day,today){
  const selected=shiftDate(week,day),date=selected<historyStart(today)?historyStart(today):selected;
  const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  return {week:shiftDate(date,-weekday),day:weekday,date};
}
