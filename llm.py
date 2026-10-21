"""LLM summaries on free tiers only. GitHub Models was retired on 2026-07-30, so this uses a free API key if one is set
as a repo secret: GEMINI_API_KEY (Google AI Studio free tier) or GROQ_API_KEY (Groq free tier). No key -> no calls,
and the app shows its template text. Hard budget <= 120 calls/day (see CAPS), everything cached. Only public data
(headlines, SEC filings) is ever sent -- note free tiers may use inputs to improve their models."""
import json, os, re, time, datetime as dt
import requests

PROVIDERS = [  # first one with a key wins; both are OpenAI-compatible chat endpoints
    {"name": "Gemini (free tier)", "env": "GEMINI_API_KEY", "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
     "fast": os.environ.get("GEMINI_FAST_MODEL", "gemini-3.5-flash-lite"), "news": os.environ.get("GEMINI_FAST_MODEL", "gemini-3.5-flash-lite"), "deep": os.environ.get("GEMINI_DEEP_MODEL", "gemini-3.5-flash"),
     "extra": {"reasoning_effort": "low"}, "min_tokens": 4000},  # thinking tokens count as output, so leave room
    {"name": "Groq (free tier)", "env": "GROQ_API_KEY", "url": "https://api.groq.com/openai/v1/chat/completions",
     "fast": os.environ.get("GROQ_FAST_MODEL", "llama-3.1-8b-instant"), "news": os.environ.get("GROQ_FAST_MODEL", "llama-3.1-8b-instant"), "deep": os.environ.get("GROQ_DEEP_MODEL", "llama-3.3-70b-versatile"), "extra": {}, "min_tokens": 0},
]
# Our own daily caps (calls/day per role), set well under Gemini's free tier. Google no longer publishes free-tier
# numbers; measured per project (and confirmed by our own 429 bodies): Flash 5 RPM / 20 RPD, Flash-Lite 15 RPM / 500 RPD.
# 40 + 20 + 60 + 60 = 180/day max, about a third of Flash-Lite's daily allowance. Flash's 20/day is shared by every role,
# so once it 429s we route straight to Flash-Lite for the rest of the (Pacific) day.
CAPS = {"fast": 40, "deep": 20, "pod": 60, "news": 60}
RPM = {"flash-lite": 15, "flash": 5}   # per-model requests/minute on the free tier; we pace a bit under these
STATE = {"calls": 0, "errors": [], "skipped": 0, "fallbacks": 0, "limits": []}
_LAST = {}

def provider():
    for p in PROVIDERS:
        if os.environ.get(p["env"], "").strip(): return p
    return None

def _today():  # Gemini's daily quotas reset at midnight Pacific
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception: return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=8)).date().isoformat()

def _budget_path(cache): return os.path.join(cache, "llm_budget.json")

def _budget(cache):
    today = _today()
    try: b = json.load(open(_budget_path(cache)))
    except Exception: b = {}
    if b.get("date") != today or any(k not in CAPS for k in b.get("used", {})): b = {"date": today, "used": {}, "exhausted": []}
    b.setdefault("exhausted", [])
    return b

def _save(b, cache): json.dump(b, open(_budget_path(cache), "w"))

def _pace(model):
    rpm = RPM["flash-lite"] if "lite" in model else RPM["flash"] if "flash" in model else 30
    gap = 60 / rpm + 0.5
    wait = _LAST.get(model, 0) + gap - time.time()
    if wait > 0: time.sleep(wait)
    _LAST[model] = time.time()

def _quota(r):
    """-> ('day'|'minute'|None, retry seconds) from a 429 body's QuotaFailure/RetryInfo."""
    try: det = (r.json()[0] if isinstance(r.json(), list) else r.json())["error"].get("details", [])
    except Exception: return None, 0
    kind, delay = None, 0
    for d in det:
        for v in d.get("violations", []):
            q = v.get("quotaId", "")
            if "PerDay" in q: kind = "day"
            elif "PerMinute" in q and kind != "day": kind = "minute"
        if "retryDelay" in d:
            try: delay = float(str(d["retryDelay"]).rstrip("s"))
            except ValueError: pass
    return kind, delay

def remaining(role, cache): return CAPS.get(role, 0) - _budget(cache)["used"].get(role, 0)

