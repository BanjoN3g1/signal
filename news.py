"""'Today' news stream for Signal.
Story ids (the keys data/x.json uses): id = first 12 hex chars of sha1(URL of the first headline seen for the story, or its title
if it has no URL). Stories persist in the cache for 36h, so an id stays the same across refreshes while the story is live; when two
stories are later merged as duplicates, the survivor keeps its id and lists the absorbed ids in "aliases" (x.json may use either).
Free RSS feeds -> dedupe/cluster -> relevance score for a software/semis banker free RSS feeds -> dedupe/cluster -> relevance score for a software/semis banker
-> batched Flash-Lite summaries (cached per cluster). No paywall bypassing: we only read public RSS headlines/blurbs;
paywalled stories are summarized from free coverage of the same story (or the headline alone) and labeled."""
import json, os, re, time, html, hashlib, email.utils, datetime as dt
import xml.etree.ElementTree as ET
import requests
import llm

UA = {"User-Agent": "Mozilla/5.0 (compatible; Signal news reader/1.0; personal dashboard; github.com/BanjoN3g1/signal)"}
GN = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="
FEEDS = [
    ("CNBC Tech", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910"),
    ("CNBC Finance", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("Techmeme", "https://www.techmeme.com/feed.xml"),
    ("Federal Reserve", "https://www.federalreserve.gov/feeds/press_all.xml"),
]
TOPICS = {  # Google News RSS searches (free; covers Reuters/Bloomberg/WSJ headlines, which link out to the publisher)
    "semis M&A": '(semiconductor OR chipmaker) (acquire OR acquisition OR merger OR deal)',
    "software M&A": 'software (acquire OR acquisition OR merger OR "take-private" OR buyout)',
    "tech IPO": '(tech OR software OR AI OR chip) (IPO OR "files to go public" OR "initial public offering")',
    "tech ECM": '(convertible notes OR "stock offering" OR "share sale") (tech OR software OR semiconductor)',
    "AI capex": '("data center" OR hyperscaler OR "AI spending") capex',
    "Reuters tech": 'site:reuters.com (technology OR semiconductors OR software)',
}
PAYWALL = re.compile(r"(wsj|wall street journal|bloomberg|financial times|\bft\b|barron|the information|economist|nikkei|business insider|seeking alpha|new york times|nytimes)", re.I)
STOP = set("the a an and or but of to in on for with is are was were be been it its that this as at by from after over into amid says said will would could new than more up down out about how why what who us inc corp co ltd plc".split())
KW = {  # tag: (regex, weight)
    "M&A": (r"\b(acquir\w*|merger|merge|buyout|take-?private|takeover|to buy|deal to|bid for|tie-up|combination)\b", 3),
    "IPO/ECM": (r"\b(ipo|go(es|ing)? public|initial public offering|convertible|share sale|stock offering|follow-on|secondary offering|notes offering|raises? \$|debt offering|bond sale)\b", 3),
    "Earnings": (r"\b(earnings|results|revenue|guidance|forecast|beats?|miss(es)?|quarter(ly)?|outlook|eps)\b", 2),
    "Fed/rates": (r"\b(fed|fomc|powell|rate (cut|hike)s?|interest rates?|treasury yields?|inflation|cpi|federal reserve)\b", 2),
    "AI capex": (r"\b(capex|capital expenditure|data cent(er|re)s?|gpus?|hyperscaler|ai spending|ai infrastructure|compute capacity)\b", 2),
}
ITEMS_8K = {"1.01": "material agreement", "2.01": "completed acquisition/disposition", "2.02": "earnings release", "2.03": "new debt",
            "3.02": "unregistered equity sale", "5.02": "executive/board change", "7.01": "Reg FD disclosure", "8.01": "other event", "1.02": "terminated agreement"}
WINDOW_H = 36
def log(*a): print("[news]", *a, flush=True)

def parse_date(s):
    try:
        d = email.utils.parsedate_to_datetime(s)
        return (d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc)
    except Exception: return None

def rss(url, src=None, n=40):
    try:
        r = requests.get(url, headers=UA, timeout=15)
        if r.status_code != 200: return [], False
        out = []
        for it in ET.fromstring(r.content).iter("item"):
            title = html.unescape(it.findtext("title") or "").strip()
            s = it.find("source"); sname = (s.text if s is not None else None) or src or ""
            if sname and title.endswith(" - " + sname): title = title[: -len(sname) - 3]
            desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(it.findtext("description") or ""))).strip()
            if desc.startswith(title[:40]): desc = ""  # Google News blurbs just repeat the headline
            d = parse_date(it.findtext("pubDate") or "")
            if title and d: out.append({"title": title, "url": it.findtext("link"), "source": sname, "date": d.isoformat(), "desc": desc[:400]})
            if len(out) >= n: break
        return out, True
    except Exception as e:
        log("rss err", url[:60], type(e).__name__); return [], False

