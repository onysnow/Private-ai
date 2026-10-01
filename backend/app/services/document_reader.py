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
import threading
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

from app.core.config import settings

_lock = threading.Lock()
_pool: ProcessPoolExecutor | None = None


def _child_read(path: str) -> tuple[list[dict], list[str]]:
    from app.services.documents import extract_chunks

    return extract_chunks(Path(path))


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

    if not settings.document_read_in_subprocess:
        return documents.extract_chunks(path)
    try:
        return _executor().submit(_child_read, str(path)).result()
    except BrokenProcessPool as exc:
        shutdown()  # the next read starts a fresh reader process
        raise RuntimeError("The document reader stopped unexpectedly on this file") from exc


def shutdown() -> None:
    global _pool
    with _lock:
        pool, _pool = _pool, None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)
