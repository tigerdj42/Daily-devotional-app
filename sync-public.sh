#!/usr/bin/env bash
# Builds the Firebase Hosting deploy directory.
#
# The app source lives at the repo root (GitHub Pages serves it from there).
# Firebase Hosting deploys from public/ instead, which is generated here and
# contains ONLY app files — so secrets at the repo root (serviceAccount.json)
# can never be published, regardless of ignore rules.
#
# Usage:  ./sync-public.sh  &&  firebase deploy --only hosting

set -euo pipefail
cd "$(dirname "$0")"

APP_FILES=(
  index.html
  app.js
  styles.css
  commentary.js
  firebase-config.js
  manifest.json
  sw.js
)

rm -rf public
mkdir -p public

for f in "${APP_FILES[@]}"; do
  cp "$f" "public/$f"
done

cp -r icons public/icons

# Hard guard: never ship credentials.
if grep -rl "private_key\|BEGIN PRIVATE KEY" public/ 2>/dev/null | grep -q .; then
  echo "ABORT: credential-looking content found in public/" >&2
  exit 1
fi

echo "public/ built:"
find public -type f | sort
