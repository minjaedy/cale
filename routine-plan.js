const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minute=s=>{const [h,m]=s.split(':').map(Number);return h*60+m};
const days=['월','화','수','목','금','토','일'];
export function timetable(events,colors){
  const start=Math.min(6,...events.map(e=>Math.floor(minute(e.start)/60))),end=Math.max(22,...events.map(e=>Math.ceil(minute(e.end)/60))),height=(end-start)*52;
  const heads=days.map((d,i)=>'<button class="plan-day" data-add-day="'+i+'" aria-label="'+d+'요일 루틴 추가">'+d+'<span>＋</span></button>').join('');
  const hours=Array.from({length:end-start+1},(_,i)=>'<span style="top:'+i*52+'px">'+String(start+i).padStart(2,'0')+':00</span>').join('');
  const columns=days.map((_,day)=>{
    const list=events.filter(e=>e.day===day).sort((a,b)=>minute(a.start)-minute(b.start)),placed=[],groups=[];let group=[],until=-1,ends=[];
    const finish=()=>{if(group.length){for(const x of group)x.lanes=ends.length;groups.push(...group)}group=[];ends=[];};
    for(const event of list){const at=minute(event.start),to=minute(event.end);if(at>=until){finish();until=-1}let lane=ends.findIndex(v=>v<=at);if(lane<0)lane=ends.length;ends[lane]=to;const x={event,lane};group.push(x);until=Math.max(until,to)}finish();placed.push(...groups);
    return '<div class="plan-column">'+placed.map(({event:e,lane,lanes})=>'<button class="plan-event" data-edit="'+escape(e.id)+'" style="top:'+((minute(e.start)-start*60)/60*52)+'px;height:'+Math.max(27,(minute(e.end)-minute(e.start))/60*52-3)+'px;left:calc('+lane/lanes*100+'% + 3px);width:calc('+100/lanes+'% - 6px);--event-color:'+(colors[e.cat]?.color||'#c7ccd5')+'" aria-label="'+days[day]+'요일 '+escape(e.title)+' '+escape(e.start)+'–'+escape(e.end)+' 수정"><strong>'+escape(e.title)+'</strong><span>'+escape(e.start)+'–'+escape(e.end)+'</span></button>').join('')+'</div>';
  }).join('');
  return '<p class="plan-intro">매주 반복 · 요일의 ＋로 추가 · 일정을 눌러 수정</p>'+(!events.length?'<div class="plan-empty"><strong>첫 루틴을 설정하세요</strong><span>시간과 반복 요일을 선택하면 매주 적용됩니다.</span><button class="btn primary" data-add>루틴 추가</button></div>':'')+'<div class="plan-scroll" tabindex="0" role="region" aria-label="월요일부터 일요일까지 기본 루틴 시간표"><div class="plan-grid"><div class="plan-corner">시간</div>'+heads+'<div class="plan-hours" style="height:'+height+'px">'+hours+'</div>'+columns+'</div></div><p class="record-note">좌우로 밀어 모든 요일 보기 · 종료일 없이 매주 반복</p>';
}
