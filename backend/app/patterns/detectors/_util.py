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


def amount_words(props: dict[str, list[Any]]) -> str:
    """A payment's amount as a reader writes it: "375,000,000 USD", not
    "375000000 USD". Empty when the record has no amount."""
    value = number(props)
    currency = str(first(props, "currency") or "").strip()
    if value is None:
        raw = str(first(props, "amount") or "").strip()
        return f"{raw} {currency}".strip()
    shown = f"{value:,.2f}".removesuffix(".00")
    return f"{shown} {currency}".strip()
