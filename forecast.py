"""Signal's own forecast layer: turns the raw inputs elections.py / politics.py collect into insight. Election-agnostic:
what gets simulated is declared per election as `contests` (Senate seats now; electoral votes in 2028; any chamber with a
seat count and a majority line).

1. Expected margin  — 2024 presidential margin per state shifted by the national swing (national D margin now vs the 2024
   national vote), plus incumbency, blended with the expert-rating consensus (the prior), then with the poll average.
   Observed minus environment = candidate over/underperformance.
2. Contest math     — correlated Monte Carlo (one shared national error + race error). Per contest: control odds, seat/EV
   distribution, tipping point, pivotal %, leverage (pivotal AND close), conditional odds, common paths. Scenario reruns
   with a ±3 pt polling miss show how fragile the topline is.
3. The read         — at most 3 ranked takeaways (tipping point vs markets, what moved, fragility, candidate effects, gaps).
4. Accountability   — one snapshot per day (data/cache/forecast_log_<election>.json) and the last pre-election forecast
   (forecast_final_<election>.json). After Election Day the model stops re-running and a scorecard grades model vs markets
   against results (data/elections/results/<id>.json, else markets that settled ≥97/≤3).

Pure Python, deterministic seed. Every parameter is in PARAMS and shipped in the output."""
import json, math, os, random, re, time, datetime as dt
from collections import Counter

ROOT = os.path.dirname(os.path.abspath(__file__))
PARAMS = {
    "sims": 20000, "scenario_sims": 8000,
    "sig_nat": 3.0,          # shared national error (pts): correlated miss across every race
    "sig_poll": {"senate": 4.5, "governor": 4.5, "president": 3.5},     # race error when well polled
    "sig_fund": {"senate": 7.0, "governor": 9.0, "president": 4.5},     # race error with fundamentals only
    "sig_prior": {"senate": 6.0, "governor": 7.0, "president": 4.5},    # race error when the prior includes ratings
    "elast": {"senate": 1.0, "governor": 0.8, "president": 1.0},        # share of the national swing a race inherits
    "inc": {"senate": 2.5, "governor": 2.0, "president": 0.0},          # incumbency bonus when the incumbent is on the ballot
    "rater_w": {"senate": 0.5, "governor": 1.0, "president": 0.3},      # weight of the expert-rating margin in the prior
    "poll_k": 1.5, "poll_cap": 0.85,   # poll weight = n / (n + poll_k), capped
    "gap_flag": 0.10,        # model-vs-market gaps of 10+ pts are flagged
    "cand_flag": 4.0,        # candidate-driven when a race runs 4+ pts off the environment
    "close": 2.5,            # leverage counts pivotal simulations where the race itself is within this many pts
    "miss": 3.0,             # scenario: a polling miss of this size (≈ 2024's national miss)
}
TYPES = ("senate", "governor", "president")
DEFAULT_CONTESTS = [  # used when an election config has no "contests" (the 2026 midterm setup)
    {"id": "senate", "label": "Senate", "type": "senate", "total": 100, "held": {"D": 47, "R": 53}, "win_at": 51, "market": "senate-control", "unit": "seats"},
    {"id": "house", "label": "House", "market": "house-control", "modeled": False}]
EV = {"AL": 9, "AK": 3, "AZ": 11, "AR": 6, "CA": 54, "CO": 10, "CT": 7, "DE": 3, "DC": 3, "FL": 30, "GA": 16, "HI": 4, "ID": 4, "IL": 19, "IN": 11,
      "IA": 6, "KS": 6, "KY": 8, "LA": 8, "ME": 4, "MD": 10, "MA": 11, "MI": 15, "MN": 10, "MS": 6, "MO": 10, "MT": 4, "NE": 5, "NV": 6, "NH": 4,
      "NJ": 14, "NM": 5, "NY": 28, "NC": 16, "ND": 3, "OH": 17, "OK": 7, "OR": 8, "PA": 19, "RI": 4, "SC": 9, "SD": 3, "TN": 11, "TX": 40, "UT": 6,
      "VT": 3, "VA": 13, "WA": 12, "WV": 4, "WI": 10, "WY": 3}   # 2024–2028 apportionment; ME/NE district votes treated statewide
