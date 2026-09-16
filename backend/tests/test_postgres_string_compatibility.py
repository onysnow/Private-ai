import hashlib
import io
import json
import zipfile

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.domain import Investigation
from app.services.exports import build_investigation_export, restore_investigation_export


def _memory_session():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine, Session(engine)


def _rewrite_backup_database(package: bytes, mutate) -> bytes:
    with zipfile.ZipFile(io.BytesIO(package), 'r') as source:
        files = {info.filename: source.read(info.filename) for info in source.infolist()}
    records = json.loads(files['data/database.json'])
    mutate(records)
    database_raw = json.dumps(records, sort_keys=True, separators=(',', ':')).encode('utf-8')
    files['data/database.json'] = database_raw
    manifest = json.loads(files['manifest.json'])
    manifest['checksums']['data/database.json'] = hashlib.sha256(database_raw).hexdigest()
    files['manifest.json'] = json.dumps(manifest, sort_keys=True, indent=2).encode('utf-8')

    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as target:
        for name, raw in files.items():
            target.writestr(name, raw)
    return out.getvalue()


def test_sqlite_enforces_modeled_varchar_limit_before_flush():
    engine, db = _memory_session()
    try:
        exact = Investigation(name='x' * 255)
        db.add(exact)
        db.flush()
        assert exact.id
        db.rollback()

        oversized = Investigation(name='x' * 256)
        db.add(oversized)
        with pytest.raises(ValueError, match=r'Investigation\.name exceeds VARCHAR\(255\)'):
            db.flush()
        db.rollback()
        assert db.scalar(select(Investigation)) is None
    finally:
        db.close(); engine.dispose()


def test_restore_rejects_postgres_incompatible_varchar_before_commit(tmp_path):
    source_engine, source_db = _memory_session()
    try:
        inv = Investigation(name='Portable case')
        source_db.add(inv); source_db.commit()
        package, _ = build_investigation_export(source_db, inv.id, include_documents=True)
    finally:
        source_db.close(); source_engine.dispose()

    package = _rewrite_backup_database(
        package,
        lambda records: records['investigations'][0].__setitem__('name', 'y' * 256),
    )

    target_engine = create_engine(f"sqlite:///{tmp_path / 'target.db'}", connect_args={'check_same_thread': False})
    Base.metadata.create_all(target_engine)
    TargetSession = sessionmaker(bind=target_engine, autoflush=False, autocommit=False)
    storage = tmp_path / 'documents'
    try:
        with TargetSession() as db:
            with pytest.raises(ValueError, match=r'Investigation\.name exceeds VARCHAR\(255\)'):
                restore_investigation_export(db, package, storage)
            assert db.scalar(select(Investigation)) is None
        assert not list(storage.rglob('*')) if storage.exists() else True
    finally:
        target_engine.dispose()
