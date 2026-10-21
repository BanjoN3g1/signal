"""Elections world: turns data/elections/<election-id>.json race definitions into site data.

Generic per race: market odds (Polymarket gamma API + Kalshi public API, no auth), polls (Wikipedia polling tables,
best effort), baseline (data/elections/baselines/<id>.json). Output: <OUT>/elections/index.json, <id>.json, baselines/.
See README "Elections" for how to add an election.
"""
import glob, html, json, os, re, shutil, time, datetime as dt
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(ROOT, "data", "elections")
UA = {"User-Agent": "signal-pwa/1.0 (personal dashboard; github.com/BanjoN3g1/signal)"}
PM, KS = "https://gamma-api.polymarket.com", "https://api.elections.kalshi.com/trade-api/v2"
STATES = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming"}
FIPS = {"AL":"01","AK":"02","AZ":"04","AR":"05","CA":"06","CO":"08","CT":"09","DE":"10","FL":"12","GA":"13","HI":"15","ID":"16","IL":"17","IN":"18","IA":"19","KS":"20","KY":"21","LA":"22","ME":"23","MD":"24","MA":"25","MI":"26","MN":"27","MS":"28","MO":"29","MT":"30","NE":"31","NV":"32","NH":"33","NJ":"34","NM":"35","NY":"36","NC":"37","ND":"38","OH":"39","OK":"40","OR":"41","PA":"42","RI":"44","SC":"45","SD":"46","TN":"47","TX":"48","UT":"49","VT":"50","VA":"51","WA":"53","WV":"54","WI":"55","WY":"56"}
slugst = lambda st: STATES[st].lower().replace(" ", "-")
def log(*a): print("[elections]", *a, flush=True)
def get(url, **kw):
    r = requests.get(url, headers=UA, timeout=20, **kw); r.raise_for_status(); return r.json()

def party(label):
    m = re.search(r"\((D|R|I|L|G)\)|\b(Democrat|Republican|Independent)", label or "", re.I)
    if not m: return None
    return (m.group(1) or m.group(2)[0]).upper()

# ---------- Polymarket ----------
def pm_events(tag):
    evs, off = {}, 0
    while off < 1000:
        page = get(f"{PM}/events", params={"tag_slug": tag, "closed": "false", "limit": 100, "offset": off})
        for e in page: evs[e["slug"]] = e
        if len(page) < 100: break
        off += 100
    return evs

def pm_odds(e):
    out = []
    for m in e.get("markets") or []:
        try: p = float(json.loads(m.get("outcomePrices") or "null")[0])
        except Exception: continue
        if m.get("closed") or not m.get("groupItemTitle"): continue
        nm = m["groupItemTitle"].strip(); out.append({"name": re.sub(r"\s*\((D|R|I|L|G)\)\s*$", "", nm).replace(" Party", ""), "party": party(nm) or ("D" if nm.startswith("Democrat") else "R" if nm.startswith("Republican") else None), "p": round(p, 3)})
    out = [o for o in out if o["p"] > 0.004 or len(out) <= 3]
    return {"src": "Polymarket", "url": f"https://polymarket.com/event/{e['slug']}", "volume": round(float(e.get("volume") or 0)), "outcomes": sorted(out, key=lambda o: -o["p"])[:4]} if out else None

# ---------- Kalshi ----------
def ks_series(cache):
    p = os.path.join(cache, "kalshi_series.json")
    try:
        d = json.load(open(p))
        if time.time() - d["t"] < 86400: return d["s"]
    except Exception: pass
    s = [x["ticker"] for x in get(f"{KS}/series", params={"category": "Elections", "limit": 5000}).get("series", [])]
    json.dump({"t": time.time(), "s": s}, open(p, "w")); return s

def ks_find(series, office, st):
    pat = {"senate": rf"^(KX)?SENATE(PARTY)?-?{st}$", "governor": rf"^(KX)?GOV(PARTY)?-?{st}$"}[office]
    return [s for s in series if re.match(pat, s)]

