"""Concept glossary ('tap to understand'). Each concept is generated ONCE (Gemini free tier) and reused everywhere.
data/concepts.json (committed) holds the seed set; refreshes add at most NEW_PER_RUN terms that the news/podcast AI flagged
(its 'cx' context lines) into data/cache/concepts_new.json. Output: <out>/concepts.json = seed + additions.
Usage offline: python3 concepts.py seed   (batched, 8 terms per call)"""
import json, os, re, sys, datetime as dt
import llm

ROOT = os.path.dirname(os.path.abspath(__file__))
SEED_PATH = os.path.join(ROOT, "data", "concepts.json")
NEW_PER_RUN = 3      # new terms per refresh (deep level)
UPGRADE_PER_RUN = 4  # shallow v1 terms upgraded to deep v2 per refresh (2 calls)
PER_CALL = 2         # 2 terms per call keeps each answer long and specific
V = 2
def log(*a): print("[concepts]", *a, file=sys.stderr, flush=True)

# term, aliases (matched client-side, whole words; ALL-CAPS aliases are case-sensitive)
SEED = [
 ("Neocloud", ["neoclouds", "neo-cloud", "GPU cloud", "GPU clouds"]), ("Quantum computing", ["quantum computer", "quantum computers", "qubit", "qubits"]),
 ("Encryption", ["encrypted", "end-to-end encryption", "post-quantum cryptography"]), ("HBM", ["high-bandwidth memory", "HBM3E", "HBM4"]),
 ("CoWoS", ["advanced packaging", "chip-on-wafer-on-substrate"]), ("Inference vs training", ["AI inference", "model training", "training compute"]),
 ("TPU / custom ASIC", ["TPU", "TPUs", "ASIC", "ASICs", "custom silicon", "custom chips", "XPU"]), ("GPU", ["GPUs", "graphics processing unit"]),
 ("Hyperscaler capex", ["hyperscaler", "hyperscalers", "capital expenditures", "AI capex"]), ("Data center power", ["power constraints", "gigawatt", "gigawatts", "GW of capacity"]),
 ("Foundry", ["foundries", "fabs", "wafer fab"]), ("Process node", ["2nm", "3nm", "18A", "A16", "leading-edge node"]),
 ("Export controls", ["export restrictions", "chip export", "entity list"]), ("Large language model", ["LLM", "LLMs", "foundation model", "frontier model", "frontier models"]),
 ("AI agents", ["agentic", "agentic AI", "AI agent"]), ("Tokens (AI)", ["token usage", "tokens per second"]),
 ("ARR", ["annual recurring revenue", "run-rate revenue", "revenue run rate"]), ("NRR", ["net revenue retention", "net dollar retention", "NDR"]),
 ("Rule of 40", []), ("RPO", ["remaining performance obligations", "cRPO"]), ("Gross margin", ["gross margins"]),
 ("Free cash flow", ["FCF", "free-cash-flow"]), ("EV/Revenue multiple", ["EV/Sales", "revenue multiple", "EV/NTM revenue", "valuation multiple"]),
 ("Guidance", ["raised guidance", "cut guidance"]), ("SaaS", ["software-as-a-service", "subscription software"]),
 ("Seat-based pricing", ["per-seat pricing", "usage-based pricing", "consumption pricing"]), ("Dual-class shares", ["dual-class", "dual class", "super-voting"]),
 ("Tender offer", ["employee tender"]), ("Secondary sale", ["secondary offering", "secondaries", "secondary shares"]),
 ("Convertible notes", ["convertibles", "convertible bond", "convertible senior notes"]), ("Take-private", ["take private", "taken private", "go-private"]),
 ("Leveraged buyout", ["LBO", "LBOs", "private equity buyout"]), ("IPO", ["initial public offering", "public listing", "IPOs"]),
 ("Direct listing", []), ("SPAC", ["SPACs", "blank-check company", "de-SPAC"]), ("S-1", ["registration statement", "S-1 filing", "F-1"]),
 ("Lock-up period", ["lockup", "lock-up"]), ("Merger arbitrage", ["merger arb", "deal spread"]), ("Antitrust review", ["antitrust", "CFIUS"]),
 ("Termination fee", ["breakup fee", "break fee", "reverse termination fee"]), ("Accretion / dilution", ["accretive", "dilutive", "EPS accretion"]),
 ("Share buyback", ["buybacks", "repurchase program", "share repurchase"]), ("Tariffs", ["tariff"]),
 ("Rate cuts", ["rate cut", "Fed cut", "easing cycle", "fed funds rate"]), ("10-year Treasury yield", ["10-year yield", "Treasury yields", "bond yields"]),
 ("Private credit", ["direct lending", "private lenders"]), ("Market cap", ["market capitalization"]),
 ("Valuation (private round)", ["post-money", "pre-money", "funding round", "Series A", "Series B", "Series C"]),
 ("Stablecoin", ["stablecoins", "USDC", "USDT"]), ("Ad tech", ["programmatic advertising", "ad-tech", "CTV advertising"]),
]

