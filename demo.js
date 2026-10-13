import {setNutritionFeed,setCommunityFoods,setNutritionActions} from './nutrition-ui.js?v=3';
import {profileInput} from './account-core.mjs?v=3';
const ui=await window.TempoCoachingUIReady,$=id=>document.getElementById(id),member='tempo-demo-member',trainer='tempo-demo-trainer';
document.body.dataset.demo='true';
const date=d=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const today=date(new Date()),week=new Date();week.setDate(week.getDate()-(week.getDay()+6)%7);
const previous=n=>{const d=new Date(week);d.setDate(d.getDate()-7*n);return date(d)};
const yesterdayDate=new Date();yesterdayDate.setDate(yesterdayDate.getDate()-1);const yesterday=date(yesterdayDate);
let role='member',linked=true,foods={},profile={role:'member',name:'체험 회원',registered:true,calendarName:'체험 루틴',nutritionMode:'auto',age:30,height:175,startWeight:82,targetWeight:75,formulaSex:'male',activity:'moderate'};
const coachProfile={role:'trainer',name:'체험 코치',registered:true};
let feed={sampleMeal:{kind:'meal',meal:'lunch',date:today,text:'김치찌개 1인분, 밥 한 공기',calories:576,calorieGoal:2430,nutritionComplete:true,nutritionMethod:'catalog-v1',authorUid:member,authorName:'체험 회원',createdAt:Date.now()-120000},sampleComment:{kind:'comment',mealId:'sampleMeal',date:today,text:'꾸준히 기록해 봐요.',sticker:'cheer',authorUid:trainer,authorName:'체험 코치',createdAt:Date.now()-60000}},seen={};
feed.yesterdayMeal={...feed.sampleMeal,date:yesterday,text:'밥 한 공기, 콜라 500ml',calories:547,createdAt:Date.now()-86400000};
const events=[];
for(let day=0;day<7;day++){
  events.push({id:'demo-lunch-'+day,seriesId:'demo-lunch',title:'점심',start:'12:00',end:'13:00',cat:'life',day,note:''});
  if([0,2,4].includes(day))events.push({id:'demo-strength-'+day,seriesId:'demo-strength',title:'근력',start:'19:00',end:'20:00',cat:'str',day,note:''});
  if([1,3,5].includes(day))events.push({id:'demo-walk-'+day,seriesId:'demo-walk',title:'산책',start:'07:00',end:'08:00',cat:'cardio',day,note:''});
}
window.Tempo.setAccount(member);
const logs={[previous(2)]:{weeklyWeight:82},[previous(1)]:{weeklyWeight:81.5},[previous(0)]:{weeklyWeight:81}};
logs[today]={...logs[today],completed:{['demo-lunch-'+((new Date().getDay()+6)%7)]:true}};
logs[yesterday]={...logs[yesterday],lunch:'밥 한 공기, 콜라 500ml',completed:{['demo-lunch-'+((yesterdayDate.getDay()+6)%7)]:true}};
window.Tempo.receiveCloud({events,logs});
const notice=()=>window.Tempo.notify('체험 모드 · 실제 연결은 본 앱에서');
window.TempoCloud={state:{status:'local',user:{name:'체험 모드'},message:'이 기기에서만 체험 · 실제 계정과 분리'},pending:false,eventsChanged(){},logChanged(){},login:notice,logout:notice,retry:notice,importLocal:notice};
window.TempoCoach={pending:false,get hasDraft(){return ui.hasDraft()}};
function render(){
  const uid=role==='member'?member:trainer,p=role==='member'?profile:coachProfile;
  ui.update({user:{uid,displayName:p.name},role,profile:p,connected:true,links:linked?(role==='member'?{[trainer]:{trainerName:coachProfile.name}}:{[member]:{memberName:profile.name}}):{},feeds:linked||role==='member'?{[member]:feed}:{},seen,pending:[]});
  window.Tempo.setProfile(p);setNutritionFeed(feed);setCommunityFoods(foods,Object.keys(foods));
  document.querySelectorAll('[data-demo-role]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.demoRole===role));
}
function switchRole(next){if(!window.Tempo.canUpdate){window.Tempo.notify('입력창을 먼저 닫아 주세요.');return}window.TempoAccount.close();role=next;render();ui.enter();if(role==='member')window.Tempo.showPlan();}
setNutritionActions({saveFood:async(food,id)=>{id=id||crypto.randomUUID();foods[id]={...food,id,updatedAt:Date.now(),source:'community'};setCommunityFoods(foods,Object.keys(foods));queueMicrotask(()=>{$('foodStatus').textContent='체험 저장 · 실제 공용 DB에는 등록하지 않음'})},removeFood:async id=>{delete foods[id];setCommunityFoods(foods,Object.keys(foods))}});
ui.setActions({
  schedule:(id,day)=>{const snapshot=window.Tempo.snapshot(),record=snapshot.logs[day]||{};ui.schedule(id&&linked?{member:id,date:day,events:Object.fromEntries(snapshot.events.map(e=>[e.id,e])),completed:record.completed,items:record.items,loading:false}:null)},
  google:switchRole,continue:switchRole,passkey:notice,register:notice,removeKey:notice,
  profile:async(data,next)=>{const value=profileInput(data,next);if(next==='member')profile={...profile,...value};else Object.assign(coachProfile,value);render();ui.enter();return true},
  meal:async data=>{feed[crypto.randomUUID()]={...data,kind:'meal',authorUid:member,authorName:profile.name,createdAt:Date.now()};render();window.Tempo.notify('식단 등록 · 트레이너 화면에서 확인');return true},
  comment:async data=>{feed[crypto.randomUUID()]={...data,kind:'comment',authorUid:trainer,authorName:coachProfile.name,createdAt:Date.now()};render();window.Tempo.notify('코멘트 등록 · 회원 화면에서 확인');return true},
  deleteMeal:async id=>{if(!confirm('체험 식단과 코멘트를 삭제할까요?'))return;for(const [key,v] of Object.entries(feed))if(key===id||v.mealId===id)delete feed[key];render();window.Tempo.notify('식단 삭제 완료')},
  read:ids=>{for(const id of ids)seen[id]=Date.now();render()},more:()=>window.Tempo.notify('전체 체험 기록 표시 중'),
  invite:()=>ui.invite('abcdef0123456789abcdef0123456789'),cancelInvite:()=>ui.invite(null),
  connect:()=>{linked=true;render();window.Tempo.notify('체험 회원 연결')},revoke:()=>{linked=false;render();window.Tempo.notify('체험 연결 해제')},
  enablePush:notice,disablePush:notice,testPush:notice,reminders:notice,logout:()=>location.assign('./')
});
const panel=document.createElement('section');panel.className='demo-panel';panel.setAttribute('aria-label','체험 모드');panel.innerHTML='<div><strong>TEMPO 체험</strong><a href="https://minjaedy.github.io/cale/">실제 앱 ↗</a></div><p>실제 계정과 분리 · 새로 열면 초기화</p><div class="demo-controls"><button data-demo-role="member">회원</button><button data-demo-role="trainer">트레이너</button><button id="demoRegistration">처음 등록</button></div><p>알림·Face ID는 실제 앱에서 확인</p>';
document.querySelector('.app-header').before(panel);
panel.onclick=ev=>{const b=ev.target.closest('button');if(!b)return;if(b.dataset.demoRole)switchRole(b.dataset.demoRole);if(b.id==='demoRegistration'){role='member';render();ui.registration('member')}};
let resumePage=false;try{resumePage=!!sessionStorage.getItem('tempo-update-page')}catch{}
render();ui.enter();if(!resumePage)window.Tempo.showPlan();
