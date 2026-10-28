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


def page_png(storage_path: str, storage_root: Path, page: int, *, width: int = 360, highlight: str = "",
             crop: bool = False) -> tuple[bytes, int, bool]:
    """The page drawn as PNG, the document's page count, and whether the passage was found. With `crop`, and the
    passage found, only a band of the page around it is drawn (The Wire's link panel: the words lit in their place)."""
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
        lit = None
        for phrase in _phrases(highlight):
            rects = p.search_for(phrase)
            for r in rects:
                lit = r if lit is None else lit | r
                annot = p.add_highlight_annot(r)
                annot.set_colors(stroke=HIGHLIGHT)
                annot.set_opacity(0.45)
                annot.update()
            if rects:
                found = True
                if phrase == _phrases(highlight)[0]:
                    break
        clip = None
        if crop and lit is not None:
            # A window on the words: at least half the page wide, centred on them, kept on the page; drawn at `width`.
            w = min(p.rect.width, max(lit.width + 80, p.rect.width / 2))
            x0 = min(max(p.rect.x0, (lit.x0 + lit.x1) / 2 - w / 2), p.rect.x1 - w)
            clip = fitz.Rect(x0, max(p.rect.y0, lit.y0 - 50), x0 + w, min(p.rect.y1, lit.y1 + 50))
        zoom = width / (clip.width if clip else p.rect.width)
        pix = p.get_pixmap(matrix=fitz.Matrix(zoom, zoom), annots=True, alpha=False, clip=clip)
        return pix.tobytes("png"), doc.page_count, found
