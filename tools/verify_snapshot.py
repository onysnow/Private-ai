#!/usr/bin/env python3
"""Verify the persisted Journalism Workbench source snapshot against its SHA-256 manifest."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "SNAPSHOT_MANIFEST.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = data.get("files")
    if not isinstance(files, dict):
        print("snapshot verification FAILED")
        print("- manifest 'files' must be an object keyed by relative path")
        return 1
    failures: list[str] = []
    for relative_path, expected in sorted(files.items()):
        if not isinstance(expected, dict) or not isinstance(expected.get("sha256"), str):
            failures.append(f"invalid manifest entry: {relative_path}")
            continue
        path = ROOT / relative_path
        if not path.is_file():
            failures.append(f"missing: {relative_path}")
            continue
        actual = sha256(path)
        if actual != expected["sha256"]:
            failures.append(f"hash mismatch: {relative_path}")
        expected_bytes = expected.get("bytes")
        if isinstance(expected_bytes, int) and path.stat().st_size != expected_bytes:
            failures.append(f"size mismatch: {relative_path}")
    if failures:
        print("snapshot verification FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"snapshot verification passed: {len(files)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
