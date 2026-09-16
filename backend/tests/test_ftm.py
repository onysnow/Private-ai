from app.services.ftm import make_ftm_entity

def test_person_entity_has_name_and_stable_id():
    a = make_ftm_entity("Person", "Jane Reporter", {})
    b = make_ftm_entity("Person", "Jane Reporter", {})
    assert a["properties"]["name"] == ["Jane Reporter"]
    assert a["id"] == b["id"]
