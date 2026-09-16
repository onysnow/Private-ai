from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.config import settings
from app.db import validation as _validation  # noqa: F401 - registers cross-dialect ORM guards
from app.db import mutation_guard as _mutation_guard  # noqa: F401 - registers PostgreSQL mutation locks

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine_kwargs = {"pool_pre_ping": True, "connect_args": connect_args}
if settings.database_url in {"sqlite://", "sqlite:///:memory:"}:
    # Keep one connection alive for ephemeral test/development databases so
    # schema and data remain visible across request/session boundaries.
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
