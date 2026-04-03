#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
LOCALE_LIST_FILE="$ROOT_DIR/supported-locales.txt"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/index.html" "$DIST_DIR/index.html"
cp "$ROOT_DIR/404.html" "$DIST_DIR/404.html"

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
done < "$LOCALE_LIST_FILE"
