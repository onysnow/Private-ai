"""Is it real? (mockup CHECK_3, ADR-0023): the findings about a case file's origin, a person's decision with reasons,
what that does to claims, local comparison with the case's own files, and outside checks allowed once with consent."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.models.domain import Document
from app.schemas.api import (
    AuthenticityAboutClaimIn,
    AuthenticityDecisionIn,
    AuthenticityOutsideIn,
    AuthenticityUpdate,
)
from app.schemas.responses import (
    AuthenticityCompareOut,
    AuthenticityOut,
    AuthenticityOutsideOut,
    AuthenticityPreviewOut,
    AuthenticityStatusOut,
    ErrorOut,
    ValidationErrorOut,
)
from app.services import authenticity
from app.services.authenticity import AuthenticityRefused

AuthenticityStatus = Literal["verified_origin", "unverified", "likely_synthetic", "confirmed_synthetic", "disputed"]
AuthenticityRole = Literal["events", "subject"]

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _document(db: Session, document_id: str) -> Document:
    row = db.get(Document, document_id)
    if row is None:
        raise HTTPException(404, "Document not found")
    return row


@router.get("/investigations/{investigation_id}/authenticity", response_model=list[AuthenticityStatusOut])
def list_authenticity(investigation_id: str, db: Session = Depends(get_db)) -> Any:
    """Each case file's standing that has been looked at or decided."""
    return authenticity.statuses(db, investigation_id)


@router.get("/documents/{document_id}/authenticity", response_model=AuthenticityOut, responses={404: {"model": ErrorOut}})
def get_authenticity(document_id: str, db: Session = Depends(get_db)) -> Any:
    """The screen. The findings are recorded the first time it is opened, on this computer; nothing is sent."""
    return authenticity.screen(db, _document(db, document_id))


@router.post("/documents/{document_id}/authenticity/examine", response_model=AuthenticityOut, responses={404: {"model": ErrorOut}})
def examine_again(document_id: str, db: Session = Depends(get_db)) -> Any:
    """Read the findings again (after a new trust list, or a new copy in the case). Each run is a line in the history."""
    doc = _document(db, document_id)
    authenticity.examine(db, doc, again=True)
    return authenticity.screen(db, doc)


@router.get("/documents/{document_id}/authenticity/preview", response_model=AuthenticityPreviewOut, responses={
    404: {"model": ErrorOut}, 422: {"model": ValidationErrorOut}})
def preview_authenticity(document_id: str, status: AuthenticityStatus, role: AuthenticityRole | None = None,
                         db: Session = Depends(get_db)) -> Any:
    """What a status (and role) would do to the claims that lean on the item, before it is recorded."""
    doc = _document(db, document_id)
    item = authenticity.get_item(db, doc)
    out = authenticity.claims_preview(db, doc, status, role or item.role)
    db.commit()
    return out


@router.post("/documents/{document_id}/authenticity/decision", response_model=AuthenticityOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "The same status, nothing ticked, or no reason"}})
def decide_authenticity(document_id: str, body: AuthenticityDecisionIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Set the status. Only a person does, with what they checked and why; the history keeps every decision."""
    doc = _document(db, document_id)
    try:
        authenticity.decide(db, doc, status=body.status, checked=list(body.checked), reason=body.reason,
                            person=scope_for_request(request).actor_id)
    except AuthenticityRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return authenticity.screen(db, doc)


@router.patch("/documents/{document_id}/authenticity", response_model=AuthenticityOut, responses={404: {"model": ErrorOut}})
def update_authenticity(document_id: str, body: AuthenticityUpdate, request: Request, db: Session = Depends(get_db)) -> Any:
    """What the item is for, whether it is source-protected, and the platform's own label."""
    doc = _document(db, document_id)
    authenticity.update(db, doc, role=body.role, source_protected=body.source_protected, platform_label=body.platform_label,
                        person=scope_for_request(request).actor_id)
    return authenticity.screen(db, doc)


@router.post("/documents/{document_id}/authenticity/compare", response_model=AuthenticityCompareOut, responses={404: {"model": ErrorOut}})
def compare_authenticity(document_id: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Compare with the case's own files, on this computer. Allowed for a source-protected item too."""
    doc = _document(db, document_id)
    authenticity.get_item(db, doc)
    return authenticity.compare_local(db, doc, scope_for_request(request).actor_id)


@router.post("/documents/{document_id}/authenticity/outside", response_model=AuthenticityOutsideOut, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut, "description": "Source-protected, or that check is not offered for this item"}})
def outside_authenticity(document_id: str, body: AuthenticityOutsideIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Allowed once: logs exactly what goes, to whom and why, and gives the address for the browser to open. The app
    itself sends nothing. Refused for a source-protected item."""
    doc = _document(db, document_id)
    try:
        return authenticity.send_outside(db, doc, body.option, scope_for_request(request).actor_id)
    except AuthenticityRefused as exc:
        db.commit()  # a blocked request stays in the outbound log
        raise HTTPException(409, str(exc)) from exc


@router.post("/documents/{document_id}/authenticity/about-claim", response_model=AuthenticityOut, status_code=201, responses={
    404: {"model": ErrorOut}, 409: {"model": ErrorOut}})
def add_about_claim(document_id: str, body: AuthenticityAboutClaimIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Add a claim about the item itself, supported by it whatever its status (the subject of the story)."""
    doc = _document(db, document_id)
    try:
        authenticity.add_about_claim(db, doc, body.text, scope_for_request(request).actor_id)
    except AuthenticityRefused as exc:
        raise HTTPException(409, str(exc)) from exc
    return authenticity.screen(db, doc)
