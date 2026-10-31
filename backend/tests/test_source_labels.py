"""A source's short label (app/services/source_labels.py), worked out from what the source records: a filing by what it
is and its court number, a post by its account and date, an article by its publisher and date, else its title cut at
a word. Titles below are the 1MDB demo's own."""

from __future__ import annotations

import pytest

from app.services.source_labels import MAX, clip, date_words, short_label


@pytest.mark.parametrize(
    ("title", "meta", "expected"),
    [
        (
            "United States v. All Right and Title to the Yacht M/Y Equanimity — Verified Complaint for Forfeiture In Rem, "
            "C.D. Cal. No. 2:17-cv-04441",
            {"date": "2017-06-15"},
            "Forfeiture complaint · 2:17-cv-04441",
        ),
        (
            "United States v. The Sum of $20,000,000 in Funds and Securities Traceable to UBS Account No. XX-XX715-WB and "
            "Fidelity Investment Account No. X97-123456 — Verified Complaint for Forfeiture In Rem, C.D. Cal. No. 2:25-cv-00474",
            {},
            "Forfeiture complaint · 2:25-cv-00474",
        ),
        (
            "United States v. The Goldman Sachs Group, Inc. — Deferred Prosecution Agreement with Statement of Facts, "
            "E.D.N.Y. Cr. No. 20-437 (MKB)",
            {},
            "DPA · 20-437",
        ),
        (
            "In the Matter of The Goldman Sachs Group, Inc. — Order to Cease and Desist and Order of Assessment of a Civil "
            "Money Penalty",
            {"date": "2020-10-22"},
            "Cease-and-desist order · 22 Oct 2020",
        ),
        (
            "Public Prosecutor v Mohd Najib bin Hj Abd Razak, WA-45-7-11/2018 – grounds of judgment (1MDB trial)",
            {"kind": "judgment"},
            "Judgment · WA-45-7-11/2018",
        ),
        ("Press release – SK.2023.24 PetroSaudi managers sentenced to 6 and 7 years", {"kind": "press_release"}, "Press release · SK.2023.24"),
        (
            "New Goldman Sachs boss faces 1MDB fallout and a long headline",
            {"kind": "article", "publisher": "The Guardian", "date": "2018-11-09"},
            "The Guardian · 9 Nov 2018",
        ),
        (
            "Malaysian PM cleared of corruption over $681m 'gift'",
            {"kind": "article", "publisher": "SBS News (Reuters wire copy)", "date": "2016-01-26"},
            "SBS News · 26 Jan 2016",
        ),
        ("X/Twitter post by @WSJ (The Wall Street Journal), 2015-07-07", {"kind": "social", "date": "2015-07-07"}, "@WSJ · 7 Jul 2015"),
        ("Wikipedia: 1MDB", {}, "Wikipedia: 1MDB"),
    ],
)
def test_short_labels(title: str, meta: dict, expected: str) -> None:
    assert short_label(title, metadata=meta, source_type="web") == expected


def test_a_post_with_no_handle_is_named_by_its_site() -> None:
    title = "Personal website (jho-low.com) post by Low Taek Jho (Jho Low), 2018-09 (statement)"
    assert short_label(title, url="https://www.jho-low.com/", source_type="social", metadata={"kind": "social", "date": "2018-09"}) == "jho-low.com · Sep 2018"


def test_a_long_title_with_nothing_else_is_cut_at_a_word() -> None:
    label = short_label("Minutes of the extraordinary meeting of the harbour board held in camera", source_type="document")
    assert label == "Minutes of the extraordinary…" and len(label) <= MAX
    assert short_label(None) == "Untitled source"
    assert short_label("", url="https://example.org/a") == "example.org"


def test_dates_and_clipping() -> None:
    assert [date_words(d) for d in ("2016-01-26", "2018-09", "2015", "2015-13", "soon", None)] == ["26 Jan 2016", "Sep 2018", "2015", "2015", "", ""]
    assert clip("short") == "short"
    assert clip("one two three four", 12) == "one two…"
