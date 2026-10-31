"""Checking a captured page again (mockup INTAKE_3: "Check again later", "Re-check now", "Changed since capture").

A capture's page is followed by an ordinary Following page monitor (ADR-0022) tied to the capture. Version 1 is the
page as captured, read from the kept page source, so starting to check costs no visit. Each check compares the live
page's main text with the last version: a different text is kept as a new version, marked not captured, and the
capture says "changed since capture"; an address that now answers 404 or 410 is "gone". Nothing is kept as evidence by
a check: "Capture version 2" is an ordinary new capture, and both stay in the case.

A link-only capture (nothing could be kept) uses the same monitor for "Ask again in 7 days": when the address answers
again, its page waits in Following's queue for a person to capture.
"""

from __future__ import annotations

import difflib
import hashlib
import re
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Capture, Monitor, MonitorItem, PageVersion, Source
from app.services import following
from app.services.web_capture import capture_file

EVERY = {"never": 0, "daily": 1440, "weekly": 10080}
REASON_KINDS = ("dead_link", "blocked", "timed_out", "tool_error")
MAX_SEGMENTS = 600


class FollowCaptureRefused(ValueError):
    """The capture cannot be checked again: still running, or no address the app may visit."""


def guess_reason_kind(row: Capture) -> str | None:
    """A link-only capture's reason in one word, read from what came back."""
    if row.outcome != "link_only":
        return None
    status = row.http_status or 0
    reason = (row.reason or "").lower()
    if status in (404, 410) or "name or service not known" in reason or "could not be found" in reason:
        return "dead_link"
    if status in (401, 403, 407, 429, 451) or "refused" in reason or "blocked" in reason:
        return "blocked"
    if "timed out" in reason or "timeout" in reason:
        return "timed_out"
    return "tool_error"


def monitor_for(db: Session, row: Capture) -> Monitor | None:
    return db.scalars(select(Monitor).where(Monitor.capture_id == row.id).order_by(Monitor.created_at)).first()


def _captured_text(row: Capture) -> tuple[str, str, str] | None:
    """(title, main text, sha256 of the source) of the page as captured, read from its kept source."""
    entry = next((f for f in row.files or [] if f.get("role") == "source" or f.get("name") == "page.html"), None)
    if entry is None:
        return None
    try:
        path, _ = capture_file(row, entry["name"], settings.document_storage_dir)
        body = path.read_bytes()
    except (LookupError, OSError):
        return None
    title, text = following.main_text(body)
    return title, text, hashlib.sha256(body).hexdigest()


def _ensure_monitor(db: Session, row: Capture, actor: str | None) -> Monitor:
    monitor = monitor_for(db, row)
    if monitor is not None:
        return monitor
    if row.status != "finished":
        raise FollowCaptureRefused("The page is still being captured")
    url = row.final_url or row.url
    title = (row.displayed or {}).get("title") or url
    monitor = Monitor(investigation_id=row.investigation_id, kind="page", url=url, name=f"{title} · page from a capture"[:500],
                      every_minutes=0, route="direct", health="unchecked", created_by=actor, capture_id=row.id,
                      next_check_at=None)
    db.add(monitor)
    db.flush()
    captured = _captured_text(row) if row.outcome == "saved" else None
    if captured is not None:
        _title, text, layout = captured
        at = row.captured_at or row.finished_at or utcnow_naive()
        db.add(PageVersion(investigation_id=row.investigation_id, monitor_id=monitor.id, number=1, seen_at=at,
                           text_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(), layout_sha256=layout,
                           text=text, captured=True, capture_id=row.id))
    db.commit()
    return monitor


def set_every(db: Session, row: Capture, every: str, actor: str | None) -> Monitor:
    """Never, daily or weekly. The first scheduled check is one interval from now ("Ask again in 7 days")."""
    if every not in EVERY:
        raise FollowCaptureRefused("Check again: never, daily or weekly")
    monitor = _ensure_monitor(db, row, actor)
    monitor.every_minutes = EVERY[every]
    if monitor.health == "paused":
        monitor.health = "unchecked"
    monitor.next_check_at = None if every == "never" else utcnow_naive() + timedelta(minutes=EVERY[every])
    db.commit()
    return monitor


