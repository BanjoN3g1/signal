"""Concept glossary ('tap to understand'). Each concept is generated ONCE (Gemini free tier) and reused everywhere.
data/concepts.json (committed) holds the seed set; refreshes add at most NEW_PER_RUN terms that the news/podcast AI flagged
(its 'cx' context lines) into data/cache/concepts_new.json. Output: <out>/concepts.json = seed + additions.
Usage offline: python3 concepts.py seed   (batched, 8 terms per call)"""
import json, os, re, sys, datetime as dt
import llm

ROOT = os.path.dirname(os.path.abspath(__file__))
SEED_PATH = os.path.join(ROOT, "data", "concepts.json")
NEW_PER_RUN = 4
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

SYS = """You are building a personal glossary for a junior investment banker (tech: software, semiconductors, AI, internet; M&A and ECM).
For each term return a JSON object keyed by the exact term. Fields:
"def": what it is, at a high-school level, 2-3 sentences (a simple analogy is welcome),
"how": how it works, simply (1-2 sentences),
"why": {"job": "why a tech banker cares: deal flow, valuation, comps, financing (1 sentence)", "industry": "what it changes for the tech industry (1 sentence)", "economy": "link to the wider economy or markets (1 sentence)"},
"players": [up to 5 key companies, using a US ticker when listed, e.g. "NVDA", "TSM", or a name like "OpenAI"],
"related": [3-5 other short concept names],
"deeper": "a 'go deeper' paragraph, 3-5 sentences, with the nuance or debate a sharp analyst would add".
Be accurate and neutral; do not cite specific recent numbers or dates you are unsure of. Return {"<term>": {...}, ...} for every term."""

def cid(term): return re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")

def _clean(term, aliases, r, model):
    w = r.get("why") if isinstance(r.get("why"), dict) else {}
    return {"term": term, "aliases": aliases, "def": str(r.get("def") or "")[:600], "how": str(r.get("how") or "")[:400],
            "why": {k: str(w.get(k) or "")[:260] for k in ("job", "industry", "economy")},
            "players": [str(x)[:30] for x in (r.get("players") or [])][:5], "related": [str(x)[:40] for x in (r.get("related") or [])][:5],
            "deeper": str(r.get("deeper") or "")[:900], "model": model, "at": dt.date.today().isoformat()}

def generate(terms, cache, role):
    """terms: [(term, aliases)] -> {id: concept}; one call per <= 8 terms."""
    out = {}
    for i in range(0, len(terms), 8):
        batch = terms[i:i + 8]
        res = llm.call(role, SYS, "Terms:\n" + "\n".join(f"- {t}" + (f" (also: {', '.join(a[:3])})" if a else "") for t, a in batch), cache, max_tokens=900 * len(batch))
        if not isinstance(res, dict): log("batch failed", [t for t, _ in batch]); continue
        low = {k.lower(): v for k, v in res.items() if isinstance(v, dict)}
        for t, a in batch:
            r = low.get(t.lower())
            if r and r.get("def"): out[cid(t)] = _clean(t, a, r, res.get("_model"))
    return out

def load(path):
    try: return json.load(open(path)).get("concepts", {})
    except Exception: return {}

def known(cs):
    k = set()
    for c in cs.values(): k |= {c["term"].lower(), *[a.lower() for a in c["aliases"]]}
    return k

def build(out_dir, cache, items=(), pods=None):
    seed = load(SEED_PATH); np_ = os.path.join(cache, "concepts_new.json"); new = load(np_)
    allc = {**seed, **new}; have = known(allc)
    # candidates = terms the summarizers flagged in context lines but the glossary lacks
    cnt = {}
    srcs = [x for it in items for x in (it.get("cx") or []) + ((it.get("dev") or {}).get("cx") or [])]
    for e in (pods or {}).get("episodes", []): srcs += ((e.get("summary") or {}).get("concepts") or [])
    for x in srcs:
        t = re.sub(r"\s+", " ", str(x.get("term") or "")).strip()
        if 2 <= len(t) <= 40 and t.lower() not in have and t.lower().rstrip("s") not in have: cnt[t] = cnt.get(t, 0) + 1
    todo = [t for t, _ in sorted(cnt.items(), key=lambda kv: -kv[1])][:NEW_PER_RUN]
    if todo and llm.remaining("concepts", cache) > 0:
        add = generate([(t, []) for t in todo], cache, "concepts")
        new.update(add); json.dump({"concepts": new}, open(np_, "w")); allc.update(add)
        log(f"added {len(add)}: {', '.join(c['term'] for c in add.values())}")
    json.dump({"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "concepts": allc}, open(os.path.join(out_dir, "concepts.json"), "w"), separators=(",", ":"))
    log(f"{len(allc)} concepts ({len(seed)} seed, {len(new)} added); {len(cnt)} unknown flagged terms")

if __name__ == "__main__" and sys.argv[1:] == ["seed"]:
    cur = load(SEED_PATH); todo = [(t, a) for t, a in SEED if cid(t) not in cur]
    got = generate(todo, "/tmp/concepts_seed", "deep")
    for t, a in SEED:  # aliases are curated here, so refresh them even on existing entries
        if cid(t) in got: cur[cid(t)] = got[cid(t)]
        elif cid(t) in cur: cur[cid(t)]["aliases"] = a
    os.makedirs(os.path.dirname(SEED_PATH), exist_ok=True)
    json.dump({"concepts": cur}, open(SEED_PATH, "w"), indent=1, ensure_ascii=False)
    print(len(cur), "concepts;", len(todo) - len(got), "failed")
