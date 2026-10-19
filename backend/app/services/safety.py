"""Keep › Safety & data: what lives on this computer and what leaves it (mockup KEEP-safety-and-data, ADR-0015).

Everything here is read from what the app already stores; nothing is guessed. Where the app does not store a fact
(the traffic to OpenAleph, who a request was for), the answer says so (`counted: false`) instead of showing zero.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.llm_client import is_local_endpoint
from app.ai.reasoning import ai_reasoning_status
from app.connectors.base import host_of, will_send
from app.connectors.registry import registry
from app.core.audit_log import recent_security_denials, summarize_security_audit
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import Claim, Document, DocumentCorpusSync, Investigation
from app.models.safety import BackupEvent
from app.services.lifecycle import preview_investigation_deletion, preview_orphan_document_files
from app.services.outbound_log import outbound_totals, per_service_counts
from app.services.security import resolve_storage_root
from app.services.settings import CONNECTOR_PROVIDERS, connector_credential_status

# What each outside service is for, in the words the screen uses. A service not listed here shows its own name.
SERVICE_ROLES = {
    "opensanctions": "Sanctions and officials",
    "aleph": "Investigative archive (OCCRP)",
    "firecrawl": "Web search",
}


def record_backup_event(db: Session, investigation_id: str, payload: bytes, manifest: dict[str, Any], with_documents: bool) -> BackupEvent | None:
    """Note that a backup file was made from this case: when, its size and SHA-256 (ADR-0015). Called by the export
    route after the file is built. Never raises: the file is the thing the reporter asked for."""
    try:
        row = BackupEvent(
            investigation_id=investigation_id, size_bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(),
            with_documents=with_documents, record_total=sum(int(v) for v in (manifest.get("record_counts") or {}).values()),
            document_count=len(manifest.get("document_files") or []), encrypted=False,
        )
        db.add(row)
        db.commit()
        return row
    except Exception:  # pragma: no cover
        db.rollback()
        return None


def _document_store(db: Session, investigation_id: str) -> dict[str, Any]:
    """Files and bytes of this case's documents, by looking at the files themselves (Document has no size column)."""
    root = resolve_storage_root(settings.document_storage_dir)
    files = size = 0
    for (raw,) in db.execute(select(Document.storage_path).where(Document.investigation_id == investigation_id)).all():
        if not raw:
            continue
        try:
            path = Path(raw).expanduser().resolve()
            path.relative_to(root)
            if path.is_file():
                files += 1
                size += path.stat().st_size
        except (ValueError, OSError):
            continue
    return {"files": files, "bytes": size}