def toks(s):  # crude stemming (first 5 letters) so merge/merger, chip/chips, acquire/acquisition line up
    return {w[:5] for w in re.findall(r"[a-z0-9$][a-z0-9$.'-]*", s.lower().replace("’", "'").replace("'s", "")) if len(w) > 2 and w not in STOP}

def collect(watch, news_by_ticker, sec, names):
    """watch: tickers; news_by_ticker: refresh.py's Google News per ticker; sec: refresh.py's EDGAR filings; names: ticker->short name."""
    items, status = [], {}
    for name, url in FEEDS:
        got, ok = rss(url, name); status[name] = ok; items += got
    for tag, q in TOPICS.items():
        got, ok = rss(GN + requests.utils.quote(q + " when:1d"), None, 25); status["Google News"] = status.get("Google News", True) and ok; items += got
    # Yahoo Finance headlines for watchlist names, batched
    syms = [t for t in watch if re.fullmatch(r"[A-Z.]{1,6}", t)]
    for i in range(0, len(syms), 10):
        got, ok = rss("https://feeds.finance.yahoo.com/rss/2.0/headline?region=US&lang=en-US&s=" + ",".join(syms[i:i + 10]), "Yahoo Finance", 40)
        status["Yahoo Finance"] = status.get("Yahoo Finance", True) and ok
        for g in got: g["source"] = g["source"] if g["source"] != "Yahoo Finance" else "Yahoo Finance"
        items += got
    for t, ns in (news_by_ticker or {}).items():
        for n in ns or []:
            d = parse_date(n.get("date") or "")
            if d: items.append({"title": n["title"], "url": n["url"], "source": n.get("source") or "", "date": d.isoformat(), "desc": ""})
    # EDGAR 8-Ks for watchlist names (company press releases / material events)
    now = dt.datetime.now(dt.timezone.utc)
    for t, s in (sec or {}).items():
        for f in (s or {}).get("filings", [])[:8]:
            if f.get("form") != "8-K": continue
            try: d = dt.datetime.fromisoformat(f["date"]).replace(tzinfo=dt.timezone.utc) + dt.timedelta(hours=21)  # filing date only; ~after close ET
            except Exception: continue
            if (now - d).total_seconds() > WINDOW_H * 3600: continue
            what = ", ".join(ITEMS_8K.get(x.strip(), "item " + x.strip()) for x in (f.get("items") or "").split(",") if x.strip()) or "current report"
            items.append({"title": f"{names.get(t, t)} ({t}) files 8-K: {what}", "url": f["url"], "source": "SEC EDGAR", "date": min(d, now).isoformat(), "desc": f.get("desc") or "", "tickers": [t]})
    status["SEC EDGAR 8-K"] = bool(sec)
    cutoff = now - dt.timedelta(hours=WINDOW_H)
    seen, out = set(), []
    for it in items:
        if dt.datetime.fromisoformat(it["date"]) < cutoff: continue
        k = re.sub(r"\W+", "", it["title"].lower())[:90]
        if k in seen: continue
        seen.add(k); out.append(it)
    return out, status

def tickers_in(text, names):
    found = []
    for t, nm in names.items():
        if re.search(r"(?<![A-Za-z])" + re.escape(t) + r"(?![A-Za-z])", text) and len(t) > 2 and t not in ("IGV", "SOXX", "ARM", "NOW", "NET"):
            found.append(t)
        elif nm and re.search(r"\b" + re.escape(nm) + r"\b", text, re.I): found.append(t)
    return sorted(set(found))

