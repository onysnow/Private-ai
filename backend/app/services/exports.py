from __future__ import annotations

import hashlib
import io
import json
import re
import shutil
import tempfile
import zipfile
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from app.core.time import utcnow_iso
from app.core.config import settings
from app.db.locking import investigation_export_snapshot, lock_investigation_transaction
from app.services.security import contained_path, resolve_storage_root
from app.models.domain import (
    Investigation, Entity, Statement, Source, Evidence, ClaimEvidenceLink, Claim, ClaimReviewEvent, RelationshipEvidenceReviewEvent, RelationshipEvidenceAttachment,
    Lead, LeadProfile, LeadLink, LeadWorkflowEvent, ReportingTask, ReportingTaskWorkflowEvent, TimelineEvent,
    ConnectorRun, ConnectorFinding, ResolutionDecision, CanonicalResolutionDecision, CanonicalEntityMergeAudit, PostMergeReconciliationDecision, PropertyConflictDecision, StatementAssessment,
    StatementPromotion, EnrichmentSession, EnrichmentSessionRun,
    EnrichmentSessionFinding, CrossProviderDecision, RelationshipEdge,
    ExternalRelationshipReview, ExternalRelationshipPromotion, Document,
    DocumentChunk, ExtractionCandidate, InvestigationCorpusBinding, DocumentCorpusSync,
    AIAnalysisCandidate,
)

EXPORT_FORMAT = "journalism-workbench-investigation"
EXPORT_VERSION = 1

MODEL_BY_TABLE = {
    model.__tablename__: model for model in [
        Investigation, Entity, Statement, Source, Evidence, ClaimEvidenceLink, Claim, ClaimReviewEvent, RelationshipEvidenceReviewEvent, RelationshipEvidenceAttachment,
        Lead, LeadProfile, LeadLink, LeadWorkflowEvent, ReportingTask, ReportingTaskWorkflowEvent, TimelineEvent,
        ConnectorRun, ConnectorFinding, ResolutionDecision, CanonicalResolutionDecision, CanonicalEntityMergeAudit, PostMergeReconciliationDecision, PropertyConflictDecision, StatementAssessment,
        StatementPromotion, EnrichmentSession, EnrichmentSessionRun,
        EnrichmentSessionFinding, CrossProviderDecision, RelationshipEdge,
        ExternalRelationshipReview, ExternalRelationshipPromotion, Document,
        DocumentChunk, ExtractionCandidate, InvestigationCorpusBinding, DocumentCorpusSync,
        AIAnalysisCandidate,
    ]
}

RESTORE_ORDER = [
    "investigations", "entities", "sources", "claims", "leads", "connector_runs",
    "documents", "investigation_corpus_bindings", "document_corpus_syncs", "statements", "evidence", "timeline_events", "reporting_tasks",
    "reporting_task_workflow_events", "lead_profiles", "lead_links", "lead_workflow_events", "claim_evidence_links", "claim_review_events",
    "connector_findings", "resolution_decisions", "canonical_resolution_decisions", "canonical_entity_merge_audits", "post_merge_reconciliation_decisions", "property_conflict_decisions", "statement_assessments",
    "statement_promotions", "enrichment_sessions", "enrichment_session_runs",
    "enrichment_session_findings", "cross_provider_decisions", "relationship_edges", "relationship_evidence_attachments", "relationship_evidence_review_events",
    "external_relationship_reviews", "external_relationship_promotions",
    "document_chunks", "extraction_candidates",
    # The TAS reasoning review queue travels with the investigation: a restored
    # backup keeps every proposed/accepted/rejected analysis and its reviewer note,
    # exactly as extraction_candidates keeps the document review trail.
    "ai_analysis_candidates",
]


def _json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _row_dict(row: Any) -> dict[str, Any]:
    mapper = inspect(row).mapper
    return {attr.key: _json_value(getattr(row, attr.key)) for attr in mapper.column_attrs}


def _rows(db: Session, model, ids: set[str] | None = None, id_col=None):
    stmt = select(model)
    if ids is not None:
        if not ids:
            return []
        stmt = stmt.where((id_col or model.id).in_(ids))
    return list(db.scalars(stmt).all())


