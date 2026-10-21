# Signal

A phone-first PWA for following software and semiconductor stocks: a swipeable "what moved and why" feed, an earnings calendar with recent results and SEC filing links, and short lessons on capital-markets concepts.

**How it works.** A GitHub Actions workflow (`.github/workflows/pages.yml`) runs `refresh.py` roughly every 10 minutes (GitHub can delay scheduled runs). It pulls public data (Nasdaq quotes and earnings calendar, SEC EDGAR, Google News RSS, Google Finance for non-US tickers, YouTube search), writes `data/feed.json`, and deploys the static site to GitHub Pages. Nothing is committed per run. A cache keeps past earnings-calendar days between runs.

**Watchlist.**
- `watchlist.json` (repo root) is the list the data pull uses, and the default list on the phone.
- On the phone, the list button lets you add and remove tickers. Those changes stay on that device. To get data for a new ticker, add it to `watchlist.json` (edit on GitHub; the app's "Copy list" button copies your phone's list as JSON). The next run picks it up.

**Refresh button** reloads the latest published JSON and shows how old it is. To force a new pull: Actions → "Refresh data & deploy" → Run workflow.

**One-time setup.** Settings → Pages → Source: **GitHub Actions**.

**Local test.** `./build.sh && python3 -m http.server -d _site 8000`, then open http://localhost:8000/.

The data is public market info; the app explains it but isn't investment advice. Scheduled workflows in public repos are paused by GitHub after 60 days without repo activity; re-enable from the Actions tab.
