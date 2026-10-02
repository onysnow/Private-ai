"""Where OpenAleph's work on an investigation's collection stands (ADR-0006).

``GET /api/2/collections/{id}/status`` (``aleph/views/collections_api.py``)
returns openaleph-procrastinate's ``DatasetStatus`` (its ``model.py``) for the
collection: job counts per batch, per queue and per task. Read in OpenAleph
5.3.1, not assumed:

- Only an *active* collection is reported, one with at least one job to do
  or in progress (``STATUS_SUMMARY_ACTIVE`` in
  ``openaleph_procrastinate/manage/sql.py``). An idle collection answers all
  zeros and no batches.
- While it is active, every job of the collection still in the queue table
  is counted, finished ones included.
- Queue names come from ``DeferSettings`` (``openaleph_procrastinate/settings.py``):
  ``ingest`` (ingest-file reads files), ``analyze`` (ftm-analyze finds
  names), ``openaleph`` (OpenAleph indexes for search, among other tasks),
  ``openaleph-management``, and the optional services.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services import openaleph_http

# Plain names for OpenAleph's queues, in the order a document passes them.
STAGE_LABELS: dict[str, str] = {
    "ingest": "Reading files",
    "analyze": "Finding names",
    "openaleph": "Indexing for search",
    "translate": "Translating",
    "transcribe": "Transcribing",
    "geocode": "Placing addresses on the map",
    "assets": "Collecting images",
    "vectorize": "Preparing similarity search",
    "openaleph-management": "OpenAleph housekeeping",
}

# A document's names are final once ftm-analyze has nothing left to do and
# the indexer has written what it found: ftm_analyze/tasks.py defers the
# index job before its own job is marked done, so at every moment one of the
# two queues still shows the work.
ANALYSIS_QUEUES = ("analyze", "openaleph")


@dataclass(frozen=True)
class StageStatus:
    queue: str
    label: str
    pending: int     # waiting to start ("todo")
    running: int     # in progress ("doing")
    finished: int    # done, whether it worked or not
    failed: int      # done and failed (failed, aborted)


def fetch_collection_status(collection_id: str) -> dict[str, Any]:
    """OpenAleph's status reply for one collection; raises httpx errors."""
    payload = openaleph_http.get_json(f"/api/2/collections/{collection_id}/status")
    return payload if isinstance(payload, dict) else {}


def _count(row: dict[str, Any], *keys: str) -> int:
    total = 0
    for key in keys:
        value = row.get(key)
        if isinstance(value, int):
            total += value
    return total


def stages(status: dict[str, Any]) -> list[StageStatus]:
    """Job counts per queue, added up across the collection's batches.

    Known queues come first in pipeline order, then any other queue by name.
    """
    totals: dict[str, dict[str, int]] = {}
    batches = status.get("batches")
    for batch in batches if isinstance(batches, list) else []:
        queues = batch.get("queues") if isinstance(batch, dict) else None
        for queue in queues if isinstance(queues, list) else []:
            if not isinstance(queue, dict) or not isinstance(queue.get("name"), str):
                continue
            row = totals.setdefault(queue["name"], {"pending": 0, "running": 0, "finished": 0, "failed": 0})
            row["pending"] += _count(queue, "todo")
            row["running"] += _count(queue, "doing", "aborting")
            row["finished"] += _count(queue, "succeeded", "failed", "aborted", "cancelled")
            row["failed"] += _count(queue, "failed", "aborted")
    order = list(STAGE_LABELS)
    names = sorted(totals, key=lambda name: (order.index(name) if name in order else len(order), name))
    return [StageStatus(queue=name, label=STAGE_LABELS.get(name, name), **totals[name]) for name in names]


def is_active(status: dict[str, Any]) -> bool:
    return any(stage.pending or stage.running for stage in stages(status))


def analysis_settled(status: dict[str, Any]) -> bool:
    """True when no name-finding or indexing work is waiting or running."""
    return not any(stage.pending or stage.running for stage in stages(status) if stage.queue in ANALYSIS_QUEUES)
