# Decision Evidence and Precedent Policy

*Part of Decision Authority System (DAS).*

## 1. Purpose

This policy governs how a decision task selects, weighs, and reconciles the evidence, precedent, and expert input a decision depends on. It exists to prevent two recurring failures: treating every precedent as equally applicable to the decision in front of you, and letting a confident recommendation become untraceable to any of the evidence that supposedly supports it.

This is DAS's structural counterpart to TAS's `SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md`, but the object being weighed is different. TAS asks "is this source authoritative for this factual claim." DAS asks "is this precedent, data point, or expert judgment authoritative for *this decision*, given how comparable it actually is." A precedent is not a fact to be verified; it is a past case whose relevance to the present case must itself be argued, not assumed.

## 2. Authority is comparability-specific

A precedent, data point, or expert opinion can be strongly authoritative for one decision and nearly worthless for another that superficially resembles it. A vendor-selection decision made under a hard regulatory deadline is not a good precedent for one made with no deadline pressure, even if both are "vendor selection" decisions. Evaluate authority for the exact decision using:

- how comparable the reference case's actual decision variables are (stakes, reversibility, deadline, resourcing, market or organizational context) — not merely its category label;
- how recent the reference case is, and whether the conditions that made it a good or bad decision still hold;
- how independent the reference case is from the current one (the same decision-maker citing their own prior choice as validation is not independent);
- the reference case's own documented outcome versus documented process — a precedent whose *process* is known is usable even if its outcome is not, and vice versa (§2.1 of `CORE/DAS_PROMPT_ENGINEERING_STANDARD.md`, resulting);
- whether the source of the precedent has an incentive to overstate its relevance (a vendor's own case studies, a consultant recommending the approach they specialize in);
- whether the underlying reference class is large enough to yield a real base rate, or is a single anecdote dressed as a pattern; and
- whether an expert's judgment is being offered inside their actual domain of repeated, feedback-rich experience, or outside it.

## 3. Default evidence and precedent tiers

| Tier | Evidence type | Normal use |
|---|---|---|
| A | Data from a genuine, large-enough reference class of comparable past decisions with known process and outcome | Establish a real base rate; the strongest available check on an inside-view estimate [DS-06, DS-07] |
| B | Direct, documented precedent from a small number of highly comparable past cases, with process and outcome both known | Establish a plausible range and named failure modes; corroborate or challenge the inside-view case |
| C | Recognition-primed expert judgment from someone with repeated, feedback-rich experience in materially the same kind of decision [DS-17] | Fill in fast, well-calibrated judgment where no reference class exists; state the expert's actual track record and domain match explicitly |
| D | Analogous precedent from a different but structurally similar domain, or a single well-documented case study | Generate hypotheses and candidate failure modes; not sufficient alone to set a base rate or override Tier A/B evidence |
| E | Internal narrative ("this is how we've always done it," "last time this worked") with no documented process or outcome record | Leads only; must be corroborated by a higher tier before it influences the recommendation |
| F | Vendor-supplied case studies, motivated-party testimonials, and unverified anecdotes | Context only; never load-bearing for a recommendation |

Lower-tier evidence may generate hypotheses and options; it may not silently override a higher-tier reference class or documented precedent.

## 4. The comparability test

Before treating any precedent as evidence for the decision in front of you, state:

1. what specifically is comparable between the reference case and this one (stakes, reversibility, domain classification, deadline, resourcing, stakeholders);
2. what specifically is different, and whether that difference plausibly changes the outcome;
3. whether the reference case's *process* was actually sound, independent of how it turned out (§2.1 of the standard) — a precedent with a good outcome but a bad process is weak evidence for repeating the process, and a precedent with a bad outcome but a good process is weak evidence for abandoning it; and
4. the tier (§3) the resulting comparison actually supports, stated explicitly rather than left implicit in how confidently the precedent is invoked.

A precedent that fails step 1 (nothing genuinely comparable stated) does not belong in the decision record at all, regardless of how often it gets mentioned in discussion.

## 5. Expert input

Expert judgment is not automatically Tier C. Apply the naturalistic-decision-making distinction [DS-17]: an expert's fast, intuitive judgment is well-calibrated only in domains with fast, clear feedback and repeated practice (an experienced ER physician's triage judgment; a seasoned negotiator's read of a counterpart). The same expert's judgment about a domain without that feedback structure (long-horizon strategic bets, novel-technology forecasts) does not carry the same authority and should be tiered down accordingly — state which situation applies rather than crediting expertise generically.

## 6. Retrieval and reasoning log

For a material search for precedent or comparative data, record:

| Field | Requirement |
|---|---|
| Search objective | The specific comparability question being investigated |
| Sources searched | Internal records, industry data, case studies, expert consultations |
| Reference cases found | Enough detail to assess comparability (§4) |
| Reference class size | How many genuinely comparable cases exist, if a base rate is being claimed |
| Negative result | State only that no comparable precedent was found within the recorded search — not that none exists |
| Access limits | Confidentiality, missing records, unavailable experts, or time constraints on the search |

## 7. Conflicts between evidence and precedent

When precedents or expert opinions conflict:

1. preserve both accounts rather than averaging or silently picking the more convenient one;
2. run the comparability test (§4) on each independently before comparing them to each other;
3. prefer the higher tier (§3) unless the comparability test shows the higher-tier case is actually less comparable to the decision in front of you;
4. state the conflict explicitly if it remains unresolved after tiering and comparability are both applied; and
5. do not let volume of restatement substitute for independence — five people repeating the same second-hand account of one prior case is one Tier D or E data point, not five.

## 8. Cross-reference to sibling systems

Where a decision depends on an underlying factual or research question rather than on comparative precedent — "is this vendor's uptime claim true," "what does the published literature say about this drug's efficacy" — that question belongs to TAS or RAS respectively, and their own source-tiering policies govern it (TAS's `SOURCE_AUTHORITY_AND_RETRIEVAL_POLICY.md`; RAS's `EVALUATION/OUTPUT_SCHEMAS.md` certainty-of-evidence scale, itself grounded in GRADE [RS-01, cited in RAS's `SOURCE_INDEX.md`]). This policy governs the layer above that: given established facts, how much should a specific precedent, data point, or expert judgment weigh in *this* decision. Do not re-derive TAS's or RAS's evidence-quality work inside a DAS decision record; cite the upstream finding and its own confidence label, and apply this policy's comparability test to it.

## 9. Model-specific prompt sources

For prompting behavior itself (not decision content), apply TAS's same priority order: current first-party guidance for the active model and product surface; current first-party general guidance from the model provider; tested internal evaluation results; cross-provider best practices; academic taxonomies; community prompt collections [PE-01 through PE-04].
