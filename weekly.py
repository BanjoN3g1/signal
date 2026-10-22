"""'What you might have missed' — rolling 7-day digest of the top items per lane, from data the refresh already built (no AI).
Keeps data/cache/weekly_log.json (each run upserts candidates, prunes > 7 days) and writes <OUT>/weekly.json."""
import datetime as dt, json, os
ROOT = os.path.dirname(os.path.abspath(__file__))
def rd(p):
    try: return json.load(open(p))
    except Exception: return {}

def build(out_dir, cache):
    now = dt.datetime.now(dt.timezone.utc); lp = os.path.join(cache, "weekly_log.json"); log = rd(lp)
    def add(lane, key, title, date, score, ref, sub=""):
        if not title or not date: return
        L = log.setdefault(lane, {}); old = L.get(key, {})
        L[key] = {"title": title[:140], "sub": sub[:120], "date": date, "score": round(max(score, old.get("score", 0)), 2), "ref": ref}
    feed = rd(os.path.join(out_dir, "feed.json"))
    for it in (feed.get("today") or {}).get("items", [])[:15]:
        add("News", it["id"], (it.get("dev") or {}).get("headline") or it["title"], it["last"], it["score"] + (3 if it.get("dev") else 0), {"kind": "news", "id": it["id"], "url": it["sources"][0]["url"] if it.get("sources") else None},
            f"{it.get('nSources', 1)} sources" + (" · " + ", ".join(it["tickers"][:3]) if it.get("tickers") else ""))
    for e in (feed.get("earnings") or {}).get("recent", []):
        if e.get("reaction") is None: continue
        add("Earnings", f"{e['ticker']}:{e['date']}", f"{e['ticker']} {e.get('result') or 'reported'} · stock {e['reaction']:+.1f}%", e["date"] + "T21:00:00+00:00", abs(e["reaction"]), {"kind": "deep", "id": e["ticker"]}, e.get("name") or "")
    fl = rd(os.path.join(out_dir, "filings.json"))
    for f in fl.get("filings", []):
        add("Filings & Deals", f["acc"], (f.get("ai") or {}).get("headline") or f"{f['company']} · {f['type']}", f["date"] + "T21:00:00+00:00", 6 + 4 * f.get("notable", False) + ((f.get("ai") or {}).get("size") or 0) ** .5, {"kind": "filing", "id": f["acc"]}, f"{f['type']} · {f['form']}")
    for p in fl.get("private", []):
        add("Filings & Deals", p["id"], p["title"], p["date"], 3 + 2 * p["n"] + 4 * p["notable"], {"kind": "private", "id": p["id"], "url": p["sources"][0]["url"]}, p["type"] + (f" · {p['size']}" if p.get("size") else ""))
    po = rd(os.path.join(out_dir, "politics.json"))
    for s in po.get("stream", [])[:8]:
        add("Politics", s["id"], s["title"], s["last"], s["score"], {"kind": "politics", "id": s["id"], "url": s["sources"][0]["url"] if s.get("sources") else None}, " · ".join(s.get("tags", [])[:2]))
    pods = rd(os.path.join(ROOT, "data", "podcasts", "podcasts.json"))
    for e in pods.get("episodes", []):
        if e.get("pending") or not e.get("date"): continue
        add("Podcasts", e["key"], f"{e.get('showName', '')}: {e['title']}", e["date"], 2 + len(e.get("mentions") or {}), {"kind": "pod", "id": e["key"]}, ", ".join(list(e.get("mentions") or {})[:3]))
    cut = (now - dt.timedelta(days=7)).isoformat()
    log = {lane: {k: v for k, v in L.items() if v["date"] >= cut} for lane, L in log.items()}
    json.dump(log, open(lp, "w"))
    order = ["News", "Filings & Deals", "Earnings", "Politics", "Podcasts"]
    lanes = [{"lane": l, "items": sorted(([{"key": k, **v} for k, v in log.get(l, {}).items()]), key=lambda x: -x["score"])[:3]} for l in order]
    json.dump({"generatedAt": now.isoformat(timespec="seconds"), "since": cut, "lanes": [l for l in lanes if l["items"]]}, open(os.path.join(out_dir, "weekly.json"), "w"), separators=(",", ":"))
    print("[weekly]", {l["lane"]: len(l["items"]) for l in lanes}, flush=True)
