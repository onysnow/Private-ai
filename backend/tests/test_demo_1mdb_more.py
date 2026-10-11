"""The rest of the 1MDB demo case (app/demo/one_mdb/more.json and files/): its
records hang together, what it ships is public-domain or the Workbench's own,
the rebuilt emails carry only the filings' quoted words, a file that cannot be
fetched never stops the case, and loading puts every kind of record in place.
Nothing is downloaded here."""

from __future__ import annotations

import email
import hashlib
import re
import zipfile
from collections import Counter
from email import policy

import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.domain import (
    Claim,
    ClaimEvidenceLink,
    Document,
    Entity,
    Evidence,
    ExtractionCandidate,
    Lead,
    LeadLink,
    LeadProfile,
    RelationshipEdge,
    RelationshipEvidenceReviewEvent,
    Source,
    TableMapping,
    TimelineEvent,
)
from app.services import demo_1mdb
from app.services.claims import CLAIM_STATUSES
from app.services.financial_flows import investigation_financial_ledger
from app.services.places import investigation_places
from app.services.relationships import RELATIONSHIP_SCHEMAS
from app.services.timeline import (
    TIMELINE_EVENT_PRECISIONS,
    TIMELINE_EVENT_VERIFICATION_STATUSES,
)

MORE = demo_1mdb.more()
DOCS = {d["id"]: d for d in MORE["documents"]}
KINDS = {"photo", "video", "audio", "article", "social", "judgment", "press_release", "email", "spreadsheet", "docx", "archive", "registry"}


def _refs(obj, out):
    if isinstance(obj, dict):
        if "doc" in obj and "quote" in obj:
            out.append(obj)
        for value in obj.values():
            _refs(value, out)
    elif isinstance(obj, list):
        for value in obj:
            _refs(value, out)
    return out


def test_the_more_records_hang_together():
    base = {d["id"] for d in demo_1mdb.manifest()}
    web = {w["id"] for w in MORE["web_sources"]}
    assert not set(DOCS) & base and {d["kind"] for d in MORE["documents"]} <= KINDS
    for ref in _refs(MORE, []):
        assert ref["doc"] in base | set(DOCS) | web, ref["doc"]
        assert ref["quote"].strip() and ref["locator"]
    keys = {e["key"] for e in demo_1mdb.records()["entities"]} | {e["key"] for e in MORE["entities"]} | {p["key"] for p in MORE["places"]}
    for value in MORE["values"]:
        assert value["entity"] in keys and value["evidence"]["quote"]
    for r in MORE["relationships"]:
        assert r["schema"] in RELATIONSHIP_SCHEMAS and r["source"] in keys and r["target"] in keys
        for amount in r["properties"].get("amount", []):
            assert re.fullmatch(r"\d+(\.\d+)?", amount), amount
        for prop in ("date", "startDate", "endDate"):
            for date in r["properties"].get(prop, []):
                assert re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", date), date
    currencies = {c for r in MORE["relationships"] if r["schema"] == "Payment" for c in r["properties"].get("currency", [])}
    assert {"MYR", "GBP", "EUR", "CHF", "SGD"} <= currencies
    for ev in MORE["events"]:
        assert ev["precision"] in TIMELINE_EVENT_PRECISIONS and ev["status"] in TIMELINE_EVENT_VERIFICATION_STATUSES
        assert ev.get("entity") in keys
    assert {ev["status"] for ev in MORE["events"]} >= {"disputed", "approximate"}
    assert {ev["precision"] for ev in MORE["events"]} >= {"range", "month", "year", "day"}
    for c in MORE["claims"] + MORE["inferred_claims"]:
        assert c["status"] in CLAIM_STATUSES
        for q in c["evidence"]:
            assert q["stance"] in ("supports", "contradicts", "context")
            assert q["stance"] != "contradicts" or q.get("note"), c["id"]
    # Inferred identities are never stated as facts.
    assert all(c["status"] in ("lead", "unverified") for c in MORE["inferred_claims"])
    assert len(MORE["places"]) == 21 and all(p["properties"]["latitude"] and p["properties"]["longitude"] for p in MORE["places"])
    park = next(p for p in MORE["places"] if p["key"] == "place-park-laurel")
    assert "not from the filing" in park["properties"]["notes"][0]


def test_only_public_domain_and_own_files_are_shipped():
    for d in MORE["documents"]:
        if d["mode"] == "ship":
            data = (demo_1mdb.FILES / (d.get("path") or d["filename"])).read_bytes()
            assert hashlib.sha256(data).hexdigest() == d["sha256"], d["id"]
            assert d["source_type"] == "public_record", d["id"]
            assert d["kind"] != "photo" or d["licence"].lower().startswith("public domain")
        if d["kind"] in ("article", "video", "audio") or (d["kind"] == "photo" and not d["licence"].lower().startswith("public domain")):
            assert d["mode"] != "ship", f"{d['id']} is copyrighted: fetch it, do not ship it"
    shipped = {(d.get("path") or d["filename"]) for d in MORE["documents"] if d["mode"] == "ship"}
    on_disk = {str(p.relative_to(demo_1mdb.FILES)) for p in demo_1mdb.FILES.rglob("*") if p.is_file() and p.name != ".gitattributes"}
    assert on_disk == shipped


