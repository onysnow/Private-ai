"""OpenAleph's name-finding becomes review proposals (ADR-0006, Wave A).

After ingest-file reads a document it hands it to ftm-analyze, which writes
what it finds onto the document entity itself as properties, lower-cased and
normalised (``ftm_analyze/analysis/analyzer.py``, ``Analyzer.flush``; checked
live on OpenAleph 5.3.1):

- ``peopleMentioned``, ``companiesMentioned``, ``locationMentioned``: names
  spaCy tagged (one small model per detected language,
  ``ftm_analyze/settings.py`` ``SpacyNerModels``) and that passed ftm-analyze's
  fastText type check (``ner_type_model_confidence`` 0.85) and its length
  rule (8 to 100 characters, ``extract/base.py`` ``test_name``).
- ``emailMentioned``, ``phoneMentioned``, ``ibanMentioned``: pattern matches
  (``analysis/patterns.py``) that FollowTheMoney's value types accept.
- ``namesMentioned``: names of unknown kind.
- ``detectedLanguage``, ``detectedCountry``.

ingest-file writes ``namesMentioned`` and ``emailMentioned`` itself for the
sender and recipients of an email (``ingestors/support/email.py``), and it
never hands an email to ftm-analyze: its ``should_analyze``
(``ingestors/tasks.py``) skips every schema that is a ``Folder``, and
``Email`` is one. ftm-analyze would analyse an email (its ``SKIP_NER`` list
names Folder, Package, Table and Workbook only), so the Workbench asks for it
(``POST /api/2/entities/{id}/analyze``).

Nothing here makes a fact: every value becomes an ``ExtractionCandidate``
that a reporter accepts or rejects (ADR-0004, decision 1). Because
OpenAleph's values are normalised, the Workbench finds each one again in the
document's own text to show it in its original spelling, with its exact
character span; a value it cannot find is still proposed, without a span,
and the proposal says so.
"""

from __future__ import annotations

import re
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Iterable, Sequence

import httpx
from followthemoney import model as ftm_model
from followthemoney import registry
from normality import ascii_text
from rigour.names import normalize_name
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Document, DocumentChunk, ExtractionCandidate
from app.services import openaleph_http
from app.services.openaleph_corpus import PROVIDER
from app.services.openaleph_status import analysis_settled, fetch_collection_status

Report = Callable[[int | None, str | None], None]

EXTRACTION_METHOD = "openaleph_ftm_analyze"

# Elasticsearch makes a write searchable after its refresh interval, which
# openaleph-search sets to 1s (settings.index_refresh_interval); OpenAleph
# reads an entity back through a search (entities_by_ids). So once the
# indexer is idle, wait this long before reading what it wrote.
SEARCH_REFRESH_SECONDS = 1.0

# Properties only ftm-analyze writes (ingest-file writes namesMentioned and
# emailMentioned too, for email headers): any of them on a document means
# ftm-analyze has analysed it.
ANALYZER_ONLY_PROPERTIES = (
    "detectedLanguage", "detectedCountry", "peopleMentioned", "companiesMentioned",
    "locationMentioned", "ibanMentioned", "phoneMentioned",
)

# ftm_analyze/settings.py SpacyNerModels (ftm-analyze 5.3.1): the spaCy model
# it loads for each language. A document in no listed language is read with
# the English model (ner_default_lang). All fifteen are installed in the
# ghcr.io/openaleph/ftm-analyze:5.3.1 image (spacy.util.get_installed_models).
SPACY_MODELS: dict[str, str] = {
    "eng": "en_core_web_sm", "deu": "de_core_news_sm", "fra": "fr_core_news_sm", "spa": "es_core_news_sm",
    "rus": "ru_core_news_sm", "por": "pt_core_news_sm", "ron": "ro_core_news_sm", "mkd": "mk_core_news_sm",
    "ell": "el_core_news_sm", "pol": "pl_core_news_sm", "ita": "it_core_news_sm", "lit": "lt_core_news_sm",
    "nld": "nl_core_news_sm", "nob": "nb_core_news_sm", "nor": "nb_core_news_sm", "dan": "da_core_news_sm",
}
DEFAULT_SPACY_MODEL = SPACY_MODELS["eng"]

