"""The Authority System Suite, through the Authority Suite SDK (onysnow/authority-suite-sdk).

The SDK is a dependency (backend/requirements.txt pins it to one commit), not code
copied into this repo, and the suite is the copy the SDK bundles: this repo keeps no
copy of its own. Everything the app takes from the suite or the SDK comes through
this module, so the one import of `authority_suite_sdk` sits in one place.

Suite paths are relative to the suite's root, as the suite writes them
(``systems/tas/PROMPT_MODULES/08_CASE_SYNTHESIS.md``). To change which suite the
app runs on, change the pin in requirements.txt."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import authority_suite_sdk
from authority_suite_sdk import Suite
from authority_suite_sdk.errors import UnknownNameError


class SuiteFileMissing(LookupError):
    """A file the app reads is not in the suite the SDK bundles."""


@lru_cache(maxsize=1)
def get_suite() -> Suite:
    """The suite bundled inside the SDK, loaded once."""
    return Suite.bundled()


def suite_root() -> Path:
    """The folder the SDK installs the suite in. Code that reads suite files by path (app/ai/systems.py,
    app/ai/suite_catalog.py) reads them from here, the SDK's own copy."""
    return Path(get_suite().root)


def suite_text(path: str) -> str:
    """One suite file, by its path from the suite root."""
    try:
        text: str = get_suite().read(path)
    except UnknownNameError as exc:
        raise SuiteFileMissing(path) from exc
    return text


def suite_has(path: str) -> bool:
    try:
        get_suite().read(path)
    except UnknownNameError:
        return False
    return True


def suite_source() -> str:
    """'onysnow/Authority-System-Suite@d2b2186': the repository and short commit the SDK bundles."""
    provenance = get_suite().provenance
    return f"{provenance['repository']}@{provenance['commit'][:7]}"


def tas_version() -> str | None:
    """The first '## <major>.<minor>' heading in TAS's CHANGELOG, e.g. '1.12'. Dated directive
    entries ('## 2026-10-10 -- DIR-0044 ...') above it are skipped."""
    if not suite_has("systems/tas/CHANGELOG.md"):
        return None
    for line in suite_text("systems/tas/CHANGELOG.md").splitlines():
        m = re.match(r"## (\d+\.\d+(?:\.\d+)?)\b", line)
        if m:
            return m.group(1)
    return None


def tas_present() -> bool:
    """Whether the SDK's suite has the Topic Authority System the prompts are built from."""
    return "tas" in get_suite().systems


def tas_flags() -> dict[str, tuple[str, tuple[str, ...]]]:
    """TAS's session flags (CORE/CONTROL_SURFACE.md §4) as the suite states them: name -> (default, allowed values)."""
    surface = get_suite().control_surface("tas")
    return {name: (flag.default, tuple(flag.values)) for name, flag in (surface.flags.items() if surface else ())}


def confidence_terms() -> tuple[str, ...]:
    """The seven likelihood terms, most to least likely (INTEROP.md; ICD 203)."""
    return tuple(t.term for t in get_suite().confidence)


def validate_record(system: str, record: str, payload: Any) -> list[str]:
    """Check one record against the suite's schema for it. Each issue is one line of text."""
    return [str(issue) for issue in get_suite().validate(system, record, payload)]


def sdk_status() -> dict[str, str | None]:
    """What the app is running: the SDK's version and the suite commit inside it."""
    return {"sdk_version": authority_suite_sdk.__version__, "suite_commit": get_suite().commit}
