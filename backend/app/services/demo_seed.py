"""Seed (and locate) the one demo investigation.

Ony asked for a demo mode that fills the app with real, interactive
sample data -- documents/evidence, entities, relationships, claims,
leads, and timeline events -- built through the actual service layer
(not a frontend mock), so every feature (the relationship graph, the
claim verification workflow, leads triage, the timeline) works on it
exactly like a real investigation.

Seeding is idempotent: if a demo investigation already exists, it is
returned as-is rather than creating a second one. Deleting it uses the
existing, real `DELETE /investigations/{id}` endpoint -- no separate
delete path needed here; the frontend just needs the demo
investigation's id, which `GET /api/investigations` already exposes
via the `is_demo` flag.

Scoping note: "documents" here means Source + Evidence rows (a
titled source with exact quoted evidence attached), the same model the
app's own document-ingestion/evidence-capture panels produce --
not a run through the file-upload/extraction pipeline, which needs
real file bytes and would make this seed far heavier for no benefit
(the graph/claims/leads/timeline features don't care how a Source
was created).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Entity, Investigation, TimelineEvent
from app.schemas.api import (
    ClaimCreate, EntityCreate, LeadCreate, ReportingTaskCreate, TimelineEventCreate,
)
from app.services.claims import create_claim, link_claim_evidence
from app.services.entities import create_entity
from app.services.evidence import create_evidence
from app.services.investigations import create_investigation
from app.services.leads import create_lead, create_reporting_task, update_lead
from app.services.relationships import create_relationship
from app.services.sources import create_source
from app.services.timeline import create_timeline_event

DEMO_INVESTIGATION_NAME = "Demo Investigation"
DEMO_DESCRIPTION = (
    "Sample data for exploring every feature -- entities, relationships, "
    "claims, evidence, leads, and a timeline. Safe to delete any time from "
    "Settings; nothing here is real."
)


def find_demo_investigation(db: Session) -> Investigation | None:
    # The 1MDB case (app/services/demo_1mdb.py) is a demo too; this is the small made-up one.
    return db.scalar(select(Investigation).where(Investigation.is_demo.is_(True), Investigation.name == DEMO_INVESTIGATION_NAME))


def seed_demo_investigation(db: Session) -> tuple[Investigation, bool]:
    """Return (investigation, created). If a demo investigation already
    exists, returns it unchanged (created=False) rather than making a
    second one."""
    existing = find_demo_investigation(db)
    if existing is not None:
        return existing, False

    inv = Investigation(name=DEMO_INVESTIGATION_NAME, description=DEMO_DESCRIPTION, is_demo=True)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    inv_id = inv.id

    # -- Sources & evidence ("documents") --------------------------------
    source_filing = create_source(db, {
        "investigation_id": inv_id,
        "title": "Meridian Holdings Ltd -- Companies Registry filing (2024 annual return)",
        "url": None,
        "source_type": "document",
    })
    source_article = create_source(db, {
        "investigation_id": inv_id,
        "title": "\"Offshore ties revealed\" -- Riverside Gazette, 2024-03-02",
        "url": "https://example.org/riverside-gazette/offshore-ties-revealed",
        "source_type": "web",
    })

    ev_officer = create_evidence(db, {
        "source_id": source_filing.id,
        "quote": "Director: Alaric Voss, appointed 2019-06-11.",
        "locator": "p. 2, Officers section",
    })
    ev_ownership = create_evidence(db, {
        "source_id": source_filing.id,
        "quote": "Meridian Holdings Ltd is wholly owned by Bellcastle Trading Group.",
        "locator": "p. 4, Ownership structure",
    })
    ev_payment = create_evidence(db, {
        "source_id": source_article.id,
        "quote": "Bank records show a transfer of $2,400,000 from Bellcastle Trading Group "
                 "to Meridian Holdings Ltd in November 2023, described in the leaked memo as "
                 "a \"consulting fee.\"",
        "locator": "paragraph 6",
    })
    ev_disputed = create_evidence(db, {
        "source_id": source_article.id,
        "quote": "A spokesperson for Bellcastle Trading Group denied any ongoing "
                 "financial relationship with Meridian Holdings Ltd.",
        "locator": "paragraph 9",
    })

    # -- Entities ---------------------------------------------------------
    def entity(schema: str, caption: str, properties: dict[str, list[str]] | None = None) -> Entity:
        return create_entity(db, EntityCreate(
            investigation_id=inv_id, schema=schema, caption=caption,
            properties=properties or {},
        ))

    alaric = entity("Person", "Alaric Voss", {"nationality": ["gb"]})
    priya = entity("Person", "Priya Kavanagh")
    meridian = entity("Company", "Meridian Holdings Ltd", {"jurisdiction": ["gb"]})
    bellcastle = entity("Company", "Bellcastle Trading Group", {"jurisdiction": ["ky"]})
    harborline = entity("Organization", "Harborline Civic Trust")
    vessel = entity("Asset", "MV Fair Tern (cargo vessel)")

    # -- Relationships ------------------------------------------------------
    def relate(schema: str, source: Entity, target: Entity, properties: dict[str, list[str]] | None = None, evidence_id: str | None = None) -> Any:
        return create_relationship(
            db, investigation_id=inv_id, schema=schema,
            source_entity_id=source.id, target_entity_id=target.id,
            properties=properties or {}, evidence_id=evidence_id,
        )

    relate("Directorship", alaric, meridian, evidence_id=ev_officer.id)
    relate("Ownership", bellcastle, meridian, evidence_id=ev_ownership.id)
    relate("Employment", priya, harborline)
    relate("Ownership", meridian, vessel)
    payment_rel = relate("Payment", bellcastle, meridian, properties={
        "amount": ["2400000"], "currency": ["USD"], "date": ["2023-11-14"],
        "purpose": ["Consulting fee (disputed)"],
    }, evidence_id=ev_payment.id)

    # -- Claims + evidence links -------------------------------------------
    claim_ownership = create_claim(db, ClaimCreate(
        investigation_id=inv_id,
        text="Meridian Holdings Ltd is wholly owned by Bellcastle Trading Group.",
        status="supported", confidence=0.8,
    ))
    link_claim_evidence(db, claim_ownership, ev_ownership, stance="supports", note="Registry filing, ownership structure section.")

    claim_payment = create_claim(db, ClaimCreate(
        investigation_id=inv_id,
        text="Bellcastle Trading Group paid Meridian Holdings Ltd $2.4M described as a consulting fee.",
        status="disputed", confidence=0.5,
    ))
    link_claim_evidence(db, claim_payment, ev_payment, stance="supports", note="Bank records cited in the Gazette report.")
    link_claim_evidence(db, claim_payment, ev_disputed, stance="contradicts", note="Bellcastle's spokesperson denied the relationship.")

    claim_unverified = create_claim(db, ClaimCreate(
        investigation_id=inv_id,
        text="Alaric Voss has an undisclosed financial interest in the MV Fair Tern.",
        status="unverified", confidence=0.2,
    ))

    # -- Leads + reporting tasks --------------------------------------------
    lead_followup = create_lead(db, LeadCreate(
        investigation_id=inv_id, title="Trace the $2.4M consulting-fee payment",
        detail="Follow the payment through Meridian's bank records; check for a matching invoice.",
        status="active",
    ))
    update_lead(db, lead_followup, {"priority": "urgent", "owner": "Demo reporter"})

    lead_foia = create_lead(db, LeadCreate(
        investigation_id=inv_id, title="Request Meridian's full ownership filing history",
        detail="File a records request for prior-year annual returns to establish when Bellcastle's stake began.",
        status="unreviewed",
    ))
    update_lead(db, lead_foia, {"priority": "normal"})

    lead_interview = create_lead(db, LeadCreate(
        investigation_id=inv_id, title="Interview Priya Kavanagh re: Harborline Civic Trust",
        detail="She may know whether Harborline has any dealings with Meridian or Bellcastle.",
        status="unreviewed",
    ))
    update_lead(db, lead_interview, {"priority": "low"})

    create_reporting_task(db, ReportingTaskCreate(
        investigation_id=inv_id, title="Draft records request for annual returns",
        status="todo", priority="normal", lead_id=lead_foia.id,
    ))
    create_reporting_task(db, ReportingTaskCreate(
        investigation_id=inv_id, title="Reconcile bank transfer dates with the invoice", status="in_progress",
        priority="urgent", lead_id=lead_followup.id,
    ))

    # -- Timeline -------------------------------------------------------------
    def event(title: str, date_start: str, **kw: Any) -> TimelineEvent:
        return create_timeline_event(db, TimelineEventCreate(
            investigation_id=inv_id, title=title, date_start=date_start, **kw,
        ))

    event("Alaric Voss appointed director of Meridian Holdings Ltd", "2019-06-11",
          entity_id=meridian.id, source_id=source_filing.id, evidence_id=ev_officer.id,
          verification_status="verified")
    event("Bellcastle Trading Group becomes sole owner of Meridian Holdings Ltd", "2021-02",
          precision="month", entity_id=meridian.id, evidence_id=ev_ownership.id,
          verification_status="verified")
    event("Disputed $2.4M payment from Bellcastle to Meridian", "2023-11-14",
          entity_id=meridian.id, evidence_id=ev_payment.id, claim_id=claim_payment.id,
          verification_status="disputed")
    event("Riverside Gazette publishes \"Offshore ties revealed\"", "2024-03-02",
          source_id=source_article.id, verification_status="verified")
    event("Lead opened: trace the consulting-fee payment", "2024-03-03",
          lead_id=lead_followup.id, verification_status="asserted")

    db.commit()
    db.refresh(inv)
    return inv, True
