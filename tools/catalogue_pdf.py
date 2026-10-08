"""Print the indicator catalogue as a PDF (ADR-0007).

    python tools/catalogue_pdf.py OUT.pdf [--mission-draft]

Made only from the files in catalogue/ (nothing is typed twice) and only from
indicators whose status is ``verified``. Laid out with PyMuPDF's Story (HTML
and CSS into pages), already a pinned dependency. Two passes: the first finds
the page of every heading, the second prints the contents and index with
those page numbers.

Order, as Ony asked: title, mission statement, how to read it, the source
list, one chapter per area, the cross-hint map, the glossary, the index.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import pymupdf  # noqa: E402

from app.catalogue.loader import load  # noqa: E402
from app.catalogue.models import AREAS, Indicator, Status  # noqa: E402

MISSION = (
    "The Journalism Workbench indicator catalogue gathers, in one place, the warning signs that investigators, "
    "regulators and researchers have published for every kind of wrongdoing, so a reporter can see what a pattern "
    "in their records might mean, including patterns that point beyond the story they set out to report. Every sign "
    "carries its source, the cases where it was seen, and the ordinary reasons it can appear. A sign is a reason to "
    "look closer, never an accusation."
)
OUTCOME = {
    "convicted": "Convicted", "acquitted": "Acquitted", "settled": "Settled", "fined_by_regulator": "Fined by a regulator",
    "found_by_official_inquiry": "Found by an official inquiry", "alleged_in_reporting": "Alleged in published reporting (not proven)",
}
CHECK = {"records": "From the case's own records", "lookups": "After outside lookups", "person": "Only by a person reading documents or interviews"}

CSS = """
* { font-family: sans-serif; }
body { font-size: 9.5pt; line-height: 1.38; color: #1d1b18; }
h1 { font-family: serif; font-size: 22pt; color: #3b2a12; margin: 0 0 8pt 0; }
h2 { font-family: serif; font-size: 15pt; color: #3b2a12; margin: 14pt 0 4pt 0; border-bottom: 1px solid #b98d34; }
h3 { font-family: serif; font-size: 11.5pt; color: #1d1b18; margin: 12pt 0 2pt 0; }
h4 { font-size: 8pt; color: #7a6342; margin: 6pt 0 1pt 0; text-transform: uppercase; letter-spacing: 0.06em; }
p { margin: 0 0 4pt 0; }
ul { margin: 0 0 3pt 0; padding-left: 12pt; }
li { margin: 0 0 1pt 0; }
.muted { color: #6b5a44; }
.small { font-size: 8pt; }
.id { color: #8d692b; font-weight: bold; }
.def { font-size: 10pt; }
.quote { color: #3e3a33; font-style: italic; }
.tag { color: #ffffff; background-color: #61503e; font-size: 7.5pt; font-weight: bold; padding: 0 3pt; }
.alleged { color: #9f3632; font-weight: bold; }
table { border-collapse: collapse; width: 100%; margin: 2pt 0 4pt 0; }
td, th { border: 1px solid #d8ccb4; padding: 2pt 4pt; vertical-align: top; font-size: 8.5pt; text-align: left; }
th { background-color: #efe6d4; }
.lvl { margin: 0 0 1pt 8pt; }
.cover { margin-top: 160pt; }
.cover h1 { font-size: 30pt; }
.rule { border-top: 2px solid #b98d34; margin: 8pt 0; }
.draft { color: #9f3632; font-weight: bold; }
.tocl { margin: 0 0 2pt 0; font-size: 9.5pt; }
.src { margin: 0 0 4pt 0; }
"""


def e(text: object) -> str:
    """Escape for HTML, and let long URLs break after / . ? & = so they wrap."""
    out = escape(str(text or ""))
    if "://" in out:
        for ch in "/.?&=_-":
            out = out.replace(ch, ch + "\u200b")
    return out


class Book:
    def __init__(self, mission_draft: bool) -> None:
        self.cat = load()
        self.mission_draft = mission_draft
        self.areas = [a for a in self.cat.areas if any(i.status is Status.verified for i in a.indicators)]
        self.sources: dict[str, dict] = {}
        for a in self.areas:
            for i in self.verified(a.indicators):
                for s in i.sources:
                    row = self.sources.setdefault(s.url, {"title": s.title, "publisher": s.publisher, "year": s.year, "licence": s.licence, "used_by": []})
                    row["used_by"].append(i.id)
        self.number = {url: n for n, url in enumerate(sorted(self.sources, key=lambda u: (self.sources[u]["publisher"].lower(), self.sources[u]["title"].lower())), 1)}

    @staticmethod
    def verified(items: list[Indicator]) -> list[Indicator]:
        return [i for i in items if i.status is Status.verified]

    def headings(self) -> list[tuple[str, str, int]]:
        """(anchor id, text, level) of every heading the contents lists."""
        out = [("mission", "Mission statement", 1), ("howto", "How to read this catalogue", 1), ("sources", "Sources", 1)]
        for a in self.areas:
            out.append((f"area-{a.key}", f"{a.key} · {a.name}", 1))
        out += [("map", "Cross-hints between areas", 1), ("glossary", "Glossary", 1), ("index", "Index of indicators", 1)]
        return out

    # -- parts --------------------------------------------------------------
    def cover(self) -> str:
        n = sum(len(self.verified(a.indicators)) for a in self.areas)
        terms = sum(len(g.terms) for g in self.cat.glossaries)
        return (f'<div class="cover"><p class="muted">Journalism Workbench</p><h1>Indicator Catalogue</h1><div class="rule"></div>'
                f'<p>Published warning signs of wrongdoing, and of danger to the people investigating it, with their sources, '
                f'documented cases and ordinary explanations.</p><p class="muted">{n} verified indicators in {len(self.areas)} areas · '
                f'{terms} glossary terms · {len(self.sources)} sources · printed {date.today():%d %B %Y}</p></div>')

    def contents(self, pages: dict[str, int]) -> str:
        rows = "".join(f'<p class="tocl"><a href="#{a}">{e(t)}</a> <span class="muted">· {pages.get(a, "")}</span></p>' for a, t, _ in self.headings())
        return f'<h1>Contents</h1>{rows}'

    def mission(self) -> str:
        draft = '<p class="draft">Draft for Ony to approve.</p>' if self.mission_draft else ""
        return f'<h1 id="mission">Mission statement</h1>{draft}<p class="def">{e(MISSION)}</p>'

    def howto(self) -> str:
        return """<h1 id="howto">How to read this catalogue</h1>
<p>Each indicator is a warning sign that a published source (a regulator, a court, an international body, a research study or
an investigative newsroom) has described. It is a reason to look closer. <b>It never says that anyone did anything wrong.</b>
Every indicator lists the ordinary, innocent reasons the same pattern appears.</p>
<h4>Levels</h4>
<p class="lvl"><b>Faint:</b> a pattern appears.</p>
<p class="lvl"><b>Strong:</b> it looks serious.</p>
<p class="lvl"><b>Textbook:</b> it meets the published definition or threshold. It still is not proof.</p>
<p>A level gives a number only when a source gives it. Where no source gives a threshold, Textbook means "meets the published
definition as worded", and Faint and Strong are left to be set.</p>
<h4>How it can be checked</h4>
<p>From the case's own records; after outside lookups (company registries, sanctions lists, ship tracking and the other sources in
Paper Trail); or only by a person reading documents or interviews.</p>
<h4>Cases</h4>
<p>Every case states what its source establishes: convicted, acquitted, settled, fined by a regulator, found by an official inquiry,
or <span class="alleged">alleged in published reporting</span>, which is not proven.</p>
<h4>Cross-hints</h4>
<p>Some signs in one area point to another: financial patterns that also signal trafficking, or a story's subject that raises the
danger to the reporter. Each cross-hint gives its reason and source. The Workbench watches every area on every investigation,
whatever its type.</p>
<h4>What is in this edition</h4>
<p>Only indicators whose every quote, case outcome and threshold number was re-opened at its source and checked are printed.
Source numbers in square brackets refer to the Sources list.</p>"""

    def source_list(self) -> str:
        rows = []
        for url, n in sorted(self.number.items(), key=lambda kv: kv[1]):
            s = self.sources[url]
            meta = ", ".join(x for x in (e(s["publisher"]), e(s["year"]), e(s["licence"])) if x)
            rows.append(f'<p class="src"><b>[{n}]</b> {e(s["title"])}<br/><span class="muted small">{meta} · used by '
                        f'{", ".join(sorted(set(s["used_by"])))}<br/>{e(url)}</span></p>')
        return '<h1 id="sources">Sources</h1>' + "".join(rows)

    def indicator(self, i: Indicator) -> str:
        out = [f'<h3 id="ind-{i.id}"><span class="id">{i.id}</span> {e(i.name)}</h3>', f'<p class="def">{e(i.definition)}</p>']
        if i.typology:
            out.append(f'<p class="muted small">Typology: {e(i.typology)}</p>')
        lv = i.levels
        out.append('<h4>Levels</h4>' + "".join(f'<p class="lvl"><b>{k}:</b> {e(v)}</p>' for k, v in (("Faint", lv.faint), ("Strong", lv.strong), ("Textbook", lv.textbook))))
        check = CHECK[i.checkable.value] + (f": {e(', '.join(i.lookup_sources))}" if i.lookup_sources else "")
        out.append(f'<h4>How it can be checked</h4><p>{check}</p>')
        if i.data_needed:
            out.append(f'<h4>Data needed</h4><p class="small">{e("; ".join(i.data_needed))}</p>')
        if i.examples:
            out.append('<h4>What it looks like</h4><ul>' + "".join(f"<li>{e(x)}</li>" for x in i.examples) + "</ul>")
        out.append('<h4>Innocent explanations</h4><ul>' + "".join(f"<li>{e(x)}</li>" for x in i.innocent_explanations) + "</ul>")
        if i.cases:
            items = []
            for c in i.cases:
                label = OUTCOME[c.outcome.value]
                cls = ' class="alleged"' if c.outcome.value == "alleged_in_reporting" else ""
                items.append(f'<li><b>{e(c.name)}</b> ({e(c.year)}, {e(c.jurisdiction)}). {e(c.what_happened)} '
                             f'<span{cls}>{label}.</span> <span class="muted small">{e(c.source_url)}</span></li>')
            out.append('<h4>Documented cases</h4><ul>' + "".join(items) + "</ul>")
        if i.cross_hints:
            out.append('<h4>May also point to</h4><ul>' + "".join(
                f'<li><b>{e(AREAS.get(h.target_area, h.target_area))}</b>: {e(h.reason)} <span class="muted small">{e(h.source_url)}</span></li>'
                for h in i.cross_hints) + "</ul>")
        out.append('<h4>Sources</h4><ul>' + "".join(
            f'<li>[{self.number[s.url]}] <span class="quote">"{e(s.quote)}"</span> <span class="muted small">{e(s.locator)}</span></li>'
            for s in i.sources) + "</ul>")
        if i.jurisdictions:
            out.append(f'<p class="muted small">Applies: {e(i.jurisdictions)} · version {i.version}</p>')
        return "".join(out)

    def chapter(self, area) -> str:
        items = self.verified(area.indicators)
        intro = area.scope.split(". ")[0].split(" Include:")[0].strip().rstrip(".")
        return (f'<h1 id="area-{area.key}">{area.key} · {e(area.name)}</h1><p class="muted">{e(intro[:1].upper() + intro[1:])}.</p>'
                + "".join(self.indicator(i) for i in items))

    def cross_map(self) -> str:
        counts: dict[tuple[str, str], int] = defaultdict(int)
        lines = []
        for a in self.areas:
            for i in self.verified(a.indicators):
                for h in i.cross_hints:
                    counts[(a.key, h.target_area)] += 1
                    lines.append(f'<li><span class="id">{i.id}</span> {e(i.name)} → <b>{e(AREAS.get(h.target_area, h.target_area))}</b>: {e(h.reason)}</li>')
        targets = sorted({t for _, t in counts})
        head = "".join(f"<th>{t}</th>" for t in targets)
        def cell(a: str, t: str) -> str:
            return f"<td>{counts.get((a, t)) or ''}</td>"
        body = "".join("<tr><th>" + a.key + "</th>" + "".join(cell(a.key, t) for t in targets) + "</tr>" for a in self.areas)
        key = "; ".join(f"{k} {v}" for k, v in AREAS.items())
        return (f'<h1 id="map">Cross-hints between areas</h1><p>Rows are the area an indicator belongs to; columns are the area it may also '
                f'point to; each cell counts indicators.</p><table><tr><th></th>{head}</tr>{body}</table><p class="muted small">{e(key)}</p>'
                f'<ul>{"".join(lines)}</ul>')

    def glossary(self) -> str:
        terms = sorted((t for g in self.cat.glossaries for t in g.terms), key=lambda t: t.term.lower())
        out = ['<h1 id="glossary">Glossary</h1>']
        for t in terms:
            extra = []
            if t.examples:
                extra.append("Examples: " + e("; ".join(t.examples)))
            if t.related:
                extra.append("Related: " + e(", ".join(t.related)))
            out.append(f'<p><b>{e(t.term)}</b>. {e(t.definition)} <span class="muted small">{" · ".join(extra)} · {e(t.source_url)}</span></p>')
        return "".join(out)

    def index(self, pages: dict[str, int]) -> str:
        items = sorted((i for a in self.areas for i in self.verified(a.indicators)), key=lambda i: i.name.lower())
        rows = "".join(f'<p class="tocl"><a href="#ind-{i.id}">{e(i.name)}</a> <span class="muted">· {i.id} · page {pages.get("ind-" + i.id, "")}</span></p>' for i in items)
        return f'<h1 id="index">Index of indicators</h1>{rows}'

    # -- layout ---------------------------------------------------------------
    def parts(self, pages: dict[str, int]) -> list[str]:
        return [self.cover(), self.contents(pages), self.mission(), self.howto(), self.source_list(),
                *[self.chapter(a) for a in self.areas], self.cross_map(), self.glossary(), self.index(pages)]


RECT = pymupdf.paper_rect("a4")
BODY = RECT + (54, 60, -54, -60)


def render(parts: list[str], out: Path | None) -> tuple[dict[str, int], int]:
    """Lay out each part starting on a new page. Returns the page of every
    element with an id, and the page count."""
    pages: dict[str, int] = {}
    writer = pymupdf.DocumentWriter(str(out)) if out else None
    page_no = 0
    for html in parts:
        story = pymupdf.Story(html=html, user_css=CSS)
        more, start = 1, page_no
        while more:
            page_no += 1
            if page_no - start > 400:
                raise RuntimeError(f"a part does not fit on the page: {html[:120]!r}")
            dev = writer.begin_page(RECT) if writer else None
            more, _ = story.place(BODY)

            def record(pos: pymupdf.ElementPosition) -> None:
                if pos.id and pos.open_close & 1:
                    pages.setdefault(pos.id, pos.pageno)
            story.element_positions(record, {"pageno": page_no})
            story.draw(dev)  # drawing (to nothing, on the first passes) is what moves the story on
            if writer is not None:
                writer.end_page()
    if writer:
        writer.close()
    return pages, page_no


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "catalogue" / "indicator-catalogue.pdf"
    book = Book(mission_draft="--mission-draft" in sys.argv)
    pages, _ = render(book.parts({}), None)
    pages, _ = render(book.parts(pages), None)  # the contents may change length once page numbers are in
    render(book.parts(pages), out)
    doc = pymupdf.open(out)
    toc = [[lvl, text, pages.get(anchor, 1)] for anchor, text, lvl in book.headings() if anchor in pages]
    doc.set_toc(toc)
    for n, page in enumerate(doc, 1):
        if n > 1:
            page.insert_text((RECT.width - 70, RECT.height - 30), f"{n}", fontsize=8, color=(0.42, 0.35, 0.27))
            page.insert_text((54, RECT.height - 30), "Journalism Workbench · Indicator Catalogue", fontsize=8, color=(0.42, 0.35, 0.27))
    doc.set_metadata({"title": "Indicator Catalogue", "author": "Journalism Workbench", "subject": "Published warning signs of wrongdoing"})
    doc.saveIncr()
    print(f"{out}: {doc.page_count} pages")


if __name__ == "__main__":
    main()
