# Authority Systems

> **Working in this repo — human or agent — read these first:**
> `papertrail/project/DIRECTIVES.md` (standing instructions), then
> `papertrail/project/STATE.md` (current state and what is **unverified**).
> Then `AGENTS.md` for the load protocol and `claude/OPERATING_INSTRUCTIONS.md`
> if you are a Claude session. Anything asserted about this project without
> reading `STATE.md` is a guess — see `CATCHES.md` MISS-0006 (ALLEGED, like every
> self-report in the trail until a second reader confirms it).
>
> Commands and session flags: `CONTROL_SURFACE.md` (`/help` lists them).


The connective layer over seven standalone, evidence-first methodologies —
plus a state convention, agreement discipline, and a pluggable overlay
mechanism.

Portable and model-agnostic. Drop it into a repo, a project knowledge base,
or a chat. No install, no service, no runtime dependency.

## The seven systems

Each lives in this repository under `systems/` rather than as a submodule (DEC-0008), and
each runs standalone.

| | System | Asks |
|---|---|---|
| 1 | **RAS** — Research Authority | Can this *source* be relied on? |
| 2 | **TAS** — Topic Authority | What is *established*, and at what status? |
| 3 | **QAS** — Quantitative Analysis | What do the *numbers* show, and does a pattern survive its rivals? |
| 4 | **LAS** — Logic Authority | Does the *inference* from that hold? |
| 5 | **DAS** — Decision Authority | Given all of it, what should be *done*? |
| 6 | **EGS** — Evidence Gathering | How is the missing *evidence* obtained, and what could not be? |
| 7 | **EHS** — Ethics and Harm | Should this be *published*, and at what cost to whom? |

Rows 1–5 are the five authority systems, and their order is a pipeline — source, fact,
quantity, inference, decision — which is also why it resolves conflicts: a source RAS
rules unusable cannot support a TAS claim; a claim TAS rates `ALLEGED` cannot
carry a DAS recommendation as fact. Lower number wins. QAS, row 3, judges what a number or a
test against data supports; it was added on 2026-10-10 (DIR-0043, PROP-0007) beside the
pipeline and has been in it since DIR-0046 (2026-10-10). Rows 6 and 7 are support systems
beside the pipeline: they serve the authority systems and issue no authority judgement. EGS
obtains what TAS weighs and does not judge it, and EHS lays out and records the public-interest
and harm weighing behind a publication and decides nothing — a named person decides.

**Each system says where its job ends, and none requires another to run**
(DEC-0036, superseding DEC-0003). Every README names the jobs that begin at
its boundary; no rule file names a sibling's path or tells the model to run a
sibling first; the shared names for the jobs live in `INTEROP.md` §8. This is
what keeps each usable alone.

## What the umbrella owns

    AGENTS.md                 router — always loaded, deliberately short
    CLAUDE.md                 pointer to the router
    CONTROL_SURFACE.md        commands and session flags
    INSTRUCTION_COMPLIANCE.md do what was said; verdicts at delivery
    BEHAVIORAL_FAILURES.md    model failure modes, detection, controls
    FABRICATION_CONTROLS.md   self-reports are ALLEGED until confirmed
    CHECKPOINTS.md            one required step at a named moment, and its record
    JUDGEMENT_LEDGER.md       stated confidence scored against outcomes (judgement-ledger.py)
    claude/                   canonical operating instructions + update log
    papertrail/SPEC.md        state convention — no doctrine dependencies
    papertrail/project/       development binding: DIRECTIVES, STATE, LOG,
                              TRACE, CATCHES, TESTS, TASKS, DECISIONS, OPEN,
                              SOURCES, NOTES, research/
    systems/                  the seven systems, in this repo (DEC-0008)
    EVALUATION/               the operator test suite (run manifest) and its fixtures
    overlays/                 profession / context / values layers
    adapters/                 tier 2 and tier 3 environments
    docs/                     documentation written from the files (DIR-0022): one per
                              system, the umbrella, the Paper Trail, the agent state

### INTEROP

The first four systems were built in sequence and their prose boundaries are sound.
Their machine-readable boundaries are not, and the failures are silent.

The worst is `tier`: TAS Tier A is an authenticated primary record, DAS Tier A
is a reference class of past decisions, and RAS uses 1–8. DAS's schema typed
the field `A`–`F`, so a TAS record could flow in, validate, and mean something
else (DAS now writes `DAS:A`–`DAS:F` and a separate `upstream_tier`, T-0214). INTEROP's answer is **namespacing, not mapping** — `TAS:A`, `RAS:3`,
`DAS:B` — because RAS's own policy already states the scales are not
interchangeable. Mapping them would destroy a deliberate distinction.

Where a real crosswalk is needed (verification status), it is written
lossy-explicit: two TAS statuses that had no LAS destination are split or carry
their attribution across (since 2026-10-03, LAS Module 03 rule 7), never rounded.

### Sycophancy controls

In the first four systems the user is the one untiered source — entering the
reasoning with no tier, no corroboration requirement, and no interest
disclosure. The controls close that: tier the user, treat analyst-mode
assertions as hypotheses rather than evidence, forbid status changes without
new evidence, log every flip, and require every agreement to cite a record ID.

The adversarial tests in `SYCOPHANCY_CONTROLS.md` (S01 onward) include two that guard the opposite
failure — manufactured disagreement is the same defect with the sign reversed.

