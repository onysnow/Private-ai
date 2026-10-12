"""One page of a stored document as a picture, with a passage marked on it (Case
home's Next up: the page beside the question, mockup HOME_1).

A PDF page is drawn at the width asked for and the passage's words are filled in
the highlight colour where they are found on the page; a picture document is sent
as it is. The stored path must lie inside the document storage."""

from __future__ import annotations

from pathlib import Path

PAGE_MIN_WIDTH, PAGE_MAX_WIDTH = 120, 1600
HIGHLIGHT = (1.0, 0.83, 0.25)  # amber, drawn under the words at 45%


class NoPage(ValueError):
    pass


def _contained(storage_path: str, storage_root: Path) -> Path:
    root, path = storage_root.resolve(), Path(storage_path).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise OSError("the stored file lies outside the document storage") from exc
    if not path.is_file():
        raise OSError("the stored file is not available")
    return path


def _phrases(highlight: str) -> list[str]:
    """What to look for: the passage itself, then its lines, then runs of six
    words, so a passage that wraps or is hyphenated on the page is still found."""
    text = " ".join(highlight.split())
    if not text:
        return []
    words = text.split(" ")
    runs = [" ".join(words[i:i + 6]) for i in range(0, len(words), 6)] if len(words) > 6 else []
    return [text, *runs]


def page_png(storage_path: str, storage_root: Path, page: int, *, width: int = 360, highlight: str = "") -> tuple[bytes, int, bool]:
    """The page drawn as PNG, the document's page count, and whether the passage was found."""
    import fitz

    path = _contained(storage_path, storage_root)
    if path.suffix.lower() != ".pdf":
        raise NoPage("Only a PDF has pages to draw")
    width = max(PAGE_MIN_WIDTH, min(PAGE_MAX_WIDTH, width))
    with fitz.open(path) as doc:
        if not 1 <= page <= doc.page_count:
            raise NoPage(f"The document has {doc.page_count} page{'s' if doc.page_count != 1 else ''}")
        p = doc[page - 1]
        found = False
        for phrase in _phrases(highlight):
            rects = p.search_for(phrase)
            for r in rects:
                annot = p.add_highlight_annot(r)
                annot.set_colors(stroke=HIGHLIGHT)
                annot.set_opacity(0.45)
                annot.update()
            if rects:
                found = True
                if phrase == _phrases(highlight)[0]:
                    break
        zoom = width / p.rect.width
        pix = p.get_pixmap(matrix=fitz.Matrix(zoom, zoom), annots=True, alpha=False)
        return pix.tobytes("png"), doc.page_count, found