# ingest-file's should_analyze skips these (ingestors/tasks.py SKIP_ANALYSIS);
# ftm-analyze's should_ner skips these by name (analysis/analyzer.py SKIP_NER).
INGEST_SKIPS_ANALYSIS = ("Workbook", "Package", "Folder")
ANALYZER_SKIPS_NER = ("Folder", "Package", "Table", "Workbook")

# The email header properties ingest-file fills (FtM Email schema).
EMAIL_HEADER_PROPERTIES = ("from", "to", "cc", "bcc", "sender", "replyTo")

# A proposal keeps where its value occurs, up to this many places.
MAX_OCCURRENCES = 25


@dataclass(frozen=True)
class AnalysisKind:
    """One ftm-analyze property and the proposal it becomes."""
    prop: str
    candidate_type: str              # "entity" or "identifier"
    schema: str | None = None        # FtM schema of an entity proposal
    identifier: str | None = None    # "email" or "phone" for identifier proposals
    confidence: float = 1.0
    named_entity: bool = False       # found by spaCy's named-entity model
    schema_question: bool = False    # the reporter says what kind of entity it is


# The order is the import order: a name proposed under a definite schema is
# not proposed again as a name of unknown kind.
ANALYSIS_KINDS: tuple[AnalysisKind, ...] = (
    AnalysisKind("peopleMentioned", "entity", schema="Person", confidence=0.85, named_entity=True),
    AnalysisKind("companiesMentioned", "entity", schema="Company", confidence=0.85, named_entity=True),
    AnalysisKind("locationMentioned", "entity", schema="Address", confidence=0.85, named_entity=True),
    AnalysisKind("ibanMentioned", "entity", schema="BankAccount", confidence=1.0),
    AnalysisKind("namesMentioned", "entity", schema="LegalEntity", confidence=0.5, schema_question=True),
    AnalysisKind("emailMentioned", "identifier", identifier="email", confidence=1.0),
    AnalysisKind("phoneMentioned", "identifier", identifier="phone", confidence=1.0),
)
SCHEMA_CHOICES = ("Person", "Company", "Organization", "LegalEntity")


class AnalysisRefused(Exception):
    """OpenAleph would not analyse the document; the message says why."""


@dataclass
class Analysis:
    """What OpenAleph's analysis left on one document entity."""
    collection_id: str
    entity_id: str
    schema: str = "Document"
    properties: dict[str, list[str]] = field(default_factory=dict)
    settled: bool = True        # False: OpenAleph was still working when we stopped waiting
    error: str | None = None    # OpenAleph could not be asked

    @property
    def analysed(self) -> bool:
        return was_analysed(self.properties)

    @property
    def languages(self) -> list[str]:
        return _unique([*self.properties.get("language", []), *self.properties.get("detectedLanguage", [])])

    def value_count(self) -> int:
        return sum(len(self.properties.get(kind.prop, [])) for kind in ANALYSIS_KINDS)

    def issue(self) -> str | None:
        """A plain-language note for the document when names may be missing."""
        if self.error:
            return f"Names from OpenAleph are missing: {self.error}. Use “Find names again” when it is running."
        if not self.settled:
            minutes = max(1, round(settings.openaleph_analysis_timeout_seconds / 60))
            return (f"OpenAleph had not finished finding names after {minutes} minute(s); "
                    "use “Find names again” to fetch them when it has.")
        return None


def _unique(values: Iterable[str]) -> list[str]:
    seen: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return seen


def _property_values(properties: dict[str, Any], prop: str) -> list[str]:
    raw = properties.get(prop)
    items = raw if isinstance(raw, list) else [raw] if raw is not None else []
    # Entity references come back as nested objects in some replies; the
    # analysis properties are plain strings.
    return _unique(str(item).strip() for item in items if isinstance(item, (str, int, float)) and str(item).strip())


def was_analysed(properties: dict[str, Any]) -> bool:
    return any(_property_values(properties, prop) for prop in ANALYZER_ONLY_PROPERTIES)


def analysis_from_entity(collection_id: str, entity_id: str, entity: dict[str, Any] | None, *,
                         settled: bool = True, error: str | None = None) -> Analysis:
    found = entity.get("properties") if isinstance(entity, dict) else None
    raw: dict[str, Any] = found if isinstance(found, dict) else {}
    keep = {kind.prop for kind in ANALYSIS_KINDS} | set(ANALYZER_ONLY_PROPERTIES) | {"language", *EMAIL_HEADER_PROPERTIES}
    properties = {prop: _property_values(raw, prop) for prop in keep if _property_values(raw, prop)}
    schema = str((entity or {}).get("schema") or "Document")
    return Analysis(collection_id=collection_id, entity_id=entity_id, schema=schema, properties=properties,
                    settled=settled, error=error)


