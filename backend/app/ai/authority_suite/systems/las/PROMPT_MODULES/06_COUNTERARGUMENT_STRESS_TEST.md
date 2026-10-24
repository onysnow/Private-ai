# Module 06 — Counterargument & Steelman Stress-Test

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After Modules 01–03 (the reconstructed argument, and the validity and soundness checks) and before Module 09's synthesis, whenever the argument is being evaluated adversarially or the evaluator has a stake in the outcome. Required, not optional, for any consequential audit.

## Not the same job as Module 01's steelmanning

Module 01 already steelmans the *original* argument during reconstruction — it makes sure LAS isn't evaluating a weaker version of what the arguer actually said. This module's job is different: constructing the strongest plausible *opposing* argument and checking whether the (already-steelmanned) original survives contact with it. Do not re-do Module 01's work here; start from its output.

## Prompt

```text
OBJECTIVE
Construct the strongest possible opposing argument to the reconstructed (already-steelmanned) argument under review, and check whether the original survives it — rather than only checking it against weak objections.

RECONSTRUCTED ARGUMENT AND FINDINGS SO FAR
[FROM MODULES 01-05]

RULES
1. Take the Module 01 steelman as given — do not re-steelman the original argument here; that work is already done.
2. Construct the strongest opposing argument: not a token objection, but the case a genuinely thoughtful critic would make, with its own premises stated as explicitly as the steelmanned original, incorporating any weaknesses Modules 02-05 already surfaced (an unresolved premise, a hidden assumption, a scope mismatch) where a real critic would actually raise them.
3. Do not let the counterargument quietly repair a genuine formal invalidity found in Module 02 — a counterargument tests whether the original survives contact with real opposition; it does not retroactively fix the original's own structure. State explicitly if the invalidity survives this stress-test (it will, since invalidity is a property of the original's own structure, not of how well it's opposed).
4. State what would need to be true for the strongest opposing argument to prevail, and what would need to be true for the original (steelmanned) argument to prevail instead — this is the actual crux, not the surface-level dispute.
5. Where the original argument does not survive the counterargument (the counterargument identifies a decisive, unaddressed weakness), say so plainly rather than treating "an opposing argument exists" as itself neutral information. "The original does not survive" is a finding about the argument, not about its conclusion: do not say the conclusion is false, or that it is contradicted, on figures the materials do not verify; say what support it has and leave its truth open.

OUTPUT
A. Pair id (STL-####) and strongest opposing argument (premises + conclusion), distinct from the Module 01 steelman
B. The actual crux: what would need to be true for each side to prevail
C. Whether the original survives the stress-test, and why
D. Whether Module 02's invalidity finding (if any) is unaffected by this stress-test, as expected
```
