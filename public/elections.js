// Elections world: a generic engine that renders any data/elections/<id>.json (built by elections.py).
(function(){
const TOPO='https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json',TJ='https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js';
let H,E=null,BASE=null,GEO=null,LIVE=null,P=null,view='dash',layer='sen',xf='bal';
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
const raceFor=(st,type)=>E.races.find(r=>r.fips===st&&r.type===type)||Object.values(P?.model?.races||{}).find(x=>x.type===type&&ST2[x.state]===st);
const pOf=r=>r?(r.pD??r.model??null):null;
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
function watchHTML(){const W=E.watch||[];if(!W.length)return '';
 return `<h4 class="dh">Races to watch</h4><div class="wstrip">${W.map(w=>{const r=E.races.find(x=>x.id===w.id);if(!r)return '';const fav=r.pD>=.5?'D':'R';
  return `<button class="wcard ${r.pD>=.35&&r.pD<=.65?'hot':''}" data-r="${H.esc(r.id)}"><div class="wt">${H.esc(r.title)}</div><div class="wo"><b style="color:${PC[fav]}">${fav} ${pct(Math.max(r.pD,1-r.pD))}</b>${mvTxt(r.move7)}</div>
   <div class="note">${r.pollMarginD!=null?`Polls ${r.pollMarginD>=0?'D':'R'}+${Math.abs(r.pollMarginD)}`:'No poll avg'}${r.ratings?.label?' · '+H.esc(r.ratings.label):''}</div><p>${H.esc(w.why[0])}</p>${w.why[1]?`<p class="note">${H.esc(w.why.slice(1).join(' · '))}</p>`:''}</button>`}).join('')}</div>`}
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
// ---------- v3: US world (overview, d3 map, signals, charts, trackers) ----------
const D3='https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js';
const loadS=src=>new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.append(s)});
let world='us';
const fmtD=t=>new Date(t*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const src=(s,t)=>`<span class="u3src">${H.esc(s)}${t?' · '+H.esc(t):''}</span>`;
// haptics: Android -> navigator.vibrate; iOS 18 Safari -> toggling a native <input switch> via its label gives a light tap; else nothing
let HL=null;function haptic(){try{if(navigator.vibrate){navigator.vibrate(8);return}if(!HL){HL=document.createElement('label');HL.className='u3hap';HL.setAttribute('aria-hidden','true');HL.innerHTML='<input type="checkbox" switch tabindex="-1">';document.body.append(HL)}HL.click()}catch(e){}}
// ---- charts (inline SVG, no library) ----
function lineChart(series,o={}){const w=o.w||340,h=o.h||120,y0=o.y0??0,y1=o.y1??1,fmt=o.fmt||(v=>Math.round(v*100)+'%');
 const all=series.flatMap(s=>s.pts);if(all.length<2)return '<p class="note">Not enough history yet — it builds up with each refresh.</p>';
 const t0=Math.min(...all.map(p=>p[0])),t1=Math.max(...all.map(p=>p[0]));const X=t=>6+(t-t0)/Math.max(1,t1-t0)*(w-50),Y=v=>6+(1-(Math.max(y0,Math.min(y1,v))-y0)/(y1-y0))*(h-22);
 let ticks='';const d=new Date(t0*1000);d.setDate(1);d.setMonth(d.getMonth()+1);for(;d.getTime()/1000<t1;d.setMonth(d.getMonth()+1)){const x=X(d.getTime()/1000);ticks+=`<line x1="${x}" x2="${x}" y1="6" y2="${h-16}" class="u3grid"/><text x="${x}" y="${h-4}" class="u3tick" text-anchor="middle">${d.toLocaleDateString('en-US',{month:'short'})}</text>`}
 const mid=o.mid!=null?`<line x1="6" x2="${w-44}" y1="${Y(o.mid)}" y2="${Y(o.mid)}" class="u3mid"/>`:'';
 const ls=series.map(s=>{const p=s.pts,l=p[p.length-1];return `<polyline points="${p.map(q=>X(q[0]).toFixed(1)+','+Y(q[1]).toFixed(1)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/><circle cx="${X(l[0])}" cy="${Y(l[1])}" r="3" fill="${s.color}"/><text x="${X(l[0])+5}" y="${Y(l[1])+4}" class="u3end" fill="${s.color}">${s.label?H.esc(s.label)+' ':''}${fmt(l[1])}</text>`}).join('');
 return `<svg viewBox="0 0 ${w} ${h}" class="u3chart">${ticks}${mid}${ls}</svg>`}
function sparkS(pts,color='#8e8e93'){if(!pts||pts.length<2)return '';const v=pts.map(p=>p[1]),mn=Math.min(...v),mx=Math.max(...v),w=72,h=22;
 return `<svg width="${w}" height="${h}" class="u3spk"><polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" points="${v.map((x,i)=>`${(i/(v.length-1)*w).toFixed(1)},${(h-3-(x-mn)/Math.max(1e-6,mx-mn)*(h-6)).toFixed(1)}`).join(' ')}"/></svg>`}
const ago7=pts=>{if(!pts||pts.length<2)return null;const l=pts[pts.length-1],o=pts.filter(p=>l[0]-p[0]>=5*86400);if(!o.length)return null;const b=o.reduce((a,p)=>Math.abs(l[0]-7*86400-p[0])<Math.abs(l[0]-7*86400-a[0])?p:a);return l[1]-b[1]};
const arrow=(d,scale=100,unit=' pts')=>d==null||Math.abs(d*scale)<.5?'':`<span class="u3arr ${d>0?'d':'r'}">${d>0?'▲':'▼'} ${Math.abs(d*scale).toFixed(scale===100?0:1)}${unit} 7d</span>`;
function parseEnd(s){const m=String(s||'').replace(/–/g,'-').match(/([A-Z][a-z]+)\s+(\d{1,2})(?:\s*-\s*(?:([A-Z][a-z]+)\s+)?(\d{1,2}))?,\s*(\d{4})/);if(!m)return null;const d=new Date(`${m[3]||m[1]} ${m[4]||m[2]}, ${m[5]}`);return isNaN(d)?null:d.getTime()/1000}
function pollChart(r){const p=r.pollData;if(!p?.trend?.length)return '';const pts=p.trend.map(x=>[parseEnd(x.dates),x.a-x.b,x]).filter(x=>x[0]).sort((a,b)=>a[0]-b[0]);if(pts.length<2)return '';
 const party={};(r.odds||[]).forEach(od=>od.outcomes.forEach(o=>{if(o.party)party[o.name.split(' ').pop().toLowerCase()]=o.party}));const pa=party[p.names[0].split(' ').pop().toLowerCase()]||'D',pb=party[p.names[1].split(' ').pop().toLowerCase()]||'R';
 const m=Math.max(8,...pts.map(x=>Math.abs(x[1])))+1,w=340,h=110,t0=pts[0][0],t1=pts[pts.length-1][0],X=t=>8+(t-t0)/Math.max(1,t1-t0)*(w-60),Y=v=>6+(1-(v+m)/(2*m))*(h-20);
 const roll=pts.map((x,i)=>{const s=pts.slice(Math.max(0,i-4),i+1);return [x[0],s.reduce((a,b)=>a+b[1],0)/s.length]});const last=roll[roll.length-1][1];
 return `<div class="u3pc"><div class="u3pch"><b>Polls</b>${src('Wikipedia polling table',pts.length+' polls · '+fmtD(t0)+'–'+fmtD(t1))}</div><svg viewBox="0 0 ${w} ${h}" class="u3chart"><line x1="8" x2="${w-52}" y1="${Y(0)}" y2="${Y(0)}" class="u3mid"/>
  <text x="${w-50}" y="${Y(m*.7)}" class="u3tick" fill="${PC[pa]}">${H.esc(p.names[0].split(' ').pop())} ahead</text><text x="${w-50}" y="${Y(-m*.7)}" class="u3tick" fill="${PC[pb]}">${H.esc(p.names[1].split(' ').pop())} ahead</text>
  ${pts.map(x=>`<circle cx="${X(x[0]).toFixed(1)}" cy="${Y(x[1]).toFixed(1)}" r="3" fill="${x[1]>=0?PC[pa]:PC[pb]}" opacity=".55"><title>${H.esc(x[2].pollster)} ${H.esc(x[2].dates)}: ${x[2].a}–${x[2].b}</title></circle>`).join('')}
  <polyline points="${roll.map(x=>X(x[0]).toFixed(1)+','+Y(x[1]).toFixed(1)).join(' ')}" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/></svg>
  <p class="note">Dots = individual polls (margin, ${H.esc(p.names[0].split(' ').pop())} minus ${H.esc(p.names[1].split(' ').pop())}); line = rolling average of 5. Our quality-weighted average is above.</p></div>`}
// ---- candidates & race blocks ----
function avatar(name,party){const ph=P?.photos?.[name];const ini=H.esc(name.split(' ').filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).slice(0,2).join(''));const c=PC[party]||'#636366';
 return ph?.url?`<img class="u3av" src="${H.esc(ph.url)}" alt="" loading="lazy" style="border-color:${c}" onerror="this.outerHTML='<span class=&quot;u3av ini&quot; style=&quot;background:${c}&quot;>${ini}</span>'">`:`<span class="u3av ini" style="background:${c}">${ini}</span>`}
function cands(r){const names={};(r.odds||[]).forEach(o=>o.outcomes.forEach(x=>{const k=x.name.split(' ').pop().toLowerCase();(names[k]=names[k]||{name:x.name,party:x.party,ps:[]}).ps.push(x.p);if(!names[k].party)names[k].party=x.party}));
 return Object.values(names).map(x=>({...x,p:x.ps.reduce((a,b)=>a+b,0)/x.ps.length})).sort((a,b)=>b.p-a.p).slice(0,3)}
// ---- map (d3-zoom: pinch, pan with momentum, double-tap, semantic zoom) ----
let MS=null;
function mapBox(){const ty=new Set([...E.races,...Object.values(P?.model?.races||{})].map(r=>r.type));if(!['sen','gov','pres','base','bench'].includes(layer)||(layer==='pres'&&!ty.has('president'))||(layer==='sen'&&!ty.has('senate')))layer=ty.has('president')?'pres':ty.has('senate')?'sen':'base';
 return `<div class="pchips">${[['pres','President','president'],['sen','Senate','senate'],['gov','Governor','governor'],['bench','50/50 lines','bench'],['base','2024 result',null]].filter(x=>!x[2]||ty.has(x[2])||(x[2]==='bench'&&benchRaces().length)).map(([k,n])=>`<button class="pchip ${layer===k?'on':''}" data-l="${k}">${n}</button>`).join('')}</div>
 <div class="u3map" id="mb"><svg viewBox="0 0 975 610" class="u3svg z1 ${layer==='base'||layer==='bench'?'base':''}"><g id="zg"><g class="u3st"></g><g class="u3cty"></g><path class="u3mesh"/><g class="u3glow"></g><g class="u3sl"></g><g class="u3cl"></g></g></svg>
 <div class="u3ctl"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-z="reset" aria-label="Reset">⟲</button></div><div class="u3mini" id="mini"></div><div class="u3lvl" id="lvl">National</div></div>${legend()}
 <p class="note">Pinch to zoom for county margins · tap a state for its races · <span class="gdot"></span> glow = toss-up</p>`}
function legend(){if(layer==='bench')return LIVE?`<div class="elg">D ahead ${[-10,-5,-1,1,5,10].map(d=>`<span style="background:${devCol(d)}"></span>`).join('')} R ahead</div><p class="note">Live county margin vs its 50/50 line, for each state's key race. Grey = not reporting or no key race.</p>`:`<div class="elg">D+40 ${[-40,-20,-5,5,20,40].map(m=>`<span style="background:${mCol(m)}"></span>`).join('')} R+40</div><p class="note">Each county's 50/50 line: the margin it shows in a tied statewide race (key-race states only). Beat the line and you're ahead.</p>`;
 return layer==='base'?`<div class="elg">D+40 ${[-40,-20,-5,5,20,40].map(m=>`<span style="background:${mCol(m)}"></span>`).join('')} R+40</div><p class="note">${H.esc(BASE?.label||'')} margin by county · ${H.esc(BASE?.metric||'')}</p>`
 :`<div class="elg">R likely ${[.05,.25,.45,.55,.75,.95].map(p=>`<span style="background:${pCol(p)}"></span>`).join('')} D/I likely</div><p class="note">State color = market odds (our model where there's no market); grey = no race.</p>`}
