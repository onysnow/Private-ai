"""STRUCT-0025, for the Authority System Suite the Authority Suite SDK bundles (app/ai/authority_sdk.py).

The repo keeps no copy of the suite. These tests fail when a change of the SDK pin
moves a module the app builds prompts from, or changes a value list the app's output
contract copies from the suite's own OUTPUT_SCHEMAS.md, Investigative Prompt
Engineering Standard, Module 06 or CONTROL_SURFACE.md -- in CI, not at request time.
"""
import re
from pathlib import Path

import app.ai.reasoning as r
from app.ai import authority_sdk as sdk


def _text(*parts: str) -> str:
    return sdk.suite_text("systems/tas/" + "/".join(parts))


def test_sdk_suite_names_its_source():
    assert re.fullmatch(r"onysnow/Authority-System-Suite@[0-9a-f]{7,40}", sdk.suite_source())
    assert re.fullmatch(r"\d+\.\d+(\.\d+)?", sdk.tas_version() or "")
    systems = sdk.get_suite().systems
    for system in ("tas", "ras", "qas", "las", "das", "egs", "ehs"):
        assert system in systems, system
    assert sdk.suite_has("LICENSE") and sdk.suite_has("LICENSE-DOCS")


def test_every_tas_module_file_resolves():
    tas = {n: p for n, p in r.MODULE_FILES.items() if n in r.TAS_MODULES}
    assert tas
    for name, path in tas.items():
        assert isinstance(path, str) and path.startswith(r.TAS_MODULES_DIR + "/"), f"{name} must be a suite path under {r.TAS_MODULES_DIR}"
        assert sdk.suite_has(path) and sdk.suite_text(path).strip(), f"{name}: {path} missing or empty in the SDK's suite"
    assert sdk.suite_has(r.CONTROL_SURFACE_FILE)


def test_app_local_modules_stay_outside_the_suite():
    local = {n: p for n, p in r.MODULE_FILES.items() if n not in r.TAS_MODULES}
    assert local, "expected at least one app-local module, e.g. presentation_draft"
    for name, path in local.items():
        assert isinstance(path, Path), f"{name} is app-local, so it is a file on disk, not a suite path: {path!r}"
        assert path.is_file(), f"{name}: {path} missing"


def test_value_lists_match_the_suite():
    schemas = _text("EVALUATION", "OUTPUT_SCHEMAS.md")
    term = re.search(r'"confidence_term": "([A-Z_|]+)"', schemas)
    assert term and tuple(term.group(1).split("|")) == r.CONFIDENCE_TERMS
    kind = re.search(r'"kind": "([A-Z_|]+)"', schemas)
    assert kind and tuple(kind.group(1).split("|")) == r.HYPOTHESIS_KINDS
    conflict = re.search(r'"conflict_type": "([A-Z |]+)"', schemas)
    assert conflict and tuple(conflict.group(1).split("|")) == r.CONFLICT_TYPES
    assert '"conflict_id": "CFLT-0001"' in schemas and '"gap_id": "GAP-0001"' in schemas
    standard = _text("CORE", "INVESTIGATIVE_PROMPT_ENGINEERING_STANDARD.md")
    for c in r.CLASSIFICATIONS:
        assert c in standard or c.replace("_", " ") in standard, c


def test_control_flags_match_the_control_surface():
    suite_flags = sdk.tas_flags()
    for name, spec in r.CONTROL_SURFACE_FLAGS.items():
        default, allowed = suite_flags[name]
        assert spec["default"] == default, name
        assert tuple(spec["allowed"]) == allowed, name
    surface = sdk.suite_text(r.CONTROL_SURFACE_FILE)
    row = next(line for line in surface.splitlines() if line.startswith("| `source_tier_floor`"))
    assert f"`{r.CONTROL_SURFACE_FLAGS['source_tier_floor']['default']}`" in row.split("|")[2]
    assert "may not be set below `D`" in row
    assert r.CONTROL_SURFACE_FLAGS["source_tier_floor"]["allowed"][-1] == "D"
