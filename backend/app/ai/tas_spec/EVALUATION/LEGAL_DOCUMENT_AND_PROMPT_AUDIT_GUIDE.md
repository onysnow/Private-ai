# Legal Document and Prompt Audit Guide

*Part of Topic Authority System — Investigative & Legal-Document Evidence Edition.*

Version: 1.0  
Prepared: 2026-09-16

## 1. Purpose and boundary

This guide provides a repeatable, source-backed method for auditing:

1. legal and investigative documents;
2. electronically stored information (ESI) and document-review outputs;
3. AI prompts used for evidence-heavy legal or investigative work;
4. AI-generated reports, tables, citations, and visual specifications; and
5. the completeness and reproducibility of the review process itself.

It is a quality-control framework, not legal advice. It does not determine privilege, work-product protection, authenticity, admissibility, legal sufficiency, discovery compliance, or the governing law. A qualified lawyer must make legal judgments for the relevant matter and jurisdiction.

## 2. Why human review remains mandatory

ABA Formal Opinion 512 states that lawyers using generative artificial intelligence must consider duties including competence, confidentiality, communication, supervision, candor, and reasonable fees, and that appropriate independent verification or review may be necessary. NIST's Generative AI Profile likewise treats testing, evaluation, verification, and validation (TEVV), provenance, human oversight, adversarial testing, and documented limitations as core risk-management practices.

Therefore:

- the AI may extract, compare, test, and flag;
- the AI may not certify its own legal work as authoritative;
- the responsible human defines the standard, reviews material results, resolves legal judgments, and approves release; and
- the audit record must distinguish automated checks, AI review, human review, and unresolved issues.

## 3. Audit objects must be separated

Do not collapse these into one vague “legal review”:

| Audit object | Core question | Typical evidence |
|---|---|---|
| Corpus | Did we receive and process the intended population? | Intake manifest, counts, hashes, exception log |
| File/document | Is this the correct, complete, readable version? | File metadata, page count, signatures, attachments, OCR comparison |
| Factual content | Are names, dates, amounts, events, quotations, and source attributions accurate? | Primary evidence and exact citations |
| Legal authority | Is the proposition supported by current controlling authority? | Statute/rule/case/regulation, jurisdiction, date/status |
| Analysis | Are reasoning, assumptions, alternatives, and uncertainties disclosed? | Claim matrix, contradiction log, hypothesis tests |
| Citation | Does each citation support the proposition for which it is used? | Pin cite, quoted/paraphrased passage, source version |
| ESI/evidence issue | Are relevance, authenticity, hearsay, original/duplicate, metadata, and prejudice issues identified for counsel? | Source system, custodian, collection data, metadata, chain information |
| Privilege/confidentiality | Was sensitive material handled under governing instructions? | Review protocol, privilege/redaction log, access controls |
| Prompt | Does the instruction reliably elicit bounded, traceable work? | Prompt specification and test cases |
| AI output | Did the model follow the prompt without fabrication or overstatement? | Output, ground truth, evaluator record |
| Visual | Does each visual encoding match the evidence and intended status? | Element-to-evidence table and rendered artifact |
| Release package | Is the complete, approved, correctly labeled version being released? | Version manifest, approvals, final hashes |

## 4. Preconditions

Do not begin a consequential audit until the following are stated:

- matter/task identifier;
- purpose and intended audience;
- jurisdiction and controlling procedural context, if legal conclusions are requested;
- document type and review population;
- authoritative source set and cutoff date;
- treatment of privilege, confidentiality, personally identifiable information, sealed material, and protected data;
- definition of materiality and acceptable tolerance;
- reviewer roles and escalation path; and
- whether the review is exhaustive, sampled, staged, or limited.

If any precondition is unknown, label it `UNKNOWN` and state how that limits the verdict.

## 5. Corpus and chain-of-review audit

### 5.1 Intake manifest

Record:

