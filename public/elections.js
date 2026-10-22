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
  <p class="note">Dots = individual polls (margin, ${H.esc(p.names[0].split(' ').pop())} minus ${H.esc(p.names[1].split(' ').pop())}); line = rolling average of 5. Latest average: ${H.esc((last>=0?p.names[0]:p.names[1]).split(' ').pop())} +${Math.abs(last).toFixed(1)}.</p></div>`}
// ---- candidates & race blocks ----
function avatar(name,party){const ph=P?.photos?.[name];const ini=H.esc(name.split(' ').filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).slice(0,2).join(''));const c=PC[party]||'#636366';
 return ph?.url?`<img class="u3av" src="${H.esc(ph.url)}" alt="" loading="lazy" style="border-color:${c}" onerror="this.outerHTML='<span class=&quot;u3av ini&quot; style=&quot;background:${c}&quot;>${ini}</span>'">`:`<span class="u3av ini" style="background:${c}">${ini}</span>`}
function cands(r){const names={};(r.odds||[]).forEach(o=>o.outcomes.forEach(x=>{const k=x.name.split(' ').pop().toLowerCase();(names[k]=names[k]||{name:x.name,party:x.party,ps:[]}).ps.push(x.p);if(!names[k].party)names[k].party=x.party}));
 return Object.values(names).map(x=>({...x,p:x.ps.reduce((a,b)=>a+b,0)/x.ps.length})).sort((a,b)=>b.p-a.p).slice(0,3)}
function whyLine(r){const w=(E.watch||[]).find(x=>x.id===r.id);if(w)return w.why.join(' · ');const b=[];if(r.pD!=null&&r.pD>=.35&&r.pD<=.65)b.push('Toss-up in the markets');if(r.ratings?.label&&/toss|tilt|lean/i.test(r.ratings.label))b.push('Raters: '+r.ratings.label);if(r.pollMarginD!=null&&Math.abs(r.pollMarginD)<5)b.push('Polls within 5 pts');if(r.ratings?.open)b.push('Open seat');return b.join(' · ')||(r.pD!=null?`Not close: markets give ${r.pD>=.5?'D/I':'R'} ${pct(Math.max(r.pD,1-r.pD))}`:'')}
function raceBlock(r){const cs=cands(r),h=P?.hist?.[r.id];
 return `<div class="u3race"><div class="u3rh"><b>${H.esc(r.title)}</b>${r.ratings?.label?`<span class="chip" style="color:${rcol(r.ratings.label)}">${H.esc(r.ratings.label)}</span>`:''}</div><p class="u3why">${H.esc(whyLine(r))}</p>
  ${cs.map(x=>`<div class="u3cand">${avatar(x.name,x.party)}<div class="u3cn"><b>${H.esc(x.name)}</b> <i style="color:${PC[x.party]||'#8e8e93'}">${x.party||''}</i><div class="eb"><div style="width:${Math.round(x.p*100)}%;background:${PC[x.party]||'#8e8e93'}"></div></div></div><b class="u3cp">${pct(x.p)}</b></div>`).join('')||'<p class="note">No market yet.</p>'}
  <p class="note esrc">${(r.odds||[]).map(o=>`<a href="${H.esc(o.url)}" target="_blank" rel="noopener">${o.src} ↗</a>`).join(' · ')} · odds updated ${H.esc(H.ago(E.generatedAt))}${cs.some(x=>P?.photos?.[x.name])?' · photos: Wikipedia':''}</p>
  ${h?.pts?.length>2?`<div class="u3pch"><b>Odds over time</b>${src('Polymarket price, '+h.name,'daily')}</div>${lineChart([{pts:h.pts,color:PC[h.party]||PC.D,label:h.name.split(' ').pop()}],{mid:.5,h:100})}`:''}
  ${pollChart(r)}${ratingsHTML(r,true)}${moneyHTML(r)}${xForRace(r)}</div>`}
function openRace(r){if(!r)return;haptic();H.sheet(H.esc(r.title),`${r.fips&&BASE?.state?.[r.fips]?`<p class="note">2024 president here: ${mTxt(BASE.state[r.fips][0])} · ${H.esc(BASE.label||'')}</p>`:''}${raceBlock(r)}`)}
function openState(st){const f=GEO?.s.find(x=>x.id===st),rs=E.races.filter(r=>r.fips===st&&r.type!=='chamber'),b=BASE?.state?.[st];
 H.sheet(H.esc(f?.properties.name||st),`<div class="kicker">State</div>${b?`<div class="stats up"><div class="stat">2024 president<b style="color:${b[0]>0?PC.R:PC.D}">${mTxt(b[0])}</b></div><div class="stat">Votes cast<b>${b[1].toLocaleString()}</b></div></div><p class="note">${H.esc(BASE.label||'')} · ${H.esc(BASE.metric||'')}</p>`:''}
  ${rs.length?rs.map(raceBlock).join(''):'<p class="note">No tracked Senate or governor race here this cycle.</p>'}`)}
// ---- map (d3-zoom: pinch, pan with momentum, double-tap, semantic zoom) ----
let MS=null;
function mapBox(){return `<div class="pchips">${[['sen','Senate odds'],['gov','Governor odds'],['base','2024 result']].map(([k,n])=>`<button class="pchip ${layer===k?'on':''}" data-l="${k}">${n}</button>`).join('')}</div>
 <div class="u3map" id="mb"><svg viewBox="0 0 975 610" class="u3svg z1 ${layer==='base'?'base':''}"><g id="zg"><g class="u3st"></g><g class="u3cty"></g><path class="u3mesh"/><g class="u3glow"></g><g class="u3sl"></g><g class="u3cl"></g></g></svg>
 <div class="u3ctl"><button data-z="in" aria-label="Zoom in">+</button><button data-z="out" aria-label="Zoom out">−</button><button data-z="reset" aria-label="Reset">⟲</button></div><div class="u3mini" id="mini"></div><div class="u3lvl" id="lvl">National</div></div>${legend()}
 <p class="note">Pinch or double-tap to zoom, drag to pan · zoom in for county margins, further for county names and votes · tap a state for its races · <span class="gdot"></span> glow = toss-up (markets 35–65%)</p>`}
function legend(){return layer==='base'?`<div class="elg">D+40 ${[-40,-20,-5,5,20,40].map(m=>`<span style="background:${mCol(m)}"></span>`).join('')} R+40</div><p class="note">${H.esc(BASE?.label||'')} margin by county · ${H.esc(BASE?.metric||'')}</p>`
 :`<div class="elg">R likely ${[.05,.25,.45,.55,.75,.95].map(p=>`<span style="background:${pCol(p)}"></span>`).join('')} D/I likely</div><p class="note">State color = average of Polymarket and Kalshi odds (updated ${H.esc(H.ago(E.generatedAt))}); grey = no ${layer==='gov'?'governor':'Senate'} race. Zoomed in, counties show the ${H.esc(BASE?.label||'2024')} margin.</p>`}
async function initMap(box){if(!window.d3)await loadS(D3);await geo();const d3=window.d3,svg=d3.select(box.querySelector('svg')),zg=svg.select('#zg'),typ=layer==='gov'?'governor':'senate',gp=d3.geoPath();
 if(!GEO.cent){GEO.cent={};GEO.s.forEach(f=>GEO.cent['s'+f.id]=gp.centroid(f));GEO.c.forEach(f=>{GEO.cent[f.id]=gp.centroid(f);f.area=gp.area(f)})}
 svg.select('.u3st').selectAll('path').data(GEO.s).join('path').attr('d',f=>pathOf(f.geometry)).attr('data-s',f=>f.id).attr('fill',f=>{if(layer==='base')return 'transparent';const r=raceFor(f.id,typ);return r?pCol(r.pD):'#232325'});
 svg.select('.u3cty').selectAll('path').data(GEO.c).join('path').attr('d',f=>pathOf(f.geometry)).attr('data-c',f=>f.id).attr('fill',f=>mCol(LIVE?.counties?.[f.id]?.margin??BASE?.county?.[f.id]?.[0]));
 svg.select('.u3mesh').attr('d',GEO.mesh);
 const toss=GEO.s.filter(f=>E.races.some(r=>r.fips===f.id&&(layer==='base'?['senate','governor']:[typ]).includes(r.type)&&r.pD!=null&&r.pD>=.35&&r.pD<=.65));
 svg.select('.u3glow').selectAll('path').data(toss).join('path').attr('d',f=>pathOf(f.geometry));
 const sl=GEO.s.map(f=>{const r=raceFor(f.id,typ),c=GEO.cent['s'+f.id];return {f,r,c}}).filter(x=>x.c&&!isNaN(x.c[0]));
 svg.select('.u3sl').selectAll('text').data(sl).join('text').attr('x',d=>d.c[0]).attr('y',d=>d.c[1]).attr('text-anchor','middle').attr('class',d=>d.r&&layer!=='base'?'odd':'nm')
  .html(d=>`<tspan class="ab">${H.esc(Object.entries(ST2).find(([k,v])=>v===d.f.id)?.[0]||'')}</tspan>${d.r&&layer!=='base'&&d.r.pD!=null?`<tspan x="${d.c[0]}" dy="1.1em" class="pv">${d.r.pD>=.5?'D':'R'} ${Math.round(Math.max(d.r.pD,1-d.r.pD)*100)}</tspan>`:''}`);
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
 const pick=el=>{if(!el)return;if(el.dataset.c&&(lvl>1||layer==='base')){haptic();const f=GEO.c.find(x=>x.id===el.dataset.c),b=BASE?.county?.[f.id],lv=LIVE?.counties?.[f.id],st=f.id.slice(0,2);
   mini.innerHTML=`<button class="u3x" aria-label="Close">×</button><b>${H.esc(f.properties.name)}</b><span class="note">${H.esc(GEO.s.find(x=>x.id===st)?.properties.name||'')}</span><div class="u3mrow"><span>${H.esc(BASE?.label||'2024')}</span><b style="color:${b?(b[0]>0?PC.R:PC.D):''}">${b?mTxt(b[0]):'–'}</b>${b?`<span>${b[1].toLocaleString()} votes</span>`:''}${lv?`<span>Live ${lv.reporting||0}% in: ${mTxt(lv.margin)}</span>`:''}</div><button class="u3go" data-st="${st}">State races ›</button>`;
   mini.classList.add('on');mini.querySelector('.u3x').onclick=e=>{e.stopPropagation();mini.classList.remove('on')};mini.querySelector('.u3go').onclick=e=>{e.stopPropagation();mini.classList.remove('on');openState(st)};return}
  const s=el.dataset.s||(el.dataset.c&&el.dataset.c.slice(0,2));if(!s)return;haptic();mini.classList.remove('on');const f=GEO.s.find(x=>x.id===s);if(lvl<2&&f)zoomTo(f,()=>openState(s));else openState(s)};
 box.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{haptic();const t=svg.transition().duration(380);b.dataset.z==='in'?t.call(z.scaleBy,2):b.dataset.z==='out'?t.call(z.scaleBy,.5):t.call(z.transform,d3.zoomIdentity);mini.classList.remove('on')});
 svg.call(z.transform,d3.zoomIdentity);MS={svg,z}}
const ST2={AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56'};
// ---- 'Where the US stands' ----
function standsHTML(){const ctl=E.races.filter(r=>r.type==='chamber'),O=P?.overview||{},sig=id=>P?.signals?.find(s=>s.id===id),sn=(P?.snaps||[]);
 const gpts=sn.filter(s=>s.generic!=null).map(s=>[s.t,s.generic]),g=sig('generic'),a=sig('approval');
 const card=(lab,big,color,spark,sub,source)=>`<div class="u3k"><span class="note">${lab}</span><b style="color:${color}">${big}</b>${spark}${sub}<span class="u3src">${source}</span></div>`;
 const ch=ctl.map(r=>{const h=P?.hist?.[r.id],fav=r.pD>=.5?'D':'R';return card(H.esc(r.title),`${fav} ${pct(Math.max(r.pD,1-r.pD))}`,PC[fav],sparkS(h?.pts,PC[fav]),arrow(ago7(h?.pts)),`Polymarket + Kalshi · ${H.esc(H.ago(E.generatedAt))}`)}).join('');
 const gen=g?card('Generic ballot',H.esc(g.value),PC[g.lean]||'#fff',sparkS(gpts,PC[g.lean]),gpts.length<2?`<span class="note">tracking since ${gpts[0]?fmtD(gpts[0][0]):'now'}</span>`:arrow(ago7(gpts),1,''),'Wikipedia avg of aggregators · fetched '+H.esc(H.ago(P.generatedAt))):'';
 const ap=a?card('Trump approval',H.esc(a.value),'#fff',a.spark?.length>1?sparkS(a.spark.map((v,i)=>[i,v]),PC.R):'',`<span class="note">net ${H.esc((a.detail.match(/net (-?[\d.]+)/)||[])[1]||'–')}</span>`,'Wikipedia polling avg · fetched '+H.esc(H.ago(P.generatedAt))):'';
 const N=O.narrative;
 return `<section class="u3stand"><div class="kicker">Where the US stands</div><div class="u3kgrid">${ch}${gen}${ap}</div>
  ${N?.text?`<p class="u3nar">${H.esc(N.text)}</p><p class="note">Written by ${H.esc(N.model||'Gemini Flash-Lite')} from the numbers on this page only (numbers are checked against them) · ${H.esc(new Date(N.generatedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</p>`:''}
  ${O.changes?.length?`<h4 class="dh">What changed this week</h4><ul class="u3chg">${O.changes.map(c=>`<li${c.race?` data-r="${H.esc(c.race)}"`:''}><i style="background:${c.lean?PC[c.lean]:'#8e8e93'}"></i><div>${H.esc(c.text)}<span class="u3src">${H.esc(c.src)}</span></div></li>`).join('')}</ul>`:'<p class="note">Weekly changes appear once a week of history has built up.</p>'}</section>`}
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
 ${R?.subs?`<p class="note">Public Reddit RSS (top of the week): ${Object.entries(R.subs).map(([s,v])=>`r/${H.esc(s)} ${v.ok?'✓':'(rate-limited, retrying)'}`).join(' · ')}</p>`:''}
 ${modelsHTML()}`}
