// Elections world: a generic engine that renders any data/elections/<id>.json (built by elections.py).
(function(){
const TOPO='https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json',TJ='https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
let H,E=null,BASE=null,GEO=null,LIVE=null,P=null,view='dash',layer='base',xf='bal';
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
const mvTxt=m=>m==null||Math.abs(m)<.005?'':`<span class="emv ${m>0?'d':'r'}">${m>0?'▲':'▼'} ${Math.abs(Math.round(m*100))} ${m>0?'D':'R'}</span>`;
const rcol=l=>!l?'#8e8e93':/D/.test(l)?PC.D:/R/.test(l)?PC.R:'#ff9f0a';
function ratingsHTML(r,full){const t=r.ratings;if(!t)return '';
 return `<div class="erat"><span class="note">Raters</span> <b style="color:${rcol(t.label)}">${H.esc(t.label||'–')}</b>${t.open?' <span class="chip">Open seat</span>':''}${full?`<div class="ratby">${Object.entries(t.by).map(([k,v])=>`<span title="${H.esc(k)}"><i>${H.esc(k)}</i> ${H.esc(v)}</span>`).join('')}</div><p class="note">${H.esc(t.incumbent||'')} · PVI ${H.esc(t.pvi||'')} · <a href="${H.esc(E.raters?.[r.type]?.url||'#')}" target="_blank" rel="noopener">ratings table ↗</a></p>`:''}</div>`}
function raceCard(r,full){return `<div class="erace" data-r="${H.esc(r.id)}"><div class="erh"><b>${H.esc(r.title)}</b><span>${mvTxt(r.move7)}${r.pD!=null?`<span class="chip" style="color:${r.pD>=.5?PC.D:PC.R}">${r.pD>=.5?'D/I':'R'} ${pct(Math.max(r.pD,1-r.pD))}</span>`:''}</span></div>${bars(r)}${ratingsHTML(r,full)}${pollHTML(r,full)}${full?moneyHTML(r)+xForRace(r):''}</div>`}
function moneyHTML(r){const m=P?.signals?.find(s=>s.id==='money')?.money?.[r.id];if(!m)return '';
 return `<div class="epoll"><b>Money</b> <span class="note">FEC, through ${H.esc((m.D||m.R).asOf)}</span>${['D','R','I'].filter(k=>m[k]).map(k=>`<p class="note"><b style="color:${PC[k]}">${k}</b> ${H.esc(m[k].name)}: raised $${(m[k].raised/1e6).toFixed(1)}M · cash $${(m[k].cash/1e6).toFixed(1)}M</p>`).join('')}</div>`}
const LEAN={left:['Left',PC.D],right:['Right',PC.R],center:['Nonpartisan','#8e8e93'],analyst:['Analyst','#bf5af2']};
function xPost(x){const L=LEAN[x.lean]||['',''];return `<a class="xpost" href="${H.esc(x.url)}" target="_blank" rel="noopener"><div class="xh"><span class="lean" style="background:${L[1]}22;color:${L[1]}">${L[0]}</span><b>${H.esc(x.name||x.handle)}</b><span>@${H.esc(x.handle)}${x.ts?' · '+H.esc(H.hAgo(x.ts)):''}</span></div><p>${H.esc(x.text)}</p><div class="xs">♥ ${H.kfmt(x.likes)} · ↻ ${H.kfmt(x.reposts)}${x.role?' · '+H.esc(x.role):''}</div></a>`}
function xForRace(r){const ps=(P?.x?.posts||[]).filter(x=>x.race===r.id);return ps.length?`<h4 class="dh">On X</h4>${ps.slice(0,4).map(xPost).join('')}`:''}
function balanced(ps){const by={};ps.forEach(p=>(by[p.lean]=by[p.lean]||[]).push(p));const order=['left','right','analyst','center'],out=[];let i=0;while(out.length<ps.length&&i<40){order.forEach(k=>{const x=by[k]?.[i];if(x)out.push(x)});i++}return out}
function openRace(r){if(!r)return;H.sheet(H.esc(r.title),`${r.fips&&BASE?.state?.[r.fips]?`<p class="note">2024 president here: ${mTxt(BASE.state[r.fips][0])}</p>`:''}${raceCard(r,true)}`)}
function openPlace(f,isState){const st=f.slice(0,2),name=isState?(GEO.s.find(x=>x.id===st)?.properties.name):(GEO.c.find(x=>x.id===f)?.properties.name);
 const b=isState?BASE?.state?.[st]:BASE?.county?.[f],lv=isState?LIVE?.states?.[st]:LIVE?.counties?.[f];const rs=E.races.filter(r=>r.fips===st);
 H.sheet(H.esc(name||f),`<div class="kicker">${isState?'State':'County · '+H.esc(GEO.s.find(x=>x.id===st)?.properties.name||'')}</div>
  <div class="stats up"><div class="stat">${H.esc(BASE?.label||'Baseline')}<b style="color:${b?(b[0]>0?PC.R:PC.D):''}">${b?mTxt(b[0]):'–'}</b></div>${b?`<div class="stat">Votes<b>${b[1].toLocaleString()}</b></div>`:''}${lv?`<div class="stat">Live · ${lv.reporting||0}% in<b>${mTxt(lv.margin)}</b></div>`:''}</div>
  ${rs.length?`<h4 class="dh">On the ballot</h4>${rs.map(r=>raceCard(r,true)).join('')}`:'<p class="note">No tracked Senate or governor race in this state.</p>'}`)}
function mapHTML(){const g=GEO,odd=layer!=='base',typ=layer==='gov'?'governor':'senate';
 const cs=odd?'':g.c.map(f=>`<path d="${pathOf(f.geometry)}" fill="${mCol(LIVE?.counties?.[f.id]?.margin??BASE?.county?.[f.id]?.[0])}" data-c="${f.id}"/>`).join('');
 const ss=odd?g.s.map(f=>{const r=raceFor(f.id,typ);return `<path d="${pathOf(f.geometry)}" fill="${r?pCol(r.pD):'#232325'}" data-s="${f.id}"/>`}).join(''):'';
 const tossTypes=layer==='gov'?['governor']:layer==='sen'?['senate']:['senate','governor'];
 const glow=g.s.filter(f=>E.races.some(r=>r.fips===f.id&&tossTypes.includes(r.type)&&r.pD!=null&&r.pD>=.35&&r.pD<=.65)).map(f=>`<path d="${pathOf(f.geometry)}" class="glow"/>`).join('');
 return `<svg viewBox="0 0 975 610" class="emap"><g id="zg"><g class="cty">${cs}${ss}</g><path d="${g.mesh}" class="smesh"/>${glow}</g></svg>`}
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
const glowNote='<span class="gdot"></span> glowing outline = toss-up race (markets 35–65%)';
function watchHTML(){const W=E.watch||[];if(!W.length)return '';
 return `<h4 class="dh">Races to watch</h4><div class="wstrip">${W.map(w=>{const r=E.races.find(x=>x.id===w.id);if(!r)return '';const fav=r.pD>=.5?'D':'R';
  return `<button class="wcard ${r.pD>=.35&&r.pD<=.65?'hot':''}" data-r="${H.esc(r.id)}"><div class="wt">${H.esc(r.title)}</div><div class="wo"><b style="color:${PC[fav]}">${fav} ${pct(Math.max(r.pD,1-r.pD))}</b>${mvTxt(r.move7)}</div>
   <div class="note">${r.pollMarginD!=null?`Polls ${r.pollMarginD>=0?'D':'R'}+${Math.abs(r.pollMarginD)}`:'No poll avg'}${r.ratings?.label?' · '+H.esc(r.ratings.label):''}</div><p>${H.esc(w.why[0])}</p>${w.why[1]?`<p class="note">${H.esc(w.why.slice(1).join(' · '))}</p>`:''}</button>`}).join('')}</div>`}
function sigHTML(){const S=P?.signals||[];if(!S.length)return '';
 return `<h4 class="dh">Signals</h4><div class="sgrid">${S.map(s=>`<button class="sig" data-sig="${H.esc(s.id)}"><span class="note">${H.esc(s.title)}</span><b style="color:${s.lean?PC[s.lean]:'#fff'}">${H.esc(s.value)}</b>${s.spark?.length>1?spk(s.spark):''}<span class="sd">${H.esc(s.detail||'')}</span></button>`).join('')}</div>`}
function spk(v){const mn=Math.min(...v),mx=Math.max(...v),w=80,h=18;return `<svg width="${w}" height="${h}" class="spk"><polyline fill="none" stroke="#8e8e93" stroke-width="1.5" points="${v.map((x,i)=>`${(i/(v.length-1)*w).toFixed(1)},${(h-2-(x-mn)/Math.max(.1,mx-mn)*(h-4)).toFixed(1)}`).join(' ')}"/></svg>`}
function openSig(id){const s=P.signals.find(x=>x.id===id);if(!s)return;const rs=(s.races||[]).map(i=>E.races.find(r=>r.id===i)).filter(Boolean);
 H.sheet(H.esc(s.title),`<div class="tkr" style="font-size:34px;color:${s.lean?PC[s.lean]:'#fff'}">${H.esc(s.value)}</div><p>${H.esc(s.detail||'')}</p><div class="whybox"><b>Why it matters</b><p>${H.esc(s.why)}</p></div>${s.url?`<a class="note" href="${H.esc(s.url)}" target="_blank" rel="noopener">Source ↗</a>`:''}${rs.length?`<h4 class="dh">Races</h4>${rs.slice(0,8).map(r=>raceCard(r)).join('')}`:''}`).querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>openRace(E.races.find(r=>r.id===b.dataset.r)))}
function storyCard(s){return `<button class="pstory" data-st="${H.esc(s.id)}"><div class="nmeta">${s.tags.slice(0,2).map(t=>`<span class="chip b">${H.esc(t)}</span>`).join('')}<span class="note">${s.n} source${s.n>1?'s':''} · ${H.esc(H.hAgo(s.last))} ago</span></div><b>${H.esc(s.title)}</b>${s.sum?`<p>${H.esc(s.sum)}</p>`:''}${s.markets?`<div class="mkt"><b>Markets</b> ${H.esc(s.markets)}</div>`:''}</button>`}
function openStory(id){const s=P.stream.find(x=>x.id===id);if(!s)return;
 H.sheet('Politics & markets',`<div class="kicker">${s.tags.map(H.esc).join(' · ')}</div><h3>${H.esc(s.title)}</h3>${s.sum?`<p>${H.esc(s.sum)}</p>`:'<p class="note">Summary arrives with the next refresh.</p>'}${s.markets?`<div class="whybox"><b>Market implications</b><p>${H.esc(s.markets)}</p>${s.sectors?.length?`<p class="note">${s.sectors.map(H.esc).join(' · ')}</p>`:''}</div>`:''}
  <h4 class="dh">Sources</h4>${s.sources.map(x=>`<a class="nrow" href="${H.esc(x.url)}" target="_blank" rel="noopener"><b>${x.paywalled?'🔒 ':''}${H.esc(x.title)}</b><span class="note">${H.esc(x.source)} · ${H.esc(H.hAgo(x.date))} ago</span></a>`).join('')}${s.sum?`<p class="note">Summary by ${H.esc(s.model||'AI')} from headlines and RSS snippets only.</p>`:''}`)}
const FC=[
 ['Cook','Cook Political Report','Expert ratings','Reporters and analysts rate each race Solid / Likely / Lean / Toss Up using candidate interviews, fundraising, polling and district history. A judgment call, not a probability.','https://www.cookpolitical.com'],
 ['Sabato',"Sabato's Crystal Ball",'Expert ratings','UVA Center for Politics ratings (Safe / Likely / Leans / Toss-up); they traditionally move every race off Toss-up before Election Day.','https://centerforpolitics.org/crystalball/'],
 ['IE','Inside Elections','Expert ratings','Nathan Gonzales’ nonpartisan ratings with an extra “Tilt” step between Toss-up and Lean.','https://insideelections.com'],
 ['Silver','Silver Bulletin (Nate Silver)','Statistical model','Poll average adjusted for pollster quality and house effects, blended with fundamentals (economy, incumbency, partisanship), then thousands of simulations → win probabilities.','https://www.natesilver.net'],
 ['FPO','FiftyPlusOne / Strength In Numbers (G. Elliott Morris)','Polling averages + model','Bayesian polling averages that pool polls across states and pollsters, correcting for house effects; feeds a probabilistic forecast.','https://www.gelliottmorris.com'],
 ['ST','Split Ticket','Model + ratings','Combines polls, fundamentals and candidate-quality measures; publishes ratings derived from its model.','https://split-ticket.org'],
 ['Econ','The Economist','Statistical model','Polls plus fundamentals with explicit uncertainty; outputs probabilities per race.','https://www.economist.com'],
 ['DDHQ','Decision Desk HQ','Model + results','Forecast model and the results desk that calls races on election night.','https://decisiondeskhq.com'],
 ['RCP','RealClearPolitics','Polling average + ratings','Simple average of recent public polls (no weighting); also publishes ratings.','https://www.realclearpolling.com'],
 ['NBC','NBC News','Newsroom ratings','NBC political unit’s race ratings.','https://www.nbcnews.com/politics'],
 ['Fox','Fox News','Newsroom ratings','Fox News Power Rankings.','https://www.foxnews.com/politics'],
 [null,'Race to the WH','Model','Poll-driven forecast model (not in Wikipedia’s 2026 ratings table, so not counted in the consensus).','https://www.racetothewh.com']];
function modelsHTML(){const act=new Set(Object.values(E.raters||{}).flatMap(x=>Object.keys(x.raters||{})));
 return `<div class="lesson"><h4 class="dh">Polls vs markets vs models</h4>
  <p><b>Polls</b> ask a sample of voters today. Each poll has a <b>margin of error</b> (±3–4 pts for ~800 voters, and roughly double that for the <i>gap</i> between two candidates) plus errors the MoE doesn’t cover: who actually turns out, and who refuses to answer.</p>
  <p><b>House effects</b>: some pollsters lean consistently toward one party because of their methods (online vs phone, likely-voter screens, weighting). Good averages measure and subtract that lean.</p>
  <p><b>Fundamentals models</b> ignore or down-weight polls and use structure: state partisanship (PVI), incumbency, the economy, presidential approval and the generic ballot. Midterms usually swing against the president’s party.</p>
  <p><b>Prediction markets</b> (Polymarket, Kalshi) are real-money prices. They react fastest to news but can be moved by a few big traders and by people betting with their hopes.</p>
  <p><b>Why they disagree</b>: markets price news within minutes; models update daily and are built to be stable; raters move deliberately and only on strong evidence. A big gap usually means new information one side hasn’t absorbed — or a thin market.</p></div>
 <h4 class="dh">Forecasters & raters</h4>${FC.map(([k,n,t,d,u])=>`<div class="erace"><div class="erh"><b>${H.esc(n)}</b>${k?(act.has(k)?'<span class="chip g">Rating 2026</span>':'<span class="chip">Not in table</span>'):'<span class="chip">Not in table</span>'}</div><p class="note">${H.esc(t)}</p><p style="font-size:14.5px;margin:4px 0">${H.esc(d)}</p><a class="note" href="${u}" target="_blank" rel="noopener">${u.replace('https://','')} ↗</a></div>`).join('')}
 <p class="note">“Rating 2026” = has a column in Wikipedia’s current 2026 Senate or governor predictions table (<a href="${H.esc(E.raters?.senate?.url||'#')}" target="_blank" rel="noopener">source</a>); the ratings consensus on each race averages those columns (Safe=3, Likely=2, Lean=1, Tilt=0.5, Toss-up=0). Track records: we only add verified, sourced accuracy facts — none listed yet rather than guessing.</p>`}
function body(p){const ctl=E.races.filter(r=>r.type==='chamber'),key=E.races.filter(r=>r.key&&r.type!=='chamber'),other=E.races.filter(r=>!r.key&&r.type!=='chamber');
 const strip=`<div class="ectl">${ctl.map(r=>`<button class="ectlc" data-r="${r.id}"><span class="note">${H.esc(r.title)}</span><b style="color:${r.pD>=.5?PC.D:PC.R}">${r.pD>=.5?'D':'R'} ${pct(Math.max(r.pD,1-r.pD))}</b></button>`).join('')}</div>`;
 if(view==='map'||view==='dash'){p.innerHTML=`${strip}<div class="pchips">${[['base','2024 baseline'],['sen','Senate odds'],['gov','Governor odds']].map(([k,n])=>`<button class="pchip ${layer===k?'on':''}" data-l="${k}">${n}</button>`).join('')}</div>
   <div class="emapbox" id="mb">${GEO?mapHTML():'<p class="note" style="padding:40px;text-align:center">Loading map…</p>'}<button class="ezoom" data-zoom>Reset</button></div>${legend()}
   <p class="note">Pinch or double-tap to zoom · tap a ${layer==='base'?'county':'state'} for details · ${glowNote}</p>${watchHTML()}
   ${view==='dash'?sigHTML()+(P?.stream?.length?`<h4 class="dh">Politics & markets</h4>${P.stream.slice(0,4).map(storyCard).join('')}<button class="btn" data-v2="news">All ${P.stream.length} stories</button>`:'')+(P?.x?.posts?.length?`<h4 class="dh">On X · balanced</h4>${balanced(P.x.posts).slice(0,6).map(xPost).join('')}<button class="btn" data-v2="x">More on X</button>`:''):''}
   <div class="elive">${LIVE?`<b>Live results</b> · updated ${H.esc(H.ago(LIVE.updated))}`:`<b>Election night</b> · live county results will plug into this map on ${H.esc(E.date)} (hook ready, feed not connected yet).`}</div>`;
  p.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{layer=b.dataset.l;body(p)});if(GEO)wireMap(p.querySelector('#mb'));else geo().then(()=>(view==='map'||view==='dash')&&body(p)).catch(()=>{p.querySelector('#mb').innerHTML='<p class="note" style="padding:30px">Map unavailable offline.</p>'})}
 else if(view==='races')p.innerHTML=strip+`<h4 class="dh">Key races</h4>${key.map(r=>raceCard(r)).join('')}<h4 class="dh">Everything else (${other.length})</h4>${other.map(r=>raceCard(r)).join('')}<p class="note">Odds: Polymarket (gamma API) and Kalshi (public API), no account needed. Updated ${H.esc(H.ago(E.generatedAt))}.</p>`;
 else if(view==='news')p.innerHTML=`${(P?.stream||[]).map(storyCard).join('')||'<p class="note">No stories yet — they arrive with the next refresh.</p>'}<p class="note">Free sources: POLITICO, The Hill, NPR and Google News RSS for tariffs, antitrust, the Fed, courts, executive actions and fiscal fights. Summaries and market implications by Gemini Flash-Lite from headlines/snippets only.</p>`;
 else if(view==='x'){const ps=P?.x?.posts||[];const f=xf==='bal'?balanced(ps):ps.filter(x=>x.lean===xf);
  p.innerHTML=`<div class="pchips">${[['bal','Balanced'],['left','Left'],['right','Right'],['center','Nonpartisan'],['analyst','Analysts']].map(([k,n])=>`<button class="pchip ${xf===k?'on':''}" data-xf="${k}">${n}</button>`).join('')}</div>${f.map(xPost).join('')||'<p class="note">No posts yet.</p>'}<p class="note">Curated, balanced account list (left, right, nonpartisan news, analysts) in data/politics_x.json; updated ${H.esc(P?.x?.updated?H.ago(P.x.updated):'—')}. Lean labels describe the account, not the post.</p>`;
  p.querySelectorAll('[data-xf]').forEach(b=>b.onclick=()=>{xf=b.dataset.xf;body(p)})}
 else if(view==='models')p.innerHTML=modelsHTML();
 else{const pr=E.races.filter(r=>r.pollData);p.innerHTML=`${pr.map(r=>raceCard(r,true)).join('')||'<p class="note">No polls yet.</p>'}<p class="note">Latest ${pr.length} races with Wikipedia polling tables; simple average of the 5 most recent polls in the main matchup table — not a weighted model.</p>`}
 p.querySelectorAll('[data-r]').forEach(b=>b.onclick=e=>{if(e.target.closest('a'))return;openRace(E.races.find(r=>r.id===b.dataset.r))});
 p.querySelectorAll('[data-sig]').forEach(b=>b.onclick=()=>openSig(b.dataset.sig));p.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>openStory(b.dataset.st));
 p.querySelectorAll('[data-v2]').forEach(b=>b.onclick=()=>{view=b.dataset.v2;document.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x.dataset.v===view));body(p)})}
