# QAS Build Log

Each entry is taken from `CHANGELOG.md`, which holds the detail.

## 2026-10-10: v0.1, built under DIR-0043

First build, under PROP-0007's cost limits ("small first"): the Standard and
the confidence file as the load; seven modules (01 Question and Data Framing
to 07 Final Quantitative Audit); the module catalog; the template library
with T00–T02; output schemas for QFRM, QDAT, QCLN, QRIV, QPLN, QRES, QCAU and
QAUD; the suite Q01–Q12 with gate Q03, Q06, Q07, Q11, Q12; the source index
QS-01 to QS-21 with six limits and the not-read list; README and LICENSE.
Second-reader fixes were applied the same day. A prompt QA rubric, a
project-instructions template and a build plan were not built, by design.

## 2026-10-10: DIR-0044, fixes from the first audit

Fixes from AUDIT_QAS_2026-10-10: date and time on QCLN, QPLN and QRES; the
QDAT output rows; `no_interval_reason`; a Module 07 rule checking the
completion standard and the draft's scope against the framing record; the
fresh-context consequence; QCAU `likelihood_term` and `band`; the verdict
rule's FAIL and correction paths; rival `category`; the exclusion-ordering
field; source markings and the not-read list; the confidence file's
restating sentence (UNSOURCED-4). Left to the maintainer: UNTESTED-1 and
UNTESTED-2 (MISSING-6, MISSING-7, UNTESTED-3 and UNSOURCED-4 were done in
the same change; BROKEN-10's two criteria under DIR-0045).

## 2026-10-10: DIR-0045, terms defined from published sources

Standard §9 defines "central claim" and "plausible structure"; Module 07
rule 13 and Module 06 rule 4 point to it; QS-22 to QS-24 and a limit on
switched primary designations were added to the source index.

## 2026-10-10: DIR-0046, full authority system

The maintainer chose "Full system, in the pipeline": QAS takes router row 3,
between fact and inference, and PROP-0007's cost limits no longer bind it.
Added the data source and quality policy, the project-instructions template,
the prompt QA rubric, this log and the build plan; the Standard's data
principle, load, completion item 8 and §10 hand-offs; the QDAT assurance
block and QAUD hand-off; Module 02 rule 12; template T03; tests Q13–Q24 and a
nine-test gate; sources QS-25 to QS-39 and limits 8 and 9. Version v0.2.

## 2026-10-10: DIR-0046, fixes from the re-audit (v0.3)

Fixes from AUDIT_QAS_2026-10-10b: Module 07 rule 14 writes the QAUD
hand-off; Module 04 rule 7 runs results with and without material whose
received status is unsettled, and Module 07 rule 12 checks Standard §10 In
and Policy rules 8 and 18 to 21; `upstream_status` names its issuing system
and record; QRES gains `datasets` and `interval_covers` (new Module 05 rule
14), the assurance block `conflicts_with`, `principles_relied_on` and
`reliance_by_period`; Module 07's verdict rule made exhaustive; Policy
rules 17 to 19 and 21 closed (UNKNOWN, reliance per period, a DO_NOT_RELY
result reported with its reason, the quality the question needs most, an
unexplained difference); Standard §9 defines "where possible"; the
confidence file in the full shape; tests Q13, Q14, Q19 to Q22 corrected and
Q25 to Q33 added (33 tests); source markings for Policy rules 2, 3, 15 and
21 and QS-17's entry; the CHANGELOG in date order; a version line. Outside
this directory: INTEROP [IN-026], [IN-060], [IN-061], [IN-066], [IN-071], [IN-084],
[IN-081], [IN-083]; failure-catalog pointers [BF-172], [BF-173], [II-042],
[II-043], [II-044]. Left to the maintainer: MISSING-7, UNTESTED-1,
UNTESTED-4.
