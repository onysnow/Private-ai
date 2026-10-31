"""Export the whole site as a mockup, and the style guide, for Illustrator (Ony, 29 Oct).

Every screen is printed by the real app in Chromium at 1440 x 900 as one vector page (shapes and live text, not
pictures), and the pages are joined into one PDF with a bookmark per screen. Illustrator's own .ai files are PDF
inside, so each PDF is also written with an .ai name: Illustrator opens it as an ordinary document (choose the page in
its PDF import box). The layering is Chromium's, not named design layers.

Needs the app running (API on 8000, web on 3000) with a case to show. From the repository root:

    python tools/export_site_mockup.py --case <investigation id> --out docs/design/site-export

Uses Playwright and pypdf from backend/requirements.txt.
"""

from __future__ import annotations

import argparse
import io
import shutil
from pathlib import Path

from playwright.sync_api import Page, sync_playwright
from pypdf import PdfReader, PdfWriter

W, H = 1440, 900

def stages() -> dict[str, tuple[str, list[tuple[str, str]]]]:
    """The stages and their parts as the app lists them (frontend/lib/stages.ts), so a new part is exported too."""
    import re

    text = (Path(__file__).resolve().parents[1] / "frontend" / "lib" / "stages.ts").read_text(encoding="utf-8")
    out: dict[str, tuple[str, list[tuple[str, str]]]] = {}
    for block in re.split(r"\n\s*\{key: ", text)[1:]:
        route = re.search(r"route: '([^']+)'", block)
        name = re.search(r"name: '([^']+)'", block)
        if route and name:
            parts = re.findall(r"label: '([^']+)', anchor: '([^']+)'", block)
            out[route.group(1)] = (name.group(1), [(anchor, label) for label, anchor in parts])
    return out

# Not part of a screen's design: the Next.js development badge, the first-visit hints over the edges, and the skip link
# (it shows when the page takes focus).
QUIET = "nextjs-portal,.fr-hint,.fr-skip{display:none!important}"


def screens(case: str) -> list[tuple[str, str]]:
    q = f"?inv={case}"
    out = [("Case home", f"/{q}"), ("Decide", f"/decide{q}")]
    for route, (stage, parts) in stages().items():
        out += [(f"{stage} › {label}", f"{route}{q}#{anchor}") for anchor, label in parts]
    out += [("Learn › Red Flags catalogue", f"/learn{q}"), ("Learn › Glossary", f"/glossary{q}"), ("Settings", f"/settings{q}"),
            ("About", "/about")]
    return out


def settle(page: Page, wait_ms: int) -> None:
    page.add_style_tag(content=QUIET)
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(wait_ms)


# Chromium's print can let a box that scrolls on screen spill its contents over what is below it; a screen shows the
# part in view, so every scrolling box is clipped before printing.
# Chromium's PDF does not always clip them either, so whatever lies outside a scrolling box's visible area is hidden.
CLIP_SCROLLERS = """() => {
  const boxes = [...document.querySelectorAll('*')].filter(el => { const s = getComputedStyle(el);
    return /(auto|scroll|hidden)/.test(s.overflowY + s.overflowX) && el.scrollHeight > el.clientHeight + 1; });
  for (const box of boxes) {
    const r = box.getBoundingClientRect();
    for (const el of box.querySelectorAll('*')) {
      const e = el.getBoundingClientRect();
      if (e.height && (e.top >= r.bottom - 1 || e.bottom <= r.top + 1)) el.style.setProperty('visibility', 'hidden', 'important');
    }
    box.style.setProperty('overflow', 'hidden', 'important');
  } }"""


# In print, heights measured against the window (100vh, dvh) can be laid out against the paper instead; the page is held
# at the window's size so a screen prints as it shows.
HOLD_SIZE = f"html,body{{width:{W}px!important;height:{H}px!important;overflow:hidden!important}}"


def print_page(page: Page) -> bytes:
    page.add_style_tag(content=HOLD_SIZE)
    page.evaluate(CLIP_SCROLLERS)
    page.emulate_media(media="screen")
    return page.pdf(width=f"{W}px", height=f"{H}px", print_background=True, page_ranges="1",
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})


