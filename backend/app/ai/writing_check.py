"""The writing check on a presentation draft (visuals pass 6, the design
doc's "Briefs, decks and summaries" practices). It runs after the quote and
chart checks and never removes anything: it reports what a reporter should
look at before accepting the draft, and the review panel shows the report.

- **Short sentences.** "The average length of a sentence should be about
  15 words" (AR 25-50, Army Correspondence, para 1-37b). A section whose
  body averages more than 15 words a sentence is reported, with its longest
  sentence.
- **Likelihood words.** ICD 203 (Analytic Standards, p. 5) gives seven
  likelihood terms with their ranges, in two rows that "analysts are
  strongly encouraged not to mix"; this app uses the first row (ADR-0005,
  line 5). A word from the second row (probably, improbable, remote ...) or
  a hedge on no row at all (possibly, perhaps, maybe ...) is reported with
  the first-row words to use instead. ICD 203 also forbids combining a
  confidence level and a degree of likelihood in one sentence; such a
  sentence is reported.
- **Slide headline is a claim.** A section heading becomes a slide's
  headline, which states the finding in one full sentence of two lines at
  most (Garner and Alley 2013; Penn State, "Assertion-Evidence" guide). A
  heading under four words, or longer than two lines at the deck's headline
  size, is reported.
- **One main point.** Every section says how it bears on the takeaway
  (Minto, the Pyramid Principle); a section that does not is reported.
- **Clear attribution.** A statement resting on one record is flagged
  (Reuters Handbook; NPR Training: separate what was confirmed from what one
  source says); the brief and the deck mark it, and the report lists it.
"""

from __future__ import annotations

import re
from typing import Any

from app.visuals.echarts import SINGLE_RECORD_MARK
from app.visuals.layout import wrapped_lines

# The mark for a statement that rests on one record: the one a chart value
# resting on one record carries (design rule 20).
SINGLE_SOURCE_MARK = SINGLE_RECORD_MARK
AVERAGE_SENTENCE_WORDS = 15   # AR 25-50, para 1-37b: "about 15 words"
MIN_HEADLINE_WORDS = 4        # the same floor a chart title has (app/visuals/checker.py MIN_TITLE_WORDS)
HEADLINE_LINES = 2
# A content slide's headline box is 11.8 inches wide and shrinks its type
# from 34 pt down to 24 pt to fit (app/services/decks.py content_slide): two
# lines at 24 pt is the most a headline can take.
HEADLINE_PT = 24
HEADLINE_WIDTH_IN = 11.8

# ICD 203, p. 5: the first row, from least to most likely, with its ranges.
LIKELIHOOD_TERMS: tuple[tuple[str, str], ...] = (
    ("almost no chance", "01-05%"), ("very unlikely", "05-20%"), ("unlikely", "20-45%"), ("roughly even chance", "45-55%"),
    ("likely", "55-80%"), ("very likely", "80-95%"), ("almost certain", "95-99%"),
)
# ICD 203's second row: allowed there, but not to be mixed with the first.
SECOND_ROW = ("remote", "highly improbable", "improbable", "improbably", "roughly even odds", "probable", "probably", "highly probable",
              "nearly certain")
# Hedges on neither row: they state a likelihood without saying how likely.
OFF_SCALE = ("possibly", "possible that", "perhaps", "maybe", "presumably", "conceivably", "plausibly", "apparently",
             "in all likelihood", "chances are", "doubtful", "highly likely", "highly unlikely", "almost surely", "certainly")
CONFIDENCE_LEVEL = re.compile(r"\b(low|moderate|medium|high)[- ]confidence\b", re.IGNORECASE)
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[\"'(\[]?[A-Z0-9])")
_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’$€£%.,-]*")


def sentences(text: str) -> list[str]:
    """The sentences of a passage: split after ., ! or ? before a capital or a figure."""
    out: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text or ""):
        out.extend(s.strip() for s in _SENTENCE.split(paragraph.strip()) if s.strip())
    return out


def words(text: str) -> int:
    return len(_WORD.findall(text or ""))


def _phrase(text: str, phrase: str) -> bool:
    return re.search(rf"(?<![A-Za-z]){re.escape(phrase)}(?![A-Za-z])", text, re.IGNORECASE) is not None


