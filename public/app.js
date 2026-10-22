(()=>{
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=$('#app');
let FL=null,WK=null,DATA=null, WL=null, refreshing=false, tab='feed', earnSeg='upcoming';

const I={
 file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
 back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M15 18l-6-6 6-6"/></svg>',
 refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h10M4 17h7"/><path d="M18 14v6M15 17h6"/></svg>',
 feed:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6"/></svg>',
 earn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 deal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 8V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>',
 pod:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
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
 const gj=async u=>{try{const r=await fetch(u+'?t='+Date.now(),{cache:'no-store'});return r.ok?await r.json():null}catch(e){return null}};
 const [d,f,w]=await Promise.all([gj('data/feed.json'),gj('data/filings.json'),gj('data/weekly.json')]);if(d)DATA=d;if(f)FL=f;if(w)WK=w;
 if(!WL){WL=loadLocalWL();if(!WL){try{WL=await (await fetch('watchlist_default.json')).json()}catch(e){WL=DATA?{groups:DATA.groups}:{groups:[]}}}migrateWL()}
}
const ago=iso=>{const m=Math.max(0,Math.round((Date.now()-new Date(iso))/6e4));return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' hr ago':Math.round(m/1440)+' days ago'};
// ---------- refresh: no tokens in a public site, so open GitHub's "Run workflow" page and poll for new data ----------
const WF={data:'https://github.com/BanjoN3g1/signal/actions/workflows/pages.yml',pods:'https://github.com/BanjoN3g1/signal/actions/workflows/podcasts.yml'};
let poll=null;
const isPods=()=>tab==='pods'&&route().world==='work';
const stampOf=()=>isPods()?PODS?.generatedAt:DATA?.generatedAt;
function paintRefresh(){const b=document.getElementById('rf');if(!b)return;const g=stampOf();
 const old=g&&(Date.now()-new Date(g))>60*60*1000;
 b.classList.toggle('stale',!!old&&!poll);b.classList.toggle('busy',!!poll);
 b.innerHTML=`${I.refresh}<span>${poll?'Refreshing…':g?'Updated '+ago(g):'Refresh'}</span>`;
 b.title=g?'Data from '+fmtPT(g)+(old?' — tap to refresh':''):'Refresh'}
async function reloadCurrent(){if(isPods()){try{const r=await fetch('data/podcasts.json?t='+Date.now(),{cache:'no-store'});if(r.ok)PODS=await r.json()}catch(e){}}else await loadData()}
function startRefresh(){
 window.open(isPods()?WF.pods:WF.data,'_blank','noopener');
 if(poll)return;const before=stampOf(),t0=Date.now(),pods=isPods();
 toast('Tap “Run workflow” on GitHub — I’ll watch for new data');
 const stop=msg=>{clearInterval(poll);poll=null;if(msg)toast(msg);paintRefresh()};
 const check=async()=>{await reloadCurrent();const now=pods?PODS?.generatedAt:DATA?.generatedAt;
  if(now&&now!==before){stop(null);toast('New data · updated just now');render();return}
  if(Date.now()-t0>5*60*1000)stop('No new data yet — the run can take a few minutes; check back soon');else paintRefresh()};
 poll=setInterval(check,20000);paintRefresh();setTimeout(check,3000);
}
setInterval(()=>{if(document.visibilityState!=='visible')return;if(!poll)loadData().then(paintRefresh);else paintRefresh()},60*1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')reloadCurrent().then(paintRefresh)});

// ---------- router ----------
window.addEventListener('hashchange',render);
function route(){const h=location.hash.replace(/^#\/?/,'').split('/');return {world:h[0]||'',tab:h[1]||'feed'}}
function render(){
 const r=route();
 if(!r.world)return renderHome();
 if(r.world==='work'){tab=r.tab;return renderWork()}
 if(r.world==='elections'&&window.SignalElections)return window.SignalElections.render(app,{esc,sheet,back:I.back,ago,hAgo,kfmt});
 return renderSoon(r.world);
}

// ---------- home ----------
const LIVEW=['work','elections'];
const WORLDS=[
 {id:'work',name:'Work',sub:'Markets, earnings & deals for software + semis',glyph:'📈',c1:'#0a84ff',c2:'#5e5ce6',big:true},
 {id:'elections',name:'Politics',sub:'Midterms map, odds, signals & policy',glyph:'🗳️',c1:'#ff375f',c2:'#bf5af2'},
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
   <button class="tile ${w.big?'big':''} ${!LIVEW.includes(w.id)?'dim':''}" data-w="${w.id}">
    <div class="bg" style="background:radial-gradient(120% 90% at 100% 0%,${w.c1}55,transparent 60%),radial-gradient(100% 80% at 0% 100%,${w.c2}33,transparent 60%)"></div>
    ${!LIVEW.includes(w.id)?'<span class="soon">Coming soon</span>':''}
    <div class="content"><div class="glyph" style="background:linear-gradient(135deg,${w.c1},${w.c2})">${w.glyph}</div></div>
    <div class="content"><h2>${w.name}</h2><p>${w.sub}</p>
     ${w.id==='work'&&s&&i?`<div class="pulse up"><span>Software <b class="${cls(i.pct)}">${pc(i.pct)}</b></span><span>Semis <b class="${cls(s.pct)}">${pc(s.pct)}</b></span><span>${(DATA.earnings?.upcoming||[]).filter(e=>daysTo(e.date)<=7&&daysTo(e.date)>=0).length} reporting this week</span></div>`:''}
    </div>
   </button>`).join('')}</div>
  <p class="note" style="margin-top:18px;text-align:center">${DATA?`Data updated ${ago(DATA.generatedAt)} · ${fmtPT(DATA.generatedAt)}`:'Loading data…'}<br><span class="ver">Signal ${VERSION}</span></p>
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
 const titles={feed:'Feed',earnings:'Earnings',filings:'Filings & Deals',deals:'Deal Room',pods:'Podcasts',learn:'Learn'};
 app.innerHTML=`<div class="view">
  <div class="top"><button class="back" id="bk">${I.back}</button><div class="title">${titles[tab]||'Work'}</div>
   ${['feed','earnings'].includes(tab)?`<button class="iconbtn" id="wl" aria-label="Edit watchlist">${I.list}</button>`:''}
   ${tab!=='deals'?`<button class="rbtn" id="rf" aria-label="Refresh data"></button>`:''}</div>
  <div class="pane" id="pane"></div>
  <nav class="tabs">${[['feed','Feed',I.feed],['earnings','Earnings',I.earn],['filings','Filings',I.file],['deals','Deal Room',I.deal],['pods','Podcasts',I.pod],['learn','Learn',I.learn]].map(([k,n,ic])=>`<button data-t="${k}" class="${tab===k?'on':''}">${ic}${n}</button>`).join('')}</nav>
 </div>`;
 $('#bk').onclick=()=>location.hash='#/';
 const rf=$('#rf');if(rf){rf.onclick=startRefresh;paintRefresh()}
 const wl=$('#wl');if(wl)wl.onclick=openWatchlist;
 app.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>location.hash='#/work/'+b.dataset.t);
 const p=$('#pane');
 if(tab==='deals')return renderDeals(p);
 if(tab==='pods')return renderPods(p);
 if(tab==='filings')return renderFilings(p);
 if(!DATA){p.innerHTML='<div class="empty"><h2>No data yet</h2><p>Tap refresh to pull the first snapshot.</p></div>';return}
 if(tab==='feed')renderFeed(p);else if(tab==='earnings')renderEarnings(p);
 else p.innerHTML=`<div class="empty"><div class="big">🎓</div><h2>Learn — coming next</h2><p>Bite-size lessons with optional “walk me through the numbers” and quick-check questions. A few lessons already live in your Feed.</p></div>`;
}

// ---------- deal room (logic in deals.js) ----------
function renderDeals(p){
 const tickers=new Set(),names=new Set();
 Object.values(DATA?.quotes||{}).forEach(q=>{if(!q)return;tickers.add(q.ticker);const w=(q.name||'').split(/[\s,.]+/)[0];if(w&&w.length>2)names.add(w.toLowerCase())});
 wlTickers().forEach(t=>tickers.add(t));
 DEALROOM.render(p,{esc,sheet,toast,known:{tickers,names}});
}

// ---------- chatter (Reddit + YouTube sentiment from data/feed.json) ----------
const sLab=x=>x==='bullish'?'Bullish':x==='bearish'?'Bearish':'Neutral';
const sCls=x=>x==='bullish'?'pos':x==='bearish'?'neg':'flat';
const sNum=n=>n==null?'':(n>0?'+':'')+n;
function chatStat(t){const o=DATA.sentiment?.[t]?.overall;if(!o||o.n<3)return '';return `<div class="stat">Chatter<b class="${sCls(o.label)}">${sLab(o.label)} ${sNum(o.score)}</b></div>`}
function srcBlock(name,s,kind){
 if(!s)return '';
 if(s.status!=='ok')return `<div class="chat"><div class="ch1"><b>${name}</b><span class="chip">${s.status==='pending'||s.status==='blocked'?'Not checked yet':'Unavailable'}</span></div><p class="note" style="margin:6px 0 0">${esc(s.status==='pending'||s.status==='blocked'?'Reddit allows about one search a minute from the data server, so tickers are searched in batches — this one fills in within the next couple of refreshes.':(s.note||'Source unavailable')+'. Showing nothing rather than guessing.')}</p></div>`;
 const few=s.n<3,pct=s.score==null?50:Math.max(0,Math.min(100,(s.score+100)/2));
 return `<div class="chat"><div class="ch1"><b>${name}</b>${few?'<span class="chip">Too few posts</span>':`<span class="chip ${s.label==='bullish'?'g':s.label==='bearish'?'r':''}">${sLab(s.label)} ${sNum(s.score)}</span>`}<span class="note" style="margin-left:auto">${s.n} ${kind}${s.n===1?'':'s'} · ${s.since?'since '+esc(new Date(s.since).toLocaleDateString('en-US',{...PT,month:'short',day:'numeric'})):'7d'}</span></div>
  ${few?'':`<div class="gauge"><i style="left:${pct}%"></i></div><div class="gl"><span>Bearish</span><span>${s.pos??0} positive · ${s.neg??0} negative</span><span>Bullish</span></div>`}
  ${(s.top||[]).map(x=>`<a class="hl" href="${esc(x.url)}" target="_blank" rel="noopener"><span class="dot ${x.s>=.05?'pos':x.s<=-.05?'neg':'flat'}">●</span> ${esc(x.title)}<small>${esc(x.sub||x.channel||'')}${x.score!=null?` · ${x.score} pts`:''}${x.comments!=null?` · ${x.comments} comments`:''}${x.views?' · '+esc(x.views):''}${x.age?' · '+esc(x.age):x.date?' · '+esc(fmtPT(x.date)):''}</small></a>`).join('')}
  ${s.stale?`<p class="note" style="margin:6px 0 0">Last good read ${esc(fmtPT(s.asOf))} — ${esc(DATA.sentimentMeta?.reddit||'')}.</p>`:''}</div>`}
function chatterHTML(t){
 const c=DATA.sentiment?.[t];if(!c)return '';const o=c.overall;
 return `<h4 style="margin:18px 0 4px">Chatter · last 7 days</h4>
  ${o&&o.n>=3?`<p style="margin:0 0 6px">Overall <b class="${sCls(o.label)}">${sLab(o.label)} (${sNum(o.score)})</b> across ${o.n} posts and videos.</p>`:''}
  ${srcBlock('Reddit',c.reddit,'post')}${srcBlock('YouTube',c.youtube,'video')}
  <div class="chat"><div class="ch1"><b>X</b><span class="chip">Coming later</span></div></div>
  <p class="note">Score = average VADER sentiment (a free word-list method, −100 to +100) over post titles and text, with market slang added (“calls”, “tank”, “downgrade”). It reads tone, not facts, and misses sarcasm. YouTube uses titles and descriptions; reading comments would need a YouTube API key.</p>`}

// ---------- AI summaries (free-tier LLM, generated in the data refresh; absent -> templates) ----------
function aiWhy(t){const w=DATA.why?.[t];const q=DATA.quotes?.[t];if(!w||!q||q.pct==null)return null;return Math.abs((w.pct??q.pct)-q.pct)<2.5?w:null}
function cite(w,links){return esc(w.why).replace(/\[(\d+)\]/g,(m,n)=>{const s=(w.sources||[]).find(x=>x.n==n);return s&&links?`<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener">${n}</a>`:`<sup class="cite">${n}</sup>`})}
function whySources(t){const w=DATA.why[t];return `<div class="srcs">${(w.sources||[]).map(s=>`<a class="hl" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="cite">${s.n}</span> ${esc(s.title)}<small>${esc(s.source)}${s.date?' · '+esc(/^\d{4}-/.test(s.date)?s.date:fmtPT(s.date)):''}${(w.cited||[]).includes(s.n)?' · cited':''}</small></a>`).join('')}</div>
 <p class="note">Written by ${esc(w.model)} (free tier) from these headlines and filings only${w.confidence?` · confidence: ${esc(w.confidence)}`:''} · ${esc(fmtPT(w.at))}. Headlines suggest causes; they don't prove them.</p>`}
function deepHTML(e){const d=e.deep,li=a=>(a||[]).length?`<ul class="dl">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';
 return `<div class="kicker" style="margin-top:14px"><span class="chip ai">AI deep dive · from the press release</span></div>
  ${d.headline?`<p style="font-size:17px;font-weight:600;margin:8px 0 4px">${esc(d.headline)}</p>`:''}
  <h4 class="dh">Takeaways</h4>${li(d.takeaways)}
  <h4 class="dh">What the filing says</h4>${li(d.filing_says)}
  ${d.guidance?`<h4 class="dh">Guidance</h4><p>${esc(d.guidance)}</p>`:''}
  <h4 class="dh">For a software / semis banker</h4>${li(d.banker)}
  ${(d.questions||[]).length?`<h4 class="dh">Questions to ask</h4>${li(d.questions)}`:''}
  <p class="note">Written by ${esc(d.model)} (free tier) from the 8-K press release (exhibit 99.1) only, so there are no call remarks. Check numbers against the filing. ${esc(fmtPT(d.at))}.</p>`}

// ---------- podcasts (data/podcasts.json, built by podcasts.yml) ----------
let PODS=null,podShow='all';
const mins=s=>s?Math.round(s/60)+' min':'';
const dAgo=iso=>{const d=Math.round((Date.now()-new Date(iso))/864e5);return d<=0?'Today':d===1?'Yesterday':d+' days ago'};
const itx=x=>typeof x==='string'?x:(x&&x.t)||'';
function podLead(e){const s=e.summary;if(!s)return [];return s.kind==='ai'?(s.takeaways||[]).slice(0,2).map(itx):(s.quotes||[]).slice(0,1).map(q=>'“'+itx(q)+'”')}
async function renderPods(p){
 if(!PODS){p.innerHTML='<div class="empty"><p>Loading…</p></div>';try{const r=await fetch('data/podcasts.json?t='+Date.now(),{cache:'no-store'});if(r.ok)PODS=await r.json()}catch(e){}}
 paintRefresh();
 if(!PODS){p.innerHTML='<div class="empty"><div class="big">🎙️</div><h2>Podcasts are on the way</h2><p>Episodes show up here after the next podcast refresh (every 3 hours).</p></div>';return}
 const eps=PODS.episodes.filter(e=>podShow==='all'||e.show===podShow);
 p.innerHTML=`<div class="scroll"><div class="pchips"><button class="pchip ${podShow==='all'?'on':''}" data-s="all">All</button>${PODS.shows.map(s=>`<button class="pchip ${podShow===s.id?'on':''}" data-s="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>
  ${eps.map((e,i)=>`<button class="row pod" data-e="${esc(e.key)}"><div class="r1">${podArt(e.show)}<div class="mid"><div class="pshow">${esc(e.showName)}</div><b>${esc(e.title)}</b><div>${dAgo(e.date)}${e.dur?' · '+mins(e.dur):''}</div></div></div>
   ${e.pending?`<p class="note" style="margin:10px 0 0">Transcribing soon — new episodes are processed a few at a time.</p>`:`<p class="plead">${podLead(e).map(esc).join('<br>')}</p><div class="r2">${e.summary.kind==='ai'?'<span class="chip ai">AI summary</span>':'<span class="chip">Key quotes</span>'}${Object.keys(e.mentions||{}).slice(0,4).map(t=>`<span class="chip b">${esc(t)}</span>`).join('')}</div>`}</button>`).join('')||'<p class="note">No recent episodes.</p>'}
  <p class="note">Transcripts: Bloomberg publishes its own; other shows are transcribed by a free speech-to-text model (Whisper) on GitHub's servers, so expect some misheard words. ${PODS.ai?'Summaries by '+esc(PODS.ai)+'.':'Summaries are quotes picked from the transcript; AI takeaways switch on once a free AI key is added.'} Updated ${esc(fmtPT(PODS.generatedAt))}.</p></div>`;
 p.querySelectorAll('.pchip').forEach(b=>b.onclick=()=>{podShow=b.dataset.s;renderPods(p)});
 p.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>openPod(PODS.episodes.find(e=>e.key===b.dataset.e)));
}
function podArt(id){const s=PODS.shows.find(x=>x.id===id);return s?.art?`<img class="logo" src="${esc(s.art)}" alt="" loading="lazy">`:logo(id.toUpperCase())}
function openPod(e){const s=e.summary||{},src=e.source||{};
 const dig=x=>x&&typeof x==='object'&&(x.p!=null||x.x);
 const li=(k,quote)=>{const a=s[k]||[];return a.length?`<ul class="dl dig">${a.map((x,i)=>`<li>${dig(x)?`<button class="digrow" data-k="${k}" data-i="${i}"><span>${quote?'“'+esc(itx(x))+'”':esc(itx(x))}</span><span class="digin">Dig in<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></span></button>`:quote?`<div class="quote">${esc(itx(x))}</div>`:esc(itx(x))}</li>`).join('')}</ul>`:''};
 const sh=sheet(esc(e.showName),`<h3>${esc(e.title)}</h3><p class="note">${esc(dshort(e.date.slice(0,10)))}${e.dur?' · '+mins(e.dur):''}${e.words?' · '+e.words.toLocaleString()+' words transcribed':''}</p>
  ${e.pending?'<p>This episode hasn’t been transcribed yet. Check back after the next podcast refresh.</p>':s.kind==='ai'?`<h4 class="dh">Key takeaways</h4>${li('takeaways')}<h4 class="dh">Interesting tidbits</h4>${li('tidbits')}${(s.quotes||[]).length?`<h4 class="dh">Quotes</h4>${li('quotes',1)}`:''}<h4 class="dh">For software / semis</h4>${li('implications')}`
   :`<h4 class="dh">Key moments (quoted)</h4>${li('quotes',1)}${(s.numbers||[]).length?`<h4 class="dh">Numbers mentioned</h4>${(s.numbers||[]).map(q=>`<div class="quote">${esc(q)}</div>`).join('')}`:''}<p class="note">Picked automatically from the transcript, not written by AI.</p>`}
  ${!e.pending&&s.v!==2?'<p class="note">Tap-to-dig-in (source passage, explainer, play from here) arrives for this episode at an upcoming refresh.</p>':''}
  ${Object.keys(e.mentions||{}).length?`<h4 class="dh">Watchlist names mentioned</h4><div class="r2">${Object.entries(e.mentions).map(([t,c])=>`<span class="chip b">${esc(t)} ×${c}</span>`).join('')}</div>`:''}
  ${e.desc?`<h4 class="dh">Show notes</h4><p class="note" style="font-size:14px">${esc(e.desc)}</p>`:''}
  <div class="links"><a href="${esc(e.link)}" target="_blank" rel="noopener">Open episode ↗</a>${src.kind==='publisher'&&src.url?`<a href="${esc(src.url)}" target="_blank" rel="noopener">Publisher transcript ↗</a>`:''}</div>
  <p class="note">${src.kind==='whisper'?`Transcribed by Whisper ${esc(src.model||'')} on a GitHub runner (${src.transcribe_s}s for ${mins(src.audio_s)} of audio).`:src.kind==='publisher'?'Transcript from the publisher’s feed.':''}${s.kind==='ai'?` Summary by ${esc(s.model||'AI')} from the transcript only.`:''}</p>`);
 sh.querySelectorAll('.digrow').forEach(b=>b.onclick=()=>openDig(e,s[b.dataset.k][+b.dataset.i],b.dataset.k));
}
const SEGS={};
const ts=x=>{x=Math.max(0,Math.floor(x));const h=Math.floor(x/3600),m=Math.floor(x/60)%60,s=String(x%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`};
function markQ(t,q){const h=esc(t);if(!q)return h;const k=h.toLowerCase().indexOf(esc(q).toLowerCase());return k<0?h:h.slice(0,k)+'<mark>'+h.slice(k,k+esc(q).length)+'</mark>'+h.slice(k+esc(q).length)}
async function openDig(e,it,kind){
 const lab={takeaways:'Takeaway',tidbits:'Tidbit',quotes:'Quote',implications:'For software / semis'}[kind]||'Dig in',x=it.x||{};
 const sh=sheet('Dig in',`<div class="kicker">${esc(lab)} · ${esc(e.showName)}</div><p class="digt">${kind==='quotes'?'“'+esc(it.t)+'”':esc(it.t)}</p>
  ${it.p!=null?'<h4 class="dh">From the transcript</h4><div class="tx" id="tx"><p class="note">Loading transcript…</p></div>':''}
  <div id="play"></div>
  ${x.bg||x.why||x.so?`<h4 class="dh">Explainer</h4><div class="xpl">${x.bg?`<div><b>Background</b><p>${esc(x.bg)}</p></div>`:''}${x.why?`<div><b>Why it matters</b><p>${esc(x.why)}</p></div>`:''}${x.so?`<div><b>In your seat</b><p>${esc(x.so)}</p></div>`:''}</div><p class="note">Explainer written by AI from this episode’s transcript — check before relying on it.</p>`:''}`);
 if(it.p==null)return;
 let B=SEGS[e.key];
 if(!B){try{const r=await fetch(`data/pods/seg_${e.key}.json`);if(r.ok)B=SEGS[e.key]=await r.json()}catch(_){}}
 const box=sh.querySelector('#tx');if(!B){box.innerHTML='<p class="note">Transcript unavailable offline.</p>';return}
 const timed=B[0]&&B[0].s!=null,p=Math.min(it.p,B.length-1),p2=Math.min(Math.max(it.p2??p,p),B.length-1);
 let ctx=60;
 const draw=()=>{let lo=p,hi=p2;
  if(timed){const a=B[p].s-ctx,z=B[p2].e+ctx;while(lo>0&&B[lo-1].e>a)lo--;while(hi<B.length-1&&B[hi+1].s<z)hi++}
  else{const n=Math.ceil(ctx/32);lo=Math.max(0,p-n);hi=Math.min(B.length-1,p2+n)}
  box.innerHTML=(lo>0?'<div class="txfade">…</div>':'')+B.slice(lo,hi+1).map((b,k)=>{const i=lo+k,on=i>=p&&i<=p2;
   return `<p class="${on?'hl':''}">${timed?`<span class="tt">${ts(b.s)}</span>`:''}${on?markQ(b.t,it.q):esc(b.t)}</p>`}).join('')
   +(lo>0||hi<B.length-1?`<button class="more" id="more">Show more context</button>`:'');
  const m=box.querySelector('#more');if(m)m.onclick=()=>{ctx+=60;draw()};
  const h=box.querySelector('.hl');if(h&&ctx===60)box.scrollTop=Math.max(0,h.offsetTop-(box.clientHeight-h.offsetHeight)/2)};
 draw();
 const pl=sh.querySelector('#play');
 if(timed&&e.audio){const t0=Math.max(0,Math.floor(B[p].s)-2);
  pl.innerHTML=`<button class="playfrom" id="pf"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>Play from ${ts(t0)}</button><div id="aw"></div><p class="note">Times come from the transcript; shows that insert different ads per listener can drift by up to a minute.</p>`;
  let au=null;const stop=()=>au&&au.pause();
  pl.querySelector('#pf').onclick=()=>{ // the player is created on tap (keeps the sheet light; play() stays inside the user gesture for iOS)
   if(!au){au=document.createElement('audio');au.id='au';au.controls=true;au.preload='metadata';au.src=e.audio+'#t='+t0;pl.querySelector('#aw').append(au);au.addEventListener('loadedmetadata',()=>{if(au.currentTime<t0-1)au.currentTime=t0},{once:true})}
   else au.currentTime=t0;
   au.play().catch(()=>{})};
  const done=sh.querySelector('.hd button'),bg=sh.previousElementSibling;done.addEventListener('click',stop);bg&&bg.addEventListener('click',stop)}
 else pl.innerHTML=`<p class="note">${timed?'No audio link in the feed for this episode.':'This publisher transcript has no timestamps, so “play from here” isn’t available.'}</p>`;
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
  <div class="tkr">${esc(t)}</div><div class="nm">${esc(q.name)}${q.exchange?` · ${esc(q.exchange)}`:''}${q.stale?` · last price ${esc(q.asOf||'')}`:''}</div>
  <div class="px up"><span class="p">${ccy(q)}${f2(q.price)}</span><span class="c ${cls(q.pct)}">${pc(q.pct)}</span></div>
  ${spark(q.hist,(q.r21??q.pct??0)>=0)}
  <div class="stats up">${q.r5!=null?`<div class="stat">5 days<b class="${cls(q.r5)}">${pc(q.r5)}</b></div>`:''}${q.r21!=null?`<div class="stat">1 month<b class="${cls(q.r21)}">${pc(q.r21)}</b></div>`:''}${(()=>{const B=benchFor(g);const b=B&&DATA.quotes[B];return b&&q.pct!=null?`<div class="stat">vs ${B}<b class="${cls(q.pct-b.pct)}">${(q.pct-b.pct>0?'+':'')+(q.pct-b.pct).toFixed(2)} pts</b></div>`:''})()}${chatStat(t)}</div>
  <div class="fade">
   <div class="sect"><h4>Why it moved${aiWhy(t)?' <span class="chip ai">AI · sourced</span>':''}</h4><p>${aiWhy(t)?cite(aiWhy(t)):esc(whyMoved(q))}</p></div>
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
function pendingCard(t){const synced=repoTickers().has(t);
 return `<section class="slide"><div class="card"><div class="kicker"><span class="chip">${esc(groupOf(t).replace(/^.*· /,''))}</span><span class="chip o">New</span></div><div class="tkr">${esc(t)}</div><div class="nm" data-pn="${esc(t)}">Added to your watchlist</div>
  <div class="sect" data-pf="${esc(t)}"><h4>From SEC EDGAR (on this phone)</h4><p class="note">Loading recent filings…</p></div>
  <div style="flex:1"></div>
  ${synced?`<p class="note">In the pipeline — prices, news and AI notes arrive with the next data refresh (hourly, or tap Refresh up top).</p>`:`<p class="note">Prices, news and AI notes start once it’s in the data pipeline. One tap sends your list; then tap “Create” on GitHub.</p><button class="btn" data-sync style="margin-top:8px">Sync watchlist</button>`}
 </div></section>`}
const K8={'1.01':'agreement','2.01':'acquisition','2.02':'earnings','2.03':'new debt','3.02':'equity sale','5.02':'exec change','7.01':'Reg FD','8.01':'event'};
async function fillPending(p){
 const els=[...p.querySelectorAll('[data-pf]')];if(!els.length)return;await loadCiks();
 for(const el of els){const t=el.dataset.pf,cik=cikOf(t);if(!cik){el.innerHTML='<p class="note">Not an SEC-registered ticker — check the symbol in the watchlist.</p>';continue}
  try{const j=await (await fetch(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10,'0')}.json`)).json();const f=j.filings.recent,rows=[];
   for(let i=0;i<f.form.length&&rows.length<4;i++)if(['8-K','10-Q','10-K','S-1','424B4','6-K','20-F'].includes(f.form[i]))rows.push(`<a class="mv up" href="https://www.sec.gov/Archives/edgar/data/${cik}/${f.accessionNumber[i].replace(/-/g,'')}/${f.primaryDocument[i]}" target="_blank" rel="noopener"><span>${esc(f.form[i])}${f.items?.[i]?' · '+esc(f.items[i].split(',').map(x=>K8[x.trim()]).filter(Boolean).join(', ')||f.items[i]):''}</span><span class="note">${esc(dshort(f.filingDate[i]))}</span></a>`);
   const nm=p.querySelector(`[data-pn="${CSS.escape(t)}"]`);if(nm)nm.textContent=`${j.name}${j.sicDescription?' · '+j.sicDescription:''}`;
   el.innerHTML=`<h4>Latest SEC filings</h4>${rows.join('')||'<p class="note">No recent filings.</p>'}`}catch(e){el.innerHTML='<p class="note">SEC EDGAR unavailable right now.</p>'}}
}
function privateCard(nm){const d=DATA.private?.[nm],n=d?.news||[];
 return `<section class="slide"><div class="card"><div class="kicker"><span class="chip">Private</span><span class="chip">News only</span></div><div class="tkr" style="font-size:34px">${esc(nm)}</div><div class="nm">Not publicly traded — no quote or SEC filings; tracking headlines.</div>
  <div class="sect"><h4>Latest news</h4>${n.length?n.slice(0,5).map(x=>`<a class="nrow" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.title)}</b><span class="note">${esc(x.source||'')}</span></a>`).join(''):`<p class="note">${repoTickers().has(nm)?'Headlines arrive with the next data refresh.':'Sync your watchlist to start tracking headlines.'}</p>`}</div>
  <div style="flex:1"></div>${repoTickers().has(nm)?'':'<button class="btn" data-sync>Sync watchlist</button>'}</div></section>`}
// ---------- Today: live news stream ----------
const hAgo=iso=>{const m=Math.max(0,Math.round((Date.now()-new Date(iso))/6e4));return m<60?m+'m':m<1440?Math.round(m/60)+'h':Math.round(m/1440)+'d'};
const NTAGS=['Watchlist','M&A','IPO/ECM','Earnings','Fed/rates','AI capex','Internet'];
function nRow(it,i){const src=new Set(it.sources.map(s=>s.source)).size;
 return `<button class="nitem" data-n="${esc(it.id)}"><div class="nmeta">${it.tags[0]?`<span class="chip b">${esc(it.tags[0])}</span>`:''}${it.tickers.slice(0,3).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}<span class="note">${hAgo(it.last)} · ${src} source${src>1?'s':''}${it.paywalled.length&&!it.freeCoverage?' · 🔒':''}</span></div><b>${esc(it.title)}</b>${it.sum?`<p>${esc(it.sum)}</p>`:''}</button>`}
function openNewsList(f){f=f||'All';const T=DATA.today,W=wlTickers();
 const its=T.items.filter(it=>f==='All'||(f==='Watchlist'?it.tickers.some(t=>W.includes(t)):it.tags.includes(f)));
 const s=sheet('Today',`<div class="pchips">${['All',...NTAGS].map(t=>`<button class="pchip ${t===f?'on':''}" data-f="${esc(t)}">${esc(t)}</button>`).join('')}</div>
  <div class="nlist">${its.map(nRow).join('')||'<p class="note">Nothing in this bucket yet today.</p>'}</div>
  <p class="note">Free sources only: CNBC, MarketWatch, Yahoo Finance, Techmeme and Google News RSS (Reuters, Bloomberg, WSJ headlines), Fed press releases and SEC 8-Ks for your names. Same-story headlines are grouped; ranked for software/semis banking (your names, M&A, IPO/ECM, earnings, Fed, AI capex). Updated ${esc(fmtPT(T.asOf))}.</p>`);
 s.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{s.previousElementSibling.remove();s.remove();openNewsList(b.dataset.f)});
 s.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>openNews(b.dataset.n));
}
function openNews(id){const it=DATA.today.items.find(x=>x.id===id);if(!it)return;const free=it.sources.filter(s=>!s.paywalled);
 const pwNote=it.paywalled.length?(it.freeCoverage?`🔒 ${esc(it.paywalled.join(', '))} ${it.paywalled.length>1?'are':'is'} paywalled — summarized from free coverage (${esc([...new Set(free.map(s=>s.source))].slice(0,3).join(', '))}).`:`🔒 Paywalled (${esc(it.paywalled.join(', '))}) and no free coverage yet — summary is from the headline only.`):'';
 sheet('Dig in',`<div class="kicker">${it.tags.map(esc).join(' · ')||'News'}${it.tickers.length?' · '+it.tickers.map(esc).join(', '):''}</div><h3>${esc(it.title)}</h3>
  <p class="note">First seen ${esc(fmtPT(it.first))}${it.last!==it.first?' · latest '+esc(fmtPT(it.last)):''} · ${it.sources.length} headline${it.sources.length>1?'s':''}</p>
  ${it.dev?`<div class="kicker"><span class="chip o"><i class="live"></i>Developing</span><span class="note">${it.nSources||''} sources</span></div>${it.dev.headline?`<p><b>${esc(it.dev.headline)}</b></p>`:''}
   <h4 class="dh">What happened</h4><ul class="dl">${(it.dev.happened||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
   <h4 class="dh">Summary</h4><p>${esc(it.dev.summary)}</p>
   ${it.dev.numbers?.length?`<h4 class="dh">Key numbers</h4><div class="nums">${it.dev.numbers.map(x=>`<div><b>${esc(x.figure)}</b><span>${esc(x.context)}</span></div>`).join('')}</div>`:''}
   ${it.dev.implications?.length?`<div class="whybox"><b>Implications</b>${it.dev.implications.map(x=>`<p><b>${esc(x.area)}:</b> ${esc(x.text)}</p>`).join('')}</div>`:''}`
  :it.sum?`<p>${esc(it.sum)}</p>`:'<p class="note">AI summary pending — it’s added at the next refresh.</p>'}
  ${!it.dev&&it.why?`<div class="whybox"><b>Why it matters for a tech banker</b><p>${esc(it.why)}</p></div>`:''}
  ${!it.dev&&it.deep?.length?`<h4 class="dh">Deeper dive</h4><ul class="dl">${it.deep.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  ${pwNote?`<p class="note">${pwNote}</p>`:''}
  ${xHTML(it.x)}
  <h4 class="dh">All sources</h4>${it.sources.map(s=>`<a class="nrow" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${s.paywalled?'🔒 ':''}${esc(s.title)}</b><span class="note">${esc(s.source)} · ${esc(fmtPT(s.date))}</span></a>`).join('')}
  ${it.sum||it.dev?`<p class="note">Summary by ${esc(it.dev?.model||it.model||'AI')} from headlines and RSS blurbs only — open the sources before relying on it.</p>`:''}`);
}

// ---------- Developing stories + X posts in the feed ----------
const devStories=()=>(DATA.today?.items||[]).filter(it=>it.dev?.summary);
function xFeed(){const seen=new Set(),out=[],T=DATA.today?.items||[];
 T.forEach(it=>(it.x||[]).forEach(x=>out.push({...x,story:it})));
 Object.entries(DATA.xTickers||{}).forEach(([t,ps])=>(ps||[]).forEach(x=>out.push({...x,tkr:t})));
 return out.filter(x=>x.url&&!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>((b.likes||0)+3*(b.reposts||0))-((a.likes||0)+3*(a.reposts||0)))
  .filter((x,i,arr)=>arr.findIndex(y=>y.handle===x.handle)===i)}
function devCard(it){const d=it.dev,n=it.nSources||new Set(it.sources.map(s=>s.source)).size;
 return `<section class="slide"><div class="card devc"><div class="kicker"><span class="chip o"><i class="live"></i>Developing</span>${it.tickers.slice(0,2).map(t=>`<span class="chip">${esc(t)}</span>`).join('')}<span class="note">${n} sources · ${hAgo(it.last)} ago</span></div>
  <h3 class="devh">${esc(d.headline||it.title)}</h3><p class="devs">${esc(d.summary)}</p>
  ${d.numbers?.length?`<div class="nums">${d.numbers.slice(0,3).map(x=>`<div><b>${esc(x.figure)}</b><span>${esc(x.context)}</span></div>`).join('')}</div>`:''}
  ${d.happened?.length?`<ul class="dl">${d.happened.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  <div style="flex:1"></div><button class="btn" data-n="${esc(it.id)}">Learn more</button></div></section>`}
function xCard(x){const h=String(x.handle||'').replace(/^@/,''),st=x.story;
 const tie=st?`<button class="xtie" data-n="${esc(st.id)}"><span class="note">Tied story</span><b>${esc((st.dev?.headline||st.title).slice(0,110))}</b><span class="note">Dig in ›</span></button>`
  :`<button class="xtie" data-deep="${esc(x.tkr)}"><span class="note">Tied ticker</span><b>${esc(x.tkr)}${DATA.quotes?.[x.tkr]?.pct!=null?` · ${DATA.quotes[x.tkr].pct>0?'+':''}${DATA.quotes[x.tkr].pct.toFixed(2)}%`:''}</b><span class="note">Dig in ›</span></button>`;
 return `<section class="slide"><div class="card xcard"><div class="kicker"><span class="chip">𝕏 On X</span>${st?st.tickers.slice(0,2).map(t=>`<span class="chip">${esc(t)}</span>`).join(''):`<span class="chip">${esc(x.tkr)}</span>`}</div>
  <div class="xh"><b>${esc(x.name||h)}</b>${h?`<span>@${esc(h)}</span>`:''}${x.ts?`<span>· ${esc(hAgo(x.ts))}</span>`:''}</div>
  <p class="xt">${esc(x.text||'')}</p>
  <div class="xs">${x.likes!=null?`♥ ${kfmt(x.likes)}`:''}${x.reposts!=null?` · ↻ ${kfmt(x.reposts)}`:''}${x.note?` · ${esc(x.note)}`:''}</div>
  <div style="flex:1"></div>${tie}<a class="note xlink" href="${esc(x.url)}" target="_blank" rel="noopener">Open on X ↗</a></div></section>`}

// ---------- Filings & Deals ----------
const FTYPE={'IPO':['IPO','g'],'Merger proxy':['Merger proxy','o'],'Merger (S-4)':['Merger S-4','o'],'Deal 8-K':['Deal 8-K','o'],'Private round':['Private round','p'],'Tender / secondary':['Tender','p'],'IPO (confidential)':['IPO (conf.)','g']};
const EXPL={
 'IPO':['How to read an S-1 / F-1',['Start with the Prospectus Summary: business, market, and the “summary financial data” table — revenue, growth, gross margin, operating loss, free cash flow.','Use of Proceeds tells you if money goes to the company (primary) or to selling holders (secondary), and whether debt gets repaid.','Risk Factors are boilerplate except the specific ones: customer concentration, going-concern language, related parties, material weaknesses.','Capitalization & Dilution show pre-money shares; the first S-1/A with a price range lets you compute implied valuation (shares outstanding × midpoint).','Governance: dual/multi-class stock, “controlled company” status and lock-up terms matter for index inclusion and the float.','Banker lens: comps by growth + margin (Rule of 40), the size of the float, and what the pricing says about the ECM window.']],
 'IPO (confidential)':['Confidential IPO filings',['Companies can submit a draft registration statement (DRS) privately; the SEC reviews it before anything is public.','The public S-1 must appear at least 15 days before the roadshow — that is when real numbers become visible.','News of a confidential filing usually comes from the company or press; there is nothing on EDGAR to read yet.']],
 'Merger proxy':['What a merger proxy (DEFM14A / PREM14A) tells you',['Summary Term Sheet: price per share, cash vs stock, premium, expected closing and required approvals.','Background of the Merger: the full sale process — who else bid, at what prices, and when. The best free M&A case study there is.','Opinion of the financial advisor: the bankers’ DCF, trading comps and precedent-transaction ranges, plus their fees.','Projections: management’s forecasts given to bidders (often more optimistic than Street estimates).','Termination fees, go-shop windows and voting agreements show how locked-up the deal is.']],
 'Merger (S-4)':['What an S-4 tells you',['Filed when the buyer pays with its own stock — it registers the new shares.','Same content as a merger proxy (background, fairness opinions, projections) plus pro forma combined financials.','Watch the exchange ratio, collar (if any) and pro forma ownership split.']],
 'Deal 8-K':['Reading a deal 8-K (Items 1.01 / 2.01)',['Item 1.01 = signed a material definitive agreement (often the merger agreement); 2.01 = an acquisition or disposition closed.','The press release (Exhibit 99.1) has price, premium, financing and timing; the merger agreement (Exhibit 2.1) has fees and conditions.','8-Ks are due within four business days, so this is usually the first official document on a deal.']],
 'Private round':['Private rounds & valuations',['Headline valuations are post-money and often include structure (preferences, ratchets) that public comps don’t have.','Compare to the last round and to public comps on revenue run-rate multiples.','Big private rounds set marks for the next IPO window and for strategic M&A prices.']],
 'Tender / secondary':['Tenders & secondaries',['A tender offer lets employees and early holders sell existing shares — no new money goes to the company.','It sets a reference price ahead of an IPO and relieves pressure to list.','Pricing vs the last primary round shows whether demand is rising.']]};
function openExplainer(t){const e=EXPL[t]||EXPL.IPO;sheet('Learn',`<h3>${esc(e[0])}</h3><ul class="dl">${e[1].map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="note">General education, not advice; always read the filing itself.</p>`)}
const fdate=d=>{d=String(d||'');return d.includes('T')?new Date(d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):dshort(d.slice(0,10))};
function filingCard(f){const a=f.ai||{},T=FTYPE[f.type]||[f.type,''];
 return `<section class="slide"><div class="card filc"><div class="kicker"><span class="chip ${T[1]}">${esc(T[0])}</span>${f.ticker?`<span class="chip">${esc(f.ticker)}</span>`:''}<span class="note">${esc(f.form)} · ${esc(fdate(f.date))}${f.amendments?` · ${f.amendments} amendment${f.amendments>1?'s':''}`:''}</span></div>
  <div class="tkr" style="font-size:30px">${esc(f.company)}</div>${a.headline?`<h3 class="devh" style="font-size:19px">${esc(a.headline)}</h3>`:''}
  ${a.what?`<p class="devs">${esc(a.what)}</p>`:'<p class="note">AI breakdown arrives with an upcoming refresh (a few filings per run).</p>'}
  ${a.financials?.length?`<div class="nums">${a.financials.slice(0,3).map(x=>`<div><b>${esc(x.figure)}</b><span>${esc(x.context)}</span></div>`).join('')}</div>`:''}
  <div style="flex:1"></div><button class="btn" data-fil="${esc(f.acc)}">Breakdown</button><button class="more" data-expl="${esc(f.type)}" style="margin-top:6px">${esc((EXPL[f.type]||EXPL.IPO)[0])}</button></div></section>`}
function roundCard(x){const T=FTYPE[x.type]||[x.type,'p'];
 return `<section class="slide"><div class="card filc"><div class="kicker"><span class="chip ${T[1]}">${esc(T[0])}</span>${x.size?`<span class="chip">${esc(x.size)}</span>`:''}<span class="note">${x.n} source${x.n>1?'s':''} · ${hAgo(x.date)} ago</span></div>
  <h3 class="devh">${esc(x.title)}</h3><div class="nlist">${x.sources.slice(0,3).map(s=>`<a class="nrow" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${s.paywalled?'🔒 ':''}${esc(s.title)}</b><span class="note">${esc(s.source)}</span></a>`).join('')}</div>
  <div style="flex:1"></div><button class="more" data-expl="${esc(x.type)}">${esc((EXPL[x.type]||EXPL['Private round'])[0])}</button></div></section>`}
function newsFor(name){const k=String(name||'').replace(/,?\s+(Inc\.?|Corp(oration)?\.?|Holdings?|Ltd\.?|PLC|N\.V\.|S\.A\.|Co\.?|Group|Technologies)\b.*$/i,'').trim();if(k.length<3)return [];const rx=new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').split(/\s+/).slice(0,2).join('\\s+'),'i');return (DATA?.today?.items||[]).filter(it=>rx.test(it.title)||it.sources.some(s=>rx.test(s.title)))}
function openFiling(acc){const f=(FL?.filings||[]).find(x=>x.acc===acc);if(!f)return;const a=f.ai||{},rel=newsFor(f.company);
 const s=sheet('Filing',`<div class="kicker">${esc(f.type)} · ${esc(f.form)} · filed ${esc(fdate(f.date))}${f.first!==f.date?` (first ${esc(fdate(f.first))})`:''}</div><h3>${esc(f.company)}${f.ticker?` (${esc(f.ticker)})`:''}</h3>
  <p><a href="${esc(f.link)}" target="_blank" rel="noopener">Open the filing ↗</a> · <a href="${esc(f.index)}" target="_blank" rel="noopener">All documents ↗</a></p>
  ${a.what?`<h4 class="dh">What they do</h4><p>${esc(a.what)}</p>`:'<p class="note">AI breakdown pending — it’s generated from the filing’s public text at an upcoming refresh.</p>'}
  ${a.financials?.length?`<h4 class="dh">Key financials (as written in the filing)</h4><div class="nums">${a.financials.map(x=>`<div><b>${esc(x.figure)}</b><span>${esc(x.context)}</span></div>`).join('')}</div>`:''}
  ${a.terms?`<h4 class="dh">${f.type==='IPO'?'Offering & use of proceeds':'Deal terms'}</h4><p>${esc(a.terms)}</p>`:''}
  ${a.risks?.length?`<h4 class="dh">Risks & governance</h4><ul class="dl">${a.risks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  ${a.comps?.length?`<h4 class="dh">Comps</h4><p>${a.comps.map(esc).join(' · ')}</p>`:''}
  ${a.implications?`<div class="whybox"><b>ECM / M&A implications</b><p>${esc(a.implications)}</p></div>`:''}
  ${rel.length?`<h4 class="dh">In the news</h4>${rel.slice(0,4).map(nRow).join('')}`:''}${xHTML(f.x)}
  <button class="more" data-expl="${esc(f.type)}">${esc((EXPL[f.type]||EXPL.IPO)[0])}</button>
  ${a.what?`<p class="note">Breakdown by ${esc(a.model||'AI')} from excerpts of the filing; figures are kept only if they appear in the text. Verify in the document.</p>`:''}`);
 s.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>openNews(b.dataset.n));s.querySelectorAll('[data-expl]').forEach(b=>b.onclick=()=>openExplainer(b.dataset.expl))}
function wireFilings(p){p.querySelectorAll('[data-fil]').forEach(b=>b.onclick=()=>openFiling(b.dataset.fil));p.querySelectorAll('[data-expl]').forEach(b=>b.onclick=()=>openExplainer(b.dataset.expl));
 p.querySelectorAll('[data-wk]').forEach(b=>b.onclick=()=>{const r=JSON.parse(b.dataset.wk);
  if(r.kind==='news'&&DATA.today?.items?.some(x=>x.id===r.id||x.aliases?.includes(r.id)))openNews(DATA.today.items.find(x=>x.id===r.id||x.aliases?.includes(r.id)).id);
  else if(r.kind==='filing'&&FL?.filings?.some(x=>x.acc===r.id))openFiling(r.id);else if(r.kind==='deep'&&DATA.quotes?.[r.id])openDeep(r.id);
  else if(r.kind==='pod')location.hash='#/work/pods';else if(r.url)window.open(r.url,'_blank','noopener')})}
function weeklyCard(){return `<section class="slide"><div class="card weekc"><div class="kicker">This week · since ${esc(fdate(WK.since))}</div><h3 style="margin:6px 0 4px">What you might have missed</h3>
  <div class="wkl">${WK.lanes.map(l=>`<div class="wkg"><h4>${esc(l.lane)}</h4>${l.items.slice(0,2).map(i=>`<button class="wki" data-wk='${esc(JSON.stringify({kind:i.ref.kind,id:i.ref.id,url:i.ref.url}))}'><b>${esc(i.title)}</b><span class="note">${esc(i.sub||'')}${i.sub?' · ':''}${esc(fdate(i.date))}</span></button>`).join('')}</div>`).join('')}</div></div></section>`}
let flf='All';
function renderFilings(p){const F=FL?.filings||[],R=FL?.private||[];
 const cats=[['All',()=>true],['IPOs',f=>/IPO/.test(f.type)],['M&A',f=>/Merger|Deal/.test(f.type)],['Private',()=>false]];
 const list=flf==='Private'?[]:F.filter(cats.find(c=>c[0]===flf)[1]);const rs=flf==='All'||flf==='Private'?R:[];
 p.innerHTML=`<div class="escroll" style="height:100%;padding-bottom:calc(var(--tab) + var(--sab) + 20px)"><div class="pchips">${cats.map(([c])=>`<button class="pchip ${flf===c?'on':''}" data-ff="${c}">${c}</button>`).join('')}</div>
  <div class="pchips">${[['IPO','How to read an S-1'],['Merger proxy','Merger proxies'],['Merger (S-4)','S-4s'],['Deal 8-K','Deal 8-Ks'],['Private round','Private rounds'],['Tender / secondary','Tenders']].map(([t,l])=>`<button class="pchip lrn" data-expl="${esc(t)}">📘 ${l}</button>`).join('')}</div>
  ${list.map(f=>{const a=f.ai||{},T=FTYPE[f.type]||[f.type,''];return `<button class="pstory" data-fil="${esc(f.acc)}"><div class="nmeta"><span class="chip ${T[1]}">${esc(T[0])}</span>${f.ticker?`<span class="chip">${esc(f.ticker)}</span>`:''}<span class="note">${esc(f.form)} · ${esc(fdate(f.date))}</span></div><b>${esc(a.headline||f.company)}</b>${a.what?`<p>${esc(a.what)}</p>`:`<p class="note">${esc(f.company)} · breakdown pending</p>`}</button>`}).join('')}
  ${rs.length?`<h4 class="dh">Private rounds, tenders & confidential IPOs (news)</h4>${rs.map(x=>`<a class="pstory" href="${esc(x.sources[0].url)}" target="_blank" rel="noopener"><div class="nmeta"><span class="chip ${(FTYPE[x.type]||['','p'])[1]}">${esc((FTYPE[x.type]||[x.type])[0])}</span>${x.size?`<span class="chip">${esc(x.size)}</span>`:''}<span class="note">${x.n} source${x.n>1?'s':''} · ${hAgo(x.date)} ago</span></div><b>${esc(x.title)}</b></a>`).join('')}`:''}
  ${!list.length&&!rs.length?'<p class="note">Nothing here yet — filings arrive with the next data refresh.</p>':''}
  <p class="note">SEC EDGAR full-text search (S-1/F-1, DEFM14A/PREM14A, S-4, 8-K Items 1.01/2.01), filtered to tech, software, semis, AI and internet issuers that are notable (≈$1B+, well-known, or on your watchlist). Private rounds from news RSS. Updated ${FL?esc(ago(FL.generatedAt)):'—'}.</p></div>`;
 p.querySelectorAll('[data-ff]').forEach(b=>b.onclick=()=>{flf=b.dataset.ff;renderFilings(p)});wireFilings(p)}

// ---------- Feed: Reels-style weighted shuffle of news, developing stories, X posts and movers ----------
const VERSION='v19 · Oct 21';
const JUNK=/\b(which (is|tech|stock)|better buy|should you buy|buy, sell,? or hold|prediction:|reasons to|stock quote price|top analyst reports|if i could only|savvy investors|invested in)\b/i;
const hrs=iso=>(Date.now()-new Date(iso))/36e5;
function feedNews(){return (DATA.today?.items||[]).filter(it=>hrs(it.last)<=36&&(it.dev?.summary||(it.score>=4.5&&!JUNK.test(it.title)))).slice(0,24)}
function newsCard(it){const n=it.nSources||new Set(it.sources.map(s=>s.source)).size,t=it.tickers.find(x=>DATA.quotes?.[x]);const q=t&&DATA.quotes[t];
 return `<section class="slide"><div class="card newsc"><div class="kicker">${it.tags[0]?`<span class="chip b">${esc(it.tags[0])}</span>`:'<span class="chip b">News</span>'}${it.tickers.slice(0,2).map(x=>`<span class="chip">${esc(x)}</span>`).join('')}<span class="note">${n} source${n>1?'s':''} · ${hAgo(it.last)} ago${it.paywalled.length&&!it.freeCoverage?' · 🔒':''}</span></div>
  <h3 class="devh">${esc(it.title)}</h3>${it.sum?`<p class="devs">${esc(it.sum)}</p>`:''}
  ${it.why?`<div class="whybox"><b>Why it matters</b><p>${esc(it.why)}</p></div>`:''}
  ${q?`<div class="stats up"><div class="stat">${esc(t)}<b class="${cls(q.pct)}">${pc(q.pct)}</b></div>${q.r5!=null?`<div class="stat">5 days<b class="${cls(q.r5)}">${pc(q.r5)}</b></div>`:''}${chatStat(t)}</div>`:''}
  <div style="flex:1"></div><button class="btn" data-n="${esc(it.id)}">Dig in</button></div></section>`}
// weighted random order (Efraimidis–Spirakis): higher weight = more likely near the top, but never the same order twice
const wshuffle=(arr,w)=>arr.map(x=>[Math.pow(Math.random(),1/Math.max(.01,w(x))),x]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
const fresh=iso=>Math.pow(.5,Math.max(0,hrs(iso))/8);  // half-life 8h
function buildFeed(){
 const Q=DATA.quotes;const tick=wlTickers().filter(t=>!['IGV','SOXX'].includes(t));
 const missing=tick.filter(t=>!Q[t]);const pend=missing.filter(t=>!(WL.groups.find(g=>g.tickers.includes(t))&&isPrivGroup(WL.groups.find(g=>g.tickers.includes(t))))),priv=missing.filter(t=>!pend.includes(t));
 const news=wshuffle(feedNews(),it=>(it.score/6)*(.35+fresh(it.last))*(it.dev?1.6:1)).map(it=>({k:'n:'+it.id,h:it.dev?.summary?devCard(it):newsCard(it)}));
 const xs=wshuffle(xFeed().filter(x=>!x.ts||hrs(x.ts)<=48).slice(0,14),x=>Math.log10(10+(x.likes||0)+3*(x.reposts||0))*(.4+fresh(x.ts||new Date().toISOString()))).map(x=>({k:'x:'+x.url,h:xCard(x)}));
 const mv=wshuffle(tick.filter(t=>Q[t]).map(t=>Q[t]),q=>.3+Math.abs(q.pct??0)).slice(0,14).map((q,i)=>({k:'m:'+q.ticker,h:moverCard(q,i)}));
 const fl=(FL?.filings||[]).filter(f=>f.notable&&hrs(f.date+'T21:00:00Z')<=24*7).slice(0,4).map(f=>({k:'f:'+f.acc,h:filingCard(f)})).concat((FL?.private||[]).filter(x=>x.notable&&hrs(x.date)<=72).slice(0,2).map(x=>({k:'r:'+x.id,h:roundCard(x)})));
 news.splice(Math.min(2,news.length),0,...wshuffle(fl,()=>1));
 const misc=[{k:'pulse',h:pulseCard()},...(WK?.lanes?.length?[{k:'week',h:weeklyCard()}]:[]),...pend.map(t=>({k:'p:'+t,h:pendingCard(t)})),...priv.map(t=>({k:'v:'+t,h:privateCard(t)}))];
 // rhythm: news, mover, news, X, news, mover, X …  (pulse/pending slot in after a few cards)
 const pat=['n','m','n','x','n','m','x'],src={n:news,m:mv,x:xs},out=[];let i=0,guard=0;
 while((news.length||mv.length||xs.length)&&guard++<200){const k=pat[i++%pat.length];const c=src[k].shift()||news.shift()||xs.shift()||mv.shift();if(c)out.push(c);if(out.length===3&&misc.length)out.push(...misc.splice(0))}
 out.push(...misc);
 const last=localStorage.getItem('signal.first');if(out.length>1&&out[0].k===last){const j=1+Math.floor(Math.random()*Math.min(4,out.length-1));[out[0],out[j]]=[out[j],out[0]]}
 if(out[0])localStorage.setItem('signal.first',out[0].k);
 return out.map(c=>c.h).join('')+`<section class="slide"><div class="card endc"><div class="big">✓</div><h3>You’re caught up</h3><p class="note">Scroll back to the top or pull down there for a fresh mix.</p><p class="ver">Signal ${VERSION} · data ${esc(ago(DATA.generatedAt))}</p></div></section>`;
}
let feedBusy=false;
async function refreshFeed(p,fetchData){if(feedBusy)return;feedBusy=true;const f=p.querySelector('#feed');if(f)f.classList.add('reloading');
 if(fetchData)await loadData();renderFeed(p);feedBusy=false;paintRefresh()}
function renderFeed(p){
 p.innerHTML=`<div class="ptr" id="ptr">↻ New mix</div><div class="feed" id="feed">${buildFeed()}</div>`;
 const f=p.querySelector('#feed'),ptr=p.querySelector('#ptr');
 fillPending(p);p.querySelectorAll('[data-sync]').forEach(b=>b.onclick=syncNow);
 p.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>openNews(b.dataset.n));
 p.querySelectorAll('[data-deep]').forEach(b=>b.onclick=()=>openDeep(b.dataset.deep));
 p.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>openLesson(b.dataset.lesson));wireFilings(p);
 // back at the top after going 2+ cards deep → refetch + reshuffle (TikTok-style)
 let deep=false;f.addEventListener('scroll',()=>{const h=f.clientHeight||1;if(f.scrollTop>h*1.5)deep=true;else if(deep&&f.scrollTop<4){deep=false;refreshFeed(p,true)}},{passive:true});
 // pull down past the first card
 let y0=null;f.addEventListener('touchstart',e=>{y0=f.scrollTop<=0?e.touches[0].clientY:null},{passive:true});
 f.addEventListener('touchmove',e=>{if(y0==null)return;const dy=e.touches[0].clientY-y0;ptr.style.opacity=Math.min(1,dy/80);ptr.classList.toggle('go',dy>80)},{passive:true});
 f.addEventListener('touchend',()=>{if(y0!=null&&ptr.classList.contains('go'))refreshFeed(p,true);y0=null;ptr.style.opacity=0;ptr.classList.remove('go')},{passive:true});
}

// ---------- sheets ----------
function sheet(title,body,onClose){
 const bg=document.createElement('div');bg.className='sheet-bg';const s=document.createElement('div');s.className='sheet';
 s.innerHTML=`<div class="grab"></div><div class="hd"><b>${title}</b><button>Done</button></div><div class="bd">${body}</div>`;
 // iOS doesn't shrink fixed layers for the on-screen keyboard: lift the sheet above it and keep the focused field in view
 const vv=window.visualViewport,fit=()=>{if(!vv)return;const kb=Math.max(0,innerHeight-vv.height-vv.offsetTop);s.style.bottom=kb>80?kb+'px':''};
 vv&&vv.addEventListener('resize',fit);vv&&vv.addEventListener('scroll',fit);
 s.addEventListener('focusin',e=>{if(e.target.matches('input,textarea,select'))setTimeout(()=>{fit();e.target.scrollIntoView({block:'center',behavior:'smooth'})},300)});
 const close=()=>{if(document.activeElement&&s.contains(document.activeElement))document.activeElement.blur();vv&&vv.removeEventListener('resize',fit);vv&&vv.removeEventListener('scroll',fit);bg.remove();s.remove();onClose&&onClose()};bg.onclick=close;s.querySelector('.hd button').onclick=close;
 document.body.append(bg,s);return s;
}
// 'On X' posts from data/x.json (separate job); hidden when there are none
const kfmt=n=>n==null?'':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(n>=1e4?0:1)+'K':String(n);
function xHTML(posts){if(!posts?.length)return '';
 return `<h4 class="dh">On X</h4>${posts.slice(0,5).map(x=>`<a class="xpost" href="${esc(x.url)}" target="_blank" rel="noopener"><div class="xh"><b>${esc(x.name||x.handle||'')}</b>${x.handle?`<span>@${esc(String(x.handle).replace(/^@/,''))}</span>`:''}${x.ts?`<span>· ${esc(hAgo(x.ts))}</span>`:''}</div><p>${esc(x.text||'')}</p>${x.likes!=null||x.reposts!=null||x.note?`<div class="xs">${x.likes!=null?`♥ ${kfmt(x.likes)}`:''}${x.reposts!=null?` · ↻ ${kfmt(x.reposts)}`:''}${x.note?` · ${esc(x.note)}`:''}</div>`:''}</a>`).join('')}`}
function openDeep(t){
 const q=DATA.quotes[t];const n=DATA.news[t]||[];const sec=DATA.sec[t];const le=lastEarn(t),ne=nextEarn(t);
 const filings=(sec?.filings||[]).filter(f=>['8-K','10-Q','10-K','6-K','20-F','S-3ASR','424B2','424B5'].includes(f.form)).slice(0,6);
 sheet(esc(t),`
  <h3>${esc(q.name)}</h3><p class="note">${esc(groupOf(t))} · ${ccy(q)}${f2(q.price)} <span class="${cls(q.pct)}">${pc(q.pct)}</span> · as of ${esc(q.asOf||'')}</p>
  ${aiWhy(t)?`<div class="kicker" style="margin-top:6px"><span class="chip ai">AI summary of the sources below</span></div><p>${cite(aiWhy(t),true)}</p>${whySources(t)}<p class="note">The numbers: ${esc(whyMoved(q))}</p>`:`<p>${esc(whyMoved(q))}</p>`}
  <p class="note">How to read this: compare the move to the sector ETF first. If the stock moved with the group, the cause is usually macro or sector news (rates, AI capex, export controls). If it diverged, look for a company headline, an analyst call, or a filing below. Matching cause to move is a judgment call — open the sources to check.</p>
  <h4 style="margin:18px 0 4px">Why it matters for you</h4><p>${esc(PROFILES[t]||'')} ${esc(bankerAngle(q))}</p>
  ${le?`<h4 style="margin:18px 0 4px">Last earnings · ${dshort(le.date)}</h4><p>${le.eps!=null?`EPS $${f2(le.eps)} vs $${f2(le.epsForecast)} consensus (${le.result})`:'EPS not available'}${le.reaction!=null?`; stock moved <span class="${cls(le.reaction)}">${pc(le.reaction)}</span> on the report and ${pc(le.sinceReport)} since.`:'.'}</p>`:''}
  ${ne?`<p class="note">Next report: ${dshort(ne.date)}${ne.time?` (${ne.time.replace('time-','').replace(/-/g,' ')})`:''}${ne.epsForecast!=null?` · consensus EPS $${f2(ne.epsForecast)}`:''} — date per Nasdaq/Zacks, may be estimated.</p>`:''}
  ${n.length?`<h4 style="margin:18px 0 0">Headlines (last 3 days)</h4>${n.map(h=>`<a class="hl" href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title)}<small>${esc(h.source)} · ${esc(fmtPT(h.date))}</small></a>`).join('')}`:''}
  ${filings.length?`<h4 style="margin:18px 0 0">SEC filings</h4>${filings.map(f=>`<a class="hl" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.form)}${f.items?` · items ${esc(f.items)}`:''}<small>Filed ${esc(f.date)}${f.desc?' · '+esc(f.desc):''}</small></a>`).join('')}<div class="links"><a href="${esc(sec.browse)}" target="_blank" rel="noopener">All filings on EDGAR ↗</a></div>`:''}
  ${chatterHTML(t)}
  ${xHTML(DATA.xTickers?.[t])}
  ${q.src?`<div class="links"><a href="${esc(q.src)}" target="_blank">Quote source ↗</a></div>`:''}
  `);
}
function openLesson(id){
 const L=LESSONS.find(x=>x.id===id);
 sheet('Lesson',`<div class="kicker" style="color:var(--sub);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${esc(L.tag)}</div><h3>${esc(L.title)}</h3><p>${esc(L.plain)}</p><h4 style="margin:18px 0 4px">In your seat</h4><p>${esc(L.banker)}</p>
  ${L.numbers.length?`<h4 style="margin:18px 0 4px">Walk me through the numbers</h4><ol>${L.numbers.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p class="note">Illustrative numbers to show the mechanics, not a real deal.</p>`:''}`);
}
// Industry auto-fill for new tickers: SEC's public EDGAR API (CORS-enabled) gives the SIC code; we map it to a group.
let CIKS=null;
const SICMAP=[ // [sic codes, regex for an existing group, fallback group name]
 [[3674],/Semis · Other/,'Semis · Other'],
 [[3559,3825,3829],/Equipment/,'Semis · Equipment (WFE)'],
 [[3827,3661,3357],/Optics/,'Semis · Optics'],
 [[3576,3663,3669],/networking/i,'Hardware · Networking'],
 [[3571,3572,3575,3577],/servers|Hardware · Computers/i,'Hardware · Computers & storage'],
 [[3670,3672,3677,3678,3679,3690],/Components/,'Hardware · Components'],
 [[5961,5990,4899,7310,7311,7319],/Internet · Platforms/,'Internet · Platforms & ads'],
 [[6199,6099,6141,6153],/Internet · Fintech/,'Internet · Fintech'],
 [[7370,7371,7372,7373,7374,7379,7389],/Software · Other/,'Software · Other'],
];
async function loadCiks(){if(!CIKS){try{const r=await fetch('data/tickers.json');CIKS=r.ok?await r.json():{}}catch(e){CIKS={}}}return CIKS}
const cikOf=t=>{const v=CIKS&&(CIKS[t]||CIKS[t.replace('.','-')]);return Array.isArray(v)?v[0]:v};
// brand names that don't match the SEC legal name (SpaceX = Space Exploration Technologies Corp)
const ALIAS={spacex:'SPCX',google:'GOOGL',alphabet:'GOOGL',facebook:'META',meta:'META',tsmc:'TSM','taiwan semi':'TSM',supermicro:'SMCI','super micro':'SMCI',amazon:'AMZN',aws:'AMZN',apple:'AAPL',tesla:'TSLA',nvidia:'NVDA',broadcom:'AVGO',arm:'ARM',coreweave:'CRWV',figma:'FIG',klarna:'KLAR',circle:'CRCL'};
async function resolveCo(q){ // -> {ticker,title} | {cands:[...]} | null
 await loadCiks();const raw=q.trim(),up=raw.toUpperCase(),k=raw.toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
 if(ALIAS[k.replace(/ /g,'')]||ALIAS[k]){const t=ALIAS[k.replace(/ /g,'')]||ALIAS[k];return {ticker:t,title:(CIKS[t]||[])[1]||t,alias:true}}
 if(/^[A-Z][A-Z0-9.\-]{0,9}$/.test(up)&&cikOf(up))return {ticker:up,title:(CIKS[up]||[])[1]||up};
 if(k.length<3)return null;
 const n=s=>s.toLowerCase().replace(/[^a-z0-9]/g,''),kk=n(k),c=[];
 for(const [t,v] of Object.entries(CIKS)){const ti=Array.isArray(v)?v[1]:'';if(ti&&n(ti).startsWith(kk))c.push({ticker:t,title:ti});if(c.length>40)break}
 c.sort((x,y)=>x.ticker.length-y.ticker.length);
 return c.length?{cands:c.slice(0,3)}:null;
}
async function sicLookup(t){
 await loadCiks();const cik=cikOf(t);if(!cik)return null;
 try{const r=await fetch(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10,'0')}.json`);if(!r.ok)return null;const j=await r.json();
  return {sic:+j.sic||0,desc:j.sicDescription||'',name:j.name||''}}catch(e){return null}
}
function groupForSic(t,info){
 if(DATA?.quotes?.[t]?.group){const gi=WL.groups.findIndex(g=>g.name===DATA.quotes[t].group);if(gi>=0)return {gi}}
 const sec=Math.floor(info.sic/100);
 const row=SICMAP.find(r=>r[0].includes(info.sic))||(sec===73?SICMAP[6]:sec===36?SICMAP[5]:null);
 const name=row?row[2]:'Other · '+(info.desc||'Unclassified').toLowerCase().replace(/(^|[\s,&])\w/g,m=>m.toUpperCase()).slice(0,40);
 const gi=WL.groups.findIndex(g=>row?row[1].test(g.name):g.name===name);
 return gi>=0?{gi}:{name};
}
const PRIV='Private · News only';
const isPrivGroup=g=>/^private/i.test(g.name);
function repoTickers(){const s=new Set();(DATA?.groups||[]).forEach(g=>g.tickers.forEach(t=>s.add(t)));return s}
function unsynced(){const r=repoTickers();const mine=wlTickers();return {add:mine.filter(t=>!r.has(t)),rm:[...r].filter(t=>!mine.includes(t))}}
const SYNC_URL=()=>{const body='Sent from Signal on my phone. The **watchlist-sync** workflow copies this list into `watchlist.json`, closes this issue and refreshes the data (about 3 minutes).\n\n```json\n'+JSON.stringify({groups:WL.groups.map(g=>({name:g.name,tickers:g.tickers}))})+'\n```\n';
 return 'https://github.com/BanjoN3g1/signal/issues/new?title='+encodeURIComponent('Watchlist sync')+'&labels=watchlist-sync&body='+encodeURIComponent(body)};
function syncNow(){window.open(SYNC_URL(),'_blank','noopener');toast('Tap “Create” on GitHub — data for new names arrives in ~3 min')}
function syncBanner(){const u=unsynced();if(!u.add.length&&!u.rm.length)return '';
 return `<div class="syncb"><div><b>${u.add.length?esc(u.add.slice(0,4).join(', '))+(u.add.length>4?'…':'')+' not in the data pipeline yet':'Removals not synced yet'}</b><p class="note">Your list lives on this phone; the hourly data pull reads the repo. One tap sends it (then tap “Create” on GitHub).</p></div><button class="btn" data-sync>Sync</button></div>`}
function openWatchlist(){
 let pending=null,pick=null; // pending: suggested new group name; pick: resolved {ticker,title} or {private:name}
 const opts=()=>WL.groups.map((g,i)=>`<option value="${i}">${esc(g.name)}</option>`).join('')+(pending&&!WL.groups.some(g=>g.name===pending)?`<option value="auto">${esc(pending)} (new)</option>`:'')+'<option value="new">+ New group…</option>';
 const draw=()=>`${syncBanner()}<h4 style="margin:6px 0 4px">Add a company</h4>
  <div class="addrow"><input id="nt" type="text" inputmode="text" enterkeyhint="done" placeholder="Ticker or name, e.g. TXN or SpaceX" maxlength="40" autocapitalize="words" autocomplete="off" autocorrect="off" spellcheck="false"><button class="btn" id="add">Add</button></div>
  <div id="cands"></div>
  <div class="addrow"><select id="ng" aria-label="Group">${opts()}</select></div>
  <p class="note" id="ind" style="margin:2px 0 0;min-height:20px">Type a ticker or company name — the industry is filled in from SEC EDGAR. Private companies are tracked news-only.</p>
  ${WL.groups.map((g,gi)=>`<div class="group"><div class="gname">${esc(g.name)}</div><div class="tchips">${g.tickers.map(t=>`<span class="tchip">${esc(t)}<button data-rm="${gi}:${esc(t)}" aria-label="Remove">×</button></span>`).join('')||'<span class="note">Empty</span>'}</div></div>`).join('')}
  <p class="note">Your list is saved on this phone. The data pipeline reads <b>watchlist.json</b> in the repo — the Sync button sends your list there in one tap (you confirm on GitHub). US listings use Nasdaq data; IFX uses Google Finance (Xetra, EUR).</p>
  <div class="addrow"><button class="btn ghost" id="sv" style="flex:1">Copy list</button><button class="btn ghost" id="reset" style="flex:1;font-size:14px">Reset to defaults</button></div>`;
 const s=sheet('Watchlist',draw(),()=>render());
 const bd=s.querySelector('.bd');
 const persist=()=>{WL.updatedAt=Date.now();saveLocalWL(WL)};
 const wire=()=>{
  const nt=bd.querySelector('#nt'),ng=bd.querySelector('#ng'),ind=bd.querySelector('#ind'),cd=bd.querySelector('#cands');let seq=0,timer;
  const choose=async(r,my)=>{pick=r;cd.innerHTML='';ind.textContent='Looking up '+r.ticker+'…';const info=await sicLookup(r.ticker);if(my!==seq)return;
   if(!info||!info.sic){pending=null;ng.innerHTML=opts();ind.innerHTML=`<b>${esc(r.ticker)}</b> · ${esc(r.title)} — no industry code on file, pick a group.`;return}
   const g=groupForSic(r.ticker,info);pending=g.name||null;ng.innerHTML=opts();ng.value=g.gi!=null?String(g.gi):'auto';
   ind.innerHTML=`<b>${esc(r.ticker)}</b> · ${esc(info.name)} · ${esc(info.desc)} (SIC ${info.sic}) → ${esc(g.gi!=null?WL.groups[g.gi].name:g.name)}${r.alias?'':''}`};
  nt.oninput=()=>{clearTimeout(timer);pick=null;cd.innerHTML='';const q=nt.value.trim();if(q.length<2){ind.textContent='';return}
   timer=setTimeout(async()=>{const my=++seq;const r=await resolveCo(q);if(my!==seq)return;
    if(r&&r.ticker)return choose(r,my);
    const privBtn=`<button class="cand priv" data-priv="1"><b>Track “${esc(q)}” as private</b><span>News only — no stock quote or filings</span></button>`;
    if(r&&r.cands){cd.innerHTML=r.cands.map((c,k)=>`<button class="cand" data-k="${k}"><b>${esc(c.ticker)}</b><span>${esc(c.title)}</span></button>`).join('')+privBtn;ind.textContent='Did you mean one of these?'}
    else{cd.innerHTML=privBtn;ind.textContent='Not found among SEC-registered companies — likely private or listed abroad.'}
    cd.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const c=r.cands[+b.dataset.k];nt.value=c.ticker;choose(c,++seq)});
    const pb=cd.querySelector('[data-priv]');pb.onclick=()=>{pick={private:q.slice(0,40)};pending=PRIV;ng.innerHTML=opts();const gi=WL.groups.findIndex(isPrivGroup);ng.value=gi>=0?String(gi):'auto';cd.innerHTML='';ind.innerHTML=`<b>${esc(q)}</b> → ${esc(PRIV)}: tracked via news headlines only.`};
   },350)};
  nt.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();bd.querySelector('#add').click()}};
  bd.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const [gi,t]=b.dataset.rm.split(':');WL.groups[gi].tickers=WL.groups[gi].tickers.filter(x=>x!==t);WL.groups=WL.groups.filter(g=>g.tickers.length||!/^(Private|Other|Software · Other|Semis · Other)/.test(g.name));persist(false);bd.innerHTML=draw();wire()});
  bd.querySelector('#add').onclick=async()=>{
   if(!pick){const q=nt.value.trim();if(!q)return toast('Type a ticker or company name');const r=await resolveCo(q);if(r&&r.ticker)pick=r;else return toast('Pick a match below, or track it as private')}
   const t=pick.private||pick.ticker;
   if(wlTickers().includes(t))return toast(t+' is already on your list');
   let gi=ng.value;const bench=WL.groups.findIndex(g=>g.name==='Benchmarks'),at=bench>=0?bench:WL.groups.length;
   if(pick.private&&gi!=='auto'&&!isPrivGroup(WL.groups[gi]||{name:''})){gi='auto';pending=PRIV}
   if(gi==='auto'||gi==='new'){const nm=gi==='auto'?pending:prompt('Group name (e.g. "Semis · Analog")');if(!nm)return;const ex=WL.groups.findIndex(g=>g.name===nm);if(ex>=0)gi=ex;else{WL.groups.splice(at,0,{name:nm.slice(0,60),tickers:[]});gi=at}}
   WL.groups[gi].tickers.push(t);pending=null;pick=null;persist(false);bd.innerHTML=draw();wire();
   toast('Added '+t+' — tap Sync to send it to the data pipeline')};
  const sb=bd.querySelector('[data-sync]');if(sb)sb.onclick=syncNow;
  bd.querySelector('#sv').onclick=async()=>{const txt=JSON.stringify({groups:WL.groups},null,1);try{await navigator.clipboard.writeText(txt);toast('Copied — paste into watchlist.json on GitHub')}catch(e){prompt('Copy this into watchlist.json:',txt)}};
  bd.querySelector('#reset').onclick=async()=>{localStorage.removeItem('signal.wl');try{WL=await (await fetch('watchlist_default.json')).json()}catch(e){WL={groups:DATA.groups}}persist(false);bd.innerHTML=draw();wire()};
 };wire();
}
// one-time fix for names typed as tickers before name search existed (e.g. "SPACEX" -> SPCX)
const INET=[['Internet · Platforms & ads',['META','GOOGL','AMZN','NFLX','PINS','RDDT','TTD','APP']],['Internet · Marketplaces & e-commerce',['UBER','DASH','ABNB','MELI','SE','CPNG']],['Internet · Fintech',['PYPL','XYZ','COIN','HOOD','AFRM']]];
function migrateWL(){if(!WL)return;let ch=false;
 if(!localStorage.getItem('signal.mig.internet')){localStorage.setItem('signal.mig.internet','1');if(!WL.groups.some(g=>/^Internet/.test(g.name))){const have=new Set(WL.groups.flatMap(g=>g.tickers));const bi=WL.groups.findIndex(g=>g.name==='Benchmarks');WL.groups.splice(bi<0?WL.groups.length:bi,0,...INET.map(([n,t])=>({name:n,tickers:t.filter(x=>!have.has(x))})));ch=true}}WL.groups.forEach(g=>{g.tickers=g.tickers.map(t=>{const k=t.toLowerCase().replace(/[^a-z0-9]/g,'');if(ALIAS[k]&&ALIAS[k]!==t&&!(DATA?.quotes?.[t])){ch=true;return ALIAS[k]}return t}).filter((t,i,arr)=>arr.indexOf(t)===i)});if(ch)saveLocalWL(WL)}

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
   <div class="r2">${e.result?`<span class="chip ${e.result==='beat'?'g':e.result==='miss'?'r':''}">${e.result==='beat'?'Beat':e.result==='miss'?'Miss':'In line'}</span>`:''}${e.eps!=null?`<span class="chip">EPS $${f2(e.eps)} vs $${f2(e.epsForecast)}</span>`:''}${e.surprise!=null?`<span class="chip">${e.surprise>0?'+':''}${e.surprise}% surprise</span>`:''}${e.sinceReport!=null?`<span class="chip">${pc(e.sinceReport)} since</span>`:''}${e.deep?'<span class="chip ai">AI deep dive</span>':''}</div>
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
   ${e.deep?deepHTML(e):''}
   <h4 style="margin:18px 0 4px">${e.deep?'The stock reaction':'What it means for your work'}</h4><p>${esc(earnWhat(e))}</p>
   ${(pr.highlights||[]).length?`<h4 style="margin:18px 0 4px">From the press release</h4>${pr.highlights.map(x=>`<div class="quote">${esc(x)}</div>`).join('')}`:''}
   ${(pr.outlook||[]).length?`<h4 style="margin:18px 0 4px">Outlook / guidance language</h4>${pr.outlook.map(x=>`<div class="quote">${esc(x)}</div>`).join('')}`:''}
   ${!(pr.highlights||[]).length&&!(pr.outlook||[]).length?`<p class="note">I couldn't pull clean quotes from the filing automatically — open it below.</p>`:''}
   ${(pr.highlights||[]).length||(pr.outlook||[]).length?`<p class="note">Quotes are pulled verbatim from the SEC filing by a script and may be cut mid-thought; open the filing for full context.</p>`:''}
   <div class="links">${e.filing?`<a href="${esc(e.filing.url)}" target="_blank">${esc(e.filing.form)} on EDGAR ↗</a>`:''}${pr.url?`<a href="${esc(pr.url)}" target="_blank">Press release (EX-99.1) ↗</a>`:''}${e.periodic?`<a href="${esc(e.periodic.url)}" target="_blank">${esc(e.periodic.form)} ↗</a>`:''}</div>`)});
}

// ---------- boot ----------
if('serviceWorker' in navigator){
 // a new SW takes over immediately (skipWaiting + clients.claim); reload once so the new app.js is running
 const had=!!navigator.serviceWorker.controller;let reloaded=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloaded){reloaded=true;location.reload()}});
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>{r.update();let hid=0;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){hid=Date.now();return}r.update();
   if(hid&&Date.now()-hid>10*60*1000&&route().world==='work'&&tab==='feed'){const p=$('#pane');if(p)refreshFeed(p,true)}})}).catch(()=>{});
}
app.innerHTML='<div class="empty"><p>Loading…</p></div>';
loadData().then(render);
})();
