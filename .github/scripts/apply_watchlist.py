"""Apply a watchlist sent from the phone (JSON code block in the issue body) to watchlist.json, with strict validation."""
import json, os, re, sys
ev = json.load(open(sys.argv[1]))
body = (ev.get("issue") or {}).get("body") or ""
m = re.search(r"```json\s*(\{.*?\})\s*```", body, re.S)
if not m: sys.exit("no ```json block in the issue body")
data = json.loads(m.group(1))
groups = data.get("groups")
if not isinstance(groups, list) or not 0 < len(groups) <= 30: sys.exit("groups must be a list of 1-30")
TICK = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$"); PRIV = re.compile(r"^[\w][\w .&'+-]{0,39}$")
out, total = [], 0
for g in groups:
    name = str(g.get("name", "")).strip()
    if not name or len(name) > 60 or re.search(r"[<>`\n]", name): sys.exit(f"bad group name {name!r}")
    ts = g.get("tickers") or []
    if not isinstance(ts, list): sys.exit("tickers must be a list")
    rx = PRIV if name.lower().startswith("private") else TICK
    clean = []
    for t in ts:
        t = str(t).strip()
        if not rx.match(t): sys.exit(f"bad entry {t!r} in {name!r}")
        if t not in clean: clean.append(t)
    total += len(clean); out.append({"name": name, "tickers": clean})
if total > 120: sys.exit("too many entries (max 120)")
old = json.load(open("watchlist.json"))
before = {t for g in old["groups"] for t in g["tickers"]}; after = {t for g in out for t in g["tickers"]}
add, rm = sorted(after - before), sorted(before - after)
txt = '{"groups": [\n' + ",\n".join(" " + json.dumps(g, ensure_ascii=False) for g in out) + "\n]}\n"
changed = json.loads(txt) != old
if changed: open("watchlist.json", "w").write(txt)
summary = ("added " + ", ".join(add) if add else "") + ("; " if add and rm else "") + ("removed " + ", ".join(rm) if rm else "") or ("regrouped" if changed else "no changes")
summary = re.sub(r"[^\w ,;.&'+-]", "", summary)[:200]
with open(os.environ["GITHUB_OUTPUT"], "a") as f: f.write(f"changed={'true' if changed else 'false'}\nsummary={summary}\n")
print(summary)
