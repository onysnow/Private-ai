"""Reporter-authored write-ups: CRUD, citation extraction from the stored
ProseMirror document, and .docx export.

content_json is TipTap/ProseMirror JSON (see frontend components/writeup-editor.tsx
for the editor). A citation is an inline atom node:
    {"type": "citation", "attrs": {"recordType": "claim", "recordId": "...", "label": "..."}}
extract_cited_refs/extract_plain_text walk that tree; nothing here assumes a
particular surrounding document shape beyond "nodes have a type and maybe
content/text/marks", which is true of any ProseMirror document.
"""
from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Writeup

WRITEUP_STATUSES = {"draft", "final"}

EMPTY_DOC: dict = {"type": "doc", "content": [{"type": "paragraph"}]}


def _walk(node: Any) -> Iterable[dict]:
    if isinstance(node, dict):
        yield node
        for child in node.get("content") or []:
            yield from _walk(child)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def extract_cited_refs(content_json: dict) -> list[dict]:
    """Every unique {record_type, record_id} a citation node in the document
    points at, in first-appearance order."""
    seen: set[tuple[str, str]] = set()
    refs: list[dict] = []

    def add(record_type: Any, record_id: Any) -> None:
        if not record_type or not record_id:
            return
        if record_type == "reporting_task":
            record_type = "task"
        key = (record_type, record_id)
        if key not in seen:
            seen.add(key)
            refs.append({"record_type": record_type, "record_id": record_id})

    for node in _walk(content_json or {}):
        if node.get("type") == "citation":
            attrs = node.get("attrs") or {}
            add(attrs.get("recordType"), attrs.get("recordId"))
        elif node.get("type") == "evidenceVisual":
            # A figure/timeline/bar block cites per data point (see
            # app/services/presentation.py); those count as citations too.
            for item in (((node.get("attrs") or {}).get("visual") or {}).get("items") or []):
                for ref in item.get("evidence") or []:
                    if isinstance(ref, dict):
                        add(ref.get("record_type"), ref.get("record_id"))
    return refs


def extract_plain_text(content_json: dict) -> str:
    """A readable plain-text rendering: paragraph/heading text joined by
    blank lines, list items by newlines, citation nodes rendered as their
    label in brackets. Good enough for search indexing and as a fallback
    preview -- not a full ProseMirror-to-text serializer."""
    lines: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            lines.append("".join(current).strip())
            current.clear()

    def visit(node: dict) -> None:
        node_type = node.get("type")
        if node_type == "text":
            current.append(node.get("text") or "")
            return
        if node_type == "citation":
            attrs = node.get("attrs") or {}
            current.append(f"[{attrs.get('label') or attrs.get('recordId') or 'citation'}]")
            return
        if node_type == "hardBreak":
            current.append("\n")
            return
        if node_type == "evidenceVisual":
            flush()
            visual = (node.get("attrs") or {}).get("visual") or {}
            for item in visual.get("items") or []:
                lead = item.get("date") or item.get("value")
                lines.append(f"{lead} — {item.get('label', '')}" if lead not in (None, "") else str(item.get("label", "")))
            return
        if node_type == "callout":
            flush()
            title = (node.get("attrs") or {}).get("title")
            if title:
                lines.append(str(title))
        block_level = node_type in {
            "paragraph", "heading", "listItem", "blockquote", "codeBlock",
            "bulletList", "orderedList", "doc", "callout",
        }
        for child in node.get("content") or []:
            visit(child)
        if block_level:
            flush()

    visit(content_json or {})
    flush()
    return "\n\n".join(line for line in lines if line)


def serialize_writeup(row: Writeup, *, include_content: bool = True) -> dict:
    data: dict[str, Any] = {
        "id": row.id,
        "investigation_id": row.investigation_id,
        "title": row.title,
        "status": row.status,
        "cited_record_refs": row.cited_record_refs or [],
        "source_ai_candidate_id": row.source_ai_candidate_id,
        "created_by": row.created_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "word_count": len((row.content_text or "").split()),
    }
    if include_content:
        data["content_json"] = row.content_json or EMPTY_DOC
    else:
        data["preview"] = (row.content_text or "")[:280]
    return data