async function initMap(box){const BR={};if(layer==='bench')GEO_ST().forEach(st=>{const x=benchRaceOf(st);if(x)BR[st]=x});if(!window.d3)await loadS(D3);await geo();const d3=window.d3,svg=d3.select(box.querySelector('svg')),zg=svg.select('#zg'),typ={gov:'governor',pres:'president'}[layer]||'senate',gp=d3.geoPath();
 if(!GEO.cent){GEO.cent={};GEO.s.forEach(f=>GEO.cent['s'+f.id]=gp.centroid(f));GEO.c.forEach(f=>{GEO.cent[f.id]=gp.centroid(f);f.area=gp.area(f)})}
 svg.select('.u3st').selectAll('path').data(GEO.s).join('path').attr('d',f=>pathOf(f.geometry)).attr('data-s',f=>f.id).attr('fill',f=>{if(layer==='base'||layer==='bench')return 'transparent';const r=raceFor(f.id,typ);return r?pCol(pOf(r)):'#232325'});
 svg.select('.u3cty').selectAll('path').data(GEO.c).join('path').attr('d',f=>pathOf(f.geometry)).attr('data-c',f=>f.id).attr('fill',f=>{if(layer==='bench'){const x=BR[f.id.slice(0,2)],b=BASE?.county?.[f.id],s=BASE?.state?.[f.id.slice(0,2)];if(!x||!b||!s)return '#1a1a1c';const bn=b[0]-s[0],L=liveFor(x,f.id);return LIVE?(L?devCol(L.margin-bn):'#2c2c2e'):mCol(bn)}return mCol(LIVE?.counties?.[f.id]?.margin??BASE?.county?.[f.id]?.[0])});
 svg.select('.u3mesh').attr('d',GEO.mesh);
 const toss=GEO.s.filter(f=>[...E.races,...Object.values(P?.model?.races||{}).map(x=>({...x,fips:ST2[x.state]}))].some(r=>r.fips===f.id&&(layer==='base'?['senate','governor','president']:[typ]).includes(r.type)&&pOf(r)!=null&&pOf(r)>=.35&&pOf(r)<=.65));
 svg.select('.u3glow').selectAll('path').data(toss).join('path').attr('d',f=>pathOf(f.geometry));
 const sl=GEO.s.map(f=>{const r=raceFor(f.id,typ),c=GEO.cent['s'+f.id];return {f,r,c}}).filter(x=>x.c&&!isNaN(x.c[0]));
 svg.select('.u3sl').selectAll('text').data(sl).join('text').attr('x',d=>d.c[0]).attr('y',d=>d.c[1]).attr('text-anchor','middle').attr('class',d=>d.r&&layer!=='base'?'odd':'nm')
  .html(d=>`<tspan class="ab">${H.esc(Object.entries(ST2).find(([k,v])=>v===d.f.id)?.[0]||'')}</tspan>${d.r&&layer!=='base'&&pOf(d.r)!=null?`<tspan x="${d.c[0]}" dy="1.1em" class="pv">${pOf(d.r)>=.5?'D':'R'} ${Math.round(Math.max(pOf(d.r),1-pOf(d.r))*100)}</tspan>`:''}`);
 const sc=()=>box.querySelector('svg').clientWidth/975||.37;let lvl=0,T=d3.zoomIdentity;
 const labels=()=>{const k=T.k,s=sc(),cl=svg.select('.u3cl');if(k<6){cl.selectAll('text').remove();return}
  const x0=-T.x/k,x1=(975-T.x)/k,y0=-T.y/k,y1=(610-T.y)/k,px=k*s,min=1300/(px*px);  // names for counties >= ~36x36 px on screen; margin and votes lines need more room
  const vis=GEO.c.filter(f=>{const c=GEO.cent[f.id];return c&&c[0]>x0&&c[0]<x1&&c[1]>y0&&c[1]<y1&&f.area>min}).slice(0,260);
  cl.attr('font-size',10/(k*s)).attr('stroke-width',2.4/(k*s)).selectAll('text').data(vis,f=>f.id).join('text').attr('x',f=>GEO.cent[f.id][0]).attr('y',f=>GEO.cent[f.id][1]).attr('text-anchor','middle')
   .html(f=>{const b=BASE?.county?.[f.id],c=GEO.cent[f.id];return `<tspan class="cn">${H.esc(f.properties.name)}</tspan>${b?`<tspan x="${c[0]}" dy="1.15em" class="cm" fill="${b[0]>0?'#ffd6d1':'#d4e6ff'}">${mTxt(b[0])}</tspan><tspan x="${c[0]}" dy="1.1em" class="cv">${b[1]>=1000?(b[1]/1000).toFixed(b[1]>=1e5?0:1)+'k':b[1]} votes</tspan>`:''}`});cl.selectAll('.cm').attr('display',function(){return this.parentNode.__data__.area*px*px>2400?null:'none'});cl.selectAll('.cv').attr('display',function(){return this.parentNode.__data__.area*px*px>4200?null:'none'})};
 const level=k=>k<2?1:k<6?2:3,names=['','National','States + counties','County detail'];
 let samples=[],inert=null;
 const z=d3.zoom().scaleExtent([1,32]).translateExtent([[0,0],[975,610]]).on('start',ev=>{if(ev.sourceEvent&&inert){inert.stop();inert=null}samples=[]})
  .on('zoom',ev=>{T=ev.transform;zg.attr('transform',T);const L=level(T.k),s=sc();
   svg.select('.u3sl').attr('font-size',(L===1?10:12)/(T.k*s)).attr('stroke-width',2.6/(T.k*s));
   if(L!==lvl){lvl=L;svg.classed('z1',L===1).classed('z2',L===2).classed('z3',L===3);box.querySelector('#lvl').textContent=names[L];if(L<3)labels()}
   if(ev.sourceEvent){samples.push([performance.now(),T.x,T.y,T.k]);if(samples.length>6)samples.shift()}})
  .on('end',ev=>{labels();if(!ev.sourceEvent||samples.length<2)return;const a=samples[0],b=samples[samples.length-1],dt=b[0]-a[0];
   if(dt<=0||performance.now()-b[0]>80||Math.abs(b[3]-a[3])>.01)return;let vx=(b[1]-a[1])/dt,vy=(b[2]-a[2])/dt;if(Math.hypot(vx,vy)<.05)return;
   let last=performance.now();inert=d3.timer(()=>{const n=performance.now(),d=n-last;last=n;const f=Math.pow(.94,d/16);vx*=f;vy*=f;svg.call(z.translateBy,vx*d/T.k,vy*d/T.k);if(Math.hypot(vx,vy)<.02){inert.stop();inert=null;labels()}})});
 svg.call(z);
 const zoomTo=(f,cb)=>{const [[a,b],[c,d]]=gp.bounds(f),k=Math.min(8,.85/Math.max((c-a)/975,(d-b)/610));svg.transition().duration(650).ease(d3.easeCubicOut).call(z.transform,d3.zoomIdentity.translate(975/2,610/2).scale(Math.max(T.k,k)).translate(-(a+c)/2,-(b+d)/2)).on('end',cb||null)};
 const mini=box.querySelector('#mini');
 // taps: own pointer-based tap / double-tap detection (works the same for touch and mouse; d3 handles pinch, pan and wheel)
 let down=null,lastTap=null,tapT=null;const node=box.querySelector('svg');
 node.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now(),n:(down&&performance.now()-down.t<50?2:1)}});
 node.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>10||performance.now()-down.t>350)return;const el=document.elementFromPoint(e.clientX,e.clientY),now=performance.now();
  if(lastTap&&now-lastTap.t<320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<40){clearTimeout(tapT);lastTap=null;haptic();const r=node.getBoundingClientRect();svg.transition().duration(450).ease(d3.easeCubicOut).call(z.scaleBy,2.5,[(e.clientX-r.left)/r.width*975,(e.clientY-r.top)/r.height*610]);return}
  lastTap={t:now,x:e.clientX,y:e.clientY};clearTimeout(tapT);tapT=setTimeout(()=>{lastTap=null;pick(el)},260)});
 svg.on('dblclick.zoom',null);
 const pick=el=>{if(!el)return;if(el.dataset.c&&(lvl>1||layer==='base'||layer==='bench')){haptic();const f=GEO.c.find(x=>x.id===el.dataset.c),b=BASE?.county?.[f.id],lv=LIVE?.counties?.[f.id],st=f.id.slice(0,2);
   mini.innerHTML=`<button class="u3x" aria-label="Close">×</button><b>${H.esc(f.properties.name)}</b><span class="note">${H.esc(GEO.s.find(x=>x.id===st)?.properties.name||'')}</span><div class="u3mrow"><span>${H.esc(BASE?.label||'2024')}</span><b style="color:${b?(b[0]>0?PC.R:PC.D):''}">${b?mTxt(b[0]):'–'}</b>${b?`<span>${b[1].toLocaleString()} votes</span>`:''}${lv?`<span>Live ${lv.reporting||0}% in: ${mTxt(lv.margin)}</span>`:''}</div>${(()=>{const x=benchRaceOf(st),s=BASE?.state?.[st];if(!x||!b||!s)return '';const bn=b[0]-s[0];return `<div class="u3mrow"><span>${H.esc(x.title)}: 50/50 line</span><b>${mTxt(bn)}</b><span>model ${mTxt(bn-x.mu)}</span></div>`})()}<button class="u3go" data-st="${st}">State races ›</button>`;
   mini.classList.add('on');mini.querySelector('.u3x').onclick=e=>{e.stopPropagation();mini.classList.remove('on')};mini.querySelector('.u3go').onclick=e=>{e.stopPropagation();mini.classList.remove('on');openState(st)};return}
  const s=el.dataset.s||(el.dataset.c&&el.dataset.c.slice(0,2));if(!s)return;haptic();mini.classList.remove('on');const f=GEO.s.find(x=>x.id===s);if(lvl<2&&f)zoomTo(f,()=>openState(s));else openState(s)};
 box.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{haptic();const t=svg.transition().duration(380);b.dataset.z==='in'?t.call(z.scaleBy,2):b.dataset.z==='out'?t.call(z.scaleBy,.5):t.call(z.transform,d3.zoomIdentity);mini.classList.remove('on')});
 svg.call(z.transform,d3.zoomIdentity);MS={svg,z}}
