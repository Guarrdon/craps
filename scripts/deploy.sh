#!/usr/bin/env bash
#
# Builds this game and publishes it to the lhstart portal.
#
#   npm run deploy
#
# This file is the same in every game repository. It is copied from
# lhstart/templates/deploy.sh, and everything specific to a game lives in
# portal.json beside it. If you change this script, change the template.
#
set -euo pipefail

cd "$(dirname "$0")/.."

die() {
  echo "error: $*" >&2
  exit 1
}

[ -f portal.json ] || die "no portal.json — see lhstart/templates/portal.json"
command -v aws >/dev/null || die "aws cli not found"
aws sts get-caller-identity >/dev/null 2>&1 || die "not authenticated. run: aws login"

read_field() {
  python3 -c "import json,sys; print(json.load(open('portal.json'))['$1'])" 2>/dev/null ||
    die "portal.json is missing \"$1\""
}

id=$(read_field id)
bucket=$(read_field bucket)
distribution=$(read_field distribution)
prefix="games/$id/"

echo "==> building $id"
npm run build

[ -f dist/index.html ] || die "the build produced no dist/index.html"

# Games are served from a subfolder, so the build has to be location
# independent. Vite does that with base: './'. A build that still points at the
# domain root will load the portal's files instead of its own and show a blank
# page, which is confusing enough to be worth failing on here.
if grep -qE '(src|href)="/(assets|src)/' dist/index.html; then
  die "dist/index.html has root-absolute asset paths.
       set base: './' in vite.config.js and rebuild."
fi

# Games that play offline publish this; the portal's service worker reads it to
# know what to keep. Absence is fine — it just means the game needs the network.
if [ -f dist/offline.json ]; then
  echo "    offline build $(python3 -c "import json; print(json.load(open('dist/offline.json'))['build'])")"
fi

echo "==> uploading to s3://$bucket/$prefix"

# Three passes, because three kinds of file want three answers to "how long is
# this good for".
#
# 1. Fingerprinted assets. The name changes when the bytes do, so forever.
# 2. Hashless files the browser must re-check every time: the entry HTML, and
#    offline.json, which is the file that says which build is current. A stale
#    copy of that one pins an offline player to an old build no matter how many
#    times they reload, so it must never be cached hard.
# 3. Icons and the manifest. Named by hand and rarely touched, but "rarely" is
#    not "never" and a year is a long time to be stuck with the wrong icon.
aws s3 sync dist "s3://$bucket/$prefix" \
  --delete \
  --exclude "*.html" \
  --exclude "offline.json" \
  --exclude "*.webmanifest" \
  --exclude "icons/*" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 sync dist "s3://$bucket/$prefix" \
  --delete \
  --exclude "*" --include "*.html" --include "offline.json" \
  --cache-control "public, max-age=0, must-revalidate"

aws s3 sync dist "s3://$bucket/$prefix" \
  --delete \
  --exclude "*" --include "icons/*" \
  --cache-control "public, max-age=86400"

# Uploaded on its own for the content type: the AWS CLI does not know
# .webmanifest, and would hand it over as application/octet-stream.
if [ -f dist/manifest.webmanifest ]; then
  aws s3 cp dist/manifest.webmanifest "s3://$bucket/${prefix}manifest.webmanifest" \
    --cache-control "public, max-age=86400" \
    --content-type "application/manifest+json"
fi

echo "==> invalidating CloudFront"
inv=$(aws cloudfront create-invalidation \
  --distribution-id "$distribution" \
  --paths "/$prefix*" \
  --query 'Invalidation.Id' --output text)

echo "    invalidation $inv"
echo "==> live: https://lhstart.com/$prefix"
