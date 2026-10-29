"""A deck as a PDF (DECK_1's Export; DECISIONS_LOG 15), printed on this computer by the browser that prints the write-up
(app/services/print_pdf.py), so no DeckCraft is needed.

The PDF is the theme's light paper version (DECK_1's style panel: "Handouts and PDF use a light paper version of the
theme"): every slide on the theme's page colour, title slides included. Slides: one 16:9 page per slide. Handout: an A4
page per slide with the slide above its speaker notes. A slide citing a claim not yet shown keeps its Draft band, as in
the editor; the sources are numbered as the .pptx numbers them and listed on the last page. A chart is the render
service's SVG of the same checked drawing the .pptx uses; when it cannot be drawn, its place says why, as the .pptx does.
"""

from __future__ import annotations

from html import escape

from app.models.domain import Deck
from app.services.decks import (
    CHART_VISUAL,
    _normalize_slides,
    checked_chart,
    deck_citation_refs,
    picture_size,
)
from app.services.presentation_style import Theme, resolved_theme
from app.visuals.echarts import KIND_LABELS

SLIDE_W, SLIDE_H = 13.333, 7.5  # inches, as the .pptx


def _font(name: str, generic: str) -> str:
    return f"'{escape(name)}', {generic}"


def _chart(visual: dict, theme: Theme) -> str:
    from app.visuals.render_client import RenderUnavailable, render_svg

    width, height = picture_size(11.3, 3.6)
    sized = checked_chart(visual, theme, width=width, height=height)
    label = KIND_LABELS.get(sized.spec.kind, sized.spec.kind.value)
    if sized.problem or sized.built is None:
        return f'<p class="note">{escape(sized.problem or f"{label} cannot be drawn.")}</p>'
    try:
        svg = render_svg(sized.built.option, width, height)
    except RenderUnavailable as exc:
        return f'<p class="note">{escape(label)} not drawn: the chart service could not be reached ({escape(str(exc))}).</p>'
    return f'<figure class="chart" aria-label="{escape(sized.built.alt_text)}">{svg}</figure>'


def _visual(visual: dict | None, theme: Theme) -> str:
    if not visual:
        return ""
    kind = visual.get("type")
    if kind == CHART_VISUAL:
        return _chart(visual, theme)
    items = visual.get("items") or []
    if kind == "figures":
        return '<div class="figures">' + "".join(
            f'<div><b>{escape(str(i.get("value") or ""))}</b><span>{escape(i["label"])}</span></div>' for i in items) + "</div>"
    if kind == "timeline":
        return '<ol class="timeline">' + "".join(
            f'<li><b>{escape(str(i.get("date") or ""))}</b> {escape(i["label"])}</li>' for i in items) + "</ol>"
    if kind == "bar":
        top = max((abs(float(i["value"])) for i in items), default=0) or 1
        unit = escape(str(visual.get("unit") or ""))
        head = f'<p class="bar-title">{escape(str(visual.get("title") or ""))}</p>' if visual.get("title") else ""
        return head + '<div class="bars">' + "".join(
            f'<div><span>{escape(i["label"])}</span><i style="width:{abs(float(i["value"])) / top * 100:.1f}%"></i>'
            f'<b>{i["value"]:,}{(" " + unit) if unit else ""}</b></div>' for i in items) + "</div>"
    return ""


