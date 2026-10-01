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
from app.services.presentation_style import (
    Theme, normalize_deck_style, normalize_visual_style, resolved_theme, resolved_visual_style,
)

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
    style = normalize_visual_style(kind, visual.get("style"), [i["label"] for i in items])
    if style:
        out["style"] = style
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
        "style": normalize_deck_style(row.style_json),
        "source_ai_candidate_id": row.source_ai_candidate_id,
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def create_deck(db: Session, *, investigation_id: str, title: str, slides: list[dict] | None = None,
                 source_ai_candidate_id: str | None = None, created_by: str | None = None, style: dict | None = None) -> Deck:
    row = Deck(
        investigation_id=investigation_id, title=title.strip() or "Untitled deck",
        slides_json=_normalize_slides(slides), style_json=normalize_deck_style(style),
        source_ai_candidate_id=source_ai_candidate_id,
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
    if "style_json" in data and data["style_json"] is not None:
        row.style_json = normalize_deck_style(data["style_json"])
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


def sort_bar_items(items: list[dict], order: str) -> list[dict]:
    """Reorder bars for display. Only the order changes: every item keeps
    its own label, value and citations."""
    if order == "desc":
        return sorted(items, key=lambda i: i["value"], reverse=True)
    if order == "asc":
        return sorted(items, key=lambda i: i["value"])
    return list(items)


class _DeckRenderer:
    def __init__(self, title: str, citation_details: dict[tuple[str, str], dict], citation_numbers: dict[tuple[str, str], int],
                 theme: Theme | None = None):
        from pptx import Presentation
        from pptx.util import Inches

        self.t = theme or resolved_theme(None)
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

    def _run(self, paragraph, text, *, size, color, font=None, bold=False, italic=False, spacing: int | None = None):
        from pptx.util import Pt
        run = paragraph.add_run()
        run.text = text
        run.font.name = font or self.t.body_font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = self._rgb(color)
        if spacing is not None:
            run.font._element.set("spc", str(spacing))  # letter-spacing, hundredths of a point
        return run

    def text(self, slide, x, y, w, h, text, *, size, color, font=None, bold=False, italic=False,
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
        self._run(p, text, size=size, color=color, font=self.t.heading_font)
        return shape

    def bullets(self, slide, x, y, w, h, items: list[str], *, color=None, bullet_color=None, sizes=(28, 26, 24, 22, 20, 18, 16, 15, 14)):
        color = color or self.t.text
        bullet_color = bullet_color or self.t.accent
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
        muted = self.t.cover_muted if dark else self.t.muted
        line = self.t.cover_line if dark else self.t.rule
        self.rect(slide, MARGIN_IN, 6.88, SLIDE_W_IN - 2 * MARGIN_IN, 0.012, line)
        if nums:
            self.text(slide, MARGIN_IN, 6.98, 8.0, 0.3, "Sources  " + "  ".join(f"[{n}]" for n in nums), size=10, color=muted)
        short_title = self.title if len(self.title) <= 70 else self.title[:69].rstrip() + "…"
        self.text(slide, SLIDE_W_IN - MARGIN_IN - 6.0, 6.98, 6.0, 0.3, f"{short_title}   ·   {self.page}", size=10, color=muted, align="right")

    # --- slide kinds --------------------------------------------------------
    def title_slide(self, heading: str, subtitle: str, source_count: int):
        slide = self.new_slide(self.t.cover_bg)
        self.rect(slide, 0, 0, 0.18, SLIDE_H_IN, self.t.accent)
        self.kicker(slide, 0.95, 1.35, "Investigation brief", self.t.cover_accent)
        size = _fit_size([heading], 11.2, 2.5, (44, 40, 36, 32, 28), char_w=0.58, line_spacing=1.12)
        self.place_title(slide, 0.95, 1.8, 11.2, 2.6, heading, size=size, color=self.t.cover_text)
        self.rect(slide, 0.95, 4.55, 1.1, 0.045, self.t.accent)
        if subtitle:
            sub_size = _fit_size([subtitle], 10.6, 1.3, (18, 16, 15, 14))
            self.text(slide, 0.95, 4.8, 10.6, 1.4, subtitle, size=sub_size, color=self.t.cover_muted, line_spacing=1.2)
        today = date.today()
        stamp = f"Prepared from {source_count} cited record{'s' if source_count != 1 else ''}  ·  {today.day} {today.strftime('%B %Y')}"
        self.text(slide, 0.95, 6.75, 10.0, 0.3, stamp, size=11, color=self.t.cover_muted)

    def statement_slide(self, slide_data: dict):
        slide = self.new_slide(self.t.cover_bg)
        text = " ".join(slide_data.get("bullets") or []) or slide_data.get("heading") or ""
        self.kicker(slide, 0.95, 1.2, slide_data.get("heading") or "The takeaway", self.t.cover_accent)
        size = _fit_size([text], 10.9, 4.6, (40, 36, 32, 30, 28, 26, 24, 22), char_w=0.58, line_spacing=1.3)
        lines = max(1, math.ceil(len(text) / max(8, int(10.9 * 72 / (size * 0.58)))))
        text_h = min(4.9, lines * size * 1.3 / 72 + 0.1)
        self.rect(slide, 0.95, 1.65, 0.06, text_h, self.t.accent)
        self.place_title(slide, 1.35, 1.6, 10.9, 5.0, text, size=size, color=self.t.cover_text, line_spacing=1.15)
        self.notes(slide, slide_data.get("notes") or "")
        self.footer(slide, slide_data.get("evidence") or [], dark=True)

    def _evidence_panel(self, slide, x, y, w, h, refs: list[dict]):
        self.rect(slide, x, y, w, h, self.t.panel, rounded=True)
        self.kicker(slide, x + 0.3, y + 0.28, "From the record", self.t.alert)
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
                self.text(slide, x + 0.3, cursor - 0.12, 0.4, 0.5, "“", size=34, color=self.t.accent, font=self.t.heading_font)
                self.text(slide, x + 0.62, cursor, text_w, quote_h + 0.05, quote, size=q_size, color=self.t.text, font=self.t.heading_font, italic=True, line_spacing=1.15)
                self.text(slide, x + 0.62, cursor + quote_h + 0.12, text_w, 0.5, attribution, size=11, color=self.t.muted, line_spacing=1.0)
                cursor += quote_h + 0.75
            rest = [d for d in details if d not in quoted]
            for d in rest[: max(0, int((bottom - cursor) / 0.62))]:
                n = self.numbers.get((d["record_type"], d["record_id"]))
                self.text(slide, x + 0.3, cursor, inner_w, 0.25, f"[{n}]  {d['type_label'].upper()}", size=9, color=self.t.muted, bold=True, spacing=120)
                label = d.get("label") or ""
                self.text(slide, x + 0.3, cursor + 0.24, inner_w, 0.35, label if len(label) <= 55 else label[:54] + "…", size=12, color=self.t.text)
                cursor += 0.62
        else:
            rows = details[:5]
            if not rows:
                self.text(slide, x + 0.3, cursor, inner_w, 0.6, "No cited records on this slide.", size=13, color=self.t.muted, italic=True)
                return
            per = min(0.95, (bottom - cursor) / len(rows))
            for d in rows:
                n = self.numbers.get((d["record_type"], d["record_id"]))
                self.text(slide, x + 0.3, cursor, inner_w, 0.25, f"[{n}]  {d['type_label'].upper()}", size=9, color=self.t.muted, bold=True, spacing=120)
                self.text(slide, x + 0.3, cursor + 0.25, inner_w, per - 0.3, d.get("label") or "", size=13, color=self.t.text, line_spacing=1.05)
                cursor += per

    def _cite_marks(self, refs) -> str:
        nums = sorted({self.numbers[(r["record_type"], r["record_id"])] for r in refs or [] if (r["record_type"], r["record_id"]) in self.numbers})
        return " ".join(f"[{n}]" for n in nums)

    def _figures(self, slide, x, y, w, h, items: list[dict], style: dict):
        """Cards / big numbers stacked in a column, or a row of stats."""
        opts = style["options"]
        value_color = {"alert": self.t.alert, "accent": self.t.accent_text, "text": self.t.text}[opts.get("value_color", "alert")]
        row = style["layout"].get("arrangement") == "row"
        gap = 0.25 if row else 0.2
        count = len(items)
        for i, item in enumerate(items):
            if row:
                cell_w, cell_h = (w - gap * (count - 1)) / count, h
                left, top = x + i * (cell_w + gap), y
            else:
                cell_w, cell_h = w, (h - gap * (count - 1)) / count
                left, top = x, y + i * (cell_h + gap)
            if opts.get("card_fill", True):
                self.rect(slide, left, top, cell_w, cell_h, self.t.panel, rounded=True)
            elif i > 0:
                if row:
                    self.rect(slide, left - gap / 2, top + 0.1, 0.012, cell_h - 0.2, self.t.rule)
                else:
                    self.rect(slide, left, top - gap / 2, cell_w, 0.012, self.t.rule)
            if opts.get("accent_edge", True):
                self.rect(slide, left, top + 0.18, 0.06, cell_h - 0.36, self.t.alert)
            pad = 0.35 if (opts.get("card_fill", True) or opts.get("accent_edge", True)) else 0.05
            value_size = _fit_size([item["value"]], cell_w - pad - 0.25, min(cell_h * 0.5, 1.0), (54, 48, 44, 40, 36, 32, 28, 24), char_w=0.55, line_spacing=1.0)
            self.text(slide, left + pad, top + 0.15, cell_w - pad - 0.25, cell_h * 0.5, item["value"], size=value_size, color=value_color, font=self.t.heading_font, anchor="bottom")
            marks = self._cite_marks(item["evidence"])
            label = item["label"] + ("  " + marks if marks else "")
            label_size = 15 if cell_h > 1.6 and cell_w > 3 else 13 if cell_h > 1.1 else 11
            self.text(slide, left + pad, top + 0.2 + cell_h * 0.5, cell_w - pad - 0.25, cell_h * 0.5 - 0.3, label, size=label_size, color=self.t.text, line_spacing=1.05)

    def _bar_chart(self, slide, x, y, w, h, visual: dict, style: dict):
        """A native (editable) PowerPoint bar chart. The value axis always
        includes zero -- no style can start a bar anywhere else."""
        from pptx.chart.data import CategoryChartData
        from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION
        from pptx.util import Pt

        opts, layout = style["options"], style["layout"]
        horizontal = layout.get("orientation", "horizontal") == "horizontal"
        unit = (visual.get("unit") or "").strip()
        currency = {"USD": "$", "US$": "$", "$": "$", "EUR": "€", "€": "€", "GBP": "£", "£": "£"}.get(unit.upper() if unit else "", None)
        if visual.get("title"):
            self.text(slide, x, y, w, 0.35, visual["title"] + (f"  ({unit})" if unit and not currency else ""), size=13, color=self.t.muted, bold=True)
            y, h = y + 0.4, h - 0.4
        items = sort_bar_items(visual["items"], opts.get("sort", "as_given"))
        if horizontal:
            items = list(reversed(items))  # bar charts draw bottom-up; keep the reading order top-down
        data = CategoryChartData()
        data.categories = [i["label"] for i in items]
        data.add_series(visual.get("title") or "Value", [i["value"] for i in items])
        chart_type = XL_CHART_TYPE.BAR_CLUSTERED if horizontal else XL_CHART_TYPE.COLUMN_CLUSTERED
        chart = slide.shapes.add_chart(chart_type, self.Inches(x), self.Inches(y), self.Inches(w), self.Inches(h), data).chart
        chart.has_legend = False
        chart.has_title = False
        chart.font.name = self.t.body_font
        chart.font.size = Pt(12)
        chart.font.color.rgb = self._rgb(self.t.text)
        plot = chart.plots[0]
        plot.gap_width = {"thin": 150, "regular": 60, "thick": 25}[opts.get("thickness", "regular")]
        plot.vary_by_categories = False
        series = plot.series[0]
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = self._rgb(self.t.accent)
        highlight = set(opts.get("highlight") or [])
        if highlight:
            for idx, item in enumerate(items):
                point = series.points[idx]
                point.format.fill.solid()
                point.format.fill.fore_color.rgb = self._rgb(self.t.accent if item["label"] in highlight else self.t.bar_muted)
        prefix = currency or ""
        fmt = f'[>=1000000]{prefix}#,##0.0,,"M";[>=1000]{prefix}#,##0,"K";{prefix}#,##0'
        value_labels = bool(opts.get("value_labels", True))
        plot.has_data_labels = value_labels
        if value_labels:
            labels = plot.data_labels
            labels.number_format = fmt
            labels.number_format_is_linked = False
            labels.position = XL_LABEL_POSITION.OUTSIDE_END
            labels.font.size = Pt(12)
            labels.font.bold = True
            labels.font.color.rgb = self._rgb(self.t.text)
        value_axis = chart.value_axis
        value_axis.minimum_scale = min(0, min(i["value"] for i in items))
        # With no value labels the axis is the only way to read a value, so it stays.
        show_axis = bool(opts.get("gridlines", False)) or not value_labels
        value_axis.visible = show_axis
        value_axis.has_major_gridlines = show_axis
        if show_axis:
            value_axis.major_gridlines.format.line.color.rgb = self._rgb(self.t.rule)
            value_axis.tick_labels.number_format = fmt
            value_axis.tick_labels.number_format_is_linked = False
            value_axis.tick_labels.font.size = Pt(11)
            value_axis.tick_labels.font.color.rgb = self._rgb(self.t.muted)
            value_axis.format.line.fill.background()
        category_axis = chart.category_axis
        if layout.get("axis_line", True):
            category_axis.format.line.color.rgb = self._rgb(self.t.rule)
        else:
            category_axis.format.line.fill.background()
        category_axis.tick_labels.font.size = Pt(12)
        category_axis.tick_labels.font.color.rgb = self._rgb(self.t.text)

    def _timeline(self, slide, x, y, w, h, items: list[dict], style: dict):
        opts, layout = style["options"], style["layout"]
        n = len(items)
        ring = opts.get("marker", "ring") == "ring"
        if layout.get("direction") == "vertical":
            row_h = min(0.7, h / n)
            if opts.get("show_line", True):
                self.rect(slide, x + 2.25, y + row_h / 2, 0.025, row_h * (n - 1), self.t.rule)
            size = 16 if row_h >= 0.6 else 14 if row_h >= 0.5 else 12
            for i, item in enumerate(items):
                cy = y + i * row_h + row_h / 2
                self.text(slide, x, cy - 0.2, 2.0, 0.4, display_date(item.get("date") or ""), size=size, color=self.t.accent_text, bold=True, align="right", anchor="middle")
                if ring:
                    self.oval(slide, x + 2.26, cy, 0.22, self.t.page, ring=self.t.accent)
                self.oval(slide, x + 2.26, cy, 0.1 if ring else 0.16, self.t.accent)
                marks = self._cite_marks(item["evidence"])
                label = item["label"] + (" " + marks if marks else "")
                self.text(slide, x + 2.6, cy - row_h / 2 + 0.05, w - 2.6, row_h - 0.1, label, size=size, color=self.t.text, anchor="middle", line_spacing=1.05)
            return
        compact = bool(layout.get("compact"))
        line_y = y + (0.55 if compact else 0.75)
        if opts.get("show_line", True):
            self.rect(slide, x, line_y - 0.015, w, 0.03, self.t.rule)
        step = w / n
        label_size = (14 if n <= 3 else 12 if n <= 5 else 11) if compact else (16 if n <= 3 else 14 if n <= 5 else 12)
        for i, item in enumerate(items):
            cx = x + step * (i + 0.5)
            if ring:
                self.oval(slide, cx, line_y, 0.16 if compact else 0.22, self.t.page, ring=self.t.accent)
            self.oval(slide, cx, line_y, (0.07 if compact else 0.1) if ring else (0.12 if compact else 0.16), self.t.accent)
            self.text(slide, cx - step / 2 + 0.05, y, step - 0.1, 0.4, display_date(item.get("date") or ""), size=label_size + 2, color=self.t.accent_text, bold=True, align="center")
            marks = self._cite_marks(item["evidence"])
            label = item["label"] + (" " + marks if marks else "")
            self.text(slide, cx - step / 2 + 0.08, line_y + 0.25, step - 0.16, h - (0.85 if compact else 1.05), label, size=label_size, color=self.t.text, align="center", line_spacing=1.05)

    def content_slide(self, slide_data: dict, index: int, total: int):
        slide = self.new_slide(self.t.page)
        visual = slide_data.get("visual")
        self.kicker(slide, MARGIN_IN, 0.42, f"{index:02d} / {total:02d}", self.t.accent_text)
        heading = slide_data.get("heading") or "Untitled slide"
        h_size = _fit_size([heading], 11.8, 0.9, (34, 30, 28, 26, 24), char_w=0.58, line_spacing=1.1)
        self.place_title(slide, MARGIN_IN, 0.72, 11.8, 0.95, heading, size=h_size, color=self.t.text, anchor="middle")
        self.rect(slide, MARGIN_IN, 1.78, 0.9, 0.045, self.t.accent)
        bullets = slide_data.get("bullets") or []
        refs = list(slide_data.get("evidence") or [])
        kind = (visual or {}).get("type")
        style = resolved_visual_style(visual) if visual else None
        if kind == "timeline":
            layout = style["layout"]
            if layout.get("direction") == "vertical":
                if bullets:
                    self.bullets(slide, MARGIN_IN, 2.1, 5.0, 4.55, bullets, sizes=(22, 20, 18, 16, 15, 14))
                self._timeline(slide, 6.0 if bullets else MARGIN_IN, 2.1, 6.55 if bullets else 11.8, 4.55, visual["items"], style)
            else:
                compact = bool(layout.get("compact"))
                band = 1.75 if compact else 2.45
                if bullets:
                    self.bullets(slide, MARGIN_IN, 2.05, 11.8, 4.6 - band, bullets, sizes=(22, 20, 18, 16, 15, 14))
                self._timeline(slide, MARGIN_IN + 0.1, (6.7 - band) if bullets else 2.6, 11.6, band if bullets else 3.6, visual["items"], style)
        elif kind == "bar":
            if bullets:
                self.bullets(slide, MARGIN_IN, 2.1, 5.3, 4.55, bullets, sizes=(22, 20, 18, 16, 15, 14))
            self._bar_chart(slide, 6.45 if bullets else MARGIN_IN, 2.0, 6.1 if bullets else 11.8, 4.7, visual, style)
        elif kind == "figures":
            if style["layout"].get("arrangement") == "row":
                if bullets:
                    self.bullets(slide, MARGIN_IN, 2.05, 11.8, 2.3, bullets, sizes=(22, 20, 18, 16, 15, 14))
                self._figures(slide, MARGIN_IN, 4.6 if bullets else 2.3, 11.8, 2.0 if bullets else 3.0, visual["items"], style)
            else:
                if bullets:
                    self.bullets(slide, MARGIN_IN, 2.1, 6.9, 4.55, bullets)
                self._figures(slide, 8.15 if bullets else MARGIN_IN, 2.05, 4.45 if bullets else 11.8, 4.6, visual["items"], style)
        else:
            if bullets:
                self.bullets(slide, MARGIN_IN, 2.1, 6.9, 4.55, bullets)
            self._evidence_panel(slide, 8.15, 2.05, 4.45, 4.6, refs)
        for item in (visual or {}).get("items") or []:
            refs.extend(item.get("evidence") or [])
        self.notes(slide, slide_data.get("notes") or "")
        self.footer(slide, refs, dark=False)

    def questions_slide(self, slide_data: dict):
        slide = self.new_slide(self.t.page)
        self.kicker(slide, MARGIN_IN, 0.42, "Open questions", self.t.alert)
        self.place_title(slide, MARGIN_IN, 0.72, 11.8, 0.95, slide_data.get("heading") or "What the record doesn't yet show", size=32, color=self.t.text, anchor="middle")
        self.rect(slide, MARGIN_IN, 1.78, 0.9, 0.045, self.t.alert)
        questions = (slide_data.get("bullets") or [])[:6]
        if questions:
            gap = 0.12
            per = min(1.15, (4.8 - gap * (len(questions) - 1)) / len(questions))
            longest = max(questions, key=len)
            size = _fit_size([longest], 10.6, per - 0.1, (24, 22, 20, 18, 16, 15, 14), gap_pt=0)
            for i, question in enumerate(questions):
                top = 2.1 + i * (per + gap)
                self.text(slide, MARGIN_IN, top, 0.9, per, f"{i + 1:02d}", size=26, color=self.t.accent_text, font=self.t.heading_font)
                self.text(slide, MARGIN_IN + 1.0, top + 0.05, 10.8, per, question, size=size, color=self.t.text, line_spacing=1.1)
        self.notes(slide, slide_data.get("notes") or "")
        self.footer(slide, slide_data.get("evidence") or [], dark=False)

    def sources_slides(self, refs_in_order: list[tuple[str, str]]):
        per_slide = 10
        chunks = [refs_in_order[i:i + per_slide] for i in range(0, len(refs_in_order), per_slide)]
        for c, chunk in enumerate(chunks):
            slide = self.new_slide(self.t.page)
            self.kicker(slide, MARGIN_IN, 0.42, "Sources" + (f"  ·  {c + 1} of {len(chunks)}" if len(chunks) > 1 else ""), self.t.accent_text)
            self.place_title(slide, MARGIN_IN, 0.72, 11.8, 0.95, "Where every statement comes from", size=30, color=self.t.text, anchor="middle")
            self.rect(slide, MARGIN_IN, 1.78, 0.9, 0.045, self.t.accent)
            col_w, row_h = 5.75, 0.9
            for i, key in enumerate(chunk):
                col, row = divmod(i, per_slide // 2)
                x = MARGIN_IN + col * (col_w + 0.3)
                y = 2.05 + row * row_h
                d = self.details.get(key) or {"type_label": key[0], "label": key[1], "record_type": key[0], "record_id": key[1]}
                n = self.numbers[key]
                self.text(slide, x, y, 0.6, 0.4, f"[{n}]", size=13, color=self.t.accent_text, bold=True)
                self.text(slide, x + 0.6, y, col_w - 0.6, 0.25, d["type_label"].upper() + ("  ·  NO LONGER AVAILABLE" if d.get("missing") else ""), size=9, color=self.t.muted, bold=True, spacing=120)
                second = d.get("source_title") if d.get("source_title") and d.get("source_title") != d.get("label") else (d.get("detail") or "")
                main = d.get("label") or key[1]
                self.text(slide, x + 0.6, y + 0.22, col_w - 0.6, 0.32, main if len(main) <= 80 else main[:79] + "…", size=13, color=self.t.text, bold=True)
                if second:
                    self.text(slide, x + 0.6, y + 0.5, col_w - 0.6, 0.3, second if len(second) <= 90 else second[:89] + "…", size=11, color=self.t.muted, italic=True)
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
    renderer = _DeckRenderer(row.title, details, numbers, resolved_theme(getattr(row, "style_json", None)))

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
