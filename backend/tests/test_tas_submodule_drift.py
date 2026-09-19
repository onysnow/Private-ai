"""Covers STRUCT-0025: there was no automated check that the pinned
backend/app/ai/tas_spec submodule commit still contains every file path
app/ai/reasoning.py's MODULE_FILES references. Without this, an upstream
TAS restructure (a module renamed or moved) would fail silently at request
time with a FileNotFoundError instead of failing CI.

This intentionally does NOT hard-fail when the submodule isn't checked out:
.github/workflows/backend-postgres-ci.yml deliberately tolerates a missing
submodule on Dependabot PRs (no access to the private TAS repo token), so a
missing tas_spec here is a skip, not a failure -- exactly matching that
CI job's own tolerance. When the submodule *is* present (the normal case,
including this local run), every MODULE_FILES path must actually resolve to
a real, non-empty file, and reasoning.MODULE_FILES must still be built purely
from files that live under TAS_SPEC_ROOT (so this test can't get out of sync
with reasoning.py's own module list).
"""

import app.ai.reasoning as reasoning_module


def test_tas_spec_submodule_drift_or_absence():
    root = reasoning_module.TAS_SPEC_ROOT

    if not root.exists() or not any(root.iterdir()):
        import pytest
        pytest.skip(
            "tas_spec submodule not checked out in this environment (matches "
            "backend-postgres-ci.yml's tolerance of a missing submodule on "
            "Dependabot PRs) -- nothing to verify."
        )

    assert reasoning_module.MODULE_FILES, "reasoning.MODULE_FILES should not be empty"

    missing = []
    empty = []
    outside_root = []
    for module_name, path in reasoning_module.MODULE_FILES.items():
        if root not in path.parents:
            outside_root.append((module_name, path))
            continue
        if not path.is_file():
            missing.append((module_name, path))
        elif path.stat().st_size == 0:
            empty.append((module_name, path))

    assert not outside_root, (
        f"MODULE_FILES entries must live under TAS_SPEC_ROOT: {outside_root}"
    )
    assert not missing, (
        "The pinned tas_spec submodule commit no longer contains these "
        f"MODULE_FILES paths (upstream TAS restructure?): {missing}"
    )
    assert not empty, (
        f"MODULE_FILES paths resolved but are empty files: {empty}"
    )
