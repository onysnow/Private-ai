from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.db.locking import investigation_lock_key, lock_investigation_transaction
from app.services import exports, lifecycle


class _FakeSession:
    def __init__(self, dialect_name: str):
        self._bind = SimpleNamespace(dialect=SimpleNamespace(name=dialect_name))
        self.calls: list[tuple[str, dict | None]] = []

    def get_bind(self):
        return self._bind

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        return SimpleNamespace()


def test_postgres_advisory_lock_is_stable_signed_bigint_and_transaction_scoped():
    investigation_id = "investigation-123"
    key = investigation_lock_key(investigation_id)
    assert key == investigation_lock_key(investigation_id)
    assert -(2**63) <= key <= (2**63 - 1)
    assert key != investigation_lock_key("investigation-124")

    db = _FakeSession("postgresql")
    lock_investigation_transaction(db, investigation_id)
    assert len(db.calls) == 1
    sql, params = db.calls[0]
    assert "pg_advisory_xact_lock" in sql
    assert params == {"lock_key": key}


def test_non_postgres_lock_is_noop():
    db = _FakeSession("sqlite")
    lock_investigation_transaction(db, "investigation-123")
    assert db.calls == []


def test_restore_acquires_lock_before_mutable_preview(monkeypatch, tmp_path):
    order: list[str] = []
    inv_id = "restore-race-id"

    monkeypatch.setattr(exports, "inspect_export", lambda data: ({"investigation": {"id": inv_id}}, {}))
    monkeypatch.setattr(exports, "lock_investigation_transaction", lambda db, target: order.append(f"lock:{target}"))

    def fake_preview(db, data, root):
        order.append("preview")
        return {
            "can_restore": False,
            "conflicts": [{"message": "simulated conflict"}],
            "investigation": {"id": inv_id},
        }

    monkeypatch.setattr(exports, "preview_investigation_restore", fake_preview)
    with pytest.raises(ValueError, match="simulated conflict"):
        exports.restore_investigation_export(object(), b"not-a-real-export", tmp_path)
    assert order == [f"lock:{inv_id}", "preview"]


def test_delete_acquires_lock_before_mutable_preview(monkeypatch, tmp_path):
    order: list[str] = []
    inv_id = "delete-race-id"

    monkeypatch.setattr(lifecycle, "lock_investigation_transaction", lambda db, target: order.append(f"lock:{target}"))

    def fake_preview(db, target, root):
        order.append("preview")
        return {"can_delete": False, "unsafe_paths": [{"error": "simulated unsafe path"}]}

    monkeypatch.setattr(lifecycle, "preview_investigation_deletion", fake_preview)
    with pytest.raises(ValueError, match="outside"):
        lifecycle.delete_investigation(object(), inv_id, tmp_path, confirmation=inv_id)
    assert order == [f"lock:{inv_id}", "preview"]


def test_postgres_export_snapshot_uses_repeatable_read_and_shared_lock(monkeypatch):
    import app.db.locking as locking

    class _SnapshotSession(_FakeSession):
        def __init__(self, bind=None):
            super().__init__("postgresql")
            self._bind = bind
            self.rolled_back = False
            self.closed = False

        def rollback(self):
            self.rolled_back = True

        def close(self):
            self.closed = True

    source = _FakeSession("postgresql")
    created: list[_SnapshotSession] = []

    def fake_session(*, bind):
        row = _SnapshotSession(bind=bind)
        created.append(row)
        return row

    monkeypatch.setattr(locking, "Session", fake_session)
    inv_id = "export-snapshot-id"
    with locking.investigation_export_snapshot(source, inv_id) as snapshot:
        assert snapshot is created[0]
        assert source.calls == []

    assert len(created) == 1
    statements = [sql for sql, _ in created[0].calls]
    assert statements[0] == "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    assert "pg_advisory_xact_lock_shared" in statements[1]
    assert created[0].calls[1][1] == {"lock_key": investigation_lock_key(inv_id)}
    assert created[0].rolled_back is True
    assert created[0].closed is True


def test_sqlite_export_snapshot_reuses_caller_session():
    import app.db.locking as locking

    source = _FakeSession("sqlite")
    with locking.investigation_export_snapshot(source, "local-export") as snapshot:
        assert snapshot is source
    assert source.calls == []


def test_export_build_enters_snapshot_before_collecting(monkeypatch):
    from contextlib import contextmanager

    order: list[str] = []
    supplied_db = object()
    snapshot_db = object()

    @contextmanager
    def fake_snapshot(db, investigation_id):
        assert db is supplied_db
        order.append(f"snapshot:{investigation_id}")
        yield snapshot_db
        order.append("snapshot-release")

    monkeypatch.setattr(exports, "investigation_export_snapshot", fake_snapshot)

    def fake_build(db, investigation_id, include_documents=True):
        assert db is snapshot_db
        order.append("collect-and-build")
        return b"archive", {"investigation": {"id": investigation_id}}

    monkeypatch.setattr(exports, "_build_investigation_export_snapshot", fake_build)
    payload, manifest = exports.build_investigation_export(supplied_db, "export-order-id", True)
    assert payload == b"archive"
    assert manifest["investigation"]["id"] == "export-order-id"
    assert order == ["snapshot:export-order-id", "collect-and-build", "snapshot-release"]
