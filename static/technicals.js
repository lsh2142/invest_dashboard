/* Private data is fetched only from authenticated endpoints. No embedded watchlist. */
(function (root) {
  'use strict';
  const TAGS = {
    breakout_close: '종가 돌파', breakout_intraday: '장중 경신 후 밀림', high_retest: '고점 재접촉',
    near_high: '신고가 근접', uptrend: '상승 추세', near_sma20: '20일선 부근',
    below_sma50_new: '50일선 하향 이탈', below_sma200: '200일선 하회', volume_surge: '거래량 확대',
    rsi_overbought: '단기 과열 참고', mixed: '혼조', insufficient: '이력 부족'
  };
  const EVIDENCE = { confirmed: '확인된 재료', reported: '보도된 해석', hypothesis: '가설', no_evidence: '특정 재료 확인 안 됨', pending: '조사 대기', error: '재료 수집 실패' };
  const STATUS = { ok: '정상', stale: '기준일 지연', error: '수집 실패', insufficient: '이력 부족', pending: '분석 대기' };
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const list = value => Array.isArray(value) ? value : [];
  const number = (value, digits = 2) => finite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '—';
  const pct = value => finite(value) ? `${value > 0 ? '+' : ''}${number(value)}%` : '—';
  const ratio = value => finite(value) ? `${number(value)}배` : '—';
  const safeURL = value => {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch (_) { return null; }
  };
  const companyDescription = row => row.business_summary || '기업 설명 미확인';
  const snapshotPath = date => '/api/technicals' + (date ? `?date=${encodeURIComponent(date)}` : '');
  const exportPath = date => '/api/technicals/export.xlsx' + (date ? `?date=${encodeURIComponent(date)}` : '');
  function sectorCounts(rows) {
    const counts = new Map();
    list(rows).filter(r => r.market === 'US' && r.status === 'ok' && list(r.origins).includes('discovery') && list(r.tags).some(tag => ['breakout_close', 'breakout_intraday'].includes(tag))).forEach(r => {
      const sector = r.sector || '섹터 미확인'; counts.set(sector, (counts.get(sector) || 0) + 1);
    });
    return [...counts].map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
  }
  function chartWindow(bars, range) { return list(bars).slice(range === 'all' ? 0 : -253); }
  function validCandle(bar) {
    return ['open', 'high', 'low', 'close'].every(key => finite(bar[key]) && bar[key] > 0) &&
      bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close);
  }
  function chartGeometry(bars, width = 1000, height = 430, priorHigh = null) {
    const left = 14, right = width - 75, top = 18, priceBottom = height - 106, volumeTop = height - 82, volumeBottom = height - 30;
    const prices = list(bars).flatMap(b => ['low', 'high', 'sma20', 'sma50', 'sma200'].map(k => b[k]).filter(v => finite(v) && v > 0));
    if (finite(priorHigh) && priorHigh > 0) prices.push(priorHigh);
    const min = prices.length ? Math.min(...prices) : 0, max = prices.length ? Math.max(...prices) : 1;
    const pad = Math.max((max - min) * 0.065, Math.abs(max) * 0.015, 0.01);
    const priceMin = Math.max(0, min - pad), priceMax = max + pad;
    const step = (right - left) / Math.max(1, bars.length), x = index => left + step * (index + .5);
    const y = value => priceBottom - (value - priceMin) / (priceMax - priceMin) * (priceBottom - top);
    const maxVolume = Math.max(1, ...bars.map(b => finite(b.volume) && b.volume >= 0 ? b.volume : 0));
    const volumeY = value => volumeBottom - value / maxVolume * (volumeBottom - volumeTop);
    const candles = bars.flatMap((b, index) => validCandle(b) ? [{ ...b, index, x: x(index), highY: y(b.high), lowY: y(b.low), bodyY: y(Math.max(b.open, b.close)), bodyHeight: Math.max(1, Math.abs(y(b.open) - y(b.close))), up: b.close >= b.open }] : []);
    return { left, right, top, priceBottom, volumeTop, volumeBottom, priceMin, priceMax, x, y, volumeY, candles, step, width, height };
  }
  function lineSegments(bars, key, geometry) {
    const segments = []; let segment = [];
    bars.forEach((bar, index) => {
      if (finite(bar[key]) && bar[key] > 0) segment.push([geometry.x(index), geometry.y(bar[key])]);
      else if (segment.length) { segments.push(segment); segment = []; }
    });
    if (segment.length) segments.push(segment);
    return segments;
  }
  function newBreakout(row) {
    return row.status === 'ok' && row.observation_status !== 'resumed' && list(row.signal_changes).some(t => ['+breakout_close', '+breakout_intraday', 'breakout_close', 'breakout_intraday'].includes(t));
  }
  function visibleRows(rows, followed, view, filters = {}) {
    const ids = new Set(list(followed).map(r => r.id));
    const byId = new Map(list(rows).map(r => [r.id, r]));
    const candidates = view === 'watchlist'
      ? list(followed).map(r => byId.get(r.id) || { ...r, status: 'pending', metrics: {}, tags: [], signal_changes: [], evidence: { status: 'pending', items: [] } })
      : list(rows).filter(r => r.market === 'US' && list(r.origins).includes('discovery'));
    const query = (filters.query || '').trim().toLowerCase();
    const filtered = candidates.filter(r => (!query || `${r.symbol} ${r.name || ''}`.toLowerCase().includes(query)) &&
      (!filters.market || r.market === filters.market) && (!filters.sector || (r.sector || '섹터 미확인') === filters.sector) &&
      (!filters.tag || list(r.tags).includes(filters.tag) || r.status === filters.tag) &&
      (!filters.volume || (finite(r.metrics?.volume_ratio) && r.metrics.volume_ratio >= Number(filters.volume))));
    const desc = (a, b) => (finite(b) ? b : -Infinity) - (finite(a) ? a : -Infinity);
    return filtered.sort((a, b) => {
      const am = a.metrics || {}, bm = b.metrics || {};
      if (filters.sort === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (filters.sort === 'volume') return desc(am.volume_ratio, bm.volume_ratio) || a.symbol.localeCompare(b.symbol);
      if (filters.sort === 'change') return desc(am.change_pct, bm.change_pct) || a.symbol.localeCompare(b.symbol);
      if (filters.sort === 'distance') return (finite(am.distance_high_pct) ? Math.abs(am.distance_high_pct) : Infinity) - (finite(bm.distance_high_pct) ? Math.abs(bm.distance_high_pct) : Infinity) || a.symbol.localeCompare(b.symbol);
      return Number(ids.has(b.id)) - Number(ids.has(a.id)) || Number(newBreakout(b)) - Number(newBreakout(a)) || desc(am.volume_ratio, bm.volume_ratio) || a.symbol.localeCompare(b.symbol);
    });
  }
  function emptyMessage(view, followedCount) {
    return view === 'watchlist' && followedCount === 0
      ? { title: '계속 볼 종목을 골라보세요', body: '기존 목록의 후보에서 선택하거나 한국·미국 종목을 직접 등록하세요. 팔로우는 직접 추가한 종목만 표시합니다.' }
      : { title: '표시할 종목이 없습니다', body: '필터 조건을 줄이거나 데이터 기준일과 수집 상태를 확인하세요.' };
  }
  function resultSummary(view, rows) {
    if (view === 'watchlist') return `내 팔로우 ${rows.length}종목`;
    const verified = rows.filter(row => row.status === 'ok' && list(row.tags).some(tag => ['breakout_close', 'breakout_intraday'].includes(tag))).length;
    return `표시 ${rows.length}종목 · 신고가 검증 ${verified} · 미확인 ${rows.length - verified}`;
  }
  function marketSummary(market, state) {
    if (!state) return { text: `${market === 'US' ? '미국' : '한국'} 기준일 미확인`, tone: 'warning', detail: '아직 가격 데이터가 없습니다.' };
    if (state.status === 'empty' && state.attempted === 0) return { text: '분석 대상 없음', tone: '', detail: `기대 거래일 ${state.expected_session || '미확인'} · 분석할 종목이 없습니다.` };
    const delayed = state.expected_session && state.as_of_session !== state.expected_session;
    const labels = { ok: '정상 수집', partial: '부분 수집', error: '갱신 실패', empty: '분석 대상 없음' };
    const status = state.status === 'error' ? labels.error : delayed ? '기준일 지연' : (labels[state.status] || '상태 미확인');
    return { text: `${state.as_of_session || '기준일 미확인'} · ${status}`, tone: state.status === 'error' ? 'error' : delayed || state.status === 'partial' ? 'warning' : state.status === 'ok' ? 'ok' : '', detail: `기대 거래일 ${state.expected_session || '미확인'} · 성공 ${number(state.success, 0)} / 누락 ${number(state.failed, 0)}` };
  }
  function discoverySummary(discovery) {
    if (!discovery) return '미국 탐색 대기';
    const provider = discovery.provider || '공급자 미확인';
    if (discovery.status === 'error') return `${provider} 탐색 실패 · 0건으로 해석하지 않습니다`;
    if (discovery.status === 'partial') return `${provider} 부분 탐색 · 수신 ${number(discovery.received_count, 0)} / 예상 ${number(discovery.expected_count, 0)}건`;
    if (discovery.status === 'empty') return `${provider} 탐색 완료 · 0건`;
    return `${provider} 수신 ${number(discovery.received_count, 0)} · 검증 ${number(discovery.verified_count, 0)} · 제외 ${number(discovery.excluded_count, 0)}건`;
  }
  function validateSymbol(value) {
    const exchanges = { US: ['NASDAQ', 'NYSE', 'AMEX', 'US'], KR: ['KOSPI', 'KOSDAQ'] };
    if (!exchanges[value.market]?.includes(value.exchange)) return '시장에 맞는 거래소를 선택하세요.';
    if (value.market === 'KR' && !/^\d{6}$/.test(value.symbol)) return '한국 종목코드는 앞자리 0을 포함한 6자리로 입력하세요.';
    if (value.market === 'US' && !/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/.test(value.symbol)) return '미국 티커는 영문·숫자·점·하이픈으로 입력하세요.';
    return '';
  }
  function refreshOutcome(initialRun, currentRun, status, attempts) {
    if (status === 'error') return { done: true, message: '갱신에 실패했습니다. 기존 결과를 표시합니다. 시장별 기준일과 수집 상태를 확인하세요.' };
    if (currentRun !== initialRun) return { done: true, message: '새 결과를 불러왔습니다. 시장별 기준일과 수집 상태를 확인하세요.' };
    if (status === 'completed') return { done: true, message: '갱신이 완료되었습니다. 선택한 날짜의 결과를 표시합니다. 최신 결과도 확인할 수 있습니다.' };
    if (attempts >= 60) return { done: true, message: '갱신 완료를 아직 확인하지 못했습니다. 기존 결과를 표시합니다.' };
    return { done: false, message: '' };
  }
  async function apiRequest(path, options = {}, base = '') {
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (method !== 'GET') { headers['X-Radar-Request'] = '1'; headers['Content-Type'] = 'application/json'; }
    const response = await fetch(base + path, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
    let body;
    try { body = await response.json(); } catch (_) { throw new Error('응답을 읽지 못했습니다. 로그인 상태를 확인하고 다시 시도하세요.'); }
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? '접근 권한 또는 로그인 상태를 확인하세요.' : typeof body.detail === 'string' ? body.detail : '요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.');
      error.status = response.status; throw error;
    }
    return body;
  }
  async function fetchChart(id, runId, base = '') {
    if (!runId) throw new Error('차트 기준 버전이 없습니다. 목록을 다시 불러오세요.');
    try { return await apiRequest(`/api/technicals/chart/${encodeURIComponent(id)}?run_id=${encodeURIComponent(runId)}`, {}, base); }
    catch (error) { if (error.status === 404) throw new Error('이 기준일의 차트를 찾지 못했습니다. 목록을 다시 불러온 뒤 선택하세요.'); throw error; }
  }
  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderEvidence(container, evidence = {}, doc = root.document) {
    container.replaceChildren();
    container.append(element(doc, 'p', 'radar-evidence-intro', `${EVIDENCE[evidence.status] || EVIDENCE.pending}${evidence.summary ? ` — ${evidence.summary}` : ''}`));
    const ul = element(doc, 'ul', 'radar-evidence-list');
    list(evidence.items).forEach(item => {
      const li = element(doc, 'li'), url = safeURL(item.url);
      const title = element(doc, url ? 'a' : 'strong', '', item.title || '제목 미확인');
      if (url) { title.setAttribute('href', url); title.setAttribute('target', '_blank'); title.setAttribute('rel', 'noopener noreferrer'); }
      li.append(title);
      li.append(element(doc, 'p', '', `${item.publisher || '출처 미확인'} · ${item.evidence_level === 'headline' ? '제목만 확인' : item.evidence_level === 'primary' ? '1차 자료' : '보도 자료'}`));
      if (item.supports_claim) li.append(element(doc, 'p', '', item.supports_claim));
      li.append(element(doc, 'p', 'radar-evidence-time', `발표 ${item.published_at || '시각 미확인'} · 사건 ${item.event_at || '일자 미확인'} · 조회 ${item.retrieved_at || '시각 미확인'}`));
      ul.append(li);
    });
    container.append(ul);
    if (evidence.status === 'error') container.append(element(doc, 'p', 'radar-muted', '재료 수집이 완료되지 않았습니다. 다음 갱신에서 다시 확인합니다.'));
  }

  function initialize(doc) {
    const app = doc.getElementById('technical-radar'); if (!app) return;
    const $ = id => doc.getElementById(`radar-${id}`), el = (tag, cls, text) => element(doc, tag, cls, text);
    const state = { snapshot: {}, watchlist: { items: [], candidates: [] }, view: 'discovery', filters: {}, selected: null, chart: null, range: '1y', date: '', request: 0, chartRequest: 0, refreshing: false, poll: null };
    const followed = id => list(state.watchlist.items).some(r => r.id === id);
    const notice = (message, manager = false) => { const node = $(manager ? 'manage-notice' : 'notice'); node.textContent = message; node.hidden = !message; };
    const safeError = error => error?.message || '요청을 처리하지 못했습니다.';
    const filters = () => Object.fromEntries(new FormData($('filters')));
    function followButton(row, small = true) {
      const button = el('button', `radar-button${small ? ' radar-follow' : ''}`, followed(row.id) ? '팔로우 해제' : '팔로우 추가');
      button.type = 'button'; button.setAttribute('aria-pressed', String(followed(row.id))); button.setAttribute('aria-label', `${row.name || row.symbol} ${followed(row.id) ? '팔로우 해제' : '팔로우 추가'}`);
      button.addEventListener('click', () => mutateFollow(row, button)); return button;
    }
    function subline(container, text, cls = '') { container.append(el('span', `radar-subline ${cls}`, text)); }
    function tags(container, row) {
      if (row.status !== 'ok') container.append(el('span', 'radar-tag is-warning', STATUS[row.status] || '상태 미확인'));
      list(row.tags).forEach(tag => container.append(el('span', `radar-tag ${tag.startsWith('breakout') ? 'is-breakout' : tag.startsWith('below') || tag === 'rsi_overbought' ? 'is-warning' : ''}`, TAGS[tag] || tag)));
      const changes = list(row.signal_changes).map(tag => `${TAGS[tag.replace(/^[+-]/, '')] || tag.replace(/^[+-]/, '')} ${tag.startsWith('-') ? '해소' : '새 발생'}`);
      if (changes.length) subline(container, changes.join(' · '));
      if (row.observation_status === 'resumed') subline(container, '관측 재개 · 첫 돌파 단정 불가');
    }
    function renderRows() {
      state.filters = filters();
      const rows = visibleRows(state.snapshot.symbols, state.watchlist.items, state.view, state.filters);
      $('rows').replaceChildren();
      rows.forEach(row => {
        const tr = el('tr', row.id === state.selected?.id ? 'is-selected' : ''); const m = row.metrics || {};
        const name = el('td'); const select = el('button', 'radar-symbol', row.symbol || row.id); select.type = 'button';
        select.setAttribute('aria-label', `${row.name || row.symbol} 차트와 근거 보기`); select.addEventListener('click', () => selectRow(row));
        name.append(select); subline(name, row.name || '기업명 미확인'); subline(name, `${row.market || ''} / ${row.exchange || ''} · ${row.sector || '섹터 미확인'}${row.industry ? ` / ${row.industry}` : ''}`);
        const description = el('span', 'radar-subline', companyDescription(row)); description.title = companyDescription(row); name.append(description);
        const price = el('td', '', number(m.close)); subline(price, pct(m.change_pct), m.change_pct > 0 ? 'radar-positive' : m.change_pct < 0 ? 'radar-negative' : ''); subline(price, row.as_of_session || '기준일 미확인');
        const signals = el('td'); tags(signals, row);
        const high = el('td', '', number(m.high52w_previous)); subline(high, pct(m.distance_high_pct));
        const volume = el('td', '', ratio(m.volume_ratio)); subline(volume, `RSI ${number(m.rsi14, 1)}`);
        const averages = el('td'); ['sma20', 'sma50', 'sma200'].forEach(key => subline(averages, `${key.slice(3)}일 ${number(m[key])}${finite(m[key]) && finite(m.close) ? (m.close >= m[key] ? ' ↑' : ' ↓') : ''}`));
        const evidence = el('td'); evidence.append(el('span', 'radar-muted', EVIDENCE[row.evidence?.status] || EVIDENCE.pending)); evidence.append(el('p', 'radar-evidence-summary', row.evidence?.summary || ''));
        const action = el('td'); action.append(followButton(row)); tr.append(name, price, signals, high, volume, averages, evidence, action); $('rows').append(tr);
      });
      $('result-count').textContent = resultSummary(state.view, rows);
      $('empty').hidden = rows.length > 0;
      const empty = emptyMessage(state.view, list(state.watchlist.items).length);
      if (state.view === 'discovery' && ['error', 'partial'].includes(state.snapshot.discovery?.status)) { empty.title = '탐색이 완료되지 않았습니다'; empty.body = '조회된 종목이 없더라도 신고가 0건을 뜻하지 않습니다. 수집 상태를 확인하고 데이터 갱신을 실행하세요.'; }
      if (state.snapshot.available === false && state.view === 'discovery') { empty.title = '첫 분석을 기다리고 있습니다'; empty.body = '데이터 갱신을 누르면 미국 신고가를 탐색합니다. 팔로우할 종목은 먼저 추가할 수 있습니다.'; }
      $('empty-title').textContent = empty.title; $('empty-body').textContent = empty.body;
      $('empty-action').hidden = !(state.view === 'watchlist' && !list(state.watchlist.items).length);
      $('follow-count').textContent = String(list(state.watchlist.items).length);
      $('results').setAttribute('aria-labelledby', `radar-tab-${state.view}`);
    }
    function renderSummary() {
      $('markets').replaceChildren();
      ['US', 'KR'].forEach(market => {
        const summary = marketSummary(market, state.snapshot.markets?.[market]);
        const node = el('div', 'radar-market'); const line = el('div'); line.append(el('strong', '', market === 'US' ? '미국' : '한국'), el('span', `radar-status-label is-${summary.tone}`, summary.text));
        node.append(line, el('p', '', summary.detail)); $('markets').append(node);
      });
      $('discovery-note').textContent = discoverySummary(state.snapshot.discovery);
      const discoveryRows = list(state.snapshot.symbols).filter(r => r.market === 'US' && list(r.origins).includes('discovery'));
      const partial = !['ok', 'empty'].includes(state.snapshot.discovery?.status);
      const summaries = [
        ['종가 돌파', discoveryRows.filter(r => r.status === 'ok' && list(r.tags).includes('breakout_close')).length, partial],
        ['장중 경신 후 밀림', discoveryRows.filter(r => r.status === 'ok' && list(r.tags).includes('breakout_intraday')).length, partial],
        ['팔로우 상태 변화', list(state.snapshot.symbols).filter(r => followed(r.id) && r.status === 'ok' && list(r.signal_changes).length).length, false]
      ];
      $('overview').replaceChildren(); summaries.forEach(([label, count, incomplete]) => { const node = el('div'); node.append(el('b', '', state.snapshot.available === false ? '—' : String(count)), el('span', '', label)); if (incomplete) node.append(el('small', '', '탐색 미완료')); $('overview').append(node); });
      const selectedSector = $('sector').value;
      $('sector').replaceChildren(el('option', '', '전체 섹터')); $('sector').firstChild.value = '';
      [...new Set(list(state.snapshot.symbols).map(r => r.sector || '섹터 미확인'))].sort().forEach(sector => { const option = el('option', '', sector); option.value = sector; $('sector').append(option); });
      $('sector').value = selectedSector;
      $('sector-summary').replaceChildren();
      sectorCounts(state.snapshot.symbols).forEach(({ sector, count }) => { const button = el('button', '', `${sector} ${count}`); button.type = 'button'; button.addEventListener('click', () => { $('sector').value = $('sector').value === sector ? '' : sector; renderRows(); }); $('sector-summary').append(button); });
      $('history-note').textContent = state.snapshot.generated_at ? `수집 시각 ${state.snapshot.generated_at}${state.date ? ' · 과거 결과' : ''}` : '수집 시각 미확인';
      const selectedDate = state.date || state.snapshot.markets?.US?.as_of_session;
      $('export-date').hidden = !selectedDate; $('export-date').href = exportPath(selectedDate);
    }
    async function loadSnapshot() {
      const request = ++state.request; $('results').setAttribute('aria-busy', 'true');
      try {
        const snapshot = await apiRequest(snapshotPath(state.date)); if (request !== state.request) return;
        const oldRun = state.snapshot.run_id; state.snapshot = snapshot;
        if (snapshot.watchlist) state.watchlist = { ...state.watchlist, ...snapshot.watchlist };
        renderSummary(); renderRows();
        if (oldRun && oldRun !== snapshot.run_id) { state.selected = null; state.chart = null; state.chartRequest++; $('detail').hidden = true; }
        if (snapshot.available === false) notice('가격 결과가 아직 준비되지 않았습니다. 팔로우 관리 또는 데이터 갱신을 사용할 수 있습니다.');
        else if (!state.refreshing) notice('');
      } catch (error) {
        if (request === state.request) {
          state.snapshot = { available: false, symbols: [] };
          renderSummary(); renderRows();
          $('empty-title').textContent = '선택한 결과를 불러오지 못했습니다';
          $('empty-body').textContent = '선택 날짜를 다시 확인하거나 잠시 후 다시 시도하세요.';
          notice(safeError(error));
        }
      }
      finally { if (request === state.request) $('results').setAttribute('aria-busy', 'false'); }
    }
    async function loadHistory() {
      try {
        const history = await apiRequest('/api/technicals/history');
        const chosen = $('date').value; $('date').replaceChildren(el('option', '', '최신 결과')); $('date').firstChild.value = '';
        list(history.dates).forEach(entry => { const option = el('option', '', `${entry.date} · ${number(entry.count, 0)}종목${['partial', 'error'].includes(entry.status) ? ' · 탐색 미완료' : ''}`); option.value = entry.date; $('date').append(option); });
        $('date').value = chosen;
      } catch (_) { $('history-note').textContent = '날짜 목록을 불러오지 못했습니다. 최신 결과는 계속 확인할 수 있습니다.'; }
    }
    function renderManager() {
      $('followed-list').replaceChildren(); $('candidates').replaceChildren();
      const renderEntry = (row, container, candidate) => {
        const node = el('div', 'radar-manage-row'), info = el('div'); info.append(el('strong', '', `${row.symbol} ${row.name || ''}`));
        info.append(el('p', '', `${row.market} / ${row.exchange}${candidate ? ` · 출처: ${list(row.sources).join(', ') || '기존 수집 목록'}` : ''}`));
        node.append(info, followButton(row, false)); container.append(node);
      };
      list(state.watchlist.items).forEach(row => renderEntry(row, $('followed-list'), false));
      if (!list(state.watchlist.items).length) $('followed-list').append(el('p', 'radar-muted', '아직 팔로우한 종목이 없습니다. 아래 후보에서 선택하세요.'));
      const query = $('candidate-query').value.trim().toLowerCase();
      const candidates = list(state.watchlist.candidates).filter(row => `${row.symbol} ${row.name || ''} ${list(row.sources).join(' ')}`.toLowerCase().includes(query));
      candidates.forEach(row => renderEntry(row, $('candidates'), true));
      if (!candidates.length) $('candidates').append(el('p', 'radar-muted', '일치하는 후보가 없습니다. 위에서 종목을 직접 등록할 수 있습니다.'));
    }
    async function openManager() {
      if (!$('watchlist-dialog').open) $('watchlist-dialog').showModal();
      renderManager();
      try { state.watchlist = await apiRequest('/api/technicals/watchlist'); renderManager(); renderRows(); }
      catch (error) { notice(safeError(error), true); }
    }
    async function mutateFollow(row, button, adding = !followed(row.id)) {
      if (button) button.disabled = true;
      try {
        const result = await apiRequest(adding ? '/api/technicals/watchlist' : `/api/technicals/watchlist/${encodeURIComponent(row.id)}`, {
          method: adding ? 'POST' : 'DELETE', ...(adding ? { body: JSON.stringify({ market: row.market, exchange: row.exchange, symbol: row.symbol, name: row.name || undefined }) } : {})
        });
        state.watchlist = { ...state.watchlist, ...result };
        notice(`${row.symbol} ${adding ? '팔로우에 추가했습니다. 다음 갱신부터 분석합니다.' : '팔로우를 해제했습니다.'}`, $('watchlist-dialog').open);
        renderRows(); renderManager(); renderSummary();
        if (state.selected) updateDetailFollow();
      } catch (error) { notice(safeError(error), $('watchlist-dialog').open); }
      finally { if (button) button.disabled = false; }
    }
    function updateDetailFollow() { $('detail-follow').textContent = followed(state.selected.id) ? '팔로우 해제' : '팔로우 추가'; $('detail-follow').setAttribute('aria-pressed', String(followed(state.selected.id))); }
    async function selectRow(row) {
      state.selected = row; state.chart = null; const request = ++state.chartRequest;
      $('detail').hidden = false; $('detail-title').textContent = `${row.symbol} ${row.name || ''}`;
      $('detail-meta').textContent = `${row.market} / ${row.exchange} · ${row.sector || '섹터 미확인'}${row.industry ? ` / ${row.industry}` : ''} · ${row.as_of_session || '분석 대기'} · ${row.provider || '공급자 미확인'}`;
      const description = $('company-description'); description.replaceChildren(el('span', '', companyDescription(row)));
      const profileURL = safeURL(row.profile_source_url);
      if (profileURL) { const source = el('a', '', `기업 정보 출처${row.profile_as_of ? ` (${row.profile_as_of})` : ''}`); source.href = profileURL; source.target = '_blank'; source.rel = 'noopener noreferrer'; description.append(source); }
      updateDetailFollow(); $('detail-metrics').replaceChildren();
      const m = row.metrics || {};
      [['종가', number(m.close)], ['등락률', pct(m.change_pct)], ['이전 52주 고가', number(m.high52w_previous)], ['고가 대비 거리', pct(m.distance_high_pct)], ['거래량 / 직전 20일', ratio(m.volume_ratio)], ['Wilder RSI(14)', number(m.rsi14, 1)]].forEach(([label, value]) => { const node = el('div'); node.append(el('span', '', label), el('b', '', value)); $('detail-metrics').append(node); });
      renderEvidence($('evidence'), row.evidence || {}, doc);
      $('wiki').replaceChildren(); $('wiki').hidden = !row.wiki_page;
      if (row.wiki_page) { const link = el('a', '', '기존 투자 맥락 보기'); link.href = `/wiki/${encodeURIComponent(String(row.wiki_page).replace(/\.md$/, ''))}`; $('wiki').append(link); }
      $('chart').replaceChildren(el('p', 'radar-chart-message', row.status === 'pending' ? '분석 대기 중입니다. 데이터 갱신 후 일봉 차트를 확인하세요.' : '같은 기준일의 일봉을 불러오고 있습니다.'));
      $('chart-readout').textContent = ''; $('chart-basis').textContent = ''; renderRows();
      $('detail').scrollIntoView({ behavior: 'auto', block: 'start' });
      if (row.status === 'pending') return;
      $('chart').setAttribute('aria-busy', 'true');
      try { const chart = await fetchChart(row.id, state.snapshot.run_id); if (request !== state.chartRequest) return; state.chart = chart; drawChart(); }
      catch (error) { if (request === state.chartRequest) $('chart').replaceChildren(el('p', 'radar-chart-message', safeError(error))); }
      finally { if (request === state.chartRequest) $('chart').setAttribute('aria-busy', 'false'); }
    }
    function drawChart() {
      if (!state.chart || !state.selected) return;
      const bars = chartWindow(state.chart.bars, state.range); $('chart').replaceChildren();
      if (!bars.length) { $('chart').append(el('p', 'radar-chart-message', '이 기준일의 일봉이 없습니다.')); return; }
      const g = chartGeometry(bars, 1100, 440, state.chart.high52w_previous);
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const add = (tag, attrs, text, parent = svg) => { const node = doc.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value))); if (text !== undefined) node.textContent = text; parent.append(node); return node; };
      svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`); svg.setAttribute('tabindex', '0'); svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${state.selected.symbol} 일봉 캔들, 20·50·200일 이동평균과 거래량. 좌우 방향키로 날짜별 가격 확인.`);
      add('title', {}, `${state.selected.symbol} ${bars[0].date}부터 ${bars.at(-1).date}까지 일봉`);
      add('desc', {}, '빨강은 시가 대비 상승, 파랑은 하락입니다. 가격과 거래량은 별도 축이며, 빠진 값은 연결하지 않습니다.');
      for (let i = 0; i <= 4; i++) { const value = g.priceMin + (g.priceMax - g.priceMin) * i / 4, y = g.y(value); add('line', { x1: g.left, x2: g.right, y1: y, y2: y, stroke: '#293441', 'stroke-width': 1 }); add('text', { x: g.right + 9, y: y + 3 }, number(value)); }
      add('line', { x1: g.left, x2: g.right, y1: g.volumeTop - 7, y2: g.volumeTop - 7, stroke: '#293441' });
      add('text', { x: g.right + 9, y: g.volumeTop + 8 }, '거래량');
      const candleWidth = Math.max(.7, Math.min(8, g.step * .72));
      g.candles.forEach(candle => { const color = candle.up ? '#ed827c' : '#73aaf0'; add('line', { x1: candle.x, x2: candle.x, y1: candle.highY, y2: candle.lowY, stroke: color, 'stroke-width': 1 }); add('rect', { x: candle.x - candleWidth / 2, y: candle.bodyY, width: candleWidth, height: candle.bodyHeight, fill: color }); });
      bars.forEach((bar, index) => { if (finite(bar.volume) && bar.volume >= 0) add('rect', { x: g.x(index) - candleWidth / 2, y: g.volumeY(bar.volume), width: candleWidth, height: g.volumeBottom - g.volumeY(bar.volume), fill: finite(bar.close) && finite(bar.open) ? bar.close >= bar.open ? '#784d4f' : '#3a567d' : '#546170' }); });
      [['sma20', '#e3b341'], ['sma50', '#c09aff'], ['sma200', '#63c8d0']].forEach(([key, color]) => lineSegments(bars, key, g).forEach(points => add('path', { d: points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.5 })));
      if (finite(state.chart.high52w_previous)) add('line', { x1: g.left, x2: g.right, y1: g.y(state.chart.high52w_previous), y2: g.y(state.chart.high52w_previous), stroke: '#a8b6c7', 'stroke-dasharray': '5 4', 'stroke-width': 1 });
      const dateIndices = [...new Set([0, Math.floor((bars.length - 1) / 3), Math.floor((bars.length - 1) * 2 / 3), bars.length - 1])];
      dateIndices.forEach((index, i) => add('text', { x: g.x(index), y: g.height - 8, 'text-anchor': i === 0 ? 'start' : i === dateIndices.length - 1 ? 'end' : 'middle' }, bars[index].date));
      const cursor = add('line', { x1: g.x(bars.length - 1), x2: g.x(bars.length - 1), y1: g.top, y2: g.volumeBottom, stroke: '#b6c3d1', 'stroke-width': 1, 'stroke-dasharray': '2 3' });
      let active = bars.length - 1;
      function readout(index) { active = Math.max(0, Math.min(bars.length - 1, index)); const b = bars[active]; cursor.setAttribute('x1', g.x(active)); cursor.setAttribute('x2', g.x(active)); $('chart-readout').textContent = `${b.date}  시 ${number(b.open)}  고 ${number(b.high)}  저 ${number(b.low)}  종 ${number(b.close)}  |  거래량 ${number(b.volume, 0)}  |  20일 ${number(b.sma20)}  50일 ${number(b.sma50)}  200일 ${number(b.sma200)}`; }
      svg.addEventListener('pointermove', event => { const rect = svg.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width * g.width; readout(Math.floor((x - g.left) / g.step)); });
      svg.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); readout(event.key === 'Home' ? 0 : event.key === 'End' ? bars.length - 1 : active + (event.key === 'ArrowRight' ? 1 : -1)); } });
      $('chart').append(svg); readout(active);
      $('chart-basis').textContent = `${bars[0].date} ~ ${bars.at(-1).date} · ${bars.length}거래일 슬롯 · ${state.chart.price_basis === 'split_adjusted' ? '분할조정 가격' : '가격 조정 기준 미확인'} · 기준일 ${state.chart.as_of_session || '미확인'}${bars.length < 253 ? ' · 1년 이력 미충족' : ''}`;
    }
    function setView(view) { state.view = view; app.querySelectorAll('[data-view]').forEach(button => { const selected = button.dataset.view === view; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; }); renderRows(); }
    app.querySelectorAll('[data-view]').forEach(button => { button.addEventListener('click', () => setView(button.dataset.view)); button.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setView(state.view === 'discovery' ? 'watchlist' : 'discovery'); $(`tab-${state.view}`).focus(); } }); });
    Object.entries(TAGS).concat([['pending', '분석 대기'], ['stale', '기준일 지연'], ['error', '수집 실패']]).forEach(([value, label]) => { const option = el('option', '', label); option.value = value; $('tag').append(option); });
    $('filters').addEventListener('submit', event => event.preventDefault());
    $('filters').addEventListener('input', event => { if (event.target.matches('input')) renderRows(); });
    // Text inputs fire change on blur, between a result button's mousedown and
    // click. Replacing that button there discards the user's first click.
    $('filters').addEventListener('change', event => { if (event.target.matches('select')) renderRows(); });
    $('date').addEventListener('change', () => { state.date = $('date').value; state.selected = null; state.chart = null; state.chartRequest++; $('detail').hidden = true; loadSnapshot(); });
    $('manage').addEventListener('click', openManager); $('empty-action').addEventListener('click', openManager); $('dialog-close').addEventListener('click', () => $('watchlist-dialog').close()); $('candidate-query').addEventListener('input', renderManager);
    $('detail-close').addEventListener('click', () => { state.selected = null; state.chart = null; state.chartRequest++; $('detail').hidden = true; renderRows(); }); $('detail-follow').addEventListener('click', () => state.selected && mutateFollow(state.selected, $('detail-follow')));
    app.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => { state.range = button.dataset.range; app.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); drawChart(); }));
    const register = $('register');
    function exchangeOptions() { const market = register.elements.market.value; register.elements.exchange.replaceChildren(); (market === 'KR' ? ['KOSPI', 'KOSDAQ'] : ['NASDAQ', 'NYSE', 'AMEX', 'US']).forEach(value => { const option = el('option', '', value === 'US' ? '미확인' : value); option.value = value; register.elements.exchange.append(option); }); }
    exchangeOptions(); register.elements.market.addEventListener('change', exchangeOptions);
    register.addEventListener('submit', event => { event.preventDefault(); const value = Object.fromEntries(new FormData(register)); value.symbol = value.symbol.trim().toUpperCase(); const error = validateSymbol(value); if (error) return notice(error, true); mutateFollow(value, register.querySelector('button[type="submit"]'), true); });
    $('refresh').addEventListener('click', async () => {
      $('refresh').disabled = true;
      try {
        const result = await apiRequest('/api/technicals/refresh', { method: 'POST' }); state.refreshing = true;
        notice(result.status === 'running' ? '이미 갱신 중입니다. 완료될 때까지 기존 기준일의 결과를 표시합니다.' : '데이터 갱신을 시작했습니다. 완료되면 새 기준일의 결과를 표시합니다.');
        let attempts = 0; const initialRun = state.snapshot.run_id;
        if (state.poll) clearInterval(state.poll);
        state.poll = setInterval(async () => {
          if (doc.hidden) return;
          attempts++;
          const results = await Promise.allSettled([loadSnapshot(), apiRequest('/api/technicals/refresh')]);
          const status = results[1].status === 'fulfilled' ? results[1].value.status : 'unknown';
          const outcome = refreshOutcome(initialRun, state.snapshot.run_id || initialRun, status, attempts);
          if (outcome.done) { clearInterval(state.poll); state.poll = null; state.refreshing = false; $('refresh').disabled = false; notice(outcome.message); loadHistory(); }
        }, 10000);
      } catch (error) { notice(safeError(error)); $('refresh').disabled = false; }
    });
    loadSnapshot(); loadHistory();
  }
  const api = { number, chartWindow, chartGeometry, lineSegments, visibleRows, emptyMessage, resultSummary, marketSummary, discoverySummary, validateSymbol, refreshOutcome, apiRequest, fetchChart, renderEvidence, snapshotPath, exportPath, sectorCounts, companyDescription, initialize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) { root.TechnicalRadar = api; if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', () => initialize(root.document)); else initialize(root.document); }
})(typeof window !== 'undefined' ? window : globalThis);
