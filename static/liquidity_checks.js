(() => {
'use strict';
const root=document.getElementById('liquidity-checks');if(!root)return;
const $=id=>document.getElementById('lqc-'+id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=2)=>v==null?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d});
const signed=(v,d=2)=>v==null?'—':(v>0?'+':'')+num(v,d);
let data={metrics:[]},selected='NET_PROXY';
const metric=id=>data.metrics.find(m=>m.id===id);
const stale=m=>m.latest&&(Date.now()-Date.parse(m.latest.date+'T00:00:00Z'))/86400000>({daily:7,weekly:21,monthly:100}[m.frequency]);
const valid=m=>m&&m.latest&&m.status==='ok'&&!stale(m);
function summary(){
 const proxy=metric('NET_PROXY'),credit=metric('TOTLL'),m2=metric('M2SL'),real=metric('DFII10'),yen=metric('DEXJPUS');
 const direction=m=>!valid(m)||!m.four_week?'판단 보류':m.four_week.delta>0?'4주 증가':m.four_week.delta<0?'4주 감소':'4주 보합';
 const cards=[['Fed·재무부 참고치',direction(proxy),valid(proxy)&&proxy.four_week?`${signed(proxy.four_week.delta)} 십억 달러 · ${proxy.latest.date}`:'동일일 입력·자료 상태 확인'],
 ['은행 신용·M2',direction(credit),`총대출 4주 ${signed(credit?.four_week?.pct)}% / M2 YoY ${signed(m2?.growth?.yoy_pct)}% · 서로 다른 관측 주기`],
 ['실질금리·할인율',!valid(real)||!real.four_week?'판단 보류':real.four_week.delta>0?'실질금리 상승':real.four_week.delta<0?'실질금리 하락':'실질금리 보합',`10년 ${num(real?.latest?.value)}% · 4주 ${signed(real?.four_week?.delta)}%p · 자금량과 분리`],
 ['엔캐리 보조 관찰',!valid(yen)?'공표 지연·확인 필요':!yen.five_observation?'비교 자료 부족':yen.five_observation.pct<0?'USD/JPY 하락':'USD/JPY 상승',`엔화 절상률 ${signed(yen?.five_observation?.yen_pct)}% · 5관측 간격 · 위험 점수 미산출`]];
 $('summary').innerHTML=cards.map(([title,value,note])=>`<article><h3>${esc(title)}</h3><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
}
function table(){
 const groups=[...new Set(data.metrics.map(m=>m.group))];
 $('table').innerHTML=groups.map(group=>`<h3>${esc(group)}</h3><table><thead><tr><th>지표</th><th>최신값</th><th>4주 변화</th><th>추가 관찰</th><th>관측일·주기</th><th>수집 상태·출처</th></tr></thead><tbody>${data.metrics.filter(m=>m.group===group).map(m=>{
 const change=m.four_week,unit=m.unit==='%'||m.unit==='%p'?'%p':m.unit;
 let extra=m.growth?`3개월 연율 ${signed(m.growth.annualised_3m_pct)}% / YoY ${signed(m.growth.yoy_pct)}%`:m.five_observation?`5관측 ${signed(m.five_observation.pct)}%${m.id==='DEXJPUS'?` / 엔화 ${signed(m.five_observation.yen_pct)}%`:''}`:m.id==='TOTLL'?`52주 ${signed(m.yoy?.pct)}%`:'';
 return `<tr><td>${esc(m.label)}<small>${esc(m.id)}</small></td><td>${num(m.latest?.value)} ${esc(m.unit)}</td><td>${change?signed(change.delta)+' '+esc(unit):'—'}${change&&m.unit==='십억 달러'?`<small>${signed(change.pct)}%</small>`:''}${change?`<small>${esc(change.base_date)} → ${esc(change.date)}</small>`:''}</td><td>${esc(extra)}</td><td>${esc(m.latest?.date||'미확보')}<small>${({daily:'일간',weekly:'주간',monthly:'월간'})[m.frequency]}</small></td><td class="${valid(m)?'':'lqc-warn'}">${m.status!=='ok'?'수집 실패':!m.latest?'미확보':stale(m)?'관측 지연':'수집 성공'}<small>${m.sources.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.split('/').at(-1))}</a>`).join(' / ')}</small></td></tr>`;
 }).join('')}</tbody></table>`).join('');
}
function chart(){
 const m=metric(selected);if(!m)return;
 const window=$('window').value,cut=window==='all'?-Infinity:Date.now()-Number(window)*86400000;
 const rows=m.history.filter(r=>Date.parse(r.date+'T00:00:00Z')>=cut);
 if(!rows.length){$('chart').textContent='관측값 미확보';return;}
 const w=1000,h=230,l=90,r=70,t=20,b=35;
 let lo=Math.min(...rows.map(r=>r.value)),hi=Math.max(...rows.map(r=>r.value));const pad=Math.max((hi-lo)*.1,.01);lo-=pad;hi+=pad;
 const first=Date.parse(rows[0].date),last=Date.parse(rows.at(-1).date);
 const x=d=>first===last?(w+l-r)/2:l+(Date.parse(d)-first)/(last-first)*(w-l-r),y=v=>t+(hi-v)/(hi-lo)*(h-t-b);
 const grid=[0,.5,1].map(f=>{const v=lo+(hi-lo)*f;return `<line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}"/><text x="${l-8}" y="${y(v)+4}" text-anchor="end">${num(v)}</text>`;}).join('');
 $('chart').innerHTML=`<p>${esc(m.label)} · ${esc(m.unit)} · ${rows.length}개 실제 관측</p><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(m.label)} 추이">${grid}<polyline points="${rows.map(p=>`${x(p.date)},${y(p.value)}`).join(' ')}"/>${rows.map(p=>`<circle cx="${x(p.date)}" cy="${y(p.value)}" r="2"><title>${esc(p.date)} ${num(p.value)}</title></circle>`).join('')}<text x="${l}" y="${h-8}">${rows[0].date}</text><text x="${w-r}" y="${h-8}" text-anchor="end">${rows.at(-1).date}</text></svg>`;
}
async function refresh(){try{
 const res=await fetch(root.dataset.url,{cache:'no-store'});if(!res.ok)throw Error();const next=await res.json();if(next.schema_version!==1||!Array.isArray(next.metrics))throw Error();data=next;
 $('status').textContent=`원천 수집 시도 ${data.checked_at?new Date(data.checked_at).toLocaleString('ko-KR'):'대기'} · 각 지표의 실제 관측일은 아래 표시 · 별점·유사도 점수는 산출하지 않습니다.`;
 $('series').innerHTML=data.metrics.map(m=>`<option value="${m.id}">${esc(m.label)}</option>`).join('');$('series').value=selected;
 summary();table();chart();
}catch{$('status').textContent='자료를 갱신하지 못했습니다. 기존 관측값이 있으면 유지합니다.';}}
$('series').addEventListener('change',e=>{selected=e.target.value;chart();});$('window').addEventListener('change',chart);refresh();setInterval(refresh,60000);
})();
