# Module 07 — Consistency Check

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After the argument under review has been reconstructed (Module 01), whenever other statements or arguments from the same source — made elsewhere, in a different context, or at a different time — are available and in scope for the task. Distinct from Module 06: that module tests the argument against an *opposing* argument someone else could make; this module tests it against the *same source's own* other claims.

## Why this is its own module

An argument can be internally valid, fallacy-free, and well-supported, and still sit in real tension with something the same source has argued elsewhere without ever acknowledging the shift. That tension is not a defect in the argument's own structure — Modules 02-06 will not find it, because they only look at the argument in isolation. It is a distinct finding about the source's overall reliability and candor, and it belongs in the final synthesis alongside, not instead of, the structural findings.

## Prompt

```text
OBJECTIVE
Check whether the argument under review is consistent with other claims or arguments made by the same source elsewhere, and flag any genuine contradiction — while not mistaking a scoped, acknowledged change of position for one.

RECONSTRUCTED ARGUMENT
[FROM MODULE 01]

OTHER STATEMENTS OR ARGUMENTS BY THE SAME SOURCE
[TEXT, TRANSCRIPT, OR SUMMARY OF OTHER STATEMENTS — IF NONE ARE AVAILABLE, SAY SO AND STOP; DO NOT INVENT A SOURCE'S OTHER POSITIONS]

RULES
1. Before labeling any two statements contradictory, verify that they actually address the same entity, the same question, the same time period, and the same scope. Two statements that look opposed on the surface but address different questions, different time periods, or different scopes are not a contradiction.
2. Classify each tension found as one of: DIRECT CONTRADICTION (the same claim, same scope, asserted and denied, with no acknowledgment of the shift), SCOPED CHANGE OF POSITION (the source has changed its stated view and says so — for example, given new evidence. A change the source does not acknowledge is not scoped: if the two statements differ in entity, question, time period or scope, rule 1 already means they are not a contradiction, and the pair is NOT A CONTRADICTION; if they do not, the pair is a DIRECT CONTRADICTION. A different venue, audience or medium is not a change of scope), DEFINITIONAL MISMATCH (the apparent conflict dissolves once a key term is pinned to one consistent meaning — cross-reference Module 05's equivocation findings if the same term is doing the work), UNRESOLVED (a real tension exists but the available material does not settle which classification applies), or NOT A CONTRADICTION (the two statements differ in entity, question, time period or scope under rule 1, whether or not the source acknowledges the difference). Record the acknowledgment check for every pair: whether the source acknowledges the change, with the passage if it does.
3. Only DIRECT CONTRADICTION is itself a defect to flag against the source's reliability. A SCOPED CHANGE OF POSITION is not a defect — do not penalize a source for updating its view; flag it only if the source is representing the new position as though it were its consistent, longstanding one, which is a separate defect (a misrepresentation of the source's own history, not an inconsistency in the underlying logic).
4. State the exact passage from each of the two statements being compared — do not summarize into a generic "this contradicts that" without quoting or closely paraphrasing both sides.
5. Where no other statements from the source are actually available, do not invent them or infer what the source "probably" believes elsewhere — report the consistency check as not performed, with the reason, rather than skipping it silently.
6. A source arguing for a conclusion here that another, different, independent source has argued against is not a consistency finding — this module checks one source against itself, not against disagreement generally (that comparison, where relevant, belongs in Module 06's counterargument construction or in the broader synthesis).

OUTPUT
| Finding id (CON-####) | Statement A (this argument) | Statement B (other statement, source + location) | Same entity/question/time/scope? | Acknowledged by the source? | Classification (DIRECT CONTRADICTION / SCOPED CHANGE OF POSITION / DEFINITIONAL MISMATCH / UNRESOLVED / NOT A CONTRADICTION) | Basis |

If no other statements were available: state "Consistency check not performed — no other statements available" and the reason, rather than a findings table.
```
