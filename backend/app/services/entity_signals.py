"""What the Workbench's own pattern finder knows about a name and a passage,
and how sure that lets it be (design doc "Document Ingestion & Review System
Design", Phase 3: "Compute confidence from real signals, not a flat number").

The finder (app/services/documents.py) proposes runs of capitalised words as
names and every chunk as a passage of evidence. It used to give every name
the same 0.40 and every passage 1.0. The number now follows what the text
actually shows, in the three bands the design doc takes from comparable
document-review systems (AWS's human-review reference architecture; the
document-AI review practice it cites):

- high (0.85 and up): the text says what the name is -- a corporate suffix
  ("Ltd", "GmbH", "LLC"), another organisational word ("Foundation",
  "Ministry"), a personal title before it ("Mr", "Dr"), or the investigation
  already holds a record with exactly this name;
- medium (0.5 up to 0.85): proposed and marked, no question asked;
- low (below 0.5): nothing in the text says what kind of entity the name is,
  so accepting waits for the reporter to say (the clarifying question,
  frontend/features/documents/schema-question.tsx), now offering every kind
  the Workbench keeps, not only Person or Organization.

The kinds follow FollowTheMoney: a name with a corporate suffix is a Company
(a registered business; Company is the Organization subtype for those), one
with another organisational word an Organization, one after a personal title
a Person. Each value here is a fixed starting point, recorded with the
signal that set it, so the explanation can say exactly why; none is a
probability that the name is right.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# A registered business's legal form, as it is written after the name.
CORPORATE_SUFFIX = re.compile(
    r"\b(Inc\.?|Incorporated|LLC|L\.L\.C\.|LLP|LP|Ltd\.?|Limited|PLC|plc|Corporation|Corp\.?|Company|Co\.?|GmbH|AG|S\.?A\.?|"
    r"S\.?A\.?R\.?L\.?|B\.?V\.?|N\.?V\.?|Pty\.?|Oy|AB|SpA|S\.p\.A\.)(?=\W|$)")
# Words that make a name an organisation of another kind (public bodies,
# non-profits), capitalised as part of the name. Words that also name places
# ("Union Street", "Court Road", "Office Park") are left out: a wrong label
# here would skip the reporter's question.
ORGANIZATION_WORD = re.compile(
    r"\b(Department|Ministry|Commission|Authority|Agency|Bureau|University|College|Institute|Foundation|Trust|"
    r"Association|Committee|Council|Federation|Bank)\b")
# A personal title directly before the name.
TITLES = r"Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Sir|Dame|Lord|Lady|Judge|Justice|Senator|Rep|Gov|Mayor"
HONORIFIC = re.compile(rf"\b({TITLES})\.?\s+$")
# The capitalised-run pattern takes a title in with the name ("Mr Alaric Voss").
LEADING_TITLE = re.compile(rf"^({TITLES})\.?\s+(?=\S)")


def split_title(caption: str) -> tuple[str, int]:
    """The name without a title the pattern took in, and how many characters
    of the match the title was (so the span can start at the name)."""
    title = LEADING_TITLE.match(caption)
    if title is None or not caption[title.end():].strip():
        return caption, 0
    return caption[title.end():], title.end()

# Every kind a reporter can give a name the text does not explain, the
# extractor's guess first. LegalEntity is "not sure" (FollowTheMoney's
# parent of Person and Organization).
SCHEMA_CHOICES = ["Person", "Organization", "Company", "LegalEntity"]

HIGH = 0.85
UNEXPLAINED = 0.40
EXISTING_RECORD = 0.90
CORPORATE = 0.90


def norm_name(text: str) -> str:
    """A name as compared: lower case, punctuation and spacing folded."""
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


@dataclass
class NameReading:
    schema: str
    confidence: float
    schema_basis: str            # corporate_suffix | organization_word | honorific | existing_record | no_type_signal
    matched: str | None = None   # the suffix, word or title that set it
    choices: list[str] = field(default_factory=list)   # asked when nothing in the text says what the name is
    existing_entity_id: str | None = None

    def rationale(self) -> dict:
        out: dict = {"rule": "capitalized_name_sequence", "schema_basis": self.schema_basis, "confidence": self.confidence}
        if self.matched:
            out["matched"] = self.matched
        if self.existing_entity_id:
            out["existing_entity_id"] = self.existing_entity_id
        # Kept under its earlier name for explanations written before this module.
        if self.schema_basis in ("corporate_suffix", "organization_word"):
            out["matched_suffix"] = self.matched
        return out


def read_name(caption: str, before: str, existing: dict[str, tuple[str, str]] | None = None) -> NameReading:
    """What the text and the investigation say about a proposed name.

    ``before`` is the text just before the name in its chunk (for a title);
    ``existing`` maps a normalised caption to the (entity id, schema) of a
    record the investigation already holds."""
    record = (existing or {}).get(norm_name(caption))
    if record is not None:
        return NameReading(schema=record[1], confidence=EXISTING_RECORD, schema_basis="existing_record", existing_entity_id=record[0])
    corporate = CORPORATE_SUFFIX.search(caption)
    if corporate:
        return NameReading(schema="Company", confidence=CORPORATE, schema_basis="corporate_suffix", matched=corporate.group(1))
    organisation = ORGANIZATION_WORD.search(caption)
    if organisation:
        return NameReading(schema="Organization", confidence=HIGH, schema_basis="organization_word", matched=organisation.group(1))
    title = HONORIFIC.search(before[-24:])
    if title:
        return NameReading(schema="Person", confidence=HIGH, schema_basis="honorific", matched=title.group(1))
    return NameReading(schema="Person", confidence=UNEXPLAINED, schema_basis="no_type_signal", choices=list(SCHEMA_CHOICES))


# --- passages proposed as evidence ----------------------------------------------------

BOILERPLATE = re.compile(
    r"^(page\s+\d+(\s+of\s+\d+)?|\d+\s*(/|of)\s*\d+|\d{1,4}|confidential|strictly confidential|draft|privileged( and confidential)?|"
    r"all rights reserved\.?|copyright\b.*|©.*|(this page (is )?intentionally left blank\.?))$", re.I)
SHORT_WORDS = 4
WHOLE_PASSAGE = 1.0
SHORT_PASSAGE = 0.5
BOILERPLATE_PASSAGE = 0.2


def read_passage(text: str) -> tuple[float, dict]:
    """How much a chunk looks like something worth keeping as evidence: a page
    number, a "Confidential" stamp or a copyright line scores low, a passage
    of a few words medium, anything longer as before."""
    clean = " ".join(text.split())
    if BOILERPLATE.match(clean):
        return BOILERPLATE_PASSAGE, {"rule": "whole_chunk", "signal": "boilerplate"}
    if len(clean.split()) < SHORT_WORDS:
        return SHORT_PASSAGE, {"rule": "whole_chunk", "signal": "short_passage", "words": len(clean.split())}
    return WHOLE_PASSAGE, {"rule": "whole_chunk"}


# --- Cleaning what the capitalised-words pattern takes in -------------------------------------
# Found on the 1MDB case (13,337 name proposals from 9 documents): the pattern ran across
# sentence ends ("United States. As"), "and" ("TAN and Tanore"), line breaks
# ("Red \nGranite Pictures. For") and headings ("Section VI").

ABBREVIATION = re.compile(r"^(?:[A-Z]\.)+$|^(?:Inc|Ltd|Co|Corp|Mr|Mrs|Ms|Dr|St|Jr|Sr|No|Bhd|Pte|Ave|N\.W|S\.A|S\.p\.A)\.$")
EDGE_WORDS = {"and", "of", "the", "&", "as", "for", "that", "despite", "in", "on", "at", "by", "to", "if", "when", "while", "after",
              "before", "during", "from", "with", "under", "pursuant", "hi", "dear", "okay", "ah", "so", "but", "then", "this", "these",
              "those", "his", "her", "its", "their", "our", "a", "an"}
KEEP_LEADING = {"the"}  # "The Park Lane Hotel"
HEADING_WORDS = {"section", "page", "paragraph", "count", "exhibit", "title", "chapter", "part", "article", "schedule", "attachment", "table"}
ROMAN = re.compile(r"^[IVXLC]+$")
# A heading in capitals reads like a sentence: it has a verb or a joining word inside it.
HEADING_INSIDE = {"the", "through", "for", "were", "was", "is", "are", "also", "including", "using", "with", "from", "to", "by", "in", "on",
                  "into", "as", "at", "that", "which"}
NAME_ENDINGS_OK = {"united", "limited", "incorporated", "associated", "unlimited", "consolidated", "holding", "trading", "banking",
                   "family", "italy", "germany", "sicily"}


def _heading_in_capitals(words: list[str]) -> bool:
    if len(words) < 2 or not all(w.isupper() or not any(ch.isalpha() for ch in w) for w in words):
        return False
    lowered = [w.lower().strip(".,:;") for w in words]
    if any(w in HEADING_INSIDE for w in lowered[1:-1]):
        return True
    return any(w.endswith(("ed", "ly", "ing")) and w not in NAME_ENDINGS_OK and len(w) > 4 for w in lowered)


def clean_names(raw: str) -> list[tuple[str, int, int]]:
    """The names in a run of capitalised words, each with where it starts and
    ends in the run (the run's own characters, line breaks and all).
    Cuts at a sentence end, splits at "and", drops function words at either
    edge, collapses line breaks, and drops headings and single words."""
    words = [(m.group(0), m.start()) for m in re.finditer(r"\S+", raw)]
    by_line = raw.count("\n") >= 2  # a column of a table, one cell per line: each line its own name
    parts: list[list[tuple[str, int]]] = [[]]
    for i, (word, at) in enumerate(words):
        if by_line and i and "\n" in raw[words[i - 1][1]:at]:
            parts.append([])
        if word.lower() == "and":
            parts.append([])
            continue
        parts[-1].append((word, at))
        ends_sentence = word.endswith((".", "!", "?", ";", ":")) and not ABBREVIATION.match(word)
        if ends_sentence and i + 1 < len(words):
            parts[-1][-1] = (word.rstrip(".!?;:"), at)
            parts.append([])
        # A legal form ends the name ("Meridian Holdings Ltd. Payments went..."), unless
        # another legal form follows it ("Kestrel Bay Co. Ltd.").
        elif (word.endswith(".") and CORPORATE_SUFFIX.fullmatch(word) and i + 1 < len(words)
              and not CORPORATE_SUFFIX.fullmatch(words[i + 1][0])):
            parts.append([])
    out = []
    for part in parts:
        while part and part[-1][0].lower().strip(".,") in EDGE_WORDS:
            part = part[:-1]
        while part and part[0][0].lower() in EDGE_WORDS and part[0][0].lower() not in KEEP_LEADING:
            part = part[1:]
        if len(part) < 2 or part[0][0].lower() == "the" and len(part) < 3:
            continue
        if part[0][0].lower() in HEADING_WORDS and (ROMAN.match(part[-1][0]) or part[-1][0][:1].isdigit()):
            continue
        if not part[-1][0][:1].isupper() and not part[-1][0][:1].isdigit():
            continue
        if _heading_in_capitals([w for w, _ in part]):
            continue
        if re.search(r"['’]s$", part[-1][0]):  # "Brazen Sky’s" is Brazen Sky
            part = [*part[:-1], (re.sub(r"['’]s$", "", part[-1][0]), part[-1][1])]
        caption = " ".join(w for w, _ in part).strip(" .,:;")
        last_word, last_at = part[-1]
        out.append((caption, part[0][1], last_at + len(last_word.rstrip(" .,:;"))))
    return out
