# ADR-0015: Passphrase-protected backups

**Status:** Accepted (2026-10-19)
**Deciders:** Ony (encrypted by default, research Part 6 question 4); Claude, building it (research Keep §8 "Needs", Part 5)

## Context

Backups were checksummed but not encrypted (research Part 1 fact 5: `app/services/exports.py`, SHA-256 per file in
the manifest), and always include the document files. Whoever holds the file can read the whole case. Research Keep §8
asks for "a choice 'Protect with a passphrase' (proposed default on)" and names "a passphrase-encrypted archive —
encryption with an existing library (e.g. Python `cryptography`, if not already a dependency)" as an ADR. Part 5:
"Backup encryption (passphrase): crypto library on the server [ADR] if not already present." It was not present.
Ony decided: encrypted by default.

## Decision

- **Library:** Python `cryptography` 50.0.2 (Apache-2.0 OR BSD-3-Clause; pinned in `backend/requirements.txt`, which
  the Dockerfile and every CI requirements file build on). It is maintained by the Python Cryptographic Authority and
  wraps OpenSSL; no cipher code is written in the app.
- **Cipher:** AES-256-GCM over the whole archive. The archive is the existing `.jwbackup.zip` unchanged, its
  checksum manifest inside, so the existing checks still run after it is opened.
- **Key:** scrypt from the passphrase (UTF-8) with a random 16-byte salt, n = 2^17, r = 8, p = 1, 32 bytes. The cost is
  fixed for version 1 and not read from the file, so a crafted file cannot ask for a huge one.
- **Container** (`app/services/backup_crypto.py`): `JWBACKUP-SEALED\n` (16 bytes) · version (1 byte, 1) · salt (16) ·
  nonce (12, random) · ciphertext with its 16-byte tag. The header is the authenticated data, so a wrong passphrase, a
  changed header and a changed byte anywhere fail the same way: "The passphrase is wrong, or the backup file was
  changed after it was made. Nothing was opened." (400). GCM cannot tell a wrong passphrase from a changed file, and
  the message says both.
- **Where it applies:** `POST /api/investigations/{id}/safety/backup` takes `{"passphrase": …}` in its body (null
  saves without one, an explicit choice on screen) and records `backup_events.encrypted` (migration f3b9d2a7c615), so
  the Safety & data Backup card says whether the last backup was protected. `POST /api/backups/inspect`, `…/preview`
  and `…/restore` take `passphrase` as a form field beside the file. A file that starts with the header needs it
  ("This backup is protected with a passphrase. Enter the passphrase to open it."); an unprotected backup opens as
  before, so old backups still restore.
- **The passphrase is never kept:** never in a query string (request logs record paths), never logged, stored,
  returned or written to the outbound log or the backup record; it makes the key and is dropped. Tests check the logs,
  the security audit log, the outbound log and the backup record (`tests/test_backup_passphrase.py`).
- **No recovery:** a lost passphrase loses the backup. The screen says so before saving: "If you lose this passphrase,
  nobody can open this backup — not even you."

## Not changed

`GET /api/investigations/{id}/export` (the old download, kept for API callers) and the operator console's server-side
backups (`app/console_adapters.py`, kept in the server's own backup folder) still write unprotected archives. The
screens now back up through `…/safety/backup`.
