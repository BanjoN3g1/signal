// Elections world: a generic engine that renders any data/elections/<id>.json (built by elections.py).
(function(){
const TOPO='https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json',TJ='https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
let H,E=null,BASE=null,GEO=null,LIVE=null,view='map',layer='base';
const load=src=>new Promise((ok,no)=>{if(window.topojson)return ok();const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.append(s)});
const j=async u=>{const r=await fetch(u+(u.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json()};
const pct=p=>p==null?'–':Math.round(p*100)+'%';
const PC={D:'#0a84ff',R:'#ff453a',I:'#bf5af2'};
// colors: margin is R minus D points; pD is P(not Republican)
const mix=(c,t)=>{const a=[44,44,46];return `rgb(${a.map((x,i)=>Math.round(x+(c[i]-x)*t)).join(',')})`};
const mCol=m=>m==null?'#2c2c2e':mix(m>0?[255,69,58]:[10,132,255],Math.min(1,.18+Math.abs(m)/45));
const pCol=p=>p==null?'#232325':mix(p>=.5?[10,132,255]:[255,69,58],Math.min(1,.15+Math.abs(p-.5)*1.9));
const mTxt=m=>m==null?'–':(m>0?'R+':'D+')+Math.abs(m).toFixed(1);
const days=()=>Math.max(0,Math.ceil((new Date(E.date+'T00:00:00-08:00')-Date.now())/864e5));
// project-free paths: us-atlas "albers" files are already projected to 975×610
function pathOf(g){const ring=r=>'M'+r.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
 if(!g)return '';if(g.type==='Polygon')return g.coordinates.map(ring).join('');if(g.type==='MultiPolygon')return g.coordinates.map(p=>p.map(ring).join('')).join('');
 if(g.type==='MultiLineString')return g.coordinates.map(l=>'M'+l.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')).join('');return ''}
async function geo(){if(GEO)return GEO;await load(TJ);const t=await (await fetch(TOPO)).json();
 GEO={c:topojson.feature(t,t.objects.counties).features,s:topojson.feature(t,t.objects.states).features,mesh:pathOf(topojson.mesh(t,t.objects.states,(a,b)=>a!==b))};return GEO}
const raceFor=(st,type)=>E.races.find(r=>r.fips===st&&r.type===type);
function bars(r){const od=r.odds||[];if(!od.length)return '<p class="note">No market yet.</p>';
 const names={};od.forEach(o=>o.outcomes.forEach(x=>{const k=x.name.split(' ').pop().toLowerCase();(names[k]=names[k]||{name:x.name,party:x.party,ps:[]}).ps.push(x.p);if(!names[k].party)names[k].party=x.party}));
 const rows=Object.values(names).map(x=>({...x,p:x.ps.reduce((a,b)=>a+b,0)/x.ps.length})).sort((a,b)=>b.p-a.p).slice(0,3);
 return rows.map(x=>`<div class="ebar"><span>${H.esc(x.name)}${x.party?` <i style="color:${PC[x.party]||'#8e8e93'}">${x.party}</i>`:''}</span><b>${pct(x.p)}</b><div class="eb"><div style="width:${Math.round(x.p*100)}%;background:${PC[x.party]||'#8e8e93'}"></div></div></div>`).join('')
  +`<p class="note esrc">${od.map(o=>`<a href="${H.esc(o.url)}" target="_blank" rel="noopener">${o.src} ${o.outcomes.slice(0,2).map(x=>x.name.split(' ').pop()+' '+pct(x.p)).join(' · ')} ↗</a>`).join('<br>')}</p>`}
function pollHTML(r,full){const p=r.pollData;if(!p)return '';
 return `<div class="epoll"><b>Polls</b> <span class="note">avg of last ${p.n} · Wikipedia</span><div>${p.names.map((n,i)=>`${H.esc(n.split(' ').pop())} <b>${p.avg[i]}</b>`).join(' – ')}</div>
  ${full?p.recent.map(x=>`<p class="note">${H.esc(x.pollster)} · ${H.esc(x.dates)}: ${x.a}–${x.b}</p>`).join('')+`<a class="note" href="${H.esc(p.url)}" target="_blank" rel="noopener">All polls on Wikipedia ↗</a>`:''}</div>`}
function raceCard(r,full){return `<div class="erace" data-r="${H.esc(r.id)}"><div class="erh"><b>${H.esc(r.title)}</b>${r.pD!=null?`<span class="chip" style="color:${r.pD>=.5?PC.D:PC.R}">${r.pD>=.5?'Lean D/I':'Lean R'} ${pct(Math.max(r.pD,1-r.pD))}</span>`:''}</div>${bars(r)}${pollHTML(r,full)}</div>`}
function openRace(r){H.sheet(H.esc(r.title),`${r.fips&&BASE?.state?.[r.fips]?`<p class="note">2024 president here: ${mTxt(BASE.state[r.fips][0])}</p>`:''}${raceCard(r,true)}`)}
function openPlace(f,isState){const st=f.slice(0,2),name=isState?(GEO.s.find(x=>x.id===st)?.properties.name):(GEO.c.find(x=>x.id===f)?.properties.name);
 const b=isState?BASE?.state?.[st]:BASE?.county?.[f],lv=isState?LIVE?.states?.[st]:LIVE?.counties?.[f];const rs=E.races.filter(r=>r.fips===st);
 H.sheet(H.esc(name||f),`<div class="kicker">${isState?'State':'County · '+H.esc(GEO.s.find(x=>x.id===st)?.properties.name||'')}</div>
  <div class="stats up"><div class="stat">${H.esc(BASE?.label||'Baseline')}<b style="color:${b?(b[0]>0?PC.R:PC.D):''}">${b?mTxt(b[0]):'–'}</b></div>${b?`<div class="stat">Votes<b>${b[1].toLocaleString()}</b></div>`:''}${lv?`<div class="stat">Live · ${lv.reporting||0}% in<b>${mTxt(lv.margin)}</b></div>`:''}</div>
  ${rs.length?`<h4 class="dh">On the ballot</h4>${rs.map(r=>raceCard(r,true)).join('')}`:'<p class="note">No tracked Senate or governor race in this state.</p>'}`)}
function mapHTML(){const g=GEO,odd=layer!=='base',typ=layer==='gov'?'governor':'senate';
 const cs=odd?'':g.c.map(f=>`<path d="${pathOf(f.geometry)}" fill="${mCol(LIVE?.counties?.[f.id]?.margin??BASE?.county?.[f.id]?.[0])}" data-c="${f.id}"/>`).join('');
 const ss=odd?g.s.map(f=>{const r=raceFor(f.id,typ);return `<path d="${pathOf(f.geometry)}" fill="${r?pCol(r.pD):'#232325'}" data-s="${f.id}"/>`}).join(''):'';
 return `<svg viewBox="0 0 975 610" class="emap"><g id="zg"><g class="cty">${cs}${ss}</g><path d="${g.mesh}" class="smesh"/></g></svg>`}
function wireMap(box){const svg=box.querySelector('svg'),zg=svg.querySelector('#zg');let k=1,x=0,y=0;const pts=new Map();let st=null,moved=0;
 const set=()=>{k=Math.max(1,Math.min(12,k));x=Math.min(0,Math.max(975*(1-k),x));y=Math.min(0,Math.max(610*(1-k),y));zg.setAttribute('transform',`translate(${x},${y}) scale(${k})`);svg.style.setProperty('--sw',(0.6/k)+'px')};
 const toSvg=(cx,cy)=>{const r=svg.getBoundingClientRect();return [(cx-r.left)/r.width*975,(cy-r.top)/r.height*610]};
 svg.addEventListener('pointerdown',e=>{svg.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);moved=0;st={k,x,y,p:[...pts.values()].map(p=>[...p])}});
 svg.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,[e.clientX,e.clientY]);const P=[...pts.values()];
  if(P.length===1&&st.p.length===1){const r=svg.getBoundingClientRect(),dx=(P[0][0]-st.p[0][0])/r.width*975,dy=(P[0][1]-st.p[0][1])/r.height*610;moved=Math.max(moved,Math.abs(dx)+Math.abs(dy));if(st.k>1){x=st.x+dx;y=st.y+dy;set()}}
  else if(P.length===2&&st.p.length===2){const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]),m0=toSvg((st.p[0][0]+st.p[1][0])/2,(st.p[0][1]+st.p[1][1])/2);k=st.k*d(P[0],P[1])/Math.max(1,d(st.p[0],st.p[1]));x=m0[0]-(m0[0]-st.x)*k/st.k;y=m0[1]-(m0[1]-st.y)*k/st.k;moved=99;set()}});
 const up=e=>{pts.delete(e.pointerId);if(!pts.size&&moved<6){const el=document.elementFromPoint(e.clientX,e.clientY);if(el?.dataset.c)openPlace(el.dataset.c,false);else if(el?.dataset.s){const r=raceFor(el.dataset.s,layer==='gov'?'governor':'senate');r?openRace(r):openPlace(el.dataset.s+'000',true)}}st={k,x,y,p:[...pts.values()].map(p=>[...p])}};
 svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',e=>pts.delete(e.pointerId));
 let lt=0;svg.addEventListener('pointerup',()=>{const n=Date.now();if(n-lt<300){k=k>1?1:3;x=k>1?-975:0;y=k>1?-610*.8:0;set()}lt=n});
 box.querySelector('[data-zoom]')?.addEventListener('click',()=>{k=1;x=0;y=0;set()});set()}
