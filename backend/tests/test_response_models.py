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


def test_openaleph_name_and_identifier_replies(demo):
    """ADR-0006: proposals made from OpenAleph's analysis, their
    explanations, the choice of owner for an email, and its acceptance."""
    from app.models.domain import Entity, ExtractionCandidate
    from app.services.documents import list_document_candidates, review_candidate
    from app.services.identifier_proposals import identifier_targets
    from app.services.openaleph_analysis import Analysis, import_analysis_proposals

    db, inv, doc, _candidates, _accepted = demo
    import_analysis_proposals(db, doc.id, Analysis(collection_id="7", entity_id="e1", schema="PlainText", properties={
        "companiesMentioned": ["bellcastle trading group"], "namesMentioned": ["Audit Desk"],
        "emailMentioned": ["desk@meridian.example"], "detectedLanguage": ["eng"]}))
    explained = [row for row in list_document_candidates(db, doc.id, "proposed", None, explain=True)
                 if row["payload"].get("provenance", {}).get("extraction_method") == "openaleph_ftm_analyze"]
    assert {row["candidate_type"] for row in explained} == {"entity", "identifier"}
    _same_through_model(list[r.ExtractionCandidateOut], explained)
    email = db.query(ExtractionCandidate).filter(ExtractionCandidate.document_id == doc.id,
                                                 ExtractionCandidate.candidate_type == "identifier").one()
    targets = identifier_targets(db, email)
    assert targets["other_entities"], "the demo seed has people and companies to choose from"
    _same_through_model(r.IdentifierTargetsOut, targets)
    owner = db.get(Entity, targets["other_entities"][0]["entity_id"])
    _same_through_model(r.ExtractionReviewOut, review_candidate(db, email, decision="accept", target_entity_id=owner.id))


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

    def analysed(entity_id):
        # ftm-analyze's results, written on the document entity (ADR-0006).
        return {"id": entity_id, "schema": "PlainText", "properties": {"peopleMentioned": ["example person"], "detectedLanguage": ["eng"]}}

    refreshed = refresh_openaleph_review_candidates(db, doc.id, evidence_searcher=pages, entity_fetcher=analysed)
    assert refreshed["status"]["provider_candidate_total"] == 2
    _same_through_model(r.OpenAlephReviewRefreshOut, refreshed)
    _same_through_model(r.OpenAlephEvidenceImportOut, import_openaleph_evidence_candidates(db, doc.id, searcher=pages))
    _same_through_model(r.OpenAlephEntityImportOut, import_openaleph_entity_candidates(db, doc.id, fetch_entity=analysed))
    after = get_openaleph_review_status(db, doc.id)
    assert after["sync"] and after["binding"] and after["ready_for_import"]
    _same_through_model(r.OpenAlephReviewStatusOut, after)

    # Provider-sourced proposals explain themselves with a provider reference.
    explained = list_document_candidates(db, doc.id, None, None, explain=True)
    provider_refs = [source for row in explained for source in row["explanation"]["sources"] if source["kind"] == "provider"]
    assert provider_refs
    _same_through_model(list[r.ExtractionCandidateOut], explained)


def test_corpus_status_replies(demo, monkeypatch):
    import httpx

    from app.core.config import settings
    from app.services.openaleph_corpus import sync_document_to_openaleph
    from app.services.openaleph_status import corpus_status
    from openaleph_fake import IDLE, busy_status

    db, inv, doc, _candidates, _accepted = demo
    monkeypatch.setattr(settings, "openaleph_enabled", False)
    _same_through_model(r.CorpusStatusOut, corpus_status(db, inv.id))
    monkeypatch.setattr(settings, "openaleph_enabled", True)
    _same_through_model(r.CorpusStatusOut, corpus_status(db, inv.id))
    sync_document_to_openaleph(db, doc.id, client_factory=_FakeOpenAleph)
    working = corpus_status(db, inv.id, fetch=lambda _collection: busy_status("ingest", "analyze"))
    assert working["state"] == "working" and len(working["stages"]) == 2
    _same_through_model(r.CorpusStatusOut, working)
    _same_through_model(r.CorpusStatusOut, corpus_status(db, inv.id, fetch=lambda _collection: IDLE))

    def down(_collection):
        raise httpx.ConnectError("refused")

    _same_through_model(r.CorpusStatusOut, corpus_status(db, inv.id, fetch=down))


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


