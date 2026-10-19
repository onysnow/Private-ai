"""One way to call OpenAleph's API (ADR-0004, ADR-0006).

Every Workbench request to OpenAleph's REST API that is not made through
``openaleph-client`` goes through here, so each one carries the same three
things: the configured base URL, the authorization OpenAleph expects
(``openaleph_auth_headers``: the API key, else the single-user session
token), and a timeout.

``transport`` is the seam the tests use: setting it to an
``httpx.MockTransport`` puts a fake OpenAleph behind every call, the way
``tests/test_openaleph_reader.py`` already fakes the token request. A call
may also pass its own transport.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit

import httpx

from app.core.config import settings
from app.services.openaleph_corpus import openaleph_auth_headers

# Tests replace this with an httpx.MockTransport; None means the network.
transport: httpx.BaseTransport | None = None

USER_AGENT = "JournalismWorkbench/0.93"
# A list value sends the parameter once per item (httpx), as OpenAleph's
# repeated filters expect.
Params = Mapping[str, str | int | Sequence[str]] | None


def base_url() -> str:
    return settings.openaleph_base_url.rstrip("/")


def _transport(override: httpx.BaseTransport | None) -> httpx.BaseTransport | None:
    return override if override is not None else transport


def _client(override: httpx.BaseTransport | None) -> httpx.Client:
    # The probe timeout is tuned for a quick health check; real reads get at
    # least 10 seconds, as the reader always has.
    return httpx.Client(timeout=max(settings.openaleph_probe_timeout_seconds, 10.0), follow_redirects=True,
                        transport=_transport(override))


def _headers(override: httpx.BaseTransport | None) -> dict[str, str]:
    return {"User-Agent": USER_AGENT, **openaleph_auth_headers(_transport(override))}


def get(path: str, params: Params = None, *, transport: httpx.BaseTransport | None = None) -> httpx.Response:
    """GET an API path (``/api/2/...``); the caller decides what a status means."""
    with _client(transport) as client:
        return client.get(f"{base_url()}{path}", params=params, headers=_headers(transport))


def get_json(path: str, params: Params = None, *, transport: httpx.BaseTransport | None = None) -> Any:
    """GET an API path and return its JSON; raises httpx.HTTPStatusError on 4xx/5xx."""
    response = get(path, params, transport=transport)
    response.raise_for_status()
    return response.json()


def post(path: str, json: Any = None, *, params: Params = None, transport: httpx.BaseTransport | None = None) -> httpx.Response:
    with _client(transport) as client:
        return client.post(f"{base_url()}{path}", json=json, params=params, headers=_headers(transport))


def download(url: str, *, max_bytes: int, transport: httpx.BaseTransport | None = None) -> bytes | None:
    """The bytes at a signed archive URL, or None when there are more than
    ``max_bytes`` (reading stops there). A link to OpenAleph's own
    ``/api/2/archive`` is followed on the base URL the Workbench reaches
    OpenAleph at, since OpenAleph builds it on its public address. The
    signature in the URL is the authorization, so no other credentials go
    with it (a signed storage URL refuses a request that carries some)."""
    target = urlsplit(url)
    if target.path.startswith("/api/2/archive"):
        url = f"{base_url()}{target.path}" + (f"?{target.query}" if target.query else "")
    chunks: list[bytes] = []
    total = 0
    with _client(transport) as client, client.stream("GET", url, headers={"User-Agent": USER_AGENT}) as response:
        response.raise_for_status()
        for chunk in response.iter_bytes():
            total += len(chunk)
            if total > max_bytes:
                return None
            chunks.append(chunk)
    return b"".join(chunks)


def get_entity(entity_id: str) -> dict[str, Any] | None:
    """One entity (``GET /api/2/entities/{id}``), or None while OpenAleph has
    not indexed it (it answers 404 until then)."""
    response = get(f"/api/2/entities/{entity_id}")
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else None
