"""Final-stretch tells, refreshed daily: early vote (UF Election Lab) and late outside money (FEC 24/48-hour independent
expenditure notices). Neither feeds the model's math; both surface as 'This week' items and race-sheet detail, because they
reveal what the parties and voters are actually doing while polls lag.

Early vote: data-downloads/earlyvote/<year>/US.csv (UF Election Lab, CC BY-NC-ND 4.0, personal non-commercial display).
  Per state: ballots cast, share of the previous comparable turnout (2022 for 2026), party split where states register by party,
  mail return rates by party. Our own daily snapshots give week-over-week change (the lab doesn't publish history).
Late money: api.open.fec.gov schedule_e, Senate, last 21 days, largest notices first (keyset pages until items < $25k).
  Per race: D/I side (support D/I + oppose R) vs R side, last 7 days vs the prior 14, top spenders. A party pulling money
  out of a race, or flooding one late, is its own internal polling talking."""
import csv, io, json, math, os, time, datetime as dt
import requests

UA = {"User-Agent": "signal-pwa/1.0 (personal dashboard; github.com/BanjoN3g1/signal)"}
EV_URL = "https://election.lab.ufl.edu/data-downloads/earlyvote/{year}/US.csv"
FEC = "https://api.open.fec.gov/v1/schedules/schedule_e/"
def log(*a): print("[tells]", *a, flush=True)
def _load(p, d=None):
    try: return json.load(open(p))
    except Exception: return d
def _i(x):
    try: return int(float(x))
    except Exception: return 0
def money_s(v): return f"${v / 1e6:.1f}M" if v >= 1e6 else f"${v / 1e3:.0f}k" if v >= 1e3 else "$0"

# ---------- early vote ----------
def early_vote(year, cache):
    p = os.path.join(cache, f"ev_{year}.json"); c = _load(p, {})
    if not c.get("rows") or time.time() - c.get("t", 0) > 3 * 3600:
        try:
            r = requests.get(EV_URL.format(year=year), headers=UA, timeout=30); r.raise_for_status()
            rows = list(csv.DictReader(io.StringIO(r.text)))
            if rows: c = {"t": time.time(), "rows": rows}; json.dump(c, open(p, "w"))
        except Exception as e: log("early vote fetch", e)
    rows = c.get("rows") or []
    if not rows: return None
    prevcol = next((k for k in rows[0] if k.startswith("turn_")), None)
    S = {}
    for x in rows:
        st = x.get("state_abbv"); v = _i(x.get("voted_all"))
        if not st or not v: continue
        dem, rep, non = _i(x.get("voted_dem")), _i(x.get("voted_rep")), _i(x.get("voted_none"))
        prev = _i(x.get(prevcol)) if prevcol else 0
        s = {"voted": v, "prev": prev, "pct": round(v / prev, 3) if prev else None, "updated": x.get("last_update"), "mail": _i(x.get("accept_all")), "inPerson": _i(x.get("inperson_all"))}
        if dem + rep > 0.5 * v:
            s.update({"dem": dem, "rep": rep, "none": non, "lead": round((dem - rep) / v * 100, 1)})
            rq_d, rq_r, ac_d, ac_r = _i(x.get("request_dem")), _i(x.get("request_rep")), _i(x.get("accept_dem")), _i(x.get("accept_rep"))
            if rq_d and rq_r and ac_d + ac_r: s["retD"], s["retR"] = round(ac_d / rq_d, 3), round(ac_r / rq_r, 3)
        S[st] = s
    # our own daily snapshots -> week-over-week
    hp = os.path.join(cache, f"ev_hist_{year}.json"); H = _load(hp, {})
    day = dt.date.today().isoformat()
    H[day] = {st: [s["voted"], s.get("lead")] for st, s in S.items()}
    H = {d: v for d, v in H.items() if (dt.date.today() - dt.date.fromisoformat(d)).days <= 60}
    try: json.dump(H, open(hp, "w"))
    except Exception: pass
    days = sorted(H)
    old = [d for d in days if (dt.date.today() - dt.date.fromisoformat(d)).days >= 5]
    prev_day = [d for d in days if d < day]
    for st, s in S.items():
        if prev_day and st in H[prev_day[-1]]: s["d1"] = s["voted"] - H[prev_day[-1]][st][0]
        if old:
            o = H[old[-1]].get(st)
            if o:
                s["d7"] = s["voted"] - o[0]; s["since"] = old[-1]
                if o[1] is not None and s.get("lead") is not None: s["lead7"] = round(s["lead"] - o[1], 1)
        s["series"] = [[d, H[d][st][0]] for d in days if st in H[d]][-30:]
    nv = sum(s["voted"] for s in S.values()); npv = sum(s["prev"] for s in S.values() if s["prev"])
    return {"asof": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "year": year, "prevLabel": prevcol.replace("turn_", "") if prevcol else None,
            "nat": {"voted": nv, "prev": npv, "pct": round(nv / npv, 3) if npv else None}, "states": S, "history_days": len(days),
            "source": "UF Election Lab", "url": "https://election.lab.ufl.edu/early-vote/", "license": "CC BY-NC-ND 4.0"}