const ST2={AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'};
// ---- signals ----
const SIGX={
 generic:{means:s=>`Voters prefer ${s.lean==='D'?'Democrats':'Republicans'} for Congress by ${s.value.replace(/^[DR]\+/,'')} pts nationally (average of aggregators).`,
  what:'Pollsters ask “If the election for Congress were held today, would you vote for the Democratic or the Republican candidate in your district?” Several aggregators average those polls; we average the aggregators.',
  read:'D+8.7 means Democrats lead that question by 8.7 points on average. Because of how districts are drawn and voters are clustered, a party usually needs a national lead of a few points to win a House majority; the size of that cushion depends on the map and is debated.',
  hist:'The president’s party has lost House seats in almost every midterm since World War II (1998 and 2002 were the exceptions). Generic-ballot polls months out are noisy and tend to sharpen in the final weeks.',
  connect:'It is the main input behind House control odds: compare it with the House card above. A wide generic lead with only modest House odds means markets doubt the polls or the map.'},
 approval:{means:s=>`${s.value} approve of the president; a weak approval rating usually costs his party seats.`,
  what:'The share of adults (or voters) who approve of the job the president is doing, averaged across polls on Wikipedia’s tracking page. Net = approve minus disapprove.',
  read:'Look at net approval and its direction. A falling net into a midterm usually means a tougher environment for the president’s party.',
  hist:'Midterms are partly a referendum on the president: low approval coincided with big midterm losses for his party in years like 2010 and 2018.',
  connect:'Feeds fundamentals models and the national environment for every race; most visible in House control odds and in Senate races in swing states.'},
 raters:{means:s=>`${s.value} race(s) where expert raters and betting markets disagree.`,
  what:'Races where the expert consensus (Cook, Sabato, Inside Elections and others) is Toss-up or Tilt but markets price one side at 70%+, or the reverse.',
  read:'A split means one side has information or a bias the other lacks. Raters move slowly and deliberately; markets move fast and can be thin.',
  hist:'Raters historically move races off Toss-up late; markets price news within minutes. The gap tends to close near Election Day.',
  connect:'Tap the race cards below to compare the rater column with the odds bar and the poll chart.'},
 momentum:{means:s=>`Biggest 7-day odds move: ${s.value} (positive = toward D).`,
  what:'The largest seven-day changes in Polymarket prices across tracked races, plus total 24h trading volume.',
  read:'Sustained moves on real volume often reflect new information (internal polls, ads, scandals) before public polls show it. Moves on thin volume can reverse.',
  hist:'Market moves are most informative when several races move the same way at once, which signals a shift in the national environment.',
  connect:'See the odds-over-time charts for the moving races, and check whether polls confirm the move.'},
 money:{means:s=>`Fundraising edge in tracked Senate races: ${s.value}.`,
  what:'Total receipts for the top Democrat and top Republican in each tracked Senate race, from FEC filings (latest quarter on file).',
  read:'Money buys late advertising and signals enthusiasm, but outside groups (super PACs) are not included here and money rarely decides a race alone.',
  hist:'Big money edges are common for incumbents and in high-profile races; they matter most in less-covered races where ads move awareness.',
  connect:'Open a race to see its money line next to its odds and polls.'},
 open:{means:s=>`${s.value} open seats this cycle (no incumbent running).`,
  what:'Races with no incumbent on the ballot, from Wikipedia’s ratings tables.',
  read:'Incumbency is usually worth a few points, so open seats flip more often than seats with a sitting member running.',
  hist:'Waves tend to show up first in open seats, where the challenger party doesn’t face an entrenched incumbent.',
  connect:'Listed races are the competitive open seats; tap through for odds and polls.'}};
function sigCard(s){const X=SIGX[s.id],c=s.lean?PC[s.lean]:'#8e8e93',sn=P?.snaps||[];const sp=s.id==='generic'?sparkS(sn.filter(x=>x.generic!=null).map(x=>[x.t,x.generic]),c):s.spark?.length>1?sparkS(s.spark.map((v,i)=>[i,v]),c):'';
 return `<button class="u3sig" data-sig="${H.esc(s.id)}" style="--lc:${c}"><span class="u3lean">${s.lean?'Leans '+s.lean:'Mixed'}</span><span class="note">${H.esc(s.title)}</span><b style="color:${s.lean?c:'#fff'}">${H.esc(s.value)}</b>${sp}<span class="u3m">${H.esc(X?X.means(s):s.detail||'')}</span><span class="u3src">${H.esc(s.url?new URL(s.url).hostname.replace('www.','').replace('en.',''):'markets + Wikipedia')} · ${H.esc(H.ago(P.generatedAt))}</span></button>`}
function sigHTML(){const S=P?.signals||[];if(!S.length)return '';return `<h4 class="dh">Signals</h4><div class="u3sg">${S.map(sigCard).join('')}</div><button class="u3how" data-how>How to put it together: fundamentals vs polls vs markets vs raters ›</button>`}
function openSig(id){const s=P.signals.find(x=>x.id===id);if(!s)return;haptic();const X=SIGX[s.id]||{},rs=(s.races||[]).map(i=>E.races.find(r=>r.id===i)).filter(Boolean);
 const sh=H.sheet(H.esc(s.title),`<div class="u3big" style="color:${s.lean?PC[s.lean]:'#fff'}">${H.esc(s.value)}</div><p>${H.esc(X.means?X.means(s):'')}</p><p class="note">${H.esc(s.detail||'')}</p>
  ${X.what?`<h4 class="dh">What the number is</h4><p>${H.esc(X.what)}</p>`:''}${X.read?`<h4 class="dh">How to read it</h4><p>${H.esc(X.read)}</p>`:''}${X.hist?`<h4 class="dh">Historical context</h4><p>${H.esc(X.hist)}</p>`:''}
  ${X.connect?`<div class="whybox"><b>How it connects to the odds</b><p>${H.esc(X.connect)}</p></div>`:''}
  <h4 class="dh">Source & date</h4><p class="note">${s.url?`<a href="${H.esc(s.url)}" target="_blank" rel="noopener">${H.esc(s.url.replace('https://',''))} ↗</a>`:'Computed from Polymarket, Kalshi and Wikipedia ratings data on this page'} · fetched ${H.esc(new Date(P.generatedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</p>
  ${rs.length?`<h4 class="dh">Races</h4>${rs.slice(0,6).map(r=>raceCard(r)).join('')}`:''}`);
 sh.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>openRace(E.races.find(r=>r.id===b.dataset.r)))}
function openHow(){H.sheet('How to put it together',`<div class="u3steps">
 <div><b>1 · Fundamentals</b><p>Start with the structure: state partisanship (PVI), incumbency, the economy and presidential approval. Midterms usually swing against the president’s party; the generic ballot and approval cards tell you how strong that headwind is this year.</p></div>
 <div><b>2 · Polls</b><p>Then check race polls against the fundamentals. One poll means little (±3–4 pts on each candidate, more on the gap); the average and its direction matter. Partisan pollsters are tagged (R)/(D) on Wikipedia.</p></div>
 <div><b>3 · Markets</b><p>Polymarket and Kalshi turn everything into a price that updates within minutes. Treat a price as a probability with noise: thin markets and partisan traders can push it around. Fast, sustained moves on volume usually mean new information.</p></div>
 <div><b>4 · Raters</b><p>Cook, Sabato, Inside Elections and others add reporting (candidate quality, money, internal polls) and move deliberately. When raters and markets disagree, that race is where the most information is.</p></div>
 <div><b>Putting it together</b><p>Agreement across all four = high confidence. Markets ahead of polls = watch for confirming polls. Polls ahead of fundamentals = check pollster quality and turnout assumptions. Raters lagging markets = they may move soon.</p></div></div><p class="note">General explainer, not a forecast.</p>`)}
// ---- trackers ----
function trackersHTML(){const R=P?.reddit;
 return `<h4 class="dh">What trackers are watching</h4>${R?.themes?.length?`<ul class="u3chg">${R.themes.map(t=>`<li><i style="background:#ff9f0a"></i><div>${H.esc(t.t)}<span class="u3src">${t.subs.map(s=>'r/'+H.esc(s)).join(', ')}</span></div></li>`).join('')}</ul><p class="note">Themes by ${H.esc(R.model||'Gemini Flash-Lite')} from post titles only · ${H.esc(R.at?H.ago(R.at):'')}</p>`:''}
 ${(R?.posts||[]).slice(0,10).map(x=>`<a class="nrow" href="${H.esc(x.url)}" target="_blank" rel="noopener"><b>${H.esc(x.title)}</b><span class="note">r/${H.esc(x.sub)} · top this week${x.date?' · '+H.esc(H.hAgo(x.date))+' ago':''}</span></a>`).join('')||'<p class="note">Reddit posts arrive with the next refresh.</p>'}
 ${R?.subs?`<p class="note">Public Reddit RSS (top of the week): ${Object.entries(R.subs).map(([s,v])=>`r/${H.esc(s)} ${v.ok?'✓':'(rate-limited, retrying)'}`).join(' · ')}</p>`:''}`}
// ---------- v5: one Brief, phase-aware (campaign · night · results · between), election-agnostic ----------
// Organized by question, not by source: Who's winning and how sure? What changed? Where is it decided? Everything else is one tap away.
const MD=()=>P?.model;
let IDX={},phase='campaign',feed='all';
const pp=p=>p==null?'–':Math.round(p*100)+'%';
const mrg=(m,s='D')=>m==null?'–':Math.abs(m)<.05?'Even':(m>=0?s+'+':'R+')+Math.abs(m).toFixed(1);   // D-terms margin -> label
const gapTxt=g=>{if(g==null)return '–';const n=Math.round(Math.abs(g)*100);return n===0?'0':(g>0?'+':'−')+n};
const gapCol=g=>g==null||Math.abs(g)<.05?'#8e8e93':g>0?PC.D:PC.R;
const TYP={senate:'Senate',governor:'Governor',president:'President'};
const STN=Object.fromEntries(Object.entries(ST2).map(([k,v])=>[v,k]));
const shortT=x=>`${x.state} ${x.type==='senate'?'Sen':x.type==='governor'?'Gov':'Pres'}`;
const lastN=n=>(n||'').trim().split(' ').pop();
const sideName=(x,s)=>lastN((x.cands||{})[s])||({D:'Democrats',R:'Republicans',I:'the independent'}[s]||s);
const matchup=x=>{const a=lastN((x.cands||{})[x.dside]),b=lastN((x.cands||{}).R);return a&&b?`${a}–${b}`:''};
const comp=x=>[x.model,x.mkt].some(v=>v!=null&&v>=.1&&v<=.9);
const ctLabel=c=>c?.label?.toLowerCase().startsWith('presiden')?'White House':c?.label||'';
const unitS=c=>c?.unit==='electoral votes'?'EV':(c?.unit||'seats');
const daysTo=d=>Math.ceil((new Date(d+'T00:00:00-08:00')-Date.now())/864e5);
function verdict(x){if(x.model==null)return '';const q=Math.max(x.model,1-x.model),s=x.model>=.5?x.dside:'R';
 const lab=q<.6?'Toss-up':q<.75?`Lean ${s}`:q<.9?`Likely ${s}`:`Safe ${s}`;
 const ag=x.gap==null?'no market':Math.abs(x.gap)<.07?'markets agree':`markets ${x.gap<0?'more':'less'} bullish on ${sideName(x,x.dside)}`;
 const nat=x.type==='governor'?'':x.candidateDriven?'candidate-driven':x.over!=null?'rides the national tide':'';
 return [lab,ag,nat,x.fundOnly?'no public polls':'',x.open?'open seat':''].filter(Boolean).join(' · ')}
const MX=()=>MD()?.races||{};
function raceObj(id){const r=E.races.find(z=>z.id===id),x=MX()[id];return r||(x?{id,type:x.type,state:x.state,fips:ST2[x.state],title:x.title,odds:[]}:null)}

// ---- shared rows ----
function rowHead(lev){return `<div class="v5rh"><span></span><span>Model</span><span>Mkt</span>${lev?'<span>Leverage</span>':'<span>Gap</span>'}</div>`}
function raceRow(x,top,lev){const c=x.model>=.5?PC[x.dside]:PC.R;
 return `<button class="v5row" data-r="${H.esc(x.id)}"><span class="v5t"><b>${H.esc(x.title||x.id)}</b><i>${H.esc([matchup(x),x.fundOnly?'no polls':''].filter(Boolean).join(' · '))}</i></span>
  <span class="v5n" style="color:${c}">${x.model>=.5?x.dside:'R'} ${pp(Math.max(x.model,1-x.model))}</span><span class="v5m">${x.mkt==null?'–':pp(x.model>=.5?x.mkt:1-x.mkt)}</span>
  ${lev?`<span class="v5lev"><i style="width:${Math.round((x.leverage||0)/Math.max(1e-4,top)*100)}%"></i></span>`:`<span class="v5g" style="color:${gapCol(x.gap)}">${gapTxt(x.gap)}</span>`}</button>`}

