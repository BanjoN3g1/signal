"""Politics dashboard data: signals (generic ballot, approval trend, ratings vs markets, momentum, money, open seats),
a 'Politics & markets' news stream (news.py clustering + Flash-Lite summaries, role 'pol'), and curated X posts (data/politics_x.json).
Writes <OUT>/politics.json. Everything free; every source is optional and fails soft."""
import json, os, re, time, datetime as dt
import requests, llm, news
from elections import get, strip, STATES

ROOT = os.path.dirname(os.path.abspath(__file__))
def log(*a): print("[politics]", *a, flush=True)
WIKI = "https://en.wikipedia.org/w/api.php"
def wiki(page):
    return get(WIKI, params={"action": "parse", "page": page, "prop": "text", "format": "json", "formatversion": 2, "redirects": 1}).get("parse", {}).get("text", "")
def tables(doc):
    for t in re.findall(r'<table class="[^"]*wikitable[^"]*".*?</table>', doc, re.S):
        yield [[strip(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)] for r in re.findall(r"<tr.*?</tr>", t, re.S)]
num = lambda s: float(re.sub(r"[^\d.\-−]", "", s).replace("−", "-") or "nan")

def cached(cache, key, hours, fn):
    p = os.path.join(cache, "politics_cache.json")
    try: c = json.load(open(p))
    except Exception: c = {}
    e = c.get(key)
    if not e or time.time() - e["t"] > hours * 3600:
        try: e = {"t": time.time(), "d": fn()}
        except Exception as ex: log(key, "failed", ex); e = {"t": time.time() - hours * 3600 + 3600, "d": (e or {}).get("d")}
        c[key] = e; json.dump(c, open(p, "w"))
    return e["d"]

ENV = {}   # set by build() from the active election's "environment" block
def next_cycle(d=None):
    """Next federal general-election year (the House generic-ballot page to read)."""
    d = d or dt.date.today(); y = d.year
    return y if y % 2 == 0 and (d.month, d.day) <= (11, 10) else y + (1 if y % 2 else 2)
def generic_cached(cache):
    """Generic ballot (6h cache). Refetches when the target page changes (new cycle); if a fetch fails, keeps the last good value."""
    page = ENV.get("generic_page") or f"{next_cycle()} United States House of Representatives elections"
    p = os.path.join(cache, "politics_cache.json")
    try: c = json.load(open(p))
    except Exception: c = {}
    e = c.get("generic") or {}
    if e.get("d") and (e["d"].get("page") in (None, page)) and time.time() - e.get("t", 0) < 6 * 3600: return e["d"]
    try: d = generic_ballot()
    except Exception as ex: log("generic failed", ex); d = None
    if d: c["generic"] = {"t": time.time(), "d": d}; json.dump(c, open(p, "w")); return d
    return e.get("d")   # stale but real beats nothing
def generic_ballot():
    page = ENV.get("generic_page") or f"{next_cycle()} United States House of Representatives elections"
    for rows in tables(wiki(page)):
        if rows and rows[0][:1] == ["Source of poll aggregation"]:
            h = rows[0]; iR, iD = h.index("Republicans"), h.index("Democrats")
            ag = [{"src": r[0], "updated": r[2], "R": num(r[iR]), "D": num(r[iD])} for r in rows[1:] if len(r) == len(h)]
            ag = [a for a in ag if a["R"] == a["R"] and a["D"] == a["D"]]
            if ag: return {"aggs": ag, "marginD": round(sum(a["D"] - a["R"] for a in ag) / len(ag), 1),
                           "url": "https://en.wikipedia.org/wiki/" + page.replace(" ", "_") + "#Opinion_polling", "page": page}

