from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.db.migrations import ensure_database_schema
from app.models.domain import Investigation
from app.db.session import Base


def test_in_memory_sqlite_bootstraps_current_metadata_without_alembic_file_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    report = ensure_database_schema(engine)

    assert report.compatible is True
    assert report.empty is False
    assert report.versioned is False
    assert Investigation.__tablename__ in Base.metadata.tables