FIPS = {"AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16",
        "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29",
        "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42",
        "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56"}
ST_OF = {v: k for k, v in FIPS.items()}
try:
    from elections import STATES as _S; NAMES = {**_S, "DC": "District of Columbia"}
except Exception: NAMES = {"DC": "District of Columbia"}
SEED = 20261103

def log(*a): print("[forecast]", *a, flush=True)
def today(): return dt.datetime.now(dt.timezone.utc).date()

# ---------- small stats helpers ----------
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

# rater consensus score (-3 Safe R .. +3 Safe D) -> implied margin; calibrated so Lean ≈ 80%, Likely ≈ 93%, Safe ≈ 99%
_RM = [(0, 0), (.5, 2.5), (1, 6), (2, 11), (3, 18)]
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
            if o.get("party") and o["party"] not in out and not re.match(r"(democrat|republican|independent)", o["name"], re.I): out[o["party"]] = o["name"]
    return out

def dside(c): return "I" if "I" in c and "D" not in c else "D"
def last(n): return (n or "").split()[-1] if (n or "").split() else ""

def holder_of(r):
    if r.get("holder") in ("D", "R", "I"): return r["holder"]
    m = re.search(r"\b(D|R|I)\b|(Democratic|Republican|Independent)", (r.get("ratings") or {}).get("last") or "")
    return (m.group(1) or m.group(2)[0]) if m else None

def incumbent_party(r, c):
    rt = r.get("ratings") or {}
    if not rt or rt.get("open"): return None
    inc = (rt.get("incumbent") or "").lower()
    for pty, nm in c.items():
        ln = last(nm).lower()
        if len(ln) > 2 and re.search(r"\b" + re.escape(ln) + r"\b", inc): return pty
    return None

# ---------- 1. per-race expectation ----------
def race_inputs(r, base, swing):
    typ = r["type"]; c = cands(r); ds = dside(c); P = PARAMS
    b = (base.get("state") or {}).get(r.get("fips") or "")
    baseD = -b[0] if b else None                       # baseline is R minus D; we work in D(anti-R) terms
    env = round(baseD + P["elast"][typ] * swing, 1) if baseD is not None else None
    ip = incumbent_party(r, c); inc = P["inc"][typ] * (1 if ip in ("D", "I") else -1) if ip else 0.0
    fund = round(env + inc, 1) if env is not None else None
    ra = (r.get("ratings") or {}).get("avg"); rm = rater_margin(ra)
    rw = P["rater_w"][typ] if rm is not None and fund is not None else (1.0 if rm is not None else 0.0)
    prior = (rw * rm + (1 - rw) * fund) if fund is not None and rm is not None else (fund if fund is not None else rm)
    sig_prior = P["sig_prior"][typ] if rm is not None else P["sig_fund"][typ]
    poll = r.get("pollMarginD"); n = (r.get("pollData") or {}).get("n") or 0
    w = min(P["poll_cap"], n / (n + P["poll_k"])) if poll is not None and n else 0.0
    if prior is None and poll is None: return None
    if prior is None: mu, w = poll, 1.0
    else: mu = w * poll + (1 - w) * prior if poll is not None else prior
    sig = math.sqrt(w * P["sig_poll"][typ] ** 2 + (1 - w) * sig_prior ** 2)
    mkt = r.get("pD")
    mkt_m = round(math.sqrt(sig ** 2 + P["sig_nat"] ** 2) * ninv(mkt), 1) if mkt is not None else None
    obs, obs_src = (poll, "polls") if poll is not None else ((mkt_m, "market-implied") if mkt_m is not None else (None, None))
    over = round(obs - env, 1) if obs is not None and env is not None else None
    who = {"party": ds if over > 0 else "R", "name": c.get(ds if over > 0 else "R")} if over is not None and abs(over) >= 1 else None
    holder = holder_of(r) if typ == "senate" else (("R" if b[0] > 0 else "D") if typ == "president" and b else None)
    return {"id": r["id"], "type": typ, "state": r.get("state"), "title": r.get("title"), "dside": ds, "cands": c,
            "base": round(baseD, 1) if baseD is not None else None, "swing": round(P["elast"][typ] * swing, 1), "env": env,
            "incParty": ip, "inc": inc, "fund": fund, "prior": round(prior, 1) if prior is not None else None, "raterW": rw,
            "poll": poll, "nPolls": n, "w": round(w, 2), "mu": round(mu, 2), "sigma": round(sig, 2), "mkt": mkt, "mktMargin": mkt_m,
            "rater": ra, "raterLabel": (r.get("ratings") or {}).get("label"), "raterMargin": rm,
            "obs": obs, "obsSrc": obs_src, "over": over, "overWho": who, "open": bool((r.get("ratings") or {}).get("open")),
            "candidateDriven": over is not None and abs(over) >= P["cand_flag"], "fundOnly": w == 0, "holder": holder}