def approval():
    page = ENV.get("approval_page") or "Opinion polling on the second Trump presidency"
    doc = wiki(page); agg, months = None, []
    for rows in tables(doc):
        if not rows: continue
        h = rows[0]
        if h[:2] == ["Aggregator", "Updated"] and "Approve" in h and not agg:
            ia, idd = h.index("Approve"), h.index("Disapprove")
            v = [(num(r[ia]), num(r[idd]), r[0]) for r in rows[1:] if len(r) == len(h)]
            v = [x for x in v if x[0] == x[0]]
            if v: agg = {"approve": round(sum(x[0] for x in v) / len(v), 1), "disapprove": round(sum(x[1] for x in v) / len(v), 1), "n": len(v), "srcs": [x[2] for x in v][:6]}
        elif h[:2] == ["Poll source", "Date"] and "Approve" in h and len(months) < 4:
            ia, idd = h.index("Approve"), h.index("Disapprove")
            v = [(num(r[ia]), num(r[idd]), r[1]) for r in rows[1:] if len(r) == len(h)]
            v = [x for x in v if x[0] == x[0] and x[1] == x[1]]
            if v:
                mo = re.match(r"[A-Za-z]+", v[0][2]); months.append({"month": mo.group(0) if mo else "", "net": round(sum(x[0] - x[1] for x in v) / len(v), 1), "n": len(v)})
    if agg: return {**agg, "trend": months, "url": "https://en.wikipedia.org/wiki/" + page.replace(" ", "_")}

def fec_money(E):
    key = os.environ.get("FEC_API_KEY") or "DEMO_KEY"; out = {}
    for r in [r for r in E["races"] if r.get("key") and r["type"] == "senate"][:11]:
        try: j = get("https://api.open.fec.gov/v1/candidates/totals/", params={"api_key": key, "office": "S", "state": r["state"], "election_year": 2026, "sort": "-receipts", "per_page": 6, "is_active_candidate": "true"})
        except Exception as e: log("fec", r["id"], e); break  # DEMO_KEY is shared and rate-limited: keep what we have
        res = j.get("results") or []; best = {}
        want = {o["name"].split()[-1].lower() for od in r.get("odds", []) for o in od["outcomes"] if o["name"].split()}
        res = sorted(res, key=lambda x: not any(w in (x.get("name") or "").lower() for w in want))  # the nominees the markets price, not primary losers
        for x in res:
            pt = {"DEM": "D", "REP": "R"}.get(x.get("party"), "I")
            if pt not in best: best[pt] = {"name": x["name"].title(), "raised": round(x.get("receipts") or 0), "cash": round(float(x.get("cash_on_hand_end_period") or 0)), "asOf": (x.get("coverage_end_date") or "")[:10]}
        if best: out[r["id"]] = best
        time.sleep(1)
    if not out: raise RuntimeError("FEC unavailable")
    return out

