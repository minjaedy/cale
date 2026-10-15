// Notification metadata only. No meal text, comments, credentials or API responses.
const BADGE_CACHE='tempo-badges-v1';
const BADGE_URL=new URL('./.badge-state',self.registration.scope).href;
const BADGE_YEAR=365*86400000,BADGE_LIMIT=2000;
let badgeQueue=Promise.resolve(),badgeMemory=null;
const badgeTag=value=>typeof value==='string'&&value.startsWith('tempo-')&&value.length<=180;
const badgeUid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const badgeKind=value=>['meal','comment','routine','test'].includes(value)?value:'other';
function cleanBadge(state,now){
  const valid=x=>x&&badgeTag(x.tag)&&Number.isFinite(x.at)&&x.at>=now-BADGE_YEAR;
  return {owner:state?.owner??null,items:(Array.isArray(state?.items)?state.items:[]).filter(valid).slice(-BADGE_LIMIT),acks:(Array.isArray(state?.acks)?state.acks:[]).filter(valid).slice(-BADGE_LIMIT)};
}
async function badgeIcon(count){try{if(count&&typeof self.navigator?.setAppBadge==='function')await self.navigator.setAppBadge(count);else if(!count&&typeof self.navigator?.clearAppBadge==='function')await self.navigator.clearAppBadge();else if(!count&&typeof self.navigator?.setAppBadge==='function')await self.navigator.setAppBadge(0)}catch{}}
function changeBadge(change=state=>state){
  const work=badgeQueue.then(async()=>{
    let cache;try{cache=await caches.open(BADGE_CACHE)}catch{}
    if(!badgeMemory){try{badgeMemory=await(await cache?.match(BADGE_URL))?.json()}catch{}badgeMemory??={owner:null,items:[],acks:[]};}
    const before=cleanBadge(badgeMemory,Date.now()),beforeTags=new Set(before.items.map(x=>x.tag));
    badgeMemory=cleanBadge(change(before),Date.now());
    try{await cache?.put(BADGE_URL,new Response(JSON.stringify(badgeMemory),{headers:{'Content-Type':'application/json'}}))}catch{}
    await badgeIcon(badgeMemory.items.length);
    const remaining=new Set(badgeMemory.items.map(x=>x.tag));
    try{for(const notice of await self.registration.getNotifications?.()||[])if(beforeTags.has(notice.tag)&&!remaining.has(notice.tag))notice.close()}catch{}
    return badgeMemory.items.length;
  });
  badgeQueue=work.catch(()=>{});return badgeQueue;
}
function ackBadge(state,tags){
  const known=new Set(state.acks.map(x=>x.tag)),now=Date.now();
  for(const tag of tags)if(badgeTag(tag)&&!known.has(tag)){state.acks.push({tag,at:now});known.add(tag)}
  state.items=state.items.filter(x=>!known.has(x.tag));return state;
}
self.TempoBadge={
  restore:()=>changeBadge(),
  push:data=>changeBadge(state=>{
    const uid=badgeUid(data.recipient)?data.recipient:null;
    if(state.owner===''||(state.owner&&uid&&state.owner!==uid))return state;
    if(!state.owner&&uid)state.owner=uid;
    const tag=String(data.tag||'tempo-update').slice(0,180),kind=badgeKind(data.kind||(data.screen==='routine'?'routine':tag.startsWith('tempo-test-')?'test':'other'));
    if(!badgeTag(tag)||state.acks.some(x=>x.tag===tag))return state;
    const source=state.items.find(x=>x.tag===tag)?.source||'push';state.items=state.items.filter(x=>x.tag!==tag);
    state.items.push({tag,kind,source,member:badgeUid(data.member)?data.member:'',at:Math.min(Number(data.createdAt)||Date.now(),Date.now())});return state;
  }),
  read:tag=>changeBadge(state=>ackBadge(state,[tag])),
  message:data=>changeBadge(state=>{
    if(data.type==='tempo-badge-account')return data.uid===state.owner?state:{owner:badgeUid(data.uid)?data.uid:'',items:[],acks:[]};
    if(!badgeUid(data.uid)||state.owner!==data.uid)return state;
    if(data.type==='tempo-badge-visible'){
      const tags=state.items.filter(x=>data.screen==='routine'?x.kind==='routine':data.screen==='coaching'?x.kind==='test':false).map(x=>x.tag);
      return ackBadge(state,tags);
    }
    if(data.type!=='tempo-badge-sync'||!Array.isArray(data.unread)||!Array.isArray(data.seen))return state;
    const unread=data.unread.filter(x=>x&&badgeTag(x.tag)&&['meal','comment'].includes(x.kind)&&Number.isFinite(x.at)).slice(-BADGE_LIMIT);
    const incoming=new Set(unread.map(x=>x.tag));
    const members=new Set(Array.isArray(data.members)?data.members.filter(badgeUid):[]);
    const removed=state.items.filter(x=>['meal','comment'].includes(x.kind)&&(!members.has(x.member)||(x.source==='feed'&&!incoming.has(x.tag)&&x.at<=data.at))).map(x=>x.tag);
    const removedTags=new Set(removed);state.items=state.items.filter(x=>!removedTags.has(x.tag));
    ackBadge(state,data.seen.filter(badgeTag).slice(-BADGE_LIMIT));
    const acked=new Set(state.acks.map(x=>x.tag)),existing=new Map(state.items.map(x=>[x.tag,x]));
    for(const x of unread)if(!acked.has(x.tag))existing.set(x.tag,{tag:x.tag,kind:x.kind,source:'feed',at:x.at,member:badgeUid(x.member)?x.member:''});
    state.items=[...existing.values()].sort((a,b)=>a.at-b.at);return state;
  })
};
self.addEventListener('message',event=>{
  if(!['tempo-badge-account','tempo-badge-sync','tempo-badge-visible'].includes(event.data?.type)||!event.source?.url)return;
  let source;try{source=new URL(event.source.url)}catch{return}
  const scope=new URL(self.registration.scope);
  if(source.origin!==scope.origin||!source.pathname.startsWith(scope.pathname)||source.pathname.endsWith('/demo.html'))return;
  event.waitUntil(self.TempoBadge.message(event.data));
});
