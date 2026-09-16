from app.core.access import bearer_token, decide_api_access, is_loopback_host, request_is_local


def test_loopback_hosts_are_local_without_credentials():
    for host in ("127.0.0.1", "127.12.34.56", "::1", "localhost", "testclient"):
        assert is_loopback_host(host)
        assert decide_api_access(client_host=host, target_host=host, authorization=None, configured_token="").allowed


def test_remote_api_is_disabled_without_explicit_token():
    decision = decide_api_access(client_host="192.168.1.20", authorization=None, configured_token="")
    assert not decision.allowed
    assert decision.status_code == 403
    assert not decision.authenticate


def test_remote_api_requires_exact_bearer_token():
    wrong = decide_api_access(
        client_host="10.0.0.2",
        authorization="Bearer wrong",
        configured_token="correct-horse-battery-staple",
    )
    assert not wrong.allowed
    assert wrong.status_code == 401
    assert wrong.authenticate

    right = decide_api_access(
        client_host="10.0.0.2",
        authorization="Bearer correct-horse-battery-staple",
        configured_token="correct-horse-battery-staple",
    )
    assert right.allowed


def test_bearer_parser_rejects_other_schemes_and_blank_values():
    assert bearer_token(None) == ""
    assert bearer_token("Basic abc") == ""
    assert bearer_token("Bearer   ") == ""
    assert bearer_token("bearer abc") == "abc"


def test_local_reverse_proxy_does_not_bypass_remote_auth_policy():
    decision = decide_api_access(
        client_host="127.0.0.1",
        target_host="journalism.example.com",
        authorization=None,
        configured_token="",
    )
    assert not decision.allowed
    assert decision.status_code == 403

    authenticated = decide_api_access(
        client_host="127.0.0.1",
        target_host="journalism.example.com",
        authorization="Bearer secret",
        configured_token="secret",
    )
    assert authenticated.allowed


def test_fastapi_middleware_denies_remote_target_without_token():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import enforce_api_access

    app = FastAPI()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        denial = await enforce_api_access(request, "")
        if denial is not None:
            return denial
        return await call_next(request)

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    with TestClient(app, base_url="http://journalism.example.com") as client:
        response = client.get("/api/ping")
    assert response.status_code == 403


def test_fastapi_middleware_allows_remote_target_with_bearer_token():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import enforce_api_access

    app = FastAPI()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        denial = await enforce_api_access(request, "secret")
        if denial is not None:
            return denial
        return await call_next(request)

    @app.get("/api/ping")
    def ping():
        return {"ok": True}

    with TestClient(app, base_url="http://journalism.example.com") as client:
        denied = client.get("/api/ping")
        allowed = client.get("/api/ping", headers={"Authorization": "Bearer secret"})
    assert denied.status_code == 401
    assert denied.headers["www-authenticate"] == "Bearer"
    assert allowed.status_code == 200
    assert allowed.json() == {"ok": True}


def test_local_only_operations_require_local_peer_and_local_target():
    assert request_is_local(client_host="127.0.0.1", target_host="localhost")
    assert request_is_local(client_host="::1", target_host="127.0.0.1")

    # Same-host reverse proxies must not confer local-only privileges on public requests.
    assert not request_is_local(client_host="127.0.0.1", target_host="journalism.example.com")
    assert not request_is_local(client_host="::1", target_host="journalism.example.com")
    assert not request_is_local(client_host="192.168.1.50", target_host="localhost")


def test_sensitive_api_operations_are_covered_by_remote_bearer_guard():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import enforce_api_access

    app = FastAPI()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        denial = await enforce_api_access(request, "secret")
        if denial is not None:
            return denial
        return await call_next(request)

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def probe(path: str):
        return {"path": path}

    sensitive = [
        ("GET", "/api/investigations/example/deletion-preview"),
        ("DELETE", "/api/investigations/example?confirmation=example"),
        ("GET", "/api/investigations/example/export"),
        ("POST", "/api/backups/preview"),
        ("POST", "/api/backups/restore"),
        ("GET", "/api/settings/status"),
        ("PUT", "/api/settings/connectors/aleph/credential"),
        ("DELETE", "/api/settings/connectors/aleph/credential"),
        ("GET", "/api/settings/storage/orphans"),
    ]

    with TestClient(app, base_url="http://journalism.example.com") as client:
        for method, path in sensitive:
            denied = client.request(method, path)
            assert denied.status_code == 401, (method, path, denied.text)
            allowed = client.request(method, path, headers={"Authorization": "Bearer secret"})
            assert allowed.status_code == 200, (method, path, allowed.text)