def signals(E, cache):
    S = []
    gb = generic_cached(cache)
    if gb: S.append({"id": "generic", "title": "Generic ballot", "value": f"{'D' if gb['marginD'] > 0 else 'R'}+{abs(gb['marginD'])}", "lean": "D" if gb["marginD"] > 0 else "R",
                     "detail": " · ".join(f"{a['src']} {'D' if a['D'] > a['R'] else 'R'}+{abs(round(a['D'] - a['R'], 1))}" for a in gb["aggs"][:4]),
                     "why": "Which party voters prefer for Congress, averaged across aggregators — the best single read on the national House environment.", "url": gb["url"]})
    ap = cached(cache, "approval", 6, approval)
    if ap:
        tr = ap.get("trend") or []
        S.append({"id": "approval", "title": "Presidential approval", "value": f"{ap['approve']}%", "lean": "R" if ap["approve"] >= ap["disapprove"] else "D",
                  "detail": f"Disapprove {ap['disapprove']}% · net {round(ap['approve'] - ap['disapprove'], 1)}" + (" · trend " + " → ".join(f"{t['month']} {t['net']:+}" for t in reversed(tr[:4])) if tr else ""),
                  "why": "Midterms are largely a referendum on the president; net approval tracks the president's party's House losses.", "url": ap["url"], "spark": [t["net"] for t in reversed(tr[:4])]})
    rated = [r for r in E["races"] if r.get("ratings") and r.get("pD") is not None]
    dis = [r for r in rated if r["ratings"]["avg"] is not None and ((r["ratings"]["avg"] > .5 and r["pD"] < .5) or (r["ratings"]["avg"] < -.5 and r["pD"] > .5) or (abs(r["ratings"]["avg"]) < .5 and abs(r["pD"] - .5) > .2))]
    S.append({"id": "raters", "title": "Raters vs markets", "value": f"{len(dis)} split", "lean": None,
              "detail": ", ".join(f"{r['state']} {r['type'][:3]}: {r['ratings']['label']} vs mkt {('D' if r['pD'] >= .5 else 'R')} {round(max(r['pD'], 1 - r['pD']) * 100)}%" for r in dis[:4]),
              "why": "Where expert ratings and betting markets disagree is where one of them is about to be wrong — the most informative races to watch.", "races": [r["id"] for r in dis]})
    mv = sorted([r for r in E["races"] if r.get("move7") is not None and r["type"] != "chamber"], key=lambda r: -abs(r["move7"]))
    sc = next((r for r in E["races"] if r["id"] == "senate-control"), None)
    if mv: S.append({"id": "momentum", "title": "Market momentum (7d)", "value": f"{mv[0]['state']} {mv[0]['type'][:3]} {mv[0]['move7'] * 100:+.0f}", "lean": "D" if mv[0]["move7"] > 0 else "R",
                     "detail": " · ".join(f"{r['state']} {r['type'][:3]} {r['move7'] * 100:+.0f}" for r in mv[1:5]) + f" · 24h volume ${sum(r.get('vol24') or 0 for r in E['races']) / 1e6:.1f}M",
                     "why": "Sustained odds moves on real-money volume often lead polls by days — new information (internal polls, ads, scandals) shows up here first. Positive = toward D.", "races": [r["id"] for r in mv[:5]]})
    money = cached(cache, "fec", 24, lambda: fec_money(E))
    if money:
        rows = []
        for rid, b in money.items():
            if "D" in b and "R" in b: rows.append((rid, b["D"]["raised"] - b["R"]["raised"], b))
        rows.sort(key=lambda x: -abs(x[1]))
        if rows: S.append({"id": "money", "title": "Senate fundraising", "value": f"{sum(1 for x in rows if x[1] > 0)}/{len(rows)} D lead", "lean": "D" if sum(1 for x in rows if x[1] > 0) > len(rows) / 2 else "R",
                           "detail": " · ".join(f"{rid.split('-')[0]} {'D' if d > 0 else 'R'} +${abs(d) / 1e6:.0f}M" for rid, d, _ in rows[:5]),
                           "why": "Total raised by the top Democrat vs top Republican (FEC filings, latest quarter). Money gaps show enthusiasm and buy late ads; they don't decide races alone.",
                           "url": "https://www.fec.gov/data/elections/senate/", "money": money})
    opn = [r for r in E["races"] if (r.get("ratings") or {}).get("open")]
    if opn: S.append({"id": "open", "title": "Open seats", "value": str(len(opn)), "lean": None,
                      "detail": ", ".join(f"{r['state']} {r['type'][:3]}" for r in opn if abs((r.get('pD') or .5) - .5) < .3)[:160] or ", ".join(r["state"] for r in opn[:8]),
                      "why": "No incumbent means no incumbency advantage (worth a few points) — open seats flip more often. Listed: the competitive ones.", "races": [r["id"] for r in opn]})
    return S

# ---------- Politics & markets stream ----------
GN = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="
FEEDS = [("POLITICO", "https://rss.politico.com/politics-news.xml"), ("The Hill", "https://thehill.com/homenews/feed/"), ("NPR Politics", "https://feeds.npr.org/1014/rss.xml")]
TOPICS = ["tariffs trade policy", "antitrust FTC DOJ tech", "Federal Reserve independence Powell", "Supreme Court ruling", "executive order Trump",
          "SEC regulation crypto", "AI regulation Congress", "export controls chips China", "government shutdown budget Congress", "midterm elections 2026"]
