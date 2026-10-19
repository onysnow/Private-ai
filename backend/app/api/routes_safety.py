"""Keep › Safety & data (mockup KEEP-safety-and-data; app/services/safety.py, app/services/outbound.py): what lives
where, what left this computer word for word, each outside service's mode, a backup kept on record, and the
reporter's private safety answers."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.dependencies import MAX_OFFSET, authorize_request_resource
from app.core.authorization import scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import Investigation
from app.schemas.responses import file_response
from app.schemas.safety import OutboundLogOut, SafetyAnswerIn, SafetyBackupIn, SafetySummaryOut, ServiceModeIn
from app.services import outbound, safety
from app.services.backup_crypto import PASSPHRASE_EMPTY

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

SINCE = Query(None, description="Only what left at or after this time (UTC when no offset); leave out for all of it")


def _case(db: Session, investigation_id: str) -> None:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")


def _service(service: str | None) -> str | None:
    if service is not None and service not in outbound.services():
        raise HTTPException(404, f"Unknown service {service!r}")
    return service


@router.get("/investigations/{investigation_id}/safety", response_model=SafetySummaryOut)
def get_safety(investigation_id: str, request: Request, since: datetime | None = SINCE, db: Session = Depends(get_db)) -> Any:
    """Totals for the period with zeroes stated, the six stores on this computer, the outside services with their
    modes and what each was sent, who can reach the case, and what deleting it removes."""
    _case(db, investigation_id)
    return safety.summary(db, investigation_id, since=since, settings=settings, admin=scope_for_request(request).is_global_admin)


@router.get("/investigations/{investigation_id}/outbound-log", response_model=OutboundLogOut)
def get_outbound_log(investigation_id: str, since: datetime | None = SINCE, service: str | None = Query(None, max_length=64),
                     limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0, le=MAX_OFFSET),
                     db: Session = Depends(get_db)) -> Any:
    """Every request that left this computer for an outside service, newest first: the value word for word.
    Append-only: nothing here changes or removes a row."""
    _case(db, investigation_id)
    return safety.outbound_log(db, investigation_id, since=since, service=_service(service), limit=limit, offset=offset)


@router.get("/investigations/{investigation_id}/outbound-log/export", response_class=Response,
            responses=file_response("text/csv", "The outbound log as CSV, oldest first"))
def export_outbound_log(investigation_id: str, since: datetime | None = SINCE, service: str | None = Query(None, max_length=64),
                        db: Session = Depends(get_db)) -> Response:
    _case(db, investigation_id)
    text = safety.outbound_log_csv(db, investigation_id, since=since, service=_service(service))
    return Response(content=text, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="outbound-log-{investigation_id}.csv"'})


@router.put("/investigations/{investigation_id}/service-modes", response_model=SafetySummaryOut)
def put_service_mode(investigation_id: str, body: ServiceModeIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Off / Ask first / Automatic for one outside service in this case. Enforced where the calls are made."""
    _case(db, investigation_id)
    try:
        outbound.set_mode(db, investigation_id, body.service, body.mode, settings)
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    return safety.summary(db, investigation_id, since=None, settings=settings, admin=scope_for_request(request).is_global_admin)


@router.put("/investigations/{investigation_id}/safety/answers", response_model=SafetySummaryOut)
def put_safety_answer(investigation_id: str, body: SafetyAnswerIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """The reporter's answer to an "Only you can say" question. Kept on this computer only, never in a backup."""
    _case(db, investigation_id)
    try:
        safety.answer(db, investigation_id, body.question, body.answer)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return safety.summary(db, investigation_id, since=None, settings=settings, admin=scope_for_request(request).is_global_admin)


@router.post("/investigations/{investigation_id}/safety/backup", response_class=Response,
             responses=file_response("application/zip", "A portable backup of the case (.jwbackup.zip), kept on record"))
def make_safety_backup(investigation_id: str, body: SafetyBackupIn | None = None, db: Session = Depends(get_db)) -> Response:
    """Back up now: the case's portable backup with its documents, and a record of it (when, size, checksum, whether
    protected). With a passphrase in the body the file is sealed with it (ADR-0015); without one it is not."""
    _case(db, investigation_id)
    passphrase = body.passphrase if body is not None else None
    if passphrase is not None and not passphrase.strip():
        raise HTTPException(400, PASSPHRASE_EMPTY)
    payload, manifest, event = safety.make_backup(db, investigation_id, passphrase)
    return Response(content=payload, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{safety.backup_filename(investigation_id)}"',
        "X-JW-Backup-Version": str(manifest["version"]), "X-JW-Backup-Sha256": event.sha256,
        "X-JW-Backup-Protected": "true" if event.encrypted else "false"})

