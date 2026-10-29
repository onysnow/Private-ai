"""HTML printed to PDF on this computer (the evidence pack, the write-up for reading; DECISIONS_LOG 3): by the headless
Chromium the app already has for web captures (ADR-0018), with scripts off and every request refused, so a page can
only show what is inside it (pictures as data URLs)."""

from __future__ import annotations

from app.core.config import settings


class PdfUnavailable(RuntimeError):
    """The browser that prints is not on this computer, or it failed: said in the app's own words."""


def html_to_pdf(html: str, *, css_page: bool = False) -> bytes:
    """A4 with the app's margins; `css_page` lets the page's own @page rule set the size and margins (a deck's 16:9)."""
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright

    from app.services.web_capture import QUIET_BROWSER

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(executable_path=settings.capture_browser_path or None, args=QUIET_BROWSER)
        except PlaywrightError as exc:
            raise PdfUnavailable("The browser that prints PDFs is not installed on this computer "
                                 "(run `python -m playwright install --only-shell chromium`)" if "Executable doesn't exist" in str(exc)
                                 else "The browser that prints PDFs did not start") from exc
        try:
            context = browser.new_context(java_script_enabled=False, offline=True)
            page = context.new_page()
            page.route("**/*", lambda route: route.abort())
            page.set_content(html, wait_until="load")
            if css_page:
                return page.pdf(print_background=True, prefer_css_page_size=True)
            return page.pdf(format="A4", print_background=True, margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"})
        except PlaywrightError as exc:
            raise PdfUnavailable("The PDF could not be printed") from exc
        finally:
            browser.close()
