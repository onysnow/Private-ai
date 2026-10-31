from __future__ import annotations

import os
import sqlite3
import subprocess
from pathlib import Path

from app.db.session import Base
import app.models.domain  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _run_alembic(db_path: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    return subprocess.run(
        ["alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )


def _tables(db_path: Path) -> set[str]:
    with sqlite3.connect(db_path) as con:
        return {
            row[0]
            for row in con.execute(
                "select name from sqlite_master where type='table' and name not like 'sqlite_%'"
            )
        }


def test_alembic_initial_schema_matches_metadata(tmp_path: Path):
    db_path = tmp_path / "migrated.db"
    _run_alembic(db_path, "upgrade", "head")

    live = _tables(db_path)
    expected = set(Base.metadata.tables)
    # Equal, not a subset: a table the migrations still create but no model maps fails too.
    assert live - {"alembic_version"} == expected
    assert "alembic_version" in live

    check = _run_alembic(db_path, "check")
    combined = check.stdout + check.stderr
    assert "No new upgrade operations detected" in combined


def test_alembic_round_trip(tmp_path: Path):
    db_path = tmp_path / "roundtrip.db"
    _run_alembic(db_path, "upgrade", "head")
    _run_alembic(db_path, "downgrade", "base")
    assert _tables(db_path) == {"alembic_version"}
    _run_alembic(db_path, "upgrade", "head")
    assert set(Base.metadata.tables) <= _tables(db_path)


def test_legacy_unversioned_schema_is_safely_adopted_without_data_loss(tmp_path: Path):
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.db.migrations import ensure_database_schema
    from app.models.domain import Investigation

    db_path = tmp_path / "legacy-current.db"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(Investigation(id="legacy-investigation", name="Keep me", description="reporter data"))
        db.commit()

    assert "alembic_version" not in _tables(db_path)
    report = ensure_database_schema(engine)
    assert report.compatible and report.versioned
    assert "alembic_version" in _tables(db_path)
    with Session(engine) as db:
        row = db.scalar(select(Investigation).where(Investigation.id == "legacy-investigation"))
        assert row is not None and row.name == "Keep me"


def test_incompatible_unversioned_schema_fails_closed_without_stamping(tmp_path: Path):
    from sqlalchemy import create_engine
    from app.db.migrations import ensure_database_schema

    db_path = tmp_path / "partial-legacy.db"
    with sqlite3.connect(db_path) as con:
        con.execute("create table investigations (id varchar primary key, name varchar not null)")
        con.execute("insert into investigations (id, name) values ('keep-this', 'Do not mutate')")
        con.commit()

    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    try:
        ensure_database_schema(engine)
    except RuntimeError as exc:
        assert "Refusing to adopt" in str(exc)
        assert "missing tables" in str(exc) or "missing columns" in str(exc)
    else:
        raise AssertionError("Partial legacy schema should fail closed")

    assert "alembic_version" not in _tables(db_path)
    with sqlite3.connect(db_path) as con:
        assert con.execute("select name from investigations where id='keep-this'").fetchone()[0] == "Do not mutate"


def test_empty_database_is_created_by_alembic_not_create_all(tmp_path: Path):
    from sqlalchemy import create_engine
    from app.db.migrations import ensure_database_schema

    db_path = tmp_path / "empty-startup.db"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    report = ensure_database_schema(engine)
    assert report.compatible and report.versioned
    assert set(Base.metadata.tables) <= _tables(db_path)
    assert "alembic_version" in _tables(db_path)


def test_programmatic_alembic_config_preserves_database_credentials():
    from sqlalchemy.engine import make_url
    from app.db.migrations import _alembic_config

    url = make_url("postgresql+psycopg://reporter:s3cret@db.example:5432/journalism").render_as_string(hide_password=False)
    cfg = _alembic_config(url)
    assert cfg.attributes["database_url_override"] == url
    assert "s3cret" in cfg.attributes["database_url_override"]


def test_legacy_schema_adoption_fails_closed_when_foreign_key_is_missing(tmp_path: Path, monkeypatch):
    """Do not stamp a structurally drifted DB merely because its columns match.

    A proxy inspector simulates a legacy database whose tables/columns/PKs match
    current metadata but one FK has been lost. This is particularly important for
    PostgreSQL, where the live server will enforce referential integrity that a
    permissive SQLite-era database may not have had.
    """
    from sqlalchemy import create_engine
    import app.db.migrations as migrations

    db_path = tmp_path / "legacy-missing-fk.db"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    real_inspect = migrations.inspect

    class InspectorProxy:
        def __init__(self, inner):
            self._inner = inner

        def __getattr__(self, name):
            return getattr(self._inner, name)

        def get_foreign_keys(self, table_name, *args, **kwargs):
            rows = self._inner.get_foreign_keys(table_name, *args, **kwargs)
            if table_name == "evidence":
                return []
            return rows

    monkeypatch.setattr(migrations, "inspect", lambda bind: InspectorProxy(real_inspect(bind)))
    report = migrations.inspect_schema_compatibility(engine)
    assert not report.compatible
    assert "missing foreign keys" in " ".join(report.table_issues["evidence"])

    try:
        migrations.ensure_database_schema(engine)
    except RuntimeError as exc:
        assert "Refusing to adopt" in str(exc)
        assert "missing foreign keys" in str(exc)
    else:
        raise AssertionError("Schema missing an FK must not be stamped as current")

    assert "alembic_version" not in _tables(db_path)


def test_legacy_schema_adoption_fails_closed_when_unique_constraint_is_missing(tmp_path: Path, monkeypatch):
    """Unique constraints that prevent duplicate canonical links are adoption-critical."""
    from sqlalchemy import create_engine
    import app.db.migrations as migrations

    db_path = tmp_path / "legacy-missing-unique.db"
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    real_inspect = migrations.inspect

    class InspectorProxy:
        def __init__(self, inner):
            self._inner = inner

        def __getattr__(self, name):
            return getattr(self._inner, name)

        def get_unique_constraints(self, table_name, *args, **kwargs):
            rows = self._inner.get_unique_constraints(table_name, *args, **kwargs)
            if table_name == "claim_evidence_links":
                return []
            return rows

    monkeypatch.setattr(migrations, "inspect", lambda bind: InspectorProxy(real_inspect(bind)))
    report = migrations.inspect_schema_compatibility(engine)
    assert not report.compatible
    assert "missing unique constraints" in " ".join(report.table_issues["claim_evidence_links"])

    try:
        migrations.ensure_database_schema(engine)
    except RuntimeError as exc:
        assert "Refusing to adopt" in str(exc)
        assert "missing unique constraints" in str(exc)
    else:
        raise AssertionError("Schema missing a unique constraint must not be stamped as current")

    assert "alembic_version" not in _tables(db_path)


# The revision this PR's migrations start from (PR #117: 17 migrations, d7b3f1a9c264 to b2e5c8a1d730).
PR_BASE = "c5a9e3b72d14"


def test_pr_migrations_downgrade_and_upgrade_with_rows(tmp_path: Path):
    """Review A2: a downgrade on SQLite copies a table to add or drop a column (batch_alter_table),
    which is where rows are lost or a foreign key is refused, and an empty database runs none of
    that. Fill every table at head, step down one migration at a time to the PR's base, then up
    again, and check every row is still there with every value it kept, in every table that
    still exists. MIGRATION_TEST_URL runs it on another database (CI: PostgreSQL)."""
    from alembic import command
    from alembic.script import ScriptDirectory
    from sqlalchemy import MetaData, create_engine, func, inspect, select, text
    from app.db.migrations import _alembic_config
    from tests.full_rows import full_rows

    url = os.environ.get("MIGRATION_TEST_URL") or f"sqlite:///{(tmp_path / 'with-rows.db').as_posix()}"
    cfg = _alembic_config(url)
    script = ScriptDirectory.from_config(cfg)
    pr_revisions = []
    for revision in script.walk_revisions(PR_BASE, script.get_current_head()):
        if revision.revision != PR_BASE:
            pr_revisions.append(revision.revision)
    assert len(pr_revisions) == 17

    engine = create_engine(url)
    try:
        if os.environ.get("MIGRATION_TEST_URL"):
            command.downgrade(cfg, "base")  # a database kept between runs: start it empty
        command.upgrade(cfg, "head")
        rows = full_rows(Base.metadata, investigation_id="inv-migrations")
        with engine.begin() as conn:
            for name, table_rows in rows.items():
                conn.execute(Base.metadata.tables[name].insert(), table_rows)

        def check(where: str, only: dict[str, set[str]] | None = None) -> dict[str, set[str]]:
            """Every row still there with its values, in the tables and columns that exist now
            (or, with only, in those that lived through the downgrade). Returns what exists."""
            live = MetaData()
            live.reflect(bind=engine)
            present = {name: set(table.columns.keys()) for name, table in live.tables.items()}
            problems = []
            with engine.connect() as conn:
                for name, table_rows in rows.items():
                    if name not in live.tables or (only is not None and name not in only):
                        continue
                    table = live.tables[name]
                    found = conn.execute(select(func.count()).select_from(table)).scalar_one()
                    if found != len(table_rows):
                        problems.append(f"{name}: {found} rows, expected {len(table_rows)}")
                        continue
                    pk = [c.name for c in table.primary_key]
                    by_key = {tuple(r[c] for c in pk): dict(r) for r in conn.execute(select(table)).mappings()}
                    for row in table_rows:
                        kept = by_key.get(tuple(row[c] for c in pk))
                        if kept is None:
                            problems.append(f"{name}: row {row[pk[0]]!r} lost")
                            continue
                        for column in table.columns.keys():
                            if only is not None and column not in only[name]:
                                continue  # added back empty by the upgrade: its values went with the downgrade
                            if column in row and kept[column] != row[column]:
                                problems.append(f"{name}.{column}: {row[column]!r} became {kept[column]!r}")
            assert not problems, f"after {where}:\n" + "\n".join(problems)
            return present

        check("filling every table at head")
        at_base: dict[str, set[str]] = {}
        for revision in pr_revisions:
            command.downgrade(cfg, "-1")
            at_base = check(f"downgrading {revision}")
        assert inspect(engine).has_table("alembic_version")
        with engine.connect() as conn:
            assert conn.execute(text("select version_num from alembic_version")).scalar_one() == PR_BASE
        command.upgrade(cfg, "head")
        check("upgrading back to head", only=at_base)
    finally:
        if os.environ.get("MIGRATION_TEST_URL"):
            # Leave the database as CI's next steps expect it: at head, with no rows.
            with engine.begin() as conn:
                for table in reversed(Base.metadata.sorted_tables):
                    conn.execute(table.delete())
        engine.dispose()