# --- Connectors, dossier, graph, money flows, settings (slice 5) -------------------------

class _ConnectorA:
    """Finds the demo company under a provider record, with a relationship
    finding whose ends are two other findings of the same provider (so the
    relationship-candidate lookup finds them), and enriches any entity."""
    name = "fake-a"

    async def search(self, query):
        from app.connectors.base import ExternalFinding

        return [
            ExternalFinding(provider=self.name, record_id="a-company", caption="Meridian Holdings Ltd", schema="Company",
                            url="https://a.example/a-company", properties={"name": ["Meridian Holdings Ltd"], "registrationNumber": ["GB-123"],
                                                                            "jurisdiction": ["gb"]},
                            raw={"id": "a-company", "dataset": "registry_a"}),
            ExternalFinding(provider=self.name, record_id="a-owner", caption="Bellcastle Trading Group", schema="Company",
                            url="https://a.example/a-owner", properties={"name": ["Bellcastle Trading Group"]}, raw={"id": "a-owner"}),
            ExternalFinding(provider=self.name, record_id="a-ownership", caption="Bellcastle owns Meridian", schema="Ownership",
                            url="https://a.example/a-ownership", properties={"owner": ["a-owner"], "asset": ["a-company"], "percentage": ["100"]},
                            raw={"id": "a-ownership"}),
        ]

    async def enrich(self, entity):
        from app.connectors.base import ExternalFinding

        return [ExternalFinding(provider=self.name, record_id="a-company", caption=entity["caption"], schema=entity["schema"],
                                url="https://a.example/a-company",
                                properties={"name": [entity["caption"]], "registrationNumber": ["GB-123"], "jurisdiction": ["gb"]},
                                raw={"id": "a-company", "dataset": "registry_a"})]


class _ConnectorB(_ConnectorA):
    """A second provider that knows the same company by the same registration number."""
    name = "fake-b"

    async def search(self, query):
        from app.connectors.base import ExternalFinding

        return [ExternalFinding(provider=self.name, record_id="b-1", caption="Meridian Holdings Limited", schema="Company",
                                properties={"name": ["Meridian Holdings Limited"], "registrationNumber": ["GB-123"]}, raw={})]

    async def enrich(self, entity):
        from app.connectors.base import ExternalFinding

        return [ExternalFinding(provider=self.name, record_id="b-1", caption=entity["caption"], schema=entity["schema"],
                                properties={"name": [entity["caption"]], "registrationNumber": ["GB-123"]}, raw={})]


class _ConnectorDown:
    name = "fake-down"

    async def search(self, query):
        return []

    async def enrich(self, entity):
        raise RuntimeError("provider unavailable")


@pytest.fixture()
def fake_connectors():
    from app.connectors.registry import registry

    names = []
    for connector in (_ConnectorA(), _ConnectorB(), _ConnectorDown()):
        registry.register(connector.name, connector)
        names.append(connector.name)
    yield names
    for name in names:
        registry._connectors.pop(name, None)


def _run(coroutine):
    import asyncio

    return asyncio.run(coroutine)