SYS = """You write the deep glossary of a junior tech investment banker (coverage: software, semiconductors, AI, internet; products: M&A, IPOs/ECM, converts, leveraged finance).
He is smart but new: he needs the quick plain take first, then real depth that a senior analyst would respect. Be specific: name real companies,
real products, real mechanisms and real turning points. Avoid generic filler ("plays a crucial role", "is increasingly important").

For each term return a JSON object keyed by the exact term:
"def": the quick plain take, high-school level, 2-3 sentences, one concrete analogy,
"how": a one-line mechanism,
"why": {"job": "1 sentence: why it shows up in his deals or models", "industry": "1 sentence", "economy": "1 sentence"},
"related": [4-6 short concept names],
"deep": {
 "works": "how it actually works, 5-8 sentences: the components, the mechanics step by step, the key technical trade-offs and constraints",
 "tech": "what it enables, 4-6 sentences: which products and business models depend on it, and who pays whom",
 "players": [8-12 entries across the value chain: {"name", "ticker": NYSE/Nasdaq ticker only, else null (e.g. Thales is Euronext-listed -> null, "private": false), "private": true/false, "role": "supplies|builds|buys|enables", "pos": "market position in <= 16 words: share, moat or niche"}], with at least 2 private companies where relevant,
 "history": "origins -> key turning points -> today, 4-6 sentences with approximate years",
 "outlook": "3-5 year view, 4-6 sentences: catalysts, the open debates (state both sides), the main risks",
 "value": "value creation and destruction, 4-6 sentences: who captures the margin pool, who gets disrupted, what it does to growth, margins and valuation multiples",
 "banker": {"deals": "2-4 sentences on recent deal themes (M&A, IPOs, financing) and why they happen", "clients": ["3 things clients ask about"], "ask": ["3 sharp questions to ask a client or management team"]},
 "metrics": [3-5 {"figure": "approximate, well-established, with '~' and a year, e.g. '~$100B (2024)'", "context": "what it measures"}]}.

Example of the depth expected (an excerpt for "HBM"; your answers should be at least this specific):
"works": "HBM stacks 8-16 DRAM dies vertically, connects them with thousands of through-silicon vias, and places the stack next to the GPU on a silicon interposer, giving a 1,024-bit-wide interface instead of DDR's 64 bits. That width, not clock speed, delivers terabytes per second of bandwidth per stack. The hard parts are yield (one bad die can scrap a stack), thermal limits and bonding: SK hynix's MR-MUF versus the TC-NCF approach used by others, with hybrid bonding next. Because it is packaged with the accelerator via CoWoS-style packaging, HBM supply is tied to advanced-packaging capacity.",
"value": "HBM turned DRAM, historically a commodity with brutal cycles, into a partly contracted, premium product: suppliers pre-sell capacity a year ahead and earn several times the margin of standard DRAM. SK hynix captured early share and re-rated, while laggards lost share at the most profitable node. The risk is the classic memory cycle: if capacity additions overshoot AI demand, pricing power could fade."

Accuracy rules: only well-established facts; numbers must be approximate with '~' and a year; if unsure of a figure, leave it out rather than invent it.
Return {"<term>": {...}, ...} for every term."""

def cid(term): return re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")

