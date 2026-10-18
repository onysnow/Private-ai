# Prompt Module Catalog

*Part of Decision Authority System (DAS).*

This catalog routes tasks to the individual modules in `PROMPT_MODULES/`, in the same spirit as TAS's own catalog: each module is a single-purpose stage with an inspectable output, composed rather than pasted into one giant prompt.

| # | Module | Primary job | Main output |
|---|---|---|---|
| 01 | Decision Framing | Identify the real decision, decision-maker, stakes, reversibility, domain, and deadline; distinguish the real question from a proxy question | Framing record + process recommendation |
| 02 | Option Generation & Evidence Gathering | Widen the option set beyond the default and one alternative; gather evidence and precedent without cherry-picking | Option list + tiered evidence table + search-discipline note |
| 03 | Stakeholder & Consequence Mapping | Identify everyone affected, including conflicting-interest and unconsulted groups; map first- and second-order, distributional consequences | Stakeholder register + consequence map |
| 04 | Assumption & Bias Audit | State the leading option's assumptions and falsifiers, reason from a real reference class, and check for anchoring, availability, sunk-cost, confirmation bias, overconfidence, groupthink, status-quo bias, and motivated reasoning | Assumption table + base-rate note + bias-check finding list |
| 05 | Uncertainty & Risk Assessment | Attach calibrated confidence to the key uncertain, decision-sensitive facts; identify what new information would change the recommendation | Sensitivity-ranked uncertainty table + worst-case and information-value notes |
| 06 | Comparative Evaluation | Compare the real options against explicit, weighted criteria — including at least one criterion from the consequence map | Weighted comparison + expected-value, worst-case and regret table + recommendation |
| 07 | Pre-Mortem & Failure Mode Analysis | Assume the chosen option has already failed a year from now; name the most likely causes, including at least one genuinely damaging one | Pre-mortem finding, ranked and linked to gaps it exposes |
| 08 | Decision Synthesis & Rationale Documentation | Write the actual decision record before the outcome is known: chosen option, rejected options and why, assumptions, confidence, owner, review trigger | Decision record |
| 09 | Reversibility & Commitment Check | Re-check reversibility against the specific committed plan; identify the smallest reversible first step | Reversibility re-check + smallest-reversible-step analysis + walk-back conditions |
| 10 | Final Decision Audit | Independently audit the whole record against the Standard's classification requirements, stage disciplines and completion standard (§5, §7–§13, §15 and §18), before and after an outcome exists | Process-quality verdict (PASS / PASS WITH CORRECTIONS / LIMITED REVIEW / FAIL), kept separate from any outcome |
| 11 | Post-Decision Review Trigger | Define concrete calendar, threshold, or new-evidence triggers for revisiting the decision; write the outcome record when one fires | Review-trigger record; outcome record (rule 10) |

## Routing rules

- Do not skip Module 01. Every downstream module's rigor depends on the classification it produces — the equivalent of TAS's "do not start with Case Synthesis when raw records haven't been extracted."
- A Type 2 (reversible), Simple/Clear-domain decision may run as a lightweight pass (template T02): it meets the minimum `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §18 names and may compress or skip the other stages — compressing Modules 03 and 05 means a stakeholder list without a full consequence map and a short sensitivity note without a full table — and its record lists each skipped stage as skipped; a Type 1 (irreversible) or Complex-domain decision should not. A Chaotic-domain decision acts first: the stabilizing action is taken and recorded before Modules 02–07, which then run on the follow-on decision (`CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §5.2). A Disorder classification is resolved first (Module 01 rule 10).
- Do not run Module 06 before Modules 03–05 have produced at least a lightweight pass — criteria and scores built without a stakeholder map or sensitivity check tend to silently omit the effects that later turn out to matter most.
- Module 09 runs after Module 08, not before — reversibility of the specific committed plan can only be checked once the plan itself is written down, which is why it comes after synthesis rather than immediately after Module 01's initial classification.
- Module 11 should be produced alongside Module 08 and Module 09, not deferred — a decision record without a review trigger is incomplete under `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md` §18, not merely under-specified.
- Run Module 10 in a fresh context, separate from whatever produced the original decision record, so the audit isn't anchored on the original reasoning's framing — the same reason TAS recommends running its own Final Accuracy Audit fresh. Run it once before execution (against the record itself) and again after an outcome exists, as two runs: the process verdict first, with no outcome record in context, then the outcome section from the saved verdict plus the outcome record (Module 10 rule 13).
- Where the decision depends on an underlying factual question rather than a comparative/precedent question, route that sub-question to TAS or RAS first, and feed their output into Module 02's evidence table rather than re-deriving it inside DAS.
- Where the decision depends on whether a specific argument for an option actually holds together (as opposed to whether its premises are true), route that sub-question to LAS and feed its validity finding into Module 04's bias audit or Module 06's scoring basis.

## Composition pattern

For a consequential decision, pass validated outputs between modules:

```text
Raw decision request
  -> Framing record (Module 01)
  -> Option list + evidence table (Module 02)
  -> Stakeholder register + consequence map (Module 03)
  -> Assumption table + bias findings (Module 04)
  -> Sensitivity-ranked uncertainty table (Module 05)
  -> Weighted comparison + recommendation (Module 06)
  -> Pre-mortem finding (Module 07)
  -> Decision record (Module 08)
  -> Reversibility re-check + smallest reversible step (Module 09)
  -> Review-trigger record (Module 11)
  -> Independent final audit, pre-execution and post-outcome (Module 10)
```

Do not paste every module into one prompt. Each module is a stage with an inspectable output.
