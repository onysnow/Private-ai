"""Run the Journalism Workbench backend release gate against a disposable PostgreSQL DB.

Usage:
  POSTGRES_TEST_URL='postgresql+psycopg://user:pass@host:5432/journalism_test' \
    python run_postgres_gate.py

The script intentionally refuses ambiguous/non-test database names to reduce the chance
of running destructive test fixtures against reporter or production data.
"""
from __future__ import annotations

import os
import subprocess
import sys
from urllib.parse import urlparse


def _database_name(url: str) -> str:
    # SQLAlchemy URLs include a +driver suffix that urllib does not care about.
    parsed = urlparse(url.replace("postgresql+psycopg://", "postgresql://", 1))
    return parsed.path.lstrip("/")


def main() -> int:
    url = os.environ.get("POSTGRES_TEST_URL", "").strip()
    if not url:
        print("POSTGRES_TEST_URL is required", file=sys.stderr)
        return 2
    if not (url.startswith("postgresql://") or url.startswith("postgresql+psycopg://")):
        print("POSTGRES_TEST_URL must be PostgreSQL", file=sys.stderr)
        return 2

    db_name = _database_name(url).lower()
    if not db_name or not any(token in db_name for token in ("test", "ci", "tmp", "scratch")):
        print(
            "Refusing to run: database name must clearly be disposable "
            "(contain test, ci, tmp, or scratch).",
            file=sys.stderr,
        )
        return 2

    env = os.environ.copy()
    env["DATABASE_URL"] = url
    env["JW_POSTGRES_GATE"] = "1"
    print(f"Running PostgreSQL gate against disposable database: {db_name}")
    return subprocess.call([sys.executable, "-m", "pytest", "-q"], env=env)


if __name__ == "__main__":
    raise SystemExit(main())