def test_the_rebuilt_emails_carry_only_the_quoted_words():
    emails = [d for d in MORE["documents"] if d["kind"] == "email" and d["filename"].endswith(".eml")]
    assert 10 <= len(emails) <= 15
    by_id = {}
    for d in emails:
        msg = email.message_from_bytes((demo_1mdb.FILES / d["path"]).read_bytes(), policy=policy.default)
        by_id[msg["Message-ID"]] = msg
        rebuilt = d["rebuilt_from"]
        pages = "–".join(str(p) for p in sorted({rebuilt["pages"][0], rebuilt["pages"][-1]}))
        # RFC 2047 encoded words lose the spaces between them on a round trip, so compare without spaces.
        assert re.sub(r"\s", "", str(msg["X-Workbench-Rebuilt-From"])) == re.sub(r"\s", "", f"{rebuilt['doc']}, page {pages}, ¶{rebuilt['para']}")
        body = msg.get_content()
        first, rest = body.split("\n", 1)
        assert first.startswith("Rebuilt by the Workbench from the quote in ") and first.endswith("Not an original email.")
        assert f"paragraph {rebuilt['para']}" in first
        assert [p for p in rest.strip().split("\n\n[…]\n\n")] == rebuilt["quotes"]
        for header in ("From", "To", "Cc"):
            for address in re.findall(r"<([^>]+)>", str(msg.get(header) or "")):
                assert address.endswith("@rebuilt.invalid"), address
    # One thread of three, linked by In-Reply-To / References.
    longest = 0
    for msg in by_id.values():
        depth, current = 1, msg
        while current.get("In-Reply-To") and current["In-Reply-To"] in by_id:
            depth, current = depth + 1, by_id[current["In-Reply-To"]]
        longest = max(longest, depth)
    assert longest >= 3
    with zipfile.ZipFile(demo_1mdb.FILES / "emails-rebuilt-from-us-filings.zip") as z:
        assert len([n for n in z.namelist() if n.endswith(".eml")]) == len(emails)
    import mailbox
    assert len(mailbox.mbox(str(demo_1mdb.FILES / "thread-ruscha-11th-hour-2013.mbox"))) == 3


def test_the_word_file_says_it_is_a_conversion():
    import docx
    d = DOCS["docx-doj-2016-introduction"]
    paragraphs = [p.text for p in docx.Document(str(demo_1mdb.FILES / d["filename"])).paragraphs]
    assert paragraphs[0].startswith("Converted to Word by the Workbench from ")
    assert any(p.startswith("6. 1MDB was ostensibly created") for p in paragraphs)


def test_a_file_that_cannot_be_fetched_stays_a_link():
    def fail(url: str) -> bytes:
        raise OSError("network down")

    fetched = demo_1mdb.fetch_more(fail)
    assert len(fetched) == len(MORE["documents"])
    for meta, data in fetched:
        if meta["mode"] == "ship":
            assert data is not None
        else:
            assert data is None and (meta["mode"] == "link" or "network down" in meta["_why"])
    # A page that changed is recorded, a pinned file that changed is refused, an error page is not the page.
    photo = next(d for d in MORE["documents"] if d["kind"] == "photo" and d["mode"] == "fetch")
    meta, data = demo_1mdb._fetch_one(photo, lambda url: b"\xff\xd8 another picture")
    assert data is None and "different file" in meta["_why"]
    article = next(d for d in MORE["documents"] if d["kind"] == "article" and d["mode"] == "fetch")
    page = ("<main>" + "".join(f"<p>{q}</p>" for q in article["check_quotes"]) + "</main>").encode()
    meta, data = demo_1mdb._fetch_one(article, lambda url: page)
    assert data == page and meta["_fetched_sha256"] == hashlib.sha256(page).hexdigest() and "recorded" in meta["_hash_note"]
    meta, data = demo_1mdb._fetch_one(article, lambda url: b"<main><h1>Sorry, this service is currently unavailable.</h1></main>")
    assert data is None and "did not answer with the page" in meta["_why"]


@pytest.fixture
def loaded(tmp_path):
    base = [(meta, f"stand-in for {meta['id']}".encode()) for meta in demo_1mdb.manifest()]

    def offline(url: str) -> bytes:
        raise OSError("offline test")

    with SessionLocal() as db:
        inv, ids = demo_1mdb.build(db, base + demo_1mdb.fetch_more(offline), storage_dir=tmp_path)
        assert demo_1mdb.LAST_PROBLEMS == []
        yield db, inv, ids


