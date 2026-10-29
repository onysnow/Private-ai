"""Recordings read as documents (ADR-0020): the recording itself, for the player, and its transcript segment by
segment, words, their times and how sure the machine was, and the parts with no speech."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.config import settings
from app.db.session import get_db
from app.core.authorization import scope_for_request
from app.models.derived import DerivedFile
from app.models.domain import Document, DocumentMedia, TranscriptSegment
from app.schemas.api import ClipCreate, PhotoCopyIn, VoiceName
from app.schemas.responses import (
    BackgroundJobOut,
    DerivedFileOut,
    ErrorOut,
    FacesOut,
    PhotoOut,
    TranscriptCompareRowOut,
    TranscriptOut,
    ValidationErrorOut,
    VoicesOut,
)
from app.services import derived_files, media_derived, publisher_transcript, voices
from app.services.derived_files import CaseGone
from app.services.native import NativeUnavailable
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
    publisher, parts = publisher_transcript.extras(db, row)
    return {
        "publisher": publisher, "parts": parts,
        "document_id": row.id, "kind": media.kind, "duration": media.duration, "streams": media.streams,
        "outline": media.outline, "outline_step": media.outline_step, "transcript": media.transcript,
        "unsure_below": UNSURE_BELOW, "voices": voices.serialize(media),
        "segments": [{"id": s.id, "chunk_id": s.chunk_id, "ordinal": s.ordinal, "start": s.start, "end": s.end, "kind": s.kind,
                      "text": s.text, "words": s.words, "speaker": s.speaker} for s in segments],
    }


def _segments(db: Session, document_id: str) -> list[dict[str, Any]]:
    return [{"id": s.id, "start": s.start, "end": s.end, "kind": s.kind, "text": s.text, "speaker": s.speaker}
            for s in db.scalars(select(TranscriptSegment).where(TranscriptSegment.document_id == document_id)
                                .order_by(TranscriptSegment.ordinal))]


@router.get("/documents/{document_id}/transcript/compare", response_model=list[TranscriptCompareRowOut], responses={
    404: {"model": ErrorOut, "description": "No such document, or no publisher's transcript to compare with"},
    415: {"model": ErrorOut}})
def compare_transcripts(document_id: str, db: Session = Depends(get_db)) -> Any:
    """Our transcript beside the publisher's, part by part; the words that differ are marked on both sides."""
    row = _recording(db, document_id)
    publisher, _parts = publisher_transcript.extras(db, row)
    if not publisher or not publisher.get("cues"):
        raise HTTPException(404, "This recording has no publisher's transcript to compare with")
    return publisher_transcript.compare(_segments(db, row.id), publisher["cues"])


@router.get("/documents/{document_id}/derived", response_model=list[DerivedFileOut], responses={404: {"model": ErrorOut}})
def list_derived(document_id: str, db: Session = Depends(get_db)) -> Any:
    """Every file made from this document, oldest first, with its edit-trail row."""
    if db.get(Document, document_id) is None:
        raise HTTPException(404, "Document not found")
    rows = db.scalars(select(DerivedFile).where(DerivedFile.document_id == document_id).order_by(DerivedFile.created_at))
    return [derived_files.serialize(r) for r in rows]


def _made(fn: Any) -> Any:
    try:
        return derived_files.serialize(fn())
    except media_derived.NotARecording as exc:
        raise HTTPException(422, str(exc)) from exc
    except NativeUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except CaseGone as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/documents/{document_id}/derived/cleaned", response_model=DerivedFileOut, status_code=201, responses={
    404: {"model": ErrorOut}, 415: {"model": ErrorOut}, 422: {"model": ErrorOut, "description": "Not a recording that has been read"},
    503: {"model": ErrorOut, "description": "The native module is not installed on this computer"}})
