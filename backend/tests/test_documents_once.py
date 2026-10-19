"""A name is proposed once per document, with every place it is mentioned,
and keeping it attributes every mention to the one record."""

from __future__ import annotations

from app.db.session import SessionLocal
from app.models.domain import Document, ExtractionCandidate, Investigation, Source, Statement
from app.services.case_home import mentioned
from app.services.documents import extract_document, review_candidate


def _doc(db, pages):
    inv = Investigation(name="Once per document")
    db.add(inv); db.flush()
    src = Source(investigation_id=inv.id, title="t", source_type="document")
    db.add(src); db.flush()
    doc = Document(investigation_id=inv.id, source_id=src.id, filename="t.txt", storage_path="/nonexistent", sha256="x" * 64)
    db.add(doc); db.commit()
    chunks = [{"locator": f"page {i}", "page_number": i, "text": t} for i, t in enumerate(pages, 1)]
    return extract_document(db, doc.id, text=(chunks, []))


def test_a_name_on_many_pages_is_one_proposal_that_counts_its_mentions():
    header = "This complaint alleges that Granton Property Holdings paid the fund."
    pages = [f"{header} Page {i} says Tanore Finance Corporation moved money." for i in range(1, 6)]
    with SessionLocal() as db:
        doc = _doc(db, pages)
        rows = db.query(ExtractionCandidate).filter_by(document_id=doc.id).all()
        names = [r for r in rows if r.candidate_type == "entity" and r.payload["caption"] == "Tanore Finance Corporation"]
        assert len(names) == 1
        assert names[0].payload["mention_count"] == 5
        assert [m["locator"] for m in names[0].payload["mentions"]] == [f"page {i}" for i in range(1, 6)]
        assert mentioned(names[0].payload) == " · mentioned 5 times on 5 pages"
        claims = [r for r in rows if r.candidate_type == "claim" and r.payload["text"].startswith("This complaint alleges")]
        assert len(claims) == 1 and claims[0].payload["mention_count"] == 5, "a repeated sentence is one claim to decide"
        assert sum(r.candidate_type == "evidence" for r in rows) == 5, "each page stays its own passage"

        review_candidate(db, names[0], decision="accept", entity_schema="Company", entity_identity_decision="create_new")
        origins = {s.origin.split("#")[1].split("@")[0] for s in db.query(Statement).filter(Statement.entity_id == names[0].accepted_record_id)}
        assert origins == {f"page {i}" for i in range(1, 6)}, "every mention is attributed to the one record"


def test_the_name_finder_does_not_run_across_sentences_and_or_table_cells():
    from app.services.entity_signals import clean_names
    names = lambda raw: [c for c, _, _ in clean_names(raw)]  # noqa: E731
    assert names("United States. As") == ["United States"]
    assert names("Red \nGranite Pictures. For") == ["Red Granite Pictures"]
    assert names("TAN and Tanore") == [] and names("California and New York") == ["New York"]
    assert names("Section VI") == [] and names("As of June") == [] and names("Hi Eric") == []
    assert names("U.S. Department of Justice") == ["U.S. Department of Justice"]
    assert names("The Park Lane Hotel") == ["The Park Lane Hotel"] and names("Bank of America") == ["Bank of America"]
    assert names("LOW \nDate \nSending Party \nReceiving Party") == ["Sending Party", "Receiving Party"]
    assert names("WAS PURCHASED USING") == [] and names("BLACKSTONE DISTRIBUTED APPROXIMATELY") == []
    assert names("WERE ALSO TRANSFERRED THROUGH THE GOOD") == []
    assert names("UNITED STATES OF AMERICA") == ["UNITED STATES OF AMERICA"] and names("BANK OF AMERICA") == ["BANK OF AMERICA"]
    assert names("Brazen Sky’s") == ["Brazen Sky"]
    raw = "Deutsche \nBank"
    caption, start, end = clean_names(raw)[0]
    assert caption == "Deutsche Bank" and raw[start:end] == raw, "the span covers the page's own characters"
