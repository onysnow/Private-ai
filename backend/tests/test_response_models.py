"""Response models must not drop data (Foundation Fixes fix 2).

FastAPI removes any field a response model does not list. For every route
that has moved onto a model in app/schemas/responses.py, this compares the
route's real, unfiltered reply (the service result as FastAPI would have
encoded it without a model) with what the model lets through: they must be
identical. Add a case here whenever a route gets a response model.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.encoders import jsonable_encoder
from pydantic import TypeAdapter

from app.db.session import SessionLocal
from app.models.domain import Investigation
from app.schemas import responses as r
from app.services.investigations import list_investigation_evidence, list_investigation_sources
from app.services.lifecycle import delete_investigation, preview_investigation_deletion
from app.services.evidence import create_evidence
from app.services.sources import create_source, list_source_evidence


def _same_through_model(model: Any, raw: Any) -> None:
    unfiltered = jsonable_encoder(raw)
    adapter = TypeAdapter(model)
    filtered = adapter.dump_python(adapter.validate_python(raw), mode="json")
    assert filtered == unfiltered, f"{model} changes the reply"


@pytest.fixture()
def seeded(tmp_path):
    with SessionLocal() as db:
        inv = Investigation(name="Response models")
        db.add(inv); db.commit(); db.refresh(inv)
        source = create_source(db, {"investigation_id": inv.id, "title": "Wire log", "url": "https://example.test/log",
                                    "source_type": "web", "metadata_json": {"capture": "reporter"}})
        evidence = create_evidence(db, {"source_id": source.id, "quote": "$2.4M wired", "locator": "row 41", "notes": None})
        yield db, inv, source, evidence, tmp_path


def test_sources_and_evidence(seeded):
    db, inv, source, evidence, _ = seeded
    db.refresh(source); db.refresh(evidence)  # as the routes return them, freshly loaded
    _same_through_model(r.SourceOut, source)
    _same_through_model(r.EvidenceOut, evidence)
    _same_through_model(list[r.SourceOut], list_investigation_sources(db, inv.id))
    _same_through_model(list[r.EvidencePoolRow], list_investigation_evidence(db, inv.id))
    _same_through_model(list[r.EvidenceOut], list_source_evidence(db, source.id))


def test_investigation_deletion(seeded):
    db, inv, _source, _evidence, tmp_path = seeded
    _same_through_model(r.InvestigationDeletionPreview, preview_investigation_deletion(db, inv.id, tmp_path))
    _same_through_model(r.InvestigationDeletionResult, delete_investigation(db, inv.id, tmp_path, confirmation=inv.id))


def test_deletion_preview_with_document_files(tmp_path):
    from app.services.documents import ingest_document

    with SessionLocal() as db:
        inv = Investigation(name="With files")
        db.add(inv); db.commit(); db.refresh(inv)
        ingest_document(db, investigation_id=inv.id, title="Memo", filename="memo.txt", mime_type="text/plain",
                        data=b"Some text.\n", storage_dir=tmp_path)
        preview = preview_investigation_deletion(db, inv.id, tmp_path)
        assert preview["document_files"], "the case must exercise document file rows"
        _same_through_model(r.InvestigationDeletionPreview, preview)


def test_operation_ids_are_unique_route_names():
    from collections import Counter

    from app.main import create_app

    schema = create_app(bootstrap_schema=False).openapi()
    ids = Counter(op["operationId"] for path in schema["paths"].values() for op in path.values())
    assert [name for name, count in ids.items() if count > 1] == []
    assert schema["paths"]["/api/investigations/{investigation_id}/deletion-preview"]["get"]["operationId"] == "investigation_deletion_preview"


# --- Search, timeline, relationships, provenance (slice 2) ---------------------

@pytest.fixture()
def demo(tmp_path):
    """The demo investigation: entities, relationships, claims, evidence, leads,
    tasks, timeline events, plus one read document so extraction lineage and
    document traces have something to follow."""
    from app.services.demo_seed import seed_demo_investigation
    from app.services.documents import ingest_document, review_candidate
    from app.models.domain import ExtractionCandidate

    with SessionLocal() as db:
        inv, _created = seed_demo_investigation(db)
        doc = ingest_document(db, investigation_id=inv.id, title="Wire memo", filename="memo.txt", mime_type="text/plain",
                              data=b"Meridian Holdings Ltd paid Bellcastle Trading Group. \"The $2.4M wire cleared on 3 March.\"\n",
                              storage_dir=tmp_path)
        candidates = db.query(ExtractionCandidate).filter(ExtractionCandidate.document_id == doc.id).all()
        accepted = None
        for row in candidates:
            if row.candidate_type == "evidence":
                review_candidate(db, row, decision="accept", note="checked")
                db.refresh(row)
                accepted = row
                break
        yield db, inv, doc, candidates, accepted


def test_search_reply(demo):
    from app.services.search import investigation_search

    db, inv, _doc, _candidates, _accepted = demo
    reply = investigation_search(db, "Meridian", investigation_id=inv.id, limit=50)
    assert reply["results"], "the demo seed must give the search something to find"
    _same_through_model(r.SearchOut, reply)
    _same_through_model(r.SearchOut, investigation_search(db, "nothing-matches-this", investigation_id=inv.id))


def test_timeline_replies(demo):
    from app.schemas.api import TimelineEventCreate
    from app.services.timeline import create_timeline_event, investigation_timeline

    db, inv, _doc, _candidates, _accepted = demo
    full = investigation_timeline(db, inv.id, include_record_activity=True)
    kinds = {event["kind"] for event in full["events"]}
    assert "reporter_event" in kinds and len(kinds) > 1, "the case must cover reporter-authored and derived events"
    _same_through_model(r.TimelineOut, full)
    _same_through_model(r.TimelineOut, investigation_timeline(db, inv.id, limit=2, offset=1))
    row = create_timeline_event(db, TimelineEventCreate(investigation_id=inv.id, title="Filing", date_start="2024-03", precision="month"))
    db.refresh(row)
    _same_through_model(r.TimelineEventRowOut, row)


def test_relationship_and_statement_history_replies(demo):
    from app.services.provenance import entity_statement_history
    from app.services.relationships import investigation_relationships

    db, inv, _doc, _candidates, _accepted = demo
    rows = investigation_relationships(db, inv.id)
    assert rows
    _same_through_model(list[r.RelationshipOut], rows)
    entity_id = rows[0]["source"]["id"]
    _same_through_model(list[r.StatementHistoryRowOut], entity_statement_history(db, entity_id))


def test_provenance_replies(demo):
    from app.models.domain import Claim, Evidence, Lead, ReportingTask, Source
    from app.services.documents import serialize_extraction_lineage
    from app.services.provenance import find_extraction_lineage, record_provenance_trace
    from app.services.relationships import investigation_relationships

    db, inv, doc, candidates, accepted = demo
    assert candidates and accepted is not None
    _same_through_model(r.ExtractionLineageOut, serialize_extraction_lineage(db, candidates[0]))
    looked_up = find_extraction_lineage(db, accepted.accepted_record_type, accepted.accepted_record_id)
    assert looked_up["found"]
    _same_through_model(r.ExtractionLineageLookupOut, looked_up)
    _same_through_model(r.ExtractionLineageLookupOut, find_extraction_lineage(db, "claim", "missing"))

    relationship = investigation_relationships(db, inv.id)[0]
    targets = [
        ("entity", relationship["source"]["id"]),
        ("relationship", relationship["id"]),
        ("claim", db.query(Claim).filter(Claim.investigation_id == inv.id).first().id),
        ("evidence", db.query(Evidence).join(Source, Source.id == Evidence.source_id).filter(Source.investigation_id == inv.id).first().id),
        ("source", doc.source_id),
        ("document", doc.id),
        ("lead", db.query(Lead).filter(Lead.investigation_id == inv.id).first().id),
        ("task", db.query(ReportingTask).filter(ReportingTask.investigation_id == inv.id).first().id),
    ]
    for record_type, record_id in targets:
        trace = record_provenance_trace(db, record_type, record_id)
        assert trace["record_type"] == record_type
        _same_through_model(r.ProvenanceTraceOut, trace)


# --- Documents, jobs, OpenAleph corpus, backups (slice 3) ------------------------

def test_document_and_job_replies(demo):
    from app.jobs.handlers import HANDLERS
    from app.jobs.records import create_job, execute_job, list_jobs, serialize_job
    from app.models.jobs import BackgroundJob
    from app.services.documents import get_document_detail, serialize_document
    from app.services.investigations import list_investigation_documents
    from app.services.openaleph_corpus import get_document_sync, serialize_sync

    db, inv, doc, _candidates, _accepted = demo
    rows = list_investigation_documents(db, inv.id)
    assert rows
    _same_through_model(list[r.DocumentOut], rows)
    detail = get_document_detail(db, doc)
    assert detail["chunks"], "the case must cover a document with chunks"
    _same_through_model(r.DocumentDetailOut, detail)

    # The upload reply: the saved document, the job that reads it, its OpenAleph state.
    job = create_job(db, kind="extract_document", investigation_id=inv.id, subject_type="document", subject_id=doc.id)
    upload = {**serialize_document(db, doc), "job": serialize_job(job), "openaleph_sync": serialize_sync(get_document_sync(db, doc.id))}
    _same_through_model(r.DocumentUploadOut, upload)

    # A job that ran (the demo document is already read, so this one fails and
    # says so) and one that carries a result.
    assert execute_job(SessionLocal, job.id, HANDLERS) == "failed"
    db.expire_all()
    ran = db.get(BackgroundJob, job.id)
    assert ran is not None and ran.error
    _same_through_model(r.BackgroundJobOut, serialize_job(ran))
    with_result = create_job(db, kind="probe", investigation_id=inv.id, payload={"result": {"chunks": 3}})
    _same_through_model(r.BackgroundJobOut, serialize_job(with_result))
    listed = [serialize_job(row) for row in list_jobs(db, investigation_ids=[inv.id], subject_id=doc.id)]
    assert listed
    _same_through_model(list[r.BackgroundJobOut], listed)


def test_extraction_candidate_replies(demo):
    from app.models.domain import Entity
    from app.services.documents import (
        list_document_candidates, propose_relationship_from_extracted_claim, review_candidate, serialize_candidate,
    )
    from app.services.extraction_explanations import explain_extraction_candidate

    db, inv, doc, candidates, _accepted = demo
    plain = list_document_candidates(db, doc.id, "proposed", None)
    explained = list_document_candidates(db, doc.id, None, None, explain=True)
    assert plain and explained
    assert "explanation" not in plain[0] and "explanation" in explained[0]
    _same_through_model(list[r.ExtractionCandidateOut], plain)
    _same_through_model(list[r.ExtractionCandidateOut], explained)

    def source_kinds(explanation: dict) -> set[str]:
        parts = [source for part in explanation["parts"] for source in part["sources"]]
        return {source["kind"] for source in explanation["sources"] + parts}

    kinds = set().union(*(source_kinds(row["explanation"]) for row in explained))
    assert {"chunk", "document", "source"} <= kinds, "the demo document must give the rule-based explanations"

    # Reviewing: a claim accepted (it needs no identity decision) and an entity rejected.
    claim_candidate = next(row for row in candidates if row.candidate_type == "claim")
    entity_candidate = next(row for row in candidates if row.candidate_type == "entity")
    accepted = review_candidate(db, claim_candidate, decision="accept", note="checked")
    assert accepted["record"]
    _same_through_model(r.ExtractionReviewOut, accepted)
    _same_through_model(r.ExtractionReviewOut, review_candidate(db, entity_candidate, decision="reject", note="not a name"))

    # A relationship staged from the accepted claim: its explanation points at
    # the entities, the claim and the evidence the reporter chose.
    source, target = db.query(Entity).filter(Entity.investigation_id == inv.id).order_by(Entity.caption).all()[:2]
    staged = propose_relationship_from_extracted_claim(
        db, claim_id=accepted["record"]["id"], schema="Payment", source_entity_id=source.id, target_entity_id=target.id,
        properties={"amount": ["2400000"]}, note="staged in a test",
    )
    _same_through_model(r.ExtractionCandidateOut, serialize_candidate(staged))
    explanation = explain_extraction_candidate(db, staged)
    assert {"entity", "claim", "evidence"} <= source_kinds(explanation)
    _same_through_model(r.ExtractionExplanationOut, explanation)
    _same_through_model(r.ExtractionCandidateOut, {**serialize_candidate(staged), "explanation": explanation})


class _FakeOpenAleph:
    """The two OpenAleph calls a sync makes, answered locally."""

    def create_collection(self, data):
        return {"id": "oa-collection-1", "foreign_id": "oa-foreign-1", "label": data["label"]}

    def ingest_upload(self, *, collection_id, file_path, metadata, sync=False, index=True):
        return {"id": "oa-document-1", "foreign_id": metadata["foreign_id"]}


def test_openaleph_corpus_replies(demo, monkeypatch):
    from app.core.config import settings
    from app.services.documents import list_document_candidates
    from app.services.openaleph_corpus import (
        get_document_sync, get_openaleph_review_status, import_openaleph_entity_candidates,
        import_openaleph_evidence_candidates, refresh_openaleph_review_candidates, serialize_sync, sync_document_to_openaleph,
    )

    monkeypatch.setattr(settings, "openaleph_enabled", True)
    db, _inv, doc, _candidates, _accepted = demo
    before = get_openaleph_review_status(db, doc.id)
    assert before["sync"] is None and before["binding"] is None
    _same_through_model(r.OpenAlephReviewStatusOut, before)
    _same_through_model(r.OpenAlephDocumentSyncOut, {"sync": serialize_sync(get_document_sync(db, doc.id))})

    client = _FakeOpenAleph()
    sync_document_to_openaleph(db, doc.id, client_factory=lambda: client)
    _same_through_model(r.OpenAlephDocumentSyncOut, {"sync": serialize_sync(get_document_sync(db, doc.id))})

    def pages(*, collection_id, document_record_id):
        return [{"id": "oa-page-1", "schema": "Page", "properties": {"index": ["1"], "bodyText": ["Provider page text."]}}]

    def mentions(*, collection_id, document_record_id):
        return [{"id": "oa-mention-1", "schema": "Mention", "properties": {"name": ["Example Person"], "detectedSchema": ["Person"]}}]

    refreshed = refresh_openaleph_review_candidates(db, doc.id, evidence_searcher=pages, entity_searcher=mentions)
    assert refreshed["status"]["provider_candidate_total"] == 2
    _same_through_model(r.OpenAlephReviewRefreshOut, refreshed)
    _same_through_model(r.OpenAlephEvidenceImportOut, import_openaleph_evidence_candidates(db, doc.id, searcher=pages))
    _same_through_model(r.OpenAlephEntityImportOut, import_openaleph_entity_candidates(db, doc.id, searcher=mentions))
    after = get_openaleph_review_status(db, doc.id)
    assert after["sync"] and after["binding"] and after["ready_for_import"]
    _same_through_model(r.OpenAlephReviewStatusOut, after)

    # Provider-sourced proposals explain themselves with a provider reference.
    explained = list_document_candidates(db, doc.id, None, None, explain=True)
    provider_refs = [source for row in explained for source in row["explanation"]["sources"] if source["kind"] == "provider"]
    assert provider_refs
    _same_through_model(list[r.ExtractionCandidateOut], explained)


def test_backup_replies(demo, tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.db.session import Base
    from app.services.exports import build_investigation_export, preview_investigation_restore, restore_investigation_export

    db, inv, _doc, _candidates, _accepted = demo
    package, _manifest = build_investigation_export(db, inv.id, include_documents=True)

    # Against the live database the case already exists, so the preview reports conflicts.
    blocked = preview_investigation_restore(db, package, tmp_path / "live")
    assert blocked["conflicts"] and not blocked["can_restore"]
    _same_through_model(r.BackupPreviewOut, blocked)

    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    FreshSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with FreshSession() as fresh:
        allowed = preview_investigation_restore(fresh, package, tmp_path / "fresh")
        assert allowed["can_restore"] and allowed["lineage_integrity"]["valid"]
        _same_through_model(r.BackupPreviewOut, allowed)
        _same_through_model(r.BackupRestoreResultOut, restore_investigation_export(fresh, package, tmp_path / "fresh"))


# --- Claims, leads and reporting tasks (slice 4) -----------------------------------

def test_claim_replies(demo):
    from app.models.domain import Claim, Evidence, Source
    from app.schemas.api import ClaimCreate
    from app.services.claims import (
        claim_review_workspace, create_claim, link_claim_evidence, list_claim_evidence, review_claim, update_claim,
    )
    from app.services.investigations import list_investigation_claims

    db, inv, _doc, _candidates, _accepted = demo
    claims = list_investigation_claims(db, inv.id)
    assert claims
    _same_through_model(list[r.ClaimOut], claims)

    # The demo seed links evidence and relationships to its claims, so a
    # workspace has every part filled.
    workspaces = [claim_review_workspace(db, claim) for claim in claims]
    assert any(space["evidence"] for space in workspaces) and any(space["dependent_relationships"] for space in workspaces)
    for space in workspaces:
        _same_through_model(r.ClaimReviewWorkspaceOut, space)
    _same_through_model(list[r.ClaimEvidenceRowOut], list_claim_evidence(db, claims[0].id))

    created = create_claim(db, ClaimCreate(investigation_id=inv.id, text="The wire cleared on 3 March.", status="unverified", confidence=0.2))
    _same_through_model(r.ClaimOut, created)
    _same_through_model(r.ClaimOut, update_claim(db, created, {"status": "supported", "confidence": 0.6}))
    evidence = db.query(Evidence).join(Source, Source.id == Evidence.source_id).filter(Source.investigation_id == inv.id).first()
    link = link_claim_evidence(db, created, evidence, stance="supports", note="matches the ledger")
    _same_through_model(r.ClaimEvidenceLinkOut, link)
    claim, event = review_claim(db, db.get(Claim, created.id), status="confirmed", confidence=0.9, rationale="Two sources agree.")
    _same_through_model(r.ClaimReviewResultOut, {"claim": claim, "review": event, "workspace": claim_review_workspace(db, claim)})


def test_lead_and_task_replies(demo):
    from app.models.domain import Lead, RelationshipEdge, ReportingTask
    from app.schemas.api import LeadConvertRequest, LeadCreate, LeadLinkCreate, LeadUpdate, ReportingTaskCreate, ReportingTaskUpdate
    from app.services.investigations import lead_queue, list_investigation_leads, list_investigation_reporting_tasks
    from app.services.leads import (
        convert_lead, create_lead, create_lead_link, create_relationship_context_lead, create_reporting_task, list_lead_links,
        serialize_lead, serialize_link, serialize_task, update_lead, update_reporting_task,
    )

    db, inv, _doc, _candidates, _accepted = demo
    queue = lead_queue(db, inv.id, status=None, priority=None, owner=None, unresolved_only=False)
    assert queue["items"]
    _same_through_model(r.LeadQueueOut, queue)

    lead = create_lead(db, LeadCreate(investigation_id=inv.id, title="Who signed the wire?", detail="Ask the bank."))
    _same_through_model(r.LeadOut, serialize_lead(db, lead))
    lead = update_lead(db, lead, {"priority": "high", "owner": "AJ", "status": "active", "note": "picked up"})
    _same_through_model(r.LeadOut, serialize_lead(db, lead))
    edge = db.query(RelationshipEdge).filter(RelationshipEdge.investigation_id == inv.id).first()
    link = create_lead_link(db, lead, LeadLinkCreate(relationship_id=edge.id, note="the wire"))
    _same_through_model(r.LeadLinkOut, serialize_link(db, link))
    _same_through_model(list[r.LeadLinkOut], list_lead_links(db, lead.id))
    # A lead from a relationship's context carries links of every kind the trace found.
    context_lead = create_relationship_context_lead(db, edge)
    db.commit()
    _same_through_model(r.LeadOut, serialize_lead(db, db.get(Lead, context_lead.id)))

    # Converting makes a claim or a task; the reply says which.
    as_claim = convert_lead(db, lead, LeadConvertRequest(kind="claim", text="The bank confirmed the signer."))
    _same_through_model(r.LeadConversionOut, as_claim)
    as_task = convert_lead(db, lead, LeadConvertRequest(kind="task", title="Call the bank", priority="urgent", owner="AJ"))
    _same_through_model(r.LeadConversionOut, as_task)

    task = create_reporting_task(db, ReportingTaskCreate(investigation_id=inv.id, title="File the records request", lead_id=lead.id, due_date="2026-11-01"))
    _same_through_model(r.ReportingTaskOut, serialize_task(db, task))
    task = update_reporting_task(db, db.get(ReportingTask, task.id), ReportingTaskUpdate(status="in_progress", workflow_note="started"))
    reply = serialize_task(db, task)
    assert reply["task_context"] and len(reply["history"]) == 2
    _same_through_model(r.ReportingTaskOut, reply)

    # The lists now hold a lead with links, tasks and a status history.
    queue = lead_queue(db, inv.id, status=None, priority=None, owner=None, unresolved_only=False)
    full = next(item for item in queue["items"] if item["id"] == lead.id)
    assert full["links"] and full["tasks"] and len(full["history"]) > 1
    _same_through_model(r.LeadQueueOut, queue)
    _same_through_model(list[r.LeadOut], list_investigation_leads(db, inv.id))
    _same_through_model(list[r.ReportingTaskOut], list_investigation_reporting_tasks(db, inv.id))
