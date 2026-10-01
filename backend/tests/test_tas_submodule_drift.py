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
including this local run), every TAS_MODULES entry's MODULE_FILES path must
actually resolve to a real, non-empty file under TAS_SPEC_ROOT (so this test
can't get out of sync with reasoning.py's own TAS module list).

reasoning.MODULE_FILES may also hold app-local (non-TAS) modules, such as
presentation_draft -- see TAS_MODULES and APP_MODULES_ROOT in
app/ai/reasoning.py. Those are checked separately below: this test only
covers the vendored-submodule half of MODULE_FILES, and asserts that an
app-local module's path does NOT live under TAS_SPEC_ROOT, since a module
claiming to be TAS content without actually being TAS_MODULES would be a
different, worse kind of drift (presentation_draft's prompt silently
treated as vendored spec content it was deliberately kept out of).
"""

import app.ai.reasoning as reasoning_module


def test_tas_spec_submodule_drift_or_absence():
    root = reasoning_module.TAS_SPEC_ROOT
    tas_module_files = {name: path for name, path in reasoning_module.MODULE_FILES.items() if name in reasoning_module.TAS_MODULES}

    if not root.exists() or not any(root.iterdir()):
        import pytest
        pytest.skip(
            "tas_spec submodule not checked out in this environment (matches "
            "backend-postgres-ci.yml's tolerance of a missing submodule on "
            "Dependabot PRs) -- nothing to verify."
        )

    assert tas_module_files, "reasoning.TAS_MODULES should not be empty"

    missing = []
    empty = []
    outside_root = []
    for module_name, path in tas_module_files.items():
        if root not in path.parents:
            outside_root.append((module_name, path))
            continue
        if not path.is_file():
            missing.append((module_name, path))
        elif path.stat().st_size == 0:
            empty.append((module_name, path))

    assert not outside_root, (
        f"TAS_MODULES entries must live under TAS_SPEC_ROOT: {outside_root}"
    )
    assert not missing, (
        "The pinned tas_spec submodule commit no longer contains these "
        f"MODULE_FILES paths (upstream TAS restructure?): {missing}"
    )
    assert not empty, (
        f"MODULE_FILES paths resolved but are empty files: {empty}"
    )


def test_app_local_modules_stay_outside_the_tas_submodule():
    """The flip side of the check above: a module NOT in TAS_MODULES must
    not live under TAS_SPEC_ROOT either. If it did, build_system_prompt()
    would be free to claim TAS framing for content TAS never actually
    reviewed or versioned -- exactly the mislabeling the architecture
    decision behind presentation_draft was trying to avoid. Runs
    unconditionally (no submodule needed): this is a statement about
    reasoning.py's own path table, not about the submodule's contents.
    """
    root = reasoning_module.TAS_SPEC_ROOT
    app_local_files = {name: path for name, path in reasoning_module.MODULE_FILES.items() if name not in reasoning_module.TAS_MODULES}
    assert app_local_files, "expected at least one app-local (non-TAS) module, e.g. presentation_draft"
    for module_name, path in app_local_files.items():
        assert root not in path.parents, f"{module_name!r} is not in TAS_MODULES but its MODULE_FILES path is under TAS_SPEC_ROOT: {path}"
        assert path.is_file(), f"app-local module {module_name!r}'s prompt file is missing: {path}"
        assert path.stat().st_size > 0, f"app-local module {module_name!r}'s prompt file is empty: {path}"


def test_tas_control_surface_still_defines_the_flags_this_app_exposes():
    """The two CONTROL_SURFACE §4 flags exposed as request options
    (app/ai/reasoning.py CONTROL_SURFACE_FLAGS) must still exist by name in
    the vendored spec, with the same value tables. If upstream renames or
    re-scopes a flag, this fails at test time instead of the app quietly
    steering the model with a flag TAS no longer defines."""
    path = reasoning_module.CONTROL_SURFACE_FILE
    if not reasoning_module.TAS_SPEC_ROOT.exists() or not any(reasoning_module.TAS_SPEC_ROOT.iterdir()):
        import pytest
        pytest.skip("tas_spec submodule not checked out in this environment -- nothing to verify.")
    assert path.is_file(), f"vendored TAS no longer ships {path.relative_to(reasoning_module.TAS_SPEC_ROOT)} (bumped below v1.9?)"
    text = path.read_text(encoding="utf-8")
    assert "## 2. Non-negotiable boundary" in text
    for name, spec in reasoning_module.CONTROL_SURFACE_FLAGS.items():
        assert f"`{name}`" in text, f"flag {name} is no longer defined in CONTROL_SURFACE.md"
        assert f"| `{name}` | `{spec['default']}`" in text, f"flag {name}'s default changed upstream from {spec['default']!r}"
    assert "BLOCKING is always enforced regardless of this flag's value" in text
