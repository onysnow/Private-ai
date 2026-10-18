import asyncio
import httpx
from app.connectors.firecrawl import FirecrawlConnector


def test_firecrawl_result_maps_to_ftm_shape():
    c = FirecrawlConnector()
    finding = c._parse_result({
        "url": "https://example.com/article",
        "title": "Example Article",
        "description": "A short summary.",
    })
    assert finding.provider == "firecrawl"
    assert finding.record_id == "https://example.com/article"
    assert finding.caption == "Example Article"
    assert finding.url == "https://example.com/article"
    assert finding.properties["description"] == ["A short summary."]


def test_firecrawl_does_not_require_key():
    """Firecrawl's /v2/search is documented to work keyless at a lower rate
    limit, unlike Aleph/OpenSanctions -- so unlike those connectors this one
    has no _require_key() guard."""
    c = FirecrawlConnector()
    c.api_key = ""
    assert c.configured is False
    assert "Authorization" not in c._headers()


def test_firecrawl_search_sends_bearer_when_key_present_and_parses(monkeypatch):
    c = FirecrawlConnector()
    c.api_key = "secret"
    c.limit = 5
    seen = {}

    async def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = __import__("json").loads(request.content.decode())
        return httpx.Response(200, json={
            "success": True,
            "data": {"web": [{
                "url": "https://example.com/a", "title": "A", "description": "desc",
            }]},
            "creditsUsed": 1,
        })

    transport = httpx.MockTransport(handler)

    class MockClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", MockClient)
    results = asyncio.run(c.search("example query"))

    assert seen["auth"] == "Bearer secret"
    assert seen["body"] == {"query": "example query", "limit": 5}
    assert seen["url"].endswith("/v2/search")
    assert results[0].provider == "firecrawl"
    assert results[0].caption == "A"


def test_firecrawl_search_works_without_key(monkeypatch):
    c = FirecrawlConnector()
    c.api_key = ""
    seen = {}

    async def handler(request: httpx.Request):
        seen["auth"] = request.headers.get("Authorization")
        return httpx.Response(200, json={"success": True, "data": {"web": []}})

    transport = httpx.MockTransport(handler)

    class MockClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = transport
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", MockClient)
    results = asyncio.run(c.search("example query"))

    assert seen["auth"] is None
    assert results == []


def test_connector_registry_exposes_firecrawl_status():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    payload = client.get("/api/connectors").json()
    assert "firecrawl" in payload["providers"]
    assert "configured" in payload["status"]["firecrawl"]


def test_firecrawl_credential_roundtrip(tmp_path):
    from app.services.credentials import set_secret, get_secret, remove_secret
    path = tmp_path / "connectors.json"
    set_secret(path, "firecrawl", "fc-key-123")
    assert get_secret(path, "firecrawl") == "fc-key-123"
    assert remove_secret(path, "firecrawl") is True
