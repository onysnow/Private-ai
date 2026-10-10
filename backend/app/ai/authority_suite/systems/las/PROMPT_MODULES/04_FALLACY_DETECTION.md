# Module 04 — Fallacy Detection

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After Modules 01–03: rule 8 records Module 02's formal fallacies and equivocations, and rule 4 reads Module 03's premise statuses; its findings stay independent of Module 02's verdict.

## Prompt

```text
OBJECTIVE
Screen the argument against every formal and informal fallacy in EVALUATION/OUTPUT_SCHEMAS.md. Every finding starts as a CANDIDATE; rules 4 and 7 decide when it becomes CONFIRMED or DISMISSED. Name the fallacy and the step it applies to (rule 2), or state that none of the checked patterns match.

RECONSTRUCTED ARGUMENT
[FROM MODULE 01]

FORMAL FALLACIES AND EQUIVOCATIONS MODULE 02 IDENTIFIED
[FROM MODULE 02]

PREMISE STATUSES
[FROM MODULE 03]

SCHEMES AND THEIR CRITICAL QUESTIONS (check before confirming a candidate that resembles one of these)
Argument from expert opinion: Is the source actually an expert in this specific field? Is there a genuine consensus among experts, or is this one dissenting voice? Is the claim within the stated area of expertise? Is the source reliable/unbiased? Is the claim consistent with what other experts say?
Argument from analogy: Are the two cases actually similar in the respects that matter to the conclusion? Are there material disanalogies that undermine the comparison?
Argument from cause to effect: Is there a plausible causal mechanism, not just a correlation? Have alternative causes been ruled out? Is the correlation strong and consistent enough to support the causal claim?
Argument from sign: Is the observed sign actually reliably associated with what it's taken to indicate? How often does the sign occur without the thing it's supposed to indicate?
Practical reasoning (argument from consequences/goals): Is the stated goal actually good/legitimate? Is the proposed action actually likely to achieve it? Are there other, better means to the same goal? What are the negative side effects?

RULES
1. Check each fallacy in the taxonomy individually rather than scanning impressionistically for "bad reasoning" in general.
2. For each fallacy flagged as a CANDIDATE, quote or closely paraphrase the specific passage, identify the exact step of the argument it applies to (which premise, or which inferential move between premises), and state exactly why it fits that fallacy's definition — a label without the specific mechanism and located step is not a usable finding.
3. Do not flag a fallacy merely because the argument reaches a conclusion you disagree with, and do not withhold a flag because you agree with the conclusion.
4. Before confirming a candidate that resembles appeal to authority, argument from analogy, or a causal claim, check it against the matching scheme's critical questions above. Answer each critical question based on what the argument actually provides — do not skip a question because the arguer didn't address it; an unaddressed critical question is itself a finding, and a candidate whose relevant critical questions are unaddressed should not be silently DISMISSED either. An answer that rests only on the argument's own assertion — a self-described expert, a claimed consensus, a stated absence of bias — is not an answer: it is a premise of the argument, and goes to Module 03 (checked there first if Module 03 did not list it). Until Module 03 marks it VERIFIED, that question counts as unaddressed and the candidate stays CANDIDATE, neither DISMISSED nor CONFIRMED on the argument's word. If Module 03 marks it REFUTED, the question is answered no and the candidate may be CONFIRMED. Move the candidate to CONFIRMED only if the critical questions are not adequately met; move it to DISMISSED if they are.
5. A scheme classified as DISMISSED (used well) does not bypass Module 03's premise-verification requirement — a well-used argument from expert opinion still has an UNVERIFIED premise (the expert's claim itself) until that's actually checked.
6. Distinguish a genuine fallacy from a rhetorical technique that isn't itself a logical error (loaded language without a corresponding logical gap belongs in Module 08, not here).
7. Where a fallacy is borderline or the passage is ambiguous, leave it CANDIDATE with the ambiguity stated, rather than forcing a confident CONFIRMED or DISMISSED label either way.
8. Also flag any formal fallacy or equivocation (Module 02 rule 9) Module 02 identified in its validity check here, cross-referenced, so the fallacy taxonomy stays the single place a reader checks for every fallacy finding regardless of which module first surfaced it.

OUTPUT
| Finding id (FAL-####) | Passage | Located step (which premise/inferential move) | Fallacy candidate | Scheme critical questions checked (if applicable) | Status | Confidence term | Mechanism (why it fits, or why it was dismissed) |
```
