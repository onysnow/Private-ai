"""STRUCT-0025, for the vendored Authority System Suite (backend/app/ai/authority_suite).

The suite is a plain copy, not a submodule, so it is always present. These
tests fail when an update of that copy moves a module the app builds prompts
from, or changes a value list the app's output contract copies from the
suite's own OUTPUT_SCHEMAS.md, Investigative Prompt Engineering Standard,
Module 06 or CONTROL_SURFACE.md -- in CI, not at request time.
"""
import re

import app.ai.reasoning as r


def _text(*parts: str) -> str:
    return (r.TAS_ROOT.joinpath(*parts)).read_text(encoding="utf-8")


def test_vendored_copy_names_its_source():
    assert re.fullmatch(r"onysnow/Authority-System-Suite@[0-9a-f]{7,40}", r._vendored_suite_commit() or "")
    assert re.fullmatch(r"\d+\.\d+(\.\d+)?", r._vendored_tas_version() or "")
    for system in ("tas", "ras", "qas", "las", "das", "egs", "ehs"):
        assert (r.SUITE_ROOT / "systems" / system).is_dir(), system
    assert (r.SUITE_ROOT / "LICENSE").is_file() and (r.SUITE_ROOT / "LICENSE-DOCS").is_file()


def test_every_tas_module_file_resolves():
    tas = {n: p for n, p in r.MODULE_FILES.items() if n in r.TAS_MODULES}
    assert tas
    for name, path in tas.items():
        assert r.TAS_ROOT in path.parents, f"{name} must live under TAS_ROOT"
        assert path.is_file() and path.stat().st_size > 0, f"{name}: {path} missing or empty"
    assert r.CONTROL_SURFACE_FILE.is_file()


def test_app_local_modules_stay_outside_the_suite():
    local = {n: p for n, p in r.MODULE_FILES.items() if n not in r.TAS_MODULES}
    assert local, "expected at least one app-local module, e.g. presentation_draft"
    for name, path in local.items():
        assert r.SUITE_ROOT not in path.parents, f"{name} is app-local but lives in the suite: {path}"


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


def test_tier_floor_matches_the_control_surface():
    surface = r.CONTROL_SURFACE_FILE.read_text(encoding="utf-8")
    row = next(line for line in surface.splitlines() if line.startswith("| `source_tier_floor`"))
    assert f"`{r.CONTROL_SURFACE_FLAGS['source_tier_floor']['default']}`" in row.split("|")[2]
    assert "may not be set below `D`" in row
    assert r.CONTROL_SURFACE_FLAGS["source_tier_floor"]["allowed"][-1] == "D"
