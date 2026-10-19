"""The Drop (Bring in; mockup INTAKE_1): every file brought into a case as one lane
of seven stages, so you can see where each one is and what it is waiting for.

Received → Checked → Read → Split into passages → Files inside → Names & facts →
Ready for you. A stage is done, active, waiting (on an earlier stage), stopped (it
failed, with why), needs_you (proposals wait for a person) or skipped (a file with
nothing inside). An archive or e-mail is one lane; the files found in it are counted
in its "Files inside" stage. Each lane also carries its read receipt.

A read that has not moved for STALL_AFTER says so in words ("No progress for 6 min",
research §3): a running read whose job has not reported since, or a read still queued
while nothing else in the case is being read (the queue is not moving).

history() is the History tab: every drop (an ingestion batch) with what it produced,
and the files brought in one at a time grouped by the day they came."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import (
    BackgroundJob, CheckItem, Document, DocumentChunk, ExtractionCandidate, IngestionBatch, IngestionBatchItem, PatternFlag, WatchlistEntry, WatchlistHit,
)

STAGES = [("received", "Received"), ("checked", "Checked"), ("read", "Read"), ("passages", "Split into passages"),
          ("inside", "Files inside"), ("names", "Names & facts"), ("ready", "Ready for you")]
UNREAD = {"pending", "queued"}
STALL_AFTER = timedelta(minutes=6)


def _stage(key: str, state: str, detail: str = "") -> dict[str, str]:
    return {"key": key, "label": dict(STAGES)[key], "state": state, "detail": detail}


def _kind_of(d: Document) -> str:
    """What the file is, as checked: its extension, else its declared type."""
    if "." in d.filename:
        return d.filename.rsplit(".", 1)[-1].upper()
    return d.mime_type or "file"


def _how_read(locators: list[str]) -> str:
    ocr = sum("(OCR)" in loc for loc in locators)
    if not locators:
        return ""
    if ocr == len(locators):
        return "OCR"
    return f"text and OCR ({ocr} of {len(locators)} passages)" if ocr else "text"


def _seconds(job: BackgroundJob | None) -> int | None:
    if job is None or job.started_at is None or job.finished_at is None:
        return None
    return max(0, round((job.finished_at - job.started_at).total_seconds()))


def _quiet_for(since: datetime | None, now: datetime) -> int | None:
    """Whole minutes without a change, once that is STALL_AFTER or more."""
    if since is None or now - since < STALL_AFTER:
        return None
    return int((now - since).total_seconds() // 60)


def quiet_words(minutes: int) -> str:
    return f"No progress for {minutes} min" if minutes < 120 else f"No progress for {minutes // 60} h"


def drop(db: Session, investigation_id: str, *, now: datetime | None = None) -> dict[str, Any]:
    docs = list(db.scalars(select(Document).where(Document.investigation_id == investigation_id).order_by(Document.created_at)))
    ids = [d.id for d in docs]
    chunks: dict[str, list[tuple[str, int | None]]] = defaultdict(list)
    proposals: dict[str, Counter[str]] = defaultdict(Counter)
    waiting: dict[str, Counter[str]] = defaultdict(Counter)
    # What each proposer's proposals came to (research §05 "revision rate"): by the rule that proposed them.
    answered: dict[str, dict[str, Counter[str]]] = defaultdict(lambda: defaultdict(Counter))
    unsure = 0
    hits: Counter[str] = Counter()
    hit_names: set[str] = set()
    jobs: dict[str, BackgroundJob] = {}
    fed: dict[str, set[str]] = defaultdict(set)
    if ids:
        for doc_id, locator, page in db.execute(select(DocumentChunk.document_id, DocumentChunk.locator, DocumentChunk.page_number)
                                                .where(DocumentChunk.document_id.in_(ids))):
            chunks[doc_id].append((locator or "", page))
        rule_of = ExtractionCandidate.payload["rationale"]["rule"].as_string()
        for doc_id, kind, status, confidence, rule in db.execute(select(ExtractionCandidate.document_id, ExtractionCandidate.candidate_type,
                                                                        ExtractionCandidate.review_status, ExtractionCandidate.confidence, rule_of)
                                                                 .where(ExtractionCandidate.document_id.in_(ids))):
            proposals[doc_id][kind] += 1
            answered[doc_id][rule or ""][status] += 1
            if status == "proposed":
                waiting[doc_id][kind] += 1
                unsure += (confidence or 0) < 0.8
        for hit_doc_id, name in db.execute(select(WatchlistHit.document_id, WatchlistEntry.query)
                                           .join(WatchlistEntry, WatchlistEntry.id == WatchlistHit.entry_id)
                                           .where(WatchlistHit.document_id.in_(ids))):
            hits[hit_doc_id or ""] += 1
            hit_names.add(name)
        for row in db.scalars(select(BackgroundJob).where(BackgroundJob.subject_id.in_(ids), BackgroundJob.kind == "extract_document")
                              .order_by(BackgroundJob.created_at)):
            jobs[row.subject_id or ""] = row  # the latest one wins
        for fed_doc_id, name in db.execute(select(CheckItem.document_id, PatternFlag.indicator_id)
                                           .join(PatternFlag, PatternFlag.id == CheckItem.flag_id)
                                           .where(CheckItem.document_id.in_(ids))):
            fed[fed_doc_id or ""].add(name)

    children: dict[str, list[Document]] = defaultdict(list)
    for d in docs:
        if d.parent_document_id:
            children[d.parent_document_id].append(d)
    first_of: dict[str, str] = {}
    for d in docs:
        first_of.setdefault(d.sha256, d.id)
    queued = [d.id for d in docs if d.extraction_status in UNREAD]
    now = now or utcnow_naive()
    anyone_reading = any(d.extraction_status == "extracting" for d in docs)

    def stalled(d: Document, job: BackgroundJob | None) -> int | None:
        if job is None:
            return None
        if d.extraction_status == "extracting" and job.status == "running":
            return _quiet_for(job.updated_at or job.started_at, now)
        if d.extraction_status in UNREAD and job.status == "queued" and not anyone_reading:
            return _quiet_for(job.created_at, now)
        return None

    def lane(d: Document) -> dict[str, Any]:
        job = jobs.get(d.id)
        own_chunks = chunks.get(d.id, [])
        status = d.extraction_status
        read_done = status == "complete"
        original = first_of.get(d.sha256)
        same = original if original and original != d.id else None
        quiet = stalled(d, job)
        stages = [_stage("received", "done", d.created_at.strftime("%d %b %H:%M") if d.created_at else ""),
                  _stage("checked", "done", "= same" if same else _kind_of(d))]
        if status == "failed":
            stages.append(_stage("read", "stopped", d.extraction_error or "Could not be read"))
        elif quiet is not None:
            stages.append(_stage("read", "active" if status == "extracting" else "waiting", quiet_words(quiet)))
        elif status == "extracting":
            stages.append(_stage("read", "active", (job.message if job and job.status == "running" and job.message else "Reading")))
        elif status in UNREAD:
            stages.append(_stage("read", "waiting", "In the queue"))
        else:
            stages.append(_stage("read", "done", _how_read([loc for loc, _ in own_chunks]) or "read"))
        kids = children.get(d.id, [])
        if read_done and own_chunks:
            stages.append(_stage("passages", "done", f"{len(own_chunks)} passage{'s' if len(own_chunks) != 1 else ''}"))
        elif read_done:
            # An archive or mailbox holds its text in the files inside it.
            stages.append(_stage("passages", "skipped", "In the files inside") if kids else _stage("passages", "stopped", "No text found"))
        else:
            # A file that could not be read stops at Read (mockup INTAKE_1); the stages after it were never reached.
            stages.append(_stage("passages", "waiting"))
        if kids:
            kids_read = sum(k.extraction_status == "complete" for k in kids)
            kids_failed = sum(k.extraction_status == "failed" for k in kids)
            state = "done" if kids_read == len(kids) else "stopped" if kids_failed and kids_read + kids_failed == len(kids) else "active"
            stages.append(_stage("inside", state, f"{kids_read} of {len(kids)} read" + (f", {kids_failed} could not be" if kids_failed else "")))
        else:
            stages.append(_stage("inside", "skipped", "None"))
        found = sum(proposals[d.id].values()) + sum(sum(proposals[k.id].values()) for k in kids)
        stages.append(_stage("names", "done" if read_done else "waiting", f"{found} found" if read_done else ""))
        left = sum(waiting[d.id].values()) + sum(sum(waiting[k.id].values()) for k in kids)
        stages.append(_stage("ready", "needs_you" if left else ("done" if read_done else "waiting"),
                             f"{left} wait for you" if left else ("Nothing waits" if read_done else "")))
        issues = list(d.extraction_issues or [])
        seconds = _seconds(job) if read_done else None
        # The line under the file's name (mockup INTAKE_1): what happened to it, in a few words.
        if same:
            note = "Already in the case: same fingerprint"
        elif status == "failed":
            note = d.extraction_error or "Could not be read"
        elif quiet is not None:
            note = quiet_words(quiet) + (" · it may have stopped" if status == "extracting" else " · nothing is being read")
        elif status == "extracting":
            note = (job.message if job and job.message else "Reading")
        elif status in UNREAD:
            place = queued.index(d.id) + 1 if d.id in queued else 0
            note = "Waiting its turn" + (f" · {place}{'st' if place == 1 else 'nd' if place == 2 else 'rd' if place == 3 else 'th'} in line" if place else "")
        elif issues:
            note = issues[0]
        else:
            note = "Read cleanly" + (f" · {seconds} s" if seconds is not None else "")
        pages = {p for _, p in own_chunks if p is not None}
        return {
            "document_id": d.id, "filename": d.filename, "stages": stages, "note": note, "same_as": same,
            "job_id": job.id if job is not None and job.status in {"queued", "running"} else None,
            "retry_job_id": job.id if job is not None and job.status == "failed" else None,
            "problem": status == "failed" or any(s["state"] == "stopped" for s in stages),
            "in_progress": status != "failed" and any(s["state"] in {"active", "waiting"} for s in stages),
            "issues": issues, "waiting": left, "seconds": seconds, "stalled_minutes": quiet,
            "children": [lane(k) for k in kids],
            "receipt": {
                "fingerprint": d.sha256, "pages": len(pages) or None, "how_read": _how_read([loc for loc, _ in own_chunks]) or None,
                "passages": len(own_chunks), "proposals": dict(proposals[d.id]), "waiting": dict(waiting[d.id]),
                "watchlist_hits": hits[d.id], "flags_fed": sorted(fed[d.id]),
                "files_inside": len(kids),
                # An accept the reporter corrected first (a name retyped) is not recorded apart from a plain accept.
                "by_proposer": [{"rule": rule, "accepted": n["accepted"], "rejected": n["rejected"], "waiting": n["proposed"]}
                                for rule, n in sorted(answered[d.id].items())],
            },
        }

    lanes = [lane(d) for d in docs if not d.parent_document_id]
    ready: Counter[str] = Counter()
    for counts in waiting.values():
        ready.update(counts)
    done_at: Counter[str] = Counter()
    for one in lanes:
        for st in one["stages"]:
            if st["state"] in {"done", "needs_you"}:
                done_at[st["key"]] += 1
    return {
        "investigation_id": investigation_id, "stages": [{"key": k, "label": label} for k, label in STAGES], "lanes": lanes,
        "totals": {"files": len(lanes), "files_inside": sum(len(v) for v in children.values()),
                   "read": sum(1 for d in docs if d.extraction_status == "complete"), "unread": sum(1 for d in docs if d.extraction_status in UNREAD | {"extracting"}),
                   "reading": sum(1 for d in docs if d.extraction_status == "extracting"),
                   "problems": sum(1 for lane in lanes if lane["problem"]), "passages": sum(len(v) for v in chunks.values()),
                   "waiting": sum(ready.values()), "by_stage": {k: done_at[k] for k, _ in STAGES},
                   "started_at": docs[0].created_at if docs else None},
        "ready_for_you": dict(ready),
        "ready_from": sum(1 for counts in waiting.values() if sum(counts.values())),
        "ready_unsure": unsure,
        "watchlist": {"hits": sum(hits.values()), "names": sorted(hit_names)},
    }


def changes(seen: dict[str, str], snapshot: dict[str, Any], dump: Any) -> list[tuple[str, Any]]:
    """What the per-file event stream sends for one look at The Drop (ADR-0014): one `lane` event for
    each file whose lane changed since ``seen`` (its files inside travel with it), `gone` for a file no
    longer there, then one `summary` (everything but the lanes, with their order) when anything
    changed. ``seen`` maps each file to its lane as last sent and is updated in place; ``dump`` turns a
    value into the JSON text compared and sent."""
    out: list[tuple[str, Any]] = []
    order = [lane["document_id"] for lane in snapshot["lanes"]]
    for lane in snapshot["lanes"]:
        text = dump(lane)
        if seen.get(lane["document_id"]) != text:
            seen[lane["document_id"]] = text
            out.append(("lane", lane))
    for doc_id in [k for k in seen if not k.startswith("#") and k not in order]:
        del seen[doc_id]
        out.append(("gone", {"document_id": doc_id}))
    summary = {**{k: v for k, v in snapshot.items() if k != "lanes"}, "order": order}
    text = dump(summary)
    if out or seen.get("#summary") != text:
        seen["#summary"] = text
        out.append(("summary", summary))
    return out


def history(db: Session, investigation_id: str) -> dict[str, Any]:
    """Every drop, newest first, with what it produced (the History tab).

    A drop is an ingestion batch: what happened to each file sent (saved, already in the case, refused)
    and, from the saved files and the files found inside them, how many were read, how many could not
    be, the passages made and the proposals found, accepted and still waiting. Files that came in
    without a batch (one at a time, or before The Drop made one per drop) are grouped by the day
    they came, so nothing brought in is missing from the history."""
    docs = list(db.scalars(select(Document).where(Document.investigation_id == investigation_id)))
    by_id = {d.id: d for d in docs}
    children: dict[str, list[str]] = defaultdict(list)
    for d in docs:
        if d.parent_document_id:
            children[d.parent_document_id].append(d.id)
    passages: Counter[str] = Counter()
    found: dict[str, Counter[str]] = defaultdict(Counter)
    accepted: Counter[str] = Counter()
    waiting: Counter[str] = Counter()
    if docs:
        for doc_id, n in db.execute(select(DocumentChunk.document_id, func.count()).where(DocumentChunk.document_id.in_(list(by_id)))
                                    .group_by(DocumentChunk.document_id)):
            passages[doc_id] = int(n)
        for doc_id, kind, status in db.execute(select(ExtractionCandidate.document_id, ExtractionCandidate.candidate_type,
                                                      ExtractionCandidate.review_status).where(ExtractionCandidate.document_id.in_(list(by_id)))):
            found[doc_id][kind] += 1
            accepted[doc_id] += status == "accepted"
            waiting[doc_id] += status == "proposed"

    def family(doc_id: str) -> list[str]:
        out = [doc_id]
        for kid in children.get(doc_id, []):
            out.extend(family(kid))
        return out

    def produced(top: list[str]) -> dict[str, Any]:
        every = [x for t in top for x in family(t)]
        kinds: Counter[str] = Counter()
        for x in every:
            kinds.update(found[x])
        return {"read": sum(by_id[x].extraction_status == "complete" for x in every),
                "problems": sum(by_id[x].extraction_status == "failed" for x in every),
                "in_progress": sum(by_id[x].extraction_status in UNREAD | {"extracting"} for x in every),
                "files_inside": len(every) - len(top), "passages": sum(passages[x] for x in every), "proposals": dict(kinds),
                "accepted": sum(accepted[x] for x in every), "waiting": sum(waiting[x] for x in every)}

    entries: list[dict[str, Any]] = []
    in_a_batch: set[str] = set()
    batches = list(db.scalars(select(IngestionBatch).where(IngestionBatch.investigation_id == investigation_id)))
    items: dict[str, list[IngestionBatchItem]] = defaultdict(list)
    if batches:
        for item in db.scalars(select(IngestionBatchItem).where(IngestionBatchItem.batch_id.in_([b.id for b in batches]))
                               .order_by(IngestionBatchItem.position)):
            items[item.batch_id].append(item)
    for b in batches:
        mine = items.get(b.id, [])
        saved = [str(i.document_id) for i in mine if i.outcome == "saved" and i.document_id in by_id]
        in_a_batch.update(saved)
        entries.append({"id": b.id, "batch_id": b.id, "label": b.label, "created_at": b.created_at, "document_ids": saved, "one_at_a_time": False,
                        "files": len(saved), "duplicates": sum(i.outcome == "duplicate" for i in mine),
                        "refused": sum(i.outcome == "refused" for i in mine), **produced(saved)})
    days: dict[str, list[Document]] = defaultdict(list)
    for d in docs:
        if not d.parent_document_id and d.id not in in_a_batch:
            days[d.created_at.strftime("%Y-%m-%d")].append(d)
    for day, group in days.items():
        group.sort(key=lambda d: d.created_at)
        top = [d.id for d in group]
        entries.append({"id": f"day:{day}", "batch_id": None, "label": group[0].filename + (f" and {len(group) - 1} more" if len(group) > 1 else ""),
                        "created_at": group[0].created_at, "document_ids": top, "one_at_a_time": True,
                        "files": len(top), "duplicates": 0, "refused": 0, **produced(top)})
    entries.sort(key=lambda e: e["created_at"], reverse=True)
    return {"investigation_id": investigation_id, "drops": entries}
