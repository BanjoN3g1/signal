"""Signal's own forecast layer: turns the raw inputs elections.py / politics.py already collect into insight.

1. Expected margin  — every race gets an environment-adjusted expectation: 2024 presidential margin in the state, shifted by
   the national swing (generic ballot now vs the 2024 national popular vote). Observed margin (poll average, or the margin the
   market price implies when there are no polls) minus that expectation = candidate over/underperformance. Big gaps mean the
   race is about the candidates, not the national tide.
2. Seat math        — correlated Monte Carlo: every race shares one national error term (so a polling miss moves all races
   together) plus its own race error. Outputs Senate control odds, the seat distribution, the tipping-point race, each race's
   pivotal probability (how often flipping that race alone flips the chamber), conditional odds and the common paths to 51.
3. Disagreement     — our model vs markets vs raters vs polls, per race and for the chamber. Large gaps are flagged.
4. Accountability   — one forecast snapshot per day is logged (data/cache/forecast_log.json) so it can be Brier-scored
   against results after Election Day.

Pure Python (no numpy), deterministic seed, ~1s for 20k sims. Every parameter is in PARAMS and shipped in the output."""
import json, math, os, random, re, time, datetime as dt
from collections import Counter

PARAMS = {
    "sims": 20000,
    "sig_nat": 3.0,          # shared national error (pts): correlated miss across every race
    "sig_poll": 4.5,         # race error when the race is well polled
    "sig_fund": {"senate": 7.0, "governor": 9.0},   # race error with fundamentals only
    "elast": {"senate": 1.0, "governor": 0.8},      # how much of the national swing a race inherits (governors are less nationalized)
    "inc": {"senate": 2.5, "governor": 2.0},        # incumbency bonus (pts) when the incumbent is on the ballot
    "poll_k": 1.5,           # poll weight = n / (n + poll_k), capped (late October: polls dominate)
    "poll_cap": 0.85,
    "gap_flag": 0.10,        # flag model-vs-market gaps of 10+ pts
    "cand_flag": 4.0,        # call a race candidate-driven when it runs 4+ pts off the environment
    "close": 2.5,
    "rater_w": {"senate": 0.5, "governor": 1.0},     # prior = fundamentals blended with the expert-rating margin; governors
                                                     # are candidate races, so the 2024-presidential baseline is dropped there
    "sig_prior": {"senate": 6.0, "governor": 7.0},   # race error when the prior includes ratings but there are no polls            # leverage counts pivotal simulations where the race itself is within this many pts
}
SENATE = {"D": 47, "R": 53, "need_D": 51}   # current chamber; D needs 51 (VP breaks 50-50 ties for the R side)
SEED = 20261103

def log(*a): print("[forecast]", *a, flush=True)

