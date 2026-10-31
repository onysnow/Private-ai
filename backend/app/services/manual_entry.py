"""Add by hand (mockup ENTRY_1, DECISIONS_LOG 4): a party, a link or an event a reporter knows and no document the app
read has said yet, written as a sentence, with where it comes from.

Where it comes from is required and decides what the record can carry:
- **a passage**: words found in a document of the case; the record starts with them as its evidence;
- **a source with no file**: a call, a meeting, a register seen in person, kept as a Source with a note; the custody
  chain says no file is behind it;
- **no source yet**: kept, and a lead "Find a source for …" is opened on it; it has no evidence, so it can never count
  toward Supported.

Before it is added, a preview says what the case already holds (the same name, the same link, the same proposal
waiting in Decide) and what a link would change (the Red Flag rules dry run, app/services/unlocks.py). Nothing is
written by the preview. Who typed it is kept on the record (its origin) and in its custody chain.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.domain import (
    Document,
    DocumentChunk,
    Entity,
    Evidence,
    ExtractionCandidate,
    RelationshipEdge,
    Source,
    TimelineEvent,
)
from app.services.entity_signals import norm_name
from app.services.resolution import entity_names

PARTY_KINDS = ("Company", "Person", "Organization", "PublicBody", "LegalEntity")


class NewParty(BaseModel):
    caption: str = Field(min_length=1, max_length=300)
    schema_: Literal["Company", "Person", "Organization", "PublicBody", "LegalEntity"] = Field(alias="schema")
    country: str | None = Field(default=None, max_length=80)
    aliases: list[str] = []

    model_config = {"populate_by_name": True}


class End(BaseModel):
    """One end of a link: a record of the case, or a new party."""
    entity_id: str | None = None
    new: NewParty | None = None


class LinkIn(BaseModel):
    schema_: str = Field(alias="schema")
    source: End
    target: End
    properties: dict[str, list[str]] = {}
    # A payment's kind (app/services/payment_kinds.py), picked by the person; None: not said.
    payment_kind: Literal["transfer", "loan", "fee", "settlement", "price", "fine", "ordered"] | None = None

    model_config = {"populate_by_name": True}


class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    date: str
    precision: Literal["day", "month", "year", "estimated"] = "day"
    where: str | None = Field(default=None, max_length=300)
    entity_ids: list[str] = []


class SourceIn(BaseModel):
    mode: Literal["passage", "record", "none"]
    document_id: str | None = None
    quote: str | None = Field(default=None, max_length=5000)
    locator: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=300)
    source_type: Literal["interview", "public_record", "document", "web", "other"] = "interview"
    url: str | None = Field(default=None, max_length=2000)
    notes: str | None = Field(default=None, max_length=5000)


class EntryIn(BaseModel):
    kind: Literal["party", "link", "event"]
    party: NewParty | None = None
    link: LinkIn | None = None
    event: EventIn | None = None
    source: SourceIn | None = None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().casefold()


def _named(db: Session, inv: str, caption: str) -> list[dict[str, Any]]:
    """Records of the case held under this name (caption, other name or alias), and name proposals waiting in Decide."""
    wanted = norm_name(caption)
    out: list[dict[str, Any]] = []
    for row in db.scalars(select(Entity).where(Entity.investigation_id == inv, Entity.merged_into_entity_id.is_(None))):
        names = entity_names(row)
        hit = next((n for n in names if norm_name(n) == wanted), None)
        if hit:
            out.append({"kind": "record", "id": row.id, "caption": row.caption, "schema": row.schema,
                        "as": "its name" if hit == row.caption else "another name of it"})
    for c in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv,
                                                          ExtractionCandidate.review_status == "proposed",
                                                          ExtractionCandidate.candidate_type == "entity")):
        if norm_name(str((c.payload or {}).get("caption") or "")) == wanted:
            out.append({"kind": "proposal", "id": c.id, "caption": (c.payload or {}).get("caption"), "schema": None, "as": "waiting in Decide"})
    return out


def suggest(db: Session, inv: str, typed: str, limit: int = 8) -> list[dict[str, Any]]:
    """The case's records whose names start with, then contain, what was typed: for a blank in the sentence."""
    t = _norm(typed)
    if len(t) < 2:
        return []
    starts: list[dict[str, Any]] = []
    contains: list[dict[str, Any]] = []
    for row in db.scalars(select(Entity).where(Entity.investigation_id == inv, Entity.merged_into_entity_id.is_(None))):
        if row.schema in ("Ownership", "Directorship", "Payment", "Employment", "Membership", "Representation", "Family",
                          "Associate", "UnknownLink", "Succession", "Occupancy", "Debt"):
            continue
        for name in entity_names(row):
            n = _norm(name)
            if n.startswith(t) or t in n:
                (starts if n.startswith(t) else contains).append({
                    "id": row.id, "caption": row.caption, "schema": row.schema, "matched": name,
                    "as": "its name" if name == row.caption else "another name of it",
                    "country": ", ".join((row.properties or {}).get("country") or []) or None})
                break
    return (starts + contains)[:limit]