def test_loading_puts_every_kind_of_record_in_place(loaded):
    db, inv, ids = loaded
    sources = list(db.scalars(select(Source).where(Source.investigation_id == inv.id)))
    kinds = Counter((s.metadata_json or {}).get("kind") for s in sources)
    assert {"photo", "video", "audio", "article", "social", "judgment", "email", "spreadsheet", "docx", "archive"} <= set(kinds)
    assert any(s.source_type == "social" for s in sources)
    languages = {(s.metadata_json or {}).get("language") for s in sources}
    assert {"fr", "de", "ms"} <= languages
    # The shipped files are documents; the email headers show before the email is read.
    documents = {d.filename: d for d in db.scalars(select(Document).where(Document.investigation_id == inv.id))}
    assert {"doj-2016-park-laurel-transfers.csv", "doj-2016-complaint-introduction-converted.docx", "emails-rebuilt-from-us-filings.zip"} <= set(documents)
    eml = next(d for name, d in documents.items() if name.startswith("e05-"))
    headers = db.get(Source, eml.source_id).metadata_json["email"]
    assert headers["in_reply_to"] and headers["from"][0].endswith("@rebuilt.invalid>")
    # Public-domain pictures are held, with the day they were taken.
    pictures = list(db.scalars(select(Evidence).where(Evidence.document_id.is_not(None), Evidence.captured_on.is_not(None))))
    assert len([p for p in pictures if db.get(Source, p.source_id).investigation_id == inv.id]) >= 4
    # The payments table went through the mapping: proposals, not records.
    mapping = db.scalar(select(TableMapping).where(TableMapping.investigation_id == inv.id))
    assert mapping is not None and mapping.rows_read == 12 and mapping.links_proposed == 12
    assert db.scalar(select(ExtractionCandidate).where(ExtractionCandidate.investigation_id == inv.id, ExtractionCandidate.candidate_type == "relationship"))


def test_the_records_reach_the_screens(loaded):
    db, inv, _ = loaded
    ledger = investigation_financial_ledger(db, inv.id)
    currencies = {t["currency"] for t in ledger["transactions"]}
    assert {"MYR", "GBP", "EUR", "CHF", "SGD", "USD"} <= currencies
    places = investigation_places(db, inv.id)
    assert len(places["places"]) == 21 and not places["omitted"]
    assert any(p["links"] for p in places["places"])
    statuses = Counter(c.status for c in db.scalars(select(Claim).where(Claim.investigation_id == inv.id)))
    assert statuses["confirmed"] and statuses["rejected"] and statuses["disputed"]
    graded = [c for c in db.scalars(select(Claim).where(Claim.investigation_id == inv.id)) if c.evidence_grade]
    assert {c.evidence_grade for c in graded} >= {"robust", "medium"}
    stances = Counter(r.stance for r in db.scalars(select(RelationshipEvidenceReviewEvent).join(
        RelationshipEdge, RelationshipEdge.id == RelationshipEvidenceReviewEvent.relationship_edge_id).where(RelationshipEdge.investigation_id == inv.id)))
    assert stances["contradicts"] and stances["superseded"] and stances["context"]
    claim_stances = Counter(link.stance for link in db.scalars(select(ClaimEvidenceLink).join(Claim, Claim.id == ClaimEvidenceLink.claim_id)
                                                                .where(Claim.investigation_id == inv.id)))
    assert claim_stances["contradicts"] >= 10
    events = list(db.scalars(select(TimelineEvent).where(TimelineEvent.investigation_id == inv.id)))
    assert {e.precision for e in events} >= {"range", "month", "year"} and any(e.date_end for e in events)
    assert {e.verification_status for e in events} >= {"disputed", "approximate"}
    najib = db.scalar(select(Entity).where(Entity.investigation_id == inv.id, Entity.caption.like("Mohd Najib%")))
    assert najib.properties["birthDate"] == ["1953-07-23"] and "role.pep" in najib.properties["topics"]
    yacht = db.scalar(select(Entity).where(Entity.investigation_id == inv.id, Entity.schema == "Vessel"))
    assert yacht.properties["imoNumber"] == ["1012086"] and yacht.properties["mmsi"] == ["319059800"]
    leads = list(db.scalars(select(Lead).where(Lead.investigation_id == inv.id)))
    with_action = [lead for lead in leads if (db.scalar(select(LeadProfile).where(LeadProfile.lead_id == lead.id)) or LeadProfile()).next_action]
    assert len(with_action) >= 10
    assert db.scalar(select(LeadLink).where(LeadLink.lead_id.in_([lead.id for lead in leads]), LeadLink.claim_id.is_not(None)))


def test_every_document_is_counted_for_the_loading_bar():
    """Each of more.json's documents counts once, whether it arrived or not,
    so the loading bar reaches the end."""
    import threading
    seen = []
    lock = threading.Lock()

    def counted():
        with lock:
            seen.append(1)

    def offline(url):
        raise OSError("offline")

    demo_1mdb.fetch_more(offline, counted)
    assert len(seen) == len(demo_1mdb.more_manifest())
    assert demo_1mdb.to_fetch() == len(demo_1mdb.manifest()) + len(demo_1mdb.more_manifest())