# ---------- late outside money ----------
def late_money(E, cache, key):
    year = int((E.get("date") or "2026")[:4]); today = dt.date.today()
    p = os.path.join(cache, f"latemoney_{E.get('id')}.json"); c = _load(p, {})
    if not c.get("items") or time.time() - c.get("t", 0) > 12 * 3600:
        items, params = [], {"api_key": key, "cycle": year + (year % 2), "candidate_office": "S", "min_date": (today - dt.timedelta(days=21)).isoformat(),
                             "per_page": 100, "sort": "-expenditure_amount", "is_notice": "true", "most_recent": "true"}
        try:
            for _ in range(8):
                r = requests.get(FEC, params=params, headers=UA, timeout=30)
                if r.status_code == 429: log("FEC rate-limited"); break
                r.raise_for_status(); j = r.json(); rs = j.get("results") or []
                items += [{"st": x.get("candidate_office_state"), "cand": x.get("candidate_name"), "party": (x.get("candidate_party") or "")[:3], "so": x.get("support_oppose_indicator"),
                           "amt": x.get("expenditure_amount") or 0, "date": x.get("expenditure_date") or x.get("dissemination_date"), "com": (x.get("committee") or {}).get("name") or x.get("committee_name")} for x in rs]
                li = (j.get("pagination") or {}).get("last_indexes") or {}
                if not rs or not li or (rs[-1].get("expenditure_amount") or 0) < 25000: break
                params.update(li); time.sleep(0.5)
            if items: c = {"t": time.time(), "items": items, "pages": True}; json.dump(c, open(p, "w"))
        except Exception as e: log("late money fetch", e)
    items = c.get("items") or []
    if not items: return None
    races = {r["state"]: r for r in E.get("races", []) if r["type"] == "senate" and r.get("state")}
    cut7 = (today - dt.timedelta(days=7)).isoformat()
    out = {}
    for x in items:
        r = races.get(x["st"])
        if not r or not x["date"] or x["so"] not in ("S", "O"): continue
        anti = x["party"] in ("DEM", "IND", "DFL")
        side = ("D" if anti else "R") if x["so"] == "S" else ("R" if anti else "D")
        o = out.setdefault(r["id"], {"d7": 0, "r7": 0, "dPrev": 0, "rPrev": 0, "coms": {}})
        k = ("d" if side == "D" else "r") + ("7" if x["date"][:10] >= cut7 else "Prev")
        o[k] += x["amt"]
        cm = o["coms"].setdefault((x["com"] or "?")[:60], [side, 0]); cm[1] += x["amt"]
    for o in out.values():
        o["top"] = [{"com": k, "side": v[0], "amt": round(v[1])} for k, v in sorted(o.pop("coms").items(), key=lambda kv: -kv[1][1])[:5]]
        for k in ("d7", "r7", "dPrev", "rPrev"): o[k] = round(o[k])
    return {"asof": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "windowDays": 21, "minItem": min(x["amt"] for x in items), "items": len(items),
            "races": out, "source": "FEC 24/48-hour independent expenditure notices", "url": "https://www.fec.gov/data/independent-expenditures/"}

