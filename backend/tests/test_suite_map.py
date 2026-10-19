"""The app's values against the Authority System Suite (app/ai/suite_map.py; Ony: "if
there is a need for a value that doesn't exist in the Authority system but needs to
exist, that's a problem"). A value the app adds must be mapped, or named as a suite
gap, before it ships; a suite update that drops a term the app relies on fails here."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.ai.suite_map import app_vocabularies, coverage, gaps_markdown
from app.main import app

GAPS_DOC = Path(__file__).resolve().parents[2] / "docs" / "authority-suite" / "SUITE_GAPS.md"


def test_every_value_the_app_uses_is_mapped_to_the_suite_or_named_as_a_gap():
    cov = coverage()
    assert cov["unmapped"] == [], (
        "These app values have no entry in app/ai/suite_map.json. Map each to the suite term that defines it "
        f"(match same or close), or record that the suite has none (match none): {cov['unmapped']}")
    assert sum(len(v) for v in app_vocabularies().values()) <= len(cov["mappings"])


def test_every_mapped_suite_term_is_still_in_the_vendored_suite():
    cov = coverage()
    drifted = [m for m in [*cov["mappings"], *cov["suite_requires_app_lacks"]] if m["found"] is False]
    assert drifted == [], f"A suite update moved or dropped these terms; re-read the suite and update suite_map.json: {drifted}"
    assert all(m["suite_term"] is None for m in cov["mappings"] if m["match"] == "none")
    assert all(m["suite_term"] for m in cov["mappings"] if m["match"] != "none")


def test_the_gaps_document_is_up_to_date():
    assert GAPS_DOC.read_text(encoding="utf-8") == gaps_markdown(), (
        "docs/authority-suite/SUITE_GAPS.md is out of date: regenerate it with "
        "`python -c \"from app.ai.suite_map import gaps_markdown; print(gaps_markdown(), end='')\" > ../docs/authority-suite/SUITE_GAPS.md`")


def test_the_coverage_is_served():
    body = TestClient(app).get("/api/ai/suite-coverage").json()
    assert body["source"].startswith("onysnow/Authority-System-Suite@") and body["counts"]["none"] >= 1
    textbook = next(m for m in body["mappings"] if m["vocabulary"] == "red_flag_level" and m["value"] == "textbook")
    assert textbook["match"] == "none" and textbook["vocabulary_name"] == "Red Flag level"
    tier = next(m for m in body["suite_requires_app_lacks"] if m["what"].startswith("Source tier"))
    assert tier["found"] is True