def cluster(items, state, names):
    """Greedy clustering on headline token overlap; clusters persist across runs (stable ids for caching)."""
    now = dt.datetime.now(dt.timezone.utc)
    cl = {cid: c for cid, c in state.items() if (now - dt.datetime.fromisoformat(c["last"])).total_seconds() < WINDOW_H * 3600}
    for c in cl.values(): c["_t"] = set(c["toks"]); c["_tk"] = c.get("tickers") or []
    for it in sorted(items, key=lambda x: x["date"]):
        tk = toks(it["title"]); best, bs = None, 0
        for cid, c in cl.items():
            if any(s["url"] == it["url"] or s["title"] == it["title"] for s in c["sources"]): best = None; bs = -1; break
            inter = len(tk & c["_t"]); 
            if not inter: continue
            j = inter / len(tk | c["_t"]); m = inter / max(1, min(len(tk), len(c["_t"])))
            sc = max(j, m * 0.8 if inter >= 4 else 0)
            if inter >= 3 and set(it.get("tickers") or tickers_in(it["title"], names)) & set(c.get("_tk") or []): sc = max(sc, m * 0.9)  # same company + overlapping words
            if sc > bs: best, bs = cid, sc
        if bs == -1: continue
        if best and bs >= 0.45:
            c = cl[best]; c["sources"].append(it); c["last"] = max(c["last"], it["date"]); c["_t"] |= tk
            c["_tk"] = sorted(set(c.get("_tk") or []) | set(tickers_in(it["title"], names)))
        else:
            cid = hashlib.sha1((it["url"] or it["title"]).encode()).hexdigest()[:12]
            cl[cid] = {"id": cid, "first": it["date"], "last": it["date"], "sources": [it], "_t": tk, "_tk": tickers_in(it["title"], names)}
    for c in cl.values():
        c["toks"] = sorted(c.pop("_t"))[:80]; c.pop("_tk", None)
        txt = " ".join(s["title"] + " " + s.get("desc", "") for s in c["sources"])
        c["tickers"] = sorted(set(tickers_in(txt, names)) | {t for s in c["sources"] for t in s.get("tickers", [])})
    return cl

def score(c, now):
    txt = " ".join(s["title"] for s in c["sources"]) + " " + " ".join(s.get("desc", "")[:200] for s in c["sources"][:3])
    tags, sc = [], 0.0
    for tag, (rx, w) in KW.items():
        if re.search(rx, txt, re.I): tags.append(tag); sc += w
    if any(s["source"] == "Federal Reserve" for s in c["sources"]):
        sc += 2; tags.append("Fed/rates") if "Fed/rates" not in tags else None
        if re.search(r"(enforcement|termination of|application|approval of|community|bank holding)", txt, re.I) and not re.search(r"(fomc|monetary policy|rate)", txt, re.I): sc -= 3  # routine Fed bank-supervision notices
    sc += min(3 * len(c["tickers"]), 6)
    srcs = {s["source"] for s in c["sources"]}
    sc += min(len(srcs) - 1, 3)
    if not c["tickers"] and not re.search(r"(semiconductor|chip|software|saas|\bai\b|cloud|tech|nasdaq|data cent)", txt, re.I) and "Fed/rates" not in tags: sc -= 3
    age_h = (now - dt.datetime.fromisoformat(c["last"])).total_seconds() / 3600
    sc *= 1 / (1 + age_h / 18)
    return round(sc, 2), tags

NEWS_SYS = """You brief a junior investment banker covering software and semiconductors (M&A, ECM/IPOs, converts, leveraged finance).
For each numbered story you get headlines (with source names) and short blurbs from free RSS feeds. Use ONLY that text; never invent numbers,
names or details; hedge when only a headline is available. Some sources are marked [paywalled]: you have only their headline.
Return JSON: {"<id>": {"sum": "1-2 plain-English sentences on what happened", "why": "1 sentence: why it matters for a tech banker (deal flow, comps, financing windows, read-across)",
"deep": ["3 short bullets: context, what to watch next, read-across to peers or deal activity"],
"dup": "<id of an EARLIER-listed story in this batch that covers the same event, else null>"}} for every id."""

