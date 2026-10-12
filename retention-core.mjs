export const DAY=86400000;
export const RETENTION_DAYS=365;
// Include today and the preceding 364 dates: exactly 365 daily record buckets.
export function historyStart(date){return new Date(Date.parse(date+'T00:00:00Z')-(RETENTION_DAYS-1)*DAY).toISOString().slice(0,10)}
export function cutoffs(now=Date.now()){
  const date=new Date(now+9*3600000).toISOString().slice(0,10);
  const before=historyStart(date);
  return {before,weightBefore:before,seenBefore:now-RETENTION_DAYS*DAY};
}
export function pruneDays(days={},now=Date.now()){
  const {before}=cutoffs(now);
  return Object.fromEntries(Object.entries(days||{}).filter(([date])=>date>=before));
}
export function pruneQueue(queue={},now=Date.now()){
  const {before}=cutoffs(now),out={};
  for(const [path,item] of Object.entries(queue)){
    const [,date,key]=path.split('/');
    if(!path.startsWith('days/')){out[path]=item;continue;}
    if(date<before)continue;
    out[path]=item;
  }
  for(const path of Object.keys(out))if(path.endsWith('/updatedAt')&&!Object.keys(out).some(p=>p!==path&&p.startsWith(path.slice(0,-9))))delete out[path];
  return out;
}