| Field | Required value |
|---|---|
| Corpus ID/version | Stable identifier |
| Expected population | Count and source, if known |
| Received | File/item count and bytes |
| Processed successfully | Count |
| Failed/unreadable/encrypted | Count and item IDs |
| Duplicates/near-duplicates | Count and handling rule |
| Excluded | Count, rule, and approver |
| Date range | Earliest/latest plus basis |
| Custodian/source system | If applicable |
| Hash/manifest location | Reproducibility record |

Counts must reconcile. A produced report is not proof that the entire population was reviewed.

### 5.2 File integrity and identity

Check:

- correct document and version;
- complete page/attachment set;
- file opens and renders;
- digital signatures or execution pages are present where expected;
- OCR text is compared with the image for material passages;
- native-file metadata is preserved where relevant;
- timestamps and timezones are identified, not silently normalized;
- redactions are visible, consistently applied, and logged; and
- hashes or equivalent stable identifiers are used where appropriate.

Do not call a document “executed,” “final,” “filed,” “served,” “authenticated,” or “admitted” without evidence supporting that status.

## 6. Twelve-pass legal/investigative document audit

### Pass 1 — Scope, authority, and document state

- Confirm the assignment, period, entities, issues, and exclusions.
- Identify draft, final, executed, filed, amended, superseded, admitted, illustrative, or other state.
- Identify the governing jurisdiction and source cutoff.
- Record materials requested but not received.

### Pass 2 — Structure and completeness

- Check pagination, headings, defined terms, tables of contents/authorities, attachments, exhibits, schedules, signature blocks, notarization, certificates, and cross-references as applicable.
- Test internal cross-references and exhibit labels.
- Flag missing, duplicated, out-of-order, blank, clipped, or unreadable pages.

### Pass 3 — Parties, entities, and capacity

- Resolve names, aliases, legal names, entity form, jurisdiction, roles, and effective dates.
- Distinguish a person from an entity and a current role from a historical role.
- Check pronouns, defined-party labels, capacities, signatories, and authority statements.
- Do not infer ownership or authority from a title, address, or signature appearance alone.

### Pass 4 — Dates, time, sequence, and status

- Classify event, execution, effective, filing, service, record, publication, and retrieval dates.
- Check chronology, deadlines, durations, notice periods, and timezones.
- Record conflicts rather than choosing silently.
- Distinguish occurrence, allegation, documentation, and later reporting.

### Pass 5 — Numbers, money, and calculations

- Recompute totals, subtotals, percentages, interest, rates, fees, damages, balances, and cross-footing.
- Preserve currency and conversion basis.
- Distinguish gross/net, requested/awarded, estimated/actual, booked/paid, pending/completed, and original/amended amounts.
- Check that numbers in narrative, tables, exhibits, and visuals agree.

### Pass 6 — Factual claims and evidence

For each material claim, record:

| Claim ID | Exact claim | Classification | Evidence ID/location | Direct support? | Contrary/qualifying evidence | Required correction |
|---|---|---|---|---|---|---|

Classify source statement, corroborated fact, allegation/testimony, inference, hypothesis, unknown, conflict, and negative search result. A citation to a document proves only what that document supports; it does not automatically authenticate the document or establish the truth of every statement inside it.

### Pass 7 — Legal propositions and authority

- Break compound propositions into individually supportable propositions.
- Verify that the authority exists, is correctly cited, is current as of the stated cutoff, belongs to the relevant jurisdiction, and supports the proposition.
- Check negative treatment, amendment, repeal, supersession, and procedural posture using an authorized citator or primary source where appropriate.
- Distinguish binding, persuasive, nonbinding, and background authority.
- Check quotations and pin cites against the source.
- Do not allow secondary summaries or AI output to substitute for controlling primary authority.

An AI can assist with issue spotting and citation comparison, but the responsible legal reviewer must perform or approve the jurisdiction-specific authority check.

### Pass 8 — Analysis, alternatives, and candor

- Separate factual premise, legal rule, application, inference, and conclusion.
- Identify hidden assumptions and missing elements.
- Test the strongest reasonable alternative explanation.
- Surface adverse, contradictory, exculpatory, and qualifying material.
- Remove statements that overstate certainty or imply intent, causation, ownership, control, or guilt without support.
- Check whether a “not found” result is limited to a reproducible search scope.