def needs_requested_analysis(schema_name: str | None) -> bool:
    """Whether ingest-file skipped analysing this kind of document although
    ftm-analyze can analyse it (an email): then the Workbench asks for it."""
    schema = ftm_model.get(schema_name or "")
    if schema is None or not schema.is_a("Analyzable") or schema.name in ANALYZER_SKIPS_NER:
        return False
    return any(schema.is_a(skipped) for skipped in INGEST_SKIPS_ANALYSIS)


def spacy_models_for(languages: Sequence[str]) -> list[str]:
    """The spaCy models ftm-analyze used for these languages (its _get_models)."""
    models = _unique(SPACY_MODELS[lang] for lang in languages if lang in SPACY_MODELS)
    return models or [DEFAULT_SPACY_MODEL]


def request_analysis(entity_id: str) -> None:
    """Ask OpenAleph to analyse a document again (entities_api.py ``analyze``:
    202 when queued, 400 when its analysis queue is switched off)."""
    response = openaleph_http.post(f"/api/2/entities/{entity_id}/analyze")
    if response.status_code == 202:
        return
    if response.status_code == 400:
        raise AnalysisRefused("OpenAleph's name-finding is switched off on this OpenAleph")
    if response.status_code == 404:
        raise AnalysisRefused("OpenAleph no longer has this document")
    response.raise_for_status()
    raise AnalysisRefused(f"OpenAleph answered HTTP {response.status_code} instead of queuing the analysis")


