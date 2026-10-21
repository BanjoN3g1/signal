#!/usr/bin/env bash
# Build the static site into _site/: pull fresh data, copy the PWA, add the watchlist.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf _site && mkdir -p _site/data
OUT_DIR="$PWD/_site/data" python3 refresh.py
cp -r public/. _site/
cp watchlist.json _site/watchlist_default.json
[ -f data/podcasts/podcasts.json ] && cp data/podcasts/podcasts.json _site/data/podcasts.json || true
mkdir -p _site/data/pods && cp data/podcasts/seg_*.json _site/data/pods/ 2>/dev/null || true   # transcript passages for podcast drill-down
touch _site/.nojekyll
echo "built _site ($(du -sh _site | cut -f1))"