def auto_president(E, base):
    """2028-style: every state (and DC) gets a president race from fundamentals unless the config lists it (with markets/polls)."""
    have = {r.get("state") for r in E.get("races", []) if r["type"] == "president"}
    out = []
    for f, v in (base.get("state") or {}).items():
        st = ST_OF.get(f)
        if st and st not in have: out.append({"id": f"{st}-pres", "type": "president", "state": st, "fips": f, "title": NAMES.get(st, st), "odds": []})
    return out

# ---------- 2. contest simulation ----------
def _setup(C, R):
    typ = C["type"]; wfn = (lambda x: EV.get(x["state"], 0)) if C.get("weights") == "ev" else (lambda x: 1)
    mem = [x for x in R if x["type"] == typ and x["holder"] and wfn(x) > 0]
    held = C.get("held") or {}
    d_fixed = held.get("D", 0) + held.get("I", 0) - sum(wfn(x) for x in mem if x["holder"] in ("D", "I")) if held else 0
    total = C.get("total") or (d_fixed + sum(wfn(x) for x in mem))
    r_fixed = total - d_fixed - sum(wfn(x) for x in mem)
    return mem, {x["id"]: wfn(x) for x in mem}, d_fixed, r_fixed, total

def simulate(R, contests, nsims, shift=0.0, light=False):
    rnd = random.Random(SEED + int(shift * 10))
    win = {x["id"]: 0 for x in R}
    S = {}
    for C in contests:
        mem, w, d_fixed, r_fixed, total = _setup(C, R)
        if not mem: continue
        S[C["id"]] = {"C": C, "mem": mem, "w": w, "d_fixed": d_fixed, "r_fixed": r_fixed, "total": total, "win_at": C["win_at"],
                      "seats": Counter(), "ctl": 0, "tip": Counter(), "piv": Counter(), "lev": Counter(), "paths": Counter(),
                      "cond": {x["id"]: [0, 0, 0, 0] for x in mem}}
    for _ in range(nsims):
        nat = rnd.gauss(0, PARAMS["sig_nat"])
        m = {x["id"]: x["mu"] + shift + nat + rnd.gauss(0, x["sigma"]) for x in R}
        if not light:
            for i, v in m.items():
                if v > 0: win[i] += 1
        for s in S.values():
            mem, w, wa = s["mem"], s["w"], s["win_at"]
            nd = s["d_fixed"] + sum(w[x["id"]] for x in mem if m[x["id"]] > 0)
            ctl = nd >= wa; s["ctl"] += ctl
            if light: continue
            s["seats"][nd] += 1
            for x in mem:
                i = x["id"]; c = s["cond"][i]; dw = m[i] > 0
                if dw: c[1] += 1; c[0] += ctl
                else: c[3] += 1; c[2] += ctl
                if (dw and ctl and nd - w[i] < wa) or (not dw and not ctl and nd + w[i] >= wa):
                    s["piv"][i] += 1
                    if abs(m[i]) < PARAMS["close"]: s["lev"][i] += 1
            # tipping point: walk races from the winner's strongest to weakest until the majority line is crossed
            if ctl: tot, order, need = s["d_fixed"], sorted(mem, key=lambda x: -m[x["id"]]), wa
            else: tot, order, need = s["r_fixed"], sorted(mem, key=lambda x: m[x["id"]]), s["total"] - wa + 1
            for x in order:
                tot += w[x["id"]]
                if tot >= need: s["tip"][x["id"]] += 1; break
            if ctl: s["paths"][tuple(sorted(x["id"] for x in mem if (m[x["id"]] > 0) != (x["holder"] in ("D", "I"))))] += 1
    N = nsims; out = {"pD": {i: round(v / N, 3) for i, v in win.items()}, "contests": {}, "race": {}}
    for cid, s in S.items():
        if light: out["contests"][cid] = {"pControl": round(s["ctl"] / N, 3)}; continue
        seats = s["seats"]; mean = sum(k * v for k, v in seats.items()) / N; cum, p10, p90 = 0, None, None
        for k in sorted(seats):
            cum += seats[k] / N
            if p10 is None and cum >= .1: p10 = k
            if p90 is None and cum >= .9: p90 = k
        C = s["C"]
        out["contests"][cid] = {"id": cid, "label": C.get("label", cid), "unit": C.get("unit", "seats"), "total": s["total"], "winAt": s["win_at"],
                                "pControl": round(s["ctl"] / N, 3), "seatsMean": round(mean, 1), "p10": p10, "p90": p90,
                                "hist": {str(k): round(v / N, 4) for k, v in sorted(seats.items())},
                                "dFixed": s["d_fixed"], "rFixed": s["r_fixed"], "modeled": len(s["mem"]), "note": C.get("note"),
                                "tipping": [{"id": i, "p": round(v / N, 3)} for i, v in s["tip"].most_common(8)],
                                "paths": [{"flips": list(k), "p": round(v / N, 3)} for k, v in s["paths"].most_common(6)]}
        for x in s["mem"]:
            i = x["id"]; c = s["cond"][i]
            out["race"][i] = {"contest": cid, "weight": s["w"][i], "pivotal": round(s["piv"][i] / N, 3), "leverage": round(s["lev"][i] / N, 4),
                              "tip": round(s["tip"][i] / N, 3), "cond": {"ifD": round(c[0] / c[1], 3) if c[1] else None, "ifR": round(c[2] / c[3], 3) if c[3] else None}}
    return out

