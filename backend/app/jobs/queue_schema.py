"""Procrastinate's tables, in their own PostgreSQL schema ("procrastinate").

Keeping the queue out of the Workbench's own schema (public) means the
schema-compatibility check, backups and the operator console never see it.
Migration d8b2f4a6c913 applies it; ``ensure_queue_schema`` also applies it
at start-up when a database was adopted by stamping (a pre-Alembic
database brought under management skips migrations, see
app/db/migrations.py), so the queue never starts against a missing schema.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Connection, Engine, text

QUEUE_SCHEMA = "procrastinate"
SCHEMA_SQL = Path(__file__).resolve().parents[2] / "alembic" / "sql" / "procrastinate_3.10.0_schema.sql"


def queue_schema_present(connection: Connection) -> bool:
    return connection.execute(text("SELECT to_regclass('procrastinate.procrastinate_jobs')")).scalar() is not None


def apply_queue_schema(connection: Connection) -> None:
    """Create the schema and run the vendored SQL inside the caller's
    transaction, leaving search_path as it was."""
    connection.exec_driver_sql(f"CREATE SCHEMA IF NOT EXISTS {QUEUE_SCHEMA}")
    previous = connection.exec_driver_sql("SELECT current_setting('search_path')").scalar()
    # The vendored SQL uses unqualified names: point search_path at the queue
    # schema for this transaction only.
    connection.exec_driver_sql(f"SELECT set_config('search_path', '{QUEUE_SCHEMA}', true)")
    # Through the driver cursor with no parameters: the SQL contains "%"
    # placeholders in PL/pgSQL RAISE messages that must reach PostgreSQL as-is.
    with connection.connection.driver_connection.cursor() as cursor:  # type: ignore[union-attr]
        cursor.execute(SCHEMA_SQL.read_text(encoding="utf-8"))
    connection.exec_driver_sql("SELECT set_config('search_path', %s, true)", (previous,))


def ensure_queue_schema(engine: Engine) -> bool:
    """Apply the queue schema if it is missing; returns True when it did."""
    with engine.begin() as connection:
        if queue_schema_present(connection):
            return False
        apply_queue_schema(connection)
        return True
