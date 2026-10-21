"""LLM summaries via GitHub Models (free tier, GITHUB_TOKEN with models:read from Actions).
Hard budget: <= 25 calls/day total, everything cached; returns None on any failure so callers fall back to templates.
Only fetched public data (headlines, SEC filings) is ever sent."""
import json, os, re, time, datetime as dt
import requests

URL = "https://models.github.ai/inference/chat/completions"
CAPS = {"openai/gpt-4.1-mini": 15, "openai/gpt-4.1": 8}  # per day; free tier is 150 (low) / 50 (high)
STATE = {"calls": 0, "errors": [], "skipped": 0}

def _budget_path(cache): return os.path.join(cache, "llm_budget.json")

def _budget(cache):
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    try: b = json.load(open(_budget_path(cache)))
    except Exception: b = {}
    if b.get("date") != today: b = {"date": today, "used": {}}
    return b

def call(model, system, user, cache, max_tokens=900):
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok: STATE["skipped"] += 1; return None
    b = _budget(cache)
    if b["used"].get(model, 0) >= CAPS.get(model, 0): STATE["skipped"] += 1; return None
    b["used"][model] = b["used"].get(model, 0) + 1; json.dump(b, open(_budget_path(cache), "w"))  # count attempts, not just successes
    try:
        r = requests.post(URL, timeout=90, headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "Accept": "application/vnd.github+json"},
                          json={"model": model, "temperature": 0.2, "max_tokens": max_tokens, "response_format": {"type": "json_object"},
                                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
        STATE["calls"] += 1
        if r.status_code != 200:
            STATE["errors"].append(f"{model} HTTP {r.status_code}: {r.text[:160]}"); return None
        txt = r.json()["choices"][0]["message"]["content"]
        return json.loads(re.sub(r"^```(json)?|```$", "", txt.strip()))
    except Exception as e:
        STATE["errors"].append(f"{model} {type(e).__name__}: {str(e)[:160]}"); return None

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
    return call("openai/gpt-4.1-mini", WHY_SYS, "\n".join(lines), cache, max_tokens=250 * len(items))

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
    return call("openai/gpt-4.1", EARN_SYS, user, cache, max_tokens=1100)
