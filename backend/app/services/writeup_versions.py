"""A write-up's version history (research Act §8, mockup ACT_2: 'version "before legal read"').

Three kinds of snapshot, each the whole TipTap document as it stood:
  named           a person named it ("Before legal read")
  auto            taken on its own while someone writes: the text as it was before a save, at most one every
                  AUTO_EVERY, and only when it differs from the newest snapshot
  before_restore  the text just before an older version was restored, so the restore can itself be undone

A snapshot is never edited. Restoring copies a snapshot's text back into the write-up (a new save), after first
taking a before_restore snapshot. Only the newest KEEP_AUTO automatic snapshots are kept; named ones stay.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Writeup, WriteupVersion

AUTO_EVERY = timedelta(minutes=10)
KEEP_AUTO = 30


def _words(content: dict | None) -> int:
    from app.services.writeups import extract_plain_text

    return len(extract_plain_text(content or {}).split())


def _empty(content: dict | None) -> bool:
    return _words(content) == 0 and not any(True for _ in _citations(content))


def _citations(content: Any) -> Any:
    if isinstance(content, dict):
        if content.get("type") == "citation":
            yield content
        for child in content.get("content") or []:
            yield from _citations(child)


def serialize_version(row: WriteupVersion, *, include_content: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {"id": row.id, "writeup_id": row.writeup_id, "name": row.name, "kind": row.kind,
                            "word_count": row.word_count, "created_at": row.created_at}
    if include_content:
        data["content_json"] = row.content_json or {}
    return data


def list_versions(db: Session, writeup: Writeup) -> list[WriteupVersion]:
    return list(db.scalars(select(WriteupVersion).where(WriteupVersion.writeup_id == writeup.id)
                           .order_by(WriteupVersion.created_at.desc(), WriteupVersion.id.desc())))


def latest_named(db: Session, writeup: Writeup) -> WriteupVersion | None:
    return db.scalar(select(WriteupVersion).where(WriteupVersion.writeup_id == writeup.id, WriteupVersion.kind == "named")
                     .order_by(WriteupVersion.created_at.desc(), WriteupVersion.id.desc()).limit(1))


def _add(db: Session, writeup: Writeup, *, kind: str, name: str | None, content: dict) -> WriteupVersion:
    import copy

    row = WriteupVersion(investigation_id=writeup.investigation_id, writeup_id=writeup.id, name=name, kind=kind,
                         content_json=copy.deepcopy(content or {}), word_count=_words(content), created_at=utcnow_naive())
    db.add(row)
    db.flush()
    return row


def name_version(db: Session, writeup: Writeup, name: str) -> WriteupVersion:
    """A person names the write-up as it stands now."""
    name = " ".join((name or "").split())
    if not name:
        raise ValueError("A named version needs a name")
    row = _add(db, writeup, kind="named", name=name[:200], content=writeup.content_json or {})
    db.commit()
    return row


def auto_snapshot_before_save(db: Session, writeup: Writeup, new_content: dict | None) -> WriteupVersion | None:
    """Called before a save replaces the text: keep the text as it was, unless a snapshot was taken within
    AUTO_EVERY, the text is not changing, it is empty, or it equals the newest snapshot. Does not commit."""
    old = writeup.content_json or {}
    if new_content is None or new_content == old or _empty(old):
        return None
    newest = db.scalar(select(WriteupVersion).where(WriteupVersion.writeup_id == writeup.id)
                       .order_by(WriteupVersion.created_at.desc(), WriteupVersion.id.desc()).limit(1))
    if newest is not None and (utcnow_naive() - newest.created_at < AUTO_EVERY or newest.content_json == old):
        return None
    row = _add(db, writeup, kind="auto", name=None, content=old)
    autos = list(db.scalars(select(WriteupVersion).where(WriteupVersion.writeup_id == writeup.id, WriteupVersion.kind == "auto")
                            .order_by(WriteupVersion.created_at.desc(), WriteupVersion.id.desc())))
    for stale in autos[KEEP_AUTO:]:
        db.delete(stale)
    return row


def restore_version(db: Session, writeup: Writeup, version: WriteupVersion) -> WriteupVersion:
    """Put an older version's text back. The text it replaces is kept first as a before_restore snapshot."""
    from app.services.writeups import update_writeup

    if version.writeup_id != writeup.id:
        raise ValueError("That version belongs to another write-up")
    label = version.name or f"automatic, {version.created_at:%d %b %H:%M}"
    kept = _add(db, writeup, kind="before_restore", name=f"Before restoring “{label}”"[:200], content=writeup.content_json or {})
    update_writeup(db, writeup, {"content_json": version.content_json or {}}, snapshot=False)
    return kept


def delete_versions(db: Session, writeup: Writeup) -> None:
    for row in db.scalars(select(WriteupVersion).where(WriteupVersion.writeup_id == writeup.id)):
        db.delete(row)
    db.flush()
