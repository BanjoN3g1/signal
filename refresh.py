#!/usr/bin/env python3
"""Pull real public data for Signal and write data/feed.json (OUT_DIR env overrides).
Sources: Nasdaq quote+calendar API, Google Finance page (non-US e.g. IFX), SEC EDGAR,
Google News RSS, Reddit RSS (best effort), YouTube search page.
Rule: never invent numbers. If a source fails, the field is omitted."""
import json, os, re, sys, time, html, datetime as dt, concurrent.futures as cf
import xml.etree.ElementTree as ET
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("OUT_DIR") or os.path.join(ROOT, "data")
CACHE = os.environ.get("CACHE_DIR") or os.path.join(ROOT, "data", "cache")
os.makedirs(CACHE, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SEC_UA = os.environ.get("SEC_USER_AGENT", "").strip()  # SEC requires "Name contact@email"; unset -> SEC skipped
S = requests.Session(); S.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
S.cookies.set("CONSENT", "YES+cb", domain=".google.com"); S.cookies.set("SOCS", "CAI", domain=".google.com")
S.cookies.set("CONSENT", "YES+cb", domain=".youtube.com"); S.cookies.set("SOCS", "CAI", domain=".youtube.com")
STATUS = {}
def log(*a): print(*a, file=sys.stderr, flush=True)

def mark(src, ok, note=""):
    s = STATUS.setdefault(src, {"ok": 0, "fail": 0, "note": ""})
    s["ok" if ok else "fail"] += 1
    if note: s["note"] = note

def get(url, headers=None, timeout=15, tries=2):
    for i in range(tries):
        try:
            r = S.get(url, headers=headers or {}, timeout=timeout)
            if r.status_code == 200: return r
            if r.status_code == 429: time.sleep(2 + 3 * i)
        except Exception as e:
            log("ERR", url, e)
        time.sleep(0.5)
    return None

def num(s):
    if s is None: return None
    s = str(s).replace("$", "").replace(",", "").replace("%", "").replace("€", "").strip()
    try: return float(s)
    except: return None

# ---------- watchlist ----------
def load_watchlist():
    p = os.path.join(ROOT, "watchlist.json")  # repo-level list the scheduled pull uses
    env = os.environ.get("SIGNAL_WATCHLIST")
    if not os.path.exists(p) and env:
        try: return json.loads(env)
        except Exception: pass
    if not os.path.exists(p):
        p = os.path.join(ROOT, "watchlist_default.json")
    return json.load(open(p))

NON_US = {"IFX": {"gf": "IFX:ETR", "name": "Infineon Technologies", "ccy": "EUR", "exch": "XETRA"}}
ETFS = {"IGV", "SOXX", "SMH", "XLK", "QQQ", "SPY"}

# ---------- quotes ----------
NQ = {"Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com", "Referer": "https://www.nasdaq.com/"}
def nasdaq_quote(t):
    ac = "etf" if t in ETFS else "stocks"
    r = get(f"https://api.nasdaq.com/api/quote/{t}/info?assetclass={ac}", NQ)
    out = None
    try:
        d = r.json()["data"]; p = d["primaryData"]
        out = {"ticker": t, "name": clean_name(d.get("companyName", t)), "price": num(p["lastSalePrice"]),
               "chg": num(p["netChange"]), "pct": num(p["percentageChange"]), "asOf": p.get("lastTradeTimestamp"),
               "exchange": d.get("exchange"), "ccy": "USD", "marketStatus": d.get("marketStatus")}
    except Exception:
        if ac == "stocks":
            r = get(f"https://api.nasdaq.com/api/quote/{t}/info?assetclass=etf", NQ)
            try:
                d = r.json()["data"]; p = d["primaryData"]
                out = {"ticker": t, "name": clean_name(d.get("companyName", t)), "price": num(p["lastSalePrice"]), "chg": num(p["netChange"]), "pct": num(p["percentageChange"]), "asOf": p.get("lastTradeTimestamp"), "ccy": "USD"}
                ac = "etf"
            except Exception: pass
    if not out:
        mark("Nasdaq quotes", False); return None
    mark("Nasdaq quotes", True)
    frm = (dt.date.today() - dt.timedelta(days=140)).isoformat()
    r = get(f"https://api.nasdaq.com/api/quote/{t}/historical?assetclass={ac}&fromdate={frm}&limit=120", NQ)
    try:
        rows = r.json()["data"]["tradesTable"]["rows"]
        hist = [{"d": dt.datetime.strptime(x["date"], "%m/%d/%Y").date().isoformat(), "c": num(x["close"])} for x in rows]
        hist = sorted([h for h in hist if h["c"]], key=lambda h: h["d"])
        out["hist"] = hist
        def ret(n):
            if len(hist) > n: return round((hist[-1]["c"] / hist[-1 - n]["c"] - 1) * 100, 2)
        out["r5"], out["r21"] = ret(5), ret(21)
        mark("Nasdaq history", True)
    except Exception:
        mark("Nasdaq history", False)
    return out

def clean_name(n):
    n = re.sub(r"\s+(Common Stock|Class A Common Stock|Class A Subordinate Voting Shares|Ordinary Shares|American Depositary Shares.*|New York Registry Shares.*|ADS.*)$", "", n or "").strip()
    return n.replace(" Inc.", "").replace(", Inc.", "").replace(" Corporation", "").replace(" Holdings", "").strip(" ,")

def gfin_quote(t):
    m = NON_US[t]
    cp = os.path.join(CACHE, f"gf_{t}.json")
    def stale():
        mark("Google Finance (non-US)", False)
        if os.path.exists(cp):
            q = json.load(open(cp)); q["stale"] = True; return q
        return None
    r = get(f"https://www.google.com/finance/quote/{m['gf']}")
    if not r: return stale()
    h = r.text
    hdr = re.search(re.escape('<div class="gO24Ff">'), h)
    seg = h[hdr.start(): hdr.start() + 3000] if hdr else ""
    txt = re.sub(r"\|+", "|", re.sub(r"<[^>]+>", "|", seg))
    mm = re.search(r"\|[€$£]?([0-9][0-9.,]*)\|(?:arrow_\w+\|)?([+\-]?[0-9.,]+)%\|\(\|([+\-]?[0-9.,]+)\|\) Today\|([^|]*?)(?:&nbsp;|\|)", txt)
    if not mm: return stale()
    price, pct, chg = num(mm.group(1)), num(mm.group(2)), num(mm.group(3))
    if pct is not None and ((chg is not None and chg < 0) or "arrow_downward" in txt[: mm.end()]):
        pct = -abs(pct); chg = -abs(chg) if chg is not None else chg
    stamp = mm.group(4).replace("\u202f", " ").strip()
    mark("Google Finance (non-US)", True)
    q = {"ticker": t, "name": m["name"], "price": price, "chg": chg, "pct": pct, "ccy": m["ccy"], "exchange": m["exch"],
            "asOf": stamp, "src": f"https://www.google.com/finance/quote/{m['gf']}"}
    json.dump(q, open(cp, "w")); return q

# ---------- news ----------
def gnews(q, n=4):
    url = "https://news.google.com/rss/search?q=" + requests.utils.quote(q + " when:3d") + "&hl=en-US&gl=US&ceid=US:en"
    r = get(url)
    if not r: mark("Google News RSS", False); return []
    try:
        root = ET.fromstring(r.content); items = []
        for it in root.iter("item"):
            title = it.findtext("title") or ""; src = it.find("source")
            sname = src.text if src is not None else ""
            if sname and title.endswith(" - " + sname): title = title[: -len(sname) - 3]
            items.append({"title": html.unescape(title), "url": it.findtext("link"), "source": sname, "date": it.findtext("pubDate")})
            if len(items) >= n: break
        mark("Google News RSS", True); return items
    except Exception:
        mark("Google News RSS", False); return []

# ---------- reddit (best effort) ----------
REDDIT_BLOCKED = [False]
def reddit(t, name):
    if REDDIT_BLOCKED[0]: return []
    url = f"https://www.reddit.com/r/stocks+investing+wallstreetbets+StockMarket+semiconductors+SecurityAnalysis/search.rss?q={t}&restrict_sr=on&sort=new&t=week"
    try:
        r = S.get(url, timeout=12)
    except Exception: r = None
    if not r or r.status_code != 200:
        mark("Reddit RSS", False, f"HTTP {getattr(r,'status_code','err')} (Reddit rate-limits/blocks server IPs)")
        if r is not None and r.status_code in (403, 429): REDDIT_BLOCKED[0] = True
        return []
    try:
        ns = {"a": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(r.content); out = []
        for e in root.findall("a:entry", ns)[:4]:
            cat = e.find("a:category", ns)
            out.append({"title": e.findtext("a:title", namespaces=ns), "url": e.find("a:link", ns).get("href"),
                        "sub": cat.get("label") if cat is not None else "", "date": e.findtext("a:updated", namespaces=ns)})
        mark("Reddit RSS", True); return out
    except Exception:
        mark("Reddit RSS", False); return []

# ---------- SEC ----------
SECH = {"User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate"}
_cik = {}
def cik_map():
    if _cik or not SEC_UA: return _cik
    p = os.path.join(CACHE, "company_tickers.json")
    if not os.path.exists(p) or time.time() - os.path.getmtime(p) > 7 * 86400:
        r = get("https://www.sec.gov/files/company_tickers.json", SECH)
        if r: open(p, "w").write(r.text)
    try:
        for v in json.load(open(p)).values(): _cik[v["ticker"].upper()] = int(v["cik_str"])
    except Exception: pass
    return _cik

def sec_filings(t):
    c = cik_map().get(t)
    if not c: return None
    time.sleep(0.15)
    r = get(f"https://data.sec.gov/submissions/CIK{c:010d}.json", SECH)
    if not r: mark("SEC EDGAR", False); return None
    try:
        f = r.json()["filings"]["recent"]; out = []
        for i, form in enumerate(f["form"]):
            if form not in ("8-K", "10-Q", "10-K", "6-K", "20-F", "S-3ASR", "424B2", "424B5", "SC 13D"): continue
            acc = f["accessionNumber"][i]; doc = f["primaryDocument"][i]
            out.append({"form": form, "date": f["filingDate"][i], "items": f.get("items", [""] * 9999)[i],
                        "desc": f.get("primaryDocDescription", [""] * 9999)[i],
                        "url": f"https://www.sec.gov/Archives/edgar/data/{c}/{acc.replace('-', '')}/{doc}",
                        "index": f"https://www.sec.gov/Archives/edgar/data/{c}/{acc.replace('-', '')}/{acc}-index.htm",
                        "acc": acc})
            if len(out) >= 25: break
        mark("SEC EDGAR", True)
        return {"cik": c, "filings": out, "browse": f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={c}&type=&dateb=&owner=include&count=40"}
    except Exception:
        mark("SEC EDGAR", False); return None

def press_release(cik, acc):
    """Find EX-99.1 in an 8-K and pull outlook/guidance sentences verbatim."""
    base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}"
    r = get(base + "/index.json", SECH)
    if not r: return None
    try:
        items = r.json()["directory"]["item"]
        ex = [i["name"] for i in items if re.search(r"(ex-?99|exhibit99|ex99)", i["name"].lower()) and i["name"].lower().endswith((".htm", ".html"))]
        if not ex: return None
        url = base + "/" + sorted(ex)[0]
        time.sleep(0.15)
        r2 = get(url, SECH)
        txt = re.sub(r"<[^>]+>", " ", r2.text); txt = html.unescape(re.sub(r"\s+", " ", txt))
        sents = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"])", txt)
        hl, outlook = [], []
        for s in sents:
            sl = s.lower()
            if 20 < len(s) < 380:
                if re.search(r"\b(expects?|outlook|guidance|for the (fourth|first|second|third) quarter|fiscal (year )?20\d\d,? (we|the company) expect|anticipat)", sl) and re.search(r"\d", s) and len(outlook) < 3 and not re.search(r"forward-looking|safe harbor|conference call|webcast|form 10-q|expects to file|^\(\d\)|non-gaap represents|will host", sl):
                    outlook.append(s.strip())
                elif re.search(r"(revenue|total revenue|subscription revenue|rpo|remaining performance obligation)s? (was|were|of|grew|increased|rose|decreased|up)", sl) and re.search(r"\$|\d+%", s) and len(hl) < 3:
                    hl.append(s.strip())
        return {"url": url, "highlights": hl, "outlook": outlook}
    except Exception as e:
        log("PR err", e); return None

# ---------- earnings calendar (Nasdaq) ----------
def cal_day(d):
    p = os.path.join(CACHE, f"cal_{d}.json")
    today = dt.date.today()
    if os.path.exists(p):
        age = time.time() - os.path.getmtime(p)
        dd = dt.date.fromisoformat(d)
        if (dd < today - dt.timedelta(days=3)) or age < 6 * 3600:
            return json.load(open(p))
    r = get(f"https://api.nasdaq.com/api/calendar/earnings?date={d}", NQ)
    try:
        rows = r.json()["data"]["rows"] or []
        json.dump(rows, open(p, "w")); mark("Nasdaq earnings calendar", True); return rows
    except Exception:
        mark("Nasdaq earnings calendar", False)
        return json.load(open(p)) if os.path.exists(p) else []

def earnings_calendar(tickers):
    today = dt.date.today()
    days = [(today + dt.timedelta(days=i)) for i in range(-75, 50)]
    days = [d for d in days if d.weekday() < 5]
    found = {}
    with cf.ThreadPoolExecutor(6) as ex:
        for d, rows in zip(days, ex.map(lambda d: cal_day(d.isoformat()), days)):
            for row in rows:
                s = row.get("symbol")
                if s in tickers:
                    found.setdefault(s, []).append({"date": d.isoformat(), **row})
    return found

# ---------- YouTube ----------
def yt_search(q, n=3, key=None):
    res = _yt_live(q, n)
    cp = os.path.join(CACHE, f"yt_{key}.json")
    if res:
        if key: json.dump(res, open(cp, "w"))
        return res
    if key and os.path.exists(cp): return json.load(open(cp))
    try: return json.load(open(os.path.join(ROOT, "seed", "videos.json"))).get(key, [])
    except Exception: return []

def _yt_live(q, n=3):
    r = get("https://www.youtube.com/results?search_query=" + requests.utils.quote(q) + "&sp=EgIQAQ%253D%253D")
    if not r: mark("YouTube search", False); return []
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", r.text)
    if not m: mark("YouTube search", False); return []
    out = []
    def walk(o):
        if isinstance(o, dict):
            if "videoRenderer" in o:
                v = o["videoRenderer"]
                try:
                    out.append({"id": v["videoId"], "title": v["title"]["runs"][0]["text"],
                                "channel": v.get("ownerText", {}).get("runs", [{}])[0].get("text"),
                                "length": v.get("lengthText", {}).get("simpleText"), "age": v.get("publishedTimeText", {}).get("simpleText"),
                                "views": v.get("shortViewCountText", {}).get("simpleText")})
                except Exception: pass
            for x in o.values(): walk(x)
        elif isinstance(o, list):
            for x in o: walk(x)
    walk(json.loads(m.group(1)))
    mark("YouTube search", True)
    return out[:n]

# ---------- main ----------
def main():
    STATUS.clear(); REDDIT_BLOCKED[0] = False
    t0 = time.time()
    wl = load_watchlist()
    groups = wl["groups"]
    g_of = {}
    for g in groups:
        for t in g["tickers"]: g_of.setdefault(t, g["name"])
    tickers = list(g_of)
    log("tickers", len(tickers))

    def one(t):
        q = gfin_quote(t) if t in NON_US else nasdaq_quote(t)
        if not q: return t, None
        q["group"] = g_of[t]
        return t, q
    with cf.ThreadPoolExecutor(6) as ex:
        quotes = dict(ex.map(one, tickers))
    log("quotes done", round(time.time() - t0))

    def news_for(t):
        q = quotes.get(t)
        nm = (q or {}).get("name") or t
        if t in ETFS: query = {"IGV": "software stocks", "SOXX": "semiconductor stocks"}.get(t, nm)
        else: query = f'"{nm.split(" (")[0]}" stock'
        return t, gnews(query, 4)
    with cf.ThreadPoolExecutor(6) as ex:
        news = dict(ex.map(news_for, tickers))
    log("news done", round(time.time() - t0))

    sec = {}
    for t in tickers:
        if t in ETFS or t in NON_US: continue
        sec[t] = sec_filings(t)
    log("sec done", round(time.time() - t0))

    # reddit only for the biggest movers to stay polite
    movers = sorted([q for q in quotes.values() if q and q.get("pct") is not None and q["ticker"] not in ETFS], key=lambda q: -abs(q["pct"]))
    red = {}
    for q in movers[:8]:
        red[q["ticker"]] = reddit(q["ticker"], q["name"]); time.sleep(1.2)
    log("reddit done", round(time.time() - t0))

    cal = earnings_calendar(set(tickers))
    today = dt.date.today().isoformat()
    upcoming, recent = [], []
    for t, evs in cal.items():
        for e in evs:
            base = {"ticker": t, "name": (quotes.get(t) or {}).get("name") or clean_name(e.get("name")), "group": g_of.get(t),
                    "date": e["date"], "time": e.get("time"), "fq": e.get("fiscalQuarterEnding"),
                    "epsForecast": num(e.get("epsForecast")), "nEsts": num(e.get("noOfEsts")),
                    "lastYearEPS": num(e.get("lastYearEPS")), "lastYearDate": e.get("lastYearRptDt"), "mcap": num(e.get("marketCap"))}
            if e["date"] >= today and e.get("eps") in (None, "", "N/A"):
                upcoming.append(base)
            elif e.get("eps") not in (None, "", "N/A"):
                base["eps"] = num(e.get("eps")); base["surprise"] = num(e.get("surprise"))
                if base["eps"] is not None and base["epsForecast"] is not None:
                    base["result"] = "beat" if base["eps"] > base["epsForecast"] else ("miss" if base["eps"] < base["epsForecast"] else "inline")
                recent.append(base)
    upcoming.sort(key=lambda x: x["date"]); recent.sort(key=lambda x: x["date"], reverse=True)
    # reaction + 8-K press release for recent reports
    for e in recent:
        q = quotes.get(e["ticker"]) or {}
        h = q.get("hist") or []
        ds = [x["d"] for x in h]
        if h:
            # reaction window: close before the report -> close after the report
            tm = e.get("time") or ""
            before = [x for x in h if x["d"] < e["date"]] if "after" not in tm else [x for x in h if x["d"] <= e["date"]]
            after = [x for x in h if x["d"] > e["date"]] if "pre" not in tm else [x for x in h if x["d"] >= e["date"]]
            if before and after:
                e["reaction"] = round((after[0]["c"] / before[-1]["c"] - 1) * 100, 2)
                e["reactionWindow"] = f'{before[-1]["d"]} → {after[0]["d"]}'
            if before:
                e["sinceReport"] = round((h[-1]["c"] / before[-1]["c"] - 1) * 100, 2)
        s = sec.get(e["ticker"])
        if s:
            cand = [f for f in s["filings"] if f["form"] in ("8-K", "6-K") and abs((dt.date.fromisoformat(f["date"]) - dt.date.fromisoformat(e["date"])).days) <= 3 and (f["form"] == "6-K" or "2.02" in (f["items"] or ""))]
            if cand:
                e["filing"] = cand[0]
                if cand[0]["form"] == "8-K":
                    e["pr"] = press_release(s["cik"], cand[0]["acc"])
            q10 = [f for f in s["filings"] if f["form"] in ("10-Q", "10-K") and f["date"] >= e["date"]]
            if q10: e["periodic"] = q10[-1]
    log("earnings done", round(time.time() - t0))

    videos = {}
    for key, q in {"converts": "convertible bonds explained investment banking", "capped_call": "capped call convertible note explained",
                   "semis_cycle": "semiconductor cycle explained wafer fab equipment", "saas_valuation": "SaaS valuation rule of 40 explained",
                   "earnings": "earnings call explained guidance stock reaction", "market_today": "semiconductor stocks today"}.items():
        videos[key] = yt_search(q, 3, key)
    log("yt done", round(time.time() - t0))

    out = {"generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
           "elapsedSec": round(time.time() - t0, 1), "groups": groups, "quotes": quotes, "news": news,
           "sec": {k: v for k, v in sec.items() if v}, "reddit": red, "earnings": {"upcoming": upcoming, "recent": recent},
           "videos": videos, "sources": STATUS}
    tmp = os.path.join(DATA, "feed.json.tmp")
    json.dump(out, open(tmp, "w")); os.replace(tmp, os.path.join(DATA, "feed.json"))
    log("wrote feed.json", round(time.time() - t0), json.dumps(STATUS))

if __name__ == "__main__":
    main()
