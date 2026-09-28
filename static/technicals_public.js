/* Static public market data only; no account state or authenticated endpoints. */
(function (root) {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const number = (n, digits = 2) => finite(n) ? n.toLocaleString('ko-KR', {maximumFractionDigits: digits}) : '—';
  const pct = n => finite(n) ? `${n > 0 ? '+' : ''}${number(n)}%` : '—';
  const list = value => Array.isArray(value) ? value : [];
  const LABELS = {confirmed: '확인된 사건', reported: '보도된 해석', hypothesis: '가설', no_evidence: '특정 재료 확인 안 됨', pending: '조사 대기', error: '재료 수집 실패'};
  function dayPath(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('조회 날짜가 올바르지 않습니다.');
    return `/technicals/dates/${date}.json`;
  }
  async function request(path, fetcher = root.fetch.bind(root)) {
    if (!/^\/technicals\/(data\.json|dates\/\d{4}-\d{2}-\d{2}\.json|charts\/\d{4}-\d{2}-\d{2}\/US-[A-Z]+-[A-Z0-9.-]+\.json)$/.test(path)) throw new Error('공개 자료 경로가 올바르지 않습니다.');
    const response = await fetcher(path, {credentials: 'omit', headers: {Accept: 'application/json'}, cache: 'no-cache'});
    if (!response.ok) throw new Error('선택한 날짜의 공개 자료를 불러오지 못했습니다.');
    return response.json();
  }
  function createLoader(fetcher, onDay, onError) {
    let revision = 0, chartRevision = 0;
    return {
      async day(date) {
        const rev = ++revision; ++chartRevision;
        try { const data = await request(dayPath(date), fetcher); if (rev === revision) onDay(data); }
        catch (error) { if (rev === revision) onError(error); }
      },
      async chart(date, row, onChart) {
        const rev = revision, chartRev = ++chartRevision;
        try {
          const data = await request(`/technicals/charts/${date}/${row.id}.json`, fetcher);
          if (data.symbol_id !== row.id || data.as_of_session !== date) throw new Error('차트의 기준일을 확인할 수 없습니다.');
          if (rev === revision && chartRev === chartRevision) onChart(data);
        } catch (error) { if (rev === revision && chartRev === chartRevision) onChart(null, error); }
      },
      cancelChart() { ++chartRevision; }
    };
  }
  function visibleRows(rows, filters = {}) {
    const query = (filters.query || '').trim().toLowerCase();
    return list(rows).filter(row => (!filters.sector || (row.sector || '미분류') === filters.sector) &&
      (!query || `${row.symbol} ${row.name}`.toLowerCase().includes(query))).sort((a, b) =>
      (finite(b.metrics?.volume_ratio) ? b.metrics.volume_ratio : -Infinity) - (finite(a.metrics?.volume_ratio) ? a.metrics.volume_ratio : -Infinity) || a.symbol.localeCompare(b.symbol));
  }
  function dayMessage(day) {
    if (day.status === 'error') return `${day.date} · 탐색 실패 · 신고가가 없다는 뜻이 아닙니다.`;
    return `${day.date} 미국 거래일 · ${day.status === 'partial' ? '부분 탐색 · ' : ''}검증 ${number(day.count, 0)}종목${day.generated_at ? ` · 수집 ${day.generated_at}` : ''}`;
  }
  function element(doc, tag, text, className) {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node;
  }
  function safeURL(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch (_) { return null; } }
  function renderEvidence(target, evidence = {}, doc = root.document) {
    target.replaceChildren(element(doc, 'p', `${LABELS[evidence.status] || LABELS.pending}${evidence.summary ? ` — ${evidence.summary}` : ''}`));
    const items = element(doc, 'ul');
    list(evidence.items).forEach(item => {
      const li = element(doc, 'li'), url = safeURL(item.url), title = element(doc, url ? 'a' : 'strong', item.title || '제목 미확인');
      if (url) {title.setAttribute('href', url); title.setAttribute('target', '_blank'); title.setAttribute('rel', 'noopener noreferrer');}
      li.append(title, element(doc, 'p', `${item.publisher || '출처 미확인'} · ${item.evidence_level === 'headline' ? '제목만 확인' : item.evidence_level === 'primary' ? '1차 자료' : '보도 자료'} · 발표 ${item.published_at || '시각 미확인'}`));
      if (item.supports_claim) li.append(element(doc, 'p', item.supports_claim)); items.append(li);
    }); target.append(items);
  }
  const chartWindow = bars => list(bars).slice(-253);
  function chartGeometry(bars, width = 960, height = 380, prior = null) {
    const left = 12, right = width - 72, top = 16, bottom = height - 90, volumeBottom = height - 24;
    const prices = bars.flatMap(b => ['low', 'high', 'sma20', 'sma50', 'sma200'].map(key => b[key]).filter(n => finite(n) && n > 0));
    if (finite(prior) && prior > 0) prices.push(prior);
    const low = prices.length ? Math.min(...prices) : 0, high = prices.length ? Math.max(...prices) : 1;
    const pad = Math.max((high-low)*.06, high*.015, .01), min = Math.max(0, low-pad), max = high+pad;
    const step = (right-left)/Math.max(1,bars.length), x = index => left + step*(index+.5), y = value => bottom-(value-min)/(max-min)*(bottom-top);
    const volumeMax = Math.max(1,...bars.map(b => finite(b.volume) ? b.volume : 0)), volumeY = v => volumeBottom-v/volumeMax*48;
    const candles = bars.flatMap((bar, index) => ['open','high','low','close'].every(key => finite(bar[key]) && bar[key] > 0) ? [{...bar, index}] : []);
    return {width,height,left,right,top,bottom,volumeBottom,min,max,step,x,y,volumeY,candles};
  }
  function lineSegments(bars, key, geometry) {
    const segments=[]; let segment=[];
    bars.forEach((bar,i) => {if (finite(bar[key]) && bar[key]>0) segment.push([geometry.x(i),geometry.y(bar[key])]); else if(segment.length){segments.push(segment);segment=[];}});
    if(segment.length) segments.push(segment); return segments;
  }
  function renderChart(target, data, readout, doc = root.document) {
    const bars = chartWindow(data.bars); target.replaceChildren();
    if (!bars.length) {target.append(element(doc,'p','차트 이력이 없습니다.')); return;}
    const g = chartGeometry(bars,960,380,data.high52w_previous);
    const svgNode = (tag, attrs = {}, text) => {const node=doc.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));if(text!==undefined)node.textContent=text;return node;};
    const svg = svgNode('svg',{viewBox:'0 0 960 380',role:'img',tabindex:'0','aria-label':`${data.as_of_session} 기준 일봉과 거래량. 좌우 방향키로 날짜별 수치를 확인하세요.`});
    for(let i=0;i<5;i++) {const price=g.min+(g.max-g.min)*i/4, y=g.y(price);svg.append(svgNode('line',{x1:g.left,x2:g.right,y1:y,y2:y,stroke:'currentColor',opacity:'.1'}),svgNode('text',{x:g.right+8,y:y+4,fill:'currentColor','font-size':11},number(price)));}
    if(finite(data.high52w_previous))svg.append(svgNode('line',{x1:g.left,x2:g.right,y1:g.y(data.high52w_previous),y2:g.y(data.high52w_previous),stroke:'#91a6b7','stroke-dasharray':'5 4'}));
    g.candles.forEach(bar=>{const x=g.x(bar.index),color=bar.close>=bar.open?'#26a69a':'#ed6a6a',w=Math.max(1,Math.min(8,g.step*.7));
      svg.append(svgNode('line',{x1:x,x2:x,y1:g.y(bar.high),y2:g.y(bar.low),stroke:color}),svgNode('rect',{x:x-w/2,y:g.y(Math.max(bar.open,bar.close)),width:w,height:Math.max(1,Math.abs(g.y(bar.open)-g.y(bar.close))),fill:color}));
      if(finite(bar.volume))svg.append(svgNode('rect',{x:x-w/2,y:g.volumeY(bar.volume),width:w,height:g.volumeBottom-g.volumeY(bar.volume),fill:color,opacity:'.4'}));});
    [['sma20','#e1b451'],['sma50','#579bda'],['sma200','#af80da']].forEach(([key,color])=>lineSegments(bars,key,g).forEach(points=>svg.append(svgNode('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':1.5}))));
    svg.append(svgNode('text',{x:g.left,y:375,fill:'currentColor','font-size':11},bars[0].date),svgNode('text',{x:g.right,y:375,fill:'currentColor','font-size':11,'text-anchor':'end'},bars.at(-1).date));
    const cursor=svgNode('line',{x1:g.right,x2:g.right,y1:g.top,y2:g.volumeBottom,stroke:'currentColor',opacity:'.3'});svg.append(cursor);
    let selected=bars.length-1;
    function show(index){selected=Math.max(0,Math.min(bars.length-1,index));const b=bars[selected];cursor.setAttribute('x1',g.x(selected));cursor.setAttribute('x2',g.x(selected));readout(`${b.date} · 시가 ${number(b.open)} · 고가 ${number(b.high)} · 저가 ${number(b.low)} · 종가 ${number(b.close)} · 거래량 ${number(b.volume,0)}`);}
    svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?bars.length-1:selected+(event.key==='ArrowLeft'?-1:1));}});
    svg.addEventListener('pointermove',event=>{const rect=svg.getBoundingClientRect();show(Math.floor(((event.clientX-rect.left)/rect.width*g.width-g.left)/g.step));});
    target.append(svg);show(selected);
  }
  function initialize(doc) {
    if(!doc.getElementById('public-radar'))return;
    const $=id=>doc.getElementById(`pr-${id}`), el=(tag,text,cls)=>element(doc,tag,text,cls);
    let current=null;
    const notice=message=>{$('notice').textContent=message;};
    const loader=createLoader(root.fetch.bind(root),day=>{current=day;renderDay();},()=>{current=null;$('rows').replaceChildren();$('count').textContent='';$('sectors').replaceChildren();$('export').hidden=true;notice('선택한 날짜의 공개 자료를 불러오지 못했습니다. 다른 날짜를 선택하거나 다시 시도하세요.');});
    function renderRows(){
      const rows=visibleRows(current?.rows,{sector:$('sector').value,query:$('query').value});$('rows').replaceChildren();
      rows.forEach(row=>{const tr=el('tr'),name=el('td'),select=el('button',row.symbol,'pr-symbol');select.type='button';select.setAttribute('aria-label',`${row.name} 차트와 근거 보기`);select.addEventListener('click',()=>selectRow(row));name.append(select,el('strong',row.name),el('span',row.business_summary||'기업 설명 미확인','pr-sub'));
        const price=el('td',number(row.metrics.close));price.append(el('span',pct(row.metrics.change_pct),'pr-sub'));
        const signal=el('td','', 'pr-signal');signal.append(el('span',row.tags.includes('breakout_close')?'종가 돌파':'장중 경신 후 밀림','pr-tag'),el('span',`이전 고가 ${number(row.metrics.high52w_previous)} · ${pct(row.metrics.distance_high_pct)}`,'pr-sub'));
        const volume=el('td',`${number(row.metrics.volume_ratio)}배`);volume.append(el('span',`RSI ${number(row.metrics.rsi14,1)}`,'pr-sub'));
        const evidence=el('td',LABELS[row.evidence.status]);evidence.append(el('span',row.evidence.summary,'pr-sub'));
        tr.append(name,el('td',row.sector||'미분류'),price,signal,volume,evidence);$('rows').append(tr);});
      $('count').textContent=`표시 ${rows.length}종목`; $('empty').hidden=rows.length>0;
      $('empty').textContent=current?.status==='error'?'탐색에 실패한 날짜입니다. 신고가가 없다는 뜻이 아닙니다.':current?.status==='partial'?'부분 탐색 결과에 조건을 만족하는 종목이 없습니다.':'조건에 맞는 종목이 없습니다.';
    }
    function renderDay(){
      notice(dayMessage(current));$('sector').replaceChildren(el('option','전체 섹터'));$('sector').firstChild.value='';$('sectors').replaceChildren();
      current.sectors.forEach(entry=>{const option=el('option',`${entry.sector} (${entry.count})`);option.value=entry.sector;$('sector').append(option);const button=el('button',`${entry.sector} ${entry.count}`,'pr-sector-chip');button.type='button';button.addEventListener('click',()=>{$('sector').value=entry.sector;renderRows();});$('sectors').append(button);});
      $('export').href=`/technicals/exports/${current.date}.xlsx`;$('export').hidden=false;renderRows();
    }
    function selectRow(row){
      $('detail').hidden=false;$('detail-title').textContent=`${row.symbol} · ${row.name}`;$('detail-meta').textContent=`${current.date} · ${row.exchange} · ${row.sector||'미분류'}${row.industry?` · ${row.industry}`:''}`;
      $('description').textContent=row.business_summary||'기업 설명 미확인';$('metrics').textContent=['sma20','sma50','sma200'].map(key=>`${key.slice(3)}일선 ${number(row.metrics[key])}`).join(' · ');renderEvidence($('evidence'),row.evidence,doc);$('readout').textContent='';$('chart').replaceChildren(el('p',row.chart_url?'차트를 불러오고 있습니다.':'이 기준일의 차트가 공개되지 않았습니다.'));
      loader.cancelChart();$('chart').setAttribute('aria-busy',String(Boolean(row.chart_url)));
      if(row.chart_url)loader.chart(current.date,row,data=>{$('chart').setAttribute('aria-busy','false');if(data)renderChart($('chart'),data,text=>$('readout').textContent=text,doc);else $('chart').replaceChildren(el('p','이 기준일의 차트를 불러오지 못했습니다.'));});
      $('detail').scrollIntoView({behavior:'smooth',block:'start'});
    }
    function loadDate(){loader.cancelChart();$('detail').hidden=true;current=null;$('rows').replaceChildren();$('count').textContent='';$('sectors').replaceChildren();$('empty').hidden=true;$('export').hidden=true;notice('선택한 날짜의 자료를 불러오고 있습니다.');loader.day($('date').value);}
    $('date').addEventListener('change',loadDate);$('sector').addEventListener('change',renderRows);$('query').addEventListener('input',renderRows);$('filters').addEventListener('submit',event=>event.preventDefault());$('close').addEventListener('click',()=>{loader.cancelChart();$('detail').hidden=true;});
    request('/technicals/data.json').then(data=>{if(!data.dates?.length){notice('아직 공개된 신고가 관측 자료가 없습니다.');return;}data.dates.forEach(day=>{const option=el('option',`${day.date} · ${day.status==='error'?'탐색 실패':`${day.count}종목`}`);option.value=day.date;$('date').append(option);});$('date').value=data.latest_date;loadDate();}).catch(()=>notice('공개 자료를 불러오지 못했습니다. 잠시 후 다시 시도하세요.'));
  }
  const api={number,visibleRows,dayMessage,chartWindow,chartGeometry,lineSegments,renderEvidence,renderChart,request,dayPath,createLoader,initialize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>initialize(root.document));else initialize(root.document);}
})(typeof window==='undefined'?globalThis:window);
