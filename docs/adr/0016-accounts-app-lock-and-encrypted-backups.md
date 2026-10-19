# ADR-0016: Your name, the app lock, locked cases and encrypted backups

**Status:** Accepted (2026-10-19)
**Deciders:** Ony (mockups ACCOUNT_1–4 approved 19 Oct; "BitLocker plus small tools" chosen 19 Oct), Claude

## Context

Decisions now keep who made them (PR #88), but on this computer the app knows its owner only as `local-owner`,
so they say "a person". Ony asked for an account, then for more than a PIN. The research
(`docs/research/accounts-and-locking-tools.md`) found that encrypting the case data inside the app would need a
different tool for each way the app runs (SQLCipher for SQLite, Percona's patched PostgreSQL for `pg_tde`) and
would still leave documents, OpenAleph, Docker's disk image and temporary files readable, while Windows' own disk
encryption covers all of it with no code in the app.

## Decision

1. **The disk is Windows' job.** The app does not encrypt its databases. It says whether the disk it runs from is
   encrypted (BitLocker / Device encryption on Windows, FileVault on macOS, dm-crypt on Linux) and links to how to
   turn it on; where it cannot tell (inside Docker, or a check that needs administrator rights), it says so and
   asks instead of claiming a status (`app/services/disk_encryption.py`).
2. **Your name** is kept in a one-row `local_profile` table and stamped on decisions made from this computer
   (`app/db/decided_by.py`). It is never filled in for anyone, and decisions made before it was kept stay
   "a person".
3. **The app lock** ("Protect with a passphrase") is enforced by the server, not drawn over the screen:
   - the passphrase is never stored; an **Argon2id** hash checks it (`argon2-cffi` 25.1.0, MIT);
   - unlocking gives this browser a session key, sent as `X-Workbench-Session`; while a passphrase is set, a
     request from this computer without an unlocked session gets **423 Locked** (except health, the session
     endpoints and the static screen);
   - sessions live in the server's memory: a restart, the idle time, Hide screen or the laptop sleeping lock
     them; a **quick PIN** (also Argon2id) reopens a session that was unlocked with the passphrase since the
     server started, until 3 wrong tries;
   - a **recovery key** of 12 BIP-39 words with a checksum (`mnemonic` 0.21, Trezor's reference implementation,
     MIT) is shown once; it unlocks and then asks for a new passphrase.
4. **Encrypted backups** use **age** (`pyrage` 1.4.0, MIT, Python bindings to the Rust `rage`). Setting the
   passphrase makes an age key pair; its secret half is stored only encrypted twice, with the passphrase and with
   the recovery words (age's own scrypt passphrase mode). Backups are encrypted to the public half, so the app and
   the operator console can make them without asking; each backup carries both wrapped secrets, so it can be
   restored on any computer with the passphrase or the recovery words of the day it was made.
5. **A case locked on its own** has its own passphrase (Argon2id hash on the case). Until it is unlocked in this
   session it is outside the request's authorization scope, so every endpoint treats it as absent, and the case
   list leaves it out. Its records stay in the shared database: what protects them at rest is the disk
   encryption (1). Encrypting a locked case's stored files is not done here.
6. **Screens:** idle detection across tabs with `react-idle-timer` 5.7.3 (MIT); passphrase strength with
   `@zxcvbn-ts/core` 4.2.0 and its common and English word lists (MIT). People and access stays on the app's own
   accounts (ADR-0002); per-person keys gain an expiry (30 or 90 days) and a two-character hint.

## Not done here

- Encrypting a locked case's stored documents (pyrage per case) and per-case databases.
- Windows Hello / passkeys (needs the https setup; dropped for now by Ony).
- The operator console (`/console`, loopback only, ADR-0003) does not ask for the app lock.
