"""The pictures of a place (app/services/place_pictures.py; GET /api/investigations/{id}/places, each place's
`pictures`): a photo or a captured page belongs to a place only by a stated rule (its own GPS within the place's
radius, a person's link, or its caption or page naming the street address), and each match says which and why."""

from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.main import app
from app.models.captures import Capture
from app.models.derived import DocumentPhoto
from app.models.domain import Document, DocumentChunk, Evidence, ExtractionCandidate, Investigation, Source, Statement
from app.schemas.api import EntityCreate, TimelineEventCreate
from app.services import place_pictures as pp
from app.services.entities import create_entity
from app.services.places import investigation_places
from app.services.relationships import attach_relationship_evidence, create_relationship
from app.services.timeline import create_timeline_event

client = TestClient(app)

# 1 Example Street, London; a point 120 m north of it is about 0.00108 degrees of latitude.
LAT, LON = 51.5072, -0.1276


def test_the_street_line_is_a_house_number_and_its_street_never_a_postcode():
    assert pp.street_line("L'Ermitage Beverly Hills, 9291, Burton Way, Beverly Hills, California, 90210, United States") == "9291 Burton Way"
    assert pp.street_line("15, West 63rd Street, Lincoln Square, Manhattan, 10023, United States") == "15 West 63rd Street"
    assert pp.street_line("1 Example Street, London") == "1 Example Street"
    # No house number: a street, a town or a postcode alone names many places, so nothing is matched by name.
    assert pp.street_line("Stratton Street, St. James's, Mayfair, W1J 8LL, United Kingdom") is None
    assert pp.street_line("Beverly Hills, Los Angeles County, California, 90210, United States") is None
    assert pp.street_line("SW1W 0JR, City of Westminster") is None and pp.street_line(None) is None


def test_a_name_is_matched_as_whole_words_case_and_commas_aside():
    assert pp.find_named("9291 Burton Way", "L'Ermitage hotel, 9291 BURTON way, Beverly Hills")
    assert pp.find_named("9291 Burton Way", "the property at 9291, Burton Way") is not None
    assert pp.find_named("1 Example Street", "fences at 11 Example Street") is None
    assert pp.find_named("1 Example Street", "1 Example Streets") is None


def test_the_radius_follows_how_exact_the_place_is():
    assert pp.radius_for("building") == 250 and pp.radius_for(None) == 250 and pp.radius_for("camera gps") == 250
    assert pp.radius_for("street") == 500 and pp.radius_for("square") == 500
    assert pp.radius_for("town") == 5000 and pp.radius_for("country/city") == 5000 and pp.radius_for("locality") == 5000


def _jpeg() -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (8, 6), (90, 120, 150)).save(out, format="JPEG")
    return out.getvalue()


