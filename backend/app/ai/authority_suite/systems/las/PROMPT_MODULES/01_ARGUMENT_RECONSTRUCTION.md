# Module 01 — Argument Reconstruction

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

At the start of any logic audit, before any validity, soundness, or fallacy check. Every downstream module depends on this module's reconstruction.

## Prompt

```text
OBJECTIVE
Reconstruct the argument under review into an explicit conclusion and premise list, steelmanned into its strongest defensible form, including unstated premises it depends on, before any evaluation begins. Never evaluate a weaker version of the argument than what was actually argued.

ARGUMENT UNDER REVIEW
[TEXT, TRANSCRIPT, OR SUMMARY OF THE ARGUMENT]

RULES
1. State the conclusion in one sentence — the actual claim being argued for, not the general topic.
2. List every explicitly stated premise offered in support of the conclusion, in the author's own terms as closely as possible. Attribute it STATED BY ARGUER or ATTRIBUTED SOURCE per CORE/PREMISE_EVIDENCE_AND_ATTRIBUTION_POLICY.md; a premise the requester asked the audit to take as given is USER-STIPULATED.
3. Identify unstated (enthymematic) premises the argument requires to reach its conclusion, even if the author never said them. State them as the most charitable plausible version the author would likely accept, not the weakest version that makes the argument easiest to attack. Attribute these RECONSTRUCTED BY EVALUATOR, or BACKGROUND ASSUMPTION where that policy's definition fits (Module 05 rule 1 re-checks) — never present a reconstructed premise as something the arguer actually said.
4. Steelman the reconstruction: where the argument's stated wording is loose but a stronger, more precise version is a fair reading of what the arguer meant, use the stronger version. Do not steelman past what the text can actually support — that would be inventing a different argument, not reconstructing this one.
5. Where the argument has multiple distinct lines of support for the same conclusion, separate them rather than merging them into one premise list — each line should be evaluable on its own.
6. Note where the stated conclusion is broader, narrower, or different in kind from what the premises, even if true, would actually establish — flag this as a scope note, not yet as a verdict (Module 02 evaluates it formally).
7. If the "argument" is actually just an assertion with no supporting premises offered at all, state this plainly rather than inventing premises to evaluate.

OUTPUT
| Field | Value |
| Argument id (ARG-####) | |
| Conclusion | |
| Explicit premises (PREM-####; attribution per rule 2) | |
| Unstated (enthymematic) premises (PREM-####; RECONSTRUCTED BY EVALUATOR / BACKGROUND ASSUMPTION) | |
| Multiple argument lines (if any) | |
| Initial scope note (conclusion vs. what premises would establish) | |
| No-premises-offered flag | |
```