def recheck(db: Session, row: Capture, actor: str | None) -> Monitor:
    """One visit now: the live page's main text compared with the last version."""
    monitor = _ensure_monitor(db, row, actor)
    if monitor.health == "moved":
        raise FollowCaptureRefused("The address moved: accept the new address in Following first")
    return following.check(db, monitor)


def _words(text: str) -> list[str]:
    # Words, spaces and each punctuation mark apart, so "Lindqvist," and "Lindqvist." differ only by the mark.
    return re.findall(r"\w[\w'’%-]*\s*|[^\w\s]\s*", text)


def _tidy(segments: list[dict[str, str]]) -> list[dict[str, str]]:
    """A tiny unchanged bit (a space, a mark) between two changes joins them, so a rewritten sentence reads as one
    deletion and one insertion; then neighbours with the same op are merged."""
    out = list(segments)
    for i in range(1, len(out) - 1):
        if out[i]["op"] == "same" and out[i - 1]["op"] != "same" and out[i + 1]["op"] != "same" \
                and len(out[i]["text"].strip()) <= 1:
            out[i] = {"op": "both", "text": out[i]["text"]}
    merged: list[dict[str, str]] = []
    run_del, run_ins = "", ""
    for seg in out + [{"op": "same", "text": ""}]:
        if seg["op"] in ("del", "ins", "both"):
            run_del += seg["text"] if seg["op"] in ("del", "both") else ""
            run_ins += seg["text"] if seg["op"] in ("ins", "both") else ""
            continue
        if run_del:
            merged.append({"op": "del", "text": run_del})
        if run_ins:
            merged.append({"op": "ins", "text": run_ins})
        run_del, run_ins = "", ""
        if seg["text"]:
            if merged and merged[-1]["op"] == "same":
                merged[-1] = {"op": "same", "text": merged[-1]["text"] + seg["text"]}
            else:
                merged.append(seg)
    return merged


def word_changes(old: str, new: str) -> list[dict[str, Any]]:
    """The changed lines between two versions, as blocks of words: [{segments: [{op, text}]}], op same / del / ins.
    Unchanged lines are left out; `unchanged` blocks say how many lines were the same in between."""
    a, b = old.splitlines(), new.splitlines()
    blocks: list[dict[str, Any]] = []
    total = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            if blocks:
                blocks.append({"unchanged": i2 - i1, "segments": []})
            continue
        old_words, new_words = _words(" ".join(a[i1:i2])), _words(" ".join(b[j1:j2]))
        segments: list[dict[str, str]] = []
        for op, k1, k2, m1, m2 in difflib.SequenceMatcher(None, old_words, new_words, autojunk=False).get_opcodes():
            if op == "equal":
                segments.append({"op": "same", "text": "".join(old_words[k1:k2])})
                continue
            if k2 > k1:
                segments.append({"op": "del", "text": "".join(old_words[k1:k2])})
            if m2 > m1:
                segments.append({"op": "ins", "text": "".join(new_words[m1:m2])})
        segments = _tidy(segments)
        total += len(segments)
        blocks.append({"unchanged": 0, "segments": segments})
        if total > MAX_SEGMENTS:
            break
    while blocks and blocks[-1]["unchanged"]:
        blocks.pop()
    return blocks