def deck_html(row: Deck, citation_details: list[dict] | None = None, *, drafts: set[int] | None = None, handout: bool = False) -> str:
    """The deck as one HTML page per slide, ready to print. `drafts` are the 1-based slides citing a claim not yet shown."""
    t = resolved_theme(getattr(row, "style_json", None))
    slides = _normalize_slides(row.slides_json)
    refs = deck_citation_refs(slides)
    numbers = {(r["record_type"], r["record_id"]): n for n, r in enumerate(refs, start=1)}
    details = {(d["record_type"], d["record_id"]): d for d in (citation_details or [])}
    drafts = drafts or set()
    heading, body = _font(t.heading_font, "Georgia, serif"), _font(t.body_font, "Arial, sans-serif")
    page_size = "A4 portrait" if handout else f"{SLIDE_W}in {SLIDE_H}in"
    css = f"""
@page {{ size: {page_size}; margin: {'14mm' if handout else '0'}; }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: {body}; color: #{t.text}; }}
.page {{ page-break-after: always; break-after: page; }}
.page:last-child {{ page-break-after: auto; break-after: auto; }}
.slide {{ position: relative; overflow: hidden; background: #{t.page}; width: {SLIDE_W}in; height: {SLIDE_H}in; padding: 0.7in 0.9in 0.6in; }}
.handout .slide {{ width: 100%; height: auto; aspect-ratio: 16 / 9; padding: 4.5% 6.5% 4%; font-size: 62%; border: 1px solid #{t.rule}; }}
.kicker {{ font: 600 0.8em/1 {body}; letter-spacing: .14em; text-transform: uppercase; color: #{t.accent_text}; margin: 0 0 .6em; }}
h1 {{ font: 400 2.6em/1.12 {heading}; margin: 0 0 .5em; }}
.title h1 {{ font-size: 3.4em; margin-top: 1.2in; }}
.handout .title h1 {{ margin-top: 12%; }}
.title .sub {{ font-size: 1.3em; color: #{t.muted}; }}
.title .rule {{ width: 1.2in; height: 3px; background: #{t.accent}; margin: .5em 0 1em; }}
.statement h1 {{ font-size: 3em; margin-top: 1.3in; text-align: center; }}
ul {{ margin: 0; padding-left: 1.1em; font-size: 1.35em; line-height: 1.45; }}
li {{ margin: .25em 0; }}
.prose {{ font-size: 1.25em; line-height: 1.5; }}
.foot {{ position: absolute; left: 0.9in; right: 0.9in; bottom: 0.3in; display: flex; justify-content: space-between;
  font-size: .75em; color: #{t.muted}; border-top: 1px solid #{t.rule}; padding-top: .4em; }}
.handout .foot {{ left: 6.5%; right: 6.5%; bottom: 3%; }}
.draft {{ position: absolute; top: 0.42in; right: -0.78in; width: 3in; transform: rotate(40deg); text-align: center; background: #{t.alert};
  color: #fff; font: 700 .85em/1 {body}; letter-spacing: .3em; text-transform: uppercase; padding: .5em 0; }}
.handout .draft {{ top: 6%; right: -12%; width: 40%; }}
.chart svg {{ width: 100%; height: auto; max-height: 3.9in; }}
.chart {{ margin: .4em 0 0; }}
.note {{ font-size: 1em; color: #{t.muted}; border-left: 3px solid #{t.rule}; padding-left: .7em; }}
.figures {{ display: flex; gap: 0.5in; margin-top: .6em; }}
.figures b {{ display: block; font: 400 2.6em/1.1 {heading}; color: #{t.accent_text}; }}
.figures span {{ color: #{t.muted}; }}
.timeline {{ list-style: none; padding: 0; border-left: 2px solid #{t.accent}; margin-top: .6em; font-size: 1.15em; }}
.timeline li {{ padding-left: .8em; margin: .4em 0; }}
.timeline b {{ color: #{t.accent_text}; }}
.bars div {{ display: grid; grid-template-columns: 30% 1fr auto; gap: .6em; align-items: center; margin: .3em 0; }}
.bars i {{ display: block; height: .9em; background: #{t.accent}; }}
.bar-title {{ font-weight: 600; margin: .4em 0; }}
.notes {{ margin: 6mm 0 0; font-size: 10.5pt; line-height: 1.5; white-space: pre-wrap; }}
.notes-cap {{ font: 600 8pt/1 {body}; letter-spacing: .14em; text-transform: uppercase; color: #{t.muted}; margin-top: 6mm; }}
.sources ol {{ font-size: 1em; line-height: 1.4; columns: 2; column-gap: .5in; padding-left: 1.4em; }}
.sources li {{ break-inside: avoid; }}
"""
    pages: list[str] = []
    content_total = sum(1 for s in slides if s["kind"] == "content")
    content_n = 0
    for n, s in enumerate(slides, start=1):
        cites = sorted({numbers[(r["record_type"], r["record_id"])] for r in s["evidence"] if (r["record_type"], r["record_id"]) in numbers})
        draft = '<span class="draft">Draft</span>' if n in drafts else ""
        foot_left = escape(row.title)
        if s["kind"] == "title":
            inner = (f'<h1>{escape(s["heading"])}</h1><div class="rule"></div>'
                     + (f'<p class="sub">{escape(" ".join(s["bullets"]))}</p>' if s["bullets"] else "")
                     + (f'<p class="sub">{len(refs)} source{"" if len(refs) == 1 else "s"} listed at the end</p>' if refs else ""))
            cls = "title"
        elif s["kind"] == "statement":
            inner, cls = f'<h1>{escape(s["heading"])}</h1>', "statement"
        else:
            if s["kind"] == "content":
                content_n += 1
            words = (f'<p class="prose">{escape(s["prose"])}</p>' if s["prose"]
                     else ("<ul>" + "".join(f"<li>{escape(b)}</li>" for b in s["bullets"] if b.strip()) + "</ul>" if s["bullets"] else ""))
            kicker = f'<p class="kicker">{content_n} of {content_total}</p>' if s["kind"] == "content" else ""
            inner, cls = f'{kicker}<h1>{escape(s["heading"])}</h1>{words}{_visual(s["visual"], t)}', "content"
        foot_right = (f"Sources {', '.join(map(str, cites))} · " if cites else "") + f"{n} / {len(slides)}"
        slide = (f'<section class="slide {cls}">{draft}{inner}'
                 f'<div class="foot"><span>{foot_left}</span><span>{foot_right}</span></div></section>')
        notes = (f'<p class="notes-cap">Speaker notes</p><p class="notes">{escape(s["notes"])}</p>' if handout and s["notes"].strip() else "")
        pages.append(f'<div class="page">{slide}{notes}</div>')
    if refs:
        items = []
        for r in refs:
            d = details.get((r["record_type"], r["record_id"])) or {}
            label = d.get("label") or f'{r["record_type"]} {r["record_id"][:8]}'
            where = " · ".join(str(x) for x in (d.get("type_label"), d.get("source_title"), d.get("locator")) if x)
            items.append(f"<li>{escape(str(label))}{f' <small>({escape(where)})</small>' if where else ''}</li>")
        pages.append(f'<div class="page"><section class="slide sources"><p class="kicker">Sources</p><h1>Where each line comes from</h1>'
                     f'<ol>{"".join(items)}</ol><div class="foot"><span>{escape(row.title)}</span><span>Sources</span></div></section></div>')
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{escape(row.title)}</title><style>{css}</style></head>'
            f'<body class="{"handout" if handout else "slides"}">{"".join(pages)}</body></html>')


def render_deck_pdf(row: Deck, citation_details: list[dict] | None = None, *, drafts: set[int] | None = None,
                    handout: bool = False) -> bytes:
    from app.services.print_pdf import html_to_pdf

    return html_to_pdf(deck_html(row, citation_details, drafts=drafts, handout=handout), css_page=True)
