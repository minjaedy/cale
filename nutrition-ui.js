import {parseFood,calorieTarget,currentWeight,dailyNutrition} from './nutrition-core.mjs?v=3';
import {customCatalog,customFoodInput,FOOD_UNITS} from './custom-foods.mjs?v=3';
let baseCatalog=[],catalog=[],ready=false,failed=false,lastFeed={},foods={},actions={},account='',editing='',saving=false,searchHits=[],mine=[];
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
const customDraft=()=>({name:$('foodName')?.value||'',amount:$('foodAmount')?.value||'',unit:$('foodUnit')?.value||'g',calories:$('foodCalories')?.value||'',id:editing});
const rebuild=()=>{catalog=[...customCatalog(foods,true),...baseCatalog];previewFood();renderLibrary();};
export const target=()=>{const {profile={},logs={}}=window.Tempo.snapshot();return calorieTarget(profile,currentWeight(profile,logs));};
export function setNutritionActions(next){actions=next;}
export function setCommunityFoods(next,owned=[]){foods=next||{};mine=owned;save('tempo-community-foods',foods);if(account)save('tempo-food-owned:'+account,mine);rebuild();}
export function upsertCommunityFood(food){foods={...foods,[food.id]:food};mine=[...new Set([...mine,food.id])];setCommunityFoods(foods,mine);}
export function removeCommunityFood(id){delete foods[id];mine=mine.filter(x=>x!==id);setCommunityFoods(foods,mine);}
export function setCustomFoods(next){setCommunityFoods(next,Object.keys(next||{}));}
export function setNutritionAccount(uid){
  if(account===(uid||''))return;account=uid||'';foods=read('tempo-community-foods')||{};mine=account?read('tempo-food-owned:'+account)||[]:[];
  fillCustom(account?read('tempo-food-draft:'+account)||{}:{});rebuild();
}
export function nutritionHasDraft(){return saving||!!$('foodName')?.value.trim()||!!$('foodCalories')?.value;}
function fillCustom(f={}){editing=f.id||'';for(const [id,key,fallback] of [['foodName','name',''],['foodAmount','amount','100'],['foodUnit','unit','g'],['foodCalories','calories','']])if($(id))$(id).value=f[key]??fallback;if($('foodName'))$('foodName').readOnly=!!editing;if($('foodSave'))$('foodSave').textContent=editing?'수정 저장':'공용 음식 등록';}
function appendFood(text){$('mealText').value=[$('mealText').value.trim(),text].filter(Boolean).join(', ').slice(0,300);$('mealText').dispatchEvent(new Event('input',{bubbles:true}));$('mealText').focus();}
export function initNutrition(){
  $('mealText').placeholder='김치찌개 1인분, 밥 한 공기';$('mealText').rows=3;
  const helper=document.createElement('div');helper.className='food-helper';helper.innerHTML='<div class="food-quick" aria-label="빠른 입력">'+['밥 한 공기','계란 2개','아메리카노 1잔'].map(x=>'<button type="button" data-quick-food="'+x+'">+ '+x+'</button>').join('')+'</div><details id="foodSearchDetails"><summary>음식 찾기 <span>검색해서 추가</span></summary><label class="sr-only" for="foodSearch">음식 검색</label><input id="foodSearch" type="search" placeholder="음식 · 음료 · 제품명" autocomplete="off"><div id="foodSearchResults" class="food-results"></div></details>';
  $('mealText').parentElement.after(helper);
  const panel=document.createElement('div');panel.className='nutrition-estimate';panel.innerHTML='<div id="foodEstimate" aria-live="polite">영양정보 불러오는 중</div><details class="manual-calories"><summary>총칼로리 수정</summary><label class="field">이번 식사 · kcal<input id="mealCalories" type="number" min="0" max="10000" inputmode="decimal" placeholder="포장지 등의 합계"></label><p class="record-note">입력하면 자동 계산보다 우선 적용</p></details>';
  helper.after(panel);
  const library=document.createElement('details');library.className='food-library';library.id='foodLibrary';library.innerHTML='<summary>음식 추가 <span id="foodCount">0개</span></summary><p class="record-note">음식명·양·칼로리 공개 · 모두가 함께 사용</p><label class="field">음식 이름<input id="foodName" maxlength="60" placeholder="예: 제품명 · 메뉴명" autocomplete="off"></label><div class="food-measure"><label class="field">기준량<input id="foodAmount" type="number" inputmode="decimal" step="any" value="100"></label><label class="field">단위<select id="foodUnit">'+FOOD_UNITS.map(u=>'<option>'+u+'</option>').join('')+'</select></label><label class="field">칼로리<input id="foodCalories" type="number" inputmode="decimal" step="any" placeholder="kcal"></label></div><div class="food-library-actions"><button type="button" class="btn" id="foodSave">공용 음식 등록</button><button type="button" class="small-btn" id="foodCancel">입력 지우기</button></div><p id="foodStatus" class="record-note" role="status"></p><div id="foodLibraryList"></div>';
  panel.after(library);for(const id of ['foodName','foodAmount','foodUnit','foodCalories','foodSearch'])$(id).setAttribute('form','foodLibraryEditor');
  $('mealText').addEventListener('input',previewFood);$('mealCalories').addEventListener('input',previewFood);
  $('mealDate').addEventListener('change',previewFood);
  helper.querySelectorAll('[data-quick-food]').forEach(b=>b.onclick=()=>appendFood(b.dataset.quickFood));
  $('foodSearch').oninput=renderSearch;$('foodSearchDetails').ontoggle=()=>{if($('foodSearchDetails').open){renderSearch();$('foodSearch').focus();}};
  $('foodSearchResults').onclick=ev=>{const b=ev.target.closest('[data-food-hit]');if(!b)return;const f=searchHits[Number(b.dataset.foodHit)];appendFood(f.name+' '+f.serving+f.unit);$('foodSearchDetails').open=false;$('foodSearch').value='';};
  for(const id of ['foodName','foodAmount','foodUnit','foodCalories'])$(id).addEventListener('input',()=>{if(account)save('tempo-food-draft:'+account,customDraft())});
  $('foodCancel').onclick=()=>{fillCustom();if(account)save('tempo-food-draft:'+account,null);$('foodStatus').textContent='';};
  $('foodSave').onclick=async()=>{
    if(saving)return;try{if(!account||!actions.saveFood)throw Error('로그인 후 저장해 주세요.');const food=customFoodInput(customDraft());const norm=s=>s.replace(/[\s_()]/g,'').toLowerCase();if(!editing&&baseCatalog.some(f=>[f.name,...f.aliases||[]].some(n=>norm(n)===norm(food.name))))throw Error('기본 DB에 있는 이름입니다. 다른 음식이면 제품명을 포함해 주세요.');saving=true;$('foodSave').disabled=true;await actions.saveFood(food,editing);fillCustom();save('tempo-food-draft:'+account,null);$('foodStatus').textContent='공유 완료 · GitHub 자동 저장 대기';previewFood();}catch(e){$('foodStatus').textContent=e.message||'저장하지 못했어요. 다시 시도해 주세요.';}finally{saving=false;$('foodSave').disabled=false;}
  };
  $('foodLibraryList').onclick=async ev=>{
    const b=ev.target.closest('button');if(!b)return;
    if(b.dataset.foodUse){const f=foods[b.dataset.foodUse];appendFood(f.name+' '+f.amount+f.unit);}
    if(b.dataset.foodEdit){fillCustom({...foods[b.dataset.foodEdit],id:b.dataset.foodEdit});$('foodName').focus();}
    if(b.dataset.foodDelete&&!saving){if(!confirm('공용 음식에서 삭제할까요? 등록된 식단과 GitHub의 이전 이력은 남습니다.'))return;try{saving=true;await actions.removeFood(b.dataset.foodDelete);if(editing===b.dataset.foodDelete)fillCustom();$('foodStatus').textContent='삭제 완료';}catch(e){$('foodStatus').textContent=e.message;}finally{saving=false;}}
  };
  fetch('./food-catalog.json?v=3').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{baseCatalog=data.foods;ready=true;rebuild();}).catch(()=>{failed=true;previewFood();});
  window.addEventListener('tempo-profile',()=>{renderNutrition();previewFood()});window.addEventListener('tempo-weight',()=>{renderNutrition();previewFood()});
  window.TempoNutrition={render:renderNutrition,target,get pending(){return saving}};renderNutrition();
}
function renderLibrary(){
  if(!$('foodLibraryList'))return;const list=Object.entries(foods).filter(([id])=>mine.includes(id));$('foodCount').textContent='공용 '+Object.keys(foods).length+'개';
  $('foodLibraryList').innerHTML=list.map(([id,f])=>'<div class="saved-food"><button type="button" class="saved-food-use" data-food-use="'+esc(id)+'"><span>'+esc(f.name)+'</span><small>'+f.amount+esc(f.unit)+' · '+f.calories+' kcal</small></button><button type="button" data-food-edit="'+esc(id)+'" aria-label="'+esc(f.name)+' 수정">수정</button><button type="button" data-food-delete="'+esc(id)+'" aria-label="'+esc(f.name)+' 삭제">삭제</button></div>').join('');
}
function renderSearch(){
  const q=$('foodSearch').value.replace(/\s/g,'').toLowerCase();
  searchHits=q?catalog.filter(f=>[f.name,...f.aliases||[]].some(s=>s.replace(/\s/g,'').toLowerCase().includes(q))).slice(0,8):customCatalog(foods,true).slice(0,5);
  $('foodSearchResults').innerHTML=searchHits.length?searchHits.map((f,i)=>'<button type="button" data-food-hit="'+i+'"><span>'+esc(f.name)+(f.community?' <small>사용자 등록</small>':'')+'</span><small>'+f.serving+esc(f.unit)+' · '+Math.round(f.kcal*f.serving/100)+' kcal <b>+</b></small></button>').join(''):'<p class="record-note">'+(q?'검색 결과 없음 · 음식 추가에서 등록':'음식 이름으로 검색')+'</p>';
}
export function previewFood(){
  if(!$('foodEstimate'))return;
  const text=$('mealText').value.trim(),result=parseFood(text,catalog),manual=$('mealCalories').value;
  const total=manual!==''&&Number.isFinite(Number(manual))?Math.round(Number(manual)):result.total,complete=manual!==''||ready&&result.complete;
  const summary=dailyNutrition(lastFeed,$('mealDate').value),goal=summary.goal||target()?.goal,next=summary.total+Math.max(0,total),pct=goal?Math.round(next/goal*100):0;
  $('foodEstimate').innerHTML='<div class="meal-energy"><div><span class="energy-label">이번 식사</span><strong>'+(text||manual!==''?total.toLocaleString():'—')+' <small>kcal</small></strong></div><span class="energy-badge">'+(manual!==''?'직접 입력':!text?'자동 계산':complete?'예상':'일부 계산')+'</span></div>'+(text?'<div class="food-breakdown">'+result.items.map(f=>'<div class="food-line"><span>'+esc(f.name)+'<small>'+f.grams+esc(f.unit)+(f.community?' · 사용자 등록':f.custom?' · 내 음식':'')+'</small></span><b>'+f.calories+' <small>kcal</small></b></div>').join('')+'</div>':'<p class="record-note">음식과 양을 입력해 주세요.</p>')+(result.unknown.length&&manual===''?'<p class="food-unknown">미계산: '+esc(result.unknown.join(', '))+'</p><button type="button" class="small-btn" id="addUnknownFood">음식 DB에 추가 ↗</button>':'')+(!ready?'<p class="record-note">'+(failed?'기본 영양정보 연결 실패 · 직접 입력 가능':'기본 영양정보 불러오는 중')+'</p>':'')+(goal?'<div class="meal-daily"><div><span>등록 후 하루 합계'+((!complete&&text||summary.count&&!summary.complete)?' · 일부':'')+'</span><b>'+next.toLocaleString()+' <small>/ '+goal.toLocaleString()+' kcal</small></b></div><div class="bar"><i style="width:'+Math.max(0,Math.min(pct,100))+'%"></i></div><p>'+pct+'% · '+(next>goal?'목표보다 '+(next-goal).toLocaleString()+' kcal':'목표까지 '+(goal-next).toLocaleString()+' kcal')+'</p></div>':'')+(result.items.some(f=>f.assumed)?'<p class="record-note portion-note">개·잔·인분은 기준량으로 환산 · 표시된 양 확인</p>':'');
  if($('addUnknownFood'))$('addUnknownFood').onclick=()=>{$('foodLibrary').open=true;if(!$('foodName').value)$('foodName').value=(result.unknown[0]||'').replace(/(?:\d+(?:\.\d+)?|한|두|반)(?:인분|개|잔|공기|g|ml|팩|봉지)$/,'').slice(0,60);$('foodName').focus();};
}
export function mealNutrition(){
  const manual=$('mealCalories').value,summary=dailyNutrition(lastFeed,$('mealDate').value),goal=summary.goal||target()?.goal;
  if(manual!==''){const calories=Number(manual);if(!Number.isFinite(calories)||calories<0||calories>10000)throw Error('칼로리는 0–10,000 사이로 입력해 주세요.');return {calories:Math.round(calories),nutritionComplete:true,nutritionMethod:'manual',...(goal?{calorieGoal:goal}:{})};}
  const estimate=parseFood($('mealText').value,catalog);if(estimate.total>10000)throw Error('음식의 양을 확인해 주세요. 한 번에 10,000 kcal까지 등록할 수 있어요.');
  return {calories:estimate.total,nutritionComplete:(ready||estimate.items.every(i=>i.custom||i.community))&&estimate.complete,nutritionMethod:'catalog-v1',...(goal?{calorieGoal:goal}:{})};
}
export function setNutritionFeed(feed){lastFeed=feed||{};renderNutrition();previewFood();}
export function resetNutrition(){$('mealCalories').value='';previewFood();}
export function renderNutrition(){
  const el=$('page-diet');if(!el)return;if(document.activeElement?.id==='nutritionDate')return;
  const date=$('nutritionDate')?.value||today(),summary=dailyNutrition(lastFeed,date),t=target(),goal=summary.goal||(date===today()?t?.goal:null),percent=goal?Math.round(summary.total/goal*100):0;
  el.innerHTML='<div class="page-heading"><div><p class="eyebrow">NUTRITION</p><h2>식단</h2></div><button class="btn" data-profile-edit>목표 설정</button></div><label class="field nutrition-date">날짜<input id="nutritionDate" type="date" max="'+today()+'" value="'+date+'"></label><div class="diet-intro"><div><p>하루 섭취량</p><h3>'+summary.total.toLocaleString()+' <small>kcal</small></h3><p>'+summary.count+'회 등록'+(!summary.complete&&summary.count?' · 미계산 음식 포함':'')+'</p></div><div class="diet-mark">'+(goal?percent+'%':'—')+'</div></div><div class="record-card"><h3>하루 목표 '+(goal?goal.toLocaleString()+' kcal':'미설정')+'</h3><div class="bar"><i style="width:'+Math.min(percent,100)+'%"></i></div><p class="record-note">'+(goal?(summary.total>goal?'목표보다 '+(summary.total-goal).toLocaleString():'목표까지 '+(goal-summary.total).toLocaleString())+' kcal':'기록 당시 목표 없음')+'</p></div><button class="btn primary nutrition-add" id="nutritionAdd">식단 등록 ↗</button><div class="record-card nutrition-current"><h3>현재 목표 '+(t?t.goal.toLocaleString()+' kcal':'미설정')+'</h3><p class="record-note">'+(t?.mode==='auto'?t.weight+'kg 반영 · 기초대사량 '+t.bmr+' · 유지 추정 '+t.maintenance+' kcal':'내 정보에서 자동 계산 또는 직접 설정')+'</p></div><details class="nutrition-source"><summary>계산 기준</summary><p>식약처 음식·원재료·가공식품 DB의 100g 또는 100ml 열량에 먹은 양을 곱합니다. 개·잔·인분은 기준량으로 환산한 예상치이며, 실제 양·조리법·제품에 따라 달라요. 포장지 값은 총칼로리 또는 공용 음식에 입력할 수 있습니다.</p><p>자동 목표는 Mifflin–St Jeor 성인 추정식과 활동 계수, 목표 체중을 반영합니다. 감량 −300 / 증량 +200 kcal. 개인에 맞게 직접 조정할 수 있어요. 기록 목표는 등록 당시 값을 유지합니다.</p><a href="https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do" target="_blank" rel="noopener">식품의약품안전처 · 2026.10.12 수집</a><br><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin–St Jeor · 1990</a></details>';
  $('nutritionDate').onchange=()=>{document.activeElement?.blur();renderNutrition();};$('nutritionAdd').onclick=()=>{window.Tempo.showPage('coaching');$('mealDate').value=date;previewFood();$('mealText').focus();};
}