def collect_investigation_records(db: Session, investigation_id: str) -> dict[str, list[dict[str, Any]]]:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise ValueError("Investigation not found")

    entities = list(db.scalars(select(Entity).where(Entity.investigation_id == investigation_id)).all())
    sources = list(db.scalars(select(Source).where(Source.investigation_id == investigation_id)).all())
    claims = list(db.scalars(select(Claim).where(Claim.investigation_id == investigation_id)).all())
    leads = list(db.scalars(select(Lead).where(Lead.investigation_id == investigation_id)).all())
    runs = list(db.scalars(select(ConnectorRun).where(ConnectorRun.investigation_id == investigation_id)).all())
    findings = list(db.scalars(select(ConnectorFinding).where(ConnectorFinding.investigation_id == investigation_id)).all())
    sessions = list(db.scalars(select(EnrichmentSession).where(EnrichmentSession.investigation_id == investigation_id)).all())
    documents = list(db.scalars(select(Document).where(Document.investigation_id == investigation_id)).all())
    corpus_bindings = list(db.scalars(select(InvestigationCorpusBinding).where(InvestigationCorpusBinding.investigation_id == investigation_id)).all())
    document_syncs = list(db.scalars(select(DocumentCorpusSync).where(DocumentCorpusSync.investigation_id == investigation_id)).all())

    entity_ids = {x.id for x in entities}
    source_ids = {x.id for x in sources}
    claim_ids = {x.id for x in claims}
    lead_ids = {x.id for x in leads}
    finding_ids = {x.id for x in findings}
    session_ids = {x.id for x in sessions}
    document_ids = {x.id for x in documents}

    statements = _rows(db, Statement, entity_ids, Statement.entity_id)
    evidence = _rows(db, Evidence, source_ids, Evidence.source_id)
    evidence_ids = {x.id for x in evidence}
    claim_links = list(db.scalars(select(ClaimEvidenceLink).where(
        ClaimEvidenceLink.claim_id.in_(claim_ids), ClaimEvidenceLink.evidence_id.in_(evidence_ids)
    )).all()) if claim_ids and evidence_ids else []

    claim_review_events = _rows(db, ClaimReviewEvent, claim_ids, ClaimReviewEvent.claim_id)
    lead_profiles = _rows(db, LeadProfile, lead_ids, LeadProfile.lead_id)
    lead_links = _rows(db, LeadLink, lead_ids, LeadLink.lead_id)
    lead_events = _rows(db, LeadWorkflowEvent, lead_ids, LeadWorkflowEvent.lead_id)
    session_runs = _rows(db, EnrichmentSessionRun, session_ids, EnrichmentSessionRun.session_id)
    session_findings = _rows(db, EnrichmentSessionFinding, session_ids, EnrichmentSessionFinding.session_id)
    chunks = _rows(db, DocumentChunk, document_ids, DocumentChunk.document_id)

    direct_models = [
        ReportingTask, ReportingTaskWorkflowEvent, TimelineEvent, ResolutionDecision, CanonicalResolutionDecision, CanonicalEntityMergeAudit, PostMergeReconciliationDecision, PropertyConflictDecision, StatementAssessment,
        StatementPromotion, CrossProviderDecision, RelationshipEdge,
        ExternalRelationshipReview, ExternalRelationshipPromotion, ExtractionCandidate, AIAnalysisCandidate,
    ]
    direct: dict[str, list[Any]] = {
        m.__tablename__: list(db.scalars(select(m).where(getattr(m, "investigation_id") == investigation_id)).all())
        for m in direct_models
    }

    relationship_edge_ids = {x.id for x in direct["relationship_edges"]}
    relationship_evidence_reviews = _rows(db, RelationshipEvidenceReviewEvent, relationship_edge_ids, RelationshipEvidenceReviewEvent.relationship_edge_id)
    relationship_evidence_attachments = _rows(db, RelationshipEvidenceAttachment, relationship_edge_ids, RelationshipEvidenceAttachment.relationship_edge_id)

    table_rows = {
        "investigations": [inv], "entities": entities, "statements": statements,
        "sources": sources, "evidence": evidence, "claim_evidence_links": claim_links, "claim_review_events": claim_review_events,
        "claims": claims, "leads": leads, "lead_profiles": lead_profiles,
        "lead_links": lead_links, "lead_workflow_events": lead_events,
        "reporting_tasks": direct["reporting_tasks"], "reporting_task_workflow_events": direct["reporting_task_workflow_events"], "timeline_events": direct["timeline_events"],
        "connector_runs": runs, "connector_findings": findings,
        "resolution_decisions": direct["resolution_decisions"],
        "canonical_resolution_decisions": direct["canonical_resolution_decisions"],
        "canonical_entity_merge_audits": direct["canonical_entity_merge_audits"],
        "statement_assessments": direct["statement_assessments"],
        "statement_promotions": direct["statement_promotions"],
        "enrichment_sessions": sessions, "enrichment_session_runs": session_runs,
        "enrichment_session_findings": session_findings,
        "cross_provider_decisions": direct["cross_provider_decisions"],
        "relationship_edges": direct["relationship_edges"], "relationship_evidence_attachments": relationship_evidence_attachments, "relationship_evidence_review_events": relationship_evidence_reviews,
        "external_relationship_reviews": direct["external_relationship_reviews"],
        "external_relationship_promotions": direct["external_relationship_promotions"],
        "documents": documents, "investigation_corpus_bindings": corpus_bindings, "document_corpus_syncs": document_syncs, "document_chunks": chunks,
        "extraction_candidates": direct["extraction_candidates"],
        "ai_analysis_candidates": direct["ai_analysis_candidates"],
    }
    return {name: [_row_dict(r) for r in rows] for name, rows in table_rows.items()}



