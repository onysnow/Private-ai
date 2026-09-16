from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import routes
from app.db.session import Base
from app.models.domain import Document, Investigation, Source
from app.services import documents


def _db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine, Session(engine)


def test_document_ingest_locks_before_rechecking_investigation(monkeypatch, tmp_path):
    order: list[str] = []

    class _MissingInvestigationDb:
        def get(self, model, ident):
            order.append(f'get:{ident}')
            return None

    monkeypatch.setattr(
        documents,
        'lock_investigation_transaction',
        lambda db, investigation_id: order.append(f'lock:{investigation_id}'),
    )

    with pytest.raises(ValueError, match='Investigation not found'):
        documents.ingest_document(
            _MissingInvestigationDb(),
            investigation_id='deleted-id',
            title='Late upload',
            filename='late.txt',
            mime_type='text/plain',
            data=b'should never be persisted',
            storage_dir=tmp_path,
        )

    assert order == ['lock:deleted-id', 'get:deleted-id']
    assert not list(tmp_path.rglob('*'))


def test_source_create_locks_before_rechecking_investigation(monkeypatch):
    order: list[str] = []

    class _MissingInvestigationDb:
        def get(self, model, ident):
            order.append(f'get:{ident}')
            return None

    monkeypatch.setattr(
        routes,
        'lock_investigation_transaction',
        lambda db, investigation_id: order.append(f'lock:{investigation_id}'),
    )

    with pytest.raises(HTTPException) as exc:
        routes.create_source(SimpleNamespace(investigation_id='deleted-id'), _MissingInvestigationDb())

    assert exc.value.status_code == 404
    assert order == ['lock:deleted-id', 'get:deleted-id']


def test_failed_document_commit_removes_new_file_and_rows(monkeypatch, tmp_path):
    engine, db = _db()
    inv = Investigation(name='Upload rollback')
    db.add(inv)
    db.commit()

    real_commit = db.commit

    def fail_commit():
        raise RuntimeError('simulated upload commit failure')

    monkeypatch.setattr(db, 'commit', fail_commit)
    with pytest.raises(RuntimeError, match='simulated upload commit failure'):
        documents.ingest_document(
            db,
            investigation_id=inv.id,
            title='Atomic memo',
            filename='memo.txt',
            mime_type='text/plain',
            data=b'NiSource Inc. announced a documented infrastructure program.',
            storage_dir=tmp_path,
        )

    # A failed relational commit must not leave either canonical rows or raw bytes.
    assert db.scalar(select(Source).where(Source.investigation_id == inv.id)) is None
    assert db.scalar(select(Document).where(Document.investigation_id == inv.id)) is None
    assert not list(tmp_path.glob('*.txt'))
    assert not (tmp_path / '.upload-staging').exists()

    monkeypatch.setattr(db, 'commit', real_commit)
    db.close(); engine.dispose()


def test_failed_duplicate_document_commit_never_deletes_preexisting_shared_bytes(monkeypatch, tmp_path):
    engine, db = _db()
    inv = Investigation(name='Existing bytes')
    db.add(inv)
    db.commit()

    data = b'Existing immutable source bytes.'
    digest = documents.sha256_bytes(data)
    existing = tmp_path / f'{digest[:16]}_same.txt'
    existing.write_bytes(data)

    real_commit = db.commit

    def fail_commit():
        raise RuntimeError('simulated duplicate upload commit failure')

    monkeypatch.setattr(db, 'commit', fail_commit)
    with pytest.raises(RuntimeError, match='simulated duplicate upload commit failure'):
        documents.ingest_document(
            db,
            investigation_id=inv.id,
            title='Duplicate memo',
            filename='same.txt',
            mime_type='text/plain',
            data=data,
            storage_dir=tmp_path,
        )

    assert existing.read_bytes() == data
    assert db.scalar(select(Document).where(Document.investigation_id == inv.id)) is None
    assert not (tmp_path / '.upload-staging').exists()

    monkeypatch.setattr(db, 'commit', real_commit)
    db.close(); engine.dispose()
