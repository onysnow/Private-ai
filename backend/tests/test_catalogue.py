"""The indicator catalogue must hang together (docs/discovery/indicators.md).

The models refuse a source without a quote, a level with a number but no
source, a case without an outcome, and an indicator marked verified whose
quotes, case outcomes or threshold numbers were not all checked. These
tests load the real files and show each refusal on a small example.
"""

import pytest
from pydantic import ValidationError

from app.catalogue.loader import Catalogue, load, problems
from app.catalogue.models import Area, Indicator

BASE = {
    "id": "ML-001", "name": "Example", "definition": "An example.", "areas": ["ML"], "checkable": "records",
    "sources": [{"title": "T", "publisher": "P", "url": "https://example.org", "quote": "A quote.", "quote_verified": True}],
    "levels": {"faint": "x", "strong": "y", "textbook": "Meets the published definition as worded", "threshold_source": "none"},
    "innocent_explanations": ["An ordinary reason."],
}


def ind(**changes):
    data = {**BASE, **changes}
    return Indicator.model_validate(data)


def test_real_catalogue_loads_and_hangs_together():
    cat = load()
    assert problems(cat) == []


def test_source_needs_a_quote():
    with pytest.raises(ValidationError):
        ind(sources=[{"title": "T", "publisher": "P", "url": "https://example.org", "quote": ""}])


def test_indicator_needs_a_source():
    with pytest.raises(ValidationError):
        ind(sources=[])


def test_number_in_a_level_needs_a_source():
    with pytest.raises(ValidationError):
        ind(levels={"faint": "more than 10", "strong": "y", "textbook": "z", "threshold_source": "none"})


def test_case_needs_an_outcome():
    with pytest.raises(ValidationError):
        ind(cases=[{"name": "C", "year": "2020", "jurisdiction": "UK", "what_happened": "w", "source_url": "https://example.org"}])


def test_verified_needs_verified_quotes():
    with pytest.raises(ValidationError):
        ind(status="verified", sources=[{"title": "T", "publisher": "P", "url": "https://example.org", "quote": "Q", "quote_verified": False}])
    assert ind(status="verified").status.value == "verified"


def test_verified_needs_verified_case_outcomes():
    case = {"name": "C", "year": "2020", "jurisdiction": "UK", "what_happened": "w", "outcome": "convicted", "source_url": "https://example.org"}
    with pytest.raises(ValidationError):
        ind(status="verified", cases=[case])


def test_cross_hint_must_point_somewhere():
    area = Area(key="ML", name="Money laundering", scope="s", indicators=[ind(cross_hints=[{"target_area": "Nowhere", "reason": "r", "source_url": "https://example.org"}])])
    assert any("unknown area" in p for p in problems(Catalogue(areas=[area], glossaries=[])))
