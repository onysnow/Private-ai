# Output Schemas

*Part of Logic Authority System (LAS) — v0.1.*

Taxonomies, scales and record formats the prompt modules reference.

## Formal fallacy list

| Fallacy | Pattern | Example |
|---|---|---|
| Affirming the consequent | If P then Q; Q; therefore P | "If it rained, the ground is wet. The ground is wet. Therefore it rained." (ignores other ways the ground could be wet) |
| Denying the antecedent | If P then Q; not P; therefore not Q | "If it rained, the ground is wet. It didn't rain. Therefore the ground isn't wet." |
| Undistributed middle | All A are B; all C are B; therefore all A are C | "All dogs are mammals; all cats are mammals; therefore all dogs are cats." |

## Informal fallacy taxonomy

| Fallacy | Definition |
|---|---|
| Ad hominem | Attacking the arguer's character, motive, or circumstances instead of the argument's content |
| Straw man | Refuting a distorted or weakened version of the argument instead of the argument actually made |
| False dilemma / false dichotomy | Presenting only two options when other genuine options exist |
| Slippery slope | Asserting a chain of consequences from an initial step without establishing each link's likelihood |
| Circular reasoning (begging the question) | The conclusion is assumed within a premise, restated rather than supported |
| Appeal to authority (fallacious) | Citing an authority outside their actual expertise, or where no genuine expert consensus exists — distinct from a well-used argument from expert opinion (checked against its critical questions inside Module 04 before confirming) |
| Appeal to popularity (ad populum) | A claim is treated as true because many people believe it |
| Appeal to emotion | Substituting an emotional reaction for actual support |
| Red herring | Introducing an irrelevant point to divert from the actual argument |
| Hasty generalization | Drawing a general conclusion from a sample too small or unrepresentative to support it |
| Post hoc ergo propter hoc | Assuming that because B followed A, A caused B |
| Equivocation | A key term shifts meaning between where it's used in the premises and the conclusion |
| False analogy (weak analogy) | The cases differ in the respect that matters; the analogy scheme's critical questions failed (Module 04 rule 4) |
| Conjunction fallacy | A conjunction rated more probable than one of its conjuncts |
| No true Scotsman | Redefining a category to exclude counterexamples after the fact, rather than revising the claim |
| Tu quoque | Dismissing a criticism by pointing out the critic's own inconsistency, rather than addressing the criticism |
| Genetic fallacy | Judging a claim's truth by its origin rather than its content |
| Appeal to ignorance (argumentum ad ignorantiam) | Treating a claim as true because it hasn't been disproven, or false because it hasn't been proven |
| Fallacy fallacy (argument from fallacy) | Concluding an argument's conclusion is false because the argument offered for it is fallacious or invalid — whether the fallacy is merely suspected or CONFIRMED (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §4.10, Rule 14) |

## Argumentation schemes (Walton-derived, base set)

