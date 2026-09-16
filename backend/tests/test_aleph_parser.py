from app.connectors.aleph import AlephConnector

def test_aleph_structured_result_maps_to_ftm_shape():
    c = AlephConnector()
    finding = c._parse_result({
        "id":"abc", "schema":"Person", "caption":"Jane Doe",
        "properties":{"name":["Jane Doe"], "nationality":["us"]}
    })
    assert finding.provider == "aleph"
    assert finding.record_id == "abc"
    assert finding.schema == "Person"
    assert finding.properties["name"] == ["Jane Doe"]
