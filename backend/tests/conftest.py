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

This fixture instead creates the schema ONCE (a no-op if
ensure_database_schema() already ran it via app.main's module-level
create_app() -- checkfirst=True skips any table that already exists) and
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
import pytest

from app.db.session import Base, engine


@pytest.fixture(autouse=True)
def _reset_database():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield
