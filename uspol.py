"""Politics world v3 enrichments for politics.json (all free, all cached, every number carries its source):
- hist: Polymarket price history (public CLOB prices-history API) for chamber control + watched races
- snaps: our own incremental snapshots each refresh (generic ballot, approval, chamber odds, ratings) -> sparklines + weekly diffs
- overview: 'Where the US stands' -- 'what changed this week' bullets computed from data diffs (no AI), plus a short
  Flash-Lite narrative written ONLY from those numbers (max 1 call per refresh, cached by input hash, numbers verified)
- photos: candidate thumbnails from Wikipedia pageimages (cached 14 days; initials fallback client-side)
- reddit: top weekly posts from tracker subreddits via public RSS (paced, cached 3h), one Flash-Lite digest (cached by titles)"""
import json, os, re, time, hashlib, html, datetime as dt
import requests, llm
from elections import get

def log(*a): print("[uspol]", *a, flush=True)
CLOB = "https://clob.polymarket.com/prices-history"
SUBS = ["fivethirtyeight", "PoliticalDiscussion", "YAPms", "Polymarket"]
UA = {"User-Agent": "signal-pwa/1.0 (personal dashboard; github.com/BanjoN3g1/signal)"}
now = lambda: time.time()
def iso(t): return dt.datetime.fromtimestamp(t, dt.timezone.utc).isoformat(timespec="seconds")

def _store(cache, name):
    p = os.path.join(cache, name)
    try: return p, json.load(open(p))
    except Exception: return p, {}

def dtok(r):
    """Polymarket token + label for the D (or I) side of a race."""
    pm = next((o for o in r.get("odds", []) if o["src"] == "Polymarket"), None)
    if not pm: return None
    o = next((x for x in pm["outcomes"] if x.get("party") in ("D", "I") and x.get("tok")), None) or next((x for x in pm["outcomes"] if x.get("tok") and re.match(r"democrat", x["name"], re.I)), None)
    return o and {"tok": o["tok"], "name": o["name"], "party": o.get("party") or "D", "url": pm["url"]}

def history(E, cache):
    ids = [r["id"] for r in E["races"] if r["type"] == "chamber"] + [w["id"] for w in E.get("watch", [])][:8] + [r["id"] for r in E["races"] if r.get("key")]
    seen, out = set(), {}
    p, c = _store(cache, "pol_hist.json")
    for rid in ids:
        if rid in seen or len(seen) >= 16: continue
        seen.add(rid); r = next((x for x in E["races"] if x["id"] == rid), None); d = r and dtok(r)
        if not d: continue
        e = c.get(d["tok"])
        if not e or now() - e["t"] > 6 * 3600:
            try:
                h = requests.get(CLOB, params={"market": d["tok"], "interval": "max", "fidelity": 720}, headers=UA, timeout=20).json().get("history", [])
                cut = now() - 120 * 86400; day = {}
                for x in h:
                    if x["t"] >= cut: day[int(x["t"] // 86400)] = [int(x["t"]), round(float(x["p"]), 3)]  # last point per day
                e = {"t": now(), "pts": [day[k] for k in sorted(day)]}; c[d["tok"]] = e; time.sleep(0.3)
            except Exception as ex: log("hist", rid, ex); continue
        out[rid] = {"src": "Polymarket", "url": d["url"], "name": d["name"], "party": d["party"], "pts": e["pts"]}
    json.dump(c, open(p, "w"))
    return out

def snapshot(out, E, cache):
    p, s = _store(cache, "pol_snaps.json"); L = s.get("snaps", [])
    sig = {x["id"]: x for x in out.get("signals", [])}
    g = sig.get("generic", {}).get("value"); a = sig.get("approval", {})
    snap = {"t": int(now()), "generic": float(re.sub(r"[^\d.]", "", g)) * (1 if g and g.startswith("D") else -1) if g and re.search(r"\d", g) else None,
            "approve": float(re.sub(r"[^\d.]", "", a.get("value", ""))) if re.search(r"\d", a.get("value", "")) else None,
            "chambers": {r["id"]: r.get("pD") for r in E["races"] if r["type"] == "chamber"},
            "ratings": {r["id"]: r["ratings"]["label"] for r in E["races"] if r.get("ratings", {}).get("label")}}
    if not L or snap["t"] - L[-1]["t"] >= 3 * 3600: L.append(snap)
    else: L[-1] = snap  # keep the latest within a 3h bucket
    L = [x for x in L if x["t"] >= now() - 120 * 86400]; s["snaps"] = L; json.dump(s, open(p, "w"))
    return L

def week_ago(series, t0, key=lambda x: x):
    """value closest to 7 days before t0 (needs >= 5 days of data), else None"""
    old = [x for x in series if t0 - key(x) >= 5 * 86400]
    return min(old, key=lambda x: abs(t0 - 7 * 86400 - key(x))) if old else None

def changes(E, hist, snaps):
    out = []; t0 = now(); title = {r["id"]: r["title"] for r in E["races"]}
    mv = []
    for rid, h in hist.items():
        if len(h["pts"]) < 2: continue
        o = week_ago(h["pts"], t0, key=lambda x: x[0])
        if o: mv.append((h["pts"][-1][1] - o[1], rid, o, h))
    for d, rid, o, h in sorted(mv, key=lambda x: -abs(x[0]))[:3]:
        if abs(d) >= .04:
            out.append({"text": f"{title.get(rid, rid)}: {h['name']} {round(o[1]*100)}% → {round(h['pts'][-1][1]*100)}% on Polymarket ({'+' if d > 0 else ''}{round(d*100)} pts in 7 days)",
                        "lean": h["party"] if d > 0 else ("R" if h["party"] in ("D", "I") else "D"), "src": "Polymarket price history", "race": rid})
    if snaps:
        o = week_ago(snaps, t0, key=lambda x: x["t"]); cur = snaps[-1]
        if o and o.get("generic") is not None and cur.get("generic") is not None and abs(cur["generic"] - o["generic"]) >= .3:
            f = lambda v: f"{'D' if v >= 0 else 'R'}+{abs(v):.1f}"
            out.append({"text": f"Generic ballot average moved {f(o['generic'])} → {f(cur['generic'])} since {dt.datetime.fromtimestamp(o['t']).strftime('%b %-d')}", "lean": "D" if cur["generic"] > o["generic"] else "R", "src": "Wikipedia aggregator table (our snapshots)"})
        if o:
            for rid, lab in cur.get("ratings", {}).items():
                ol = o.get("ratings", {}).get(rid)
                if ol and ol != lab and len(out) < 6: out.append({"text": f"{title.get(rid, rid)}: rater consensus {ol} → {lab}", "lean": "D" if "D" in lab and "D" not in ol or ("R" in ol and "R" not in lab) else "R", "src": "Wikipedia ratings table (our snapshots)", "race": rid})
    newp = []
    for r in E["races"]:
        for p in (r.get("pollData") or {}).get("trend", [])[:6]:
            m = re.findall(r"([A-Z][a-z]+)\s+(\d{1,2})(?:[–-]\d{1,2})?,\s*(\d{4})", p["dates"].replace("–", "-"))
            try: end = dt.datetime.strptime(" ".join(m[-1]), "%B %d %Y") if m else None
            except ValueError: end = None
            if end and (dt.datetime.now() - end).days <= 7: newp.append(r["title"])
    if newp:
        from collections import Counter
        top = Counter(newp).most_common(3)
        out.append({"text": f"{len(newp)} new public polls in tracked races this week (" + ", ".join(f"{t} {n}" for t, n in top) + ")", "lean": None, "src": "Wikipedia polling tables"})
    return out[:5]

def narrative(facts, cache):
    p, c = _store(cache, "pol_overview.json")
    h = hashlib.sha1(json.dumps(facts, sort_keys=True).encode()).hexdigest()[:12]
    if c.get("hash") == h and c.get("text"): return c
    if llm.remaining("pol", cache) <= 0: return c if c.get("text") else None
    sysm = ("You write a 3-sentence plain-English 'state of play' of US midterm politics for a busy finance professional. "
            "Lead with who is favored for the Senate and the House, then the national environment (generic ballot, approval), then the week's biggest change. "
            "Use ONLY the numbers in the JSON; do not add any other numbers, names, dates or events. Neutral tone, no predictions beyond what the odds say. "
            'Return JSON {"text": "..."}')
    res = llm.call("pol", sysm, json.dumps(facts), cache, max_tokens=300)
    t = str((res or {}).get("text") or "").strip()
    nums_in = set(re.findall(r"\d+(?:\.\d+)?", json.dumps(facts)))
    if t and all(n in nums_in for n in re.findall(r"\d+(?:\.\d+)?", t)):
        c = {"hash": h, "text": t, "model": res.get("_model"), "generatedAt": iso(now())}; json.dump(c, open(p, "w")); return c
    log("narrative rejected (numbers not in input)" if t else "narrative failed"); return c if c.get("text") else None

def photos(E, cache):
    p, c = _store(cache, "pol_photos.json")
    names = []
    for r in E["races"]:
        if r["type"] == "chamber": continue
        for od in r.get("odds", [])[:1]:
            names += [o["name"] for o in od["outcomes"][:3] if o.get("party") and len(o["name"].split()) >= 2]
    todo = [n for n in dict.fromkeys(names) if n not in c or now() - c[n]["t"] > 14 * 86400][:150]
    POL = re.compile(r"politic|senator|governor|representative|congress|mayor|attorney|lieutenant|legislat|candidate|businessman|businesswoman|official|secretary|activist|astronaut|officer|lawyer|commissioner|judge|treasurer|auditor|comptroller|state", re.I)
    for i in range(0, len(todo), 40):
        b = todo[i:i + 40]
        try:
            j = get("https://en.wikipedia.org/w/api.php", params={"action": "query", "prop": "pageimages|description", "piprop": "thumbnail", "pithumbsize": 160, "titles": "|".join(b), "format": "json", "formatversion": 2, "redirects": 1})
            q = j.get("query", {}); back = {x["to"]: x["from"] for x in q.get("redirects", [])} ; back.update({x["to"]: x["from"] for x in q.get("normalized", [])})
            got = {}
            for pg in q.get("pages", []):
                src = back.get(pg.get("title"), pg.get("title")); src = back.get(src, src)
                ok = pg.get("thumbnail") and POL.search(pg.get("description") or "")
                got[src] = {"t": now(), "url": pg["thumbnail"]["source"] if ok else None, "page": "https://en.wikipedia.org/wiki/" + pg["title"].replace(" ", "_") if ok else None}
            for n in b: c[n] = got.get(n) or {"t": now(), "url": None}
        except Exception as ex: log("photos", ex); break
    json.dump(c, open(p, "w"))
    return {n: {"url": v["url"], "page": v.get("page")} for n, v in c.items() if v.get("url")}

def reddit(cache):
    p, c = _store(cache, "pol_reddit.json"); subs = c.get("subs", {})
    for s in SUBS:
        e = subs.get(s)
        if e and now() - e["t"] < 3 * 3600: continue
        try:
            r = requests.get(f"https://www.reddit.com/r/{s}/top/.rss", params={"t": "week", "limit": 8}, headers=UA, timeout=20)
            if r.status_code != 200: log("reddit", s, r.status_code); subs[s] = {"t": now() - 2 * 3600, "posts": (e or {}).get("posts", []), "err": r.status_code}; time.sleep(4); continue
            posts = []
            for ent in re.findall(r"<entry>(.*?)</entry>", r.text, re.S)[:8]:
                t = html.unescape(re.search(r"<title>(.*?)</title>", ent, re.S).group(1)).strip()
                u = re.search(r'<link href="([^"]+)"', ent); up = re.search(r"<updated>([^<]+)", ent)
                if t and u: posts.append({"title": t[:200], "url": u.group(1), "date": up.group(1) if up else None, "sub": s})
            subs[s] = {"t": now(), "posts": posts}; time.sleep(4)
        except Exception as ex: log("reddit", s, ex)
    c["subs"] = subs
    posts = [x for s in SUBS for x in subs.get(s, {}).get("posts", [])[:6]]
    h = hashlib.sha1("|".join(x["title"] for x in posts).encode()).hexdigest()[:12]
    if posts and c.get("hash") != h and llm.remaining("pol", cache) > 0:
        res = llm.call("pol", "You summarize what election trackers on Reddit are discussing this week. Use ONLY the post titles given; no numbers or claims that are not in them. "
                       'Return JSON {"themes": [3-5 short themes, each {"t": "one sentence", "subs": ["subreddit names"]}]}', "\n".join(f"r/{x['sub']}: {x['title']}" for x in posts), cache, max_tokens=500)
        th = [{"t": str(x.get("t", ""))[:200], "subs": [str(s)[:30] for s in (x.get("subs") or [])][:3]} for x in (res or {}).get("themes", []) if isinstance(x, dict) and x.get("t")][:5]
        if th: c.update({"hash": h, "themes": th, "model": (res or {}).get("_model"), "at": iso(now())})
    json.dump(c, open(p, "w"))
    return {"posts": posts, "themes": c.get("themes", []), "model": c.get("model"), "at": c.get("at"),
            "subs": {s: {"ok": bool(subs.get(s, {}).get("posts")), "updated": iso(subs[s]["t"]) if s in subs else None} for s in SUBS}}

def enrich(out, E, cache):
    t0 = now()
    try: out["hist"] = history(E, cache)
    except Exception as e: log("history failed", e); out["hist"] = {}
    snaps = snapshot(out, E, cache)
    out["snaps"] = [{"t": s["t"], "generic": s.get("generic"), "approve": s.get("approve"), "chambers": s.get("chambers")} for s in snaps[-120:]]
    ch = changes(E, out["hist"], snaps)
    sig = {x["id"]: x for x in out.get("signals", [])}
    ctl = {r["title"]: f"{'Democrats' if r['pD'] >= .5 else 'Republicans'} favored, {round(max(r['pD'], 1 - r['pD']) * 100)}% in prediction markets (Polymarket + Kalshi average)" for r in E["races"] if r["type"] == "chamber" and r.get("pD") is not None}
    facts = {"chamber_control_markets": ctl, "generic_ballot": sig.get("generic", {}).get("value"), "presidential_approval": sig.get("approval", {}).get("value"),
             "approval_detail": sig.get("approval", {}).get("detail"), "this_week": [c["text"] for c in ch]}
    nar = None   # v5: the AI narrative is retired; the computed read (forecast.takeaways) replaces it
    out["overview"] = {"changes": ch, "narrative": nar, "facts": facts}
    try: out["photos"] = photos(E, cache)
    except Exception as e: log("photos failed", e); out["photos"] = {}
    try: out["reddit"] = reddit(cache)
    except Exception as e: log("reddit failed", e)
    log(f"hist {len(out['hist'])} series, {len(snaps)} snaps, {len(ch)} changes, narrative {'ok' if nar else 'none'}, {len(out['photos'])} photos, reddit {len((out.get('reddit') or {}).get('posts', []))} posts; {round(now() - t0)}s")
