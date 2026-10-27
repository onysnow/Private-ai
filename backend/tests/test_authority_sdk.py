"""The Authority Suite SDK is imported as a package (app/ai/authority_sdk.py), never copied in."""

import re
from pathlib import Path

import authority_suite_sdk

import app.ai.reasoning as r
from app.ai import authority_sdk, suite_vocab

BACKEND = Path(__file__).resolve().parents[1]


def test_sdk_is_imported_from_site_packages_not_the_repo():
    sdk_dir = Path(authority_suite_sdk.__file__).resolve().parent
    assert BACKEND not in sdk_dir.parents, f"authority_suite_sdk resolves inside this repo: {sdk_dir}"
    assert not list(BACKEND.rglob("authority_suite_sdk")), "SDK source must not be copied under backend/"


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


def test_sdk_agrees_with_the_vendored_copy_on_the_terms_the_app_uses():
    schemas = (r.TAS_ROOT / "EVALUATION" / "OUTPUT_SCHEMAS.md").read_text(encoding="utf-8")
    term = re.search(r'"confidence_term": "([A-Z_|]+)"', schemas)
    assert term and tuple(term.group(1).split("|")) == authority_sdk.confidence_terms()


def test_validate_record_reports_issues_as_text():
    issues = authority_sdk.validate_record("tas", "Claim record", {"confidence_term": "PROBABLY"})
    assert issues and all(isinstance(i, str) for i in issues)
    assert any("confidence_term" in i for i in issues)
