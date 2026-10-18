"""Does the quote state the value? The quote check (app/ai/quote_check.py)
proves that a visual item's quote is in its record; this proves the item's
number or date is in that quote. A figure card, a bar or a timeline item
is the one place a draft writes a value itself (design doc: "the evidence
itself states every number or date the visual shows"), so a value its
quotes do not state is removed, like a quote that cannot be found.

- A number matches when a quote states it to the precision the item writes
  it: "$2.4M" is matched by "2,400,000.00" or "2.43 million" (it rounds to
  2.4 million), not by "2,500,000". Thousand, million and billion are read
  as words or as K, M, B/bn; percentages only match percentages.
- A date matches when a quote states every part the item gives: "2023-11"
  is matched by "14 November 2023" or "2023-11-14", "2023" by any date in
  that year. Dates written 11/14/2023 or 14/11/2023 are read both ways.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

_SCALES = {"k": 3, "thousand": 3, "m": 6, "mn": 6, "million": 6, "b": 9, "bn": 9, "billion": 9}
_NUMBER = re.compile(
    r"(?<![\w.])(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?P<pct>%)?(?:\s*(?P<scale>thousand|million|billion|mn|bn|[kmb])(?![a-z]))?",
    re.IGNORECASE)
_MONTHS = {name: i + 1 for i, name in enumerate(("january", "february", "march", "april", "may", "june", "july", "august", "september",
                                                  "october", "november", "december"))}
_MONTHS.update({name[:3]: n for name, n in list(_MONTHS.items())})
_MONTHS["sept"] = 9


@dataclass(frozen=True)
class Stated:
    value: Decimal
    percent: bool


def stated_numbers(text: str) -> list[Stated]:
    """Every number a passage states, scaled by its thousand/million/billion."""
    out: list[Stated] = []
    for m in _NUMBER.finditer(text or ""):
        try:
            value = Decimal(m.group("num").replace(",", ""))
        except InvalidOperation:
            continue
        scale = (m.group("scale") or "").lower()
        out.append(Stated(value.scaleb(_SCALES[scale]) if scale in _SCALES else value, bool(m.group("pct"))))
    return out


def written_number(text: str) -> tuple[Stated, Decimal] | None:
    """The number an item writes (its first), and half a unit of its last
    digit: how far a stated number may be from it and still round to it."""
    m = _NUMBER.search((text or "").replace("−", "-"))
    if m is None:
        return None
    digits = m.group("num").replace(",", "")
    places = len(digits.split(".")[1]) if "." in digits else 0
    scale = _SCALES.get((m.group("scale") or "").lower(), 0)
    value = Decimal(digits).scaleb(scale)
    return Stated(value, bool(m.group("pct"))), Decimal(5).scaleb(scale - places - 1)


def _plain(number: float | int) -> str:
    """A chart value as the digits it is drawn with: 2400000.0 -> "2400000"."""
    text = format(Decimal(repr(number)), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def number_stated(written: str | float | int, quotes: list[str], *, percent: bool | None = None) -> bool:
    """Whether any quote states the number an item writes, to its precision.
    `percent` says whether a bare chart value is a percentage (its unit)."""
    if isinstance(written, (int, float)) and not isinstance(written, bool):
        target = written_number(_plain(written))
    else:
        target = written_number(str(written))
    if target is None:
        return False
    want, slack = target
    wants_percent = want.percent if percent is None else percent
    for quote in quotes:
        for said in stated_numbers(quote):
            if said.percent == wants_percent and abs(said.value - want.value) <= slack:
                return True
    return False


def text_stated(written: str, quotes: list[str]) -> bool:
    """Whether any quote states a value written without a number (a place, a
    name), ignoring case and spacing."""
    needle = " ".join((written or "").split()).casefold()
    return bool(needle) and any(needle in " ".join(q.split()).casefold() for q in quotes)


def _date_parts(text: str) -> tuple[int, int | None, int | None] | None:
    """(year, month, day) an item writes, as far as it goes."""
    text = (text or "").strip()
    m = re.fullmatch(r"(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?", text)
    if m:
        return int(m.group(1)), int(m.group(2)) if m.group(2) else None, int(m.group(3)) if m.group(3) else None
    m = re.search(r"(?:(\d{1,2})\s+)?([A-Za-z]{3,9})\.?\s+(\d{4})", text)
    if m and m.group(2).lower() in _MONTHS:
        return int(m.group(3)), _MONTHS[m.group(2).lower()], int(m.group(1)) if m.group(1) else None
    m = re.search(r"\b(\d{4})\b", text)
    return (int(m.group(1)), None, None) if m else None


def stated_dates(text: str) -> list[tuple[int, int | None, int | None]]:
    """Every date a passage states, in the forms records use."""
    text = text or ""
    out: list[tuple[int, int | None, int | None]] = []
    for m in re.finditer(r"\b(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?\b", text):
        out.append((int(m.group(1)), int(m.group(2)), int(m.group(3)) if m.group(3) else None))
    for m in re.finditer(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b", text):
        a, b, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        out.extend([(year, b, a), (year, a, b)])   # day-first and month-first
    for m in re.finditer(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]{3,9})\.?,?\s+(\d{4})\b", text):
        if m.group(2).lower() in _MONTHS:
            out.append((int(m.group(3)), _MONTHS[m.group(2).lower()], int(m.group(1))))
    for m in re.finditer(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b", text):
        if m.group(1).lower() in _MONTHS:
            out.append((int(m.group(3)), _MONTHS[m.group(1).lower()], int(m.group(2))))
    for m in re.finditer(r"\b([A-Za-z]{3,9})\.?\s+(\d{4})\b", text):
        if m.group(1).lower() in _MONTHS:
            out.append((int(m.group(2)), _MONTHS[m.group(1).lower()], None))
    for m in re.finditer(r"\b(\d{4})\b", text):
        out.append((int(m.group(1)), None, None))
    return out


def date_stated(written: str, quotes: list[str]) -> bool:
    """Whether any quote states every part of the date an item writes."""
    want = _date_parts(written)
    if want is None:
        return False
    for quote in quotes:
        for said in stated_dates(quote):
            if said[0] == want[0] and (want[1] is None or said[1] == want[1]) and (want[2] is None or said[2] == want[2]):
                return True
    return False


def unstated_value(kind: str, item: dict, quotes: list[str], unit: str | None = None) -> str | None:
    """Why a figure, bar or timeline item's value is not stated by its
    quotes, or None when it is."""
    if kind == "figures":
        value = str(item.get("value") or "")
        stated = number_stated(value, quotes) if written_number(value) else text_stated(value, quotes)
        return None if stated else f"the value {value!r} is not stated in its quotes"
    if kind == "bar":
        number = item.get("value")
        if isinstance(number, bool) or not isinstance(number, (int, float)):
            return "the bar has no number"
        is_percent = (unit or "").strip().casefold() in ("%", "percent", "per cent", "percentage")
        return None if number_stated(number, quotes, percent=is_percent) else f"the value {_plain(number)} is not stated in its quotes"
    if kind == "timeline":
        date = str(item.get("date") or "")
        return None if date_stated(date, quotes) else f"the date {date!r} is not stated in its quotes"
    return None
