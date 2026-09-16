from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, inspect
from sqlalchemy.sql.sqltypes import NullType

from app.db.session import Base
import app.models.domain  # noqa: F401  # register mapped tables

ALEMBIC_VERSION_TABLE = "alembic_version"
BACKEND_DIR = Path(__file__).resolve().parents[2]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


@dataclass
class SchemaCompatibilityReport:
    compatible: bool
    versioned: bool
    empty: bool
    missing_tables: list[str] = field(default_factory=list)
    unexpected_tables: list[str] = field(default_factory=list)
    table_issues: dict[str, list[str]] = field(default_factory=dict)

    def summary(self) -> str:
        if self.empty:
            return "database contains no Journalism Workbench application tables"
        if self.compatible:
            return "database schema is compatible with the current Journalism Workbench metadata"
        parts: list[str] = []
        if self.missing_tables:
            parts.append("missing tables: " + ", ".join(self.missing_tables))
        if self.unexpected_tables:
            parts.append("unexpected application tables: " + ", ".join(self.unexpected_tables))
        for table, issues in sorted(self.table_issues.items()):
            parts.append(f"{table}: " + "; ".join(issues))
        return " | ".join(parts) or "database schema is incompatible"


def _application_table_names() -> set[str]:
    return set(Base.metadata.tables)


def _live_application_tables(engine: Engine) -> tuple[set[str], bool]:
    inspector = inspect(engine)
    names = set(inspector.get_table_names())
    return names - {ALEMBIC_VERSION_TABLE}, ALEMBIC_VERSION_TABLE in names


def _type_family(value) -> str:
    """Compare portable SQL type families instead of dialect-specific rendered names."""
    if isinstance(value, NullType):
        return "unknown"
    affinity = getattr(value, "_type_affinity", type(value))
    return getattr(affinity, "__name__", type(value).__name__).lower()


def inspect_schema_compatibility(engine: Engine) -> SchemaCompatibilityReport:
    inspector = inspect(engine)
    expected_tables = _application_table_names()
    live_tables, versioned = _live_application_tables(engine)

    # A newly-created database may contain unrelated system tables, but no app tables.
    if not live_tables:
        return SchemaCompatibilityReport(compatible=False, versioned=versioned, empty=True)

    missing = sorted(expected_tables - live_tables)
    unexpected = sorted(live_tables - expected_tables)
    issues: dict[str, list[str]] = {}

    for table_name in sorted(expected_tables & live_tables):
        expected = Base.metadata.tables[table_name]
        live_columns = {col["name"]: col for col in inspector.get_columns(table_name)}
        expected_columns = {col.name: col for col in expected.columns}
        table_issues: list[str] = []

        missing_cols = sorted(set(expected_columns) - set(live_columns))
        extra_cols = sorted(set(live_columns) - set(expected_columns))
        if missing_cols:
            table_issues.append("missing columns " + ", ".join(missing_cols))
        if extra_cols:
            table_issues.append("unexpected columns " + ", ".join(extra_cols))

        for name in sorted(set(expected_columns) & set(live_columns)):
            wanted = expected_columns[name]
            actual = live_columns[name]
            expected_family = _type_family(wanted.type)
            actual_family = _type_family(actual["type"])
            if expected_family != actual_family:
                table_issues.append(
                    f"column {name} type {actual_family} != expected {expected_family}"
                )
            # Primary-key columns are reported non-null on some dialects and nullable on
            # others, so compare nullable only for non-PK columns.
            if not wanted.primary_key and bool(actual.get("nullable", True)) != bool(wanted.nullable):
                table_issues.append(
                    f"column {name} nullable={actual.get('nullable')} != expected {wanted.nullable}"
                )

        expected_pk = {col.name for col in expected.primary_key.columns}
        actual_pk = set((inspector.get_pk_constraint(table_name) or {}).get("constrained_columns") or [])
        if expected_pk != actual_pk:
            table_issues.append(
                "primary key " + ", ".join(sorted(actual_pk)) +
                " != expected " + ", ".join(sorted(expected_pk))
            )

        # Legacy adoption must preserve relational integrity, not just columns.
        # PostgreSQL will enforce these constraints even when SQLite test data may
        # have appeared to work without them, so fail closed before stamping an
        # unversioned database that is missing or has drifted foreign keys.
        expected_fks = {
            (
                tuple(fk.parent.name for fk in constraint.elements),
                constraint.referred_table.name,
                tuple(fk.column.name for fk in constraint.elements),
                (constraint.ondelete or "").upper(),
            )
            for constraint in expected.foreign_key_constraints
        }
        actual_fks = {
            (
                tuple(fk.get("constrained_columns") or ()),
                str(fk.get("referred_table") or ""),
                tuple(fk.get("referred_columns") or ()),
                str((fk.get("options") or {}).get("ondelete") or "").upper(),
            )
            for fk in inspector.get_foreign_keys(table_name)
        }
        if expected_fks != actual_fks:
            missing_fks = sorted(expected_fks - actual_fks)
            unexpected_fks = sorted(actual_fks - expected_fks)
            if missing_fks:
                table_issues.append("missing foreign keys " + repr(missing_fks))
            if unexpected_fks:
                table_issues.append("unexpected foreign keys " + repr(unexpected_fks))

        # Named SQLAlchemy UniqueConstraint objects are part of the data model.
        # Compare constrained column sets rather than generated names so this is
        # portable across SQLite and PostgreSQL naming conventions.
        expected_uniques = {
            tuple(sorted(col.name for col in constraint.columns))
            for constraint in expected.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        }
        actual_uniques = {
            tuple(sorted(unique.get("column_names") or ()))
            for unique in inspector.get_unique_constraints(table_name)
            if unique.get("column_names")
        }
        if expected_uniques != actual_uniques:
            missing_uniques = sorted(expected_uniques - actual_uniques)
            unexpected_uniques = sorted(actual_uniques - expected_uniques)
            if missing_uniques:
                table_issues.append("missing unique constraints " + repr(missing_uniques))
            if unexpected_uniques:
                table_issues.append("unexpected unique constraints " + repr(unexpected_uniques))

        if table_issues:
            issues[table_name] = table_issues

    compatible = not missing and not unexpected and not issues
    return SchemaCompatibilityReport(
        compatible=compatible,
        versioned=versioned,
        empty=False,
        missing_tables=missing,
        unexpected_tables=unexpected,
        table_issues=issues,
    )


