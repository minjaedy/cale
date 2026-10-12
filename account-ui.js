import {NUMBER_FIELDS} from './account-core.mjs?v=3';
const $=id=>document.getElementById(id);
let saveAction,profile={},role='member',first=false,opener=null;
const units={age:'세',height:'cm',startWeight:'kg',targetWeight:'kg',calorieGoal:'kcal',proteinGoal:'g',fatGoal:'g',carbGoal:'g'};
export function initAccount(save){
  saveAction=save;
  const panel=document.createElement('section');panel.id='accountEditor';panel.className='account-overlay';panel.hidden=true;
  panel.innerHTML=`<form id="accountForm" class="account-sheet" role="dialog" aria-modal="true" aria-labelledby="accountTitle"><header><div><p class="eyebrow" id="accountStep">MY TEMPO</p><h2 id="accountTitle">내 정보</h2></div><button type="button" class="icon-btn" id="accountClose" aria-label="내 정보 닫기">×</button></header><div class="account-scroll"><p class="account-intro" id="accountIntro"></p><label class="field">이름<input id="profileName" name="name" maxlength="60" autocomplete="name" required placeholder="이름"></label><label class="field" id="calendarNameField">캘린더 이름<input id="profileCalendar" name="calendarName" maxlength="30" autocomplete="off" required placeholder="나의 루틴"></label><div id="profileTargets"><div class="profile-fields"><label class="field">칼로리 목표<select id="profileMode"><option value="auto">자동 계산</option><option value="manual">직접 설정</option></select></label><label class="field">계산 기준 성별<select id="profileSex"><option value="">선택</option><option value="male">남성</option><option value="female">여성</option></select></label><label class="field">활동량<select id="profileActivity"><option value="low">주로 앉아서 생활</option><option value="light">가벼운 운동 · 주 1–3회</option><option value="moderate">보통 운동 · 주 3–5회</option><option value="high">많은 운동 · 주 6–7회</option></select></label></div><details id="bodyTargets" open><summary>신체 정보</summary><div class="profile-fields">${['age','height','startWeight','targetWeight'].map(numberField).join('')}</div></details><details id="manualTargets"><summary>직접 설정 · 영양 목표</summary><div class="profile-fields">${['calorieGoal','proteinGoal','fatGoal','carbGoal'].map(numberField).join('')}</div></details><p class="record-note">자동 계산: 성인 19–78세 추정치 · 임신·수유 등 별도 식단 관리 시 직접 설정</p></div><p id="accountError" class="error-text" role="alert"></p></div><footer><button type="button" class="btn ghost" id="accountBack">이전</button><button class="btn primary" type="submit" id="accountSave">저장</button></footer></form>`;
  document.body.append(panel);window.visualViewport?.addEventListener('resize',fitAccount);window.visualViewport?.addEventListener('scroll',fitAccount);
  $('accountClose').onclick=closeAccount;$('accountBack').onclick=closeAccount;
  $('accountForm').onsubmit=async ev=>{
    ev.preventDefault();const data={name:$('profileName').value};
    if(role==='member'){
      data.calendarName=$('profileCalendar').value;
      for(const key of Object.keys(NUMBER_FIELDS))data[key]=$('profile-'+key).value;data.nutritionMode=$('profileMode').value;if($('profileSex').value)data.formulaSex=$('profileSex').value;data.activity=$('profileActivity').value;
    }
    setAccountBusy(true);$('accountError').textContent='';
    try{const ok=await saveAction?.(data,role,first);if(ok!==false){closeAccount(true);if(first&&role==='member')window.Tempo.showPlan()}}catch(e){$('accountError').textContent=e.message||'저장 실패'}finally{setAccountBusy(false)}
  };
  panel.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'){ev.preventDefault();closeAccount();}
    if(ev.key==='Tab'){
      const controls=[...panel.querySelectorAll('input,button,select,summary')].filter(el=>!el.disabled&&el.getClientRects().length),a=controls[0],z=controls.at(-1);
      if(ev.shiftKey&&document.activeElement===a){ev.preventDefault();z.focus()}else if(!ev.shiftKey&&document.activeElement===z){ev.preventDefault();a.focus()}
    }
  });
}
function numberField(key){const [min,max,label]=NUMBER_FIELDS[key];return `<label class="field">${label} · ${units[key]}<input id="profile-${key}" type="number" min="${min}" max="${max}" step="0.1" inputmode="decimal" placeholder="선택"></label>`}
export function openAccount(data={},options={}){
  profile=data;role=options.role||data.role||'member';first=!!options.first;opener=document.activeElement;
  $('accountTitle').textContent=first?(role==='trainer'?'트레이너 등록':'사용자 등록'):'내 정보';
  $('accountStep').textContent=first?'START YOUR TEMPO':'MY TEMPO';
  $('accountIntro').textContent=first?(role==='trainer'?'이름을 등록하고 회원을 연결하세요.':'내 캘린더와 하루 목표'):(role==='trainer'?'트레이너 프로필':'캘린더 · 체중 · 식단 목표');
  $('profileName').value=profile.name||'';$('profileCalendar').value=profile.calendarName||'나의 루틴';
  $('profileCalendar').required=role==='member';$('calendarNameField').hidden=role==='trainer';$('profileTargets').hidden=role==='trainer';$('profileMode').value=profile.nutritionMode||(first?'auto':'manual');$('profileSex').value=profile.formulaSex||'';$('profileActivity').value=profile.activity||'low';
  for(const key of Object.keys(NUMBER_FIELDS))$('profile-'+key).value=profile[key]??'';
  $('accountError').textContent='';$('accountSave').textContent=first?(role==='trainer'?'등록':'캘린더 만들기'):'저장';$('accountBack').hidden=!first;
  $('accountEditor').hidden=false;fitAccount();$('app').inert=true;if($('entry'))$('entry').inert=true;
  requestAnimationFrame(()=>$('accountClose').focus({preventScroll:true}));
}
export function closeAccount(force=false){
  if($('accountSave').disabled&&!force)return;
  $('accountEditor').hidden=true;if($('entry'))$('entry').inert=false;$('app').inert=!$('entry')?.hidden;
  if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus({preventScroll:true});
}
export function setAccountBusy(value){$('accountForm').querySelectorAll('button,input,select').forEach(el=>el.disabled=value)}
export function accountIsOpen(){return !!$('accountEditor')&&!$('accountEditor').hidden}
export function accountError(text){$('accountError').textContent=text}

function fitAccount(){const panel=$('accountEditor');if(!panel||panel.hidden)return;const v=window.visualViewport;panel.style.top=(v?.offsetTop||0)+'px';panel.style.height=(v?.height||innerHeight)+'px';}
