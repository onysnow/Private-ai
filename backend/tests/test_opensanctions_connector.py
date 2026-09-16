import asyncio
import httpx
import pytest
from app.connectors.opensanctions import OpenSanctionsConnector


def test_opensanctions_result_maps_to_ftm_shape():
    c = OpenSanctionsConnector()
    finding = c._parse_result({
        "id": "Q7747",
        "schema": "Person",
        "caption": "Example Person",
        "properties": {"name": ["Example Person"], "country": ["ru"]},
        "datasets": ["example_source"],
    })
    assert finding.provider == "opensanctions"
    assert finding.record_id == "Q7747"
    assert finding.schema == "Person"
    assert finding.properties["country"] == ["ru"]
    assert finding.url.endswith("/entities/Q7747/")


def test_opensanctions_requires_key(monkeypatch):
    c = OpenSanctionsConnector()
    c.api_key = ""
    with pytest.raises(RuntimeError, match="OPENSANCTIONS_API_KEY"):
        asyncio.run(c.search("Example Person"))


def test_opensanctions_search_uses_dataset_key_and_parses(monkeypatch):
    c = OpenSanctionsConnector()
    c.api_key = "secret"
    c.dataset = "default"
    c.limit = 7
    seen = {}

    async def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, json={"results": [{
            "id": "entity-1", "schema": "Company", "caption": "Example Co",
            "properties": {"name": ["Example Co"]}, "datasets": ["companies"]
        }]})

    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient

    class MockClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", MockClient)
    try:
        results = asyncio.run(c.search("Example Co"))
    finally:
        monkeypatch.setattr(httpx, "AsyncClient", original)

    assert seen["auth"] == "ApiKey secret"
    assert "/search/default" in seen["url"]
    assert "limit=7" in seen["url"]
    assert results[0].provider == "opensanctions"
    assert results[0].properties["name"] == ["Example Co"]


def test_connector_registry_exposes_opensanctions_status():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    payload = client.get("/api/connectors").json()
    assert "opensanctions" in payload["providers"]
    assert "configured" in payload["status"]["opensanctions"]


def test_opensanctions_enrich_uses_match_query_by_example(monkeypatch):
    c = OpenSanctionsConnector()
    c.api_key = "secret"
    c.dataset = "default"
    c.limit = 5
    seen = {}

    async def handler(request: httpx.Request):
        seen["method"] = request.method
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = __import__("json").loads(request.content.decode())
        return httpx.Response(200, json={"responses": {"q": {"status": 200, "results": [{
            "id": "entity-match-1", "schema": "Company", "caption": "NiSource Inc.",
            "score": 0.97, "properties": {"name": ["NiSource Inc."], "jurisdiction": ["us-in"]}
        }]}}})

    transport = httpx.MockTransport(handler)
    original = httpx.AsyncClient

    class MockClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", MockClient)
    try:
        results = asyncio.run(c.enrich({
            "schema": "Company",
            "caption": "NiSource Inc.",
            "properties": {"name": ["NiSource Inc."], "jurisdiction": ["us-in"]},
        }))
    finally:
        monkeypatch.setattr(httpx, "AsyncClient", original)

    assert seen["method"] == "POST"
    assert "/match/default" in seen["url"]
    assert seen["auth"] == "ApiKey secret"
    query = seen["body"]["queries"]["q"]
    assert query["schema"] == "Company"
    assert query["properties"]["jurisdiction"] == ["us-in"]
    assert results[0].raw["_match"]["score"] == 0.97
