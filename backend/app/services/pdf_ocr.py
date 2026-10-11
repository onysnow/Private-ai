from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


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


def strip_page_furniture(text: str, page_no: int | None = None) -> str:
    """Drop what is printed on a page but is not what the page says: the line
    numbers down the margin of US pleading paper (1 to 28, one per line) and the
    court's running header ("Case 2:17-cv-04441 Document 1 Filed 06/15/17 Page 4
    of 250 Page ID #:4"). Found on the 1MDB case, where both were read in as text
    and the header was proposed as a claim. With ``page_no``, a first line that is
    only that page's number (or one less, for an unnumbered cover) goes too."""
    lines = text.split("\n")
    if page_no is not None:
        first = next((k for k, line in enumerate(lines) if line.strip()), None)
        if first is not None and lines[first].strip() in (str(page_no), str(page_no - 1)):
            lines = lines[first + 1:]
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
    return "\n".join(out)


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
        for page_no, page in enumerate(doc, 1):
            native = _clean(strip_page_furniture(page.get_text("text") or "", page_no))
            if len(native) >= min_native_chars:
                native_pages += 1
                chunks.append({
                    "locator": f"page {page_no}",
                    "page_number": page_no,
                    "text": native,
                })
                continue

            text = native
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
                        text = _clean(page.get_text("text", textpage=textpage) or "")
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
            else:
                blank_pages += 1

    return PdfExtractionResult(
        chunks=chunks,
        ocr_pages=ocr_pages,
        native_pages=native_pages,
        blank_pages=blank_pages,
        ocr_error=ocr_error,
    )
