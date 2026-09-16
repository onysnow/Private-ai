from __future__ import annotations

import shutil
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import Base
from app.db.locking import lock_investigation_transaction
from app.models.domain import Document, Investigation
from app.services.security import resolve_storage_root


def _contained_existing_path(root: Path, raw: str) -> Path:
    path = Path(raw).expanduser().resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Document path escapes configured storage root: {raw}") from exc
    return path


def _collect_investigation_rows(db: Session, investigation_id: str) -> dict[str, set[Any]]:
    """Collect all PKs reachable *downstream* from one investigation via foreign keys.

    This intentionally walks child->parent FK relationships in reverse: once a parent row is
    selected, rows whose foreign key points at that selected parent are included. That keeps the
    delete graph future-proof as new investigation-owned tables are added.
    """
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise ValueError("Investigation not found")

    metadata = Base.metadata
    selected: dict[str, set[Any]] = defaultdict(set)
    selected[Investigation.__tablename__].add(investigation_id)

    changed = True
    while changed:
        changed = False
        for table in metadata.tables.values():
            pk_cols = list(table.primary_key.columns)
            if len(pk_cols) != 1:
                continue
            pk = pk_cols[0]
            clauses = []
            for fk in table.foreign_keys:
                parent_ids = selected.get(fk.column.table.name)
                if parent_ids:
                    clauses.append(fk.parent.in_(parent_ids))
            if not clauses:
                continue
            from sqlalchemy import or_
            rows = db.execute(select(pk).where(or_(*clauses))).scalars().all()
            before = len(selected[table.name])
            selected[table.name].update(rows)
            if len(selected[table.name]) != before:
                changed = True
    return dict(selected)


def preview_investigation_deletion(db: Session, investigation_id: str, storage_root: str | Path) -> dict[str, Any]:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise ValueError("Investigation not found")

    root = resolve_storage_root(storage_root)
    rows = _collect_investigation_rows(db, investigation_id)
    counts = {name: len(ids) for name, ids in sorted(rows.items()) if ids}

    documents = db.scalars(select(Document).where(Document.investigation_id == investigation_id)).all()
    all_other_paths = {
        str(Path(p).expanduser().resolve())
        for p in db.scalars(select(Document.storage_path).where(Document.investigation_id != investigation_id)).all()
        if p
    }

    files = []
    unsafe_paths = []
    shared = 0
    existing = 0
    missing = 0
    for doc in documents:
        try:
            path = _contained_existing_path(root, doc.storage_path)
            rel = str(path.relative_to(root))
            is_shared = str(path) in all_other_paths
            exists = path.is_file()
            if is_shared:
                shared += 1
            elif exists:
                existing += 1
            else:
                missing += 1
            files.append({
                "document_id": doc.id,
                "relative_path": rel,
                "exists": exists,
                "shared_with_other_investigation": is_shared,
                "action": "preserve_shared" if is_shared else ("delete" if exists else "already_missing"),
            })
        except ValueError as exc:
            unsafe_paths.append({"document_id": doc.id, "storage_path": doc.storage_path, "error": str(exc)})

    return {
        "investigation_id": investigation_id,
        "investigation_name": inv.name,
        "record_counts": counts,
        "record_total": sum(counts.values()),
        "document_files": files,
        "document_file_summary": {
            "delete": existing,
            "preserve_shared": shared,
            "already_missing": missing,
            "unsafe": len(unsafe_paths),
        },
        "unsafe_paths": unsafe_paths,
        "can_delete": not unsafe_paths,
        "requires_confirmation": investigation_id,
    }


