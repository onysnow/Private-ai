from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.domain import Investigation, Source, Document
from app.services.lifecycle import preview_orphan_document_files


def _db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine, Session(engine)


def test_orphan_preview_is_read_only_and_excludes_referenced_and_staging_files(tmp_path: Path):
    engine, db = _db()
    inv = Investigation(name='Retention audit')
    db.add(inv); db.flush()
    source = Source(investigation_id=inv.id, title='Known document', source_type='document')
    db.add(source); db.flush()

    known = tmp_path / 'known.txt'; known.write_text('known', encoding='utf-8')
    orphan = tmp_path / 'orphan.bin'; orphan.write_bytes(b'12345')
    staging = tmp_path / '.delete-staging' / 'temporary.bin'
    staging.parent.mkdir(parents=True); staging.write_bytes(b'ignore')

    db.add(Document(
        investigation_id=inv.id,
        source_id=source.id,
        filename='known.txt',
        sha256='0' * 64,
        storage_path=str(known),
        extraction_status='complete',
    ))
    db.commit()

    result = preview_orphan_document_files(db, tmp_path)
    assert result['orphan_file_count'] == 1
    assert result['orphan_bytes'] == 5
    assert result['orphan_files'][0]['relative_path'] == 'orphan.bin'
    assert result['cleanup_available'] is False
    assert result['policy'] == 'preview_only_retain_by_default'
    assert known.exists() and orphan.exists() and staging.exists()

    db.close(); engine.dispose()