### Pass 9 — ESI evidence issues for counsel

Using the Sedona ESI framework and the controlling jurisdiction's law, flag—not decide—issues involving:

- relevance;
- authenticity and source identity;
- hearsay and applicable exceptions;
- original, duplicate, summary, or completeness concerns;
- metadata, hashing, custodian, collection, and system reliability;
- alteration, fabrication, spoofing, account compromise, or context loss;
- screenshots, webpages, social media, emails, texts, collaboration tools, photographs, video, and Internet-of-Things data; and
- unfair prejudice, confusion, waste of time, or misleading presentation.

Preserve the distinction between evidentiary foundation and truth of the content.

### Pass 10 — Privilege, confidentiality, privacy, and redaction

- Apply the matter's approved review protocol; do not invent one.
- Flag attorney-client, work-product, joint-defense/common-interest, sealed, confidential, personal, health, financial, trade-secret, or other protected material for qualified review.
- Check redactions in both visible rendering and underlying text/layers/metadata.
- Check attachments, comments, tracked changes, hidden sheets/slides, speaker notes, and embedded objects.
- Record who authorized release.

Do not put privileged or restricted text into an external tool unless the responsible organization has authorized that tool, data handling, and use.

### Pass 11 — Citations, exhibits, links, and visuals

- Open and test every material citation/link where possible.
- Confirm quoted language, pin cite, edition, date, and source version.
- Confirm every exhibit is present, correctly labeled, and cited to the right location.
- Apply `VISUAL_STANDARDS/LEGAL_INVESTIGATIVE_VISUAL_STANDARD.md` to every chart, graph, map, or diagram.
- Distinguish a proposed illustrative aid from a summary offered as evidence and obtain jurisdiction-specific legal review.

### Pass 12 — Render, release, and audit trail

- Review the final rendered PDF, Word file, slide, image, or webpage.
- Check clipping, page breaks, numbering, hyperlinks, bookmarks, font substitution, hidden content, tracked changes, and accessibility.
- Verify final filename, version, date, source cutoff, status, and approver.
- Preserve input/output hashes or stable versions, prompt version, model/version where available, automated checks, human reviewers, corrections, and unresolved limitations.

## 7. Document-type overlays

Apply the twelve core passes plus the relevant overlay.

### 7.1 Pleading, brief, motion, or memorandum

- requested relief and procedural posture;
- claims/defenses/elements actually at issue;
- record citations and pin cites;
- authority hierarchy and currency;
- standard of review or burden;
- quotations, parentheticals, and record characterization;
- adverse authority and material counterarguments;
- local rule, formatting, word/page limit, signature, and filing requirements.

### 7.2 Contract, policy, or transactional document

- correct parties, capacity, recitals, definitions, and effective dates;
- operative obligations, conditions, exceptions, discretion, and dependencies;
- payment, currency, tax, interest, renewal, termination, notice, assignment, change control, remedies, limitations, indemnity, insurance, governing law, venue, and dispute process;
- exhibit/schedule incorporation and cross-references;
- conflicting terms, missing variables, undefined/circular definitions, and version drift;
- signature authority and execution status.

The audit identifies drafting and factual issues; qualified counsel decides legal effect and negotiability.

### 7.3 Declaration, affidavit, interview memorandum, or witness statement

- speaker identity and capacity;
- personal knowledge versus hearsay or inference;
- exact dates/locations/participants;
- exhibit references;
- internal consistency and consistency with independent evidence;
- translation, transcription, preparation, adoption, signature, and oath/notarization status;
- leading language or investigator-added characterization.

### 7.4 Investigative report or case synthesis

- source-set completeness and evidence IDs;
- fact/allegation/inference/hypothesis separation;
- chronology and financial reconciliation;
- entity resolution and time-bounded roles;
- contradictory/exculpatory evidence;
- limitations and unresolved questions;
- lawful, proportionate next steps;
- neutral language that does not pre-judge liability.