def ks_odds(event_ticker=None, series=None):
    if series:
        evs = get(f"{KS}/events", params={"series_ticker": series, "status": "open", "with_nested_markets": "true"}).get("events", [])
        evs = [e for e in evs if "26" in e["event_ticker"]]
        if not evs: return None
        e = evs[0]
    else:
        e = get(f"{KS}/events/{event_ticker}", params={"with_nested_markets": "true"})
        e = {**e.get("event", {}), "markets": e.get("markets") or e.get("event", {}).get("markets", [])}
    out = []
    for m in e.get("markets") or []:
        if m.get("status") not in (None, "active", "open", "initialized"): continue
        b, a, l = (float(m[k]) if m.get(k) not in (None, "") else None for k in ("yes_bid_dollars", "yes_ask_dollars", "last_price_dollars"))
        p = (b + a) / 2 if b and a else l
        if p is None: continue
        nm = m.get("yes_sub_title") or m.get("title") or ""
        out.append({"name": nm.replace(" party", "").replace(" Party", ""), "party": party(nm) or ("D" if nm.lower().startswith("democrat") else "R" if nm.lower().startswith("republican") else None), "p": round(p, 3)})
    return {"src": "Kalshi", "url": f"https://kalshi.com/markets/{(e.get('series_ticker') or '').lower()}", "outcomes": sorted(out, key=lambda o: -o["p"])[:4]} if out else None

