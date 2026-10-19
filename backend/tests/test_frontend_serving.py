"""ADR-0004: the API serves the Next.js workbench's static export at "/".

One screen, one origin. The export is a catch-all mount, so these tests pin
down that it never shadows what the API owns: /api/* keeps its JSON
answers (including JSON 404s for unknown API paths), and /docs and the
operator console still resolve to the API.
"""

from fastapi.testclient import TestClient

import app.main as main_module
from app.core.config import Settings
from app.web.frontend import resolve_frontend_dist


def _export(tmp_path):
    """A minimal stand-in for `next build`'s out/ folder (trailingSlash: true)."""
    dist = tmp_path / "out"
    (dist / "review" / "batch").mkdir(parents=True)
    (dist / "console").mkdir()
    (dist / "console" / "index.html").write_text("<html>CONSOLE WRAPPER PAGE</html>")
    (dist / "_next" / "static").mkdir(parents=True)
    (dist / "index.html").write_text("<html>WORKBENCH HOME</html>")
    (dist / "review" / "index.html").write_text("<html>REVIEW PAGE</html>")
    (dist / "review" / "batch" / "index.html").write_text("<html>BATCH PAGE</html>")
    (dist / "404.html").write_text("<html>NOT FOUND PAGE</html>")
    (dist / "_next" / "static" / "app.js").write_text("console.log('bundle')")
    return dist


def _client(settings):
    return TestClient(main_module.create_app(settings, bootstrap_schema=False))


def test_serves_the_workbench_pages_and_assets(tmp_path):
    client = _client(Settings(frontend_dist_dir=str(_export(tmp_path))))
    home = client.get("/")
    assert home.status_code == 200 and "WORKBENCH HOME" in home.text
    assert "text/html" in home.headers["content-type"]
    assert "REVIEW PAGE" in client.get("/review/").text
    assert "BATCH PAGE" in client.get("/review/batch/").text
    redirect = client.get("/review", follow_redirects=False)
    assert redirect.status_code in (301, 307) and redirect.headers["location"].endswith("/review/")
    assert client.get("/_next/static/app.js").text == "console.log('bundle')"
    missing = client.get("/no-such-page/")
    assert missing.status_code == 404 and "NOT FOUND PAGE" in missing.text


def test_api_paths_never_fall_through_to_the_workbench(tmp_path):
    client = _client(Settings(frontend_dist_dir=str(_export(tmp_path))))
    assert client.get("/api/health").json() == {"status": "ok"}
    for method in ("get", "post", "delete"):
        response = getattr(client, method)("/api/no-such-endpoint")
        assert response.status_code == 404, method
        assert response.headers["content-type"].startswith("application/json"), method
        assert response.json() == {"detail": "Not Found"}, method
    assert client.get("/api").status_code == 404
    assert client.get("/api").headers["content-type"].startswith("application/json")


def test_docs_and_operator_console_still_belong_to_the_api(tmp_path):
    client = _client(Settings(frontend_dist_dir=str(_export(tmp_path))))
    assert client.get("/openapi.json").json()["info"]["title"] == "Journalism Workbench API"
    assert "swagger" in client.get("/docs").text.lower()
    # /console is the operator console itself, framable by its own origin...
    console = client.get("/console")
    assert console.status_code == 200 and "CONSOLE WRAPPER PAGE" not in console.text
    assert console.headers["x-frame-options"] == "SAMEORIGIN"
    assert client.get("/console/console.js").status_code == 200
    # ...and /console/ (where the workbench's trailing-slash links go) is the
    # workbench page that embeds it, so the console keeps the app's navigation.
    assert "CONSOLE WRAPPER PAGE" in client.get("/console/").text


def test_without_a_build_the_root_explains_how_to_get_one(tmp_path):
    client = _client(Settings(frontend_dist_dir=str(tmp_path / "missing")))
    response = client.get("/")
    assert response.status_code == 503
    assert "isn't built yet" in response.text and "npm run build" in response.text
    assert client.get("/api/health").json() == {"status": "ok"}


def test_resolve_frontend_dist_requires_an_index_page(tmp_path):
    assert resolve_frontend_dist(str(tmp_path)) is None, "an empty folder is not a build"
    assert resolve_frontend_dist(str(_export(tmp_path))) == tmp_path / "out"