# ---------- tells: threshold-crossing items for 'This week' ----------
def tells(M, ev, lm, titles):
    """Items {t, lean, race, src, mag}. Only things that cross a threshold; weighted toward races that decide control."""
    out = []; R = (M or {}).get("races") or {}
    lev = lambda rid: (R.get(rid) or {}).get("leverage") or 0
    name = lambda rid: titles.get(rid, rid)
    def live(rid):   # only races still in play: competitive in the model or markets, or able to decide control
        x = R.get(rid) or {}
        return lev(rid) > .005 or any(v is not None and .1 <= v <= .9 for v in (x.get("model"), x.get("mkt")))
    for rid, o in ((lm or {}).get("races") or {}).items():
        if not live(rid): continue
        d7, r7, dp, rp = o["d7"], o["r7"], o["dPrev"], o["rPrev"]
        if d7 + r7 >= 1e6 and min(d7, r7) > 0 and max(d7, r7) / min(d7, r7) >= 1.8:
            hi = "R" if r7 > d7 else "D"
            out.append({"t": f"Outside money, {name(rid)}: {'Republican' if hi == 'R' else 'Democratic'}-side groups outspent the other side {max(d7, r7) / min(d7, r7):.1f}:1 over the past week ({money_s(max(d7, r7))} vs {money_s(min(d7, r7))}).",
                        "lean": hi, "race": rid, "src": "FEC 24/48-hour reports", "mag": .06 + math.log(max(d7, r7) / min(d7, r7)) * .05 + lev(rid)})
        for side, now, prev in (("D", d7, dp), ("R", r7, rp)):
            wk = prev / 2
            if wk >= 1e6 and now < .4 * wk:
                out.append({"t": f"Pullback, {name(rid)}: {'Democratic' if side == 'D' else 'Republican'}-side outside spending fell {round((1 - now / wk) * 100)}% vs the prior two weeks' pace ({money_s(now)} this week). Parties cut races their own polling says are lost, or safe.",
                            "lean": "R" if side == "D" else "D", "race": rid, "src": "FEC 24/48-hour reports", "mag": .12 + lev(rid)})
            elif now >= 2e6 and wk >= 5e5 and now >= 2.5 * wk:
                out.append({"t": f"Surge, {name(rid)}: {'Democratic' if side == 'D' else 'Republican'}-side outside spending jumped to {money_s(now)} this week ({now / max(wk, 1):.1f}× its prior pace). Someone's polling says it's in play.",
                            "lean": side, "race": rid, "src": "FEC 24/48-hour reports", "mag": .09 + lev(rid)})
    keyst = {(R[k].get("state")): k for k in sorted(R, key=lambda k: -(R[k].get("leverage") or 0)) if R[k].get("leverage")}
    for st, s in ((ev or {}).get("states") or {}).items():
        if st in keyst and s.get("lead7") is not None and abs(s["lead7"]) >= 3:
            rid = keyst[st]
            out.append({"t": f"Early vote, {name(rid).replace(' Senate', '')}: Democrats' registration edge among ballots cast {'grew' if s['lead7'] > 0 else 'narrowed'} by {abs(s['lead7'])} pts in a week (now {'D' if s['lead'] >= 0 else 'R'}+{abs(s['lead'])}). Party registration isn't a vote, but the direction is informative.",
                        "lean": "D" if s["lead7"] > 0 else "R", "race": rid, "src": "UF Election Lab", "mag": .05 + abs(s["lead7"]) / 100 + lev(rid)})
    best = {}
    for x in sorted(out, key=lambda x: -x["mag"]):   # one item per race and source: the strongest
        best.setdefault((x.get("race"), x["src"]), x)
    return sorted(best.values(), key=lambda x: -x["mag"])[:4]
