from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.domain import (
    Investigation, Source, Evidence, Claim, ClaimEvidenceLink, Entity, Statement,
    Document, DocumentChunk, ExtractionCandidate,
)
from app.services.lifecycle import preview_investigation_deletion, delete_investigation


def _db():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine, Session(engine)


def _seed(db: Session, root: Path, *, name='Delete me', shared_path: Path | None = None):
    inv = Investigation(name=name); db.add(inv); db.flush()
    source = Source(investigation_id=inv.id, title='Memo', source_type='document'); db.add(source); db.flush()
    evidence = Evidence(source_id=source.id, quote='Exact quote', locator='page 2'); db.add(evidence); db.flush()
    claim = Claim(investigation_id=inv.id, text='Test claim', status='unverified'); db.add(claim); db.flush()
    db.add(ClaimEvidenceLink(claim_id=claim.id, evidence_id=evidence.id, stance='supports'))
    entity = Entity(investigation_id=inv.id, ftm_id='x', schema='Person', caption='Test Person', properties={'name':['Test Person']}); db.add(entity); db.flush()
    db.add(Statement(entity_id=entity.id, prop='name', value='Test Person', dataset='reporter'))
    path = shared_path or root / f'{inv.id}.txt'; path.parent.mkdir(parents=True, exist_ok=True); path.write_text('raw source')
    doc = Document(investigation_id=inv.id, source_id=source.id, filename='memo.txt', sha256='0'*64, storage_path=str(path), extraction_status='complete'); db.add(doc); db.flush()
    chunk = DocumentChunk(document_id=doc.id, locator='line 1', ordinal=1, text='raw source'); db.add(chunk); db.flush()
    db.add(ExtractionCandidate(investigation_id=inv.id, document_id=doc.id, chunk_id=chunk.id, candidate_type='evidence', payload={'quote':'raw source'}, confidence=1.0))
    db.commit()
    return inv.id, path


def test_preview_and_delete_remove_entire_graph_and_raw_file(tmp_path):
    engine, db = _db()
    inv_id, path = _seed(db, tmp_path)
    preview = preview_investigation_deletion(db, inv_id, tmp_path)
    assert preview['can_delete'] is True
    assert preview['document_file_summary']['delete'] == 1
    assert preview['record_counts']['investigations'] == 1
    assert preview['record_counts']['document_chunks'] == 1
    assert preview['record_counts']['claim_evidence_links'] == 1

    result = delete_investigation(db, inv_id, tmp_path, confirmation=inv_id)
    assert result['deleted'] is True
    assert result['document_files_deleted'] == 1
    assert not path.exists()
    assert db.get(Investigation, inv_id) is None
    assert db.scalar(select(Source)) is None
    assert db.scalar(select(Evidence)) is None
    assert db.scalar(select(DocumentChunk)) is None
    db.close(); engine.dispose()


def test_shared_document_file_is_preserved(tmp_path):
    engine, db = _db()
    shared = tmp_path / 'shared.txt'
    first_id, _ = _seed(db, tmp_path, name='First', shared_path=shared)
    second = Investigation(name='Second'); db.add(second); db.flush()
    source2 = Source(investigation_id=second.id, title='Same bytes', source_type='document'); db.add(source2); db.flush()
    db.add(Document(investigation_id=second.id, source_id=source2.id, filename='shared.txt', sha256='0'*64, storage_path=str(shared), extraction_status='complete'))
    db.commit()

    preview = preview_investigation_deletion(db, first_id, tmp_path)
    assert preview['document_file_summary']['preserve_shared'] == 1
    result = delete_investigation(db, first_id, tmp_path, confirmation=first_id)
    assert result['shared_document_files_preserved'] == 1
    assert shared.read_text() == 'raw source'
    assert db.get(Investigation, second.id) is not None
    db.close(); engine.dispose()


def test_bad_confirmation_and_outside_root_fail_closed(tmp_path):
    engine, db = _db()
    inv_id, path = _seed(db, tmp_path)
    with pytest.raises(ValueError, match='confirmation'):
        delete_investigation(db, inv_id, tmp_path, confirmation='wrong')
    assert path.exists() and db.get(Investigation, inv_id) is not None

    outside = tmp_path.parent / 'outside-jw-delete-test.txt'; outside.write_text('do not touch')
    doc = db.scalar(select(Document).where(Document.investigation_id == inv_id)); doc.storage_path = str(outside); db.commit()
    preview = preview_investigation_deletion(db, inv_id, tmp_path)
    assert preview['can_delete'] is False and preview['unsafe_paths']
    with pytest.raises(ValueError, match='outside'):
        delete_investigation(db, inv_id, tmp_path, confirmation=inv_id)
    assert outside.exists() and db.get(Investigation, inv_id) is not None
    outside.unlink(missing_ok=True)
    db.close(); engine.dispose()


