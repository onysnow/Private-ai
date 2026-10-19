# Module 02 — Harm Minimisation

*Part of Ethics and Harm System (EHS).*

## Use when

Anyone could be harmed by a story or by how it is gathered: named or identifiable people,
minors, vulnerable people, victims of trauma, relatives, bystanders, sources.

## Prompt

```text
OBJECTIVE
Identify everyone the work could harm, find the least harmful way to tell the story, and record the reasoning for any harm that remains.

INPUTS
Story and draft: [STORY_ID, DRAFT]
Public-interest record, where it exists: [EPIT ID]
How each person was approached: [NOTES OR "NOT GIVEN"]

RULES
1. List everyone the publication or its gathering could harm: subjects, private people named or identifiable, minors, relatives, bystanders, sources, and third parties identifiable by inference (address, workplace, a detail few people know). One EHRM entry per person or group. (ES-02, ES-09; identification by inference: logic)
2. Classify each as public figure, private person, minor (Standard §8), or vulnerable (bereaved, traumatised, with mental health problems, unable to consent). Record in the EHRM entry how the category affected the weighing, giving a private person's control over information about them more weight than a public figure's. (ES-02, ES-03)
3. For a minor or vulnerable person featured on a private matter, record the consent of a parent or responsible adult, or record that going ahead without it is put to the named person with the reason. A parent's fame is not cited as a reason in any EHRM or EPIT record. (ES-03, ES-01)
4. For a victim of trauma, record how the person was approached: whether they were open to an interview; that the journalist gave their name, outlet, and how and when the material will be used; what control the person had (pausing, stopping, photos); and, where they declined, that contact details were left and the approach ended. Do not press for details a survivor does not recall; corroborate instead. (ES-07)
5. For a crime victim, especially of a sexual offence, record whether the victim is identifiable and put any identification to the named person. (ES-02)
6. For each harm, state the least harmful way to tell the story (omit or change the name, blur, generalise the place, delay) and whether that way loses what the public interest needs. (ES-02, ES-01; the methods listed: logic)
7. A harm that remains is accepted only when the record states why it cannot be avoided and why it is proportionate to the public interest in the EPIT record, and a named person decides. A record that accepts harm without reasons, or rejects the story because some harm remains, fails this rule. (ES-02, ES-01)
8. Write each harm as a reasoned weighing, not as a probability. (Standard §2)

OUTPUT
EHRM- record per person or group (EVALUATION/OUTPUT_SCHEMAS.md):
| Person or group | Category | Harm | Approach or consent recorded | Least harmful way | Loses the public interest? | Remaining harm and reasons | Decision (PENDING or the person's) |
Then: people the draft names or makes identifiable who have no entry, missing inputs, and rules not applied with the reason.
```
