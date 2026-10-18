"""The confidence grade on each claim and the claim-strength grid (visuals
pass 6; ADR-0005, line 5): a reporter grades a claim on the IPCC AR5
evidence-by-agreement grid in a review, and the grid chart (heatmap) counts
the claims in each cell, checked like every other chart, and in decks and
briefs."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.ai.chart_check import resolve_chart
from app.db.session import SessionLocal
from app.main import app
from app.models.domain import Deck
from app.services.decks import render_deck_pptx
from app.services.presentation_style import THEMES
from app.services.writeups import create_writeup, render_writeup_docx
from app.visuals.checker import check_visual
from app.visuals.data_service import DataRow, RecordRef, VisualData, run_query
from app.visuals.echarts import ChartDoesNotFit, build_chart, heatmap_fill, heatmap_step
from app.visuals.render_client import RenderUnavailable
from app.visuals.spec import QueryRef, parse_spec

client = TestClient(app)
DARK = THEMES["dark_academia"]


def _review(claim_id: str, **body):
    return client.post(f"/api/claims/{claim_id}/reviews", json={"status": "supported", "confidence": 0.7, "rationale": "Checked.",
                                                                 "override_reason": "Grid test: no evidence linked.", **body})


def _investigation() -> tuple[str, list[str]]:
    inv = client.post("/api/investigations", json={"name": "Grades"}).json()
    ids = [client.post("/api/claims", json={"investigation_id": inv["id"], "text": text, "status": "unverified", "confidence": 0}).json()["id"]
           for text in ("Meridian paid Bellcastle", "Voss owns the villa", "Orrin was a front", "The audit was cancelled")]
    _review(ids[0], evidence_grade="robust", agreement_grade="high")
    _review(ids[1], evidence_grade="robust", agreement_grade="high")
    _review(ids[2], evidence_grade="limited", agreement_grade="low")
    return inv["id"], ids


# --- the grade --------------------------------------------------------------------------

def test_a_review_grades_a_claim_on_both_halves_of_the_grid_and_keeps_the_history():
    inv = client.post("/api/investigations", json={"name": "Grade"}).json()
    src = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Filing", "source_type": "document"}).json()
    other = client.post("/api/sources", json={"investigation_id": inv["id"], "title": "Register", "source_type": "document"}).json()
    claim = client.post("/api/claims", json={"investigation_id": inv["id"], "text": "A owns B", "status": "unverified", "confidence": 0}).json()
    for source in (src, other):
        ev = client.post("/api/evidence", json={"source_id": source["id"], "quote": "A owns B", "locator": "p. 1"}).json()
        client.post(f"/api/claims/{claim['id']}/evidence", json={"evidence_id": ev["id"], "stance": "supports"})
    assert claim["evidence_grade"] is None and claim["agreement_grade"] is None

    # Both halves or neither; only the grid's own words.
    assert _review(claim["id"], evidence_grade="robust").status_code == 400
    assert _review(claim["id"], evidence_grade="strong", agreement_grade="high").status_code == 422
    body = _review(claim["id"], evidence_grade="medium", agreement_grade="high").json()
    assert (body["claim"]["evidence_grade"], body["claim"]["agreement_grade"]) == ("medium", "high")
    assert body["workspace"]["source_count"] == 2   # what the evidence grade is judged on, with the stances
    event = body["review"]
    assert (event["from_evidence_grade"], event["to_evidence_grade"], event["to_agreement_grade"]) == (None, "medium", "high")

    # A review that does not grade keeps the grade.
    kept = _review(claim["id"], status="confirmed").json()
    assert (kept["claim"]["evidence_grade"], kept["claim"]["agreement_grade"]) == ("medium", "high")
    assert (kept["review"]["from_evidence_grade"], kept["review"]["to_evidence_grade"]) == ("medium", "medium")


# --- the query and the drawing ------------------------------------------------------------

def test_claims_by_strength_counts_every_cell_and_lists_the_claims_not_graded():
    inv_id, ids = _investigation()
    with SessionLocal() as db:
        data = run_query(db, inv_id, QueryRef(name="claims_by_strength"))
    assert data.series_kind == "grid" and len(data.rows) == 9 and data.record_count == 3
    cells = {(r.across, r.down): r for r in data.rows}
    assert cells[("robust", "high")].value == 2 and {ref.record_id for ref in cells[("robust", "high")].record_refs} == set(ids[:2])
    assert cells[("limited", "low")].value == 1 and cells[("medium", "medium")].value == 0
    assert [(o["reason"], o["record_id"]) for o in data.omitted] == [("not graded", ids[3])]
    assert VisualData.from_dict(data.as_dict()).rows[8].across == "robust"


def _grid() -> VisualData:
    counts = {("limited", "low"): 1, ("medium", "medium"): 3, ("robust", "high"): 5}
    rows = [DataRow(f"{e} evidence, {a} agreement", float(counts.get((e, a), 0)),
                    [RecordRef("claim", f"{e}-{a}-{n}") for n in range(counts.get((e, a), 0))], counts.get((e, a), 0), f"{i}{j}", across=e, down=a)
            for i, e in enumerate(("limited", "medium", "robust")) for j, a in enumerate(("low", "medium", "high"))]
    return VisualData("inv", "claims_by_strength", {}, "claims", "count", "grid", "claims", rows, record_count=9,
                      omitted=[{"reason": "not graded", "record_type": "claim", "record_id": "x", "detail": "x"}])


def _spec(**extra):
    return parse_spec({"kind": "heatmap", "question": "confidence", "title": "Most claims rest on robust, agreeing evidence",
                       "query": {"name": "claims_by_strength"}, **extra})


def test_each_cell_sits_where_its_grades_meet_shaded_by_its_count_with_the_count_written_in_it():
    built = build_chart(_spec(), _grid(), DARK)
    option = built.option
    assert option["xAxis"]["data"] == ["Limited", "Medium", "Robust"] and option["yAxis"]["data"] == ["Low", "Medium", "High"]
    cells = {d["name"]: d for d in option["series"][0]["data"]}
    assert cells["robust evidence, high agreement"]["value"] == [2, 2, 5.0]
    assert cells["robust evidence, high agreement"]["label"]["formatter"] == "5 claims"
    assert cells["limited evidence, low agreement"]["label"]["formatter"] == "1 claim"
    # Equal steps of the largest count; an empty cell is the page colour.
    assert [heatmap_step(v, 5) for v in (0, 1, 2, 3, 5)] == [0, 1, 2, 3, 4]
    assert cells["medium evidence, low agreement"]["itemStyle"]["color"] == heatmap_fill(DARK, 0) == f"#{DARK.page}"
    assert cells["robust evidence, high agreement"]["itemStyle"]["color"] == heatmap_fill(DARK, 4)
    # ECharts draws a heatmap only with a visualMap; its pieces give the same shades.
    pieces = option["visualMap"]["pieces"]
    assert option["visualMap"]["show"] is False and pieces[-1] == {"gt": 3.75, "lte": 5.0, "color": heatmap_fill(DARK, 4)}
    assert built.source_line.endswith("not shown: 1 not graded yet")
    assert built.data_table["columns"] == ["Cell", "Number of claims", "Records"]


@pytest.mark.parametrize("theme_id", sorted(THEMES))
def test_a_grid_passes_its_check_in_every_theme(theme_id):
    report = check_visual(_spec(theme=theme_id), _grid(), THEMES[theme_id])
    assert report.ok, report.errors
    assert {6, 20} <= set(report.not_applicable)


def test_the_checker_reads_every_cell_back_and_refuses_what_a_grid_cannot_take():
    built = build_chart(_spec(highlight=["robust evidence, high agreement"]), _grid(), DARK)
    picked = {d["name"]: d for d in built.option["series"][0]["data"]}["robust evidence, high agreement"]
    assert picked["label"]["fontWeight"] == "bold" and picked["itemStyle"]["borderWidth"] == 3
    broken = json.loads(json.dumps(built.option))
    broken["series"][0]["data"][1]["value"][0] = 2                    # a cell moved off its grades
    broken["series"][0]["data"][0]["label"]["formatter"] = ""          # a count not written
    broken["series"][0]["data"][8]["label"]["fontWeight"] = "normal"   # the pick by outline only
    broken["series"][0]["data"][4]["label"]["color"] = broken["series"][0]["data"][4]["itemStyle"]["color"]   # the count unreadable
    broken["yAxis"]["data"] = ["High", "Medium", "Low"]                # the grades out of order
    report = check_visual(_spec(highlight=["robust evidence, high agreement"]), _grid(), DARK, built.__class__(**{**built.__dict__, "option": broken}))
    assert {0, 7, 11, 12} <= set(report.error_rules())
    with pytest.raises(ChartDoesNotFit, match="sort, limit and a log scale do not apply"):
        build_chart(_spec(sort="value_desc"), _grid(), DARK)
    with pytest.raises(ChartDoesNotFit, match="draw it as a grid"):
        build_chart(parse_spec({"kind": "bar", "title": "Most claims are graded robust", "query": {"name": "claims_by_strength"}}), _grid(), DARK)


# --- exports -----------------------------------------------------------------------------

@pytest.fixture()
def grid_chart():
    inv_id, _ids = _investigation()
    with SessionLocal() as db:
        chart, record = resolve_chart(db, inv_id, {"type": "chart", "spec": {
            "kind": "heatmap", "question": "confidence", "title": "Most claims rest on robust, agreeing evidence",
            "query": {"name": "claims_by_strength"}}})
        assert chart is not None, record
        yield db, inv_id, chart


def test_a_deck_holds_the_grid_as_a_picture_or_its_cells_listed(grid_chart, monkeypatch):
    db, inv_id, chart = grid_chart
    tiny = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005020203"
                         "f1a2b9780000000049454e44ae426082")
    monkeypatch.setattr("app.visuals.render_client.render_png", lambda option, width, height, **kw: tiny)
    deck = Deck(investigation_id=inv_id, title="Grades", slides_json=[
        {"kind": "content", "heading": "How sure we are", "bullets": [], "evidence": [], "notes": "", "visual": chart}])
    db.add(deck)
    db.commit()
    slide = list(render_deck_pptx(deck, []).slides)[1]
    assert any(shape.shape_type == 13 for shape in slide.shapes)   # MSO_SHAPE_TYPE.PICTURE

    def unreachable(*args, **kwargs):
        raise RenderUnavailable("render service at http://render:8070 could not be reached: ConnectError")

    monkeypatch.setattr("app.visuals.render_client.render_png", unreachable)
    slide = list(render_deck_pptx(deck, []).slides)[1]
    table = next(shape for shape in slide.shapes if shape.has_table).table
    cells = [[cell.text for cell in row.cells] for row in table.rows]
    assert cells[0] == ["Cell", "Count"] and ["robust evidence, high agreement", "2"] in cells and len(cells) == 10
    assert "the cells are listed instead" in " ".join(s.text_frame.text for s in slide.shapes if s.has_text_frame)


def test_a_brief_lists_every_cell_with_its_count_and_no_single_record_mark(grid_chart, monkeypatch):
    db, inv_id, chart = grid_chart

    def unreachable(*args, **kwargs):
        raise RenderUnavailable("render service at http://render:8070 could not be reached: ConnectError")

    monkeypatch.setattr("app.visuals.render_client.render_png", unreachable)
    row = create_writeup(db, investigation_id=inv_id, title="Grades", content_json={"type": "doc", "content": [
        {"type": "evidenceVisual", "attrs": {"visual": chart}}]})
    rows = [[c.text for c in r.cells] for t in render_writeup_docx(row, []).tables for r in t.rows]
    assert any(r[0].startswith("limited evidence, low agreement") and r[1] == "1" for r in rows)
    assert not any("†" in r[0] for r in rows)
