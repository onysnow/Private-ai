"""A background job run inside the API process has a SQLite connection of its own.

On a SQLite file every request session shares one connection, and so one
transaction (app/db/session.py, StaticPool). A document read run by the inline
runner used to share it too: the screen polling while a 34-page PDF was read
closed a session in between two pages, which rolled back the pages and
proposals the read had already flushed, and the read then failed with
"UPDATE statement on table 'extraction_candidates' expected to update 4 row(s);
0 were matched" (StaleDataError) when it added the next mention of a name it had
already proposed. The runner now gives each job its own connection
(app/db/session.py:own_connection).
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from sqlalchemy import select, text

from app.core.config import settings
from app.db.session import SessionLocal, build_engine, build_session_factory, engine, own_connection
from app.jobs.records import create_job
from app.jobs.runner import JobRunner
from app.models.domain import BackgroundJob, Document, DocumentChunk, ExtractionCandidate, Investigation
from app.services import documents
from app.services.documents import store_document

PAGES = [
    {"text": "Low paid the bribe in 2012.", "locator": "page 1", "page_number": 1},
    {"text": "Low paid the bribe in 2012, the court heard.", "locator": "page 2", "page_number": 2},
    {"text": "Low paid the bribe in 2012, again.", "locator": "page 3", "page_number": 3},
]


def _document(tmp_path) -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Shared connection")
        db.add(inv); db.commit(); db.refresh(inv)
        doc = store_document(db, investigation_id=inv.id, title="Indictment", filename="indictment.txt",
                             mime_type="text/plain", data=b"placeholder", storage_dir=tmp_path / "docs")
        return doc.id


def test_a_request_ending_during_a_read_does_not_undo_the_read(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    monkeypatch.setattr(settings, "document_reader", "local")
    monkeypatch.setattr(settings, "enable_pdf_ocr", False)
    document_id = _document(tmp_path)
    monkeypatch.setattr(documents, "read_chunks", lambda path: ([dict(page) for page in PAGES], []))
    polls: list[int] = []

    def proposals(chunk, share, **kwargs):
        if chunk.ordinal > 1:
            # The screen asks how the read is going: a request session opens and closes
            # while the read has flushed the pages before this one but not committed them.
            with SessionLocal() as poll:
                poll.execute(select(Investigation.id)).all()
            polls.append(chunk.ordinal)
        yield "claim", {"text": "Low paid the bribe.", "span": [0, 19]}, 0.6

    monkeypatch.setattr(documents, "_part_payloads", proposals)
    with SessionLocal() as db:
        inv_id = db.get(Document, document_id).investigation_id
        job_id = create_job(db, kind="extract_document", investigation_id=inv_id, subject_type="document",
                            subject_id=document_id).id

    asyncio.run(JobRunner("inline", SessionLocal, engine).submit(SimpleNamespace(id=job_id)))  # type: ignore[arg-type]

    assert polls == [2, 3]
    with SessionLocal() as db:
        job = db.get(BackgroundJob, job_id)
        doc = db.get(Document, document_id)
        assert (job.status, job.error) == ("succeeded", None)
        assert (doc.extraction_status, doc.extraction_error) == ("complete", None)
        assert db.scalars(select(DocumentChunk.ordinal).where(DocumentChunk.document_id == document_id)
                          .order_by(DocumentChunk.ordinal)).all() == [1, 2, 3]
        claims = db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.document_id == document_id)).all()
        assert len(claims) == 1
        assert claims[0].payload["mention_count"] == 3


def test_own_connection_keeps_a_jobs_writes_apart_from_request_sessions(tmp_path):
    shared = build_engine(f"sqlite:///{tmp_path / 'apart.db'}")
    with build_session_factory(shared)() as db:
        db.execute(text("create table t (id integer primary key)"))
        db.commit()
    with own_connection(shared) as own:
        assert own is not shared
        job = build_session_factory(own)()
        job.execute(text("insert into t default values"))
        with build_session_factory(shared)() as request:   # a request starts and ends meanwhile
            assert request.execute(text("select count(*) from t")).scalar() == 0   # it does not see the half-done work
        assert job.execute(text("select count(*) from t")).scalar() == 1           # and did not undo it
        job.commit()
        job.close()
    with build_session_factory(shared)() as db:
        assert db.execute(text("select count(*) from t")).scalar() == 1
    shared.dispose()


def test_own_connection_is_the_engine_itself_for_an_in_memory_database():
    memory = build_engine("sqlite://")
    with own_connection(memory) as own:
        assert own is memory
    memory.dispose()
