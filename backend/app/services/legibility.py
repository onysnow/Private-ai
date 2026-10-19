"""How legible a scanned page was to OCR (mockup CHECK_2, "Page 3 of 4, read by OCR · 96% legible").

PyMuPDF runs Tesseract to read a scan but keeps none of Tesseract's confidence in each word. So after the read, each
page read by OCR is shown to the Tesseract program once more, at the same resolution and language, and the page's
legibility is the mean of its words' confidence (0-100). The document is already read and in use while this runs;
measuring never changes its text, and a page that cannot be measured keeps no figure rather than a guessed one.
"""
from __future__ import annotations

import csv
import io
import shutil
import subprocess
from pathlib import Path

from app.services.pdf_ocr import ocr_runtime_status

# A page Tesseract cannot finish in this long is left unmeasured.
PAGE_TIMEOUT_S = 120


def tesseract_program(tessdata: str | None) -> str | None:
    """The Tesseract program: on the PATH, or beside the language data PyMuPDF uses (a Windows install keeps
    tessdata inside the program's folder)."""
    found = shutil.which("tesseract")
    if found:
        return found
    if tessdata:
        for folder in (Path(tessdata).parent, Path(tessdata).parent.parent):
            for name in ("tesseract.exe", "tesseract"):
                if (folder / name).is_file():
                    return str(folder / name)
    return None


def mean_word_confidence(tsv: str) -> float | None:
    """The mean confidence of the words in Tesseract's TSV output; None when it found no words."""
    confs: list[float] = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
        try:
            conf = float(row.get("conf") or -1)
        except ValueError:
            continue
        if conf >= 0 and (row.get("text") or "").strip():
            confs.append(conf)
    return round(sum(confs) / len(confs), 1) if confs else None


def measure_pdf_pages(path: str, pages: list[int], language: str, dpi: int) -> tuple[dict[int, float | None], str | None]:
    """Each page's legibility, and why none could be measured (None when measuring ran)."""
    import fitz

    runtime = ocr_runtime_status(language)
    program = tesseract_program(runtime.tessdata)
    if program is None:
        return {}, "no Tesseract program was found to measure it with"
    out: dict[int, float | None] = {}
    with fitz.open(path) as doc:
        for page_no in pages:
            if not 1 <= page_no <= doc.page_count:
                continue
            png = doc[page_no - 1].get_pixmap(dpi=dpi).tobytes("png")
            args = [program, "stdin", "stdout", "-l", language]
            if runtime.tessdata:
                args += ["--tessdata-dir", runtime.tessdata]
            try:
                run = subprocess.run([*args, "tsv"], input=png, capture_output=True, timeout=PAGE_TIMEOUT_S, check=False)
            except (OSError, subprocess.TimeoutExpired):
                out[page_no] = None
                continue
            out[page_no] = mean_word_confidence(run.stdout.decode("utf-8", "replace")) if run.returncode == 0 else None
    return out, None
