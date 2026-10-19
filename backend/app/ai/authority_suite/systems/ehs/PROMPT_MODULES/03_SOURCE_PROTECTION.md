# Module 03 — Source Protection

*Part of Ethics and Harm System (EHS).*

## Use when

Before contacting, recording, storing, sharing or publishing anything from or about a
confidential source (checkpoint CP-02), and again before publication.

## Prompt

```text
OBJECTIVE
Write the source-protection record before any step that could expose a confidential source, and check the material for anything that could identify the source before publication.

INPUTS
Story: [STORY_ID]
Source code name: [CODE NAME]
Planned step: [CONTACT / RECORD / STORE / SHARE / PUBLISH]
Material from or about the source: [FILES, NOTES]
Person who decides: [NAME OR "NOT GIVEN"]

RULES
1. CP-02: before contacting, recording, storing, sharing or publishing anything from or about a confidential source, write the ESRC- record. The planned step waits until the record exists; where it cannot be written, say so and stop. (Protection: ES-10, ES-01; the record-first order: design, CP-02)
2. Record a risk assessment for the source and for the journalist: who could identify the source, by what route (surveillance, retained communications data, a platform or provider handing data over, a legal demand), and what harm would follow. (ES-10, ES-04, ES-05)
3. Offer a secure channel for contact, explain each channel's risks to the source, and record what was offered and what the source chose. (ES-10)
4. Keep only the identifying data the work needs, and list what is kept, where, and who can open it (inference from ES-04's exposure routes; logic). Strip metadata from files before they are shared, limit who receives them, and delete on request as rule 5 sets out. (ES-10)
5. When the source asks for their data to be deleted, delete it within the legal and contractual obligations that apply, and record the request, the date of deletion, and any obligation that prevented it. (ES-10)
6. Before publication, check each document, image, recording and quote for markers that could identify the source: metadata (ES-10, ES-04), and document version or layout, distinctive wording, or a detail few people know (logic). List every item checked in items_checked, and record each marker and how it was handled.
7. Record why anonymity is granted: the information's public interest, the risk the source faces, the source's motive, and how the information's accuracy was checked. (ES-02, ES-10)
8. Use the code name in every draft, summary and record. Write the source's real name nowhere outside the place the ESRC record lists. (Standard §6; design)
9. A breach of anonymity, or leaving any part of rules 2–8 undone, is a named person's decision, recorded in breach_decision or steps_waived with the name, the reason and the date. The model proposes neither and enters no such decision. (ES-10, ES-11)

OUTPUT
ESRC- record (EVALUATION/OUTPUT_SCHEMAS.md):
| Step | Risk to source | Risk to journalist | Route of exposure |
| Channel offered | Risks explained | Channel chosen |
| Data kept | Where | Who can open it | Needed? |
| Item checked | Type | Markers found |
| Marker | Item | Handling |
Then: anonymity reasons, deletion requests, breach decision (PENDING, or the named person's NONE or BREACH with name, date, reason), steps waived, missing inputs, rules not applied.
```