def _lineage_integrity(records: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    documents = {row.get("id"): row for row in records.get("documents", [])}
    sources = {row.get("id"): row for row in records.get("sources", [])}
    chunks = {row.get("id"): row for row in records.get("document_chunks", [])}
    accepted_tables = {
        "entity": {row.get("id") for row in records.get("entities", [])},
        "claim": {row.get("id") for row in records.get("claims", [])},
        "evidence": {row.get("id") for row in records.get("evidence", [])},
    }

    counts = {"proposed": 0, "accepted": 0, "rejected": 0, "other": 0}
    accepted_by_type = {"entity": 0, "claim": 0, "evidence": 0}
    errors: list[str] = []

    for doc_id, doc in documents.items():
        if not doc_id:
            errors.append("document missing id")
            continue
        source_id = doc.get("source_id")
        if source_id not in sources:
            errors.append(f"document {doc_id} references missing source {source_id}")

    for chunk_id, chunk in chunks.items():
        if not chunk_id:
            errors.append("document chunk missing id")
            continue
        document_id = chunk.get("document_id")
        if document_id not in documents:
            errors.append(f"chunk {chunk_id} references missing document {document_id}")

    for candidate in records.get("extraction_candidates", []):
        candidate_id = candidate.get("id") or "<missing-id>"
        document_id = candidate.get("document_id")
        chunk_id = candidate.get("chunk_id")
        status = candidate.get("review_status") or "other"
        counts[status if status in counts else "other"] += 1

        if document_id not in documents:
            errors.append(f"candidate {candidate_id} references missing document {document_id}")
        if chunk_id is not None:
            parent_chunk = chunks.get(chunk_id)
            if parent_chunk is None:
                errors.append(f"candidate {candidate_id} references missing chunk {chunk_id}")
            elif parent_chunk.get("document_id") != document_id:
                errors.append(f"candidate {candidate_id} chunk {chunk_id} belongs to a different document")

        record_type = candidate.get("accepted_record_type")
        record_id = candidate.get("accepted_record_id")
        if status == "accepted":
            if record_type not in accepted_tables:
                errors.append(f"accepted candidate {candidate_id} has unsupported record type {record_type}")
            elif not record_id:
                errors.append(f"accepted candidate {candidate_id} is missing accepted_record_id")
            elif record_id not in accepted_tables[record_type]:
                errors.append(f"accepted candidate {candidate_id} references missing {record_type} {record_id}")
            else:
                accepted_by_type[record_type] += 1
        elif record_type or record_id:
            errors.append(f"non-accepted candidate {candidate_id} unexpectedly carries accepted-record linkage")

    summary = {
        "document_count": len(documents),
        "chunk_count": len(chunks),
        "candidate_count": len(records.get("extraction_candidates", [])),
        "candidate_status_counts": counts,
        "accepted_record_counts": accepted_by_type,
        "valid": not errors,
        "errors": errors,
    }
    return summary


def _require_lineage_integrity(records: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    summary = _lineage_integrity(records)
    if not summary["valid"]:
        preview = "; ".join(summary["errors"][:5])
        suffix = "" if len(summary["errors"]) <= 5 else f"; +{len(summary['errors']) - 5} more"
        raise ValueError(f"Backup provenance lineage is inconsistent: {preview}{suffix}")
    return summary

def _safe_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return cleaned or "document"


def build_investigation_export(db: Session, investigation_id: str, include_documents: bool = True) -> tuple[bytes, dict[str, Any]]:
    # PostgreSQL exports run from one REPEATABLE READ snapshot and hold a shared
    # investigation lock until database rows and referenced document bytes have all
    # been captured. SQLite intentionally reuses the caller's local session.
    with investigation_export_snapshot(db, investigation_id) as export_db:
        return _build_investigation_export_snapshot(export_db, investigation_id, include_documents)


def _build_investigation_export_snapshot(db: Session, investigation_id: str, include_documents: bool = True) -> tuple[bytes, dict[str, Any]]:
    records = collect_investigation_records(db, investigation_id)
    inv = records["investigations"][0]
    generated_at = utcnow_iso()
    file_payloads: dict[str, bytes] = {}

    database_json = json.dumps(records, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")
    file_payloads["data/database.json"] = database_json

    ftm_lines = []
    for entity in records["entities"]:
        ftm_lines.append(json.dumps({
            "id": entity["ftm_id"], "schema": entity["schema"],
            "properties": entity.get("properties") or {},
        }, ensure_ascii=False, sort_keys=True))
    file_payloads["data/entities.ftm.jsonl"] = (("\n".join(ftm_lines) + ("\n" if ftm_lines else "")).encode("utf-8"))

    for table, rows in records.items():
        lines = "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows)
        file_payloads[f"data/tables/{table}.jsonl"] = lines.encode("utf-8")

    missing_documents = []
    document_entries = []
    if include_documents:
        for doc in records["documents"]:
            raw_path = Path(doc.get("storage_path") or "")
            if raw_path.is_file():
                raw = raw_path.read_bytes()
                ext_name = f"documents/raw/{doc['id']}/{_safe_name(doc['filename'])}"
                file_payloads[ext_name] = raw
                document_entries.append({"document_id": doc["id"], "archive_path": ext_name, "sha256": hashlib.sha256(raw).hexdigest()})
            else:
                missing_documents.append({"document_id": doc["id"], "storage_path": doc.get("storage_path")})

    manifest: dict[str, Any] = {
        "format": EXPORT_FORMAT,
        "version": EXPORT_VERSION,
        "generated_at": generated_at,
        "investigation": {"id": inv["id"], "name": inv["name"]},
        "record_counts": {k: len(v) for k, v in records.items()},
        "documents_included": include_documents,
        "document_files": document_entries,
        "missing_document_files": missing_documents,
        "lineage_integrity": _require_lineage_integrity(records),
        "checksums": {},
    }
    for path, raw in sorted(file_payloads.items()):
        manifest["checksums"][path] = hashlib.sha256(raw).hexdigest()
    manifest_raw = json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest_raw)
        for path, raw in sorted(file_payloads.items()):
            zf.writestr(path, raw)
    return buf.getvalue(), manifest


def inspect_export(data: bytes) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    if len(data) > settings.max_backup_bytes:
        raise ValueError("Backup exceeds configured compressed-size limit")
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            infos = zf.infolist()
            if len(infos) > settings.max_backup_files:
                raise ValueError("Backup contains too many files")
            total_uncompressed = 0
            for info in infos:
                name = info.filename.replace("\\", "/")
                if name.startswith("/") or ".." in Path(name).parts:
                    raise ValueError("Backup contains unsafe archive path")
                total_uncompressed += info.file_size
                if total_uncompressed > settings.max_backup_uncompressed_bytes:
                    raise ValueError("Backup exceeds configured uncompressed-size limit")
                if info.compress_size and info.file_size / info.compress_size > settings.max_zip_compression_ratio:
                    raise ValueError("Backup contains suspiciously compressed content")
            manifest = json.loads(zf.read("manifest.json"))
            if manifest.get("format") != EXPORT_FORMAT or manifest.get("version") != EXPORT_VERSION:
                raise ValueError("Unsupported backup format or version")
            for path, expected in manifest.get("checksums", {}).items():
                actual = hashlib.sha256(zf.read(path)).hexdigest()
                if actual != expected:
                    raise ValueError(f"Checksum mismatch: {path}")
            records = json.loads(zf.read("data/database.json"))
            lineage = _require_lineage_integrity(records)
            declared_lineage = manifest.get("lineage_integrity")
            if declared_lineage is not None and declared_lineage != lineage:
                raise ValueError("Backup provenance-lineage manifest does not match database snapshot")
            _normalize_legacy_relationship_evidence(records)
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid Journalism Workbench backup") from exc
    return manifest, records



def _normalize_legacy_relationship_evidence(records: dict[str, list[dict[str, Any]]]) -> None:
    """Upgrade pre-1.15 backup rows in memory without weakening backup validation.

    EXPORT_VERSION remains stable: older backups stored one relationship evidence pointer
    directly on relationship_edges. Convert it to the authoritative attachment table before
    ORM restore. Existing attachment rows win, so current backups are unchanged.
    """
    attachments = records.setdefault("relationship_evidence_attachments", [])
    existing = {(row.get("relationship_edge_id"), row.get("evidence_id")) for row in attachments}
    for edge in records.get("relationship_edges", []):
        evidence_id = edge.pop("evidence_id", None)
        if not evidence_id or (edge.get("id"), evidence_id) in existing:
            continue
        attachments.append({
            "id": f"legacy-restore-{edge['id']}-{evidence_id}",
            "relationship_edge_id": edge["id"],
            "evidence_id": evidence_id,
            "attached_by": "legacy_restore",
            "note": "Converted from legacy relationship evidence pointer during restore",
            "created_at": edge.get("created_at"),
        })
        existing.add((edge.get("id"), evidence_id))


def preview_investigation_restore(
    db: Session, data: bytes, document_storage_dir: Path
) -> dict[str, Any]:
    """Inspect a portable backup against the current database/storage without mutating either."""
    manifest, records = inspect_export(data)
    inv_rows = records.get("investigations") or []
    if len(inv_rows) != 1:
        raise ValueError("Backup must contain exactly one investigation")

    investigation = inv_rows[0]
    investigation_id = investigation["id"]
    conflicts: list[dict[str, str]] = []

    # A portable investigation is restored as an isolated graph. Any primary-key collision
    # is treated as a hard conflict rather than relying on a database IntegrityError.
    # Every row that carries an investigation_id must carry THIS investigation's: a backup
    # is untrusted input, and without this check a crafted archive could attach rows to a
    # different, already-present investigation (which the restore's own lock would not cover).
    for table in RESTORE_ORDER:
        model = MODEL_BY_TABLE[table]
        scoped = "investigation_id" in {col.key for col in inspect(model).columns}
        for row in records.get(table, []):
            row_id = row.get("id")
            if row_id and db.get(model, row_id) is not None:
                conflicts.append({
                    "kind": "database_record",
                    "table": table,
                    "id": str(row_id),
                    "message": f"{table} record already exists",
                })
            if scoped and row.get("investigation_id") != investigation_id:
                conflicts.append({
                    "kind": "foreign_investigation",
                    "table": table,
                    "id": str(row_id or "<missing-id>"),
                    "message": f"{table} record belongs to investigation {row.get('investigation_id')!r}, not the backup's {investigation_id!r}",
                })

    storage_root = resolve_storage_root(document_storage_dir)
    for entry in manifest.get("document_files", []):
        doc_id = str(entry["document_id"])
        archive_path = str(entry["archive_path"])
        filename = Path(archive_path).name
        dest = contained_path(storage_root, investigation_id, doc_id, filename)
        if dest.exists():
            conflicts.append({
                "kind": "document_path",
                "table": "documents",
                "id": doc_id,
                "message": f"Document destination already exists: {dest}",
            })

    missing_documents = list(manifest.get("missing_documents", []))
    warnings: list[str] = []
    if missing_documents:
        warnings.append(
            f"Backup references {len(missing_documents)} document file(s) that were unavailable when exported; metadata/extracted text can still be restored."
        )

    return {
        "format": manifest.get("format"),
        "version": manifest.get("version"),
        "investigation": {
            "id": investigation_id,
            "name": investigation.get("name", ""),
            "description": investigation.get("description"),
        },
        "record_counts": {k: len(v) for k, v in records.items()},
        "lineage_integrity": manifest.get("lineage_integrity"),
        "document_file_count": len(manifest.get("document_files", [])),
        "missing_document_count": len(missing_documents),
        "warnings": warnings,
        "conflicts": conflicts,
        "can_restore": len(conflicts) == 0,
        "restore_api_enabled": settings.enable_restore_api,
    }

def _coerce_datetimes(model, row: dict[str, Any]) -> dict[str, Any]:
    result = dict(row)
    mapper = inspect(model)
    for col in mapper.columns:
        value = result.get(col.key)
        if value is None or not isinstance(value, str):
            continue
        try:
            pytype = col.type.python_type
        except (NotImplementedError, AttributeError):
            continue
        if pytype is datetime:
            result[col.key] = datetime.fromisoformat(value.rstrip("Z"))
    return result


def restore_investigation_export(db: Session, data: bytes, document_storage_dir: Path) -> dict[str, Any]:
    # Read the manifest first so PostgreSQL can serialize destructive work for this
    # investigation *before* the mutable-state preview. This closes the window where
    # two restores (or restore vs delete) could both approve the same target.
    manifest_for_lock, _ = inspect_export(data)
    investigation_id_for_lock = manifest_for_lock["investigation"]["id"]
    lock_investigation_transaction(db, investigation_id_for_lock)

    preview = preview_investigation_restore(db, data, document_storage_dir)
    if not preview["can_restore"]:
        details = "; ".join(conflict["message"] for conflict in preview["conflicts"][:10])
        if len(preview["conflicts"]) > 10:
            details += f"; plus {len(preview['conflicts']) - 10} more conflict(s)"
        raise ValueError(f"Restore conflicts detected: {details}")

    manifest, records = inspect_export(data)
    investigation_id = preview["investigation"]["id"]
    document_storage_dir = resolve_storage_root(document_storage_dir)
    document_storage_dir.mkdir(parents=True, exist_ok=True)
    raw_locations: dict[str, str] = {}
    staged_files: list[tuple[Path, Path]] = []
    created_files: list[Path] = []

    # Validate and stage raw documents before mutating the database. Staged files live
    # under the configured storage root but outside their final investigation paths.
    # This keeps a failed restore from leaving apparently-restored reporter documents.
    with tempfile.TemporaryDirectory(prefix=".restore-stage-", dir=document_storage_dir) as temp_dir:
        stage_root = Path(temp_dir)
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            for entry in manifest.get("document_files", []):
                doc_id = entry["document_id"]
                archive_path = entry["archive_path"]
                filename = Path(archive_path).name
                dest_dir = contained_path(document_storage_dir, investigation_id, doc_id)
                dest = contained_path(dest_dir, filename)
                if dest.exists():
                    # Preview already checks this, but re-check immediately before mutation
                    # so a file created between preview and restore is never overwritten.
                    raise ValueError(f"Restore destination appeared after preview: {dest}")
                raw = zf.read(archive_path)
                if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                    raise ValueError(f"Document checksum mismatch: {doc_id}")
                staged = contained_path(stage_root, doc_id, filename)
                staged.parent.mkdir(parents=True, exist_ok=True)
                staged.write_bytes(raw)
                staged_files.append((staged, dest))
                raw_locations[doc_id] = str(dest)

        restored_counts: dict[str, int] = {}
        try:
            for table in RESTORE_ORDER:
                model = MODEL_BY_TABLE[table]
                rows = records.get(table, [])
                for raw_row in rows:
                    row = dict(raw_row)
                    if table == "documents" and row["id"] in raw_locations:
                        row["storage_path"] = raw_locations[row["id"]]
                    db.add(model(**_coerce_datetimes(model, row)))
                if rows:
                    db.flush()
                restored_counts[table] = len(rows)

            # Install documents only after every database row has flushed successfully.
            # Use exclusive creation rather than replace() so a concurrent local file can
            # never be overwritten. If commit then fails, the exception path removes every
            # file created by this restore before returning control to the caller.
            for staged, dest in staged_files:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with staged.open("rb") as src, dest.open("xb") as out:
                    shutil.copyfileobj(src, out)
                created_files.append(dest)

            db.commit()
        except Exception:
            db.rollback()
            for dest in reversed(created_files):
                try:
                    dest.unlink(missing_ok=True)
                except OSError:
                    pass
            # Clean empty per-document/investigation directories created by this attempt.
            for _, dest in reversed(staged_files):
                for directory in (dest.parent, dest.parent.parent):
                    try:
                        directory.rmdir()
                    except OSError:
                        pass
            raise

    return {"investigation_id": investigation_id, "restored_counts": restored_counts, "manifest": manifest}

