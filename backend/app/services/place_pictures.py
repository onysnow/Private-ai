"""The pictures of a place (mockup PLACE_1, "Pictures of this place"): photos in the case taken at or of the place, and
captured pages that show its address. Nothing is guessed: a picture belongs to a place only by one of three stated
rules, and each match says which rule and what it rests on (DECISIONS_LOG 38).

- **gps**: the photo's own metadata (its EXIF GPS, a claim the file makes about itself, app/services/photos.py) puts
  it within a radius of the place's coordinates. The radius follows how exact the place is, as its record's notes say
  (RADIUS_M): 250 m for a place known to the building or with no precision recorded, 500 m for a street or a square,
  5 km for a place known only to its town or wider. 0, 0 is no fix and never matches.
- **linked**: a person tied the picture to the place: it is evidence for a link between the place and a party (attached
  by the reporter, or the evidence the link was made with), the evidence for a dated event at the place, the file the
  place's own coordinates were read from, or the photo whose GPS proposal a person accepted as this place.
- **named**: a picture's caption (its evidence quote) or a captured web page's saved text names the place's street
  address, house number and street, whole words, case and commas aside ("9291 Burton Way"). A place whose address has
  no house number is never matched by name: a street name alone, or a town, names many places.

A picture is a photo file (PNG, JPEG, HEIC or a camera RAW; one the app can show) or a saved capture's page (shown by
its screenshot). A picture evidence record with no file held (a link) is left out: there is nothing to open.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.captures import Capture
from app.models.derived import DocumentPhoto
from app.models.documents import Document, DocumentChunk, ExtractionCandidate
from app.models.entities import Statement
from app.models.relationships import RelationshipEdge, RelationshipEvidenceAttachment
from app.models.sources import Evidence
from app.services.image_reader import IMAGE_EXTENSIONS
from app.services.photos import PHOTO_EXTENSIONS
from app.visuals.data_service import event_span

PICTURE_EXTENSIONS = IMAGE_EXTENSIONS | PHOTO_EXTENSIONS
# How far from a place a photo's GPS may be and still be "taken here", by how exact the place is.
RADIUS_M = {"building": 250, "street": 500, "town": 5000}
_TOWN_WORDS = {"town", "city", "village", "municipality", "district", "region", "province", "state", "country",
               "postcode", "approximate", "locality", "suburb", "neighbourhood", "neighborhood", "county"}
_STREET_WORDS = {"street", "square", "road", "block"}
_EARTH_M = 6_371_000


def radius_for(precision: str | None) -> int:
    """The GPS radius for a place exact to `precision` (its record's "Precision: …" note)."""
    words = set(re.findall(r"[a-z]+", (precision or "").lower()))
    if words & _TOWN_WORDS:
        return RADIUS_M["town"]
    if words & _STREET_WORDS:
        return RADIUS_M["street"]
    return RADIUS_M["building"]


def metres_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """The great-circle distance (haversine) between two points, in metres."""
    d_lat, d_lon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    return _EARTH_M * 2 * math.asin(min(1.0, math.sqrt(h)))


def _gps(claims: Any) -> tuple[float, float] | None:
    gps = claims.get("gps") if isinstance(claims, dict) else None
    if not isinstance(gps, dict):
        return None
    try:
        lat, lon = float(str(gps.get("latitude"))), float(str(gps.get("longitude")))
    except (TypeError, ValueError):
        return None
    if (lat == 0 and lon == 0) or not (-90 <= lat <= 90 and -180 <= lon <= 180) or math.isnan(lat) or math.isnan(lon):
        return None
    return lat, lon


_HOUSE = re.compile(r"\d{1,5}[A-Za-z]?")
_HOUSE_AND_STREET = re.compile(r"\d{1,5}[A-Za-z]?\s+\S.*")


def street_line(full: str | None) -> str | None:
    """The house number and street of an address, as a document would write them: "9291 Burton Way" from
    "L'Ermitage Beverly Hills, 9291, Burton Way, Beverly Hills, …", "1 Example Street" from "1 Example Street, London".
    Only the first two parts are read (a number further on is a postcode); None when there is no house number."""
    parts = [p.strip() for p in (full or "").split(",")]
    for i, part in enumerate(parts[:2]):
        if _HOUSE.fullmatch(part) and i + 1 < len(parts) and re.search(r"[^\W\d_]{3,}", parts[i + 1]):
            return f"{part} {parts[i + 1]}"
        if _HOUSE_AND_STREET.fullmatch(part) and re.search(r"[^\W\d_]{3,}", part):
            return part
    return None


def _plain(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace(",", " ").replace("’", "'")).lower()


def find_named(line: str, text: str) -> str | None:
    """The words around `line` where `text` names it (whole words, case and commas aside), or None."""
    plain = _plain(text)
    found = re.search(r"(?<!\w)" + r"\s+".join(re.escape(w) for w in _plain(line).split()) + r"(?!\w)", plain)
    if not found:
        return None
    start, end = max(0, found.start() - 40), min(len(plain), found.end() + 40)
    return ("…" if start else "") + plain[start:end].strip() + ("…" if end < len(plain) else "")


def _taken(source_day: str | None, camera_time: Any) -> tuple[str | None, str | None]:
    """When the picture was taken: the day its source states (a year, a month or a day), else the camera's clock."""
    if source_day and event_span(source_day, None):
        return source_day, "source"
    text = str(camera_time or "")[:10]
    if text and event_span(text, None):
        return text, "camera"
    return None, None


def is_picture_file(filename: str | None) -> bool:
    return Path(filename or "").suffix.lower() in PICTURE_EXTENSIONS


def place_pictures(db: Session, investigation_id: str, places: Sequence[dict[str, Any]], edges: Iterable[RelationshipEdge],
                   event_evidence: dict[str, dict[str, str]]) -> None:
    """Give each place its `pictures`: [{document_id, kind, title, capture_id, taken, taken_from, first_day, last_day,
    matches: [{rule, detail, metres}]}], earliest taken first. `event_evidence` is {place id: {evidence id: event title}}
    for the dated events at each place."""
    for place in places:
        place["pictures"] = []
    if not places:
        return
    by_id = {p["entity_id"]: p for p in places}
    found: dict[str, dict[str, dict[str, Any]]] = {pid: {} for pid in by_id}

    docs = {d.id: d for d in db.scalars(select(Document).where(Document.investigation_id == investigation_id))}
    photos = {p.document_id: p for p in db.scalars(select(DocumentPhoto).where(DocumentPhoto.investigation_id == investigation_id))}
    picture_docs = {doc_id for doc_id, d in docs.items() if is_picture_file(d.filename) or doc_id in photos}
    # Picture evidence records (a held picture with its caption and the day it was taken).
    evidence = {e.id: e for e in db.scalars(select(Evidence).where(Evidence.document_id.in_(picture_docs)))} if picture_docs else {}
    source_day = {}
    caption_of: dict[str, list[str]] = {}
    for ev in evidence.values():
        if ev.document_id:
            if ev.captured_on and ev.document_id not in source_day:
                source_day[ev.document_id] = ev.captured_on
            if (ev.quote or "").strip():
                caption_of.setdefault(ev.document_id, []).append(ev.quote or "")

    def add(place_id: str, doc_id: str, rule: str, detail: str, metres: int | None = None, capture: Capture | None = None) -> None:
        doc = docs.get(doc_id)
        if doc is None:
            return
        entry = found[place_id].get(doc_id)
        if entry is None:
            if capture is not None:
                day = capture.captured_at.date().isoformat() if capture.captured_at else None
                taken, taken_from = day, "capture" if day else None
                title = (capture.displayed or {}).get("title") or doc.filename
            else:
                photo = photos.get(doc_id)
                taken, taken_from = _taken(source_day.get(doc_id), (photo.claims or {}).get("capture_time") if photo else None)
                title = doc.filename
            span = event_span(taken, None) if taken else None
            entry = {"document_id": doc_id, "kind": "page" if capture is not None else "photo", "title": str(title)[:300],
                     "capture_id": capture.id if capture is not None else None, "taken": taken, "taken_from": taken_from,
                     "first_day": span[0].isoformat() if span else None, "last_day": span[1].isoformat() if span else None,
                     "matches": []}
            found[place_id][doc_id] = entry
        if not any(m["rule"] == rule and m["detail"] == detail for m in entry["matches"]):
            entry["matches"].append({"rule": rule, "detail": detail, "metres": metres})

    # gps: the photo's own GPS within the place's radius.
    for doc_id, photo in photos.items():
        point = _gps(photo.claims)
        if point is None or doc_id not in docs:
            continue
        for place in places:
            radius = radius_for(place.get("precision"))
            metres = metres_between(point[0], point[1], place["latitude"], place["longitude"])
            if metres <= radius:
                add(place["entity_id"], doc_id, "gps",
                    f"Taken {_distance(metres)} from here, by the photo's own GPS (within {_distance(radius)}; "
                    "what the file claims about itself)", round(metres))

    # linked: evidence for a link between the place and a party.
    edge_list = list(edges)
    edge_ids = [e.id for e in edge_list]
    attachments = list(db.scalars(select(RelationshipEvidenceAttachment).where(
        RelationshipEvidenceAttachment.relationship_edge_id.in_(edge_ids)))) if edge_ids else []
    edge_by_id = {e.id: e for e in edge_list}
    for att in attachments:
        held = evidence.get(att.evidence_id)
        edge = edge_by_id.get(att.relationship_edge_id)
        if held is None or edge is None or not held.document_id:
            continue
        for place_id in (edge.source_entity_id, edge.target_entity_id):
            if place_id not in by_id:
                continue
            other = next((link["caption"] for link in by_id[place_id]["links"] if link["relationship_id"] == edge.id), "a party")
            how = "the evidence the link was made with" if att.attached_by == "creation" else f"attached by the {att.attached_by}"
            add(place_id, held.document_id, "linked", f"Evidence for the link with {other} ({how})")
    # linked: the evidence for a dated event at the place.
    for place_id, by_evidence in event_evidence.items():
        for evidence_id, title in by_evidence.items():
            behind = evidence.get(evidence_id)
            if behind is not None and behind.document_id and place_id in by_id:
                add(place_id, behind.document_id, "linked", f"The evidence for “{title}”, an event here")
    # linked: the file the place's coordinates were read from, or the photo whose GPS proposal a person accepted.
    for st in db.scalars(select(Statement).where(Statement.entity_id.in_(list(by_id)), Statement.prop.in_(("latitude", "longitude")))):
        origin = st.origin or ""
        if origin.startswith("document:"):
            doc_id = origin[len("document:"):].split("#")[0]
            if doc_id in picture_docs:
                add(st.entity_id, doc_id, "linked", "The place's coordinates were read from this picture")
    for cand in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == investigation_id,
                                                             ExtractionCandidate.review_status == "accepted",
                                                             ExtractionCandidate.accepted_record_id.in_(list(by_id)))):
        if (cand.payload or {}).get("from") == "photo_gps" and cand.accepted_record_id in by_id:
            who = cand.decided_by_name or "a person"
            add(str(cand.accepted_record_id), cand.document_id, "linked", f"Its GPS was accepted as this place, by {who}")

    # named: a caption, or a captured page's text, names the place's street address.
    lines: dict[str, str] = {}
    for pid, p in by_id.items():
        line = street_line(p.get("address"))
        if line:
            lines[pid] = line
    if lines:
        for doc_id, captions in caption_of.items():
            for pid, line in lines.items():
                for caption in captions:
                    words = find_named(line, caption)
                    if words:
                        add(pid, doc_id, "named", f"Named in its caption: “{words}”")
                        break
        captures = [c for c in db.scalars(select(Capture).where(Capture.investigation_id == investigation_id,
                                                                Capture.outcome == "saved", Capture.document_id.is_not(None)))]
        for capture in captures:
            text = " ".join(c.text or "" for c in db.scalars(select(DocumentChunk).where(
                DocumentChunk.document_id == capture.document_id).order_by(DocumentChunk.ordinal)))
            if not text.strip():
                continue
            for pid, line in lines.items():
                words = find_named(line, text)
                if words:
                    add(pid, str(capture.document_id), "named", f"Named on the captured page: “{words}”", capture=capture)

    for place_id, entries in found.items():
        by_id[place_id]["pictures"] = sorted(entries.values(), key=lambda e: (e["first_day"] is None, e["first_day"] or "", e["title"]))


def _distance(metres: float) -> str:
    return f"{metres / 1000:.1f} km" if metres >= 1000 else f"{round(metres)} m"
