"""Covers STRUCT-0020: list_sources/list_claims/list_connector_runs/
list_connector_findings previously skipped the same
`db.get(Investigation, investigation_id) is None` check their sibling
list endpoints in this module already had, so a nonexistent
investigation_id silently returned 200 [] instead of 404.
"""
from fastapi.testclient import TestClient

from app.db.session import Base, engine
from app.main import app


def setup_module():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_list_endpoints_404_for_nonexistent_investigation():
    client = TestClient(app)
    missing = "no-such-investigation"
    for path in ("sources", "claims", "connector-runs", "connector-findings"):
        r = client.get(f"/api/investigations/{missing}/{path}")
        assert r.status_code == 404, f"{path}: expected 404, got {r.status_code}: {r.text}"
        assert r.json()["detail"] == "Investigation not found"


def test_list_endpoints_still_200_empty_for_real_investigation_with_no_rows():
    client = TestClient(app)
    inv = client.post("/api/investigations", json={"name": "Empty lists"}).json()["id"]
    for path in ("sources", "claims", "connector-runs", "connector-findings"):
        r = client.get(f"/api/investigations/{inv}/{path}")
        assert r.status_code == 200, f"{path}: expected 200, got {r.status_code}: {r.text}"
        assert r.json() == []
