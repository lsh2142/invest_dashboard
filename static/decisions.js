/* Private data is fetched from authenticated endpoints, never embedded in assets. */
(() => {
  'use strict';
  const root = document.getElementById('investment-workspace');
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const link = (url, label) => safeURL(url) ? `<a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>` : esc(label);
  const tag = (text, tone='') => `<span class="iw-tag ${tone}">${esc(text)}</span>`;
  const empty = text => `<div class="iw-empty">${text}</div>`;
  const option = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  const judgment = {unreviewed:'미검토', intact:'유지', challenged:'재검토', invalidated:'무효화'};
  const judgmentTone = value => value === 'intact' ? 'good' : value === 'invalidated' ? 'bad' : value === 'challenged' ? 'warn' : '';
  const confidence = {official:'공식 확인', tentative:'잠정', estimated:'추정'};
  const lifecycle = {scheduled:'예정', postponed:'연기', cancelled:'취소', elapsed_unconfirmed:'시각 경과 · 결과 미확인', results_confirmed:'결과 확인', review_recorded:'검토 기록 완료'};
  const precision = {exact:'정확한 시각', date_only:'시간 미정', before_market:'장전 · 시각 미정', after_market:'장후 · 시각 미정', tbd:'날짜 미정', date_range:'기간 일정'};
  const sourceLabels = {stale:'갱신 지연 · 이전 확인값',failed:'수집 실패',unavailable:'미확보',ok:'정상',partial:'일부 확인',error:'수집 실패',not_collected:'미수집',unconfigured:'출처 미등록',no_events:'공식 일정 없음',scheduled:'일정 확인',not_announced:'일정 미발표'};
  const fmtTime = value => value ? new Date(value).toLocaleString('ko-KR', {timeZone:'Asia/Seoul', hour12:false}) : '확인 기록 없음';
  const kstToday = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
  const shiftDay = (day, days) => {const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
  const pct = (value, suffix='%') => typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}${suffix}` : '—';
  const valueClass = value => typeof value !== 'number' ? '' : value > 0 ? 'iw-up' : value < 0 ? 'iw-down' : '';
  const formDrafts=new Map();
  function preserveDrafts(panel) {panel.querySelectorAll('form[data-form]').forEach(form=>{const key=form.dataset.form+':'+form.dataset.id;if(form.dataset.saved)return;const values=Object.fromEntries(new FormData(form));if(Object.entries(values).some(([key,value])=>key!=='version'&&value))formDrafts.set(key,{values,open:form.closest('details')?.open});});}
  function restoreDrafts(panel) {panel.querySelectorAll('form[data-form]').forEach(form=>{const saved=formDrafts.get(form.dataset.form+':'+form.dataset.id);if(!saved)return;Object.entries(saved.values).forEach(([name,value])=>{if(form.elements[name])form.elements[name].value=value;});if(saved.open&&form.closest('details'))form.closest('details').open=true;});}
  const state = {view:root.dataset.view, data:null, thesis:null, event:null, sector:null, filter:'all', thesisMarket:'all', q:'',market:'US',period:'21',calView:'agenda',eventWindow:'14',eventFilter:'all',eventMarket:'all',eventSymbol:'all',timezone:'KST',estimated:true,month:kstToday().slice(0,7),day:null};
  let pollTimer, editingThesis=null, editingEvent=null, pendingEvent=null, saving=false;

  function readURL() {
    const path=location.pathname.split('/').pop();
    if (['theses','rotation','calendar'].includes(path)) state.view=path;
    const params=new URLSearchParams(location.search);
    for (const key of ['thesis','event','sector','filter','thesisMarket','q','market','period','calView','eventWindow','eventFilter','eventMarket','eventSymbol','timezone','month','day']) if(params.has(key)) state[key]=params.get(key);
    if(params.has('estimated')) state.estimated=params.get('estimated')!=='0';
    if (!/^\d{4}-\d{2}$/.test(state.month)) state.month=kstToday().slice(0,7);
    if (!['US','KR'].includes(state.market)) state.market='US';
    if (!['5','21','63'].includes(state.period)) state.period='21';
  }
  function writeURL(replace=false) {
    const params=new URLSearchParams();
    const keys = state.view==='theses' ? ['thesis','filter','thesisMarket','q'] : state.view==='rotation' ? ['market','period','sector'] : ['event','calView','eventWindow','eventFilter','eventMarket','eventSymbol','timezone','month','day'];
    keys.forEach(key=>{if(state[key]!==null && state[key]!=='' && state[key]!==undefined) params.set(key,state[key]);});
    if(!state.estimated && state.view==='calendar') params.set('estimated','0');
    history[replace?'replaceState':'pushState']({},'',`/decisions/${state.view}?${params}`);
    try {localStorage.setItem('decisions-last-view', state.view);} catch {}
  }
  function status(text, error=false) {$('#iw-status').textContent=text;$('#iw-status').classList.toggle('error',error);}
  async function api(path='', options={}) {
    const response=await fetch(`/api/decisions${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json','X-Decisions-Request':'1',...options.headers}});
    const data=await response.json().catch(()=>({detail:'서버 응답을 읽지 못했습니다.'}));
    if(!response.ok) {
      const detail=data.detail;
      throw new Error(response.status===401 ? '관리자 인증이 필요합니다. 새로고침 후 로그인해 주세요.' : Array.isArray(detail) ? detail.map(e=>`${(e.loc||[]).join('.')}: ${e.msg}`).join('\n') : typeof detail==='string' ? detail : '요청을 처리하지 못했습니다.');
    }
    return data;
  }
  async function reload(message='') {
    try {state.data=await api();render();status(message || refreshText(state.data.refresh));pollRefresh();}
    catch(error) {status(error.message,true);}
  }
  function refreshText(value) {
    if(value.status==='running') return '공식 일정과 가격 데이터를 갱신 중입니다. 이전 확인값을 먼저 표시합니다.';
    if(['error','interrupted','partial'].includes(value.status)) return '일부 갱신이 완료되지 않았습니다. 아래 출처별 상태를 확인해 주세요.';
    return value.finished_at ? `최근 갱신 ${fmtTime(value.finished_at)} · 세부 확인 상태는 출처별로 표시합니다.` : '저장한 논거와 최신 확인 자료를 표시합니다.';
  }
  function pollRefresh() {
    clearTimeout(pollTimer);
    if(state.data?.refresh?.status!=='running') {$('#iw-refresh').disabled=false;return;}
    $('#iw-refresh').disabled=true;
    pollTimer=setTimeout(async()=>{try {const result=await api('/refresh');if(result.status==='running') {state.data.refresh=result;pollRefresh();} else await reload('갱신이 끝났습니다. 출처별 확인 상태를 참고해 주세요.');}catch(e){status(e.message,true);$('#iw-refresh').disabled=false;}},3500);
  }
  const symbols=()=>state.data?.watchlist?.items||[];
  const symbolByID=id=>symbols().find(s=>s.id===id);
  const nameOf=id=>symbolByID(id)?.name || id;
  const thesisName=t=>t.symbol?.name || nameOf(t.symbol_id);
  const dateOf=e=>e.kst_date || (e.timezone==='Asia/Seoul' ? e.source_date : null);
  const eventDay=e=>state.timezone==='LOCAL' ? e.source_date : dateOf(e);
  function eventTime(e) {
    if(e.time_precision==='exact' && e.starts_at_utc && state.timezone==='KST') return `${new Date(e.starts_at_utc).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})} KST`;
    return `${e.source_date||'날짜 미정'}${e.end_date ? ` ~ ${e.end_date}` : ''} ${e.local_time && e.time_precision==='exact' ? e.local_time : precision[e.time_precision]||'시간 미정'} · ${e.timezone||''}`;
  }
  function eventBadges(e) {return `${tag(e.category==='personal'?'직접 등록':confidence[e.confidence]||e.confidence,e.confidence==='estimated'?'warn':'')} ${tag(lifecycle[e.display_status||e.lifecycle]||e.lifecycle, ['cancelled','postponed'].includes(e.lifecycle)?'warn':'')} ${(e.revisions||[]).length||e.changed?tag('변경','warn'):''}`;}
  function thesisEvents(t) {return state.data.events.filter(e=>(e.linked_theses||e.theses||[]).some(x=>(x.thesis_id||x.id)===t.id) || (t.events||[]).some(x=>(x.event_id||x.id)===e.id));}
  const dueSoon=e=>{const d=dateOf(e)||e.source_date;return d && d>=kstToday() && d<=shiftDay(kstToday(),14) && !['cancelled','results_confirmed'].includes(e.lifecycle);};
  function render() {
    if(!state.data)return;
    $$('[data-view]').forEach(el=>{if(el.tagName==='A'){const selected=el.dataset.view===state.view;if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}});
    for(const view of ['theses','rotation','calendar']) $(`#iw-view-${view}`).hidden=state.view!==view;
    $('#iw-follow-count').textContent=state.data.watchlist.error||`한국·미국 관심종목 ${symbols().length}개 공유`;
    $('#iw-thesis-market').value=state.thesisMarket;$('#iw-search').value=state.q;
    $('#iw-market').value=state.market;
    for(const [id,key] of [['iw-event-window','eventWindow'],['iw-event-filter','eventFilter'],['iw-event-market','eventMarket'],['iw-timezone','timezone']]) $(`#${id}`).value=state[key];
    $('#iw-estimated').checked=state.estimated;
    $('#iw-event-symbol').innerHTML=option('all','전체 관심종목',state.eventSymbol)+symbols().map(s=>option(s.id,`${s.name} · ${s.symbol}`,state.eventSymbol)).join('');
    renderTheses();renderRotation();renderCalendar();renderSources();
  }
  function renderTheses() {
    preserveDrafts($('#iw-thesis-detail'));
    const all=state.data.theses;
    const rows=all.filter(t=>state.filter==='archive' ? t.lifecycle==='archived'||!t.followed : t.lifecycle!=='archived'&&t.followed)
      .filter(t=>state.thesisMarket==='all'||t.symbol_id.startsWith(state.thesisMarket+'-'))
      .filter(t=>!state.q||`${thesisName(t)} ${t.symbol_id} ${t.rationale}`.toLowerCase().includes(state.q.toLowerCase()))
      .filter(t=>state.filter!=='review'||t.review_pending)
      .filter(t=>state.filter!=='due'||thesisEvents(t).some(dueSoon));
    rows.sort((a,b)=>{const score=t=>(t.conditions||[]).some(c=>c.kind==='invalidate'&&c.evaluation==='met')?0:t.review_due_at&&t.review_due_at<kstToday()?1:t.review_pending?2:thesisEvents(t).some(dueSoon)?3:4;return score(a)-score(b);});
    if(!state.thesis&&rows.length)state.thesis=rows[0].id;
    $$('[data-thesis-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.thesisFilter===state.filter)));
    $('#iw-thesis-list').innerHTML=rows.length ? rows.map(t=>{
      const next=thesisEvents(t).filter(dueSoon).sort((a,b)=>(a.source_date||'').localeCompare(b.source_date||''))[0];
      return `<button type="button" class="iw-item" data-thesis="${esc(t.id)}" aria-pressed="${t.id===state.thesis}"><div class="iw-item-top"><span class="iw-item-name">${esc(thesisName(t))}</span>${tag(judgment[t.judgment],judgmentTone(t.judgment))}</div><p>${esc(t.rationale)}</p><div class="iw-item-foot"><span>${t.review_pending?'검토 대기 · ':''}${esc((t.review_reasons||[]).map(r=>r.message||r.kind).join(' · ')||'검토 기록을 쌓아 주세요')}</span><span>${next?esc(next.title):t.review_due_at?`검토 ${esc(t.review_due_at)}`:'다음 일정 미등록'}</span></div>${!t.followed?tag('팔로우 해제'):''}${t.lifecycle==='archived'?tag('보관'):''}</button>`;
    }).join('') : empty(symbols().length?'이 조건에 해당하는 논거가 없습니다. 논거 추가로 시작하세요.':'차트 레이더에서 관심종목을 먼저 등록해 주세요.<br><a href="/technicals">차트 레이더 열기 →</a>');
    const selected=all.find(t=>t.id===state.thesis);
    $('#iw-thesis-detail').innerHTML=selected?thesisDetail(selected):empty('논거를 선택하면 조건·근거·다음 일정이 연결됩니다.');
    restoreDrafts($('#iw-thesis-detail'));
  }
  function thesisDetail(t) {
    return `<div class="iw-detail-title"><div><button type="button" class="iw-back" data-back="theses">← 목록</button><h2 tabindex="-1">${esc(thesisName(t))}</h2><span class="iw-meta">${esc(t.symbol_id)}</span></div>${tag(judgment[t.judgment],judgmentTone(t.judgment))}</div><p class="iw-thesis">${esc(t.rationale)}</p>
      <div class="iw-controls"><button type="button" data-edit-thesis="${esc(t.id)}">논거·조건 편집</button><a href="/technicals">차트 레이더 ↗</a>${t.wiki_page?`<button type="button" data-read-wiki="${esc(t.symbol_id)}">위키 원문 보기</button>`:''}</div>
      <div class="iw-section"><h3>확인 조건 · 자료 상태</h3>${(t.conditions||[]).map(c=>`<div class="iw-kpi"><div>${tag(c.kind==='invalidate'?'반증 조건':'확인 조건')} ${esc(c.statement)}<small>${c.observed_value!=null?`관측 ${esc(c.observed_value)} ${esc(c.observed_unit||c.unit||'')} · ${esc(c.observed_period||c.period||'기간 미입력')} · ${esc(c.observed_at||'관측일 미입력')}`:'관측값 미등록'}${c.threshold!=null?` / 기준 ${esc(c.operator)} ${esc(c.threshold)} ${esc(c.unit||'')}`:''}</small></div><div>${tag({met:'충족',not_met:'미충족',unknown:'확인 불가'}[c.evaluation]||'확인 불가',c.kind==='invalidate'&&c.evaluation==='met'?'bad':'')}<small>${{current:'정상',stale:'기한 경과',unknown:'미수집'}[c.freshness]||'미수집'}</small></div></div>`).join('')||'<p class="iw-meta">등록한 조건이 없습니다. 편집에서 확인 지표와 반증 조건을 추가하세요.</p>'}</div>
      <div class="iw-section"><h3>근거 기록</h3>${(t.evidence||[]).map(e=>`<div class="iw-evidence"><span>${{support:'지지',oppose:'반대',unverified:'미확인'}[e.stance]||'근거'}</span><div>${link(e.url,e.title)}<p>${esc(e.note)}</p><div class="iw-meta">${e.published_at?`발표 ${esc(e.published_at)} · `:''}${e.event_at?`사건 ${esc(e.event_at)} · `:''}기록 ${fmtTime(e.created_at||e.retrieved_at)}</div></div></div>`).join('')||'<p class="iw-meta">연결된 근거가 없습니다.</p>'}
        <details><summary>근거 추가</summary><form class="iw-inlineform" data-form="evidence" data-id="${esc(t.id)}"><label>제목<input name="title" required maxlength="300"></label><label>원문 URL<input name="url" type="url" placeholder="https://"></label><label>관점<select name="stance"><option value="unverified">미확인</option><option value="support">지지</option><option value="oppose">반대</option></select></label><label>확인한 내용<textarea name="note" maxlength="10000"></textarea></label><div class="iw-formgrid"><label>발표일<input name="published_at" type="date"></label><label>사건일<input name="event_at" type="date"></label></div><p class="iw-form-error" role="alert"></p><button type="submit">근거 저장</button></form></details></div>
      <div class="iw-section"><h3>다음 촉매 · 확인할 질문</h3>${thesisEvents(t).map(e=>{const ref=(e.linked_theses||e.theses||[]).find(x=>(x.thesis_id||x.id)===t.id)||(t.events||[]).find(x=>(x.event_id||x.id)===e.id);return `<div class="iw-evidence"><span>↗</span><div><button type="button" class="iw-rowbutton" data-goto-event="${esc(e.id)}">${esc(e.title)}</button><p class="iw-meta">${esc(eventTime(e))}</p><p>${esc(ref?.question||'확인할 질문 미등록')}</p></div></div>`;}).join('')||'<p class="iw-meta">연결된 일정이 없습니다.</p>'}<button type="button" data-new-linked-event="${esc(t.id)}">확인 일정 등록</button>
        <details><summary>기존 일정 연결</summary><form class="iw-inlineform" data-form="link-event" data-id="${esc(t.id)}"><label>일정<select name="event_id" required><option value="">일정 선택</option>${state.data.events.map(e=>option(e.id,`${e.source_date||'미정'} · ${e.title}`,'')).join('')}</select></label><label>이 발표에서 확인할 질문<input name="question" required maxlength="2000"></label><p class="iw-form-error" role="alert"></p><button type="submit">연결 저장</button></form></details></div>
      <div class="iw-section"><h3>검토 기록</h3><p class="iw-meta">자료 확인 후 내 판단과 이유를 함께 남깁니다.</p>
        <form class="iw-inlineform" data-form="review" data-id="${esc(t.id)}"><input type="hidden" name="version" value="${t.version}"><label>내 판단<select name="judgment" required><option value="">직접 선택</option><option value="intact">유지</option><option value="challenged">재검토</option><option value="invalidated">무효화</option></select></label><label>판단 근거<textarea name="note" required maxlength="10000" placeholder="어떤 자료와 조건을 확인했는가"></textarea></label><label>다음 검토일 (선택)<input name="review_due_at" type="date"></label><p class="iw-form-error" role="alert"></p><button class="iw-primary" type="submit">검토 기록 저장</button></form>
        ${(t.reviews||[]).map(r=>`<div class="iw-evidence"><span>${tag(judgment[r.judgment],judgmentTone(r.judgment))}</span><div><p>${esc(r.note)}</p><div class="iw-meta">${fmtTime(r.reviewed_at||r.created_at)}</div></div></div>`).join('')}
      </div><div class="iw-section"><button type="button" data-archive="${esc(t.id)}">${t.lifecycle==='archived'?'논거 다시 활성화':'논거 보관'}</button><span class="iw-meta"> 기록과 연결 일정은 보존됩니다.</span></div>`;
  }
  function conditionFields(c={},index=0) {
    return `<fieldset data-condition data-condition-id="${esc(c.id)}"><legend>${index===3?'반증 조건':'확인 조건 '+(index+1)}</legend><input type="hidden" name="kind" value="${index===3?'invalidate':'support'}"><label>확인할 내용<input name="statement" value="${esc(c.statement)}" maxlength="1000" placeholder="다음 자료에서 확인할 지표·조건"></label><details ${c.threshold!=null?'open':''}><summary>수치 조건·관측값 (선택)</summary><div class="iw-formgrid"><label>비교<select name="operator">${['>','>=','<','<=','==','!='].map(o=>option(o,o,c.operator||'>=')).join('')}</select></label><label>기준값<input name="threshold" type="number" step="any" value="${esc(c.threshold)}"></label><label>단위<input name="unit" value="${esc(c.unit)}" placeholder="%, 억원 등"></label><label>비교기간<input name="period" value="${esc(c.period)}" placeholder="예: 2026Q3 전년동기비"></label><label>실제 관측값 (위 단위·기간)<input name="observed_value" type="number" step="any" value="${esc(c.observed_value)}"></label><label>자료 관측일<input name="observed_at" type="date" value="${esc(c.observed_at?.slice(0,10))}"></label><label>자료 상태<select name="freshness">${Object.entries({unknown:'미수집·확인 필요',current:'정상 (직접 확인)',stale:'기한 경과'}).map(([v,l])=>option(v,l,c.freshness||'unknown')).join('')}</select></label></div></details></fieldset>`;
  }
  function openThesisForm(id=null) {
    editingThesis=id?state.data.theses.find(t=>t.id===id):null;
    const t=editingThesis||{};
    const supports=(t.conditions||[]).filter(c=>c.kind!=='invalidate'), inverse=(t.conditions||[]).find(c=>c.kind==='invalidate');
    const available=symbols().filter(s=>id || !state.data.theses.some(t=>t.symbol_id===s.id&&t.lifecycle==='active'));
    const form=$('#iw-thesis-form');
    form.innerHTML=`<h3>${id?'논거·조건 편집':'관심종목에 투자논거 연결'}</h3>${id?`<p>${esc(thesisName(t))}</p>`:`<label>관심종목<select name="symbol_id" required><option value="">종목 선택</option>${available.map(s=>option(s.id,`${s.name} · ${s.symbol} · ${s.market}`,'')).join('')}</select></label>`}
      <div class="iw-controls"><button type="button" id="iw-import-wiki">위키에서 초안 가져오기</button><span class="iw-meta">원문을 확인한 뒤 직접 저장합니다.</span></div><div id="iw-wiki-draft"></div><input name="wiki_page" type="hidden" value="${esc(t.wiki_page)}">
      <label>투자논거<textarea name="rationale" required maxlength="5000" placeholder="어떤 변화가 이 회사의 이익으로 연결되는가">${esc(t.rationale)}</textarea></label>
      <div class="iw-formgrid">${[0,1,2,3].map(i=>conditionFields(i===3?inverse:supports[i],i)).join('')}</div><label>다음 검토일<input name="review_due_at" type="date" value="${esc(t.review_due_at)}"></label><p class="iw-form-error" role="alert"></p><div class="iw-form-actions"><button class="iw-primary" type="submit">${id?'변경 저장':'논거 저장'}</button><button type="button" data-close-form="iw-thesis-form">취소</button></div>`;
    form.hidden=false;form.querySelector(id?'textarea':'select').focus();form.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function openEventForm({id=null,thesisID=null}={}) {
    editingEvent=id?state.data.events.find(e=>e.id===id):null;pendingEvent=null;
    const e=editingEvent||{};
    const form=$('#iw-event-form');
    form.innerHTML=`<h3>${id?'직접 등록 일정 변경':'확인 일정 등록'}</h3><div class="iw-formgrid"><label class="iw-wide">제목<input name="title" required maxlength="300" value="${esc(e.title)}" placeholder="실적 확인 · 투자논거 재검토"></label><label>범주<select name="category">${Object.entries({personal:'내 확인 일정',company:'기업 실적·IR',macro:'주요 거시'}).map(([v,l])=>option(v,l,e.category||'personal')).join('')}</select></label><label>시장<select name="market">${['KR','US'].map(v=>option(v,v,e.market||'KR')).join('')}</select></label><label>관련 종목<select name="symbol_id">${option('','선택 안 함','')}${symbols().map(s=>option(s.id,s.name,(e.symbol_ids||[])[0])).join('')}</select></label><label>종류<select name="event_type">${Object.entries({review:'논거 검토',earnings:'실적 발표',earnings_call:'실적 설명회·콜',macro:'경제지표·통화정책',other:'기타 확인'}).map(([v,l])=>option(v,l,e.event_type||'review')).join('')}</select></label>
      <label>현지 날짜<input name="source_date" type="date" value="${esc(e.source_date||kstToday())}"></label><label>시간 정확도<select name="time_precision">${Object.entries(precision).filter(([v])=>v!=='date_range').map(([v,l])=>option(v,l,e.time_precision||'date_only')).join('')}</select></label><label>현지 시각 (확인된 경우)<input name="local_time" type="time" value="${esc(e.local_time)}"></label><label>원문 시간대<select name="timezone">${['Asia/Seoul','America/New_York','America/Los_Angeles','UTC'].map(v=>option(v,v,e.timezone||'Asia/Seoul')).join('')}</select></label>
      <label>확실성<select name="confidence">${Object.entries(confidence).map(([v,l])=>option(v,l,e.confidence||'official')).join('')}</select></label><label>진행 상태<select name="lifecycle">${(e.lifecycle==='results_confirmed'?['scheduled','postponed','cancelled','results_confirmed']:['scheduled','postponed','cancelled']).map(v=>option(v,lifecycle[v],e.lifecycle||'scheduled')).join('')}</select></label><label class="iw-wide">원문 URL<input name="source_url" type="url" value="${esc(e.source_url)}" placeholder="https://"></label><label class="iw-wide">메모<textarea name="notes" maxlength="10000">${esc(e.notes)}</textarea></label>
      ${id?'':`<label>연결 논거<select name="thesis_id">${option('','선택 안 함','')}${state.data.theses.filter(t=>t.lifecycle==='active').map(t=>option(t.id,thesisName(t),thesisID)).join('')}</select></label><label>이 일정에서 확인할 질문<input name="question" maxlength="2000" placeholder="연결할 경우 입력"></label>`}</div><p class="iw-meta">날짜만 알거나 장전·장후만 알려진 미국 일정은 한국 날짜가 미확정인 영역에 표시됩니다.</p><p class="iw-form-error" role="alert"></p><div class="iw-form-actions"><button type="submit" class="iw-primary">${id?'변경 저장':'일정 저장'}</button><button type="button" data-close-form="iw-event-form">취소</button></div>`;
    form.hidden=false;form.querySelector('input').focus();form.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function renderRotation() {
    $$('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===state.period)));
    const snapshot=state.data.rotation;
    const market=snapshot.markets?.[state.market], period=market?.periods?.[state.period], rows=period?.rows||[];
    $('#iw-rotation-summary').innerHTML=`<span>대표 ETF <b>${period?.valid||0}/${period?.total||rows.length}</b>개 확인</span><span>기간 <b>${state.period}</b>거래일</span><span>기준 ${esc(market?.as_of_session||'미수집')}</span>${snapshot.status==='stale'?tag('최근 수집 실패 · 이전 가격 표시','warn'):market?.status&&market.status!=='ok'?tag(sourceLabels[market.status]||market.status,'warn'):''}`;
    $('#iw-rotation-caption').textContent=`대표 ETF 가격 상대강도 · ${market?.benchmark?.label || (state.market==='US'?'SPY':'KODEX 200')} 대비 · ${period?.start_session||'—'} ~ ${period?.end_session||'—'}`;
    if(!rows.some(r=>r.id===state.sector))state.sector=rows[0]?.id||null;
    $('#iw-rotation-rows').innerHTML=rows.length?rows.map(r=>`<tr class="${r.id===state.sector?'iw-selected':''}"><td><button type="button" class="iw-rowbutton" data-sector="${esc(r.id)}">${esc(r.label)}<br><span class="iw-meta">${esc(r.symbol)} · ${r.category==='theme'?'테마':'업종'}</span></button></td><td class="${valueClass(r.absolute_return_pct)}">${pct(r.absolute_return_pct)}</td><td class="${valueClass(r.relative_pp)}">${pct(r.relative_pp,'%p')}</td><td>${r.rank_change==null?'—':r.rank_change>0?'↑ '+r.rank_change:r.rank_change<0?'↓ '+Math.abs(r.rank_change):'유지'}</td></tr>`).join(''):`<tr><td colspan="4">${empty('업종 가격을 아직 확보하지 못했습니다. 데이터 갱신 후 확인할 수 있습니다.')}</td></tr>`;
    const row=rows.find(r=>r.id===state.sector);
    $('#iw-rotation-detail').innerHTML=row?`<h2 tabindex="-1">${esc(row.label)}</h2><p class="iw-meta">${esc(row.symbol)} · ${link(row.source_url,'공식 기초지수·상품 설명 ↗')}</p><div class="iw-section"><h3>같은 거래일의 가격성과</h3>${['5','21','63'].map(n=>{const r=market.periods?.[n]?.rows?.find(x=>x.id===row.id);return `<div class="iw-kpi"><span>${{5:'1주 · 5',21:'1개월 · 21',63:'3개월 · 63'}[n]}거래일</span><span class="${valueClass(r?.relative_pp)}">${pct(r?.relative_pp,'%p')}</span></div>`;}).join('')}<p class="iw-meta">상대성과 = ETF 수익률 − 기준 수익률. 선택 기간의 기준 수익률 ${pct(period?.benchmark_return_pct)}.</p></div>${row.missing_reason?`<p class="iw-note">계산 제외: ${esc(row.missing_reason)}</p>`:''}<p class="iw-note">분할조정·배당 미반영 가격입니다. ETF 성과를 자금 유입액이나 전체 구성종목의 확산으로 해석하지 않습니다.</p><p class="iw-meta">${esc(market.benchmark?.note||'')}<br>순위 변화: ${period?.rank_comparable?'같은 목록의 5거래일 전 순위와 비교':esc(period?.rank_comparison_reason==='incomplete_history_or_registry_changed'?'이력 부족 또는 새 구성 등록으로 비교 보류':period?.rank_comparison_reason||'비교 자료 미확보')}</p><a href="/technicals">차트 레이더에서 관심종목 확인 →</a>`:empty('대표 ETF를 선택하면 기간별 상대성과를 확인할 수 있습니다.');
    const breadth=market?.breadth;
    const pending=breadth?.pending_universe;
    $('#iw-breadth').innerHTML=`<h2>고정 관찰 바스켓 확산</h2>${pending?`<p class="iw-note">${esc(pending.label)} v${pending.version} 등록 완료 · ${esc(pending.effective_from)} 이후 완료장부터 적용됩니다.</p>`:''}${breadth?.status==='unregistered'||!breadth?`<p class="iw-note">구성종목 미등록. 관찰할 고정 바스켓을 등록하면 확산과 커버리지를 계산합니다.</p>`:`<p class="iw-meta">${esc(breadth.label)} · ${esc(breadth.universe?.id)} v${esc(breadth.universe?.version)} · 적용 ${esc(breadth.universe?.effective_from)}</p>${Object.entries(breadth.metrics||{}).map(([key,m])=>`<div class="iw-metric"><h3>${{above_50:'50일선 위',above_200:'200일선 위',new_high_252:'당일 52주 신고가'}[key]||esc(key)}</h3><p><b>${m.valid?Number(m.ratio_pct).toFixed(1)+'%':'확인 불가'}</b> · ${m.matched}/${m.valid}종목</p><p class="iw-meta">자료 확보 ${m.valid}/${m.total} · 커버리지 ${Number(m.coverage_pct||0).toFixed(1)}%<br>전체 가능 범위 ${(m.possible_range_pct||[]).map(v=>Number(v).toFixed(1)+'%').join(' ~ ')}<br>동일 표본 ${m.common_valid||0} · ${m.trend==null?'변화 판정 보류 (커버리지 95% 기준)':pct(m.change_pp,'%p')}<br>${key==='new_high_252'?'252거래일 종가 최고값 기준':'당일 종가와 해당 이동평균 비교'}</p></div>`).join('')}<details><summary>고정 구성종목 ${breadth.universe?.members?.length||0}개</summary><p class="iw-meta">${(breadth.universe?.members||[]).map(s=>esc(s.name||s.symbol)).join(' · ')}</p></details>`}<div class="iw-section"><button type="button" id="iw-register-universe">${breadth?.universe?.members?.length?'구성 버전 등록':'바스켓 등록'}</button><p class="iw-meta">팔로우·신고가 후보와 별도로 등록한 구성만 분모로 사용합니다.</p></div>`;
  }
  function filteredEvents() {
    const start=kstToday(), end=shiftDay(start,14);
    return state.data.events.filter(e=>state.eventFilter==='all'||e.category===state.eventFilter)
      .filter(e=>state.eventMarket==='all'||e.market===state.eventMarket)
      .filter(e=>state.eventSymbol==='all'||(e.symbol_ids||[]).includes(state.eventSymbol))
      .filter(e=>state.estimated||e.confidence!=='estimated')
      .filter(e=>e.category!=='company'||!(e.symbol_ids||[]).length||(e.symbol_ids||[]).some(id=>symbolByID(id)))
      .filter(e=>{const d=eventDay(e)||e.source_date;if(!d)return true;return state.calView==='month'||state.eventWindow==='month'?d.startsWith(state.month):state.eventWindow==='14'?d>=start&&d<=end:true;})
      .sort((a,b)=>(eventDay(a)||a.source_date||'9999').localeCompare(eventDay(b)||b.source_date||'9999')||(state.timezone==='KST'?(a.kst_time||''):(a.local_time||'')).localeCompare(state.timezone==='KST'?(b.kst_time||''):(b.local_time||'')));
  }
  function renderCalendar() {
    preserveDrafts($('#iw-event-detail'));
    $('#iw-calendar-title').textContent=`${state.month.slice(0,4)}년 ${Number(state.month.slice(5))}월`;
    $$('[data-cal-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.calView===state.calView)));
    const events=filteredEvents();
    const uncertain=events.filter(e=>!eventDay(e));
    let certain=events.filter(e=>eventDay(e));
    const month=$('#iw-month');month.hidden=state.calView!=='month';
    if(state.calView==='month') {
      const first=new Date(`${state.month}-01T12:00:00Z`), count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
      let cells=['일','월','화','수','목','금','토'].map(x=>`<div class="iw-weekday">${x}</div>`).join('');
      for(let i=0;i<first.getUTCDay();i++)cells+='<div class="iw-day" aria-hidden="true"></div>';
      for(let d=1;d<=count;d++){const day=`${state.month}-${String(d).padStart(2,'0')}`, entries=certain.filter(e=>eventDay(e)===day);cells+=`<button type="button" class="iw-day" data-day="${day}" aria-label="${day}, 일정 ${entries.length}건" aria-pressed="${state.day===day}">${d}${entries.length?`<small>${entries.length}건</small><span class="iw-month-events">${entries.slice(0,2).map(e=>esc(e.title)).join('<br>')}</span>`:''}</button>`;}
      month.innerHTML=`<div class="iw-calendar">${cells}</div>${state.day?'<button type="button" id="iw-clear-day">월 전체 보기</button>':''}`;
      if(state.day)certain=certain.filter(e=>eventDay(e)===state.day);
    }
    $('#iw-uncertain').innerHTML=uncertain.length?`<div class="iw-uncertain-box"><h3>${state.timezone==='KST'?'한국 날짜 미확정 · 현지 일정':'날짜 미정'}</h3><p class="iw-meta">정확한 시각을 확인하기 전에는 한국 날짜 격자에 배치하지 않습니다.</p>${uncertain.map(eventRow).join('')}</div>`:'';
    const groups=new Map();certain.forEach(e=>{const day=eventDay(e);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(e);});
    $('#iw-agenda').innerHTML=groups.size?[...groups.entries()].map(([day,rows])=>`<div class="iw-agenda-day"><div class="iw-date">${day.slice(0,7)}<b>${Number(day.slice(8))}</b></div><div>${rows.map(eventRow).join('')}</div></div>`).join(''):empty('현재 필터에 표시할 일정이 없습니다.<br>수집 상태와 일정 미발표 목록을 함께 확인해 주세요.');
    $('#iw-calendar-caption').textContent=state.day?`${state.day} 일정`:`${state.eventWindow==='14'&&state.calView==='agenda'?'다가오는 14일':'선택 범위'} · ${certain.length}건`;
    if(!state.event&&events.length)state.event=events[0].id;
    const selected=state.data.events.find(e=>e.id===state.event);
    $('#iw-event-detail').innerHTML=selected?eventDetail(selected):empty('일정을 선택하면 원문·변경 이력·확인 질문을 볼 수 있습니다.');
    restoreDrafts($('#iw-event-detail'));
    const coverage=state.data.company_coverage||[];
    $('#iw-company-coverage').innerHTML=`<details class="iw-coverage"><summary>관심기업 일정 확인 상태 · ${coverage.length}개</summary>${coverage.length?coverage.map(c=>`<div class="iw-source"><div>${(c.symbol_ids||[]).map(nameOf).map(esc).join(' · ')} ${tag(sourceLabels[c.status]||c.status,c.status==='error'?'warn':'')}<p>${esc(c.reason||'')} ${link(c.source_url,'공식 IR ↗')}</p><p>최근 확인 ${fmtTime(c.last_checked_at)}</p></div></div>`).join(''):'관심종목을 등록하면 기업별 출처 확인 상태가 표시됩니다.'}</details>`;
  }
  function eventRow(e) {return `<button type="button" class="iw-event" data-event="${esc(e.id)}" aria-pressed="${e.id===state.event}"><strong>${esc(e.title)}</strong><p class="iw-meta">${esc(eventTime(e))}</p><p class="iw-meta">${(e.symbol_ids||[]).map(nameOf).map(esc).join(' · ')} ${eventBadges(e)}</p></button>`;}
  function eventDetail(e) {
    const source=state.data.sources.find(s=>(s.id||s.source)===e.source);
    return `<div class="iw-detail-title"><div><button type="button" class="iw-back" data-back="calendar">← 목록</button><h2 tabindex="-1">${esc(e.title)}</h2></div></div><p class="iw-thesis">${esc(eventTime(e))}</p><p>${eventBadges(e)}</p>
      ${!dateOf(e)&&e.timezone!=='Asia/Seoul'?'<p class="iw-note">한국 날짜 미확정. 원문의 현지 날짜·장전·장후 표현을 유지합니다.</p>':''}
      ${source&&['error','partial'].includes(source.status)?`<p class="iw-note">최근 출처 확인 ${sourceLabels[source.status]}. 이전에 확인한 일정이며 최신 변경 여부를 확인해 주세요.</p>`:''}
      <dl class="iw-definition"><dt>원문 시간</dt><dd>${esc(e.source_date||'미정')} ${esc(e.local_time||precision[e.time_precision])} · ${esc(e.timezone)}</dd><dt>한국 시간</dt><dd>${e.starts_at_utc?fmtTime(e.starts_at_utc):dateOf(e)?esc(dateOf(e))+' · 시간 미정':'날짜 미확정'}</dd><dt>관련 종목</dt><dd>${(e.symbol_ids||[]).map(nameOf).map(esc).join(' · ')||'주요 거시·개인 일정'}</dd><dt>기준 기간</dt><dd>${esc(e.reference_period||'—')}</dd><dt>공식 출처</dt><dd>${link(e.source_url,e.source_url?'원문 확인 ↗':'직접 등록')}</dd><dt>최근 확인</dt><dd>${fmtTime(e.last_checked_at)}</dd><dt>메모</dt><dd>${esc(e.notes||'—')}</dd></dl>
      <div class="iw-section"><h3>이 발표에서 확인할 질문</h3>${(e.linked_theses||e.theses||[]).map(ref=>{const id=ref.thesis_id||ref.id;const t=state.data.theses.find(x=>x.id===id);return `<div class="iw-evidence"><span>↗</span><div><button type="button" class="iw-rowbutton" data-goto-thesis="${esc(id)}">${esc(t?thesisName(t):ref.rationale||'연결 논거')}</button><p>${esc(ref.question||'질문 미등록')}</p></div></div>`;}).join('')||'<p class="iw-meta">논거 화면에서 이 일정과 확인 질문을 연결할 수 있습니다.</p>'}</div>
      <div class="iw-section"><h3>발표 결과 확인</h3>${e.result_url?`<p>${link(e.result_url,'확인한 결과자료 ↗')}</p>`:'<p class="iw-meta">예정 시각이 지나도 결과 확인으로 처리하지 않습니다.</p>'}<details><summary>결과자료 연결</summary><form class="iw-inlineform" data-form="result" data-id="${esc(e.id)}"><label>공식 결과자료 URL<input name="url" type="url" required placeholder="https://" value="${esc(e.result_url)}"></label><p class="iw-meta">관련 논거에 검토 할 일을 추가합니다. 내 판단은 직접 기록합니다.</p><p class="iw-form-error" role="alert"></p><button type="submit">결과 확인 저장</button></form></details></div>
      <div class="iw-section"><h3>변경 이력</h3>${(e.revisions||[]).map(r=>`<div class="iw-evidence"><span>변경</span><div><p class="iw-meta">${fmtTime(r.changed_at||r.detected_at||r.created_at)}</p><p>${esc(revisionText(r))}</p></div></div>`).join('')||'<p class="iw-meta">확인된 변경 이력이 없습니다.</p>'}</div>${e.source==='manual'?`<div class="iw-section"><button type="button" data-edit-event="${esc(e.id)}">일정 변경·연기·취소 기록</button></div>`:''}`;
  }
  function revisionText(r) {const format=x=>{if(!x)return '';if(typeof x==='string')return x;return [x.source_date||'날짜 미정',x.local_time||'',lifecycle[x.lifecycle]||''].filter(Boolean).join(' ');};return `${format(r.before)} → ${format(r.after)}`;}
  function renderSources() {
    const sources=state.data.sources||[];
    $('#iw-source-count').textContent=`· 정상 ${sources.filter(s=>s.status==='ok').length}/${sources.length}`;
    $('#iw-sources').innerHTML=sources.length?sources.map(s=>`<div class="iw-source"><div>${link(s.url,s.label||s.id||s.source)} ${tag(sourceLabels[s.status]||s.status,s.status==='error'?'warn':'')}<p>${esc(s.error||'')}</p></div><div>최근 시도 ${fmtTime(s.checked_at||s.last_checked_at)}<br>최근 성공 ${fmtTime(s.last_success_at)} · ${s.event_count??'—'}건</div></div>`).join(''):empty('아직 공식 출처를 확인하지 않았습니다. 데이터 갱신을 눌러 수집할 수 있습니다.');
  }
  function focusDetail(kind) {const panel=$(kind==='theses'?'#iw-thesis-detail':kind==='rotation'?'#iw-rotation-detail':'#iw-event-detail');if(innerWidth<=760){panel.scrollIntoView({behavior:'smooth',block:'start'});panel.querySelector('h2')?.focus({preventScroll:true});}}
  function go(view) {state.view=view;writeURL();render();}
  function formError(form,error) {form.querySelector('.iw-form-error').textContent=error.message||String(error);}
  async function saveForm(form,work) {
    if(saving)return;
    if(!form.reportValidity())return;
    saving=true;const buttons=[...form.querySelectorAll('button[type=submit]')];buttons.forEach(b=>b.disabled=true);formError(form,'');
    try {await work();if(form.dataset.form){formDrafts.delete(form.dataset.form+':'+form.dataset.id);form.dataset.saved='true';}await reload('저장했습니다.');}
    catch(error){formError(form,error);}
    finally {saving=false;buttons.forEach(b=>b.disabled=false);}
  }
  root.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();
    saveForm(form,async()=>{
      const values=Object.fromEntries(new FormData(form));
      const post=(path,body,method='POST')=>api(path,{method,body:JSON.stringify(body)});
      if(form.id==='iw-thesis-form') {
        const conditions=[...form.querySelectorAll('[data-condition]')].map(field=>{const get=name=>field.querySelector(`[name="${name}"]`).value; if(!get('statement').trim())return null;const c={kind:get('kind'),statement:get('statement'),operator:get('operator'),freshness:get('freshness')};if(field.dataset.conditionId)c.id=field.dataset.conditionId;for(const key of ['threshold','observed_value'])if(get(key)!=='')c[key]=Number(get(key));for(const key of ['unit','period','observed_at'])if(get(key))c[key]=get(key);if(c.observed_value!=null){c.observed_unit=c.unit;c.observed_period=c.period;}return c;}).filter(Boolean);
        const body={rationale:values.rationale,conditions,review_due_at:values.review_due_at||null,wiki_page:values.wiki_page||null};
        const saved=editingThesis?await post(`/theses/${editingThesis.id}`,{...body,version:editingThesis.version},'PATCH'):await post('/theses',{...body,symbol_id:values.symbol_id});
        state.thesis=saved.id;state.filter='all';writeURL(true);form.hidden=true;
      } else if(form.id==='iw-event-form') {
        if(values.thesis_id&&!values.question.trim())throw new Error('연결할 논거에서 확인할 질문을 입력해 주세요.');
        if(values.time_precision==='exact'&&!values.local_time)throw new Error('확인된 현지 시각을 입력해 주세요.');
        const body={title:values.title,market:values.market,category:values.category,event_type:values.event_type,
          source_date:values.time_precision==='tbd'?null:values.source_date||null,local_time:values.time_precision==='exact'?values.local_time:null,
          timezone:values.timezone,time_precision:values.time_precision,confidence:values.confidence,lifecycle:values.lifecycle,source_url:values.source_url||null,notes:values.notes||'',symbol_ids:values.symbol_id?[values.symbol_id]:[]};
        if(body.category!=='personal'&&body.confidence==='official'&&!body.source_url)throw new Error('공식 확인 일정은 원문 URL을 입력해 주세요.');
        const saved=editingEvent?await post(`/events/${editingEvent.id}`,{...body,version:editingEvent.version},'PATCH'):pendingEvent||await post('/events',body);
        pendingEvent=saved;
        if(values.thesis_id)await post(`/theses/${values.thesis_id}/events`,{event_id:saved.id,question:values.question});
        state.event=saved.id;state.eventWindow='all';state.calView='agenda';writeURL(true);form.hidden=true;pendingEvent=null;
      } else if(form.id==='iw-universe-form') {
        const members=values.members.split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{const [symbol,exchange,...name]=line.split(',').map(v=>v.trim());return {symbol,exchange:exchange||(state.market==='KR'?'KOSPI':'US'),name:name.join(',')||symbol};});
        await post('/universe',{market:state.market,label:values.label,effective_from:values.effective_from,members});form.hidden=true;
        status('바스켓을 등록했습니다. 데이터 갱신 시 계산됩니다.');
      } else if(form.dataset.form==='review') {
        const body={version:Number(values.version),judgment:values.judgment,note:values.note};if(values.review_due_at)body.review_due_at=values.review_due_at;
        await post(`/theses/${form.dataset.id}/reviews`,body);
      } else if(form.dataset.form==='evidence') {
        const body={title:values.title,stance:values.stance};for(const key of ['url','note','published_at','event_at'])if(values[key])body[key]=values[key];
        await post(`/theses/${form.dataset.id}/evidence`,body);
      } else if(form.dataset.form==='link-event') await post(`/theses/${form.dataset.id}/events`,values);
      else if(form.dataset.form==='result') await post(`/events/${form.dataset.id}/result`,values);
    });
  });
  root.addEventListener('click',async event=>{
    const button=event.target.closest('button,a[data-view]');if(!button)return;
    try {
      if(button.dataset.view){event.preventDefault();go(button.dataset.view);}
      else if(button.dataset.thesis){state.thesis=button.dataset.thesis;writeURL();renderTheses();focusDetail('theses');}
      else if(button.dataset.event){state.event=button.dataset.event;writeURL();renderCalendar();focusDetail('calendar');}
      else if(button.dataset.sector){state.sector=button.dataset.sector;writeURL();renderRotation();focusDetail('rotation');}
      else if(button.dataset.thesisFilter){state.filter=button.dataset.thesisFilter;state.thesis=null;writeURL();renderTheses();}
      else if(button.dataset.period){state.period=button.dataset.period;writeURL();renderRotation();}
      else if(button.dataset.calView){state.calView=button.dataset.calView;state.day=null;writeURL();renderCalendar();}
      else if(button.dataset.day){state.day=button.dataset.day;writeURL();renderCalendar();}
      else if(button.dataset.gotoEvent){state.event=button.dataset.gotoEvent;state.eventWindow='all';go('calendar');focusDetail('calendar');}
      else if(button.dataset.gotoThesis){state.thesis=button.dataset.gotoThesis;go('theses');focusDetail('theses');}
      else if(button.dataset.newLinkedEvent){go('calendar');openEventForm({thesisID:button.dataset.newLinkedEvent});}
      else if(button.dataset.editThesis)openThesisForm(button.dataset.editThesis);
      else if(button.dataset.editEvent)openEventForm({id:button.dataset.editEvent});
      else if(button.dataset.closeForm)$(`#${button.dataset.closeForm}`).hidden=true;
      else if(button.dataset.back)$(button.dataset.back==='theses'?'#iw-thesis-list':'#iw-agenda').scrollIntoView({behavior:'smooth'});
      else if(button.dataset.archive){const t=state.data.theses.find(t=>t.id===button.dataset.archive);await api(`/theses/${t.id}`,{method:'PATCH',body:JSON.stringify({version:t.version,lifecycle:t.lifecycle==='archived'?'active':'archived'})});state.filter=t.lifecycle==='archived'?'all':'archive';writeURL(true);await reload('기록을 보존하여 변경했습니다.');}
      else if(button.dataset.readWiki){openThesisForm(state.thesis);$('#iw-import-wiki').click();}
      else switch(button.id){
        case 'iw-add-thesis':openThesisForm();break;
        case 'iw-add-event':openEventForm();break;
        case 'iw-import-wiki': {
          const form=$('#iw-thesis-form'), id=editingThesis?.symbol_id||form.elements.symbol_id?.value;if(!id)throw new Error('먼저 관심종목을 선택해 주세요.');
          const draft=await api(`/wiki-draft/${encodeURIComponent(id)}`);form.elements.wiki_page.value=draft.wiki_page;
          $('#iw-wiki-draft').innerHTML=`<details open><summary>${esc(draft.wiki_page)} · 참고 초안</summary><pre>${esc(draft.text)}</pre><p class="iw-meta">${esc(draft.message)}</p></details>`;break;
        }
        case 'iw-refresh': await api('/refresh',{method:'POST',body:'{}'});await reload();break;
        case 'iw-prev-month':case 'iw-next-month': {const date=new Date(`${state.month}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+(button.id==='iw-prev-month'?-1:1));state.month=date.toISOString().slice(0,7);state.day=null;state.eventWindow='month';writeURL();render();break;}
        case 'iw-today':state.month=kstToday().slice(0,7);state.day=null;state.eventWindow='14';writeURL();render();break;
        case 'iw-clear-day':state.day=null;writeURL();renderCalendar();break;
        case 'iw-register-universe': {
          const form=$('#iw-universe-form');form.innerHTML=`<h3>${state.market==='US'?'미국':'한국'} 고정 바스켓 등록</h3><p class="iw-meta">직접 정한 구성종목을 고정합니다. 적용일 이전 기록은 바꾸지 않으며, 새 버전의 적용일은 이전 버전보다 뒤여야 합니다.</p><label>바스켓 이름<input name="label" required maxlength="120"></label><label>적용 시작일<input name="effective_from" type="date" value="${kstToday()}" required></label><label>종목, 거래소, 이름 (한 줄에 하나)<textarea name="members" required rows="6" placeholder="${state.market==='US'?'AAPL,NASDAQ,Apple':'005930,KOSPI,삼성전자'}"></textarea></label><p class="iw-form-error" role="alert"></p><div class="iw-form-actions"><button type="submit">고정 구성 저장</button><button type="button" data-close-form="iw-universe-form">취소</button></div>`;form.hidden=false;form.querySelector('input').focus();form.scrollIntoView({behavior:'smooth'});break;
        }
      }
    }catch(error){status(error.message,true);}
  });
  const controls={'iw-thesis-market':'thesisMarket','iw-market':'market','iw-event-window':'eventWindow','iw-event-filter':'eventFilter','iw-event-market':'eventMarket','iw-event-symbol':'eventSymbol','iw-timezone':'timezone'};
  root.addEventListener('change',event=>{const key=controls[event.target.id];if(key){state[key]=event.target.value;state.day=null;writeURL();render();}else if(event.target.id==='iw-estimated'){state.estimated=event.target.checked;writeURL();renderCalendar();}});
  $('#iw-search').addEventListener('input',event=>{state.q=event.target.value;writeURL(true);renderTheses();});
  root.querySelector('.iw-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;const tabs=$$('.iw-tabs a'),i=tabs.indexOf(document.activeElement);if(i<0)return;event.preventDefault();const next=tabs[(i+(event.key==='ArrowRight'?1:2))%3];next.focus();next.click();});
  window.addEventListener('popstate',()=>{readURL();render();});
  if(location.pathname==='/decisions'){try {const last=localStorage.getItem('decisions-last-view');if(['theses','rotation','calendar'].includes(last))state.view=last;}catch{}}
  readURL();writeURL(true);reload();
})();
