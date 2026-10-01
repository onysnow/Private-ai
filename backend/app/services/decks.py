"""Presentation decks: CRUD and .pptx export. See app/models/decks.py for
the slides_json shape.

A slide is a plain dict:
    {"kind": "title" | "statement" | "content" | "questions",
     "heading": str, "bullets": [str], "evidence": [{"record_type","record_id"}],
     "notes": str, "visual": None | {"type": "figures"|"timeline"|"bar", ...}}
Only heading/bullets/evidence are required; a slide with no `kind` (decks
saved before kinds existed) renders as "content". `visual` mirrors the
presentation_draft module's per-section visual (app/ai/reasoning.py
VISUAL_TYPES) -- every data point carries its own evidence refs.

Export draws every slide itself on a 16:9 canvas rather than relying on the
stock python-pptx template: an editorial layout in the app's Dark Academia
palette (dark title/takeaway slides, warm-paper content slides), real
hanging-indent bullets, the cited evidence quoted beside the bullets, native
(editable) PowerPoint bar charts, a drawn timeline, the section's full prose
in the speaker notes, and a numbered, human-readable sources list -- see
render_deck_pptx.
"""
from __future__ import annotations

import math
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Deck

MAX_BULLETS_PER_SLIDE = 8
SLIDE_KINDS = {"title", "statement", "content", "questions"}
VISUAL_LIMITS = {"figures": 4, "timeline": 8, "bar": 8}


def _clean_refs(refs) -> list[dict]:
    return [
        {"record_type": e.get("record_type"), "record_id": e.get("record_id")}
        for e in (refs or [])
        if isinstance(e, dict) and e.get("record_type") and e.get("record_id")
    ]


def normalize_visual(visual) -> dict | None:
    """Keep a well-formed visual, drop anything else. A deck must always
    export, so a malformed visual is discarded rather than raised on."""
    if not isinstance(visual, dict) or visual.get("type") not in VISUAL_LIMITS:
        return None
    kind = visual["type"]
    items = []
    for item in (visual.get("items") or [])[: VISUAL_LIMITS[kind]]:
        if not isinstance(item, dict) or not str(item.get("label") or "").strip():
            continue
        clean = {"label": str(item["label"])[:200], "evidence": _clean_refs(item.get("evidence"))}
        if kind == "figures":
            clean["value"] = str(item.get("value") or "")[:40]
        elif kind == "timeline":
            clean["date"] = str(item.get("date") or "")[:40]
        else:
            value = item.get("value")
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                continue
            clean["value"] = value
        items.append(clean)
    if not items or (kind in {"timeline", "bar"} and len(items) < 2):
        return None
    out = {"type": kind, "items": items}
    if kind == "bar":
        out["title"] = str(visual.get("title") or "")[:200]
        out["unit"] = str(visual.get("unit") or "")[:40]
    return out


def _normalize_slides(slides: list[dict] | None) -> list[dict]:
    normalized = []
    for slide in slides or []:
        kind = slide.get("kind") if slide.get("kind") in SLIDE_KINDS else "content"
        normalized.append({
            "kind": kind,
            "heading": str(slide.get("heading") or "Untitled slide")[:300],
            "bullets": [str(b)[:500] for b in (slide.get("bullets") or [])][:MAX_BULLETS_PER_SLIDE],
            "evidence": _clean_refs(slide.get("evidence")),
            "notes": str(slide.get("notes") or "")[:20000],
            "visual": normalize_visual(slide.get("visual")),
        })
    return normalized


def deck_citation_refs(slides: list[dict]) -> list[dict]:
    """Every ref a deck cites, in first-appearance order (slide evidence,
    then each visual item's evidence) -- the order sources are numbered in."""
    seen, refs = set(), []
    for slide in slides or []:
        candidates = list(slide.get("evidence") or [])
        for item in ((slide.get("visual") or {}).get("items") or []):
            candidates.extend(item.get("evidence") or [])
        for ref in candidates:
            key = (ref.get("record_type"), ref.get("record_id"))
            if key[0] and key[1] and key not in seen:
                seen.add(key)
                refs.append({"record_type": key[0], "record_id": key[1]})
    return refs


