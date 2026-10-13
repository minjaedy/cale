const current=document.querySelector('meta[name="tempo-version"]')?.content;
let newest=null,checking=false,reloading=false;
const banner=document.createElement('div');banner.className='update-banner';banner.hidden=true;banner.setAttribute('role','status');banner.innerHTML='<span></span>';document.body.append(banner);
function safe(){return navigator.onLine&&document.visibilityState==='visible'&&window.Tempo?.canUpdate&&!window.TempoCloud?.pending&&!window.TempoCoach?.pending&&!window.TempoCoach?.hasDraft;}
function apply(){
  if(!newest||reloading)return;
  if(!safe()){banner.querySelector('span').textContent='입력·저장 후 자동 업데이트';return;}
  reloading=true;banner.querySelector('span').textContent='새 버전 적용 중';
  setTimeout(()=>{
    if(!newest||!safe()){reloading=false;banner.querySelector('span').textContent='입력·저장 후 자동 업데이트';return;}
    try{sessionStorage.setItem('tempo-update-page',window.Tempo.currentPage)}catch{}
    const url=new URL(location.href);url.searchParams.set('v',newest);location.replace(url.href);
  },1200);
}
async function check(manual=false){
  if(checking)return;
  if(!current||current.startsWith('__')||!navigator.onLine){if(manual)window.Tempo?.notify('인터넷 연결 후 다시 확인');return;}
  checking=true;
  try{
    const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Version unavailable');
    const v=await r.json();if(typeof v.id!=='string'||!/^[a-f0-9]{12,64}$/.test(v.id))throw Error('Invalid version');
    newest=v.id===current?null:v.id;banner.hidden=!newest;
    if(newest)apply();else if(manual)window.Tempo?.notify('최신 버전');
    // A worker update must not delay or prevent the page update.
    try{await(await navigator.serviceWorker?.getRegistration('./'))?.update()}catch{}
  }catch{if(manual)window.Tempo?.notify('업데이트 확인 실패');}finally{checking=false;}
}
setInterval(apply,2000);
setInterval(()=>{if(document.visibilityState==='visible')void check()},15000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check()});
for(const event of ['online','focus','pageshow'])window.addEventListener(event,()=>void check());
for(const event of ['focusout','change','tempo-synced','tempo-page','tempo-entry','tempo-coach-view'])window.addEventListener(event,()=>{if(newest)apply()});
window.TempoUpdate={check};void check();
