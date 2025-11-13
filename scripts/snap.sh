#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/output"
SNAP_ROOT="$ROOT_DIR/snapshot"

TS="$(date -u +"%Y-%m-%dT%H-%M-%S")"
DEST="$SNAP_ROOT/$TS"

mkdir -p "$DEST"

echo "Snapshotting CONTROL/LOCK files into: $DEST"

shopt -s nullglob
files=("$OUT_DIR"/*CONTROL_v5.4*.txt "$OUT_DIR"/*LOCK*.txt)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "No matching CONTROL_v5.4*/LOCK*.txt files found under $OUT_DIR"
  exit 0
fi

for f in "${files[@]}"; do
  cp "$f" "$DEST"/
  echo "Copied $(basename "$f")"
done

echo "Snapshot complete."
