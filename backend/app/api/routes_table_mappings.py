"""Spreadsheets to entities (ADR-0006, Wave C; app/services/table_mappings.py):
read a CSV, TSV or XLSX document as a table, preview a FollowTheMoney
mapping of its columns, and run it, which proposes entities and links for
review. Nothing is accepted here."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import authorize_request_resource
from app.core.authorization import scope_for_request
from app.db.session import get_db
from app.models.domain import Document
from app.schemas.api import (
    TableMappingIn,
    TableProposalAcceptIn,
    TableProposalDismissIn,
)
from app.schemas.responses import (
    MappingSchemasOut,
    TableMappingOut,
    TableMappingPreviewOut,
    TableMappingRunOut,
    TableOut,
    TableProposalAcceptedOut,
    TableProposalViewOut,
)
from app.services import table_proposals
from app.services.table_mappings import (
    TableError,
    list_mappings,
    mapping_schemas,
    preview,
    run_mapping,
    table_view,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


def _document(db: Session, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(404, "Document not found")
    return doc


@router.get("/table-mapping/schemas", response_model=MappingSchemasOut)
def get_mapping_schemas() -> Any:
    """The entity and link kinds a mapping can make, with the properties each takes from a column."""
    return mapping_schemas()


@router.get("/documents/{document_id}/table", response_model=TableOut)
async def get_document_table(document_id: str, sheet: str | None = None, db: Session = Depends(get_db)) -> Any:
    """The document read as a table: its sheets, columns and first rows."""
    doc = _document(db, document_id)
    try:
        return await run_in_threadpool(table_view, doc, sheet=sheet)
    except TableError as exc:
        raise HTTPException(400, str(exc))


@router.get("/documents/{document_id}/table-mappings", response_model=list[TableMappingOut])
def list_document_table_mappings(document_id: str, db: Session = Depends(get_db)) -> Any:
    """The mappings run on this document, newest first."""
    return list_mappings(db, _document(db, document_id))


@router.post("/documents/{document_id}/table-mappings/preview", response_model=TableMappingPreviewOut)
async def preview_table_mapping(document_id: str, body: TableMappingIn, db: Session = Depends(get_db)) -> Any:
    """What the mapping makes from the first rows, and what it would leave out. Nothing is saved."""
    doc = _document(db, document_id)
    try:
        return await run_in_threadpool(preview, doc, body.query(), sheet=body.sheet)
    except TableError as exc:
        raise HTTPException(400, str(exc))


@router.get("/documents/{document_id}/table-proposal", response_model=TableProposalViewOut)
def get_table_proposal(document_id: str, sheet: str | None = None, db: Session = Depends(get_db)) -> Any:
    """What the table looks like (payments, or a list of people or companies), which column is which with how sure
    the app is, and where the proposal stands. Nothing is made until a person accepts it."""
    return table_proposals.proposal_view(db, _document(db, document_id), sheet=sheet)


@router.post("/documents/{document_id}/table-proposal/accept", response_model=TableProposalAcceptedOut)
def accept_table_proposal(document_id: str, body: TableProposalAcceptIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Accept the proposal, as it is or changed: the mapping runs, every party and payment it makes is a proposal to
    review, and the decision records who accepted."""
    doc = _document(db, document_id)
    try:
        return table_proposals.accept(db, doc, body.change(), decided_by=scope_for_request(request).actor_id)
    except TableError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))


@router.post("/documents/{document_id}/table-proposal/dismiss", response_model=TableProposalViewOut)
def dismiss_table_proposal(document_id: str, body: TableProposalDismissIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Dismiss the proposal: it is no longer offered on the file, and nothing is made."""
    doc = _document(db, document_id)
    try:
        return table_proposals.dismiss(db, doc, sheet=body.sheet, decided_by=scope_for_request(request).actor_id)
    except TableError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))


@router.post("/documents/{document_id}/table-mappings", response_model=TableMappingRunOut)
def run_table_mapping(document_id: str, body: TableMappingIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Run the mapping on every row: each entity and link becomes a proposal to review."""
    doc = _document(db, document_id)
    try:
        return run_mapping(db, doc, body.query(), sheet=body.sheet, created_by=scope_for_request(request).actor_id)
    except TableError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))
