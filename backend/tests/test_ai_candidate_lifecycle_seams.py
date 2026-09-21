"""AI analysis candidates (the TAS reasoning review queue) must cross the same
lifecycle seams every other investigation-owned record does: portable backup /
restore, investigation deletion, and the remote authorization boundary.

These run without the tas_spec submodule and without an LLM: rows are
inserted directly, since what is under test is where the rows travel, not
how they are produced (that is tests/test_reasoning_endpoints.py).
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import register_domain_routers
from app.core.authorization import (
    InvestigationAuthorizationError,
    reset_current_authorization_scope,
    scope_for_request,
    set_current_authorization_scope,
)
from app.core.config import settings
from app.core.time import utcnow_naive
from app.db.session import Base, get_db
from app.models.domain import AIAnalysisCandidate, Evidence, Investigation, Source
from app.services.exports import RESTORE_ORDER, build_investigation_export, inspect_export, restore_investigation_export
from app.services.lifecycle import delete_investigation, preview_investigation_deletion


PAYLOAD = {
    "executive_summary": "One cited filing.",
    "claims": [{"claim_id": "CLM-0001", "claim": "Ada North signed.", "classification": "CORROBORATED_FACT",
                "supporting_evidence": [{"record_type": "evidence", "record_id": "ev-1"}], "contradicting_evidence": [],
                "warrant": "direct quote", "confidence": "HIGH", "confidence_basis": "x", "limitations": []}],
    "investigative_gaps": [],
}


def _memory_factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _seed_candidates(db: Session, investigation_id: str, *, prefix: str) -> tuple[str, str]:
    db.add(Investigation(id=investigation_id, name=f"Case {investigation_id}"))
    db.add(Source(id=f"{prefix}-src", investigation_id=investigation_id, title="Filing", source_type="filing"))
    db.flush()
    db.add(Evidence(id=f"{prefix}-ev", source_id=f"{prefix}-src", quote="Ada North signed.", locator="p3"))
    accepted = AIAnalysisCandidate(
        id=f"{prefix}-accepted", investigation_id=investigation_id, module="case_synthesis",
        request={"question": "What did Ada North sign?", "working_theory": None, "max_results": 30, "include_external_leads": True},
        payload=PAYLOAD, checked_citation_ids=[{"record_type": "evidence", "record_id": f"{prefix}-ev"}],
        review_status="accepted", reviewer_note="Reporter verified the cited filing.", created_at=utcnow_naive(), reviewed_at=utcnow_naive(),
    )
    rejected = AIAnalysisCandidate(
        id=f"{prefix}-rejected", investigation_id=investigation_id, module="hypothesis_test",
        request={"question": "Did Ada act alone?", "working_theory": "Ada acted alone."},
        payload={"working_theory": "x", "hypothesis_matrix": [], "contradiction_log": [], "conclusion": "y"},
        checked_citation_ids=[], review_status="rejected", reviewer_note="Auto-rejected: invented citation", created_at=utcnow_naive(),
    )
    db.add_all([accepted, rejected])
    db.commit()
    return accepted.id, rejected.id


def test_restore_order_covers_every_investigation_owned_table():
    """Guard against the gap this file was written for: a table that hangs off
    investigations but is missing from the backup list silently drops data
    on every export. Walk the metadata instead of hand-listing tables."""
    owned = {
        table.name for table in Base.metadata.tables.values()
        if any(fk.column.table.name == "investigations" for fk in table.foreign_keys)
    }
    # Tables that are deliberately not portable (per-deployment state, not investigation content).
    non_portable = {"investigation_memberships", "openaleph_operation_failures"}
    missing = owned - set(RESTORE_ORDER) - non_portable
    assert not missing, f"investigation-owned tables absent from RESTORE_ORDER: {sorted(missing)}"
    assert "ai_analysis_candidates" in RESTORE_ORDER


def test_ai_candidates_round_trip_through_portable_backup(tmp_path: Path):
    factory = _memory_factory()
    with factory() as db:
        accepted_id, rejected_id = _seed_candidates(db, "inv-backup", prefix="b")
        package, manifest = build_investigation_export(db, "inv-backup", include_documents=False)

    _manifest, records = inspect_export(package)
    exported = {row["id"]: row for row in records["ai_analysis_candidates"]}
    assert set(exported) == {accepted_id, rejected_id}
    assert exported[accepted_id]["payload"]["claims"][0]["claim_id"] == "CLM-0001"
    assert exported[accepted_id]["request"]["question"] == "What did Ada North sign?"
    assert exported[accepted_id]["reviewer_note"] == "Reporter verified the cited filing."
    assert exported[accepted_id]["reviewed_at"] is not None
    assert exported[rejected_id]["review_status"] == "rejected"

    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Fresh = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    with Fresh() as db:
        result = restore_investigation_export(db, package, tmp_path / "docs")
        assert result["investigation_id"] == "inv-backup"
        row = db.get(AIAnalysisCandidate, accepted_id)
        assert row is not None and row.review_status == "accepted"
        assert row.payload == PAYLOAD
        assert row.checked_citation_ids == [{"record_type": "evidence", "record_id": "b-ev"}]
        assert row.request["question"] == "What did Ada North sign?"
        assert row.reviewed_at is not None
        assert db.get(AIAnalysisCandidate, rejected_id).reviewer_note == "Auto-rejected: invented citation"


def test_investigation_deletion_removes_ai_candidates_and_leaves_other_investigations(tmp_path: Path):
    factory = _memory_factory()
    with factory() as db:
        _seed_candidates(db, "inv-gone", prefix="g")
        keep_accepted, _ = _seed_candidates(db, "inv-keep", prefix="k")

        preview = preview_investigation_deletion(db, "inv-gone", tmp_path)
        assert preview["record_counts"]["ai_analysis_candidates"] == 2

        result = delete_investigation(db, "inv-gone", tmp_path, confirmation="inv-gone")
        assert result["deleted_record_counts"]["ai_analysis_candidates"] == 2
        assert db.query(AIAnalysisCandidate).filter_by(investigation_id="inv-gone").count() == 0
        assert db.get(AIAnalysisCandidate, keep_accepted) is not None


def _scoped_app(factory) -> FastAPI:
    app = FastAPI()

    def db_override():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = db_override

    @app.exception_handler(InvestigationAuthorizationError)
    async def denied(_request, _exc):
        return JSONResponse(status_code=404, content={"detail": "Investigation not found"})

    @app.middleware("http")
    async def authorization_context(request, call_next):
        token = set_current_authorization_scope(scope_for_request(request))
        try:
            return await call_next(request)
        finally:
            reset_current_authorization_scope(token)

    register_domain_routers(app)
    return app


def test_remote_scope_cannot_read_list_or_review_another_investigations_ai_candidates(monkeypatch):
    """/ai-analysis-candidates/{candidate_id} shares its path-parameter name with
    /extraction-candidates/{candidate_id}; the resolver must recognise AI
    candidate ids too, or a scoped remote token could read any investigation's
    model output by guessing/obtaining an id."""
    factory = _memory_factory()
    with factory() as db:
        allowed_id, _ = _seed_candidates(db, "inv-allowed", prefix="a")
        denied_id, _ = _seed_candidates(db, "inv-denied", prefix="d")
        # A still-proposed row in the denied investigation, to prove review is blocked too.
        db.add(AIAnalysisCandidate(id="d-proposed", investigation_id="inv-denied", module="case_synthesis", payload=PAYLOAD, checked_citation_ids=[]))
        db.commit()
    monkeypatch.setattr(settings, "api_auth_investigation_ids", "inv-allowed")
    app = _scoped_app(factory)

    with TestClient(app, base_url="https://journalism.example.test") as client:
        assert client.get(f"/api/ai-analysis-candidates/{allowed_id}").status_code == 200
        assert client.get("/api/investigations/inv-allowed/ai-analysis-candidates").status_code == 200

        denied_get = client.get(f"/api/ai-analysis-candidates/{denied_id}")
        assert denied_get.status_code == 404, denied_get.text
        assert "CLM-0001" not in denied_get.text
        assert client.get("/api/investigations/inv-denied/ai-analysis-candidates").status_code == 404
        denied_review = client.post("/api/ai-analysis-candidates/d-proposed/review", json={"decision": "accept", "note": "cross-scope"})
        assert denied_review.status_code == 404, denied_review.text

    with factory() as db:
        assert db.get(AIAnalysisCandidate, "d-proposed").review_status == "proposed"
