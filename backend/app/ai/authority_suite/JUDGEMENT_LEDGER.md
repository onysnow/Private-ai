# Judgement Ledger — Stated Confidence Scored Against Outcomes

Every system states confidence in ICD 203's words; nothing in this repository has checked
whether those words were right as often as they claimed. [JL-016] This layer does that. It is
record-keeping and a scoring rule, not a way of reasoning, so it is an umbrella layer and not a
doctrine (PROP-0007; placed by the session under the maintainer's delegation, DIR-0043:
"Whatever is best"). [JL-001]

## 1. What is scored

A trail record is scored when it carries a `CONFIDENCE:` line whose first word is a likelihood
term and, later, a `LEDGER-OUTCOME:` line that resolves it. [JL-002] The confidence a record states
is about the proposition the record names — for a decision record, its `ASSUMPTION:`. The `LEDGER-OUTCOME:` line restates that proposition before it says how it turned out, so a
reader can see what was scored. [JL-003]

    LEDGER-OUTCOME: HELD | FALSIFIED | UNRESOLVED — <the proposition, as judged>; <date>; <evidence: a record id or a command>

`HELD` means the proposition turned out true, `FALSIFIED` that it turned out false;
`UNRESOLVED` records that a check was made and settled nothing, and is not scored. [JL-004]
`trail.py amend` refuses a `LEDGER-OUTCOME:` line that names no record id and no command, as it does
for a status or a confidence change (its STATUS_FIELDS; run-tooling-tests.sh JL5). [JL-005] The
latest `LEDGER-OUTCOME:` line is the one scored, since records are append-only.

An outcome says nothing about how well the judgement was made: a careful judgement can meet a
bad outcome. DAS keeps the decision record and the outcome record apart for this reason, and
this ledger scores calibration only — whether "likely" things happened about as often as
"likely" says — never the quality of a decision. [JL-006]

## 2. The scoring rule

Each term is scored at the midpoint of the ICD 203 band it names (PS-0099): almost certain
95–99% → 0.97, very likely 80–95% → 0.875, likely 55–80% → 0.675, roughly even chance 45–55% →
0.50, unlikely 20–45% → 0.325, very unlikely 5–20% → 0.125, almost no chance 1–5% → 0.03. [JL-017] The
trail's five terms in either spelling it has used (ALMOST_CERTAIN, LIKELY, ROUGHLY_EVEN_CHANCE,
UNLIKELY, ALMOST_NO_CHANCE, and the earlier ALMOST-CERTAIN, ROUGHLY-EVEN, ALMOST-NO-CHANCE) and the
systems' seven-term spellings all resolve to these. A record keeps the term it was written with
and is scored at that term's ICD 203 band, never regraded (`INTEROP.md` [IN-064]). [JL-018] The trail's
records have no "very likely" or "very unlikely", so a belief of 80–95% is written LIKELY or
ALMOST_CERTAIN; the ledger scores what was written, and a writer forced between two bands shows
here as a miscalibrated term. [JL-007] A record whose term is not
one of these, whose term is followed by "not", or whose CONFIDENCE line carries two terms (two
judgements on one line) is listed as unscored with the reason, never coerced (`INTEROP.md` §0;
run-tooling-tests.sh JL3, JL7). [JL-008]

The score is the Brier score, the mean of (p − o)², where o is 1 for HELD and 0 for FALSIFIED.
It is strictly proper: a forecaster minimises the expected score only by stating their true
belief, which removes the incentive to shade a stated confidence (Gneiting and Raftery,
PS-0290; PS-0280). Scored at band midpoints, that holds only approximately: a belief near a band's
edge can expect a better score under the next term (a belief of 0.78, inside "likely", does
better under "very likely"), because the point where two midpoints score equally is not the band
edge. [JL-019] Lower is better; 0.25 is what stating 50% every time earns. [JL-009]

## 3. What the report prints

`python3 judgement-ledger.py [--out FILE]` prints, for every term in use, the number of
resolved records, how many held, the observed share, and the band beside it, written as
"likely (55–80%)" — readers' readings of the terms vary widely, and an official table is matched
far less often when the number is not printed beside the term (PS-0286, PS-0287). [JL-010]
Then the Brier score over all scored records, every scored record by id with its term, outcome
and squared error, and every unscored record with the reason. [JL-011] Below ten resolved
records for a term, the report says the share is too few to read as calibration; the threshold
is a reading aid, not a statistical test. The report does not label a share as inside or
outside its band: a term at the scale's end (almost certain, almost no chance) is best served by
a share beyond its band, and the reader compares the share with the band printed beside it. [JL-012]

The script reads the trail and writes nothing in it (run-tooling-tests.sh JL6). [JL-013]

## 4. Not done here

The ledger does not choose which records get an outcome, and it does not judge whether an
outcome line is true; a `LEDGER-OUTCOME:` line is a claim like any other, ALLEGED until another
session confirms it. [JL-014] It does not compare sessions, models or systems: with the few
resolved records the trail holds, such a comparison would rest on a handful of questions; the
forecasting tournaments that compare forecasters do so on cumulative Brier scores over their
forecasts (Tetlock et al., PS-0282). [JL-015]
