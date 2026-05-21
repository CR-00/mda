#!/usr/bin/env bash
# Usage: ./scripts/fetch-blob.sh <filename>
# Downloads a blob file to .debug-cache/ for local debugging.
# Token is read from .env.local automatically.

set -e

FILE="$1"
if [ -z "$FILE" ]; then
  echo "Usage: $0 <blob-filename>"
  echo "Example: $0 BB_vs_LP_srp_reg_ip_B-X-R.json"
  exit 1
fi

TOKEN=$(grep BLOB_READ_WRITE_TOKEN "$(dirname "$0")/../.env.local" | sed 's/.*="\?//' | sed 's/"\?$//')
BASE_URL="https://wuwnbqgoemx4mgpo.private.blob.vercel-storage.com"
CACHE="$(dirname "$0")/../.debug-cache"

mkdir -p "$CACHE"
curl -sf "$BASE_URL/$FILE" -H "Authorization: Bearer $TOKEN" -o "$CACHE/$FILE"
echo "Saved to .debug-cache/$FILE ($(wc -c < "$CACHE/$FILE") bytes)"
