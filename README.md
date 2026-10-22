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
**Filings chatter:** add `"filings": {"<accession>": [post, ...]}` (same post shape). Accessions come from `data/filings.json` →
`filings[].acc` (format `0001234567-26-000123`, the latest amendment shown). Posts appear in that filing's breakdown sheet.

## Filings & Deals (`filings.py` → `data/filings.json`)
SEC EDGAR full-text search (efts, `SEC_USER_AGENT` secret as User-Agent, ~0.3 s between calls; skipped if unset): S-1/F-1 (45 days),
DEFM14A/PREM14A/S-4 (45 days), 8-K with Items 1.01/2.01 + "Agreement and Plan of Merger" (14 days). Kept only for tech/software/semis/AI/internet
SIC codes (or known names), SPACs excluded, and only if notable (≈$1B+ per the AI read, a well-known name, or on the watchlist). One card per
company & filing type (latest amendment + amendment count). Gemini Flash-Lite (role `filings`, ≤3 per run, cap 15/day) reads excerpts
(summary, summary financials, use of proceeds / deal terms, risk summary, governance) and writes a breakdown cached by accession in
`data/cache/filings_ai.json`; figures are kept only if they appear in the text. Private rounds, tenders and confidential IPO news come from
Google News RSS (7 days, clustered). Notable filings are also injected into the news stream so big ones become Developing stories.
Each filing type links to a Learn explainer (How to read an S-1, merger proxies, S-4s, deal 8-Ks, private rounds, tenders).

## Weekly card (`weekly.py` → `data/weekly.json`)
"What you might have missed": a rolling 7-day log (`data/cache/weekly_log.json`) of the top items per lane (News, Filings & Deals, Earnings,
Politics, Podcasts) from existing outputs. No AI calls.

## Coverage universe
Software, semis, AI **and internet** (platforms & ads, marketplaces & e-commerce, fintech). Internet groups are in `watchlist.json` and
are added once to existing phone watchlists; news relevance has an "Internet" tag. Podcasts include The Journal (WSJ & Spotify) via its public RSS.

### Developing stories
Clusters with 2+ distinct sources (or alive for 3+ refreshes with a high score) get a structured brief from Gemini Flash-Lite (role `news`, existing caps):
headline, what happened (3-5), summary, key numbers (kept only if the figure appears in the source text), implications. Cached in
`data/cache/news_dev.json` by story id and regenerated only when distinct sources grow by 2+ (or 50%) or the cluster is split. At most 2 calls × 3 stories per refresh.
Clustering also merges headlines naming the same single watchlist company plus the same event (earnings / deal), e.g. the LRCX earnings splits;
absorbed ids go to `aliases`, so `data/x.json` keys keep matching. The feed shows Developing and X post cards; YouTube video cards were removed.

## Elections world
Generic engine: `elections.py` (run by `refresh.py` each refresh) turns every `data/elections/<election-id>.json` into
`_site/data/elections/<id>.json` + `index.json`; `public/elections.js` renders whichever election is newest (map · races · polls).

**Add an election** (primary, caucus, ballot measure, special, 2028…): copy `data/elections/midterms-2026.json`, set `id`, `name`,
`date`, `baseline` (a file in `data/elections/baselines/`, schema `{label, metric, county:{fips:[marginRminusD, votes]}, state:{fips:[…]}}`),
and list `races`: `{id, type: senate|house|governor|president|primary|caucus|ballot-measure|chamber, state, title, key, geography: state|county|district,
markets: {polymarket: "<event slug>"|"auto", kalshi_event: "<EVENT>", kalshi_series: "<SERIES>"|"auto"}, polls: {wikipedia: "<page title>"}}`.
`discover.polymarket_tag` auto-adds every other Senate/governor race Polymarket lists. Odds: Polymarket gamma API + Kalshi public API (no auth);
polls: Wikipedia polling tables (avg of the 5 newest polls in the first table, cached 6h). Map: us-atlas `counties-albers-10m` (pre-projected) from jsDelivr.
**Election night hook:** drop `data/elections/live/<id>.json` as `{updated, counties:{fips:{reporting, margin}}, states:{fips:{…}}}` (e.g. from a future
results job); the map colors counties by live margin and shows "% in" automatically. No scraper yet.

## Politics dashboard
The Elections tile is now **Politics** (route `#/elections`): Dashboard (map with toss-up glow → Races to watch → Signals → Politics & markets → balanced X),
Races, Polls, News, X, Models (forecasters + "polls vs markets vs models" explainer).
- `elections.py` adds per race: Polymarket 24h/7d odds moves (`move1`/`move7`, toward D/I), Wikipedia "Predictions" table ratings with a consensus
  (`ratings`: by rater, avg Safe=3…Toss-up=0, label, open seat), poll margin in D terms, and `watch` (close odds, big moves, poll-vs-market and
  rater-vs-market gaps, each with plain reasons). Configure rating pages per election with `"ratings": {"senate": "<wiki page>", "governor": "…"}`.
- `politics.py` → `politics.json`: `signals` (generic ballot and approval from Wikipedia aggregator tables, raters vs markets, market momentum + volume,
  Senate fundraising from the FEC API — `FEC_API_KEY` secret if set, else `DEMO_KEY`, cached 24h — and open seats), `stream` (Politics & markets news:
  POLITICO/The Hill/NPR + Google News topics, clustered by `news.cluster`, summarized by Flash-Lite role `pol`, cap 24/day), and `x`.
- **`data/politics_x.json`** (committed; refreshed by the daily 7am routine via the X connector):
  `{"updated": ISO, "leans": {lean: label}, "accounts": [{"handle","name","lean","role"}], "posts": [{"handle","name","lean","role","text","url","likes","reposts","ts","race"}]}`
  where `lean` ∈ `left|right|center|analyst` (describes the account) and `race` is an optional race id from the election config (e.g. `GA-sen`,
  `senate-control`). URLs must be https://x.com/…; the app shows posts balanced (round-robin across leans) and on matching race pages.
