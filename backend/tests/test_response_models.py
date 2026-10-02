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
