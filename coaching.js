import {ref,get,set,update,onValue,runTransaction,query,orderByChild,limitToLast,startAt,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';
import {onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signInWithCustomToken,reauthenticateWithPopup} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {startRegistration,startAuthentication} from './passkey-browser.js?v=3';
import {legacyProfile,profileInput} from './account-core.mjs?v=3';
const SERVER='https://tempo-coach.couple-private-push.workers.dev';
import {cutoffs} from './retention-core.mjs?v=3';
import {setNutritionFeed,setCommunityFoods,upsertCommunityFood,removeCommunityFood,setNutritionActions} from './nutrition-ui.js?v=3';
let nutritionStop;let auth,db,ui,user=null,role='member',profile={},entryIntent=null,connected=false,offset=0,links={},feeds={},seen={},pending=[],unsubs=[],feedSubs=new Map(),linkSubs=new Map(),generation=0,busy=false,loading=Promise.resolve(),limit=100,inviteCode='',routineWanted=true;
const localGet=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
const localSet=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}};
const outboxKey=()=> 'tempo-coaching-outbox:'+user.uid;
const name=()=>String(profile.name||user?.displayName||user?.email?.split('@')[0]||'TEMPO').slice(0,60);
const requireUser=()=>{if(!user)throw Error('먼저 로그인해 주세요.');};
const requireOnline=()=>{requireUser();if(!connected)throw Error('인터넷에 연결한 뒤 다시 시도해 주세요.');};
function publish(){ui.update({user,role,profile,connected,links,feeds,seen,pending});window.Tempo.setProfile(profile)}
async function api(path,data={},authenticated=true){
  const token=authenticated?await auth.currentUser?.getIdToken():null;
  if(authenticated&&!token)throw Error('먼저 로그인해 주세요.');
  const r=await fetch(SERVER+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
  const body=await r.json();if(!r.ok)throw Error(body.error||'연결하지 못했어요. 다시 시도해 주세요.');return body;
}
const errorText=e=>['NotAllowedError','AbortError'].includes(e?.name)?'인증을 취소했어요. 다시 시도하거나 Google로 입장해 주세요.':e?.code==='auth/popup-closed-by-user'?'로그인 창을 닫았어요.':e?.code==='auth/popup-blocked'?'Safari에서 팝업을 허용한 뒤 다시 눌러 주세요.':e?.code?.includes('permission')||e?.message?.includes('PERMISSION_DENIED')?'연결 권한이 없거나 초대 코드가 만료됐어요.':e?.message||'연결을 확인하고 다시 시도해 주세요.';
async function action(fn){if(busy)return;busy=true;ui.entryBusy(true);try{return await fn()}catch(e){ui.status(errorText(e));window.Tempo.notify(errorText(e));return false}finally{busy=false;ui.entryBusy(false)}}
function clearListeners(){nutritionStop?.();nutritionStop=null;setNutritionFeed({});unsubs.forEach(fn=>fn());unsubs=[];for(const fn of feedSubs.values())fn();for(const fn of linkSubs.values())fn();feedSubs.clear();linkSubs.clear();links={};feeds={};seen={};}
function feed(member){
  if(feedSubs.has(member))return;const mine=generation;let active=true,revision=0;
  const stop=onValue(query(ref(db,'tempo/coaching/feed/'+member),orderByChild('createdAt'),limitToLast(limit)),async s=>{
    const rev=++revision,items=s.val()||{};
    // A recent comment may refer to a meal outside the latest-message window.
    const parents=[...new Set(Object.values(items).filter(v=>v.kind==='comment'&&!items[v.mealId]).map(v=>v.mealId))];
    try{await Promise.all(parents.map(async id=>{const parent=await get(ref(db,'tempo/coaching/feed/'+member+'/'+id));if(parent.exists())items[id]=parent.val()}));if(active&&mine===generation&&rev===revision){feeds[member]=items;publish()}}catch(e){if(active&&mine===generation)ui.setLoadError(errorText(e))}
  },e=>{if(!active||mine!==generation)return;delete feeds[member];publish();ui.setLoadError(errorText(e));});
  feedSubs.set(member,()=>{active=false;stop()});
}
function connectListeners(){
  clearListeners();if(!user)return;const uid=user.uid,mine=generation;
  unsubs.push(onValue(ref(db,'tempo/coaching/profiles/'+uid),s=>{if(mine===generation){profile=s.val()||{};publish()}}));
  unsubs.push(onValue(ref(db,'tempo/coaching/seen/'+uid),s=>{if(mine===generation){seen=s.val()||{};publish()}}));
  if(role==='member'){
    feed(uid);nutritionStop=onValue(query(ref(db,'tempo/coaching/feed/'+uid),orderByChild('date'),startAt(cutoffs().before)),s=>{if(mine===generation)setNutritionFeed(s.val()||{})});unsubs.push(onValue(ref(db,'tempo/coaching/links/'+uid),s=>{if(mine===generation){links=s.val()||{};publish()}}));
  }else{
    unsubs.push(onValue(ref(db,'tempo/coaching/roster/'+uid),s=>{
      if(mine!==generation)return;const members=Object.keys(s.val()||{});
      for(const [id,unsub] of linkSubs)if(!members.includes(id)){unsub();linkSubs.delete(id);feedSubs.get(id)?.();feedSubs.delete(id);delete links[id];delete feeds[id];}
      for(const id of members)if(!linkSubs.has(id))linkSubs.set(id,onValue(ref(db,'tempo/coaching/links/'+id+'/'+uid),snap=>{
        if(mine!==generation)return;
        if(snap.exists()){links[id]=snap.val();feed(id)}else{feedSubs.get(id)?.();feedSubs.delete(id);delete links[id];delete feeds[id]}publish();
      },()=>{if(mine===generation){feedSubs.get(id)?.();feedSubs.delete(id);delete links[id];delete feeds[id];publish()}}));publish();
    }));
  }
}
let refreshingFoods=false;
async function refreshCommunity(){if(refreshingFoods)return;refreshingFoods=true;const mine=generation;try{const result=user?await api('/foods/catalog'):await fetch(SERVER+'/foods/catalog',{signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error();return r.json()});if(mine===generation)setCommunityFoods(result.foods,result.mine||[]);}catch{}finally{refreshingFoods=false}}
async function setRole(next){
  requireOnline();if(!['member','trainer'].includes(next))throw Error('계정 유형을 선택해 주세요.');
  if(profile.role&&profile.role!==next)throw Error('이 계정은 '+(profile.role==='trainer'?'트레이너':'일반 사용자')+' 계정입니다. 다른 계정은 로그아웃 후 선택해 주세요.');
  role=next;connectListeners();publish();
  if(profile.registered)ui.enter();else ui.registration(role);
  void refreshPush();if(role==='trainer')void listKeys();
}
async function flush(){
  if(!user||!connected||!pending.length||flush.running)return;const uid=user.uid,mine=generation;flush.running=true;
  try{for(const item of [...pending]){
    if(item.error)continue;
    try{const result=await api('/publish',item);if(mine!==generation||user?.uid!==uid)return;pending=pending.filter(p=>p.id!==item.id);localSet(outboxKey(),pending);publish();window.Tempo.notify(item.kind==='meal'?(result.recipients?'식단 등록 완료':'식단 등록 완료 · 트레이너 미연결'):'코멘트 등록 완료');}
    catch(e){if(mine!==generation)return;item.error=errorText(e);pending=pending.map(p=>p.id===item.id?item:p);localSet(outboxKey(),pending);publish();}
  }}finally{flush.running=false;}
}
async function queue(data){
  requireUser();if(data.date<cutoffs().before)throw Error('30일이 지난 기록은 등록할 수 없어요.');if(pending.length>=30)throw Error('전송 대기 30개를 먼저 정리해 주세요.');
  if(data.kind==='comment'&&!links[data.member])throw Error('회원 연결을 먼저 확인해 주세요.');
  const item={...data,id:crypto.randomUUID()};pending.push(item);
  if(!localSet(outboxKey(),pending)){pending.pop();throw Error('기기에 임시 보관하지 못했어요. 저장 공간을 확인해 주세요.');}
  publish();void flush();return true;
}
async function freshGoogle(){requireUser();return reauthenticateWithPopup(auth.currentUser,new GoogleAuthProvider())}
async function listKeys(){try{const r=await api('/auth/keys');ui.keys(r.keys);localSet('tempo-has-passkey:'+user.uid,r.keys.length>0)}catch(e){ui.status(errorText(e))}}
async function refreshPush(){
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(ios&&!installed){ui.pushState('아이폰: Safari → 공유 → 홈 화면에 추가 후 알림 허용',false);return;}
  if(!('serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window)){ui.pushState('알림 미지원 · 아이폰은 iOS 16.4 이상 홈 화면 앱 필요',false);return;}
  const reg=await navigator.serviceWorker.getRegistration('./'),sub=await reg?.pushManager.getSubscription();
  const binding=localGet('tempo-push-owner',null);
  const enabled=!!sub&&Notification.permission==='granted'&&binding===user?.uid;
  ui.pushState(enabled?'이 기기 알림 켜짐':Notification.permission==='denied'?'알림 차단됨 · 설정 → 알림 → TEMPO에서 허용':'이 기기 알림 꺼짐',enabled);
  document.getElementById('routineReminders').checked=routineWanted;
}
async function registration(){if(!('serviceWorker'in navigator))throw Error('이 브라우저는 앱 알림을 지원하지 않아요.');await navigator.serviceWorker.register('./sw.js');return navigator.serviceWorker.ready}
async function enablePush(permission){requireUser();if(await permission!=='granted')throw Error('알림을 허용해야 받을 수 있어요. 아이폰 설정에서 확인해 주세요.');const reg=await registration(),r=await fetch(SERVER+'/config'),config=await r.json();if(!config.publicKey)throw Error('알림 서버 설정을 확인해 주세요.');const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await api('/push/subscribe',sub.toJSON());localSet('tempo-push-owner',user.uid);await refreshPush();await syncReminders(true);window.Tempo.notify('알림 켜짐');}
async function disablePush(){const reg=await navigator.serviceWorker?.getRegistration('./'),sub=await reg?.pushManager.getSubscription();if(sub){await sub.unsubscribe();try{await api('/push/unsubscribe',{endpoint:sub.endpoint})}catch{}}localSet('tempo-push-owner',null);await refreshPush();}
let lastRoutine='',routineSyncing=false,sessionReady=false;
async function syncReminders(force=false,preference){
  if(!user||!sessionReady||!connected||role!=='member'||routineSyncing||window.TempoCloud?.state.status!=='connected'||window.TempoCloud?.pending)return;
  const signature=JSON.stringify([user.uid,routineWanted,window.Tempo.snapshot().events]);if(!force&&signature===lastRoutine)return;
  const mine=generation;routineSyncing=true;try{const result=await api('/routine/sync',{...(preference!==undefined?{enabled:preference}:{}),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});if(mine!==generation)return;routineWanted=result.enabled;lastRoutine=signature;document.getElementById('routineReminders').checked=routineWanted;document.getElementById('routinePushNote').textContent=routineWanted?'시작 시간 알림 · 약 1분 오차 가능':'루틴 알림 꺼짐'}catch{document.getElementById('routinePushNote').textContent='예약 연결 대기';document.getElementById('routineReminders').checked=routineWanted;}finally{routineSyncing=false}
}
export async function start(context){
  ({auth,db}=context);ui=await window.TempoCoachingUIReady;
  setNutritionActions({
    saveFood:async(food,id)=>{requireOnline();const result=await api('/foods/save',{food,...(id?{id}:{})});upsertCommunityFood(result.food);void refreshCommunity();},
    removeFood:async id=>{requireOnline();await api('/foods/remove',{id});removeCommunityFood(id);void refreshCommunity();}
  });
  ui.setActions({
    google:next=>action(async()=>{entryIntent=next;try{const result=auth.currentUser?{user:auth.currentUser}:await signInWithPopup(auth,new GoogleAuthProvider());await loading;user=result.user;await setRole(next);}finally{entryIntent=null}}),
    continue:next=>action(async()=>{await loading;await setRole(next)}),
    profile:(data,next,first)=>action(async()=>{requireOnline();const patch=profileInput(data,next);if(profile.role&&profile.role!==next)throw Error('계정 유형은 변경할 수 없어요.');const uid=user.uid,mine=generation;await update(ref(db,'tempo/coaching/profiles/'+uid),patch);if(mine!==generation)return false;profile={...profile,...patch};role=next;publish();if(first)ui.enter();window.Tempo.notify(first?'등록 완료':'저장 완료');return true;}),
    passkey:()=>action(async()=>{entryIntent='trainer';try{const a=await api('/auth/login/options',{},false),response=await startAuthentication({optionsJSON:a.options}),r=await api('/auth/login/verify',{response,challengeId:a.challengeId},false);await signInWithCustomToken(auth,r.token);await loading;await setRole('trainer');}finally{entryIntent=null}}),
    invite:()=>action(async()=>{requireOnline();if(inviteCode)await set(ref(db,'tempo/coaching/invites/'+inviteCode),null);inviteCode=crypto.randomUUID().replaceAll('-','');await set(ref(db,'tempo/coaching/invites/'+inviteCode),{member:user.uid,name:name(),expiresAt:Date.now()+offset+86400000});ui.invite(inviteCode);}),
    cancelInvite:()=>action(async()=>{requireOnline();if(inviteCode)await set(ref(db,'tempo/coaching/invites/'+inviteCode),null);inviteCode='';ui.invite(null);}),
    connect:code=>action(async()=>{requireOnline();code=code.trim().toLowerCase();if(!/^[a-f0-9]{32}$/.test(code))throw Error('초대 코드 32자리를 확인해 주세요.');const uid=user.uid,inv=ref(db,'tempo/coaching/invites/'+code);const claimed=await runTransaction(inv,value=>{if(!value||value.member===uid||value.expiresAt<Date.now()+offset||value.claimedBy&&value.claimedBy!==uid)return;return {...value,claimedBy:uid}},{applyLocally:false});if(!claimed.committed)throw Error('이미 사용했거나 만료된 초대 코드예요.');const v=claimed.snapshot.val();const path='tempo/coaching/links/'+v.member+'/'+uid;if(!(await get(ref(db,path))).exists())await set(ref(db,path),{code,memberName:v.name,trainerName:name(),createdAt:serverTimestamp()});await set(ref(db,'tempo/coaching/roster/'+uid+'/'+v.member),true);await set(inv,null);document.getElementById('inviteInput').value='';ui.status('회원 연결 완료');}),
    revoke:id=>action(async()=>{requireOnline();if(!confirm('연결을 해제할까요? 트레이너는 더 이상 이 회원의 식단을 볼 수 없어요. 기존 코멘트는 남아요.'))return;const member=role==='trainer'?id:user.uid,trainer=role==='trainer'?user.uid:id,code=links[id]?.code;const patch={['tempo/coaching/links/'+member+'/'+trainer]:null,['tempo/coaching/roster/'+trainer+'/'+member]:null};if(code&&(await get(ref(db,'tempo/coaching/invites/'+code))).exists())patch['tempo/coaching/invites/'+code]=null;await update(ref(db),patch);}),
    meal:data=>action(()=>queue({...data,kind:'meal',member:user?.uid})),comment:data=>action(()=>queue({...data,kind:'comment'})),
    read:ids=>action(async()=>{requireUser();const patch=Object.fromEntries(ids.map(id=>['tempo/coaching/seen/'+user.uid+'/'+id,Date.now()+offset]));if(ids.length)await update(ref(db),patch);}),
    more:()=>{limit+=100;connectListeners();document.getElementById('feedLimit').textContent='최근 '+limit+'개 · 30일 보관';},
    retry:id=>{pending=pending.map(p=>p.id===id?{...p,error:null}:p);localSet(outboxKey(),pending);publish();void flush();},
    discard:id=>{if(!confirm('아직 전송되지 않은 등록을 취소할까요?'))return;pending=pending.filter(p=>p.id!==id);localSet(outboxKey(),pending);publish();},
    enablePush:()=>{if(!user){ui.status('먼저 로그인해 주세요.');return;}if(!('Notification'in window)){ui.status('아이폰은 홈 화면에 추가한 앱에서 알림을 켜 주세요.');return;}const permission=Notification.requestPermission();void action(()=>enablePush(permission));},
    disablePush:()=>action(disablePush),testPush:()=>action(async()=>{const sub=await(await registration()).pushManager.getSubscription();if(!sub)throw Error('먼저 알림을 켜 주세요.');const r=await api('/push/test',{endpoint:sub.endpoint});ui.status(r.state==='sent'?'전송 완료 · 알림센터 확인':'전송 대기');}),
    reminders:value=>action(async()=>{requireOnline();if(window.TempoCloud?.pending)throw Error('동기화 완료 후 변경해 주세요.');await syncReminders(true,value);}),
    register:()=>action(async()=>{requireOnline();await freshGoogle();const r=await api('/auth/register/options'),response=await startRegistration({optionsJSON:r.options});await api('/auth/register/verify',{response,challengeId:r.challengeId});localSet('tempo-has-passkey:'+user.uid,true);await listKeys();ui.status('Face ID 등록 완료');}),
    removeKey:id=>action(async()=>{await freshGoogle();await api('/auth/remove',{id});await listKeys();}),
    logout:()=>action(async()=>{if(pending.length)throw Error('전송 대기 중인 내용을 먼저 보내거나 취소해 주세요.');if(await window.TempoCloud.logout()!==false)ui.showEntry();})
  });
  onValue(ref(db,'.info/connected'),s=>{connected=s.val()===true;publish();if(connected){pending=pending.map(p=>({...p,error:null}));void flush();void syncReminders();}});
  onValue(ref(db,'.info/serverTimeOffset'),s=>offset=s.val()||0);
  onAuthStateChanged(auth,next=>{
    generation++;sessionReady=false;const mine=generation;clearListeners();user=next;profile={};pending=[];lastRoutine='';inviteCode='';ui.update({user,profile,links:{},feeds:{},seen:{},pending:[]});window.Tempo.setProfile({});
    loading=(async()=>{
      if(!user){role='member';publish();ui.showEntry();return;}
      await window.TempoCloud.accountReady(user.uid);if(mine!==generation)return;
      profile=(await get(ref(db,'tempo/coaching/profiles/'+user.uid))).val()||{};if(mine!==generation)return;
      if(window.TempoCloud.legacyOwner&&!profile.registered&&profile.role!=='trainer'){const r=await runTransaction(ref(db,'tempo/coaching/profiles/'+user.uid),p=>p?.registered?undefined:{...legacyProfile(),...p,registered:true},{applyLocally:false});profile=r.snapshot.val()||profile;}
      if(mine!==generation)return;
      role=profile?.role==='trainer'?'trainer':'member';pending=localGet(outboxKey(),[]);if(!Array.isArray(pending))pending=[];pending=pending.filter(p=>p.date>=cutoffs().before);localSet(outboxKey(),pending);routineWanted=true;
      try{const setting=await api('/routine/settings');if(mine!==generation)return;routineWanted=setting.enabled;}catch{}
      // A subscription belongs to exactly one signed-in account on this browser.
      const previous=localGet('tempo-push-owner',null);if(previous&&previous!==user.uid){const reg=await navigator.serviceWorker?.getRegistration('./');await(await reg?.pushManager.getSubscription())?.unsubscribe();localSet('tempo-push-owner',null);}
      if(mine!==generation)return;void api('/account/ready').catch(()=>{});sessionReady=true;connectListeners();void refreshCommunity();publish();if(!entryIntent&&!ui.hasEntryChoice()){if(profile.registered&&role==='member')ui.enter();else if(profile.role&&!profile.registered)ui.registration(role);}void refreshPush();void flush();void syncReminders();
    })().catch(e=>ui.status(errorText(e)));
  });
  async function presence(){if(!user)return;const active=connected&&ui.isEntered()&&document.visibilityState==='visible'&&window.Tempo.currentPage==='coaching';try{await api('/presence',{active,member:role==='member'?user.uid:ui.viewingMember()})}catch{}}
  setInterval(()=>{if(document.visibilityState==='visible')void refreshCommunity()},60000);void refreshCommunity();
  setInterval(()=>{void presence();void flush();void syncReminders()},20000);
  window.addEventListener('tempo-synced',()=>void syncReminders());
  for(const event of ['visibilitychange','tempo-page','tempo-entry'])window.addEventListener(event,()=>{void presence();if(document.visibilityState==='visible'){void refreshPush();void syncReminders()}});
  document.addEventListener('visibilitychange',()=>void presence());
  window.TempoCoach={get pending(){return pending.length>0||busy},get hasDraft(){return ui.hasDraft()},beforeLogout:async()=>{if(pending.length)throw Error('전송 대기 중인 내용이 있어요.');await disablePush();}};
}
