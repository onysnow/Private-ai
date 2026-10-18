"""The Drop (Bring in; mockup INTAKE_1): every file brought into a case as one lane
of seven stages, so you can see where each one is and what it is waiting for.

Received → Checked → Read → Split into passages → Files inside → Names & facts →
Ready for you. A stage is done, active, waiting (on an earlier stage), stopped (it
failed, with why), needs_you (proposals wait for a person) or skipped (a file with
nothing inside). An archive or e-mail is one lane; the files found in it are counted
in its "Files inside" stage. Each lane also carries its read receipt."""

from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.domain import BackgroundJob, CheckItem, Document, DocumentChunk, ExtractionCandidate, PatternFlag, WatchlistEntry, WatchlistHit

STAGES = [("received", "Received"), ("checked", "Checked"), ("read", "Read"), ("passages", "Split into passages"),
          ("inside", "Files inside"), ("names", "Names & facts"), ("ready", "Ready for you")]
UNREAD = {"pending", "queued"}


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


def drop(db: Session, investigation_id: str) -> dict[str, Any]:
    docs = list(db.scalars(select(Document).where(Document.investigation_id == investigation_id).order_by(Document.created_at)))
    ids = [d.id for d in docs]
    chunks: dict[str, list[tuple[str, int | None]]] = defaultdict(list)
    proposals: dict[str, Counter[str]] = defaultdict(Counter)
    waiting: dict[str, Counter[str]] = defaultdict(Counter)
    unsure = 0
    hits: Counter[str] = Counter()
    hit_names: set[str] = set()
    jobs: dict[str, BackgroundJob] = {}
    fed: dict[str, set[str]] = defaultdict(set)
    if ids:
        for doc_id, locator, page in db.execute(select(DocumentChunk.document_id, DocumentChunk.locator, DocumentChunk.page_number)
                                                .where(DocumentChunk.document_id.in_(ids))):
            chunks[doc_id].append((locator or "", page))
        for doc_id, kind, status, confidence in db.execute(select(ExtractionCandidate.document_id, ExtractionCandidate.candidate_type,
                                                                  ExtractionCandidate.review_status, ExtractionCandidate.confidence)
                                                           .where(ExtractionCandidate.document_id.in_(ids))):
            proposals[doc_id][kind] += 1
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

    def lane(d: Document) -> dict[str, Any]:
        job = jobs.get(d.id)
        own_chunks = chunks.get(d.id, [])
        status = d.extraction_status
        read_done = status == "complete"
        original = first_of.get(d.sha256)
        same = original if original and original != d.id else None
        stages = [_stage("received", "done", d.created_at.strftime("%d %b %H:%M") if d.created_at else ""),
                  _stage("checked", "done", "= same" if same else _kind_of(d))]
        if status == "failed":
            stages.append(_stage("read", "stopped", d.extraction_error or "Could not be read"))
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
            stages.append(_stage("passages", "stopped" if status == "failed" else "waiting"))
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
            "in_progress": any(s["state"] in {"active", "waiting"} for s in stages),
            "issues": issues, "waiting": left, "seconds": seconds,
            "children": [lane(k) for k in kids],
            "receipt": {
                "fingerprint": d.sha256, "pages": len(pages) or None, "how_read": _how_read([loc for loc, _ in own_chunks]) or None,
                "passages": len(own_chunks), "proposals": dict(proposals[d.id]), "waiting": dict(waiting[d.id]),
                "watchlist_hits": hits[d.id], "flags_fed": sorted(fed[d.id]),
                "files_inside": len(kids),
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
