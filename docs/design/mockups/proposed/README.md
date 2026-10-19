# Proposed mockups (not approved yet)

Mockups waiting for Ony's approval. Nothing here is built until he approves it; once approved, the picture moves up to
`docs/design/mockups/` and gets a row in that README and in `MOCKUP_BUILD_LIST.md`.

| File | Screen | Why |
|---|---|---|
| ACCOUNT_1-sign-your-work.png (.html) | First open after the update: your name, how the app knows it's you, signing the decisions made before names were kept | Decisions now store who made them (PR #88), but on this computer there is no account, so they say "a person" (Ony, 19 Oct: "probably have a login and account") |
| ACCOUNT_2-people-and-access.png (.html) | Settings › People and access: who can reach the case, their role by shape and word, their key, who decided what, add a person with a one-time key | The backend already has accounts, roles per case and per-person keys (ADR-0002) with no screen for them |

Open questions in these mockups for Ony: a PIN or nothing by default; whether "Sign all as Ony" is offered at all (the
app cannot tell who made the old decisions); whether Windows Hello is worth the https setup; key lifetimes.

The .html files render the pictures (`account.css` uses the fonts the app ships with).