function legend(){return layer==='base'?`<div class="elg">D+40 ${[-40,-20,-5,5,20,40].map(m=>`<span style="background:${mCol(m)}"></span>`).join('')} R+40</div><p class="note">${H.esc(BASE?.label||'')} margin by county · ${H.esc(BASE?.metric||'')}</p>`
 :`<div class="elg">R likely ${[.05,.25,.45,.55,.75,.95].map(p=>`<span style="background:${pCol(p)}"></span>`).join('')} D/I likely</div><p class="note">Average of Polymarket and Kalshi odds; grey = no ${layer==='gov'?'governor':'Senate'} race this year.</p>`}
function body(p){const ctl=E.races.filter(r=>r.type==='chamber'),key=E.races.filter(r=>r.key&&r.type!=='chamber'),other=E.races.filter(r=>!r.key&&r.type!=='chamber');
 const strip=`<div class="ectl">${ctl.map(r=>`<button class="ectlc" data-r="${r.id}"><span class="note">${H.esc(r.title)}</span><b style="color:${r.pD>=.5?PC.D:PC.R}">${r.pD>=.5?'D':'R'} ${pct(Math.max(r.pD,1-r.pD))}</b></button>`).join('')}</div>`;
 if(view==='map'){p.innerHTML=`${strip}<div class="pchips">${[['base','2024 baseline'],['sen','Senate odds'],['gov','Governor odds']].map(([k,n])=>`<button class="pchip ${layer===k?'on':''}" data-l="${k}">${n}</button>`).join('')}</div>
   <div class="emapbox" id="mb">${GEO?mapHTML():'<p class="note" style="padding:40px;text-align:center">Loading map…</p>'}<button class="ezoom" data-zoom>Reset</button></div>${legend()}
   <p class="note">Pinch or double-tap to zoom · tap a ${layer==='base'?'county':'state'} for details.</p>
   <div class="elive">${LIVE?`<b>Live results</b> · updated ${H.esc(H.ago(LIVE.updated))}`:`<b>Election night</b> · live county results will plug into this map on ${H.esc(E.date)} (hook ready, feed not connected yet).`}</div>`;
  p.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{layer=b.dataset.l;body(p)});if(GEO)wireMap(p.querySelector('#mb'));else geo().then(()=>view==='map'&&body(p)).catch(()=>{p.querySelector('#mb').innerHTML='<p class="note" style="padding:30px">Map unavailable offline.</p>'})}
 else if(view==='races')p.innerHTML=strip+`<h4 class="dh">Key races</h4>${key.map(r=>raceCard(r)).join('')}<h4 class="dh">Everything else (${other.length})</h4>${other.map(r=>raceCard(r)).join('')}<p class="note">Odds: Polymarket (gamma API) and Kalshi (public API), no account needed. Updated ${H.esc(H.ago(E.generatedAt))}.</p>`;
 else{const pr=E.races.filter(r=>r.pollData);p.innerHTML=`${pr.map(r=>raceCard(r,true)).join('')||'<p class="note">No polls yet.</p>'}<p class="note">Latest ${pr.length} races with Wikipedia polling tables; simple average of the 5 most recent polls in the main matchup table — not a weighted model.</p>`}
 p.querySelectorAll('[data-r]').forEach(b=>b.onclick=e=>{if(e.target.closest('a'))return;openRace(E.races.find(r=>r.id===b.dataset.r))})}