@pytest.fixture
def world(tmp_path: Path) -> dict[str, str]:
    with SessionLocal() as db:
        inv = Investigation(name="Pictures of places")
        db.add(inv)
        db.commit()
        source = Source(investigation_id=inv.id, title="Uploads", source_type="document")
        db.add(source)
        db.commit()

        def doc(name: str) -> str:
            path = tmp_path / name
            path.write_bytes(_jpeg() if not name.endswith(".pdf") else b"%PDF-1.4")
            row = Document(investigation_id=inv.id, source_id=source.id, filename=name, sha256=name.ljust(64, "0")[:64],
                           storage_path=str(path), extraction_status="complete")
            db.add(row)
            db.commit()
            return row.id

        def photo(doc_id: str, lat: float, lon: float, taken: str | None = None) -> None:
            claims = {"gps": {"latitude": lat, "longitude": lon}, **({"capture_time": taken} if taken else {})}
            db.add(DocumentPhoto(document_id=doc_id, investigation_id=inv.id, kind="JPEG", claims=claims, tool="test"))
            db.commit()

        def picture(doc_id: str, caption: str, taken: str | None = None) -> str:
            ev = Evidence(source_id=source.id, quote=caption, locator="the picture", document_id=doc_id, captured_on=taken)
            db.add(ev)
            db.commit()
            return ev.id

        office = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Address", caption="Meridian office", properties={
            "full": ["1 Example Street, London"], "latitude": [str(LAT)], "longitude": [str(LON)], "notes": ["Precision: building."]})).id
        town = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Address", caption="Marlow", properties={
            "latitude": ["51.5700"], "longitude": ["-0.7700"], "notes": ["Precision: town."]})).id
        meridian = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Company", caption="Meridian Holdings Ltd")).id
        edge = create_relationship(db, investigation_id=inv.id, schema="UnknownLink", source_entity_id=meridian, target_entity_id=office,
                                   properties={"role": ["registered office"]})

        near = doc("near.jpg")
        photo(near, LAT + 0.00108, LON, "2019-08-14T10:02:00")           # about 120 m north: taken here
        far = doc("far.jpg")
        photo(far, LAT + 0.018, LON)                                       # about 2 km: not at a building
        in_town = doc("in-town.jpg")
        photo(in_town, 51.5900, -0.7700)                                   # about 2.2 km from Marlow's point: in the town
        nofix = doc("nofix.jpg")
        photo(nofix, 0.0, 0.0)
        signed = doc("signage.jpg")
        attach_relationship_evidence(db, edge, evidence_id=picture(signed, "The brass plate by the door", "2017-06"))
        named = doc("fences.jpg")
        picture(named, "New fences at 1, Example Street", "2021-05-12")
        picture(doc("other.jpg"), "Fences at 11 Example Street")           # another house: not named
        pdf = doc("lease.pdf")
        attach_relationship_evidence(db, edge, evidence_id=picture(pdf, "The lease at 1 Example Street"))  # not a picture: never listed
        event_pic = doc("plot.jpg")
        create_timeline_event(db, TimelineEventCreate(investigation_id=inv.id, title="Empty plot", date_start="2016", precision="year",
                                                      entity_id=office, evidence_id=picture(event_pic, "The empty plot", "2016")))
        # A photo whose GPS proposal a person accepted as the town's record.
        accepted = doc("accepted.jpg")
        db.add(ExtractionCandidate(investigation_id=inv.id, document_id=accepted, candidate_type="entity", review_status="accepted",
                                   accepted_record_type="entity", accepted_record_id=town, decided_by_name="Ony",
                                   payload={"from": "photo_gps", "caption": "Where accepted.jpg was taken"}))
        db.commit()
        # A captured page that names the address, shown by its screenshot.
        page = Document(investigation_id=inv.id, source_id=source.id, filename="example.org-20240101-000000Z.html", sha256="p" * 64,
                        storage_path=str(tmp_path / "page.html"), extraction_status="complete")
        db.add(page)
        db.commit()
        db.add(DocumentChunk(document_id=page.id, ordinal=0, locator="page", text="Contact us at our office: 1 Example Street, London."))
        db.add(Capture(investigation_id=inv.id, url="https://example.org/contact", status="finished", outcome="saved", document_id=page.id,
                       captured_at=datetime(2024, 1, 1, 0, 0), displayed={"title": "Contact — Meridian"}))
        db.commit()
        return {"inv": inv.id, "office": office, "town": town, "near": near, "far": far, "in_town": in_town, "signed": signed,
                "named": named, "pdf": pdf, "event_pic": event_pic, "accepted": accepted, "page": page.id}


