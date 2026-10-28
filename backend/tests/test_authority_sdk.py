"""The Authority Suite SDK is imported as a package (app/ai/authority_sdk.py), never copied in."""

import re
from pathlib import Path

import authority_suite_sdk

import app.ai.reasoning as r
from app.ai import authority_sdk, suite_vocab

BACKEND = Path(__file__).resolve().parents[1]


def _installed(path: Path) -> bool:
    """Inside an installed environment (backend/.venv's site-packages counts), not repo source."""
    return "site-packages" in path.parts


def _in_repo_source(name: str) -> list[Path]:
    return [p for p in BACKEND.rglob(name) if not _installed(p)]


def test_sdk_is_imported_from_site_packages_not_the_repo():
    sdk_dir = Path(authority_suite_sdk.__file__).resolve().parent
    assert _installed(sdk_dir) or BACKEND not in sdk_dir.parents, f"authority_suite_sdk resolves inside this repo: {sdk_dir}"
    assert not _in_repo_source("authority_suite_sdk"), "SDK source must not be copied under backend/"


def test_requirements_pin_the_sdk_to_one_commit():
    line = next(x for x in (BACKEND / "requirements.txt").read_text().splitlines() if x.startswith("authority-suite-sdk"))
    assert re.fullmatch(r"authority-suite-sdk @ git\+https://github\.com/onysnow/authority-suite-sdk@[0-9a-f]{40}", line)


def test_status_names_the_sdk_and_its_suite_commit():
    status = authority_sdk.sdk_status()
    assert re.fullmatch(r"\d+\.\d+\.\d+(\.dev\d+)?", status["sdk_version"] or "")
    assert re.fullmatch(r"[0-9a-f]{40}", status["suite_commit"] or "")


def test_confidence_terms_come_from_the_sdk():
    assert r.CONFIDENCE_TERMS == authority_sdk.confidence_terms() == suite_vocab.CONFIDENCE_TERMS
    assert len(r.CONFIDENCE_TERMS) == 7


def test_the_repo_keeps_no_copy_of_the_suite():
    assert not (BACKEND / "app" / "ai" / "authority_suite").exists()
    assert not _in_repo_source("VENDORED_FROM"), "the suite comes from the SDK; no copy of it lives under backend/"


def test_status_reports_the_suite_the_sdk_bundles():
    suite = r.ai_reasoning_status()["authority_suite"]
    assert suite["present"] is True
    assert suite["source"] == authority_sdk.suite_source()
    assert suite["tas_version"] == authority_sdk.tas_version()
    assert suite["control_surface"]["available"] is True
    assert all(m["available"] for m in suite["modules"].values())


def test_prompts_carry_the_sdk_suites_module_text():
    for module in r.TAS_MODULES:
        text = r.MODULE_FILES[module].read_text(encoding="utf-8")
        assert text.strip() in r.build_system_prompt(module, {}), module


def test_validate_record_reports_issues_as_text():
    issues = authority_sdk.validate_record("tas", "Claim record", {"confidence_term": "PROBABLY"})
    assert issues and all(isinstance(i, str) for i in issues)
    assert any("confidence_term" in i for i in issues)
