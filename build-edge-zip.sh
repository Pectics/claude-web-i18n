#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$ROOT_DIR/extension"
DIST_DIR="$ROOT_DIR/dist"
STAGING_DIR="$DIST_DIR/.edge-package"

if [ ! -f "$EXT_DIR/manifest.json" ]; then
  echo "Missing manifest: $EXT_DIR/manifest.json" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to read manifest version" >&2
  exit 1
fi

VERSION="$(
  python3 - <<'PY' "$EXT_DIR/manifest.json"
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    manifest = json.load(f)

print(manifest["version"])
PY
)"

OUTPUT_ZIP="$DIST_DIR/claude-i18n-edge-$VERSION.zip"

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR" "$DIST_DIR"
cp -R "$EXT_DIR/." "$STAGING_DIR/"

rm -f "$OUTPUT_ZIP"
python3 - <<'PY' "$STAGING_DIR" "$OUTPUT_ZIP"
import sys
import zipfile
from pathlib import Path

staging_dir = Path(sys.argv[1])
output_zip = Path(sys.argv[2])

with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(staging_dir.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(staging_dir))
PY

rm -rf "$STAGING_DIR"

echo "Created Edge package: $OUTPUT_ZIP"