async function render(app,helpers){H=helpers;
 app.innerHTML=`<div class="view"><div class="top"><button class="back" id="bk">${H.back}</button><div class="title">Politics</div></div><div class="pane escroll" id="ep"><p class="note" style="padding:30px">Loading…</p></div></div>`;
 app.querySelector('#bk').onclick=()=>location.hash='#/';const p=app.querySelector('#ep');
 try{const idx=await j('data/elections/index.json');const id=idx.elections[0].id;E=await j(`data/elections/${id}.json`);
  P=await j('data/politics.json').catch(()=>null);BASE=E.baseline?await j(`data/elections/baselines/${E.baseline}.json`).catch(()=>null):null;LIVE=await j(`data/elections/live/${id}.json`).catch(()=>null)}
 catch(e){p.innerHTML='<div class="empty"><h2>No election data yet</h2><p>It arrives with the next data refresh.</p></div>';return}
 p.innerHTML=`<div class="ehead"><div><div class="kicker">${H.esc(E.date)} · ${days()} days</div><h2>${H.esc(E.name)}</h2></div></div><div class="pchips eseg">${[['dash','Dashboard'],['races','Races'],['polls','Polls'],['news','News'],['x','X'],['models','Models']].map(([k,n])=>`<button class="pchip ${view===k?'on':''}" data-v="${k}">${n}</button>`).join('')}</div><div id="eb"></div>`;
 const eb=p.querySelector('#eb');p.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{view=b.dataset.v;p.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x===b));body(eb)});body(eb)}
window.SignalElections={render};
})();
