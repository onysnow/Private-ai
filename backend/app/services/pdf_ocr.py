from __future__ import annotations

import re
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PdfExtractionResult:
    chunks: list[dict]
    ocr_pages: int
    native_pages: int
    blank_pages: int
    ocr_error: str | None = None


@dataclass(frozen=True)
class OcrRuntimeStatus:
    available: bool
    tessdata: str | None
    requested_languages: tuple[str, ...]
    missing_languages: tuple[str, ...]
    detail: str | None = None


def _clean(text: str) -> str:
    import re
    return re.sub(r"[ \t]+", " ", (text or "").replace("\x00", "")).strip()


_COURT_HEADER = re.compile(r"^\s*Case\s+\S+\s+Document\s+\S+\s+Filed\s+\S+\s+Page\s+\d+\s+of\s+\d+(\s+Page\s*ID\s*#:\s*\S+)?\s*$", re.I)


_SMALL_INT = re.compile(r"^\d{1,2}$")


def margin_line_numbers(page: Any) -> list[str]:
    """The line numbers printed down the left margin of a pleading-paper page, top to bottom,
    found by where they sit: lines that are only a small number (1 to 40), left of every other
    word on the page and inside the left eleventh of it, at least five of them, counting up as
    they go down the page (gaps allowed). Anything else (a page number, a list item "2.", a
    table's row numbers inside the text column) is not one. Empty when the page has none."""
    try:
        words = page.get_text("words") or []
    except Exception:
        return []
    lines: dict[tuple[int, int], list[Any]] = {}
    for w in words:
        lines.setdefault((int(w[5]), int(w[6])), []).append(w)
    candidates: list[tuple[float, float, int, str]] = []
    body_left: float | None = None
    for line in lines.values():
        if len(line) == 1 and _SMALL_INT.match(str(line[0][4])) and 1 <= int(line[0][4]) <= 40:
            w = line[0]
            candidates.append((float(w[1]), float(w[2]), int(w[4]), str(w[4])))
            continue
        for w in line:
            body_left = float(w[0]) if body_left is None else min(body_left, float(w[0]))
    if body_left is None or len(candidates) < 5:
        return []
    edge = page.rect.x0 + page.rect.width * 0.11
    margin = sorted(c for c in candidates if c[1] < body_left and c[1] <= edge)
    if len(margin) < 5:
        return []
    values = [c[2] for c in margin]
    if any(b <= a for a, b in zip(values, values[1:])):
        return []
    return [c[3] for c in margin]


def _drop_in_order(lines: list[str], numbers: list[str]) -> list[str]:
    """Drop, in order, one line that is only each of ``numbers``; a number with no such line
    after the last one dropped is skipped."""
    drop: set[int] = set()
    at = 0
    for number in numbers:
        for k in range(at, len(lines)):
            if lines[k].strip() == number:
                drop.add(k)
                at = k + 1
                break
    return [line for k, line in enumerate(lines) if k not in drop]


def strip_page_furniture(text: str, page_no: int | None = None, margin_numbers: list[str] | None = None) -> str:
    """Drop what is printed on a page but is not what the page says: the line
    numbers down the margin of US pleading paper (1 to 28, one per line) and the
    court's running header ("Case 2:17-cv-04441 Document 1 Filed 06/15/17 Page 4
    of 250 Page ID #:4"). Found on the 1MDB case, where both were read in as text
    and the header was proposed as a claim. ``margin_numbers`` are the margin numbers
    found by position (``margin_line_numbers``); without them, a run of ten or more
    lines counting up from 1 is taken as the margin. With ``page_no``, a first line that is
    only that page's number (or one less, for an unnumbered cover) goes too; that is
    looked at after the margin is gone, so page 1's number cannot take the margin's "1"."""
    lines = text.split("\n")
    if margin_numbers:
        lines = _drop_in_order(lines, margin_numbers)
    out: list[str] = []
    i = 0
    while i < len(lines):
        if lines[i].strip() == "1":
            j, n = i, 1
            while j < len(lines) and lines[j].strip() == str(n):
                j, n = j + 1, n + 1
            if n - 1 >= 10:  # a run of margin numbers, not a list item "1"
                i = j
                continue
        if _COURT_HEADER.match(lines[i]):
            i += 1
            continue
        out.append(lines[i])
        i += 1
    if page_no is not None:
        first = next((k for k, line in enumerate(out) if line.strip()), None)
        if first is not None and out[first].strip() in (str(page_no), str(page_no - 1)):
            out = out[first + 1:]
    return "\n".join(out)


# Told each page as it is read: (page number, page count, whether it needs OCR). The
# extract job sets it, so the job's message can say "Reading with OCR · page 6 of 11".
PAGE_PROGRESS: ContextVar[Callable[[int, int, bool], None] | None] = ContextVar("pdf_page_progress", default=None)


# Told each page's text once it is read: (page number, text). The extract job counts what the
# reader will propose from the pages read so far ("4 names and 2 claims found so far").
PAGE_TEXT: ContextVar[Callable[[int, str], None] | None] = ContextVar("pdf_page_text", default=None)


