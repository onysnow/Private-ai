"""A fake OpenAleph for unit tests (ADR-0006).

It answers the API routes the Workbench calls, in the reply shapes OpenAleph
5.3.1 returned on the sandbox stack on 2026-10-02 (the probes behind
app/services/openaleph_analysis.py and openaleph_status.py):

- ``GET /api/2/metadata`` -> the single-user ``token``;
- ``GET /api/2/entities/{id}`` -> the entity, or 404 while not indexed;
- ``GET /api/2/collections/{id}/status`` -> openaleph-procrastinate's
  DatasetStatus: zeros and no batches when idle, job counts per batch and
  queue while active;
- ``POST /api/2/entities/{id}/analyze`` -> 202, and the analysis results
  appear on the entity after the queue has been seen busy once;
- ``GET /api/2/search`` with ``filter:schema=Page`` and
  ``filter:properties.document`` -> the document's pages.

It also stands in for openaleph-client's ``AlephAPI`` (``create_collection``,
``ingest_upload``), so ``sync_document_to_openaleph`` runs for real against
it. Install it with ``install(monkeypatch)``; every request is kept in
``requests``.
"""

from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any, Callable

import httpx

IDLE: dict[str, Any] = {"todo": 0, "doing": 0, "succeeded": 0, "failed": 0, "aborted": 0, "aborting": 0,
                        "cancelled": 0, "name": "collection_7", "batches": []}


def busy_status(*queues: str, todo: int = 1, doing: int = 0) -> dict[str, Any]:
    """A status reply with the named queues still working."""
    rows = [{"name": queue, "todo": todo, "doing": doing, "succeeded": 1, "failed": 0, "aborted": 0,
             "aborting": 0, "cancelled": 0, "tasks": []} for queue in queues]
    return {**IDLE, "todo": todo * len(queues), "doing": doing * len(queues),
            "batches": [{"name": "1:batch", "queues": rows}]}


def entity(entity_id: str, schema: str = "PlainText", status: str | None = "success", **properties: Any) -> dict[str, Any]:
    props: dict[str, Any] = {"processingStatus": [status]} if status else {}
    for key, value in properties.items():
        props[key] = value if isinstance(value, list) else [value]
    return {"id": entity_id, "schema": schema, "properties": props, "collection": {"id": "7"}}


def page(document_id: str, number: int, text: str) -> dict[str, Any]:
    return {"id": f"{document_id}-page-{number}", "schema": "Page",
            "properties": {"index": [str(number)], "bodyText": [text], "document": [document_id]}}


