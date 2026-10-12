(()=>{
 'use strict';
 const root=document.getElementById('canton-activity');if(!root)return;
 const $=id=>document.getElementById('canton-'+id), colors=['#71cfbf','#a7b6ff','#eab968','#ef9dab','#81b9ef'];
 let data=null,period='7d',selected=new Set(),single=null;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const number=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ko-KR'):'—';
 const date=s=>s?new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
 function reveal(){if(location.hash==='#canton-activity'){$('details').open=true;$('title').focus({preventScroll:true});}}
 addEventListener('hashchange',reveal);reveal();
 document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{$('jump').hidden=button.dataset.group!=='canton';}));
 const change=v=>v==='new'?'신규 활동':v===null||v===undefined?'—':v===0?'변화 없음':`${v>0?'+':''}${v.toFixed(1)}%`;
 const rowStatus=v=>v.status==='stale'?'갱신 지연':v.count_24h===null?'수집 불완전':'확인';
 function points(v){const aggregated=v.series?.[period]||[];if(aggregated.some(p=>p.complete))return aggregated;
   const raw=data.series?.[v.id]||[],end=Date.parse(data.comparison_end||data.as_of),days={ '24h':1,'7d':7,'30d':30,'90d':90 }[period];
   return raw.filter(p=>Date.parse(p.start)>=end-days*86400000&&Date.parse(p.start)<=end).map(p=>({...p,raw:true}));}
 function svg(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;}
 function chart(target,rows,bars=false){
   target.replaceChildren();const datasets=rows.map(v=>({v,points:points(v)})),all=datasets.flatMap(d=>d.points);
   const values=all.filter(p=>p.complete&&typeof p.count==='number');
   if(!values.length){const empty=node('p','아직 비교할 거래 자료가 없습니다. 수집 후 확보된 기간부터 표시합니다.');empty.className='canton-empty';target.append(empty);return;}
   const width=900,height=250,left=58,bottom=210,max=Math.max(1,...values.map(p=>p.count)),times=all.map(p=>Date.parse(p.start)),lo=Math.min(...times),hi=Math.max(...times),span=hi-lo||1;
   const x=t=>left+(t-lo)/span*(width-left-20),y=v=>bottom-v/max*170;
   const drawing=svg('svg',{viewBox:`0 0 ${width} ${height}`,'aria-hidden':'true'});
   for(let i=0;i<=4;i++){const value=max*i/4,yy=y(value);drawing.append(svg('line',{x1:left,y1:yy,x2:880,y2:yy,stroke:'#344154','stroke-width':1}));const label=svg('text',{x:left-8,y:yy+4,fill:'#9baac0','font-size':11,'text-anchor':'end'});label.textContent=number(Math.round(value));drawing.append(label);}
   datasets.forEach(({v,points:ps},index)=>{
     const color=colors[index%colors.length];let segments=[];
     for(const p of ps){if(!p.complete||typeof p.count!=='number'){segments=[];continue;}const xx=x(Date.parse(p.start)),yy=y(p.count);
       if(bars){drawing.append(svg('rect',{x:xx-2,y:yy,width:Math.max(2,Math.min(20,750/Math.max(ps.length,1))),height:Math.max(1,bottom-yy),fill:color}));}
       else{if(p.raw)segments=[];segments.push(`${xx},${yy}`);if(segments.length>1)drawing.append(svg('polyline',{points:segments.slice(-2).join(' '),fill:'none',stroke:color,'stroke-width':2}));drawing.append(svg('circle',{cx:xx,cy:yy,r:2.4,fill:color}));}
     }
   });
   for(const [time,anchor]of [[lo,'start'],[hi,'end']]){const label=svg('text',{x:x(time),y:238,fill:'#9baac0','font-size':11,'text-anchor':anchor});label.textContent=date(new Date(time).toISOString());drawing.append(label);}
   target.append(drawing);
 }
 function render(){
   if(!data)return;
   const query=$('search').value.trim().toLowerCase();
   const rows=[...data.validators].sort((a,b)=>(b.count_24h??-1)-(a.count_24h??-1)||a.name.localeCompare(b.name));
   const shown=rows.filter(v=>(v.name+' '+v.id).toLowerCase().includes(query));
   $('choices').replaceChildren();
   rows.forEach((v,i)=>{const label=node('label'),input=node('input');input.type='checkbox';input.checked=selected.has(v.id);input.value=v.id;input.addEventListener('change',()=>{if(input.checked&&selected.size>=5){input.checked=false;$('chart-note').textContent='비교 대상은 최대 5개입니다.';return;}input.checked?selected.add(v.id):selected.delete(v.id);render();});label.append(input,node('span',v.name));label.style.color=colors[[...selected].indexOf(v.id)%colors.length]||'inherit';$('choices').append(label);});
   const picked=rows.filter(v=>selected.has(v.id));chart($('chart'),picked);
   $('chart-note').textContent=`${data.comparison_end?'공통 집계 종료 '+date(data.comparison_end):'시간 구간 완전성 미확인 · 라운드 원자료 표시'} · 확보된 기간만 표시 · 단위: 건`;
   $('rows').replaceChildren();
   shown.forEach(v=>{const tr=node('tr'),name=node('td'),button=node('button',v.name);button.type='button';button.title=v.id;button.addEventListener('click',()=>{single=v.id;render();});name.append(button);tr.append(name,...[number(v.count_24h),change(v.change_24h),number(v.count_7d),date(v.last_observed),rowStatus(v)].map(t=>node('td',t)));$('rows').append(tr);});
   if(!shown.length){const tr=node('tr'),td=node('td','표시할 검증자가 없습니다.');td.colSpan=6;tr.append(td);$('rows').append(tr);}
   const v=rows.find(v=>v.id===single);$('single').hidden=!v;
   if(v){$('single-title').textContent=v.name;$('single-note').textContent=`노드 상태: ${v.node_state} · 확보 기간 ${v.available_days}일 · 7일 ${number(v.count_7d)}건 · 마지막 관측 ${date(v.last_observed)} · ${rowStatus(v)}`;chart($('single-chart'),[v],true);if($('single-source'))$('single-source').href='https://lighthouse.cantonloop.com/parties/'+encodeURIComponent(v.id);}
   $('points').replaceChildren();for(const v of picked){for(const p of points(v)){const tr=node('tr');tr.append(...[v.name,date(p.start),date(p.end),p.complete?number(p.count):'미확인'].map(t=>node('td',t)));$('points').append(tr);}}
 }
 async function load(){
   try{const response=await fetch(root.dataset.source,{cache:'no-store'});if(!response.ok)throw new Error();data=await response.json();
     if(!Array.isArray(data.validators))throw new Error();
     $('status').textContent=data.message;
     if(data.built_at&&Date.now()-Date.parse(data.built_at)>8*3600000)$('status').textContent+=' · 공개 발행 지연';
     $('tracked').textContent=number(data.tracked_count);$('active').textContent=number(data.active_24h_count);$('coverage').textContent=data.coverage.ratio===null?'미확인':Math.round(data.coverage.ratio*100)+'%';$('asof').textContent=date(data.as_of);$('method').textContent=data.coverage.note;
     const available=new Set(data.validators.map(v=>v.id));selected=new Set([...selected].filter(id=>available.has(id)));
     if(!selected.size)data.validators.filter(v=>v.count_24h!==null).sort((a,b)=>b.count_24h-a.count_24h).slice(0,3).forEach(v=>selected.add(v.id));
     render();root.dispatchEvent(new CustomEvent('canton-loaded',{detail:data}));
   }catch{$('status').textContent='거래 활동 자료를 불러오지 못했습니다. 잠시 후 다시 확인하세요.';}
 }
 root.addEventListener('canton-reload',load);
 $('search').addEventListener('input',render);
 document.querySelectorAll('[data-canton-period]').forEach(b=>b.addEventListener('click',()=>{period=b.dataset.cantonPeriod;document.querySelectorAll('[data-canton-period]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();}));
 load();setInterval(load,300000);
})();