def _s(x, n): return str(x or "").strip()[:n]

def _clean(term, aliases, r, model):
    w = r.get("why") if isinstance(r.get("why"), dict) else {}
    d = r.get("deep") if isinstance(r.get("deep"), dict) else {}
    b = d.get("banker") if isinstance(d.get("banker"), dict) else {}
    pl, seen = [], set()
    for x in (d.get("players") or []):
        if not isinstance(x, dict) or not x.get("name"): continue
        nm = _s(x.get("name"), 40); k = re.split(r"[\s/(]", nm.lower())[0]
        if k in seen: continue
        seen.add(k); tk = _s(x.get("ticker"), 6).upper()
        pl.append({"name": nm, "ticker": tk if re.fullmatch(r"[A-Z]{1,5}", tk) else None, "private": bool(x.get("private")),
                   "role": _s(x.get("role"), 10).lower() if _s(x.get("role"), 10).lower() in ("supplies", "builds", "buys", "enables") else "", "pos": _s(x.get("pos"), 130)})
    pl = pl[:12]
    deep = {"works": _s(d.get("works"), 1400), "tech": _s(d.get("tech"), 1000), "players": pl, "history": _s(d.get("history"), 1200), "outlook": _s(d.get("outlook"), 1200),
            "value": _s(d.get("value"), 1200), "banker": {"deals": _s(b.get("deals"), 900), "clients": [_s(x, 200) for x in (b.get("clients") or [])][:3], "ask": [_s(x, 200) for x in (b.get("ask") or [])][:3]},
            "metrics": [{"figure": _s(x.get("figure"), 40), "context": _s(x.get("context"), 100)} for x in (d.get("metrics") or []) if isinstance(x, dict) and x.get("figure") and "~" in str(x.get("figure")) + str(x.get("context"))][:5]}
    ok = len(deep["works"]) >= 400 and len(deep["value"]) >= 250 and len(pl) >= 6 and len(deep["metrics"]) >= 2 and deep["history"] and deep["outlook"]
    if not ok: log("depth gate failed", term, len(deep["works"]), len(deep["value"]), len(pl), len(deep["metrics"])); return None  # stays shallow, retried next run
    return {"term": term, "aliases": aliases, "def": _s(r.get("def"), 600), "how": _s(r.get("how"), 400),
            "why": {k: _s(w.get(k), 260) for k in ("job", "industry", "economy")},
            "players": [p["ticker"] or p["name"] for p in pl][:5], "related": [_s(x, 40) for x in (r.get("related") or [])][:6],
            "deep": deep, "v": V, "model": model, "at": dt.date.today().isoformat()}

def generate(terms, cache, role, fallback=True):
    """terms: [(term, aliases)] -> {id: concept}; one Gemini call per PER_CALL terms."""
    out = {}
    for i in range(0, len(terms), PER_CALL):
        batch = terms[i:i + PER_CALL]
        msg = "Terms:\n" + "\n".join(f"- {t}" + (f" (also: {', '.join(a[:3])})" if a else "") for t, a in batch)
        res = llm.call(role, SYS, msg, cache, max_tokens=3200 * len(batch), fallback=fallback)
        if not isinstance(res, dict): log("batch failed", [t for t, _ in batch]); break  # quota / outage: stop, retry next run
        low = {k.lower(): v for k, v in res.items() if isinstance(v, dict)}
        for t, a in batch:
            r = low.get(t.lower())
            c = _clean(t, a, r, res.get("_model")) if r and r.get("def") else None
            if c: out[cid(t)] = c
    return out

ORDER = {}  # upgrade in seed order (the terms Sal named first)

def load(path):
    try: return json.load(open(path)).get("concepts", {})
    except Exception: return {}

def known(cs):
    k = set()
    for c in cs.values(): k |= {c["term"].lower(), *[a.lower() for a in c["aliases"]]}
    return k