def test_connector_and_review_replies(demo, fake_connectors):
    from app.api.routes_connectors import connectors as connectors_route
    from app.models.domain import Entity
    from app.schemas.api import ConnectorSearchRequest, CrossProviderDecisionRequest, ResolutionRequest, StatementAssessmentRequest
    from app.services.connector_findings import (
        create_resolution_decision, create_statement_assessment, list_statement_assessments, update_finding_review_status,
    )
    from app.services.connectors import enrich_entity, run_connector
    from app.services.consolidation import (
        create_cross_provider_decision, get_enrichment_session_clusters, get_enrichment_session_detail,
    )
    from app.services.entities import (
        list_cross_provider_decisions, list_entity_enrichment_sessions, list_entity_promotions,
        list_external_relationship_promotions, run_multi_enrichment,
    )
    from app.services.external_relationships import create_review, list_relationship_reviews, promote_review, relationship_endpoint_candidates
    from app.services.investigations import list_investigation_connector_findings, list_investigation_connector_runs
    from app.services.promotion import promote_assessment
    from app.services.resolution import candidate_entities

    db, inv, _doc, _candidates, _accepted = demo
    _same_through_model(r.ConnectorsOut, connectors_route())

    findings = _run(run_connector("fake-a", ConnectorSearchRequest(investigation_id=inv.id, query="Meridian"), db))
    assert len(findings) == 3
    _same_through_model(list[r.ConnectorFindingOut], findings)
    _same_through_model(list[r.ConnectorFindingOut], list_investigation_connector_findings(db, inv.id))
    _same_through_model(list[r.ConnectorRunOut], list_investigation_connector_runs(db, inv.id))
    company = next(row for row in findings if row.provider_record_id == "a-company")
    _same_through_model(r.ConnectorFindingOut, update_finding_review_status(db, company, "needs_followup"))

    # Identity: the candidates for a finding, a decision, an assessment, a promotion.
    candidates = candidate_entities(db, inv.id, company.caption, company.schema)
    assert candidates
    _same_through_model(list[r.EntityCandidateOut], candidates)
    meridian = db.get(Entity, candidates[0]["entity_id"])
    decision = create_resolution_decision(db, company, ResolutionRequest(entity_id=meridian.id, decision="positive", confidence=0.9, rationale="Exact name"))
    _same_through_model(r.ResolutionDecisionOut, decision)
    assessment = create_statement_assessment(db, company, StatementAssessmentRequest(entity_id=meridian.id, prop="registrationNumber", value="GB-123", status="accepted", note="matches"))
    _same_through_model(r.StatementAssessmentOut, assessment)
    _same_through_model(list[r.StatementAssessmentOut], list_statement_assessments(db, company.id))
    promotion = promote_assessment(db, assessment, "checked against the registry")
    _same_through_model(r.StatementPromotionOut, promotion)
    _same_through_model(list[r.StatementPromotionOut], list_entity_promotions(db, meridian.id))

    # An external relationship: its endpoint candidates, a review, its promotion.
    ownership = next(row for row in findings if row.schema == "Ownership")
    endpoints = relationship_endpoint_candidates(db, ownership)
    assert endpoints["source_external_finding"] and endpoints["source_candidates"] and endpoints["target_candidates"]
    _same_through_model(r.ExternalRelationshipCandidatesOut, endpoints)
    review = create_review(db, ownership, endpoints["source_candidates"][0]["entity_id"], endpoints["target_candidates"][0]["entity_id"], "supported", "registry agrees")
    _same_through_model(r.ExternalRelationshipReviewOut, review)
    _same_through_model(list[r.ExternalRelationshipReviewOut], list_relationship_reviews(db, ownership.id))
    promoted = promote_review(db, review)
    _same_through_model(r.ExternalRelationshipPromotionOut, promoted)
    _same_through_model(list[r.ExternalRelationshipPromotionOut], list_external_relationship_promotions(db, db.get(Entity, promoted.relationship_entity_id)))

    # Enrichment: one provider, then every provider in one session (one of them down).
    _same_through_model(list[r.ConnectorFindingOut], _run(enrich_entity("fake-a", meridian, db)))
    session = _run(run_multi_enrichment(db, meridian, ["fake-a", "fake-b", "fake-down"]))
    assert session["status"] == "partial" and any("error" in run for run in session["runs"])
    _same_through_model(r.EnrichmentSessionOut, session)
    _same_through_model(r.EnrichmentSessionDetailOut, get_enrichment_session_detail(db, session["id"]))
    _same_through_model(list[r.EnrichmentSessionRowOut], list_entity_enrichment_sessions(db, meridian.id))
    clusters = get_enrichment_session_clusters(db, session["id"])
    assert clusters and clusters[0]["pairs"], "the two providers share a registration number, so they must cluster"
    _same_through_model(list[r.EnrichmentClusterOut], clusters)
    cross = create_cross_provider_decision(db, session["id"], CrossProviderDecisionRequest(finding_ids=clusters[0]["finding_ids"], decision="positive", confidence=0.9))
    _same_through_model(r.CrossProviderDecisionOut, cross)
    _same_through_model(list[r.CrossProviderDecisionOut], list_cross_provider_decisions(db, meridian.id))
    decided = get_enrichment_session_clusters(db, session["id"])
    assert decided[0]["decision"]
    _same_through_model(list[r.EnrichmentClusterOut], decided)


