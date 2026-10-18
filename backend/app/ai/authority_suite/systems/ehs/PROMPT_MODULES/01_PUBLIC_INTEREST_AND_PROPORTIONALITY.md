# Module 01 — Public Interest and Proportionality

*Part of Ethics and Harm System (EHS).*

## Use when

A public interest is claimed for a story, or gathering or publishing it will intrude on
someone's privacy. Run before publication; the record it writes is the one CP-03 checks.

## Prompt

```text
OBJECTIVE
Draft the public-interest reasoning and the proportionality weighing for a named story, dated before publication, for a named person to decide on.

INPUTS
Story and draft: [STORY_ID, DRAFT]
Harm records, where they exist: [EHRM IDS]
Person who decides: [NAME OR "NOT GIVEN"]

RULES
1. Name the specific public interest served (exposing crime or serious impropriety; protecting public health or safety; preventing the public being misled; disclosing a failure to meet obligations or a miscarriage of justice; contributing to a public debate) and state, with facts from this story, why it applies. A category with no reasons is not a public interest. (ES-01, ES-03)
2. State separately what interests the public about the story (curiosity, audience appeal). Record it and give it no weight. (ES-09, ES-08)
3. Write and date the record before publication. A record first written after publication, or whose public interest, reasons, elements or weighing change after publication, is marked retrospective: true, with revised_at giving the date of the change. (ES-01, ES-08)
4. List each intrusion and harm the story or its gathering involves, from the harm records where they exist. Weigh the public interest against each one in these circumstances and write why it does or does not outweigh it. Naming the interest without this weighing leaves the record incomplete. (ES-03, ES-08)
5. For each intrusive element (name, image, address, private detail, method of gathering), state whether the public interest needs it. Flag for removal any element it does not need. (ES-01, ES-03)
6. For a public figure, record whether the intrusion bears on the person's public role, and what the person has already made public. (ES-09, ES-01)
7. Where a minor (Standard §8) is involved, state the exceptional public interest that would override the minor's interests, or record that none was found. (ES-01 for under-16s; applied to every minor: design)
8. Record lawful access as a fact, not as the justification. (ES-02)
9. CP-03: the decision field holds a named person's decision (PUBLISH / PUBLISH WITH CHANGES / DO NOT PUBLISH) and its date, or PENDING. The model writes PENDING and enters no decision. (ES-09, ES-01, ES-11)
10. Write the weighing as reasons, not as a probability or a score. (Standard §2)

OUTPUT
EPIT- record (EVALUATION/OUTPUT_SCHEMAS.md):
| Public interest | Reasons from this story |
| Interest of the public (no weight) | |
| Element | Intrusion or harm | Needed by the public interest? | Weighing |
Then: story_id, harm_ids, public_figure_note (rule 6), child_exceptional_interest (rule 7), lawful_access_note (rule 8), written_at, revised_at, retrospective, decision (PENDING, or the person's, matching the final check's publication decision), decided_by, decided_at, decision_reason, decision_confirmed_by, missing inputs, rules not applied.
```