def build(out_dir, cache, items=(), pods=None):
    seed = load(SEED_PATH); np_ = os.path.join(cache, "concepts_new.json"); new = load(np_)
    allc = {**seed, **new}
    for i, c in seed.items():  # curated aliases / match flags in the committed seed always win
        allc[i] = {**allc[i], "aliases": c.get("aliases", []), "match": c.get("match", True)}
    have = known(allc)
    # candidates = terms the summarizers flagged in context lines but the glossary lacks
    cnt = {}
    srcs = [x for it in items for x in (it.get("cx") or []) + ((it.get("dev") or {}).get("cx") or [])]
    for e in (pods or {}).get("episodes", []): srcs += ((e.get("summary") or {}).get("concepts") or [])
    for x in srcs:
        t = re.sub(r"\s+", " ", str(x.get("term") or "")).strip()
        if 2 <= len(t) <= 40 and t.lower() not in have and t.lower().rstrip("s") not in have: cnt[t] = cnt.get(t, 0) + 1
    todo = [t for t, _ in sorted(cnt.items(), key=lambda kv: -kv[1])][:NEW_PER_RUN]
    # Flash only; Flash-Lite is allowed only once Flash has been unavailable for 24h+ (tracked in the cache)
    sp = os.path.join(cache, "concepts_state.json")
    try: st = json.load(open(sp))
    except Exception: st = {}
    now = dt.datetime.now(dt.timezone.utc)
    if llm.available("concepts", cache): st.pop("flash_out_since", None)
    else: st.setdefault("flash_out_since", now.isoformat())
    lite_ok = bool(st.get("flash_out_since")) and (now - dt.datetime.fromisoformat(st["flash_out_since"])).total_seconds() > 86400
    can = llm.available("concepts", cache) or lite_ok
    if todo and can and llm.remaining("concepts", cache) > 0:
        add = generate([(t, []) for t in todo], cache, "concepts", fallback=lite_ok)
        new.update(add); allc.update(add)
        log(f"added {len(add)}: {', '.join(c['term'] for c in add.values())}")
    up = [(c["term"], c["aliases"]) for i, c in sorted(allc.items(), key=lambda kv: ORDER.get(kv[0], 999)) if c.get("v", 1) < V or ("lite" in str(c.get("model")) and llm.available("concepts", cache))][:UPGRADE_PER_RUN]
    if up and can and llm.remaining("concepts", cache) > 0:
        got = generate(up, cache, "concepts", fallback=lite_ok)
        for i, c in got.items():
            c["aliases"] = allc.get(i, {}).get("aliases", c["aliases"]); c["match"] = allc.get(i, {}).get("match", True)
        new.update(got); allc.update(got); log(f"upgraded {len(got)} to deep: {', '.join(c['term'] for c in got.values())}")
    json.dump({"concepts": new}, open(np_, "w")); json.dump(st, open(sp, "w"))
    json.dump({"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "concepts": allc}, open(os.path.join(out_dir, "concepts.json"), "w"), separators=(",", ":"))
    nd = sum(1 for c in allc.values() if c.get("v", 1) >= V)
    log(f"{len(allc)} concepts, {nd} deep, {len(allc) - nd} queued for deep; {len(cnt)} unknown flagged terms; flash {'ok' if llm.available('concepts', cache) else 'out'}")

if __name__ == "__main__" and sys.argv[1:] == ["seed"]:
    ORDER.update({cid(t): i for i, (t, _) in enumerate(SEED)})
    cur = load(SEED_PATH); os.makedirs("/tmp/concepts_seed", exist_ok=True)
    todo = [(t, cur.get(cid(t), {}).get("aliases", a)) for t, a in SEED if cur.get(cid(t), {}).get("v", 1) < V]
    for i in range(0, len(todo), PER_CALL):  # save after every batch so an interruption loses nothing
        got = generate(todo[i:i + PER_CALL], "/tmp/concepts_seed", "concepts", fallback=False)
        for k, c in got.items(): cur[k] = {**c, "aliases": cur.get(k, {}).get("aliases", c["aliases"]), "match": cur.get(k, {}).get("match", True)}
        json.dump({"concepts": cur}, open(SEED_PATH, "w"), indent=1, ensure_ascii=False)
        print(i + len(got), "/", len(todo), {k: c["model"] for k, c in got.items()}, flush=True)

ORDER.update({cid(t): i for i, (t, _) in enumerate(SEED)})
