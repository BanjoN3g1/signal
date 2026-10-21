#!/usr/bin/env python3
"""Podcasts for Signal: public RSS feeds -> transcript -> summary -> data/podcasts/podcasts.json.
Transcript: publisher transcript (podcast:transcript tag) if present, else faster-whisper (CPU) on new episodes only.
Summary: free-tier LLM if a key is set (see llm.py), else an extractive summary (quotes picked from the transcript).
Everything is cached per episode in data/podcasts/ep_*.json, so each episode is processed once."""
import json, os, re, sys, time, hashlib, gzip, html, subprocess, tempfile, datetime as dt
import email.utils, xml.etree.ElementTree as ET
import requests
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("PODCAST_DIR") or os.path.join(ROOT, "data", "podcasts")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Signal podcast reader/1.0 (personal dashboard; github.com/BanjoN3g1/signal)"}
NS = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd", "podcast": "https://podcastindex.org/namespace/1.0"}
SHOWS = [
    {"id": "allin", "name": "All-In", "by": "Chamath, Jason, Sacks & Friedberg", "feed": "https://rss.libsyn.com/shows/254861/destinations/1928300.xml"},
    {"id": "machinegods", "name": "Machine Gods", "by": "Kevin Roose & Casey Newton · NPR", "feed": "https://feeds.npr.org/g-s1-143588/podcast.xml"},
    {"id": "pivot", "name": "Pivot", "by": "Kara Swisher & Scott Galloway", "feed": "https://feeds.megaphone.fm/pivot"},
    {"id": "profg", "name": "Prof G Markets", "by": "Scott Galloway · Vox Media", "feed": "https://feeds.megaphone.fm/profgmarkets"},
    {"id": "bigtake", "name": "The Big Take", "by": "Bloomberg", "feed": "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/825d4e29-b616-46f4-afd7-ae2b0013005c/8b1dd624-a026-43e9-8b57-ae2b00130066/podcast.rss"},
    {"id": "oddlots", "name": "Odd Lots", "by": "Bloomberg", "feed": "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/8a94442e-5a74-4fa2-8b8d-ae27003a8d6b/982f5071-765c-403d-969d-ae27003a8d83/podcast.rss"},
    {"id": "gsx", "name": "Goldman Sachs Exchanges", "by": "Goldman Sachs", "feed": "https://feeds.megaphone.fm/GLD9218176758"},
]
PER_SHOW = int(os.environ.get("PODCAST_PER_SHOW", 3))     # newest episodes kept per show
MAX_AGE_DAYS = 21
MAX_WHISPER = int(os.environ.get("PODCAST_MAX_WHISPER", 4))  # audio transcriptions per run (each ~3-6 min on a runner)
MAX_MIN = 100                                                # skip audio longer than this
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")
def log(*a): print(*a, file=sys.stderr, flush=True)

def dur_s(v):
    if not v: return None
    try:
        p = [float(x) for x in v.split(":")]
        return int(sum(x * 60 ** i for i, x in enumerate(reversed(p))))
    except ValueError: return None

def feed(show):
    r = requests.get(show["feed"], headers=UA, timeout=30); r.raise_for_status()
    ch = ET.fromstring(r.content).find("channel"); eps = []
    img = ch.find("itunes:image", NS)
    show["art"] = img.get("href") if img is not None else None
    for it in ch.findall("item")[:PER_SHOW]:
        enc = it.find("enclosure"); pub = it.findtext("pubDate")
        try: when = email.utils.parsedate_to_datetime(pub)
        except Exception: continue
        if when.tzinfo is None: when = when.replace(tzinfo=dt.timezone.utc)  # '-0000' parses as naive
        if (dt.datetime.now(dt.timezone.utc) - when).days > MAX_AGE_DAYS: continue
        trs = it.findall("podcast:transcript", NS)
        guid = it.findtext("guid") or (enc.get("url") if enc is not None else it.findtext("title"))
        eps.append({"key": hashlib.sha1(guid.encode()).hexdigest()[:16], "show": show["id"], "title": html.unescape(it.findtext("title") or ""),
                    "date": when.isoformat(), "dur": dur_s(it.findtext("itunes:duration", namespaces=NS)),
                    "link": it.findtext("link") or show["feed"], "audio": enc.get("url") if enc is not None else None,
                    "desc": re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(it.findtext("description") or "")))[:600],
                    "transcripts": [{"url": t.get("url"), "type": t.get("type")} for t in trs]})
    return eps