class FakeOpenAleph:
    def __init__(self) -> None:
        self.collections: dict[str, dict[str, Any]] = {}
        self.entities: dict[str, dict[str, Any]] = {}
        # Scripted replies for GET /entities/{id}, consumed in order before
        # falling back to self.entities (None means "not indexed yet").
        self.scripted: dict[str, list[dict[str, Any] | None]] = {}
        self.pages: dict[str, list[dict[str, Any]]] = {}
        # Scripted status replies, consumed in order; then idle.
        self.statuses: list[dict[str, Any]] = []
        # Properties ftm-analyze adds when asked to analyse an entity.
        self.analysis: dict[str, dict[str, list[str]]] = {}
        self.analyze_reply = 202
        self.fail: dict[str, int] = {}          # path -> HTTP status to answer instead
        self.requests: list[httpx.Request] = []
        self.uploads: list[tuple[str, Path, dict[str, Any]]] = []
        self._pending_analysis: list[str] = []
        self.transport = httpx.MockTransport(self.handle)

    # --- openaleph-client's AlephAPI, as sync_document_to_openaleph uses it --
    def client_factory(self) -> "FakeOpenAleph":
        return self

    def create_collection(self, data: dict[str, Any]) -> dict[str, Any]:
        collection = {"id": str(7 + len(self.collections)), "foreign_id": f"fake-{len(self.collections)}", "label": data["label"]}
        self.collections[collection["id"]] = collection
        return collection

    def ingest_upload(self, *, collection_id: str, file_path: Path, metadata: dict[str, Any],
                      sync: bool = False, index: bool = True) -> dict[str, Any]:
        entity_id = f"{len(self.uploads) + 1}.upload"
        self.uploads.append((collection_id, Path(file_path), metadata))
        if entity_id not in self.entities:
            text = Path(file_path).read_bytes().decode("utf-8", "replace")
            self.entities[entity_id] = entity(entity_id, fileName=Path(file_path).name, bodyText=text)
        return {"status": "ok", "id": entity_id}

    # --- the HTTP API ---------------------------------------------------------
    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path in self.fail:
            return httpx.Response(self.fail[path], json={"status": "error"})
        if path == "/api/2/metadata":
            return httpx.Response(200, json={"app": {"title": "OpenAleph"}, "token": "fake-token"})
        parts = path.strip("/").split("/")
        if parts[:3] == ["api", "2", "collections"] and len(parts) == 5 and parts[4] == "status":
            if self.statuses:
                return httpx.Response(200, json=self.statuses.pop(0))
            # Idle: whatever analysis was queued has been written and indexed.
            self.deliver_pending_analysis()
            return httpx.Response(200, json=IDLE)
        if parts[:3] == ["api", "2", "entities"] and len(parts) == 5 and parts[4] == "analyze" and request.method == "POST":
            return self._analyze(parts[3])
        if parts[:3] == ["api", "2", "entities"] and len(parts) == 4 and request.method == "GET":
            return self._entity(parts[3])
        if path == "/api/2/search":
            return self._search(request)
        return httpx.Response(404, json={"status": "error", "message": f"fake has no {request.method} {path}"})

    def _entity(self, entity_id: str) -> httpx.Response:
        script = self.scripted.get(entity_id)
        if script:
            reply = script.pop(0)
            return httpx.Response(200, json=reply) if reply is not None else httpx.Response(404, json={"status": "error"})
        found = self.entities.get(entity_id)
        return httpx.Response(200, json=found) if found is not None else httpx.Response(404, json={"status": "error"})

    def _analyze(self, entity_id: str) -> httpx.Response:
        if self.analyze_reply != 202:
            return httpx.Response(self.analyze_reply, json={"status": "error"})
        if entity_id not in self.entities:
            return httpx.Response(404, json={"status": "error"})
        self.queue_analysis(entity_id, self.analysis.get(entity_id, {}))
        return httpx.Response(202)

    def queue_analysis(self, entity_id: str, properties: dict[str, list[str]], busy_checks: int = 1) -> None:
        """ftm-analyze has a job for the entity: the collection reports it
        busy ``busy_checks`` times, then idle with the results on the entity,
        as on the real stack."""
        self.analysis[entity_id] = properties
        self.statuses[:0] = [busy_status("analyze") for _ in range(busy_checks)]
        self._pending_analysis.append(entity_id)

    def deliver_pending_analysis(self) -> None:
        for entity_id in self._pending_analysis:
            props = self.entities[entity_id]["properties"]
            for key, values in self.analysis.get(entity_id, {}).items():
                props[key] = list(dict.fromkeys([*props.get(key, []), *values]))
        self._pending_analysis = []

    def _search(self, request: httpx.Request) -> httpx.Response:
        params = request.url.params
        if params.get("filter:schema") == "Page":
            document_id = params.get("filter:properties.document", "")
            rows = self.pages.get(document_id, [])
            return httpx.Response(200, json={"results": rows, "total": len(rows)})
        return httpx.Response(200, json={"results": [], "total": 0})

    def calls(self, method: str, path: str) -> list[httpx.Request]:
        return [r for r in self.requests if r.method == method and r.url.path == path]

    def install(self, monkeypatch: Any) -> "FakeOpenAleph":
        """Put this fake behind every Workbench call to OpenAleph."""
        from app.core.config import settings
        from app.services import openaleph_corpus, openaleph_http

        monkeypatch.setattr(settings, "openaleph_enabled", True)
        monkeypatch.setattr(settings, "openaleph_base_url", "http://openaleph.test")
        monkeypatch.setattr(settings, "openaleph_api_key", "")
        monkeypatch.setattr(openaleph_corpus, "_single_user_tokens", {})
        monkeypatch.setattr(openaleph_http, "transport", self.transport)
        real_sync = openaleph_corpus.sync_document_to_openaleph
        monkeypatch.setattr(openaleph_corpus, "sync_document_to_openaleph",
                            functools.partial(real_sync, client_factory=self.client_factory))
        real_ensure = openaleph_corpus.ensure_openaleph_collection
        monkeypatch.setattr(openaleph_corpus, "ensure_openaleph_collection",
                            functools.partial(real_ensure, client_factory=self.client_factory))
        return self


def no_sleep(clock: list[float]) -> Callable[[float], None]:
    """A sleep that advances a fake clock instead of waiting."""
    def sleep(seconds: float) -> None:
        clock[0] += seconds
    return sleep


def body(request: httpx.Request) -> Any:
    return json.loads(request.content or b"null")