# ---------- 3. assemble ----------
def contests_of(E):
    cs = E.get("contests") or DEFAULT_CONTESTS
    return [c for c in cs if c.get("modeled", True) and c.get("type") and c.get("win_at")], cs

def run(E, nat_d, base, cache):
    t0 = time.time(); eid = E.get("id", "election")
    edate = dt.date.fromisoformat(E["date"]) if E.get("date") else None
    if edate and today() > edate:   # election is over: freeze the last pre-election forecast, grade it
        fin = _load(os.path.join(cache, f"forecast_final_{eid}.json")) or _load(os.path.join(ROOT, "data", "elections", "archive", f"{eid}-model.json"))
        if fin:
            fin["frozen"] = True; fin["scorecard"] = scorecard(E, fin, cache)
            log(f"{eid}: election over; serving final forecast from {fin.get('asof')} + scorecard"); return fin
    if nat_d is None or not base: log("missing national margin or baseline; skipped"); return None
    st = base.get("state") or {}; tv = sum(v[1] for v in st.values()) or 1
    natl24 = -sum(v[0] * v[1] for v in st.values()) / tv          # 2024 national margin, D terms (≈ -1.5)
    swing = nat_d - natl24
    modeled, allc = contests_of(E)
    races = [r for r in E.get("races", []) if r["type"] in TYPES]
    if any(c["type"] == "president" for c in modeled): races += auto_president(E, base)
    R = [x for x in (race_inputs(r, base, swing) for r in races) if x]
    sim = simulate(R, modeled, PARAMS["sims"])
    for x in R:
        i = x["id"]; x["model"] = sim["pD"][i]; x["gap"] = round(x["model"] - x["mkt"], 3) if x["mkt"] is not None else None
        x.update(sim["race"].get(i, {}))
    mk = {r["id"]: r.get("pD") for r in E.get("races", []) if r["type"] == "chamber"}
    C = sim["contests"]
    for c in allc:
        if c["id"] in C: C[c["id"]]["market"] = mk.get(c.get("market"))
        else: C[c["id"]] = {"id": c["id"], "label": c.get("label", c["id"]), "market": mk.get(c.get("market")), "modeled": False, "note": c.get("note")}
        x = C[c["id"]]
        if x.get("pControl") is not None and x.get("market") is not None: x["gap"] = round(x["pControl"] - x["market"], 3)
    # fragility: rerun with a uniform polling miss each way
    for sgn, k in ((-1, "missR"), (1, "missD")):
        sc = simulate(R, modeled, PARAMS["scenario_sims"], shift=sgn * PARAMS["miss"], light=True)["contests"]
        for cid, v in sc.items(): C[cid][k] = v["pControl"]
    order = [c["id"] for c in allc]; primary = next((c["id"] for c in modeled), None)
    dis = disagree(R)
    lg, week = track(eid, R, C, cache)
    out = {"election": eid, "asof": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "params": PARAMS,
           "env": {"national": round(nat_d, 1), "natl2024": round(natl24, 1), "swing": round(swing, 1), "baseline": base.get("label"),
                   "source": (E.get("environment") or {}).get("national", "generic")},
           "order": order, "primary": primary, "contests": C, "races": {x["id"]: x for x in R}, "disagree": dis[:10], "week": week}
    out["senate"] = C.get("senate")          # back-compat for older clients
    out["house"] = C.get("house")
    out["read"], out["brief"] = takeaways(out)
    out["track"] = lg
    if edate and today() <= edate:
        try: json.dump(out, open(os.path.join(cache, f"forecast_final_{eid}.json"), "w"))
        except Exception as e: log("final write failed", e)
    log(f"{eid}: {len(R)} races; " + ", ".join(f"{k} D {v.get('pControl')} (mkt {v.get('market')})" for k, v in C.items()) + f"; {round(time.time() - t0, 2)}s")
    return out