def make_cleaned_copy(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """A 16 kHz mono copy with the hum taken out and light noise reduction, for listening only. The recording itself
    is not changed; the copy is a new file with its edit-trail row."""
    row = _recording(db, document_id)
    return _made(lambda: media_derived.cleaned_copy(db, row, actor=scope_for_request(request).actor_id))


@router.post("/documents/{document_id}/derived/clip", response_model=DerivedFileOut, status_code=201, responses={
    404: {"model": ErrorOut}, 415: {"model": ErrorOut},
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The input does not match the route, or the part is outside the recording"}})
def make_clip(document_id: str, body: ClipCreate, request: Request, db: Session = Depends(get_db)) -> Any:
    """The part from `start` to `end` seconds kept as its own WAV file, cut from the original (or the cleaned copy)."""
    row = _recording(db, document_id)
    return _made(lambda: media_derived.clip(db, row, body.start, body.end, actor=scope_for_request(request).actor_id,
                                            from_cleaned=body.from_cleaned))


@router.post("/documents/{document_id}/voices", response_model=BackgroundJobOut, status_code=202, responses={
    404: {"model": ErrorOut}, 415: {"model": ErrorOut},
    409: {"model": ErrorOut, "description": "Not transcribed yet, or the voices are already being found"},
    503: {"model": ErrorOut, "description": "The voice models are not on this computer"}})
async def find_voices(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Tell the voices of a transcribed recording apart, on this computer (ADR-0026). Answers at once with the job.
    Names given earlier are cleared, and kept in the history."""
    from app.api.routes_documents import _submit_or_record_failure
    from app.jobs.handlers import FIND_VOICES
    from app.jobs.records import create_job, serialize_job
    from app.jobs.runner import job_runner
    from app.models.domain import BackgroundJob

    row = _recording(db, document_id)
    if db.get(DocumentMedia, row.id) is None:
        raise HTTPException(409, "This recording has not been transcribed yet")
    why = voices.available()
    if why:
        raise HTTPException(503, why)
    running = db.scalar(select(BackgroundJob.id).where(BackgroundJob.kind == FIND_VOICES, BackgroundJob.subject_id == row.id,
                                                       BackgroundJob.status.in_(("queued", "running"))))
    if running:
        raise HTTPException(409, "The voices of this recording are already being found")
    job = create_job(db, kind=FIND_VOICES, investigation_id=row.investigation_id, subject_type="document", subject_id=row.id,
                     runner=job_runner(request).mode, message="Waiting to listen for voices")
    await _submit_or_record_failure(request, job, db)
    db.expire_all()
    return serialize_job(db.get(BackgroundJob, job.id) or job)


@router.patch("/documents/{document_id}/voices/{voice}", response_model=VoicesOut, responses={
    404: {"model": ErrorOut, "description": "No such recording or voice"}, 415: {"model": ErrorOut},
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The party is not in this case"}})
def name_voice(document_id: str, voice: str, body: VoiceName, request: Request, db: Session = Depends(get_db)) -> Any:
    """Name this voice (a person only; the machine never names a voice), or clear its name. The earlier name is kept
    in the history. Never applied to another recording."""
    row = _recording(db, document_id)
    try:
        voices.name(db, row.id, voice, name=body.name, entity_id=body.entity_id, actor=scope_for_request(request).actor_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return voices.serialize(db.get(DocumentMedia, row.id))


@router.get("/derived-files/{derived_file_id}/file", response_class=FileResponse, responses={
    200: {"content": {"audio/wav": {}, "image/jpeg": {}, "application/pdf": {}}, "description": "The derived file as it was hashed"},
    404: {"model": ErrorOut}})
def get_derived_file(derived_file_id: str, db: Session = Depends(get_db)) -> Any:
    """A file made from a case file, as it was kept and hashed (its SHA-256 is on its trail row)."""
    row = db.get(DerivedFile, derived_file_id)
    if row is None:
        raise HTTPException(404, "Derived file not found")
    root = resolve_storage_root(settings.document_storage_dir).resolve()
    path = Path(row.storage_path).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(404, "The file is missing from this computer")
    return FileResponse(path, media_type=row.mime_type, filename=path.name.split("_", 1)[-1], content_disposition_type="inline",
                        headers={"X-Content-SHA256": row.sha256, "X-Content-Type-Options": "nosniff",
                                 "Content-Security-Policy": "default-src 'none'"})


def _picture_document(db: Session, document_id: str) -> Document:
    from app.services.image_reader import is_picture_name

    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    if not is_picture_name(row):
        raise HTTPException(415, "This document is not a photo or a picture")
    return row


@router.get("/documents/{document_id}/photo", response_model=PhotoOut, responses={404: {"model": ErrorOut}, 415: {"model": ErrorOut}})
def get_photo(document_id: str, db: Session = Depends(get_db)) -> Any:
    """What the photo claims about itself and what the machine proposes about it (mockup MEDIA_1)."""
    from app.services import photo_tools

    return photo_tools.photo_view(db, _picture_document(db, document_id))


@router.post("/documents/{document_id}/faces", response_model=FacesOut, responses={
    404: {"model": ErrorOut}, 415: {"model": ErrorOut}, 422: {"model": ErrorOut},
    503: {"model": ErrorOut, "description": "The native module is not installed on this computer"}})
def find_photo_faces(document_id: str, db: Session = Depends(get_db)) -> Any:
    """Where a detector finds faces in the photo as shown. Nothing names, matches or groups a face. The detector's
    model (232 KB) is fetched the first time, pinned and written to the outbound log."""
    from app.services import photo_tools

    row = _picture_document(db, document_id)
    try:
        faces = photo_tools.find_faces(photo_tools.base_bytes(db, row, None))
    except NativeUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except photo_tools.ToolRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"faces": faces, "model": photo_tools.FACE_MODEL_NAME, "model_sha256": photo_tools.FACE_MODEL[2]}


@router.post("/documents/{document_id}/derived/photo", response_model=DerivedFileOut, status_code=201, responses={
    404: {"model": ErrorOut}, 415: {"model": ErrorOut},
    422: {"model": ValidationErrorOut | ErrorOut, "description": "The copy cannot be made as asked, said why"},
    503: {"model": ErrorOut, "description": "The native module is not installed on this computer"}})
def make_photo_copy(document_id: str, body: PhotoCopyIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """A copy of the photo with faces blurred, metadata removed, cropped, an area redacted (with its reason) or turned,
    made from the photo as shown or from another copy. The photo itself is never written."""
    from app.services import photo_tools

    row = _picture_document(db, document_id)
    parent = db.get(DerivedFile, body.from_id) if body.from_id else None
    if body.from_id and parent is None:
        raise HTTPException(404, "No such copy")
    try:
        return derived_files.serialize(photo_tools.make_copy(db, row, body.operation, body.params, parent=parent,
                                                             actor=scope_for_request(request).actor_id))
    except photo_tools.ToolRefused as exc:
        raise HTTPException(422, str(exc)) from exc
    except NativeUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    except CaseGone as exc:
        raise HTTPException(404, str(exc)) from exc
