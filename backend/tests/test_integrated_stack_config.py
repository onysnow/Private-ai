from pathlib import Path

import yaml


def test_root_compose_declares_core_stack_with_openaleph_always_on():
    """OpenAleph is part of the product, not a profile: every service boots with
    plain `docker compose up`, and the backend is wired to it by default."""
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
    }
    assert required.issubset(services)
    # ADR-0004: the API serves the workbench screen; there is no separate
    # frontend container or port 3000.
    assert "frontend" not in services
    assert services["backend"]["build"] == {
        "context": ".",
        "dockerfile": "backend/Dockerfile",
        "args": {"NEXT_PUBLIC_API_AUTH_TOKEN": "${API_AUTH_TOKEN:-docker-compose-local-dev-token}"},
    }

    backend_env = services["backend"]["environment"]
    assert backend_env["OPENALEPH_ENABLED"] == "${OPENALEPH_ENABLED:-true}"
    assert backend_env["OPENALEPH_BASE_URL"] == "http://api:8000"
    assert backend_env["OPENALEPH_AUTO_SYNC_DOCUMENTS"] == "${OPENALEPH_AUTO_SYNC_DOCUMENTS:-false}"
    assert backend_env["ENABLE_LOCAL_ENTITY_SUGGESTIONS"] == "${ENABLE_LOCAL_ENTITY_SUGGESTIONS:-true}"
    assert backend_env["API_AUTH_TOKEN"] == "${API_AUTH_TOKEN:-docker-compose-local-dev-token}"
    assert backend_env["ENABLE_AI_FEATURES"] == "false"

    assert services["backend"]["depends_on"]["workbench-db"]["condition"] == "service_healthy"
    assert services["ingest"]["image"].startswith("ghcr.io/openaleph/ingest-file:")
    assert services["analyze"]["image"].startswith("ghcr.io/openaleph/ftm-analyze:")
    assert services["api"]["image"].startswith("ghcr.io/openaleph/openaleph:")
    assert services["ui"]["image"].startswith("ghcr.io/openaleph/aleph-ui:")

    for name in {"postgres", "elasticsearch", "redis", "ingest", "analyze", "worker", "api", "ui"}:
        assert "profiles" not in services[name], f"{name} must boot with the default stack, not behind a profile"
    assert "api" not in services["backend"]["depends_on"], "the workbench must come up even while OpenAleph is still pulling/starting"
    _assert_openaleph_setup_runs_first(services)
    _assert_render_service(services, production=False)


def _assert_render_service(services, *, production: bool):
    """ADR-0005, line 2: chart images come from a small separate Node service
    in both compose files; the backend reaches it by name and never waits
    for it (an export falls back when it is down)."""
    render = services["render"]
    assert render["build"] == {"context": "./render"}
    assert services["backend"]["environment"]["RENDER_SERVICE_URL"] == "http://render:8070"
    assert "render" not in services["backend"].get("depends_on", {}), "exports fall back when the render service is down"
    if production:
        assert render.get("restart") == "unless-stopped"
        assert "ports" not in render, "the render service stays on the internal network; only the backend calls it"
        assert render["image"].startswith("journalism-workbench-render:")
    else:
        assert render["ports"] == ["127.0.0.1:8070:8070"]


def _assert_openaleph_setup_runs_first(services):
    """Without `aleph upgrade` OpenAleph's workers stop at once on a fresh
    install (its job queue tables do not exist yet; seen 2026-10-01)."""
    setup = services["openaleph-setup"]
    script = setup["command"][-1]
    assert setup["command"][:2] == ["bash", "-c"] and setup["restart"] == "no"
    assert "aleph upgrade" in script and 'touch "$$marker"' in script
    assert "openaleph-archive:/data" in setup["volumes"], "the marker lives with OpenAleph's own data"
    assert setup["depends_on"]["elasticsearch"]["condition"] == "service_healthy"
    assert setup["depends_on"]["postgres"]["condition"] == "service_healthy"
    assert "healthcheck" in services["elasticsearch"]
    for name in ("ingest", "analyze", "worker", "api"):
        assert services[name]["depends_on"]["openaleph-setup"]["condition"] == "service_completed_successfully", name