class ReadingStopped(Exception):
    """A person stopped the read; raised from the page callback, it ends the read."""


def _tell(page_no: int, total: int, ocr: bool) -> None:
    told = PAGE_PROGRESS.get()
    if told is not None:
        try:
            told(page_no, total, ocr)
        except ReadingStopped:
            raise
        except Exception:  # progress is a courtesy; it never stops a read
            pass


def _tell_text(page_no: int, text: str) -> None:
    told = PAGE_TEXT.get()
    if told is not None:
        try:
            told(page_no, text)
        except Exception:  # a courtesy too
            pass


def _requested_languages(language: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in (language or "eng").split("+") if part.strip()) or ("eng",)


def ocr_runtime_status(language: str = "eng") -> OcrRuntimeStatus:
    """Return the PyMuPDF/Tesseract language-data status without reading a document."""
    requested = _requested_languages(language)
    try:
        import fitz

        tessdata_value = fitz.get_tessdata()
        tessdata = Path(tessdata_value).resolve() if tessdata_value else None
        if tessdata is None or not tessdata.is_dir():
            return OcrRuntimeStatus(False, str(tessdata) if tessdata else None, requested, requested, "Tesseract tessdata directory is unavailable")

        missing = tuple(code for code in requested if not (tessdata / f"{code}.traineddata").is_file())
        if missing:
            return OcrRuntimeStatus(False, str(tessdata), requested, missing, f"Missing Tesseract language data: {', '.join(missing)}")
        return OcrRuntimeStatus(True, str(tessdata), requested, (), None)
    except Exception as exc:
        return OcrRuntimeStatus(False, None, requested, requested, f"{type(exc).__name__}: {exc}")


# A scanned page can still carry a few words of real text: a court's filing
# stamp or a serial number laid over the picture of the page. Such a page is read
# by OCR all the same, or everything but the stamp is lost (the 810-page Najib
# 1MDB judgment, Oct 2026). "Mostly picture" means images cover over half the page.
_STAMP_MAX_CHARS = 400


def _scan_with_stamp(page: Any, native: str) -> bool:
    if len(native) >= _STAMP_MAX_CHARS:
        return False
    area = abs(page.rect)
    if not area:
        return False
    covered = 0.0
    for info in page.get_image_info():
        r = page.rect & info["bbox"]
        if not r.is_empty:
            covered += abs(r)
    return bool(covered / area > 0.5)


def extract_pdf_chunks(
    path: Path,
    *,
    enable_ocr: bool = True,
    language: str = "eng",
    dpi: int = 200,
    min_native_chars: int = 20,
) -> PdfExtractionResult:
    """Extract PDF text page-by-page and OCR image-only pages when necessary.

    OCR output is explicitly labeled in each locator so downstream evidence keeps
    the distinction between native PDF text and machine-recognized text.
    """
    import fitz

    chunks: list[dict] = []
    ocr_pages = 0
    native_pages = 0
    blank_pages = 0
    ocr_error: str | None = None
    runtime = ocr_runtime_status(language) if enable_ocr else None

    with fitz.open(path) as doc:
        total = doc.page_count
        for page_no, page in enumerate(doc, 1):
            margin = margin_line_numbers(page)
            native = _clean(strip_page_furniture(page.get_text("text") or "", page_no, margin))
            if len(native) >= min_native_chars and not _scan_with_stamp(page, native):
                _tell(page_no, total, False)
                native_pages += 1
                chunks.append({
                    "locator": f"page {page_no}",
                    "page_number": page_no,
                    "text": native,
                })
                _tell_text(page_no, native)
                continue

            text = native
            _tell(page_no, total, enable_ocr)
            if enable_ocr:
                if runtime is not None and not runtime.available:
                    if ocr_error is None:
                        ocr_error = runtime.detail or "Tesseract OCR runtime is unavailable"
                else:
                    try:
                        textpage = page.get_textpage_ocr(
                            language=language,
                            dpi=dpi,
                            full=True,
                            tessdata=runtime.tessdata if runtime else None,
                        )
                        text = _clean(strip_page_furniture(page.get_text("text", textpage=textpage) or "", page_no))
                    except Exception as exc:  # bad page / OCR runtime failure
                        if ocr_error is None:
                            ocr_error = f"{type(exc).__name__}: {exc}"

            if text:
                if text != native or len(native) < min_native_chars:
                    ocr_pages += 1
                    locator = f"page {page_no} (OCR)"
                else:
                    native_pages += 1
                    locator = f"page {page_no}"
                chunks.append({"locator": locator, "page_number": page_no, "text": text})
                _tell_text(page_no, text)
            else:
                blank_pages += 1

    return PdfExtractionResult(
        chunks=chunks,
        ocr_pages=ocr_pages,
        native_pages=native_pages,
        blank_pages=blank_pages,
        ocr_error=ocr_error,
    )
