
// 데이터는 템플릿(sectors.html)이 window.__SECTOR_DATA__ 로 먼저 심는다.
// 🔴 여기서 `const D=...` 를 또 선언하면 인라인 선언과 충돌해
//    'Identifier D has already been declared' 로 파일 전체가 실행되지 않는다.
const D=window.__SECTOR_DATA__;
const Q=D.quarters, C=D.companies;
const fmt=v=>v==null?'—':(Math.abs(v)>=1000000?(v/1000000).toFixed(2)+'조':(v/100).toLocaleString(undefined,{maximumFractionDigits:0})+'억');
const fmtA=v=>v==null?'—':(v/100).toLocaleString(undefined,{maximumFractionDigits:0});
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SVG='http://www.w3.org/2000/svg';
function el(t,a){const e=document.createElementNS(SVG,t);for(const k in a)e.setAttribute(k,a[k]);return e;}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

// ── tiles
const bp=D.balanced.series;
document.getElementById('tiles').innerHTML=D.tiles.map(t=>`<div class="tile"><div class="l">${t[0]}</div><div class="v">${t[1]}</div><div class="s">${t[2]}</div></div>`).join('');

// ── 종목 리스트
const GROUPS=D.groupOrder;
let cur=C.find(x=>x.name===D.defaultCompany)||C[0];
function renderList(f){
  f=(f||'').trim();
  const box=document.getElementById('list'); box.innerHTML='';
  const mx=Math.max(...C.map(c=>c.latest||0));
  GROUPS.forEach(g=>{
    const arr=C.filter(c=>c.group===g&&(!f||c.name.includes(f)||c.code.includes(f)));
    if(!arr.length)return;
    const h=document.createElement('div');h.className='ghead';h.textContent=g+' · '+arr.length;box.appendChild(h);
    arr.forEach(c=>{
      const d=document.createElement('div');d.className='item'+(c===cur?' on':'');d.dataset.code=c.code;
      d.innerHTML=`<span class="nm">${esc(c.name)}${c.excl?'<sup style="color:var(--claret);font-size:9px"> 중복</sup>':''}</span><span class="vv">${fmtA(c.latest)}억</span><span class="bar"><i style="width:${((c.latest||0)/mx*100).toFixed(1)}%"></i></span>`;
      d.onclick=()=>{cur=c;renderList(document.getElementById('q').value);draw();};
      box.appendChild(d);
    });
  });
}
document.getElementById('q').oninput=e=>renderList(e.target.value);

