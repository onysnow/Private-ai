"""Write the API's OpenAPI schema to frontend/openapi.json (Foundation Fixes fix 2).

The schema is the contract the front end's generated types, Zod checks and
query hooks come from (`npm run generate:api` in frontend/). It is committed
so contract changes show up in review; CI fails when it is out of date:

    python tools/export_openapi.py           # rewrite frontend/openapi.json
    python tools/export_openapi.py --check   # exit 1 if it would change
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "frontend" / "openapi.json"


def build_schema() -> str:
    os.environ.setdefault("TZ", "UTC")
    sys.path.insert(0, str(ROOT / "backend"))
    from app.main import create_app  # noqa: E402

    schema = create_app(bootstrap_schema=False).openapi()
    return json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail if frontend/openapi.json is out of date")
    args = parser.parse_args()
    text = build_schema()
    if args.check:
        current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if current != text:
            print("frontend/openapi.json is out of date: run `python tools/export_openapi.py` and commit it", file=sys.stderr)
            return 1
        print("frontend/openapi.json is up to date")
        return 0
    TARGET.write_text(text, encoding="utf-8")
    print(f"wrote {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
