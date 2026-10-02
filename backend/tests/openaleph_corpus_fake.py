"""A small stand-in for OpenAleph 5.3.1's HTTP API, for the corpus tests.

It answers the routes the corpus copy uses with the reply shapes OpenAleph
gave on the Docker stack on 2026-10-02 (see app/services/openaleph_gateway.py),
behind both transports the Workbench uses: a requests adapter for
openaleph-client (bulk writes, deletes, collections) and an httpx transport
for the rest. Entity ids are signed with the collection's namespace exactly
as OpenAleph signs them (followthemoney Namespace.apply).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qsl, urlsplit

import httpx
import requests
from followthemoney import model
from followthemoney.namespace import Namespace
from requests.adapters import BaseAdapter

BASE_URL = "http://openaleph.test"


@dataclass
class FakeOpenAleph:
    collections: dict[str, dict[str, Any]] = field(default_factory=dict)
    # collection id -> signed entity id -> entity as stored (OpenAleph's store)
    entities: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    # collection id -> signed entity id -> entity as the search index shows it
    index: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    # (collection id, entity id) written but not yet visible in the index
    pending: set[tuple[str, str]] = field(default_factory=set)
    index_busy: bool = False
    pruned: list[str] = field(default_factory=list)
    xref_running: bool = False
    xref_requests: list[str] = field(default_factory=list)
    xref_rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    pairwise: list[dict[str, Any]] = field(default_factory=list)
    expand_rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    calls: list[tuple[str, str]] = field(default_factory=list)
    # (method, path prefix) -> status code to answer instead
    fail: dict[tuple[str, str], int] = field(default_factory=dict)
    bulk_batches: list[list[dict[str, Any]]] = field(default_factory=list)

    def add_collection(self, collection_id: str, foreign_id: str, label: str) -> dict[str, Any]:
        collection = {"id": collection_id, "collection_id": collection_id, "foreign_id": foreign_id, "label": label}
        self.collections[collection_id] = collection
        self.entities.setdefault(collection_id, {})
        self.index.setdefault(collection_id, {})
        return collection

    def collection_of(self, entity_id: str) -> str | None:
        """The collection whose search index shows this entity."""
        for collection_id, rows in self.index.items():
            if entity_id in rows:
                return collection_id
        return None

    def finish_indexing(self, *, refresh: bool = True) -> None:
        """The index jobs are done; with ``refresh`` False, Elasticsearch has
        not refreshed yet, so search still shows the old documents."""
        self.index_busy = False
        if refresh:
            self.refresh()

    def refresh(self) -> None:
        for collection_id, entity_id in sorted(self.pending):
            stored = self.entities.get(collection_id, {}).get(entity_id)
            if stored is None:
                self.index.get(collection_id, {}).pop(entity_id, None)
            else:
                self.index.setdefault(collection_id, {})[entity_id] = stored
        self.pending.clear()

    @staticmethod
    def _references(entity: dict[str, Any], entity_id: str) -> bool:
        schema = model.get(str(entity.get("schema")))
        if schema is None:
            return False
        for name, values in (entity.get("properties") or {}).items():
            prop = schema.get(name)
            if prop is not None and prop.type.name == "entity" and entity_id in values:
                return True
        return False

    def _delete(self, collection_id: str, entity_id: str) -> None:
        """Delete as OpenAleph does: from the index and the store, then prune
        every entity the index shows pointing at it (logic/entities.py)."""
        self.index[collection_id].pop(entity_id, None)
        self.entities[collection_id].pop(entity_id, None)
        for other_id, other in list(self.index[collection_id].items()):
            if self._references(other, entity_id):
                self.pruned.append(other_id)
                self._delete(collection_id, other_id)

    # -- the HTTP surface --------------------------------------------------------
    def handle(self, method: str, path: str, params: dict[str, str], body: Any) -> tuple[int, Any]:
        self.calls.append((method, path))
        for (fail_method, prefix), status in self.fail.items():
            if method == fail_method and path.startswith(prefix):
                return status, {"status": "error", "message": f"failed on purpose ({status})"}
        parts = [part for part in path.split("/") if part]
        if parts[:2] != ["api", "2"]:
            return 404, {"status": "error", "message": "This path does not exist."}
        rest = parts[2:]
        if rest == ["metadata"]:
            return 200, {"app": {"title": "OpenAleph"}, "token": "fake-single-user-token"}
        if rest == ["collections"] and method == "POST":
            new_id = str(len(self.collections) + 1)
            return 200, self.add_collection(new_id, f"fake-ns-{new_id}", str((body or {}).get("label") or ""))
        if len(rest) >= 2 and rest[0] == "collections":
            collection = self.collections.get(rest[1])
            if collection is None:
                return 404, {"status": "error", "message": "This path does not exist."}
            if len(rest) == 2 and method == "GET":
                return 200, collection
            if rest[2:] == ["_bulk"] and method == "POST":
                return self._bulk(collection, body or [])
            if rest[2:] == ["status"] and method == "GET":
                return 200, self._status()
            if rest[2:] == ["xref"] and method == "POST":
                self.xref_requests.append(rest[1])
                return 202, {"status": "accepted"}
            if rest[2:] == ["xref"] and method == "GET":
                return 200, self._page(self.xref_rows.get(rest[1], []), params)
        if len(rest) >= 2 and rest[0] == "entities":
            entity_id = rest[1]
            collection_id = self.collection_of(entity_id)
            if collection_id is None:
                return 404, {"status": "error", "message": "This path does not exist."}
            if len(rest) == 2 and method == "DELETE":
                self._delete(collection_id, entity_id)
                return 204, None
            if len(rest) == 2 and method == "GET":
                return 200, self.index[collection_id][entity_id]
            if rest[2:] == ["expand"] and method == "GET":
                rows = self.expand_rows.get(entity_id, [])
                return 200, {"status": "ok", "total": sum(int(r.get("count") or 0) for r in rows), "results": rows}
        if rest == ["search"] and method == "GET":
            rows = self.index.get(str(params.get("filter:collection_id")), {})
            wanted = params.get("filter:entities")
            hits = [row for row in rows.values() if wanted is None or self._references(row, wanted)]
            return 200, {"status": "ok", "total": len(hits), "results": hits}
        if rest == ["profiles", "_pairwise"] and method == "POST":
            judgement = (body or {}).get("judgement")
            if judgement not in {"positive", "negative", "unsure", "no_judgement"}:
                return 400, {"status": "error", "errors": {"judgement": "not one of the judgements"}}
            if self.collection_of(str(body.get("entity_id"))) is None:
                return 404, {"status": "error", "message": "This path does not exist."}
            self.pairwise.append(dict(body))
            return 200, {"status": "ok", "profile_id": f"profile-{len(self.pairwise)}"}
        return 404, {"status": "error", "message": "This path does not exist."}

    def _bulk(self, collection: dict[str, Any], rows: list[dict[str, Any]]) -> tuple[int, Any]:
        namespace = Namespace(collection["foreign_id"])
        self.bulk_batches.append(list(rows))
        for row in rows:
            proxy = namespace.apply(model.get_proxy(row, cleaned=False))
            stored = proxy.to_dict()
            stored["collection_id"] = int(collection["id"]) if str(collection["id"]).isdigit() else collection["id"]
            stored["id"] = str(proxy.id)
            self.entities[collection["id"]][str(proxy.id)] = stored
            self.pending.add((collection["id"], str(proxy.id)))
            self.index_busy = True
        return 204, None

    def _status(self) -> dict[str, Any]:
        tasks = []
        if self.index_busy:
            tasks.append({"name": "aleph.procrastinate.tasks.index_entities", "todo": 0, "doing": 1, "succeeded": 0, "failed": 0})
        if self.xref_running:
            tasks.append({"name": "aleph.procrastinate.tasks.xref_collection", "todo": 1, "doing": 0, "succeeded": 0, "failed": 0})
        if not tasks:
            return {"todo": 0, "doing": 0, "succeeded": 0, "failed": 0, "active": 0, "batches": []}
        active = sum(t["todo"] + t["doing"] for t in tasks)
        return {"todo": 0, "doing": active, "active": active,
                "batches": [{"name": "default", "queues": [{"name": "openaleph", "tasks": tasks}]}]}

    @staticmethod
    def _page(rows: list[dict[str, Any]], params: dict[str, str]) -> dict[str, Any]:
        limit = int(params.get("limit") or 20)
        offset = int(params.get("offset") or 0)
        page = rows[offset:offset + limit]
        more = offset + limit < len(rows)
        return {"status": "ok", "total": len(rows), "limit": limit, "offset": offset, "results": page,
                "next": f"{BASE_URL}/next?offset={offset + limit}" if more else None}

    # -- transports --------------------------------------------------------------
    def httpx_transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content) if request.content else None
            status, payload = self.handle(request.method, request.url.path, dict(request.url.params), body)
            if payload is None:
                return httpx.Response(status)
            return httpx.Response(status, json=payload)

        return httpx.MockTransport(handler)

    def requests_adapter(self) -> "FakeRequestsAdapter":
        return FakeRequestsAdapter(self)

    def client_factory(self) -> Any:
        """openaleph-client's AlephAPI, with its HTTP session answered here."""
        from openaleph_client.api import AlephAPI

        def make() -> Any:
            client = AlephAPI(host=BASE_URL, api_key="test-key", retries=0)
            client.session.mount("http://", self.requests_adapter())
            return client

        return make

    def gateway(self) -> Any:
        from app.services.openaleph_gateway import CorpusGateway

        return CorpusGateway(client_factory=self.client_factory(), transport=self.httpx_transport())


class FakeRequestsAdapter(BaseAdapter):
    """A requests transport adapter answering from a FakeOpenAleph."""

    def __init__(self, server: FakeOpenAleph) -> None:
        super().__init__()
        self.server = server

    def send(self, request: requests.PreparedRequest, stream: bool = False, timeout: Any = None, verify: Any = True,
             cert: Any = None, proxies: Any = None) -> requests.Response:
        url = urlsplit(str(request.url))
        raw = request.body
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        body = json.loads(raw) if raw else None
        status, payload = self.server.handle(str(request.method), url.path, dict(parse_qsl(url.query)), body)
        response = requests.Response()
        response.status_code = status
        response.reason = "OK" if status < 400 else "Error"
        response._content = b"" if payload is None else json.dumps(payload).encode("utf-8")
        response.headers["Content-Type"] = "application/json"
        response.url = str(request.url)
        response.request = request
        return response

    def close(self) -> None:
        return None
