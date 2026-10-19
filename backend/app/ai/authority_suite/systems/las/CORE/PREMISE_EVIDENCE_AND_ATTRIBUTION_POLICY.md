# Premise Evidence and Attribution Policy

*Part of Logic Authority System (LAS) — v0.1.*

## 1. Purpose

This policy governs two failures around a premise, neither about its actual truth: attributing it to the wrong source (or to none), and building on it before it carries the evidentiary weight that requires. TAS's `SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` asks how authoritative a *source* is for a *claim*; this policy asks how a *premise inside an argument* is attributed and how much weight it needs before LAS can assess the argument's soundness.

## 2. Attribution is premise-specific

One argument can mix premises the arguer stated, premises borrowed from a cited source, premises the evaluator supplied, and unexamined background assumptions. Blurring them into one list is itself a misattribution: it makes the arguer's own claim indistinguishable from something LAS supplied.

## 3. Attribution categories

Classify every premise into exactly one of the following when reconstructing an argument (Module 01):

| Category | Meaning | Handling |
|---|---|---|
| STATED BY ARGUER | The arguer asserted this premise in their own words | Quote or closely paraphrase; do not soften or strengthen it during reconstruction |
| ATTRIBUTED SOURCE | The arguer cites an external source for this premise | Record the cited source; its own tier/verification status (TAS/RAS) governs the premise's weight, not the arguer's confidence in citing it |
| RECONSTRUCTED BY EVALUATOR (enthymeme) | LAS supplied this premise because the argument depends on it but the arguer never stated it | Mark explicitly as a reconstruction, in the most charitable plausible form the arguer would accept — never present it as something the arguer said |
| BACKGROUND ASSUMPTION | A widely shared premise doing little independent work (e.g., "objects fall when dropped") | Note but do not treat as requiring the same verification effort as a load-bearing, contestable premise |
| USER-STIPULATED | The requester asked the audit to take this premise as given | Record the requester's words; the premise stays UNVERIFIED — never VERIFIED — and the deliverable states that soundness was assessed on the stipulation (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §15) |

## 4. Evidentiary weight required before soundness can be assessed

Soundness cannot be assessed at all until every premise has a verification status (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §4.6, §7). The weight a premise needs before that status can be anything other than UNVERIFIED depends on how much work it does and what kind of claim it is:

| Premise role | Minimum bar before treating as VERIFIED |
|---|---|
| Load-bearing empirical premise (the argument fails without it) | TAS-tier corroborated fact, or RAS-tier evidence meeting at least a moderate certainty rating — a single low-tier source is not enough |
| Peripheral empirical premise (argument survives even if false) | A single credible source is sufficient to move it out of UNVERIFIED, but its lower materiality should still be noted |
| Normative or value premise | Never VERIFIED or CONTESTED in the empirical sense — classify UNVERIFIABLE and say so; the defect to flag is treating it as though it needed empirical proof, or treating an empirical premise as though it were just a matter of opinion |
| Definitional premise (stipulates what a term means) | VERIFIED only insofar as the definition is used consistently for the rest of the argument (see equivocation, `CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` §9) — internal consistency, not external truth, is the bar |

A premise that has not cleared its required bar stays UNVERIFIED or CONTESTED regardless of how central it is to the argument's rhetorical force. LAS does not lower the bar for a premise merely because the rest of the argument is otherwise well constructed. Module 03 records whether an UNVERIFIED premise was never checked or was checked and fell short of the bar, and a premise TAS or RAS shows false is REFUTED, not CONTESTED.

## 5. Misattribution failure modes

- **Attributing a strawmanned premise to the arguer.** Reconstruction (Module 01) requires the steelmanned form; a premise weaker than what the arguer would actually accept must not be recorded as STATED BY ARGUER.
- **Treating a reconstructed (enthymematic) premise as though the arguer said it.** This inflates the argument's apparent transparency and can mask that the arguer never actually defended the premise doing the real work.
- **Treating an ATTRIBUTED SOURCE premise as already corroborated merely because it is cited.** A citation establishes what the source says, not that the claim is true — the cited source's own verification tier must still be checked (TAS's `SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md` tiers, or RAS's evidence-quality grading) before the premise can move past UNVERIFIED.
- **Silently upgrading a normative premise's status because it "sounds reasonable."** Reasonableness is not evidence; a normative premise stays UNVERIFIABLE regardless of how widely shared it seems.

## 6. Conflicting attributions

When two sources are cited for the same premise and disagree, or when the arguer's own restatement of a cited source diverges from what that source actually says:

1. preserve both the arguer's version and the cited source's actual statement, without silently reconciling them;
2. flag the divergence as its own finding, distinct from the premise's truth status;
3. do not average the two or default to whichever version makes the argument work.

## 7. Handoff to TAS or RAS

When a premise needs actual verification and TAS or RAS is available for the task, hand off exactly the premise (not the whole argument) with:

- the premise's exact text as reconstructed;
- its attribution category (§3);
- why it is load-bearing or peripheral (§4); and
- any source the arguer already cited for it, so TAS/RAS can evaluate that source's own tier rather than re-deriving one independently.

Where no verification tool or source is available for a task, do not guess at a status — mark UNVERIFIED and say so plainly (`CORE/LAS_PROMPT_ENGINEERING_STANDARD.md` Rule 3), rather than letting the premise pass silently as though it had been checked.