// ---- the Brief ----
function topline(){const m=MD();if(!m)return chamberFallback();
 const sc=m.scorecard;
 return `<div class="v5top">${(m.order||[]).map(id=>{const c=m.contests[id];if(!c)return '';const h=P?.hist?.[(E.contests||[]).find(z=>z.id===id)?.market||id+'-control'];
  if(c.pControl==null&&c.market==null)return '';if(c.pControl==null)return `<div class="v5k"><span class="note">${H.esc(c.label)}</span><b style="color:${c.market>=.5?PC.D:PC.R}">${c.market==null?'–':(c.market>=.5?'D ':'R ')+pp(Math.max(c.market,1-c.market))}</b><span class="note">markets${h?.pts?.length>2?' '+sparkS(h.pts,'#636366'):''}</span></div>`;
  const a=sc?.contests?.[id];
  return `<div class="v5k"><span class="note">${H.esc(c.label)}${m.frozen?' · final forecast':''}</span><b style="color:${c.pControl>=.5?PC.D:PC.R}">${c.pControl>=.5?'D':'R'} ${pp(Math.max(c.pControl,1-c.pControl))}</b>
   <span class="note">model · mkt ${c.market==null?'–':(c.pControl>=.5?'D ':'R ')+pp(c.pControl>=.5?c.market:1-c.market)}${h?.pts?.length>2?' '+sparkS(h.pts.slice(-45),'#636366'):''}</span>
   <span class="v5sub">${a?`Actual <b>${a.actual}</b> ${unitS(c)} · forecast ~${Math.round(c.seatsMean)} (${c.p10}–${c.p90}) ${a.inRange?'✓':'✗'}`:`~${Math.round(c.seatsMean)} ${unitS(c)} for D (${c.p10}–${c.p90})`}</span></div>`}).join('')}</div>`}
function chamberFallback(){const ch=E.races.filter(r=>r.type==='chamber'&&r.pD!=null);if(!ch.length)return '';
 return `<div class="v5top">${ch.map(r=>`<div class="v5k"><span class="note">${H.esc(r.title)}</span><b style="color:${r.pD>=.5?PC.D:PC.R}">${r.pD>=.5?'D':'R'} ${pp(Math.max(r.pD,1-r.pD))}</b><span class="note">markets</span></div>`).join('')}</div>`}
const KC={tell:'#30d158',tip:'#64d2ff',week:'#30d158',fragile:'#ff9f0a',cand:'#bf5af2',gap:'#ff9f0a',pivotal:'#64d2ff'};
function readHTML(items,title){return items?.length?`<h4 class="dh">${title||'The read'}</h4><ol class="v5read">${items.map(b=>`<li${b.race?` data-r="${H.esc(b.race)}"`:''}><i style="background:${KC[b.k]||'#8e8e93'}"></i><div>${H.esc(b.t)}</div></li>`).join('')}</ol>`:''}
function decidesHTML(n=5){const m=MD();if(!m?.primary)return '';const c=m.contests[m.primary];
 const xs=Object.values(m.races).filter(x=>x.contest===m.primary&&(x.leverage>0||comp(x))).sort((a,b)=>(b.leverage||0)-(a.leverage||0)).slice(0,n);if(!xs.length)return '';
 const top=xs[0].leverage||1e-4,gov=Object.values(m.races).filter(x=>x.type==='governor'&&Math.abs(x.model-.5)<.25&&!(m.contests.governor)).sort((a,b)=>Math.abs(a.model-.5)-Math.abs(b.model-.5));
 return `<h4 class="dh">Decides ${H.esc(c.label.toLowerCase()==='president'?'the presidency':c.label+' control')}</h4>${rowHead(true)}${xs.map(x=>raceRow(x,top,true)).join('')}
  ${gov.length?`<button class="v5link" data-v2="races">Governors: ${gov.length} competitive · closest ${gov.slice(0,2).map(x=>`${x.state} (${x.model>=.5?x.dside:'R'} ${pp(Math.max(x.model,1-x.model))})`).join(', ')}</button>`:''}
  <button class="v5link" data-v2="races">All races and the map →</button>`}
function weekHTML(){const m=MD(),seen=new Set((m?.read||[]).map(b=>b.t)),items=[];
 for(const w of [...(m?.week||[]),...(P?.overview?.changes||[])]){const k=(w.race||'')+(w.src||'')+(w.race?'':(w.t||w.text));if(seen.has(k)||seen.has(w.t))continue;seen.add(k);items.push(w);if(items.length>=4)break}
 const young=(m?.track?.days||0)<5;
 return `<h4 class="dh">This week</h4>${items.length?`<ul class="u3chg">${items.map(c=>`<li${c.race?` data-r="${H.esc(c.race)}"`:''}><i style="background:${c.lean?PC[c.lean]:'#8e8e93'}"></i><div>${H.esc(c.t||c.text)}<span class="u3src">${H.esc(c.src||'')}</span></div></li>`).join('')}</ul>`
  :`<p class="note v5quiet">${young?`Nothing has crossed a threshold yet. Week-over-week moves need 5 days of history (tracking since ${H.esc(m?.track?.since||'today')}).`:'Nothing material moved this week. Odds, polls and ratings are all within normal noise.'}</p>`}`}
function envHTML(){const g=P?.signals?.find(s=>s.id==='generic'),a=P?.signals?.find(s=>s.id==='approval'),e=MD()?.env,sn=P?.snaps||[];
 const gp=sn.filter(s=>s.generic!=null).map(s=>[s.t,s.generic]);
 if(!g&&!a)return '';
 return `<button class="v5env" data-env><span class="note">Environment</span><span>${g?`Generic <b style="color:${PC[g.lean]||'#fff'}">${H.esc(g.value)}</b>`:''}${a?` · Approval <b>${H.esc(a.value)}</b>`:''}${e?` · ${e.swing>=0?'+':''}${e.swing} swing since '24`:''}</span>${gp.length>2?sparkS(gp,PC[g?.lean]||'#8e8e93'):''}<span class="v5chev">›</span></button>`}
function openEnv(){haptic();const sh=H.sheet('National environment',`<p class="note">How the country is leaning, independent of any one race. The model turns this into each race's expected margin.</p>${sigHTML()}`);
 sh.querySelectorAll('[data-sig]').forEach(b=>b.onclick=()=>openSig(b.dataset.sig));sh.querySelector('[data-how]')?.addEventListener('click',openHow);
 sh.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>openRace(raceObj(b.dataset.r)))}
function scoreHTML(sc,name){if(!sc)return '';const cm=sc.competitive||{},mm=cm.model,mk=cm.market,c=Object.entries(sc.contests||{});
 const better=mm&&mk?(mm.brier<mk.brier-.005?'The model beat the markets':mk.brier<mm.brier-.005?'The markets beat the model':'Model and markets did about as well'):'';
 return `<section class="v5score"><div class="kicker">${H.esc(name||'Results')} · scorecard</div>
  ${c.map(([id,a])=>`<p><b>${H.esc(MD()?.contests?.[id]?.label||id)}:</b> Democrats ${a.dControl?'won':'did not win'} control with ${a.actual}. Forecast ~${Math.round(a.mean)} (${a.p10}–${a.p90}) ${a.inRange?'✓ in range':'✗ outside the range'}; model gave D ${pp(a.pControl)}, markets ${pp(a.market)}.</p>`).join('')}
  ${mm?`<div class="m4vs"><div><span class="note">Model</span><b>${mm.hits}/${mm.n}</b><span class="note">Brier ${mm.brier}</span></div><div><span class="note">Markets</span><b>${mk?mk.hits+'/'+mk.n:'–'}</b><span class="note">Brier ${mk?mk.brier:'–'}</span></div><div><span class="note">Resolved</span><b>${sc.resolved}</b><span class="note">races</span></div></div>
  <p class="note">${better} on competitive races (lower Brier is better). Graded against ${H.esc(sc.source)}; forecast as of ${H.esc((sc.forecastAsOf||'').slice(0,10))}.</p>`:'<p class="note">Results arrive as races are called.</p>'}
  ${sc.misses?.length?`<h4 class="dh">Misses</h4>${sc.misses.map(x=>`<div class="m4row" data-r="${H.esc(x.id)}"><span>${H.esc(x.title||x.id)}</span><b>model ${pp(x.model)} · mkt ${pp(x.mkt)} → ${x.won?'D/I':'R'} won</b></div>`).join('')}`:''}</section>`}
