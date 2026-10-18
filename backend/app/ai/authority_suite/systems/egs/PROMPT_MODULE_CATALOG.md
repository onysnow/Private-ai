# Prompt Module Catalog

*Part of Evidence Gathering System (EGS).*

This catalog routes tasks to the five modules in `PROMPT_MODULES/`. Each module does one job, runs
alone on the records passed to it, and names the records it produces.

| # | Module | Primary job | Main output |
|---|---|---|---|
| 01 | Evidence Plan | Turn hypotheses or missing records into points to establish, with confirming and refuting evidence, holder, route, order, priority and status | GPLN plan table |
| 02 | Public-Records Requests | Draft and track written requests for existing records: wording, copies, tracking number, deadlines from the named law, fees, exemptions, narrowing, appeal | GREQ records |
| 03 | Interview Planning and Conduct | Plan, run, record and evaluate an interview; log the account as claims to corroborate | GINT records |
| 04 | Online Collection and Preservation | Capture online material with URL, source, time, tool and hash; keep originals unaltered with a chain of custody; no verification | GCAP records |
| 05 | Gathering Log and Final Gathering Check | Log every item sought and its outcome, report what was not obtained, check the plan was worked | GLOG log and verdict |

## Routing rules

- Run Module 01 first. Modules 02 to 04 take their items from GPLN records.
- Route each plan item by type: a public body's record to 02, testimony to 03, online material to 04.
  A record held by an archive, a court or a private party, or one that must be bought, is logged
  in 05 with its route and outcome.
- Run Module 03 for a person after the records that can check their account are in hand, unless the
  plan records a reason not to wait (Module 01 rule 5).
- Run Module 05 as a log from the first item sought, and run its final check last.
- Run the final check in a fresh context, given only the records, so it is not anchored on the
  drafting.
- A request to verify, authenticate, geolocate or attribute online material is outside these
  modules: Module 04 collects and preserves the item and records "not done by this system".

## Composition pattern

```text
Hypotheses, story or missing records
  -> GPLN plan (Module 01)
  -> GREQ requests (Module 02) | GINT interviews (Module 03) | GCAP captures (Module 04)
  -> GLOG log, not-obtained findings, verdict (Module 05)
  -> records and log handed on for weighing elsewhere
```
