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
 try{const r=await fetch('data/feed.json?t='+Date.now(),{cache:'no-store'});if(r.ok)DATA=await r.json()}catch(e){}
 if(!WL){WL=loadLocalWL();if(!WL){try{WL=await (await fetch('watchlist_default.json')).json()}catch(e){WL=DATA?{groups:DATA.groups}:{groups:[]}}}}
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
 const titles={feed:'Feed',earnings:'Earnings',deals:'Deal Room',pods:'Podcasts',learn:'Learn'};
 app.innerHTML=`<div class="view">
  <div class="top"><button class="back" id="bk">${I.back}</button><div class="title">${titles[tab]||'Work'}</div>
   ${['feed','earnings'].includes(tab)?`<button class="iconbtn" id="wl" aria-label="Edit watchlist">${I.list}</button>`:''}
   ${tab!=='deals'?`<button class="rbtn" id="rf" aria-label="Refresh data"></button>`:''}</div>
  <div class="pane" id="pane"></div>
  <nav class="tabs">${[['feed','Feed',I.feed],['earnings','Earnings',I.earn],['deals','Deal Room',I.deal],['pods','Podcasts',I.pod],['learn','Learn',I.learn]].map(([k,n,ic])=>`<button data-t="${k}" class="${tab===k?'on':''}">${ic}${n}</button>`).join('')}</nav>
 </div>`;
 $('#bk').onclick=()=>location.hash='#/';
 const rf=$('#rf');if(rf){rf.onclick=startRefresh;paintRefresh()}
 const wl=$('#wl');if(wl)wl.onclick=openWatchlist;
 app.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>location.hash='#/work/'+b.dataset.t);
 const p=$('#pane');
 if(tab==='deals')return renderDeals(p);
 if(tab==='pods')return renderPods(p);
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
 // iOS doesn't shrink fixed layers for the on-screen keyboard: lift the sheet above it and keep the focused field in view
 const vv=window.visualViewport,fit=()=>{if(!vv)return;const kb=Math.max(0,innerHeight-vv.height-vv.offsetTop);s.style.bottom=kb>80?kb+'px':''};
 vv&&vv.addEventListener('resize',fit);vv&&vv.addEventListener('scroll',fit);
 s.addEventListener('focusin',e=>{if(e.target.matches('input,textarea,select'))setTimeout(()=>{fit();e.target.scrollIntoView({block:'center',behavior:'smooth'})},300)});
 const close=()=>{if(document.activeElement&&s.contains(document.activeElement))document.activeElement.blur();vv&&vv.removeEventListener('resize',fit);vv&&vv.removeEventListener('scroll',fit);bg.remove();s.remove();onClose&&onClose()};bg.onclick=close;s.querySelector('.hd button').onclick=close;
 document.body.append(bg,s);return s;
}
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
 [[7370,7371,7372,7373,7374,7379,7389],/Software · Other/,'Software · Other'],
];
async function sicLookup(t){
 if(!CIKS){try{const r=await fetch('data/tickers.json');CIKS=r.ok?await r.json():{}}catch(e){CIKS={}}}
 const cik=CIKS[t]||CIKS[t.replace('.','-')];if(!cik)return null;
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
function openWatchlist(){
 let pending=null; // suggested new group name from the SIC lookup
 const opts=()=>WL.groups.map((g,i)=>`<option value="${i}">${esc(g.name)}</option>`).join('')+(pending?`<option value="auto">${esc(pending)} (new)</option>`:'')+'<option value="new">+ New group…</option>';
 const draw=()=>`<h4 style="margin:6px 0 4px">Add a ticker</h4>
  <div class="addrow"><input id="nt" type="text" inputmode="text" enterkeyhint="done" placeholder="e.g. TXN" maxlength="10" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false"><button class="btn" id="add">Add</button></div>
  <div class="addrow"><select id="ng" aria-label="Group">${opts()}</select></div>
  <p class="note" id="ind" style="margin:2px 0 0;min-height:20px">Type a ticker — its industry is filled in from SEC EDGAR. Change the group above if you like.</p>
  ${WL.groups.map((g,gi)=>`<div class="group"><div class="gname">${esc(g.name)}</div><div class="tchips">${g.tickers.map(t=>`<span class="tchip">${esc(t)}<button data-rm="${gi}:${esc(t)}" aria-label="Remove">×</button></span>`).join('')||'<span class="note">Empty</span>'}</div></div>`).join('')}
  <p class="note">Your list is saved on this phone. Data is pulled for the tickers in the repo's <b>watchlist.json</b> (defaults to the list above). To get data for a new ticker, add it there too — tap "Copy list" and paste it into watchlist.json on GitHub. US listings use Nasdaq data; IFX uses Google Finance (Xetra, EUR).</p>
  <div class="addrow"><button class="btn ghost" id="sv" style="flex:1">Copy list</button><button class="btn ghost" id="reset" style="flex:1;font-size:14px">Reset to defaults</button></div>`;
 const s=sheet('Watchlist',draw(),()=>render());
 const bd=s.querySelector('.bd');
 const persist=()=>{WL.updatedAt=Date.now();saveLocalWL(WL)};
 const wire=()=>{
  const nt=bd.querySelector('#nt'),ng=bd.querySelector('#ng'),ind=bd.querySelector('#ind');let seq=0,timer;
  nt.oninput=()=>{clearTimeout(timer);const t=nt.value.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)){ind.textContent='';return}
   timer=setTimeout(async()=>{const my=++seq;ind.textContent='Looking up '+t+'…';const info=await sicLookup(t);if(my!==seq)return;
    if(!info||!info.sic){ind.textContent=info?`${info.name}: no industry code on file — pick a group.`:`${t} isn’t in SEC’s list (foreign listing?) — pick a group.`;return}
    const g=groupForSic(t,info);pending=g.name||null;const v=ng.value;ng.innerHTML=opts();ng.value=g.gi!=null?String(g.gi):'auto';
    ind.innerHTML=`<b>${esc(info.name)}</b> · ${esc(info.desc)} (SIC ${info.sic}) → ${esc(g.gi!=null?WL.groups[g.gi].name:g.name)}`},350)};
  nt.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();bd.querySelector('#add').click()}};
  bd.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const [gi,t]=b.dataset.rm.split(':');WL.groups[gi].tickers=WL.groups[gi].tickers.filter(x=>x!==t);persist(false);bd.innerHTML=draw();wire()});
  bd.querySelector('#add').onclick=()=>{const t=nt.value.trim().toUpperCase();if(!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t))return toast('Enter a ticker like TXN');
   if(wlTickers().includes(t))return toast(t+' is already on your list');
   let gi=ng.value;const bench=WL.groups.findIndex(g=>g.name==='Benchmarks'),at=bench>=0?bench:WL.groups.length;
   if(gi==='auto'||gi==='new'){const nm=gi==='auto'?pending:prompt('Group name (e.g. "Semis · Analog")');if(!nm)return;WL.groups.splice(at,0,{name:nm.slice(0,60),tickers:[]});gi=at}
   WL.groups[gi].tickers.push(t);pending=null;persist(false);toast('Added '+t+' to '+WL.groups[gi].name.replace(/^.*· /,''));bd.innerHTML=draw();wire()};
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
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
app.innerHTML='<div class="empty"><p>Loading…</p></div>';
loadData().then(render);
})();
