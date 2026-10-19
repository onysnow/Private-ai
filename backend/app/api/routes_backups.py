"""Backup inspect/preview/restore endpoints (STRUCT-0002/0008,
REMEDIATION_PROMPT.md Stage E group 3). All three already delegate to
app/services/exports.py; this module wires upload-size limiting
(app.api.dependencies.read_upload_limited, shared with the document
ingest endpoint still in routes.py pending group 5) and HTTP status
codes.
"""
from typing import Any
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource, read_upload_limited
from app.core.authorization import require_scope_global_admin, scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.schemas.responses import BackupInspectOut, BackupPreviewOut, BackupRestoreResultOut
from app.services.exports import inspect_export, preview_investigation_restore, restore_investigation_export
from app.services.security import resolve_storage_root

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])

# A form field beside the file, never a query parameter (a query string can end up in logs). Needed only for a
# protected backup (ADR-0015); a wrong one is a 400 that says so, and the passphrase is never logged or stored.
PASSPHRASE = Form(None, description="The passphrase a protected backup was made with; leave out for an unprotected one")


@router.post("/backups/inspect", response_model=BackupInspectOut)
async def inspect_backup(file: UploadFile = File(...), passphrase: str | None = PASSPHRASE) -> dict[str, Any]:
    data = await read_upload_limited(file, settings.max_backup_bytes)
    try:
        manifest, records = inspect_export(data, passphrase)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"manifest": manifest, "record_counts": {k: len(v) for k, v in records.items()}}


@router.post("/backups/preview", response_model=BackupPreviewOut)
async def preview_backup_restore(file: UploadFile = File(...), passphrase: str | None = PASSPHRASE,
                                 db: Session = Depends(get_db)) -> Any:
    data = await read_upload_limited(file, settings.max_backup_bytes)
    try:
        return preview_investigation_restore(db, data, resolve_storage_root(settings.document_storage_dir), passphrase)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/backups/restore", response_model=BackupRestoreResultOut)
async def restore_backup(request: Request, file: UploadFile = File(...), passphrase: str | None = PASSPHRASE,
                         db: Session = Depends(get_db)) -> Any:
    if not settings.enable_restore_api:
        raise HTTPException(403, "Backup restore API is disabled; set ENABLE_RESTORE_API=true to enable it")
    require_scope_global_admin(scope_for_request(request))
    data = await read_upload_limited(file, settings.max_backup_bytes)
    try:
        return restore_investigation_export(db, data, resolve_storage_root(settings.document_storage_dir), passphrase)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