def preview(db: Session, inv: str, body: EntryIn) -> dict[str, Any]:
    """What the case already holds of it and what it would change; nothing is written."""
    from app.services.unlocks import Links

    already: list[dict[str, Any]] = []
    waiting: list[dict[str, Any]] = []
    changes: list[str] = []
    if body.kind == "party" and body.party:
        for hit in _named(db, inv, body.party.caption):
            (already if hit["kind"] == "record" else waiting).append(hit)
    elif body.kind == "link" and body.link:
        a, b = body.link.source.entity_id, body.link.target.entity_id
        if a and b:
            for edge in db.scalars(select(RelationshipEdge).where(RelationshipEdge.investigation_id == inv, or_(
                    (RelationshipEdge.source_entity_id == a) & (RelationshipEdge.target_entity_id == b),
                    (RelationshipEdge.source_entity_id == b) & (RelationshipEdge.target_entity_id == a)))):
                already.append({"kind": "link", "id": edge.id, "schema": edge.schema,
                                "same": edge.schema == body.link.schema_ and edge.source_entity_id == a})
            for c in db.scalars(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv,
                                                                  ExtractionCandidate.review_status == "proposed",
                                                                  ExtractionCandidate.candidate_type == "relationship")):
                p = c.payload or {}
                if {p.get("source_entity_id"), p.get("target_entity_id")} == {a, b} and str(p.get("schema") or "") == body.link.schema_:
                    waiting.append({"kind": "proposal", "id": c.id, "schema": p.get("schema"), "caption": p.get("caption")})
            links = Links(db, inv)
            changes = [u["text"] for u in links.run_link(body.link.schema_, a, b, body.link.properties,
                                                          payment_kind=body.link.payment_kind)]
        else:
            from app.patterns import graph as case_graph

            links = Links(db, inv)
            added = []
            ids = []
            for n, end in enumerate((body.link.source, body.link.target)):
                if end.entity_id:
                    ids.append(end.entity_id)
                elif end.new:
                    pid = f"new:{n}"
                    ids.append(pid)
                    added.append(case_graph.Party(pid, end.new.caption, end.new.schema_, {}))
            if len(ids) == 2:
                changes = [u["text"] for u in links.run_link(body.link.schema_, ids[0], ids[1], body.link.properties, added,
                                                              payment_kind=body.link.payment_kind)]
    elif body.kind == "event" and body.event:
        for ev in db.scalars(select(TimelineEvent).where(TimelineEvent.investigation_id == inv, TimelineEvent.date_start == body.event.date)):
            if _norm(ev.title) == _norm(body.event.title) or (ev.entity_id and ev.entity_id in body.event.entity_ids):
                already.append({"kind": "event", "id": ev.id, "caption": ev.title, "schema": None})
    return {"already": already, "waiting": waiting, "changes": changes}


def _passage(db: Session, inv: str, src: SourceIn) -> tuple[Document, str, str]:
    doc = db.get(Document, src.document_id) if src.document_id else None
    if doc is None or doc.investigation_id != inv:
        raise ValueError("Choose a document of this case")
    quote = (src.quote or "").strip()
    if not quote:
        raise ValueError("Give the words from the document")
    wanted = _norm(quote)
    for chunk in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id).order_by(DocumentChunk.ordinal)):
        if wanted in _norm(chunk.text):
            return doc, quote, (src.locator or "").strip() or (chunk.locator or "")
    raise ValueError(f"These words are not in {doc.filename} as it was read: check them against the document")


def _validate(db: Session, inv: str, body: EntryIn, src: SourceIn) -> None:
    """Everything that could refuse the entry, checked before anything is written (the helpers commit as they go)."""
    from app.services.relationships import (
        RELATIONSHIP_SCHEMAS,
        validate_payment_properties,
    )
    from app.services.timeline import _normalize_date

    def in_case(entity_id: str) -> None:
        row = db.get(Entity, entity_id)
        if row is None or row.investigation_id != inv or row.merged_into_entity_id:
            raise ValueError("A party chosen is not in this case")

    if src.mode == "passage":
        _passage(db, inv, src)
    elif src.mode == "record" and not (src.title or "").strip():
        raise ValueError("Name the source: who or what said it")
    if body.kind == "party" and body.party is None:
        raise ValueError("Write the party")
    if body.kind == "link":
        if body.link is None:
            raise ValueError("Write the link")
        if body.link.schema_ not in RELATIONSHIP_SCHEMAS:
            raise ValueError(f"A link is one of: {', '.join(sorted(RELATIONSHIP_SCHEMAS))}")
        ends = []
        for end in (body.link.source, body.link.target):
            if end.entity_id:
                in_case(end.entity_id)
                ends.append(end.entity_id)
            elif not end.new:
                raise ValueError("Each end of the link is a party of the case or a new one")
        if len(ends) == 2 and ends[0] == ends[1]:
            raise ValueError("A link joins two different parties")
        if body.link.schema_ == "Payment":
            validate_payment_properties({k: list(v) for k, v in body.link.properties.items()})
        elif body.link.payment_kind:
            raise ValueError("Only a payment has a kind of payment")
    if body.kind == "event":
        if body.event is None:
            raise ValueError("Write the event")
        if _normalize_date(body.event.date) is None:
            raise ValueError("The date is a year, a month or a day (2019, 2019-03, 2019-03-03)")
        for entity_id in body.event.entity_ids:
            in_case(entity_id)


