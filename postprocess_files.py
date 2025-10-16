#!/usr/bin/env python3
"""
Downstream post-processing helpers for stitched tarot readings.

Responsibilities:
- Prepend a two-line header to FULL_READING.txt with zodiac sign and ISO timestamp
- Optionally write timestamped copies for history

Usage:
  python3 postprocess_files.py header <SIGN>
  python3 postprocess_files.py copy_stitched <SIGN>
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import sys

OUTPUT_DIR = Path("output")


def iso_now() -> str:
    try:
        # Local time with offset
        return datetime.now().astimezone().isoformat(timespec="seconds")
    except Exception:
        # Fallback to UTC ISO
        return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def write_header_into_stitched(sign: str, stitched_filename: str = "FULL_READING.txt") -> Path:
    """Deprecated: no longer injects headers into file content (filename only policy)."""
    return OUTPUT_DIR / stitched_filename


def name_stitched_with_sign(sign: str) -> Path:
    """Write a timestamped copy of stitched file for history and easy downloads."""
    stamp = iso_now().replace(":", "-")
    src = OUTPUT_DIR / "FULL_READING.txt"
    dst = OUTPUT_DIR / f"FULL_READING__{sign}__{stamp}.txt"
    if src.exists():
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return dst


def main() -> int:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "header":
        # Kept for backward compatibility; now acts like copy_stitched
        if len(sys.argv) < 3:
            print("Usage: python3 postprocess_files.py header <SIGN>")
            return 2
        sign = sys.argv[2]
        name_stitched_with_sign(sign)
        return 0
    if cmd == "copy_stitched":
        if len(sys.argv) < 3:
            print("Usage: python3 postprocess_files.py copy_stitched <SIGN>")
            return 2
        sign = sys.argv[2]
        name_stitched_with_sign(sign)
        return 0

    print("Unknown command")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

