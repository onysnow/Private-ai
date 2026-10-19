"""What a captured page says about itself, and the archive file of the exchange (ADR-0016).

`page_facts` reads what the page DISPLAYS: its title, author line and date. These are labelled "as displayed, not
verified" wherever they are shown: a page can show any author or date it likes.

`warc_bytes` writes the request and the answer as a WARC 1.1 file (warcio, Apache-2.0), the format web archives use,
so the capture can be opened by other tools. It holds the HTTP exchange this program made, not what a browser
rendered (that is rendered.html and the screenshot).
"""

from __future__ import annotations

import io
import json
import re
from datetime import datetime
from html.parser import HTMLParser

from warcio.statusandheaders import StatusAndHeaders
from warcio.warcwriter import WARCWriter

from app.services.capture_net import Fetched, request_line
from app.services.html_reader import html_blocks

_CHARSET = re.compile(r"charset\s*=\s*['\"]?([A-Za-z0-9_\-]+)", re.I)
_META_CHARSET = re.compile(rb"<meta[^>]+charset\s*=\s*['\"]?([A-Za-z0-9_\-]+)", re.I)


def decode(body: bytes, content_type: str | None) -> str:
    charset = None
    if content_type and (header := _CHARSET.search(content_type)):
        charset = header.group(1)
    elif meta := _META_CHARSET.search(body[:4096]):
        charset = meta.group(1).decode("ascii", "ignore")
    for name in (charset, "utf-8"):
        if not name:
            continue
        try:
            return body.decode(name)
        except (LookupError, UnicodeDecodeError):
            continue
    return body.decode("utf-8", "replace")


class _Facts(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._in_ld = False
        self._ld = ""
        self.meta: dict[str, str] = {}
        self.time: str | None = None
        self.ld: list[object] = []
        self.has_password = False
        self.lang: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html" and a.get("lang"):
            self.lang = a["lang"]
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "time" and a.get("datetime") and self.time is None:
            self.time = a["datetime"].strip()
        elif tag == "input" and a.get("type", "").lower() == "password":
            self.has_password = True
        elif tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self._in_ld, self._ld = True, ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            try:
                self.ld.append(json.loads(self._ld))
            except ValueError:
                pass

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif self._in_ld:
            self._ld += data


def _ld_items(node: object) -> list[dict]:
    if isinstance(node, list):
        return [item for sub in node for item in _ld_items(sub)]
    if isinstance(node, dict):
        return [node] + _ld_items(node.get("@graph", []))
    return []


def _names(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return _names(value.get("name", ""))
    if isinstance(value, list):
        return [n for v in value for n in _names(v)]
    return []


def page_facts(markup: str) -> dict:
    """{title, byline, published, language, description, asks_for_password}; a missing one is None."""
    parser = _Facts()
    try:
        parser.feed(markup)
        parser.close()
    except Exception:  # a page that breaks the parser still has its text
        pass
    byline = published = headline = None
    for item in _ld_items(parser.ld):
        kind = item.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if not any(isinstance(k, str) and k.endswith(("Article", "Posting", "Report")) for k in kinds):
            continue
        byline = byline or ", ".join(_names(item.get("author"))) or None
        published = published or item.get("datePublished")
        headline = headline or item.get("headline")
    meta = parser.meta
    return {
        "title": (meta.get("og:title") or headline or " ".join(parser.title.split()) or None),
        "byline": byline or meta.get("author") or meta.get("article:author") or None,
        "published": published or meta.get("article:published_time") or meta.get("date") or parser.time,
        "language": parser.lang,
        "description": meta.get("og:description") or meta.get("description"),
        "asks_for_password": parser.has_password,
    }


def working_text(markup: str) -> str:
    """The page's text in reading order, one block per paragraph: the working copy that is hashed apart from the page."""
    return "\n\n".join(html_blocks(markup))


def warc_bytes(fetched: Fetched, *, started: datetime, software: str) -> bytes:
    """The request and the answer as WARC records (warcinfo, request, response)."""
    out = io.BytesIO()
    writer = WARCWriter(out, gzip=False)
    when = started.strftime("%Y-%m-%dT%H:%M:%SZ")
    writer.write_record(writer.create_warcinfo_record("capture.warc", {"software": software, "format": "WARC File Format 1.1"}))
    request_headers = StatusAndHeaders(request_line(fetched.final_url), fetched.request_headers, is_http_request=True)
    writer.write_record(writer.create_warc_record(fetched.final_url, "request", http_headers=request_headers,
                                                  warc_headers_dict={"WARC-Date": when}))
    status = f"{fetched.status} {fetched.reason}".strip()
    response_headers = StatusAndHeaders(status, fetched.response_headers, protocol=fetched.http_version)
    writer.write_record(writer.create_warc_record(fetched.final_url, "response", payload=io.BytesIO(fetched.body),
                                                  http_headers=response_headers, warc_headers_dict={"WARC-Date": when}))
    return out.getvalue()