def test_request_aware_local_check_is_downgraded_by_forwarded_remote_hop():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import request_is_local_request

    app = FastAPI()

    @app.get("/probe")
    def probe(request: Request):
        return {"local": request_is_local_request(request)}

    with TestClient(app, base_url="http://localhost") as client:
        assert client.get("/probe").json()["local"] is True
        assert client.get("/probe", headers={"X-Forwarded-For": "203.0.113.9"}).json()["local"] is False
        assert client.get("/probe", headers={"Forwarded": "for=203.0.113.9;host=localhost"}).json()["local"] is False
        assert client.get("/probe", headers={"X-Forwarded-Host": "journalism.example.com"}).json()["local"] is False
        assert client.get("/probe", headers={"Origin": "https://journalism.example.com"}).json()["local"] is False


def test_forwarded_headers_can_only_revoke_never_grant_local_trust():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import request_is_local_request

    app = FastAPI()

    @app.get("/probe")
    def probe(request: Request):
        return {"local": request_is_local_request(request)}

    with TestClient(app, base_url="http://journalism.example.com") as client:
        response = client.get(
            "/probe",
            headers={"X-Forwarded-For": "127.0.0.1", "X-Forwarded-Host": "localhost"},
        )
    assert response.json()["local"] is False


def test_browser_write_guard_blocks_cross_site_and_unlisted_origins():
    from app.core.access import decide_browser_write_access

    allowed = ["http://localhost:3000", "https://journalism.example.com"]
    assert decide_browser_write_access(method="GET", origin="https://evil.example", sec_fetch_site="cross-site", allowed_origins=allowed).allowed

    cross_site = decide_browser_write_access(
        method="POST", origin="https://evil.example", sec_fetch_site="cross-site", allowed_origins=allowed
    )
    assert not cross_site.allowed and cross_site.status_code == 403

    wrong_origin = decide_browser_write_access(
        method="POST", origin="https://evil.example", sec_fetch_site="same-site", allowed_origins=allowed
    )
    assert not wrong_origin.allowed and wrong_origin.status_code == 403

    good_origin = decide_browser_write_access(
        method="DELETE", origin="https://journalism.example.com/", sec_fetch_site="same-origin", allowed_origins=allowed
    )
    assert good_origin.allowed


    invalid_origin = decide_browser_write_access(
        method="POST", origin="http://localhost:not-a-port", sec_fetch_site="same-site", allowed_origins=allowed
    )
    assert not invalid_origin.allowed and invalid_origin.status_code == 403

    cli = decide_browser_write_access(method="POST", origin=None, sec_fetch_site=None, allowed_origins=allowed)
    assert cli.allowed


def test_browser_write_middleware_blocks_cross_origin_multipart_before_route_execution():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import enforce_browser_write_access

    app = FastAPI()
    calls = {"count": 0}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        denial = await enforce_browser_write_access(request, ["http://localhost:3000"])
        if denial is not None:
            return denial
        return await call_next(request)

    @app.post("/api/upload")
    async def upload():
        calls["count"] += 1
        return {"ok": True}

    with TestClient(app, base_url="http://localhost") as client:
        denied = client.post(
            "/api/upload",
            headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
            files={"file": ("lead.txt", b"untrusted")},
        )
        assert denied.status_code == 403
        assert calls["count"] == 0

        allowed = client.post(
            "/api/upload",
            headers={"Origin": "http://localhost:3000", "Sec-Fetch-Site": "same-site"},
            files={"file": ("lead.txt", b"trusted")},
        )
        assert allowed.status_code == 200
        assert calls["count"] == 1


def test_auth_and_browser_write_guards_compose_for_remote_requests():
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.core.access import enforce_api_access, enforce_browser_write_access

    app = FastAPI()
    calls = {"count": 0}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        denial = await enforce_api_access(request, "secret")
        if denial is not None:
            return denial
        denial = await enforce_browser_write_access(request, ["https://journalism.example.com"])
        if denial is not None:
            return denial
        return await call_next(request)

    @app.post("/api/restore")
    async def restore():
        calls["count"] += 1
        return {"ok": True}

    with TestClient(app, base_url="https://journalism.example.com") as client:
        unauthenticated = client.post(
            "/api/restore",
            headers={"Origin": "https://journalism.example.com"},
            files={"backup": ("backup.zip", b"x")},
        )
        assert unauthenticated.status_code == 401

        cross_site = client.post(
            "/api/restore",
            headers={
                "Authorization": "Bearer secret",
                "Origin": "https://evil.example",
                "Sec-Fetch-Site": "cross-site",
            },
            files={"backup": ("backup.zip", b"x")},
        )
        assert cross_site.status_code == 403
        assert calls["count"] == 0

        allowed = client.post(
            "/api/restore",
            headers={
                "Authorization": "Bearer secret",
                "Origin": "https://journalism.example.com",
                "Sec-Fetch-Site": "same-origin",
            },
            files={"backup": ("backup.zip", b"x")},
        )
        assert allowed.status_code == 200
        assert calls["count"] == 1
