"""Write-up endpoints: reporter-authored long-form documents (distinct from
the uploaded-file Document model -- see app/services/writeups.py). CRUD plus
.docx export lives in app/services/writeups.py; routes stay thin per
STRUCT-0002.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from io import BytesIO
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation, Writeup
from app.schemas.api import WriteupCreate, WriteupUpdate
from app.services.assistant_context import describe_record_refs
from app.services.writeups import create_writeup, delete_writeup, list_writeups, render_writeup_docx, serialize_writeup, update_writeup

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/writeups", response_model=None)
def create_writeup_endpoint(body: WriteupCreate, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        row = create_writeup(
            db, investigation_id=body.investigation_id, title=body.title,
            content_json=body.content_json, status=body.status,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_writeup(row)


@router.get("/investigations/{investigation_id}/writeups", response_model=None)
def list_writeups_endpoint(investigation_id: str, status: str | None = None, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        rows = list_writeups(db, investigation_id, status=status)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"writeups": [serialize_writeup(row, include_content=False) for row in rows]}


@router.get("/writeups/{writeup_id}", response_model=None)
def get_writeup_endpoint(writeup_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Writeup, writeup_id)
    if row is None:
        raise HTTPException(404, "Write-up not found")
    return serialize_writeup(row)


@router.patch("/writeups/{writeup_id}", response_model=None)
def update_writeup_endpoint(writeup_id: str, body: WriteupUpdate, db: Session = Depends(get_db)) -> Any:
    row = db.get(Writeup, writeup_id)
    if row is None:
        raise HTTPException(404, "Write-up not found")
    try:
        row = update_writeup(db, row, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_writeup(row)


@router.delete("/writeups/{writeup_id}", response_model=None)
def delete_writeup_endpoint(writeup_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Writeup, writeup_id)
    if row is None:
        raise HTTPException(404, "Write-up not found")
    delete_writeup(db, row)
    return {"deleted": True}


@router.get("/writeups/{writeup_id}/export.docx")
def export_writeup_docx(writeup_id: str, db: Session = Depends(get_db)):
    row = db.get(Writeup, writeup_id)
    if row is None:
        raise HTTPException(404, "Write-up not found")
    details = describe_record_refs(db, investigation_id=row.investigation_id, refs=row.cited_record_refs or [])
    docx = render_writeup_docx(row, details)
    buf = BytesIO()
    docx.save(buf)
    buf.seek(0)
    filename = "".join(c for c in row.title if c.isalnum() or c in " _-").strip() or "writeup"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
    )