function calendarHTML(){const cal=IDX.calendar||[];return cal.length?`<h4 class="dh">On the calendar</h4>${cal.map(c=>`<div class="m4row"><span><b>${H.esc(c.name)}</b><br><span class="note">${H.esc(c.what||'')}</span></span><b>${H.esc(new Date(c.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}</b></div>`).join('')}`:''}
function briefHTML(){const m=MD();
 if(phase==='night')return `<div class="elive"><b>Election night</b> · live results updated ${H.esc(H.ago(LIVE.updated))}</div>${liveReadHTML()}<h4 class="dh">Live map</h4>${mapBox()}${topline()}${decidesHTML(6)}`;
 if(phase==='results')return `${scoreHTML(m?.scorecard,E.name)}${topline()}${readHTML(m?.read,'What the final forecast said')}${envHTML()}`;
 if(phase==='between'){const last=Object.entries(P?.scorecards||{})[0];
  return `<p class="v5lede">${m?`Early read on ${H.esc(E.name)}: fundamentals and expert ratings, few polls. Expect large moves.`:'No election is close. The national environment is the thing to watch.'}</p>${envHTML()}${m&&!m.frozen?topline()+readHTML(m.read):''}
   ${m?.frozen?scoreHTML(m.scorecard,E.name):''}${last?scoreHTML(last[1],(IDX.elections||[]).find(e=>e.id===last[0])?.name):''}${calendarHTML()}`}
 return `${topline()}${whyLine()}${readHTML(m?.read)}${decidesHTML()}${weekHTML()}${stretchHTML()}${bookLine()}${envHTML()}`}

// ---- race sheet: verdict first, detail collapsed ----
function det(t,body,open){return body?`<details class="v5d"${open?' open':''}><summary>${t}</summary>${body}</details>`:''}
function whyHTML(x){if(!x)return '';const ds=x.dside,row=(a,b,c)=>`<div class="m4row"><span>${a}</span><b${c?` style="color:${c}"`:''}>${b}</b></div>`,w=x.overWho;
 return `${x.base!=null?row('2024 president here',mrg(x.base,ds))+row(`National swing since 2024 (×${MD().params.elast[x.type]})`,(x.swing>=0?'+':'')+x.swing+` toward ${x.swing>=0?ds:'R'}`)+row('= Environment expectation',mrg(x.env,ds),x.env>=0?PC[ds]:PC.R):''}
  ${x.inc?row(`Incumbency (${x.incParty} on ballot)`,(x.inc>0?'+':'−')+Math.abs(x.inc)):''}${x.raterW?row(`Expert ratings (${H.esc(x.raterLabel||'')}, weight ${Math.round(x.raterW*100)}%)`,mrg(x.raterMargin,ds))+row('= Prior',mrg(x.prior,ds)):''}
  ${row(x.poll!=null?`Poll average (${x.nPolls} polls, weight ${Math.round(x.w*100)}%)`:'Poll average',x.poll!=null?mrg(x.poll,ds):'none, prior only')}${row('Model margin ± race error',mrg(x.mu,ds)+' ± '+x.sigma)}
  ${x.over!=null&&w&&x.type!=='governor'?`<p class="m4p">${H.esc(w.name||w.party)} (${w.party}) is running ${Math.abs(x.over)} pts ${x.over>=0===(w.party!=='R')?'ahead of':'behind'} the environment (${H.esc(x.obsSrc)} ${mrg(x.obs,ds)} vs expected ${mrg(x.env,ds)}). ${x.candidateDriven?'A candidate race: it should hold up if the national mood shifts.':'Mostly riding the national tide: if the environment moves, this race moves with it.'}</p>`:''}
  ${x.mktMargin!=null?`<p class="note">Market price implies ${mrg(x.mktMargin,ds)}.</p>`:''}`}
function raceSheet(r){const x=MX()[r.id],cs=cands(r),h=P?.hist?.[r.id],c=x?.contest&&MD().contests[x.contest];
 const ds=x?.dside||'D';
 return `${x?`<p class="v5verdict">${H.esc(verdict(x))}</p>`:''}
  ${cs.map(k=>`<div class="u3cand">${avatar(k.name,k.party)}<div class="u3cn"><b>${H.esc(k.name)}</b> <i style="color:${PC[k.party]||'#8e8e93'}">${k.party||''}</i><div class="eb"><div style="width:${Math.round(k.p*100)}%;background:${PC[k.party]||'#8e8e93'}"></div></div></div><b class="u3cp">${pct(k.p)}</b></div>`).join('')}
  ${x?`<div class="m4vs"><div><span class="note">Model</span><b style="color:${x.model>=.5?PC[ds]:PC.R}">${sideName(x,ds)} ${pp(x.model)}</b></div><div><span class="note">Markets</span><b>${pp(x.mkt)}</b></div><div><span class="note">Gap</span><b style="color:${gapCol(x.gap)}">${gapTxt(x.gap)}</b></div></div>`:''}
  ${x?.cond?`<p class="m4p"><b>What rides on it.</b> If ${H.esc(sideName(x,ds))} wins, Democrats' ${H.esc(ctLabel(c))} odds are <b>${pp(x.cond.ifD)}</b>; if ${H.esc(sideName(x,'R'))} wins, <b>${pp(x.cond.ifR)}</b>. Decides control on its own in ${pp(x.pivotal)} of simulations${x.tip?`; tipping point in ${pp(x.tip)}`:''}.</p>`:''}
  ${det('Election night: county benchmarks',x?benchHTML(x):'',!!LIVE)}${det('Why the model says this',whyHTML(x))}${det(`Polls${r.pollAvg?' · our average '+mrg(r.pollAvg.margin,ds):''}`,(pollAvgHTML(r)+pollChart(r))||'')}${det('Outside money',raceLMHTML(r))}${det('Early vote',stateEVHTML(x))}
  ${det('Odds over time',h?.pts?.length>2?lineChart([{pts:h.pts,color:PC[h.party]||PC.D,label:lastN(h.name)}],{mid:.5,h:100})+`<p class="note">${H.esc(h.name)} on Polymarket, daily.</p>`:'')}
  ${det('Expert ratings',ratingsHTML(r,true))}${det('Fundraising',moneyHTML(r))}${det('On X',xForRace(r).replace(/<h4[^>]*>On X<\/h4>/,''))}
  <p class="note esrc">${(r.odds||[]).map(o=>`<a href="${H.esc(o.url)}" target="_blank" rel="noopener">${o.src} ↗</a>`).join(' · ')}${r.odds?.length?' · ':''}updated ${H.esc(H.ago(E.generatedAt))}</p>`}
function wire(sh){sh.querySelectorAll('[data-r]').forEach(b=>b.onclick=e=>{if(e.target.closest('a,summary'))return;openRace(raceObj(b.dataset.r))})}
function openRace(r){if(!r)return;haptic();const b=r.fips&&BASE?.state?.[r.fips];fillNames(wireR(H.sheet(H.esc(r.title||r.id),`<div class="kicker">${H.esc(TYP[r.type]||'')}${b?` · 2024 president ${mTxt(b[0])}`:''}</div>${raceSheet(r)}`)))}
function wireR(sh){wire(sh);return sh}
const GEO_ST=()=>[...new Set(Object.keys(BASE?.state||{}))];
function openState(st){const f=GEO?.s.find(x=>x.id===st),b=BASE?.state?.[st],xs=Object.values(MX()).filter(x=>ST2[x.state]===st);
 const sh=H.sheet(H.esc(f?.properties.name||st),`${b?`<div class="stats up"><div class="stat">2024 president<b style="color:${b[0]>0?PC.R:PC.D}">${mTxt(b[0])}</b></div><div class="stat">Votes cast<b>${b[1].toLocaleString()}</b></div></div>`:''}
  ${xs.length?rowHead(false)+xs.map(x=>raceRow(x,1,false)).join(''):'<p class="note">No tracked race here this cycle.</p>'}`);wire(sh)}

// ---- Races ----
function racesHTML(){const m=MD();if(!m)return `${mapBox()}<p class="note">Race list appears with the model.</p>`;
 const R=Object.values(m.races),cs=(m.order||[]).map(id=>m.contests[id]).filter(c=>c?.pControl!=null),shown=new Set();
 let out=mapBox();
 for(const c of cs){const xs=R.filter(x=>x.contest===c.id&&(comp(x)||x.leverage>.002)).sort((a,b)=>(b.leverage||0)-(a.leverage||0));xs.forEach(x=>shown.add(x.id));
  if(xs.length)out+=`<h4 class="dh">${H.esc(c.label)} · sorted by leverage</h4>${rowHead(true)}${xs.map(x=>raceRow(x,xs[0].leverage||1e-4,true)).join('')}`}
 const gov=R.filter(x=>x.type==='governor'&&comp(x)&&!shown.has(x.id)).sort((a,b)=>Math.abs(a.model-.5)-Math.abs(b.model-.5));gov.forEach(x=>shown.add(x.id));
 if(gov.length)out+=`<h4 class="dh">Governors · closest first</h4>${rowHead(false)}${gov.map(x=>raceRow(x,1,false)).join('')}`;
 const rest=R.filter(x=>!shown.has(x.id)&&x.type!=='president').sort((a,b)=>Math.abs(a.model-.5)-Math.abs(b.model-.5));
 if(rest.length)out+=det(`Not competitive (${rest.length})`,rowHead(false)+rest.map(x=>raceRow(x,1,false)).join(''));
 const nm=(m.order||[]).map(id=>m.contests[id]).filter(c=>c&&c.pControl==null);
 return out+nm.map(c=>`<p class="note"><b>${H.esc(c.label)}:</b> markets D ${pp(c.market)}. ${H.esc(c.note||'')}</p>`).join('')}

// ---- Under the hood ----
function seatHist(S){const h=S.hist||{},ks=Object.keys(h).map(Number).sort((a,b)=>a-b);if(!ks.length)return '';
 const lo0=Math.min(ks[0],S.p10-1),hi0=Math.max(ks[ks.length-1],S.p90+1),bw0=Math.max(1,Math.ceil((hi0-lo0+1)/26)),lo=Math.floor(lo0/bw0)*bw0,nb=Math.ceil((hi0-lo+1)/bw0);
 const bins=Array.from({length:nb},(_,i)=>({k:lo+i*bw0,v:0}));ks.forEach(k=>{bins[Math.floor((k-lo)/bw0)].v+=h[k]});
 const w=340,hh=120,bw=(w-20)/nb,mx=Math.max(...bins.map(b=>b.v)),wa=S.winAt;
 let bars='';bins.forEach((b,i)=>{const bh=b.v/mx*(hh-34),x=10+i*bw,mid=b.k+(bw0-1)/2;
  bars+=`<rect x="${(x+1).toFixed(1)}" y="${(hh-20-bh).toFixed(1)}" width="${Math.max(1,bw-2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${mid>=wa?PC.D:PC.R}" opacity="${b.k+bw0-1>=S.p10&&b.k<=S.p90?.95:.45}"><title>${bw0>1?b.k+'–'+(b.k+bw0-1):b.k}: ${(b.v*100).toFixed(1)}%</title></rect>`;
  if(nb<=14||i%Math.ceil(nb/8)===0)bars+=`<text x="${(x+bw/2).toFixed(1)}" y="${hh-6}" text-anchor="middle" class="u3tick">${b.k}</text>`});
 const lx=10+(wa-lo)/bw0*bw;
 return `<svg viewBox="0 0 ${w} ${hh}" class="u3chart">${bars}<line x1="${lx.toFixed(1)}" x2="${lx.toFixed(1)}" y1="4" y2="${hh-18}" class="u3mid"/><text x="${(lx+3).toFixed(1)}" y="12" class="u3tick">${wa} = D control</text></svg>
  <p class="note">Democratic ${H.esc(S.unit||'seats')} across ${(MD().params.sims/1000)|0}k simulations${S.unit==='seats'?' (independents counted with Democrats)':''}. Bright bars = 80% range.</p>`}
function hoodHTML(){const m=MD();if(!m)return '<p class="note" style="padding:20px">The model appears after the next data refresh (it needs the national environment and the 2024 baseline).</p>';
 const R=Object.values(m.races),e=m.env,D=m.disagree||[],SD=[['model','Model'],['market','Mkt'],['raters','Raters'],['polls','Polls']];
 const tr=x=>`<tr data-r="${H.esc(x.id)}"><td><b>${H.esc(shortT(x))}</b>${x.fundOnly?' <i class="m4fo">no polls</i>':''}</td><td style="color:${x.model>=.5?PC[x.dside]:PC.R}">${x.dside} ${pp(x.model)}</td><td>${pp(x.mkt)}</td><td style="color:${gapCol(x.gap)}">${gapTxt(x.gap)}</td>`;
 let out=`${m.frozen?`<p class="note v5quiet">Frozen: this is the final pre-election forecast (${H.esc((m.asof||'').slice(0,10))}).</p>`:''}${readHTML(m.brief,'All takeaways')}${m.book?.positions?.length?`<h4 class="dh">Paper book · model vs markets</h4>${bookHTML(true)}`:''}${m.why?.day||m.why?.week?whyBlock(m.why.week||m.why.day,m.why.week?'What moved the forecast this week':'What moved the forecast since yesterday'):''}
  <h4 class="dh">The environment</h4><div class="u3kgrid"><div class="u3k"><span class="note">National now (${H.esc(e.source==='generic'?'generic ballot':e.source)})</span><b style="color:${e.national>=0?PC.D:PC.R}">${mrg(e.national)}</b></div><div class="u3k"><span class="note">2024 national vote</span><b style="color:${e.natl2024>=0?PC.D:PC.R}">${mrg(e.natl2024)}</b></div></div>
  <p class="note">Swing since 2024: <b>${e.swing>=0?'+':''}${e.swing} pts toward ${e.swing>=0?'D':'R'}</b>. Every race's expectation = its 2024 presidential margin shifted by this swing.</p><button class="u3how" data-env>All environment signals →</button>`;
 for(const id of m.order||[]){const S=m.contests[id];if(!S||S.pControl==null)continue;const xs=R.filter(x=>x.contest===id&&(x.leverage>0||comp(x))).sort((a,b)=>(b.leverage||0)-(a.leverage||0)).slice(0,14),lt=R.filter(x=>x.contest===id).reduce((a,x)=>a+(x.leverage||0),0)||1;
  out+=`<h4 class="dh">${H.esc(S.label)} math</h4><div class="m4vs big"><div><span class="note">Model</span><b style="color:${S.pControl>=.5?PC.D:PC.R}">D ${pp(S.pControl)}</b></div><div><span class="note">Markets</span><b>D ${pp(S.market)}</b></div><div><span class="note">Avg ${unitS(S)}</span><b>${Math.round(S.seatsMean)}</b></div></div>${seatHist(S)}
   ${S.missR!=null?`<p class="m4p"><b>Fragility.</b> A ${m.params.miss}-pt polling miss toward Republicans takes D odds to <b>${pp(S.missR)}</b>; the same miss toward Democrats, <b>${pp(S.missD)}</b>. ${S.missD-S.missR>.4?'This forecast rests on the polls being roughly right.':'Fairly robust to a normal polling miss.'}</p>`:''}
   ${S.dFixed?`<p class="note">Starting point: ${S.dFixed} D/I and ${S.rFixed} R ${unitS(S)} not in the modeled races.</p>`:''}${S.note?`<p class="note">${H.esc(S.note)}</p>`:''}
   <table class="m4t"><tr><th>Race</th><th>Model</th><th>Mkt</th><th>Gap</th><th>Leverage</th><th>Tip pt</th></tr>${xs.map(x=>tr(x)+`<td><div class="m4bar"><i style="width:${Math.round((x.leverage||0)/Math.max(1e-4,xs[0].leverage||1e-4)*100)}%"></i><span>${pp((x.leverage||0)/lt)}</span></div></td><td>${pp(x.tip)}</td></tr>`).join('')}</table>
   <p class="note"><b>Leverage</b> = share of simulations where the race is within ${m.params.close} pts <i>and</i> decides control on its own. <b>Tip pt</b> = how often it delivers the majority.</p>
   ${S.paths?.length?`<details class="v5d"><summary>Most common paths to ${S.winAt}</summary>${S.paths.slice(0,5).map(p=>`<div class="m4path"><b>${pp(p.p)}</b><span>${p.flips.length?p.flips.map(i=>`<span class="chip b">flip ${H.esc(i.split('-')[0])}</span>`).join(' '):'<span class="note">no flips</span>'}</span></div>`).join('')}<p class="note">Combinations of seats changing hands in simulations where Democrats win. Many are near-ties: the national error moves everything together.</p></details>`:''}`}
 const sen=R.filter(x=>x.type==='senate'&&x.over!=null&&comp(x)).sort((a,b)=>Math.abs(b.over)-Math.abs(a.over)),om=Math.min(20,Math.max(10,...sen.map(x=>Math.abs(x.over))));
 if(sen.length)out+=`<h4 class="dh">Candidate effects · Senate</h4><p class="note">Observed margin minus the environment expectation. Right = the D/I side runs ahead; left = the Republican does. Solid = candidate-driven (${m.params.cand_flag}+ pts).</p>
  <div class="m4ov">${sen.map(x=>{const v=x.over,wd=Math.min(1,Math.abs(v)/om)*50,c=v>=0?PC[x.dside]:PC.R;return `<button class="m4ovr" data-r="${H.esc(x.id)}"><span class="m4ovl">${H.esc(shortT(x))}</span><span class="m4ovb"><i style="left:${v>=0?50:50-wd}%;width:${wd}%;background:${c}${x.candidateDriven?'':';opacity:.55'}"></i><em></em></span><span class="m4ovv" style="color:${c}">${v>=0?'+':'−'}${Math.abs(v)}</span><span class="m4ovw">${H.esc(lastN(x.overWho?.name))}${x.obsSrc==='market-implied'?' · mkt':''}</span></button>`}).join('')}</div>`;
 if(D.length)out+=`<h4 class="dh">Disagreement index</h4><p class="note">Model vs markets, and who sides with whom (blue = favors the D/I side).</p>${D.map(d=>{const x=m.races[d.id];return x?`<button class="m4dis" data-r="${H.esc(d.id)}"><div><b>${H.esc(x.title)}</b><span class="note">model ${pp(x.model)} · mkt ${pp(x.mkt)}${x.fundOnly?' · no polls, low confidence':''}</span></div><b style="color:${gapCol(d.gap)}">${gapTxt(d.gap)}</b><div class="m4sd">${SD.filter(([k])=>k in d.sides).map(([k,n])=>`<span style="background:${d.sides[k]?PC[x.dside]:PC.R}33;color:${d.sides[k]?PC[x.dside]:PC.R}">${n}</span>`).join('')}</div></button>`:''}).join('')}`;
 const he=Object.entries(E.house_effects||{}).filter(([,v])=>Math.abs(v)>=.5).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,10);
 if(he.length)out+=det('Pollster house effects',`<p class="note">How far each pollster has leaned vs other polls of the same races (pooled across races, shrunk toward zero). Removed before averaging.</p>${he.map(([k,v])=>`<div class="m4row"><span>${H.esc(k.replace(/\b\w/g,c=>c.toUpperCase()))}</span><b style="color:${v>0?PC.D:PC.R}">${v>0?'D':'R'}+${Math.abs(v)}</b></div>`).join('')}`);
 const sc=Object.entries(P?.scorecards||{});
 return out+`${sc.map(([id,s])=>scoreHTML(s,(IDX.elections||[]).find(e=>e.id===id)?.name)).join('')}<button class="u3how" data-mhow>How the model works (and what it can't see)</button>${det('Forecasters, raters and how to read them',modelsHTML())}
  <p class="note">Forecast logged daily since ${H.esc(m.track?.since||'today')} so model and markets get graded against results. Updated ${H.esc(H.ago(m.asof))}.</p>`}
function openMHow(){const p=MD()?.params||{};H.sheet('How the model works',`<div class="u3steps">
 <div><b>1 · Expected margin</b><p>The state's 2024 presidential margin, shifted by the national swing (the national margin now minus the 2024 popular vote). Governors inherit ${Math.round((p.elast?.governor||.8)*100)}% of the swing. Incumbents on the ballot get ${p.inc?.senate} pts (Senate) / ${p.inc?.governor} (governor). The prior then blends in the expert-rating consensus (Senate ${Math.round((p.rater_w?.senate??.5)*100)}%, governors ${Math.round((p.rater_w?.governor??1)*100)}%, president ${Math.round((p.rater_w?.president??.3)*100)}%).</p></div>
 <div><b>2 · Blend with polls</b><p>Our polling average weights each poll by recency (14-day half-life), sample size, likely vs registered voters, and halves party-sponsored polls; each pollster's house lean, measured across every race we track, is removed; fabricators are excluded. It counts as n<sub>eff</sub>/(n<sub>eff</sub>+${p.poll_k}) of the margin, capped at ${Math.round((p.poll_cap||.85)*100)}%. Unpolled races run on the prior with a wider error.</p></div>
 <div><b>Why it moved · paper book</b><p>Daily attribution swaps inputs in one at a time (national → ratings → polls) and weights each race by how much it moves control. The paper book buys $100 of the model's side whenever model and market disagree by 10+ pts and tracks closing-line value and P&amp;L: the model has to earn its keep against the market.</p></div>
 <div><b>Final-stretch tells</b><p>Early vote (UF Election Lab) and late outside money (FEC 24/48-hour reports) don't change the math; they surface in This week when they cross a threshold, weighted toward races that decide control.</p></div>
 <div><b>3 · Correlated simulation</b><p>${(p.sims||20000).toLocaleString()} runs, each with one national error (σ ${p.sig_nat} pts) shared by every race plus a race error. That's why races aren't independent coin flips: a polling miss hits them all at once. The fragility line reruns everything with a ${p.miss}-pt miss each way.</p></div>
 <div><b>4 · Any election</b><p>Each election declares its contests: Senate seats now, electoral votes in 2028 (every state modeled from the baseline, weighted by electoral votes). Same outputs: control odds, distribution, tipping point, leverage, conditional odds, paths.</p></div>
 <div><b>5 · Accountability</b><p>The model never sees market prices, so gaps are real disagreements. A snapshot is logged daily; after Election Day the last pre-election forecast is frozen and graded against results (Brier score, model vs markets).</p></div>
 <div><b>Blind spots</b><p>Uniform swing ignores realignment (e.g. Hispanic voters in South Texas); the generic ballot stands in for a presidential national average until one is wired; no pollster-quality weighting yet (Wikipedia's last 5 polls); no money, early-vote or special-election inputs; the House isn't modeled. A disciplined second opinion, not an oracle.</p></div></div>`)}

// ---- Feed: news, X and trackers in one place ----
function feedHTML(){const st=P?.stream||[],xs=P?.x?.posts||[],R=P?.reddit;
 const chips=`<div class="pchips">${[['all','All'],['news','News'],['x','X'],['reddit','Trackers']].map(([k,n])=>`<button class="pchip ${feed===k?'on':''}" data-feed="${k}">${n}</button>`).join('')}</div>`;
 const news=n=>(st.slice(0,n).map(storyCard).join('')||'<p class="note">No stories yet.</p>');
 const xx=(f,n)=>{const ps=f==='bal'?balanced(xs):xs.filter(x=>x.lean===f);return ps.slice(0,n).map(xPost).join('')||'<p class="note">No posts yet.</p>'};
 if(feed==='news')return chips+news(40)+`<p class="note">POLITICO, The Hill, NPR and Google News RSS. Summaries by Gemini Flash-Lite from headlines/snippets only.</p>`;
 if(feed==='x')return chips+`<div class="pchips">${[['bal','Balanced'],['left','Left'],['right','Right'],['center','Nonpartisan'],['analyst','Analysts']].map(([k,n])=>`<button class="pchip ${xf===k?'on':''}" data-xf="${k}">${n}</button>`).join('')}</div>${xx(xf,40)}<p class="note">Curated, balanced account list. Lean labels describe the account, not the post.</p>`;
 if(feed==='reddit')return chips+trackersHTML();
 return chips+`<h4 class="dh">News</h4>${news(5)}${st.length>5?`<button class="v5link" data-feed="news">All ${st.length} stories →</button>`:''}<h4 class="dh">On X · balanced</h4>${xx('bal',4)}<button class="v5link" data-feed="x">More posts →</button>
  ${R?.themes?.length?`<h4 class="dh">What trackers are discussing</h4><ul class="u3chg">${R.themes.slice(0,3).map(t=>`<li><i style="background:#ff9f0a"></i><div>${H.esc(t.t)}</div></li>`).join('')}</ul><button class="v5link" data-feed="reddit">Trackers →</button>`:''}`}

// ---- v6: election-night county benchmarks ----
// 50/50 line = the margin a county shows in a tied statewide race (2024 margin, shifted uniformly so the state nets to zero).
// Model line = the same shift to our forecast margin. Live: counties in vs their lines -> a uniform-swing statewide read.
const devCol=d=>d==null?'#2c2c2e':mix(d<0?[10,132,255]:[255,69,58],Math.min(1,.18+Math.abs(d)/14));   // d = R-minus-D vs line
function benchFor(x){const st=ST2[x.state],s=BASE?.state?.[st];if(!s||!BASE?.county)return null;
 const cs=Object.entries(BASE.county).filter(([f])=>f.slice(0,2)===st&&f.length===5);if(cs.length<2)return null;
 const tot=cs.reduce((a,[,v])=>a+v[1],0)||1,mu=-(x.mu??0);
 return {st,s24:s[0],tot,cs:cs.map(([f,v])=>({f,m24:v[0],v:v[1],sh:v[1]/tot,bench:v[0]-s[0],exp:v[0]-s[0]+mu})).sort((a,b)=>b.v-a.v)}}
function liveFor(x,f){const L=LIVE?.counties?.[f];if(!L)return null;const r=L.races?L.races[x.id]:L;return r&&r.margin!=null?r:null}
function projection(x,B){let w=0,d=0,n=0;for(const c of B.cs){const L=liveFor(x,c.f);if(!L)continue;const rp=Math.min(1,(L.reporting??100)/100),wt=c.v*rp;w+=wt;d+=wt*(L.margin-c.bench);n+=wt}
 return w?{margin:d/w,inShare:n/B.tot}:null}
function benchRaces(){const m=MD();if(!m)return [];const xs=Object.values(m.races).filter(x=>x.type!=='president'||comp(x));
 return xs.filter(x=>comp(x)||x.leverage>.01).sort((a,b)=>(b.leverage||0)-(a.leverage||0)||Math.abs(a.model-.5)-Math.abs(b.model-.5))}
function benchRaceOf(st){const xs=benchRaces().filter(x=>ST2[x.state]===st);return xs.find(x=>x.contest===MD().primary)||xs[0]}
let CN=null;async function cnames(){if(CN)return CN;try{await geo();CN=Object.fromEntries(GEO.c.map(f=>[f.id,f.properties.name]))}catch(e){CN={}}return CN}
function benchHTML(x){const B=benchFor(x);if(!B)return '';const ds=x.dside,dn=sideName(x,ds),pr=LIVE&&projection(x,B);
 const big=B.cs.slice(0,6),bell=B.cs.filter(c=>c.sh>=.01&&!big.includes(c)).sort((a,b)=>Math.abs(a.bench)-Math.abs(b.bench)).slice(0,3);
 const row=c=>{const L=liveFor(x,c.f),dv=L?L.margin-c.bench:null;
  return `<tr><td><b data-cn="${c.f}">${c.f}</b><span class="note">${(c.sh*100).toFixed(c.sh<.1?1:0)}% of vote</span></td><td>${mTxt(c.m24)}</td><td><b>${mTxt(c.bench)}</b></td><td>${mTxt(c.exp)}</td>${LIVE?`<td style="color:${dv==null?'#8e8e93':dv<0?PC[ds]:PC.R}">${L?`${mTxt(L.margin)}<span class="note">${L.reporting??'–'}% in · ${Math.abs(dv)<.05?'on the line':`${dv<0?ds:'R'} +${Math.abs(dv).toFixed(1)}`}</span>`:'–'}</td>`:''}</tr>`};
 const head=`<tr><th>County</th><th>2024</th><th>50/50</th><th>Model</th>${LIVE?'<th>Live</th>':''}</tr>`;
 return `<p class="m4p">${H.esc(dn)} needs each county to beat its <b>50/50 line</b> (what it looks like in a tied race). The <b>model line</b> is what our forecast (${mrg(x.mu,ds)}) expects. Read early returns as distance from the line, not as wins and losses.</p>
  ${pr?`<div class="v5live"><span class="note">Counties in so far point to</span><b style="color:${pr.margin<0?PC[ds]:PC.R}">${mTxt(pr.margin)}</b><span class="note">statewide (${Math.round(pr.inShare*100)}% of expected vote) · model ${mrg(x.mu,ds)}</span></div>
   <p class="note">Uniform-swing read. Early counts are often one vote type (mail or Election Day), which leans one way and reverses later: trust it more as more counties pass 50% in.</p>`:''}
  <table class="m4t v6t">${head}${big.map(row).join('')}${bell.length?`<tr><th colspan="${LIVE?5:4}">Bellwethers · voted like the state in 2024</th></tr>${bell.map(row).join('')}`:''}</table>
  <p class="note">All margins R+/D+. 50/50 line = 2024 county margin shifted ${Math.abs(B.s24).toFixed(1)} pts toward ${B.s24>0?'D':'R'}, so ${H.esc(STNAME(B.st))} nets to a tie. Tap the map's "50/50 lines" layer to see every county.</p>`}
const STNAME=st=>GEO?.s.find(f=>f.id===st)?.properties.name||STN[st]||st;
async function fillNames(root){const n=await cnames();root.querySelectorAll('[data-cn]').forEach(e=>{e.textContent=n[e.dataset.cn]||e.dataset.cn})}
function liveReadHTML(){if(!LIVE)return '';const rows=benchRaces().slice(0,8).map(x=>{const B=benchFor(x),pr=B&&projection(x,B);return pr?{x,pr}:null}).filter(Boolean);if(!rows.length)return '';
 return `<h4 class="dh">Live read · vs the lines</h4><div class="v5rh v6lr"><span></span><span>Pointing to</span><span>vs model</span></div>${rows.map(({x,pr})=>{const ds=x.dside,d=-pr.margin;
  return `<button class="v5row v6lr" data-r="${H.esc(x.id)}"><span class="v5t"><b>${H.esc(x.title)}</b><i>${Math.round(pr.inShare*100)}% in · model ${mrg(x.mu,ds)}</i></span><span class="v5n" style="color:${d>=0?PC[ds]:PC.R}">${mTxt(pr.margin)}</span><span class="v5g" style="color:${Math.abs(d-x.mu)<1?'#8e8e93':d-x.mu>0?PC[ds]:PC.R}">${d-x.mu>=0?'+':'−'}${Math.abs(d-x.mu).toFixed(1)}</span></button>`}).join('')}<p class="note">Pointing to = counties reporting, measured against their 50/50 lines (uniform swing). Last column = ahead (+) or behind (−) our forecast for the D/I side.</p>`}
// ---- v7: polling average detail, early vote, late outside money ----
const EVD=()=>P?.earlyVote,LMD=()=>P?.lateMoney;
const stName=st=>((E.races.find(r=>r.state===st&&r.type!=='chamber')?.title)||st).replace(/ (Senate|Governor|\(president\))$/,'');
const M$=v=>v>=1e6?'$'+(v/1e6).toFixed(v>=1e7?0:1)+'M':v>=1e3?'$'+Math.round(v/1e3)+'k':'$'+Math.round(v||0);
const kfm=v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?Math.round(v/1e3)+'k':String(v||0);
function pollAvgHTML(r){const a=r.pollAvg;if(!a)return '';const x=MX()[r.id],ds=x?.dside||'D';
 return `<div class="v7pa"><div><span class="note">Our average</span><b>${mrg(a.margin,ds)}</b></div><div><span class="note">Simple avg (last 5)</span><b class="v7mute">${mrg(a.simple,ds)}</b></div><div><span class="note">Polls</span><b>${a.n}</b><span class="note">≈${a.neff} independent</span></div></div>
  <table class="m4t v7pt"><tr><th>Pollster</th><th>Ended</th><th>Raw</th><th>Adj</th><th>Weight</th></tr>${a.polls.map(p=>`<tr><td><b>${H.esc(p.pollster)}</b><span class="note">${p.n?p.n.toLocaleString():'?'} ${H.esc(p.pop||'')}${p.party?` · ${p.party}-sponsored`:''}</span></td><td>${H.esc(p.end.slice(5).replace('-','/'))}</td><td>${mrg(p.raw,ds)}</td><td title="house effect ${p.house}">${mrg(p.adj,ds)}</td><td><div class="m4bar"><i style="width:${Math.round(p.share/Math.max(...a.polls.map(q=>q.share))*100)}%"></i><span>${Math.round(p.share*100)}%</span></div></td></tr>`).join('')}</table>
  <p class="note">Weighted by recency (14-day half-life), sample size, likely voters over registered, half weight for party-sponsored polls; each pollster's house lean (measured across every race we track) is removed. Pollsters caught fabricating are excluded.${a.sd!=null?` Polls disagree by ±${a.sd} pts around the average.`:''}</p>`}
function evRow(st,s,lab){return `<tr><td><b>${H.esc(lab||stName(st))}</b><span class="note">${H.esc(s.updated||'')}</span></td><td>${kfm(s.voted)}${s.d7!=null?`<span class="note">+${kfm(s.d7)} wk</span>`:s.d1!=null?`<span class="note">+${kfm(s.d1)} day</span>`:''}</td><td>${s.pct!=null?Math.round(s.pct*100)+'%':'–'}</td><td style="color:${s.lead==null?'#8e8e93':s.lead>=0?PC.D:PC.R}">${s.lead==null?'n/a':(s.lead>=0?'D+':'R+')+Math.abs(s.lead)}${s.lead7!=null&&Math.abs(s.lead7)>=.5?`<span class="note">${s.lead7>=0?'▲ D':'▼ R'} ${Math.abs(s.lead7)} wk</span>`:''}</td></tr>`}
function evTable(sts){const E_=EVD();if(!E_)return '';const rows=sts.filter(st=>E_.states[st]);if(!rows.length)return '';
 return `<table class="m4t v7ev"><tr><th>State</th><th>Cast</th><th>% of ${H.esc(E_.prevLabel||'last')}</th><th>Party (reg.)</th></tr>${rows.map(st=>evRow(st,E_.states[st])).join('')}</table>`}
const keyStates=()=>[...new Set(benchRaces().filter(x=>x.leverage>.005||(x.type==='governor'&&Math.abs(x.model-.5)<.25)).map(x=>x.state))];
function openEV(){const E_=EVD();if(!E_)return;haptic();const ks=keyStates(),rest=Object.keys(E_.states).filter(s=>!ks.includes(s)).sort((a,b)=>E_.states[b].voted-E_.states[a].voted);
 wire(H.sheet('Early vote',`<div class="v5top"><div class="v5k"><span class="note">Ballots cast</span><b>${kfm(E_.nat.voted)}</b><span class="note">${Math.round((E_.nat.pct||0)*100)}% of ${H.esc(E_.prevLabel)} total turnout</span></div></div>
  <h4 class="dh">Key states</h4>${evTable(ks)}
  <p class="note"><b>How to read it.</b> "% of ${H.esc(E_.prevLabel)}" is pace: ballots already cast vs the state's whole ${H.esc(E_.prevLabel)} turnout. "Party (reg.)" is the registered-party split of ballots cast, only in states that register by party; it is not a vote count (independents and crossover voters decide races), so watch its direction week to week, not its level. Democrats usually lead early mail and trail on Election Day.</p>
  ${det(`All states (${rest.length})`,evTable(rest))}<p class="note">Source: <a href="${H.esc(E_.url)}" target="_blank" rel="noopener">UF Election Lab</a> (${H.esc(E_.license)}), refreshed every 3 hours; week-over-week from our daily snapshots (${E_.history_days} day${E_.history_days>1?'s':''} so far).</p>`))}
function lmBar(o){const d=o.d7,r=o.r7,t=d+r||1;return `<div class="v7mb"><i style="width:${d/t*100}%;background:${PC.D}"></i><i style="width:${r/t*100}%;background:${PC.R}"></i></div>`}
function lmRow(id,o){const x=MX()[id],dp=o.dPrev/2,rp=o.rPrev/2,ch=(n,p)=>p>=2e5?`${n>=p?'▲':'▼'} ${Math.round(Math.abs(n/p-1)*100)}%`:'';
 return `<button class="v7lm" data-r="${H.esc(id)}"><span class="v5t"><b>${H.esc(x?.title||id)}</b><i>D-side ${M$(o.d7)} ${ch(o.d7,dp)} · R-side ${M$(o.r7)} ${ch(o.r7,rp)}</i></span>${lmBar(o)}</button>`}
function openLM(){const L=LMD();if(!L)return;haptic();const rs=Object.entries(L.races).sort((a,b)=>((MX()[b[0]]?.leverage||0)-(MX()[a[0]]?.leverage||0))||(b[1].d7+b[1].r7-a[1].d7-a[1].r7));
 wire(H.sheet('Outside money',`<p class="note">Super PAC and party-committee spending in Senate races over the past 7 days, from the 24/48-hour reports groups must file. Arrows compare with the prior two weeks' weekly pace. A side going quiet in a close race is a tell: parties cut races their own polling says are lost.</p>
  ${rs.map(([id,o])=>lmRow(id,o)).join('')}<p class="note">D-side = supporting the Democrat/independent or opposing the Republican; R-side the reverse. Largest ${L.items} notices since ${H.esc(new Date(Date.now()-L.windowDays*864e5).toISOString().slice(5,10).replace('-','/'))} (smallest included ${M$(L.minItem)}). Source: <a href="${H.esc(L.url)}" target="_blank" rel="noopener">FEC</a>, refreshed twice a day.</p>`))}
function stretchHTML(){const E_=EVD(),L=LMD();if(!E_&&!L)return '';const ks=keyStates();
 const evs=E_?ks.map(st=>E_.states[st]).filter(Boolean):[];const lm=L?Object.entries(L.races).filter(([id])=>MX()[id]?.leverage>.005):[];
 const dS=lm.reduce((a,[,o])=>a+o.d7,0),rS=lm.reduce((a,[,o])=>a+o.r7,0);
 return `<h4 class="dh">Final stretch</h4>${E_?`<button class="v5env" data-ev><span class="note">Early vote</span><span><b>${kfm(E_.nat.voted)}</b> ballots cast · ${Math.round((E_.nat.pct||0)*100)}% of ${H.esc(E_.prevLabel)} turnout${evs.length?` · key states ${Math.round(evs.reduce((a,s)=>a+s.voted,0)/Math.max(1,evs.reduce((a,s)=>a+s.prev,0))*100)}%`:''}</span><span class="v5chev">›</span></button>`:''}
  ${L&&lm.length?`<button class="v5env" data-lm><span class="note">Outside money · 7 days</span><span>Races that decide control: D-side <b style="color:${PC.D}">${M$(dS)}</b> · R-side <b style="color:${PC.R}">${M$(rS)}</b></span><span class="v5chev">›</span></button>`:''}`}
function stateEVHTML(x){const s=EVD()?.states?.[x?.state];if(!s)return '';const E_=EVD();
 return `<table class="m4t v7ev"><tr><th>State</th><th>Cast</th><th>% of ${H.esc(E_.prevLabel)}</th><th>Party (reg.)</th></tr>${evRow(x.state,s)}</table>${s.retD!=null?`<p class="note">Mail ballots returned: ${Math.round(s.retD*100)}% of Democratic requests vs ${Math.round(s.retR*100)}% of Republican.</p>`:''}<p class="note">Registration split of ballots cast, not votes. Watch the week-over-week direction.</p>`}
function raceLMHTML(r){const o=LMD()?.races?.[r.id];if(!o)return '';
 return `${lmBar(o)}<div class="m4row"><span>Past 7 days</span><b><span style="color:${PC.D}">D-side ${M$(o.d7)}</span> · <span style="color:${PC.R}">R-side ${M$(o.r7)}</span></b></div><div class="m4row"><span>Prior 14 days</span><b>D-side ${M$(o.dPrev)} · R-side ${M$(o.rPrev)}</b></div>
  ${o.top?.length?`<p class="note">Top spenders (3 weeks): ${o.top.map(t=>`${H.esc(t.com)} <b style="color:${PC[t.side]}">${M$(t.amt)}</b>`).join(' · ')}</p>`:''}`}
// ---- v8: what moved the forecast, and the paper book ----
const pts1=v=>`${v>=0?'+':'−'}${Math.abs(v*100).toFixed(1)}`;
function whyLine(){const m=MD(),w=m?.why?.day||m?.why?.week,c=w?.contests?.[m.primary];if(!c)return '';
 return `<button class="v8why" data-why><span>${H.esc(c.text)}</span><span class="v5chev">›</span></button>`}
function factorBars(c){const F=[['polls','New polls'],['national','National environment'],['ratings','Expert ratings'],['other','Interactions / other']].map(([k,n])=>[n,k==='other'?c.other:c.factors[k]]).filter(([,v])=>Math.abs(v)>=.0005);
 const mx=Math.max(.01,...F.map(([,v])=>Math.abs(v)));
 return F.map(([n,v])=>`<div class="v8fb"><span>${n}</span><span class="v8bar"><i style="${v>=0?'left:50%':'right:50%'};width:${Math.abs(v)/mx*50}%;background:${v>=0?PC.D:PC.R}"></i><em></em></span><b style="color:${v>=0?PC.D:PC.R}">${pts1(v)}</b></div>`).join('')||'<p class="note">No material change.</p>'}
function whyBlock(w,lab){const m=MD(),c=w?.contests?.[m.primary];if(!c)return '';
 return `<h4 class="dh">${lab}</h4><p class="m4p">${H.esc(c.text)}</p>${factorBars(c)}
  ${c.races.length?`<table class="m4t"><tr><th>Race</th><th>Win prob</th><th>Effect on control</th></tr>${c.races.map(r=>{const big=Object.entries(r.parts).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))[0];
   return `<tr data-r="${H.esc(r.id)}"><td><b>${H.esc(r.title)}</b><span class="note">${big&&Math.abs(big[1])>=.05?`${{polls:'polls',national:'national',ratings:'ratings'}[big[0]]} moved the margin ${big[1]>=0?'+':'−'}${Math.abs(big[1]).toFixed(1)} pts`:'small input changes'}</span></td><td style="color:${r.dp>=0?PC.D:PC.R}">${pts1(r.dp)}</td><td style="color:${r.contrib>=0?PC.D:PC.R}"><b>${pts1(r.contrib)}</b></td></tr>`}).join('')}</table>`:''}`}
