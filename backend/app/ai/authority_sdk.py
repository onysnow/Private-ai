"""The Authority Suite SDK (onysnow/authority-suite-sdk), imported as a package.

The SDK is a dependency (backend/requirements.txt pins it to one commit), not code
copied into this repo. Everything the app takes from it comes through this module,
so the one import of `authority_suite_sdk` sits in one place.

Alongside it, backend/app/ai/authority_suite is still the plain copy of the suite
that reasoning.py builds its prompts from. The SDK carries its own copy of the
suite, at its own commit, so `sdk_status()` reports both commits and a test fails
when the two disagree on a value the app uses."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import authority_suite_sdk
from authority_suite_sdk import Suite


@lru_cache(maxsize=1)
def get_suite() -> Suite:
    """The suite bundled inside the SDK, loaded once."""
    return Suite.bundled()


def confidence_terms() -> tuple[str, ...]:
    """The seven likelihood terms, most to least likely (INTEROP.md; ICD 203)."""
    return tuple(t.term for t in get_suite().confidence)


def validate_record(system: str, record: str, payload: Any) -> list[str]:
    """Check one record against the suite's schema for it. Each issue is one line of text."""
    return [str(issue) for issue in get_suite().validate(system, record, payload)]


def sdk_status() -> dict[str, str | None]:
    """What the app is running: the SDK's version and the suite commit inside it."""
    suite = get_suite()
    return {"sdk_version": authority_suite_sdk.__version__, "suite_commit": suite.commit}
