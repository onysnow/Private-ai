# Module 02 — Option Generation & Evidence Gathering

*Part of Decision Authority System (DAS).*

## Use when

After framing (Module 01), before any option is evaluated in depth.

## Prompt

```text
OBJECTIVE
Enumerate the real set of options — not just the ones already on the table — and gather evidence for and against each option without cherry-picking toward a preferred outcome.

INPUTS
Decision statement and classification: [FROM MODULE 01]
Options already on the table: [LIST, INCLUDING ANY IMPLICIT DEFAULT]
Evidence or precedent already gathered, if any: [LIST]
Stated constraints, each with its source: [LIST]

RULES
1. List every option already under consideration, including the option that would happen by default if no explicit choice were made.
2. Generate at least one additional genuinely distinct option beyond what's listed — a materially different approach, not a cosmetic variant (a different vendor with the same terms is not a distinct option; a different approach to the underlying problem is).
3. Include an explicit "do nothing / maintain the status quo" option unless it is genuinely unavailable. If omitted, state why it's unavailable rather than silently dropping it.
4. Include a "do both, sequenced" option wherever the leading options are not actually mutually exclusive.
5. A set built around one real option and a strawman alternative is a justification exercise, not option generation. Flag it explicitly if that's what is in front of you, and generate the missing genuine alternative before proceeding.
6. For each option, state its resourcing, rough timeline, and reversibility profile in one line each. Do not evaluate which option is better yet — that is Module 06's job.
7. For each option, gather evidence and precedent bearing on how it is likely to perform, per the tier system in `CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md`. State the tier for each piece of evidence gathered.
8. Deliberately search for evidence against the currently-favored option and for evidence in favor of options other than the one already gaining consensus in the room. A search that only turns up confirming evidence for the leading option has not met this rule, regardless of how much evidence it found.
9. State what evidence was sought and not found, distinctly from evidence that was sought and found to be unfavorable — a negative search result is not the same as disconfirming evidence, and neither should be silently omitted.
10. Attain distance: state, in a few sentences, how an outside advisor with no attachment to any option already in motion would describe this option set. Name anything such a person would ask about first that is currently missing.
11. Check every stated constraint before letting it remove an option, including the status quo. Record its source — the regulation, contract clause, budget decision or authority that imposes it — and its tier (`CORE/DECISION_EVIDENCE_AND_PRECEDENT_POLICY.md` §3). A constraint with no stated source is an assumption: record it in Module 04 with a falsifier, and keep the option it would remove on the list, marked blocked pending that check, rather than deleting it.

OUTPUT
A. Option list
| Option ID | Option | Status (existing / newly generated) | Type (default / status-quo / sequenced / alternative / probe — a candidate probe Module 06 rule 10 returned) | Resourcing & timeline (one line) | Reversibility profile (one line) |

B. Evidence table
| Evidence ID | Option ID | Evidence/precedent | Tier (DAS:A–DAS:F) | Upstream tier (a cited TAS or RAS finding's own tier, e.g. TAS:A or RAS:3; blank if none) | Direction (favors / disfavors / mixed) | Independence (independent / same decision-maker / motivated party — caps the tier, `EVALUATION/OUTPUT_SCHEMAS.md`) | Basis |

C. Search discipline note
State what was deliberately sought against the leading option, what was found, and what was sought but not found (with the search scope stated, not converted into "does not exist").

D. Distance check
2–4 sentences: the outside-advisor read — what's missing or overweighted in the option set as it stands, if anything.

E. Constraint check
| Constraint ID | Constraint | Source (or "none stated") | Tier (DAS:A–DAS:F) | Options it would remove | Verified, or held as an assumption (Module 04) |
```
