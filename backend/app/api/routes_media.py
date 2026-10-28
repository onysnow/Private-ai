"""Recordings read as documents (ADR-0020): the recording itself, for the player, and its transcript segment by
segment, words, their times and how sure the machine was, and the parts with no speech."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.config import settings
from app.db.session import get_db
from app.models.domain import Document, DocumentMedia, TranscriptSegment
from app.schemas.responses import ErrorOut, TranscriptOut
from app.services.security import resolve_storage_root
from app.services.transcription import UNSURE_BELOW, is_media, media_type

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _recording(db: Session, document_id: str) -> Document:
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    if not is_media(row.filename):
        raise HTTPException(415, "This document is not a recording")
    return row


@router.get("/documents/{document_id}/media", response_class=FileResponse, responses={
    200: {"content": {"audio/mpeg": {}, "video/mp4": {}}, "description": "The recording as uploaded, unaltered; byte ranges are honoured"},
    404: {"model": ErrorOut}, 415: {"model": ErrorOut, "description": "The document is not a recording"},
})
def get_document_media(document_id: str, db: Session = Depends(get_db)) -> Any:
    """The original recording, for the player: the stored bytes, never re-encoded."""
    row = _recording(db, document_id)
    root = resolve_storage_root(settings.document_storage_dir).resolve()
    path = Path(row.storage_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "The document's stored file is not available")
    return FileResponse(path, media_type=media_type(row.filename), content_disposition_type="inline", filename=row.filename,
                        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'",
                                 "Cache-Control": "private, max-age=300"})


@router.get("/documents/{document_id}/transcript", response_model=TranscriptOut, responses={
    404: {"model": ErrorOut, "description": "No such document, or it has not been transcribed yet"},
    415: {"model": ErrorOut, "description": "The document is not a recording"},
})
def get_document_transcript(document_id: str, db: Session = Depends(get_db)) -> Any:
    """The transcript made on this computer: each segment with its words, and the parts with no speech."""
    row = _recording(db, document_id)
    media = db.get(DocumentMedia, row.id)
    if media is None:
        raise HTTPException(404, "This recording has not been transcribed yet")
    segments = db.scalars(select(TranscriptSegment).where(TranscriptSegment.document_id == row.id).order_by(TranscriptSegment.ordinal))
    return {
        "document_id": row.id, "kind": media.kind, "duration": media.duration, "streams": media.streams,
        "outline": media.outline, "outline_step": media.outline_step, "transcript": media.transcript,
        "unsure_below": UNSURE_BELOW,
        "segments": [{"id": s.id, "chunk_id": s.chunk_id, "ordinal": s.ordinal, "start": s.start, "end": s.end, "kind": s.kind,
                      "text": s.text, "words": s.words, "speaker": s.speaker} for s in segments],
    }
