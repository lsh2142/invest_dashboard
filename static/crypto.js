(() => {
  'use strict';
  const root = document.getElementById('crypto-dashboard');
  if (!root) return;
  const $ = id => document.getElementById('crypto-' + id);
  const colors = { bitcoin: '#eab968', ethereum: '#a7b6ff', 'canton-network': '#71cfbf' };
  let data = null, currency = 'USD', days = 30, group = 'ethereum', loading = false;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = (value, digits = 2) => finite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '—';
  const signed = value => finite(value) ? (value > 0 ? '+' : '') + number(value) + '%' : '—';
  const time = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '미확인';
  function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
  function link(label, url) { const el = node('a', label); try { const parsed = new URL(url); if (['https:', 'http:'].includes(parsed.protocol)) { el.href = parsed.href; el.target = '_blank'; el.rel = 'noopener noreferrer'; } } catch (_) {} return el; }
  const source = id => (data.sources || []).find(s => s.id === id);
  function status(s) { if (!s) return 'unavailable'; if (s.status !== 'ok') return s.status === 'stale' ? 'stale' : 'unavailable'; const age = (Date.now() - Date.parse(s.observed_at)) / 1000; if (!s.observed_at || !Number.isFinite(age)) return 'unavailable'; return finite(s.max_age_seconds) && age > s.max_age_seconds ? 'stale' : 'ok'; }
  function metricSource(metric) { const s=source(metric.source_id); return {...s, status:finite(metric.value)?(s?.status||'unavailable'):'unavailable', observed_at:metric.observed_at, max_age_seconds:metric.max_age_seconds ?? s?.max_age_seconds}; }
  const badge = s => { const state = status(s); return node('span', { ok: '정상', stale: '갱신 지연', unavailable: '자료 미확인' }[state], 'crypto-badge ' + state); };
  function compact(value, unit = 'USD') { if (!finite(value)) return '—'; const abs = Math.abs(value); const prefix = unit === 'USD' ? '$' : ''; return prefix + (abs >= 1e12 ? number(value / 1e12) + '조' : abs >= 1e8 ? number(value / 1e8) + '억' : abs >= 1e4 ? number(value / 1e4) + '만' : number(value)); }
  function notice(text) { $('notice').textContent = text; $('notice').hidden = !text; }
  function renderCoins() {
    const container = $('coins'); container.replaceChildren(); container.setAttribute('aria-busy', 'false');
    for (const coin of data.coins || []) {
      const card = node('article', undefined, 'crypto-coin'); card.style.setProperty('--coin', colors[coin.id] || '#a7b6ff');
      const heading = node('div', undefined, 'crypto-coin-title'), title = node('div'); title.append(node('span', coin.symbol, 'crypto-symbol'), node('span', coin.name, 'crypto-coin-name')); heading.append(title, badge(source(currency === 'KRW' ? 'markets_krw' : 'markets')));
      const price = currency === 'KRW' ? coin.price_krw : coin.price_usd;
      const priceText = finite(price) ? (currency === 'KRW' ? '₩' : '$') + number(price, currency === 'KRW' ? 0 : price < 1 ? 5 : 2) : '—';
      const returns = node('div', undefined, 'crypto-returns'); for (const [label, value] of [['24시간', coin.change_24h], ['7일', coin.change_7d], ['30일', coin.change_30d]]) { const cell = node('div'); cell.append(node('span', label, 'crypto-label'), node('span', signed(value), finite(value) ? value >= 0 ? 'crypto-up' : 'crypto-down' : '')); returns.append(cell); }
      const footer = node('div', undefined, 'crypto-coin-footer'); footer.append(node('span', '시총 ' + compact(coin.market_cap_usd)), node('span', '24h 거래량 ' + compact(coin.volume_24h_usd)));
      card.append(heading, node('div', priceText, 'crypto-price'), returns, footer, node('div', '시세 ' + time(currency === 'KRW' ? coin.krw_observed_at : coin.observed_at) + ' KST · 등락·시총·거래량 USD 기준' + (status(source('markets')) !== 'ok' ? ' · USD 부가지표 갱신 지연' : ''), 'crypto-coin-time')); container.append(card);
    }
    if (!container.children.length) container.append(node('p', '시세를 아직 수집하지 못했습니다. 데이터 갱신을 눌러 다시 확인하세요.', 'crypto-empty'));
  }
  const cleanHistory = history => (Array.isArray(history) ? history : []).filter(p => Array.isArray(p) && finite(p[0]) && finite(p[1])).sort((a,b) => a[0]-b[0]);
  function svgNode(tag, attrs = {}, text) { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key,value] of Object.entries(attrs)) el.setAttribute(key, String(value)); if (text !== undefined) el.textContent = text; return el; }
  function chart(series, mini = false) {
    const points = series.flatMap(s => s.points); if (points.length < 2) return null;
    const width = mini ? 300 : 1000, height = mini ? 40 : 280, left = mini ? 0 : 55, right = mini ? 0 : 20, top = mini ? 3 : 18, bottom = mini ? 3 : 30;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]); const minX = Math.min(...xs), maxX = Math.max(...xs); let minY = Math.min(...ys), maxY = Math.max(...ys); const pad = (maxY - minY) * .12 || Math.abs(maxY) * .02 || 1; minY -= pad; maxY += pad;
    const x = n => left + (n-minX)/(maxX-minX || 1)*(width-left-right), y = n => top+(maxY-n)/(maxY-minY)*(height-top-bottom);
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role:'img', 'aria-label': mini ? series[0].label + ' 관측 추이' : `${days}일 달러 가격 비교. 공통 기준일 100. ` + series.map(s => s.label + ' 마지막 지수 ' + number(s.points.at(-1)[1])).join(', '), preserveAspectRatio:'xMidYMid meet' });
    if (!mini) { for(let i=0;i<5;i++) { const v = minY + (maxY-minY)*i/4; svg.append(svgNode('line', { x1:left,y1:y(v),x2:width-right,y2:y(v) }), svgNode('text',{x:left-9,y:y(v)+4,'text-anchor':'end'},number(v,1))); } for (const stamp of [minX,maxX]) svg.append(svgNode('text',{x:x(stamp),y:height-5,'text-anchor':stamp === minX ? 'start':'end'},new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'short',day:'numeric'}).format(new Date(stamp)))); }
    for (const s of series) svg.append(svgNode('polyline', {points:s.points.map(p=>`${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`).join(' '), fill:'none', stroke:s.color, 'stroke-width':mini ? 1.7 : 2.5, 'stroke-linejoin':'round', 'vector-effect':'non-scaling-stroke'}));
    return svg;
  }
  function renderChart() {
    const container = $('chart'), legend = $('legend'); container.replaceChildren(); legend.replaceChildren(); $('chart-note').textContent='공통 기준일 가격을 100으로 환산한 달러 가격 비교';
    const all = (data.coins || []).map(c => ({...c, points: cleanHistory(c.history).filter(p=>p[1]>0)}));
    const available = all.filter(c=>c.points.length>=2);
    if (available.length < 2) { container.append(node('div', '같은 기간의 가격 이력이 쌓이면 비교 차트가 표시됩니다.', 'crypto-empty')); return; }
    const last = Math.min(...available.map(c=>c.points.at(-1)[0])); const cutoff = last-days*86400000;
    const sets = available.map(c=>new Set(c.points.map(p=>p[0])));
    const common = available[0].points.map(p=>p[0]).filter(t=>t>=cutoff && t<=last && sets.every(s=>s.has(t)));
    if(common.length < 2) { container.append(node('div', '공통 기준일의 가격 이력이 부족합니다. 다른 기간을 선택해 주세요.', 'crypto-empty')); return; }
    const commonSet = new Set(common), first = common[0];
    const series = available.map(c=>{ const base = c.points.find(p=>p[0]===first)[1]; return {id:c.id,label:c.symbol,color:colors[c.id],points:c.points.filter(p=>commonSet.has(p[0])).map(p=>[p[0],p[1]/base*100])}; });
    $('chart-note').textContent = `공통 기준일 ${time(new Date(first).toISOString())} ~ ${time(new Date(common.at(-1)).toISOString())} KST · 시작 = 100 · 달러 가격 · 실제 ${Math.round((common.at(-1)-first)/86400000)}일 구간`;
    for(const s of series) { const item = node('span', `${s.label} ${signed(s.points.at(-1)[1]-100)}`); item.style.setProperty('--coin',s.color); item.append(document.createTextNode(' '),badge({...source('history_'+s.id),observed_at:new Date(s.points.at(-1)[0]).toISOString()})); legend.append(item); }
    for(const c of all.filter(c=>!available.includes(c))) legend.append(node('span',c.symbol+' 이력 미확인'));
    container.append(chart(series));
  }
  function metricValue(metric) { if(!finite(metric.value)) return ['—','']; if(metric.unit==='USD') return [compact(metric.value),'']; if(metric.unit==='%') return [number(metric.value),'%']; return [number(metric.value, metric.unit==='ratio'?5:2), {count:'개',days:'일',ratio:'배'}[metric.unit] || metric.unit || '']; }
  function renderMetrics() {
    const container = $('metrics'); container.replaceChildren(); container.setAttribute('aria-labelledby','crypto-tab-'+group);
    $('reading').textContent = {ethereum:'스테이킹 증가, ETH 순공급, L2의 L1 지불 비용을 함께 보세요. 활동 증가가 소각과 수수료로 이어지는지 확인합니다.',bitcoin:'시장 점유율과 기관 수급, 레버리지 지표를 함께 보세요. 미결제약정 증가는 방향을 단독으로 설명하지 않습니다.',canton:'기관 제휴와 실제 토큰 수요를 구분하세요. CC 발행·소각과 네트워크 사용량의 연결을 확인합니다.'}[group];
    const metrics = (data.metrics || []).filter(m=>m.group===group || (group==='bitcoin' && m.group==='market'));
    for (const metric of metrics) { const card = node('article',undefined,'crypto-metric'), value=node('div',undefined,'crypto-metric-value'), [amount,unit]=metricValue(metric); value.append(document.createTextNode(amount)); if(unit)value.append(node('small',unit)); card.append(node('h3',metric.label),value);
      card.append(node('div',finite(metric.change_30d)?'30일 변화 '+(metric.change_30d>0?'+':'')+number(metric.change_30d)+(metric.unit==='%'?'%p':' '+(metric.unit||'')):'30일 변화 —','crypto-change'));
      const history=cleanHistory(metric.history); if(history.length>=2){const holder=node('div',undefined,'crypto-spark');holder.append(chart([{label:metric.label,color:colors[group==='canton'?'canton-network':group],points:history}],true));card.append(holder);}
      card.append(node('p',metric.note || '원자료 기준으로 확인합니다.','crypto-metric-note')); const meta=node('div',undefined,'crypto-metric-meta');meta.append(badge(metricSource(metric)),node('span',time(metric.observed_at)+' KST'));const s=source(metric.source_id);if(s)meta.append(link(s.name,s.url));card.append(meta);container.append(card);
    }
    if(!metrics.length)container.append(node('p','이 코인의 지표가 아직 준비되지 않았습니다. 아래 원자료에서 확인할 수 있습니다.','crypto-empty'));
    const links=$('links');links.replaceChildren();for(const item of (data.links||[]).filter(l=>l.group===group||l.group==='market')){const block=node('div');block.append(link(item.label,item.url));if(item.note)block.append(node('span',item.note,'crypto-link-note'));links.append(block);}
  }
  function renderSources() { const body=$('sources');body.replaceChildren();for(const s of data.sources||[]){const row=node('tr'),name=node('td'),state=node('td');name.append(link(s.name,s.url));state.append(badge(s));if(s.error)state.append(node('span',s.error,'crypto-source-error'));row.append(name,state,node('td',time(s.observed_at)),node('td',time(s.fetched_at)));body.append(row);} }
  function render() {renderCoins();renderChart();renderMetrics();renderSources(); const count=(data.sources||[]).filter(s=>status(s)!=='ok').length;$('updated').textContent='최근 수집 '+time(data.as_of)+' KST'+(count?` · ${count}개 출처 지연 또는 미확인`:'')+' · 자동 갱신 '+Math.round((data.refresh_interval_seconds||900)/60)+'분';}
  async function load() {if(loading)return;loading=true;try{const response=await fetch('/api/crypto',{headers:{Accept:'application/json'},cache:'no-store'});if(!response.ok)throw new Error('http');const next=await response.json();if(!Array.isArray(next.coins)||!Array.isArray(next.metrics)||!Array.isArray(next.sources))throw new Error('shape');data=next;render();notice('');}catch(_){notice(data?'최신 데이터를 불러오지 못했습니다. 이전 수집 값을 표시하며 잠시 후 다시 확인합니다.':'데이터를 불러오지 못했습니다. 데이터 갱신을 눌러 다시 시도해 주세요.');if(data)render();$('coins').setAttribute('aria-busy','false');}finally{loading=false;}}
  root.querySelectorAll('[data-currency]').forEach(button=>button.addEventListener('click',()=>{currency=button.dataset.currency;root.querySelectorAll('[data-currency]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(data)renderCoins();}));
  root.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>{days=Number(button.dataset.days);root.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(data)renderChart();}));
  const tabs=[...root.querySelectorAll('[data-group]')];tabs.forEach((button,index)=>{button.addEventListener('click',()=>{group=button.dataset.group;tabs.forEach(b=>{b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;});if(data)renderMetrics();});button.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();tabs[next].focus();tabs[next].click();}});});
  $('refresh').addEventListener('click',async()=>{const button=$('refresh');button.disabled=true;button.textContent='갱신 요청 중';try{const response=await fetch('/api/crypto/refresh',{method:'POST',headers:{Accept:'application/json'}});if(!response.ok)throw new Error('http');const result=await response.json();notice(result.status==='recent'?'최근 수집 자료가 있습니다. 자동 갱신 주기에 다시 확인합니다.':result.status==='running'?'이미 자료를 수집하고 있습니다. 새 값이 준비되면 자동으로 표시합니다.':'자료를 수집하고 있습니다. 새 값이 준비되면 자동으로 표시합니다.');setTimeout(load,5000);}catch(_){notice('갱신을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.');}finally{button.disabled=false;button.textContent='데이터 갱신';}});
  load();setInterval(load,60000);
})();