def likelihood_findings(text: str, where: str) -> list[dict[str, Any]]:
    """The likelihood problems in one passage, sentence by sentence."""
    first_row = ", ".join(f"{term} ({span})" for term, span in LIKELIHOOD_TERMS)
    found: list[dict[str, Any]] = []
    for sentence in sentences(text):
        second = [p for p in SECOND_ROW if _phrase(sentence, p)]
        # "almost certainly" is a first-row term; the "certainly" in it is not a hedge.
        rest = re.sub(r"almost certain(ly)?", " ", sentence, flags=re.IGNORECASE)
        vague = [p for p in OFF_SCALE if _phrase(rest, p)]
        if second:
            found.append({"practice": "likelihood", "where": where, "sentence": sentence,
                          "message": f"'{second[0]}' is on ICD 203's second row; this app uses the first, and the rows are not mixed: {first_row}"})
        elif vague:
            found.append({"practice": "likelihood", "where": where, "sentence": sentence,
                          "message": f"'{vague[0]}' says a likelihood without saying how likely; use one of ICD 203's terms: {first_row}"})
        uses_likelihood = any(_phrase(sentence, term) for term, _span in LIKELIHOOD_TERMS) or bool(second)
        if uses_likelihood and CONFIDENCE_LEVEL.search(sentence):
            found.append({"practice": "likelihood", "where": where, "sentence": sentence,
                          "message": "ICD 203: a confidence level and a degree of likelihood must not share a sentence; split it"})
    return found


def headline_lines(heading: str) -> int:
    """How many lines a heading takes at the deck's smallest headline size,
    broken at spaces (app/visuals/layout.py's estimate of a line's width)."""
    lines = wrapped_lines(heading, HEADLINE_PT * 96 / 72, HEADLINE_WIDTH_IN * 96)
    return len(lines) if lines is not None else HEADLINE_LINES + 1


def _record_count(refs: Any) -> int:
    return len({(r.get("record_type"), r.get("record_id")) for r in refs or [] if isinstance(r, dict) and r.get("record_id")})


def single_source(refs: Any) -> bool:
    """Whether a statement's evidence comes from exactly one record."""
    return _record_count(refs) == 1


def key_point_refs(section: dict) -> list[Any]:
    """Each key point's evidence, in order: the quote check keeps key points
    as strings with their evidence in the parallel `key_point_evidence`
    (app/ai/quote_check.py); a draft not yet checked keeps
    {"text", "evidence"} objects."""
    points = section.get("key_points") or []
    parallel = section.get("key_point_evidence")
    if isinstance(parallel, list):
        return [parallel[i] if i < len(parallel) else [] for i in range(len(points))]
    return [p.get("evidence") if isinstance(p, dict) else [] for p in points]


def key_point_text(point: Any) -> str:
    return str(point.get("text") or "") if isinstance(point, dict) else str(point)


def check_presentation_writing(payload: dict) -> dict[str, Any]:
    """The writing report: {"findings": [...], "checked": [...]} with one
    finding per thing to look at, each naming its practice, where it is and
    what to do. Nothing in the payload is changed."""
    findings: list[dict[str, Any]] = []
    takeaway = str(payload.get("executive_takeaway") or "")
    findings.extend(likelihood_findings(takeaway, "the takeaway"))
    for i, section in enumerate(payload.get("sections") or []):
        if not isinstance(section, dict):
            continue
        where = f"section {i + 1} ('{section.get('heading') or 'untitled'}')"
        body = str(section.get("body") or "")
        said = sentences(body)
        if said:
            average = sum(words(s) for s in said) / len(said)
            if average > AVERAGE_SENTENCE_WORDS:
                longest = max(said, key=words)
                findings.append({"practice": "short_sentences", "where": where, "sentence": longest,
                                 "message": f"sentences average {average:.0f} words; aim for about {AVERAGE_SENTENCE_WORDS} (AR 25-50). "
                                            f"The longest has {words(longest)}"})
        findings.extend(likelihood_findings(body, where))
        for point in section.get("key_points") or []:
            findings.extend(likelihood_findings(key_point_text(point), where))
        heading = str(section.get("heading") or "")
        if words(heading) < MIN_HEADLINE_WORDS:
            findings.append({"practice": "headline", "where": where, "sentence": heading,
                             "message": f"the heading is a slide's headline: one full sentence stating the finding (at least {MIN_HEADLINE_WORDS} words)"})
        elif headline_lines(heading) > HEADLINE_LINES:
            findings.append({"practice": "headline", "where": where, "sentence": heading,
                             "message": f"the headline runs to {headline_lines(heading)} lines on a slide; keep it to {HEADLINE_LINES}"})
        if "supports_takeaway" in section and not str(section.get("supports_takeaway") or "").strip():
            findings.append({"practice": "main_point", "where": where, "sentence": "",
                             "message": "the section does not say how it bears on the takeaway"})
        for point, refs in zip(section.get("key_points") or [], key_point_refs(section)):
            if single_source(refs):
                findings.append({"practice": "single_source", "where": where, "sentence": key_point_text(point),
                                 "message": f"rests on one record; it is marked {SINGLE_SOURCE_MARK} in the brief and the deck"})
    return {"findings": findings,
            "checked": ["short_sentences", "likelihood", "headline", "main_point", "single_source"]}
