from pathlib import Path

import yaml


def test_root_compose_declares_core_stack_and_optional_openaleph_services():
    root = Path(__file__).resolve().parents[2]
    compose = yaml.safe_load((root / "docker-compose.yml").read_text())
    services = compose["services"]

    required = {
        "workbench-db",
        "postgres",
        "elasticsearch",
        "redis",
        "ingest",
        "analyze",
        "worker",
        "api",
        "ui",
        "backend",
        "frontend",
    }
    assert required.issubset(services)

    backend_env = services["backend"]["environment"]
    assert backend_env["OPENALEPH_ENABLED"] == "${OPENALEPH_ENABLED:-false}"
    assert backend_env["OPENALEPH_BASE_URL"] == "http://api:8000"
    assert backend_env["OPENALEPH_AUTO_SYNC_DOCUMENTS"] == "${OPENALEPH_AUTO_SYNC_DOCUMENTS:-false}"
    assert backend_env["ENABLE_LOCAL_ENTITY_SUGGESTIONS"] == "${ENABLE_LOCAL_ENTITY_SUGGESTIONS:-true}"
    assert backend_env["API_AUTH_TOKEN"] == "${API_AUTH_TOKEN:-docker-compose-local-dev-token}"
    assert backend_env["ENABLE_AI_FEATURES"] == "false"

    assert services["backend"]["depends_on"]["workbench-db"]["condition"] == "service_healthy"
    assert services["frontend"]["environment"]["NEXT_PUBLIC_API_AUTH_TOKEN"] == "${API_AUTH_TOKEN:-docker-compose-local-dev-token}"
    assert services["ingest"]["image"].startswith("ghcr.io/openaleph/ingest-file:")
    assert services["analyze"]["image"].startswith("ghcr.io/openaleph/ftm-analyze:")
    assert services["api"]["image"].startswith("ghcr.io/openaleph/openaleph:")
    assert services["ui"]["image"].startswith("ghcr.io/openaleph/aleph-ui:")

    for name in {"postgres", "elasticsearch", "redis", "ingest", "analyze", "worker", "api", "ui"}:
        assert services[name]["profiles"] == ["openaleph"]


def test_integrated_stack_uses_separate_postgres_ownership_boundaries():
    root = Path(__file__).resolve().parents[2]
    compose = yaml.safe_load((root / "docker-compose.yml").read_text())
    services = compose["services"]

    workbench_db = services["backend"]["environment"]["DATABASE_URL"]
    assert "@workbench-db:5432/journalism" in workbench_db

    openaleph_env = services["api"]["environment"]
    assert "@postgres:5432/aleph" in openaleph_env["OPENALEPH_DB_URI"]
    assert openaleph_env["FTM_STORE_URI"] == openaleph_env["OPENALEPH_DB_URI"]
