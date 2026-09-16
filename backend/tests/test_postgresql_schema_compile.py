from sqlalchemy.schema import CreateIndex, CreateTable
from sqlalchemy.dialects import postgresql

from app.db.session import Base
import app.models.domain  # noqa: F401 - registers all mapped tables


def test_current_metadata_compiles_for_postgresql():
    """Catch SQLite-only model/type/index choices before a live PostgreSQL gate."""
    dialect = postgresql.dialect()
    compiled_tables = []
    compiled_indexes = []

    for table in Base.metadata.sorted_tables:
        sql = str(CreateTable(table).compile(dialect=dialect))
        assert f"CREATE TABLE {table.name}" in sql
        compiled_tables.append(table.name)
        for index in table.indexes:
            index_sql = str(CreateIndex(index).compile(dialect=dialect))
            assert "CREATE INDEX" in index_sql or "CREATE UNIQUE INDEX" in index_sql
            compiled_indexes.append(index.name)

    assert "investigations" in compiled_tables
    assert "entities" in compiled_tables
    assert "relationship_edges" in compiled_tables
    assert "documents" in compiled_tables
    assert "extraction_candidates" in compiled_tables
    assert len(compiled_tables) >= 28
    assert compiled_indexes
