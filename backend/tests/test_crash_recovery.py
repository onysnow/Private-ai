"""The app stopped mid-way (a crash, a power cut, a killed container), then restarted.

Each test stops the work at one point by raising KeyboardInterrupt, which
the app's ``except Exception`` handlers do not catch, so what is left is
what a killed process leaves: committed rows stay, uncommitted ones are
gone. Then the app starts again (its lifespan runs the job runner's
start-up; app/jobs/recovery.py) and every document must have a final state
(read, failed with the reason, or waiting with a job), and a retry must not
make anything twice.

The in-process runner (SQLite developer mode). The Procrastinate side of
the recovery is in test_background_jobs_procrastinate.py.
"""

from __future__ import annotations

import os
import time
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import app.main as main_module
import app.services.documents as documents
from app.core.config import Settings, settings
from app.core.time import utcnow_naive
from app.db.session import SessionLocal
from app.jobs import recovery
from app.jobs.handlers import HANDLERS
from app.jobs.records import create_job, execute_job, requeue_for_retry
from app.models.domain import BackgroundJob, Document, DocumentChunk, DocumentCorpusSync, ExtractionCandidate, Investigation
from app.services.documents import store_document
from app.services.lifecycle import preview_orphan_document_files
from app.services.openaleph_corpus import sync_document_to_openaleph

MEMO = b"Acme Holdings Inc. announced a program.\n"


@pytest.fixture()
def storage(tmp_path, monkeypatch):
    root = tmp_path / "docs"
    monkeypatch.setattr(settings, "document_storage_dir", str(root))
    return root


def _start(tmp_path) -> TestClient:
    """The app starting again after the stop."""
    app = main_module.create_app(Settings(job_runner="inline", frontend_dist_dir=str(tmp_path / "no-build")),
                                 bootstrap_schema=False)
    return TestClient(app)


def _investigation() -> str:
    with SessionLocal() as db:
        inv = Investigation(name="Crash test")
        db.add(inv); db.commit()
        return inv.id


def _store(inv: str, storage: Path, data: bytes = MEMO, name: str = "memo.txt") -> str:
    with SessionLocal() as db:
        return store_document(db, investigation_id=inv, title="Memo", filename=name, mime_type="text/plain",
                              data=data, storage_dir=storage).id


def _killed_at(monkeypatch, target: str, attribute: str) -> None:
    """Make ``target.attribute`` stop the process when called."""
    def stop(*args, **kwargs):
        raise KeyboardInterrupt(f"process killed in {attribute}")
    monkeypatch.setattr(f"{target}.{attribute}", stop)


def _reading_jobs(document_id: str) -> list[BackgroundJob]:
    with SessionLocal() as db:
        return list(db.scalars(select(BackgroundJob).where(BackgroundJob.subject_id == document_id)).all())


def _counts(document_id: str) -> tuple[int, int]:
    with SessionLocal() as db:
        chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).count()
        proposals = db.query(ExtractionCandidate).filter(ExtractionCandidate.document_id == document_id).count()
        return chunks, proposals


# 1. Stopped while the upload was being saved ---------------------------------

def test_stopped_after_the_file_was_staged_leaves_no_document_and_the_restart_clears_the_staging(tmp_path, storage, monkeypatch):
    inv = _investigation()
    with SessionLocal() as db:
        monkeypatch.setattr(db, "flush", lambda *a, **k: (_ for _ in ()).throw(KeyboardInterrupt("killed")))
        with pytest.raises(KeyboardInterrupt):
            store_document(db, investigation_id=inv, title="Memo", filename="memo.txt", mime_type="text/plain",
                           data=MEMO, storage_dir=storage)
    staged = list((storage / recovery.UPLOAD_STAGING).iterdir())
    assert len(staged) == 1   # the bytes the stopped upload had written

    with _start(tmp_path) as client:
        assert not (storage / recovery.UPLOAD_STAGING).exists()
        with SessionLocal() as db:
            assert db.query(Document).count() == 0   # nothing pretends to be a document
        # The reporter uploads it again; it is not refused as already in the case.
        again = client.post("/api/documents/upload", data={"investigation_id": inv, "title": "Memo"},
                            files={"file": ("memo.txt", MEMO, "text/plain")})
        assert again.status_code == 200, again.text
        assert again.json()["extraction_status"] == "complete"


