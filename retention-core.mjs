export const DAY=86400000;
export function cutoffs(now=Date.now()){
  const date=new Date(now+9*3600000).toISOString().slice(0,10);
  const start=Date.parse(date+'T00:00:00Z');
  return {before:new Date(start-30*DAY).toISOString().slice(0,10),weightBefore:new Date(start-365*DAY).toISOString().slice(0,10),seenBefore:now-30*DAY};
}
export function pruneDays(days={},now=Date.now()){
  const {before,weightBefore}=cutoffs(now),out={};
  for(const [date,log] of Object.entries(days||{})){
    if(date<weightBefore)continue;
    if(date<before){const kept={};for(const k of ['weight','weeklyWeight'])if(typeof log[k]==='number')kept[k]=log[k];if(Object.keys(kept).length)out[date]={...kept,updatedAt:log.updatedAt||now};}
    else out[date]=log;
  }
  return out;
}
export function pruneQueue(queue={},now=Date.now()){
  const {before,weightBefore}=cutoffs(now),out={};
  for(const [path,item] of Object.entries(queue)){
    const [,date,key]=path.split('/');
    if(!path.startsWith('days/')){out[path]=item;continue;}
    if(date<weightBefore)continue;
    if(date<before&&!['weight','weeklyWeight','updatedAt'].includes(key))continue;
    out[path]=item;
  }
  for(const path of Object.keys(out))if(path.endsWith('/updatedAt')&&!Object.keys(out).some(p=>p!==path&&p.startsWith(path.slice(0,-9))))delete out[path];
  return out;
}