function openWhy(){haptic();const m=MD();const sh=H.sheet('What moved the forecast',`<p class="note">Each race's margin change is split into new polls, the national environment and expert ratings (swapped in one at a time), then weighted by how much that race matters for control. Figures are Democratic ${H.esc(ctLabel(m.contests[m.primary]))} odds, in points.</p>
  ${whyBlock(m.why?.day,'Since the previous day')}${whyBlock(m.why?.week,'Over the past week')}${!m.why?.day&&!m.why?.week?'<p class="note">Attribution starts once two daily snapshots exist.</p>':''}`);wire(sh)}
const sideLbl=p=>{if(p.id.startsWith('ctl:'))return p.side==='D'?'Democrats':'Republicans';const x=MX()[p.id];return x?sideName(x,p.side==='D'?x.dside:'R'):p.side};
function bookHTML(full){const b=MD()?.book;if(!b?.positions?.length)return full?'<p class="note">No positions yet: the model and markets haven\'t disagreed by 10+ pts.</p>':'';const S=b.summary;
 const tiles=`<div class="m4vs"><div><span class="note">Positions</span><b>${S.positions}</b><span class="note">${S.open} open${S.settled?` · ${S.settled} settled`:''}</span></div>
  <div><span class="note">Markets moved</span><b><span style="color:${PC.D}">${S.clvPositive}</span> / <span style="color:${PC.R}">${S.clvNegative}</span></b><span class="note">toward / against us</span></div>
  <div><span class="note">${S.settled?'Realized':'Mark-to-market'}</span><b style="color:${(S.settled?S.realized:S.mtm)>=0?'#30d158':'#ff453a'}">${(S.settled?S.realized:S.mtm)>=0?'+':'−'}$${Math.abs(S.settled?S.realized:S.mtm).toFixed(0)}</b><span class="note">on $${S.staked.toFixed(0)} staked</span></div></div>`;
 if(!full)return tiles;
 return `${tiles}<table class="m4t v8bk"><tr><th>Position</th><th>Entry</th><th>Now</th><th>CLV</th><th>P&L</th></tr>${b.positions.map(p=>`<tr${p.id.startsWith('ctl:')?'':` data-r="${H.esc(p.id)}"`}><td><b>${H.esc(p.title)}</b><span class="note">${H.esc(sideLbl(p))} · since ${H.esc(p.opened.slice(5).replace('-','/'))} · model ${pp(p.modelNow??p.modelAtEntry)}</span></td>
  <td>${pp(p.entry)}</td><td>${p.status==='settled'?(p.won?'Won':'Lost'):pp(p.now)}</td><td style="color:${(p.clv||0)>.005?'#30d158':(p.clv||0)<-.005?'#ff453a':'#8e8e93'}">${p.clv==null?'–':Math.abs(p.clv)<.005?'0':(p.clv>=0?'+':'−')+Math.abs(p.clv*100).toFixed(0)}</td><td style="color:${(p.pnl||0)>=0?'#30d158':'#ff453a'}">${p.pnl==null?'–':(p.pnl>=0?'+':'−')+'$'+Math.abs(p.pnl).toFixed(0)}</td></tr>`).join('')}</table>
  <p class="note"><b>Rule:</b> ${H.esc(S.rule)} <b>CLV</b> (closing-line value) = how far the market has moved toward our side since entry, in points: the best early read on whether the model has an edge, long before races resolve. Hypothetical only: no fees, slippage or limits, and not a suggestion to trade (check your firm's policy on prediction markets).</p>`}
