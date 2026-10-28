# Accounts, encryption and locking: what to use instead of building it (19 Oct 2026)

For the approved mockups ACCOUNT_1–4. For each part: the ready-made tool, what it covers, and what it cannot.
Checked by web search on 19 Oct 2026 (sources at the end); nothing here is installed or tried yet.

## The finding that changes the plan

Ony runs the app three ways: Docker (PostgreSQL 16 in a Docker volume), developer mode with SQLite
(`journalism.db`), and developer mode with a local PostgreSQL. Encrypting "the case data" inside the app means a
different tool for each, and none covers everything the app writes:

- **SQLite:** SQLCipher encrypts the database file. Python bindings exist with Windows wheels
  (`sqlcipher3-wheels`, unofficial fork, Jan 2026; the official `sqlcipher3-binary` lists Linux wheels only).
- **PostgreSQL:** no encryption in community PostgreSQL. Percona's `pg_tde` (open source, called production-ready
  by Percona) needs Percona's patched PostgreSQL server, so the Docker image would change.
- **Not covered by either:** stored documents and pictures, OpenAleph's own PostgreSQL and Elasticsearch, Docker's
  disk image, temporary files, Windows' page file, browser caches.

**Windows' own disk encryption (BitLocker, or "Device encryption" on Windows Home) covers all of that at once,
with no code in the app**, including Docker Desktop's disk image and OpenAleph. For "someone takes the laptop", it
is the right tool, and it is stronger than anything the app could add.

So what the app should add is the part the operating system cannot do:

| Need (mockup) | Use | Instead of building |
|---|---|---|
| Laptop seized or stolen (ACCOUNT_1, ACCOUNT_3) | **BitLocker / Device encryption**: the app checks for it where it can, says plainly whether the disk is encrypted, and links to how to turn it on | Encrypting each database ourselves |
| Backups that leave the computer (ACCOUNT_3 "backups made from now on") | **age** encryption via **pyrage** (Python bindings to the Rust `rage`, MIT): a passphrase-encrypted archive | Our own archive encryption |
| One sensitive case (ACCOUNT_4 "cases locked on their own") | **age/pyrage** for that case's stored files, plus hiding it in the app until unlocked | See the limit below |
| Passphrase check, PIN (ACCOUNT_1, ACCOUNT_4) | **argon2-cffi** (Argon2id): stores a hash only, never the passphrase or PIN | Our own hashing |
| Recovery key (ACCOUNT_3) | **python-mnemonic** (Trezor's BIP-39 reference, MIT): words with a built-in checksum, so a mistyped word is caught | Our own code format |
| Passphrase strength (ACCOUNT_3) | **@zxcvbn-ts/core** (MIT): rates passphrases by real patterns, words and dates | Our own meter |
| Lock when idle, in every tab (ACCOUNT_4) | **react-idle-timer** v5: idle detection, a warning before lock, synced across tabs | Our own timers |
| Sign-in and roles (ACCOUNT_2) | **Keep the app's own accounts** (`AppUser`, memberships, per-person keys, ADR-0002). `fastapi-users` is in maintenance mode in 2026 and brings registration and email flows the app does not need | Adding an auth framework |

## Limits to decide on

1. **A locked case is not encrypted in the database.** All cases share one database, so a per-case lock can encrypt
   that case's files (age) and keep the case closed in the app, but its records, claims and notes are still in the
   shared database, readable by anyone who can read the database file. Real per-case encryption would need each
   case in its own database file. With BitLocker on, the database is protected at rest anyway; the per-case lock
   then protects against someone using the unlocked laptop.
2. **Whether the app can see if BitLocker is on** without administrator rights is not checked yet. If it cannot, the
   first-open screen asks and links to Windows' own setting instead of claiming a status.
3. **The ACCOUNT_3 screen changes in wording**: "Encrypt with a passphrase" becomes "Protect with a passphrase" for
   the app lock, locked cases and backups, with the disk encryption shown as its own line ("This disk: encrypted by
   Windows" or "not encrypted: turn on Device encryption ›"). The approved layout stays.

## Not recommended

- **SQLCipher + pg_tde together**: two encryption systems, a patched PostgreSQL image, and still no cover for
  documents, OpenAleph or temp files.
- **Windows Hello / passkeys** (`py_webauthn`): needs the https setup; dropped for now (Ony, 19 Oct).
- **Our own crypto** of any kind.

## Sources

- sqlcipher3-wheels: https://www.pypi.org/project/sqlcipher3-wheels · https://github.com/laggykiller/sqlcipher3 · https://github.com/coleifer/sqlcipher3/blob/master/README.md
- pg_tde: https://www.percona.com/blog/the-pg_tde-extension-is-now-ready-for-production/ · https://www.postgresql.eu/events/pgconfde2026/sessions/session/7747/slides/871/03%20Jan%20Wieremjewicz%20-%20Status%20update%20on%20TDE%20in%20PG.pdf
- pyrage: https://pypi.org/project/pyrage/1.2.1 · https://blog.yossarian.net/2022/07/25/age-encryption-in-python-with-pyrage
- argon2-cffi: https://argon2-cffi.readthedocs.io/en/23.1.0/api.html
- python-mnemonic: https://github.com/Raymondwong99/python-mnemonic (fork of trezor/python-mnemonic) · https://pypi.org/project/bip39/
- zxcvbn-ts: https://npmjs.com/package/@zxcvbn-ts/core
- react-idle-timer: https://classic.yarnpkg.com/en/package/react-idle-timer
- fastapi-users status: https://workos.com/blog/top-authentication-solutions-fastapi-2026
