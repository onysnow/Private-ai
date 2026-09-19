# ADR-0002: Two-tier remote authorization -- shared token vs. persisted per-user tokens

**Status:** Proposed
**Date:** 2026-09-19
**Deciders:** Ony

## Context

`api_access_guard` (backend/app/main.py) currently resolves a remote (non-
local) request's identity one of two ways, tried in this order:

1. **Persisted per-user tokens.** If the request carries a bearer token,
   `scope_for_persisted_token` (`app/services/identity.py`) looks it up
   against `AppUser`/`InvestigationMembership` rows. A match produces a real,
   per-investigation `AuthorizationScope` -- `viewer`/`reporter`/`admin`
   roles, individually revocable, individually rotatable, with real
   membership data behind it. This is the newer system, added this session
   in the Stage E settings-route split.
2. **Shared static bearer token.** If no persisted token matched, `enforce_
   api_access` falls back to comparing the request against the single
   process-wide `settings.api_auth_token` (constant-time compare). A match
   grants a coarse `"shared-bearer"` scope: role `"shared"` (which
   `allows_write()` treats the same as owner/admin -- full read/write),
   restricted only by the optional `JW_API_AUTH_INVESTIGATION_IDS` CSV
   allowlist, with no per-investigation role granularity and no way to
   revoke one caller without rotating the token for everyone using it.

Two details matter for what "end state" should mean here, confirmed by
reading the actual code rather than assumed from the docstring alone:

- **Local requests bypass both paths entirely.** `request_is_local_request`
  short-circuits the whole auth block, so the workstation's own traffic
  (`localhost`, `testclient`/`testserver`, loopback IPs, an in-container
  Docker healthcheck) always gets an unrestricted `"local-owner"` scope,
  with no token of any kind. Neither auth path is involved in local,
  single-workstation use -- they only matter once something reaches the API
  from off-box.
- **The two remote paths are already fully independent, not layered.** If
  `api_auth_token` is unset (the default), `decide_api_access` fails closed
  for everyone -- "Remote API access is disabled." But that check is only
  ever reached when no persisted token matched
  (`denial = None if persisted_scope is not None else await
  enforce_api_access(...)`). So a correctly-configured persisted per-user
  token grants remote access today with **zero** shared-token
  configuration -- the newer system was not built as a feature bolted onto
  the older one; it already stands on its own.

Given that, the open question this finding raised (STRUCT-0023) isn't
"which one works" -- both fully work today -- it's which one should be
reached for by anyone adding remote-access features going forward, and
whether the shared token is meant to go away.

## Decision

Treat the two paths as **permanently coexisting, deliberately different
tiers**, not a migration-in-progress with a removal date for the shared
token:

- **Persisted per-user tokens are the primary, recommended path for any
  remote access involving more than one person, or where per-investigation
  role distinctions (viewer vs. reporter vs. admin), individual revocation,
  or a per-actor audit trail matter.** All future remote-access features
  (finer-grained scopes, session expiry, anything that needs to answer "who
  did this" for a specific human) should be built against this system only.
- **`api_auth_token` remains a deliberate, minimal convenience for the
  simplest possible remote-access case**: one operator, one shared secret,
  no user records to manage, restricted to a fixed investigation-id
  allowlist if desired. It is not meant to gain new capabilities -- no role
  granularity is planned for it, and it should be treated as feature-frozen
  at its current (already fail-closed-by-default) shape.
- **No target condition for removing `api_auth_token` entirely.** Because
  the two paths are already independent (persisted tokens work with the
  shared token unset), there's no technical reason forcing eventual
  removal, and no stated product goal ("every remote caller must be an
  identified user") that would require it. If that goal is ever adopted,
  removing `api_auth_token` becomes straightforward precisely because
  nothing else depends on it -- but until then, it stays as the
  low-ceremony option for a solo operator or a script that doesn't warrant
  creating an `AppUser` row.

## Options Considered

### Option A: Document as two permanent tiers, no removal date (chosen)

Matches what the code already does (fully independent paths, not a
fallback chain that would break if one were removed) and doesn't invent an
artificial migration deadline the project has no stated need for.
**Pros:** honest about the current architecture; imposes no new work;
future features have clear guidance (build on persisted tokens).
**Cons:** a "temporary-looking" coexistence stays permanent in the docs,
which can read as unfinished to a future reviewer unless this ADR is easy
to find.

### Option B: Commit to retiring `api_auth_token` on a stated timeline

**Pros:** a single remote-auth story is simpler to reason about and to
document.
**Cons:** would require inventing a reason to remove a working,
independent, already-fail-closed feature that some deployment shape (a
lone operator scripting against their own instance) may genuinely prefer
over creating a user record for themselves. Removing it without a real
driving requirement is churn, not hardening.

### Option C: Layer persisted tokens as a special case of the shared-token system (e.g., require `api_auth_token` to be set before persisted tokens work at all)

**Pros:** one gate to reason about.
**Cons:** contradicts the current, deliberately fail-closed design where an
operator can run persisted-token remote access without ever setting a
shared secret; would make persisted-token users depend on an unrelated
credential existing, for no security benefit.

## Consequences

- What becomes clearer: anyone adding a remote-access feature now has a
  stated answer for which system to extend (persisted tokens), instead of
  inferring it from the middleware's fallback order.
- What stays true: `api_auth_token` keeps working exactly as it does today,
  indefinitely, as the low-ceremony single-secret option -- no code change
  results from this ADR.
- What we'll need to revisit: if a future requirement demands that every
  remote caller be individually identified (e.g., a compliance or
  multi-operator need), this ADR's "no removal date" stance should be
  revisited then, not preemptively now.

## Action Items

1. [ ] Ony: review and mark this ADR Accepted (or request changes).
2. [ ] Once accepted, add a one-line pointer to it from
   `backend/app/core/authorization.py`'s `AuthorizationScope` docstring
   (which currently only hints at the shared-token/local-workstation split)
   so a future reader lands here instead of re-deriving the same question.
