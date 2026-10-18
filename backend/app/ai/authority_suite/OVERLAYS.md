# Overlays — Portable Behavior Layers

An overlay is a loadable layer that changes behavior for a profession,
context, jurisdiction, or value set, without touching the evidence discipline
underneath.

This generalizes the boundary TAS already states for its own flags
(`CORE/CONTROL_SURFACE.md` §2): a control "may change mode, scope, verbosity,
or which optional pass runs. It may never weaken, skip, or make optional any
rule this package states as non-negotiable." Two candidate flags were rejected
there on exactly that test. [OV-001] Overlays inherit the rule and the test.

## 1. The stack

    ┌──────────────────────────────────────────────────────┐
    │ OVERLAYS                  optional, pluggable        │  ← may only ADD or ANNOTATE
    ├──────────────────────────────────────────────────────┤
    │ INTEROP                   vocabulary, boundaries     │  ← protected
    │ SYCOPHANCY                agreement discipline       │  ← protected
    │ PAPER TRAIL               state and provenance       │  ← protected
    │ INSTRUCTION COMPLIANCE    instructions performed     │  ← protected
    │ BEHAVIORAL FAILURES       model failure modes        │  ← protected
    │ INPUT INTEGRITY           maintainer-side failures   │  ← protected
    │ COMPLEMENTARITY           work allocation            │  ← protected
    │ GAP DISCOVERY             gap discovery              │  ← protected
    │ UNKNOWN UNKNOWNS          unknown unknowns           │  ← protected
    │ FABRICATION CONTROLS      self-reports ALLEGED       │  ← protected
    │ CHECKPOINTS               required steps, recorded   │  ← protected
    ├──────────────────────────────────────────────────────┤
    │ RAS   TAS   QAS   LAS   DAS  ·  EGS   EHS support  │  ← protected
    └──────────────────────────────────────────────────────┘

Everything below the top band is **protected**. No overlay may weaken, skip,
reorder, or make optional anything in it. [OV-002] The protected band drawn above names every layer
`AGENTS.md`'s layer table marks `protected` — until 2026-09-25 it named three of the
ten, so an overlay was never checked against the other seven — and audit check 34 (c)
compares the two in both directions, and a shipped overlay's
`TOUCHES-PROTECTED` value by check 48 (d). [OV-024] An overlay that requires doing so is
not an overlay; it is a fork, and it is labeled as one. [OV-003]

## 2. Two kinds, and conflating them is the failure mode

### Constraint overlays — may only tighten

Add requirements. Cannot remove any. Safe by construction, because the worst
case is refusing to produce output that the base system would have produced.

Examples: **legal** (privilege screen before release; no legal conclusion
without qualified review; jurisdiction and treatment check on every cited
authority), **medical** (PHI handling; no diagnostic assertion), **journalism**
(named-source policy; right of reply before publication has been checkpoint CP-01,
not an overlay rule, since 2026-10-05), **academic**
(disclosure of funding and conflicts on every cited study). [OV-004]
  [PROSE-BY-NATURE: the sentence states a rationale or a disposition rather than an act,
  so there is no event in any retained artifact for a check to be about; the reply it
  shapes is not retained either.]

### Values overlays — may only annotate and rank

Change what is **surfaced, ordered, or flagged** according to a declared
criterion. This is the category holding the values filter — avoiding companies
by ethical or political criteria, or any comparable judgment.

**The rule that makes them safe: a values overlay may annotate and rank. It
may never omit, suppress, or alter a finding.** [OV-005]

A values overlay that removes a company from a list produces a factual
omission the reader cannot see. [OV-006] A values overlay that keeps the company and
flags it with the criterion that matched produces a complete record plus a
disclosed judgment. The first is an evidence-discipline failure wearing a
values costume; the second is a values judgment the reader can accept, reject,
or invert.

This is not a new rule. It is TAS's existing requirement that absence is a
finding and gets reported as one — applied to absences the operator caused
rather than absences the record caused.

## 3. Disclosure is mandatory

Any output produced with a values overlay active must state so and name the overlay
and its version, and the Paper Trail record of that work must carry the same stamp as a
field: [OV-025]

    OVERLAYS-ACTIVE: legal@1.2, values/labor@0.3

A binding whose work runs with overlays declares `OVERLAYS-ACTIVE:` in its record schema.
This project's development binding runs with none and does not declare it, and audit check 48 (e)
lists a shipped overlay while no trail schema declares the field, and a recorded stamp that names
an overlay or version not on disk (UMBRELLA F41). [OV-026]

An undisclosed values overlay produces a filtered document that looks
unfiltered. For an investigative product, that is the exact failure the
product exists to expose in others, and it would be fatal to the project's
credibility if discovered downstream rather than declared upstream.

Constraint overlays are disclosed too, but the stakes are lower — they can
only have made the output stricter.

## 4. Manifest

Each overlay ships one file declaring what it does and what it touches: [OV-007] Audit
check 48 (d) validates any `MANIFEST.md` that exists against the block below — every field
present, `KIND` in the declared set, `TOUCHES-PROTECTED: none`, and `APPLIES-TO` naming a
real `systems/` directory — and check 48 (b) compares the fields section 6's load check
demands against the ones this block declares, so a load check can never require a field the
schema omits. [OV-021] Nothing is shipped yet, so (d) rests on the harness's synthetics and (b) does
not. [OV-022]

    # Overlay: legal
    VERSION: 1.2
    KIND: constraint | values
    APPLIES-TO: TAS, LAS          # which systems it modifies
    ADDS: <requirements this overlay imposes>
    ANNOTATES: <fields it may add or flag — values overlays only>
    CRITERIA: <for values overlays: the explicit, inspectable criterion>
    TOUCHES-PROTECTED: none       # any other value is a load error

`CRITERIA` must be explicit enough that a reader who disagrees can identify
exactly which judgment produced which flag. [OV-008] "Predatory companies" is not a
criterion. [OV-009] A named, checkable test is.

## 5. Stacking and precedence

- Constraint overlays **stack**; every one applies, and the most restrictive
  requirement wins. [OV-010] Two constraints never conflict in a way that loosens
  anything. [OV-011]
  [PROSE-BY-NATURE: governs the reply, which this project does not retain, so no check in
  its audit sees it, and no reply mode in REPLY_GATE.md §3 covers this rule.]
- Values overlays stack, each disclosed separately. A finding may carry flags
  from several.
- A constraint overlay always outranks a values overlay. [OV-012] Where a values
  overlay would rank down something a constraint overlay requires surfacing,
  the constraint wins and the conflict is logged. [OV-013]
  [PROSE-BY-NATURE: governs the reply, which this project does not retain, so no check in
  its audit sees it, and no reply mode in REPLY_GATE.md §3 covers this rule.]
- Where any overlay conflicts with a protected layer, **the protected layer
  wins and the overlay fails to load** — it does not partially apply. [OV-014]
  [PROSE-BY-NATURE: governs the reply, which this project does not retain, so no check in
  its audit sees it, and no reply mode in REPLY_GATE.md §3 covers this rule.]

## 6. Load check

On load, the overlay is validated against this file. It is rejected, with the
reason stated, if it:

- weakens, skips, or makes optional any protected rule;
- omits, suppresses, or rewrites a finding rather than annotating it;
- declares `KIND: constraint` while removing a requirement;
- states a values criterion that is not inspectable; [OV-015]
- fails to declare `APPLIES-TO`. [OV-016]

Audit check 48 (b) holds this list to section 4's schema: every field a bullet above names
must be one the manifest block declares. [OV-023] Whether a loaded overlay was actually rejected is a
property of a run and not of a retained artifact; what is checkable is that the list is
satisfiable, and that is what (b) tests.

A rejected overlay does not partially apply. [OV-017] Partial application of a layer
that was supposed to tighten behavior is worse than not loading it, because
the operator believes a control is active that is not. [OV-018]
  [PROSE-BY-NATURE: governs the reply, which this project does not retain, so no check in
  its audit sees it, and no reply mode in REPLY_GATE.md §3 covers this rule.]

## 7. Why the values overlay stays structurally separate

The fact-based systems derive their authority from being checkable by someone
who disagrees with the operator. A values overlay is, by design, not
checkable that way — it encodes a judgment reasonable people reject.

Keeping it structurally incapable of removing a finding is what lets both
exist in one product. The fact layer stays auditable by anyone. The values
layer is visible, named, versioned, and separable, so a user who rejects it
can drop it and get the identical factual record back.

Build it so that turning the overlay off changes what is **highlighted**,
never what is **there**. [OV-019] If removing the overlay would change the facts, the
overlay was doing something it is not permitted to do. [OV-020]
