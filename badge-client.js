// Keep the installed app badge aligned with this signed-in account.
export function createBadgeClient({navigator:nav=navigator,document:doc=document,location:loc=location}={}){
  let uid=null,accountKnown=false,snapshot=null,signature='',queue=Promise.resolve();
  const enabled=()=>!doc.body?.dataset.demo&&!loc.pathname.endsWith('/demo.html');
  async function post(data){
    if(!enabled()||!nav.serviceWorker)return;
    try{const reg=await nav.serviceWorker.getRegistration('./');if(reg?.scope!==new URL('./',loc.href).href)return;reg.active?.postMessage(data)}catch{}
  }
  function send(data){queue=queue.then(()=>post(data)).catch(()=>{});return queue}
  const client={
    account(next){if(accountKnown&&next===uid)return;accountKnown=true;uid=next;snapshot=null;signature='';return send({type:'tempo-badge-account',uid:next})},
    sync(next){if(!uid||next.uid!==uid)return;const key=JSON.stringify([uid,next.unread,next.seen,next.members]);if(key===signature)return;signature=key;snapshot={...next,type:'tempo-badge-sync',at:Date.now()};return send(snapshot)},
    visible(screen,entered){if(!uid||!entered||doc.visibilityState!=='visible')return;return send({type:'tempo-badge-visible',uid,screen})},
    restore(){if(!accountKnown)return;send({type:'tempo-badge-account',uid});if(snapshot)send(snapshot)},
    clear(){accountKnown=true;uid=null;snapshot=null;signature='';return send({type:'tempo-badge-account',uid:null})}
  };
  nav.serviceWorker?.addEventListener('controllerchange',()=>client.restore());
  return client;
}
