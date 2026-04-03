#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
LOCALE_LIST_FILE="$ROOT_DIR/supported-locales.txt"

hash_file() {
  local file_path="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file_path" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file_path" | awk '{print $1}'
    return
  fi

  echo "No SHA-256 hashing tool found" >&2
  exit 1
}

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/index.html" "$DIST_DIR/index.html"
cp "$ROOT_DIR/404.html" "$DIST_DIR/404.html"

BUILT_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

while IFS= read -r locale || [ -n "$locale" ]; do
  if [ -z "$locale" ]; then
    continue
  fi

  if [ ! -d "$ROOT_DIR/$locale" ]; then
    echo "Missing locale directory: $locale" >&2
    exit 1
  fi

  mkdir -p "$DIST_DIR/$locale"
  cp -R "$ROOT_DIR/$locale/." "$DIST_DIR/$locale/"

  MAIN_FILE="$DIST_DIR/$locale/$locale.json"
  STATSIG_FILE="$DIST_DIR/$locale/$locale.statsig.json"

  if [ ! -f "$MAIN_FILE" ]; then
    echo "Missing locale main file: $MAIN_FILE" >&2
    exit 1
  fi

  if [ ! -f "$STATSIG_FILE" ]; then
    echo "Missing locale statsig file: $STATSIG_FILE" >&2
    exit 1
  fi

  MAIN_HASH="$(hash_file "$MAIN_FILE")"
  STATSIG_HASH="$(hash_file "$STATSIG_FILE")"

  cat > "$DIST_DIR/$locale/version.json" <<EOF
{
  "locale": "$locale",
  "builtAt": "$BUILT_AT",
  "hash": [
    "$MAIN_HASH",
    "$STATSIG_HASH"
  ]
}
EOF
done < "$LOCALE_LIST_FILE"
