# Integrated Prompt Template Library

*Part of Ethics and Harm System (EHS).*

Version 0.1 — 2026-10-10

Replace bracketed fields. Use the narrowest template that fits.

### Mandatory invocation block

```text
GOVERNING PROJECT FILES
First consult:
- CORE/EHS_STANDARD.md
- CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md, when any confidence language will be used
Consult on demand: the modules the catalog routes the task to.

If a named file is unavailable, say so before any analysis and do not claim compliance with a file you could not read.

AUTHORITY RULE
These files govern how the considerations are laid out and recorded. The decision to publish, to name a private person or a minor, to intrude on privacy, or to breach a source's anonymity belongs to the named person in the record. The model drafts, records and flags; it decides none of these.
```

## Template selector

| Need | Template |
|---|---|
| Decide which modules a story needs | T00 Router |
| Run every module on a story before publication | T01 Full pipeline |
| Protect a confidential source at a contact, storage, sharing or publication step | T02 Source protection (CP-02) |

### T00 Router

```text
[MANDATORY INVOCATION BLOCK]

STORY: [STORY_ID, ONE-PARAGRAPH SUMMARY]
PEOPLE NAMED OR IDENTIFIABLE: [LIST]
CONFIDENTIAL SOURCE INVOLVED: [YES / NO / UNKNOWN]
PLANNED PUBLICATION DATE: [DATE OR "NONE"]

TASK
Apply the catalog's routing rules. Return the modules to run, in order, and why each applies. Treat UNKNOWN as YES for Module 03. Return the missing inputs. Do not run the modules.
```

### T01 Full pipeline

```text
[MANDATORY INVOCATION BLOCK]

STORY AND DRAFT: [STORY_ID, DRAFT]
PERSON WHO DECIDES: [NAME]
SOURCE CODE NAMES: [LIST OR "NONE"]
HOW EACH PERSON WAS APPROACHED: [NOTES OR "NOT GIVEN"]
RIGHT-OF-REPLY RECORD OR DECISION NOT TO APPROACH: [ID, STATUS AND REPLY DEADLINE, OR "NONE"]
PLANNED PUBLICATION DATE: [DATE]

TASK
Run Module 02, then Module 01, then Module 03 for each confidential source, then Module 04. Pass records by id. Set every decision field to PENDING. End with the EFIN- verdict and a list of what the named person must decide.
```

### T02 Source protection (CP-02)

```text
[MANDATORY INVOCATION BLOCK]

SOURCE CODE NAME: [CODE NAME]
PLANNED STEP: [CONTACT / RECORD / STORE / SHARE / PUBLISH]
MATERIAL: [FILES, NOTES]
PERSON WHO DECIDES: [NAME]

TASK
Run Module 03. Write the ESRC- record before the planned step. Use the code name only. Where the planned step would expose the source, stop and say what the named person must decide.
```
