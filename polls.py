"""Quality-weighted polling average (replaces 'average of the last 5 Wikipedia polls').

Per poll weight = recency (half-life 14 days, polls older than 60 days dropped)
                × sample size (sqrt(n/600), capped at n=1,500)
                × population (likely voters 1.0, registered 0.8, adults 0.6)
                × 0.5 if the poll was paid for by a party/campaign (Wikipedia tags these "(R)"/"(D)")
                ÷ sqrt(polls by the same pollster in the race)   (one prolific pollster can't swamp the average)
House effects: a pollster's average lean vs the other polls of the same races, pooled across every race we track, shrunk
toward 0 (or toward ±2 pts for party-sponsored polls) so a pollster with one poll barely moves. Subtracted before averaging.
Banned: pollsters that admitted fabricating results (Silver Bulletin banned Wedgewood in Oct 2026).
Outputs per race: margin (D/I minus R), effective number of polls, spread, and every poll with its weight and adjustment."""
import math, re, datetime as dt

BANNED = ("wedgewood",)
HALF_LIFE, MAX_AGE, K_SHRINK, PARTISAN_LEAN = 14.0, 60, 2.0, 2.0
POP_W = {"LV": 1.0, "RV": 0.8, "A": 0.6}
_MON = {"sept": "sep"}

def parse_end(s, today=None):
    s = (s or "").replace("–", "-").replace("—", "-")
    m = re.findall(r"([A-Z][a-z]+)\.?\s+(\d{1,2})(?:\s*-\s*(?:([A-Z][a-z]+)\.?\s+)?(\d{1,2}))?,?\s*(\d{4})?", s)
    if not m: return None
    mon1, d1, mon2, d2, yr = m[-1]
    mon, day = (mon2 or mon1), (d2 or d1)
    yr = yr or next((x[4] for x in reversed(m) if x[4]), None) or str((today or dt.date.today()).year)
    mon = _MON.get(mon.lower(), mon.lower())[:3]
    try: return dt.datetime.strptime(f"{mon} {day} {yr}", "%b %d %Y").date()
    except ValueError: return None

def pollster_key(p):
    s = re.sub(r"\[.*?\]", "", p or "")
    party = re.search(r"\((R|D)\)", s)
    name = re.split(r"\s*/\s*|\s+on behalf of\s+", s)[0]
    name = re.sub(r"\(.*?\)", "", name).strip().lower()
    return name, (party.group(1) if party else None)

def sample_of(s):
    m = re.search(r"([\d,]{2,})\s*\(?\s*(LV|RV|A)\b", s or "")
    if m: return int(m.group(1).replace(",", "")), m.group(2)
    m = re.search(r"([\d,]{3,})", s or ""); pop = re.search(r"\b(LV|RV|A)\b", s or "")
    return (int(m.group(1).replace(",", "")) if m else None), (pop.group(1) if pop else None)

def _polls(r, today):
    """Polls of one race in D terms with base weights. r needs pollData.trend and _pollD (index of the D/I candidate)."""
    pd, di = r.get("pollData") or {}, r.get("_pollD")
    if di is None or not pd.get("trend"): return []
    out, seen = [], set()
    for p in pd["trend"]:
        end = parse_end(p.get("dates"), today)
        if not end or (today - end).days > MAX_AGE or end > today + dt.timedelta(days=1): continue
        name, party = pollster_key(p.get("pollster"))
        if not name or any(b in name for b in BANNED): continue
        n, pop = sample_of(p.get("sample"))
        if (name, end) in seen: continue             # same poll published as LV and RV: keep the first (Wikipedia lists LV first)
        seen.add((name, end))
        a, b = p.get("a"), p.get("b")
        if a is None or b is None: continue
        marg = (a - b) if di == 0 else (b - a)
        age = max(0, (today - end).days)
        w = 0.5 ** (age / HALF_LIFE) * math.sqrt(min(n or 600, 1500) / 600) * POP_W.get(pop, 0.85) * (0.5 if party else 1.0)
        out.append({"pollster": (p.get("pollster") or "")[:48], "key": name, "party": party, "end": end.isoformat(), "age": age, "n": n, "pop": pop, "raw": round(marg, 1), "w0": w})
    cnt = {}
    for p in out: cnt[p["key"]] = cnt.get(p["key"], 0) + 1
    for p in out: p["w0"] /= math.sqrt(cnt[p["key"]])
    return out

def _wmean(ps, k):
    sw = sum(p["w0"] for p in ps)
    return sum(p["w0"] * p[k] for p in ps) / sw if sw else None

def average(races, today=None):
    """Mutates races: sets pollAvg and pollMarginD (D/I minus R) from the quality-weighted, house-adjusted average."""
    today = today or dt.date.today()
    P = {r["id"]: _polls(r, today) for r in races}
    P = {k: v for k, v in P.items() if v}
    m1 = {k: _wmean(v, "raw") for k, v in P.items()}
    acc = {}   # pollster -> [sum w*res, sum w, party]
    for k, ps in P.items():
        if len(ps) < 2: continue                     # a lone poll has no 'others' to lean against
        for p in ps:
            a = acc.setdefault(p["key"], [0.0, 0.0, p["party"]]); a[0] += p["w0"] * (p["raw"] - m1[k]); a[1] += p["w0"]
    house = {}
    for key, (swr, sw, party) in acc.items():
        h0 = PARTISAN_LEAN if party == "D" else -PARTISAN_LEAN if party == "R" else 0.0
        house[key] = (swr + K_SHRINK * h0) / (sw + K_SHRINK)
    for r in races:
        ps = P.get(r["id"])
        if not ps: continue
        for p in ps:
            h = house.get(p["key"], PARTISAN_LEAN if p["party"] == "D" else -PARTISAN_LEAN if p["party"] == "R" else 0.0)
            p["house"] = round(h, 1); p["adj"] = round(p["raw"] - h, 1)
        sw = sum(p["w0"] for p in ps); sw2 = sum(p["w0"] ** 2 for p in ps)
        m = sum(p["w0"] * p["adj"] for p in ps) / sw
        sd = math.sqrt(sum(p["w0"] * (p["adj"] - m) ** 2 for p in ps) / sw) if len(ps) > 1 else None
        simple = r.get("pollMarginD")
        for p in ps: p["share"] = round(p["w0"] / sw, 3); p.pop("w0", None); p.pop("key", None)
        r["pollAvg"] = {"margin": round(m, 1), "n": len(ps), "neff": round(sw * sw / sw2, 1), "sd": round(sd, 1) if sd is not None else None,
                        "simple": simple, "polls": sorted(ps, key=lambda p: p["end"], reverse=True)[:20],
                        "method": "recency (14-day half-life) × sample × LV/RV × partisan haircut, house effects pooled across races"}
        r["pollMarginD"] = round(m, 1)
    return {k: round(v, 1) for k, v in house.items()}
