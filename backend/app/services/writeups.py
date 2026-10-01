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
    for node in _walk(content_json or {}):
        if node.get("type") != "citation":
            continue
        attrs = node.get("attrs") or {}
        record_type, record_id = attrs.get("recordType"), attrs.get("recordId")
        if not record_type or not record_id:
            continue
        key = (record_type, record_id)
        if key not in seen:
            seen.add(key)
            refs.append({"record_type": record_type, "record_id": record_id})
    return refs


def extract_plain_text(content_json: dict) -> str:
    """A readable plain-text rendering: paragraph/heading text joined by
    blank lines, list items by newlines, citation nodes rendered as their
    label in brackets. Good enough for search indexing and as a fallback
    preview -- not a full ProseMirror-to-text serializer."""
    lines: list[str] = []
    current: list[str] = []

    def flush():
        if current:
            lines.append("".join(current).strip())
            current.clear()

    def visit(node: dict):
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
        block_level = node_type in {
            "paragraph", "heading", "listItem", "blockquote", "codeBlock",
            "bulletList", "orderedList", "doc",
        }
        for child in node.get("content") or []:
            visit(child)
        if block_level:
            flush()

    visit(content_json or {})
    flush()
    return "\n\n".join(line for line in lines if line)


def serialize_writeup(row: Writeup, *, include_content: bool = True) -> dict:
    data = {
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

def _render_inline(paragraph, node: dict, citation_index: dict[tuple[str, str], int]) -> None:
    node_type = node.get("type")
    if node_type == "text":
        marks = {m.get("type") for m in (node.get("marks") or [])}
        run = paragraph.add_run(node.get("text") or "")
        run.bold = "bold" in marks
        run.italic = "italic" in marks
        if "strike" in marks:
            run.font.strike = True
        return
    if node_type == "hardBreak":
        paragraph.add_run().add_break()
        return
    if node_type == "citation":
        attrs = node.get("attrs") or {}
        key = (attrs.get("recordType"), attrs.get("recordId"))
        n = citation_index.setdefault(key, len(citation_index) + 1)
        run = paragraph.add_run(f" [{n}]")
        run.font.superscript = True
        return
    for child in node.get("content") or []:
        _render_inline(paragraph, child, citation_index)


def render_writeup_docx(row: Writeup):
    """Build a python-docx Document from content_json. Citation nodes become
    numbered superscript markers with a References section listing the full
    record_type/record_id at the end -- the simplest footnote-equivalent that
    doesn't require python-docx's limited native footnote support."""
    from docx import Document as DocxDocument

    doc = content_json = row.content_json or EMPTY_DOC
    docx = DocxDocument()
    docx.add_heading(row.title, level=0)
    citation_index: dict[tuple[str, str], int] = {}

    for node in content_json.get("content") or []:
        node_type = node.get("type")
        if node_type == "heading":
            level = min(max(int((node.get("attrs") or {}).get("level", 1)), 1), 4)
            p = docx.add_heading("", level=level)
        elif node_type == "bulletList":
            for item in node.get("content") or []:
                p = docx.add_paragraph(style="List Bullet")
                for block in item.get("content") or []:
                    for child in block.get("content") or []:
                        _render_inline(p, child, citation_index)
            continue
        elif node_type == "orderedList":
            for item in node.get("content") or []:
                p = docx.add_paragraph(style="List Number")
                for block in item.get("content") or []:
                    for child in block.get("content") or []:
                        _render_inline(p, child, citation_index)
            continue
        elif node_type == "blockquote":
            for block in node.get("content") or []:
                p = docx.add_paragraph(style="Intense Quote")
                for child in block.get("content") or []:
                    _render_inline(p, child, citation_index)
            continue
        else:
            p = docx.add_paragraph()
        for child in node.get("content") or []:
            _render_inline(p, child, citation_index)

    if citation_index:
        docx.add_page_break()
        docx.add_heading("References", level=1)
        for (record_type, record_id), n in sorted(citation_index.items(), key=lambda kv: kv[1]):
            docx.add_paragraph(f"[{n}] {record_type}:{record_id}", style="List Number")

    return docx
