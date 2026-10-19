# Systems

The seven systems: five authority systems, in pipeline order (router rows 1–5), and two
support systems (rows 6 and 7), which serve the authority systems and issue no authority
judgement. Each governs one kind of work and each remains usable standalone — copy a single
directory and it works.

Authority systems — the pipeline:

    ras/   Research Authority    — can this source be relied on
    tas/   Topic Authority       — what is established, and at what status
    qas/   Quantitative Analysis — what a number or a test against data supports
                                   (since 2026-10-10, DIR-0043; in the pipeline since DIR-0046)
    las/   Logic Authority       — does the inference hold
    das/   Decision Authority    — what should be done

Support systems — beside the pipeline (since 2026-10-10, DIR-0043; named so since DIR-0046):

    egs/   Evidence Gathering    — how is missing evidence obtained; does not judge it
    ehs/   Ethics and Harm       — lays out and records the ethics weighing; decides nothing

They live in this repo rather than as submodules (DEC-0008) because the
interop layer has to version together with what it maps: a verification-enum
change in `tas/` and the corresponding `INTEROP.md` crosswalk update must land
in one commit, or the crosswalk goes stale silently.

Per-system `CHANGELOG.md` files are kept and versions are **not** unified —
TAS is at 1.12 on its own track (the newest numbered heading in
`tas/CHANGELOG.md`).

## Editing

The umbrella owns only the connective layers. Doctrine changes belong in the
system's own directory.

Where `../INTEROP.md` names a defect to fix at source — DAS's confidence-language
Rule 3, TAS's Module 02 / visual-record enum mismatch, RAS's missing ID prefixes,
RAS's reuse of "material" and the `PRM`/`PREM`/`PRE` collision were fixed this way — the fix goes in that system, and `INTEROP.md` is updated in
the same commit.
