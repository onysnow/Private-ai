import json
import os
import stat

from app.services.credentials import credential_status, get_secret, remove_secret, set_secret


def test_local_credential_store_is_restricted_and_redacted(tmp_path):
    path = tmp_path / "secrets" / "connectors.json"
    secret = "aleph-super-secret-value"
    set_secret(path, "aleph", secret)

    assert get_secret(path, "aleph") == secret
    status = credential_status(path, "aleph")
    assert status == {
        "configured": True,
        "source": "local_store",
        "local_store_present": True,
        "permissions_restricted": True,
        "storage_protection": "owner_permissions",
    }
    assert secret not in json.dumps(status)
    if os.name != "nt":
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_local_secret_overrides_environment_fallback_and_remove_reveals_fallback(tmp_path):
    path = tmp_path / "connectors.json"
    set_secret(path, "opensanctions", "local-key")
    assert get_secret(path, "opensanctions", "env-key") == "local-key"
    assert credential_status(path, "opensanctions", "env-key")["source"] == "local_store"

    assert remove_secret(path, "opensanctions") is True
    assert get_secret(path, "opensanctions", "env-key") == "env-key"
    status = credential_status(path, "opensanctions", "env-key")
    assert status["configured"] is True
    assert status["source"] == "environment"
    assert status["local_store_present"] is False


def test_blank_or_unknown_credentials_fail_closed(tmp_path):
    path = tmp_path / "connectors.json"
    for provider, value in [("aleph", "   "), ("unknown", "secret")]:
        try:
            set_secret(path, provider, value)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid connector credential should be rejected")
