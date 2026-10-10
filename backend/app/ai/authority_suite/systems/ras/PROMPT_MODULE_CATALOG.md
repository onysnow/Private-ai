# Prompt Module Catalog

*Part of Research Authority System (RAS).*

Ten single-purpose, composed modules, in the same spirit as TAS's, DAS's,
and LAS's catalogs: each stage has an inspectable output rather than being
folded into one giant "research this for me" prompt.

| # | Module | Primary job | Main output |
|---|---|---|---|
| 01 | Research Question Framing | Turn a raw question into an answerable one; classify each sub-question as empirical, normative, definitional, or predictive; set scope | Framed question + scope record |
| 02 | Source Discovery & Diversity Check | Run and document a fair, diverse search; explicitly check for single-source or single-viewpoint capture | Search log + diversity check |
| 03 | Source Vetting & Authority Ranking | Rank sources by evidentiary tier, primary/secondary/tertiary status, expertise, and publication rigor | Tiered, vetted source table |
| 04 | Claim Extraction & Corroboration Mapping | Extract specific checkable claims per source; map corroboration vs. single-source reliance | Claim-level corroboration table |
| 05 | Bias & Interest Disclosure | Surface funding, agendas, and selection effects in what got published or reported | Per-source disclosure + representativeness verdict |
| 06 | Contradiction & Consensus Mapping | Characterize real consensus/disagreement; catch manufactured controversy and false consensus | Consensus map |
| 07 | Currency & Retraction Check | Verify no relied-upon source has since been corrected, retracted, or superseded | Currency record |
| 08 | Research Gap Analysis | Identify what wasn't found and would need further searching, without collapsing "not found" into "does not exist" | Gap register + disclosure statement |
| 09 | Synthesis & Confidence Calibration | Assign certainty/consensus language, then draft the synthesis carrying that calibration into the prose | Calibrated claim table + draft synthesis |
| 10 | Final Research Audit | Fresh-context audit (independent only when a different model or a person runs it) for overclaiming, dropped contradictions, dropped gaps, and citation accuracy | Audit verdict |

## Routing rules

- Do not skip Module 01. A poorly framed question (unfalsifiable,
  conflating an empirical question with a normative one, or scoped so
  broadly no search could be complete) makes every downstream module's
  output unreliable regardless of how carefully it's executed.
- Modules 02-03 (search, vetting) must run before Module 04 (claim
  extraction). Extracting or synthesizing claims before vetting sources is
  exactly the "count sources, don't weigh them" failure Rule 2 of the
  standard exists to prevent.
- Module 04 (corroboration mapping) must run before Module 06
  (consensus mapping) — consensus is mapped over claims with known
  corroboration status, not over raw sources.
- Module 05 (bias/representativeness) runs after Module 04 and before
  Module 06, whose input it is, and so before Module 09 (calibration) — calibrating confidence before checking whether the
  search itself was lopsided bakes the bias into the confidence language
  instead of correcting for it.
- Module 08 (gap analysis) runs after the consensus and currency checks
  (Modules 06-07) and before synthesis (Module 09) — a gap is only
  meaningful once it's clear what the actual, current, weighed evidence
  does and does not establish.
- Module 10 should run in a fresh context from whatever produced the draft
  synthesis, for the same reason TAS's Final Accuracy Audit and DAS's
  Final Decision Audit (its Module 10) both require independence from the work being
  reviewed — an author auditing their own framing rarely catches their own
  framing's blind spot.
- A narrow, low-stakes factual lookup ("what year was X published") does
  not need the full ten-module pipeline; a synthesis intended to inform a
  real decision, publication, or claim of "the research shows" does.

## Open questions

- Whether RAS needs a distinct lightweight path for single-source
  fact-lookups versus the full synthesis pipeline, the same way DAS
  compresses several modules for reversible, low-stakes decisions. See
  `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md`'s T02 for the
  current lightweight path — proposed but not exhaustively specified
  beyond what T02 already states, worth revisiting once the modules have
  been used.
- Whether a domain-specific overlay (e.g., a medical-evidence overlay
  citing Cochrane risk-of-bias tools by name, or a policy-research overlay
  citing program-evaluation standards) belongs inside RAS's CORE or as a
  separate domain overlay that leaves the base modules unchanged. Deferred — RAS's base
  modules are written domain-agnostically first.
