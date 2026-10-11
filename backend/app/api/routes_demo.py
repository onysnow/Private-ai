"""The 1MDB demo case (app/services/demo_1mdb.py): load it, and follow its loading."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.config import settings
from app.db.session import build_session_factory, get_db
from app.jobs.handlers import EXTRACT_DOCUMENT
from app.jobs.records import create_job, execute_job
from app.jobs.runner import job_runner
from app.schemas.responses import DemoCaseProgressOut
from app.services import demo_1mdb
from app.services.security import resolve_storage_root

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.get("/demo/1mdb", response_model=DemoCaseProgressOut)
def get_1mdb(db: Session = Depends(get_db)) -> Any:
    """Whether the 1MDB case is loaded, and how far its documents are read."""
    return demo_1mdb.progress(db)


@router.post("/demo/1mdb", response_model=DemoCaseProgressOut)
async def load_1mdb(request: Request, db: Session = Depends(get_db)) -> Any:
    """Download the 11 public documents, make the case and its records, and start
    reading the documents. Loading again while it exists changes nothing."""
    if demo_1mdb.existing(db) is not None:
        return demo_1mdb.progress(db)
    demo_1mdb.set_state(state="downloading", step="Downloading 11 public documents")
    try:
        documents = await run_in_threadpool(demo_1mdb.fetch_documents)
    except demo_1mdb.DemoDownloadError as exc:
        # Not the server's fault: say what failed in the progress, so the screen shows it.
        demo_1mdb.set_state(state="failed", error=str(exc))
        return demo_1mdb.progress(db)
    demo_1mdb.set_state(state="building", step="Adding the parties, payments, events and claims")
    inv, document_ids = await run_in_threadpool(demo_1mdb.build, db, documents, storage_dir=resolve_storage_root(settings.document_storage_dir))
    runner = job_runner(request)
    jobs = [create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=inv.id, subject_type="document", subject_id=doc_id, runner=runner.mode)
            for doc_id in document_ids]
    demo_1mdb.set_state(state="idle")
    if runner.mode == "inline":
        # Read one after another after the reply, so the case opens at once.
        factory = build_session_factory(db.get_bind())  # type: ignore[arg-type]
        job_ids = [job.id for job in jobs]

        async def read_all() -> None:
            for job_id in job_ids:
                await run_in_threadpool(execute_job, factory, job_id, runner.handlers)

        tasks = request.app.state.__dict__.setdefault("demo_tasks", set())
        task = asyncio.get_running_loop().create_task(read_all())
        tasks.add(task)
        task.add_done_callback(tasks.discard)
    else:
        for job in jobs:
            await runner.submit(job, db)
    return demo_1mdb.progress(db)
