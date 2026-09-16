from __future__ import annotations

import hashlib
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.orm import Session


def investigation_lock_key(investigation_id: str) -> int:
    """Return a stable signed 64-bit PostgreSQL advisory-lock key.

    PostgreSQL transaction advisory locks accept BIGINT keys. Hashing the public
    investigation identifier avoids assumptions about whether IDs remain UUIDs and
    lets restore serialize before the investigation row exists.
    """
    digest = hashlib.sha256(investigation_id.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def lock_investigation_transaction(db: Session, investigation_id: str) -> None:
    """Serialize destructive operations for one investigation on PostgreSQL.

    The lock is transaction-scoped and therefore releases automatically on commit or
    rollback. SQLite is intentionally a no-op: its write-locking model differs and the
    local test/development path should not depend on PostgreSQL-only functions.
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return
    db.execute(
        text("SELECT pg_advisory_xact_lock(:lock_key)"),
        {"lock_key": investigation_lock_key(investigation_id)},
    )


@contextmanager
def investigation_export_snapshot(db: Session, investigation_id: str) -> Iterator[Session]:
    """Yield a transactionally consistent export session.

    PostgreSQL READ COMMITTED can return a different committed database snapshot for
    each SELECT. Investigation export performs many SELECTs, so a reporter edit that
    commits halfway through export could otherwise create a mixed-state backup.

    A dedicated REPEATABLE READ, READ ONLY transaction gives every export SELECT the
    same MVCC snapshot. A shared transaction advisory lock coordinates with the
    exclusive lock used by restore/delete, preventing document files from being
    removed while an export that references them is still being assembled. Ordinary
    reporter writes do not take this advisory lock and therefore remain non-blocking;
    they simply become visible to the next export.

    SQLite keeps using the caller's session because its local locking/snapshot model
    differs and it does not support the PostgreSQL transaction/advisory statements.
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        yield db
        return

    snapshot = Session(bind=bind)
    try:
        snapshot.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
        snapshot.execute(
            text("SELECT pg_advisory_xact_lock_shared(:lock_key)"),
            {"lock_key": investigation_lock_key(investigation_id)},
        )
        yield snapshot
    finally:
        # Read-only work can be ended with rollback; this also releases the shared
        # transaction advisory lock and avoids mutating the caller's Session state.
        snapshot.rollback()
        snapshot.close()