def comp(x): return any(v is not None and .1 <= v <= .9 for v in (x.get("model"), x.get("mkt")))

def disagree(R):
    dis = []
    for x in R:
        if x["gap"] is None or not comp(x): continue
        sides = {"model": x["model"] >= .5, "market": x["mkt"] >= .5}
        if x["raterMargin"] is not None and abs(x["raterMargin"]) >= 1: sides["raters"] = x["raterMargin"] > 0
        if x["poll"] is not None and abs(x["poll"]) >= 1: sides["polls"] = x["poll"] > 0
        if abs(x["gap"]) >= PARAMS["gap_flag"] or sides["model"] != sides["market"]:
            dis.append({"id": x["id"], "gap": x["gap"], "sides": sides,
                        "score": round(abs(x["gap"]) + (.08 if sides["model"] != sides["market"] else 0) + 2 * (x.get("leverage") or 0), 3)})
    return sorted(dis, key=lambda d: -d["score"])

# ---------- the read ----------
def short(x):
    t = x.get("title") or x["id"]
    t = re.sub(r"\s*\(president\)$", "", t)
    return re.sub(r"\s+(Senate|Governor)$", "", t) + (" Senate" if x["type"] == "senate" else " governor" if x["type"] == "governor" else "")
P_ = lambda p: f"{round(p * 100)}%"
PARTY = {"D": "Democrats", "R": "Republicans", "I": "the independent"}