def test_integrated_stack_uses_separate_postgres_ownership_boundaries():
    root = Path(__file__).resolve().parents[2]
    compose = yaml.safe_load((root / "docker-compose.yml").read_text())
    services = compose["services"]

    workbench_db = services["backend"]["environment"]["DATABASE_URL"]
    assert "@workbench-db:5432/journalism" in workbench_db

    openaleph_env = services["api"]["environment"]
    assert "@postgres:5432/aleph" in openaleph_env["OPENALEPH_DB_URI"]
    assert openaleph_env["FTM_STORE_URI"] == openaleph_env["OPENALEPH_DB_URI"]


def test_production_compose_has_no_dev_shortcuts():
    """STRUCT-0031: docker-compose.prod.yml must never regress into the dev file's
    shape -- no source bind-mount, no default secrets, no host port on the DB,
    no bearer token baked into the workbench screen, data on a named volume."""
    import re

    root = Path(__file__).resolve().parents[2]
    text = (root / "docker-compose.prod.yml").read_text(encoding="utf-8")
    compose = yaml.safe_load(text)
    services = compose["services"]
    openaleph = {"postgres", "elasticsearch", "redis", "ingest", "analyze", "worker", "api", "ui"}
    assert set(services) == {"workbench-db", "backend", "openaleph-setup", "render"} | openaleph, "workbench + render + OpenAleph, nothing dev-only (no adminer, no separate frontend: ADR-0004)"
    _assert_openaleph_setup_runs_first(services)
    _assert_render_service(services, production=True)
    for name in openaleph:
        assert "profiles" not in services[name] and services[name].get("restart") == "unless-stopped", name
        if name != "ui":
            assert "ports" not in services[name], f"{name} stays on the internal network"
    assert services["ui"]["ports"] == ["${BIND_ADDRESS:-127.0.0.1}:8080:8080"]
    assert services["backend"]["environment"]["OPENALEPH_ENABLED"] == "true"
    assert services["backend"]["environment"]["OPENALEPH_BASE_URL"] == "http://api:8000"
    assert "api" not in services["backend"]["depends_on"], "the workbench must come up even while OpenAleph is still pulling/starting"

    assert "ports" not in services["workbench-db"], "database must not be published on the host"
    assert services["backend"].get("restart") == "unless-stopped"
    for mapping in services["backend"]["ports"]:
        assert mapping.startswith("${BIND_ADDRESS:-127.0.0.1}:"), mapping
    assert not any(v.startswith("./") for v in services["backend"].get("volumes", [])), "no source bind-mount in production"
    assert "workbench-data:/app/data" in services["backend"]["volumes"]
    assert set(compose["volumes"]) == {"workbench-pgdata", "workbench-data", "openaleph-pgdata", "openaleph-elasticsearch-data", "openaleph-redis-data", "openaleph-archive"}

    env = services["backend"]["environment"]
    for required in ("POSTGRES_PASSWORD", "API_AUTH_TOKEN", "PUBLIC_ORIGIN", "PUBLIC_OPENALEPH_URL", "OPENALEPH_SECRET_KEY", "OPENALEPH_DB_PASSWORD"):
        assert re.search(r"\$\{" + required + r":\?", text), f"{required} must be required (${{VAR:?...}}), not defaulted"
    assert "docker-compose-local-dev-token" not in text and "journalism-local-dev" not in text and "journalism-openaleph-dev" not in text
    assert "postgresql://aleph:aleph@" not in text, "the dev OpenAleph database password must not ship in production"
    assert env["ENABLE_RESTORE_API"] == "${ENABLE_RESTORE_API:-false}"
    assert env["AUDIT_LOG_FILE"].startswith("/app/data/") and env["API_AUTH_FAILURE_STATE_FILE"].startswith("/app/data/")
    assert "NEXT_PUBLIC_API_AUTH_TOKEN" not in text, "the shared token must not be baked into the public bundle"
    assert services["backend"]["build"] == {"context": ".", "dockerfile": "backend/Dockerfile"}, "no build args: nothing baked into the screen"
    assert (root / "DEPLOYMENT.md").read_text(encoding="utf-8").count("alembic downgrade") >= 1, "runbook must cover schema rollback"
