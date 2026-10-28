"""The Authority System Suite read from the vendored copy (app/ai/suite_catalog.py, ADR-0017).

Every system, module and record the app runs comes from the suite's own files,
so these fail when an update to the vendored copy stops parsing, rather than a
run failing in front of a reporter."""

from __future__ import annotations

import copy

import pytest

from app.ai import suite_catalog as catalog


def _filled(node):
    """An example with each "A|B|C" placeholder replaced by its first option, as a real record holds."""
    if isinstance(node, dict):
        return {k: _filled(v) for k, v in node.items()}
    if isinstance(node, list):
        return [_filled(v) for v in node]
    if isinstance(node, str) and catalog._PIPE_VALUE.fullmatch(node):
        return node.split("|")[0]
    return node


def test_every_system_has_its_name_modules_and_records():
    found = {s.code: s for s in catalog.systems()}
    assert list(found) == ["ras", "tas", "qas", "las", "das", "egs", "ehs"]
    for code, system in found.items():
        assert system.name.endswith(f"({code.upper()})"), system.name
        assert system.modules, code
        assert system.records, code
        for module in system.modules:
            assert module.prompt and module.use_when, module.path
            assert catalog.module(module.key) == module


@pytest.mark.parametrize("code", catalog.SYSTEMS)
def test_every_record_example_passes_its_own_checks(code):
    for record in catalog.system(code).records:
        assert catalog.check_record(record, _filled(record.example)) == [], record.kind


def test_a_record_is_held_to_its_fields_types_and_closed_values():
    framing = next(r for r in catalog.system("qas").records if r.prefix == "QFRM")
    good = _filled(framing.example)
    assert catalog.check_record(framing, good) == []

    missing = copy.deepcopy(good)
    missing.pop(next(iter(missing)))
    assert any("missing field" in p for p in catalog.check_record(framing, missing))

    wrong_value = {**good, "question_type": "GUESSWORK"}
    assert any("question_type" in p and "GUESSWORK" in p for p in catalog.check_record(framing, wrong_value))

    wrong_id = {**good, framing.id_field: "FRAME-1"}
    assert any("QFRM-0001" in p for p in catalog.check_record(framing, wrong_id))


def test_the_closed_values_are_read_in_each_of_the_suites_styles():
    tas, qas, das = catalog.system("tas"), catalog.system("qas"), catalog.system("das")
    assert tas.record("Claim record").closed["confidence"] == ("LOW", "MEDIUM", "HIGH")           # in the example
    assert "INFERENCE" in tas.record("Evidence record").closed["classification"]                  # a pipe list in prose
    audit = next(r for r in qas.records if r.prefix == "QAUD")
    assert audit.closed["verdict"] == ("PASS", "PASS WITH CORRECTIONS", "FAIL")                    # bare words
    framing = next(r for r in das.records if r.prefix == "DEC" or r.kind.startswith("Framing"))
    assert framing.closed                                                                         # backticked


def test_unknown_keys_are_refused():
    with pytest.raises(KeyError):
        catalog.module("suite:xyz.01")
    with pytest.raises(KeyError):
        catalog.module("suite:las.99")
    with pytest.raises(KeyError):
        catalog.module("case_synthesis")


def test_the_non_negotiables_are_the_suites_without_its_audit_notes():
    text = catalog.non_negotiables()
    assert "[AG-031]" in text and "Never invent a citation" in text
    assert "PROSE-BY-NATURE" not in text
