from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.config import settings
from app.db import validation as _validation  # noqa: F401 - registers cross-dialect ORM guards
from app.db import mutation_guard as _mutation_guard  # noqa: F401 - registers PostgreSQL mutation locks

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine_kwargs = {"pool_pre_ping": True, "connect_args": connect_args}
if settings.database_url.startswith("sqlite"):
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
engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
