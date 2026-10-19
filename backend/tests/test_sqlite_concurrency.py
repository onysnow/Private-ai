"""Regression test for the shared-SQLite-connection race.

build_engine() gives every SQLite database a single StaticPool connection
(STRUCT-0011), so every request thread shares it. Before
app/db/session.py:_SerializedConnection, overlapping calls on that one
connection returned truncated result sets (a 200-row SELECT coming back with
0-134 rows) and raised sqlite3.InterfaceError, which the web UI surfaced as
random "Failed to fetch" toasts on page load. This drives the same overlap
directly: many threads, many sessions, one file-backed engine.
"""
import threading

from sqlalchemy import text

from app.db.session import build_engine, build_session_factory


def test_concurrent_sessions_on_shared_sqlite_connection_return_complete_results(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'race.db'}")
    session_factory = build_session_factory(engine)
    with session_factory() as db:
        db.execute(text("create table t (id integer primary key, v text)"))
        db.execute(text("insert into t (v) values " + ",".join(f"('row{i}')" for i in range(200))))
        db.commit()

    failures: list[str] = []

    def reader():
        for _ in range(40):
            try:
                with session_factory() as db:
                    rows = db.execute(text("select id, v from t where id > :n"), {"n": 5}).all()
                    if len(rows) != 195:
                        failures.append(f"short read: {len(rows)} rows")
            except Exception as exc:  # noqa: BLE001 - every failure mode is the bug
                failures.append(f"{type(exc).__name__}: {exc}")

    threads = [threading.Thread(target=reader) for _ in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    engine.dispose()

    assert failures == []


def test_in_memory_sqlite_still_shares_one_database_across_sessions():
    engine = build_engine("sqlite://")
    session_factory = build_session_factory(engine)
    with session_factory() as db:
        db.execute(text("create table t (id integer primary key)"))
        db.execute(text("insert into t default values"))
        db.commit()
    with session_factory() as db:
        assert db.execute(text("select count(*) from t")).scalar() == 1
    engine.dispose()