### Overlays

Profession, context, and values layers, generalizing the boundary TAS's
`CONTROL_SURFACE.md` §2 already applies to its own flags. Two kinds:
**constraint** overlays may only tighten; **values** overlays may annotate and
rank but never omit, suppress, or alter a finding. Active overlays are
disclosed in output and stamped into the trail.

Turning an overlay off changes what is highlighted, never what is there.

## Install

**Tier 1 — agent with file access** (Claude Code, Codex, Cursor,
Copilot, Gemini CLI, Aider, Windsurf, Zed; a Cowork session does not auto-discover
`AGENTS.md` and loads the Project doc instead — `claude/README.md`):

    git submodule add https://github.com/<you>/authority-systems .authority

Then in your project's root `AGENTS.md`:

    ## Doctrine
    Before any factual, investigative, or analytical work, read
    `.authority/AGENTS.md` and follow its protocol.

That pointer is required. Nested `AGENTS.md` files are found by proximity to
the file being edited — an agent working elsewhere in the repo will never
discover the submodule on its own.

**Tier 2 — project knowledge:** `adapters/chatgpt-project-instructions.md`
**Tier 3 — plain chat:** `adapters/plain-chat-fallback.md`
**Claude skill:** `adapters/claude-skill/SKILL.md`

**Hooks (Claude Code in this repository):** `reply-gate/claude-settings.json` registers two hooks — the
research gate (`reply-gate/research-gate.py`, refuses a web search until a research entry with a
plan is open) and the reply gate (`reply-gate/reply-gate.py`, a `Stop` hook). Copy it to
`.claude/settings.json` at the repository root (an AI session's tools may not write there); Claude
Code then loads them when a session runs in this folder and `python3` is on the path. A Cowork session does not load
them; there `trail.py`'s own refusals are the control (`REPLY_GATE.md` §7).

**Optional — the Rigor Manager:** `python3 viewer/rigor_manager.py` opens a local window onto
the trail: the live event log and the doctrine drawn as it fires, every session's model and
surface, every record, the maintainer's desk, the checks, and the settings (`viewer/README.md`).
Nothing in the doctrine depends on it; it uses only Python's standard library.

## Fixes owed at source

INTEROP names defects that belong in the individual system repos, not here. None is open.

Fixed at source, each recorded in INTEROP.md:

- TAS `PRM-`, LAS `PREM-` and DAS `PRE-`, one or two characters apart with different
  meanings — TAS's became `PEV-` and DAS's `PMF-` on 2026-10-03, the maintainer's choice
  (DIR-0041, §7).
- DAS `CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 3's `LOW|MEDIUM|HIGH` field — 2026-09-25,
  DIR-0013 (§2).
- RAS's missing record-ID prefixes — assigned 2026-09-30, T-0337, DEC-0035 (§7).
- TAS Module 02 and its visual record's different verification enums — the visual record
  takes Module 02's verdicts since 2026-10-02, T-0004 (§3).
- RAS's reuse of "material" for a concept unrelated to TAS severity — its quality flag and
  gap priority renamed 2026-10-02, T-0136 (§6).

## Design constraints

- **The router stays short.** Codex caps instruction files at 32 KiB and
  truncates past it silently; curated short files measurably outperform long
  ones. Doctrine lives in the systems; the router stays an index.
- **Triggers are conditions on output, not keywords in the request.**
- **Every response declares what it loaded**, plus active overlays and tier.
  That line is the only observability the system has.
- **Never coerce silently.** A value that cannot cross a boundary blocks.
- **Paper Trail carries no doctrine dependencies** and can be lifted out.

## Honest limits

Most of this is not enforced. `trail.py` refuses malformed or unsupported writes
into the trail, `audit-gaps.sh` reports drift after the fact, and the reply gate
(`REPLY_GATE.md`) refuses a few named reply patterns after the reply is delivered and
forces a correction before the turn ends; everything else is instructions, and a model that skims will skim. This does not prevent hallucination or sycophancy — it makes both
*catchable*, by requiring a traceable chain and a cited record behind every
agreement. That is a weaker promise than "no errors" and a more useful one.

Whether it improves output is empirical, and the adversarial suites in each
system are where that gets settled.

## License

Tooling and code — every `*.py` and `*.sh` file, `viewer/` and `reply-gate/` — are
licensed under the Apache License 2.0 (`LICENSE`). Doctrine and documentation — the
umbrella's Markdown files, `docs/`, `EVALUATION/`, `overlays/`, `adapters/`, `claude/`'s
Markdown files and `papertrail/` — are licensed under Creative Commons Attribution 4.0
International (`LICENSE-DOCS`, https://creativecommons.org/licenses/by/4.0/legalcode).
Each system under `systems/` carries its own `LICENSE` granting the same CC BY 4.0, so a
system copied out alone keeps it. The maintainer chose these licenses on 2026-10-03
(DIR-0041, T-0020, OQ-0008) and extended CC BY 4.0 to the four systems on 2026-10-05
(DIR-0042); until then their own files read "All rights reserved". The three systems added
on 2026-10-10 (DIR-0043) carry it from their first version.

## Principle

> No simplicity of mind, no obscurity of station, can escape the universal
> duty of questioning all that we believe.
> — W. K. Clifford, *The Ethics of Belief* (1877)

> The first principle is that you must not fool yourself — and you are the
> easiest person to fool.
> — Richard Feynman