def join(pages: list[tuple[str, bytes]], target: Path) -> None:
    writer = PdfWriter()
    for title, data in pages:
        at = len(writer.pages)
        for p in PdfReader(io.BytesIO(data)).pages:
            writer.add_page(p)
        writer.add_outline_item(title, at)
    writer.add_metadata({"/Title": target.stem, "/Creator": "Journalism Workbench · tools/export_site_mockup.py"})
    with target.open("wb") as f:
        writer.write(f)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--web", default="http://localhost:3000")
    ap.add_argument("--case", required=True, help="the investigation to show")
    ap.add_argument("--out", default="docs/design/site-export")
    ap.add_argument("--wait", type=int, default=2500, help="milliseconds to let a screen settle")
    ap.add_argument("--browser", default=None, help="a Chromium to use instead of Playwright's own (its path)")
    ap.add_argument("--name", default="Reporter", help="the name to give a fresh install's first-open screen")
    ap.add_argument("--theme", default=None, help="a theme id (case-night, rain-noir, archive, forest-ledger, indigo-clarity)")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    pages: list[tuple[str, bytes]] = []
    index: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.browser or None)
        context = browser.new_context(viewport={"width": W, "height": H})
        if args.theme:
            context.add_init_script(f"try{{const k='pai:appearance';const a=JSON.parse(localStorage.getItem(k)||'{{}}');"
                                    f"a.theme='{args.theme}';localStorage.setItem(k,JSON.stringify(a));}}catch(e){{}}")
        page = context.new_page()
        page.set_default_navigation_timeout(180000)  # a development server compiles each screen on its first visit
        # On a fresh install the app first asks whose name goes on decisions; answer it so the screens show.
        page.goto(f"{args.web}/?inv={args.case}", wait_until="domcontentloaded")
        settle(page, args.wait)
        byline = page.get_by_placeholder("The name on your byline")
        if byline.count():
            byline.fill(args.name)
            page.get_by_role("button", name="Continue").first.click()
            settle(page, args.wait)
        for title, path in screens(args.case):
            # Through a blank page: two parts of one stage differ only after the #, which is not a new page load.
            page.goto("about:blank")
            try:
                page.goto(f"{args.web}{path}", wait_until="domcontentloaded", timeout=120000)
                settle(page, args.wait)
                pages.append((title, print_page(page)))
            except Exception as exc:  # one screen that will not load does not stop the rest
                print("skipped", title, "-", str(exc).splitlines()[0])
                continue
            index.append(title)
            print("printed", title)
            if title == "Bring in › The Drop":
                # The reading room opens over the case from The Drop, as a person opens it.
                button = page.get_by_role("button", name="Open the reading room")
                if button.count():
                    button.first.click()
                    settle(page, args.wait)
                    pages.append(("Reading room", print_page(page)))
                    index.append("Reading room")
                    print("printed Reading room")
        join(pages, out / "Workbench-site-mockup.pdf")

        # The style guide: one page per section, as the page lays itself out for print.
        page.goto(f"{args.web}/style-guide", wait_until="domcontentloaded")
        settle(page, args.wait)
        page.add_style_tag(content=".fr-crumbs,.fr-handle,.fr-handle-rv,.fr-top,.fr-left{display:none!important}")
        page.emulate_media(media="screen")
        guide = page.pdf(width=f"{W}px", height=f"{H}px", print_background=True,
                         margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
        (out / "Workbench-style-guide.pdf").write_bytes(guide)
        browser.close()

    for name in ("Workbench-site-mockup", "Workbench-style-guide"):
        shutil.copyfile(out / f"{name}.pdf", out / f"{name}.ai")
    (out / "PAGES.txt").write_text("Workbench-site-mockup: one page per screen, in this order\n\n"
                                   + "\n".join(f"{i + 1:>2}. {t}" for i, t in enumerate(index)) + "\n", encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main()
