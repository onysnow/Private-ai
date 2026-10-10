# Module 02 — Validity Check

*Part of Logic Authority System (LAS) — v0.1.*

## Use when

After reconstruction (Module 01), before soundness or fallacy checks.

## Prompt

```text
OBJECTIVE
Test whether the conclusion follows from the stated and unstated premises — deductively (does it follow necessarily) or, where the argument is not deductive, inductively or abductively (how strong is the support) — independent of whether those premises are true.

RECONSTRUCTED ARGUMENT
[FROM MODULE 01]

RULES
1. First classify the argument's inferential type: deductive (the conclusion is claimed to follow necessarily), inductive (the premises are claimed to make the conclusion probable), or abductive (the conclusion is claimed to be the best explanation of the premises). An argument can mix types across its lines; classify each line separately if Module 01 identified more than one.
2. For a deductive line: state the logical form as explicitly as it can be rendered (e.g., "if P then Q; P; therefore Q" — modus ponens) without forcing an ill-fitting formal structure onto genuinely informal reasoning; where it doesn't reduce to a clean formal structure, say so. Check against the named formal fallacies in EVALUATION/OUTPUT_SCHEMAS.md: affirming the consequent, denying the antecedent, undistributed middle. Render a verdict: VALID, INVALID, or NOT CLEANLY FORMALIZABLE.
3. For an inductive line: assess how strongly the premises support the conclusion — sample size and representativeness, base rates, whether the stated probability is actually warranted by the evidence given — and state the strength using the calibrated vocabulary in CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md (its worked examples). Do not call an inductive line "valid" or "invalid" — those terms are for deduction; state the calibrated term ("strong" means likely or above, "weak" a lower term).
4. For an abductive line: assess the conclusion as an explanation using standard criteria — does it actually explain the premises, is it simpler than rival explanations, does it fit with what else is known, and were plausible rival explanations considered and ruled out or left unaddressed. An abductive conclusion is not established merely because it fits (rule 10).
5. Assume every premise is true for the purpose of this check.
6. If the argument only supports a weaker or narrower conclusion than the one stated, say so explicitly (e.g., "the premises support 'some X are Y,' not the stated 'all X are Y'") rather than marking it simply invalid, simply valid, or simply strong.
7. Where multiple argument lines were identified in Module 01, assess each independently — one line can be valid or strong while another supporting the same conclusion is not.
8. Do not evaluate premise truth here (Module 03) or run the systematic fallacy screen here (Module 04) — this module is validity/strength only, though a formal fallacy that determines the verdict should still be named so Module 04's screen can cross-check it.
9. Before stating a validity verdict or a strength, check every key term that appears in more than one premise, or in a premise and the conclusion, for a shift in meaning (CORE/LAS_PROMPT_ENGINEERING_STANDARD.md Rule 11, §9). A shift is an equivocation: the inference that crosses it is INVALID (deductive) or unsupported (non-deductive), however each sentence reads alone. Name it for Modules 04 and 05; Module 05's fuller term check can still amend this verdict at synthesis (Module 09 rule 7).
10. For every abductive line, and every line judged INVALID or weak whatever its type, state what else could explain the evidence: the rival explanation, if any, not addressed (affirming the consequent leaves other causes of the consequent open).

OUTPUT
| Field | Value |
| Inferential type (deductive / inductive / abductive, per line) | |
| Logical form (deductive lines, if renderable) | |
| Validity verdict (VALID / INVALID / NOT CLEANLY FORMALIZABLE) — deductive lines | |
| Inductive/abductive strength (calibrated term + basis) — non-deductive lines | |
| Formal fallacy identified, if any | |
| Rival explanation not addressed (abductive, INVALID or weak lines — rule 10) | |
| Conclusion-scope mismatch, if any | |
| Equivocation affecting the verdict, if any | |
| Per-argument-line results (if multiple lines) | |
| Confidence term per verdict and strength | |
```
