import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getDatabase, ref, onValue, update, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import { clone, applyPatch, cleanEvent, eventDiff, mergeOutbox, acknowledge, queuedPatch } from './sync-core.mjs';

const ui=window.Tempo, config=window.TEMPO_FIREBASE_CONFIG;
const app=initializeApp(config), auth=getAuth(app), db=getDatabase(app), provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});
let user=null, connected=false, unsubscribe=null, queue={}, busy=false, ready=false, revision=0, generation=0, lastEvents=[], currentData={};
let state={status:'signed-out',user:null,message:'Google 계정으로 로그인하면 아이폰과 PC의 기록이 이어져요.'};
const queueKey=uid=>'tempo-outbox-v1:'+uid;
const friendlyError=error=>({
  'auth/unauthorized-domain':'이 사이트 주소가 로그인 허용 도메인에 등록되지 않았어요.',
  'auth/operation-not-allowed':'Firebase에서 Google 로그인을 먼저 활성화해 주세요.',
  'auth/popup-blocked':'로그인 창이 차단됐어요. Safari에서 팝업을 허용한 뒤 다시 눌러 주세요.',
  'auth/network-request-failed':'네트워크 연결을 확인하고 다시 시도해 주세요.',
  'PERMISSION_DENIED':'데이터 접근이 거부됐어요. Realtime Database 규칙이 배포됐는지 확인해 주세요.',
  'permission-denied':'데이터 접근이 거부됐어요. Realtime Database 규칙이 배포됐는지 확인해 주세요.'
}[error?.code]||'연결에 실패했어요. 기록은 이 기기에 보관 중입니다. 다시 시도해 주세요.');
function publish(message,status){state={status:status||(user?(!ready?'loading':connected?'connected':'offline'):'signed-out'),user:user?{uid:user.uid,name:user.displayName||'내 계정',email:user.email||''}:null,message:message||(user?(!ready?'계정의 기록을 불러오고 있어요.':Object.keys(queue).length?'변경 내용을 동기화하고 있어요.':connected?'계정에 저장됐어요. 다른 기기에서도 이어서 사용할 수 있어요.':'오프라인이에요. 연결되면 남은 기록을 동기화해요.'):'Google 계정으로 로그인하면 아이폰과 PC의 기록이 이어져요.')};ui.cloudStatus(state);}
function saveQueue(){if(!user)return;try{localStorage.setItem(queueKey(user.uid),JSON.stringify(queue));}catch{ui.notify('오프라인 보관 공간이 부족해요. 연결될 때까지 이 화면을 열어 두세요.');}}
function enqueue(patch){if(!user||!Object.keys(patch).length)return;queue=mergeOutbox(queue,patch,++revision);saveQueue();publish();flush();}
async function flush(){if(!user||!ready||!connected||busy||!Object.keys(queue).length)return;const mine=generation,uid=user.uid,sent=clone(queue);busy=true;try{await update(ref(db,'tempo/users/'+uid),queuedPatch(sent));if(mine!==generation)return;queue=acknowledge(queue,sent);saveQueue();publish();}catch(error){if(mine===generation)publish(friendlyError(error),'error');return;}finally{if(mine===generation)busy=false;}if(mine===generation&&Object.keys(queue).length)flush();}
function receive(data){currentData=data||{};const merged=applyPatch(currentData,queuedPatch(queue));const nextEvents=Object.entries(merged.events||{}).map(([id,e])=>({id,...e}));lastEvents=nextEvents;ui.receiveCloud({events:nextEvents,logs:merged.days||{}});}
onValue(ref(db,'.info/connected'),snap=>{connected=snap.val()===true;if(user){publish();flush();}});
await setPersistence(auth,browserLocalPersistence).catch(()=>ui.notify('로그인 정보를 계속 보관할 수 없는 브라우저예요.'));
onAuthStateChanged(auth,next=>{
  generation++;unsubscribe?.();unsubscribe=null;user=next;busy=false;ready=false;queue={};currentData={};
  ui.setAccount(user?.uid||null);
  if(!user){publish();return;}
  try{queue=JSON.parse(localStorage.getItem(queueKey(user.uid))||'{}')||{};}catch{queue={};}
  revision=Math.max(0,...Object.values(queue).map(v=>v.revision||0));lastEvents=ui.snapshot().events;
  publish('계정의 기록을 불러오고 있어요.','loading');
  const mine=generation;
  unsubscribe=onValue(ref(db,'tempo/users/'+user.uid),snap=>{
    if(mine!==generation)return;
    const data=snap.val()||{};ready=true;
    if(!data.meta?.initialized){const initial={'meta/initialized':true};if(!data.events)for(const e of lastEvents)initial['events/'+e.id]=cleanEvent(e);queue=mergeOutbox(queue,initial,++revision);saveQueue();}
    receive(data);publish();flush();
  },error=>{if(mine===generation){ready=false;publish(friendlyError(error),'error');}});
});
window.TempoCloud={
  get state(){return state;},
  async login(){if(location.protocol==='file:'){ui.notify('동기화는 배포한 웹사이트에서 사용할 수 있어요.');return;}try{await signInWithPopup(auth,provider);}catch(error){if(!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code)){publish(friendlyError(error),'error');ui.notify(friendlyError(error));}}},
  async logout(){if(Object.keys(queue).length){ui.notify('아직 동기화되지 않은 기록이 있어요. 연결 후 다시 시도해 주세요.');return;}await signOut(auth);},
  retry(){if(user&&!ready){ui.notify('페이지를 새로고침한 뒤 다시 연결해 주세요.');return;}flush();},
  eventsChanged(next){if(!user)return;const patch=eventDiff(lastEvents,next);lastEvents=clone(next);enqueue(patch);},
  logChanged(date,patch){if(!user)return;const updates={['days/'+date+'/updatedAt']:serverTimestamp()};for(const [key,value] of Object.entries(patch))updates['days/'+date+'/'+key]=value;enqueue(updates);},
  importLocal(){if(!user||!ready){ui.notify('계정의 기록을 먼저 불러와 주세요.');return;}const local=ui.guestSnapshot(),patch={};const present=applyPatch(currentData,queuedPatch(queue));for(const [ds,lg] of Object.entries(local.logs)){for(const k of ['weight','breakfast','lunch','snack','dinner'])if(lg[k]!==undefined&&lg[k]!==null&&present.days?.[ds]?.[k]===undefined)patch['days/'+ds+'/'+k]=lg[k];for(const [k,v] of Object.entries(lg.items||{}))if(present.days?.[ds]?.items?.[k]===undefined)patch['days/'+ds+'/items/'+k]=!!v;if(Object.keys(patch).some(p=>p.startsWith('days/'+ds+'/')))patch['days/'+ds+'/updatedAt']=serverTimestamp();}for(const e of local.events)if(!present.events?.[e.id])patch['events/'+e.id]=cleanEvent(e);enqueue(patch);receive(currentData);ui.notify(Object.keys(patch).length?'기존 기록에서 비어 있는 항목을 가져왔어요.':'추가로 가져올 기록이 없어요.');}
};
publish();