def serialize_deck(row: Deck) -> dict:
    return {
        "id": row.id,
        "investigation_id": row.investigation_id,
        "title": row.title,
        "slides": _normalize_slides(row.slides_json),
        "slide_count": len(row.slides_json or []),
        "source_ai_candidate_id": row.source_ai_candidate_id,
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def create_deck(db: Session, *, investigation_id: str, title: str, slides: list[dict] | None = None,
                 source_ai_candidate_id: str | None = None, created_by: str | None = None) -> Deck:
    row = Deck(
        investigation_id=investigation_id, title=title.strip() or "Untitled deck",
        slides_json=_normalize_slides(slides), source_ai_candidate_id=source_ai_candidate_id,
        created_by=created_by, created_at=utcnow_naive(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_deck(db: Session, row: Deck, data: dict) -> Deck:
    if "title" in data and data["title"] is not None:
        row.title = data["title"].strip() or row.title
    if "slides_json" in data and data["slides_json"] is not None:
        row.slides_json = _normalize_slides(data["slides_json"])
    db.commit()
    db.refresh(row)
    return row


def list_decks(db: Session, investigation_id: str) -> list[Deck]:
    query = select(Deck).where(Deck.investigation_id == investigation_id)
    return list(db.scalars(query.order_by(Deck.updated_at.desc())).all())


def delete_deck(db: Session, row: Deck) -> None:
    db.delete(row)
    db.commit()


# --- .pptx export -------------------------------------------------------------

# Dark Academia palette (frontend/app/globals.css), plus two paper tones for
# the content slides -- a projected/printed deck reads better on warm paper
# than on the app's near-black background, which is kept for the title and
# takeaway slides.
NIGHT = "141B1F"       # title / statement background (deeper than --card #1a2328)
NIGHT_LINE = "2B3439"
PARCHMENT = "ECE3D2"   # text on NIGHT
PARCHMENT_MUTED = "B5A88F"
BRASS = "B98D34"       # --primary
BRASS_DEEP = "8A6420"  # brass with enough contrast on paper
OXBLOOD = "672C1A"     # --secondary
FOREST = "3A5C52"      # --accent
PAPER = "F7F2E8"
PANEL = "EDE4D3"
RULE = "D9CDB6"
INK = "1F1B16"
TAUPE = "7A6950"

SERIF = "Georgia"
SANS = "Calibri"

SLIDE_W_IN, SLIDE_H_IN = 13.333, 7.5
MARGIN_IN = 0.75


_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def display_date(value: str) -> str:
    """'2023-11-14' -> '14 Nov 2023', '2023-11' -> 'Nov 2023'; anything
    else (already human-written, or a year) is returned unchanged. Never
    adds precision the value didn't have."""
    parts = (value or "").strip().split("-")
    try:
        if len(parts) == 3 and len(parts[0]) == 4:
            return f"{int(parts[2])} {_MONTHS[int(parts[1]) - 1]} {parts[0]}"
        if len(parts) == 2 and len(parts[0]) == 4:
            return f"{_MONTHS[int(parts[1]) - 1]} {parts[0]}"
    except (ValueError, IndexError):
        pass
    return value


def _fit_size(texts: list[str], width_in: float, height_in: float, sizes: tuple[int, ...],
              *, char_w: float = 0.5, line_spacing: float = 1.2, gap_pt: float = 8.0) -> int:
    """Largest font size (pt) at which `texts`, one paragraph each, fit the
    box. Character-count estimate -- python-pptx can't measure text -- tuned
    on the side of fitting (char_w is a generous average glyph width)."""
    texts = [t for t in texts if t] or [""]
    for pt in sizes:
        per_line = max(8, int(width_in * 72 / (pt * char_w)))
        lines = sum(max(1, math.ceil(len(t) / per_line)) for t in texts)
        needed = lines * pt * line_spacing + gap_pt * (len(texts) - 1)
        if needed <= height_in * 72:
            return pt
    return sizes[-1]


class _DeckRenderer:
    def __init__(self, title: str, citation_details: dict[tuple[str, str], dict], citation_numbers: dict[tuple[str, str], int]):
        from pptx import Presentation
        from pptx.util import Inches

        self.Inches = Inches
        self.title = title
        self.details = citation_details
        self.numbers = citation_numbers
        self.prs = Presentation()
        self.prs.slide_width = Inches(SLIDE_W_IN)
        self.prs.slide_height = Inches(SLIDE_H_IN)
        self.layout = self.prs.slide_layouts[5]  # "Title Only": keeps a real title placeholder for outline/accessibility
        self.page = 0

    # --- primitives ---------------------------------------------------------
    def _rgb(self, hex_color: str):
        from pptx.dml.color import RGBColor
        return RGBColor.from_string(hex_color)

    def new_slide(self, background: str):
        slide = self.prs.slides.add_slide(self.layout)
        fill = slide.background.fill
        fill.solid()
        fill.fore_color.rgb = self._rgb(background)
        self.page += 1
        return slide

    def rect(self, slide, x, y, w, h, color, *, rounded=False):
        from pptx.enum.shapes import MSO_SHAPE
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE,
                                       self.Inches(x), self.Inches(y), self.Inches(w), self.Inches(h))
        shape.fill.solid()
        shape.fill.fore_color.rgb = self._rgb(color)
        shape.line.fill.background()
        shape.shadow.inherit = False
        if rounded:
            shape.adjustments[0] = 0.06
        return shape

    def oval(self, slide, cx, cy, d, color, *, ring: str | None = None):
        from pptx.enum.shapes import MSO_SHAPE
        from pptx.util import Pt
        shape = slide.shapes.add_shape(MSO_SHAPE.OVAL, self.Inches(cx - d / 2), self.Inches(cy - d / 2), self.Inches(d), self.Inches(d))
        shape.fill.solid()
        shape.fill.fore_color.rgb = self._rgb(color)
        if ring:
            shape.line.color.rgb = self._rgb(ring)
            shape.line.width = Pt(2.5)
        else:
            shape.line.fill.background()
        shape.shadow.inherit = False
        return shape

    def _frame(self, box, *, anchor="top"):
        from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE
        tf = box.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = {"top": MSO_ANCHOR.TOP, "middle": MSO_ANCHOR.MIDDLE, "bottom": MSO_ANCHOR.BOTTOM}[anchor]
        return tf

    def _run(self, paragraph, text, *, size, color, font=SANS, bold=False, italic=False, spacing: int | None = None):
        from pptx.util import Pt
        run = paragraph.add_run()
        run.text = text
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = self._rgb(color)
        if spacing is not None:
            run.font._element.set("spc", str(spacing))  # letter-spacing, hundredths of a point
        return run

    def text(self, slide, x, y, w, h, text, *, size, color, font=SANS, bold=False, italic=False,
             align="left", anchor="top", spacing: int | None = None, line_spacing: float | None = None):
        from pptx.enum.text import PP_ALIGN
        box = slide.shapes.add_textbox(self.Inches(x), self.Inches(y), self.Inches(w), self.Inches(h))
        tf = self._frame(box, anchor=anchor)
        p = tf.paragraphs[0]
        p.alignment = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT}[align]
        if line_spacing:
            p.line_spacing = line_spacing
        self._run(p, text, size=size, color=color, font=font, bold=bold, italic=italic, spacing=spacing)
        return box

    def place_title(self, slide, x, y, w, h, text, *, size, color, anchor="top", line_spacing=1.05):
        """Use the layout's real title placeholder (so the slide has a title
        in PowerPoint's outline and for screen readers), restyled in place."""
        from pptx.enum.text import PP_ALIGN
        shape = slide.shapes.title
        shape.left, shape.top, shape.width, shape.height = self.Inches(x), self.Inches(y), self.Inches(w), self.Inches(h)
        tf = self._frame(shape, anchor=anchor)
        tf.clear()
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.LEFT
        p.line_spacing = line_spacing
        self._run(p, text, size=size, color=color, font=SERIF)
        return shape

    def bullets(self, slide, x, y, w, h, items: list[str], *, color=INK, bullet_color=BRASS, sizes=(28, 26, 24, 22, 20, 18, 16, 15, 14)):
        from lxml import etree
        from pptx.oxml.ns import qn
        from pptx.util import Emu, Pt

        size = _fit_size(items, w - 0.35, h, sizes, gap_pt=16)
        box = slide.shapes.add_textbox(self.Inches(x), self.Inches(y), self.Inches(w), self.Inches(h))
        tf = self._frame(box)
        indent = Emu(int(self.Inches(0.32)))
        for i, item in enumerate(items):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.line_spacing = 1.12
            p.space_after = Pt(16 if size >= 22 else 10)
            pPr = p._p.get_or_add_pPr()
            pPr.set("marL", str(indent))
            pPr.set("indent", str(-indent))
            for tag in ("a:buClr", "a:buSzPct", "a:buFont", "a:buChar"):
                existing = pPr.find(qn(tag))
                if existing is not None:
                    pPr.remove(existing)
            bu_clr = etree.SubElement(pPr, qn("a:buClr"))
            etree.SubElement(bu_clr, qn("a:srgbClr")).set("val", bullet_color)
            etree.SubElement(pPr, qn("a:buSzPct")).set("val", "80000")
            etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
            etree.SubElement(pPr, qn("a:buChar")).set("char", "■")
            self._run(p, item, size=size, color=color)
        return box

    def kicker(self, slide, x, y, text, color):
        return self.text(slide, x, y, 8.0, 0.3, text.upper(), size=11, color=color, bold=True, spacing=220)

    def notes(self, slide, text: str):
        if text.strip():
            slide.notes_slide.notes_text_frame.text = text.strip()

    def footer(self, slide, refs: list[dict], *, dark: bool):
        nums = sorted({self.numbers[(r["record_type"], r["record_id"])] for r in refs if (r["record_type"], r["record_id"]) in self.numbers})
        muted = PARCHMENT_MUTED if dark else TAUPE
        line = NIGHT_LINE if dark else RULE
        self.rect(slide, MARGIN_IN, 6.88, SLIDE_W_IN - 2 * MARGIN_IN, 0.012, line)
        if nums:
            self.text(slide, MARGIN_IN, 6.98, 8.0, 0.3, "Sources  " + "  ".join(f"[{n}]" for n in nums), size=10, color=muted)
        short_title = self.title if len(self.title) <= 70 else self.title[:69].rstrip() + "…"
        self.text(slide, SLIDE_W_IN - MARGIN_IN - 6.0, 6.98, 6.0, 0.3, f"{short_title}   ·   {self.page}", size=10, color=muted, align="right")

    # --- slide kinds --------------------------------------------------------
    def title_slide(self, heading: str, subtitle: str, source_count: int):
        slide = self.new_slide(NIGHT)
        self.rect(slide, 0, 0, 0.18, SLIDE_H_IN, BRASS)
        self.kicker(slide, 0.95, 1.35, "Investigation brief", BRASS)
        size = _fit_size([heading], 11.2, 2.5, (44, 40, 36, 32, 28), char_w=0.58, line_spacing=1.12)
        self.place_title(slide, 0.95, 1.8, 11.2, 2.6, heading, size=size, color=PARCHMENT)
        self.rect(slide, 0.95, 4.55, 1.1, 0.045, BRASS)
        if subtitle:
            sub_size = _fit_size([subtitle], 10.6, 1.3, (18, 16, 15, 14))
            self.text(slide, 0.95, 4.8, 10.6, 1.4, subtitle, size=sub_size, color=PARCHMENT_MUTED, line_spacing=1.2)
        today = date.today()
        stamp = f"Prepared from {source_count} cited record{'s' if source_count != 1 else ''}  ·  {today.day} {today.strftime('%B %Y')}"
        self.text(slide, 0.95, 6.75, 10.0, 0.3, stamp, size=11, color=PARCHMENT_MUTED)

    def statement_slide(self, slide_data: dict):
        slide = self.new_slide(NIGHT)
        text = " ".join(slide_data.get("bullets") or []) or slide_data.get("heading") or ""
        self.kicker(slide, 0.95, 1.2, slide_data.get("heading") or "The takeaway", BRASS)
        size = _fit_size([text], 10.9, 4.6, (40, 36, 32, 30, 28, 26, 24, 22), char_w=0.58, line_spacing=1.3)
        lines = max(1, math.ceil(len(text) / max(8, int(10.9 * 72 / (size * 0.58)))))
        text_h = min(4.9, lines * size * 1.3 / 72 + 0.1)
        self.rect(slide, 0.95, 1.65, 0.06, text_h, BRASS)
        self.place_title(slide, 1.35, 1.6, 10.9, 5.0, text, size=size, color=PARCHMENT, line_spacing=1.15)
        self.notes(slide, slide_data.get("notes") or "")
        self.footer(slide, slide_data.get("evidence") or [], dark=True)

    def _evidence_panel(self, slide, x, y, w, h, refs: list[dict]):
        self.rect(slide, x, y, w, h, PANEL, rounded=True)
        self.kicker(slide, x + 0.3, y + 0.28, "From the record", OXBLOOD)
        details = [self.details.get((r["record_type"], r["record_id"])) for r in refs]
        details = [d for d in details if d]
        quoted = [d for d in details if d.get("quote")][:2]
        cursor = y + 0.75
        inner_w = w - 0.6
        bottom = y + h - 0.25
        if quoted:
            per = (bottom - cursor) / len(quoted)
            if len(quoted) == 1:
                per = min(per, 2.4)  # leave room to list the slide's other cited records
            for d in quoted:
                n = self.numbers.get((d["record_type"], d["record_id"]))
                quote = d["quote"]
                attribution = f"[{n}]  {d.get('locator') or d.get('label')}" + (f" — {d['source_title']}" if d.get("source_title") and d.get("locator") else "")
                text_w = inner_w - 0.32
                q_size = _fit_size([quote], text_w, per - 0.8, (18, 17, 16, 15, 14, 13, 12, 11), char_w=0.56, line_spacing=1.25)
                per_line = max(8, int(text_w * 72 / (q_size * 0.56)))
                max_lines = max(1, int((per - 0.8) * 72 / (q_size * 1.25)))
                if len(quote) > per_line * max_lines:
                    quote = quote[: max(20, per_line * max_lines - 1)].rstrip() + "…"
                quote_h = math.ceil(len(quote) / per_line) * q_size * 1.42 / 72
                self.text(slide, x + 0.3, cursor - 0.12, 0.4, 0.5, "“", size=34, color=BRASS, font=SERIF)
                self.text(slide, x + 0.62, cursor, text_w, quote_h + 0.05, quote, size=q_size, color=INK, font=SERIF, italic=True, line_spacing=1.15)
                self.text(slide, x + 0.62, cursor + quote_h + 0.12, text_w, 0.5, attribution, size=11, color=TAUPE, line_spacing=1.0)
                cursor += quote_h + 0.75
            rest = [d for d in details if d not in quoted]
            for d in rest[: max(0, int((bottom - cursor) / 0.62))]:
                n = self.numbers.get((d["record_type"], d["record_id"]))
                self.text(slide, x + 0.3, cursor, inner_w, 0.25, f"[{n}]  {d['type_label'].upper()}", size=9, color=TAUPE, bold=True, spacing=120)
                label = d.get("label") or ""
                self.text(slide, x + 0.3, cursor + 0.24, inner_w, 0.35, label if len(label) <= 55 else label[:54] + "…", size=12, color=INK)
                cursor += 0.62
        else:
            rows = details[:5]
            if not rows:
                self.text(slide, x + 0.3, cursor, inner_w, 0.6, "No cited records on this slide.", size=13, color=TAUPE, italic=True)
                return
            per = min(0.95, (bottom - cursor) / len(rows))
            for d in rows:
                n = self.numbers.get((d["record_type"], d["record_id"]))
                self.text(slide, x + 0.3, cursor, inner_w, 0.25, f"[{n}]  {d['type_label'].upper()}", size=9, color=TAUPE, bold=True, spacing=120)
                self.text(slide, x + 0.3, cursor + 0.25, inner_w, per - 0.3, d.get("label") or "", size=13, color=INK, line_spacing=1.05)
                cursor += per

    def _figures(self, slide, x, y, w, h, items: list[dict]):
        gap = 0.2
        per = (h - gap * (len(items) - 1)) / len(items)
        for i, item in enumerate(items):
            top = y + i * (per + gap)
            self.rect(slide, x, top, w, per, PANEL, rounded=True)
            self.rect(slide, x, top + 0.18, 0.06, per - 0.36, OXBLOOD)
            value_size = _fit_size([item["value"]], w - 0.6, min(per * 0.5, 1.0), (54, 48, 44, 40, 36, 32, 28), char_w=0.55, line_spacing=1.0)
            nums = sorted({self.numbers[(r["record_type"], r["record_id"])] for r in item["evidence"] if (r["record_type"], r["record_id"]) in self.numbers})
            self.text(slide, x + 0.35, top + 0.15, w - 0.6, per * 0.5, item["value"], size=value_size, color=OXBLOOD, font=SERIF, anchor="bottom")
            label = item["label"] + ("  " + " ".join(f"[{n}]" for n in nums) if nums else "")
            self.text(slide, x + 0.35, top + 0.2 + per * 0.5, w - 0.6, per * 0.5 - 0.3, label, size=15 if per > 1.6 else 13 if per > 1.1 else 11, color=INK, line_spacing=1.05)

    def _bar_chart(self, slide, x, y, w, h, visual: dict):
        from pptx.chart.data import CategoryChartData
        from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION
        from pptx.util import Pt

        unit = (visual.get("unit") or "").strip()
        currency = {"USD": "$", "US$": "$", "$": "$", "EUR": "€", "€": "€", "GBP": "£", "£": "£"}.get(unit.upper() if unit else "", None)
        if visual.get("title"):
            self.text(slide, x, y, w, 0.35, visual["title"] + (f"  ({unit})" if unit and not currency else ""), size=13, color=TAUPE, bold=True)
            y, h = y + 0.4, h - 0.4
        items = list(reversed(visual["items"]))  # bar charts draw bottom-up; keep the draft's order top-down
        data = CategoryChartData()
        data.categories = [i["label"] for i in items]
        data.add_series(visual.get("title") or "Value", [i["value"] for i in items])
        chart = slide.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, self.Inches(x), self.Inches(y), self.Inches(w), self.Inches(h), data).chart
        chart.has_legend = False
        chart.has_title = False
        chart.font.name = SANS
        chart.font.size = Pt(12)
        chart.font.color.rgb = self._rgb(INK)
        plot = chart.plots[0]
        plot.gap_width = 60
        plot.vary_by_categories = False
        series = plot.series[0]
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = self._rgb(BRASS)
        prefix = currency or ""
        fmt = f'[>=1000000]{prefix}#,##0.0,,"M";[>=1000]{prefix}#,##0,"K";{prefix}#,##0'
        plot.has_data_labels = True
        labels = plot.data_labels
        labels.number_format = fmt
        labels.number_format_is_linked = False
        labels.position = XL_LABEL_POSITION.OUTSIDE_END
        labels.font.size = Pt(12)
        labels.font.bold = True
        labels.font.color.rgb = self._rgb(INK)
        value_axis = chart.value_axis
        value_axis.has_major_gridlines = False
        value_axis.visible = False
        category_axis = chart.category_axis
        category_axis.format.line.color.rgb = self._rgb(RULE)
        category_axis.tick_labels.font.size = Pt(12)
        category_axis.tick_labels.font.color.rgb = self._rgb(INK)

    def _timeline(self, slide, x, y, w, h, items: list[dict]):
        n = len(items)
        line_y = y + 0.75
        self.rect(slide, x, line_y - 0.015, w, 0.03, RULE)
        step = w / n
        label_size = 16 if n <= 3 else 14 if n <= 5 else 12
        for i, item in enumerate(items):
            cx = x + step * (i + 0.5)
            self.oval(slide, cx, line_y, 0.22, PAPER, ring=BRASS)
            self.oval(slide, cx, line_y, 0.1, BRASS)
            self.text(slide, cx - step / 2 + 0.05, y, step - 0.1, 0.4, display_date(item.get("date") or ""), size=label_size + 2, color=BRASS_DEEP, bold=True, align="center")
            nums = sorted({self.numbers[(r["record_type"], r["record_id"])] for r in item["evidence"] if (r["record_type"], r["record_id"]) in self.numbers})
            label = item["label"] + (" " + " ".join(f"[{k}]" for k in nums) if nums else "")
            self.text(slide, cx - step / 2 + 0.08, line_y + 0.25, step - 0.16, h - 1.05, label, size=label_size, color=INK, align="center", line_spacing=1.05)

    def content_slide(self, slide_data: dict, index: int, total: int):
        slide = self.new_slide(PAPER)
        visual = slide_data.get("visual")
        self.kicker(slide, MARGIN_IN, 0.42, f"{index:02d} / {total:02d}", BRASS_DEEP)
        heading = slide_data.get("heading") or "Untitled slide"
        h_size = _fit_size([heading], 11.8, 0.9, (34, 30, 28, 26, 24), char_w=0.58, line_spacing=1.1)
        self.place_title(slide, MARGIN_IN, 0.72, 11.8, 0.95, heading, size=h_size, color=INK, anchor="middle")
        self.rect(slide, MARGIN_IN, 1.78, 0.9, 0.045, BRASS)
        bullets = slide_data.get("bullets") or []
        refs = list(slide_data.get("evidence") or [])
        kind = (visual or {}).get("type")
        if kind == "timeline":
            if bullets:
                self.bullets(slide, MARGIN_IN, 2.05, 11.8, 1.95, bullets, sizes=(20, 18, 16, 15, 14))
            self._timeline(slide, MARGIN_IN + 0.1, 4.25 if bullets else 2.6, 11.6, 2.45 if bullets else 3.6, visual["items"])
        elif kind == "bar":
            if bullets:
                self.bullets(slide, MARGIN_IN, 2.1, 5.3, 4.55, bullets, sizes=(22, 20, 18, 16, 15, 14))
            self._bar_chart(slide, 6.45 if bullets else MARGIN_IN, 2.0, 6.1 if bullets else 11.8, 4.7, visual)
        elif kind == "figures":
            if bullets:
                self.bullets(slide, MARGIN_IN, 2.1, 6.9, 4.55, bullets)
            self._figures(slide, 8.15 if bullets else MARGIN_IN, 2.05, 4.45 if bullets else 11.8, 4.6, visual["items"])
        else:
            if bullets:
                self.bullets(slide, MARGIN_IN, 2.1, 6.9, 4.55, bullets)
            self._evidence_panel(slide, 8.15, 2.05, 4.45, 4.6, refs)
        for item in (visual or {}).get("items") or []:
            refs.extend(item.get("evidence") or [])
        self.notes(slide, slide_data.get("notes") or "")
        self.footer(slide, refs, dark=False)

    def questions_slide(self, slide_data: dict):
        slide = self.new_slide(PAPER)
        self.kicker(slide, MARGIN_IN, 0.42, "Open questions", OXBLOOD)
        self.place_title(slide, MARGIN_IN, 0.72, 11.8, 0.95, slide_data.get("heading") or "What the record doesn't yet show", size=32, color=INK, anchor="middle")
        self.rect(slide, MARGIN_IN, 1.78, 0.9, 0.045, OXBLOOD)
        questions = (slide_data.get("bullets") or [])[:6]
        if questions:
            gap = 0.12
            per = min(1.15, (4.8 - gap * (len(questions) - 1)) / len(questions))
            longest = max(questions, key=len)
            size = _fit_size([longest], 10.6, per - 0.1, (24, 22, 20, 18, 16, 15, 14), gap_pt=0)
            for i, question in enumerate(questions):
                top = 2.1 + i * (per + gap)
                self.text(slide, MARGIN_IN, top, 0.9, per, f"{i + 1:02d}", size=26, color=BRASS, font=SERIF)
                self.text(slide, MARGIN_IN + 1.0, top + 0.05, 10.8, per, question, size=size, color=INK, line_spacing=1.1)
        self.notes(slide, slide_data.get("notes") or "")
        self.footer(slide, slide_data.get("evidence") or [], dark=False)

    def sources_slides(self, refs_in_order: list[tuple[str, str]]):
        per_slide = 10
        chunks = [refs_in_order[i:i + per_slide] for i in range(0, len(refs_in_order), per_slide)]
        for c, chunk in enumerate(chunks):
            slide = self.new_slide(PAPER)
            self.kicker(slide, MARGIN_IN, 0.42, "Sources" + (f"  ·  {c + 1} of {len(chunks)}" if len(chunks) > 1 else ""), BRASS_DEEP)
            self.place_title(slide, MARGIN_IN, 0.72, 11.8, 0.95, "Where every statement comes from", size=30, color=INK, anchor="middle")
            self.rect(slide, MARGIN_IN, 1.78, 0.9, 0.045, BRASS)
            col_w, row_h = 5.75, 0.9
            for i, key in enumerate(chunk):
                col, row = divmod(i, per_slide // 2)
                x = MARGIN_IN + col * (col_w + 0.3)
                y = 2.05 + row * row_h
                d = self.details.get(key) or {"type_label": key[0], "label": key[1], "record_type": key[0], "record_id": key[1]}
                n = self.numbers[key]
                self.text(slide, x, y, 0.6, 0.4, f"[{n}]", size=13, color=BRASS_DEEP, bold=True)
                self.text(slide, x + 0.6, y, col_w - 0.6, 0.25, d["type_label"].upper() + ("  ·  NO LONGER AVAILABLE" if d.get("missing") else ""), size=9, color=TAUPE, bold=True, spacing=120)
                second = d.get("source_title") if d.get("source_title") and d.get("source_title") != d.get("label") else (d.get("detail") or "")
                main = d.get("label") or key[1]
                self.text(slide, x + 0.6, y + 0.22, col_w - 0.6, 0.32, main if len(main) <= 80 else main[:79] + "…", size=13, color=INK, bold=True)
                if second:
                    self.text(slide, x + 0.6, y + 0.5, col_w - 0.6, 0.3, second if len(second) <= 90 else second[:89] + "…", size=11, color=TAUPE, italic=True)
            self.footer(slide, [], dark=False)


def render_deck_pptx(row: Deck, citation_details: list[dict] | None = None):
    """Render a deck to a python-pptx Presentation (16:9).

    `citation_details` is describe_record_refs()'s output for this deck's
    refs (see deck_citation_refs); without it the sources slide falls back
    to record type + id, so an export never fails for want of labels.
    """
    slides = _normalize_slides(row.slides_json)
    refs = deck_citation_refs(slides)
    numbers = {(r["record_type"], r["record_id"]): i + 1 for i, r in enumerate(refs)}
    details = {(d["record_type"], d["record_id"]): d for d in (citation_details or [])}
    renderer = _DeckRenderer(row.title, details, numbers)

    title_slide = next((s for s in slides if s["kind"] == "title"), None)
    renderer.title_slide(
        title_slide["heading"] if title_slide else row.title,
        " ".join(title_slide["bullets"]) if title_slide else "",
        len(refs),
    )
    if title_slide and title_slide.get("notes"):
        renderer.notes(renderer.prs.slides[0], title_slide["notes"])

    content = [s for s in slides if s["kind"] == "content"]
    content_index = 0
    for slide_data in slides:
        if slide_data["kind"] == "statement":
            renderer.statement_slide(slide_data)
        elif slide_data["kind"] == "questions":
            renderer.questions_slide(slide_data)
        elif slide_data["kind"] == "content":
            content_index += 1
            renderer.content_slide(slide_data, content_index, len(content))
    if refs:
        renderer.sources_slides(list(numbers.keys()))
    return renderer.prs
