"""app/services/document_reader.py: documents are read in a separate process."""

from __future__ import annotations

import os
import signal
import time
from pathlib import Path

import pytest

from app.services import document_reader
from app.services.documents import extract_chunks


@pytest.fixture()
def in_subprocess(monkeypatch):
    monkeypatch.setattr(document_reader.settings, "document_read_in_subprocess", True)
    yield
    document_reader.shutdown()


def test_reads_in_a_child_process_with_the_same_result(in_subprocess, tmp_path: Path):
    path = tmp_path / "memo.txt"
    path.write_text("Acme Holdings Inc. announced a program.\n\nSecond paragraph here.\n", encoding="utf-8")
    assert document_reader.read_chunks(path) == extract_chunks(path)
    pool = document_reader._pool
    assert pool is not None
    child_pids = {p.pid for p in pool._processes.values()}  # type: ignore[union-attr]
    assert child_pids and os.getpid() not in child_pids
    assert document_reader.read_chunks(path) == extract_chunks(path)
    assert document_reader._pool is pool, "the reader process is reused"


def test_reader_errors_come_back_unchanged(in_subprocess, tmp_path: Path):
    path = tmp_path / "file.xyz"
    path.write_text("x", encoding="utf-8")
    with pytest.raises(ValueError, match="Unsupported document type: .xyz"):
        document_reader.read_chunks(path)


@pytest.mark.skipif(not hasattr(signal, "SIGKILL"), reason="needs POSIX signals")
def test_a_crashed_reader_fails_the_read_and_is_replaced(in_subprocess, tmp_path: Path):
    path = tmp_path / "memo.txt"
    path.write_text("Fine text.\n", encoding="utf-8")
    assert document_reader.read_chunks(path) == extract_chunks(path)
    pool = document_reader._pool
    for pid in [p.pid for p in pool._processes.values()]:  # type: ignore[union-attr]
        os.kill(pid, signal.SIGKILL)  # the reader dies, as on a fatal crash in C code
    time.sleep(0.5)
    with pytest.raises(RuntimeError, match="stopped unexpectedly"):
        document_reader.read_chunks(path)
    assert document_reader._pool is None
    assert document_reader.read_chunks(path) == extract_chunks(path)
    assert document_reader._pool is not pool


def test_disabled_reads_in_this_process(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(document_reader.settings, "document_read_in_subprocess", False)
    seen: list[Path] = []
    monkeypatch.setattr("app.services.documents.extract_chunks", lambda p: seen.append(p) or ([], []))
    assert document_reader.read_chunks(tmp_path / "a.txt") == ([], [])
    assert seen == [tmp_path / "a.txt"] and document_reader._pool is None
