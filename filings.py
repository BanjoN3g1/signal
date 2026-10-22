"""Filings & Deals lane: notable tech / software / semis / AI / internet IPO filings, merger proxies, 8-K deal announcements
(SEC EDGAR full-text search, free, polite) + big private raises / tenders from news RSS. Each filing gets a Flash-Lite breakdown
from its public text (role 'filings', cached by accession). Writes <OUT>/filings.json and data/cache/filings_news.json
(picked up by news.py so big filings cluster with press coverage and can become Developing stories)."""
import datetime as dt, html, json, os, re, time
import requests, llm, news

ROOT = os.path.dirname(os.path.abspath(__file__))
SEC_UA = os.environ.get("SEC_USER_AGENT", "").strip()
EFTS = "https://efts.sec.gov/LATEST/search-index"
def log(*a): print("[filings]", *a, flush=True)
TECH_SIC = set(range(3570, 3580)) | set(range(3600, 3700)) | set(range(3820, 3830)) | set(range(7370, 7380)) | {4812, 4813, 4899, 5045, 5961, 7310, 7311, 7319, 7389, 6199}
NOTABLE = r"anthropic|openai|x\.?ai|spacex|space exploration|databricks|stripe|canva|revolut|klarna|discord|cerebras|anduril|scale ai|perplexity|mistral|figure ai|ramp|rippling|plaid|chime|monzo|shein|bytedance|tiktok|epic games|fanatics|genesys|celonis|grafana|vercel|cohere|groq|lambda|coreweave|crusoe|nscale|safe superintelligence|thinking machines|figma|oura|wiz|navan|medline|kraken|gemini space|bolt"
TYPES = [  # (lane type, forms, q phrase, days back, pages)
    ("IPO", "S-1", "prospectus", 45, 2), ("IPO", "F-1", "prospectus", 45, 1),
    ("Merger proxy", "DEFM14A", "merger", 45, 1), ("Merger proxy", "PREM14A", "merger", 45, 1), ("Merger (S-4)", "S-4", "merger", 45, 1),
    ("Deal 8-K", "8-K", "\"Agreement and Plan of Merger\"", 14, 2)]
H = lambda: {"User-Agent": SEC_UA, "Accept-Encoding": "gzip, deflate"}

def efts(forms, q, days, page):
    end = dt.date.today(); start = end - dt.timedelta(days=days)
    r = requests.get(EFTS, params={"q": q, "forms": forms, "dateRange": "custom", "startdt": start.isoformat(), "enddt": end.isoformat(), "from": page * 100}, headers=H(), timeout=30)
    time.sleep(0.4); r.raise_for_status(); return r.json().get("hits", {}).get("hits", [])

def clean_name(dn):
    m = re.match(r"(.*?)\s*(\(([A-Z.\-, ]{1,20})\))?\s*\(CIK \d+\)", dn or "")
    return (m.group(1).strip() if m else dn, (m.group(3) or "").split(",")[0].strip() if m else "")

def doc_text(url, cap=6_000_000):
    r = requests.get(url, headers=H(), timeout=60, stream=True); r.raise_for_status(); buf = b""
    for ch in r.iter_content(262144):
        buf += ch
        if len(buf) > cap: break
    time.sleep(0.4)
    t = buf.decode("utf-8", "ignore"); t = re.sub(r"(?is)<(script|style).*?</\1>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", t); t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"[ \t\xa0]+", " ", re.sub(r"\n\s*\n+", "\n", t))

SECTIONS = {"IPO": [r"PROSPECTUS SUMMARY|Prospectus Summary", r"SUMMARY CONSOLIDATED FINANCIAL|Summary Consolidated Financial|SUMMARY FINANCIAL", r"USE OF PROCEEDS|Use of Proceeds", r"Summary (of )?Risk Factors|RISK FACTORS SUMMARY", r"(Class [AB] common stock|multi-class|dual[- ]class)[^\n]{0,200}votes"],
            "Merger": [r"SUMMARY\b|Summary Term Sheet|SUMMARY TERM SHEET", r"Merger Consideration|MERGER CONSIDERATION", r"Opinion of [A-Z][^\n]{0,60}|OPINION OF", r"Termination Fee|TERMINATION FEE", r"Reasons for the Merger|REASONS FOR THE MERGER"],
            "Deal 8-K": [r"Item 1\.01|ITEM 1\.01", r"Item 2\.01|ITEM 2\.01", r"(per share|aggregate consideration|enterprise value|purchase price)"]}