async function render(app,helpers){H=helpers;
 app.innerHTML=`<div class="view"><div class="top"><button class="back" id="bk">${H.back}</button><div class="title">Elections</div></div><div class="pane escroll" id="ep"><p class="note" style="padding:30px">Loading…</p></div></div>`;
 app.querySelector('#bk').onclick=()=>location.hash='#/';const p=app.querySelector('#ep');
 try{const idx=await j('data/elections/index.json');const id=idx.elections[0].id;E=await j(`data/elections/${id}.json`);
  BASE=E.baseline?await j(`data/elections/baselines/${E.baseline}.json`).catch(()=>null):null;LIVE=await j(`data/elections/live/${id}.json`).catch(()=>null)}
 catch(e){p.innerHTML='<div class="empty"><h2>No election data yet</h2><p>It arrives with the next data refresh.</p></div>';return}
 p.innerHTML=`<div class="ehead"><div><div class="kicker">${H.esc(E.date)} · ${days()} days</div><h2>${H.esc(E.name)}</h2></div></div><div class="pchips eseg">${[['map','Map'],['races','Races'],['polls','Polls']].map(([k,n])=>`<button class="pchip ${view===k?'on':''}" data-v="${k}">${n}</button>`).join('')}</div><div id="eb"></div>`;
 const eb=p.querySelector('#eb');p.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;p.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x===b));body(eb)});body(eb)}
window.SignalElections={render};
})();
