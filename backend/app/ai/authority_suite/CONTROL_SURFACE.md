# Control Surface — Commands and Flags

Named commands and session flags for steering the umbrella, generalizing the
pattern TAS already defines for itself (`systems/tas/CORE/CONTROL_SURFACE.md`).
TAS's own surface still governs TAS; this one governs the connective layers and
the project trail.

## 1. Non-negotiable boundary

Inherited from TAS's own control surface, its §2, with "protected rule" in place
of TAS's "rule this package states as non-negotiable": a command or flag may change **mode, scope,
verbosity, or which optional pass runs**. It may **never** weaken, skip, or
make optional any protected rule. [CS-001]
  [PROSE-BY-NATURE: the sentence states a rationale or a disposition rather than an act,
  so there is no event in any retained artifact for a check to be about; the reply it
  shapes is not retained either.]

Checked against every entry below — audit check 53 (a) confirms nothing section 4
rejected is shipped in section 2 or 3, and check 53 (b) that every rejection names which of
these prohibitions it was refused under. [CS-002] Specifically, nothing here can:

- disable the announce line — it is the observability instrument, and a
  control that can be turned off measures nothing
- suppress recording in `CATCHES.md`, including misses
- record any self-assessment above `ALLEGED`
- suppress a required flag — the closed list is `INSTRUCTION_COMPLIANCE.md` §4's
  "Required regardless" [CS-003]
- skip the session-end checkpoint
- skip reading `DIRECTIVES.md`

A request to do any of those is a rule change requiring the maintainer's
explicit revocation, not a control-surface setting; `INPUT_INTEGRITY.md` §0 says how a revocation is made, recorded and disclosed.

## 2. Commands

Invoked by name, in plain language. A command acts now and does not persist. [CS-004]

| Command | Does |
|---|---|
| `/show <ID>` | Print any record in full, by id — `CATCH-0005`, `MISS-0006`, `DEC-0002`, `T-0029`, `RQ-0001`, `MD-0011`, `PROBE-0001`, `DIR-0003`, `PS-0006`, `RF-0003`, `OQ-0006`. Every record in the trail carries a unique prefixed id; one command reaches all of them. [CS-005] — check 36 |
| `/last` | Print every record written this session, in order, with its file. [CS-006] — check 36 |
| `/state` | Print `STATE.md` status table, unverified items, and next actions. [CS-007] — check 36 |
| `/unverified` | Print only the unverified section — the shortest path to "what do we not actually know." [CS-008] — check 36 |
| `/directives` | List standing directives with their `VIOLATED` history. [CS-009] — check 36 |
| `/tasks [n]` | The next n unblocked tasks in priority order. Default 5. [CS-010] — check 36 |
| `/catches [n]` / `/misses [n]` | Most recent catches or misses. [CS-011] |
| `/balance` | Catch/miss counts, breakdown by `LOCUS`, and how many are confirmed. [CS-012] — check 36 |
| `/verify <ID>` | Open the record's `ARTIFACT` and report whether it says what the record claims. Does **not** promote the record — only the maintainer or a later session does that. [CS-013] — check 36 |
| `/probe <procedure>` | Run one targeted test of a named procedure now and file a `PROBE-` record. [CS-014] — check 36 |
| `/audit <file>` | Check that file's controls against `BEHAVIORAL_FAILURES.md` §0 — artifact-bound, or self-report? [CS-015] — check 36 |
| `/checkpoint` | Run the session-end checkpoint now: rewrite `STATE.md`, append `LOG.md`, update task status. [CS-016] — check 36 |
| `/whatchanged` | List every file written this session with what changed in each. [CS-017] — check 36 |
| `/help` | Print §2 and §3 — this command table and the flag table. [CS-029] — check 36 |
## 3. Flags

Session-level, set in plain language ("turn on show_records", "set verbosity
terse"), persisting until changed.

| Flag | Default | Does |
|---|---|---|
| `show_records` | `off` | `off` — records are written silently. `on-write` — print each record as it is written, so a catch, miss or probe is visible in the conversation the moment it lands. `verbose` — also print the file and byte count. **Display only; never affects whether a record is written.** [CS-018] — check 36 |
| `verbosity` | `normal` | `normal` / `terse`. `terse` shortens prose. It cannot shorten the announce line, a required flag, or a `KNOWN-GAPS` list. [CS-019] — check 36 |
| `announce` | `full` | `full` / `compact`. `compact` keeps `loaded`, `overlays` and `tier` — the fields `AGENTS.md` [AG-004] requires of every response — and `dir` and `log`, the two artifact-bound values; what it drops is the surrounding prose, never a field (until DIR-0021 it dropped `loaded` and `tier`, which §1 forbids a flag to do). It cannot be turned off. [CS-020] — check 36 |
| `miss_hunting` | `normal` | `normal` / `aggressive`. `aggressive` runs an explicit search for unrecorded misses at the session-end checkpoint, and states plainly when it finds none. [CS-021] — check 36 |
| `probe_on_delivery` | `off` | `off` — no self-check before delivery. `on` — run one targeted self-check before delivering any substantial artifact, and file the `PROBE-` record with the delivery. [CS-022] — check 36 |
| `confirm_mode` | `off` | `off` — records are written and left for whenever the maintainer reads them. `on` — the maintainer is reviewing `ALLEGED` records; each is presented with its `ARTIFACT` for a confirm/reject decision, and confirmations are written with the date and "confirmed by maintainer". The session still never confirms its own. [CS-023] — check 36 |
| `research_depth` | `normal` | `normal` / `exhaustive`. `exhaustive` requires at least one disconfirming search per question before a finding is filed. [CS-024] — check 36 |
## 4. Rejected

Checked against §1 and refused, recorded here so they are not proposed again — audit
check 53 holds this list to that claim, both halves: none of these appears among a flag's own
values or in the command table, and each names the §1 prohibition it was refused under. [CS-028]
Three of the five did not until 2026-09-22. [CS-025]

- **`announce: off`** — refused under §1's "disable the announce line". The announce
  line is the only compliance signal that exists; a flag that removes it is a flag that
  removes the ability to detect whether any of this is working. `REPLY_GATE.md` records that
  nothing sat in the path of a reply until 2026-09-20T17:53:01Z.
- **`catches: off`** — refused under §1's "suppress recording in `CATCHES.md`,
  including misses". A log that can be silenced records only what a session chose to admit.
- **`auto_confirm`** — refused under §1's "record any self-assessment above `ALLEGED`".
  Promoting a session's own records is the exact failure `FABRICATION_CONTROLS.md` exists
  to prevent.
- **`skip_checkpoint`** — refused under §1's "skip the session-end checkpoint". The
  checkpoint is how the trail survives the session; `PROCEDURES.md` procedure 1 is the
  checkpoint it names.
- **`suppress_flags`** — refused under §1's "suppress a required flag". [CS-030] Required flags are
  the ones that bear on the work being executed; suppressing them is the `IC08` failure. [CS-026]

## 5. Discovery

Commands are listed here and nowhere else. A session reading `README.md` or
`AGENTS.md` is pointed at this file; the maintainer does not have to remember
the list. [CS-027] `/help` prints §2 and §3.