def call(role, system, user, cache, max_tokens=900):
    p = provider()
    if not p: STATE["skipped"] += 1; return None
    b = _budget(cache)
    if b["used"].get(role, 0) >= CAPS.get(role, 0): STATE["skipped"] += 1; return None
    b["used"][role] = b["used"].get(role, 0) + 1; _save(b, cache)  # count attempts, not just successes
    models = [p.get(role) or p["deep"]]
    if models[0] != p["fast"]: models.append(p["fast"])  # Flash-Lite is the fallback for anything heavier
    models = [m for m in models if m not in b["exhausted"]] or []
    if not models: STATE["skipped"] += 1; return None
    for mi, model in enumerate(models):
        last = mi == len(models) - 1
        for attempt in range(3):
            try:
                _pace(model)
                r = requests.post(p["url"], timeout=180, headers={"Authorization": f"Bearer {os.environ[p['env']].strip()}", "Content-Type": "application/json"},
                                  json={"model": model, "temperature": 0.2, "max_tokens": max(max_tokens, p.get("min_tokens", 0)), "response_format": {"type": "json_object"},
                                        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], **p.get("extra", {})})
                STATE["calls"] += 1
                if r.status_code == 429:
                    kind, delay = _quota(r)
                    if kind == "day":  # this model is done for the day: remember it and move on, no waiting
                        b = _budget(cache); b["exhausted"] = sorted(set(b["exhausted"]) | {model}); _save(b, cache)
                        STATE["limits"].append(f"{model}: daily free quota reached"); break
                    if last and attempt < 2 and delay <= 60: time.sleep(max(delay, 5)); continue  # per-minute limit on the last model: short wait
                    STATE["limits"].append(f"{model}: 429 {kind or ''}".strip()); break
                if r.status_code in (500, 503):
                    if last and attempt < 2: time.sleep(5); continue  # overloaded: only the final fallback is worth retrying
                    STATE["errors"].append(f"{model} HTTP {r.status_code}"); break
                if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
                    STATE["errors"].append(f"{model} HTTP {r.status_code}: {r.text[:160]}"); break
                txt = r.json()["choices"][0]["message"]["content"] or ""
                m = re.search(r"\{.*\}", txt, re.S)
                out = json.loads(m.group(0) if m else txt)
                if isinstance(out, dict):
                    out["_model"] = model
                    if mi: STATE["fallbacks"] += 1
                    return out
                break
            except Exception as e:
                STATE["errors"].append(f"{model} {type(e).__name__}: {str(e)[:160]}"); break
    return None

def usage(cache): return _budget(cache)["used"]

# ---------- why it moved ----------
WHY_SYS = """You explain single-day stock moves for a junior investment banker covering software and semiconductors.
Use ONLY the numbered sources given for each ticker (news headlines and SEC filings). Never invent facts, numbers, analysts or events.
If no source plausibly explains the move, say the headlines don't show a clear company-specific catalyst and, if the sector ETF moved similarly, that it looks sector-driven.
Hedge causal claims ("likely", "appears") because headlines are not proof. 2-3 short plain-English sentences per ticker, cite sources inline like [1].
Return JSON: {"TICKER": {"why": str, "sources": [int], "confidence": "high"|"medium"|"low"}}."""

def why_batch(items, cache):
    """items: list of dicts {ticker,name,pct,bench,benchPct,r5,sources:[{n,title,source,date,url}]}"""
    lines = []
    for it in items:
        lines.append(f"## {it['ticker']} ({it['name']}): {it['pct']:+.2f}% last session"
                     + (f"; {it['bench']} {it['benchPct']:+.2f}%" if it.get('benchPct') is not None else "")
                     + (f"; 5-day {it['r5']:+.2f}%" if it.get('r5') is not None else ""))
        for s in it["sources"]: lines.append(f"[{s['n']}] {s['title']} — {s['source']}, {s['date']}")
        if not it["sources"]: lines.append("(no sources)")
    return call("fast", WHY_SYS, "\n".join(lines), cache, max_tokens=250 * len(items))

# ---------- earnings deep dive ----------
EARN_SYS = """You are a senior equity capital markets / M&A banker covering software and semiconductors, briefing a junior banker.
You get an earnings press release (SEC 8-K exhibit 99.1), possibly truncated. Use ONLY facts in the text; quote numbers exactly as written; never invent figures, consensus or stock moves.
Return JSON with keys:
 "headline": one sentence on the quarter,
 "takeaways": 3-5 short bullets (what matters most: growth, margins, segments, AI/data-center, bookings/RPO),
 "filing_says": 3-5 bullets of specific facts with numbers from the release,
 "guidance": one or two sentences on outlook/guidance if stated, else "No guidance in the release.",
 "banker": 3 bullets on implications for a software/semis banker (M&A appetite or currency, ECM/converts/buybacks, comps and read-across to peers),
 "questions": 2 questions to ask on the call or in diligence."""

def earnings_deep(ticker, name, fq, text, cache):
    user = f"Company: {name} ({ticker}). Fiscal quarter ending: {fq}.\n\nPRESS RELEASE TEXT:\n{text}"
    return call("deep", EARN_SYS, user, cache, max_tokens=1100)