function openBook(){haptic();wire(H.sheet('Paper book',bookHTML(true)))}
function bookLine(){const b=MD()?.book;if(!b?.positions?.length)return '';const S=b.summary,v=S.settled?S.realized:S.mtm;
 return `<button class="v5env" data-book><span class="note">Paper book</span><span>${S.open} open bets vs markets · moved our way on <b style="color:${PC.D}">${S.clvPositive}</b>, against on <b style="color:${PC.R}">${S.clvNegative}</b> · <b style="color:${v>=0?'#30d158':'#ff453a'}">${v>=0?'+':'−'}$${Math.abs(v).toFixed(0)}</b></span><span class="v5chev">›</span></button>`}
// ---- shell ----
function body(p){
 if(view==='races')p.innerHTML=racesHTML();
 else if(view==='hood')p.innerHTML=hoodHTML();
 else if(view==='feed')p.innerHTML=feedHTML();
 else p.innerHTML=briefHTML();
 p.querySelectorAll('[data-r]').forEach(b=>b.onclick=e=>{if(e.target.closest('a,summary'))return;openRace(raceObj(b.dataset.r))});
 p.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>openStory(b.dataset.st));
 p.querySelectorAll('[data-env]').forEach(b=>b.onclick=openEnv);p.querySelectorAll('[data-ev]').forEach(b=>b.onclick=openEV);p.querySelectorAll('[data-why]').forEach(b=>b.onclick=openWhy);p.querySelectorAll('[data-book]').forEach(b=>b.onclick=openBook);p.querySelectorAll('[data-lm]').forEach(b=>b.onclick=openLM);p.querySelector('[data-mhow]')?.addEventListener('click',openMHow);
 p.querySelectorAll('[data-feed]').forEach(b=>b.onclick=()=>{haptic();feed=b.dataset.feed;body(p);p.closest('.escroll')?.scrollTo(0,0)});
 p.querySelectorAll('[data-xf]').forEach(b=>b.onclick=()=>{xf=b.dataset.xf;body(p)});
 p.querySelectorAll('[data-v2]').forEach(b=>b.onclick=()=>{haptic();view=b.dataset.v2;document.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x.dataset.v===view));body(p);p.closest('.escroll')?.scrollTo(0,0)});
 const mb=p.querySelector('#mb');if(mb){p.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{haptic();layer=b.dataset.l;body(p)});initMap(mb).catch(()=>{mb.innerHTML='<p class="note" style="padding:30px">Map unavailable offline.</p>'})}}