def test_stopped_after_the_file_moved_into_place_but_before_the_commit_is_listed_as_an_orphan(tmp_path, storage, monkeypatch):
    inv = _investigation()
    with SessionLocal() as db:
        monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(KeyboardInterrupt("killed")))
        with pytest.raises(KeyboardInterrupt):
            store_document(db, investigation_id=inv, title="Memo", filename="memo.txt", mime_type="text/plain",
                           data=MEMO, storage_dir=storage)

    with _start(tmp_path):
        with SessionLocal() as db:
            assert db.query(Document).count() == 0
            orphans = preview_orphan_document_files(db, storage)
    # The file is kept and shown, never deleted on its own (Settings › Storage).
    assert orphans["orphan_file_count"] == 1
    assert orphans["orphan_files"][0]["relative_path"].endswith("memo.txt")


def test_stopped_between_saving_the_document_and_making_its_job_gets_a_job_to_retry(tmp_path, storage):
    inv = _investigation()
    document_id = _store(inv, storage)   # saved; the job was never made
    assert _reading_jobs(document_id) == []

    with _start(tmp_path) as client:
        with SessionLocal() as db:
            doc = db.get(Document, document_id)
            assert doc.extraction_status == "failed" and doc.extraction_error == recovery.UNREAD_DOCUMENT
        [job] = _reading_jobs(document_id)
        assert job.kind == "extract_document" and job.status == "failed" and job.error == recovery.UNREAD_ERROR

        retried = client.post(f"/api/jobs/{job.id}/retry")
        assert retried.status_code == 200, retried.text
        assert retried.json()["status"] == "succeeded"
    with SessionLocal() as db:
        assert db.get(Document, document_id).extraction_status == "complete"
    chunks, proposals = _counts(document_id)
    assert chunks == 1 and proposals >= 1

    # A second restart finds nothing left to do and makes no second job.
    with _start(tmp_path):
        assert len(_reading_jobs(document_id)) == 1


def test_a_file_inside_an_archive_still_being_read_is_left_waiting(tmp_path, storage):
    inv = _investigation()
    parent_id = _store(inv, storage, name="box.txt")
    with SessionLocal() as db:
        child = store_document(db, investigation_id=inv, title="Inside", filename="inside.txt", mime_type="text/plain",
                               data=b"Inside text.\n", storage_dir=storage, parent_document_id=parent_id)
        parent_job = create_job(db, kind="extract_document", investigation_id=inv, subject_type="document",
                                subject_id=parent_id, runner="procrastinate")
        db.execute(BackgroundJob.__table__.update().where(BackgroundJob.id == parent_job.id).values(status="running"))
        old = utcnow_naive() - timedelta(hours=2)
        db.execute(Document.__table__.update().values(created_at=old))
        db.commit()
        child_id = child.id

        # As the Procrastinate watchdog sees it while the archive's worker is alive.
        assert recovery.documents_without_a_reading_job(db, runner="procrastinate", older_than=timedelta(minutes=10)) == 0
        assert db.get(Document, child_id).extraction_status == "queued"


# 2. Stopped while the document was being read --------------------------------

def test_stopped_mid_read_keeps_nothing_half_read_and_the_retry_reads_it_once(tmp_path, storage, monkeypatch):
    inv = _investigation()
    document_id = _store(inv, storage, data=b"Acme Holdings Inc. announced a program.\n\nBeta Corp Ltd. replied.\n")
    with SessionLocal() as db:
        job = create_job(db, kind="extract_document", investigation_id=inv, subject_type="document", subject_id=document_id)

    real = documents.ExtractionCandidate
    made: list[int] = []

    def killed_after_one(*args, **kwargs):
        made.append(1)
        if len(made) > 1:
            raise KeyboardInterrupt("process killed while making proposals")
        return real(*args, **kwargs)

    monkeypatch.setattr(documents, "ExtractionCandidate", killed_after_one)
    with pytest.raises(KeyboardInterrupt):
        execute_job(SessionLocal, job.id, HANDLERS)
    monkeypatch.setattr(documents, "ExtractionCandidate", real)
    assert _counts(document_id) == (0, 0)   # the read's transaction never committed

    with _start(tmp_path) as client:
        [row] = _reading_jobs(document_id)
        assert row.status == "failed" and row.message == "Interrupted -- retry it"
        retried = client.post(f"/api/jobs/{job.id}/retry")
        assert retried.json()["status"] == "succeeded", retried.text
        first = _counts(document_id)
        assert first[0] == 2 and first[1] >= 2
        # Retrying again is refused, and a new reading job does not read it twice.
        assert client.post(f"/api/jobs/{job.id}/retry").status_code == 409
    with SessionLocal() as db:
        extra = create_job(db, kind="extract_document", investigation_id=inv, subject_type="document", subject_id=document_id)
    assert execute_job(SessionLocal, extra.id, HANDLERS) == "failed"
    assert _counts(document_id) == first


