"""Run every check CI runs, in CI's order, and stop at the first failure.

    python tools/check_all.py            # everything
    python tools/check_all.py --backend  # ruff, mypy, pytest only
    python tools/check_all.py --frontend # lint, typecheck, tests, build, and the render service's tests
    python tools/check_all.py --fast     # ruff and mypy only (the pre-commit hook)

Run it before every commit. It exists because the CI type check (mypy,
pinned in backend/requirements-local.txt) went unrun locally for a week and
172 errors piled up unseen (see docs/adr/0004). The tool versions it uses
are whatever is installed in the backend virtualenv, so install
requirements-local.txt there first; the script warns if mypy or ruff don't
match CI's pins.

The API schema (frontend/openapi.json) and the generated client
(frontend/lib/generated) must match the code; regenerate with
`python tools/export_openapi.py` and `npm run generate:api`.

Backend tests run against SQLite by default. Set POSTGRES_TEST_URL to also
run CI's PostgreSQL gate (backend/run_postgres_gate.py).
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
RENDER = ROOT / "render"


def _venv_python() -> str:
    for candidate in (BACKEND / ".venv" / "bin" / "python", BACKEND / ".venv" / "Scripts" / "python.exe",
                      ROOT / ".venv" / "bin" / "python", ROOT / ".venv" / "Scripts" / "python.exe"):
        if candidate.exists():
            return str(candidate)
    return sys.executable


def _pinned(package: str) -> str | None:
    text = (BACKEND / "requirements-local.txt").read_text(encoding="utf-8")
    match = re.search(rf"^{re.escape(package)}==([^\s#]+)", text, re.MULTILINE)
    return match.group(1) if match else None


def _warn_on_version_drift(python: str) -> None:
    for package in ("mypy", "ruff"):
        wanted = _pinned(package)
        result = subprocess.run([python, "-m", package, "--version"], capture_output=True, text=True, cwd=BACKEND)
        found = (result.stdout or result.stderr).strip()
        if wanted and wanted not in found:
            print(f"WARNING: CI pins {package}=={wanted}, but this environment has: {found or 'not installed'}")
            print(f"         Results may differ from CI. Fix: {python} -m pip install -r backend/requirements-local.txt")


def _run(label: str, cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> None:
    print(f"\n=== {label} ===", flush=True)
    started = time.monotonic()
    result = subprocess.run(cmd, cwd=cwd, env=env)
    elapsed = time.monotonic() - started
    if result.returncode != 0:
        print(f"\nFAILED: {label} (exit {result.returncode}, {elapsed:.0f}s)")
        sys.exit(result.returncode)
    print(f"--- passed: {label} ({elapsed:.0f}s)")


_render_installed = False


def _install_render_packages() -> None:
    """The render service's packages from its lock file, as render-ci installs them.
    The backend's live render tests start render/server.mjs, so a
    node_modules left from an older lock file would fail them for the wrong
    reason (a package the service now imports is missing). Without npm the
    live tests skip themselves."""
    global _render_installed
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm is None or _render_installed:
        return
    _run("render: npm ci", [npm, "ci", "--no-audit", "--no-fund"], RENDER)
    _render_installed = True


def backend_checks(*, fast: bool = False) -> None:
    python = _venv_python()
    _warn_on_version_drift(python)
    env = dict(os.environ)
    # The rigour/FtM import chain needs a valid IANA zone; CI runs in UTC.
    env["TZ"] = "UTC"
    env["PATH"] = str(Path(python).parent) + os.pathsep + env.get("PATH", "")
    _run("backend: ruff", [python, "-m", "ruff", "check", "."], BACKEND, env)
    _run("backend: mypy", [python, "-m", "mypy"], BACKEND, env)
    if fast:
        return
    _run("backend: API schema up to date", [python, str(ROOT / "tools" / "export_openapi.py"), "--check"], ROOT, env)
    _install_render_packages()
    _run("backend: pytest (SQLite)", [python, "-m", "pytest", "-q", "-p", "no:warnings"], BACKEND, env)
    if env.get("POSTGRES_TEST_URL"):
        _run("backend: pytest (PostgreSQL gate)", [python, "run_postgres_gate.py"], BACKEND, env)
    else:
        print("\n(skipped PostgreSQL gate: set POSTGRES_TEST_URL to run it)")


def frontend_checks() -> None:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm is None:
        print("npm not found: install Node 22 to run the frontend checks")
        sys.exit(1)
    _run("frontend: generated API client up to date", [npm, "run", "generate:api"], FRONTEND)
    git = shutil.which("git")
    if git:
        _run("frontend: lib/generated matches openapi.json", [git, "diff", "--exit-code", "--", "lib/generated"], FRONTEND)
    for script in ("lint", "typecheck", "test", "build"):
        _run(f"frontend: npm run {script}", [npm, "run", script], FRONTEND)
    # The render service's own tests (CI: render-ci.yml), with its packages
    # installed from its lock file first, as CI does.
    _install_render_packages()
    _run("render: npm test", [npm, "test"], RENDER)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--backend", action="store_true", help="backend checks only")
    parser.add_argument("--frontend", action="store_true", help="frontend checks only")
    parser.add_argument("--fast", action="store_true", help="backend ruff and mypy only")
    args = parser.parse_args()
    if args.fast:
        backend_checks(fast=True)
        print("\nFast checks passed.")
        return
    run_backend = args.backend or not args.frontend
    run_frontend = args.frontend or not args.backend
    if run_backend:
        backend_checks()
    if run_frontend:
        frontend_checks()
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
