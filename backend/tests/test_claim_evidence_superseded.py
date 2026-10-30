"""A claim's evidence marked superseded by a newer record (app/services/claims.py supersede_claim_evidence): it stays
shown, with what replaced it and why, and stops counting toward the claim everywhere support is counted."""

import hashlib
import io
import json
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.authorization import AuthorizationScope, authorization_scope_context
from app.db.session import Base, SessionLocal
from app.main import app
from app.models.domain import AppUser, Claim, ClaimEvidenceLink, Evidence
from app.services.claims import supersede_claim_evidence, unsupersede_claim_evidence
from app.services.exports import (
    build_investigation_export,
    preview_investigation_restore,
    restore_investigation_export,
)
from tests.claim_helpers import post_claim

client = TestClient(app)


def ok(reply):
    assert reply.status_code == 200, reply.text
    return reply.json()


def _case():
    """A claim supported by an indictment's figure and a later judgment's, each from its own source."""
    inv = ok(client.post("/api/investigations", json={"name": "Superseded case"}))["id"]
    claim = ok(post_claim(client, {"investigation_id": inv, "text": "The fund lost USD 4.5 billion", "status": "supported"}))
    indictment = ok(client.post("/api/sources", json={"investigation_id": inv, "title": "Indictment 2016", "source_type": "court_record"}))
    judgment = ok(client.post("/api/sources", json={"investigation_id": inv, "title": "Judgment 2020", "source_type": "court_record"}))
    old = ok(client.post("/api/evidence", json={"source_id": indictment["id"], "quote": "USD 3.5 billion", "locator": "para 12"}))
    new = ok(client.post("/api/evidence", json={"source_id": judgment["id"], "quote": "USD 4.5 billion", "locator": "para 88"}))
    old_link = ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": old["id"], "stance": "supports"}))
    new_link = ok(client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": new["id"], "stance": "supports"}))
    assert old_link["superseded"] is None
    return inv, claim, old, new, old_link, new_link


def _supersede(claim, link, **body):
    return client.post(f"/api/claims/{claim['id']}/evidence/{link['id']}/supersede", json=body)


def test_superseded_evidence_stays_shown_with_what_replaced_it_and_stops_counting():
    _inv, claim, _old, new, old_link, _new_link = _case()
    before = ok(client.get(f"/api/claims/{claim['id']}/review-workspace"))
    assert before["stance_counts"]["supports"] == 2 and before["source_count"] == 2

    ws = ok(_supersede(claim, old_link, reason="The judgment corrected the figure", by_evidence_id=new["id"]))
    row = next(r for r in ws["evidence"] if r["id"] == old_link["id"])
    assert row["stance"] == "supports"  # the stance it had is kept
    mark = row["superseded"]
    assert mark["by_evidence_id"] == new["id"] and mark["by_label"] == "Judgment 2020" and mark["by_locator"] == "para 88"
    assert mark["reason"] == "The judgment corrected the figure" and mark["at"]
    assert mark["decided_by_id"] == "local-owner"
    assert ws["stance_counts"]["supports"] == 1 and ws["superseded_count"] == 1 and ws["source_count"] == 1
    supporting = next(r for r in ws["done"]["supported"]["rules"] if r["key"] == "supporting")
    assert supporting["state"] == "met" and "1 superseded does not count" in supporting["detail"]

    listed = ok(client.get(f"/api/claims/{claim['id']}/evidence"))
    assert next(r for r in listed if r["id"] == old_link["id"])["superseded"]["reason"]

    undone = ok(client.delete(f"/api/claims/{claim['id']}/evidence/{old_link['id']}/supersede"))
    assert next(r for r in undone["evidence"] if r["id"] == old_link["id"])["superseded"] is None
    assert undone["stance_counts"]["supports"] == 2 and undone["superseded_count"] == 0
    with SessionLocal() as db:
        link = db.get(ClaimEvidenceLink, old_link["id"])
        assert link.superseded_at is None and link.superseded_decided_by_id is None and link.superseded_reason is None


def test_a_claim_whose_only_support_is_superseded_is_not_supported_and_needs_the_replacement():
    inv, claim, _old, _new, old_link, new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected"))
    ws = ok(_supersede(claim, new_link, reason="Withdrawn on appeal"))
    supporting = next(r for r in ws["done"]["supported"]["rules"] if r["key"] == "supporting")
    assert supporting["state"] == "not_met" and "superseded" in supporting["detail"]
    # Missing values: a Supported claim with no support that counts, saying why.
    from app.patterns.missing import gaps

    with SessionLocal() as db:
        found = [g for g in gaps(db, inv) if g.rule == "MV-CLM-EV" and g.record_id == claim["id"]]
    assert found and "all marked superseded" in found[0].blocks


def test_the_reason_is_required_and_the_replacement_is_a_record_of_the_same_case():
    _inv, claim, old, _new, old_link, _new_link = _case()
    assert _supersede(claim, old_link, reason="  ").status_code == 400
    assert _supersede(claim, old_link, reason="x", by_evidence_id=old["id"]).status_code == 400  # not itself
    other = ok(client.post("/api/investigations", json={"name": "Elsewhere"}))["id"]
    src = ok(client.post("/api/sources", json={"investigation_id": other, "title": "Other", "source_type": "document"}))
    foreign = ok(client.post("/api/evidence", json={"source_id": src["id"], "quote": "q"}))
    assert _supersede(claim, old_link, reason="x", by_evidence_id=foreign["id"]).status_code == 400
    assert _supersede(claim, {"id": "no-such-link"}, reason="x").status_code == 404
    other_claim = ok(client.post("/api/claims", json={"investigation_id": _inv, "text": "Another"}))
    assert _supersede(other_claim, old_link, reason="x").status_code == 404  # the link is not this claim's


def test_two_records_cannot_supersede_each_other():
    _inv, claim, old, new, old_link, new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected", by_evidence_id=new["id"]))
    assert _supersede(claim, new_link, reason="Loop", by_evidence_id=old["id"]).status_code == 400


def test_the_story_counts_a_claim_left_on_one_record_as_single_source_and_shows_the_mark():
    inv, claim, _old, new, old_link, _new_link = _case()
    story = ok(client.post(f"/api/investigations/{inv}/story/sections", json={"title": "The loss"}))
    story = ok(client.post(f"/api/investigations/{inv}/story/sections/{story['sections'][0]['id']}/claims", json={"claim_id": claim["id"]}))
    placed = story["sections"][0]["claims"][0]
    assert placed["single_source"] is False
    ok(_supersede(claim, old_link, reason="Corrected", by_evidence_id=new["id"]))
    story = ok(client.get(f"/api/investigations/{inv}/story"))
    placed = story["sections"][0]["claims"][0]
    assert placed["single_source"] is True
    gone = next(e for e in placed["evidence"] if e["id"] == _old["id"])
    assert gone["superseded"]["by_label"] == "Judgment 2020"
    assert next(g for g in story["gates"] if g["key"] == "single")["state"] == "warning"


def test_the_chain_of_custody_keeps_the_record_logs_the_mark_and_leaves_it_out_of_the_seal():
    _inv, claim, old, new, old_link, _new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected", by_evidence_id=new["id"]))
    chain = ok(client.get(f"/api/claims/{claim['id']}/custody-chain"))
    row = next(r for r in chain["rows"] if r["evidence_id"] == old["id"])
    assert row["superseded"]["reason"] == "Corrected"
    assert chain["seal"]["sources_for"] == 1 and chain["seal"]["against"] == 0
    assert any(e["what"] == "Marked superseded by Judgment 2020: Corrected" for e in chain["log"])
    # What rests on the old record no longer names this claim.
    assert not any(r["kind"] == "claim" and r["id"] == claim["id"] for r in row["rests_on"])


def test_the_sources_and_evidence_browser_is_told_a_link_is_superseded():
    inv, claim, old, _new, old_link, _new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected"))
    links = ok(client.get(f"/api/investigations/{inv}/evidence-claim-links"))
    assert next(x for x in links if x["evidence_id"] == old["id"])["superseded"] is True


def test_who_marked_it_is_kept_by_account_and_marking_again_after_an_undo_stamps_again():
    inv, claim, _old, new, old_link, _new_link = _case()
    with SessionLocal() as db:
        db.merge(AppUser(id="user-sup", display_name="Ony", token_digest="e" * 64, global_role="admin"))
        db.commit()
        with authorization_scope_context(AuthorizationScope(actor_id="user-sup", investigation_ids=None, role="admin")):
            c, link = db.get(Claim, claim["id"]), db.get(ClaimEvidenceLink, old_link["id"])
            supersede_claim_evidence(db, c, link, reason="Corrected", by_evidence_id=new["id"])
            assert (link.superseded_decided_by_id, link.superseded_decided_by_name) == ("user-sup", "Ony")
            unsupersede_claim_evidence(db, c, link)
            assert link.superseded_decided_by_id is None
        with authorization_scope_context(AuthorizationScope(actor_id="local-owner", investigation_ids=None, role="admin")):
            supersede_claim_evidence(db, c, link, reason="Corrected again")
            assert link.superseded_decided_by_id == "local-owner"
            assert link.decided_by_id == "local-owner"  # who linked it is not changed by the mark


def test_a_backup_carries_the_mark_and_a_restore_keeps_who_marked_it(tmp_path):
    inv, claim, _old, new, old_link, _new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected", by_evidence_id=new["id"]))
    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv)
        at = db.get(ClaimEvidenceLink, old_link["id"]).superseded_at
    engine = create_engine(f"sqlite:///{tmp_path / 'restored.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, autoflush=False, autocommit=False)() as db, \
            authorization_scope_context(AuthorizationScope(actor_id="someone-else", role="admin")):
        restore_investigation_export(db, package, tmp_path / "docs")
        link = db.get(ClaimEvidenceLink, old_link["id"])
        assert link.superseded_at == at and link.superseded_by_evidence_id == new["id"] and link.superseded_reason == "Corrected"
        assert link.superseded_decided_by_id == "local-owner"
    engine.dispose()


def test_a_backup_whose_link_is_superseded_by_evidence_outside_it_is_refused(tmp_path):
    inv, claim, _old, new, old_link, _new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected", by_evidence_id=new["id"]))
    with SessionLocal() as db:
        package, _ = build_investigation_export(db, inv)
    with zipfile.ZipFile(io.BytesIO(package)) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        records = json.loads(zf.read("data/database.json"))
        others = {n: zf.read(n) for n in zf.namelist() if n not in {"manifest.json", "data/database.json"}}
    next(r for r in records["claim_evidence_links"] if r["id"] == old_link["id"])["superseded_by_evidence_id"] = "someone-elses-evidence"
    data = json.dumps(records).encode("utf-8")
    manifest["checksums"]["data/database.json"] = hashlib.sha256(data).hexdigest()
    tampered = io.BytesIO()
    with zipfile.ZipFile(tampered, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in others.items():
            zf.writestr(name, content)
        zf.writestr("data/database.json", data)
        zf.writestr("manifest.json", json.dumps(manifest))
    engine = create_engine(f"sqlite:///{tmp_path / 'target.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine, autoflush=False, autocommit=False)() as db:
        preview = preview_investigation_restore(db, tampered.getvalue(), tmp_path / "docs2")
        assert any(c["table"] == "claim_evidence_links" and c["kind"] == "foreign_investigation" for c in preview["conflicts"])
    engine.dispose()


def test_an_evidence_pack_lists_superseded_evidence_as_superseded():
    from app.services.evidence_pack import _exhibits

    _inv, claim, old, new, old_link, _new_link = _case()
    ok(_supersede(claim, old_link, reason="Corrected", by_evidence_id=new["id"]))
    with SessionLocal() as db:
        exhibits, _behind, gaps = _exhibits(db, [{"record_type": "claim", "record_id": claim["id"]}])
        stances = {ex["evidence"].id: ex["claims"][0]["stance"] for ex in exhibits}
    assert stances[new["id"]] == "supports"
    assert stances[old["id"]] == "superseded (was supports; replaced by Judgment 2020: Corrected)"
    assert not gaps
    with SessionLocal() as db:
        supersede_claim_evidence(db, db.get(Claim, claim["id"]), db.get(ClaimEvidenceLink, _new_link["id"]), reason="Withdrawn")
        _ex, _b, gaps = _exhibits(db, [{"record_type": "claim", "record_id": claim["id"]}])
    assert any("rests only on evidence marked superseded" in g for g in gaps)
    assert Evidence  # imported for the reader: the exhibits are Evidence rows
