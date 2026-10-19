# Proposed mockups (not approved yet)

Mockups waiting for Ony's approval. Nothing here is built until he approves it; once approved, the picture moves up to
`docs/design/mockups/` and gets a row in that README and in `MOCKUP_BUILD_LIST.md`.

| File | Screen |
|---|---|
| ACCOUNT_1-sign-your-work.png | First open after the update: your name (empty until typed; never filled in for anyone), how it will read, the choice "Nothing to unlock" or "Encrypt with a passphrase" with what each does and doesn't protect. Decisions made before today stay "a person · before 19 Oct"; nobody's name is put on them afterwards (Ony, 19 Oct). |
| ACCOUNT_2-people-and-access.png | Settings › People and access: who can reach the case, role by shape and word, their key (30 or 90 days, renewed from their row; no key that never runs out), who decided what, add a person with a one-time key. |
| ACCOUNT_3-encrypt-with-a-passphrase.png | Setting the passphrase: strength, what it protects and what it doesn't, the recovery key shown once (print or save, then type one group back to prove you have it), the warning that losing both loses the data. |
| ACCOUNT_4-your-safety-locking.png | Settings › Your safety › Locking: encryption status, lock when idle (5/10/30 min/never), lock on Hide screen, lock on sleep, quick PIN to reopen within a session (a convenience, not protection), cases locked on their own passphrase; what the lock screen shows (nothing about the case). |

Decided with Ony (19 Oct): no "sign all past decisions" and no name filled in for anyone; encryption is offered, not the
default; no Windows Hello for now; keys 30 days by default, 90 the only other choice.

Building it needs an ADR: encrypting the database and stored documents at rest (SQLite and the Docker PostgreSQL
setup), the key derivation, and encrypted backups.

The .html files render the pictures (`account.css` uses the fonts the app ships with).