TS = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")
def _sec(h, m, s, ms): return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000
def cues(raw):
    """SRT/VTT -> [(start, end, text)]"""
    out = []
    for blk in re.split(r"\n\s*\n", raw.replace("\r", "")):
        m = TS.search(blk)
        if not m: continue
        body = blk[m.end():].strip()
        t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body))).strip()
        if t: out.append((_sec(*m.groups()[:4]), _sec(*m.groups()[4:]), t))
    return out

def blocks_from(segs, timed=True):
    """Merge short cues/segments into ~20-35 s passages (or ~80 words when untimed): [{"s","e","t"}]."""
    out, cur = [], None
    for s, e, t in segs:
        if cur is None: cur = {"s": s, "e": e, "t": t}
        else: cur["e"] = e; cur["t"] += " " + t
        span = (cur["e"] - cur["s"]) if timed else len(cur["t"].split()) / 2.5
        if span >= 35 or (span >= 20 and re.search(r"[.!?][\"')]*$", cur["t"])):
            out.append(cur); cur = None
    if cur: out.append(cur)
    for b in out:
        if timed: b["s"], b["e"] = round(b["s"], 1), round(b["e"], 1)
        else: b.pop("s"); b.pop("e")
    return out

def untimed_blocks(text):
    w = text.split()
    return [{"t": " ".join(w[i:i + 80])} for i in range(0, len(w), 80)]

def publisher_transcript(ep):
    """-> (text, url, blocks) ; blocks carry times when the publisher's transcript has them (SRT/VTT/JSON)."""
    order = sorted(ep["transcripts"], key=lambda t: ["text/vtt", "application/srt", "application/x-subrip", "text/plain", "text/html", "application/json"].index(t["type"]) if t["type"] in ["text/vtt", "application/srt", "application/x-subrip", "text/plain", "text/html", "application/json"] else 9)
    for t in order:
        try:
            r = requests.get(t["url"], headers=UA, timeout=30)
            if r.status_code != 200: continue
            x, blocks = r.text, None
            if "json" in (t["type"] or ""):
                sg = r.json().get("segments", [])
                x = " ".join(s.get("body", "") for s in sg)
                if sg and all("startTime" in s for s in sg):
                    blocks = blocks_from([(float(s["startTime"]), float(s.get("endTime", s["startTime"])), s.get("body", "").strip()) for s in sg])
            else:
                cs = cues(x)
                if len(cs) > 20: blocks = blocks_from(cs)
                x = re.sub(r"<[^>]+>", " ", x)
                x = re.sub(r"(?m)^(WEBVTT.*|\d+|[\d:.,]+ --> [\d:.,]+.*)$", " ", x)
            x = re.sub(r"\s+", " ", html.unescape(x)).strip()
            if len(x.split()) > 300: return x, t["url"], blocks or untimed_blocks(x)
        except Exception as e: log("transcript err", e)
    return None, None, None

_MODEL = []
def whisper(ep):
    if not ep["audio"] or (ep["dur"] and ep["dur"] > MAX_MIN * 60): return None, None, None
    from faster_whisper import WhisperModel
    import numpy as np
    with tempfile.TemporaryDirectory() as d:
        mp3, wav = os.path.join(d, "a.mp3"), os.path.join(d, "a.wav")
        t0 = time.time()
        with requests.get(ep["audio"], headers=UA, timeout=120, stream=True) as r:
            r.raise_for_status()
            with open(mp3, "wb") as f:
                for c in r.iter_content(1 << 16): f.write(c)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", mp3, "-ar", "16000", "-ac", "1", "-f", "s16le", wav], check=True)
        audio = np.fromfile(wav, np.int16).astype(np.float32) / 32768
        t1 = time.time()
        if not _MODEL: _MODEL.append(WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4))
        segs, info = _MODEL[0].transcribe(audio, language="en", vad_filter=True, beam_size=1)
        segs = [(s.start, s.end, s.text.strip()) for s in segs]
        txt = " ".join(s[2] for s in segs); t2 = time.time()
        stats = {"download_s": round(t1 - t0), "transcribe_s": round(t2 - t1), "audio_s": round(info.duration), "model": WHISPER_MODEL}
        log("whisper", ep["show"], ep["title"][:50], stats)
        return txt, stats, blocks_from(segs)

