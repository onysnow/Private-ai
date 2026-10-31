"""Signing evidence packs (DECISIONS_LOG 3): one Ed25519 key for this computer, made the first time it is needed and
kept in the local profile (ADR-0016: the disk's encryption protects it at rest; it is never in a case backup). A pack
carries MANIFEST.sha256.sig (the raw signature over MANIFEST.sha256) and PUBLIC_KEY.pem, so anyone can check it with
`openssl pkeyutl -verify -pubin -inkey PUBLIC_KEY.pem -rawin -in MANIFEST.sha256 -sigfile MANIFEST.sha256.sig`.

A signature shows the list was made with this key and not changed since; it says who only as far as the key is known
to be theirs, which is why the fingerprint is shown in Settings to be given out with the pack."""

from __future__ import annotations

import base64
import hashlib

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from sqlalchemy.orm import Session

from app.core.time import utcnow_naive


def fingerprint(public_raw: bytes) -> str:
    """The SHA-256 of the raw public key, first 16 bytes, in groups of four: what a person reads aloud to compare."""
    h = hashlib.sha256(public_raw).hexdigest()[:32]
    return " ".join(h[i:i + 4] for i in range(0, 32, 4))


def _raw(public: Ed25519PublicKey) -> bytes:
    return public.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)


def key(db: Session) -> Ed25519PrivateKey:
    """This computer's signing key, made the first time."""
    from app.services.app_lock import profile

    row = profile(db)
    if not row.signing_secret:
        made = Ed25519PrivateKey.generate()
        row.signing_secret = base64.b64encode(made.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                                                                 serialization.NoEncryption())).decode()
        row.signing_public = base64.b64encode(_raw(made.public_key())).decode()
        row.signing_created_at = utcnow_naive()
        db.commit()
    return Ed25519PrivateKey.from_private_bytes(base64.b64decode(row.signing_secret))


def public(db: Session) -> dict:
    """This computer's public key for Settings: its fingerprint and when it was made (None before the first pack)."""
    from app.services.app_lock import profile

    row = profile(db)
    if not row.signing_public:
        return {"fingerprint": None, "created_at": None}
    return {"fingerprint": fingerprint(base64.b64decode(row.signing_public)), "created_at": row.signing_created_at}


def sign(db: Session, manifest: bytes) -> tuple[bytes, bytes, str]:
    """(signature, PUBLIC_KEY.pem, fingerprint) for a pack's MANIFEST.sha256."""
    private = key(db)
    pem = private.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    return private.sign(manifest), pem, fingerprint(_raw(private.public_key()))


def verify(db: Session, manifest: bytes, signature: bytes | None, pem: bytes | None) -> dict:
    """What a pack's signature shows: none, invalid, or valid; and whether the key is this computer's."""
    if not signature or not pem:
        return {"state": "none", "fingerprint": None, "ours": False}
    try:
        loaded = serialization.load_pem_public_key(pem)
    except ValueError:
        return {"state": "invalid", "fingerprint": None, "ours": False}
    if not isinstance(loaded, Ed25519PublicKey):
        return {"state": "invalid", "fingerprint": None, "ours": False}
    from app.services.app_lock import profile

    row = profile(db)
    ours = bool(row.signing_public) and base64.b64decode(row.signing_public or "") == _raw(loaded)
    try:
        loaded.verify(signature, manifest)
        state = "valid"
    except InvalidSignature:
        state = "invalid"
    return {"state": state, "fingerprint": fingerprint(_raw(loaded)), "ours": ours}