def summarize(cands, cache, max_calls=2, per_call=15):
    p = llm.provider()
    cp = os.path.join(cache, "news_ai.json")
    try: done = json.load(open(cp))
    except Exception: done = {}
    todo = [c for c in cands if c["id"] not in done and c["id"] not in done.get("_dups", {})][: max_calls * per_call]
    calls = 0
    while todo and p and calls < max_calls and llm.remaining("news", cache) > 0:
        batch, todo = todo[:per_call], todo[per_call:]
        lines = []
        for c in batch:
            lines.append(f"## {c['id']}" + (f" (tickers: {', '.join(c['tickers'])})" if c["tickers"] else ""))
            for s in c["sources"][:6]:
                pw = bool(PAYWALL.search(s["source"] or ""))
                lines.append(f"- {s['source']}{' [paywalled]' if pw else ''}: {s['title']}" + (f" — {s['desc'][:280]}" if s.get("desc") and not pw else ""))
        res = llm.call("news", NEWS_SYS, "\n".join(lines), cache, max_tokens=220 * len(batch)); calls += 1
        if isinstance(res, dict):
            for c in batch:
                r = res.get(c["id"])
                if isinstance(r, dict) and r.get("dup") and r["dup"] != c["id"] and r["dup"] in {b["id"] for b in batch}:
                    done.setdefault("_dups", {})[c["id"]] = r["dup"]
                if isinstance(r, dict) and r.get("sum"):
                    done[c["id"]] = {"sum": str(r["sum"]).strip(), "why": str(r.get("why") or "").strip(),
                                     "deep": [str(x).strip() for x in (r.get("deep") or [])][:4], "model": res.get("_model"), "n": len(c["sources"])}
    json.dump(done, open(cp, "w"))
    return done

def build(watch, news_by_ticker, sec, names, cache):
    t0 = time.time(); now = dt.datetime.now(dt.timezone.utc)
    items, status = collect(watch, news_by_ticker, sec, names)
    sp = os.path.join(cache, "news_clusters.json")
    try: state = json.load(open(sp))
    except Exception: state = {}
    cl = cluster(items, state, names)
    json.dump(cl, open(sp, "w"))
    ranked = []
    for c in cl.values():
        sc, tags = score(c, now)
        if sc <= 1: continue
        ranked.append((sc, tags, c))
    ranked.sort(key=lambda x: -x[0])
    ranked = ranked[:40]
    ai = summarize([c for _, _, c in ranked[:30]], cache)
    dups = ai.get("_dups", {})  # the model flagged these as the same event as another story: fold them in for good
    for src, dst in list(dups.items()):
        while dst in dups and dups[dst] != src: dst = dups[dst]
        if src in cl and dst in cl and src != dst:
            d = cl[dst]; s = cl.pop(src)
            d["sources"] += [x for x in s["sources"] if x["url"] not in {y["url"] for y in d["sources"]}]
            d["first"], d["last"] = min(d["first"], s["first"]), max(d["last"], s["last"])
            d["toks"] = sorted(set(d["toks"]) | set(s["toks"]))[:80]; d["tickers"] = sorted(set(d["tickers"]) | set(s["tickers"]))
            d["aliases"] = sorted(set(d.get("aliases", [])) | {src} | set(s.get("aliases", [])))  # old ids keep matching data/x.json
    json.dump(cl, open(sp, "w"))
    ranked = sorted(((*score(c, now), c) for c in cl.values()), key=lambda x: -x[0])
    ranked = [r for r in ranked if r[0] > 1][:40]
    out = []
    for sc, tags, c in ranked:
        srcs = sorted(c["sources"], key=lambda s: (bool(PAYWALL.search(s["source"] or "")), s["date"]))
        free = [s for s in srcs if not PAYWALL.search(s["source"] or "")]
        pay = [s["source"] for s in srcs if PAYWALL.search(s["source"] or "")]
        lead = free[0] if free else srcs[0]
        a = ai.get(c["id"]) or {}
        out.append({"id": c["id"], "aliases": c.get("aliases", []), "title": lead["title"], "first": c["first"], "last": c["last"], "score": sc, "tags": tags, "tickers": c["tickers"],
                    "sum": a.get("sum"), "why": a.get("why"), "deep": a.get("deep") or [], "model": a.get("model"),
                    "paywalled": sorted(set(pay)), "freeCoverage": bool(free), "sources": [{k: s.get(k) for k in ("source", "title", "url", "date")} | {"paywalled": bool(PAYWALL.search(s["source"] or ""))} for s in srcs[:12]],
                    "x": []})  # slot for X posts, filled later by a separate job
    log(f"{len(items)} items -> {len(cl)} clusters -> {len(out)} shown; ai {sum(1 for o in out if o['sum'])}; {round(time.time() - t0)}s")
    return {"asOf": now.astimezone().isoformat(timespec="seconds"), "items": out, "sources": status, "windowHours": WINDOW_H,
            "xMeta": {"status": "reserved", "note": "X posts per story are added by a separate job"}}