def takeaways(M):
    """(read, brief): read = at most 3 ranked, decision-grade takeaways; brief = the longer list for 'Under the hood'."""
    C, R, pid = M["contests"], list(M["races"].values()), M["primary"]
    cand = []   # (priority, item)
    pc = C.get(pid) if pid else None
    if pc and pc.get("tipping"):
        x = M["races"].get(pc["tipping"][0]["id"])
        if x:
            c = x["cands"]; ds = x["dside"]; dn, rn = last(c.get(ds)), last(c.get("R"))
            dl = dn or PARTY.get(ds, ds)
            if x["poll"] is not None:
                lead = dl if x["poll"] > 0 else (rn or "Republicans")
                ps = f"{lead} leads by {abs(x['poll']):.1f} in the polls" if abs(x["poll"]) >= .5 else "the polls are tied"
            else: ps = "no public polls yet"
            if x["mkt"] is None: ms = f"the model gives {dl} {P_(x['model'])}"
            else:
                g = x["mkt"] - x["model"]
                ms = (f"markets price {dl} at {P_(x['mkt'])}, {'ahead of' if g > 0 else 'behind'} what {'the polls support' if x['poll'] is not None else 'fundamentals and ratings support'} (model {P_(x['model'])})" if abs(g) >= .07
                      else f"markets ({P_(x['mkt'])}) and the model ({P_(x['model'])}) agree")
            cand.append((0, {"t": f"Tipping point is {short(x)}: {ps}; {ms}.", "race": x["id"], "k": "tip"}))
    for w in (M.get("week") or [])[:1]:
        cand.append((1, {**w, "k": "week"}))
    if pc and pc.get("missR") is not None:
        lab = "White House" if pc["label"].lower().startswith("presiden") else pc["label"]
        cand.append((2, {"t": f"Fragility: if the polls miss toward Republicans by {PARAMS['miss']:.0f} pts (2024-sized), Democrats' {lab} odds go from {P_(pc['pControl'])} to {P_(pc['missR'])}; a miss the other way lifts them to {P_(pc['missD'])}.", "k": "fragile"}))
    cd = sorted([x for x in R if x["type"] == "senate" and x["candidateDriven"] and x["obsSrc"] == "polls" and comp(x)], key=lambda x: -abs(x["over"]))
    if cd:
        x = cd[0]; w = x["overWho"] or {}
        cand.append((3, {"t": f"{short(x)} is a candidate race: {w.get('name') or PARTY.get(w.get('party'), '')} runs {abs(x['over']):.0f} pts ahead of the party baseline. Don't read national moves into it.", "race": x["id"], "k": "cand"}))
    dg = sorted([x for x in R if x["gap"] is not None and comp(x) and abs(x["gap"]) >= PARAMS["gap_flag"]], key=lambda x: -abs(x["gap"]) - (.1 if x["nPolls"] else 0) - 2 * (x.get("leverage") or 0))
    if dg:
        x = dg[0]
        cand.append((4, {"t": f"Biggest model-vs-market gap: {short(x)}, model {P_(x['model'])} vs markets {P_(x['mkt'])} for {last(x['cands'].get(x['dside'])) or PARTY.get(x['dside'])}." +
                         (" No public polls, so lower confidence." if not x["nPolls"] else " Either the market knows something the polls don't, or it's mispriced."), "race": x["id"], "k": "gap"}))
    cand.sort(key=lambda c: c[0]); items = [c[1] for c in cand]
    brief = list(items)
    if pc:
        lv = sorted([x for x in R if x.get("contest") == pid and x.get("leverage")], key=lambda x: -x["leverage"])
        tot = sum(x["leverage"] for x in lv) or 1
        if lv: brief.append({"t": "Highest leverage: " + ", ".join(f"{short(x)} ({round(x['leverage'] / tot * 100)}%)" for x in lv[:3]) + f" of the map's leverage (simulations where the race is within {PARAMS['close']} pts and decides control on its own).", "k": "pivotal"})
    return items[:3], brief

# ---------- 4. accountability ----------
def _load(p):
    try: return json.load(open(p))
    except Exception: return None

