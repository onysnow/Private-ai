"""The investigation's places (app/services/places.py, GET
/api/investigations/{id}/places): records with coordinates as recorded,
what is linked to them, and the coordinates that cannot be used, with why."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Investigation
from app.schemas.api import EntityCreate
from app.services.entities import create_entity
from app.services.relationships import create_relationship

client = TestClient(app)


def _world() -> dict[str, str]:
    with SessionLocal() as db:
        inv = Investigation(name="Places")
        db.add(inv)
        db.commit()
        db.refresh(inv)

        def entity(schema: str, caption: str, **props: list[str]) -> str:
            return create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties=props)).id

        villa = entity("RealEstate", "Villa Kyrenia", latitude=["35.3364"], longitude=["33.3199"], country=["cy"])
        office = entity("Address", "Meridian registered office", latitude=["51,5072"], longitude=["-0.1276"],
                        full=["1 Example Street, London"])
        voss = entity("Person", "Alaric Voss")
        meridian = entity("Company", "Meridian Holdings Ltd")
        create_relationship(db, investigation_id=inv.id, schema="Ownership", source_entity_id=voss, target_entity_id=villa,
                            properties={"percentage": ["100"]})
        create_relationship(db, investigation_id=inv.id, schema="UnknownLink", source_entity_id=meridian, target_entity_id=office,
                            properties={"role": ["registered office"]})
        half = entity("Address", "Half an address", latitude=["40.0"])
        twice = entity("Address", "Disputed address", latitude=["40.1", "40.2"], longitude=["20"])
        bad = entity("Address", "Typo address", latitude=["abc"], longitude=["200"])
        return {"inv": inv.id, "villa": villa, "office": office, "voss": voss, "meridian": meridian, "half": half, "twice": twice, "bad": bad}


def test_places_are_where_their_records_say_with_what_is_linked_to_them():
    ids = _world()
    reply = client.get(f"/api/investigations/{ids['inv']}/places")
    assert reply.status_code == 200, reply.text
    body = reply.json()
    places = {p["caption"]: p for p in body["places"]}
    assert list(places) == ["Meridian registered office", "Villa Kyrenia"]
    villa = places["Villa Kyrenia"]
    assert (villa["schema"], villa["latitude"], villa["longitude"], villa["country"]) == ("RealEstate", 35.3364, 33.3199, "cy")
    assert [(l["schema"], l["direction"], l["caption"]) for l in villa["links"]] == [("Ownership", "incoming", "Alaric Voss")]
    office = places["Meridian registered office"]
    # A decimal comma is read as a decimal point; the full address comes with it.
    assert office["latitude"] == 51.5072 and office["address"] == "1 Example Street, London"
    assert [(l["schema"], l["caption"], l["entity_schema"]) for l in office["links"]] == [("UnknownLink", "Meridian Holdings Ltd", "Company")]


def test_coordinates_that_cannot_be_used_are_listed_with_why_never_placed():
    ids = _world()
    omitted = {o["caption"]: o["reason"] for o in client.get(f"/api/investigations/{ids['inv']}/places").json()["omitted"]}
    assert omitted["Half an address"] == "no longitude recorded"
    assert omitted["Disputed address"] == "2 different values of latitude are recorded (40.1, 40.2); the reporter decides which holds"
    assert omitted["Typo address"] == "the latitude 'abc' is not a number; the longitude 200 lies outside -180 to 180"
    assert client.get("/api/investigations/nope/places").status_code == 404


def test_each_place_carries_the_dated_events_at_it_from_the_timeline():
    from app.schemas.api import TimelineEventCreate
    from app.services.timeline import create_timeline_event

    ids = _world()
    with SessionLocal() as db:
        # A stake in the villa that started in a month, an event about the villa itself, one about nothing here, one undated.
        create_relationship(db, investigation_id=ids["inv"], schema="Ownership", source_entity_id=ids["meridian"], target_entity_id=ids["villa"],
                            properties={"startDate": ["2021-02"]})
        create_timeline_event(db, TimelineEventCreate(investigation_id=ids["inv"], title="Villa searched", date_start="2023-11-14",
                                                      precision="day", entity_id=ids["villa"]))
        create_timeline_event(db, TimelineEventCreate(investigation_id=ids["inv"], title="Elsewhere", date_start="2020", precision="year",
                                                      entity_id=ids["voss"]))
    body = client.get(f"/api/investigations/{ids['inv']}/places").json()
    places = {p["caption"]: p for p in body["places"]}
    assert places["Meridian registered office"]["events"] == []
    events = places["Villa Kyrenia"]["events"]
    assert [(e["title"], e["via"], e["first_day"], e["last_day"], e["exact"]) for e in events] == [
        ("Meridian Holdings Ltd — Ownership → Villa Kyrenia — startDate", "link", "2021-02-01", "2021-02-28", False),
        ("Villa searched", "place", "2023-11-14", "2023-11-14", True),
    ]
    ownership = next(link for link in places["Villa Kyrenia"]["links"] if link["caption"] == "Meridian Holdings Ltd")
    assert events[0]["relationship_id"] == ownership["relationship_id"] and events[1]["relationship_id"] is None
