"""Reading an HTML page as text (the Workbench's own reader; OpenAleph's
ingest-file reads HTML itself). Uses only the standard library's parser.

The page's words, not its markup: scripts, styles, forms, navigation, headers
and footers are left out, and when the page marks its main content (``<main>``,
``<article>`` or ``role="main"``) only that is read. Each block of text
(a heading, a paragraph, a list item, a table row) becomes one chunk, located
as "paragraph N" in reading order, so a quote can be found again."""

from __future__ import annotations

import re
from html.parser import HTMLParser

SKIP = {"script", "style", "noscript", "template", "svg", "head", "nav", "header", "footer", "form", "button", "select", "iframe", "aside"}
BLOCK = {"p", "div", "section", "article", "main", "li", "ul", "ol", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote",
         "pre", "dd", "dt", "figcaption", "br", "hr", "td", "th"}
VOID = {"br", "hr", "img", "meta", "link", "input", "source", "wbr", "area", "base", "col", "embed", "param", "track"}


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.main_depth = 0  # >0 while inside the page's main content
        self.saw_main = False
        self.blocks: list[tuple[bool, str]] = []  # (inside main, text)
        self.buf: list[str] = []
        self.stack: list[tuple[str, bool]] = []  # (tag, opened main)

    def _flush(self) -> None:
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        if text:
            self.blocks.append((self.main_depth > 0, text))
        self.buf = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in VOID:
            if tag in BLOCK and not self.skip:
                self._flush()
            return
        is_main = tag in ("main", "article") or dict(attrs).get("role") == "main"
        if is_main:
            self.saw_main = True
        self.stack.append((tag, is_main))
        if tag in SKIP:
            self.skip += 1
        elif tag in BLOCK and not self.skip:
            self._flush()
        if is_main:
            self.main_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID:
            return
        while self.stack:
            open_tag, was_main = self.stack.pop()
            if open_tag in SKIP:
                self.skip = max(0, self.skip - 1)
            elif open_tag in BLOCK and not self.skip:
                self._flush()
            if was_main:
                self._flush()
                self.main_depth = max(0, self.main_depth - 1)
            if open_tag == tag:
                break

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.buf.append(data)


def html_blocks(markup: str) -> list[str]:
    """The page's text blocks in reading order (main content only when marked)."""
    parser = _Text()
    parser.feed(markup)
    parser.close()
    parser._flush()
    if parser.saw_main and any(inside for inside, _ in parser.blocks):
        return [t for inside, t in parser.blocks if inside]
    return [t for _, t in parser.blocks]