def _alembic_config(database_url: str) -> Config:
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    cfg.attributes["database_url_override"] = database_url
    return cfg


def ensure_database_schema(engine: Engine) -> SchemaCompatibilityReport:
    """Safely bring a database under Alembic management and upgrade it to head.

    Rules:
    - Empty DB: run migrations normally.
    - Already versioned DB: run migrations normally.
    - Legacy unversioned DB: stamp head only when its live schema matches current
      SQLAlchemy metadata exactly enough to be safely adopted.
    - Partial/incompatible legacy DB: fail closed without stamping or mutating it.
    """
    report = inspect_schema_compatibility(engine)

    # Ephemeral SQLite databases cannot be migrated through Alembic using its
    # separate engine/connection because the schema would disappear with that
    # connection. They are useful for isolated tests and diagnostics only, so
    # bootstrap them directly from the exact current metadata. Persistent SQLite
    # and PostgreSQL databases continue through Alembic below.
    if engine.dialect.name == "sqlite" and engine.url.database in (None, "", ":memory:"):
        Base.metadata.create_all(engine)
        return inspect_schema_compatibility(engine)

    database_url = engine.url.render_as_string(hide_password=False)
    cfg = _alembic_config(database_url)

    if report.versioned or report.empty:
        command.upgrade(cfg, "head")
        engine.dispose()
        return inspect_schema_compatibility(engine)

    if not report.compatible:
        raise RuntimeError(
            "Refusing to adopt an unversioned Journalism Workbench database because "
            "its schema does not match the current application model. Back up the database "
            "before repair. " + report.summary()
        )

    # Legacy create_all-era DB is structurally current: record that fact without replaying
    # the initial migration's CREATE TABLE operations over reporter data.
    command.stamp(cfg, "head")
    command.upgrade(cfg, "head")
    engine.dispose()
    return inspect_schema_compatibility(engine)