def add(db: Session, inv: str, body: EntryIn, *, actor: str | None) -> dict[str, Any]:
    """Add it, with its source; returns what was made."""
    from app.schemas.api import (
        EntityCreate,
        LeadCreate,
        LeadLinkCreate,
        TimelineEventCreate,
    )
    from app.services.app_lock import owner_name
    from app.services.entities import create_entity
    from app.services.evidence import create_evidence
    from app.services.leads import create_lead, create_lead_link
    from app.services.relationships import create_relationship
    from app.services.timeline import create_timeline_event

    src = body.source or SourceIn(mode="none")
    _validate(db, inv, body, src)
    who = owner_name(db) or "a person"
    evidence: Evidence | None = None
    origin = f"hand:{who}"
    if src.mode == "passage":
        doc, quote, locator = _passage(db, inv, src)
        evidence = create_evidence(db, {"source_id": doc.source_id, "quote": quote, "locator": locator,
                                        "notes": f"Chosen by {who} when adding it by hand."}, actor=actor)
        origin = f"document:{doc.id}#{locator}"
    elif src.mode == "record":
        title = (src.title or "").strip()
        if not title:
            raise ValueError("Name the source: who or what said it")
        source = Source(investigation_id=inv, title=title, source_type=src.source_type, url=(src.url or None),
                        metadata_json={"added_by_hand": True, "by": who})
        db.add(source)
        db.flush()
        evidence = create_evidence(db, {"source_id": source.id, "quote": (src.quote or "").strip() or None,
                                        "locator": (src.locator or "").strip() or None,
                                        "notes": (src.notes or "").strip() or f"A source with no file, added by hand by {who}."}, actor=actor)
        origin = f"source:{source.id}"

    def party(new: NewParty) -> Entity:
        props: dict[str, list[str]] = {"name": [new.caption.strip()]}
        if new.aliases:
            props["alias"] = [a.strip() for a in new.aliases if a.strip()]
        if new.country:
            props["country"] = [new.country.strip()]
        return create_entity(db, EntityCreate(investigation_id=inv, schema=new.schema_, caption=new.caption.strip(),
                                              properties=props, dataset="reporter", origin=origin))

    made: dict[str, Any] = {"record_type": body.kind, "record_id": None, "evidence_id": evidence.id if evidence else None,
                            "lead_id": None, "parties": []}
    link_target: dict[str, str] = {}
    if body.kind == "party":
        if body.party is None:
            raise ValueError("Write the party")
        row = party(body.party)
        made["record_id"] = row.id
        link_target = {"entity_id": row.id}
        sentence = f"{row.caption} ({body.party.schema_})"
    elif body.kind == "link":
        if body.link is None:
            raise ValueError("Write the link")
        ends = []
        for end in (body.link.source, body.link.target):
            if end.entity_id:
                ends.append(end.entity_id)
            elif end.new:
                new = party(end.new)
                made["parties"].append(new.id)
                ends.append(new.id)
            else:
                raise ValueError("Each end of the link is a party of the case or a new one")
        edge = create_relationship(db, investigation_id=inv, schema=body.link.schema_, source_entity_id=ends[0],
                                   target_entity_id=ends[1], properties=body.link.properties, dataset="reporter",
                                   origin=origin, evidence_id=evidence.id if evidence else None,
                                   payment_kind=body.link.payment_kind if body.link.schema_ == "Payment" else None)
        made["record_id"] = edge.id
        link_target = {"relationship_id": edge.id}
        names = {e.id: e.caption for e in db.scalars(select(Entity).where(Entity.id.in_(ends)))}
        sentence = f"{names.get(ends[0], '?')} – {body.link.schema_.lower()} → {names.get(ends[1], '?')}"
    else:
        if body.event is None:
            raise ValueError("Write the event")
        e = body.event
        row_ev = create_timeline_event(db, TimelineEventCreate(
            investigation_id=inv, title=e.title.strip(), description=(f"Where: {e.where.strip()}" if e.where else None),
            date_start=e.date, precision=e.precision, verification_status="asserted" if evidence else "unresolved",
            entity_id=e.entity_ids[0] if e.entity_ids else None, source_id=evidence.source_id if evidence else None,
            evidence_id=evidence.id if evidence else None, dataset="reporter"))
        made["record_id"] = row_ev.id
        link_target = {"entity_id": e.entity_ids[0]} if e.entity_ids else {}
        sentence = f"{e.title.strip()} ({e.date})"
    if src.mode == "none":
        lead = create_lead(db, LeadCreate(investigation_id=inv, title=f"Find a source for: {sentence}"[:300],
                                          detail=f"Added by hand by {who} with no source yet. It is Not yet shown until a source is linked."))
        made["lead_id"] = lead.id
        if link_target:
            create_lead_link(db, lead, LeadLinkCreate(**link_target, note="Added by hand, no source yet"))
    db.commit()
    return made
