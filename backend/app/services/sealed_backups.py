"""Encrypted backups (ADR-0016): age, through pyrage.

With a passphrase set, every backup is encrypted to this computer's backup key (its public half needs no secret,
so the app and the operator console can make backups without asking). The sealed file is a small zip holding:

    sealed.json                  what it is, and when it was sealed
    backup.jwbackup.zip.age      the ordinary backup, encrypted to the backup key
    key.by-passphrase.age        the backup key's secret half, encrypted with the passphrase of that day
    key.by-recovery-words.age    the same, encrypted with the recovery words of that day

so it opens on any computer with either secret, even after this one is gone.
"""
from __future__ import annotations

import base64
import io
import json
import zipfile

from sqlalchemy.orm import Session

from app.core.time import utcnow_iso
from app.services import app_lock

FORMAT = "jwbackup-sealed"
ENCRYPTED_NOTICE = "This backup is encrypted. Give the passphrase, or the recovery words, of the day it was made."


def seal(db: Session, data: bytes) -> tuple[bytes, bool]:
    """The backup sealed when a passphrase is set; otherwise as it is. Returns (bytes, sealed)."""
    from pyrage import encrypt, x25519

    row = app_lock.profile(db)
    if row.protection != "passphrase" or not row.backup_recipient or not row.identity_by_passphrase:
        return data, False
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("sealed.json", json.dumps({"format": FORMAT, "version": 1, "sealed_at": utcnow_iso(),
                                               "recipient": row.backup_recipient}, indent=2))
        zf.writestr("backup.jwbackup.zip.age", encrypt(data, [x25519.Recipient.from_str(row.backup_recipient)]))
        zf.writestr("key.by-passphrase.age", base64.b64decode(row.identity_by_passphrase))
        if row.identity_by_recovery:
            zf.writestr("key.by-recovery-words.age", base64.b64decode(row.identity_by_recovery))
    return buf.getvalue(), True


def is_sealed(data: bytes) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            return "sealed.json" in zf.namelist() and json.loads(zf.read("sealed.json")).get("format") == FORMAT
    except (zipfile.BadZipFile, ValueError, KeyError):
        return False


def open_sealed(data: bytes, secret: str | None) -> bytes:
    """The ordinary backup inside a sealed one, opened with the passphrase or the recovery words of its day."""
    from pyrage import decrypt, passphrase, x25519

    if not secret:
        raise ValueError(ENCRYPTED_NOTICE)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()
        attempts = [("key.by-passphrase.age", secret)]
        if "key.by-recovery-words.age" in names:
            attempts.append(("key.by-recovery-words.age", " ".join(secret.lower().split())))
        identity = None
        for name, by in attempts:
            try:
                identity = passphrase.decrypt(zf.read(name), by).decode()
                break
            except Exception:  # pyrage's DecryptError: not this one
                continue
        if identity is None:
            raise ValueError("That does not open this backup: it needs the passphrase, or the recovery words, of the day it was made.")
        opened: bytes = decrypt(zf.read("backup.jwbackup.zip.age"), [x25519.Identity.from_str(identity)])
        return opened
