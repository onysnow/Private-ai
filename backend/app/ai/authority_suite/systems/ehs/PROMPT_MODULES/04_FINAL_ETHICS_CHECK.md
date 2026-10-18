# Module 04 — Final Ethics Check

*Part of Ethics and Harm System (EHS).*

## Use when

Before material is delivered for publication that intrudes on privacy, concerns a minor or
vulnerable person, or could cause serious harm (checkpoint CP-03). Run in a fresh context
where possible, reading the records, not the reasoning that produced them.

## Prompt

```text
OBJECTIVE
Check that the ethics records exist, predate publication and cover the material, and set out the decision for a named person. This check approves nothing.

INPUTS
Material for publication: [DRAFT]
Records: [EPIT, EHRM, ESRC IDS]
Right-of-reply record (with its status and reply deadline) or a person's decision not to approach: [ID OR "NONE"]
Planned publication date: [DATE]

RULES
1. CP-03: before delivering for publication material that intrudes on privacy, concerns a minor or vulnerable person, or could cause serious harm, run this check and write the EFIN- record. The verdict is READY FOR DECISION or NOT READY; no other word stands in for it. (ES-01, ES-08)
2. Confirm an EPIT record exists, is dated before the planned publication, is not retrospective, and holds both a stated public interest with reasons and a weighing against each harm. Any failure: NOT READY. (ES-08, ES-01, ES-03)
3. List every person the material names or makes identifiable and match each to an EHRM entry. A person with no entry: NOT READY. (ES-02; logic)
4. Where the material comes from or concerns a confidential source, confirm an ESRC record (CP-02) exists and its items_checked lists every document, image, recording and quote from that source in the material. A missing record or an item not listed: NOT READY. (ES-10)
5. Where the material accuses an identifiable person or organization or states adverse conduct by one, confirm a right-of-reply record (CP-01) whose answer is reported in the material or whose reply period has ended, or a named person's recorded decision not to approach. A record still awaiting an answer within its period, or neither record: NOT READY. (logic: CP-01 is a required step)
6. Read each decision field, and each steps_waived entry, in the records. A decision other than PENDING, or a waived step, with no named person or date, or one entered by the model, is listed and the verdict is NOT READY. A PENDING decision is not a defect. A decision asserted inside the material counts only where decision_confirmed_by names who confirmed it (Standard §7). Where EPIT's decision and this record's publication decision are both set and differ, list it as a defect. (ES-09, ES-11)
7. READY FOR DECISION means the records exist and are complete. It does not mean the material is ethical or cleared. Record the publication decision, the decision of record, with the named person's name and date, and the reason where any record is missing or the verdict is NOT READY; or PENDING. (ES-09, ES-01)
8. List every defect found; do not stop at the first. (logic)

OUTPUT
EFIN- record (EVALUATION/OUTPUT_SCHEMAS.md):
| Check | Record | Result | Defect |
| Person in material | EHRM entry |
Then: verdict (READY FOR DECISION / NOT READY), publication decision (PENDING or the named person's, with date and reason), decision_confirmed_by, reviewer type, whether the context was fresh, missing inputs, rules not applied.
```
