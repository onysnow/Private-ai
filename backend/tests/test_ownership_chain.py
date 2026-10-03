"""The ownership and control chain (app/services/ownership_chain.py): owners
up, holdings down, directors beside, ended stakes marked, circles marked,
and a look-through share only where every percentage is known."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation
from app.schemas.api import EntityCreate
from app.services.entities import create_entity
from app.services.ownership_chain import ownership_chain, parse_percentage
from app.services.relationships import create_relationship

client = TestClient(app)
TODAY = date(2026, 10, 3)


def _world(db):
    inv = Investigation(name="Chain")
    db.add(inv)
    db.commit()
    db.refresh(inv)

    def entity(name: str, schema: str = "Company"):
        return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=name, properties={}))

    def owns(owner, asset, percentage: str | None = None, **props: str):
        properties = {k: [v] for k, v in props.items()}
        if percentage is not None:
            properties["percentage"] = [percentage]
        return create_relationship(db, investigation_id=inv.id, schema="Ownership", source_entity_id=owner.id, target_entity_id=asset.id,
                                   properties=properties)

    return inv, entity, owns


def test_owners_above_holdings_below_directors_beside_and_the_look_through_share():
    with SessionLocal() as db:
        inv, entity, owns = _world(db)
        subject, holdco, trust, voss, sub = entity("Meridian Holdings Ltd"), entity("Bellcastle Ltd"), entity("Orrin Trust", "LegalEntity"), \
            entity("Alaric Voss", "Person"), entity("Meridian Shipping Ltd")
        owns(holdco, subject, "60")
        owns(trust, subject, "40")
        owns(voss, holdco, "50%")
        owns(voss, trust, "25")
        owns(subject, sub, "100")
        jane = entity("Jane Doe", "Person")
        create_relationship(db, investigation_id=inv.id, schema="Directorship", source_entity_id=jane.id, target_entity_id=subject.id,
                            properties={"role": ["director"]})
        chain = ownership_chain(db, subject, today=TODAY)
    levels = {n["id"]: n["level"] for n in chain["nodes"]}
    assert levels == {subject.id: 0, holdco.id: -1, trust.id: -1, voss.id: -2, sub.id: 1, jane.id: -1}
    assert next(n for n in chain["nodes"] if n["is_subject"])["caption"] == "Meridian Holdings Ltd"
    shares = {o["entity_id"]: o for o in chain["owners"]}
    # 50% of 60% plus 25% of 40%.
    assert shares[voss.id]["effective_percentage"] == 40.0 and shares[voss.id]["paths"] == 2 and not shares[voss.id]["direct"]
    assert shares[holdco.id]["effective_percentage"] == 60.0 and shares[holdco.id]["direct"]
    assert jane.id not in shares
    directorship = next(l for l in chain["links"] if l["schema"] == "Directorship")
    assert directorship["role"] == "director" and directorship["percentage"] is None
    assert not chain["truncated"] and not any(l["circular"] for l in chain["links"])


def test_a_share_is_not_worked_out_from_a_missing_percentage_an_ended_stake_or_a_circle():
    with SessionLocal() as db:
        _inv, entity, owns = _world(db)
        subject, a, b, c = entity("Target Ltd"), entity("A Ltd"), entity("B Ltd"), entity("C Ltd")
        owns(a, subject)                                   # no percentage
        owns(b, subject, "30", endDate="2021")             # ended
        owns(c, subject, "10")
        owns(subject, c, "5")                              # C and Target own each other
        chain = ownership_chain(db, subject, today=TODAY)
    shares = {o["entity_id"]: o for o in chain["owners"]}
    assert shares[a.id]["effective_percentage"] is None and "no percentage" in shares[a.id]["not_known_because"]
    assert shares[b.id]["not_known_because"] == "1 of 1 path(s) pass through an ownership that has ended"
    assert shares[c.id]["not_known_because"] == "the ownership runs in a circle, so the shares cannot be added up"
    links = {(l["source"], l["target"]): l for l in chain["links"]}
    assert links[(b.id, subject.id)]["ended"] and links[(b.id, subject.id)]["end_date"] == "2021"
    assert links[(c.id, subject.id)]["circular"] and links[(subject.id, c.id)]["circular"]
    assert not links[(a.id, subject.id)]["circular"]


def test_percentages_are_read_as_written_or_not_at_all():
    assert parse_percentage("25") == 25.0 and parse_percentage("25,5 %") == 25.5
    assert parse_percentage("0") is None and parse_percentage("140") is None and parse_percentage("most") is None


def test_the_route_answers_for_an_entity_and_refuses_an_unknown_one():
    with SessionLocal() as db:
        _inv, entity, owns = _world(db)
        subject, owner = entity("Subject Ltd"), entity("Owner Ltd")
        owns(owner, subject, "75")
        subject_id, owner_id = subject.id, owner.id
    reply = client.get(f"/api/entities/{subject_id}/ownership-chain")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["owners"] == [{"entity_id": owner_id, "paths": 1, "direct": True, "effective_percentage": 75.0, "not_known_because": None}]
    assert client.get("/api/entities/nope/ownership-chain").status_code == 404