# 3. Stopped after OpenAleph took the file, before the Workbench recorded it --

class UpsertingOpenAleph:
    """OpenAleph 5.3.1's upload: a file whose foreign_id the collection
    already holds updates that document and answers with its id
    (aleph/model/document.py, Document.save), so sending it again never
    makes a second copy."""

    def __init__(self):
        self.documents: dict[tuple[str, str], str] = {}
        self.uploads: list[dict] = []

    def create_collection(self, data):
        return {"id": "oa-collection-1", "foreign_id": "oa-picked", "label": data["label"]}

    def ingest_upload(self, *, collection_id, file_path, metadata, sync=False, index=True):
        self.uploads.append(metadata)
        key = (collection_id, metadata["foreign_id"])
        entity_id = self.documents.setdefault(key, f"oa-document-{len(self.documents) + 1}")
        return {"status": "ok", "id": entity_id}


def test_openaleph_took_the_file_but_the_reply_was_lost_and_sending_again_makes_no_second_copy(tmp_path, storage, monkeypatch):
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    inv = _investigation()
    document_id = _store(inv, storage)
    openaleph = UpsertingOpenAleph()

    class StoppedOnReply(UpsertingOpenAleph):
        def ingest_upload(self, **kwargs):
            openaleph.ingest_upload(**kwargs)   # OpenAleph has it...
            raise KeyboardInterrupt("process killed before the reply was recorded")   # ...the Workbench never learns

    with SessionLocal() as db:
        with pytest.raises(KeyboardInterrupt):
            sync_document_to_openaleph(db, document_id, client_factory=StoppedOnReply)
    with SessionLocal() as db:
        row = db.scalar(select(DocumentCorpusSync).where(DocumentCorpusSync.document_id == document_id))
        assert row.status == "syncing" and row.provider_record_id is None

    with SessionLocal() as db:
        again = sync_document_to_openaleph(db, document_id, client_factory=lambda: openaleph)
        assert again.status == "synced" and again.provider_record_id == "oa-document-1"
    assert len(openaleph.uploads) == 2
    assert {upload["foreign_id"] for upload in openaleph.uploads} == {f"journalism-workbench-document:{document_id}"}
    assert len(openaleph.documents) == 1
    with SessionLocal() as db:
        assert db.query(DocumentCorpusSync).filter(DocumentCorpusSync.document_id == document_id).count() == 1


# 4. A batch stopped and started again, more than once ------------------------