def test_entity_dossier_merge_and_graph_replies(demo, fake_connectors):
    from app.models.domain import Evidence, Lead, Source
    from app.schemas.api import (
        ConnectorSearchRequest, EntityCreate, EntityUpdate, PropertyConflictDecisionRequest, ReportingTaskCreate, ResolutionRequest,
    )
    from app.services.connector_findings import create_resolution_decision
    from app.services.connectors import run_connector
    from app.services.dossier import entity_dossier
    from app.services.entities import (
        create_entity, decide_property_conflict, entity_merge_history, list_entities, list_entity_statements,
        list_property_conflict_decisions, run_multi_enrichment, update_entity,
    )
    from app.services.entity_merge import execute_entity_merge, preview_entity_merge
    from app.services.financial_flows import investigation_financial_ledger
    from app.services.leads import create_reporting_task
    from app.services.post_merge_reconciliation import detect_post_merge_reconciliation, record_post_merge_reconciliation
    from app.services.relationships import (
        attach_relationship_evidence, create_relationship, entity_relationships, investigation_graph,
        investigation_relationships, relationship_evidence_review_history, review_relationship_evidence, serialize_relationship,
    )
    from app.services.resolution import canonical_duplicate_candidates, record_canonical_resolution
    from app.services.search import investigation_search

    db, inv, _doc, _candidates, _accepted = demo
    entities = list_entities(db, inv.id, False)
    assert entities
    _same_through_model(list[r.EntityOut], entities)
    meridian = next(row for row in entities if row.caption == "Meridian Holdings Ltd")
    vessel = next(row for row in entities if row.caption.startswith("MV Fair Tern"))

    # A second value for a property makes a conflict the reporter can decide.
    _same_through_model(r.EntityOut, update_entity(db, meridian, EntityUpdate(caption="Meridian Holdings Ltd", properties={"jurisdiction": ["je"]})))
    _same_through_model(list[r.EntityStatementOut], list_entity_statements(db, meridian.id))
    conflict = decide_property_conflict(db, meridian, "jurisdiction", PropertyConflictDecisionRequest(
        decision="temporal_change", values=["gb", "je"], rationale="moved its seat",
        temporal_intervals=[{"value": "gb", "date_end": "2022-12-31"}, {"value": "je", "date_start": "2023-01-01"}],
    ))
    _same_through_model(r.PropertyConflictDecisionOut, conflict)
    _same_through_model(list[r.PropertyConflictDecisionOut], list_property_conflict_decisions(db, meridian.id, "jurisdiction"))

    # Connector findings, an identity decision and an enrichment session give
    # the dossier's external block something to hold.
    findings = _run(run_connector("fake-a", ConnectorSearchRequest(investigation_id=inv.id, query="Meridian"), db))
    company = next(row for row in findings if row.provider_record_id == "a-company")
    create_resolution_decision(db, company, ResolutionRequest(entity_id=meridian.id, decision="positive", confidence=0.9))
    _run(run_multi_enrichment(db, meridian, ["fake-a", "fake-b"]))
    # The finding's lead names the company, so a task on it lands in the dossier too.
    finding_lead = db.query(Lead).filter(Lead.investigation_id == inv.id, Lead.title == "Meridian Holdings Ltd").first()
    create_reporting_task(db, ReportingTaskCreate(investigation_id=inv.id, title="Check the registry entry", lead_id=finding_lead.id))

    # A near-duplicate of the company, with the same jurisdiction statement and
    # an edge to the same vessel, so a merge leaves both kinds of duplicate pair.
    duplicate = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Company", caption="Meridian Holdings Limited", properties={"jurisdiction": ["gb"]}))
    _same_through_model(r.EntityOut, duplicate)
    second_edge = create_relationship(db, investigation_id=inv.id, schema="Ownership", source_entity_id=duplicate.id, target_entity_id=vessel.id,
                                      properties={"role": ["registered owner"]}, dataset="registry_b", origin="https://b.example/vessel")
    evidence = db.query(Evidence).join(Source, Source.id == Evidence.source_id).filter(Source.investigation_id == inv.id).first()
    attach_relationship_evidence(db, second_edge, evidence_id=evidence.id, note="the registry page")
    review_relationship_evidence(db, second_edge, evidence_id=evidence.id, stance="supports", rationale="names the vessel")
    _same_through_model(r.RelationshipOut, serialize_relationship(db, second_edge))
    _same_through_model(r.RelationshipEvidenceReviewsOut, {"relationship_id": second_edge.id, "reviews": relationship_evidence_review_history(db, second_edge)})

    before = entity_dossier(db, meridian.id)
    assert before["property_conflicts"] and before["external"]["findings"] and before["claims"] and before["evidence"] and before["leads"] and before["tasks"] and before["timeline"]
    assert any(item["match_basis"].get("terms") for item in before["claims"] + before["evidence"] + before["leads"]), "a text mention names its terms"
    _same_through_model(r.EntityDossierOut, before)
    _same_through_model(list[r.EntityRelationshipOut], entity_relationships(db, meridian.id))

    # Duplicates: the candidate list, a decision, a merge, and the records it left to reconcile.
    candidates = canonical_duplicate_candidates(db, duplicate)
    assert any(row["entity_id"] == meridian.id for row in candidates)
    _same_through_model(list[r.CanonicalDuplicateCandidateOut], candidates)
    same = record_canonical_resolution(db, duplicate, meridian, decision="same", confidence=0.95, rationale="one registry number")
    _same_through_model(r.CanonicalResolutionDecisionOut, same)
    _same_through_model(list[r.CanonicalDuplicateCandidateOut], canonical_duplicate_candidates(db, duplicate))
    preview = preview_entity_merge(db, duplicate, meridian)
    assert preview["can_execute"]
    _same_through_model(r.CanonicalMergePreviewOut, preview)
    audit = execute_entity_merge(db, duplicate, meridian, preview_digest=preview["preview_digest"], rationale="merged in a test")
    _same_through_model(r.CanonicalMergeExecuteOut, {"audit": audit, "source_entity_id": duplicate.id, "target_entity_id": meridian.id})
    _same_through_model(list[r.CanonicalEntityMergeAuditOut], entity_merge_history(db, meridian))

    reconciliation = detect_post_merge_reconciliation(db, meridian)
    assert reconciliation["summary"]["statement_pairs"] >= 1 and reconciliation["summary"]["relationship_pairs"] == 1
    _same_through_model(r.PostMergeReconciliationOut, reconciliation)
    pair = reconciliation["relationship_duplicates"][0]
    decided = record_post_merge_reconciliation(db, meridian, record_type="relationship", record_a_id=pair["record_a"]["id"], record_b_id=pair["record_b"]["id"],
                                               decision="duplicate", rationale="one edge", preferred_record_id=second_edge.id)
    _same_through_model(r.ReconciliationDecisionOut, decided)
    statement_pair = reconciliation["statement_duplicates"][0]
    record_post_merge_reconciliation(db, meridian, record_type="statement", record_a_id=statement_pair["record_a"]["id"], record_b_id=statement_pair["record_b"]["id"], decision="keep_separate")
    _same_through_model(r.PostMergeReconciliationOut, detect_post_merge_reconciliation(db, meridian))

    # The graph: collapsed (the preferred edge carries the pair's provenance and an
    # aggregate advisory) and expanded (the suppressed copy says which edge is preferred).
    compact = investigation_graph(db, inv.id)
    preferred = next(edge for edge in compact["edges"] if edge["id"] == second_edge.id)
    assert preferred["aggregate_provenance"]["underlying_relationship_count"] == 2 and preferred["advisory"]["presentation_aggregate"] is True
    assert all("aggregate_provenance" not in edge for edge in compact["edges"] if edge["id"] != second_edge.id)
    _same_through_model(r.GraphOut, compact)
    expanded = investigation_graph(db, inv.id, include_reconciled_duplicates=True)
    assert any(edge.get("reconciliation", {}).get("suppressed_duplicate") for edge in expanded["edges"])
    _same_through_model(r.GraphOut, expanded)
    _same_through_model(list[r.RelationshipOut], investigation_relationships(db, inv.id))
    _same_through_model(list[r.RelationshipOut], investigation_relationships(db, inv.id, include_reconciled_duplicates=False))

    # The dossier after the merge: the alias resolves, the collapsed edge shows its aggregate.
    after = entity_dossier(db, duplicate.id)
    assert after["alias_resolution"] and after["identity_history"]["aliases"] and after["identity_history"]["merge_audits"]
    assert any(edge.get("aggregate_provenance") for edge in after["relationships"])
    _same_through_model(r.EntityDossierOut, after)
    _same_through_model(list[r.EntityRelationshipOut], entity_relationships(db, meridian.id, include_reconciled_duplicates=False))
    assert investigation_search(db, "Meridian", investigation_id=inv.id)["results"]

    # Money flows: the demo payment charts; a payment without an amount is listed as incomplete.
    bellcastle = next(row for row in entities if row.caption == "Bellcastle Trading Group")
    create_relationship(db, investigation_id=inv.id, schema="Payment", source_entity_id=bellcastle.id, target_entity_id=meridian.id,
                        properties={"currency": ["USD"], "date": ["2024-01"]})
    ledger = investigation_financial_ledger(db, inv.id)
    assert ledger["transactions"] and ledger["incomplete"]
    _same_through_model(r.FinancialLedgerOut, ledger)


