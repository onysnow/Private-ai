"""Passphrase-protected backups (ADR-0015; research Keep §8 "a passphrase-encrypted archive", Part 1 fact 5).

A protected backup is the ordinary .jwbackup.zip (manifest with a SHA-256 per file inside) sealed whole with
AES-256-GCM under a key made from the reporter's passphrase with scrypt and a random salt. The container is:

    MAGIC (16 bytes) | version (1 byte) | salt (16 bytes) | nonce (12 bytes) | ciphertext + 16-byte tag

The header is the authenticated data, so a wrong passphrase, a changed header or a changed byte anywhere in the
ciphertext all fail the same clean way (the tag does not match). The passphrase is never stored, logged or
returned: it is used to make the key and dropped.
"""
from __future__ import annotations

import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

MAGIC = b"JWBACKUP-SEALED\n"
VERSION = 1
SALT_BYTES = 16
NONCE_BYTES = 12
TAG_BYTES = 16
HEADER_BYTES = len(MAGIC) + 1 + SALT_BYTES + NONCE_BYTES
# Version 1's scrypt cost is fixed (not read from the file), so a crafted file cannot ask for a huge one.
SCRYPT_N = 2**17
SCRYPT_R = 8
SCRYPT_P = 1

PASSPHRASE_REQUIRED = "This backup is protected with a passphrase. Enter the passphrase to open it."
PASSPHRASE_WRONG = "The passphrase is wrong, or the backup file was changed after it was made. Nothing was opened."
PASSPHRASE_EMPTY = "The passphrase is empty. Type one, or choose to save the backup without a passphrase."


class BackupPassphraseError(ValueError):
    """A protected backup could not be opened: no passphrase, a wrong one, or a changed file. The message is plain
    words for the reporter and never contains the passphrase."""


def is_sealed(data: bytes) -> bool:
    return data[: len(MAGIC)] == MAGIC


def _key(passphrase: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P).derive(passphrase.encode("utf-8"))


def seal(data: bytes, passphrase: str) -> bytes:
    if not passphrase or not passphrase.strip():
        raise BackupPassphraseError(PASSPHRASE_EMPTY)
    salt = os.urandom(SALT_BYTES)
    nonce = os.urandom(NONCE_BYTES)
    header = MAGIC + bytes([VERSION]) + salt + nonce
    return header + AESGCM(_key(passphrase, salt)).encrypt(nonce, data, header)


def unseal(data: bytes, passphrase: str | None) -> bytes:
    """The archive inside a protected backup. An ordinary (unprotected) backup is returned as it is, so old backups
    still restore; a passphrase sent with one is ignored."""
    if not is_sealed(data):
        return data
    if not passphrase:
        raise BackupPassphraseError(PASSPHRASE_REQUIRED)
    if len(data) < HEADER_BYTES + TAG_BYTES:
        raise BackupPassphraseError(PASSPHRASE_WRONG)
    version = data[len(MAGIC)]
    if version != VERSION:
        raise BackupPassphraseError("This protected backup was made by a newer version of the app and cannot be opened here.")
    salt_at = len(MAGIC) + 1
    salt = data[salt_at:salt_at + SALT_BYTES]
    nonce = data[salt_at + SALT_BYTES:HEADER_BYTES]
    header = data[:HEADER_BYTES]
    try:
        return AESGCM(_key(passphrase, salt)).decrypt(nonce, data[HEADER_BYTES:], header)
    except InvalidTag:
        raise BackupPassphraseError(PASSPHRASE_WRONG) from None
