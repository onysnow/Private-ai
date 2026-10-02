"""The OpenAleph routes the corpus copy uses (ADR-0006, Wave B), in one place.

openaleph-client 1.1.4 has methods for three of them, and they are used:
``write_entities`` (POST /api/2/collections/{id}/_bulk), ``delete_entity``
(DELETE /api/2/entities/{id}) and ``get_collection``. It has none for the
others -- a collection's processing status, cross-referencing, pairwise
match judgements and expand -- so those go through httpx with the same
authorization headers (``openaleph_auth_headers``). Every reply shape and
parameter here was read from OpenAleph 5.3.1's own code
(aleph/views/*.py in ghcr.io/openaleph/openaleph:5.3.1) and checked against
the running stack on 2026-10-02.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

import httpx

from app.core.config import settings
from app.services.openaleph_corpus import openaleph_auth_headers

logger = logging.getLogger("journalism.openaleph")

# Task names in OpenAleph's own queue (openaleph_procrastinate/settings.py,
# DeferSettings; aleph/procrastinate/queues.py for index_entities_by_ids).
# While any of the first three is waiting or running for a collection, its
# search index does not yet show every entity written to it.
INDEX_TASKS = frozenset({
    "aleph.procrastinate.tasks.index_entities",
    "aleph.procrastinate.tasks.index_entities_by_ids",
    "aleph.procrastinate.tasks.reindex_collection",
})
XREF_TASK = "aleph.procrastinate.tasks.xref_collection"

# Pairwise judgements OpenAleph accepts (aleph/validation/schema/entityset.yml,
# Judgement; aleph/model/entityset.py).
JUDGEMENTS = frozenset({"positive", "negative", "unsure", "no_judgement"})

# GET .../xref pages through OpenAleph's search parser, which caps
# offset + limit at 9999 (openaleph_search/settings.py MAX_PAGE).
XREF_PAGE_SIZE = 200
XREF_RESULT_CAP = 5000


class OpenAlephNotFound(Exception):
    """OpenAleph answered 404: the collection or entity is not there."""


def corpus_client() -> Any:
    """An openaleph-client AlephAPI for the corpus jobs.

    Like ``openaleph_corpus._client_factory``, but with two in-call retries
    instead of the library's default five (OPENALEPH_MAX_TRIES): its back-off
    sleeps 2, 4, 8, 16, 32 s between tries (openaleph_client/util.py backoff),
    and a corpus job that cannot reach OpenAleph is better tried again later
    by its own schedule (app/jobs/corpus.py) than held for a minute.
    """
    try:
        from openaleph_client.api import AlephAPI
    except ImportError as exc:  # pragma: no cover - deployment dependency guard
        raise RuntimeError("openaleph-client is not installed") from exc
    client = AlephAPI(host=settings.openaleph_base_url, api_key=settings.openaleph_api_key or None, retries=2)
    if not settings.openaleph_api_key:
        client.session.headers.update(openaleph_auth_headers())
    return client


def http_status(exc: BaseException) -> int | None:
    """The HTTP status inside an openaleph-client AlephException, if any."""
    status = getattr(exc, "status", None)
    return status if isinstance(status, int) else None


def active_tasks(status: dict[str, Any] | None) -> dict[str, int]:
    """Waiting plus running jobs per task name, from GET .../status.

    The reply is openaleph_procrastinate's DatasetStatus: batches -> queues
    -> tasks, each with todo/doing counts. It lists only datasets with work
    to do (manage/status.py get_dataset_status, active_only=True); an idle
    collection answers with zero counts and no batches.
    """
    counts: dict[str, int] = {}
    for batch in (status or {}).get("batches") or []:
        for queue in batch.get("queues") or []:
            for task in queue.get("tasks") or []:
                name = str(task.get("name") or "")
                active = int(task.get("todo") or 0) + int(task.get("doing") or 0)
                if name and active:
                    counts[name] = counts.get(name, 0) + active
    return counts


class CorpusGateway:
    """OpenAleph as the corpus jobs see it. Tests pass a client factory and
    an httpx transport that answer like OpenAleph."""

    def __init__(
        self,
        *,
        client_factory: Callable[[], Any] = corpus_client,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.client_factory = client_factory
        self._transport = transport
        self._client: Any = None

    # -- openaleph-client ------------------------------------------------------
    @property
    def client(self) -> Any:
        if self._client is None:
            self._client = self.client_factory()
        return self._client

    def get_collection(self, collection_id: str) -> dict[str, Any]:
        try:
            reply = self.client.get_collection(collection_id)
        except Exception as exc:
            if http_status(exc) == 404:
                raise OpenAlephNotFound(f"OpenAleph has no collection {collection_id}") from exc
            raise
        return reply if isinstance(reply, dict) else {}

    def write_entities(self, collection_id: str, entities: list[dict[str, Any]]) -> None:
        """POST .../_bulk in chunks (openaleph-client write_entities, 1000 a chunk).

        OpenAleph signs each id and every entity reference with the
        collection's namespace (aleph/logic/processing.py _massage_entities ->
        collection.ns.apply), writes them to its store and queues indexing.
        Writing an id again replaces what was written before under it (ftmq
        BulkLoader upserts on id, origin and fragment).
        """
        if entities:
            self.client.write_entities(collection_id, entities)

    def delete_entity(self, entity_id: str) -> bool:
        """DELETE /api/2/entities/{id}; False when OpenAleph no longer has it.

        OpenAleph finds the entity in its search index (views/util.py
        get_index_entity), so an entity written but not yet indexed answers 404
        and would appear afterwards -- callers delete only while the
        collection's indexing is idle (``index_busy``).
        """
        try:
            self.client.delete_entity(entity_id)
        except Exception as exc:
            if http_status(exc) == 404:
                return False
            raise
        return True

    # -- httpx -------------------------------------------------------------------
    def _http(self) -> httpx.Client:
        headers = {"User-Agent": "JournalismWorkbench/1.24", **openaleph_auth_headers(self._transport)}
        return httpx.Client(
            base_url=settings.openaleph_base_url.rstrip("/"),
            headers=headers,
            timeout=max(settings.openaleph_probe_timeout_seconds, 30.0),
            follow_redirects=True,
            transport=self._transport,
        )

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        with self._http() as http:
            response = http.get(path, params=params)
        if response.status_code == 404:
            raise OpenAlephNotFound(f"OpenAleph answered 404 for {path}")
        response.raise_for_status()
        return response.json()

    def collection_status(self, collection_id: str) -> dict[str, Any]:
        """GET /api/2/collections/{id}/status (views/collections_api.py status)."""
        reply = self._get(f"/api/2/collections/{collection_id}/status")
        return reply if isinstance(reply, dict) else {}

    def index_busy(self, collection_id: str) -> bool:
        return any(name in INDEX_TASKS for name in active_tasks(self.collection_status(collection_id)))

    def referencing_entities(self, collection_id: str, entity_id: str) -> list[str]:
        """Ids of the collection's entities that the search index shows
        pointing at ``entity_id`` -- the very query OpenAleph's prune runs
        before deleting them along with it (openaleph_search/index/entities.py
        iter_adjacent: a term filter on ``entities``). Search covers Things
        unless told otherwise (query/queries.py EntitiesQuery.schemata), and
        relationships are Intervals, so both are asked for."""
        params: list[tuple[str, str | int | float | bool | None]] = [
            ("filter:collection_id", collection_id), ("filter:entities", entity_id),
            ("filter:schemata", "Thing"), ("filter:schemata", "Interval"), ("limit", 100),
        ]
        with self._http() as http:
            response = http.get("/api/2/search", params=params)
        response.raise_for_status()
        reply = response.json()
        return [str(row.get("id")) for row in (reply or {}).get("results") or [] if isinstance(row, dict) and row.get("id")]

    def cross_reference_running(self, collection_id: str) -> bool:
        return XREF_TASK in active_tasks(self.collection_status(collection_id))

    def start_cross_reference(self, collection_id: str) -> None:
        """POST /api/2/collections/{id}/xref: queues xref_collection and
        answers 202 (views/xref_api.py generate)."""
        with self._http() as http:
            response = http.post(f"/api/2/collections/{collection_id}/xref")
        if response.status_code == 404:
            raise OpenAlephNotFound(f"OpenAleph has no collection {collection_id}")
        response.raise_for_status()

    def cross_reference_results(self, collection_id: str) -> list[dict[str, Any]]:
        """Every match of the collection's last cross-referencing run.

        GET /api/2/collections/{id}/xref (views/xref_api.py index) answers
        pages of matches with score above 0.5 (search/query.py XrefQuery
        SCORE_CUTOFF), each carrying the full ``entity`` and ``match`` and the
        pair's ``judgement``.
        """
        rows: list[dict[str, Any]] = []
        offset = 0
        while offset < XREF_RESULT_CAP:
            reply = self._get(f"/api/2/collections/{collection_id}/xref", {"limit": XREF_PAGE_SIZE, "offset": offset})
            page = [row for row in (reply or {}).get("results") or [] if isinstance(row, dict)]
            rows.extend(page)
            if not page or not reply.get("next"):
                break
            offset += len(page)
        return rows[:XREF_RESULT_CAP]

    def decide_pairwise(self, entity_id: str, match_id: str, judgement: str) -> str | None:
        """POST /api/2/profiles/_pairwise (views/profiles_api.py pairwise).

        ``entity_id`` must be the entity in the collection being judged from;
        OpenAleph puts it and the match in a profile of that collection with
        the given judgement (logic/profiles.py decide_pairwise) and answers
        with the profile id.
        """
        if judgement not in JUDGEMENTS:
            raise ValueError(f"OpenAleph has no judgement {judgement!r}")
        with self._http() as http:
            response = http.post("/api/2/profiles/_pairwise",
                                 json={"entity_id": entity_id, "match_id": match_id, "judgement": judgement})
        if response.status_code == 404:
            raise OpenAlephNotFound("OpenAleph no longer has one of the two entities")
        response.raise_for_status()
        reply = response.json()
        profile_id = reply.get("profile_id") if isinstance(reply, dict) else None
        return str(profile_id) if profile_id else None

    def expand(self, entity_id: str, *, limit: int) -> list[dict[str, Any]]:
        """GET /api/2/entities/{id}/expand (views/entities_api.py expand).

        Each result is one property of the entity: ``property``, ``count`` and
        ``entities`` -- the entities linked through it, edge entities (an
        Ownership, a Directorship) and their far ends alike
        (logic/expand.py expand_proxies; the far ends are fetched when
        ``limit`` is above zero).
        """
        reply = self._get(f"/api/2/entities/{entity_id}/expand", {"limit": max(1, limit)})
        return [row for row in (reply or {}).get("results") or [] if isinstance(row, dict)]
