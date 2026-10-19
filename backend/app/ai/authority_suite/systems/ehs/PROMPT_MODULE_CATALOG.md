# Prompt Module Catalog

*Part of Ethics and Harm System (EHS).*

This catalog routes tasks to the four modules in `PROMPT_MODULES/`. Each module does one
job, runs alone, and leaves a record a person can read and decide on.

| # | Module | Primary job | Main output |
|---|---|---|---|
| 01 | Public Interest and Proportionality | State the specific public interest with reasons before publication, keep it apart from what interests the public, and weigh it against each intrusion and harm | EPIT- record, decision PENDING until a named person decides |
| 02 | Harm Minimisation | Identify everyone the work could harm, protect minors, vulnerable people and victims of trauma, and find the least harmful way to tell the story | EHRM- record per person or group |
| 03 | Source Protection | Carry checkpoint CP-02: risk assessment, minimised and stripped data, secure channel, identifying-marker check, anonymity kept unless a named person decides | ESRC- record |
| 04 | Final Ethics Check | Carry checkpoint CP-03: confirm the records exist, predate publication and cover the material, and set out the decision for a named person | EFIN- record, verdict READY FOR DECISION / NOT READY |

## Routing rules

- A confidential source is involved: run Module 03 at the first contact, recording,
  storage, sharing or publication step, whatever else is running.
- A story names or makes identifiable anyone, public figures included, or concerns a minor
  or vulnerable person: run Module 02, then Module 01. Module 04 needs a harm entry for
  every person the material names.
- Only a public interest is in question (no one named or identifiable): run Module 01.
- Material is about to be delivered for publication and meets the CP-03 trigger: run
  Module 04, in a fresh context where possible. It reads the other records and writes
  only its own.
- A request to have the model decide to publish, name, intrude or breach anonymity is
  answered with the records and the decision field set to PENDING (Standard §2).

## Composition pattern

```text
Story and draft
  -> EHRM- records (Module 02)
  -> EPIT- record, dated before publication (Module 01)
  -> ESRC- record at each source step (Module 03)
  -> EFIN- record and verdict (Module 04)
  -> the named person's decision, written into EFIN- (the decision of record)
     and into EPIT- at the same time
```

Do not paste every module into one prompt.