PK = {"Tariffs/trade": (r"tariff|trade (war|deal)|import|export control|sanction", 3), "Antitrust/regulation": (r"antitrust|ftc|doj|merger review|regulat|sec\b|crypto|ai (bill|rule|regulation)", 3),
      "Fed": (r"\bfed\b|federal reserve|powell|rate cut|interest rate", 3), "Courts": (r"supreme court|justice|ruling|court", 1.5), "Executive": (r"executive order|white house|trump (signs|orders|administration)", 1.5),
      "Fiscal": (r"shutdown|budget|debt|spending bill|tax", 2), "Elections": (r"midterm|senate race|governor race|poll|election", 1.5)}
POL_SYS = """You brief a junior tech investment banker on political/policy news. For each numbered story use ONLY the given headlines and
snippets (never invent facts or numbers). Return JSON {"<id>": {"headline": "neutral, specific (<= 90 chars)", "sum": "2 sentences: what happened",
"markets": "1-2 sentences: plausible market / sector implications (tech, semis, software, M&A/ECM, rates) — hedge appropriately", "sectors": ["<= 3 short tags"]}}. Every id must be present."""

def stream(cache):
    items = []
    for name, url in FEEDS:
        got, _ = news.rss(url, name); items += got
    for q in TOPICS:
        got, _ = news.rss(GN + requests.utils.quote(q + " when:1d"), None, 20); items += got
    now = dt.datetime.now(dt.timezone.utc); cut = now - dt.timedelta(hours=36); seen, its = set(), []
    for it in items:
        k = re.sub(r"\W+", "", it["title"].lower())[:90]
        if k in seen or dt.datetime.fromisoformat(it["date"]) < cut: continue
        seen.add(k); its.append(it)
    sp = os.path.join(cache, "politics_clusters.json")
    try: state = json.load(open(sp))
    except Exception: state = {}
    cl = news.cluster(its, state, {}); json.dump(cl, open(sp, "w"))
    ranked = []
    for c in cl.values():
        txt = " ".join(s["title"] for s in c["sources"]); tags = [t for t, (rx, w) in PK.items() if re.search(rx, txt, re.I)]
        if not tags: continue
        age = (now - dt.datetime.fromisoformat(c["last"])).total_seconds() / 3600
        sc = (sum(PK[t][1] for t in tags) + 1.2 * min(5, news.distinct(c))) * (0.5 ** (age / 12))
        ranked.append((sc, tags, c))
    ranked.sort(key=lambda x: -x[0]); ranked = ranked[:16]
    ap = os.path.join(cache, "politics_ai.json")
    try: ai = json.load(open(ap))
    except Exception: ai = {}
    todo = [c for _, _, c in ranked if c["id"] not in ai or news.distinct(c) >= ai[c["id"]].get("n", 0) + 2][:8]
    if todo and llm.provider() and llm.remaining("pol", cache) > 0:
        lines = []
        for c in todo:
            lines.append(f"## {c['id']}")
            for s in sorted(c["sources"], key=lambda s: s["date"])[:6]:
                pw = bool(news.PAYWALL.search(s["source"] or ""))
                lines.append(f"- {s['source']}: {s['title']}" + (f" — {s['desc'][:300]}" if s.get("desc") and not pw else ""))
        res = llm.call("pol", POL_SYS, "\n".join(lines), cache, max_tokens=260 * len(todo))
        if isinstance(res, dict):
            for c in todo:
                r = res.get(c["id"])
                if isinstance(r, dict) and r.get("sum"):
                    ai[c["id"]] = {"headline": str(r.get("headline") or "")[:120], "sum": str(r["sum"])[:500], "markets": str(r.get("markets") or "")[:400],
                                   "sectors": [str(x)[:24] for x in (r.get("sectors") or [])][:3], "n": news.distinct(c), "model": res.get("_model")}
        json.dump(ai, open(ap, "w"))
    out = []
    for sc, tags, c in ranked:
        srcs = sorted(c["sources"], key=lambda s: s["date"], reverse=True); a = ai.get(c["id"]) or {}
        out.append({"id": c["id"], "title": a.get("headline") or srcs[-1]["title"], "tags": tags, "last": c["last"], "first": c["first"], "n": news.distinct(c), "score": round(sc, 2),
                    "sum": a.get("sum"), "markets": a.get("markets"), "sectors": a.get("sectors", []), "model": a.get("model"),
                    "sources": [{"source": s["source"], "title": s["title"], "url": s["url"], "date": s["date"], "paywalled": bool(news.PAYWALL.search(s["source"] or ""))} for s in srcs[:8]]})
    log(f"stream: {len(its)} items -> {len(cl)} clusters -> {len(out)} shown, {sum(1 for o in out if o['sum'])} summarized")
    return out

