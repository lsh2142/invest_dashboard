const data=JSON.parse(document.getElementById('petro-data').textContent);
const labels={price:'가격',spread:'스프레드',wow:'주간 등락률',inventory:'재고',operating_rate:'가동률'};
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const svgEl=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e;};
const dateOf=p=>p.observed_on||p.source_date;
const dateLabel=t=>new Date(t).toISOString().slice(0,10);
const fmt=n=>Number(n).toLocaleString('ko-KR',{maximumFractionDigits:1});
const sourcePoints=data.series.flatMap(s=>s.points);
const lastDate=sourcePoints.length?Math.max(...sourcePoints.map(p=>Date.parse(dateOf(p)))):Date.now();
function graph(series,box,comparison=false){
 const all=series.flatMap(s=>s.points),times=all.map(p=>Date.parse(dateOf(p))),values=all.map(p=>p.value);
 const t0=Math.min(...times),t1=Math.max(...times),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.12,1);
 const low=series[0].metric==='spread'?Math.min(lo-pad,0):lo-pad,high=series[0].metric==='spread'?Math.max(hi+pad,0):hi+pad;
 const width=Math.max(280,Math.min(900,window.innerWidth-96)),right=width-16;
 const x=t=>t0===t1?(70+right)/2:70+(t-t0)/(t1-t0)*(right-70),y=v=>220-(v-low)/(high-low)*190;
 const svg=svgEl('svg',{viewBox:`0 0 ${width} 270`,role:'img','aria-label':comparison?'MEG·PE·PP 스프레드 비교':series[0].name+' '+labels[series[0].metric]+' 추세'});
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4;svg.append(svgEl('line',{x1:70,y1:y(v),x2:right,y2:y(v),stroke:'#354255'}));const label=svgEl('text',{x:60,y:y(v)+4,fill:'#adbacb','font-size':12,'text-anchor':'end'});label.textContent=fmt(v);svg.append(label);}
 if(low<0&&high>0)svg.append(svgEl('line',{x1:70,y1:y(0),x2:right,y2:y(0),stroke:'#899bb1','stroke-dasharray':'4 4'}));
 const ticks=t0===t1?[t0]:Array.from({length:width<500?3:5},(_,i)=>t0+(t1-t0)*i/(width<500?2:4));
 ticks.forEach(t=>{const label=svgEl('text',{x:x(t),y:248,fill:'#adbacb','font-size':12,'text-anchor':t0===t1?'middle':t===t0?'start':t===t1?'end':'middle'});label.textContent=width<500?dateLabel(t).slice(5):dateLabel(t);svg.append(label);});
 const details=el('p','점을 누르면 보고일과 값을 확인할 수 있습니다.');details.className='muted';
 const palette=['#63d9cb','#8db8ff','#eabe69','#dd91ed'];
 series.forEach((s,si)=>{const color=palette[si%palette.length];
 if(comparison){const legend=el('span',s.name+'  ');legend.style.color=color;box.append(legend);}
 s.points.forEach((p,i)=>{const t=Date.parse(dateOf(p));if(i){const prev=s.points[i-1],pt=Date.parse(dateOf(prev));if(t>pt&&t-pt<=10*86400000)svg.append(svgEl('line',{x1:x(pt),y1:y(prev.value),x2:x(t),y2:y(p.value),stroke:color,'stroke-width':2,'data-trend':'true'}));}
 const dot=svgEl('circle',{cx:x(t),cy:y(p.value),r:4,fill:color,tabindex:0,role:'button'});const title=s.name+' · '+dateOf(p)+' · '+fmt(p.value)+' '+s.unit+' · '+(p.status==='warn'?'신뢰도 불안정':p.status==='ok'?'검증됨':'미확인');dot.setAttribute('aria-label',title);const tip=svgEl('title',{});tip.textContent=title;dot.append(tip);dot.onclick=()=>details.textContent=title;dot.onfocus=()=>details.textContent=title;svg.append(dot);
 });});box.append(svg,details);
}
function render(){
 const product=document.getElementById('product').value,metric=document.getElementById('metric').value,days=Number(document.getElementById('period').value);
 const start=days?lastDate-days*86400000:-Infinity;
 const series=data.series.filter(s=>(!product||s.product===product)&&(!metric||s.metric===metric)).map(s=>({...s,points:s.points.filter(p=>Date.parse(dateOf(p))>=start)})).filter(s=>s.points.length);
 const charts=document.getElementById('charts'),rows=document.getElementById('rows');charts.replaceChildren();rows.replaceChildren();
 const points=series.flatMap(s=>s.points),dates=points.map(dateOf).sort();
 document.getElementById('coverage').textContent=points.length?`${dates[0]} ~ ${dates.at(-1)} · ${new Set(dates).size}개 보고일 · ${points.length}개 관측치 · ${series.length}개 시계열`:'선택한 범위의 관측치가 없습니다.';
 if(!series.length){const empty=el('div','아직 해당 관측치가 없습니다. 원문에 수치가 있는 자료부터 누적합니다.');empty.className='box empty';charts.append(empty);return;}
 if(!product&&(!metric||metric==='spread')){const peers=['MEG','HDPE','LDPE','PP'].map(k=>series.find(s=>s.product===k&&s.metric==='spread'&&s.basis==='하나 Weekly 원문 · 지역/등급 미확인'&&s.unit==='USD/t'&&s.formula==='리포트 보고 마진 · 원료/투입계수 산식 미확인')).filter(Boolean);if(peers.length>1){const box=el('div');box.className='box';box.append(el('h3','MEG·PE·PP 보고 마진 추세 비교 (USD/t)'),el('p','동일 리포트의 제품별 마진 변화입니다. 제품별 원가 산식은 미확인이므로 기업 수익률로 비교하지 않습니다.'));graph(peers,box,true);charts.append(box);}}
 series.forEach(s=>{const box=el('div');box.className='box';box.append(el('h3',s.name+' · '+labels[s.metric]+' ('+s.unit+')'));
 const first=s.points[0],last=s.points.at(-1),change=last.value-first.value;
 box.append(el('p',`${dateOf(first)} → ${dateOf(last)} · ${s.points.length}개 관측 · 최근 ${fmt(last.value)} ${s.unit}`+(s.points.length>1?` · 구간 변화 ${change>=0?'+':''}${fmt(change)} ${s.metric==='wow'?'%p':s.unit}`:'')));
 const basis=el('p',s.basis+(s.formula?' · '+s.formula:''));basis.className='muted';box.append(basis);graph([s],box);
 box.append(el('p',s.points.some(p=>!p.observed_on)?'가로축: 보고일 포함 · 가격 기준일 미확인 · 선은 인접 회차의 관측값만 연결':'가로축: 가격 기준일'));charts.append(box);
 [...s.points].reverse().forEach(p=>{const tr=el('tr');[s.name+' / '+labels[s.metric],fmt(p.value)+' '+s.unit,p.observed_on||'미확인',p.source_date,s.basis+(s.formula?' / '+s.formula:''),(p.status==='ok'?'검증됨':p.status==='warn'?'신뢰도 불안정':'미확인')].forEach(v=>tr.append(el('td',v)));const td=el('td'),a=el('a','원문');a.href=p.source_url;a.target='_blank';a.rel='noopener noreferrer';td.append(a);tr.append(td);rows.append(tr);});
 });
}
['product','metric','period'].forEach(id=>document.getElementById(id).onchange=render);render();
