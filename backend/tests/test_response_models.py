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
