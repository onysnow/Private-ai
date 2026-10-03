"""The writing check on a presentation draft (app/ai/writing_check.py) and
what it changes in the promoted brief and deck (app/services/presentation.py):
short sentences (AR 25-50), ICD 203's likelihood words, slide headlines that
state a claim, every section tied to the takeaway, single-record statements
marked, and the brief's "how we know, and our limits"."""

from __future__ import annotations

from app.ai.writing_check import (
    AVERAGE_SENTENCE_WORDS, LIKELIHOOD_TERMS, check_presentation_writing, headline_lines, likelihood_findings, sentences,
)
from app.services.presentation import deck_slides_from_payload, how_we_know, writeup_content_from_payload

EV1 = {"record_type": "evidence", "record_id": "ev-1"}
EV2 = {"record_type": "evidence", "record_id": "ev-2"}


def _draft(**section) -> dict:
    base = {"heading": "Meridian received most of the money", "supports_takeaway": "It shows where the fee went.",
            "body": "Meridian paid Bellcastle $2.4M. The wire cleared on 14 November.",
            "key_points": ["$2.4M paid to Bellcastle", "Wire cleared 14 Nov"], "key_point_evidence": [[EV1], [EV1, EV2]],
            "evidence": [EV1, EV2]}
    return {"title": "The fee", "goal_restated": "Explain the fee.", "executive_takeaway": "Meridian paid the fee to Bellcastle.",
            "sections": [{**base, **section}], "open_questions": ["Who owns Bellcastle?"], "limits": ["The ledger is the payer's own account."]}


def test_the_seven_likelihood_terms_are_icd_203s_first_row():
    assert [term for term, _ in LIKELIHOOD_TERMS] == ["almost no chance", "very unlikely", "unlikely", "roughly even chance", "likely",
                                                       "very likely", "almost certain"]
    found = likelihood_findings("It was probably a loan. Perhaps not. It is almost certainly a loan. We judge with high confidence it is likely.", "x")
    assert [f["sentence"] for f in found] == ["It was probably a loan.", "Perhaps not.", "We judge with high confidence it is likely."]
    assert "second row" in found[0]["message"] and "how likely" in found[1]["message"] and "must not share a sentence" in found[2]["message"]


def test_a_clean_draft_has_only_its_single_record_point_to_look_at():
    report = check_presentation_writing(_draft())
    assert [(f["practice"], f["sentence"]) for f in report["findings"]] == [("single_source", "$2.4M paid to Bellcastle")]


def test_long_sentences_vague_headlines_and_untied_sections_are_reported():
    long_body = ("Meridian Holdings, which had been registered in London in 2019 by a nominee director, paid Bellcastle Trading Group "
                 "a consulting fee of $2.4M through an account at Trasta Komercbanka in Riga. It cleared.")
    report = check_presentation_writing(_draft(body=long_body, heading="Payments", supports_takeaway=""))
    practices = {f["practice"]: f for f in report["findings"]}
    assert practices["short_sentences"]["message"].startswith("sentences average") and str(AVERAGE_SENTENCE_WORDS) in practices["short_sentences"]["message"]
    assert practices["short_sentences"]["sentence"].startswith("Meridian Holdings, which")
    assert practices["headline"]["sentence"] == "Payments"
    assert "main_point" in practices
    assert len(sentences(long_body)) == 2
    assert headline_lines("Meridian received most of the money") == 1
    assert headline_lines(" ".join(["Meridian received most of the money"] * 6)) > 2


def test_the_brief_and_the_deck_mark_single_record_statements_and_say_how_we_know():
    draft = _draft(evidence=[EV1])
    line = how_we_know(draft)
    assert line == "This rests on 2 records in the investigation: 2 evidence records. † marks a statement that rests on one record."
    slides = deck_slides_from_payload(draft)
    assert slides[2]["bullets"] == ["$2.4M paid to Bellcastle †", "Wire cleared 14 Nov"]
    assert slides[3]["heading"] == "How we know, and our limits" and slides[3]["bullets"] == [line, "The ledger is the payer's own account."]
    doc = writeup_content_from_payload(draft)
    body = next(node for node in doc["content"] if node["type"] == "paragraph" and any(c.get("text", "").startswith("Meridian paid") for c in node["content"]))
    assert body["content"][-1] == {"type": "text", "text": " †"}
    limits = next(node for node in doc["content"] if node["type"] == "callout" and node["attrs"]["tone"] == "limits")
    assert limits["attrs"]["title"] == "How we know, and our limits"
    assert limits["content"][1]["content"][0]["content"][0]["content"][0]["text"] == "The ledger is the payer's own account."
