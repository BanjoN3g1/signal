(()=>{
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=$('#app');
let DATA=null, WL=null, refreshing=false, tab='feed', earnSeg='upcoming';

const I={
 back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M15 18l-6-6 6-6"/></svg>',
 refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h10M4 17h7"/><path d="M18 14v6M15 17h6"/></svg>',
 feed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6"/></svg>',
 earn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 deal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>',
 learn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg>',
 play:'<svg viewBox="0 0 24 24" fill="#fff" style="width:30px;height:30px;margin-left:4px"><path d="M7 4l13 8-13 8z"/></svg>'
};

// ---------- utils ----------
const f2=n=>n==null?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const pc=n=>n==null?'—':(n>0?'+':'')+Number(n).toFixed(2)+'%';
const cls=n=>n==null?'flat':n>0.005?'pos':n<-0.005?'neg':'flat';
const PT={timeZone:'America/Los_Angeles'};
const fmtPT=iso=>{try{return new Date(iso).toLocaleString('en-US',{...PT,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' PT'}catch(e){return iso}};
const dshort=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const daysTo=d=>Math.round((new Date(d+'T12:00:00')-new Date(new Date().toLocaleDateString('en-CA',PT)+'T12:00:00'))/864e5);
const ccy=q=>q&&q.ccy==='EUR'?'€':'$';
function toast(m){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
const benchFor=g=>/^Semis/i.test(g||'')?'SOXX':/^Software/i.test(g||'')?'IGV':null;
const hue=t=>{let h=0;for(const c of t)h=(h*31+c.charCodeAt(0))%360;return h};

// ---------- watchlist ----------
function loadLocalWL(){try{return JSON.parse(localStorage.getItem('signal.wl'))}catch(e){return null}}
function saveLocalWL(w){localStorage.setItem('signal.wl',JSON.stringify(w))}
function wlTickers(){const s=[];(WL?.groups||[]).forEach(g=>g.tickers.forEach(t=>{if(!s.includes(t))s.push(t)}));return s}
function groupOf(t){for(const g of WL?.groups||[])if(g.tickers.includes(t))return g.name;return DATA?.quotes?.[t]?.group||''}

// ---------- data ----------
async function loadData(){
 try{const r=await fetch('data/feed.json?t='+Date.now(),{cache:'no-store'});if(r.ok)DATA=await r.json()}catch(e){}
 if(!WL){WL=loadLocalWL();if(!WL){try{WL=await (await fetch('watchlist_default.json')).json()}catch(e){WL=DATA?{groups:DATA.groups}:{groups:[]}}}}
}
const ago=iso=>{const m=Math.max(0,Math.round((Date.now()-new Date(iso))/6e4));return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' hr ago':Math.round(m/1440)+' days ago'};
async function doRefresh(btn){
 if(refreshing)return;refreshing=true;btn&&btn.classList.add('spin');
 const prev=DATA?.generatedAt;await loadData();
 refreshing=false;btn&&btn.classList.remove('spin');
 if(!DATA)return toast('Couldn\'t load data — check your connection');
 toast((DATA.generatedAt!==prev?'New data · ':'Latest data · ')+'updated '+ago(DATA.generatedAt));render();
}
setInterval(()=>{if(document.visibilityState==='visible')loadData().then(()=>{const st=document.querySelector('.stamp');if(st&&DATA)st.innerHTML='Updated<br>'+ago(DATA.generatedAt)})},5*60*1000);

// ---------- router ----------
window.addEventListener('hashchange',render);
function route(){const h=location.hash.replace(/^#\/?/,'').split('/');return {world:h[0]||'',tab:h[1]||'feed'}}
function render(){
 const r=route();
 if(!r.world)return renderHome();
 if(r.world==='work'){tab=r.tab;return renderWork()}
 return renderSoon(r.world);
}

// ---------- home ----------
const WORLDS=[
 {id:'work',name:'Work',sub:'Markets, earnings & deals for software + semis',glyph:'📈',c1:'#0a84ff',c2:'#5e5ce6',big:true},
 {id:'elections',name:'Elections',sub:'Maps, polls, odds & sentiment',glyph:'🗳️',c1:'#ff375f',c2:'#bf5af2'},
 {id:'news',name:'News',sub:'What happened, and why it matters',glyph:'🌍',c1:'#30d158',c2:'#64d2ff'},
 {id:'culture',name:'Pop Culture',sub:'Gaming, TV & the chatter',glyph:'🎮',c1:'#ff9f0a',c2:'#ff375f'},
 {id:'next',name:'Your call',sub:'A fifth world — you pick',glyph:'✨',c1:'#8e8e93',c2:'#48484a'}
];
function renderHome(){
 const q=DATA?.quotes||{};const s=q.SOXX,i=q.IGV;
 const now=new Date();const hr=+now.toLocaleString('en-US',{...PT,hour:'numeric',hour12:false});
 const greet=hr<5?'Late night':hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
 app.innerHTML=`<div class="view home">
  <div class="date">${now.toLocaleDateString('en-US',{...PT,weekday:'long',month:'long',day:'numeric'})}</div>
  <h1 id="greet">${greet}${localStorage.getItem('signal.name')?', '+esc(localStorage.getItem('signal.name')):''}</h1>
  <p class="lede">Pick a world.</p>
  <div class="grid">${WORLDS.map(w=>`
   <button class="tile ${w.big?'big':''} ${w.id!=='work'?'dim':''}" data-w="${w.id}">
    <div class="bg" style="background:radial-gradient(120% 90% at 100% 0%,${w.c1}55,transparent 60%),radial-gradient(100% 80% at 0% 100%,${w.c2}33,transparent 60%)"></div>
    ${w.id!=='work'?'<span class="soon">Coming soon</span>':''}
    <div class="content"><div class="glyph" style="background:linear-gradient(135deg,${w.c1},${w.c2})">${w.glyph}</div></div>
    <div class="content"><h2>${w.name}</h2><p>${w.sub}</p>
     ${w.id==='work'&&s&&i?`<div class="pulse up"><span>Software <b class="${cls(i.pct)}">${pc(i.pct)}</b></span><span>Semis <b class="${cls(s.pct)}">${pc(s.pct)}</b></span><span>${(DATA.earnings?.upcoming||[]).filter(e=>daysTo(e.date)<=7&&daysTo(e.date)>=0).length} reporting this week</span></div>`:''}
    </div>
   </button>`).join('')}</div>
  <p class="note" style="margin-top:18px;text-align:center">${DATA?`Data updated ${ago(DATA.generatedAt)} · ${fmtPT(DATA.generatedAt)}`:'Loading data…'}</p>
 </div>`;
 $('#greet').onclick=()=>{const n=prompt('What should I call you?',localStorage.getItem('signal.name')||'');if(n!==null){localStorage.setItem('signal.name',n.trim().slice(0,30));renderHome()}};
 app.querySelectorAll('.tile').forEach(b=>b.onclick=()=>location.hash='#/'+b.dataset.w+(b.dataset.w==='work'?'/feed':''));
}

function renderSoon(w){
 const W=WORLDS.find(x=>x.id===w)||WORLDS[4];
 const plans={elections:['Interactive map: states → counties','Kalshi & Polymarket odds next to polling','X / Reddit sentiment and pundit quick hits','County voting history for context'],
  news:['The headline, then why it’s happening','Historical context in plain English','What it means for markets and your work'],
  culture:['Gaming and TV news you follow','Trailers and clips in the feed','What people are saying'],
  next:['Tell me what you want here — a fifth world is yours to define']};
 app.innerHTML=`<div class="view"><div class="top"><button class="back" id="bk">${I.back}</button><div class="title">${W.name}</div></div>
  <div class="empty"><div class="big">${W.glyph}</div><h2>Coming soon</h2><p>${W.sub}.</p><ul>${(plans[w]||plans.next).map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`;
 $('#bk').onclick=()=>location.hash='#/';
}

// ---------- work shell ----------
function renderWork(){
 const titles={feed:'Feed',earnings:'Earnings',deals:'Deal Room',learn:'Learn'};
 app.innerHTML=`<div class="view">
  <div class="top"><button class="back" id="bk">${I.back}</button><div class="title">${titles[tab]||'Work'}</div>
   <div class="stamp">${DATA?`Updated<br>${ago(DATA.generatedAt)}`:''}</div>
   <button class="iconbtn" id="wl" aria-label="Edit watchlist">${I.list}</button>
   <button class="iconbtn ${refreshing?'spin':''}" id="rf" aria-label="Refresh">${I.refresh}</button></div>
  <div class="pane" id="pane"></div>
  <nav class="tabs">${[['feed','Feed',I.feed],['earnings','Earnings',I.earn],['deals','Deal Room',I.deal],['learn','Learn',I.learn]].map(([k,n,ic])=>`<button data-t="${k}" class="${tab===k?'on':''}">${ic}${n}</button>`).join('')}</nav>
 </div>`;
 $('#bk').onclick=()=>location.hash='#/';
 $('#rf').onclick=e=>doRefresh(e.currentTarget);
 $('#wl').onclick=openWatchlist;
 app.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>location.hash='#/work/'+b.dataset.t);
 const p=$('#pane');
 if(!DATA){p.innerHTML='<div class="empty"><h2>No data yet</h2><p>Tap refresh to pull the first snapshot.</p></div>';return}
 if(tab==='feed')renderFeed(p);else if(tab==='earnings')renderEarnings(p);
 else if(tab==='deals')p.innerHTML=`<div class="empty"><div class="big">💼</div><h2>Deal Room — coming next</h2><p>A short form for an anonymized deal (public or private): sector, sub-sector, rough size, deal type, your notes.</p><ul><li>Strategic rationale & the story bankers tell</li><li>Real public comps & precedent deals</li><li>Questions your VP / MD will ask</li><li>Option to talk it through with me</li></ul></div>`;
 else p.innerHTML=`<div class="empty"><div class="big">🎓</div><h2>Learn — coming next</h2><p>Bite-size lessons with optional “walk me through the numbers” and quick-check questions. A few lessons already live in your Feed.</p></div>`;
}

// ---------- sparkline ----------
function spark(h,up){
 if(!h||h.length<3)return '';
 const pts=h.slice(-30).map(x=>x.c);const mn=Math.min(...pts),mx=Math.max(...pts),W=340,H=64;
 const xy=pts.map((v,i)=>[i/(pts.length-1)*W,H-4-(mx===mn?.5:(v-mn)/(mx-mn))*(H-8)]);
 const d=xy.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
 const col=up?'#30d158':'#ff453a';const id='g'+Math.random().toString(36).slice(2,7);
 return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
 <path d="${d} L${W} ${H} L0 ${H}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------- explanations (templated from fetched facts) ----------
function whyMoved(q){
 const B=benchFor(groupOf(q.ticker));const b=B&&DATA.quotes[B];const t=q.ticker;const p=q.pct;
 if(p==null)return 'No price change available from the data source.';
 let s='';
 if(Math.abs(p)<0.75)s=`${t} barely moved last session (${pc(p)})${b?`; ${B} was ${pc(b.pct)}`:''}. A quiet tape for this name.`;
 else if(b&&t!==B){const rel=p-b.pct;
  s=Math.abs(rel)<1?`${t} ${p>0?'rose':'fell'} ${Math.abs(p).toFixed(1)}%, close to ${B} (${pc(b.pct)}) — this looks like a sector-wide move, not ${t}-specific news.`
   :`${t} ${p>0?'rose':'fell'} ${Math.abs(p).toFixed(1)}% vs ${pc(b.pct)} for ${B} — ${Math.abs(rel).toFixed(1)} points ${rel>0?'better':'worse'} than the group, which points to something stock-specific.`}
 else s=`${t} ${p>0?'rose':'fell'} ${Math.abs(p).toFixed(1)}% last session.`;
 if(q.r5!=null&&Math.abs(q.r5)>=4)s+=` Over five sessions it's ${pc(q.r5)}${q.r21!=null?`, and ${pc(q.r21)} over a month`:''}.`;
 return s;
}
function nextEarn(t){return (DATA.earnings?.upcoming||[]).find(e=>e.ticker===t)}
function lastEarn(t){return (DATA.earnings?.recent||[]).find(e=>e.ticker===t)}
function bankerAngle(q){
 const t=q.ticker,p=q.pct??0,m=q.r21??0,parts=[];
 if(p<=-5||m<=-15)parts.push('Drawdowns reopen conversations: converts (higher volatility makes the option worth more, so terms improve for the issuer), buybacks, and for weaker names, inbound M&A or activist interest. A lower stock also makes it a more expensive currency for stock-funded acquisitions.');
 else if(p>=5||m>=15)parts.push('Strength opens the equity window: follow-ons, converts at richer conversion premiums, and using stock as acquisition currency. It also re-rates the comps for everyone in the sub-sector.');
 const ne=nextEarn(t);if(ne){const d=daysTo(ne.date);if(d>=0&&d<=14)parts.push(`Reports ${d===0?'today':d===1?'tomorrow':'in '+d+' days'} (${dshort(ne.date)})${ne.epsForecast!=null?`, consensus EPS $${f2(ne.epsForecast)}`:''} — expect read-across to peers.`)}
 return parts.join(' ');
}

// ---------- feed ----------
function moverCard(q,i){
 const t=q.ticker,n=(DATA.news[t]||[]);const g=groupOf(t);const ne=nextEarn(t);const d=ne?daysTo(ne.date):null;
 return `<section class="slide"><div class="card">
  <div class="kicker"><span class="chip">${esc(g.replace(/^.*· /,''))}</span>${d!=null&&d>=0&&d<=14?`<span class="chip o">Earnings ${d===0?'today':d===1?'tomorrow':'in '+d+'d'}</span>`:''}</div>
  <div class="tkr">${esc(t)}</div><div class="nm">${esc(q.name)}${q.exchange?` · ${esc(q.exchange)}`:''}</div>
  <div class="px up"><span class="p">${ccy(q)}${f2(q.price)}</span><span class="c ${cls(q.pct)}">${pc(q.pct)}</span></div>
  ${spark(q.hist,(q.r21??q.pct??0)>=0)}
  <div class="stats up">${q.r5!=null?`<div class="stat">5 days<b class="${cls(q.r5)}">${pc(q.r5)}</b></div>`:''}${q.r21!=null?`<div class="stat">1 month<b class="${cls(q.r21)}">${pc(q.r21)}</b></div>`:''}${(()=>{const B=benchFor(g);const b=B&&DATA.quotes[B];return b&&q.pct!=null?`<div class="stat">vs ${B}<b class="${cls(q.pct-b.pct)}">${(q.pct-b.pct>0?'+':'')+(q.pct-b.pct).toFixed(2)} pts</b></div>`:''})()}</div>
  <div class="fade">
   <div class="sect"><h4>Why it moved</h4><p>${esc(whyMoved(q))}</p></div>
   ${n[0]?`<div class="sect"><h4>In the headlines</h4>${n.slice(0,1).map(h=>`<a class="hl" href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}<small>${esc(h.source)} · ${esc(fmtPT(h.date))}</small></a>`).join('')}</div>`:''}
   <div class="sect"><h4>Why it matters for you</h4><p>${esc(PROFILES[t]||'')} ${esc(bankerAngle(q))}</p></div>
  </div>
  <button class="more" data-deep="${esc(t)}">Go deeper</button>
 </div></section>`;
}
function pulseCard(){
 const Q=DATA.quotes;const s=Q.SOXX,i=Q.IGV;const names=wlTickers().filter(t=>Q[t]&&Q[t].pct!=null&&!['IGV','SOXX'].includes(t)).map(t=>Q[t]).sort((a,b)=>b.pct-a.pct);
 const up=names.slice(0,3),dn=names.slice(-3).reverse();const wk=(DATA.earnings?.upcoming||[]).filter(e=>{const d=daysTo(e.date);return d>=0&&d<=7&&wlTickers().includes(e.ticker)});
 return `<section class="slide"><div class="card pulsec">
  <div class="kicker">Market pulse · close ${esc(s?.asOf||'')}</div>
  <h3>${s&&i?`Software ${i.pct>=0?'up':'down'} ${Math.abs(i.pct).toFixed(1)}%, semis ${s.pct>=0?'up':'down'} ${Math.abs(s.pct).toFixed(1)}%`:'Today in your sectors'}</h3>
  <p class="note" style="font-size:14px;margin:0 0 6px">${s&&i?`Over a month: software ${pc(i.r21)}, semis ${pc(s.r21)}. IGV and SOXX are the yardsticks; each card shows whether a name beat or lagged its group.`:''}</p>
  <div class="sect"><h4>Leaders</h4>${up.map(q=>`<div class="mv up"><span>${q.ticker}</span><span class="${cls(q.pct)}">${pc(q.pct)}</span></div>`).join('')}</div>
  <div class="sect"><h4>Laggards</h4>${dn.map(q=>`<div class="mv up"><span>${q.ticker}</span><span class="${cls(q.pct)}">${pc(q.pct)}</span></div>`).join('')}</div>
  ${wk.length?`<div class="sect"><h4>Reporting next 7 days</h4><p>${wk.map(e=>`<b>${e.ticker}</b> ${dshort(e.date)}`).join(' · ')}</p></div>`:''}
  <div style="flex:1"></div><p class="note" style="text-align:center">Swipe up for every mover, explained ↑</p>
 </div></section>`;
}
function lessonCard(L){
 let real='';
 if(L.dynamic==='beatDown'){const ex=(DATA.earnings?.recent||[]).find(e=>e.result==='beat'&&e.reaction!=null&&e.reaction<=-3);
  if(ex)real=`<div class="sect"><h4>Real example from your watchlist</h4><p>${ex.ticker} reported ${dshort(ex.date)}: EPS $${f2(ex.eps)} vs $${f2(ex.epsForecast)} consensus — a beat — and the stock moved <span class="neg">${pc(ex.reaction)}</span> (${esc(ex.reactionWindow)}).</p></div>`}
 return `<section class="slide"><div class="card lesson">
  <div class="kicker"><span class="chip p">Lesson</span><span class="chip">${esc(L.tag)}</span></div>
  <h3>${esc(L.title)}</h3>
  <div class="fade"><p style="font-size:16px;line-height:1.5;margin:6px 0 0">${esc(L.plain)}</p>${real}
   <div class="sect"><h4>In your seat</h4><p>${esc(L.banker)}</p></div></div>
  <button class="more" data-lesson="${L.id}">${L.numbers.length?'Walk me through the numbers':'Read the full lesson'}</button>
 </div></section>`;
}
function videoCard(v,topic){
 return `<section class="slide"><div class="card vid">
  <div class="frame" data-vid="${esc(v.id)}"><img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy"><div class="play">${I.play}</div></div>
  <div class="meta"><div class="kicker"><span class="chip r">Video</span><span class="chip">${esc(topic)}</span></div>
   <h3 style="font-size:21px">${esc(v.title)}</h3>
   <p class="note">${esc(v.channel||'')}${v.length?' · '+esc(v.length):''}${v.views?' · '+esc(v.views):''}${v.age?' · '+esc(v.age):''}</p>
   <a href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener" class="note">Open on YouTube ↗</a></div>
 </div></section>`;
}
function pendingCard(t){return `<section class="slide"><div class="card"><div class="kicker"><span class="chip">${esc(groupOf(t).replace(/^.*· /,''))}</span></div><div class="tkr">${esc(t)}</div><div class="nm">Added to your watchlist</div><div class="empty" style="height:auto;flex:1"><p>No data for ${esc(t)} yet. Add it to <b>watchlist.json</b> in the repo and it shows up within ~10 minutes.</p></div></div></section>`}

function renderFeed(p){
 const Q=DATA.quotes;const tick=wlTickers().filter(t=>!['IGV','SOXX'].includes(t));
 const have=tick.filter(t=>Q[t]),missing=tick.filter(t=>!Q[t]);
 const movers=have.map(t=>Q[t]).sort((a,b)=>Math.abs(b.pct??0)-Math.abs(a.pct??0));
 const vids=[['converts','Converts 101'],['semis_cycle','Semis cycle'],['saas_valuation','Software valuation'],['capped_call','Capped calls'],['earnings','Earnings'],['market_today','Semis today']].map(([k,n])=>[(DATA.videos?.[k]||[])[0],n]).filter(x=>x[0]);
 let html=pulseCard(),li=0,vi=0;
 movers.forEach((q,i)=>{html+=moverCard(q,i);
  if(i%4===1&&LESSONS[li])html+=lessonCard(LESSONS[li++]);
  else if(i%4===3&&vids[vi]){const [v,n]=vids[vi++];html+=videoCard(v,n)}});
 while(LESSONS[li])html+=lessonCard(LESSONS[li++]);
 missing.forEach(t=>html+=pendingCard(t));
 p.innerHTML=`<div class="feed" id="feed">${html}</div>`;
 p.querySelectorAll('[data-deep]').forEach(b=>b.onclick=()=>openDeep(b.dataset.deep));
 p.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>openLesson(b.dataset.lesson));
 p.querySelectorAll('[data-vid]').forEach(f=>f.onclick=()=>{f.innerHTML=`<iframe src="https://www.youtube-nocookie.com/embed/${f.dataset.vid}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`});
}

// ---------- sheets ----------
function sheet(title,body,onClose){
 const bg=document.createElement('div');bg.className='sheet-bg';const s=document.createElement('div');s.className='sheet';
 s.innerHTML=`<div class="grab"></div><div class="hd"><b>${title}</b><button>Done</button></div><div class="bd">${body}</div>`;
 const close=()=>{bg.remove();s.remove();onClose&&onClose()};bg.onclick=close;s.querySelector('.hd button').onclick=close;
 document.body.append(bg,s);return s;
}
function openDeep(t){
 const q=DATA.quotes[t];const n=DATA.news[t]||[];const sec=DATA.sec[t];const red=DATA.reddit?.[t]||[];const le=lastEarn(t),ne=nextEarn(t);
 const filings=(sec?.filings||[]).filter(f=>['8-K','10-Q','10-K','6-K','20-F','S-3ASR','424B2','424B5'].includes(f.form)).slice(0,6);
 sheet(esc(t),`
  <h3>${esc(q.name)}</h3><p class="note">${esc(groupOf(t))} · ${ccy(q)}${f2(q.price)} <span class="${cls(q.pct)}">${pc(q.pct)}</span> · as of ${esc(q.asOf||'')}</p>
  <p>${esc(whyMoved(q))}</p>
  <p class="note">How to read this: compare the move to the sector ETF first. If the stock moved with the group, the cause is usually macro or sector news (rates, AI capex, export controls). If it diverged, look for a company headline, an analyst call, or a filing below. Matching cause to move is a judgment call — open the sources to check.</p>
  <h4 style="margin:18px 0 4px">Why it matters for you</h4><p>${esc(PROFILES[t]||'')} ${esc(bankerAngle(q))}</p>
  ${le?`<h4 style="margin:18px 0 4px">Last earnings · ${dshort(le.date)}</h4><p>${le.eps!=null?`EPS $${f2(le.eps)} vs $${f2(le.epsForecast)} consensus (${le.result})`:'EPS not available'}${le.reaction!=null?`; stock moved <span class="${cls(le.reaction)}">${pc(le.reaction)}</span> on the report and ${pc(le.sinceReport)} since.`:'.'}</p>`:''}
  ${ne?`<p class="note">Next report: ${dshort(ne.date)}${ne.time?` (${ne.time.replace('time-','').replace(/-/g,' ')})`:''}${ne.epsForecast!=null?` · consensus EPS $${f2(ne.epsForecast)}`:''} — date per Nasdaq/Zacks, may be estimated.</p>`:''}
  ${n.length?`<h4 style="margin:18px 0 0">Headlines (last 3 days)</h4>${n.map(h=>`<a class="hl" href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}<small>${esc(h.source)} · ${esc(fmtPT(h.date))}</small></a>`).join('')}`:''}
  ${filings.length?`<h4 style="margin:18px 0 0">SEC filings</h4>${filings.map(f=>`<a class="hl" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.form)}${f.items?` · items ${esc(f.items)}`:''}<small>Filed ${esc(f.date)}${f.desc?' · '+esc(f.desc):''}</small></a>`).join('')}<div class="links"><a href="${esc(sec.browse)}" target="_blank" rel="noopener">All filings on EDGAR ↗</a></div>`:''}
  ${red.length?`<h4 style="margin:18px 0 0">On Reddit this week</h4>${red.map(r=>`<a class="hl" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}<small>${esc(r.sub)}</small></a>`).join('')}`:''}
  ${q.src?`<div class="links"><a href="${esc(q.src)}" target="_blank">Quote source ↗</a></div>`:''}
  <p class="note" style="margin-top:20px">Sentiment from X and Reddit isn't wired in yet; Reddit often blocks automated requests.</p>`);
}
function openLesson(id){
 const L=LESSONS.find(x=>x.id===id);
 sheet('Lesson',`<div class="kicker" style="color:var(--sub);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${esc(L.tag)}</div><h3>${esc(L.title)}</h3><p>${esc(L.plain)}</p><h4 style="margin:18px 0 4px">In your seat</h4><p>${esc(L.banker)}</p>
  ${L.numbers.length?`<h4 style="margin:18px 0 4px">Walk me through the numbers</h4><ol>${L.numbers.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p class="note">Illustrative numbers to show the mechanics, not a real deal.</p>`:''}`);
}
function openWatchlist(){
 const draw=()=>`<p class="note">Your list is saved on this phone. Data is pulled for the tickers in the repo's <b>watchlist.json</b> (defaults to the list below) every ~10 minutes. To get data for a new ticker, add it there too — tap "Copy list" and paste it into watchlist.json on GitHub. US listings use Nasdaq data; IFX uses Google Finance (Xetra, EUR).</p>
  ${WL.groups.map((g,gi)=>`<div class="group"><div class="gname">${esc(g.name)}</div><div class="tchips">${g.tickers.map(t=>`<span class="tchip">${esc(t)}<button data-rm="${gi}:${esc(t)}" aria-label="Remove">×</button></span>`).join('')||'<span class="note">Empty</span>'}</div></div>`).join('')}
  <h4 style="margin:18px 0 4px">Add a ticker</h4>
  <div class="addrow"><input id="nt" placeholder="e.g. TXN" maxlength="10" autocapitalize="characters" autocomplete="off"><select id="ng">${WL.groups.map((g,i)=>`<option value="${i}">${esc(g.name)}</option>`).join('')}<option value="new">+ New group…</option></select></div>
  <div class="addrow"><button class="btn" id="add" style="flex:1">Add</button><button class="btn ghost" id="sv" style="flex:1">Copy list</button></div>
  <div class="addrow"><button class="btn ghost" id="reset" style="flex:1;font-size:14px">Reset to defaults</button></div>`;
 const s=sheet('Watchlist',draw(),()=>render());
 const bd=s.querySelector('.bd');
 const persist=()=>{WL.updatedAt=Date.now();saveLocalWL(WL)};
 const wire=()=>{
  bd.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const [gi,t]=b.dataset.rm.split(':');WL.groups[gi].tickers=WL.groups[gi].tickers.filter(x=>x!==t);persist(false);bd.innerHTML=draw();wire()});
  bd.querySelector('#add').onclick=()=>{const t=bd.querySelector('#nt').value.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t))return toast('Enter a ticker like TXN');
   if(wlTickers().includes(t))return toast(t+' is already on your list');
   let gi=bd.querySelector('#ng').value;if(gi==='new'){const nm=prompt('Group name (e.g. "Semis · Analog")');if(!nm)return;WL.groups.splice(WL.groups.length-1,0,{name:nm.slice(0,60),tickers:[]});gi=WL.groups.length-2}
   WL.groups[gi].tickers.push(t);persist(false);toast('Added '+t+' — add it to watchlist.json for data');bd.innerHTML=draw();wire()};
  bd.querySelector('#sv').onclick=async()=>{const txt=JSON.stringify({groups:WL.groups},null,1);try{await navigator.clipboard.writeText(txt);toast('Copied — paste into watchlist.json on GitHub')}catch(e){prompt('Copy this into watchlist.json:',txt)}};
  bd.querySelector('#reset').onclick=async()=>{localStorage.removeItem('signal.wl');try{WL=await (await fetch('watchlist_default.json')).json()}catch(e){WL={groups:DATA.groups}}persist(false);bd.innerHTML=draw();wire()};
 };wire();
}

// ---------- earnings ----------
function earnWhat(e){
 const r=e.reaction,g=groupOf(e.ticker).replace(/ ·.*/,'');
 if(r==null)return e.result?`EPS ${e.result} vs consensus; no clean price-reaction window in the data yet.`:'';
 const x=Math.abs(r).toFixed(1);
 if(e.result==='beat'&&r>=3)return `Beat and the stock rallied ${x}% — the market bought the story. A higher stock is cheaper equity currency: watch for follow-ons, converts at richer terms or stock-funded M&A, and a comps re-rate across ${g.toLowerCase()}.`;
 if(e.result==='beat'&&r<=-3)return `Beat but fell ${x}% — expectations were above consensus, or guidance and key metrics disappointed. For companies that need capital, a lower stock plus higher volatility is the classic setup for convert or buyback conversations; for everyone else it resets valuation and comps.`;
 if(e.result==='miss'&&r<=-3)return `Missed and fell ${x}% — expect questions on the plan: cost actions, strategic alternatives, or financing to bridge. Read the outlook language below.`;
 if(e.result==='miss'&&r>=3)return `Missed on EPS but rose ${x}% — investors looked past the quarter, likely to guidance or a key metric. Proof that consensus EPS isn't the whole story.`;
 return `Muted reaction (${pc(r)}) — results were roughly what the market had priced in.`;
}
function logo(t){const h=hue(t);return `<div class="logo" style="background:linear-gradient(135deg,hsl(${h} 60% 32%),hsl(${(h+40)%360} 60% 20%))">${esc(t.slice(0,4))}</div>`}
function renderEarnings(p){
 const W=wlTickers();const up=(DATA.earnings.upcoming||[]).filter(e=>W.includes(e.ticker));const rc=(DATA.earnings.recent||[]).filter(e=>W.includes(e.ticker));
 const seg=`<div class="seg"><button data-s="upcoming" class="${earnSeg==='upcoming'?'on':''}">Upcoming · ${up.length}</button><button data-s="recent" class="${earnSeg==='recent'?'on':''}">Recent · ${rc.length}</button></div>`;
 let body='';
 if(earnSeg==='upcoming'){
  let last='';up.forEach((e,i)=>{const d=daysTo(e.date);const wk=d<=6-new Date().getDay()?'This week':d<=13-new Date().getDay()?'Next week':new Date(e.date+'T12:00:00').toLocaleDateString('en-US',{month:'long'});
   if(wk!==last){body+=`<div class="wk">${wk}</div>`;last=wk}
   const tm=(e.time||'').includes('after')?'After close':(e.time||'').includes('pre')?'Before open':'Time TBA';
   body+=`<button class="row" data-u="${i}"><div class="r1">${logo(e.ticker)}<div class="mid"><b>${esc(e.ticker)}</b><div>${esc(e.name)} · ${esc(e.fq||'')}</div></div><div class="rt"><b>${dshort(e.date)}</b>${tm} · ${d===0?'today':d===1?'tomorrow':'in '+d+'d'}</div></div>
    <div class="r2">${e.epsForecast!=null?`<span class="chip b">Consensus EPS $${f2(e.epsForecast)}</span>`:''}${e.nEsts!=null?`<span class="chip">${e.nEsts} ests</span>`:''}${e.lastYearEPS!=null?`<span class="chip">Yr-ago EPS $${f2(e.lastYearEPS)}</span>`:''}</div></button>`});
  body+=`<p class="note">Dates and consensus from Nasdaq (Zacks). Dates far out may be estimated until the company confirms. Infineon (IFX) isn't covered by this calendar.</p>`;
 }else{
  rc.forEach((e,i)=>{body+=`<button class="row" data-r="${i}"><div class="r1">${logo(e.ticker)}<div class="mid"><b>${esc(e.ticker)}</b><div>${dshort(e.date)} · ${esc(e.fq||'')}</div></div><div class="rt">${e.reaction!=null?`<b class="${cls(e.reaction)}">${pc(e.reaction)}</b>on report`:''}</div></div>
   <div class="r2">${e.result?`<span class="chip ${e.result==='beat'?'g':e.result==='miss'?'r':''}">${e.result==='beat'?'Beat':e.result==='miss'?'Miss':'In line'}</span>`:''}${e.eps!=null?`<span class="chip">EPS $${f2(e.eps)} vs $${f2(e.epsForecast)}</span>`:''}${e.surprise!=null?`<span class="chip">${e.surprise>0?'+':''}${e.surprise}% surprise</span>`:''}${e.sinceReport!=null?`<span class="chip">${pc(e.sinceReport)} since</span>`:''}</div>
   <p style="margin:10px 0 0;font-size:14px;color:#d1d1d6">${esc(earnWhat(e))}</p></button>`});
  body+=`<p class="note">EPS is adjusted (non-GAAP) per Nasdaq/Zacks. Reaction = close before the report to the first close after it. Last ~75 days.</p>`;
 }
 p.innerHTML=`<div class="scroll">${seg}${body}</div>`;
 p.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>{earnSeg=b.dataset.s;renderEarnings(p)});
 p.querySelectorAll('[data-u]').forEach(b=>b.onclick=()=>{const e=up[b.dataset.u];const sec=DATA.sec[e.ticker];const g=groupOf(e.ticker);const lastQ=(sec?.filings||[]).find(f=>['10-Q','10-K','6-K','20-F'].includes(f.form));const le=lastEarn(e.ticker);
  sheet(esc(e.ticker),`<h3>${esc(e.name)} reports ${dshort(e.date)}</h3><p class="note">${esc(e.fq||'')} · ${(e.time||'').replace('time-','').replace(/-/g,' ')}${e.epsForecast!=null?` · consensus EPS $${f2(e.epsForecast)} (${e.nEsts} estimates)`:''}${e.lastYearEPS!=null?` · year-ago $${f2(e.lastYearEPS)}`:''}</p>
   <h4 style="margin:18px 0 4px">What to watch</h4><p>${esc(GROUP_WATCH[g.replace(/ ·.*/,'')]||'')}</p><p>${esc(PROFILES[e.ticker]||'')}</p>
   ${le?`<h4 style="margin:18px 0 4px">Last time</h4><p>${dshort(le.date)}: ${le.eps!=null?`EPS $${f2(le.eps)} vs $${f2(le.epsForecast)} (${le.result})`:''}${le.reaction!=null?`, stock ${pc(le.reaction)} on the report`:''}.</p>`:''}
   <h4 style="margin:18px 0 4px">Why it matters for your work</h4><p>The reaction resets this company's stock price — its currency for M&A and the starting point for any equity or convert pitch — and it moves the comps for everyone in ${esc(g.replace(/^.*· /,'').toLowerCase())}. Takeaways show up here after the 8-K hits EDGAR (data updates about every 10 minutes).</p>
   <div class="links">${lastQ?`<a href="${esc(lastQ.url)}" target="_blank">Latest ${esc(lastQ.form)} (${esc(lastQ.date)}) ↗</a>`:''}${sec?`<a href="${esc(sec.browse)}" target="_blank">EDGAR filings ↗</a>`:''}</div>`)});
 p.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{const e=rc[b.dataset.r];const pr=e.pr||{};
  sheet(esc(e.ticker),`<h3>${esc(e.name)} · ${dshort(e.date)}</h3>
   <p class="note">${esc(e.fq||'')} · ${e.eps!=null?`EPS $${f2(e.eps)} vs $${f2(e.epsForecast)} consensus`:''}${e.surprise!=null?` (${e.surprise>0?'+':''}${e.surprise}%)`:''}${e.reaction!=null?` · reaction <span class="${cls(e.reaction)}">${pc(e.reaction)}</span> (${esc(e.reactionWindow)}) · ${pc(e.sinceReport)} since`:''}</p>
   <h4 style="margin:18px 0 4px">What it means for your work</h4><p>${esc(earnWhat(e))}</p>
   ${(pr.highlights||[]).length?`<h4 style="margin:18px 0 4px">From the press release</h4>${pr.highlights.map(x=>`<div class="quote">${esc(x)}</div>`).join('')}`:''}
   ${(pr.outlook||[]).length?`<h4 style="margin:18px 0 4px">Outlook / guidance language</h4>${pr.outlook.map(x=>`<div class="quote">${esc(x)}</div>`).join('')}`:''}
   ${!(pr.highlights||[]).length&&!(pr.outlook||[]).length?`<p class="note">I couldn't pull clean quotes from the filing automatically — open it below.</p>`:''}
   ${(pr.highlights||[]).length||(pr.outlook||[]).length?`<p class="note">Quotes are pulled verbatim from the SEC filing by a script and may be cut mid-thought; open the filing for full context.</p>`:''}
   <div class="links">${e.filing?`<a href="${esc(e.filing.url)}" target="_blank">${esc(e.filing.form)} on EDGAR ↗</a>`:''}${pr.url?`<a href="${esc(pr.url)}" target="_blank">Press release (EX-99.1) ↗</a>`:''}${e.periodic?`<a href="${esc(e.periodic.url)}" target="_blank">${esc(e.periodic.form)} ↗</a>`:''}</div>`)});
}

// ---------- boot ----------
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
app.innerHTML='<div class="empty"><p>Loading…</p></div>';
loadData().then(render);
})();