# ---------- Polls (Wikipedia polling tables, best effort) ----------
def strip(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<sup.*?</sup>|<style.*?</style>", "", h, flags=re.S)))).strip()
def wiki_polls(page):
    j = get("https://en.wikipedia.org/w/api.php", params={"action": "parse", "page": page, "prop": "text", "format": "json", "formatversion": 2, "redirects": 1})
    doc = j.get("parse", {}).get("text", "")
    best = None
    for t in re.findall(r'<table class="wikitable[^"]*".*?</table>', doc, re.S):
        rows = re.findall(r"<tr.*?</tr>", t, re.S)
        if not rows or "Poll source" not in strip(rows[0]): continue
        hdr = [strip(c) for c in re.findall(r"<th.*?</th>", rows[0], re.S)]
        cand = [i for i, h in enumerate(hdr) if i >= 4 and h and not re.search(r"other|undecided|margin|lead", h, re.I)]
        if len(cand) < 2: continue
        polls = []
        for r in rows[1:]:
            cells = [strip(c) for c in re.findall(r"<t[dh].*?</t[dh]>", r, re.S)]
            if len(cells) != len(hdr): continue
            try: v = [float(re.sub(r"[^\d.]", "", cells[i])) for i in cand[:2]]
            except ValueError: continue
            polls.append({"pollster": cells[0][:60], "dates": cells[1][:40], "sample": cells[2][:20], "a": v[0], "b": v[1]})
        if polls and not best: best = ([re.sub(r"\s*\(.*?\)", "", hdr[i]) for i in cand[:2]], polls)  # first table = main general-election matchup
    if not best: return None
    names, polls = best
    recent = polls[:5] if True else polls  # Wikipedia lists newest first
    avg = [round(sum(p[k] for p in recent[:5]) / len(recent[:5]), 1) for k in ("a", "b")]
    return {"src": "Wikipedia", "url": "https://en.wikipedia.org/wiki/" + page.replace(" ", "_") + "#Polling", "names": names, "avg": avg, "n": len(recent), "recent": recent[:3]}

def build_one(cfg, cache, pm_cache):
    t0 = time.time(); out = {k: v for k, v in cfg.items() if k != "races"}; status = {}
    tag = cfg.get("discover", {}).get("polymarket_tag")
    try: evs = pm_events(tag) if tag else {}; status["polymarket"] = f"ok ({len(evs)} events)"
    except Exception as e: evs = {}; status["polymarket"] = f"error: {e}"[:120]
    try: series = ks_series(cache); status["kalshi"] = "ok"
    except Exception as e: series = []; status["kalshi"] = f"error: {e}"[:120]
    races = [dict(r) for r in cfg["races"]]; have = {r["id"] for r in races}
    for st in STATES:  # auto-discover the rest of the map
        for typ, slug in (("senate", f"{slugst(st)}-senate-election-winner"), ("governor", f"{slugst(st)}-governor-winner-2026")):
            rid = f"{st}-{'sen' if typ == 'senate' else 'gov'}"
            if rid not in have and any(s == slug or s.startswith(slug + "-") for s in evs):
                races.append({"id": rid, "type": typ, "state": st, "title": f"{STATES[st]} {'Senate' if typ == 'senate' else 'Governor'}", "key": False, "geography": "county", "markets": {"polymarket": "auto"}})
    pc_path = os.path.join(cache, "election_polls.json")
    try: pc = json.load(open(pc_path))
    except Exception: pc = {}
    for r in races:
        mk = r.get("markets", {}); r["odds"] = []
        slug = mk.get("polymarket")
        if slug == "auto" and r.get("state"):
            base = f"{slugst(r['state'])}-senate-election-winner" if r["type"] == "senate" else f"{slugst(r['state'])}-governor-winner-2026"
            slug = next((s for s in sorted(evs, key=len) if s == base or s.startswith(base + "-")), None)
        if slug:
            e = evs.get(slug)
            if not e:
                try: e = (get(f"{PM}/events", params={"slug": slug}) or [None])[0]
                except Exception: e = None
            o = e and pm_odds(e)
            if o: r["odds"].append(o)
        if r.get("key") and series is not None:
            try:
                ko = None
                if mk.get("kalshi_event"): ko = ks_odds(event_ticker=mk["kalshi_event"])
                elif mk.get("kalshi_series") == "auto" and r.get("state"):
                    for s in ks_find(series, r["type"], r["state"]):
                        ko = ks_odds(series=s)
                        if ko: break
                if ko: r["odds"].append(ko)
            except Exception as e: status.setdefault("kalshi_errors", []).append(f"{r['id']}: {e}"[:100])
        known = {o["name"].split()[-1].lower(): o["party"] for od in r["odds"] for o in od["outcomes"] if o["party"]}
        for od in r["odds"]:
            for o in od["outcomes"]:
                if not o["party"] and o["name"]: o["party"] = known.get(o["name"].split()[-1].lower())
        # P(not Republican) for the state odds layer (D or independent caucusing with them)
        pd = [sum(o["p"] for o in od["outcomes"] if o["party"] in ("D", "I")) / max(1e-9, sum(o["p"] for o in od["outcomes"] if o["party"] in ("D", "R", "I"))) for od in r["odds"] if any(o["party"] for o in od["outcomes"])]
        r["pD"] = round(sum(pd) / len(pd), 3) if pd else None
        pol = r.get("polls", {}).get("wikipedia")
        if pol:
            c = pc.get(r["id"])
            if not c or time.time() - c.get("t", 0) > 6 * 3600:
                try: c = {"t": time.time(), "d": wiki_polls(pol)}
                except Exception as e: c = {"t": time.time() - 5 * 3600, "d": None, "err": str(e)[:100]}  # retry in ~1h
                pc[r["id"]] = c
            r["pollData"] = c.get("d")
        if r.get("state"): r["fips"] = FIPS[r["state"]]
    json.dump(pc, open(pc_path, "w"))
    out["races"] = sorted(races, key=lambda r: (not r.get("key"), r["type"] != "chamber", r["type"], r.get("state", "")))
    out["status"] = status; out["generatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    log(f"{cfg['id']}: {len(races)} races, {sum(1 for r in races if r['odds'])} with odds, {sum(1 for r in races if r.get('pollData'))} with polls; {round(time.time() - t0)}s")
    return out

def build(out_dir, cache):
    od = os.path.join(out_dir, "elections"); os.makedirs(os.path.join(od, "baselines"), exist_ok=True)
    idx = []
    for f in sorted(glob.glob(os.path.join(CFG, "*.json"))):
        cfg = json.load(open(f))
        try: data = build_one(cfg, cache, None)
        except Exception as e: log("failed", cfg.get("id"), e); data = {**cfg, "status": {"error": str(e)[:200]}}
        json.dump(data, open(os.path.join(od, cfg["id"] + ".json"), "w"), separators=(",", ":"))
        idx.append({k: cfg.get(k) for k in ("id", "name", "date", "status")})
    for f in glob.glob(os.path.join(CFG, "baselines", "*.json")): shutil.copy(f, os.path.join(od, "baselines"))
    live = os.path.join(CFG, "live")
    if os.path.isdir(live): shutil.copytree(live, os.path.join(od, "live"), dirs_exist_ok=True)  # election-night hook
    json.dump({"elections": sorted(idx, key=lambda x: x["date"] or "", reverse=True)}, open(os.path.join(od, "index.json"), "w"))

if __name__ == "__main__":
    c = os.path.join(ROOT, "data", "cache"); os.makedirs(c, exist_ok=True)
    build(os.environ.get("OUT_DIR", "/tmp/elx_out"), c)
