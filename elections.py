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
_LASTW = [0.0]
def get(url, **kw):
    for i in range(3):
        if "wikipedia.org" in url:  # be gentle: Wikipedia rate-limits shared CI IPs
            w = 1.5 - (time.time() - _LASTW[0])
            if w > 0: time.sleep(w)
            _LASTW[0] = time.time()
        r = requests.get(url, headers=UA, timeout=20, **kw)
        if r.status_code == 429 and i < 2: time.sleep(min(20, int(r.headers.get("Retry-After", "0") or 0) if str(r.headers.get("Retry-After", "0")).isdigit() else 0) or 5 * (i + 1)); continue  # cap: a long Retry-After once stalled the whole refresh
        r.raise_for_status(); return r.json()

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
        nm = m["groupItemTitle"].strip()
        mv = {k: round(float(m[f]), 3) for k, f in (("d1", "oneDayPriceChange"), ("d7", "oneWeekPriceChange")) if m.get(f) not in (None, "")}
        try: tok = json.loads(m.get("clobTokenIds") or "[]")[0]
        except Exception: tok = None
        out.append({**mv, "tok": tok, "name": re.sub(r"\s*\((D|R|I|L|G)\)\s*$", "", nm).replace(" Party", ""), "party": party(nm) or ("D" if nm.startswith("Democrat") else "R" if nm.startswith("Republican") else None), "p": round(p, 3)})
    out = [o for o in out if o["p"] > 0.004 or len(out) <= 3]
    return {"src": "Polymarket", "url": f"https://polymarket.com/event/{e['slug']}", "volume": round(float(e.get("volume") or 0)), "vol24": round(sum(float(m.get("volume24hr") or 0) for m in e.get("markets") or [])), "outcomes": sorted(out, key=lambda o: -o["p"])[:4]} if out else None

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
def wiki_polls(page, want=()):
    """First polling table whose matchup columns include the market's top two candidates (general election, not primaries)."""
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
        names = [re.sub(r"\s*\(.*?\)", "", hdr[i]) for i in cand[:2]]
        last = {n.split()[-1].lower() for n in names if n.split()}
        if polls and not best and (not want or set(want) <= last): best = (names, polls)
    if not best: return None
    names, polls = best
    recent = polls[:5] if True else polls  # Wikipedia lists newest first
    avg = [round(sum(p[k] for p in recent[:5]) / len(recent[:5]), 1) for k in ("a", "b")]
    return {"src": "Wikipedia", "url": "https://en.wikipedia.org/wiki/" + page.replace(" ", "_") + "#Polling", "names": names, "avg": avg, "n": len(recent), "recent": recent[:3],
            "trend": [{"pollster": p["pollster"][:40], "dates": p["dates"], "a": p["a"], "b": p["b"]} for p in polls[:20]]}

# ---------- Race ratings (Wikipedia "Predictions" tables aggregate Cook, Sabato, Inside Elections, Silver Bulletin, ...) ----------
RSCORE = {"safe": 3, "solid": 3, "likely": 2, "lean": 1, "leans": 1, "tilt": .5, "tossup": 0, "toss-up": 0, "toss up": 0}
def rscore(s):
    m = re.match(r"(safe|solid|likely|leans?|tilt|toss-?\s?up)\s*([DRI])?", (s or "").strip(), re.I)
    if not m: return None
    v = RSCORE.get(m.group(1).lower().replace(" ", ""), RSCORE.get(m.group(1).lower(), 0))
    return 0 if v == 0 else v * (1 if (m.group(2) or "").upper() in ("D", "I") else -1)
def rlabel(x):
    if x is None: return None
    a = abs(x); s = "D" if x > 0 else "R"
    return "Tossup" if a < .5 else f"Tilt {s}" if a < 1 else f"Lean {s}" if a < 1.75 else f"Likely {s}" if a < 2.5 else f"Safe {s}"