def delete_investigation(db: Session, investigation_id: str, storage_root: str | Path, *, confirmation: str) -> dict[str, Any]:
    if confirmation != investigation_id:
        raise ValueError("Deletion confirmation must exactly match the investigation ID")

    # PostgreSQL: serialize restore/delete operations for this investigation before
    # previewing mutable state. The transaction-scoped advisory lock also works when
    # a concurrent restore is racing to create the investigation row.
    lock_investigation_transaction(db, investigation_id)

    preview = preview_investigation_deletion(db, investigation_id, storage_root)
    if not preview["can_delete"]:
        raise ValueError("Investigation contains document paths outside the configured storage root")

    root = resolve_storage_root(storage_root)
    root.mkdir(parents=True, exist_ok=True)
    trash_root = root / ".delete-staging" / uuid.uuid4().hex
    staged: list[tuple[Path, Path]] = []

    try:
        # Move only investigation-owned files to same-filesystem staging. Shared files are preserved.
        for item in preview["document_files"]:
            if item["action"] != "delete":
                continue
            original = (root / item["relative_path"]).resolve()
            # Recheck containment and sharing immediately before mutation.
            _contained_existing_path(root, str(original))
            other_paths = db.scalars(
                select(Document.storage_path).where(Document.investigation_id != investigation_id)
            ).all()
            if any(str(Path(raw).expanduser().resolve()) == str(original) for raw in other_paths if raw):
                continue
            if not original.exists():
                continue
            staged_path = trash_root / item["relative_path"]
            staged_path.parent.mkdir(parents=True, exist_ok=True)
            original.replace(staged_path)
            staged.append((original, staged_path))

        rows = _collect_investigation_rows(db, investigation_id)
        deleted_counts: dict[str, int] = {}
        # SQLAlchemy metadata.sorted_tables is parent-first, so reverse it for safe deletes.
        for table in reversed(Base.metadata.sorted_tables):
            ids = rows.get(table.name)
            if not ids:
                continue
            pk_cols = list(table.primary_key.columns)
            if len(pk_cols) != 1:
                continue
            result = db.execute(table.delete().where(pk_cols[0].in_(ids)))
            deleted_counts[table.name] = int(result.rowcount or 0)
        db.commit()
    except Exception:
        db.rollback()
        for original, staged_path in reversed(staged):
            if staged_path.exists():
                original.parent.mkdir(parents=True, exist_ok=True)
                staged_path.replace(original)
        shutil.rmtree(trash_root, ignore_errors=True)
        staging_parent = root / ".delete-staging"
        try:
            staging_parent.rmdir()
        except OSError:
            pass
        raise

    shutil.rmtree(trash_root, ignore_errors=True)
    staging_parent = root / ".delete-staging"
    try:
        staging_parent.rmdir()
    except OSError:
        pass

    return {
        "investigation_id": investigation_id,
        "deleted": True,
        "deleted_record_counts": deleted_counts,
        "deleted_record_total": sum(deleted_counts.values()),
        "document_files_deleted": len(staged),
        "shared_document_files_preserved": preview["document_file_summary"]["preserve_shared"],
        "missing_document_files": preview["document_file_summary"]["already_missing"],
    }


def preview_orphan_document_files(db: Session, storage_root: str | Path) -> dict[str, Any]:
    """Report regular files under document storage that no Document row references.

    This is deliberately read-only. Cleanup must remain an explicit later action so a reporter
    can inspect unexpected files before anything is removed. Internal transient staging trees
    are excluded from the report.
    """
    root = resolve_storage_root(storage_root)
    root.mkdir(parents=True, exist_ok=True)
    referenced: set[str] = set()
    unsafe_references: list[dict[str, str]] = []
    for document_id, raw in db.execute(select(Document.id, Document.storage_path)).all():
        if not raw:
            continue
        try:
            referenced.add(str(_contained_existing_path(root, raw)))
        except ValueError as exc:
            unsafe_references.append({"document_id": str(document_id), "storage_path": str(raw), "error": str(exc)})

    ignored_top_level = {".delete-staging", ".restore-staging", ".upload-staging"}
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if rel.parts and rel.parts[0] in ignored_top_level:
            continue
        resolved = str(path.resolve())
        if resolved in referenced:
            continue
        stat = path.stat()
        files.append({
            "relative_path": str(rel),
            "size_bytes": int(stat.st_size),
            "modified_at": float(stat.st_mtime),
            "action": "retain_until_explicit_cleanup",
        })

    return {
        "storage_root": str(root),
        "orphan_files": files,
        "orphan_file_count": len(files),
        "orphan_bytes": sum(item["size_bytes"] for item in files),
        "unsafe_document_references": unsafe_references,
        "cleanup_available": False,
        "policy": "preview_only_retain_by_default",
    }
