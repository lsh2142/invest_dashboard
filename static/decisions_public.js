(function(global){
  'use strict';
  const percent=(n,suffix='%')=>typeof n==='number'&&Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(2)}${suffix}`:'자료 없음';
  function instant(event){
    if(event.time_precision!=='exact'||!event.source_date||!event.local_time||!event.timezone)return null;
    const base=Date.parse(`${event.source_date}T${event.local_time}:00Z`);let value=base;
    try{for(let i=0;i<2;i++){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:event.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
      const local=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
      value=base-(local-value);
    }return new Date(value);}catch{return null;}
  }
  function kstDay(event){const date=instant(event);return date?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):null;}
  function eventDate(e){
    if(e.time_precision==='tbd'||!e.source_date)return `${e.date_label||'일정 확인 중'} · 날짜 미정`;
    const date=e.source_date+(e.end_date?` ~ ${e.end_date}`:'');
    if(!e.timezone)return `${date} · 시간대 미확인`;
    if(e.time_precision==='exact')return `${date} ${e.local_time} · ${e.timezone}`;
    const precision={before_market:'장 시작 전',after_market:'장 마감 후',date_range:'기간 일정',date_only:'시각 미정'};
    return `${date} · ${precision[e.time_precision]||'시각 미정'}`;
  }
  function filterEvents(rows,{month,market='all',source='all'}){
    return rows.filter(e=>(market==='all'||e.market===market)&&(source==='all'||(source==='official'?e.source!=='wiki_catalyst':e.source===source))&&
      (!month||!e.source_date||e.time_precision==='tbd'||(e.source_date<=`${month}-31`&&(e.end_date||e.source_date)>=`${month}-01`)));
  }
  const api={percent,kstDay,eventDate,filterEvents};if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined')return;
  const root=document.getElementById('public-decisions');if(!root)return;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const byId=id=>document.getElementById(id);
  function link(url,label){const a=el('a',label);try{if(new URL(url).protocol!=='https:')return el('span',label);}catch{return el('span',label);}a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function table(data){
    const market=byId('pd-market').value,period=byId('pd-period').value,values=data.rotation.markets[market],target=byId('pd-rotation');target.replaceChildren();
    if(!values||!values.periods[period]){target.append(el('p','이 시장의 가격 자료가 아직 없습니다. 다음 공개 갱신 후 다시 확인해 주세요.','pd-empty'));byId('pd-benchmark').textContent='';return;}
    const window=values.periods[period];
    byId('pd-benchmark').textContent=`${window.start_session||'미확인'} ~ ${window.end_session||'미확인'} · 기준 ${values.benchmark.label} ${percent(window.benchmark_return_pct)} · 수집 ${window.valid}/${window.total}개${values.status==='ok'?'':' · 일부 자료 미확인'}`;
    const wrap=el('div',undefined,'pd-table-wrap'),t=el('table',undefined,'pd-table'),head=el('thead'),hr=el('tr');
    ['순위','업종 · 대표 ETF','가격성과','기준 대비','순위 변화'].forEach(label=>hr.append(el('th',label)));head.append(hr);t.append(head);const body=el('tbody');
    window.rows.forEach(r=>{const tr=el('tr');tr.append(el('td',r.rank??'—'));const name=el('td'),box=el('div',undefined,'pd-sector-label');box.append(link(r.source_url,`${r.label} (${r.symbol})`));name.append(box);tr.append(name);
      for(const [v,suffix] of [[r.absolute_return_pct,'%'],[r.relative_pp,'%p']]){const cell=el('td',percent(v,suffix),v>0?'pd-positive':v<0?'pd-negative':'');tr.append(cell);}
      tr.append(el('td',window.rank_comparable&&r.rank_change!==null?(r.rank_change>0?`↑ ${r.rank_change}`:r.rank_change<0?`↓ ${-r.rank_change}`:'유지'):'비교 자료 없음'));body.append(tr);});
    t.append(body);wrap.append(t);target.append(wrap);
  }
  function calendar(data){
    const month=byId('pd-month').value,market=byId('pd-market').value,source=byId('pd-source').value,target=byId('pd-calendar');target.replaceChildren();
    const rows=filterEvents(data.calendar.events,{month,market,source});
    const dated=rows.filter(e=>e.source_date&&e.time_precision!=='tbd'),uncertain=rows.filter(e=>!e.source_date||e.time_precision==='tbd');
    const coverage=byId('pd-coverage');coverage.replaceChildren();
    data.calendar.sources.forEach(s=>coverage.append(el('span',`${s.label}: ${s.status==='ok'?`${s.event_count}건`:s.status==='partial'?'일부 확인':'수집 미완료'}`,'pd-chip')));
    if(month){const grid=el('div',undefined,'pd-month-grid');grid.setAttribute('aria-label','출처 현지 날짜 기준 월간 일정');
      ['일','월','화','수','목','금','토'].forEach(d=>grid.append(el('div',d,'pd-day pd-weekday')));
      const [year,m]=month.split('-').map(Number),first=new Date(year,m-1,1).getDay(),count=new Date(year,m,0).getDate();
      for(let i=0;i<first;i++)grid.append(el('div','', 'pd-day'));
      for(let day=1;day<=count;day++){const cell=el('div',undefined,'pd-day'),date=`${month}-${String(day).padStart(2,'0')}`;cell.append(el('b',String(day)));
        dated.filter(e=>e.source_date<=date&&(e.end_date||e.source_date)>=date).slice(0,3).forEach(e=>{const a=el('a',e.title);a.href=`#event-${rows.indexOf(e)}`;cell.append(a);});grid.append(cell);}target.append(grid);}
    function group(title,events){target.append(el('h2',`${title} · ${events.length}건`));if(!events.length){target.append(el('p','선택한 조건에 해당하는 일정이 없습니다.','pd-empty'));return;}
      const list=el('ul',undefined,'pd-events');events.forEach(e=>{const item=el('li',undefined,'pd-event');item.id=`event-${rows.indexOf(e)}`;const time=el('time',eventDate(e));if(e.source_date)time.dateTime=e.source_date;item.append(time);const body=el('div');body.append(el('h3',e.title));
        const tags=el('div',undefined,'pd-event-tags');[{US:'미국',KR:'한국',GLOBAL:'글로벌·기타'}[e.market]||'시장 미확인',e.source==='wiki_catalyst'?'위키 일정':'공식 일정',{official:'공식 확인',tentative:'잠정',estimated:'추정'}[e.confidence]||'확인 필요', {cancelled:'취소',postponed:'연기',results_confirmed:'결과 확인'}[e.lifecycle]].filter(Boolean).forEach(x=>tags.append(el('span',x,'pd-chip')));body.append(tags);
        const kst=kstDay(e);if(kst)body.append(el('p',`한국 날짜 ${kst}`));if(e.source_url)body.append(link(e.source_url,'출처 확인'));item.append(body);list.append(item);});target.append(list);}
    group('날짜가 있는 일정',dated);group('날짜 미정·확인 필요',uncertain);
  }
  fetch('/decisions/data.json',{credentials:'omit'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
    const stale=root.dataset.view==='rotation'&&data.rotation.status==='stale';
    byId('pd-status').textContent=stale?`갱신 지연 · 이전 수집 자료 (${data.rotation.generated_at||'수집 시각 미확인'}) · 빌드 ${data.built_at}`:`공개 자료 기준 · 빌드 ${data.built_at}`;
    const render=root.dataset.view==='calendar'?()=>calendar(data):()=>table(data);
    if(root.dataset.view==='calendar'){byId('pd-month').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).slice(0,7);}
    root.querySelectorAll('select,input').forEach(n=>n.addEventListener('change',render));render();
  }).catch(()=>{byId('pd-status').textContent='공개 자료를 불러오지 못했습니다. 새로고침해 주세요.';});
})(typeof globalThis!=='undefined'?globalThis:this);
