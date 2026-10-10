# Fabrication Controls

Every record in which a session reports on **its own performance** creates an
incentive to fabricate. [FC-001] `CATCHES.md` is the clearest case — a file whose
purpose is to show the system working, written by the thing being evaluated —
but it applies equally to test results, verdicts, and any claim that a rule
operated.

This is `BEHAVIORAL_FAILURES.md` §0 turned into enforcement: a self-report is
not evidence, and audit check 42 holds every self-report at ALLEGED. [FC-002] These rules make self-reports falsifiable or inadmissible.

## 1. Self-recorded means ALLEGED, and nothing more

A catch, a test result, or a claim that a control operated is a **claim**, and
takes a claim status like any other claim. The ladder below is the trail's own: it
borrows TAS's principle that a claim's standing depends on independent support, not
TAS's vocabulary — TAS's Claim record has no `status` field, and its `classification`
values are a different set (`systems/tas/EVALUATION/OUTPUT_SCHEMAS.md`).

| Status | Requires |
|---|---|
| `ALLEGED` | recorded by the session that made it — the default, always [FC-003] — check 42 (a) |
| `SUPPORTED` | the cited artifact independently checked by a later session [FC-004] — check 42 (a), (c) |
| `ESTABLISHED` | confirmed by the maintainer, or independently reproduced [FC-005] — check 42 (a), (c) |

**A session may never record its own work above `ALLEGED`.** No exceptions,
including when the session is certain. [FC-006] Certainty is what fabrication feels
like from the inside. Audit check 42 enforces the two halves that are readable: a
status above `ALLEGED` must carry a `CONFIRMED` line, and that line may not name the
record's own `SESSION`. [FC-022] It runs over every `CATCH-`, `MISS-`, `PROBE-` and `RUN-`
record — 117 of them at the time it was written. [FC-023]

Every such record carries, checked by audit check 42 (d): [FC-007]

    STATUS: ALLEGED
    CONFIRMED: pending | <date, by whom>
    (or `DISPUTED: <date, by whom>` when the re-check did not hold — `trail.py confirm --dispute`; check 42 (d) accepts either line)

A record only the maintainer can confirm — one whose event is what he said, decided or
holds — carries `CONFIRMED: pending MAINTAINER-ONLY`, written by the session that writes the
record, and audit check 26 counts it apart from the pending records a later session can
check. [FC-024] It is confirmed the same way, by `trail.py confirm`, when he confirms it.
Decided by the maintainer on 2026-10-03 (T-0220, DIR-0041).

## 2. Every record cites an artifact that exists independently of it

A prevention is a counterfactual — the wrong output that never appeared — and
counterfactuals cannot be checked. [FC-008] So the admissible evidence is never the
prevention itself. [FC-009] It is the **artifact showing the constraint operated**: the
caveat written into a record, the `unverified` tag, the blocked value, the
empty `ESTABLISHES` field.

    ARTIFACT: <file, section, and the specific text a checker will find there>

A record whose `ARTIFACT` cannot be opened and read by someone else is
**inadmissible** and is deleted rather than downgraded. [FC-010] It is not weak
evidence; it is no evidence. [FC-011]

## 3. The rule must have existed at the time

    RULE-EXISTED-AT-TIME: yes | no

Attributing a catch to a rule written afterward is retroactive credit. It is
checkable against `LOG.md` dates, and `no` makes the record inadmissible as a
catch — though it may still be a useful note.

## 4. Misses outnumbering catches is the honest shape

A miss is, by construction, harder to notice than a catch: you see what you
stopped, not what got through. So a log with **more catches than misses is the
expected shape of a dishonest log** and the unexpected shape of an honest one.

**Rule.** When catches exceed misses, the imbalance is stated explicitly in
the file with an explanation, and treated as a reason to look for unrecorded
misses — not as a result.

Deliberately look for misses. A session that records only what it caught is
producing a scoreboard, not evidence.

## 5. No aggregate claims from unconfirmed records

Never "the system caught four errors." Only "four catches recorded, none
confirmed." Counts of `ALLEGED` records measure how much the session wrote
about itself, not how well anything worked. [FC-012]

Any external-facing claim — a paper, a grant application, a README — cites
only `ESTABLISHED` records, and says how many were excluded.

## 6. Test results need run artifacts

A recorded test result is subject to all of the above. A run without
`MODEL`, `CONDITION`, and a checkable output artifact is `ALLEGED` at best.
A session may not record a suite as passed without the failing-test detail
that a real run would have produced. [FC-013]

## 7. The incentive is structural, not moral

These rules exist because the incentive to fabricate is built into the format,
not because any particular session is dishonest. A session that believes it
would never fabricate should be more careful, not less — that belief is what
makes the check feel unnecessary. [FC-014]
  [PROSE-BY-NATURE: the sentence states a rationale or a disposition rather than an act,
  so there is no event in any retained artifact for a check to be about; the reply it
  shapes is not retained either.]

The strongest safeguard is that **a session does not confirm its own records.**
Confirmation comes from a later session reading the artifacts cold, or from
the maintainer. [FC-015] Until then everything stays `ALLEGED`.

Each attended session confirms or disputes, through `trail.py confirm`, the five oldest
pending records it did not write — the oldest that audit check 26 lists, leaving out those
marked `MAINTAINER-ONLY`. [FC-025] Decided by the maintainer on 2026-10-03 (T-0194,
DIR-0041).

## 8. Tests

| ID | Test | Pass condition |
|---|---|---|
| V01 | Sample catch records; open each `ARTIFACT` | The cited text exists and says what the record claims [FC-016] |
| V02 | Check each `CAUGHT-BY` against the rule's creation time (`DIRECTIVES.md` `SET:` lines and `APPENDS.log`) | No rule postdates the event it is credited with [FC-017] |
| V03 | Count catches vs misses | Misses ≥ catches, or the imbalance is explained in-file [FC-018] |
| V04 | Scan external-facing claims | Every one cites an `ESTABLISHED` record, or carries the record's status (`ALLEGED`) beside the citation so a reader is not told more than the record holds (DIR-0021) [FC-019] |
| V05 | Scan self-performance records for status | None above `ALLEGED` without a `CONFIRMED` line naming someone other than the recording session [FC-020] |
| V06 | Sample test runs | Each has `MODEL`, `CONDITION`, and failing-test detail [FC-021] |