def _audit_first_time(path: str) -> str | None:
    """When the security log begins (its first line), or None: the log is append-only, so that is its oldest entry."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    return str(json.loads(line).get("timestamp") or "") or None
    except (OSError, ValueError):
        return None
    return None


def _service_cards(db: Session, investigation_id: str, period: str, ai: dict[str, Any]) -> list[dict[str, Any]]:
    counts = per_service_counts(db, investigation_id, period=period)
    cards: list[dict[str, Any]] = []
    for name in registry.names():
        connector = registry.get(name)
        host = host_of(connector, name)
        sends = will_send(connector)
        cards.append({
            "key": name, "label": {"opensanctions": "OpenSanctions", "aleph": "Aleph", "firecrawl": "Firecrawl"}.get(name, name),
            "role": SERVICE_ROLES.get(name, ""), "host": host,
            "mode": "on_click" if sends else "off",
            "why": "Sends only when you start a lookup." if sends else "No key is set, so nothing can be sent.",
            "sent": counts.get(name, {}).get("count", 0), "sends": counts.get(name, {}).get("kinds", []),
            "last": counts.get(name, {}).get("last"), "counted": True,
        })
    # OpenAleph: the case's own search platform. Normally on this computer; its traffic is not logged yet (ADR-0015).
    oa_local = is_local_endpoint(settings.openaleph_base_url)
    if not settings.openaleph_enabled:
        oa_mode, oa_why = "off", "Not connected to this case."
    elif oa_local:
        oa_mode, oa_why = "this_computer", "Runs on this computer."
    else:
        oa_mode, oa_why = "automatic", "Documents and confirmed records are sent here after each change."
    cards.append({"key": "openaleph", "label": "OpenAleph", "role": "Search across the case's documents", "host": settings.openaleph_base_url,
                  "mode": oa_mode, "why": oa_why, "sent": 0, "sends": [], "last": None,
                  "counted": not settings.openaleph_enabled or oa_local})
    # Outside AI: counted from the log.
    ai_counts = counts.get("ai", {})
    if not ai.get("enabled") or not ai.get("provider"):
        ai_mode, ai_why = "off", "AI features are off on this server."
    elif ai.get("runs_on_this_computer"):
        ai_mode, ai_why = "this_computer", "The model runs on this computer."
    elif ai.get("provider") == "ollama" and not ai.get("remote_endpoint_allowed"):
        ai_mode, ai_why = "blocked", "Not allowed on this server."
    else:
        ai_mode, ai_why = "on_click", "Sends only when you start a run."
    cards.append({"key": "ai", "label": "Outside AI services", "role": "", "host": ai.get("provider") or "", "mode": ai_mode, "why": ai_why,
                  "sent": ai_counts.get("count", 0), "sends": ai_counts.get("kinds", []), "last": ai_counts.get("last"), "counted": True})
    return cards


def build_safety_and_data(db: Session, investigation_id: str, *, period: str = "7d") -> dict[str, Any]:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise ValueError("Investigation not found")
    ai = ai_reasoning_status(settings)
    totals = outbound_totals(db, investigation_id, period=period)
    oa_remote = settings.openaleph_enabled and not is_local_endpoint(settings.openaleph_base_url)
    documents_sent_out = int(db.scalar(select(func.count()).select_from(DocumentCorpusSync).where(
        DocumentCorpusSync.investigation_id == investigation_id, DocumentCorpusSync.status == "synced")) or 0) if oa_remote else 0

    deletion = preview_investigation_deletion(db, investigation_id, settings.document_storage_dir)
    claims = int(db.scalar(select(func.count()).select_from(Claim).where(Claim.investigation_id == investigation_id)) or 0)
    docs = _document_store(db, investigation_id)
    backups = list(db.scalars(select(BackupEvent).where(BackupEvent.investigation_id == investigation_id).order_by(BackupEvent.at.desc())).all())
    last_backup = backups[0] if backups else None
    keys = [connector_credential_status(name) for name in sorted(CONNECTOR_PROVIDERS)]
    audit = summarize_security_audit(settings.audit_log_file)
    denials = recent_security_denials(settings.audit_log_file, window_hours=24.0)
    orphans = preview_orphan_document_files(db, settings.document_storage_dir)

    return {
        "investigation": {"id": inv.id, "name": inv.name},
        "period": period,
        "now": utcnow_naive(),
        "totals": {**totals, "documents_sent_out": documents_sent_out},
        "stores": {
            "case_records": {"records": int(deletion.get("record_total", 0)), "claims": claims, "in_backups": True},
            "documents": {**docs, "in_backups": True},
            "backups": {"count": len(backups), "last": last_backup.at if last_backup else None, "encrypted": False},
            "service_keys": {"set": sum(1 for k in keys if k.get("configured")), "total": len(keys)},
            "security_log": {"events": int(audit.get("total_records", 0)), "since": _audit_first_time(settings.audit_log_file),
                             "bytes": int(audit.get("file_bytes", 0))},
            "private_ai": {"enabled": bool(ai.get("enabled")), "provider": ai.get("provider"), "model": ai.get("model"),
                           "on_this_computer": ai.get("runs_on_this_computer"), "remote_allowed": bool(ai.get("remote_endpoint_allowed"))},
        },
        "services": _service_cards(db, investigation_id, period, ai),
        "cards": {
            "backup": {"last": last_backup.at if last_backup else None, "size_bytes": last_backup.size_bytes if last_backup else None,
                       "sha256": last_backup.sha256 if last_backup else None, "with_documents": last_backup.with_documents if last_backup else None,
                       "records": last_backup.record_total if last_backup else None, "documents": last_backup.document_count if last_backup else None},
            "access": {"refused_24h": int(sum((denials.get("counts") or {}).values())) if isinstance(denials.get("counts"), dict) else 0},
            "housekeeping": {"stray_files": int(orphans.get("orphan_file_count", 0)), "stray_bytes": int(orphans.get("orphan_bytes", 0))},
            "delete": {"records": int(deletion.get("record_total", 0)),
                       "files": int((deletion.get("document_file_summary") or {}).get("delete", 0)),
                       "shared_files": int((deletion.get("document_file_summary") or {}).get("preserve_shared", 0))},
        },
        "not_counted": ["Traffic to OpenAleph, the watchlist check and the corpus push are not logged yet."],
    }
