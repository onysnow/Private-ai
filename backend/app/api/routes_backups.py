"""Backup inspect/preview/restore endpoints (STRUCT-0002/0008,
REMEDIATION_PROMPT.md Stage E group 3). All three already delegate to
app/services/exports.py; this module wires upload-size limiting
(app.api.dependencies.read_upload_limited, shared with the document
ingest endpoint still in routes.py pending group 5) and HTTP status
codes.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource, read_upload_limited
from app.core.authorization import require_scope_global_admin, scope_for_request
from app.core.config import settings
from app.db.session import get_db
from app.services.exports import inspect_export, preview_investigation_restore, restore_investigation_export
from app.services.security import resolve_storage_root

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/backups/inspect")
async def inspect_backup(file: UploadFile = File(...)):
    data = await read_upload_limited(file, settings.max_backup_bytes)
    try:
        manifest, records = inspect_export(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"manifest": manifest, "record_counts": {k: len(v) for k, v in records.items()}}


@router.post("/backups/preview")
async def preview_backup_restore(file: UploadFile = File(...), db: Session = Depends(get_db)):
    data = await read_upload_limited(file, settings.max_backup_bytes)
    try:
        return preview_investigation_restore(db, data, resolve_storage_root(settings.document_storage_dir))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@router.post("/backups/restore")
async def restore_backup(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not settings.enable_restore_api:
        raise HTTPException(403, "Backup restore API is disabled; set ENABLE_RESTORE_API=true to enable it")
    require_scope_global_admin(scope_for_request(request))
    data = await read_upload_limited(file, settings.max_backup_bytes)
    try:
        return restore_investigation_export(db, data, resolve_storage_root(settings.document_storage_dir))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
