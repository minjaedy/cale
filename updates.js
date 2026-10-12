const current=document.querySelector('meta[name="tempo-version"]')?.content;
let newest=null,checking=false,reloading=false;
const banner=document.createElement('div');banner.className='update-banner';banner.hidden=true;banner.setAttribute('role','status');banner.innerHTML='<span></span><button type="button">업데이트</button>';document.body.append(banner);
function safe(){return document.visibilityState==='visible'&&window.Tempo?.canUpdate&&!window.TempoCloud?.pending&&!window.TempoCoach?.pending&&!window.TempoCoach?.hasDraft;}
function apply(){if(!newest||reloading)return;if(!safe()){banner.querySelector('span').textContent='입력·전송 후 자동 업데이트';return;}reloading=true;banner.querySelector('span').textContent='업데이트 중';banner.querySelector('button').disabled=true;setTimeout(()=>{if(!safe()){reloading=false;banner.querySelector('button').disabled=false;banner.querySelector('span').textContent='입력·전송 후 자동 업데이트';return;}try{sessionStorage.setItem('tempo-update-page',window.Tempo.currentPage)}catch{}const url=new URL(location.href);url.searchParams.set('v',newest);location.replace(url.href)},1600)}
async function check(manual=false){
  if(checking||!current||current.startsWith('__')||!navigator.onLine){if(manual)window.Tempo.notify('인터넷 연결 후 다시 확인해 주세요.');return;}
  checking=true;try{const r=await fetch('./version.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)return;const v=await r.json();if(typeof v.id!=='string'||!/^[a-f0-9]{12,64}$/.test(v.id))return;if(v.id!==current){newest=v.id;banner.hidden=false;apply()}else if(manual)window.Tempo.notify('최신 버전을 사용 중이에요.');await(await navigator.serviceWorker?.getRegistration('./'))?.update();}catch{if(manual)window.Tempo.notify('업데이트를 확인하지 못했어요. 다시 시도해 주세요.');}finally{checking=false;}
}
banner.querySelector('button').onclick=apply;
setInterval(()=>{if(newest)apply();else if(document.visibilityState==='visible')void check()},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check()});
window.addEventListener('online',()=>void check());window.addEventListener('focusout',()=>{if(newest)setTimeout(apply,1000)});
window.TempoUpdate={check};void check();
