"""'What moved the forecast and why', plus the paper book. Both are rebuilt from daily snapshots every run (no extra state).

Attribution: each race's model margin is  mu = w·poll + (1−w)·prior,  prior = rw·ratings + (1−rw)·(2024 base + el·swing + incumbency).
Between two snapshots we swap inputs in one at a time (national environment → expert ratings → polls) to split each race's
margin change into those three causes, then translate the race's win-probability change into the contest
(Δ control ≈ Σ (P(control | D wins race) − P(control | R wins race)) × Δ P(D wins race)), sharing it across causes in proportion.

Paper book: whenever the model and the market disagree by 10+ pts on a race (or on control), buy $100 of the side the model
likes at the market price (daily close). Mark to market every run; settle at resolution. Closing-line value (CLV) = how far the
market has since moved toward us, in price points. Hypothetical only: fees, slippage and position limits are ignored."""
import json, os, datetime as dt

def log(*a): print("[why]", *a, flush=True)
def _load(p, d=None):
    try: return json.load(open(p))
    except Exception: return d

FIELDS = ("base", "el", "inc", "rw", "rm", "poll", "w", "model", "mkt")
def mu_of(v, sw):
    base, el, inc, rw, rm, poll, w = (v.get(k) for k in ("base", "el", "inc", "rw", "rm", "poll", "w"))
    fund = base + el * sw + (inc or 0) if base is not None else None
    prior = (rw * rm + (1 - rw) * fund) if fund is not None and rm is not None else (fund if fund is not None else rm)
    if prior is None: return poll
    return w * poll + (1 - w) * prior if poll is not None else prior

def snapshot(eid, M, P, cache):
    """Latest-of-day inputs, kept 45 days."""
    p = os.path.join(cache, f"inputs_{eid}.json"); S = _load(p, {})
    day = dt.datetime.now(dt.timezone.utc).date().isoformat()
    S[day] = {"sw": M["env"]["swing"], "races": {i: {"base": x.get("base"), "el": P["elast"][x["type"]], "inc": x.get("inc") or 0, "rw": x.get("raterW") or 0,
                                                      "rm": x.get("raterMargin"), "poll": x.get("poll"), "w": x.get("w") or 0, "model": x.get("model"), "mkt": x.get("mkt"),
                                                      "title": x.get("title"), "type": x["type"]} for i, x in M["races"].items() if x["type"] != "president" or (x.get("leverage") or 0) > 0},
              "contests": {k: [v.get("pControl"), v.get("market")] for k, v in M["contests"].items()}}
    S = {d: v for d, v in S.items() if (dt.date.fromisoformat(day) - dt.date.fromisoformat(d)).days <= 45}
    try: json.dump(S, open(p, "w"))
    except Exception as e: log("snapshot write", e)
    return S, day

def attribute(S, day, M, back):
    """Compare today with the latest snapshot >= `back` days old (1 = since yesterday, 7 = this week)."""
    cands = [d for d in S if (dt.date.fromisoformat(day) - dt.date.fromisoformat(d)).days >= back]
    if not cands: return None
    y = S[max(cands)] if back == 1 else S[min(cands, key=lambda d: abs((dt.date.fromisoformat(day) - dt.date.fromisoformat(d)).days - back))]
    since = max(cands) if back == 1 else min(cands, key=lambda d: abs((dt.date.fromisoformat(day) - dt.date.fromisoformat(d)).days - back))
    t = S[day]; out = {"since": since, "contests": {}}
    for cid, c in M["contests"].items():
        if c.get("pControl") is None or cid not in y["contests"] or y["contests"][cid][0] is None: continue
        rows, tot = [], {"national": 0.0, "polls": 0.0, "ratings": 0.0}
        for i, x in M["races"].items():
            if x.get("contest") != cid or i not in y["races"] or i not in t["races"]: continue
            a, b = y["races"][i], t["races"][i]
            if a.get("model") is None or b.get("model") is None: continue
            m0 = mu_of(a, y["sw"]); m1 = mu_of(a, t["sw"])
            m2 = mu_of({**a, "rm": b["rm"], "rw": b["rw"], "inc": b["inc"]}, t["sw"]); m3 = mu_of(b, t["sw"])
            if None in (m0, m1, m2, m3): continue
            parts = {"national": m1 - m0, "ratings": m2 - m1, "polls": m3 - m2}
            dp = b["model"] - a["model"]; cd = x.get("cond") or {}
            if cd.get("ifD") is None or cd.get("ifR") is None: continue
            contrib = (cd["ifD"] - cd["ifR"]) * dp
            dmu = sum(parts.values())
            share = {k: (v / dmu if abs(dmu) > .05 else 0) for k, v in parts.items()}
            f = {k: contrib * share[k] for k in parts}
            for k in tot: tot[k] += f[k]
            if abs(contrib) >= .002 or abs(dp) >= .02:
                rows.append({"id": i, "title": x.get("title"), "dp": round(dp, 3), "contrib": round(contrib, 3), "dmu": round(dmu, 2),
                             "parts": {k: round(v, 2) for k, v in parts.items()}, "factors": {k: round(v, 3) for k, v in f.items()}})
        d = c["pControl"] - y["contests"][cid][0]
        mk0, mk1 = y["contests"][cid][1], c.get("market")
        sm = sum(tot.values())   # first-order terms overshoot when many races move together: rescale to the actual change
        if abs(sm) > .003 and sm * d > 0:
            k = d / sm; tot = {a: v * k for a, v in tot.items()}
            for r in rows: r["contrib"] = round(r["contrib"] * k, 3); r["factors"] = {a: round(v * k, 3) for a, v in r["factors"].items()}
        rows.sort(key=lambda r: -abs(r["contrib"]))
        out["contests"][cid] = {"label": c.get("label", cid), "from": y["contests"][cid][0], "to": c["pControl"], "d": round(d, 3),
                                "mktFrom": mk0, "mktTo": mk1, "factors": {k: round(v, 3) for k, v in tot.items()},
                                "other": round(d - sum(tot.values()), 3), "races": rows[:8], "text": summary(c.get("label", cid), y["contests"][cid][0], c["pControl"], tot, rows, mk0, mk1, since)}
    return out

