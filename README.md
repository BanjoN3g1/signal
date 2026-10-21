# Signal

A phone-first PWA for following software and semiconductor stocks: a swipeable "what moved and why" feed, an earnings calendar with recent results and SEC filing links, and short lessons on capital-markets concepts.

**How it works.** A GitHub Actions workflow (`.github/workflows/pages.yml`) runs `refresh.py` roughly every 10 minutes (GitHub can delay scheduled runs). It pulls public data (Nasdaq quotes and earnings calendar, SEC EDGAR, Google News RSS, Google Finance for non-US tickers, YouTube search), writes `data/feed.json`, and deploys the static site to GitHub Pages. Nothing is committed per run. A cache keeps past earnings-calendar days between runs.

**Watchlist.**
- `watchlist.json` (repo root) is the list the data pull uses, and the default list on the phone.
- On the phone, the list button lets you add and remove tickers. Those changes stay on that device. To get data for a new ticker, add it to `watchlist.json` (edit on GitHub; the app's "Copy list" button copies your phone's list as JSON). The next run picks it up.

**Refresh button** reloads the latest published JSON and shows how old it is. To force a new pull: Actions → "Refresh data & deploy" → Run workflow.

**One-time setup.** Settings → Pages → Source: **GitHub Actions**. For SEC filing links, add a repo variable `SEC_USER_AGENT` (Settings → Secrets and variables → Actions → Variables) like `Signal Your Name you@example.com` — the SEC requires a real contact; without it SEC links are skipped. YouTube cards fall back to `seed/videos.json` if YouTube blocks the runner.

**Local test.** `./build.sh && python3 -m http.server -d _site 8000`, then open http://localhost:8000/.

The data is public market info; the app explains it but isn't investment advice. Scheduled workflows in public repos are paused by GitHub after 60 days without repo activity; re-enable from the Actions tab.

## X posts (`data/x.json`)
Written by a separate weekday-morning job; `refresh.py` merges it on every refresh. Shape:
`{"stories": {"<story id>": [post, ...]}, "tickers": {"NVDA": [post, ...]}}` where a post is
`{"handle", "name", "text", "url" (https://x.com/...), "likes", "reposts", "ts" (ISO 8601), "note"}` (max 8 per key; extra fields ignored).
**Story ids** come from `feed.json` → `today.items[].id`: the first 12 hex chars of sha1(URL of the first headline seen for the
story, or its title if no URL). Stories persist in the cache for 36 h, so ids are stable across refreshes; when duplicates are merged
the survivor keeps its id and lists absorbed ids in `aliases` (x.json may key by either). An empty `{}` is fine.

### Developing stories
Clusters with 2+ distinct sources (or alive for 3+ refreshes with a high score) get a structured brief from Gemini Flash-Lite (role `news`, existing caps):
headline, what happened (3-5), summary, key numbers (kept only if the figure appears in the source text), implications. Cached in
`data/cache/news_dev.json` by story id and regenerated only when distinct sources grow by 2+ (or 50%). At most 2 calls × 3 stories per refresh.
Clustering also merges headlines naming the same single watchlist company plus the same event (earnings / deal), e.g. the LRCX earnings splits;
absorbed ids go to `aliases`, so `data/x.json` keys keep matching. The feed shows Developing and X post cards; YouTube video cards were removed.