def test_a_batch_stopped_twice_ends_with_every_document_accounted_for_and_nothing_twice(tmp_path, storage, monkeypatch):
    inv = _investigation()
    bodies = [f"Company {n} Holdings Ltd. paid {n} dollars.\n".encode() for n in range(12)]
    ids = [_store(inv, storage, data=body, name=f"memo-{n}.txt") for n, body in enumerate(bodies)]
    with SessionLocal() as db:
        jobs = [create_job(db, kind="extract_document", investigation_id=inv, subject_type="document", subject_id=i).id
                for i in ids[:8]]   # the last four were saved, their jobs never made

    real = documents.read_chunks
    reads: list[str] = []

    def killed_on_the(nth: int):
        def read(path):
            reads.append(str(path))
            if len(reads) == nth:
                raise KeyboardInterrupt("power cut")
            return real(path)
        return read

    # First run: three read, the fourth stopped.
    monkeypatch.setattr(documents, "read_chunks", killed_on_the(4))
    with pytest.raises(KeyboardInterrupt):
        for job_id in jobs:
            execute_job(SessionLocal, job_id, HANDLERS)

    # Restart, retry everything that failed (as POST /api/jobs/{id}/retry does);
    # stopped again three reads in.
    reads.clear()
    monkeypatch.setattr(documents, "read_chunks", killed_on_the(4))
    with _start(tmp_path):
        failed = [job.id for i in ids for job in _reading_jobs(i) if job.status == "failed"]
    assert len(failed) == 9   # 1 interrupted + 4 never started + 4 never made
    with pytest.raises(KeyboardInterrupt):
        for job_id in failed:
            with SessionLocal() as db:
                requeue_for_retry(db, db.get(BackgroundJob, job_id))
            execute_job(SessionLocal, job_id, HANDLERS)

    # Restart, retry what is still unfinished, with nothing stopping it.
    monkeypatch.setattr(documents, "read_chunks", real)
    with _start(tmp_path) as client:
        for i in ids:
            for job in _reading_jobs(i):
                if job.status == "failed":
                    assert client.post(f"/api/jobs/{job.id}/retry").json()["status"] == "succeeded"

    with SessionLocal() as db:
        states = {i: db.get(Document, i).extraction_status for i in ids}
    assert set(states.values()) == {"complete"}, states
    for i in ids:
        assert len(_reading_jobs(i)) == 1                      # one job per document, retried in place
        assert _counts(i)[0] == 1                              # read once
        with SessionLocal() as db:
            captions = [c.payload.get("caption") for c in db.scalars(select(ExtractionCandidate).where(
                ExtractionCandidate.document_id == i, ExtractionCandidate.candidate_type == "entity"))]
        assert len(captions) == len(set(captions))             # no name proposed twice


# 5. The Procrastinate watchdog's view, without PostgreSQL --------------------

def test_procrastinate_rows_the_queue_never_held_are_failed_once_they_stop_moving(storage):
    inv = _investigation()
    with SessionLocal() as db:
        never_queued = create_job(db, kind="extract_document", investigation_id=inv, runner="procrastinate")
        lost_child = create_job(db, kind="extract_document", investigation_id=inv, runner="procrastinate")
        queued = create_job(db, kind="extract_document", investigation_id=inv, runner="procrastinate")
        fresh = create_job(db, kind="extract_document", investigation_id=inv, runner="procrastinate")
        old = utcnow_naive() - timedelta(hours=2)
        table = BackgroundJob.__table__
        db.execute(table.update().where(table.c.id == lost_child.id).values(status="running"))
        db.execute(table.update().where(table.c.id == queued.id).values(queue_job_id=41))
        db.execute(table.update().where(table.c.id.in_([never_queued.id, lost_child.id, queued.id])).values(updated_at=old))
        db.commit()

        assert recovery.jobs_the_queue_does_not_hold(db, older_than=timedelta(hours=1)) == 2
        db.expire_all()
        assert db.get(BackgroundJob, never_queued.id).error == recovery.NEVER_QUEUED_ERROR
        assert db.get(BackgroundJob, lost_child.id).error == recovery.LOST_ERROR
        assert db.get(BackgroundJob, queued.id).status == "queued"     # Procrastinate holds it
        assert db.get(BackgroundJob, fresh.id).status == "queued"      # may be being handed over now
    # A failed row is never claimed if the queue does run it after all.
    assert execute_job(SessionLocal, never_queued.id, HANDLERS, resume_running=True) == "failed"


def test_only_old_staged_files_are_removed(storage):
    staging = storage / recovery.UPLOAD_STAGING
    staging.mkdir(parents=True)
    old, new = staging / "old_memo.txt", staging / "new_memo.txt"
    old.write_bytes(b"x"); new.write_bytes(b"y")
    two_hours_ago = time.time() - 7200
    os.utime(old, (two_hours_ago, two_hours_ago))
    assert recovery.staged_upload_files(storage, older_than=timedelta(hours=1)) == 1
    assert not old.exists() and new.exists()