def follow_state(db: Session, row: Capture) -> dict[str, Any] | None:
    """What the capture's page is doing now: checked or not, the same, changed, gone, or (for a link only) answering
    again. None when nobody asked to check it again."""
    monitor = monitor_for(db, row)
    if monitor is None:
        return None
    versions = list(db.scalars(select(PageVersion).where(PageVersion.monitor_id == monitor.id).order_by(PageVersion.number)))
    every = {v: k for k, v in EVERY.items()}.get(monitor.every_minutes, "weekly")
    first = next((v for v in versions if v.capture_id == row.id), None)
    latest = versions[-1] if versions else None
    status = next((c.get("status") for c in monitor.checks or [] if c.get("status")), None)
    if monitor.last_checked_at is None:
        state = "unchecked"
    elif row.outcome == "saved" and status in (404, 410):
        state = "gone"
    elif monitor.health in ("broken", "moved"):
        state = "broken"
    elif row.outcome != "saved":
        state = "answers" if latest is not None else "not_yet"
    elif first is not None and latest is not None and latest.number != first.number and latest.text_sha256 != first.text_sha256:
        state = "changed"
    else:
        state = "same"
    item = None
    if latest is not None and not latest.captured:
        item = db.scalar(select(MonitorItem).where(MonitorItem.monitor_id == monitor.id,
                                                   MonitorItem.key == f"version:{latest.number}"))
    source = db.get(Source, row.source_id) if row.source_id else None
    return {
        "monitor_id": monitor.id, "every": every, "health": monitor.health, "health_detail": monitor.health_detail,
        "checks": monitor.checks or [], "last_checked_at": monitor.last_checked_at, "next_check_at": monitor.next_check_at,
        "leaves": following.leaves(monitor), "state": state,
        "versions": [{"number": v.number, "seen_at": v.seen_at, "captured": v.captured, "capture_id": v.capture_id,
                      "text_sha256": v.text_sha256, "lines_changed": v.lines_changed} for v in versions],
        "changes": word_changes(first.text, latest.text) if state == "changed" and first and latest else [],
        "captured_text": first.text if state == "changed" and first else None,
        "live_text": latest.text if state == "changed" and latest else None,
        "item_id": item.id if item is not None else None,
        "marked_changed": (source.metadata_json or {}).get("changed_since_capture") if source is not None else None,
    }


def mark_source_changed(db: Session, row: Capture, actor: str | None) -> None:
    """The source is marked "changed since capture", with who said so and which version they saw."""
    state = follow_state(db, row)
    if state is None or state["state"] not in ("changed", "gone"):
        raise FollowCaptureRefused("Only a page that changed or is gone since its capture can be marked so")
    source = db.get(Source, row.source_id) if row.source_id else None
    if source is None:
        raise FollowCaptureRefused("This capture has no source to mark")
    latest = state["versions"][-1] if state["versions"] else None
    source.metadata_json = {**(source.metadata_json or {}), "changed_since_capture": {
        "at": utcnow_naive().isoformat(), "by": actor, "state": state["state"],
        "version": latest["number"] if latest else None, "capture_id": row.id}}
    db.commit()


def link_new_capture(db: Session, row: Capture, new: Capture, actor: str | None) -> None:
    """The latest version was captured as `new`: the version and its queue item say so."""
    monitor = monitor_for(db, row)
    if monitor is None:
        return
    latest = db.scalars(select(PageVersion).where(PageVersion.monitor_id == monitor.id).order_by(PageVersion.number.desc())).first()
    if latest is None or latest.captured:
        return
    item = db.scalar(select(MonitorItem).where(MonitorItem.monitor_id == monitor.id, MonitorItem.key == f"version:{latest.number}"))
    if item is not None:
        following.mark_captured(db, item, actor, capture_id=new.id)
    else:
        latest.captured, latest.capture_id = True, new.id
        db.commit()


def set_reason_kind(db: Session, row: Capture, kind: str, actor: str | None) -> None:
    if row.outcome != "link_only":
        raise FollowCaptureRefused("Only a link-only capture has a reason to set")
    if kind not in REASON_KINDS:
        raise FollowCaptureRefused(f"The reason is one of {', '.join(REASON_KINDS)}")
    row.reason_kind, row.reason_kind_by = kind, actor
    db.commit()
