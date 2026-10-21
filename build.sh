#!/usr/bin/env bash
# Build the static site into _site/: pull fresh data, copy the PWA, add the watchlist.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf _site && mkdir -p _site/data
OUT_DIR="$PWD/_site/data" python3 refresh.py
cp -r public/. _site/
cp watchlist.json _site/watchlist_default.json
touch _site/.nojekyll
echo "built _site ($(du -sh _site | cut -f1))"
