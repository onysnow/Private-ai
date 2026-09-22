"""Schema introspection: the host's SQLAlchemy MetaData (what the code declares)
next to the live database (what actually exists), with row estimates and
value coercion derived from column types. Nothing here is app-specific."""

from __future__ import annotations

import json
import threading
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable
from uuid import UUID

from sqlalchemy import (
    Column,
    Engine,
    MetaData,
    Table,
    UniqueConstraint,
    func,
    inspect,
    select,
    text,
)
from sqlalchemy import types as sqltypes
from sqlalchemy.engine import Connection

from opsconsole.config import TablePolicy


def json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (dict, list, str, int, float, bool)) or value is None:
        return value
    return str(value)


def column_kind(column: Column[Any]) -> str:
    """A small vocabulary the UI keys editors on: text, integer, number, boolean,
    datetime, date, json, enum, other."""
    t = column.type
    if isinstance(t, sqltypes.Boolean):
        return "boolean"
    if isinstance(t, sqltypes.Enum):
        return "enum"
    if isinstance(t, sqltypes.Integer):
        return "integer"
    if isinstance(t, (sqltypes.Numeric, sqltypes.Float)):
        return "number"
    if isinstance(t, sqltypes.DateTime):
        return "datetime"
    if isinstance(t, sqltypes.Date):
        return "date"
    if isinstance(t, sqltypes.JSON):
        return "json"
    if isinstance(t, (sqltypes.String, sqltypes.Text)):
        return "text"
    if isinstance(t, sqltypes.LargeBinary):
        return "binary"
    return "other"


def coerce_value(column: Column[Any], raw: Any) -> Any:
    """Turn a JSON value from the UI into what the column expects. Raises
    ValueError with a message naming the column."""
    kind = column_kind(column)
    if raw is None:
        if not column.nullable and not column.primary_key and column.default is None and column.server_default is None:
            raise ValueError(f"{column.name} is not nullable")
        return None
    try:
        if kind == "boolean":
            if isinstance(raw, bool):
                return raw
            if isinstance(raw, str) and raw.lower() in ("true", "false", "1", "0", "yes", "no"):
                return raw.lower() in ("true", "1", "yes")
            raise ValueError("expected true/false")
        if kind == "integer":
            if isinstance(raw, bool):
                raise ValueError("expected an integer")
            return int(raw)
        if kind == "number":
            return float(raw)
        if kind == "datetime":
            if isinstance(raw, datetime):
                return raw
            value = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if isinstance(column.type, sqltypes.DateTime) and not column.type.timezone and value.tzinfo is not None:
                value = value.astimezone(timezone.utc).replace(tzinfo=None)   # naive columns hold UTC
            return value
        if kind == "date":
            return raw if isinstance(raw, date) else date.fromisoformat(str(raw))
        if kind == "json":
            if isinstance(raw, str):
                return json.loads(raw)
            return raw
        if kind == "enum":
            enums = list(getattr(column.type, "enums", []) or [])
            if enums and str(raw) not in enums:
                raise ValueError(f"expected one of {enums}")
            return str(raw)
        if kind == "text":
            return raw if isinstance(raw, str) else json.dumps(raw)
        return raw
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{column.name}: {exc}") from exc


