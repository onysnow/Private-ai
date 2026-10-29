"""Read a stored document's text in a separate process.

Reading a scan runs OCR inside PyMuPDF/Tesseract, C code that keeps
Python's global interpreter lock for a whole page at a time. In a thread of
the API process that still stalls every other request: measured in the
Docker stack on 2026-10-01, health checks waited up to 2.8 s while a
10-page scan was read on a worker thread. A child process has its own
interpreter lock, so the API keeps answering, and a reader that crashes on
a malformed file takes down only the child.

``DOCUMENT_READ_IN_SUBPROCESS=false`` reads in the calling thread instead
(the test suite does, so tests can substitute the reader).
"""

from __future__ import annotations

import multiprocessing
import queue
import threading
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path
from typing import Any

from app.core.config import settings

_lock = threading.Lock()
_pool: ProcessPoolExecutor | None = None
_manager: Any = None


def _child_read(path: str) -> tuple[list[dict], list[str]]:
    from app.services.documents import extract_chunks

    return extract_chunks(Path(path))


def _child_read_telling(path: str, events: Any, stop: Any) -> tuple[list[dict], list[str]]:
    """``_child_read``, telling the job each page as it goes (through ``events``, a queue the job reads) and stopping
    at the next page once ``stop`` is set: the job's own page callbacks live in the job's process, not here."""
    from app.services.documents import extract_chunks
    from app.services.pdf_ocr import PAGE_PROGRESS, PAGE_TEXT, ReadingStopped

    def page(page_no: int, total: int, ocr: bool) -> None:
        if stop.is_set():
            raise ReadingStopped("stopped")
        events.put(("page", page_no, total, ocr))

    # Set for this read only: the reader process is reused, and the next read must not tell this one's queue.
    tokens = PAGE_PROGRESS.set(page), PAGE_TEXT.set(lambda page_no, text: events.put(("text", page_no, text)))
    try:
        return extract_chunks(Path(path))
    finally:
        PAGE_PROGRESS.reset(tokens[0])
        PAGE_TEXT.reset(tokens[1])


def _child_measure(path: str, pages: list[int]) -> tuple[dict[int, float | None], str | None]:
    from app.services.legibility import measure_pdf_pages

    return measure_pdf_pages(path, pages, settings.pdf_ocr_language, settings.pdf_ocr_dpi)


def _child_scanned(path: str) -> list[int]:
    from app.services.legibility import scanned_pages as find

    return find(path, settings.pdf_ocr_min_native_chars)


def _executor() -> ProcessPoolExecutor:
    global _pool
    with _lock:
        if _pool is None:
            # spawn on every platform: the same behaviour on Linux (Docker) and
            # Windows (developer mode), and no copy of the server's threads.
            _pool = ProcessPoolExecutor(
                max_workers=max(1, settings.job_worker_concurrency),
                mp_context=multiprocessing.get_context("spawn"),
            )
        return _pool


def read_chunks(path: Path) -> tuple[list[dict], list[str]]:
    """``extract_chunks(path)``, run in a reader process unless disabled."""
    from app.services import documents

    from app.services.pdf_ocr import PAGE_PROGRESS, PAGE_TEXT, ReadingStopped

    if not settings.document_read_in_subprocess:
        return documents.extract_chunks(path)
    page, text = PAGE_PROGRESS.get(), PAGE_TEXT.get()
    try:
        if page is None and text is None:
            return _executor().submit(_child_read, str(path)).result()
        events, stop = _channel()
        future = _executor().submit(_child_read_telling, str(path), events, stop)
        while True:
            try:
                result = future.result(timeout=0.25)
            except FuturesTimeout:
                result = None
            # Each page the reader told, told here in the job's thread, where its callbacks were set.
            while True:
                try:
                    event = events.get_nowait()
                except queue.Empty:
                    break
                try:
                    if event[0] == "page" and page is not None:
                        page(*event[1:])
                    elif event[0] == "text" and text is not None:
                        text(*event[1:])
                except ReadingStopped:
                    stop.set()  # the reader stops at its next page; this read ends now
                    raise
            if result is not None or future.done():
                return result if result is not None else future.result()
    except BrokenProcessPool as exc:
        shutdown()  # the next read starts a fresh reader process
        raise RuntimeError("The document reader stopped unexpectedly on this file") from exc


def _channel() -> tuple[Any, Any]:
    """A queue and a stop flag a reader process can share with this one."""
    global _manager
    with _lock:
        if _manager is None:
            _manager = multiprocessing.get_context("spawn").Manager()
        return _manager.Queue(), _manager.Event()


def measure_legibility(path: str, pages: list[int]) -> tuple[dict[int, float | None], str | None]:
    """How legible the given scanned pages are (app/services/legibility.py), in a reader process unless disabled:
    rendering a page holds the interpreter lock like reading one."""
    if not settings.document_read_in_subprocess:
        return _child_measure(path, pages)
    try:
        return _executor().submit(_child_measure, path, pages).result()
    except BrokenProcessPool as exc:
        shutdown()
        raise RuntimeError("The document reader stopped unexpectedly while measuring legibility") from exc


def scanned_pages(path: str) -> list[int]:
    """The pages of a file with no text layer of their own (app/services/legibility.py), in a reader process unless disabled."""
    if not settings.document_read_in_subprocess:
        return _child_scanned(path)
    try:
        return _executor().submit(_child_scanned, path).result()
    except BrokenProcessPool as exc:
        shutdown()
        raise RuntimeError("The document reader stopped unexpectedly while looking for scanned pages") from exc


def shutdown() -> None:
    global _pool, _manager
    with _lock:
        pool, _pool = _pool, None
        manager, _manager = _manager, None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)
    if manager is not None:
        manager.shutdown()
