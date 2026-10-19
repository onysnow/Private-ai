"""Covers STRUCT-0029: the Docker HEALTHCHECK in backend/Dockerfile (the one
image since ADR-0004) relies on GET /api/health being reachable from an
unauthenticated, local (loopback) caller -- exactly how the healthcheck
command runs inside the container. Nothing previously verified this.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_is_reachable_without_auth():
    r = client.get('/api/health')
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
