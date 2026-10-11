"""The demo cases: the 1MDB case (app/services/demo_1mdb.py) and the small real
cases (app/services/demo_cases.py). Load one, and follow its loading."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.config import settings
from app.db.session import build_session_factory, get_db
from app.jobs.handlers import EXTRACT_DOCUMENT
from app.jobs.records import create_job, execute_job
from app.jobs.runner import job_runner
from app.schemas.responses import DemoCaseOut, DemoCaseProgressOut
from app.services import demo_1mdb, demo_cases
from app.services.security import resolve_storage_root

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])
logger = logging.getLogger("journalism.demo")

# The small real cases, by id (demo_cases.CASE_IDS): a path that names none of them is refused.
DemoCaseId = Literal["us-v-anise-structuring", "vekselberg-shell-network", "deripaska-en-rusal"]
assert set(DemoCaseId.__args__) == set(demo_cases.CASE_IDS)  # type: ignore[attr-defined]


async def _read_in_background(request: Request, db: Session, investigation_id: str, document_ids: list[str]) -> None:
    """Read the new case's documents as background jobs, as an upload does."""
    runner = job_runner(request)
    jobs = [create_job(db, kind=EXTRACT_DOCUMENT, investigation_id=investigation_id, subject_type="document", subject_id=doc_id, runner=runner.mode)
            for doc_id in document_ids]
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


@router.get("/demo/1mdb", response_model=DemoCaseProgressOut)
def get_1mdb(db: Session = Depends(get_db)) -> Any:
    """Whether the 1MDB case is loaded, and how far its documents are read."""
    return demo_1mdb.progress(db)


@router.post("/demo/1mdb", response_model=DemoCaseProgressOut)
async def load_1mdb(request: Request, db: Session = Depends(get_db)) -> Any:
    """Download the case's documents and media, make the case and its records, and start
    reading the documents. Loading again while it exists changes nothing."""
    if demo_1mdb.existing(db) is not None:
        return demo_1mdb.progress(db)
    demo_1mdb.set_state(state="downloading", step="Downloading the court records, regulator findings, articles, photos and media")
    try:
        documents = await run_in_threadpool(demo_1mdb.fetch_documents)
    except demo_1mdb.DemoDownloadError as exc:
        # Not the server's fault: say what failed in the progress, so the screen shows it.
        demo_1mdb.set_state(state="failed", error=str(exc))
        return demo_1mdb.progress(db)
    demo_1mdb.set_state(state="building", step="Adding the parties, payments, events and claims")
    inv, document_ids = await run_in_threadpool(demo_1mdb.build, db, documents, storage_dir=resolve_storage_root(settings.document_storage_dir))
    await _read_in_background(request, db, inv.id, document_ids)
    demo_1mdb.set_state(state="idle")
    return demo_1mdb.progress(db)


@router.get("/demo/cases", response_model=list[DemoCaseOut])
def list_demo_cases(db: Session = Depends(get_db)) -> Any:
    """The small real cases that can be loaded, each with how far it is loaded."""
    return [{**demo_cases.summary(case_id), "progress": demo_cases.progress(db, case_id)} for case_id in demo_cases.CASE_IDS]


@router.get("/demo/cases/{case_id}", response_model=DemoCaseProgressOut)
def get_demo_case(case_id: DemoCaseId, db: Session = Depends(get_db)) -> Any:
    """Whether this case is loaded, and how far its documents are read."""
    return demo_cases.progress(db, case_id)


@router.post("/demo/cases/{case_id}", response_model=DemoCaseProgressOut)
async def load_demo_case(case_id: DemoCaseId, request: Request, db: Session = Depends(get_db)) -> Any:
    """Download the case's public documents, make it as its own investigation
    with its records, and start reading the documents. Loading again while it
    exists changes nothing."""
    if demo_cases.existing(db, case_id) is not None:
        return demo_cases.progress(db, case_id)
    count = len(demo_cases.manifest(case_id))
    demo_cases.set_state(case_id, state="downloading", step=f"Downloading {count} public document{'s' if count != 1 else ''}")
    try:
        documents = await run_in_threadpool(demo_cases.fetch_documents, case_id)
    except demo_cases.DemoDownloadError as exc:
        demo_cases.set_state(case_id, state="failed", error=str(exc))
        return demo_cases.progress(db, case_id)
    demo_cases.set_state(case_id, state="building", step="Adding the parties, links, events and claims")
    storage = resolve_storage_root(settings.document_storage_dir)
    try:
        inv, document_ids = await run_in_threadpool(demo_cases.build, db, case_id, documents, storage_dir=storage)
    except Exception as exc:
        # A half-made case would pass for the loaded one (existing() finds it by
        # name), so remove it and say what stopped the load. Found on SQLite:
        # another case's documents being read at the same moment can break it.
        logger.exception("%s demo: loading stopped", case_id)
        db.rollback()
        partial = demo_cases.existing(db, case_id)
        if partial is not None:
            from app.services.lifecycle import delete_investigation
            try:
                await run_in_threadpool(delete_investigation, db, partial.id, storage, confirmation=partial.id)
            except Exception:  # noqa: BLE001 - say so; the reporter can delete it in Settings
                db.rollback()
                logger.exception("%s demo: the half-made case could not be removed", case_id)
        demo_cases.set_state(case_id, state="failed", error=f"Loading stopped while adding the records ({exc}). Try again.")
        return demo_cases.progress(db, case_id)
    await _read_in_background(request, db, inv.id, document_ids)
    demo_cases.set_state(case_id, state="idle")
    return demo_cases.progress(db, case_id)
