"""Keep › Safety & data (mockup KEEP-safety-and-data; research Keep §7 "What lives where", §8 backup, §13 "Your
safety", §14 outbound log).

Everything here is read from what the app already stores; nothing is estimated. The outbound log and the service
modes are app/services/outbound.py's.
"""
from __future__ import annotations

import csv
import hashlib
import io
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.reasoning import ai_reasoning_status
from app.connectors.registry import CONNECTOR_SPECS, registry
from app.core.audit_log import summarize_security_audit
from app.core.config import Settings
from app.core.time import utcnow_naive
from app.models.domain import AppUser, Claim, Document, Investigation
from app.models.safety import BackupEvent, OutboundRequest, SafetyAnswer
from app.services import outbound
from app.services.exports import build_investigation_export
from app.services.lifecycle import preview_investigation_deletion
from app.services.security import resolve_storage_root
from app.services.settings import connector_credential_status, security_alerts

# How long the security log keeps its records (the retention the security panel applies, features/security).
SECURITY_LOG_KEEP_DAYS = 90
LAST_SHOWN = 3

# "Only you can say" (research Keep §13): the person-checked items it names — direct threats, being followed,
# pressure on family, doxxing — asked as plain questions. The first is the mockup's own wording.
QUESTIONS: list[dict[str, Any]] = [
    {"id": "threats", "text": "Have you, a source or family received threats, or been followed?",
     "indicators": ["SA-013", "SA-014", "SA-015", "SA-031"]},
    {"id": "doxxing", "text": "Has your home address or other private detail been posted online?",
     "indicators": ["SA-018"]},
]
ANSWERS = ("YES", "NO", "NOT_SURE")


