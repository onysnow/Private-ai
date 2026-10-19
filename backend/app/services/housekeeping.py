"""Housekeeping: what to do with each stray file (research Keep §12, mockup KEEP-safety-and-data's Housekeeping card).

A stray file is a regular file under the document storage folder that no Document row points to
(lifecycle.preview_orphan_document_files). Per file the reporter can:

- Keep: it stays on disk and is not offered again (kept_stray_files);
- Add back to the case: it becomes a document of the case, read like an upload (the route then queues the reading);
- Delete: it is removed from disk, after the screen has named it and its size and the reporter confirmed.

The client sends paths relative to the storage folder. None is trusted: every path is checked again here against
the folder and the documents table at the moment of the action, and anything that is not a current stray file is
refused before anything is changed.
"""
from __future__ import annotations

import logging
import mimetypes
import re
import uuid
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.domain import Document, KeptStrayFile
from app.services.lifecycle import is_staging_part, referenced_document_paths
from app.services.security import resolve_storage_root

logger = logging.getLogger(__name__)

MAX_PATHS = 500
# Files the app saved carry the first 16 hex characters of their SHA-256 before the name (documents.store_document).
_STORED_PREFIX = re.compile(r"^[0-9a-f]{16}_")


class StrayFileRefused(ValueError):
    """A path that is not a stray file under document storage; nothing was changed."""


def _check_paths(paths: list[str]) -> list[str]:
    if not paths:
        raise StrayFileRefused("Name at least one file")
    if len(paths) > MAX_PATHS:
        raise StrayFileRefused(f"At most {MAX_PATHS} files at a time")
    unique = list(dict.fromkeys(paths))
    return unique


def _stray_path(root: Path, relative_path: str, referenced: set[str]) -> Path:
    """The file a relative path names, when it is a stray file under storage; StrayFileRefused otherwise."""
    refused = StrayFileRefused(f"Not a stray file in the storage folder: {relative_path!r}")
    if not isinstance(relative_path, str) or not relative_path.strip() or "\x00" in relative_path or len(relative_path) > 1024:
        raise refused
    posix, windows = PurePosixPath(relative_path), PureWindowsPath(relative_path)
    if posix.is_absolute() or windows.is_absolute() or windows.drive or relative_path.startswith(("/", "\\")):
        raise refused
    parts = [p for p in re.split(r"[\\/]+", relative_path) if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts) or is_staging_part(parts[0]):
        raise refused
    candidate = root.joinpath(*parts)
    # A link could point anywhere (or at a document's file); Housekeeping never follows one.
    for depth in range(1, len(parts) + 1):
        if root.joinpath(*parts[:depth]).is_symlink():
            raise refused
    resolved = candidate.resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise refused from None
    if not resolved.is_file() or str(resolved) in referenced:
        raise refused
    return resolved


def _strays(db: Session, storage_root: str | Path, paths: list[str]) -> tuple[Path, list[tuple[str, Path]]]:
    root = resolve_storage_root(storage_root)
    referenced, _unsafe = referenced_document_paths(db, root)
    return root, [(rel, _stray_path(root, rel, referenced)) for rel in _check_paths(paths)]


def _relative(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def keep_stray_files(db: Session, storage_root: str | Path, paths: list[str]) -> dict[str, Any]:
    """Keep: the files stay where they are and Housekeeping stops offering them."""
    root, strays = _strays(db, storage_root, paths)
    already = set(db.scalars(select(KeptStrayFile.relative_path)))
    kept = []
    for _rel, path in strays:
        rel = _relative(root, path)
        if rel not in already:
            db.add(KeptStrayFile(relative_path=rel))
            already.add(rel)
        kept.append(rel)
    db.commit()
    return {"kept": kept, "kept_count": len(kept)}


def delete_stray_files(db: Session, storage_root: str | Path, paths: list[str]) -> dict[str, Any]:
    """Delete: every path is checked first (all or nothing), then each file is moved aside, checked once more against
    the documents table (an upload of the same bytes could have started to use it) and removed."""
    root, strays = _strays(db, storage_root, paths)
    deleted: list[dict[str, Any]] = []
    for _rel, path in strays:
        size = path.stat().st_size
        aside = path.with_name(f".{path.name}.{uuid.uuid4().hex}.deleting")
        path.replace(aside)
        db.expire_all()
        if db.scalar(select(Document.id).where(Document.storage_path == str(path)).limit(1)) is not None:
            aside.replace(path)
            logger.warning("A stray file became a document's file while it was being deleted; it was kept")
            continue
        aside.unlink()
        deleted.append({"relative_path": _relative(root, path), "size_bytes": int(size)})
    names = [d["relative_path"] for d in deleted]
    if names:
        db.execute(delete(KeptStrayFile).where(KeptStrayFile.relative_path.in_(names)))
        db.commit()
    logger.info("Housekeeping deleted %d stray file(s), %d bytes", len(deleted), sum(d["size_bytes"] for d in deleted))
    return {"deleted": deleted, "deleted_count": len(deleted), "freed_bytes": sum(d["size_bytes"] for d in deleted)}


def stray_file_for_add_back(db: Session, storage_root: str | Path, relative_path: str) -> tuple[Path, str, str | None]:
    """The stray file a reporter adds back to a case, the name it gets and its type (guessed from the name)."""
    _root, [(_rel, path)] = _strays(db, storage_root, [relative_path])
    filename = _STORED_PREFIX.sub("", path.name) or path.name
    return path, filename, mimetypes.guess_type(filename)[0]


def finish_add_back(db: Session, storage_root: str | Path, stray: Path, document: Document) -> None:
    """After the stray file's bytes became a document: when the document's file is a new copy, the stray original is
    removed (its bytes are now the document's); when the document reuses the stray file itself, nothing is removed."""
    root = resolve_storage_root(storage_root)
    if Path(document.storage_path).resolve() != stray and stray.is_file():
        stray.unlink()
    db.execute(delete(KeptStrayFile).where(KeptStrayFile.relative_path == _relative(root, stray)))
    db.commit()
