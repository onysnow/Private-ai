"""Reading an amount from a record: FtM numbers are text and may carry
thousands separators; anything else is not a number."""

from __future__ import annotations

from typing import Any

from app.patterns.graph import first


def amount(props: dict[str, list[Any]]) -> float | None:
    raw = str(first(props, "amount") or "").replace(",", "").replace(" ", "")
    try:
        return float(raw) if raw else None
    except ValueError:
        return None