def test_each_picture_of_a_place_says_by_which_rule_and_why(world):
    body = client.get(f"/api/investigations/{world['inv']}/places").json()
    places = {p["entity_id"]: p for p in body["places"]}
    office = {p["document_id"]: p for p in places[world["office"]]["pictures"]}
    assert set(office) == {world["near"], world["signed"], world["named"], world["event_pic"], world["page"]}
    [gps] = office[world["near"]]["matches"]
    assert gps["rule"] == "gps" and 110 <= gps["metres"] <= 130 and "within 250 m" in gps["detail"]
    # The camera's clock is used when no source states the day; a source's day is used when it does.
    assert (office[world["near"]]["taken"], office[world["near"]]["taken_from"]) == ("2019-08-14", "camera")
    assert (office[world["signed"]]["taken"], office[world["signed"]]["taken_from"], office[world["signed"]]["first_day"],
            office[world["signed"]]["last_day"]) == ("2017-06", "source", "2017-06-01", "2017-06-30")
    assert office[world["signed"]]["matches"] == [{"rule": "linked", "detail": "Evidence for the link with Meridian Holdings Ltd (attached by the reporter)", "metres": None}]
    assert office[world["event_pic"]]["matches"][0]["detail"] == "The evidence for “Empty plot”, an event here"
    assert office[world["named"]]["matches"][0]["rule"] == "named" and "1 example street" in office[world["named"]]["matches"][0]["detail"]
    page = office[world["page"]]
    assert (page["kind"], page["title"], page["taken"], page["taken_from"]) == ("page", "Contact — Meridian", "2024-01-01", "capture")
    assert page["capture_id"] and page["matches"][0]["detail"].startswith("Named on the captured page")
    # Earliest taken first.
    assert [p["document_id"] for p in places[world["office"]]["pictures"]][:2] == [world["event_pic"], world["signed"]]
    town = {p["document_id"]: p for p in places[world["town"]]["pictures"]}
    assert set(town) == {world["in_town"], world["accepted"]}
    assert town[world["in_town"]]["matches"][0]["detail"].startswith("Taken 2.2 km from here") and "within 5.0 km" in town[world["in_town"]]["matches"][0]["detail"]
    assert town[world["accepted"]]["matches"] == [{"rule": "linked", "detail": "Its GPS was accepted as this place, by Ony", "metres": None}]


def test_the_place_read_from_a_photo_lists_that_photo(world):
    with SessionLocal() as db:
        for st in db.scalars(select(Statement).where(Statement.entity_id == world["town"], Statement.prop == "latitude")):
            st.origin = f"document:{world['in_town']}#metadata"
        db.commit()
        town = next(p for p in investigation_places(db, world["inv"])["places"] if p["entity_id"] == world["town"])
    matches = next(p for p in town["pictures"] if p["document_id"] == world["in_town"])["matches"]
    assert [m["rule"] for m in matches] == ["gps", "linked"]
    assert matches[1]["detail"] == "The place's coordinates were read from this picture"


def test_pictures_are_left_out_where_they_are_not_asked_for(world):
    with SessionLocal() as db:
        places = investigation_places(db, world["inv"], pictures=False)["places"]
    assert all("pictures" not in p for p in places)


def test_the_1mdb_demo_s_pictures_of_places(tmp_path):
    """The 1MDB demo with its photos held (stand-in pictures, since nothing is downloaded here): the pictures a person
    attached to a place's link, and the ones whose captions name a street address, are found; no photo carries GPS
    (Wikimedia's thumbnails keep no EXIF), so the GPS rule finds none."""
    from app.services import demo_1mdb

    base = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_1mdb.manifest()]

    def offline(url: str) -> bytes:
        raise OSError("offline test")

    more = [(meta, _jpeg() if meta["kind"] == "photo" and data is None and meta["mode"] == "fetch" else data)
            for meta, data in demo_1mdb.fetch_more(offline)]
    with SessionLocal() as db:
        inv, _ = demo_1mdb.build(db, base + more, storage_dir=tmp_path)
        places = investigation_places(db, inv.id)["places"]
        files = {d.id: d.filename for d in db.scalars(select(Document).where(Document.investigation_id == inv.id))}
    found = {(p["caption"], files[pic["document_id"]], m["rule"]) for p in places for pic in p["pictures"] for m in pic["matches"]}
    assert ("BSI Bank, Lugano", "bsi-lugano-2013-08-25.jpg", "linked") in found
    assert ("Villefranche-sur-Mer (Equanimity photographed 28 Sep 2014)", "equanimity-2014-09-28-villefranche.jpg", "linked") in found
    assert ("L'Ermitage hotel, Beverly Hills", "lermitage-beverly-hills-2015-02-19.jpg", "named") in found
    assert ("Walker Tower Penthouse", "walker-tower-nyc.jpg", "named") in found
    assert not any(rule == "gps" for _, _, rule in found)
    # Every match is one of the stated rules, and a picture with no rule is never listed.
    assert all(pic["matches"] for p in places for pic in p["pictures"])
    print(sorted(found))
