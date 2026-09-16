from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.mutation_guard import collect_mutation_investigation_ids, lock_pending_investigation_mutations
from app.db.session import Base
from app.models.domain import Claim, ClaimEvidenceLink, Entity, Evidence, Investigation, Lead, LeadProfile, Source, Statement


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def test_collects_directly_scoped_canonical_write():
    db = _db()
    inv = Investigation(id="inv-a", name="A")
    db.add(inv); db.commit()
    claim = Claim(investigation_id=inv.id, text="A claim")
    db.add(claim)
    assert collect_mutation_investigation_ids(db) == {"inv-a"}
    db.close()


def test_resolves_leaf_only_provenance_and_workflow_writes():
    db = _db()
    inv = Investigation(id="inv-leaf", name="Leaf")
    entity = Entity(id="entity-1", investigation_id=inv.id, ftm_id="e", schema="Person", caption="Person", properties={})
    source = Source(id="source-1", investigation_id=inv.id, title="Source")
    claim = Claim(id="claim-1", investigation_id=inv.id, text="Claim")
    lead = Lead(id="lead-1", investigation_id=inv.id, title="Lead")
    db.add_all([inv, entity, source, claim, lead]); db.commit()

    evidence = Evidence(id="ev-1", source_id=source.id, quote="quote")
    db.add(evidence); db.commit()

    leaves = [
        Statement(entity_id=entity.id, prop="name", value="Person", dataset="reporter"),
        ClaimEvidenceLink(claim_id=claim.id, evidence_id=evidence.id, stance="supports"),
        LeadProfile(lead_id=lead.id),
    ]
    assert collect_mutation_investigation_ids(db, leaves) == {"inv-leaf"}
    db.close()


def test_postgres_guard_locks_multiple_investigations_in_sorted_order(monkeypatch):
    calls = []

    class FakeDB:
        new = []
        dirty = []
        deleted = []
        def get_bind(self):
            return SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    monkeypatch.setattr(
        "app.db.mutation_guard.collect_mutation_investigation_ids",
        lambda db: {"inv-z", "inv-a", "inv-m"},
    )
    monkeypatch.setattr(
        "app.db.mutation_guard.lock_investigation_transaction",
        lambda db, investigation_id: calls.append(investigation_id),
    )

    lock_pending_investigation_mutations(FakeDB())
    assert calls == ["inv-a", "inv-m", "inv-z"]


def test_sqlite_guard_is_noop(monkeypatch):
    calls = []

    class FakeDB:
        def get_bind(self):
            return SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))

    monkeypatch.setattr(
        "app.db.mutation_guard.collect_mutation_investigation_ids",
        lambda db: calls.append("collected") or {"inv-a"},
    )
    lock_pending_investigation_mutations(FakeDB())
    assert calls == []
