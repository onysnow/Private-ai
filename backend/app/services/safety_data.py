"""Safety & data (mockup KNOWLEDGE_KEEP_2, ADR-0015): what lives on this computer for a case, what can reach outside, and
what has left, read from the case's own rows, the outbound log and the local security log. Nothing here is a claim the
app cannot back: a thing it does not record (a backup's size, a service's "ask first" switch) is left out or said
not to be recorded."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.llm_client import is_local_endpoint
from app.ai.reasoning import ai_reasoning_status
from app.connectors.registry import CONNECTOR_SPECS
from app.core.audit_log import parse_audit_timestamp
from app.core.config import settings
from app.core.time import utcnow_naive
from app.models.domain import (
    Claim, Document, DocumentCorpusSync, Entity, Evidence, Investigation, OutboundRequest, RelationshipEdge, Source,
)
from app.services.lifecycle import preview_orphan_document_files
from app.services.security import resolve_storage_root
from app.services.settings import connector_credential_status

Period = Literal["today", "7d", "30d", "all"]

SERVICE_NAMES = {"aleph": "OCCRP Aleph", "opensanctions": "OpenSanctions", "firecrawl": "Firecrawl"}
SERVICE_ABOUT = {
    "aleph": "Public documents and records of leaks and registries",
    "opensanctions": "Sanctions lists and politically exposed people",
    "firecrawl": "Web search and page capture",
}


def period_start(period: Period) -> datetime | None:
    now = utcnow_naive()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "7d":
        return now - timedelta(days=7)
    if period == "30d":
        return now - timedelta(days=30)
    return None


def _file_bytes(raw: str, root: Path) -> int:
    try:
        path = Path(raw)
        return (path if path.is_absolute() else root / path).stat().st_size
    except OSError:
        return 0


def _audit_facts(investigation_id: str) -> dict[str, Any]:
    """From the local security log: its size, how far back it goes, the last backup of this case downloaded, and refusals in 24 h."""
    path = Path(settings.audit_log_file)
    facts: dict[str, Any] = {"events": 0, "oldest": None, "last_backup_at": None, "refused_24h": 0, "readable": True}
    if not path.exists():
        return facts
    export_path = f"/api/investigations/{investigation_id}/export"
    day_ago = utcnow_naive() - timedelta(hours=24)
    try:
        with path.open("r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(record, dict):
                    continue
                stamp = parse_audit_timestamp(record.get("timestamp"))
                if stamp is None:
                    continue
                facts["events"] += 1
                if facts["oldest"] is None or stamp < facts["oldest"]:
                    facts["oldest"] = stamp
                if record.get("path") == export_path and record.get("status_code") == 200:
                    if facts["last_backup_at"] is None or stamp > facts["last_backup_at"]:
                        facts["last_backup_at"] = stamp
                if record.get("event") in ("access_denied", "auth_rate_limited", "browser_write_denied", "request_rejected") and stamp >= day_ago:
                    facts["refused_24h"] += 1
    except OSError:
        facts["readable"] = False
    return facts


def _services(db: Session, investigation_id: str, counts: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for provider in CONNECTOR_SPECS:
        has_key = bool(connector_credential_status(provider)["configured"])
        c = counts.get(provider, {"n": 0, "kinds": []})
        out.append({
            "id": provider, "name": SERVICE_NAMES.get(provider, provider.capitalize()), "about": SERVICE_ABOUT.get(provider, ""),
            "state": "on_request" if has_key else "off", "state_note": "Only when you press it" if has_key else "No key stored: nothing can be sent",
            "sent_count": c["n"], "sends": c["kinds"], "where": "outside",
        })
    local = is_local_endpoint(settings.openaleph_base_url)
    out.append({
        "id": "openaleph", "name": "OpenAleph", "about": "Reads and searches your documents",
        "state": ("local" if local else "on_request") if settings.openaleph_enabled else "off",
        "state_note": ("On this computer" if local else "At " + settings.openaleph_base_url) if settings.openaleph_enabled else "Not connected to this case",
        "sent_count": 0, "sends": [], "where": "inside" if local else "outside",
    })
    ai = ai_reasoning_status(settings)
    provider = ai["provider"]
    runs_here = ai["runs_on_this_computer"] is True
    if not ai["enabled"] or not provider:
        state, note = "off", "AI is switched off"
    elif runs_here:
        state, note = "local", "A model on this computer"
    else:
        state, note = "on_request", "Only when you run it"
    ai_counts = counts.get(f"ai:{provider}", {"n": 0, "kinds": []}) if provider else {"n": 0, "kinds": []}
    out.append({
        "id": "ai", "name": "Outside AI" if not runs_here else "Private AI", "about": f"{provider} {ai['model'] or ''}".strip() or "No model chosen",
        "state": state, "state_note": note, "sent_count": 0 if runs_here else ai_counts["n"], "sends": [] if runs_here else ai_counts["kinds"],
        "where": "inside" if runs_here else "outside",
        "blocked_note": None if runs_here or provider in ("anthropic", "openai") or not provider else "Outside models are not allowed on this server",
    })
    return out


def safety_data(db: Session, investigation_id: str, period: Period = "7d") -> dict[str, Any]:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise LookupError("Investigation not found")
    root = resolve_storage_root(settings.document_storage_dir)
    since = period_start(period)

    def count(model: Any, extra: Any = None) -> int:
        stmt = select(func.count()).select_from(model).where(model.investigation_id == investigation_id)
        if extra is not None:
            stmt = stmt.where(extra)
        return int(db.scalar(stmt) or 0)

    entities, links = count(Entity), count(RelationshipEdge)
    claims = count(Claim)
    evidence = int(db.scalar(select(func.count()).select_from(Evidence).join(Source, Evidence.source_id == Source.id)
                             .where(Source.investigation_id == investigation_id)) or 0)
    paths = [row for row in db.scalars(select(Document.storage_path).where(Document.investigation_id == investigation_id)) if row]
    doc_bytes = sum(_file_bytes(p, root) for p in paths)
    audit = _audit_facts(investigation_id)

    stmt = select(OutboundRequest).where(OutboundRequest.investigation_id == investigation_id)
    if since is not None:
        stmt = stmt.where(OutboundRequest.at >= since)
    rows = list(db.scalars(stmt.order_by(OutboundRequest.at.desc(), OutboundRequest.id.desc())))
    left = [r for r in rows if r.leaves_computer and r.outcome != "blocked"]
    per_service: dict[str, dict[str, Any]] = {}
    for r in left:
        slot = per_service.setdefault(r.service, {"n": 0, "kinds": []})
        slot["n"] += 1
        if r.kind not in slot["kinds"]:
            slot["kinds"].append(r.kind)
    services = _services(db, investigation_id, per_service)

    remote_openaleph = settings.openaleph_enabled and not is_local_endpoint(settings.openaleph_base_url)
    docs_out = count(DocumentCorpusSync, DocumentCorpusSync.status == "synced") if remote_openaleph else 0
    ai_out = sum(1 for r in left if r.service.startswith("ai"))
    reached = sorted({r.service for r in left})

    try:
        orphans = preview_orphan_document_files(db, root)
        orphan_files, orphan_bytes = int(orphans["orphan_file_count"]), int(orphans["orphan_bytes"])
    except Exception:
        orphan_files, orphan_bytes = None, None

    ai = ai_reasoning_status(settings)
    names = [SERVICE_NAMES.get(s, s) for s in reached if not s.startswith("ai")]
    words = sum(1 for r in left if not r.service.startswith("ai"))
    exposure = (f"This case has sent {words} {'item' if words == 1 else 'items'} to {len(names)} {'service' if len(names) == 1 else 'services'}"
                f" ({', '.join(names)}) and {ai_out} {'request' if ai_out == 1 else 'requests'} to an outside AI." if left
                else "Nothing from this case has left this computer in this period.")

    return {
        "period": period,
        "totals": {"requests_left": len(left), "services_reached": len(reached), "documents_sent_out": docs_out, "ai_calls_outside": ai_out},
        "exposure": exposure,
        "stores": [
            {"id": "records", "name": "Case records", "count": entities + links, "count_note": f"{claims:,} claims · {evidence:,} pieces of evidence",
             "where": "Database on this machine", "in_backups": True},
            {"id": "documents", "name": "Documents & pictures", "count": len(paths), "bytes": doc_bytes,
             "where": "Kept as received, checksummed", "in_backups": True},
            {"id": "backups", "name": "Backups", "count": 1 if audit["last_backup_at"] else 0, "where": "Wherever you saved the file",
             "in_backups": None, "warning": "Not encrypted: keep it safe"},
            {"id": "keys", "name": "Service keys", "count": sum(1 for p in CONNECTOR_SPECS if connector_credential_status(p)["configured"]),
             "count_note": f"of {len(CONNECTOR_SPECS)} set", "where": "Stored here, never shown again", "in_backups": False},
            {"id": "log", "name": "Security log", "count": audit["events"], "oldest": audit["oldest"].isoformat() if audit["oldest"] else None,
             "where": "Who asked what, never the content", "in_backups": False},
            {"id": "ai", "name": "Private AI", "count": None, "where": ("A model on this computer" if ai["runs_on_this_computer"] else
             ("Outside AI: " + (ai["provider"] or "off"))) if ai["enabled"] else "Off", "in_backups": None},
        ],
        "services": services,
        "backup": {"last_backup_at": audit["last_backup_at"].isoformat() if audit["last_backup_at"] else None, "encrypted": False,
                   "restore_enabled": bool(settings.enable_restore_api)},
        "access": {"mode": "remote" if (settings.api_auth_token.strip()) else "local_only", "refused_24h": audit["refused_24h"],
                   "log_readable": audit["readable"]},
        "housekeeping": {"stray_files": orphan_files, "stray_bytes": orphan_bytes},
        "outbound": [{"id": r.id, "at": r.at.isoformat(), "service": r.service, "service_name": SERVICE_NAMES.get(r.service, r.service),
                      "kind": r.kind, "value": r.value, "reason": r.reason, "actor": r.actor, "leaves_computer": r.leaves_computer,
                      "outcome": r.outcome, "source": r.source} for r in rows[:500]],
        "outbound_total": len(rows),
    }
