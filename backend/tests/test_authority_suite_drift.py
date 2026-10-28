"""STRUCT-0025, for the Authority System Suite the Authority Suite SDK bundles (app/ai/authority_sdk.py).

The repo keeps no copy of the suite. These tests fail when a change of the SDK pin
moves a module the app builds prompts from, or changes a value list the app's output
contract copies from the suite's own OUTPUT_SCHEMAS.md, Investigative Prompt
Engineering Standard, Module 06 or CONTROL_SURFACE.md -- in CI, not at request time.
"""
import re

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
        assert r.TAS_ROOT in path.parents, f"{name} must live under TAS_ROOT"
        assert path.is_file() and path.stat().st_size > 0, f"{name}: {path} missing or empty in the SDK's suite"
    assert r.CONTROL_SURFACE_FILE.is_file()


def test_the_suite_root_is_the_sdks_own_copy():
    assert r.SUITE_ROOT == sdk.suite_root(), "every suite file is read from the folder the SDK installs"


def test_app_local_modules_stay_outside_the_suite():
    local = {n: p for n, p in r.MODULE_FILES.items() if n not in r.TAS_MODULES and n not in r.SUITE_MODULES}
    assert local, "expected at least one app-local module, e.g. presentation_draft"
    for name, path in local.items():
        assert r.SUITE_ROOT not in path.parents, f"{name} is app-local but lives in the suite: {path}"
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
    surface = r.CONTROL_SURFACE_FILE.read_text(encoding="utf-8")
    row = next(line for line in surface.splitlines() if line.startswith("| `source_tier_floor`"))
    assert f"`{r.CONTROL_SURFACE_FLAGS['source_tier_floor']['default']}`" in row.split("|")[2]
    assert "may not be set below `D`" in row
    assert r.CONTROL_SURFACE_FLAGS["source_tier_floor"]["allowed"][-1] == "D"


# The suite's other systems (app/ai/systems.py): every module file resolves inside its own system, and every value
# list the app's contracts copy is still spelled that way in the vendored text.

def _system_text(system: str) -> str:
    root = r.SUITE_ROOT / "systems" / system
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted((root / "EVALUATION").glob("*.md")))


# Values the suite states other than as a literal word, each with where it says so.
_STATED_OTHERWISE = {
    # EGS Module 01 rule 6: "Give each point a priority (high, medium, low)"; the schema shows "HIGH" only.
    ("egs", "MEDIUM"): ("PROMPT_MODULES/01_EVIDENCE_PLAN.md", "priority (high, medium, low)"),
    ("egs", "LOW"): ("PROMPT_MODULES/01_EVIDENCE_PLAN.md", "priority (high, medium, low)"),
    # DAS OUTPUT_SCHEMAS.md writes the tier range as "`DAS:A` through `DAS:F`".
    **{("das", f"DAS:{t}"): ("EVALUATION/OUTPUT_SCHEMAS.md", "`DAS:A` through `DAS:F`") for t in "BCDE"},
}


def test_every_suite_module_file_resolves_inside_its_system():
    from app.ai.systems import SUITE_MODULES

    assert {m.system for m in SUITE_MODULES.values()} == {"ras", "qas", "las", "das", "egs", "ehs"}
    for key, module in SUITE_MODULES.items():
        root = r.SUITE_ROOT / "systems" / module.system
        for path in module.files:
            assert root in path.parents, f"{key}: {path} is not under {root}"
            assert path.is_file() and path.stat().st_size > 0, f"{key}: {path} missing or empty"


def test_suite_value_lists_match_the_vendored_schemas():
    from app.ai.systems import SUITE_MODULES

    for key, module in SUITE_MODULES.items():
        text = _system_text(module.system)
        for path, name, allowed in module.values:
            for value in allowed:
                if value in text:
                    continue
                stated = _STATED_OTHERWISE.get((module.system, value))
                assert stated, f"{key}: {path}.{name} value {value!r} is not in {module.system}/EVALUATION"
                where, phrase = stated
                assert phrase in (r.SUITE_ROOT / "systems" / module.system / where).read_text(encoding="utf-8"), (key, value)


# A copied list may leave values out only where an app run must not use them, each with the rule (app/ai/systems.py).
_NARROWED = {
    ("evidence_plan", "status"): "a plan is written PLANNED or NOT_SOUGHT; SOUGHT, DONE and STOPPED record work a person did",
    ("ehs_harm_minimisation", "decision"): "EHS judges nothing in an app run: every decision stays PENDING (AGENTS.md [AG-067])",
    ("ehs_public_interest", "decision"): "EHS judges nothing in an app run: every decision stays PENDING (AGENTS.md [AG-067])",
}


def test_suite_value_lists_are_the_suites_whole_lists():
    """Where the suite's schema states a field's values as a list (read by app/ai/suite_catalog.py), the app's copy
    is that list: a value the suite adds or drops fails here, not only a renamed one."""
    from app.ai import suite_catalog
    from app.ai.systems import SUITE_MODULES

    for key, module in SUITE_MODULES.items():
        records = suite_catalog.system(module.system).records
        for path, name, allowed in module.values:
            lists = [set(rec.closed[name]) for rec in records if name in rec.closed]
            if not lists:
                continue  # stated in prose only; test_suite_value_lists_match_the_vendored_schemas covers it
            app = set(allowed)
            if (key, name) in _NARROWED:
                assert any(app <= suite for suite in lists), f"{key}: {path}.{name} {sorted(app)} is not within the suite's list"
            else:
                assert app in lists, f"{key}: {path}.{name} {sorted(app)} is not the suite's list {[sorted(s) for s in lists]}"
