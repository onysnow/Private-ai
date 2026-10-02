"""A chart visual in the exports: a native, editable PowerPoint chart in a
deck; in a Word write-up the image from the export bridge, or the table
and a line saying the image was not available (ADR-0005, line 2). Every
value keeps its record citations either way."""

from io import BytesIO

import pytest
from docx import Document as DocxDocument
from fastapi.testclient import TestClient
from pptx import Presentation

import app.services.writeups as writeups_module
from app.ai.chart_check import resolve_chart
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Deck
from app.services.assistant_context import describe_record_refs
from app.services.decks import chart_record_refs, deck_citation_refs, normalize_visual, render_deck_pptx
from app.services.demo_seed import seed_demo_investigation
from app.services.writeups import create_writeup, extract_cited_refs, extract_plain_text, render_writeup_docx
from app.visuals.render_client import RenderUnavailable

client = TestClient(app)

TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005020203"
    "f1a2b9780000000049454e44ae426082"
)


@pytest.fixture()
def demo():
    with SessionLocal() as db:
        inv, _ = seed_demo_investigation(db)
        chart, record = resolve_chart(db, inv.id, {"type": "chart", "spec": {
            "kind": "bar", "title": "Meridian received all of the money", "query": {"name": "payments_by_party", "params": {"direction": "received"}},
        }})
        assert chart is not None, record
        yield db, inv.id, chart


def test_resolved_chart_carries_its_data_report_and_words(demo):
    _db, _inv, chart = demo
    assert chart["type"] == "chart" and chart["spec"]["kind"] == "bar"
    assert chart["data"]["rows"][0]["label"] == "Meridian Holdings Ltd" and chart["data"]["rows"][0]["value"] == 2400000.0
    assert chart["data"]["rows"][0]["record_refs"][0]["record_type"] == "relationship"
    assert chart["report"]["ok"] is True and 20 in {w["rule"] for w in chart["report"]["warnings"]}
    assert chart["text"]["alt_text"].startswith("Bar chart: Meridian received all of the money")
    assert chart["text"]["data_table"]["rows"][0]["record_count"] == 1


def test_normalize_visual_keeps_a_resolved_chart_and_drops_a_bare_order(demo):
    _db, _inv, chart = demo
    kept = normalize_visual({**chart, "style": {"preset": "ranked"}})
    assert kept is not None and kept["type"] == "chart" and "style" not in kept
    assert normalize_visual({"type": "chart", "spec": chart["spec"]}) is None
    assert normalize_visual({"type": "chart", "spec": {"kind": "bar"}, "data": chart["data"]}) is None
    assert chart_record_refs(chart) == [{"record_type": "relationship", "record_id": chart["data"]["rows"][0]["record_refs"][0]["record_id"]}]


def test_deck_export_draws_a_native_chart_and_cites_its_records(demo):
    db, inv_id, chart = demo
    row = Deck(investigation_id=inv_id, title="Money", slides_json=[
        {"kind": "content", "heading": "Who got paid", "bullets": ["Meridian received the whole sum"], "evidence": [], "notes": "", "visual": chart},
    ])
    db.add(row)
    db.commit()
    db.refresh(row)
    refs = deck_citation_refs(row.slides_json)
    assert refs == chart_record_refs(chart)
    details = describe_record_refs(db, investigation_id=inv_id, refs=refs)
    prs = render_deck_pptx(row, details)
    slides = list(prs.slides)
    assert len(slides) == 3  # title, content, sources
    charts = [shape for shape in slides[1].shapes if shape.has_chart]
    assert len(charts) == 1
    categories = list(charts[0].chart.plots[0].categories)
    assert categories == ["Meridian Holdings Ltd · 1 payment †"]
    assert list(charts[0].chart.plots[0].series[0].values) == [2400000.0]
    text = "\n".join(shape.text_frame.text for slide in slides for shape in slide.shapes if shape.has_text_frame)
    assert "Meridian received all of the money" in text
    assert "Source: 1 payment in this investigation's records" in text
    assert "Sources  [1]" in text
    assert "Bellcastle Trading Group — Payment → Meridian Holdings Ltd" in text  # the relationship, by its caption

    exported = client.get(f"/api/decks/{row.id}/export.pptx")
    assert exported.status_code == 200
    assert sum(1 for s in Presentation(BytesIO(exported.content)).slides for sh in s.shapes if sh.has_chart) == 1


def test_deck_with_a_column_chart_exports_too(demo):
    db, inv_id, _chart = demo
    column, record = resolve_chart(db, inv_id, {"type": "chart", "spec": {
        "kind": "column", "title": "Events cluster in 2023 and 2024", "query": {"name": "events_over_time", "params": {"granularity": "year"}},
    }})
    assert column is not None, record
    row = Deck(investigation_id=inv_id, title="When", slides_json=[{"kind": "content", "heading": "Timing", "bullets": [], "evidence": [], "notes": "", "visual": column}])
    db.add(row)
    db.commit()
    db.refresh(row)
    prs = render_deck_pptx(row, describe_record_refs(db, investigation_id=inv_id, refs=deck_citation_refs(row.slides_json)))
    chart_shape = next(shape for shape in list(prs.slides)[1].shapes if shape.has_chart)
    assert list(chart_shape.chart.plots[0].categories) == ["2019 †", "2020", "2021 †", "2022", "2023", "2024"]
    assert list(chart_shape.chart.plots[0].series[0].values) == [1.0, 0.0, 1.0, 0.0, 2.0, 2.0]


