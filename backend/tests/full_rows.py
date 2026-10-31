"""One row in every table, with every column filled (review A2, A4).

Built from the model metadata, so a column or table added later is filled too without
editing this file. Each foreign key points at the one row of the table it names; a table
that points at itself gets two rows, a parent with that column empty and a child that
points at it, so the child still has every column filled.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, Integer, MetaData, String, Table, Text

# One distinct value per type, none of them a column default, so a value lost on the way
# (a column dropped, a default written over it, a JSON object read back as a string, a
# datetime losing its microseconds) shows as a difference.
WHEN = datetime(2026, 3, 4, 5, 6, 7, 891011)
JSON_VALUE: dict[str, Any] = {"kept": ["exactly", 2, 3.5, True, None, {"nested": "ü"}]}


def _text(table: str, column: str, limit: int | None, suffix: str, prefix: str = "") -> str:
    # The prefix and suffix lead, so a short column (and a unique one) still tells two cases'
    # rows, and the two rows of one table, apart.
    value = f"{prefix}{suffix[0]}:{table}.{column} ü"
    return value[:limit] if limit else value


def _default_is_list(column: Any) -> bool:
    default = column.default
    if default is None:
        return False
    arg = default.arg
    if callable(arg):
        try:
            arg = arg(None)
        except TypeError:
            arg = arg()
    return isinstance(arg, list)


def _value(table: Table, column: Any, index: int, suffix: str, prefix: str = "") -> Any:
    kind = column.type
    if suffix == "child":
        index += 100
    if isinstance(kind, Boolean):
        return True
    if isinstance(kind, BigInteger):
        return 2**40 + index
    if isinstance(kind, Integer):
        return 7 + index
    if isinstance(kind, Float):
        return 1.25 + index
    if isinstance(kind, DateTime):
        return WHEN
    if isinstance(kind, JSON):
        # A list column (its default makes a list) gets a list of one object, which code that
        # walks it (a capture's files, a document's issues) can read; any other gets the object.
        return [dict(JSON_VALUE)] if _default_is_list(column) else dict(JSON_VALUE)
    if isinstance(kind, Text):
        return _text(table.name, column.name, None, suffix, prefix) + "\nsecond line"
    if isinstance(kind, String):
        return _text(table.name, column.name, kind.length, suffix, prefix)
    raise AssertionError(f"no value for {table.name}.{column.name} of type {kind!r}: add one to tests/full_rows.py")


def _primary_value(table: Table, suffix: str, prefix: str = "") -> str:
    return f"{prefix}{table.name[:24]}-{suffix}"


def full_rows(metadata: MetaData, tables: list[str] | None = None, *, investigation_id: str = "inv-full",
              prefix: str = "", int_start: int = 0) -> dict[str, list[dict[str, Any]]]:
    """Rows keyed by table name, in an order that inserts parents first. A prefix starts every
    string, so two cases' rows can sit in one database and each can be told by its prefix."""
    wanted = set(tables) if tables is not None else set(metadata.tables)
    ids: dict[str, Any] = {}
    out: dict[str, list[dict[str, Any]]] = {}
    for table in metadata.sorted_tables:
        if table.name not in wanted:
            continue
        self_refs = {fk.parent.name for fk in table.foreign_keys if fk.column.table is table}
        rows: list[dict[str, Any]] = []
        for suffix in (["parent", "child"] if self_refs else ["one"]):
            row: dict[str, Any] = {}
            for index, column in enumerate(table.columns):
                fks = list(column.foreign_keys)
                if column.name == "investigation_id":
                    row[column.name] = investigation_id
                elif fks and fks[0].column.table is table:
                    row[column.name] = None if suffix == "parent" else rows[0][fks[0].column.name]
                elif fks:
                    target = fks[0].column
                    key = f"{target.table.name}.{target.name}"
                    if key not in ids:
                        raise AssertionError(f"{table.name}.{column.name} points at {key}, which has no row yet")
                    row[column.name] = ids[key]
                elif column.primary_key and isinstance(column.type, String):
                    row[column.name] = _primary_value(table, suffix, prefix)
                elif column.primary_key:
                    row[column.name] = int_start + index + (1 if suffix != "child" else 2)
                else:
                    row[column.name] = _value(table, column, index, suffix, prefix)
            if table.name == "investigations":
                row["id"] = investigation_id
            rows.append(row)
        for column in table.columns:
            ids[f"{table.name}.{column.name}"] = rows[0][column.name]
        out[table.name] = rows
    return out