# ---------- summaries ----------
AD = re.compile(r"(sponsor|brought to you|promo code|use code|\.com/|support for (the show|this podcast)|ad-free|subscribe|terms apply|sign up|free trial|learn more at)", re.I)
BOOST = re.compile(r"\b(AI|chips?|semiconductor|Nvidia|software|SaaS|cloud|data center|valuation|multiple|IPO|M&A|acquisition|deal|rates?|Fed|tariffs?|earnings|guidance|margin|capex|revenue|growth|bubble|market|stocks?|investors?|private equity|credit|debt)\b", re.I)
STOP = set("the a an and or but of to in on for with is are was were be been it that this as at by from we you they i he she our your their not do does did have has had so if just like really know think going get got what about there here very can will would could".split())

def extractive(text, n=5):
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if 60 < len(s.strip()) < 320 and not AD.search(s)]
    if not sents: return [], []
    words = [w for w in re.findall(r"[a-z][a-z'-]+", text.lower()) if w not in STOP]
    freq = {}
    for w in words: freq[w] = freq.get(w, 0) + 1
    def score(s):
        ws = [w for w in re.findall(r"[a-z][a-z'-]+", s.lower()) if w not in STOP]
        return (sum(freq.get(w, 0) ** 0.5 for w in ws) / (len(ws) + 4)) * (1 + 0.6 * len(BOOST.findall(s)))
    ranked = sorted(range(len(sents)), key=lambda i: -score(sents[i]))
    key, used = [], set()
    for i in ranked:
        if len(key) >= n: break
        if any(abs(i - j) < 8 for j in used): continue  # spread across the episode
        key.append(i); used.add(i)
    nums = [s for s in sents if re.search(r"(\$\s?\d|\d+(\.\d+)? ?(%|percent|billion|million|trillion))", s) and not AD.search(s)]
    nums = sorted(nums, key=lambda s: -score(s))[:3]
    return [sents[i] for i in sorted(key)], nums

POD_SYS = """You summarize a podcast episode for a junior investment banker covering software and semiconductors.
The transcript is split into numbered passages like "[12 @14:05] text" (machine-generated, may contain errors; may be truncated).
Use ONLY the transcript. Ignore ads. Don't invent facts or numbers.
Every item must point to the passage(s) that support it: "p" = first passage number, "p2" = last (same as p if one passage; at most 4 apart),
and "q" = a short phrase copied word-for-word from that passage (6-15 words) so it can be highlighted.
Each item also gets "x", a short explainer for the banker: {"bg": background a newcomer needs (1 sentence), "why": why it matters (1 sentence), "so": implication for software/semis banking, e.g. M&A, ECM, comps (1 sentence)}.
Return JSON: {"takeaways": [3-5 items], "tidbits": [2-3 surprising or memorable specifics], "quotes": [2 notable verbatim quotes, "t" is the quote itself],
"implications": [2-3 items on what it means for software/semis markets, M&A or capital markets; if nothing relevant, one item saying "Not much for software/semis"]}
where every item is {"t": text, "p": int, "p2": int, "q": str, "x": {"bg": str, "why": str, "so": str}}."""
SUMMARY_V = 2  # v2 = items carry passage refs + explainers (drill-down)

def fmt_t(s): s = int(s); return f"{s // 3600}:{s // 60 % 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"
def _toks(s): return [w for w in re.findall(r"[a-z0-9']+", s.lower()) if w not in STOP]