function body(p){if(world==='intl'){p.innerHTML=`<div class="u3soon"><div class="big">🌍</div><h3>International — coming soon</h3><p>The same engine (odds, polls, raters, maps) will cover elections abroad: national elections with prediction markets and Wikipedia polling tables. The structure is ready; data sources come next.</p></div>`;return}
 const key=E.races.filter(r=>r.key&&r.type!=='chamber'),other=E.races.filter(r=>!r.key&&r.type!=='chamber');
 if(view==='dash'){const ctl=E.races.filter(r=>r.type==='chamber').map(r=>P?.hist?.[r.id]&&{pts:P.hist[r.id].pts,color:r.id.startsWith('senate')?'#64d2ff':'#bf5af2',label:r.title.split(' ')[0]}).filter(Boolean);
  const kh=E.races.filter(r=>r.type!=='chamber'&&P?.hist?.[r.id]?.pts?.length>2).slice(0,6);
  p.innerHTML=`${standsHTML()}<h4 class="dh">Map</h4>${mapBox()}${sigHTML()}${watchHTML()}
   <h4 class="dh">Odds over time</h4><div class="u3pch"><b>Chamber control (D price)</b>${src('Polymarket','daily')}</div>${lineChart(ctl,{mid:.5})}
   <div class="u3mult">${kh.map(r=>{const h=P.hist[r.id];return `<button class="u3mc" data-r="${H.esc(r.id)}"><span class="note">${H.esc(r.title)}</span>${lineChart([{pts:h.pts,color:PC[h.party]||PC.D}],{w:160,h:70,mid:.5})}<span class="u3src">${H.esc(h.name)} · Polymarket</span></button>`}).join('')}</div>
   ${P?.stream?.length?`<h4 class="dh">Politics & markets</h4>${P.stream.slice(0,3).map(storyCard).join('')}<button class="btn" data-v2="news">All ${P.stream.length} stories</button>`:''}
   <div class="elive">${LIVE?`<b>Live results</b> · updated ${H.esc(H.ago(LIVE.updated))}`:`<b>Election night</b> · live county results plug into this map on ${H.esc(E.date)} (hook ready).`}</div>`;
  p.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>{haptic();layer=b.dataset.l;body(p)});p.querySelector('[data-how]')?.addEventListener('click',openHow);
  initMap(p.querySelector('#mb')).catch(e=>{p.querySelector('#mb').innerHTML='<p class="note" style="padding:30px">Map unavailable offline.</p>'})}
 else if(view==='races')p.innerHTML=`<h4 class="dh">Key races</h4>${key.map(r=>raceCard(r)).join('')}<h4 class="dh">Everything else (${other.length})</h4>${other.map(r=>raceCard(r)).join('')}<p class="note">Odds: Polymarket (gamma API) and Kalshi (public API). Updated ${H.esc(H.ago(E.generatedAt))}.</p>`;
 else if(view==='news')p.innerHTML=`${(P?.stream||[]).map(storyCard).join('')||'<p class="note">No stories yet.</p>'}<p class="note">Free sources: POLITICO, The Hill, NPR and Google News RSS. Summaries by Gemini Flash-Lite from headlines/snippets only.</p>`;
 else if(view==='x'){const ps=P?.x?.posts||[];const f=xf==='bal'?balanced(ps):ps.filter(x=>x.lean===xf);
  p.innerHTML=`<div class="pchips">${[['bal','Balanced'],['left','Left'],['right','Right'],['center','Nonpartisan'],['analyst','Analysts']].map(([k,n])=>`<button class="pchip ${xf===k?'on':''}" data-xf="${k}">${n}</button>`).join('')}</div>${f.map(xPost).join('')||'<p class="note">No posts yet.</p>'}<p class="note">Curated, balanced account list in data/politics_x.json; updated ${H.esc(P?.x?.updated?H.ago(P.x.updated):'—')}. Lean labels describe the account, not the post.</p>`;
  p.querySelectorAll('[data-xf]').forEach(b=>b.onclick=()=>{xf=b.dataset.xf;body(p)})}
 else if(view==='trackers')p.innerHTML=trackersHTML();
 else{const pr=E.races.filter(r=>r.pollData);p.innerHTML=`${pr.map(r=>`<div class="erace" data-r="${H.esc(r.id)}"><div class="erh"><b>${H.esc(r.title)}</b></div>${pollChart(r)||pollHTML(r,true)}</div>`).join('')||'<p class="note">No polls yet.</p>'}<p class="note">${pr.length} races with Wikipedia polling tables (main matchup table, up to 20 most recent polls).</p>`}
 p.querySelectorAll('[data-r]').forEach(b=>b.onclick=e=>{if(e.target.closest('a'))return;openRace(E.races.find(r=>r.id===b.dataset.r))});
 p.querySelectorAll('[data-sig]').forEach(b=>b.onclick=()=>openSig(b.dataset.sig));p.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>openStory(b.dataset.st));
 p.querySelectorAll('[data-v2]').forEach(b=>b.onclick=()=>{view=b.dataset.v2;document.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x.dataset.v===view));body(p)})}