def summary(lab, a, b, tot, rows, mk0, mk1, since):
    pts = lambda v: f"{'+' if v >= 0 else '−'}{abs(v * 100):.1f}"
    d = b - a
    s = f"{lab} {round(a * 100)}% → {round(b * 100)}% ({pts(d)} pts) since {dt.date.fromisoformat(since).strftime('%b %-d')}"
    if abs(d) < .005: return s + ": no material change."
    big = [(k, v) for k, v in sorted(tot.items(), key=lambda kv: -abs(kv[1])) if abs(v) >= .003]
    nm = {"polls": "new polls", "national": "national environment", "ratings": "expert ratings"}
    def lead(k):
        if k == "national": return " (across the map)"
        r = next((r for r in rows if abs(r["factors"][k]) >= .003), None)
        return f" (mostly {r['title'].replace(' Senate', '').replace(' Governor', '')})" if r else ""
    s += ": " + ", ".join(f"{nm[k]} {pts(v)}{lead(k)}" for k, v in big[:3]) if big else ": small moves across many races"
    if mk0 is not None and mk1 is not None: s += f". Markets {round(mk0 * 100)}% → {round(mk1 * 100)}%."
    return s

# ---------- paper book ----------
GAP, LO, HI, STAKE = .10, .04, .96, 100.0
def book(L, M, results=None, contest_results=None):
    """Rebuilt from the daily forecast log each run. L = {day: {races: {id: [model, mkt]}, contests: {cid: [model, mkt]}}}."""
    titles = {i: x.get("title") for i, x in M["races"].items()}
    titles.update({f"ctl:{k}": f"{v.get('label', k)} control" for k, v in M["contests"].items()})
    pos, open_ = [], {}
    for day in sorted(L):
        snap = L[day]
        inst = {**{i: v for i, v in (snap.get("races") or {}).items()}, **{f"ctl:{k}": v for k, v in (snap.get("contests") or {}).items()}}
        for i, v in inst.items():
            if not v or v[0] is None or v[1] is None or not (LO <= v[1] <= HI): continue
            g = v[0] - v[1]
            if abs(g) < GAP: continue
            side = "D" if g > 0 else "R"
            if (i, side) in open_: continue
            price = v[1] if side == "D" else 1 - v[1]
            p = {"id": i, "title": titles.get(i, i), "side": side, "opened": day, "entry": round(price, 3), "modelAtEntry": round(v[0] if side == "D" else 1 - v[0], 3),
                 "gapAtEntry": round(abs(g), 3), "shares": round(STAKE / price, 2)}
            pos.append(p); open_[(i, side)] = p
    cur = {**{i: x.get("mkt") for i, x in M["races"].items()}, **{f"ctl:{k}": v.get("market") for k, v in M["contests"].items()}}
    curm = {**{i: x.get("model") for i, x in M["races"].items()}, **{f"ctl:{k}": v.get("pControl") for k, v in M["contests"].items()}}
    for p in pos:
        won = None
        if results and p["id"] in results: won = results[p["id"]] in ("D", "I")
        if contest_results and p["id"].startswith("ctl:") and p["id"][4:] in contest_results: won = bool(contest_results[p["id"][4:]])
        k = cur.get(p["id"])
        if won is not None:
            p["status"] = "settled"; p["won"] = won == (p["side"] == "D"); p["pnl"] = round(p["shares"] * (1 if p["won"] else 0) - STAKE, 2)
        elif k is not None:
            now = k if p["side"] == "D" else 1 - k
            p["status"] = "open"; p["now"] = round(now, 3); p["clv"] = round(now - p["entry"], 3); p["pnl"] = round(p["shares"] * now - STAKE, 2)
            m = curm.get(p["id"]); p["modelNow"] = round(m if p["side"] == "D" else 1 - m, 3) if m is not None else None
        else: p["status"] = "stale"
    op = [p for p in pos if p["status"] == "open"]; st = [p for p in pos if p["status"] == "settled"]
    S = {"positions": len(pos), "open": len(op), "settled": len(st), "staked": STAKE * len(pos),
         "mtm": round(sum(p.get("pnl", 0) for p in op), 2), "realized": round(sum(p["pnl"] for p in st), 2),
         "avgClv": round(sum(p["clv"] for p in op) / len(op), 3) if op else None,
         "clvPositive": sum(1 for p in op if p["clv"] > .005), "clvNegative": sum(1 for p in op if p["clv"] < -.005),
         "hits": sum(1 for p in st if p["won"]), "since": min(L) if L else None, "rule": f"Buy ${STAKE:.0f} of the model's side when |model − market| ≥ {GAP * 100:.0f} pts (daily close); hold to resolution."}
    pos.sort(key=lambda p: (p["status"] != "open", -abs(p.get("clv") or 0)))
    return {"summary": S, "positions": pos}