def excerpt(text, kind, each=4500, total=22000):
    keys = SECTIONS["IPO" if kind == "IPO" else "Merger" if kind.startswith("Merger") else "Deal 8-K"]; out = []
    for rx in keys:
        ms = list(re.finditer(rx, text))
        if not ms: continue
        m = ms[1] if len(ms) > 1 and kind != "Deal 8-K" else ms[0]  # skip the table-of-contents hit
        out.append(text[m.start(): m.start() + each])
    s = "\n...\n".join(out) or text[:total]
    return s[:total]

SYS = """You brief a junior tech investment banker on an SEC filing. Use ONLY the excerpt text: never invent figures, names or terms;
if something isn't in the text, omit it. Return JSON {"headline": "<= 90 chars, e.g. 'X files for Nasdaq IPO; revenue $1.2B, +45%'",
"what": "1-2 sentences: what the company does", "financials": [{"figure": "exact figure as written", "context": "what it is, period"}] (0-6),
"terms": "offering size / price range / use of proceeds, or deal consideration, premium, structure, termination fees, as found",
"risks": ["<= 4 notable risk factors or governance points (dual-class, controlled company, customer concentration, going concern...)"],
"comps": ["<= 4 public comparables you can reasonably infer from the business description (names only)"],
"implications": "1-2 sentences for ECM / M&A (window, valuation read-across, sector)", "notable": true if the text shows a raise, valuation
or deal of about $1B+ or a widely known company, else false, "size_usd_b": number or null (offering / deal size in $B if stated)}"""

def analyze(item, cache, ai):
    if item["acc"] in ai or not llm.provider() or llm.remaining("filings", cache) <= 0: return
    try: txt = doc_text(item["doc"])
    except Exception as e: log("doc fail", item["acc"], e); return
    ex = excerpt(txt, item["type"])
    if len(ex) < 400: return
    res = llm.call("filings", SYS, f"Company: {item['company']} · Form {item['form']} filed {item['date']}\n\n{ex}", cache, max_tokens=900)
    if not isinstance(res, dict) or not res.get("what"): return
    flat = re.sub(r"[^\d. ]", "", ex.replace(",", ""))
    fin = [f for f in (res.get("financials") or []) if isinstance(f, dict) and f.get("figure") and (re.sub(r"[^\d.]", "", str(f["figure"])).rstrip(".") or "x") in flat][:6]
    ai[item["acc"]] = {"headline": str(res.get("headline") or "")[:120], "what": str(res["what"])[:400], "financials": [{"figure": str(f["figure"])[:40], "context": str(f.get("context", ""))[:90]} for f in fin],
                       "terms": str(res.get("terms") or "")[:500], "risks": [str(x)[:200] for x in (res.get("risks") or [])][:4], "comps": [str(x)[:40] for x in (res.get("comps") or [])][:4],
                       "implications": str(res.get("implications") or "")[:400], "notable": bool(res.get("notable")), "size": res.get("size_usd_b") if isinstance(res.get("size_usd_b"), (int, float)) else None, "model": res.get("_model")}