def _writeup_with_chart(db, inv_id, chart):
    content = {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Who got paid"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "The whole sum went to Meridian."}]},
        {"type": "evidenceVisual", "attrs": {"visual": chart}},
    ]}
    return create_writeup(db, investigation_id=inv_id, title="Money brief", content_json=content)


def test_writeup_counts_chart_records_as_citations_and_lists_them_in_plain_text(demo):
    db, inv_id, chart = demo
    row = _writeup_with_chart(db, inv_id, chart)
    assert extract_cited_refs(row.content_json) == chart_record_refs(chart)
    assert row.cited_record_refs == chart_record_refs(chart)
    text = extract_plain_text(row.content_json)
    assert "Meridian received all of the money" in text and "2400000.0 — Meridian Holdings Ltd" in text


def test_writeup_export_falls_back_to_a_table_when_the_render_service_is_down(demo, monkeypatch):
    db, inv_id, chart = demo
    row = _writeup_with_chart(db, inv_id, chart)

    def unreachable(*args, **kwargs):
        raise RenderUnavailable("render service at http://render:8070 could not be reached: ConnectError")

    monkeypatch.setattr("app.visuals.render_client.render_png", unreachable)
    docx = render_writeup_docx(row, describe_record_refs(db, investigation_id=inv_id, refs=row.cited_record_refs))
    paragraphs = [p.text for p in docx.paragraphs]
    assert any("Chart image not available" in p and "could not be reached" in p for p in paragraphs)
    assert not docx.inline_shapes
    cells = "\n".join(c.text for t in docx.tables for r in t.rows for c in r.cells)
    assert "Meridian Holdings Ltd · 1 payment †" in cells and "$2.4M" in cells and "[1]" in cells
    assert any(p.startswith("Source: 1 payment") for p in paragraphs)
    assert "Sources" in paragraphs


def test_writeup_export_embeds_the_png_when_the_bridge_answers(demo, monkeypatch):
    db, inv_id, chart = demo
    row = _writeup_with_chart(db, inv_id, chart)
    calls = {}

    def fake_render(option, width, height, **kwargs):
        calls["option"] = option
        return TINY_PNG

    monkeypatch.setattr("app.visuals.render_client.render_png", fake_render)
    docx = render_writeup_docx(row, describe_record_refs(db, investigation_id=inv_id, refs=row.cited_record_refs))
    assert calls["option"]["title"][0]["text"] == "Meridian received all of the money"
    assert len(docx.inline_shapes) == 1
    paragraphs = [p.text for p in docx.paragraphs]
    assert not any("not available" in p for p in paragraphs)
    assert any(p.startswith("Bar chart: Meridian received all of the money") for p in paragraphs)  # the alt text as caption
    cells = "\n".join(c.text for t in docx.tables for r in t.rows for c in r.cells)
    assert "Meridian Holdings Ltd · 1 payment †" in cells and "$2.4M" in cells and "[1]" in cells

    exported = client.get(f"/api/writeups/{row.id}/export.docx")
    assert exported.status_code == 200
    assert len(DocxDocument(BytesIO(exported.content)).inline_shapes) == 1


def test_the_old_three_visuals_still_export_as_before(demo):
    db, inv_id, _chart = demo
    ev = [{"record_type": "claim", "record_id": "clm-1"}]
    row = Deck(investigation_id=inv_id, title="Old visuals", slides_json=[
        {"kind": "content", "heading": "Figures", "bullets": ["a"], "evidence": [], "notes": "", "visual": {"type": "figures", "items": [{"value": "$2.4M", "label": "wired", "evidence": ev}]}},
        {"kind": "content", "heading": "Timeline", "bullets": [], "evidence": [], "notes": "", "visual": {"type": "timeline", "items": [
            {"date": "2023-11-03", "label": "Signed", "evidence": ev}, {"date": "2023-11-14", "label": "Wired", "evidence": ev}]}},
        {"kind": "content", "heading": "Bars", "bullets": [], "evidence": [], "notes": "", "visual": {"type": "bar", "title": "Fees", "unit": "USD", "items": [
            {"label": "Bellcastle", "value": 2400000, "evidence": ev}, {"label": "Arden", "value": 285000, "evidence": ev}]}},
    ])
    db.add(row)
    db.commit()
    db.refresh(row)
    prs = render_deck_pptx(row, [])
    slides = list(prs.slides)
    assert len(slides) == 5
    assert sum(1 for s in slides for sh in s.shapes if sh.has_chart) == 1
    assert writeups_module.EMPTY_DOC["type"] == "doc"
