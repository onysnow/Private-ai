"""Reading values from records: FtM numbers and dates are text."""

from __future__ import annotations

from datetime import date
from typing import Any

from app.patterns.graph import first


def number(props: dict[str, list[Any]], key: str = "amount") -> float | None:
    raw = str(first(props, key) or "").replace(",", "").replace(" ", "")
    try:
        return float(raw) if raw else None
    except ValueError:
        return None


def day(props: dict[str, list[Any]], key: str = "date") -> date | None:
    """A date given at least to the day; a month or a year alone is not a day."""
    raw = str(first(props, key) or "")[:10]
    try:
        return date.fromisoformat(raw) if len(raw) == 10 else None
    except ValueError:
        return None