def naive_utc(value: datetime | None) -> datetime | None:
    """A time from the request as the database keeps it: UTC, without an offset."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _case(db: Session, investigation_id: str) -> Investigation:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise LookupError("Investigation not found")
    return inv


def _log_query(investigation_id: str, since: datetime | None, service: str | None = None) -> Any:
    stmt = select(OutboundRequest).where(OutboundRequest.investigation_id == investigation_id)
    if since is not None:
        stmt = stmt.where(OutboundRequest.created_at >= since)
    if service:
        stmt = stmt.where(OutboundRequest.service == service)
    return stmt


def serialize_request(row: OutboundRequest) -> dict[str, Any]:
    return {"id": row.id, "service": row.service, "service_name": outbound.service_name(row.service), "kind": row.kind,
            "value_sent": row.value_sent, "value_kind": row.value_kind, "reason": row.reason, "started_by": row.started_by,
            "documents_sent": row.documents_sent, "created_at": row.created_at}


def outbound_log(db: Session, investigation_id: str, *, since: datetime | None, service: str | None, limit: int, offset: int) -> dict[str, Any]:
    _case(db, investigation_id)
    since = naive_utc(since)
    stmt = _log_query(investigation_id, since, service)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(OutboundRequest.created_at.desc(), OutboundRequest.id.desc()).offset(offset).limit(limit))
    return {"items": [serialize_request(r) for r in rows], "total": int(total), "since": since}


def outbound_log_csv(db: Session, investigation_id: str, *, since: datetime | None, service: str | None) -> str:
    """The log as CSV, for a source-protection file (research §14 "Export log")."""
    _case(db, investigation_id)
    rows = db.scalars(_log_query(investigation_id, naive_utc(since), service).order_by(OutboundRequest.created_at, OutboundRequest.id))
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["time_utc", "service", "value_sent", "value_kind", "reason", "started_by", "documents_sent"])
    for r in rows:
        writer.writerow([r.created_at.isoformat(), outbound.service_name(r.service), r.value_sent, r.value_kind, r.reason,
                         "you" if r.started_by == "person" else "automatic check", r.documents_sent])
    return out.getvalue()


def _documents(db: Session, preview: dict[str, Any], settings: Settings) -> dict[str, int]:
    root = resolve_storage_root(settings.document_storage_dir)
    size = 0
    for item in preview["document_files"]:
        if item.get("exists"):
            try:
                size += (root / item["relative_path"]).stat().st_size
            except OSError:
                pass
    files = db.scalar(select(func.count()).select_from(Document).where(Document.investigation_id == preview["investigation_id"])) or 0
    missing = sum(1 for item in preview["document_files"] if not item.get("exists"))
    return {"files": int(files), "size_bytes": size, "missing": missing}


def _services(db: Session, investigation_id: str, since: datetime | None, settings: Settings) -> list[dict[str, Any]]:
    modes = outbound.stored_modes(db, investigation_id)
    out = []
    for service in outbound.services():
        name, line = outbound.SERVICE_TEXT.get(service, (outbound.service_name(service), ""))
        locked = outbound.locked_reason(service, settings)
        rows = list(db.scalars(_log_query(investigation_id, since, service).order_by(OutboundRequest.created_at.desc(), OutboundRequest.id.desc())))
        kinds: dict[str, int] = {}
        for r in rows:
            kinds[r.value_kind] = kinds.get(r.value_kind, 0) + 1
        ever = rows or db.scalar(select(OutboundRequest.id).where(OutboundRequest.investigation_id == investigation_id,
                                                                  OutboundRequest.service == service).limit(1))
        connector = registry.get(service)
        configured = (bool(connector_credential_status(service).get("configured")) if service in CONNECTOR_SPECS
                      else bool(getattr(connector, "configured", True)) if connector is not None else None)
        out.append({
            "service": service, "name": name, "line": line,
            "mode": "OFF" if locked else modes.get(service, outbound.DEFAULT_MODE), "locked_reason": locked,
            "configured": configured, "sent_count": len(rows),
            "sent_kinds": [{"value_kind": k, "count": n} for k, n in sorted(kinds.items(), key=lambda kv: (-kv[1], kv[0]))],
            "ever_used": bool(ever), "last": [serialize_request(r) for r in rows[:LAST_SHOWN]],
        })
    return out


def summary(db: Session, investigation_id: str, *, since: datetime | None, settings: Settings, admin: bool) -> dict[str, Any]:
    inv = _case(db, investigation_id)
    since = naive_utc(since)
    rows = list(db.scalars(_log_query(investigation_id, since)))
    preview = preview_investigation_deletion(db, investigation_id, settings.document_storage_dir)
    backups = list(db.scalars(select(BackupEvent).where(BackupEvent.investigation_id == investigation_id)
                              .order_by(BackupEvent.made_at.desc(), BackupEvent.id.desc())))
    keys = [connector_credential_status(p) for p in sorted(CONNECTOR_SPECS)]
    ai = ai_reasoning_status(settings)
    audit = summarize_security_audit(settings.audit_log_file) if admin else None
    alerts = security_alerts(window_hours=24.0, max_examples=0) if admin else None
    answers = {a.question: a for a in db.scalars(select(SafetyAnswer).where(SafetyAnswer.investigation_id == investigation_id))}
    claims = db.scalar(select(func.count()).select_from(Claim).where(Claim.investigation_id == investigation_id)) or 0
    token = bool(settings.api_auth_token.strip())
    users = db.scalar(select(func.count()).select_from(AppUser).where(AppUser.disabled == False)) or 0  # noqa: E712
    return {
        "investigation_id": investigation_id, "investigation_name": inv.name, "since": since,
        "totals": {
            "requests": len(rows),
            "services_reached": len({r.service for r in rows}),
            "documents_sent": sum(r.documents_sent for r in rows),
            "ai_calls_outside": sum(1 for r in rows if r.kind == "ai"),
        },
        "stores": {
            "records": {"total": preview["record_total"], "claims": int(claims)},
            "documents": _documents(db, preview, settings),
            "backups": {"count": len(backups), "last_at": backups[0].made_at if backups else None,
                        "last_size_bytes": backups[0].size_bytes if backups else None,
                        "last_sha256": backups[0].sha256 if backups else None,
                        "encrypted": bool(backups[0].encrypted) if backups else False},
            "service_keys": {"set": sum(1 for k in keys if k.get("configured")), "total": len(keys)},
            "security_log": {"events": audit["total_records"] if audit else None, "size_bytes": audit["file_bytes"] if audit else None,
                             "keep_days": SECURITY_LOG_KEEP_DAYS},
            "private_ai": {"enabled": bool(ai["enabled"]), "provider": ai["provider"], "model": ai["model"],
                           "on_this_computer": ai["runs_on_this_computer"], "outside_allowed": outbound.outside_ai_allowed(settings)},
        },
        "services": _services(db, investigation_id, since, settings),
        "access": {
            "mode": "persisted_users" if users else ("shared_bearer" if token else "local_only"),
            "remote_api_enabled": token or users > 0,
            "refused_24h": alerts["total_denials"] if alerts else None,
            "needs_attention": bool(alerts and alerts.get("needs_attention")),
            "restore_api_enabled": bool(settings.enable_restore_api),
        },
        "delete": {"record_total": preview["record_total"], "files_to_delete": preview["document_file_summary"]["delete"],
                   "shared_files_kept": preview["document_file_summary"]["preserve_shared"], "can_delete": preview["can_delete"]},
        "questions": [{**q, "answer": answers[q["id"]].answer if q["id"] in answers else None,
                       "answered_at": answers[q["id"]].answered_at if q["id"] in answers else None} for q in QUESTIONS],
    }


def answer(db: Session, investigation_id: str, question: str, value: str | None) -> None:
    """Keep (or take back) the reporter's answer. Kept on this computer only: never in a backup (research §13)."""
    _case(db, investigation_id)
    if question not in {q["id"] for q in QUESTIONS}:
        raise ValueError("Unknown question")
    row = db.scalar(select(SafetyAnswer).where(SafetyAnswer.investigation_id == investigation_id, SafetyAnswer.question == question))
    if value is None:
        if row is not None:
            db.delete(row)
    elif value not in ANSWERS:
        raise ValueError(f"Answer must be one of {list(ANSWERS)}")
    elif row is None:
        db.add(SafetyAnswer(investigation_id=investigation_id, question=question, answer=value))
    else:
        row.answer = value
        row.answered_at = utcnow_naive()
    db.commit()


def make_backup(db: Session, investigation_id: str, passphrase: str | None = None) -> tuple[bytes, dict[str, Any], BackupEvent]:
    """The same archive as GET /investigations/{id}/export (documents included), with the backup kept on record:
    when, its size, its checksum and whether it is protected, so "Last backup 3 days ago" is a stored fact (research
    §8 "Needs"). With a passphrase the archive is sealed (ADR-0015); the checksum is of the file as saved."""
    _case(db, investigation_id)
    payload, manifest = build_investigation_export(db, investigation_id, include_documents=True, passphrase=passphrase)
    counts = manifest.get("record_counts") or {}
    event = BackupEvent(investigation_id=investigation_id, size_bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(),
                        record_total=sum(int(v) for v in counts.values() if isinstance(v, int)),
                        document_files=len(manifest.get("document_files") or []), encrypted=passphrase is not None)
    db.add(event)
    db.commit()
    db.refresh(event)
    return payload, manifest, event


def backup_filename(investigation_id: str) -> str:
    # The id, not the case name: a file name should not say what the case is about (research §7, the existing export).
    return f"investigation-{investigation_id}.jwbackup.zip"
