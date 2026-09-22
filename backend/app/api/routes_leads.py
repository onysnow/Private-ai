"""Lead endpoints (STRUCT-0002/0008, REMEDIATION_PROMPT.md Stage E group
4). Validation and persistence live in app/services/leads.py
(create_lead, update_lead, create_lead_link, list_lead_links,
convert_lead), alongside the domain's existing serialize_lead/
serialize_link/get_profile/validate_link_target.
"""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import authorize_request_resource
from app.db.session import get_db
from app.models.domain import Investigation, Lead
from app.schemas.api import LeadConvertRequest, LeadCreate, LeadLinkCreate, LeadUpdate
from app.services.leads import (
    convert_lead, create_lead, create_lead_link, list_lead_links, serialize_lead, serialize_link, update_lead,
)

router = APIRouter(prefix="/api", dependencies=[Depends(authorize_request_resource)])


@router.post("/leads", response_model=None)
def create_lead_endpoint(body: LeadCreate, db: Session = Depends(get_db)) -> Any:
    if db.get(Investigation, body.investigation_id) is None:
        raise HTTPException(404, "Investigation not found")
    try:
        row = create_lead(db, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_lead(db, row)


@router.get("/leads/{lead_id}", response_model=None)
def get_lead(lead_id: str, db: Session = Depends(get_db)) -> Any:
    row = db.get(Lead, lead_id)
    if row is None:
        raise HTTPException(404, "Lead not found")
    return serialize_lead(db, row)


@router.patch("/leads/{lead_id}", response_model=None)
def update_lead_endpoint(lead_id: str, body: LeadUpdate, db: Session = Depends(get_db)) -> Any:
    row = db.get(Lead, lead_id)
    if row is None:
        raise HTTPException(404, "Lead not found")
    data = body.model_dump(exclude_unset=True)
    try:
        row = update_lead(db, row, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_lead(db, row)


@router.post("/leads/{lead_id}/links", response_model=None)
def link_lead(lead_id: str, body: LeadLinkCreate, db: Session = Depends(get_db)) -> Any:
    lead = db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    try:
        row = create_lead_link(db, lead, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return serialize_link(db, row)


@router.get("/leads/{lead_id}/links", response_model=None)
def list_lead_links_endpoint(lead_id: str, db: Session = Depends(get_db)) -> Any:
    if db.get(Lead, lead_id) is None:
        raise HTTPException(404, "Lead not found")
    return list_lead_links(db, lead_id)


@router.post("/leads/{lead_id}/convert", response_model=None)
def convert_lead_endpoint(lead_id: str, body: LeadConvertRequest, db: Session = Depends(get_db)) -> Any:
    lead = db.get(Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    try:
        return convert_lead(db, lead, body)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
