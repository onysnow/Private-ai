"""Row browsing: filters, search, sorting, keyset/offset paging, export."""

from __future__ import annotations

import base64
import csv
import io
import json
import re
from typing import Any, Iterator, Mapping, Sequence

from sqlalchemy import Column, Select, Table, and_, cast, func, or_, select
from sqlalchemy import String as SAString
from sqlalchemy.engine import Connection

from opsconsole.config import Limits, TablePolicy
from opsconsole.core.introspect import coerce_value, column_kind, json_safe

MASK = "••••"
_FILTER_KEY = re.compile(r"^filter\[([A-Za-z0-9_]+)\]$")
OPS = {"eq", "ne", "lt", "lte", "gt", "gte", "like", "in", "null", "notnull"}


def parse_filters(params: Mapping[str, str] | Sequence[tuple[str, str]]) -> list[tuple[str, str, str]]:
    items = params.items() if isinstance(params, Mapping) else params
    out: list[tuple[str, str, str]] = []
    for key, value in items:
        m = _FILTER_KEY.match(key)
        if not m:
            continue
        op, _, arg = value.partition(":")
        if op not in OPS:
            arg, op = value, "eq"
        out.append((m.group(1), op, arg))
    return out


def _condition(column: Column[Any], op: str, arg: str) -> Any:
    if op == "null":
        return column.is_(None)
    if op == "notnull":
        return column.is_not(None)
    if op == "like":
        return cast(column, SAString).ilike(f"%{arg}%")
    if op == "in":
        return column.in_([coerce_value(column, v.strip()) for v in arg.split(",") if v.strip()])
    value = coerce_value(column, arg)
    return {"eq": column == value, "ne": column != value, "lt": column < value, "lte": column <= value, "gt": column > value, "gte": column >= value}[op]


def apply_filters(stmt: Select[Any], table: Table, filters: Sequence[tuple[str, str, str]], q: str | None, policy: TablePolicy) -> Select[Any]:
    for name, op, arg in filters:
        if name not in table.c:
            raise ValueError(f"unknown column {name!r}")
        if policy.is_masked(table.name, name):
            raise ValueError(f"{name} is masked and cannot be filtered")
        stmt = stmt.where(_condition(table.c[name], op, arg))
    if q:
        textual = [c for c in table.columns if column_kind(c) in ("text", "enum", "json") and not policy.is_masked(table.name, c.name)]
        if textual:
            stmt = stmt.where(or_(*[cast(c, SAString).ilike(f"%{q}%") for c in textual]))
    return stmt


