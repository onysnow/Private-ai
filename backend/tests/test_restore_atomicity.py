from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.main import app
from app.models.domain import Investigation
from app.services.exports import build_investigation_export, restore_investigation_export


def _memory_session():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return engine, Session(engine)


def test_failed_restore_rolls_back_database_and_document_files(tmp_path, monkeypatch):
    source_engine, source_db = _memory_session()
    app.dependency_overrides[get_db] = lambda: (yield source_db)
    client = TestClient(app)
    inv = client.post('/api/investigations', json={'name': 'Atomic restore source'}).json()
    uploaded = client.post(
        '/api/documents/upload',
        data={'investigation_id': inv['id'], 'title': 'Primary memo'},
        files={'file': ('memo.txt', b'Exact source text for restore atomicity.', 'text/plain')},
    )
    assert uploaded.status_code == 200, uploaded.text
    package, _ = build_investigation_export(source_db, inv['id'], include_documents=True)
    app.dependency_overrides.clear()
    source_db.close(); source_engine.dispose()

    target_engine, target_db = _memory_session()
    real_commit = target_db.commit
    def fail_commit():
        raise RuntimeError('simulated database commit failure')
    monkeypatch.setattr(target_db, 'commit', fail_commit)

    storage = tmp_path / 'restored-documents'
    with pytest.raises(RuntimeError, match='simulated database commit failure'):
        restore_investigation_export(target_db, package, storage)

    # Restore failure must leave neither canonical DB rows nor raw document artifacts.
    assert target_db.scalar(select(Investigation).where(Investigation.id == inv['id'])) is None
    assert not list(storage.rglob('*.txt'))
    investigation_dir = storage / inv['id']
    assert not investigation_dir.exists()

    monkeypatch.setattr(target_db, 'commit', real_commit)
    target_db.close(); target_engine.dispose()
