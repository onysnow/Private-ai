"""The browser half of a capture (ADR-0016): load the page in headless Chromium, no cookies, no stored login, and
keep a screenshot and the page as the browser rendered it (what a script built). Optional: when Playwright or its
Chromium is not installed the capture is the fetched page alone, and its lane says the screenshot was skipped.

It runs as a separate process (`python -m app.services.capture_browser URL OUTDIR`) so a page that hangs or crashes
the browser cannot take the API with it, and is stopped at a time limit. Every request the page makes (its images,
scripts, redirects) is checked against the same address rule as the page itself (capture_net.host_is_allowed), so a
page cannot make the browser reach this computer or a private network.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from app.core.config import settings


@dataclass
class BrowserResult:
    tool: str
    version: str
    screenshot: Path | None
    rendered_html: Path | None
    final_url: str
    seconds: float


def available() -> bool:
    if settings.capture_browser == "off":
        return False
    return importlib.util.find_spec("playwright") is not None


def run(url: str, out_dir: Path) -> tuple[BrowserResult | None, str]:
    """The browser result, or None and why it was not made."""
    if not available():
        return None, "No browser is set up on this computer, so only the fetched page was kept."
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        done = subprocess.run(
            [sys.executable, "-m", "app.services.capture_browser", url, str(out_dir)],
            capture_output=True, text=True, timeout=settings.capture_browser_timeout_seconds,
            cwd=str(Path(__file__).resolve().parents[2]),
            # The browser process builds its settings from the environment; what it needs is passed on as it is here.
            env={**os.environ, "CAPTURE_BROWSER_PATH": settings.capture_browser_path,
                 "CAPTURE_ALLOW_PRIVATE_HOSTS": str(settings.capture_allow_private_hosts).lower(),
                 "CAPTURE_BROWSER_TIMEOUT_SECONDS": str(settings.capture_browser_timeout_seconds)},
        )
    except subprocess.TimeoutExpired:
        return None, "The browser took too long, so only the fetched page was kept."
    if done.returncode != 0:
        lines = [ln for ln in done.stderr.strip().splitlines() if ln.strip() and not ln.lstrip().startswith(("╔", "║", "╚"))]
        line = next((ln for ln in lines if "Error" in ln), lines[-1] if lines else "the browser stopped")
        return None, f"The browser could not load the page ({line.split(': ', 1)[-1][:160]}), so only the fetched page was kept."
    info = json.loads(done.stdout.strip().splitlines()[-1])
    shot, html = out_dir / "screenshot.png", out_dir / "rendered.html"
    return BrowserResult(
        tool="Chromium via Playwright", version=f"{info['browser']} · playwright {info['playwright']}",
        screenshot=shot if shot.is_file() else None, rendered_html=html if html.is_file() else None,
        final_url=info["url"], seconds=info["seconds"],
    ), ""


def _main(url: str, out_dir: str) -> None:  # pragma: no cover - runs in the browser process
    import time
    from importlib.metadata import version as pkg_version

    from playwright.sync_api import sync_playwright

    from app.services.capture_net import host_is_allowed

    started = time.monotonic()
    out = Path(out_dir)

    def guard(route):  # type: ignore[no-untyped-def]
        target = urlsplit(route.request.url)
        if target.scheme in ("data", "blob", "about"):
            return route.continue_()
        if target.scheme not in ("http", "https") or host_is_allowed(target.hostname or "") is not None:
            return route.abort()
        return route.continue_()

    with sync_playwright() as p:
        args = ["--no-sandbox"] if hasattr(os, "geteuid") and os.geteuid() == 0 else []
        browser = p.chromium.launch(headless=True, args=args, executable_path=settings.capture_browser_path or None)
        context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-GB", java_script_enabled=True,
                                      accept_downloads=False, service_workers="block")
        context.route("**/*", guard)
        page = context.new_page()
        page.goto(url, wait_until="load", timeout=int(settings.capture_browser_timeout_seconds * 700))
        try:
            page.wait_for_load_state("networkidle", timeout=4000)
        except Exception:
            pass
        (out / "rendered.html").write_text(page.content(), encoding="utf-8")
        page.screenshot(path=str(out / "screenshot.png"), full_page=True)
        info = {"url": page.url, "browser": f"chromium {browser.version}", "playwright": pkg_version("playwright"),
                "seconds": round(time.monotonic() - started, 1)}
        browser.close()
    print(json.dumps(info))


if __name__ == "__main__":  # pragma: no cover
    _main(sys.argv[1], sys.argv[2])