The five schemes `CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §4.9 names, used inside Module 04's fallacy screen against over-flagging (§4.10); Module 04 carries each one's critical questions.

## Universal intellectual standards (Paul-Elder-derived)

Clarity, Accuracy, Precision, Relevance, Depth, Breadth, Logic, Significance, Fairness — see Module 09.

## Verdict vocabulary

- **Prompt-adoption evaluation** (`PROMPT_QA_RUBRIC.md`): PASS / PASS WITH CORRECTIONS / REVISE AND RETEST / FAIL.
- **Final audit** (Module 10): PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL.
- **Inductive/abductive strength** (Module 02, non-deductive lines): stated with the calibrated vocabulary in `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`, not VALID/INVALID.
- Validity verdict, premise verification status, fallacy-finding status and consistency classification: the closed sets their record tables declare below.
- **Composite verdict** (Module 09), one value per argument: SUPPORTED / SUPPORTED IF PREMISES HOLD / PARTLY SUPPORTED / NOT SUPPORTED / NOT ASSESSABLE, defined in Module 09 rule 8.

## Stable record IDs

For a consequential audit, maintain stable IDs across module outputs — the `*_id` row of each record below (`ARG-`, `PREM-`, `FAL-`, `STL-`, `CON-`, `VER-`).

## Records

Machine forms (JSON): `OUTPUT_SCHEMAS_MACHINE.md`.

### Argument record
| Field | Description |
|---|---|
| `arg_id` | `ARG-####` |
| Conclusion | |
| Explicit premises | list of `premise_id` |
| Unstated premises | list of `premise_id` |
| Inferential type | deductive / inductive / abductive, per line |
| Validity verdict | VALID / INVALID / NOT CLEANLY FORMALIZABLE (deductive lines) |
| Inductive/abductive strength | calibrated term + basis (non-deductive lines) |
| Formal fallacy (if any) | |
| Logical form | deductive lines, if renderable (Module 02) |
| Rival explanation not addressed | abductive, INVALID or weak lines (Module 02 rule 10) |
| Conclusion-scope mismatch (Rule 10) | what the premises, if true, establish, where that is narrower than the stated conclusion (Module 02) |
| Equivocation affecting the inference (Rule 11) | list of `finding_id` (Module 02 rule 9, Module 05) |
| Confidence term | calibrated term for each verdict or strength (`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 1) |
| Argument lines | per line: premises, inferential type, verdict (Module 01 rule 5, Module 02 rule 7) |
| No-premises-offered flag | yes / no (Module 01 rule 7) |

### Premise record
| Field | Description |
|---|---|
| `premise_id` | `PREM-####` |
| Premise text | |
| Attribution category | STATED BY ARGUER / ATTRIBUTED SOURCE / RECONSTRUCTED BY EVALUATOR / BACKGROUND ASSUMPTION / USER-STIPULATED |
| Type | empirical / normative / definitional |
| Load-bearing or peripheral | |
| Verification status | VERIFIED / CONTESTED / REFUTED / UNVERIFIED / UNVERIFIABLE; a definitional premise is VERIFIED by consistent use (Policy §4) |
| Check performed | none / checked, short of the bar / checked, not testable from available sources / stipulated by the requester |
| Source (if applicable) | |

### Fallacy finding
| Field | Description |
|---|---|
| `finding_id` | `FAL-####` |
| Passage | |
| Located step | which premise or inferential move |
| Fallacy candidate | From the formal or informal taxonomy above |
| Scheme critical questions checked (if applicable) | |
| Status | CANDIDATE / CONFIRMED / DISMISSED |
| Confidence term | calibrated term for the status (`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 1) |
| Mechanism | Why it fits, or why it was dismissed |

### Counterargument pair
| Field | Description |
|---|---|
| `pair_id` | `STL-####` |
| Strongest opposing argument | premises + conclusion |
| Crux | What would need to be true for each side to prevail |
| Original survives? | yes / no, and why |
| Module 02 invalidity unaffected? | yes / no / none found (Module 06 D) |

### Consistency finding
| Field | Description |
|---|---|
| `finding_id` | `CON-####` |
| Statement A (this argument) | |
| Statement B (other statement) | source + location |
| Same entity/question/time/scope? | |
| Acknowledgment check | acknowledged by the source? with the passage (Module 07 rule 2) |
| Classification | DIRECT CONTRADICTION / SCOPED CHANGE OF POSITION / DEFINITIONAL MISMATCH / UNRESOLVED / NOT A CONTRADICTION |
| Basis | |

### Hidden premise and equivocation record (Module 05)
| Field | Description |
|---|---|
| `arg_id` | the argument examined |
| Hidden premises | list of `premise_id`, ranked by how much work each does; an unclear role marked uncertain (Module 05 rule 2) |
| Key terms checked | every key term used more than once |
| Equivocation findings | list of `finding_id` — each equivocation is also a fallacy finding (Equivocation), with both meanings and where the break occurs |
| Ambiguous terms with no shown shift | Module 05 rules 7, 11; read by Module 09 rule 7, Module 10 rule 10 |
| Vague-but-consistent terms | for Module 09's clarity assessment, not equivocations |

### Rhetoric record (Module 08)
| Field | Description |
|---|---|
| `arg_id` | |
| Technique | loaded language / false urgency / false balance / unsupported confident tone / repetition / other, named |
| Passage | |
| Corresponds to a confirmed fallacy | `finding_id`, or none |
| Note | |

### Argument verdict record
| Field | Description |
|---|---|
| `verdict_id` | `VER-####` |
| Standards assessment | Clarity, Accuracy, Precision, Relevance, Depth, Breadth, Logic, Significance, Fairness |
| Composite verdict | Module 09 rule 8 |
| Confidence | LOW / MEDIUM / HIGH, per `CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` |
| Confidence term | ALMOST_CERTAIN / VERY_LIKELY / LIKELY / ROUGHLY_EVEN_CHANCE / UNLIKELY / VERY_UNLIKELY / ALMOST_NO_CHANCE — the term, applied to the verdict as stated (`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md` Rule 3); the value carried when this verdict is handed to another system |
| Confidence basis | The specific calibrated term and why |

### Final audit record (Module 10)
| Field | Description |
|---|---|
| `verdict_id` | the `VER-####` audited |
| Check | Module 10 rule number |
| Finding | |
| Check verdict | PASS / FAIL |
| Overall verdict | PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL |
| Limited-review trigger | which record or text was missing, if LIMITED REVIEW |
| Required corrections | |

## Null and uncertainty rules

- Use `null` or `UNKNOWN` when a field is absent or unknown — never an invented value.
- An UNVERIFIED premise is never presented as checked unless its Check performed field says it was.
- A fallacy finding at CANDIDATE status must never be presented in prose as though it were CONFIRMED.
- A consistency finding is DIRECT CONTRADICTION only if the same-scope check and the acknowledgment check (Module 07 rule 2) were both performed.