# ---------- small stats helpers ----------
def ncdf(x): return 0.5 * (1 + math.erf(x / math.sqrt(2)))
def ninv(p):
    """Inverse normal CDF (Acklam's rational approximation, |err| < 1e-9)."""
    p = min(max(p, 1e-6), 1 - 1e-6)
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549671010336059e+00, 4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    if p < 0.02425:
        q = math.sqrt(-2 * math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p > 1 - 0.02425:
        q = math.sqrt(-2 * math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    q = p - 0.5; r = q * q
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)

# rater consensus score (-3 Safe R .. +3 Safe D) -> implied margin, piecewise linear
_RM = [(0, 0), (.5, 2.5), (1, 6), (2, 11), (3, 18)]  # calibrated so Lean ≈ 80%, Likely ≈ 93%, Safe ≈ 99% (historical rater hit rates)
def rater_margin(s):
    if s is None: return None
    a, sg = abs(s), (1 if s >= 0 else -1)
    for (x0, y0), (x1, y1) in zip(_RM, _RM[1:]):
        if a <= x1: return round(sg * (y0 + (y1 - y0) * (a - x0) / (x1 - x0)), 1)
    return sg * 18.0

def cands(r):
    """Market candidates by party: {'D': name, 'R': name, 'I': name} (top-priced per party)."""
    out = {}
    for od in r.get("odds") or []:
        for o in sorted(od["outcomes"], key=lambda o: -o["p"]):
            if o.get("party") and o["party"] not in out: out[o["party"]] = o["name"]
    return out

def dside(c):
    """Which party is the anti-R side in this race (D, or an independent running in place of one)."""
    return "I" if "I" in c and "D" not in c else "D"

def holder_of(r):
    """Party currently holding the seat: config 'holder', else the ratings table's last-result column, else None."""
    if r.get("holder") in ("D", "R", "I"): return r["holder"]
    last = (r.get("ratings") or {}).get("last") or ""
    m = re.search(r"\b(D|R|I)\b|(Democratic|Republican|Independent)", last)
    return (m.group(1) or m.group(2)[0]) if m else None

def incumbent_party(r, c):
    """Party of an incumbent who is on the ballot (matched by last name against market candidates)."""
    rt = r.get("ratings") or {}
    if not rt or rt.get("open"): return None
    inc = (rt.get("incumbent") or "").lower()
    for pty, nm in c.items():
        ln = nm.split()[-1].lower() if nm.split() else ""
        if ln and len(ln) > 2 and re.search(r"\b" + re.escape(ln) + r"\b", inc): return pty
    return None

# ---------- 1. per-race expectation ----------
def race_inputs(r, base, swing):
    typ = r["type"]; c = cands(r); ds = dside(c)
    b = (base.get("state") or {}).get(r.get("fips") or "")
    baseD = -b[0] if b else None                       # baseline is R minus D; we work in D(anti-R) terms
    el, P = PARAMS["elast"][typ], PARAMS
    env = round(baseD + el * swing, 1) if baseD is not None else None
    ip = incumbent_party(r, c); inc = 0.0
    if ip: inc = P["inc"][typ] * (1 if ip in ("D", "I") else -1)
    fund = round(env + inc, 1) if env is not None else None
    ra = (r.get("ratings") or {}).get("avg"); rm = rater_margin(ra)
    # prior: fundamentals, blended with what the expert ratings imply (raters see candidate quality; fundamentals don't)
    rw = P["rater_w"][typ] if rm is not None else 0.0
    prior = (rw * rm + (1 - rw) * fund) if fund is not None else rm
    sig_prior = P["sig_prior"][typ] if rm is not None else P["sig_fund"][typ]
    pd = r.get("pollData"); poll = r.get("pollMarginD"); n = (pd or {}).get("n") or 0
    w = min(P["poll_cap"], n / (n + P["poll_k"])) if poll is not None and n else 0.0
    if prior is None and poll is None: return None
    if prior is None: mu, w = poll, 1.0
    else: mu = w * poll + (1 - w) * prior if poll is not None else prior
    sig = math.sqrt(w * P["sig_poll"] ** 2 + (1 - w) * sig_prior ** 2)
    tot = math.sqrt(sig ** 2 + P["sig_nat"] ** 2)
    mkt = r.get("pD")
    mkt_m = round(tot * ninv(mkt), 1) if mkt is not None else None
    # observed: what the race actually looks like (polls if we have them, else what the market price implies)
    obs, obs_src = (poll, "polls") if poll is not None else ((mkt_m, "market-implied") if mkt_m is not None else (None, None))
    over = round(obs - env, 1) if obs is not None and env is not None else None
    who = None
    if over is not None and abs(over) >= 1:
        side = ds if over > 0 else "R"; who = {"party": side, "name": c.get(side)}
    return {"id": r["id"], "type": typ, "state": r.get("state"), "title": r.get("title"), "dside": ds, "cands": c,
            "base": round(baseD, 1) if baseD is not None else None, "swing": round(el * swing, 1), "env": env,
            "incParty": ip, "inc": inc, "fund": fund, "prior": round(prior, 1) if prior is not None else None, "raterW": rw, "poll": poll, "nPolls": n, "w": round(w, 2),
            "mu": round(mu, 2), "sigma": round(sig, 2), "mkt": mkt, "mktMargin": mkt_m,
            "rater": ra, "raterLabel": (r.get("ratings") or {}).get("label"), "raterMargin": rm,
            "obs": obs, "obsSrc": obs_src, "over": over, "overWho": who,
            "candidateDriven": over is not None and abs(over) >= P["cand_flag"], "fundOnly": w == 0,
            "holder": holder_of(r) if typ == "senate" else None}

# ---------- 2. simulation ----------
def simulate(R, nsims):
    rnd = random.Random(SEED)
    sen = [x for x in R if x["type"] == "senate"]
    ids = [x["id"] for x in R]
    win = {i: 0 for i in ids}
    # Senate bookkeeping: seats not modeled stay with their holder
    known = [x for x in sen if x["holder"]]
    d_fixed = SENATE["D"] - sum(1 for x in known if x["holder"] in ("D", "I"))
    r_fixed = SENATE["R"] - sum(1 for x in known if x["holder"] == "R")
    need_d = SENATE["need_D"] - d_fixed               # D wins needed among modeled races
    need_r = (100 - SENATE["need_D"] + 1) - r_fixed   # R needs 50 seats total (VP tiebreak)
    seats = Counter(); dctl = 0; tip = Counter(); piv = Counter(); lev = Counter(); paths = Counter()
    cond = {x["id"]: [0, 0, 0, 0] for x in known}     # [D wins & D ctl, D wins, R wins & D ctl, R wins]
    for _ in range(nsims):
        nat = rnd.gauss(0, PARAMS["sig_nat"])
        m = {x["id"]: x["mu"] + nat + rnd.gauss(0, x["sigma"]) for x in R}
        for i, v in m.items():
            if v > 0: win[i] += 1
        if not known: continue
        dw = [x for x in known if m[x["id"]] > 0]
        nd = d_fixed + len(dw); seats[nd] += 1
        ctl = nd >= SENATE["need_D"]; dctl += ctl
        for x in known:
            c = cond[x["id"]]; dwin = m[x["id"]] > 0
            if dwin: c[1] += 1; c[0] += ctl
            else: c[3] += 1; c[2] += ctl
            # pivotal: this race alone decides control in this simulation
            if (dwin and nd == SENATE["need_D"]) or (not dwin and nd == SENATE["need_D"] - 1):
                piv[x["id"]] += 1
                # leverage: pivotal AND the race itself is close, i.e. a small push here would flip the chamber
                if abs(m[x["id"]]) < PARAMS["close"]: lev[x["id"]] += 1
        # tipping point: the race that delivers the winner's decisive seat
        if ctl and 1 <= need_d <= len(known):
            tip[sorted(known, key=lambda x: -m[x["id"]])[need_d - 1]["id"]] += 1
        elif not ctl and 1 <= need_r <= len(known):
            tip[sorted(known, key=lambda x: m[x["id"]])[need_r - 1]["id"]] += 1
        if ctl:  # path = set of flips (seats changing hands toward D) in this D-control world
            paths[tuple(sorted(x["id"] for x in known if (m[x["id"]] > 0) != (x["holder"] in ("D", "I"))))] += 1
    N = nsims
    out = {"pD": {i: round(win[i] / N, 3) for i in ids}}
    if known:
        hist = {str(k): round(v / N, 4) for k, v in sorted(seats.items())}
        mean = sum(k * v for k, v in seats.items()) / N
        cum, p10, p90 = 0, None, None
        for k in sorted(seats):
            cum += seats[k] / N
            if p10 is None and cum >= .1: p10 = k
            if p90 is None and cum >= .9: p90 = k
        out["senate"] = {"pControl": round(dctl / N, 3), "seatsMean": round(mean, 1), "p10": p10, "p90": p90, "hist": hist,
                         "dFixed": d_fixed, "rFixed": r_fixed, "needD": need_d, "modeled": len(known),
                         "tipping": [{"id": i, "p": round(v / N, 3)} for i, v in tip.most_common(8)],
                         "paths": [{"flips": list(k), "p": round(v / N, 3)} for k, v in paths.most_common(6)]}
        out["pivotal"] = {i: round(piv[i] / N, 3) for i in cond}
        out["leverage"] = {i: round(lev[i] / N, 4) for i in cond}
        out["tip"] = {i: round(v / N, 3) for i, v in tip.items()}
        out["cond"] = {i: {"ifD": round(c[0] / c[1], 3) if c[1] else None, "ifR": round(c[2] / c[3], 3) if c[3] else None} for i, c in cond.items()}
    return out

# ---------- 3+4. assemble, disagreement, log ----------
def run(E, generic_d, base, cache):
    t0 = time.time()
    if generic_d is None or not base: log("missing generic ballot or baseline; skipped"); return None
    st = base.get("state") or {}
    tv = sum(v[1] for v in st.values()) or 1
    natl24 = -sum(v[0] * v[1] for v in st.values()) / tv          # 2024 national margin, D terms (≈ -1.5)
    swing = generic_d - natl24
    R = [x for x in (race_inputs(r, base, swing) for r in E.get("races", []) if r["type"] in ("senate", "governor")) if x]
    sim = simulate(R, PARAMS["sims"])
    for x in R:
        i = x["id"]; x["model"] = sim["pD"][i]
        x["gap"] = round(x["model"] - x["mkt"], 3) if x["mkt"] is not None else None
        x["pivotal"] = sim.get("pivotal", {}).get(i); x["leverage"] = sim.get("leverage", {}).get(i); x["tip"] = sim.get("tip", {}).get(i, 0 if x["type"] == "senate" else None)
        x["cond"] = sim.get("cond", {}).get(i)
    sc = next((r for r in E.get("races", []) if r["id"] == "senate-control"), None)
    hc = next((r for r in E.get("races", []) if r["id"] == "house-control"), None)
    S = sim.get("senate")
    if S: S["market"] = sc.get("pD") if sc else None; S["gap"] = round(S["pControl"] - S["market"], 3) if S["market"] is not None else None
    # disagreement index: model vs market, plus whether raters / polls side with either
    dis = []
    for x in R:
        if x["gap"] is None or not any(v is not None and .1 <= v <= .9 for v in (x["model"], x["mkt"])): continue
        sides = {"model": x["model"] >= .5, "market": x["mkt"] >= .5}
        if x["raterMargin"] is not None and abs(x["raterMargin"]) >= 1: sides["raters"] = x["raterMargin"] > 0
        if x["poll"] is not None and abs(x["poll"]) >= 1: sides["polls"] = x["poll"] > 0
        score = abs(x["gap"]) + (.08 if sides["model"] != sides["market"] else 0) + 2 * (x.get("leverage") or 0)
        if abs(x["gap"]) >= PARAMS["gap_flag"] or sides["model"] != sides["market"]:
            dis.append({"id": x["id"], "gap": x["gap"], "score": round(score, 3), "sides": sides})
    dis.sort(key=lambda d: -d["score"])
    out = {"asof": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "params": PARAMS,
           "env": {"generic": generic_d, "natl2024": round(natl24, 1), "swing": round(swing, 1), "baseline": base.get("label")},
           "senate": S, "house": {"market": hc.get("pD") if hc else None, "note": "House is market-only for now: district-level inputs (new mid-decade lines) are not wired in yet."},
           "races": {x["id"]: x for x in R}, "disagree": dis[:10], "brief": brief(R, S, swing, generic_d),
           "track": track(R, S, cache)}
    log(f"{len(R)} races, Senate D control {S and S['pControl']}, market {S and S.get('market')}; {round(time.time() - t0, 2)}s")
    return out

def _nm(x): return f"{x['state']} {'Sen' if x['type'] == 'senate' else 'Gov'}"
def brief(R, S, swing, gd):
    """3-5 plain-English takeaways computed from the numbers above (no AI)."""
    b = []
    f = lambda p: f"{round(p * 100)}%"
    if S:
        line = f"Our model gives Democrats a {f(S['pControl'])} chance at the Senate (avg {S['seatsMean']} seats, 80% range {S['p10']}–{S['p90']})"
        if S.get("market") is not None:
            g = S["gap"]; line += f"; markets say {f(S['market'])}" + (f" — the model is {abs(round(g * 100))} pts {'more' if g > 0 else 'less'} bullish on Democrats." if abs(g) >= .05 else ", in line with the model.")
        b.append({"t": line + "", "k": "senate"})
        if S["tipping"]:
            tp = S["tipping"][0]; x = next((r for r in R if r["id"] == tp["id"]), None)
            if x: b.append({"t": f"Tipping-point race: {x['title']} ({f(tp['p'])} of simulations). The model has the {x['dside']} side at {f(x['model'])} there" + (f" vs {f(x['mkt'])} in markets." if x['mkt'] is not None else "."), "race": x["id"], "k": "tip"})
        pv = sorted([x for x in R if x.get("leverage")], key=lambda x: -x["leverage"])
        if pv:
            tot = sum(x["leverage"] for x in pv) or 1
            b.append({"t": "Highest leverage: " + ", ".join(f"{_nm(x)} ({round(x['leverage'] / tot * 100)}%)" for x in pv[:3]) + f" of the map's leverage — simulations where the race is within {PARAMS['close']} pts and decides control on its own. That is where a marginal dollar or volunteer hour moves the chamber most.", "k": "pivotal"})
    comp = lambda x: any(v is not None and .1 <= v <= .9 for v in (x["model"], x["mkt"]))
    cd = sorted([x for x in R if x["type"] == "senate" and x["candidateDriven"] and x["obsSrc"] == "polls" and comp(x)], key=lambda x: -abs(x["over"]))  # governors are candidate races by nature
    if cd:
        x = cd[0]; w = x["overWho"] or {}
        b.append({"t": f"Biggest candidate effect: {x['title']} — {w.get('name') or w.get('party')} ({w.get('party')}) is running {abs(x['over'])} pts ahead of what a {'D' if gd >= 0 else 'R'}+{abs(round(gd, 1))} national environment predicts ({x['obsSrc']}). Races like this hold up if the national mood shifts; tide-driven ones don't.", "race": x["id"], "k": "cand"})
    dg = sorted([x for x in R if x["gap"] is not None and comp(x)], key=lambda x: -abs(x["gap"]) - (.1 if x["nPolls"] else 0))  # prefer polled races
    if dg and abs(dg[0]["gap"]) >= PARAMS["gap_flag"]:
        x = dg[0]; b.append({"t": f"Biggest model-vs-market gap: {x['title']} — model {f(x['model'])}, markets {f(x['mkt'])} for the {x['dside']} side." + (" No public polls here, so the model is running on fundamentals and expert ratings only — lower confidence." if not x["nPolls"] else " Either the market knows something the polls don't, or it's mispriced."), "race": x["id"], "k": "gap"})
    return b

def track(R, S, cache):
    """Log one forecast snapshot per UTC day (model vs market) for Brier scoring after the election."""
    p = os.path.join(cache, "forecast_log.json")
    try: L = json.load(open(p))
    except Exception: L = {}
    day = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    L[day] = {"races": {x["id"]: [x["model"], x["mkt"]] for x in R}, "senate": [S["pControl"], S.get("market")] if S else None}
    try: json.dump(L, open(p, "w"))
    except Exception as e: log("log write failed", e)
    days = sorted(L)
    return {"since": days[0], "days": len(days), "history": [{"d": d, "senate": L[d].get("senate")} for d in days[-60:]]}

def score(log_path, results):
    """After the election: results = {race_id: 1 if D/I side won else 0}. Returns Brier scores for model vs market."""
    L = json.load(open(log_path)); out = {}
    for d, snap in L.items():
        bm = [(v[0] - results[i]) ** 2 for i, v in snap["races"].items() if i in results and v[0] is not None]
        bk = [(v[1] - results[i]) ** 2 for i, v in snap["races"].items() if i in results and v[1] is not None]
        out[d] = {"model": round(sum(bm) / len(bm), 4) if bm else None, "market": round(sum(bk) / len(bk), 4) if bk else None, "n": len(bm)}
    return out