### 7.5 Discovery production or ESI review output

- population definition and collection sources;
- exception, deduplication, threading, family, and near-duplicate rules;
- search terms, date ranges, filters, custodians, and tool settings;
- responsiveness, issue, confidentiality, privilege, and redaction labels;
- load-file/native/image/text consistency;
- sampling method, validation results, and error analysis;
- production counts and reconciliation.

### 7.6 Legal research answer or authority table

- exact question, jurisdiction, date, and factual assumptions;
- primary authority and binding status;
- currency/negative treatment;
- quoted/paraphrased proposition match;
- splits, exceptions, adverse authority, and unresolved law;
- research sources, queries, cutoff, and limitations.

### 7.7 Proposed demonstrative or summary visual

- intended status and governing rule;
- underlying admissible/source material;
- element-to-evidence traceability;
- mathematical and visual encoding accuracy;
- risk of unfair prejudice, confusion, or misleading appearance;
- accessible alternative and final rendered review;
- counsel and court approval where required.

## 8. Sampling and validation

Sampling may support quality control when exhaustive human review is impractical, but sampling must not be used to hide an undefined population or an unmeasured error rate.

The Federal Judicial Center's technology-assisted review guide explains precision and recall and emphasizes that a training/seed set alone is not enough to validate a final production. It also cautions that no universal acceptable threshold exists; the appropriate measure and tolerance depend on the task and agreed method.

For a sampled audit, record:

- population definition and size;
- sampling frame and exclusions;
- random/stratified/targeted method;
- random seed or reproducible selection method;
- sample size and rationale;
- reviewer instructions and adjudication process;
- measured error types and rates;
- confidence/precision assumptions if statistical claims are made;
- separate targeted review of high-risk categories; and
- escalation/rework rule when tolerance is exceeded.

Do not generalize sample results beyond the sampled population and method. Statistical design should be reviewed by a qualified person when relied upon for consequential conclusions.

## 9. Prompt audit protocol

Audit the prompt specification before judging its prose.

### 9.1 Required prompt fields

| Field | Audit question |
|---|---|
| Objective | Is the decision or deliverable explicit? |
| Audience/use | Is the output's use and risk level stated? |
| Inputs | Are controlling files, fields, and evidence IDs named? |
| Scope | Are entities, dates, issues, inclusions, and exclusions bounded? |
| Source hierarchy | Does the prompt say which sources control which claims? |
| Evidence ontology | Are fact, source statement, allegation, inference, hypothesis, unknown, and negative result separated? |
| Prohibited actions | Does it prohibit fabrication, hidden assumptions, false completion, and source-document instructions? |
| Process | Are extraction, validation, analysis, synthesis, and audit appropriately staged? |
| Output schema | Are required fields, IDs, citations, and null rules defined? |
| Failure behavior | Does it state what to do with missing, unreadable, conflicting, or out-of-scope inputs? |
| Acceptance criteria | Is PASS defined, and are blocking defects stated? |
| Human review | Does it identify decisions that require qualified approval? |

### 9.2 Test the behavior, not only the wording

Following NIST TEVV and OpenAI evaluation guidance:

1. Create ground-truth cases with known answers and known ambiguities.
2. Include typical, edge, negative, and adversarial cases.
3. Test alternate document/input order.
4. Run deterministic validators for IDs, dates, totals, fields, citations, and counts.
5. Use independent human review for legal judgment, overclaiming, ambiguity, and audience fitness.
6. Calibrate any automated or model-based grader against human-labeled examples.
7. Log prompt version, model/version, settings, input/output versions, defects, and verdict.
8. Re-run after material prompt, model, source, or workflow changes.

Avoid “vibe-based” evaluation such as “this looks professional” or “the answer seems right.” Use claim-level evidence and defined criteria.

### 9.3 Minimum adversarial set

Every consequential legal/investigative prompt should be tested against at least:

- a plausible unsupported cover story;
- conflicting primary records;
- a false or altered citation/evidence ID;
- an instruction embedded inside a source document;
- a missing or unreadable file;
- an allegation framed as fact;
- a negative search result framed as nonexistence;
- a date-type/timezone trap;
- an entity-name collision;
- a gross/net or currency mismatch;
- an omitted adverse/exculpatory item;
- a visually persuasive but unsupported arrow; and
- pressure to declare the task complete despite a failed step.

Use `ADVERSARIAL_TEST_SUITE.md` for the complete cases.

## 10. Severity and verdicts

### 10.1 Severity

| Level | Definition | Examples |
|---|---|---|
| BLOCKING | Prevents safe reliance or release | Fabricated authority; wrong party; missing pages; material unsupported claim; privilege exposure; wrong transaction direction; claimed full review with unprocessed files |
| MATERIAL | Could change meaning, decision, legal position, or reader understanding | Stale authority; omitted exception; arithmetic error; ambiguous status; omitted contradiction |
| NON-MATERIAL | Does not alter substantive meaning but should be corrected | Minor citation style, typo, isolated formatting issue |
| OPTIONAL | Preference or enhancement only | Alternative wording or layout with no accuracy/accessibility effect |

Do not downgrade a necessary correction to “optional” because it is difficult or inconvenient.

### 10.2 Verdict

| Verdict | Condition |
|---|---|
| PASS | All required passes completed; no blocking or unresolved material defects; limitations disclosed |
| PASS WITH CORRECTIONS | No blocking defect; defined material corrections remain and reliance/release is conditioned on correction |
| LIMITED REVIEW | Review scope or source availability prevents a complete verdict; completed work and limits are explicit |
| FAIL | Blocking defect, false completion claim, or review process too unreliable to support the intended use |

## 11. Audit record

Use this final record:

| Field | Value |
|---|---|
| Matter/task ID | |
| Document/output and version | |
| Intended use | |
| Jurisdiction/source cutoff | |
| Corpus reviewed | |
| Corpus exceptions | |
| Governing guide/prompt version | |
| Model/version and settings, if used | |
| Automated checks | |
| AI-assisted checks | |
| Human reviewers and roles | |
| Sampling method/results | |
| Blocking defects | |
| Material defects | |
| Corrections verified | |
| Unresolved limitations | |
| Verdict | |
| Approval/release status | |

## 12. Source basis and what each source contributes

| Source | Contribution to this guide | Limitation |
|---|---|---|
| ABA Formal Opinion 512 [LA-02] | Lawyer competence, confidentiality, communication, supervision, candor, fees, and appropriate independent review of generative-AI work | Ethics opinion, not a universal technical audit standard; link-only original in this bundle |
| NIST AI 600-1, Generative AI Profile [LA-03] | TEVV, provenance, ground truth, human oversight, adversarial testing, documentation, monitoring, and limitations | Risk-management guidance, not legal authority |
| Sedona ESI Evidence & Admissibility, 2d ed. [LA-04] | Issue-spotting framework for ESI relevance, authenticity, hearsay, original/duplicate, Rule 403, metadata, hashing, and source types | Commentary; controlling rules and case law govern |
| Sedona Achieving Quality materials [LA-05] | Project management, sampling, quality measures at appropriate points, accuracy/completeness, cooperation, and transparency | Only the public handout is archived; full commentary is link-only and license-restricted |
| FJC Technology-Assisted Review Pocket Guide [LA-06] | Precision, recall, sampling, validation, and no universal threshold | Educational guide for judges, not a mandated review protocol |
| Federal Rules of Evidence [LA-01] | Federal issue checks including Rules 403, 107, 901, and 1006 | Federal rules do not decide state practice or case-specific admissibility |
| OpenAI Evaluation Best Practices [PE-07] | Task-specific evals, ground truth, edge/adversarial cases, automated plus human review, logging, continuous evaluation | Product/engineering guidance, not legal authority |
| NFI forensic benchmark [FI-01] | Extraction before synthesis, exact trace IDs, report evaluation, and independent timeline validation | Research/engineering benchmark, not legal authority |