# ---------- private raises / tenders (news RSS) ----------
GN = "https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q="
PQ = ["raises billion valuation AI startup", "funding round valuation billion", "tender offer employees valuation billion", "secondary share sale valuation billion startup", "confidentially files IPO"]
BIG = re.compile(r"\$\s?\d+(\.\d+)?\s?(billion|bn|B)\b|\b\d+(\.\d+)?\s?billion", re.I)
def private_rounds(cache):
    items = []
    for q in PQ:
        got, _ = news.rss(GN + requests.utils.quote(q + " when:7d"), None, 25); items += got
    now = dt.datetime.now(dt.timezone.utc); seen, its = set(), []
    for it in items:
        k = re.sub(r"\W+", "", it["title"].lower())[:90]
        if k in seen or dt.datetime.fromisoformat(it["date"]) < now - dt.timedelta(days=7): continue
        if not (BIG.search(it["title"]) or re.search(NOTABLE, it["title"], re.I)): continue
        if not re.search(r"rais|funding|valuation|tender|secondary|round|invest|IPO", it["title"], re.I): continue
        seen.add(k); its.append(it)
    sp = os.path.join(cache, "private_clusters.json")
    try: st = json.load(open(sp))
    except Exception: st = {}
    st = {k: v for k, v in st.items() if (now - dt.datetime.fromisoformat(v["last"])).days < 7}
    old = news.WINDOW_H; news.WINDOW_H = 24 * 7
    try: cl = news.cluster(its, st, {})
    finally: news.WINDOW_H = old
    json.dump(cl, open(sp, "w"))
    out = []
    for c in sorted(cl.values(), key=lambda c: (-news.distinct(c), c["last"]), reverse=False):
        srcs = sorted(c["sources"], key=lambda s: s["date"], reverse=True)
        m = BIG.search(" ".join(s["title"] for s in srcs))
        kind = "Tender / secondary" if re.search(r"tender|secondary", " ".join(s["title"] for s in srcs), re.I) else "IPO (confidential)" if re.search(r"confidential", srcs[0]["title"], re.I) else "Private round"
        out.append({"id": "p-" + c["id"], "type": kind, "title": srcs[-1]["title"], "date": c["last"], "first": c["first"], "n": news.distinct(c), "size": m.group(0) if m else None,
                    "notable": bool(re.search(NOTABLE, " ".join(s["title"] for s in srcs), re.I)),
                    "sources": [{"source": s["source"], "title": s["title"], "url": s["url"], "date": s["date"], "paywalled": bool(news.PAYWALL.search(s["source"] or ""))} for s in srcs[:6]]})
    # same company in several clusters (e.g. two Anduril tender headlines) → merge by the notable name or the headline's lead word
    merged = {}
    for x in sorted(out, key=lambda x: -x["n"]):
        m = re.search(NOTABLE, x["title"], re.I); k = (m.group(0).lower() if m else x["title"].split()[0].lower())
        if k in merged:
            y = merged[k]; urls = {s["url"] for s in y["sources"]}
            y["sources"] += [s for s in x["sources"] if s["url"] not in urls]; y["n"] = len({s["source"] for s in y["sources"]}); y["date"] = max(y["date"], x["date"])
        else: merged[k] = x
    out = list(merged.values())
    for x in out:
        m = BIG.search(x["title"]); x["size"] = m.group(0) if m else x["size"]
    out.sort(key=lambda x: (-(x["notable"] * 2 + min(x["n"], 4)), x["date"]), reverse=False)
    return out[:15]

def load_x():
    try: d = json.load(open(os.path.join(ROOT, "data", "x.json"))).get("filings", {})
    except Exception: return {}
    ok = lambda u: isinstance(u, str) and re.match(r"https://(x|twitter)\.com/", u)
    return {k: [{f: p.get(f) for f in ("handle", "name", "text", "url", "likes", "reposts", "ts", "note")} for p in v if ok(p.get("url"))][:8] for k, v in d.items() if isinstance(v, list)}