// ── 차트 유틸
function axis(g,X,Y,W,H,max,ticks){
  for(let i=0;i<=ticks;i++){
    const v=max/ticks*i, y=Y+H-H*(v/max);
    g.appendChild(el('line',{x1:X,x2:X+W,y1:y,y2:y,stroke:i?css('--rule'):css('--ink'),'stroke-width':1}));
    const t=el('text',{x:X-7,y:y+4,'text-anchor':'end','font-size':10.5,fill:css('--ink3')});t.textContent=(v/100).toLocaleString(undefined,{maximumFractionDigits:0});g.appendChild(t);
  }
}
// 주가 전용 우측 눈금. 좌축과 같은 tick 수를 쓰므로 격자선은 좌축이 이미 그렸다.
// 0 기준을 유지한다 — 축을 잘라 확대하면 잔고와 주가의 '배수 변화'를 나란히 못 읽는다.
function axisRight(g,X,Y,W,H,max,ticks){
  // 🔴 표기 단위는 max 로 한 번에 정한다. tick 별로 판정하면 같은 축에
  //    '19만'과 '94,136'이 섞인다(2026-09-03 실측).
  const man=max>=1000000;
  for(let i=0;i<=ticks;i++){
    const v=max/ticks*i, y=Y+H-H*(v/max);
    const t=el('text',{x:X+W+7,y:y+4,'text-anchor':'start','font-size':10.5,fill:css('--c4')});
    t.textContent=man?(v/10000).toFixed(0)+'만':Math.round(v).toLocaleString();
    g.appendChild(t);
  }
}
function qLabels(g,X,Y,W,H,step){
  Q.forEach((q,i)=>{
    if(i%step)return;
    const x=X+(W/(Q.length-1))*i;
    const t=el('text',{x:x,y:Y+H+16,'text-anchor':'middle','font-size':10.5,fill:css('--ink3')});
    t.textContent=q.replace('Q1','.1Q').replace('Q2','.2Q').replace('Q3','.3Q').replace('Q4','.4Q').slice(2);
    g.appendChild(t);
  });
}
function chartCompany(c){
  // RX(우측 여백)는 주가 눈금 자리다. 14 로 두면 우축 라벨이 잘린다.
  const W=760,H=250,X=52,Y=14,RX=58,w=W-X-RX,h=H-Y-30,TICKS=4;
  const s=el('svg',{viewBox:`0 0 ${W} ${H}`});
  const vals=c.bal.concat(c.rev).filter(v=>v!=null);
  const max=Math.max(1,...vals)*1.12;
  axis(s,X,Y,w,h,max,TICKS); qLabels(s,X,Y,w,h,2);
  const px=c.px||[], pv=px.filter(v=>v!=null);
  const pmax=pv.length?Math.max(...pv)*1.12:0;
  if(pmax)axisRight(s,X,Y,w,h,pmax,TICKS);
  const bw=w/Q.length*0.62;
  c.bal.forEach((v,i)=>{
    if(v==null)return;
    const x=X+(w/(Q.length-1))*i, bh=h*(v/max);
    s.appendChild(el('rect',{x:x-bw/2,y:Y+h-bh,width:bw,height:Math.max(1,bh),fill:css('--c1'),opacity:.92}));
  });
  let d='',open=false;
  c.rev.forEach((v,i)=>{ if(v==null){open=false;return;}
    const x=X+(w/(Q.length-1))*i,y=Y+h-h*(v/max);
    d+=(open?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' ';open=true;});
  if(d)s.appendChild(el('path',{d:d,fill:'none',stroke:css('--c2'),'stroke-width':1.7}));
  // 주가 (우축). 결측 구간은 이어붙이지 않는다 — 상장 이전·거래정지를 직선으로 메우면 없던 추세가 생긴다.
  if(pmax){
    let pd='',po=false;
    px.forEach((v,i)=>{ if(v==null){po=false;return;}
      const x=X+(w/(Q.length-1))*i,y=Y+h-h*(v/pmax);
      pd+=(po?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' ';po=true;});
    if(pd)s.appendChild(el('path',{d:pd,fill:'none',stroke:css('--c4'),'stroke-width':1.9}));
  }
  // 최신값 직접 라벨. 잔고와 주가 라벨은 같은 x(최신 분기)에 붙으므로,
  // 두 계열이 비슷한 높이면 글자가 통째로 겹친다(효성중공업 실측) → 세로로 밀어낸다.
  let yb=null;
  for(let i=Q.length-1;i>=0;i--){ if(c.bal[i]!=null){
    const x=X+(w/(Q.length-1))*i; yb=Y+h-h*(c.bal[i]/max)-6;
    const t=el('text',{x:Math.min(x+6,X+w),y:yb,'font-size':11,'font-weight':700,fill:css('--c1'),'text-anchor':'end'});
    t.textContent=fmtA(c.bal[i])+'억'; s.appendChild(t); break;}}
  if(pmax)for(let i=Q.length-1;i>=0;i--){ if(px[i]!=null){
    const x=X+(w/(Q.length-1))*i; let yp=Y+h-h*(px[i]/pmax)-6;
    if(yb!=null&&Math.abs(yp-yb)<13)yp=yb+14;
    const t=el('text',{x:Math.min(x+6,X+w),y:Math.min(yp,Y+h-2),'font-size':10.5,'font-weight':700,fill:css('--c4'),'text-anchor':'end'});
    t.textContent=px[i].toLocaleString()+'원'; s.appendChild(t); break;}}
  return s;
}
function chartCov(c){
  const W=760,H=110,X=52,Y=10,w=W-X-14,h=H-Y-28;
  const s=el('svg',{viewBox:`0 0 ${W} ${H}`});
  const vv=c.cov.filter(v=>v!=null); const max=Math.max(0.6,...vv)*1.15;
  [0,max/2,max].forEach((v,i)=>{const y=Y+h-h*(v/max);
    s.appendChild(el('line',{x1:X,x2:X+w,y1:y,y2:y,stroke:i?css('--rule'):css('--ink')}));
    const t=el('text',{x:X-7,y:y+4,'text-anchor':'end','font-size':10.5,fill:css('--ink3')});t.textContent=v.toFixed(1)+'x';s.appendChild(t);});
  const one=Y+h-h*(1/max);
  if(1<max)s.appendChild(el('line',{x1:X,x2:X+w,y1:one,y2:one,stroke:css('--c3'),'stroke-dasharray':'3 3','stroke-width':1}));
  const bw=w/Q.length*0.62;
  c.cov.forEach((v,i)=>{ if(v==null)return;
    const x=X+(w/(Q.length-1))*i,bh=h*(Math.min(v,max)/max);
    s.appendChild(el('rect',{x:x-bw/2,y:Y+h-bh,width:bw,height:Math.max(1,bh),fill:v>=1?css('--c1'):css('--c4'),opacity:.85}));});
  qLabels(s,X,Y,w,h,4);
  return s;
}
function draw(){
  const c=cur;
  document.getElementById('cName').textContent=c.name+' ('+c.code+')';
  document.getElementById('cTag').textContent=c.sector+(c.usd?' · USD 표기':'')+(c.excl?' · 자회사 합산(중복)':'');
  const obs=c.bal.filter(v=>v!=null).length;
  const chg=(c.first&&c.latest)?(c.latest/c.first):null;
  const covL=[...c.cov].reverse().find(v=>v!=null);
  // 주가 배수는 **잔고 관측 구간과 같은 창**에서 잰다. 상장일이 제각각이라 전 구간으로 재면
  // '잔고 3.8배 vs 주가 1.4배' 가 서로 다른 기간 비교가 돼 버린다.
  const pxA=c.px||[];
  const pxL=[...pxA].reverse().find(v=>v!=null);
  const i0=c.bal.findIndex(v=>v!=null);
  let i1=-1; for(let i=Q.length-1;i>=0;i--)if(c.bal[i]!=null){i1=i;break;}
  let p0=null,p1=null;
  if(i0>=0){ for(let i=i0;i<=i1;i++)if(pxA[i]!=null){p0=pxA[i];break;}
             for(let i=i1;i>=i0;i--)if(pxA[i]!=null){p1=pxA[i];break;} }
  const pchg=(p0&&p1)?p1/p0:null;
  document.getElementById('cMini').innerHTML=[
   ['최근 수주잔고',fmt(c.latest)],['5년 최대',fmt(c.max)],
   ['잔고 최초 대비',chg?chg.toFixed(2)+'배':'—'],
   ['주가 최초 대비',pchg?pchg.toFixed(2)+'배':'—'],
   ['최근 주가(원)',pxL!=null?pxL.toLocaleString():'—'],
   ['커버리지',covL!=null?covL.toFixed(2)+'x':'—'],
   ['관측 분기',obs+'/'+Q.length]
  ].map(t=>`<div><div class="l">${t[0]}</div><div class="v">${t[1]}</div></div>`).join('');
  const a=document.getElementById('chart1');a.innerHTML='';a.appendChild(chartCompany(c));
  const b=document.getElementById('chart2');b.innerHTML='';b.appendChild(chartCov(c));
  let last=-1;for(let i=Q.length-1;i>=0;i--)if(c.bal[i]!=null){last=i;break;}
  const rc=last>=0?c.rcept[last]:'';
  document.getElementById('cProv').innerHTML='출처: '+esc(c.name)+' 정기보고서 「매출 및 수주상황」 원문, 관측 '+obs+'/'+Q.length+'개 분기'+
    (rc?' · 최신 근거 <a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+rc+'" target="_blank">DART 공시원문</a>':'')+
    ' · 자체 산출: 연환산 매출액 = 당기 누적매출 × 4 ÷ 경과분기, 커버리지 = 수주잔고 ÷ 연환산 매출액'+
    ' · 주가: KRX 수정주가(pykrx), 각 분기말 이전 마지막 거래일 종가(상장 이전·거래정지 분기는 공란)';
}

// ── 업종별 스택
function chartGroups(){
  const W=980,H=300,X=58,Y=14,w=W-X-14,h=H-Y-32;
  const keys=GROUPS.filter(g=>D.groups[g]);
  const cols=[css('--c1'),css('--c2'),css('--c3'),css('--c4'),css('--teal')];
  const tot=Q.map((_,i)=>keys.reduce((s,k)=>s+(D.groups[k][i]||0),0));
  const max=Math.max(...tot)*1.1;
  const s=el('svg',{viewBox:`0 0 ${W} ${H}`});
  axis(s,X,Y,w,h,max,4); qLabels(s,X,Y,w,h,1);
  const bw=w/Q.length*0.66;
  Q.forEach((q,i)=>{
    let acc=0; const x=X+(w/(Q.length-1))*i;
    keys.forEach((k,ki)=>{
      const v=D.groups[k][i]||0; if(!v)return;
      const y0=Y+h-h*((acc+v)/max), y1=Y+h-h*(acc/max);
      s.appendChild(el('rect',{x:x-bw/2,y:y0,width:bw,height:Math.max(0.5,y1-y0),fill:cols[ki],opacity:.9}));
      acc+=v;});
  });
  document.getElementById('lg3').innerHTML=keys.map((k,i)=>`<span><i class="sw" style="background:${cols[i]}"></i>${k}</span>`).join('')+
    '<span style="color:var(--ink3)">단위: 억원(좌축)</span>';
  return s;
}
document.getElementById('chart3').appendChild(chartGroups());

function chartBalanced(){
  const W=980,H=190,X=58,Y=14,w=W-X-14,h=H-Y-32;
  const s=el('svg',{viewBox:`0 0 ${W} ${H}`});
  const max=Math.max(...bp)*1.12;
  axis(s,X,Y,w,h,max,4); qLabels(s,X,Y,w,h,1);
  let d='';bp.forEach((v,i)=>{const x=X+(w/(Q.length-1))*i,y=Y+h-h*(v/max);d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' ';});
  s.appendChild(el('path',{d:d+`L${X+w} ${Y+h} L${X} ${Y+h} Z`,fill:css('--c1'),opacity:.13}));
  s.appendChild(el('path',{d:d,fill:'none',stroke:css('--c1'),'stroke-width':2}));
  [0,bp.length-1].forEach(i=>{const x=X+(w/(Q.length-1))*i,y=Y+h-h*(bp[i]/max);
    s.appendChild(el('circle',{cx:x,cy:y,r:3,fill:css('--c1')}));
    const t=el('text',{x:i?x-4:x+4,y:y-9,'font-size':11.5,'font-weight':700,fill:css('--c1'),'text-anchor':i?'end':'start'});
    t.textContent=(bp[i]/1000000).toFixed(2)+'조원';s.appendChild(t);});
  return s;
}
document.getElementById('chart4').appendChild(chartBalanced());

// ── 랭킹표
(function(){
  const rows=C.filter(c=>c.latest!=null).sort((a,b)=>b.latest-a.latest);
  let h=`<thead><tr><th class="l">#</th><th class="l">종목</th><th class="l">분류</th><th>${Q[Q.length-1]} 수주잔고</th><th>5년 최대</th><th>최초 관측 대비</th><th>커버리지</th><th>관측</th></tr></thead><tbody>`;
  rows.forEach((c,i)=>{
    const chg=(c.first&&c.latest)?c.latest/c.first:null;
    const covL=[...c.cov].reverse().find(v=>v!=null);
    h+=`<tr><td class="l">${i+1}</td><td class="l"><b>${esc(c.name)}</b>${c.excl?'<sup style="color:var(--claret);font-size:9px"> 중복</sup>':''}</td><td class="l" style="color:var(--ink3);font-size:12px">${esc(c.sector)}</td>`+
       `<td>${fmtA(c.latest)}억</td><td>${fmtA(c.max)}억</td>`+
       `<td class="${chg==null?'':(chg>=1?'pos':'neg')}">${chg==null?'—':chg.toFixed(2)+'배'}</td>`+
       `<td>${covL==null?'—':covL.toFixed(2)+'x'}</td><td style="color:var(--ink3)">${c.bal.filter(v=>v!=null).length}/${Q.length}</td></tr>`;
  });
  document.getElementById('tRank').innerHTML=h+'</tbody>';
})();

// ── 히트맵
(function(){
  const rows=C.filter(c=>c.latest!=null).sort((a,b)=>b.latest-a.latest);
  let h='<table class="hm"><thead><tr><th class="l" style="padding-left:0">종목</th>';
  Q.forEach((q,i)=>h+=`<th style="font-size:9px;padding:2px 0;text-align:center">${i%4===0?q.slice(2,4):''}</th>`);
  h+='</tr></thead><tbody>';
  rows.forEach(c=>{
    h+=`<tr><td class="l" style="font-size:12px;padding:0 8px 0 0;border:0;white-space:nowrap">${esc(c.name)}</td>`;
    Q.forEach((q,i)=>{
      const p=c.bal[i-1],v=c.bal[i];
      let col='var(--wash)',ti=q+' 결측';
      if(i>0&&p!=null&&v!=null&&p!==0){
        const r=v/p-1, a=Math.min(1,Math.abs(r)/0.5);
        col=r>=0?`color-mix(in srgb, var(--c1) ${(a*100).toFixed(0)}%, var(--panel))`
                :`color-mix(in srgb, var(--c2) ${(a*100).toFixed(0)}%, var(--panel))`;
        ti=`${q} ${(r*100).toFixed(1)}%`;
      }
      h+=`<td style="padding:1px"><span class="c" style="background:${col}" title="${ti}"></span></td>`;
    });
    h+='</tr>';
  });
  document.getElementById('heat').innerHTML=h+'</tbody></table>';
})();

// ── 미공시표
(function(){
  let h='<thead><tr><th class="l">종목</th><th class="l">분류</th><th class="l">구분</th><th class="l">확인 결과</th><th class="l">원문</th></tr></thead><tbody>';
  D.nodisc.forEach(n=>{
    h+=`<tr><td class="l"><b>${esc(n.name)}</b></td><td class="l" style="color:var(--ink3);font-size:12px">${esc(n.sector)}</td>`+
       `<td class="l" style="font-size:12px">${esc(n.judge)}</td>`+
       `<td class="l" style="font-size:12px;color:var(--ink2);white-space:normal;max-width:420px">${esc(n.note||'')}</td>`+
       `<td class="l" style="font-size:12px">${n.rcept?`<a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${n.rcept}" target="_blank">공시</a>`:'—'}</td></tr>`;
  });
  document.getElementById('tNo').innerHTML=h+'</tbody>';
})();

renderList(''); draw();
