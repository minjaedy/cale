export const clone = value => JSON.parse(JSON.stringify(value));
const safeKey = key => !['__proto__','prototype','constructor'].includes(key);
export function applyPatch(data, patch) {
  const result = clone(data || {});
  for (const [path, value] of Object.entries(patch)) {
    const parts = path.split('/');
    if (!parts.every(safeKey)) continue;
    let target = result;
    for (const part of parts.slice(0, -1)) target = target[part] ||= {};
    if (value === null) delete target[parts.at(-1)];
    else target[parts.at(-1)] = clone(value);
  }
  return result;
}
export function cleanEvent(event) {
  return {day:event.day,title:event.title,start:event.start,end:event.end==='00:00'?'24:00':event.end,cat:event.cat,note:event.note||'',...(event.seriesId?{seriesId:event.seriesId}:{})};
}
export function eventDiff(before, after) {
  const prev = Object.fromEntries(before.map(e=>[e.id,cleanEvent(e)]));
  const next = Object.fromEntries(after.map(e=>[e.id,cleanEvent(e)]));
  const patch = {};
  for (const [id, value] of Object.entries(next)) if(JSON.stringify(prev[id])!==JSON.stringify(value))patch['events/'+id]=value;
  for (const id of Object.keys(prev)) if(!(id in next))patch['events/'+id]=null;
  return patch;
}
export function mergeOutbox(queue, patch, revision) {
  const next = clone(queue || {});
  for(const [path,value] of Object.entries(patch)){
    const ancestor=Object.keys(next).find(p=>path.startsWith(p+'/'));
    if(ancestor){next[ancestor]={value:applyPatch(next[ancestor].value,{[path.slice(ancestor.length+1)]:value}),revision};continue;}
    for(const p of Object.keys(next))if(p.startsWith(path+'/'))delete next[p];
    next[path]={value,revision};
  }
  return next;
}
export function acknowledge(queue, sent) {
  const next = {...queue};
  for(const [path,entry] of Object.entries(sent))if(next[path]?.revision===entry.revision)delete next[path];
  return next;
}
export const queuedPatch = queue => Object.fromEntries(Object.entries(queue).map(([p,e])=>[p,e.value]));
