// Deal Room v1: anonymized deal in, strategic rationale & narrative out.
// Everything is templated on this phone from industry / sub-industry / size / pitch type. No network, no API.
window.DEALROOM=(()=>{
const KEY='signal.deals';
const IND={
 software:{n:'Software',subs:{infra:'Infrastructure & DevOps',sec:'Cybersecurity',data:'Data, analytics & AI',vert:'Vertical SaaS',apps:'Horizontal apps (CRM, HCM, ERP)',fin:'Fintech & payments software'}},
 semis:{n:'Semiconductors',subs:{compute:'Compute & AI accelerators',analog:'Analog, power & mixed-signal',memory:'Memory & storage',semicap:'Semicap equipment',rf:'RF & connectivity',auto:'Auto & industrial',ip:'IP & EDA',optical:'Optical & networking silicon'}},
 hardware:{n:'Hardware & networking',subs:{net:'Networking gear',servers:'Servers & storage systems',devices:'Devices & peripherals'}},
 internet:{n:'Internet & consumer tech',subs:{market:'Marketplaces',media:'Media & ads',gaming:'Gaming'}},
 other:{n:'Other / general',subs:{gen:'General'}}
};
const CAP={priv:'Private / sponsor-owned',small:'Small cap (<$2B)',mid:'Mid cap ($2–10B)',large:'Large cap ($10–50B)',mega:'Mega cap ($50B+)'};
const TYPE={sell:'Sell-side M&A',buy:'Buy-side M&A',ipo:'IPO / ECM',debt:'Debt financing',act:'Activism defense',spin:'Spin-off / carve-out'};

// ---- knowledge (general patterns, not live data) ----
const SUBK={
 infra:{metric:'EV / NTM revenue, cross-checked against growth + FCF margin (Rule of 40)',buyers:['Hyperscalers and cloud platforms filling a gap in their stack','Large infra-software consolidators (observability, DevOps, databases)','Take-private sponsors with infra software platforms'],angles:['Consumption tailwind from AI workloads','Net revenue retention and expansion within existing customers','Platform vs point product — can it be the control point?']},
 sec:{metric:'EV / NTM revenue and ARR multiple; Rule of 40 drives the premium',buyers:['Platform security vendors consolidating point products','Network and cloud infra players adding security','Sponsors with security roll-ups (very active buyer group)'],angles:['Vendor consolidation: CISOs want fewer tools','Identity, cloud and AI-security as the hot sub-segments','Mission-critical spend that holds up in downturns']},
 data:{metric:'EV / NTM revenue; AI-exposed assets trade at a premium so show it with and without the AI line',buyers:['Hyperscalers and data platforms (warehouse, lakehouse)','Enterprise software majors adding AI and data layers','Growth equity and crossover funds'],angles:['Proprietary data and workflows as the AI moat','Usage-based revenue riding AI adoption','Path from tooling to platform']},
 vert:{metric:'EV / NTM revenue and EV / EBITDA — vertical SaaS is often valued on profitability, not just growth',buyers:['Sponsors (vertical SaaS is classic PE territory)','Industry-specific software consolidators','Strategics in the end market buying software'],angles:['Sticky, low-churn customer base with high switching costs','Embedded payments and fintech upsell','Roll-up platform for tuck-ins']},
 apps:{metric:'EV / NTM revenue vs EV / FCF; mature apps names are increasingly framed on FCF',buyers:['Large application suites filling a module gap','Take-private sponsors (margin expansion story)','Adjacent platforms looking to cross-sell into the installed base'],angles:['Seat-based pricing vs AI agents — threat or upsell?','Margin expansion and cost discipline','Installed base as a distribution channel']},
 fin:{metric:'EV / NTM revenue and EV / gross profit (strip pass-through payment volume)',buyers:['Payment networks and processors','Banks and core-banking vendors','Fintech-focused sponsors'],angles:['Take-rate durability and payment volume growth','Embedded finance inside vertical software','Regulatory moat (licenses, compliance stack)']},
 compute:{metric:'P/E or EV / EBITDA on NTM and through-cycle numbers; AI exposure carries a big premium',buyers:['Large merchant chip vendors adding AI capability','Hyperscalers building custom silicon teams','Systems and networking players going vertical'],angles:['AI data-center demand and custom silicon (ASIC) wins','Software and ecosystem moat beyond the chip','Supply access: foundry capacity and advanced packaging']},
 analog:{metric:'EV / EBITDA and P/E on through-cycle (normalized) earnings — analog is cyclical but long-lived',buyers:['Diversified analog and power majors','Auto and industrial semi suppliers','Asian and European strategics (watch regulatory review)'],angles:['Long product lifecycles and broad customer base','Power semis for EVs, data centers and grid','Inventory-cycle position: buying at the trough']},
 memory:{metric:'P / book and EV / EBITDA on mid-cycle numbers; memory is the most cyclical corner',buyers:['Memory majors seeking scale','Storage systems vendors','Strategic or sovereign-backed buyers (heavy regulatory scrutiny)'],angles:['HBM and AI memory as the growth driver','Supply discipline and capex cycle','Scale economics — fewer players, better pricing']},
 semicap:{metric:'P/E and EV / EBITDA vs WFE (wafer fab equipment) cycle; services revenue gets a higher multiple',buyers:['Large equipment makers adding process steps','Metrology, inspection and materials consolidators','Industrial technology conglomerates'],angles:['Leading-edge, advanced packaging and HBM capex','Installed-base services as recurring revenue','China export-control exposure (cuts both ways)']},
 rf:{metric:'EV / EBITDA and P/E; customer concentration (one big phone OEM) compresses multiples',buyers:['Diversified connectivity chip vendors','Auto and IoT semi suppliers','Sponsors for carve-outs of non-core RF lines'],angles:['Content gains per device (Wi-Fi 7, 5G advanced)','Diversification away from a single customer','Edge AI devices as the next unit cycle']},
 auto:{metric:'EV / EBITDA on through-cycle numbers; content-per-vehicle growth supports a premium',buyers:['Auto and industrial semi majors','Tier-1 auto suppliers going into silicon','European and Japanese strategics'],angles:['EV, ADAS and software-defined-vehicle content growth','Design-win backlog as visibility','Industrial automation recovery']},
 ip:{metric:'EV / NTM revenue — IP and EDA trade like software (recurring, high margin)',buyers:['EDA majors','Chip vendors wanting to own key IP','Software-focused sponsors'],angles:['Royalty and subscription revenue = software-like quality','Every new chip design (incl. custom AI) needs it','AI-assisted chip design']},
 optical:{metric:'EV / EBITDA and P/E; AI networking exposure trades at a premium',buyers:['Networking silicon majors','Optical component and module consolidators','Hyperscaler-aligned systems vendors'],angles:['AI cluster bandwidth: 800G/1.6T optics, co-packaged optics','Merchant vs custom networking silicon','Capacity and supply-chain control']},
 net:{metric:'EV / EBITDA and P/E; software and services mix lifts the multiple',buyers:['Large networking vendors','Security platforms moving into network hardware','Sponsors for mature hardware assets'],angles:['AI data-center networking upgrade cycle','Shift to software and subscription revenue','Campus and enterprise refresh']},
 servers:{metric:'EV / EBITDA and P/E; low gross margins mean scale matters',buyers:['Systems OEMs and ODMs','Storage and data-management vendors','Sponsors (carve-outs)'],angles:['AI server demand and liquid cooling','Attach of software and services','Supply allocation for GPUs']},
 devices:{metric:'EV / EBITDA and P/E',buyers:['Consumer electronics majors','Platform companies seeking hardware endpoints','Sponsors'],angles:['Brand and installed base','Services attach revenue','Edge AI device refresh']},
 market:{metric:'EV / gross profit or EV / EBITDA; take rate and GMV growth drive it',buyers:['Larger marketplaces in adjacent categories','Internet platforms','Growth equity'],angles:['Network effects and liquidity','Ads revenue on top of the take rate','International expansion']},
 media:{metric:'EV / EBITDA; ad-cycle sensitivity discounts the multiple',buyers:['Ad-tech and media platforms','Retail media networks','Sponsors'],angles:['First-party data in a post-cookie world','Retail media and CTV growth','AI-driven targeting and measurement']},
 gaming:{metric:'EV / EBITDA and P/E; franchise strength and live-service revenue drive the premium',buyers:['Large publishers and platform holders','Tech and media majors','Sovereign-backed gaming investors'],angles:['Franchise IP and live-service economics','Cross-media (film/TV) extension','Mobile and cross-platform reach']},
 gen:{metric:'EV / EBITDA and P/E vs closest public peers; EV / revenue only if high-growth',buyers:['Strategic consolidators in the sector','Adjacent strategics seeking new markets','Financial sponsors'],angles:['Market position and differentiation','Growth algorithm and margin path','Quality of management and earnings']}
};
const TYPEK={
 sell:{rel:'Likely buyers',why:'Maximize value and certainty for the owner: create competitive tension between strategics and sponsors, and frame the asset around what each buyer type uniquely gains.',val:'Show a trading comps range, precedent transactions and a DCF; control premiums for public targets usually run ~25–40% over the undisturbed price. Strategics can pay more if synergies are real; sponsors anchor on LBO math (leverage capacity and a ~20%+ return).',angles:['Scarcity: few assets of this quality left','Synergy story tailored to each buyer type','Clean, diligence-ready numbers and a credible plan'],risks:['Regulatory review (antitrust; CFIUS / foreign approvals for sensitive tech)','Financing conditions for sponsors','Leaks and process fatigue if it runs long','Valuation gap vs. what the board expects']},
 buy:{rel:'Target archetypes to screen',why:'Use M&A to accelerate the strategy: buy capability, customers or scale faster than building it. The pitch is “why this, why now, why us as the owner.”',val:'Frame what you can afford: accretion/dilution on EPS, return on invested capital vs. cost of capital, and synergy value vs. premium paid. Show how much of the premium is covered by cost synergies alone.',angles:['Strategic fit and the build-vs-buy case','Synergies: cost first (credible), revenue second (discounted)','Currency: cash, debt or stock — and what it does to the balance sheet'],risks:['Overpaying in a competitive auction','Integration and talent retention','Rating agency reaction to new debt','Shareholder pushback if the stock is used as currency']},
 ipo:{rel:'Likely anchor investors',why:'Access public capital and liquidity: the story has to work for long-only investors who will own it for years, not just the first day.',val:'Value off public comps (EV / NTM revenue or P/E), then apply an IPO discount (often ~10–20%) to leave room for the after-market. Size the float, primary vs secondary split, and use-of-proceeds story.',angles:['Equity story: market size, growth durability, margin path','Why public now (and why not stay private)','Peer set that investors will benchmark against'],risks:['Market window (volatility shuts IPOs quickly)','Valuation reset vs last private round','Lock-up overhang and after-market performance','Disclosure readiness and governance']},
 debt:{rel:'Likely lenders / investor base',why:'Fund the plan at the lowest cost with flexible terms: match the instrument (term loan, high-yield or investment-grade bonds, convertible) to the credit profile and the use of proceeds.',val:'Frame on leverage (debt / EBITDA), interest coverage and FCF to pay down debt. For converts, the pitch is lower coupon in exchange for equity upside — higher stock volatility means better terms.',angles:['Credit story: recurring revenue, FCF, asset coverage','Use of proceeds: refinancing, M&A, buybacks, growth capex','Instrument choice and rating impact'],risks:['Rate and spread environment','Covenants limiting flexibility','Ratings downgrade','Dilution (for converts) and hedge cost']},
 act:{rel:'Likely activist theses',why:'Get ahead of the activist: understand the critique better than they do, fix what is fair, and tell a stronger value-creation story to shareholders.',val:'Benchmark total shareholder return and multiples vs. peers; show sum-of-the-parts (are pieces worth more apart?), capital-return capacity, and the margin gap to best-in-class peers.',angles:['Credible standalone plan with targets','Board refresh and governance strength','Capital allocation: buybacks, dividends, M&A discipline'],risks:['Proxy fight costs and distraction','Shareholder vote outcome (proxy advisors matter)','Forced sale or break-up pressure','Management credibility gaps']},
 spin:{rel:'Likely buyers / investor base for the separated piece',why:'Unlock value by separating businesses that investors would value differently, or that compete for capital inside the parent.',val:'Sum-of-the-parts: value each piece on its own peer set and compare to today’s market cap (the “conglomerate discount”). Tax-free spin vs sale vs IPO carve-out changes the math.',angles:['Two cleaner equity stories, each with its own peer set','Management focus and capital allocation','Dis-synergies and stranded costs — how they are addressed'],risks:['Dis-synergies and stranded costs','Tax structure and timing (often 12–18 months)','Capital structure for each entity','Index and shareholder base churn after separation']}
};
const ACT_THESES=['Margin gap vs peers: cut costs','Sell or spin a non-core division','Return more cash (buybacks)','Stop dilutive M&A','Board / management change'];
const IPO_INV=['Long-only mutual funds (the core book)','Crossover and growth funds that knew it private','Hedge funds (after-market liquidity)','Sector specialists'];
const DEBT_INV={priv:['Direct lenders / private credit','Leveraged-loan (term loan B) investors','High-yield bond funds'],small:['Convertible bond funds and arbitrage hedge funds','High-yield funds','Banks for revolver'],mid:['Convertible bond funds','High-yield / crossover credit','Bank group for revolver and term loan'],large:['Investment-grade bond buyers','Convert funds (if growth)','Relationship banks'],mega:['Investment-grade bond buyers (large, liquid)','Commercial paper investors','Relationship banks']};
const CAPK={priv:'As a private / sponsor-owned company, the comps are public peers adjusted for size and liquidity.',small:'Small caps trade at a size discount and draw less analyst coverage — scarcity of strategic interest is often the issue.',mid:'Mid caps are the M&A sweet spot: big enough to matter, small enough for many buyers to afford.',large:'At large cap, the buyer universe shrinks to a handful of strategics; antitrust and financing size become central.',mega:'At mega cap, deals are rare and transformative; regulatory review and shareholder support dominate the story.'};

// Simple notes heuristics (no company names should ever be here).
function noteHints(n){const t=(n||'').toLowerCase(),h=[];
 if(/china|export|cfius|foreign/.test(t))h.push('You mentioned cross-border or export themes: expect CFIUS, China SAMR or export-control questions to shape the buyer list and timeline.');
 if(/burn|unprofitable|cash.?flow negative|runway|loss/.test(t))h.push('Cash burn matters: buyers and investors will push on the path to profitability; financing need can weaken negotiating leverage.');
 if(/sponsor|pe\b|private equity|lbo|take.?private/.test(t))h.push('Sponsor angle: frame leverage capacity (debt / EBITDA) and the return math a buyer would underwrite.');
 if(/ai\b|genai|llm|agent/.test(t))h.push('AI exposure: separate what is AI revenue today from roadmap; investors pay up for proof, not narrative.');
 if(/activist|stake|13d/.test(t))h.push('Activist signals: review shareholder base and governance vulnerabilities early.');
 if(/debt|leverage|refinanc|maturit/.test(t))h.push('Balance sheet in focus: map maturities and covenants before the strategic story.');
 return h}

function build(e){
 const sk=SUBK[e.sub]||SUBK.gen,tk=TYPEK[e.type];const sub=IND[e.ind].subs[e.sub];
 let who=sk.buyers;
 if(e.type==='ipo')who=IPO_INV;else if(e.type==='debt')who=DEBT_INV[e.cap]||DEBT_INV.mid;else if(e.type==='act')who=ACT_THESES;
 else if(e.type==='buy')who=['Sub-scale private leaders in '+sub.toLowerCase()+' (tuck-ins)','Public small caps trading below peers (take-under candidates)','Sponsor-owned assets nearing their exit window','Carve-outs of non-core divisions from larger players'];
 if(e.cap==='priv'&&e.type==='sell')who=[...who,'Sponsor-to-sponsor (secondary buyout)'];
 const reg=e.ind==='semis'?['Semis: export controls and China regulatory approval can block or delay deals']:[];
 return {
  title:`${TYPE[e.type]} · ${sub}`,
  summary:`${CAP[e.cap]} ${IND[e.ind].n.toLowerCase()} company in ${sub.toLowerCase()}. ${CAPK[e.cap]}`,
  why:tk.why,whoLabel:tk.rel,who,
  val:[sk.metric+'.',tk.val],
  angles:[...sk.angles,...tk.angles],
  risks:[...reg,...tk.risks],
  hints:noteHints(e.notes),
  qa:[
   ['Why now?',e.type==='act'?'Activists move when performance lags peers and the stock is cheap. Show the board is already acting, before a public campaign forces it.':e.type==='ipo'?'Tie it to the window (recent IPOs trading well, low volatility) and the company’s readiness: scale, predictability, profitability path.':'Point to what changed: the cycle, the valuation backdrop, a strategic shift in the sector, or financing conditions. “Why now” is usually the first MD question.'],
   ['What are the comps?',`Start with the closest public peers in ${sub.toLowerCase()} and value on ${sk.metric.split(';')[0]}. Then sanity-check with precedent deals in the sub-sector. Pick peers on business model first, size second.`],
   ['What kills this deal?',tk.risks[0]+'. Have a mitigation ready for each risk on the list.'],
   ['What’s my first slide?','Situation overview: one line on the company, the market backdrop, and the recommendation. Then the strategic rationale, then valuation, then process / next steps.']
  ]
 }}

const STOP=new Set(['applied','advanced','coherent','taiwan','palo','lam','the','service','international','global','united']);
const EXTRA=['apple','google','alphabet','amazon','meta','microsoft','nvidia','tesla','oracle','salesforce','ibm','cisco','dell','samsung','sony','netflix','openai','anthropic','qualcomm','broadcom','intel','infineon','nxp','stmicro','micron','hynix','tsmc','asml','synopsys','cadence','snowflake','datadog','cloudflare','crowdstrike','zscaler','okta','workday','servicenow','adobe','intuit','shopify','palantir','mongodb','arista','marvell','supermicro','arm'];
// known = {tickers:Set of uppercase tickers, names:Set of lowercase name words}
function sanitize(notes,known){
 const words=(notes||'').match(/[A-Za-z][A-Za-z0-9.&'-]*/g)||[];const names=new Set([...known.names,...EXTRA]);
 return [...new Set(words.filter(w=>known.tickers.has(w)||(names.has(w.toLowerCase())&&!STOP.has(w.toLowerCase())&&!(w==w.toLowerCase()&&w.length<4))))];
}

function load(){try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return []}}
function save(a){localStorage.setItem(KEY,JSON.stringify(a.slice(0,30)))}

function resultHTML(e,esc){const r=build(e);const li=a=>`<ul class="dl">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
 return `<div class="kicker" style="color:var(--sub);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Strategic rationale & narrative</div>
 <h3>${esc(r.title)}</h3><p class="note">${esc(r.summary)}</p>
 <h4 class="dh">Strategic rationale</h4><p>${esc(r.why)}</p>
 <h4 class="dh">${esc(r.whoLabel)}</h4>${li(r.who)}
 <h4 class="dh">Valuation framing</h4>${li(r.val)}
 <h4 class="dh">Narrative angles</h4>${li(r.angles)}
 <h4 class="dh">Key risks</h4>${li(r.risks)}
 ${r.hints.length?`<h4 class="dh">From your notes</h4>${li(r.hints)}`:''}
 ${e.notes?`<div class="quote">${esc(e.notes)}</div>`:''}
 <h4 class="dh">Questions your MD will ask</h4>${r.qa.map(([q,a])=>`<details class="qa"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
 <p class="note" style="margin-top:18px">Generated on your phone from general patterns for this sector and deal type — a starting point, not advice. No live data, no company specifics.</p>`}

function render(p,{esc,sheet,toast,known}){
 const st=render.st||(render.st={ind:'software',sub:'infra',cap:'mid',type:'sell',notes:''});
 const opts=(o,v)=>Object.entries(o).map(([k,n])=>`<option value="${k}" ${k===v?'selected':''}>${esc(typeof n==='string'?n:n.n)}</option>`).join('');
 const past=load();
 p.innerHTML=`<div class="scroll">
  <div class="mnpi"><b>Keep it anonymous.</b> Never enter MNPI, company names, tickers or code names. Describe the situation in general terms only. Entries stay on this phone.</div>
  <form class="dform" id="df">
   <label>Industry<select id="d-ind">${opts(IND,st.ind)}</select></label>
   <label>Sub-industry<select id="d-sub">${opts(IND[st.ind].subs,st.sub)}</select></label>
   <label>Market cap<select id="d-cap">${opts(CAP,st.cap)}</select></label>
   <label>Pitch type<select id="d-type">${opts(TYPE,st.type)}</select></label>
   <label>Notes <span class="note">(optional, no names)</span><textarea id="d-notes" rows="3" maxlength="500" placeholder="e.g. growth slowing, sponsor interest, China exposure">${esc(st.notes)}</textarea></label>
   <div id="d-warn" class="dwarn" hidden></div>
   <button class="btn" type="submit" style="width:100%;padding:14px">Build the story</button>
  </form>
  ${past.length?`<div class="wk">Past entries</div>${past.map((e,i)=>`<div class="row drow"><button class="dopen" data-i="${i}"><b>${esc(TYPE[e.type])}</b><div class="note">${esc(IND[e.ind].subs[e.sub])} · ${esc(CAP[e.cap].replace(/ \(.*/,''))} · ${new Date(e.ts).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div></button><button class="drm" data-rm="${i}" aria-label="Delete">×</button></div>`).join('')}`:''}
 </div>`;
 const $=s=>p.querySelector(s);
 const sync=()=>{st.ind=$('#d-ind').value;st.sub=$('#d-sub').value;st.cap=$('#d-cap').value;st.type=$('#d-type').value;st.notes=$('#d-notes').value};
 $('#d-ind').onchange=()=>{sync();st.sub=Object.keys(IND[st.ind].subs)[0];render(p,{esc,sheet,toast,known})};
 ['#d-sub','#d-cap','#d-type','#d-notes'].forEach(s=>$(s).oninput=sync);
 $('#df').onsubmit=ev=>{ev.preventDefault();sync();
  const hits=sanitize(st.notes,known);const w=$('#d-warn');
  if(hits.length){w.hidden=false;w.textContent=`Looks like a company or ticker: ${hits.join(', ')}. Remove names and keep it general.`;return}
  w.hidden=true;const e={ts:Date.now(),ind:st.ind,sub:st.sub,cap:st.cap,type:st.type,notes:st.notes.trim()};
  const a=load();a.unshift(e);save(a);st.notes='';
  sheet('Deal Room',resultHTML(e,esc),()=>render(p,{esc,sheet,toast,known}))};
 p.querySelectorAll('.dopen').forEach(b=>b.onclick=()=>sheet('Deal Room',resultHTML(load()[b.dataset.i],esc)));
 p.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const a=load();a.splice(+b.dataset.rm,1);save(a);toast('Deleted');render(p,{esc,sheet,toast,known})});
}
return {render,build};
})();
