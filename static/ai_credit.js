(() => {
  'use strict';
  const root = document.getElementById('ai-credit');
  if (!root) return;
  const $ = id => document.getElementById(`aic-${id}`);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v, digits=2) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('ko-KR', {minimumFractionDigits:digits, maximumFractionDigits:digits});
  const sourceMode = $('source-mode');
  const signed = v => v == null ? '—' : `${v > 0 ? '+' : ''}${num(v,1)}`;
  const stale = day => {
    if (!day) return true;
    const d=new Date(`${day}T00:00:00Z`), now=new Date();
    const end=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
    let days=0;
    for(d.setUTCDate(d.getUTCDate()+1);d.getTime()<=end;d.setUTCDate(d.getUTCDate()+1)) if(![0,6].includes(d.getUTCDay())) days++;
    return days>1;
  };
  const latest = b => b.history.at(-1);
  const pinned = {CRWV:'US21873SAG30', ORCL:'US68389XDX03', NBIS:'US63954QAN60', IREN:'US46270CAL37'};
  let db = {bonds:[], issuers:{}, benchmarks:[], sources:[]};
  let selected = null;
  const label = b => `${b.symbol} ${num(latest(b).coupon_pct)}% ${b.maturity} · ${b.isin}`;
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && ['www.ishares.com','fred.stlouisfed.org','www.finra.org'].includes(u.hostname) ? u.href : '#'; } catch { return '#'; } };
  const delta = (bond, key) => {key = db.trace_source && key === 'ytm_pct' ? 'trace_yield_pct' : key;const h=bond.history.filter(p=>p[key]!=null); return h.length>1 && h.at(-1).date===latest(bond).date ? h.at(-1)[key]-h.at(-2)[key] : null;};

  function chart(points, key, height=240) {
    const values = points.filter(p => p[key] != null && Number.isFinite(p[key]));
    if (!values.length) return '<div class="aic-empty">표시할 관측값이 없습니다.</div>';
    const width=1000, left=65, right=70, top=18, bottom=38;
    const days=values.map(p=>Date.parse(`${p.date}T00:00:00Z`));
    const minDay=Math.min(...days), maxDay=Math.max(...days);
    let low=Math.min(...values.map(p=>p[key])), high=Math.max(...values.map(p=>p[key]));
    const pad=Math.max((high-low)*.2, Math.abs(high)*.015, .1);low-=pad;high+=pad;
    const x=d=>maxDay===minDay ? (width+left-right)/2 : left+(d-minDay)/(maxDay-minDay)*(width-left-right);
    const y=v=>top+(high-v)/(high-low)*(height-top-bottom);
    const grid=[0,.5,1].map(f=>{const v=low+(high-low)*f, yy=y(v);return `<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"/><text x="${left-8}" y="${yy+4}" text-anchor="end">${num(v,key.includes('bp')?0:2)}</text>`;}).join('');
    const line=values.length>1?`<polyline points="${values.map((p,i)=>`${x(days[i])},${y(p[key])}`).join(' ')}"/>`:'';
    const dots=values.map((p,i)=>`<circle cx="${x(days[i])}" cy="${y(p[key])}" r="${values.length===1?5:3}"><title>${esc(p.date)}: ${num(p[key])}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(values[0].date)}부터 ${esc(values.at(-1).date)}까지 ${values.length}개 관측 추이">${grid}${line}${dots}<text x="${left}" y="${height-10}">${esc(values[0].date)}</text><text x="${width-right}" y="${height-10}" text-anchor="end">${esc(values.at(-1).date)}</text></svg>`;
  }

  function renderCards() {
    $('issuers').innerHTML = ['CRWV','NBIS','ORCL','IREN'].map(symbol => {
      const bonds=db.bonds.filter(b=>b.symbol===symbol);
      const b=bonds.find(b=>b.isin===pinned[symbol]) || bonds.find(b=>b.kind==='plain') || bonds[0];
      if (!b) return `<article class="aic-issuer"><h2>${esc(db.issuers[symbol]||symbol)}</h2><p>관측값 미확보</p></article>`;
      const p=latest(b), convertible=b.kind==='convertible', value=convertible?(db.trace_source?p.trace_yield_pct:p.ytm_pct):p.spread_bp;
      const change=convertible?delta(b,'ytm_pct'):delta(b,'spread_bp');
      return `<article class="aic-issuer ${convertible?'aic-convert':''}"><h2>${esc(db.issuers[symbol])}<span class="aic-ticker">${symbol}</span></h2><span class="aic-badge ${b.kind}">${convertible?'전환사채':'일반 회사채'}</span><div class="aic-value">${num(value,convertible?2:0)}<small>${convertible?(db.trace_source?'% 거래수익률':'% YTM'):'bp'}</small></div><div class="aic-caption">${convertible?'전환권 포함 · 신용 스프레드 제외':(db.trace_source?'거래수익률−국채 (기준 미확인)':'국채 대비 참고 스프레드')}</div><p class="aic-caption">직전 관측 대비 ${signed(convertible && change!=null?change*100:change)} bp</p><button type="button" data-bond="${b.isin}">${esc(b.maturity)} · ${num(p.coupon_pct)}% 쿠폰</button><p class="aic-caption ${stale(p.date)?'aic-warn':''}">관측 ${esc(p.date)}${stale(p.date)?' · 지연':''} · ${bonds.length}개 채권</p></article>`;
    }).join('');
  }

  function renderTable() {
    const filter=$('filter').value;
    const bonds=db.bonds.filter(b=>filter==='all'||b.symbol===filter);
    $('table').innerHTML=bonds.length ? bonds.map(b=>{
      const p=latest(b);
      return `<tr class="${b.isin===selected?'aic-selected':''}"><td><button type="button" data-bond="${b.isin}">${esc(db.issuers[b.symbol])}<small>${b.isin}</small></button></td><td><span class="aic-badge ${b.kind}">${b.kind==='plain'?'일반':'전환'}</span></td><td>${esc(b.maturity)}</td><td>${num(p.coupon_pct)}</td><td title="ETF 공개 가격. 없는 경우 평가비율을 가격으로 대체하지 않습니다.">${num(p.price)}</td><td>${num(db.trace_source?p.trace_yield_pct:p.ytm_pct)}</td><td title="${esc(p.spread_reason||`동일일 국채 ${num(p.treasury_pct)}%, 보간 ${p.tenor_low}~${p.tenor_high}년`)}">${num(p.spread_bp,1)}</td><td>${signed(delta(b,'spread_bp'))}</td><td class="${stale(p.date)?'aic-warn':''}">${esc(p.date)}${stale(p.date)?' · 지연':''}</td><td><a href="${safeUrl(p.source_url)}" target="_blank" rel="noopener noreferrer">${esc(p.fund)}</a></td></tr>`;
    }).join(''):'<tr><td colspan="10">확보한 채권이 없습니다. 아래 소스 상태를 확인하세요.</td></tr>';
  }

  function renderChart() {
    const bond=db.bonds.find(b=>b.isin===selected);
    if (!bond) {$('chart').innerHTML='<div class="aic-empty">확보한 채권이 없습니다.</div>';return;}
    const key=db.trace_source&&$('metric').value==='ytm_pct'?'trace_yield_pct':$('metric').value;
    const range=$('range').value;
    const cutoff=range==='all'?-Infinity:Date.now()-Number(range)*86400000;
    const points=bond.history.filter(p=>Date.parse(`${p.date}T00:00:00Z`)>=cutoff);
    $('chart').innerHTML=chart(points,key);
    const valid=points.filter(p=>p[key]!=null);
    const reason=key==='spread_bp'&&bond.kind==='convertible'?'전환사채는 신용 스프레드를 산출하지 않습니다.':key==='price'&&!valid.length?'이 채권의 공개 가격은 미확보입니다. 평가액/액면 비율은 별도 지표에서 확인할 수 있습니다.':'';
    $('chart-note').textContent=`${reason} ${valid.length}개 관측 · 최초 수집 관측 ${bond.history[0].date}. ${valid.length<=1?'시계열이 더 쌓이면 추이가 표시됩니다. 과거 값은 생성하지 않습니다.':'점에 마우스를 올리면 관측일과 값을 확인할 수 있습니다.'} ${key==='valuation_per_100'?'평가액/액면 비율은 경과이자를 포함하며 clean price가 아닙니다.':''}`;
  }

  function choose(isin) {
    selected=isin; $('security').value=isin;
    const bond=db.bonds.find(b=>b.isin===isin);
    $('metric').querySelector('[value="spread_bp"]').disabled=bond?.kind==='convertible';
    if (bond?.kind==='convertible' && $('metric').value==='spread_bp') $('metric').value='ytm_pct';
    renderChart();renderTable();
  }

  function render() {
    $('clock').textContent=db.checked_at?`최근 수집 시도 ${new Date(db.checked_at).toLocaleString('ko-KR')} · 원자료 관측일은 별도 표시`:'최초 수집 대기';
    $('security').innerHTML=db.bonds.map(b=>`<option value="${b.isin}">${esc(label(b))}</option>`).join('');
    $('metric').querySelector('[value="ytm_pct"]').textContent=db.trace_source?'TRACE 거래수익률 (%) — 기준 미확인':'공개 YTM (%)';
    $('metric').querySelector('[value="spread_bp"]').textContent=db.trace_source?'거래수익률−국채 참고 차이 (bp)':'국채 대비 참고 스프레드 (bp)';
    const explain=root.querySelector('.aic-explainer');
    explain.querySelector('strong').textContent=db.trace_source?'거래수익률−국채 참고 차이':'국채 대비 참고 스프레드';
    explain.querySelector('span').textContent=db.trace_source?'TRACE 거래수익률의 YTM/YTW 기준은 미확인입니다. ETF YTM 시계열과 분리해 관찰하세요.':'일반 회사채 YTM − 같은 날의 만기 보간 미국 국채 수익률.';
    const headers=root.querySelectorAll('thead th');
    headers[5].textContent=db.trace_source?'거래수익률 %':'YTM %';
    headers[6].textContent=db.trace_source?'국채 대비 차이 bp':'참고 스프레드 bp';
    if ($('trace-notice')) $('trace-notice').hidden=!db.trace_source;
    renderCards();
    selected=db.bonds.some(b=>b.isin===selected)?selected:db.bonds.find(b=>b.isin===pinned.CRWV)?.isin || db.bonds[0]?.isin;
    choose(selected);
    $('benchmarks').innerHTML=db.benchmarks.map(b=>{
      const p=b.history.at(-1), prev=b.history.at(-2);
      const points=b.history.filter(p=>Date.parse(`${p.date}T00:00:00Z`)>=Date.now()-90*86400000);
      return `<article class="aic-benchmark"><h3>${esc(b.label)}</h3><strong>${num(p?.value_bp,0)} <small>bp</small></strong><p class="aic-caption ${p&&stale(p.date)?'aic-warn':''}">관측 ${esc(p?.date||'미확보')} · 직전 관측 대비 ${signed(p&&prev?p.value_bp-prev.value_bp:null)} bp</p><div class="aic-chart">${chart(points,'value_bp',150)}</div><p class="aic-help">시장 전체 OAS · 개별 채권 참고 스프레드와 산식이 다릅니다. <a href="${safeUrl(b.source_url)}" target="_blank" rel="noopener noreferrer">FRED</a></p></article>`;
    }).join('');
    $('sources').innerHTML=db.sources.map(s=>`<div class="aic-source"><strong>${esc(s.source)}</strong><span class="${s.status==='ok'&&s.freshness!=='stale'?'':'aic-warn'}">${s.status==='ok'?(s.freshness==='stale'?'응답 성공 · 관측일 지연':'수집 성공'):s.status==='no_coverage'?'해당 업체 편입 없음':'수집 실패 · 이전 관측 유지'}${s.error?` (${esc(s.error)})`:''} · 관측 ${esc(s.observation_date||'미확보')}${s.count!=null?` · 해당 업체 ${s.count}개 채권`:''}</span></div>`).join('');
  }

  root.addEventListener('click',event=>{const target=event.target.closest('[data-bond]');if(target)choose(target.dataset.bond);});
  $('security').addEventListener('change',event=>choose(event.target.value));
  $('metric').addEventListener('change',renderChart);
  $('range').addEventListener('change',renderChart);
  $('filter').addEventListener('change',renderTable);
  async function refresh(){
    try{
      const response=await fetch(sourceMode?.value==='trace'?'/credit/ai-history-data.json':root.dataset.url,{cache:'no-store'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(data.schema_version!==1||!Array.isArray(data.bonds))throw Error('데이터 형식 변경');
      db=data;render();$('error').hidden=true;
    }catch(error){$('error').textContent='데이터를 갱신하지 못했습니다. 기존 화면을 유지합니다. 잠시 후 다시 확인해 주세요.';$('error').hidden=false;}
  }
  sourceMode?.addEventListener('change',refresh);
  refresh();setInterval(refresh,60000);
})();
