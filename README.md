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

## Concepts ('tap to understand', `concepts.py` → `data/concepts.json`)
A glossary generated once per term and reused everywhere. `data/concepts.json` (committed) has the seed set: 50 terms made offline in
7 batched calls with `python3 concepts.py seed`. For each term it holds a plain definition, how it works, why it matters (job, industry, economy),
key players, related concepts and a go-deeper paragraph. Aliases are curated in `SEED`. Context lines come from the SAME summary calls
(news `cx`, Developing `cx`, podcast `concepts`: `{term, here}`), so no extra calls. Each refresh writes up to 4 flagged terms that the glossary
lacks into `data/cache/concepts_new.json`, using 1 Flash-Lite call (role `concepts`, cap 4/day). The client matches terms and aliases in cards,
Developing summaries, Dig in and podcast takeaways, underlining at most 3 per card. Tapping one opens a sheet with what it is, what it means here,
why you'd care, related concepts, where it's showing up, and a go-deeper section. Learn → Concepts lists everything, with search and recently-seen terms.
**Deep v2 (current):** every entry also carries `deep`: how it works, why it matters for tech, players across the value chain (supplies, builds,
buys; public tickers and private companies, with positioning), history, a 3-5 year outlook, value creation and destruction, the banker angle
(deals, what clients ask, questions to ask), and approximate numbers with a year. Each refresh upgrades 4 shallow v1 terms (2 calls of 2 terms)
in seed order and writes up to 3 new terms at the deep level. This uses Gemini Flash (free tier, role `concepts`, cap 24/day). The prompt includes a worked depth example, and a depth gate
(enough mechanics, value analysis, 6+ players, 2+ dated metrics) rejects thin answers, which are retried on the next run. Flash-Lite is used only after Flash has been
unavailable for 24h+, tracked in `data/cache/concepts_state.json`, and Lite-written entries are redone on Flash when it returns. Generic finance terms
(`"match": false` in the seed, e.g. guidance, IPO, gross margin) stay in the glossary but are underlined only when a story's AI context line flags them.
Underlines appear in podcast transcript excerpts too, with each concept underlined once per section.

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

## Politics world v3 (US focus)
`#/elections` has a **US / International** switch (International is "coming soon") and tabs Overview · Races · Polls · Trackers · News · X.
- **Map** (`public/elections.js`, us-atlas counties-albers-10m + topojson-client + d3@7 from jsdelivr): d3-zoom pinch/pan with momentum,
  `touch-action:none`, custom tap + double-tap zoom, +/−/reset buttons. Semantic zoom: national (states, toss-up glow, odds) → mid (county 2024
  margins, state labels) → deep (county names, 2024 margin, votes cast, shown only when the county is large enough on screen). State tap → bottom sheet
  (races with Wikipedia photos or initials, odds bar, odds-over-time, poll trend, rater consensus, "why competitive"); county tap → mini card.
  Haptics: iOS 18 `<input type=checkbox switch>` label trick, `navigator.vibrate` on Android, otherwise nothing.
- **`uspol.py`** (called from `politics.py`, adds to `politics.json`):
  `hist` (daily Polymarket price history from the public CLOB `prices-history` endpoint for chambers + key races, ≤16 series, 120 days, cached 6h),
  `snaps` (generic ballot / approval / chamber odds / rater labels, one snapshot per 3h, kept 120 days in `data/cache/pol_snaps.json`),
  `overview.changes` ("What changed this week": computed only from these diffs — 7-day odds moves ≥4 pts, generic-ballot change, rater label changes,
  new polls), `overview.narrative` (Flash-Lite role `pol`, at most 1 call per refresh, cached by a hash of the facts; rejected if it contains a number not in
  the facts), `photos` (Wikipedia pageimages, cached 14 days), `reddit` (public RSS top-of-week for r/fivethirtyeight, r/PoliticalDiscussion, r/YAPms,
  r/Polymarket, paced, cached 3h; themes by Flash-Lite, cached by title hash).
- Signals are cards (big number, sparkline, what it means, lean colour) with a drill-down (what it is, how to read it, history, source + date, odds link)
  and a "How to put it together" explainer. Every number carries its source and date; nothing is estimated.

## Politics world v4: our model (`forecast.py` → `politics.json` `model`)
Turns the collected inputs into insight; no new data sources, every parameter in `forecast.PARAMS` and shipped in the output.
- **Expected margin**: 2024 presidential margin per state + national swing (generic-ballot average minus the 2024 national vote;
  governors ×0.8) + incumbency (2.5 Senate / 2 governor). **Candidate effect** = observed (poll avg, or market-implied margin if
  unpolled) minus that environment expectation; 4+ pts = candidate-driven.