def locate(q, blocks, hint=None):
    """Fuzzy-match phrase q to a passage index; prefer the model's hint if it matches nearly as well."""
    qt = set(_toks(q))
    if not qt or not blocks: return hint, 0
    def ov(s): return len(qt & set(_toks(s))) / len(qt)
    def sc(k):  # this passage alone, or (slightly discounted) straddling into the next one
        return max(ov(blocks[k]["t"]), 0.9 * ov(blocks[k]["t"] + " " + blocks[k + 1]["t"]) if k + 1 < len(blocks) else 0)
    best = max(range(len(blocks)), key=sc); bs = sc(best)
    if hint is not None and 0 <= hint < len(blocks):
        near = max(range(max(0, hint - 1), min(len(blocks), hint + 2)), key=sc)
        if sc(near) >= bs: return near, sc(near)
    return best, bs

def anchor(item, blocks):
    """Normalize a summary item to {"t", "p", "p2", "q", "x"} with verified passage refs."""
    if isinstance(item, str): item = {"t": item}
    if not isinstance(item, dict) or not item.get("t"): return None
    out = {"t": str(item["t"]).strip()}
    if isinstance(item.get("x"), dict): out["x"] = {k: str(item["x"][k]).strip() for k in ("bg", "why", "so") if item["x"].get(k)}
    q = str(item.get("q") or "").strip()
    try: hint = int(item.get("p"))
    except (TypeError, ValueError): hint = None
    k, score = locate(q or out["t"], blocks, hint)
    if k is None or (score < 0.5 and not (hint is not None and 0 <= hint < len(blocks))): return out  # can't place it honestly
    if score < 0.5: k = hint
    try: span = int(item.get("p2", k)) - (hint if hint is not None else k)
    except (TypeError, ValueError): span = 0
    out["p"], out["p2"] = k, min(len(blocks) - 1, k + max(0, min(span, 4)))
    if q: out["q"] = q
    return out

def summarize(ep, text, blocks):
    p = llm.provider()
    timed = bool(blocks) and "s" in blocks[0]
    if p and blocks:
        limit = 140000 if "Gemini" in p["name"] else 22000
        body = "\n".join(f"[{i}{' @' + fmt_t(b['s']) if timed else ''}] {b['t']}" for i, b in enumerate(blocks))
        res = llm.call("pod", POD_SYS, f"Show: {ep['showName']}. Episode: {ep['title']}\n\nTRANSCRIPT{' (truncated)' if len(body) > limit else ''}:\n{body[:limit]}",
                       os.environ.get("CACHE_DIR") if os.path.isdir(os.environ.get("CACHE_DIR", "")) else "/tmp", max_tokens=6000)
        if isinstance(res, dict) and res.get("takeaways"):
            out = {"kind": "ai", "v": SUMMARY_V, "model": res.get("_model"), "timed": timed}
            for k in ("takeaways", "tidbits", "quotes", "implications"):
                out[k] = [x for x in (anchor(i, blocks) for i in (res.get(k) or [])) if x]
            return out
    key, nums = extractive(text)
    return {"kind": "extract", "v": SUMMARY_V, "timed": timed, "quotes": [x for x in (anchor({"t": q, "q": q}, blocks or []) for q in key) if x], "numbers": nums}

TICKS = {"Nvidia": "NVDA", "AMD": "AMD", "Intel": "INTC", "Broadcom": "AVGO", "Qualcomm": "QCOM", "TSMC": "TSM", "ASML": "ASML", "Micron": "MU", "Arm": "ARM",
         "Microsoft": "MSFT", "Oracle": "ORCL", "Salesforce": "CRM", "ServiceNow": "NOW", "Adobe": "ADBE", "Snowflake": "SNOW", "Palantir": "PLTR",
         "CrowdStrike": "CRWD", "Cloudflare": "NET", "Datadog": "DDOG", "Shopify": "SHOP", "Workday": "WDAY", "Marvell": "MRVL", "Supermicro": "SMCI"}