def create_writeup(db: Session, *, investigation_id: str, title: str, content_json: dict | None = None,
                    status: str = "draft", source_ai_candidate_id: str | None = None, created_by: str | None = None) -> Writeup:
    if status not in WRITEUP_STATUSES:
        raise ValueError(f"status must be one of {sorted(WRITEUP_STATUSES)}")
    doc = content_json or EMPTY_DOC
    row = Writeup(
        investigation_id=investigation_id, title=title.strip() or "Untitled write-up",
        content_json=doc, content_text=extract_plain_text(doc), cited_record_refs=extract_cited_refs(doc),
        status=status, source_ai_candidate_id=source_ai_candidate_id, created_by=created_by,
        created_at=utcnow_naive(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_writeup(db: Session, row: Writeup, data: dict) -> Writeup:
    if "status" in data and data["status"] is not None and data["status"] not in WRITEUP_STATUSES:
        raise ValueError(f"status must be one of {sorted(WRITEUP_STATUSES)}")
    if "title" in data and data["title"] is not None:
        row.title = data["title"].strip() or row.title
    if "content_json" in data and data["content_json"] is not None:
        row.content_json = data["content_json"]
        row.content_text = extract_plain_text(row.content_json)
        row.cited_record_refs = extract_cited_refs(row.content_json)
    if "status" in data and data["status"] is not None:
        row.status = data["status"]
    db.commit()
    db.refresh(row)
    return row


def list_writeups(db: Session, investigation_id: str, *, status: str | None = None) -> list[Writeup]:
    if status is not None and status not in WRITEUP_STATUSES:
        raise ValueError(f"status must be one of {sorted(WRITEUP_STATUSES)}")
    query = select(Writeup).where(Writeup.investigation_id == investigation_id)
    if status is not None:
        query = query.where(Writeup.status == status)
    return list(db.scalars(query.order_by(Writeup.updated_at.desc())).all())


def delete_writeup(db: Session, row: Writeup) -> None:
    db.delete(row)
    db.commit()


# --- .docx export -----------------------------------------------------------
#
# Editorial layout in the app's Dark Academia palette (frontend/app/globals.css),
# kept light for print: Georgia text, brass accents, the takeaway and open
# questions set as shaded callouts, figure/timeline/bar blocks as tables (a
# bar block draws its bars from block characters, so it needs no image
# library), numbered superscript citation markers, and a Sources section that
# names each record instead of printing its UUID.

DOCX_BRASS = "8A6420"
DOCX_OXBLOOD = "672C1A"
DOCX_INK = "1F1B16"
DOCX_TAUPE = "7A6950"
DOCX_PANEL = "F1EADC"
DOCX_RULE = "D9CDB6"
DOCX_SERIF = "Georgia"
DOCX_SANS = "Calibri"


def _docx_rgb(hex_color: str) -> Any:
    from docx.shared import RGBColor
    return RGBColor.from_string(hex_color)


def _set_run(run: Any, *, size: float | None = None, color: str | None = None, bold: bool | None = None, italic: bool | None = None, font: str | None = None, superscript: bool | None = None, caps: bool | None = None, spacing: int | None = None) -> Any:
    from docx.oxml.ns import qn
    from docx.shared import Pt
    if font:
        run.font.name = font
        rpr = run._element.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is None:
            fonts = rpr.makeelement(qn("w:rFonts"), {})
            rpr.append(fonts)
        for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            fonts.set(qn(attr), font)
    if size:
        run.font.size = Pt(size)
    if color:
        run.font.color.rgb = _docx_rgb(color)
    if bold is not None:
        run.font.bold = bold
    if italic is not None:
        run.font.italic = italic
    if superscript:
        run.font.superscript = True
    if caps:
        run.font.small_caps = True
    if spacing is not None:
        rpr = run._element.get_or_add_rPr()
        el = rpr.makeelement(qn("w:spacing"), {qn("w:val"): str(spacing)})
        rpr.append(el)
    return run


def _shade_cell(cell: Any, fill: str, *, left_border: str | None = None) -> None:
    from docx.oxml.ns import qn
    tcPr = cell._element.get_or_add_tcPr()
    shd = tcPr.makeelement(qn("w:shd"), {qn("w:val"): "clear", qn("w:color"): "auto", qn("w:fill"): fill})
    tcPr.append(shd)
    borders = tcPr.makeelement(qn("w:tcBorders"), {})
    for side in ("top", "left", "bottom", "right"):
        if side == "left" and left_border:
            el = borders.makeelement(qn(f"w:{side}"), {qn("w:val"): "single", qn("w:sz"): "24", qn("w:color"): left_border, qn("w:space"): "0"})
        else:
            el = borders.makeelement(qn(f"w:{side}"), {qn("w:val"): "nil"})
        borders.append(el)
    tcPr.append(borders)
    margins = tcPr.makeelement(qn("w:tcMar"), {})
    for side, width in (("top", 140), ("bottom", 140), ("left", 220), ("right", 220)):
        margins.append(margins.makeelement(qn(f"w:{side}"), {qn("w:w"): str(width), qn("w:type"): "dxa"}))
    tcPr.append(margins)


def _bottom_rule(paragraph: Any, color: str = DOCX_BRASS, size: int = 12) -> None:
    from docx.oxml.ns import qn
    pPr = paragraph._p.get_or_add_pPr()
    pbdr = pPr.makeelement(qn("w:pBdr"), {})
    pbdr.append(pbdr.makeelement(qn("w:bottom"), {qn("w:val"): "single", qn("w:sz"): str(size), qn("w:space"): "6", qn("w:color"): color}))
    pPr.append(pbdr)


def _no_table_borders(table: Any) -> None:
    from docx.oxml.ns import qn
    tblPr = table._tbl.tblPr
    borders = tblPr.makeelement(qn("w:tblBorders"), {})
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        borders.append(borders.makeelement(qn(f"w:{side}"), {qn("w:val"): "nil"}))
    tblPr.append(borders)


def _row_rules(table: Any, color: str = DOCX_RULE) -> None:
    from docx.oxml.ns import qn
    tblPr = table._tbl.tblPr
    borders = tblPr.makeelement(qn("w:tblBorders"), {})
    for side in ("top", "left", "bottom", "right", "insideV"):
        borders.append(borders.makeelement(qn(f"w:{side}"), {qn("w:val"): "nil"}))
    borders.append(borders.makeelement(qn("w:insideH"), {qn("w:val"): "single", qn("w:sz"): "4", qn("w:color"): color}))
    tblPr.append(borders)


def _para(container: Any, *, space_before: float = 0, space_after: float = 6, line: float = 1.25, keep_next: bool = False) -> Any:
    from docx.shared import Pt
    p = container.add_paragraph()
    fmt = p.paragraph_format
    fmt.space_before = Pt(space_before)
    fmt.space_after = Pt(space_after)
    fmt.line_spacing = line
    if keep_next:
        fmt.keep_with_next = True
    return p


def _cite_key(record_type: Any, record_id: Any) -> tuple[Any, Any]:
    return ("task" if record_type == "reporting_task" else record_type, record_id)


def _render_inline(paragraph: Any, node: dict, citation_index: dict[tuple[str, str], int], *, size: float = 11, color: str = DOCX_INK, font: str = DOCX_SERIF, italic: bool | None = None) -> None:
    node_type = node.get("type")
    if node_type == "text":
        marks = {m.get("type") for m in (node.get("marks") or [])}
        run = paragraph.add_run(node.get("text") or "")
        _set_run(run, size=size, color=color, font=font, bold="bold" in marks or None,
                 italic=True if ("italic" in marks or italic) else None)
        if "strike" in marks:
            run.font.strike = True
        return
    if node_type == "hardBreak":
        paragraph.add_run().add_break()
        return
    if node_type == "citation":
        attrs = node.get("attrs") or {}
        key = _cite_key(attrs.get("recordType"), attrs.get("recordId"))
        n = citation_index.setdefault(key, len(citation_index) + 1)
        _set_run(paragraph.add_run(f"[{n}]"), size=max(8, size - 3), color=DOCX_BRASS, font=DOCX_SANS, superscript=True)
        return
    for child in node.get("content") or []:
        _render_inline(paragraph, child, citation_index, size=size, color=color, font=font, italic=italic)


def _refs_marker(refs: Any, citation_index: dict[tuple[str, str], int]) -> str:
    nums = []
    for ref in refs or []:
        if isinstance(ref, dict) and ref.get("record_type") and ref.get("record_id"):
            key = _cite_key(ref["record_type"], ref["record_id"])
            nums.append(citation_index.setdefault(key, len(citation_index) + 1))
    return " ".join(f"[{n}]" for n in sorted(set(nums)))


def _format_bar_value(value: float, unit: str) -> str:
    prefix = {"USD": "$", "US$": "$", "$": "$", "EUR": "€", "€": "€", "GBP": "£", "£": "£"}.get(unit.upper() if unit else "", "")
    suffix = "" if prefix or not unit else f" {unit}"
    if abs(value) >= 1_000_000:
        text = f"{value / 1_000_000:,.1f}M"
    elif abs(value) >= 1_000:
        text = f"{value / 1_000:,.0f}K"
    else:
        text = f"{value:,.0f}" if float(value).is_integer() else f"{value:,.2f}"
    return f"{prefix}{text}{suffix}"


def _set_widths(table: Any, widths_in: list[float]) -> None:
    from docx.shared import Inches
    table.autofit = False
    for column, width in zip(table.columns, widths_in):
        column.width = Inches(width)
        for cell in column.cells:
            cell.width = Inches(width)


def _render_visual(docx: Any, visual: dict, citation_index: dict[tuple[str, str], int]) -> None:
    from docx.shared import Inches
    from app.services.decks import display_date

    kind = visual.get("type")
    items = visual.get("items") or []
    if not items:
        return
    if kind == "figures":
        table = docx.add_table(rows=1, cols=len(items))
        _set_widths(table, [6.5 / len(items)] * len(items))
        _no_table_borders(table)
        for cell, item in zip(table.rows[0].cells, items):
            _shade_cell(cell, DOCX_PANEL, left_border=DOCX_OXBLOOD)
            p = cell.paragraphs[0]
            _set_run(p.add_run(item.get("value") or ""), size=22, color=DOCX_OXBLOOD, font=DOCX_SERIF)
            q = cell.add_paragraph()
            _set_run(q.add_run(item.get("label") or ""), size=9.5, color=DOCX_INK, font=DOCX_SANS)
            marker = _refs_marker(item.get("evidence"), citation_index)
            if marker:
                _set_run(q.add_run(" " + marker), size=8, color=DOCX_BRASS, font=DOCX_SANS, superscript=True)
    elif kind == "timeline":
        table = docx.add_table(rows=0, cols=2)
        _row_rules(table)
        for item in items:
            row = table.add_row().cells
            _set_run(row[0].paragraphs[0].add_run(display_date(item.get("date") or "")), size=10, color=DOCX_BRASS, font=DOCX_SANS, bold=True)
            p = row[1].paragraphs[0]
            _set_run(p.add_run(item.get("label") or ""), size=10.5, color=DOCX_INK, font=DOCX_SERIF)
            marker = _refs_marker(item.get("evidence"), citation_index)
            if marker:
                _set_run(p.add_run(" " + marker), size=8, color=DOCX_BRASS, font=DOCX_SANS, superscript=True)
        _set_widths(table, [1.3, 5.2])
    elif kind == "bar":
        if visual.get("title"):
            p = _para(docx, space_before=6, space_after=2, keep_next=True)
            _set_run(p.add_run(visual["title"]), size=9.5, color=DOCX_TAUPE, font=DOCX_SANS, bold=True)
        top = max(abs(i.get("value") or 0) for i in items) or 1
        table = docx.add_table(rows=0, cols=3)
        _row_rules(table)
        for item in items:
            row = table.add_row().cells
            p = row[0].paragraphs[0]
            _set_run(p.add_run(item.get("label") or ""), size=10, color=DOCX_INK, font=DOCX_SANS)
            marker = _refs_marker(item.get("evidence"), citation_index)
            if marker:
                _set_run(p.add_run(" " + marker), size=8, color=DOCX_BRASS, font=DOCX_SANS, superscript=True)
            blocks = max(1, round(22 * abs(item.get("value") or 0) / top))
            _set_run(row[1].paragraphs[0].add_run("█" * blocks), size=9, color="B98D34", font=DOCX_SANS)
            _set_run(row[2].paragraphs[0].add_run(_format_bar_value(item.get("value") or 0, visual.get("unit") or "")), size=10, color=DOCX_INK, font=DOCX_SANS, bold=True)
        _set_widths(table, [2.2, 3.3, 1.0])
    _para(docx, space_after=4)


def _render_callout(docx: Any, node: dict, citation_index: dict[tuple[str, str], int]) -> None:
    attrs = node.get("attrs") or {}
    tone = attrs.get("tone")
    accent = DOCX_OXBLOOD if tone == "questions" else DOCX_BRASS
    table = docx.add_table(rows=1, cols=1)
    _no_table_borders(table)
    cell = table.rows[0].cells[0]
    _shade_cell(cell, DOCX_PANEL, left_border=accent)
    first = cell.paragraphs[0]
    _set_run(first.add_run((attrs.get("title") or "").upper()), size=8.5, color=accent, font=DOCX_SANS, bold=True, spacing=30)
    for child in node.get("content") or []:
        if child.get("type") in {"bulletList", "orderedList"}:
            for n, item in enumerate(child.get("content") or [], start=1):
                p = cell.add_paragraph()
                p.paragraph_format.space_before = docx_pt(3)
                _set_run(p.add_run(f"{n:02d}   "), size=10.5, color=accent, font=DOCX_SERIF)
                for block in item.get("content") or []:
                    for inline in block.get("content") or []:
                        _render_inline(p, inline, citation_index, size=10.5)
        else:
            p = cell.add_paragraph()
            p.paragraph_format.space_before = docx_pt(4)
            p.paragraph_format.line_spacing = 1.25
            for inline in child.get("content") or []:
                _render_inline(p, inline, citation_index, size=13 if tone == "takeaway" else 11)
    _para(docx, space_after=4)


def docx_pt(value: float) -> Any:
    from docx.shared import Pt
    return Pt(value)


def render_writeup_docx(row: Writeup, citation_details: list[dict] | None = None) -> Any:
    """Build a python-docx Document from content_json. `citation_details`
    is describe_record_refs()'s output for this write-up's cited refs; the
    Sources section falls back to type + id when a ref has no detail."""
    from docx import Document as DocxDocument
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt
    from app.core.time import utcnow_naive as _now

    content_json = row.content_json or EMPTY_DOC
    details = {(_cite_key(d["record_type"], d["record_id"])): d for d in (citation_details or [])}
    docx = DocxDocument()
    for section in docx.sections:
        section.left_margin = section.right_margin = Inches(1.0)
        section.top_margin = section.bottom_margin = Inches(0.9)
    normal = docx.styles["Normal"]
    normal.font.name = DOCX_SERIF
    normal.font.size = Pt(11)
    normal.font.color.rgb = _docx_rgb(DOCX_INK)

    # Masthead.
    p = _para(docx, space_after=2)
    _set_run(p.add_run("INVESTIGATION BRIEF"), size=8.5, color=DOCX_BRASS, font=DOCX_SANS, bold=True, spacing=40)
    p = _para(docx, space_after=4, line=1.05)
    _set_run(p.add_run(row.title), size=24, color=DOCX_INK, font=DOCX_SERIF)
    meta = _para(docx, space_after=14)
    stamp = _now()
    status = (getattr(row, "status", None) or "draft").capitalize()
    cited = len(extract_cited_refs(content_json))
    _set_run(meta.add_run(f"{status}  ·  {cited} cited record{'s' if cited != 1 else ''}  ·  {stamp.day} {stamp.strftime('%B %Y')}"),
             size=9, color=DOCX_TAUPE, font=DOCX_SANS)
    _bottom_rule(meta)

    citation_index: dict[tuple[str, str], int] = {}
    nodes = list(content_json.get("content") or [])
    # A write-up promoted before this layout existed carries its title as a
    # leading H1; the masthead already shows it.
    if nodes and nodes[0].get("type") == "heading" and "".join(c.get("text", "") for c in nodes[0].get("content") or []).strip() == row.title.strip():
        nodes = nodes[1:]

    for node in nodes:
        node_type = node.get("type")
        if node_type == "heading":
            level = min(max(int((node.get("attrs") or {}).get("level", 2)), 1), 4)
            p = _para(docx, space_before=16 if level <= 2 else 10, space_after=4, keep_next=True, line=1.1)
            for child in node.get("content") or []:
                _render_inline(p, child, citation_index, size={1: 20, 2: 15, 3: 13}.get(level, 12))
        elif node_type == "callout":
            _render_callout(docx, node, citation_index)
        elif node_type == "evidenceVisual":
            _render_visual(docx, (node.get("attrs") or {}).get("visual") or {}, citation_index)
        elif node_type in {"bulletList", "orderedList"}:
            style = "List Bullet" if node_type == "bulletList" else "List Number"
            for item in node.get("content") or []:
                p = docx.add_paragraph(style=style)
                p.paragraph_format.space_after = Pt(3)
                for block in item.get("content") or []:
                    for child in block.get("content") or []:
                        _render_inline(p, child, citation_index)
        elif node_type == "blockquote":
            for block in node.get("content") or []:
                p = _para(docx, space_after=6)
                p.paragraph_format.left_indent = Inches(0.4)
                for child in block.get("content") or []:
                    _render_inline(p, child, citation_index, italic=True, color=DOCX_TAUPE)
        else:
            p = _para(docx, space_after=8, line=1.3)
            for child in node.get("content") or []:
                _render_inline(p, child, citation_index)

    if citation_index:
        p = _para(docx, space_before=22, space_after=6, keep_next=True)
        _set_run(p.add_run("Sources"), size=15, color=DOCX_INK, font=DOCX_SERIF)
        _bottom_rule(p, color=DOCX_RULE, size=6)
        for key, n in sorted(citation_index.items(), key=lambda kv: kv[1]):
            d = details.get(key)
            p = _para(docx, space_after=5, line=1.15)
            p.paragraph_format.left_indent = Inches(0.4)
            p.paragraph_format.first_line_indent = Inches(-0.4)
            _set_run(p.add_run(f"[{n}]\t"), size=9.5, color=DOCX_BRASS, font=DOCX_SANS, bold=True)
            if d:
                _set_run(p.add_run(d["type_label"].upper() + "  "), size=7.5, color=DOCX_TAUPE, font=DOCX_SANS, bold=True, spacing=20)
                _set_run(p.add_run(d.get("label") or key[1]), size=10, color=DOCX_INK, font=DOCX_SANS, bold=True)
                if d.get("source_title") and d.get("source_title") != d.get("label"):
                    _set_run(p.add_run(f" — {d['source_title']}"), size=10, color=DOCX_INK, font=DOCX_SANS)
                if d.get("missing"):
                    _set_run(p.add_run(" (no longer available)"), size=9, color=DOCX_OXBLOOD, font=DOCX_SANS, italic=True)
                if d.get("quote"):
                    p.add_run().add_break()
                    _set_run(p.add_run(f"“{d['quote']}”"), size=9.5, color=DOCX_TAUPE, font=DOCX_SERIF, italic=True)
                if d.get("source_url"):
                    p.add_run().add_break()
                    _set_run(p.add_run(d["source_url"]), size=8.5, color=DOCX_TAUPE, font=DOCX_SANS)
            else:
                _set_run(p.add_run(f"{key[0]}:{key[1]}"), size=10, color=DOCX_INK, font=DOCX_SANS)

    # Footer: title + page number field.
    footer = docx.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    _set_run(footer.add_run(f"{row.title}   ·   "), size=8, color=DOCX_TAUPE, font=DOCX_SANS)
    run = footer.add_run()
    _set_run(run, size=8, color=DOCX_TAUPE, font=DOCX_SANS)
    for tag, attrs in (("w:fldChar", {qn("w:fldCharType"): "begin"}), ("w:instrText", {}), ("w:fldChar", {qn("w:fldCharType"): "end"})):
        el = run._element.makeelement(qn(tag), attrs)
        if tag == "w:instrText":
            el.set(qn("xml:space"), "preserve")
            el.text = " PAGE "
        run._element.append(el)
    return docx
