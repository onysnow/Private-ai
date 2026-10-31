"""What a podcast's publisher says about an episode (mockup INTAKE_4): its own transcript and its chapters ("Parts ·
from the feed"), fetched with the episode through Following (ADR-0022) and kept on the episode's source as they came,
with their SHA-256. The publisher's transcript is compared with the one made on this computer, part by part; neither is
right by default, and the words that differ are marked so a person listens.
"""

from __future__ import annotations

import difflib
import hashlib
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.time import utcnow_naive
from app.models.domain import Document, Source

MAX_BYTES = 2 * 1024 * 1024
_TIME = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")


def _seconds(text: str) -> float | None:
    m = _TIME.search(text)
    if not m:
        return None
    h, mi, s, frac = m.groups()
    return int(h or 0) * 3600 + int(mi) * 60 + int(s) + int(frac.ljust(3, "0")[:3]) / 1000


def parse_cues(body: bytes, kind: str | None) -> list[dict[str, Any]]:
    """[{start, end, text, speaker}] from WebVTT, SRT or the Podcasting 2.0 JSON transcript. ValueError otherwise."""
    text = body.decode("utf-8", errors="replace").lstrip("﻿")
    if (kind or "").endswith("json") or text.lstrip().startswith("{"):
        data = json.loads(text)
        return [{"start": float(s.get("startTime", 0)), "end": float(s.get("endTime", s.get("startTime", 0))),
                 "text": str(s.get("body", "")).strip(), "speaker": s.get("speaker")}
                for s in data.get("segments", []) if str(s.get("body", "")).strip()]
    cues: list[dict[str, Any]] = []
    for block in re.split(r"\r?\n\s*\r?\n", text):
        lines = [ln.strip() for ln in block.strip().splitlines() if ln.strip()]
        timing = next((i for i, ln in enumerate(lines) if "-->" in ln), None)
        if timing is None:
            continue
        left, right = lines[timing].split("-->", 1)
        start, end = _seconds(left), _seconds(right)
        if start is None or end is None:
            continue
        words = " ".join(lines[timing + 1:])
        speaker = None
        voice = re.match(r"<v\s+([^>]+)>", words)
        if voice:
            speaker = voice.group(1).strip()
        words = re.sub(r"<[^>]+>", "", words).strip()
        if words:
            cues.append({"start": start, "end": end, "text": words, "speaker": speaker})
    if not cues:
        raise ValueError("not a transcript the app can read (WebVTT, SRT or JSON)")
    return cues


def parse_chapters(body: bytes) -> list[dict[str, Any]]:
    """[{start, title}] from a Podcasting 2.0 chapters file (JSON)."""
    data = json.loads(body.decode("utf-8", errors="replace"))
    out = [{"start": float(c.get("startTime", 0)), "title": str(c.get("title", "")).strip()}
           for c in data.get("chapters", []) if str(c.get("title", "")).strip()]
    return sorted(out, key=lambda c: c["start"])


def keep(db: Session, source: Source, key: str, *, url: str, kind: str | None, body: bytes | None,
         error: str | None = None) -> None:
    """Keep the publisher's transcript or chapters on the episode's source, as they came, with their SHA-256."""
    entry: dict[str, Any] = {"url": url, "type": kind, "fetched_at": utcnow_naive().isoformat()}
    if body is not None:
        entry.update({"sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
        try:
            if key == "publisher_transcript":
                entry["cues"] = parse_cues(body, kind)
            else:
                entry["chapters"] = parse_chapters(body)
        except (ValueError, json.JSONDecodeError):
            entry["error"] = "not a file the app can read"
    if error:
        entry["error"] = error
    source.metadata_json = {**(source.metadata_json or {}), key: entry}


def extras(db: Session, document: Document) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """(the publisher's transcript as kept, or None; the parts from the feed)."""
    source = db.get(Source, document.source_id)
    meta = (source.metadata_json or {}) if source is not None else {}
    publisher = meta.get("publisher_transcript")
    chapters = (meta.get("chapters") or {}).get("chapters") or []
    return publisher, chapters


def _norm(word: str) -> str:
    return re.sub(r"[^\w%]+", "", word.lower())


def _marked(words: list[str], same: set[int]) -> list[dict[str, Any]]:
    return [{"w": w, "differs": i not in same} for i, w in enumerate(words)]


def compare(segments: list[dict[str, Any]], cues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Each of our segments beside the publisher's words for the same stretch of time. A cue belongs to the segment
    its middle falls in. Words that differ (after case and punctuation) are marked on both sides."""
    rows: list[dict[str, Any]] = []
    taken: set[int] = set()
    for seg in segments:
        theirs_cues = [i for i, c in enumerate(cues) if i not in taken and seg["start"] <= (c["start"] + c["end"]) / 2 < seg["end"]]
        taken.update(theirs_cues)
        ours = seg["text"].split() if seg["kind"] == "speech" else []
        theirs = " ".join(cues[i]["text"] for i in theirs_cues).split()
        a, b = [_norm(w) for w in ours], [_norm(w) for w in theirs]
        same_a: set[int] = set()
        same_b: set[int] = set()
        for block in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
            same_a.update(range(block.a, block.a + block.size))
            same_b.update(range(block.b, block.b + block.size))
        rows.append({"segment_id": seg["id"], "start": seg["start"], "end": seg["end"], "kind": seg["kind"],
                     "speaker": seg.get("speaker"), "ours": _marked(ours, same_a), "theirs": _marked(theirs, same_b),
                     "no_speech_text": seg["text"] if seg["kind"] == "no_speech" else None,
                     "differs": sum(1 for i in range(len(a)) if i not in same_a) + sum(1 for i in range(len(b)) if i not in same_b)})
    return rows