def track(eid, R, C, cache):
    """One snapshot per UTC day; returns (summary, week): week = threshold-crossing moves vs ~7 days ago."""
    p = os.path.join(cache, f"forecast_log_{eid}.json")
    L = _load(p)
    if L is None and eid == "midterms-2026": L = _load(os.path.join(cache, "forecast_log.json"))   # pre-v5 file name
    L = L or {}
    for d, s in L.items():   # pre-v5 entries stored the Senate pair under "senate"
        if "contests" not in s and s.get("senate"): s["contests"] = {"senate": s["senate"]}
    day = today().isoformat()
    L[day] = {"races": {x["id"]: [x["model"], x["mkt"]] for x in R if x["type"] != "president" or comp(x)},
              "contests": {k: [v.get("pControl"), v.get("market")] for k, v in C.items()}}
    try: json.dump(L, open(p, "w"))
    except Exception as e: log("log write failed", e)
    days = sorted(L); week = []
    old = [d for d in days if (today() - dt.date.fromisoformat(d)).days >= 5]
    if old:
        o = L[min(old, key=lambda d: abs((today() - dt.date.fromisoformat(d)).days - 7))]; since = dt.date.fromisoformat(min(old, key=lambda d: abs((today() - dt.date.fromisoformat(d)).days - 7)))
        for k, v in C.items():
            ov = (o.get("contests") or {}).get(k)
            if not ov: continue
            for j, src in ((0, "model"), (1, "markets")):
                if ov[j] is not None and v.get("pControl" if j == 0 else "market") is not None:
                    d = (v["pControl"] if j == 0 else v["market"]) - ov[j]
                    if abs(d) >= .05: week.append({"t": f"{v['label']} odds ({src}) moved {P_(ov[j])} → {P_(ov[j] + d)} for Democrats since {since.strftime('%b %-d')}.", "lean": "D" if d > 0 else "R", "src": "Signal forecast log", "mag": abs(d)})
        for x in R:
            ov = (o.get("races") or {}).get(x["id"])
            if ov and ov[0] is not None and comp(x) and abs(x["model"] - ov[0]) >= .10:
                d = x["model"] - ov[0]
                week.append({"t": f"{short(x)}: model moved {P_(ov[0])} → {P_(x['model'])} for {last(x['cands'].get(x['dside'])) or x['dside']} in a week.", "lean": x["dside"] if d > 0 else "R", "race": x["id"], "src": "Signal forecast log", "mag": abs(d)})
        week.sort(key=lambda w: -w["mag"])
    return {"since": days[0], "days": len(days), "history": [{"d": d, "contests": L[d].get("contests")} for d in days[-90:]]}, week[:4]

def results_for(E, cache):
    """Winner per race: data/elections/results/<id>.json ({race_id: "D"|"R"|"I"}), else markets that settled (sticky once seen)."""
    eid = E.get("id"); src = "results file"
    res = _load(os.path.join(ROOT, "data", "elections", "results", f"{eid}.json"))
    if res is None:
        p = os.path.join(cache, f"results_{eid}.json"); res = _load(p) or {}; src = "settled prediction markets"
        for r in E.get("races", []):
            pD = r.get("pD")
            if r.get("id") not in res and pD is not None and (pD >= .97 or pD <= .03):
                c = cands(r); res[r["id"]] = dside(c) if pD >= .97 else "R"
        try: json.dump(res, open(p, "w"))
        except Exception: pass
    return res, src

def scorecard(E, fin, cache):
    res, src = results_for(E, cache)
    rows = []
    for i, x in (fin.get("races") or {}).items():
        if i not in res or x.get("model") is None: continue
        won = 1 if res[i] in ("D", "I") else 0
        rows.append({"id": i, "title": x.get("title"), "model": x["model"], "mkt": x.get("mkt"), "won": won, "comp": comp(x)})
    def grade(key, rs):
        rs = [r for r in rs if r[key] is not None]
        if not rs: return None
        return {"brier": round(sum((r[key] - r["won"]) ** 2 for r in rs) / len(rs), 4), "hits": sum((r[key] >= .5) == bool(r["won"]) for r in rs), "n": len(rs)}
    cr = [r for r in rows if r["comp"]]
    misses = sorted([r for r in rows if (r["model"] >= .5) != bool(r["won"])], key=lambda r: -abs(r["model"] - .5))[:6]
    out = {"source": src, "resolved": len(rows), "competitive": {"model": grade("model", cr), "market": grade("mkt", cr)},
           "all": {"model": grade("model", rows), "market": grade("mkt", rows)}, "misses": misses, "forecastAsOf": fin.get("asof"), "contests": {}}
    for cid, c in (fin.get("contests") or {}).items():
        if not c.get("hist"): continue
        mem = [x for x in fin["races"].values() if x.get("contest") == cid]
        if not mem or not all(x["id"] in res for x in mem): continue
        actual = c["dFixed"] + sum(x.get("weight", 1) for x in mem if res[x["id"]] in ("D", "I"))
        out["contests"][cid] = {"actual": actual, "mean": c["seatsMean"], "p10": c["p10"], "p90": c["p90"], "pControl": c["pControl"], "market": c.get("market"),
                                "dControl": actual >= c["winAt"], "inRange": c["p10"] <= actual <= c["p90"]}
    return out