def load_x():
    try: d = json.load(open(os.path.join(ROOT, "data", "politics_x.json")))
    except Exception: return {"posts": [], "accounts": []}
    ok = lambda u: isinstance(u, str) and re.match(r"https://(x|twitter)\.com/", u)
    d["posts"] = [{k: p.get(k) for k in ("handle", "name", "lean", "role", "text", "url", "likes", "reposts", "ts", "race")} for p in d.get("posts", []) if ok(p.get("url")) and p.get("lean") in ("left", "right", "center", "analyst")][:60]
    return d

def build(out_dir, cache):
    t0 = time.time()
    try:
        idx = json.load(open(os.path.join(out_dir, "elections", "index.json")))
        E = json.load(open(os.path.join(out_dir, "elections", (idx.get("active") or idx["elections"][0]["id"]) + ".json")))
    except Exception: E, idx = {"races": []}, {}
    ENV.clear(); ENV.update(E.get("environment") or {})
    if idx.get("phase") in ("results", "between"): ENV.pop("generic_page", None)   # after an election: read the next cycle's page
    out = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "signals": [], "stream": [], "x": load_x()}
    try: out["signals"] = signals(E, cache)
    except Exception as e: log("signals failed", e)
    try: out["stream"] = stream(cache)
    except Exception as e: log("stream failed", e)
    try:
        import uspol; uspol.enrich(out, E, cache)
    except Exception as e: log("uspol failed", type(e).__name__, e)
    ev = lm = None
    try:   # final-stretch tells: early vote (UF Election Lab) and late outside money (FEC 24/48-hour notices)
        import tells
        dl = (dt.date.fromisoformat(E["date"]) - dt.date.today()).days if E.get("date") else 999
        if -3 <= dl <= 45: ev = tells.early_vote(int(E["date"][:4]), cache)
        if -3 <= dl <= 60: lm = tells.late_money(E, cache, os.environ.get("FEC_API_KEY") or "DEMO_KEY")
        out["earlyVote"], out["lateMoney"] = ev, lm
    except Exception as e: log("tells failed", type(e).__name__, e)
    try:  # our own forecast layer (expected margins, correlated seat simulation, disagreement index)
        import forecast
        gb = generic_cached(cache)
        base = json.load(open(os.path.join(ROOT, "data", "elections", "baselines", (E.get("baseline") or "pres2024") + ".json")))
        nat = (E.get("environment") or {}).get("national_override")   # e.g. a presidential national polling margin once wired
        if nat is None and not (gb and gb.get("marginD") is not None):   # last resort: our own latest generic-ballot snapshot
            nat = next((x["generic"] for x in reversed(out.get("snaps") or []) if x.get("generic") is not None), None)
        out["model"] = forecast.run(E, nat if nat is not None else (gb and gb.get("marginD")), base, cache)
        m = out.get("model")
        if m and not m.get("frozen") and (ev or lm):
            tl = tells.tells(m, ev, lm, {r["id"]: r.get("title", r["id"]) for r in E.get("races", [])})
            m["week"] = sorted(tl + (m.get("week") or []), key=lambda w: -w.get("mag", 0))[:4]
            strong = [t for t in tl if t["mag"] >= .15]
            if strong: m["read"] = ([m["read"][0]] if m.get("read") else []) + [{**strong[0], "k": "tell"}] + (m.get("read") or [])[1:]; m["read"] = m["read"][:3]
            m["brief"] = (m.get("brief") or []) + [{**t, "k": "tell"} for t in tl]
        try: out["scorecards"] = {k: v for k, v in ((f[15:-5], forecast.scorecard(json.load(open(os.path.join(out_dir, "elections", f[15:-5] + ".json"))), json.load(open(os.path.join(cache, f))), cache))
                                                    for f in os.listdir(cache) if f.startswith("forecast_final_") and f[15:-5] != E.get("id") and os.path.exists(os.path.join(out_dir, "elections", f[15:-5] + ".json"))) if v.get("resolved")}
        except Exception as e: log("scorecards", e)
    except Exception as e:
        log("forecast failed", type(e).__name__, e)
        if os.environ.get("GITHUB_ACTIONS"): print(f"::warning title=Forecast failed::{type(e).__name__}: {e}", flush=True)
    json.dump(out, open(os.path.join(out_dir, "politics.json"), "w"), separators=(",", ":"))
    if os.environ.get("GITHUB_ACTIONS"):   # one-line health check, visible in the run summary as an annotation
        m = out.get("model") or {}
        cs = ", ".join(f"{v.get('label')} D {v.get('pControl')} mkt {v.get('market')}" for v in (m.get("contests") or {}).values())
        print(f"::notice title=Politics {idx.get('active')} ({idx.get('phase')})::" + (f"{cs} | read {len(m.get('read') or [])} | week {len(m.get('week') or [])} | log days {(m.get('track') or {}).get('days')} | signals {len(out['signals'])}" if m else "NO MODEL"), flush=True)
    if os.environ.get("GITHUB_ACTIONS") and out.get("model"):
        m = out["model"]
        for i, b in enumerate((m.get("read") or []) + (m.get("week") or [])): print(f"::notice title={'Read' if i < len(m.get('read') or []) else 'Week'} {i + 1}::{b.get('t', '')[:300]}", flush=True)
        if ev: print(f"::notice title=Early vote::{ev['nat']['voted']:,} cast, {round((ev['nat']['pct'] or 0) * 100)}% of {ev.get('prevLabel')} | " + ", ".join(f"{k} {v['voted']:,} ({round((v.get('pct') or 0) * 100)}%{(', D' if v['lead'] >= 0 else ', R') + '+' + str(abs(v['lead'])) if v.get('lead') is not None else ''})" for k, v in ev["states"].items() if k in ("TX", "MI", "OH", "IA", "ME", "NC", "AK", "KS", "NE", "GA")), flush=True)
        if lm: print("::notice title=Outside money 7d::" + ", ".join(f"{k} D ${o['d7'] / 1e6:.1f}M / R ${o['r7'] / 1e6:.1f}M (prior 14d D ${o['dPrev'] / 1e6:.1f}M / R ${o['rPrev'] / 1e6:.1f}M)" for k, o in sorted(lm["races"].items(), key=lambda kv: -(kv[1]['d7'] + kv[1]['r7']))[:8]), flush=True)
    log(f"{len(out['signals'])} signals, {len(out['stream'])} stories, {len(out['x']['posts'])} X posts; {round(time.time() - t0)}s")

if __name__ == "__main__":
    c = os.path.join(ROOT, "data", "cache"); os.makedirs(c, exist_ok=True); build(os.environ.get("OUT_DIR", "/tmp/elx_out"), c)
