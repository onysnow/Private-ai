"""Centralized per-test database isolation (STRUCT-0011).

Replaces the ad hoc setup_module()/setup_function()/_clean_database
patterns that used to be duplicated across 19 test files, each doing
Base.metadata.drop_all(bind=engine); Base.metadata.create_all(bind=engine)
before every test in that file.

That DDL-based reset is correct but expensive: benchmarked at ~2.7s per
call against this app's real 42-table schema (not the ~0.3ms an earlier
attempt measured against an empty, unpopulated metadata object before any
model module had been imported). Across a 259+ test suite that is ~700s
of schema-rebuild churn, which is exactly what two earlier attempts at
this fixture hit and misread as a hang under a shorter timeout -- it was
never a deadlock or a connection-pool/threading hazard.

This fixture instead creates the schema ONCE (checkfirst=True skips any
table that already exists; since STRUCT-0010 importing app.main no longer
runs ensure_database_schema() -- that moved to the app lifespan, which a
bare TestClient(app) never enters -- this fixture is what guarantees the
tables exist for every test) and
then clears row DATA between tests with plain DELETEs in reverse
dependency order, which benchmarks at ~19ms for the same schema -- about
145x faster, and non-blocking for anything else touching the same
StaticPool-backed connection.

Deliberately binds against the SAME `engine`/`Base` objects app.db.session
already constructs, not a fresh hardcoded engine: several test files call
`SessionLocal()` / `Session(engine)` directly on an already-imported name
binding, which a fixture that swapped in a different engine object would
silently fail to isolate.
"""
import os

# Background jobs run in-process for the suite on either database, so an
# upload answers with the read document as tests expect; the Procrastinate
# path has its own tests (test_background_jobs_procrastinate.py). Must be set
# before app.core.config builds its settings.
os.environ.setdefault("JOB_RUNNER", "inline")
# Tests never download the world map (app/services/basemap_install.py).
os.environ.setdefault("BASEMAP_AUTO", "false")
# Read documents in the test process so tests can substitute the reader;
# test_document_reader.py covers the separate reader process.
os.environ.setdefault("DOCUMENT_READ_IN_SUBPROCESS", "false")

import tempfile  # noqa: E402
from urllib.parse import urlparse  # noqa: E402

# The fixture below deletes every row before each test, so the suite must
# never open the developer's own database. The app's default is
# ./journalism.db -- the Workbench's real data on a reporter's machine -- and a
# DATABASE_URL exported in the shell may point at it too. Only a PostgreSQL
# database whose name says it is disposable (the same rule
# run_postgres_gate.py enforces, and what CI sets) is used as given; anything
# else is replaced with a fresh SQLite file in a temporary folder that belongs
# to this run alone, so two runs at once never share one either.
_DISPOSABLE_NAME_TOKENS = ("test", "ci", "tmp", "scratch")


def _is_disposable_postgres(url: str) -> bool:
    if not url.startswith(("postgresql://", "postgresql+psycopg://")):
        return False
    name = urlparse(url.replace("postgresql+psycopg://", "postgresql://", 1)).path.lstrip("/").lower()
    return any(token in name for token in _DISPOSABLE_NAME_TOKENS)


if not _is_disposable_postgres(os.environ.get("DATABASE_URL", "")):
    _run_folder = tempfile.mkdtemp(prefix="journalism-tests-")
    os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_run_folder, 'journalism.db')}"

import pytest  # noqa: E402

from app.db.session import Base, engine  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_database():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield
