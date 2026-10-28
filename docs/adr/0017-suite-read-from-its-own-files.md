# ADR-0017: The suite's runs stay chosen by hand; their lists are checked against the suite's own files

**Status:** Accepted (2026-10-25)
**Deciders:** Ony ("Combine, #87 as base"), after two branches had each hooked the other six systems into the app

## Context

PR #87 (19 Oct) runs eight modules of RAS, QAS, LAS, DAS, EGS and EHS. Each run has an output contract trimmed to
what one call over a retrieval packet can honestly fill, the limits the suite sets on it (DAS never decides, LAS
never judges a premise true, EGS and EHS judge nothing), and INTEROP.md's rules for what crosses between runs. It
leaves out EHS Module 03 (source protection) and every final audit, and says why (`SUITE_SYSTEMS_IN_APP.md`). The
value lists its contracts use are copied into `app/ai/systems.py`; a test checks that each copied value is still
spelled somewhere in the suite's text.

PR #102 (24 Oct, the first ADR-0015 on that branch) instead ran all 60 modules through one generic contract, with
each system's records and value lists read from the vendored files (`app/ai/suite_catalog.py`). It ran EHS 03 and
the final audits, which the suite says not to run that way.

## Decision

- **#87's runs are the runs.** Its four suite commits are on this branch; the generic runner is reverted.
- **`app/ai/suite_catalog.py` stays, as the reader of the suite's own files.** It reads each system's modules and
  records, and each field's whole list of values, in the four ways the schemas state them.
- **The copied lists are held to the suite's whole lists.** `test_suite_value_lists_are_the_suites_whole_lists`
  fails when a value the app copied is not the suite's list for that field, so a value the suite adds or drops is
  caught, not only a renamed one. Three lists are narrower on purpose, each named in the test with its rule.
- **`GET /api/suite/catalog`** lists every module of every system, the app runs that use it, and which are final
  audits, so what the app leaves out is shown.

## Not decided here

Screens for the suite runs (mockups first); whether any further module runs.