def build(out_dir, cache, watch=(), names=None):
    t0 = time.time(); names = names or {}; out = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "filings": [], "private": [], "status": {}}
    raw = {}
    if not SEC_UA: out["status"]["sec"] = "skipped (no SEC_USER_AGENT)"
    for typ, forms, q, days, pages in TYPES if SEC_UA else []:
        try:
            for pg in range(pages):
                hits = efts(forms, q, days, pg)
                for h in hits:
                    s = h["_source"]; acc = s.get("adsh"); fn = h["_id"].split(":", 1)[-1]
                    if not acc: continue
                    sics = {int(x) for x in s.get("sics") or [] if str(x).isdigit()}
                    name, tick = clean_name((s.get("display_names") or [""])[0])
                    star = tick in watch or bool(re.search(NOTABLE, name, re.I))
                    if 6770 in sics or not (star or sics & (TECH_SIC - {7389, 6199})): continue  # broad business-services / finance SICs only for known names
                    if typ == "Deal 8-K" and not (tick or star): continue
                    if typ == "Deal 8-K" and not set(s.get("items") or []) & {"1.01", "2.01"}: continue
                    cik = int((s.get("ciks") or ["0"])[0])
                    e = raw.setdefault(acc, {"acc": acc, "type": typ, "form": s.get("form"), "root": (s.get("root_forms") or [forms])[0], "date": s.get("file_date"), "company": name, "ticker": tick, "cik": cik,
                                             "sic": min(sics) if sics else None, "state": (s.get("biz_locations") or [""])[0], "items": s.get("items") or [], "doc": None,
                                             "index": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{acc}-index.htm"})
                    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{fn}"
                    ft = s.get("file_type") or ""
                    if typ == "Deal 8-K" and ft.startswith("EX-99"): e["doc"] = url  # the press release reads best
                    elif not e["doc"] and (ft == s.get("form") or not ft.startswith("EX")): e["doc"] = url
                if len(hits) < 100: break
            out["status"][forms] = "ok"
        except Exception as ex: out["status"][forms] = f"error: {ex}"[:120]; log(forms, ex)
    # one row per company + filing type: keep the latest amendment, remember the first filing date
    by = {}
    for e in sorted(raw.values(), key=lambda e: e["date"]):
        if not e["doc"]: continue
        k = (e["cik"], e["type"]); p = by.get(k)
        by[k] = {**e, "first": p["first"] if p else e["date"], "amendments": (p["amendments"] + 1) if p else 0}
    items = sorted(by.values(), key=lambda e: e["date"], reverse=True)
    ap = os.path.join(cache, "filings_ai.json")
    try: ai = json.load(open(ap))
    except Exception: ai = {}
    pri = lambda e: (bool(re.search(NOTABLE, e["company"], re.I)) or e["ticker"] in watch, e["type"] == "IPO", e["type"].startswith("Merger"), e["date"])
    calls = 0  # <= 3 breakdowns per refresh, cached forever by accession
    for e in sorted(items, key=pri, reverse=True)[:12]:
        if calls >= 3 or llm.remaining("filings", cache) <= 0: break
        if not ai.get(e["acc"]): analyze(e, cache, ai); calls += 1
    json.dump(ai, open(ap, "w"))
    xs = load_x(); keep = []
    for e in items:
        a = ai.get(e["acc"]); notable = bool(re.search(NOTABLE, e["company"], re.I)) or e["ticker"] in watch or bool(a and a.get("notable"))
        if not notable and not (a is None and e["type"] == "IPO" and e["ticker"]): continue  # small / unanalyzed deals drop
        e["ai"] = a; e["notable"] = notable; e["x"] = xs.get(e["acc"], []); e["link"] = e.pop("doc"); keep.append(e)
    out["filings"] = keep[:40]
    try: out["private"] = private_rounds(cache)
    except Exception as ex: log("private failed", ex)
    json.dump(out, open(os.path.join(out_dir, "filings.json"), "w"), separators=(",", ":"))
    # feed the news clusterer: filings become headlines that can merge with press coverage
    nn = []
    for e in keep:
        if e["date"] < (dt.date.today() - dt.timedelta(days=2)).isoformat(): continue
        verb = {"IPO": "files for IPO", "Merger proxy": "files merger proxy", "Merger (S-4)": "files S-4 merger registration", "Deal 8-K": "announces merger agreement (8-K)"}[e["type"]]
        d = dt.datetime.fromisoformat(e["date"]).replace(tzinfo=dt.timezone.utc) + dt.timedelta(hours=21)
        nn.append({"title": f"{e['company']} {verb}" + (f": {e['ai']['headline']}" if e.get("ai") and e["ai"].get("headline") else ""), "url": e["link"], "source": "SEC EDGAR",
                   "date": min(d, dt.datetime.now(dt.timezone.utc)).isoformat(), "desc": (e.get("ai") or {}).get("what", ""), "tickers": [e["ticker"]] if e["ticker"] in watch else []})
    for p in out["private"]:
        if p["notable"] or p["n"] >= 2:
            for s in p["sources"][:3]: nn.append({"title": s["title"], "url": s["url"], "source": s["source"], "date": s["date"], "desc": ""})
    json.dump(nn, open(os.path.join(cache, "filings_news.json"), "w"))
    log(f"{len(raw)} hits -> {len(items)} filings -> {len(keep)} shown ({sum(1 for e in keep if e.get('ai'))} analyzed), {len(out['private'])} private rounds; {round(time.time() - t0)}s")
    return out

if __name__ == "__main__":
    c = os.path.join(ROOT, "data", "cache"); os.makedirs(c, exist_ok=True); build(os.environ.get("OUT_DIR", "/tmp/elx_out"), c)