def mentions(text):
    out = {}
    for nm, t in TICKS.items():
        c = len(re.findall(r"\b" + re.escape(nm) + r"\b", text))
        if c: out[t] = c
    return dict(sorted(out.items(), key=lambda x: -x[1])[:8])

def seg_path(key): return os.path.join(OUT, f"seg_{key}.json")
def needs_upgrade(prev):
    s = (prev or {}).get("summary") or {}
    if not llm.provider(): return False
    return s.get("kind") == "extract" or s.get("v") != SUMMARY_V

def main():
    t0 = time.time(); episodes, shows, whispered, errors, eps_all = [], [], 0, [], []
    for show in SHOWS:
        try: eps = feed(show)
        except Exception as e: errors.append(f"{show['name']}: feed {type(e).__name__}"); continue
        shows.append({k: show.get(k) for k in ("id", "name", "by", "art")})
        for ep in eps: ep["showName"] = show["name"]; eps_all.append(ep)
    eps_all.sort(key=lambda e: e["date"], reverse=True)  # newest first gets the whisper/AI budget
    KEEP = ("key", "show", "showName", "title", "date", "dur", "link", "desc", "audio")
    for ep in eps_all:
        cp, tp, sp = os.path.join(OUT, f"ep_{ep['key']}.json"), os.path.join(OUT, f"tx_{ep['key']}.txt.gz"), seg_path(ep["key"])
        prev = json.load(open(cp)) if os.path.exists(cp) else None
        if prev and not needs_upgrade(prev):
            prev["audio"] = ep["audio"]; episodes.append(prev); continue
        if prev and llm.remaining("pod", os.environ.get("CACHE_DIR", "/tmp")) <= 0:
            episodes.append(prev); continue  # backfill waits for tomorrow's AI budget
        text, src, blocks = None, (prev or {}).get("source"), None
        if os.path.exists(sp): blocks = json.load(open(sp))
        if blocks and os.path.exists(tp): text = gzip.open(tp, "rt").read()
        if not text and ep["transcripts"]:
            text, url, blocks = publisher_transcript(ep)
            if text: src = {"kind": "publisher", "url": url, "timed": "s" in blocks[0]}
        if not text and whispered < MAX_WHISPER:
            try:
                text, stats, blocks = whisper(ep); whispered += 1
                if text: src = {"kind": "whisper", **stats}
            except Exception as e: errors.append(f"{ep['title'][:40]}: whisper {type(e).__name__}: {str(e)[:80]}")
        if not text and prev: prev["audio"] = ep["audio"]; episodes.append(prev); continue
        if not text:
            episodes.append({**{k: ep[k] for k in KEEP}, "pending": True}); continue
        with gzip.open(tp, "wt") as f: f.write(text)
        json.dump(blocks, open(sp, "w"))
        summ = summarize(ep, text, blocks)
        if prev and summ["kind"] != "ai" and (prev.get("summary") or {}).get("kind") == "ai":
            prev["audio"] = ep["audio"]; episodes.append(prev); continue  # AI not available right now; keep the old one
        rec = {**{k: ep[k] for k in KEEP}, "source": src, "words": len(text.split()), "segs": len(blocks),
               "summary": summ, "mentions": mentions(text), "at": dt.datetime.now().astimezone().isoformat(timespec="seconds")}
        json.dump(rec, open(cp, "w")); episodes.append(rec)
    episodes.sort(key=lambda e: e["date"], reverse=True)
    out = {"generatedAt": dt.datetime.now().astimezone().isoformat(timespec="seconds"), "elapsedSec": round(time.time() - t0),
           "shows": shows, "episodes": episodes, "errors": errors + llm.STATE["errors"][-3:], "aiLimits": sorted(set(llm.STATE["limits"])), "ai": (llm.provider() or {}).get("name")}
    json.dump(out, open(os.path.join(OUT, "podcasts.json"), "w"))
    log("podcasts done", round(time.time() - t0), "s; whispered", whispered, "errors", errors, "llm", llm.STATE)

if __name__ == "__main__":
    main()