def encode_cursor(values: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(values, default=str).encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> dict[str, Any]:
    padded = cursor + "=" * (-len(cursor) % 4)
    try:
        value = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception as exc:
        raise ValueError("bad cursor") from exc
    if not isinstance(value, dict):
        raise ValueError("bad cursor")
    return value


def row_dict(table: Table, row: Mapping[Any, Any], policy: TablePolicy) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for c in table.columns:
        out[c.name] = MASK if policy.is_masked(table.name, c.name) else json_safe(row[c.name])
    return out


def browse(conn: Connection, table: Table, *, policy: TablePolicy, limits: Limits, filters: Sequence[tuple[str, str, str]], q: str | None,
           sort: str | None, order: str, limit: int, cursor: str | None, offset: int) -> dict[str, Any]:
    pk = list(table.primary_key.columns)
    sort_col = table.c[sort] if sort and sort in table.c else (pk[0] if pk else list(table.columns)[0])
    desc = order != "asc"
    keyset = bool(pk) and len(pk) == 1 and sort_col is pk[0]
    stmt = apply_filters(select(table), table, filters, q, policy)
    ordering = [sort_col.desc() if desc else sort_col.asc()]
    if not keyset and pk:
        ordering += [c.desc() if desc else c.asc() for c in pk if c is not sort_col]
    stmt = stmt.order_by(*ordering)
    if keyset and cursor:
        last = decode_cursor(cursor).get("k")
        value = coerce_value(sort_col, last)
        stmt = stmt.where(sort_col < value if desc else sort_col > value)
    elif offset:
        if offset > limits.offset_max:
            raise ValueError(f"offset above {limits.offset_max}; narrow with a filter or sort by the primary key")
        stmt = stmt.offset(offset)
    limit = max(1, min(limit, limits.max_rows))
    rows = conn.execute(stmt.limit(limit + 1)).mappings().all()
    more = len(rows) > limit
    rows = rows[:limit]
    items = [row_dict(table, r, policy) for r in rows]
    next_cursor: str | None = None
    if more:
        next_cursor = encode_cursor({"k": json_safe(rows[-1][sort_col.name])}) if keyset else encode_cursor({"o": offset + limit})
    return {"items": items, "next": next_cursor, "sort": sort_col.name, "order": "desc" if desc else "asc", "keyset": keyset, "limit": limit}


def count(conn: Connection, table: Table, *, policy: TablePolicy, filters: Sequence[tuple[str, str, str]], q: str | None) -> int:
    stmt = apply_filters(select(func.count()).select_from(table), table, filters, q, policy)
    return int(conn.execute(stmt).scalar_one())


def get_row(conn: Connection, table: Table, pk_values: Mapping[str, Any], *, policy: TablePolicy) -> dict[str, Any] | None:
    stmt = select(table).where(pk_condition(table, pk_values))
    row = conn.execute(stmt).mappings().first()
    return row_dict(table, row, policy) if row else None


def raw_row(conn: Connection, table: Table, pk_values: Mapping[str, Any]) -> dict[str, Any] | None:
    row = conn.execute(select(table).where(pk_condition(table, pk_values))).mappings().first()
    return dict(row) if row else None


def pk_condition(table: Table, pk_values: Mapping[str, Any]) -> Any:
    pk = list(table.primary_key.columns)
    if not pk:
        raise ValueError(f"{table.name} has no primary key")
    missing = [c.name for c in pk if c.name not in pk_values]
    if missing:
        raise ValueError(f"missing primary key value(s): {missing}")
    return and_(*[c == coerce_value(c, pk_values[c.name]) for c in pk])


def parse_pk(table: Table, raw: str) -> dict[str, Any]:
    """'/rows/{pk}': a single value, or JSON for composite keys."""
    pk = list(table.primary_key.columns)
    if len(pk) == 1:
        return {pk[0].name: raw}
    try:
        value = json.loads(raw)
    except ValueError as exc:
        raise ValueError("composite primary key: pass a JSON object of column -> value") from exc
    if not isinstance(value, dict):
        raise ValueError("composite primary key: pass a JSON object of column -> value")
    return value


def related_counts(conn: Connection, table: Table, row: Mapping[str, Any], all_tables: Sequence[Table]) -> list[dict[str, Any]]:
    """How many rows in other tables point at this row (per inbound FK)."""
    out: list[dict[str, Any]] = []
    for other in all_tables:
        for c in other.columns:
            for fk in c.foreign_keys:
                if fk.column.table is table:
                    value = row.get(fk.column.name)
                    n = int(conn.execute(select(func.count()).select_from(other).where(c == value)).scalar_one())
                    out.append({"table": other.name, "column": c.name, "count": n, "filter": f"filter[{c.name}]=eq:{value}"})
    return out


def export_rows(conn: Connection, table: Table, *, policy: TablePolicy, filters: Sequence[tuple[str, str, str]], q: str | None,
                fmt: str, max_rows: int) -> Iterator[str]:
    stmt = apply_filters(select(table), table, filters, q, policy)
    pk = list(table.primary_key.columns)
    if pk:
        stmt = stmt.order_by(*[c.asc() for c in pk])
    result = conn.execution_options(stream_results=True).execute(stmt.limit(max_rows))
    names = [c.name for c in table.columns]
    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(names)
        yield buf.getvalue()
        for chunk in result.mappings().partitions(500):
            buf = io.StringIO()
            writer = csv.writer(buf)
            for r in chunk:
                d = row_dict(table, r, policy)
                writer.writerow([json.dumps(d[n]) if isinstance(d[n], (dict, list)) else ("" if d[n] is None else d[n]) for n in names])
            yield buf.getvalue()
    else:
        yield "["
        first = True
        for chunk in result.mappings().partitions(500):
            for r in chunk:
                yield ("" if first else ",\n") + json.dumps(row_dict(table, r, policy), ensure_ascii=False)
                first = False
        yield "]"
