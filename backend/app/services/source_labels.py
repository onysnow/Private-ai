"""A source's short label: the few words a chip has room for (mockup ACT_2: "Council minutes 14 Nov 2017 p.6",
"Companies register · 2018 return"). Sources keep one long title, so the label is worked out from what the source
already records, never typed: a court filing is named by what it is and its case number, a post by its account, an
article by its publisher and date; anything else is its title, cut at a word. The full title stays on hover
(DECISIONS_LOG 31)."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

MAX = 32
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
# The long names of common filings, as a reporter says them.
_KINDS = (
    (re.compile(r"complaint for forfeiture", re.I), "Forfeiture complaint"),
    (re.compile(r"deferred prosecution agreement", re.I), "DPA"),
    (re.compile(r"non-prosecution agreement", re.I), "NPA"),
    (re.compile(r"order to cease and desist", re.I), "Cease-and-desist order"),
    (re.compile(r"grounds of judg(e)?ment", re.I), "Judgment"),
    (re.compile(r"plea agreement", re.I), "Plea agreement"),
)
_DASH = re.compile(r"\s+[—–]\s+")
_CAPTION = re.compile(r"\bv\.?\s|\bIn the Matter of\b|\bIn re\b", re.I)
_CASE_NO = re.compile(r"\bNo\.\s*((?=[\w:./-]*\d)[A-Za-z0-9][\w:./-]*)")
_CASE_REF = re.compile(r"\b[A-Z]{1,4}-\d[\d-]*/\d{4}\b")
_ID = re.compile(r"^(?=\S*\d)[A-Z][\w]*[.\-/][\w.\-/]*$")
_HANDLE = re.compile(r"@\w{1,30}")


def date_words(value: Any) -> str:
    """"2016-01-26" → "26 Jan 2016", "2018-09" → "Sep 2018", "2015" → "2015"; anything else → ""."""
    m = re.fullmatch(r"(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?", str(value or "").strip()[:10])
    if not m:
        return ""
    year, month, day = m.groups()
    if not month or not 1 <= int(month) <= 12:
        return year
    return f"{int(day)} {_MONTHS[int(month) - 1]} {year}" if day else f"{_MONTHS[int(month) - 1]} {year}"


def clip(text: str, most: int = MAX) -> str:
    """Cut at the last whole word that fits, with an ellipsis; a text that fits is left as it is."""
    text = " ".join(text.split())
    if len(text) <= most:
        return text
    cut = text[: most - 1].rsplit(" ", 1)[0].rstrip(",;:–—-")
    return f"{cut}…"


def _plain(name: str) -> str:
    """A publisher's name without its bracketed aside: "SBS News (Reuters wire copy)" → "SBS News"."""
    return re.sub(r"\s*\([^)]*\)", "", name).strip(" ,")


def _filing(title: str, when: str) -> str | None:
    parts = _DASH.split(title, maxsplit=1)
    if len(parts) == 2 and _CAPTION.search(parts[0]):
        kind = _plain(parts[1].split(",")[0])
        for pattern, short in _KINDS:
            if pattern.search(parts[1]):
                kind = short
                break
        kind = kind[:1].upper() + kind[1:]
        # The court's number comes last in a caption ("… UBS Account No. XX-XX715 …, C.D. Cal. No. 2:16-cv-05371").
        numbers = _CASE_NO.findall(title) or _CASE_REF.findall(title)
        ref = numbers[-1].rstrip(".") if numbers else when
        return f"{clip(kind, 24)} · {ref}" if ref else clip(kind)
    if len(parts) == 2 and len(parts[0].split()) <= 3:
        first = parts[1].split()[0] if parts[1].split() else ""
        if _ID.match(first):  # "Press release – SK.2023.24 PetroSaudi managers sentenced" → "Press release · SK.2023.24"
            return clip(f"{parts[0]} · {first}")
    return None


def short_label(title: str | None, *, url: str | None = None, source_type: str | None = None, metadata: dict[str, Any] | None = None) -> str:
    """The words a chip shows for a source; the full title is shown on hover."""
    title = " ".join((title or "").split())
    meta = metadata or {}
    kind = str(meta.get("kind") or "")
    when = date_words(meta.get("date"))
    publisher = _plain(str(meta.get("publisher") or ""))
    host = (urlparse(url).hostname or "").removeprefix("www.") if url else ""
    filing = _filing(title, when)
    if filing:
        return filing
    if kind == "social" or source_type == "social":
        handle = _HANDLE.search(title)
        who = handle.group(0) if handle else host or publisher
        if who:
            return clip(f"{who} · {when}" if when else who)
    if len(title) <= MAX:
        return title or (publisher and clip(publisher)) or host or "Untitled source"
    if publisher and when and (kind in {"article", "press_release", "blog", "news"} or source_type in {"web", "news"}):
        return f"{clip(publisher, MAX - len(when) - 3)} · {when}"
    return clip(title)