class SchemaIntrospector:
    def __init__(self, metadata: MetaData, engine: Engine, *, policy: TablePolicy, ignore: frozenset[str],
                 domain_of_table: Callable[[str], str] | None = None, table_docs: Callable[[str], str | None] | None = None,
                 live_ttl_seconds: float = 60.0, exact_count_rows: int = 50_000) -> None:
        self.metadata = metadata
        self.engine = engine
        self.policy = policy
        self.ignore = ignore
        self.domain_of_table = domain_of_table
        self.table_docs = table_docs
        self.live_ttl = live_ttl_seconds
        self.exact_count_rows = exact_count_rows
        self._lock = threading.Lock()
        self._live: dict[str, Any] | None = None
        self._live_at = 0.0
        self._counts: dict[str, tuple[float, int, bool]] = {}

    # --- model side ----------------------------------------------------------------------

    def model_tables(self) -> list[Table]:
        return [t for t in self.metadata.sorted_tables if t.name not in self.ignore and not self.policy.is_hidden(t.name)]

    def table(self, name: str) -> Table:
        if name in self.ignore or self.policy.is_hidden(name) or name not in self.metadata.tables:
            raise LookupError(f"unknown table {name!r}")
        return self.metadata.tables[name]

    def domain(self, name: str) -> str:
        if self.domain_of_table is None:
            return ""
        try:
            return self.domain_of_table(name) or ""
        except Exception:
            return ""

    def pk_columns(self, table: Table) -> list[Column[Any]]:
        return list(table.primary_key.columns)

    # --- live side -----------------------------------------------------------------------

    def invalidate(self) -> None:
        with self._lock:
            self._live = None
            self._counts.clear()

    def invalidate_counts(self, table: str | None = None) -> None:
        with self._lock:
            if table is None:
                self._counts.clear()
            else:
                self._counts.pop(table, None)

    def live(self) -> dict[str, Any]:
        with self._lock:
            if self._live is not None and time.monotonic() - self._live_at < self.live_ttl:
                return self._live
        insp = inspect(self.engine)
        names = set(insp.get_table_names())
        live: dict[str, Any] = {"tables": names, "columns": {}, "indexes": {}}
        for name in names:
            try:
                live["columns"][name] = {c["name"]: c for c in insp.get_columns(name)}
                live["indexes"][name] = insp.get_indexes(name)
            except Exception:  # a table we cannot reflect (permissions, exotic type) is still listed
                live["columns"][name] = {}
                live["indexes"][name] = []
        with self._lock:
            self._live = live
            self._live_at = time.monotonic()
        return live

    def row_count(self, conn: Connection, table: Table) -> tuple[int, bool]:
        """(count, estimated). Postgres: reltuples first; if under the exact
        threshold, a real COUNT. Other dialects: COUNT(*)."""
        cached = self._counts.get(table.name)
        if cached and time.monotonic() - cached[0] < 30:
            return cached[1], cached[2]
        estimated = False
        count = -1
        if conn.dialect.name == "postgresql":
            est = conn.execute(text("SELECT reltuples::bigint FROM pg_class WHERE relname = :n"), {"n": table.name}).scalar()
            if est is not None and int(est) > self.exact_count_rows:
                count, estimated = int(est), True
        if count < 0:
            count = int(conn.execute(select(func.count()).select_from(table)).scalar_one())
        with self._lock:
            self._counts[table.name] = (time.monotonic(), count, estimated)
        return count, estimated

    # --- shapes for the API --------------------------------------------------------------

    def column_info(self, table: Table, column: Column[Any], live_cols: dict[str, Any] | None = None) -> dict[str, Any]:
        indexed = bool(column.index or column.primary_key) or any(column.name in [c.name for c in ix.columns] for ix in table.indexes)
        refs = [{"table": fk.column.table.name, "column": fk.column.name} for fk in column.foreign_keys]
        default: Any = None
        if column.default is not None:
            default = getattr(column.default, "arg", None)
            default = default if isinstance(default, (str, int, float, bool)) else ("(callable)" if callable(default) else str(default))
        elif column.server_default is not None:
            default = str(getattr(column.server_default, "arg", column.server_default))
        info = {
            "name": column.name, "type": str(column.type), "kind": column_kind(column), "nullable": bool(column.nullable),
            "primary_key": bool(column.primary_key), "indexed": indexed, "default": default, "references": refs,
            "masked": self.policy.is_masked(table.name, column.name), "unique": bool(column.unique),
            "enum": list(getattr(column.type, "enums", []) or []) or None,
            "live": (column.name in live_cols) if live_cols is not None else None,
        }
        return info

    def table_summary(self, conn: Connection, table: Table) -> dict[str, Any]:
        live = self.live()
        present = table.name in live["tables"]
        count, estimated = (self.row_count(conn, table) if present else (0, False))
        return {
            "name": table.name, "domain": self.domain(table.name), "live": present, "rows": count, "estimated": estimated,
            "columns": len(table.columns), "primary_key": [c.name for c in table.primary_key.columns],
            "readonly": self.policy.is_readonly(table.name) or not table.primary_key.columns,
            "references": sorted({fk.column.table.name for c in table.columns for fk in c.foreign_keys}),
            "referenced_by": sorted({t.name for t in self.model_tables() for c in t.columns for fk in c.foreign_keys if fk.column.table.name == table.name}),
        }

    def table_detail(self, table: Table) -> dict[str, Any]:
        live = self.live()
        live_cols = live["columns"].get(table.name)
        model_indexes = [{"name": ix.name, "columns": [c.name for c in ix.columns], "unique": bool(ix.unique)} for ix in table.indexes]
        live_indexes = [{"name": ix.get("name"), "columns": list(ix.get("column_names") or []), "unique": bool(ix.get("unique"))} for ix in live["indexes"].get(table.name, [])]
        uniques = [{"name": c.name, "columns": [col.name for col in c.columns]} for c in table.constraints if isinstance(c, UniqueConstraint)]
        doc = None
        if self.table_docs is not None:
            try:
                doc = self.table_docs(table.name)
            except Exception:
                doc = None
        drift = None
        if live_cols is not None:
            model_names = {c.name for c in table.columns}
            drift = {"missing_in_db": sorted(model_names - set(live_cols)), "extra_in_db": sorted(set(live_cols) - model_names)}
        return {
            "name": table.name, "domain": self.domain(table.name), "doc": doc, "live": table.name in live["tables"],
            "readonly": self.policy.is_readonly(table.name) or not table.primary_key.columns,
            "primary_key": [c.name for c in table.primary_key.columns],
            "columns": [self.column_info(table, c, live_cols) for c in table.columns],
            "indexes": model_indexes, "live_indexes": live_indexes, "unique_constraints": uniques, "drift": drift,
            "references": [{"column": c.name, "table": fk.column.table.name, "target_column": fk.column.name} for c in table.columns for fk in c.foreign_keys],
            "referenced_by": [{"table": t.name, "column": c.name} for t in self.model_tables() for c in t.columns for fk in c.foreign_keys if fk.column.table.name == table.name],
        }

    def edges(self) -> list[dict[str, str]]:
        return [{"from_table": t.name, "from_column": c.name, "to_table": fk.column.table.name, "to_column": fk.column.name}
                for t in self.model_tables() for c in t.columns for fk in c.foreign_keys]

    def drift(self) -> dict[str, Any]:
        live = self.live()
        modeled = {t.name for t in self.model_tables()}
        live_names = set(live["tables"]) - self.ignore
        columns: dict[str, Any] = {}
        for t in self.model_tables():
            if t.name in live_names:
                lc = set(live["columns"].get(t.name, {}))
                mc = {c.name for c in t.columns}
                if lc != mc and lc:
                    columns[t.name] = {"missing_in_db": sorted(mc - lc), "extra_in_db": sorted(lc - mc)}
        return {"missing_tables": sorted(modeled - live_names), "extra_tables": sorted(live_names - modeled), "columns": columns}

    def unindexed_foreign_keys(self) -> list[str]:
        """A FK column is "indexed" only if it can be the leading (leftmost)
        column of a lookup: its own single-column index, the leading column
        of a multi-column index, or the leading column of the table's
        (possibly composite) primary key. A non-leading composite-PK column
        (e.g. the second column of a junction table's PK) does NOT get an
        efficient single-column lookup for free, so it still counts as
        unindexed unless it has its own index."""
        out: list[str] = []
        for table in self.model_tables():
            leading = {c.name for c in table.columns if c.index}
            pk_cols = list(table.primary_key.columns)
            if pk_cols:
                leading.add(pk_cols[0].name)
            for ix in table.indexes:
                ix_cols = list(ix.columns)
                if ix_cols:
                    leading.add(ix_cols[0].name)
            for col in table.columns:
                if col.foreign_keys and col.name not in leading:
                    out.append(f"{table.name}.{col.name}")
        return out