- **Prior** = fundamentals blended with the expert-rating consensus (Senate 50/50; governors 100% ratings, since the presidential
  baseline misleads in candidate-driven governor races). Ratings map to margins Tilt 2.5 / Lean 6 / Likely 11 / Safe 18 pts.
- **Model margin** = poll avg weighted n/(n+1.5) (cap 85%) blended with the prior. Never uses market prices, so model-vs-market
  gaps are real disagreements. Takeaways and the disagreement list only consider competitive races (model or market 10–90%).
- **Correlated Monte Carlo** (20k, seeded): shared national error σ3 + race error σ4.5–9. Senate: control odds, seat histogram,
  tipping point, pivotal %, **leverage** (pivotal and race within 2.5 pts), conditional odds, most common paths to 51. Seat holders
  for seat math: `holder` in the election config (auto-discovered races: ratings "last result", else held at status quo).
- **Disagreement index** (model vs market, with raters/polls sides) and a no-AI **brief** of 3–5 takeaways.
- **Accountability**: one snapshot/day in `data/cache/forecast_log.json`; `forecast.score(path, {race_id: 1 if D/I won else 0})`
  returns Brier scores for model vs markets after Election Day.
- UI: Overview "Our model" card, a **Model** tab, and a model box (expected-margin waterfall, conditional odds) in every race sheet.

## Politics v5: one Brief, any election (`forecast.py`, `elections.pick`, `public/elections.js`)
Organized by question, not by source. Tabs: **Brief · Races · Under the hood · Feed** (was 7 tabs).
- **Brief**: topline per contest (model vs market, seat/EV range) → **the read** (≤3 ranked takeaways: tipping point vs markets,
  what moved, fragility under a ±3 pt polling miss, candidate races, biggest gap) → **decides control** (top races by leverage) →
  **this week** (only threshold-crossing moves; says so when nothing moved) → one **environment** line (tap for all signals).
- **Race sheet**: one verdict line, model vs market, "what rides on it" (conditional odds), then collapsed detail
  (why the model says this · polls · odds over time · ratings · money · X).
- Cut: AI narrative, Signals grid on the home screen, races-to-watch strip, odds small multiples, Polls tab, International stub.
  News + X + Trackers merged into Feed; forecaster explainer moved to Under the hood.

**Lifecycle (automatic, from `data/elections/*.json` dates; `index.json` carries `active`, `phase`, `next`, `calendar`):**
- `campaign` (next election ≤150 days out): the Brief above. `night`: when `data/elections/live/<id>.json` exists, the map leads.
- `results` (≤45 days after): the model freezes on its last pre-election forecast (`forecast_final_<id>.json`) and a **scorecard**
  grades model vs markets (hits, Brier, misses, seats vs forecast range) against `data/elections/results/<id>.json` or settled markets.
  Closed markets keep their last odds (`elections_last_<id>.json`). To freeze an election permanently, commit its built JSON to
  `data/elections/archive/<id>.json` (and `<id>-model.json` for the final forecast).
- `between`: national environment (generic ballot switches to the next cycle's page automatically), last cycle's scorecard,
  `data/elections/calendar/calendar.json`, and an early read of the next election if its config exists.
- **2028**: copy `data/elections/templates/general-2028.json` into `data/elections/`. Contests are declared per election:
  `president` (electoral votes, every state auto-modeled from the 2024 baseline, swing states with markets/polls), `senate`, `house`.
  Governor/Senate Polymarket discovery uses the election year. `environment.national_override` takes a presidential national margin once wired.

## Election night: county benchmarks (v6, client-side in `public/elections.js`)
- **50/50 line** per county = 2024 presidential county margin shifted uniformly so the state nets to a tie; **model line** = the same
  shifted to our forecast margin. Shown in every race sheet ("Election night: county benchmarks": the 6 biggest counties + 3
  bellwethers) and as the map's **50/50 lines** layer (key-race states).
- **Live** (`data/elections/live/<id>.json`): `{updated, counties: {fips: {reporting, margin}}}` (margin = R minus D) applies to every race
  in that state; per race use `{fips: {races: {"TX-sen": {reporting, margin}}}}`. The Brief then leads with a **live read**: each key race's
  counties-in vs their lines → a uniform-swing statewide estimate, weighted by 2024 votes × % reporting, against the model.
- No results feed is wired yet: a job (or a manual drop) must write the live file on election night.
