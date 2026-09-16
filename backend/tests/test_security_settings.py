import io, json, zipfile
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.services.exports import inspect_export
from app.services.security import contained_path, redact_database_url

client = TestClient(app)

def test_settings_status_redacts_secrets(monkeypatch):
    monkeypatch.setattr(settings, 'aleph_api_key', 'super-secret')
    monkeypatch.setattr(settings, 'opensanctions_api_key', 'other-secret')
    monkeypatch.setattr(settings, 'database_url', 'postgresql://user:pass@db.example:5432/news?sslmode=require')
    r = client.get('/api/settings/status')
    assert r.status_code == 200
    raw = r.text
    assert 'super-secret' not in raw and 'other-secret' not in raw and 'pass' not in raw
    body = r.json()
    assert body['connectors']['aleph']['configured'] is True
    assert body['database'] == 'postgresql://db.example:5432/news'

def test_restore_api_disabled_by_default():
    if settings.enable_restore_api:
        return
    r = client.post('/api/backups/restore', files={'file': ('x.zip', b'not-a-backup', 'application/zip')})
    assert r.status_code == 403

def test_contained_path_rejects_escape(tmp_path):
    try:
        contained_path(tmp_path, '..', 'escape.txt')
    except ValueError:
        pass
    else:
        raise AssertionError('Traversal should be rejected')

def test_backup_rejects_unsafe_archive_path():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('../evil.txt', b'x')
        zf.writestr('manifest.json', json.dumps({'format':'journalism-workbench-investigation','version':1,'checksums':{}}))
        zf.writestr('data/database.json', '{}')
    try:
        inspect_export(buf.getvalue())
    except ValueError as exc:
        assert 'unsafe archive path' in str(exc)
    else:
        raise AssertionError('Unsafe archive path should be rejected')

def test_redact_database_url_never_returns_credentials():
    value = redact_database_url('postgresql://alice:s3cret@localhost:5432/journalism?sslmode=require')
    assert value == 'postgresql://localhost:5432/journalism'
