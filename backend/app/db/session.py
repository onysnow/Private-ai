import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator

from sqlalchemy import Connection, Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.config import settings
from app.db import validation as _validation  # noqa: F401 - registers cross-dialect ORM guards
from app.db import mutation_guard as _mutation_guard  # noqa: F401 - registers PostgreSQL mutation locks
from app.db import decided_by as _decided_by  # noqa: F401 - stamps who decided and each quote's anchor

class _SerializedCursor(sqlite3.Cursor):
    """A cursor whose every DBAPI call holds its connection's lock.

    See _SerializedConnection: with StaticPool every request thread shares one
    sqlite3 connection, and Python's sqlite3 module does not make concurrent
    calls on one connection safe -- overlapping execute/fetch calls from two
    threads returned truncated result sets (a 200-row SELECT coming back with
    106 rows, or none) and raised `sqlite3.InterfaceError: bad parameter or
    other API misuse`, which reached the UI as random "Failed to fetch"
    toasts whenever the page fired its parallel load requests.
    """

    def execute(self, *args: Any, **kwargs: Any) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().execute(*args, **kwargs)

    def executemany(self, *args: Any, **kwargs: Any) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().executemany(*args, **kwargs)

    def executescript(self, *args: Any, **kwargs: Any) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().executescript(*args, **kwargs)

    def fetchone(self) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().fetchone()

    def fetchmany(self, *args: Any, **kwargs: Any) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().fetchmany(*args, **kwargs)

    def fetchall(self) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().fetchall()

    def close(self) -> Any:
        with self.connection._lock:  # type: ignore[attr-defined]
            return super().close()


class _SerializedConnection(sqlite3.Connection):
    """sqlite3 connection that serializes every call made through it.

    The lock is held for one DBAPI call at a time (never across a request,
    an await, or a whole transaction), so it cannot deadlock against the
    event loop or a nested session; it only stops two threads' calls from
    overlapping inside the sqlite3 module. Transaction semantics are
    unchanged from before: StaticPool already meant every session shared one
    connection and therefore one SQLite transaction.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._lock = threading.RLock()

    def cursor(self, factory: Any = None) -> Any:
        return super().cursor(factory or _SerializedCursor)

    def execute(self, *args: Any, **kwargs: Any) -> Any:
        with self._lock:
            return super().execute(*args, **kwargs)

    def executemany(self, *args: Any, **kwargs: Any) -> Any:
        with self._lock:
            return super().executemany(*args, **kwargs)

    def executescript(self, *args: Any, **kwargs: Any) -> Any:
        with self._lock:
            return super().executescript(*args, **kwargs)

    def commit(self) -> Any:
        with self._lock:
            return super().commit()

    def rollback(self) -> Any:
        with self._lock:
            return super().rollback()

    def close(self) -> Any:
        with self._lock:
            return super().close()


def build_engine(database_url: str, *, busy_timeout: float | None = None) -> Engine:
    """Build an Engine for `database_url` with this app's dialect rules.

    Module-level `engine` below is `build_engine(settings.database_url)`; an app
    instance created with `create_app(database_url=...)` gets its own via this
    same function, so the SQLite pooling rule cannot drift between the two.
    """
    # factory: see _SerializedConnection -- required because of the shared
    # StaticPool connection below.
    connect_args: dict[str, Any] = {"check_same_thread": False, "factory": _SerializedConnection} if database_url.startswith("sqlite") else {}
    if busy_timeout is not None and database_url.startswith("sqlite"):
        connect_args["timeout"] = busy_timeout  # how long a write waits on another connection's lock
    engine_kwargs: dict[str, Any] = {"pool_pre_ping": True, "connect_args": connect_args}
    if database_url.startswith("sqlite"):
        # STRUCT-0011: force a single persistent connection for ANY SQLite backend, not
        # just the two in-memory URL spellings this used to special-case. SQLite's own
        # locking model already serializes access to one file at a time, so pooling
        # multiple separate connections to it (the previous default QueuePool behavior
        # for the file-based sqlite:///./journalism.db backend) buys no real
        # concurrency -- it only creates the possibility of one connection holding a
        # stale lock while another tries to acquire an exclusive one, which is exactly
        # what made a per-test schema-reset fixture hang reproducibly when this was
        # first attempted (see STRUCTURE_AUDIT.md/STRUCT-0011's progress_note). A single
        # shared connection removes that hazard entirely, for tests and normal local
        # dev/runtime use alike, and also keeps schema/data visible across
        # request/session boundaries the same way it already did for the in-memory
        # cases. PostgreSQL (backend-postgres-ci.yml, and any real deployment) is a
        # completely different branch of this if/else and is unaffected either way.
        engine_kwargs["poolclass"] = StaticPool
    return create_engine(database_url, **engine_kwargs)


def build_session_factory(bound_engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=bound_engine, autoflush=False, autocommit=False)


# How long a background job's own SQLite connection waits for the shared one to
# finish writing before it gives up with "database is locked".
JOB_CONNECTION_BUSY_SECONDS = 60.0


def _sqlite_file(bind: Engine) -> bool:
    """A SQLite database on disk: one a second connection can open."""
    if bind.dialect.name != "sqlite":
        return False
    database = bind.url.database or ""
    return bool(database) and ":memory:" not in database and bind.url.query.get("mode") != "memory"


@contextmanager
def own_connection(bind: Engine | Connection) -> Iterator[Engine]:
    """An engine whose sessions share nothing with the request sessions of ``bind``.

    On a SQLite file every session of ``bind`` shares one connection, and so one
    transaction (build_engine, StaticPool): a request that closes its session
    while a background job is half-way through its writes rolls those writes
    back, and one that commits commits them half-done. A document read that
    flushed a page's proposals then failed with "UPDATE statement on table
    'extraction_candidates' expected to update 4 row(s); 0 were matched" when the
    screen's polling closed a session in between. A job run inside the API
    process (the inline runner) works through this engine instead: a connection
    of its own, which SQLite's file locking keeps apart from the shared one, as
    PostgreSQL keeps every connection apart. The job's own sessions (its progress
    reports, the jobs it runs for an archive's files) share this connection
    among themselves, in the job's thread, as before.

    PostgreSQL and an in-memory SQLite database (which a second connection cannot
    open) get ``bind`` itself.
    """
    engine = bind if isinstance(bind, Engine) else bind.engine
    if not _sqlite_file(engine):
        yield engine
        return
    own = build_engine(engine.url.render_as_string(hide_password=False), busy_timeout=JOB_CONNECTION_BUSY_SECONDS)
    try:
        yield own
    finally:
        own.dispose()


engine = build_engine(settings.database_url)
SessionLocal = build_session_factory(engine)

class Base(DeclarativeBase):
    pass

def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