def wait_for_analysis(
    collection_id: str,
    entity_id: str,
    report: Report,
    *,
    fresh: bool = False,
    fetch: Callable[[str], dict[str, Any] | None] | None = None,
    fetch_status: Callable[[str], dict[str, Any]] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> Analysis:
    """Wait, at most OPENALEPH_ANALYSIS_TIMEOUT_SECONDS, for ftm-analyze to
    finish with one document, and return what it wrote.

    Two signals, both read in OpenAleph's own code: the document carries a
    property only ftm-analyze writes (it writes all of a document's results
    in one indexing job, so they arrive together), or the collection has no
    name-finding or indexing work left (openaleph_status.analysis_settled),
    which also covers a document in which nothing was found. ``fresh`` (after
    asking for a new analysis) ignores results already on the document.
    """
    fetch = fetch or openaleph_http.get_entity
    fetch_status = fetch_status or fetch_collection_status
    deadline = clock() + max(1.0, settings.openaleph_analysis_timeout_seconds)
    poll = max(0.1, settings.openaleph_read_poll_seconds)
    report(None, "OpenAleph is finding names")
    try:
        while True:
            if not fresh:
                current = analysis_from_entity(collection_id, entity_id, fetch(entity_id))
                if current.analysed:
                    return current
            if analysis_settled(fetch_status(collection_id)):
                sleep(SEARCH_REFRESH_SECONDS)
                return analysis_from_entity(collection_id, entity_id, fetch(entity_id))
            if clock() >= deadline:
                return analysis_from_entity(collection_id, entity_id, fetch(entity_id), settled=False)
            sleep(poll)
    except httpx.HTTPError as exc:
        return analysis_from_entity(collection_id, entity_id, None,
                                    error=f"lost contact with OpenAleph while it was finding names ({type(exc).__name__})")


def find_names(collection_id: str, entity_id: str, schema: str | None, report: Report) -> Analysis:
    """Wait for the analysis of a document OpenAleph has just read, asking
    for it first when ingest-file does not (emails)."""
    if not needs_requested_analysis(schema):
        return wait_for_analysis(collection_id, entity_id, report)
    try:
        request_analysis(entity_id)
    except AnalysisRefused as exc:
        return analysis_from_entity(collection_id, entity_id, None, error=str(exc))
    except httpx.HTTPError as exc:
        return analysis_from_entity(collection_id, entity_id, None,
                                    error=f"could not ask OpenAleph to find names ({type(exc).__name__})")
    return wait_for_analysis(collection_id, entity_id, report, fresh=True)


# --- Finding each value again in the document text ---------------------------

@dataclass(frozen=True)
class Occurrence:
    chunk_id: str
    locator: str
    page_number: int | None
    start_char: int
    end_char: int
    text: str


_WORD_RE = re.compile(r"\S+")
_POSSESSIVE_RE = re.compile(r"['’][sS]$")
# ftm_analyze/analysis/patterns.py PHONE_REGEX: the same candidates ftm-analyze
# cleans into phone numbers, so a number is found where it found it.
_PHONE_CANDIDATE_RE = re.compile(r"\+?[\d\-\(\)\/\s]{5,}\d{2}")


def _name_tokens(text: str) -> list[str]:
    """A name as ftm-analyze compares it: rigour's normalize_name (casefold,
    punctuation dropped, one space between tokens), then ASCII so that the
    two sides agree even if their rigour versions transliterate differently
    (the image has rigour 2.2.3, the Workbench 2.5.0)."""
    normalized = normalize_name(text) or ""
    return [ascii_text(token) or token for token in normalized.split()]


def _words(text: str) -> list[tuple[int, int, list[str]]]:
    """Each word of the text as (start, end, name tokens). A word is trimmed
    to its letters and digits, and loses a possessive "'s": spaCy leaves the
    possessive out of a name, so "Merkel's" must still find "merkel"."""
    words: list[tuple[int, int, list[str]]] = []
    for match in _WORD_RE.finditer(text):
        word = match.group(0)
        alnum = [i for i, char in enumerate(word) if char.isalnum()]
        if not alnum:
            continue
        start, end = alnum[0], alnum[-1] + 1
        trimmed = word[start:end]
        possessive = _POSSESSIVE_RE.search(trimmed)
        if possessive and len(trimmed) > 2:
            end -= 2
            trimmed = trimmed[:-2]
        tokens = _name_tokens(trimmed)
        if tokens:
            words.append((match.start() + start, match.start() + end, tokens))
    return words


def _locate_name(value: str, text: str) -> list[tuple[int, int]]:
    """Spans of the text whose words normalise to the name, whole words only."""
    target = _name_tokens(value)
    if not target:
        return []
    words = _words(text)
    flat = [(index, token) for index, (_, _, tokens) in enumerate(words) for token in tokens]
    spans: list[tuple[int, int]] = []
    size = len(target)
    position = 0
    while position + size <= len(flat):
        window = flat[position:position + size]
        first_word, last_word = window[0][0], window[-1][0]
        starts_word = position == 0 or flat[position - 1][0] != first_word
        ends_word = position + size == len(flat) or flat[position + size][0] != last_word
        if [token for _, token in window] == target and starts_word and ends_word:
            spans.append((words[first_word][0], words[last_word][1]))
            position += size
        else:
            position += 1
    return spans


def _locate_email(value: str, text: str) -> list[tuple[int, int]]:
    # Not inside a longer address: no address character before it, and no
    # address character (or a dot that continues the domain) after it.
    pattern = re.compile(r"(?<![\w.%+-])" + re.escape(value) + r"(?![\w-]|\.\w)", re.IGNORECASE)
    return [(match.start(), match.end()) for match in pattern.finditer(text)]


def _locate_phone(value: str, text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in _PHONE_CANDIDATE_RE.finditer(text):
        raw = match.group(0)
        if registry.phone.clean(raw) != value:
            continue
        start = match.start() + (len(raw) - len(raw.lstrip()))
        end = match.end() - (len(raw) - len(raw.rstrip()))
        spans.append((start, end))
    return spans


def _locate_iban(value: str, text: str) -> list[tuple[int, int]]:
    """The IBAN with or without spaces between its characters. ftm-analyze
    only detects it written without the usual 4-character grouping (its
    IBAN_REGEX needs seven digits in a row after the bank code), but where
    the same number also appears grouped, that is found too."""
    compact = re.sub(r"\s+", "", value)
    if not compact:
        return []
    pattern = re.compile(r"(?<![A-Za-z0-9])" + r"\s?".join(re.escape(char) for char in compact) + r"(?![A-Za-z0-9])",
                         re.IGNORECASE)
    return [(match.start(), match.end()) for match in pattern.finditer(text)]


def locate(kind: AnalysisKind, value: str, chunks: Sequence[DocumentChunk]) -> list[Occurrence]:
    """Every place in the document's chunks where the value occurs, in reading order."""
    if kind.identifier == "email":
        finder: Callable[[str, str], list[tuple[int, int]]] = _locate_email
    elif kind.identifier == "phone":
        finder = _locate_phone
    elif kind.prop == "ibanMentioned":
        finder = _locate_iban
    else:
        finder = _locate_name
    found: list[Occurrence] = []
    for chunk in chunks:
        for start, end in finder(value, chunk.text or ""):
            found.append(Occurrence(chunk_id=chunk.id, locator=chunk.locator, page_number=chunk.page_number,
                                    start_char=start, end_char=end, text=chunk.text[start:end]))
    return found


# --- Proposals -----------------------------------------------------------------

def _entity_key(schema: Any, value: Any) -> str | None:
    """What makes two entity proposals of one document the same proposal."""
    if not isinstance(value, str) or not value.strip():
        return None
    if schema == "BankAccount":
        return "iban:" + re.sub(r"\s+", "", value).upper()
    tokens = _name_tokens(value)
    return "name:" + " ".join(tokens) if tokens else None


def _identifier_key(kind: Any, value: Any) -> str | None:
    if not isinstance(kind, str) or not isinstance(value, str) or not value.strip():
        return None
    return f"{kind}:{value.strip().lower()}"


def _written_spellings(analysis: Analysis) -> dict[str, str]:
    """For each name, a spelling OpenAleph kept as it was written, if any.
    ftm-analyze lower-cases what spaCy finds, but ingest-file keeps an email
    sender's name as written ("Rebecca Thornton"): a name the Workbench
    cannot find in the text is shown in that spelling rather than "rebecca
    thornton"."""
    spellings: dict[str, str] = {}
    for kind in ANALYSIS_KINDS:
        if kind.candidate_type != "entity":
            continue
        for value in analysis.properties.get(kind.prop, []):
            key = _entity_key(kind.schema, value)
            if key and key not in spellings and value != value.lower():
                spellings[key] = value
    return spellings


def _header_text(analysis: Analysis) -> str:
    return " ".join(value for prop in EMAIL_HEADER_PROPERTIES for value in analysis.properties.get(prop, []))


def _found_by(kind: AnalysisKind, value: str, analysis: Analysis) -> str:
    """Which part of OpenAleph found the value: ftm-analyze, or ingest-file
    reading an email's sender and recipients (ingestors/support/email.py)."""
    schema = ftm_model.get(analysis.schema)
    from_headers = kind.prop in ("namesMentioned", "emailMentioned") and schema is not None and schema.is_a("Folder")
    if from_headers and value.lower() in _header_text(analysis).lower():
        return "ingest-file email headers"
    return "ftm-analyze"


def _chunk_read_method(db: Session, chunk_id: str | None) -> str | None:
    """How the chunk's own text was read, from the evidence proposal made of it."""
    if not chunk_id:
        return None
    for candidate in db.scalars(select(ExtractionCandidate).where(
            ExtractionCandidate.chunk_id == chunk_id, ExtractionCandidate.candidate_type == "evidence")).all():
        provenance = (candidate.payload or {}).get("provenance") if isinstance(candidate.payload, dict) else None
        if isinstance(provenance, dict) and isinstance(provenance.get("extraction_method"), str):
            return str(provenance["extraction_method"])
    return None


def _provenance(kind: AnalysisKind, value: str, analysis: Analysis, chunk_method: str | None) -> dict[str, Any]:
    found_by = _found_by(kind, value, analysis)
    provenance: dict[str, Any] = {
        "provider": PROVIDER, "collection_id": analysis.collection_id,
        "provider_document_id": analysis.entity_id, "provider_entity_id": analysis.entity_id,
        "provider_schema": analysis.schema, "provider_property": kind.prop,
        "extraction_method": EXTRACTION_METHOD, "found_by": found_by,
        "detected_languages": analysis.properties.get("detectedLanguage", []),
    }
    if chunk_method:
        provenance["chunk_extraction_method"] = chunk_method
    if found_by == "ftm-analyze" and kind.named_entity:
        provenance["ner_engine"] = "spacy"
        provenance["ner_models"] = spacy_models_for(analysis.languages)
    if found_by == "ftm-analyze" and (kind.identifier or kind.prop == "ibanMentioned"):
        provenance["pattern"] = kind.identifier or "iban"
    return provenance


def _entity_properties(kind: AnalysisKind, value: str, caption: str) -> dict[str, list[str]]:
    if kind.schema == "BankAccount":
        return {"iban": [value], "accountNumber": [value]}
    if kind.schema == "Address":
        return {"full": [caption]}
    return {"name": [caption]}


def import_analysis_proposals(db: Session, document_id: str, analysis: Analysis) -> dict[str, int]:
    """Stage every value OpenAleph's analysis left on the document as a
    proposal: names as entity proposals, emails and phones as identifier
    proposals. A value already proposed for this document (by any finder,
    whatever its review state) is not proposed again."""
    doc = db.get(Document, document_id)
    if doc is None:
        raise ValueError("Document not found")
    chunks = list(db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
                             .order_by(DocumentChunk.ordinal)).all())
    seen: set[str] = set()
    for row in db.scalars(select(ExtractionCandidate).where(
            ExtractionCandidate.document_id == doc.id,
            ExtractionCandidate.candidate_type.in_(("entity", "identifier")))).all():
        existing = row.payload if isinstance(row.payload, dict) else {}
        if row.candidate_type == "entity":
            keys = {_entity_key(existing.get("suggested_schema"), existing.get(name)) for name in ("caption", "openaleph_value")}
        else:
            keys = {_identifier_key(existing.get("kind"), existing.get("value"))}
        seen.update(key for key in keys if key)

    counts = {"retrieved": 0, "entities": 0, "identifiers": 0, "skipped": 0, "unlocated": 0}
    spellings = _written_spellings(analysis)
    for kind in ANALYSIS_KINDS:
        for value in analysis.properties.get(kind.prop, []):
            counts["retrieved"] += 1
            key = (_entity_key(kind.schema, value) if kind.candidate_type == "entity"
                   else _identifier_key(kind.identifier, value))
            if key is None or key in seen:
                counts["skipped"] += 1
                continue
            seen.add(key)
            occurrences = locate(kind, value, chunks)
            first = occurrences[0] if occurrences else None
            if first is None:
                counts["unlocated"] += 1
            caption = " ".join(first.text.split()) if first else spellings.get(key, value)
            payload: dict[str, Any] = {
                "caption": caption,
                "openaleph_value": value,
                "located": first is not None,
                "occurrence_count": len(occurrences),
                "occurrences": [asdict(item) for item in occurrences[:MAX_OCCURRENCES]],
                "provenance": _provenance(kind, value, analysis, _chunk_read_method(db, first.chunk_id if first else None)),
                "rationale": {"rule": EXTRACTION_METHOD, "property": kind.prop, "located": first is not None,
                              "occurrences": len(occurrences)},
            }
            if first is not None:
                payload["span"] = {"start_char": first.start_char, "end_char": first.end_char}
                payload["locator"] = first.locator
            if kind.candidate_type == "entity":
                payload["suggested_schema"] = kind.schema
                payload["properties"] = _entity_properties(kind, value, caption)
                if kind.schema_question:
                    payload["schema_question"] = True
                    payload["schema_choices"] = list(SCHEMA_CHOICES)
                counts["entities"] += 1
            else:
                payload["kind"] = kind.identifier
                payload["value"] = value
                counts["identifiers"] += 1
            db.add(ExtractionCandidate(
                investigation_id=doc.investigation_id, document_id=doc.id,
                chunk_id=first.chunk_id if first else None, candidate_type=kind.candidate_type,
                payload=payload, confidence=kind.confidence, review_status="proposed",
            ))
    _keep_what_openaleph_read(doc, analysis)
    db.commit()
    return counts


def _keep_what_openaleph_read(doc: Document, analysis: Analysis) -> None:
    """The document's kind as OpenAleph read it (an Email...), and the language it detected first, unless a firmer
    value is kept (app/services/document_facts.py)."""
    from app.services import document_facts

    kind = document_facts.kind_from_file(None, None, openaleph_schema=analysis.schema)
    if kind:
        document_facts.set_kind(doc, kind, "reader", who="OpenAleph")
    for code in analysis.properties.get("detectedLanguage", []):
        if document_facts.set_language(doc, str(code), "detected", who="OpenAleph"):
            break


def describe_import(counts: dict[str, int]) -> str | None:
    """The import's outcome for a job message, or None when it proposed nothing."""
    parts = []
    if counts.get("entities"):
        parts.append(f"{counts['entities']} name(s)")
    if counts.get("identifiers"):
        parts.append(f"{counts['identifiers']} email address(es) or phone number(s)")
    return " and ".join(parts) + " from OpenAleph" if parts else None