function kicker(){const d=daysTo(E.date);
 if(phase==='night')return 'Election night · live';
 if(phase==='results')return `Results · ${new Date(E.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
 if(phase==='between'){const n=(IDX.elections||[]).find(e=>e.id===IDX.next)||(d>0?E:null);return n?`Between elections · next: ${n.name}, ${Math.max(0,daysTo(n.date))} days`:'Between elections'}
 return `${new Date(E.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} · ${d>0?d+' days':d===0?'today':''}`}
async function render(app,helpers){H=helpers;
 app.innerHTML=`<div class="view"><div class="top"><button class="back" id="bk">${H.back}</button><div class="title">Politics</div></div><div class="pane escroll" id="ep"><p class="note" style="padding:30px">Loading…</p></div></div>`;
 app.querySelector('#bk').onclick=()=>location.hash='#/';const p=app.querySelector('#ep');
 try{IDX=await j('data/elections/index.json');const id=IDX.active||IDX.elections[0].id;E=await j(`data/elections/${id}.json`);
  P=await j('data/politics.json').catch(()=>null);BASE=E.baseline?await j(`data/elections/baselines/${E.baseline}.json`).catch(()=>null):null;LIVE=await j(`data/elections/live/${id}.json`).catch(()=>null)}
 catch(e){p.innerHTML='<div class="empty"><h2>No election data yet</h2><p>It arrives with the next data refresh.</p></div>';return}
 phase=LIVE?'night':(IDX.phase||'campaign');
 if(MD()&&MD().election&&MD().election!==E.id)P.model=null;   // model is for another election: don't mix
 if(!['brief','races','hood','feed'].includes(view))view='brief';
 if(!render.done){render.done=1;const pt=MD()?.contests?.[MD()?.primary];if(pt&&MD().races){const t=Object.values(MD().races).find(x=>x.contest===pt.id)?.type;layer=phase==='night'?'bench':t==='president'?'pres':t==='governor'?'gov':'sen'}}
 p.innerHTML=`<div class="ehead"><div><div class="kicker">${H.esc(kicker())}</div><h2>${H.esc(E.name)}</h2></div></div>
  <div class="pchips eseg">${[['brief','Brief'],['races','Races'],['hood','Under the hood'],['feed','Feed']].map(([k,n])=>`<button class="pchip ${view===k?'on':''}" data-v="${k}">${n}</button>`).join('')}</div><div id="eb"></div>`;
 const eb=p.querySelector('#eb');p.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{haptic();view=b.dataset.v;p.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x===b));body(eb)});body(eb)}
window.SignalElections={render};
})();
