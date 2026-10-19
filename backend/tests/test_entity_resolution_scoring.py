"""Which of the investigation's records a name may be, scored with
FollowTheMoney's name comparison and the words in common (app/services/
resolution.py candidate_entities; design doc Phase 4)."""

from app.db.session import SessionLocal
from app.models.domain import Investigation
from app.schemas.api import EntityCreate
from app.services.entities import create_entity
from app.services.resolution import BASIS_SAME, BASIS_SIMILAR, BASIS_WORDS, candidate_entities


def _case(*records: tuple[str, str]):
    db = SessionLocal()
    inv = Investigation(name="Scoring")
    db.add(inv)
    db.commit()
    ids = {caption: create_entity(db, EntityCreate(investigation_id=inv.id, schema=schema, caption=caption, properties={})).id
           for schema, caption in records}
    return db, inv.id, ids


def _by_caption(rows: list[dict]) -> dict[str, dict]:
    return {row["caption"]: row for row in rows}


def test_the_same_name_written_differently_is_the_same_name():
    db, inv, _ids = _case(("Company", "Meridian Holdings Limited"), ("Person", "Voss, Alaric"), ("Company", "Meridian Shipping Ltd"))
    with db:
        company = _by_caption(candidate_entities(db, inv, "MERIDIAN HOLDINGS LTD.", "Company"))
        assert company["Meridian Holdings Limited"]["basis"] == BASIS_SAME           # legal forms read as one
        assert company["Meridian Holdings Limited"]["name_similarity"] >= 0.9
        assert company["Meridian Shipping Ltd"]["basis"] == BASIS_WORDS              # another company, listed weakly
        person = _by_caption(candidate_entities(db, inv, "Alaric Voss", "Person"))
        assert person["Voss, Alaric"]["basis"] == BASIS_SAME                         # word order does not matter


def test_spelling_slips_ask_or_list_by_how_close_they_are():
    """One slip ("Vos") still reads as the same name, so the reporter is asked;
    a transliteration ("Aleksandr") is a similar name, listed."""
    db, inv, _ids = _case(("Person", "Alaric Vos"), ("Person", "Aleksandr Petrov"))
    with db:
        assert candidate_entities(db, inv, "Alaric Voss", "Person")[0]["basis"] == BASIS_SAME
        row = candidate_entities(db, inv, "Alexander Petrov", "Person")[0]
        assert row["basis"] == BASIS_SIMILAR and 0.7 <= row["name_similarity"] < 0.9


def test_kinds_that_cannot_be_the_same_thing_are_never_offered():
    db, inv, _ids = _case(("Person", "Meridian Holdings"))
    with db:
        assert candidate_entities(db, inv, "Meridian Holdings", "Company") == []


def test_a_guessed_kind_still_finds_the_record_of_another_kind():
    """The pattern finder's 0.40 "Person" is only a guess: it must not hide
    the Company the investigation already holds under that name."""
    db, inv, _ids = _case(("Company", "Harborline Civic"))
    with db:
        assert candidate_entities(db, inv, "Harborline Civic", "Person") == []
        found = candidate_entities(db, inv, "Harborline Civic", "Person", schema_is_guess=True)
        assert [(row["caption"], row["basis"]) for row in found] == [("Harborline Civic", BASIS_SAME)]


def test_a_name_inside_a_longer_one_is_still_listed():
    db, inv, _ids = _case(("Company", "Bellcastle Trading Group"))
    with db:
        row = candidate_entities(db, inv, "Bellcastle Trading", "Company")[0]
        assert row["basis"] == BASIS_WORDS and row["score"] >= 0.5


def test_a_name_held_as_an_alias_is_that_record():
    """A name the investigation holds as a record's alias (or another of its
    names) is offered as that record, not as a new one."""
    db = SessionLocal()
    inv = Investigation(name="Aliases")
    db.add(inv)
    db.commit()
    record = create_entity(db, EntityCreate(investigation_id=inv.id, schema="Person", caption="Teodor Kalinsky Varn",
                                            properties={"alias": ["Ted Varn"]}))
    with db:
        found = candidate_entities(db, inv.id, "Ted Varn", "Person")
        assert [(row["entity_id"], row["caption"], row["basis"]) for row in found] == [(record.id, "Teodor Kalinsky Varn", BASIS_SAME)]