def test_commit_failure_restores_staged_file_and_database(tmp_path, monkeypatch):
    engine, db = _db()
    inv_id, path = _seed(db, tmp_path)
    real_commit = db.commit
    def fail_commit():
        raise RuntimeError('simulated delete commit failure')
    monkeypatch.setattr(db, 'commit', fail_commit)
    with pytest.raises(RuntimeError, match='simulated delete commit failure'):
        delete_investigation(db, inv_id, tmp_path, confirmation=inv_id)
    assert path.exists()
    assert db.get(Investigation, inv_id) is not None
    assert not (tmp_path / '.delete-staging').exists()
    monkeypatch.setattr(db, 'commit', real_commit)
    db.close(); engine.dispose()


# --- the OpenAleph casefile goes with the investigation ------------------------

class _AlephError(Exception):
    """Shaped like openaleph_client's AlephException: the HTTP status on ``status``."""

    def __init__(self, status: int):
        super().__init__(f"HTTP {status}")
        self.status = status


class _Client:
    def __init__(self, fail_with: int | None = None):
        self.fail_with = fail_with
        self.deleted: list[tuple[str, bool]] = []

    def delete_collection(self, collection_id: str, sync: bool = False):
        if self.fail_with is not None:
            raise _AlephError(self.fail_with)
        self.deleted.append((collection_id, sync))


def _bind(db: Session, inv_id: str) -> None:
    from app.models.domain import InvestigationCorpusBinding
    db.add(InvestigationCorpusBinding(investigation_id=inv_id, provider='openaleph', collection_id='42',
                                      foreign_id='fid-42', collection_label='Delete me', status='active'))
    db.commit()


@pytest.fixture
def openaleph_on(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, 'openaleph_enabled', True)


def test_the_casefile_is_named_in_the_preview_and_deleted_after_the_investigation(tmp_path, openaleph_on):
    _engine, db = _db()
    inv_id, _path = _seed(db, tmp_path)
    _bind(db, inv_id)
    assert preview_investigation_deletion(db, inv_id, tmp_path)['openaleph_collection'] == {'collection_id': '42', 'label': 'Delete me'}

    client = _Client()
    result = delete_investigation(db, inv_id, tmp_path, confirmation=inv_id, openaleph_client_factory=lambda: client)
    assert client.deleted == [('42', False)]   # OpenAleph queues the removal in its own worker
    assert result['openaleph_collection'] == {'collection_id': '42', 'label': 'Delete me', 'deleted': True, 'detail': None}
    assert db.get(Investigation, inv_id) is None


def test_a_casefile_already_gone_counts_as_deleted(tmp_path, openaleph_on):
    _engine, db = _db()
    inv_id, _path = _seed(db, tmp_path)
    _bind(db, inv_id)
    result = delete_investigation(db, inv_id, tmp_path, confirmation=inv_id, openaleph_client_factory=lambda: _Client(fail_with=404))
    assert result['openaleph_collection']['deleted'] is True


def test_openaleph_down_never_undoes_the_deletion_and_says_what_is_left(tmp_path, openaleph_on):
    _engine, db = _db()
    inv_id, _path = _seed(db, tmp_path)
    _bind(db, inv_id)
    result = delete_investigation(db, inv_id, tmp_path, confirmation=inv_id, openaleph_client_factory=lambda: _Client(fail_with=503))
    assert result['deleted'] is True and db.get(Investigation, inv_id) is None
    assert result['openaleph_collection']['deleted'] is False
    assert 'delete it in OpenAleph' in result['openaleph_collection']['detail']


def test_openaleph_turned_off_leaves_the_casefile_and_says_so(tmp_path, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, 'openaleph_enabled', False)
    _engine, db = _db()
    inv_id, _path = _seed(db, tmp_path)
    _bind(db, inv_id)
    client = _Client()
    result = delete_investigation(db, inv_id, tmp_path, confirmation=inv_id, openaleph_client_factory=lambda: client)
    assert client.deleted == []
    assert result['openaleph_collection']['deleted'] is False
    assert 'turned off' in result['openaleph_collection']['detail']


def test_no_casefile_no_openaleph_call(tmp_path, openaleph_on):
    _engine, db = _db()
    inv_id, _path = _seed(db, tmp_path)
    assert preview_investigation_deletion(db, inv_id, tmp_path)['openaleph_collection'] is None
    client = _Client()
    result = delete_investigation(db, inv_id, tmp_path, confirmation=inv_id, openaleph_client_factory=lambda: client)
    assert result['openaleph_collection'] is None and client.deleted == []


def test_the_case_is_deleted_by_typing_its_name_exactly(tmp_path):
    engine, db = _db()
    inv_id, path = _seed(db, tmp_path, name='Kestrel SA')
    assert preview_investigation_deletion(db, inv_id, tmp_path)['requires_confirmation'] == 'Kestrel SA'
    # Close is not enough: another case, another casing, part of the name.
    for typed in ('kestrel sa', 'Kestrel', 'Kestrel  SA', ''):
        with pytest.raises(ValueError, match="case's name"):
            delete_investigation(db, inv_id, tmp_path, confirmation=typed)
    assert db.get(Investigation, inv_id) is not None and path.exists()
    # Spaces at either end, as a paste brings, are not part of the name.
    result = delete_investigation(db, inv_id, tmp_path, confirmation=' Kestrel SA ')
    assert result['deleted'] is True and db.get(Investigation, inv_id) is None
    db.close(); engine.dispose()