async function render(app,helpers){H=helpers;
 app.innerHTML=`<div class="view"><div class="top"><button class="back" id="bk">${H.back}</button><div class="title">Politics</div></div><div class="pane escroll" id="ep"><p class="note" style="padding:30px">Loading…</p></div></div>`;
 app.querySelector('#bk').onclick=()=>location.hash='#/';const p=app.querySelector('#ep');
 try{const idx=await j('data/elections/index.json');const id=idx.elections[0].id;E=await j(`data/elections/${id}.json`);
  P=await j('data/politics.json').catch(()=>null);BASE=E.baseline?await j(`data/elections/baselines/${E.baseline}.json`).catch(()=>null):null;LIVE=await j(`data/elections/live/${id}.json`).catch(()=>null)}
 catch(e){p.innerHTML='<div class="empty"><h2>No election data yet</h2><p>It arrives with the next data refresh.</p></div>';return}
 if(!['dash','races','polls','trackers','news','x'].includes(view))view='dash';
 const head=()=>{p.innerHTML=`<div class="u3world">${[['us','🇺🇸 United States'],['intl','🌍 International']].map(([k,n])=>`<button class="${world===k?'on':''}" data-w="${k}">${n}</button>`).join('')}</div>
  ${world==='us'?`<div class="ehead"><div><div class="kicker">${H.esc(E.date)} · ${days()} days</div><h2>${H.esc(E.name)}</h2></div></div><div class="pchips eseg">${[['dash','Overview'],['races','Races'],['polls','Polls'],['trackers','Trackers'],['news','News'],['x','X']].map(([k,n])=>`<button class="pchip ${view===k?'on':''}" data-v="${k}">${n}</button>`).join('')}</div>`:''}<div id="eb"></div>`;
  const eb=p.querySelector('#eb');p.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{haptic();world=b.dataset.w;head()});
  p.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{haptic();view=b.dataset.v;p.querySelectorAll('[data-v]').forEach(x=>x.classList.toggle('on',x===b));body(eb)});body(eb)};head()}
window.SignalElections={render};
})();