def test_investigation_replies(demo):
    from app.core.authorization import AuthorizationScope
    from app.schemas.api import InvestigationCreate
    from app.services.investigations import create_investigation, list_investigations

    db, _inv, _doc, _candidates, _accepted = demo
    rows = list_investigations(db, AuthorizationScope(actor_id="local"))
    assert rows
    _same_through_model(list[r.InvestigationOut], rows)
    _same_through_model(r.InvestigationOut, create_investigation(db, InvestigationCreate(name="Second case", description="with a description")))


def test_settings_and_security_replies(demo, tmp_path, monkeypatch):
    import json
    from datetime import datetime, timedelta, timezone

    from app.core.audit_log import (
        apply_security_audit_retention, preview_security_audit_retention, read_security_audit, recent_security_denials,
        summarize_security_audit,
    )
    from app.core.config import settings
    from app.services.lifecycle import preview_orphan_document_files
    from app.services.settings import delete_connector_credential, get_settings_status, save_connector_credential, security_alerts

    db, _inv, _doc, _candidates, _accepted = demo
    monkeypatch.setattr(settings, "connector_credentials_file", str(tmp_path / "connectors.json"))
    audit_file = tmp_path / "security.jsonl"
    monkeypatch.setattr(settings, "audit_log_file", str(audit_file))
    now = datetime.now(timezone.utc)

    def record(offset_days: float, request_id: str, event: str, *, remote: bool) -> dict:
        row = {"timestamp": (now - timedelta(days=offset_days)).isoformat(), "event": event, "request_id": request_id, "method": "GET",
               "path": "/api/entities", "status_code": 403 if event != "api_request" else 200, "local_request": not remote}
        if remote:
            row["client_host"] = "203.0.113.9"
        return row

    rows = [record(400, "old", "api_request", remote=False), record(0.5, "r1", "access_denied", remote=True), record(0, "r2", "api_request", remote=False)]
    audit_file.write_text("".join(json.dumps(row) + "\n" for row in rows) + "not-json\n", encoding="utf-8")

    for local in (True, False):
        status = get_settings_status(db, local=local)
        assert status["security"]["total_denials"] == 1 and status["ai"]["tas_spec"]["modules"]
        _same_through_model(r.SettingsStatusOut, status)
    _same_through_model(r.SecurityAlertsOut, security_alerts(window_hours=48.0, max_examples=5))
    _same_through_model(r.SecurityAlertsOut, recent_security_denials(audit_file, window_hours=48.0, max_examples=5, now=now))
    _same_through_model(r.ConnectorCredentialSavedOut, save_connector_credential("aleph", "aleph-secret"))
    _same_through_model(r.ConnectorCredentialRemovedOut, delete_connector_credential("aleph"))

    storage = tmp_path / "documents"
    storage.mkdir()
    (storage / "stray.bin").write_bytes(b"orphan")
    preview = preview_orphan_document_files(db, storage)
    assert preview["orphan_file_count"] == 1
    _same_through_model(r.OrphanStoragePreviewOut, preview)

    page = read_security_audit(audit_file, limit=1)
    assert page["has_more"] and page["malformed_lines"] == 1
    _same_through_model(r.SecurityAuditViewOut, page)
    _same_through_model(r.SecurityAuditViewOut, read_security_audit(audit_file, limit=100, offset=1))
    _same_through_model(r.SecurityAuditViewOut, read_security_audit(tmp_path / "missing.jsonl"))
    _same_through_model(r.SecurityAuditSummaryOut, summarize_security_audit(audit_file))
    retention = preview_security_audit_retention(audit_file, keep_days=90, max_records=5000, now=now)
    retention.pop("_lines"); retention.pop("_keep_indexes")  # as the route does
    assert retention["would_remove"] == 1
    _same_through_model(r.SecurityAuditRetentionPreviewOut, retention)
    _same_through_model(r.SecurityAuditRetentionResultOut, apply_security_audit_retention(audit_file, keep_days=90, max_records=5000, confirmation="PRUNE SECURITY AUDIT", now=now))