def wiki_ratings(page):
    doc = get("https://en.wikipedia.org/w/api.php", params={"action": "parse", "page": page, "prop": "text", "format": "json", "formatversion": 2, "redirects": 1}).get("parse", {}).get("text", "")
    for t in re.findall(r'<table class="[^"]*wikitable[^"]*".*?</table>', doc, re.S):
        if not re.search(r"Cook|Sabato", t[:4000]): continue
        rows = [[strip(c) for c in re.findall(r"<t[dh][^>]*>.*?</t[dh]>", r, re.S)] for r in re.findall(r"<tr.*?</tr>", t, re.S)]
        hi = next((i for i, r in enumerate(rows) if r and r[0] == "State"), None)
        if hi is None: continue
        hdr = rows[hi]; raters = {}
        for i, h in enumerate(hdr[4:], 4):
            m = re.match(r"([A-Za-z]+)\.?\s*(.*)", h); raters[i] = (m.group(1), m.group(2).strip()) if m else (h, "")
        out = {}
        for r in rows[hi + 1:]:
            if len(r) != len(hdr): continue
            by = {raters[i][0]: r[i].replace("(flip)", "").strip() for i in raters if r[i]}
            out.setdefault(r[0], {"pvi": r[1], "incumbent": r[2], "last": r[3], "by": by})
        return {"rows": out, "raters": {n: d for n, d in raters.values()}, "url": "https://en.wikipedia.org/wiki/" + page.replace(" ", "_") + "#Predictions"}
    return None

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
    rc_path = os.path.join(cache, "election_ratings.json")
    try: rc = json.load(open(rc_path))
    except Exception: rc = {}
    ratings = {}
    for typ, page in (cfg.get("ratings") or {}).items():
        c = rc.get(typ)
        if not c or time.time() - c.get("t", 0) > 6 * 3600:
            try: c = {"t": time.time(), "d": wiki_ratings(page)}
            except Exception as e: c = {"t": time.time() - 5 * 3600, "d": (c or {}).get("d"), "err": str(e)[:100]}
            rc[typ] = c
        if c.get("d"): ratings[typ] = c["d"]
    json.dump(rc, open(rc_path, "w"))
    out["raters"] = {typ: {"raters": d["raters"], "url": d["url"]} for typ, d in ratings.items()}
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
            want = sorted({o["name"].split()[-1].lower() for od in r["odds"] for o in od["outcomes"][:2] if o["party"] in ("D", "R", "I") and o["name"].split()})[:2] if r["odds"] else []
            want = [w for w in want][:2]
            ck = r["id"] + ":" + ",".join(want); c = pc.get(ck)
            if not c or time.time() - c.get("t", 0) > 6 * 3600 or (c.get("d") and "trend" not in c["d"]):  # v3 adds the poll trend
                try: c = {"t": time.time(), "d": wiki_polls(pol, want)}
                except Exception as e: c = {"t": time.time() - 5 * 3600, "d": None, "err": str(e)[:100]}  # retry in ~1h
                pc[ck] = c
            r["pollData"] = c.get("d")
        if r.get("state"): r["fips"] = FIPS[r["state"]]
        # momentum (Polymarket's own 24h / 7d price changes, so it works from the first run)
        pmo = next((o for o in r["odds"] if o["src"] == "Polymarket"), None)
        if pmo:
            for k in ("d1", "d7"):
                v = [o.get(k) for o in pmo["outcomes"] if o["party"] in ("D", "I") and o.get(k) is not None]
                if v: r["move" + k[1:]] = round(sum(v), 3)
            r["vol24"] = pmo.get("vol24")
        # ratings consensus
        rt = ratings.get(r["type"])
        if rt and r.get("state"):
            row = next((v for k, v in rt["rows"].items() if k == STATES[r["state"]] or k.startswith(STATES[r["state"]] + " ")), None)
            if row:
                sc = [x for x in (rscore(v) for v in row["by"].values()) if x is not None]
                avg = round(sum(sc) / len(sc), 2) if sc else None
                r["ratings"] = {"by": row["by"], "avg": avg, "label": rlabel(avg), "pvi": row["pvi"], "incumbent": row["incumbent"], "last": row.get("last"),
                                "open": bool(re.search(r"retir|term-limited|resign|running for|lost renomination|defeated", row["incumbent"], re.I))}
        # poll margin in D terms (names matched to market candidates by last name)
        pdd = r.get("pollData")
        if pdd:
            pty = {o["name"].split()[-1].lower(): o["party"] for od in r["odds"] for o in od["outcomes"] if o["party"]}
            ps = [pty.get(n.split()[-1].lower()) for n in pdd["names"]]
            if "R" in ps and any(x in ("D", "I") for x in ps):
                d, rr = (0, 1) if ps[0] in ("D", "I") else (1, 0); r["pollMarginD"] = round(pdd["avg"][d] - pdd["avg"][rr], 1)
    # races to watch: close odds, big moves, poll-vs-market or ratings-vs-market gaps
    watch = []
    for r in races:
        if r["type"] == "chamber" or r.get("pD") is None: continue
        p, why, sc = r["pD"], [], 0
        fav = lambda x: "D" if x >= .5 else "R"
        close = .35 <= p <= .65
        if close: sc += 3 - abs(p - .5) * 10; why.append(f"Toss-up in the markets ({fav(p)} {round(max(p, 1 - p) * 100)}%)")
        m7, m1 = r.get("move7") or 0, r.get("move1") or 0
        if abs(m7) >= .03: sc += abs(m7) * 25; why.append(f"Odds moved {int(abs(m7) * 100 + .5)} pts toward {'D' if m7 > 0 else 'R'} this week")
        elif abs(m1) >= .02: sc += abs(m1) * 35; why.append(f"Odds moved {int(abs(m1) * 100 + .5)} pts toward {'D' if m1 > 0 else 'R'} in 24h")
        pm = r.get("pollMarginD")
        if pm is not None and ((pm > 0) != (p >= .5)) and abs(pm) >= .5:
            sc += 2.5; why.append(f"Polls lean {'D' if pm > 0 else 'R'} +{abs(pm)} but markets favor {fav(p)}")
        elif pm is not None and abs(pm) < 3 and abs(p - .5) > .2:
            sc += 1.5; why.append(f"Polls within {abs(pm)} pts, markets {round(max(p, 1 - p) * 100)}% sure")
        ra = (r.get("ratings") or {}).get("avg")
        if ra is not None and ((ra > .5 and p < .45) or (ra < -.5 and p > .55)):
            sc += 2; why.append(f"Raters say {r['ratings']['label']}, markets favor {fav(p)}")
        if (r.get("ratings") or {}).get("open") and why: why.append("Open seat")
        if why and sc >= 1.5: watch.append({"id": r["id"], "score": round(sc + (.5 if r.get("key") else 0), 2), "why": why[:3]})
    out["watch"] = sorted(watch, key=lambda w: -w["score"])[:10]
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
