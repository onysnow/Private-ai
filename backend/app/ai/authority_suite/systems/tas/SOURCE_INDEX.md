# Source Index

*Part of Topic Authority System (TAS).*

Retrieval date for archived web sources: 2026-09-16.

This index cites the authoritative sources TAS's standard, modules, and evaluation rules draw on. It is a bibliography, not a copy: it does not reproduce any source's text, only cites it. The archived originals and repository snapshots referenced during this doctrine's development are part of the fuller source package TAS was drawn from; they are not included in this repo (see `ORIGINAL_SOURCES/` in `PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md` for the note on why). Each entry's Canonical URL is the citation of record.

## Prompt-engineering sources

| ID | Source | Publisher / authors | Authority and use | Canonical URL |
|---|---|---|---|---|
| PE-01 | Prompt engineering | OpenAI | Primary model-provider guidance for API prompting, instruction authority, model differences, version pinning, and evaluations | https://developers.openai.com/api/docs/guides/prompt-engineering |
| PE-02 | Prompting | OpenAI, ChatGPT Learn | Primary guidance for ChatGPT, ChatGPT Work, and Codex: goal, context, output, boundaries, sources, and final checks | https://learn.chatgpt.com/docs/prompting |
| PE-03 | Prompting best practices | Anthropic | Cross-provider reference for clarity, examples, structured sections, long-context work, tool use, and agent behavior; not controlling for OpenAI models | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices |
| PE-04 | Prompt design strategies | Google | Cross-provider reference for decomposition, grounding, examples, structured prompting, tools, and agent workflows; not controlling for OpenAI models | https://ai.google.dev/gemini-api/docs/prompting-strategies |
| PE-05 | The Prompt Report: A Systematic Survey of Prompt Engineering Techniques | Schulhoff et al.; arXiv:2406.06608v6 | Academic taxonomy and terminology reference; not a universal instruction set | https://arxiv.org/abs/2406.06608 |
| PE-06 | Prompt Design and Engineering: Introduction and Advanced Methods | Xavier Amatriain; arXiv:2401.14423 | Compact academic treatment of prompt design, reasoning, reflection, and agents | https://arxiv.org/abs/2401.14423 |
| PE-07 | Evaluation best practices | OpenAI | Primary engineering guidance for task-specific evaluations, ground truth, edge/adversarial cases, combined automated and human review, logging, and continuous evaluation | https://developers.openai.com/api/docs/guides/evaluation-best-practices |

## Forensic and investigative-AI sources

| ID | Source | Publisher / authors | Authority and use | Canonical URL |
|---|---|---|---|---|
| FI-01 | Local LLM Chat Report Benchmark | Netherlands Forensic Institute | Institutional engineering reference for two-stage evidence extraction and synthesis, exact Trace ID preservation, timeline evaluation, and reproducible validation. Repository prompts are examples, not evidentiary law. Snapshot commit: `5554ef79a0bce3342fb827da2511366ea71b7390`. | https://github.com/NetherlandsForensicInstitute/local-llm-chat-report-benchmark |

## Investigative-methodology sources

| ID | Source | Publisher | Authority and use | Canonical URL |
|---|---|---|---|---|
| IM-01 | Asset Recovery Handbook: A Guide for Practitioners, Second Edition | Stolen Asset Recovery Initiative, World Bank and United Nations Office on Drugs and Crime | Practitioner methodology for case strategy, evidence gathering, asset tracing, ownership, international cooperation, and case management. Licensed CC BY 3.0 IGO as stated in the source. | https://openknowledge.worldbank.org/entities/publication/7bec70d0-0b95-578d-810d-92fd371fba28 |
| IM-02 | Asset Recovery Guidance and Best Practices | Financial Action Task Force, November 2025 | Current institutional guidance on the asset-recovery lifecycle: identifying, tracing, evaluating, freezing, seizing, confiscating, enforcing, managing, and disposing of criminal property. Copyright retained by FATF/OECD; archived unchanged for private reference. | https://www.fatf-gafi.org/content/fatf-gafi/en/publications/Methodsandtrends/asset-recovery-guidance-best-practices-2025.html |
| IM-03 | Operational Issues - Financial Investigations Guidance | Financial Action Task Force, 2012 | Defines and describes financial-investigation objectives and operational concepts. Direct download was blocked by the publisher's browser-verification system during collection; link-only authority. | https://www.fatf-gafi.org/en/publications/Methodsandtrends/Operationalissues-financialinvestigationsguidance.html |
| IM-04 | Bank Secrecy Act / Anti-Money Laundering Examination Manual | Federal Financial Institutions Examination Council | U.S. examiner guidance for suspicious-activity monitoring, customer due diligence, beneficial ownership, structuring, and related risks. Use as regulatory methodology and red-flag context, not as proof of criminal conduct. Link-only authority. | https://bsaaml.ffiec.gov/manual |

## Visual-analysis, design, and accessibility sources

| ID | Source | Publisher | Authority and use | Canonical URL |
|---|---|---|---|---|
| VZ-01 | Criminal Intelligence: Manual for Analysts | United Nations Office on Drugs and Crime, 2011 | Institutional analyst manual covering link analysis, association matrices, event charting, commodity/activity/event flow, inference, and presentation. Archived from a verified institutional/research mirror because the original UNODC PDF path returned 404 (the verification notes belonged to the excluded original package and are not in this system). | https://www.unodc.org/documents/organized-crime/Law-Enforcement/Criminal_Intelligence_for_Analysts.pdf |
| VZ-02 | Data visualisation: charts | UK Government Analysis Function | Official guidance for chart choice, scales, formatting, testing, accessibility, and text alternatives | https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts/ |
| VZ-03 | Data visualisation: colours | UK Government Analysis Function | Official guidance for direct labeling, color restraint, contrast, patterns/redundant encodings, accessible alternatives, and small multiples | https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-colours-in-charts/ |
| VZ-04 | Web Content Accessibility Guidelines (WCAG) 2.2 | World Wide Web Consortium | Normative web-accessibility standard used for contrast, non-color cues, text alternatives, and related accessible presentation requirements | https://www.w3.org/TR/WCAG22/ |

## Legal-document, evidence, and AI-audit sources

| ID | Source | Publisher / authors | Authority and use | Canonical URL |
|---|---|---|---|---|
| LA-01 | Federal Rules of Evidence (current official PDF retrieved 2026-09-16) | Supreme Court of the United States / U.S. Congress; hosted by U.S. Courts | Primary federal rules. This collection uses Rules 403, 107, 901, and 1006 as issue-spotting and design checks. They do not decide state law or case-specific admissibility. | https://www.uscourts.gov/sites/default/files/document/federal-rules-of-evidence.pdf |
| LA-02 | Formal Opinion 512: Generative Artificial Intelligence Tools | American Bar Association Standing Committee on Ethics and Professional Responsibility, July 29, 2024 | Professional-responsibility guidance on competence, confidentiality, communication, supervision, candor, fees, and appropriate independent verification/review. Link-only authority. | https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-512.pdf |
| LA-03 | Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile (NIST AI 600-1) | National Institute of Standards and Technology, July 2024 | Government risk-management guidance for testing, evaluation, verification, validation, provenance, human oversight, adversarial testing, documentation, and monitoring; not legal authority | https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf |
| LA-04 | Commentary on ESI Evidence & Admissibility, Second Edition | The Sedona Conference, October 2020 | Recognized practitioner commentary and checklist for ESI relevance, authenticity, hearsay, original/duplicate, Rule 403, metadata, hashing, and common electronic-source types; controlling law governs | https://www.thesedonaconference.org/sites/default/files/publications/ESI%20Evidence%20and%20Admissibility%20October%202020.pdf |
| LA-05 | Commentary on Achieving Quality in the E-Discovery Process (public handout; full commentary link-only) | The Sedona Conference | Public summary supporting project management, sampling, appropriate quality measures, accuracy/completeness, cooperation, and transparency. Full licensed commentary was not archived. | https://www.thesedonaconference.org/publication/Commentary_on_Achieving_Quality_in_the_E-Discovery_Process |
| LA-06 | Technology-Assisted Review for Discovery Requests: A Pocket Guide for Judges | Federal Judicial Center, 2017 | Federal judicial education guide for precision, recall, sampling, validation, and method-specific thresholds; not a mandated review protocol | https://www.fjc.gov/sites/default/files/2017/Technology-Assisted%20Review%20for%20Discovery%20Requests.pdf |

## Context, retrieval, and project-architecture sources

| ID | Source | Publisher / authors | Authority and use | Canonical URL |
|---|---|---|---|---|
| CX-01 | Lost in the Middle: How Language Models Use Long Contexts | Liu et al., Transactions of the Association for Computational Linguistics, 2024 | Peer-reviewed evidence that long-context performance can depend on where relevant information appears and that adding retrieved material may have diminishing value. Supports selective, task-relevant source activation; it does not prove that fewer files always improve every task. | https://aclanthology.org/2024.tacl-1.9/ |
| CX-02 | Latency optimization | OpenAI | Primary API engineering guidance: output length often dominates latency; input-token reduction has smaller but real effects, especially for large contexts; filtering context and reducing round trips can help. Used only for qualified efficiency claims, not a guarantee about ChatGPT Project latency. | https://developers.openai.com/api/docs/guides/latency-optimization |
| CX-03 | Projects in ChatGPT | OpenAI Help Center | Primary product documentation that project files can supply reference material, project instructions govern project-specific behavior, and project chats prioritize project files/context. | https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt |

## Deliberately excluded from the authoritative core

The following categories were not placed in the authoritative source tier:

- bulk legal-prompt libraries;
- unverified or low-provenance "AML benchmark" repositories;
- small demonstration financial-crime agent projects;
- generic OSINT system prompts with unclear authorship; and
- application repositories whose documentation makes claims that were not independently validated.

These may be reviewed later as engineering examples, but they should not govern evidentiary or investigative behavior.

## Source-update policy

- Recheck first-party model guidance when the active model, product surface, or model snapshot changes.
- Recheck official investigative standards annually or when a new edition is issued.
- Preserve old originals with retrieval dates and hashes; do not silently overwrite them.
- Record a change note when a new source materially changes the operating standard.

## Supporting sources found after the rules were written (DIR-0037, 2026-10-02)

These works were searched for, fetched and read on 2026-10-02 because the maintainer asked for a published source behind every part of every module (DIR-0037). They support — or, where marked, disagree with — rules that were written without a cited source. None is the origin of a rule. Each has a record in the project's `papertrail/project/SOURCES.md` with what was read, what it establishes and what it does not, and a second reader's check of the citation.

- PS-0056 — Office of the Director of National Intelligence, ICD 203 "Analytic Standards" (signed 2 Jan 2015, as amended by later technical amendments), ODNI. https://www.dni.gov/files/documents/ICD/ICD-203.pdf Bears on: Module 02 rule 1 (partly); Module 10 seven-pass structure (partly).
- PS-0089 — Zhang, Xiong, Chen, Zhou, Huang, Zhang, 2024, "From Lists to Emojis: How Format Bias Affects Model Alignment", arXiv:2409.11704 (an ACL 2025 long-paper version appears in search results; not fetched). https://arxiv.org/abs/2409.11704 Bears on: Module 10 format check (partly).
- PS-0090 — Tam, Wu, Tsai, Lin, Lee, Chen, 2024, "Let Me Speak Freely? A Study on the Impact of Format Restrictions on Performance of Large Language Models", arXiv:2408.02442 (an EMNLP 2024 Industry Track version appears in search results; not fetched). https://arxiv.org/abs/2408.02442 Bears on: Module 10 format check (partly).
- PS-0091 — Will Kurt (.txt), undated, "Say What You Mean: A Response to 'Let Me Speak Freely'", .txt blog. https://blog.dottxt.ai/say-what-you-mean.html Bears on: Module 10 format check (contradicts).
- PS-0094 — Ma and Liu, 2025, "Quantifying Laziness, Decoding Suboptimality, and Context Degradation in Large Language Models", arXiv:2512.20662. https://arxiv.org/abs/2512.20662 Bears on: Module 10 format check (partly).
- PS-0131 — Vassilev, Oprea, Fordyce, Anderson, Davies, Hamin, 2025, Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations (NIST AI 100-2e2025), NIST. https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-2e2025.pdf Bears on: Module 01 rule 6 (partly); Module 02 rule 11 (partly); Module 12 step 8 (partly).
- PS-0132 — OWASP GenAI Security Project, 2025, LLM01:2025 Prompt Injection (OWASP Top 10 for LLM Applications 2025), OWASP Foundation. https://genai.owasp.org/llmrisk/llm01-prompt-injection/ Bears on: Module 01 rule 6 (supports).
- PS-0133 — Hines, Lopez, Hall, Zarfati, Zunger, Kiciman, 2024, "Defending Against Indirect Prompt Injection Attacks With Spotlighting", arXiv:2403.14720. https://arxiv.org/abs/2403.14720 Bears on: Module 01 rule 6 (supports).
- PS-0134 — Chismon (NCSC Technical Director for Platforms Research), 8 Dec 2025, "Prompt injection is not SQL injection (it may be worse)", UK National Cyber Security Centre blog. https://www.ncsc.gov.uk/blog-post/prompt-injection-is-not-sql-injection Bears on: Module 01 rule 6 (contradicts); Module 02 rule 11 (contradicts); Module 12 step 8 (contradicts).
- PS-0135 — Society of Professional Journalists, 2014 revision, SPJ Code of Ethics, SPJ. https://www.spj.org/spj-code-of-ethics/ Bears on: Module 02 rule 1 (partly); Module 07 rule 5 (contradicts).
- PS-0136 — Federal Rules of Evidence, Rule 1002 "Requirement of the Original", with Advisory Committee Notes (Cornell LII copy). https://www.law.cornell.edu/rules/fre/rule_1002 Bears on: Module 02 rule 1 (partly).
- PS-0137 — Greshake, Abdelnabi, Mishra, Endres, Holz, Fritz, 2023, "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection", arXiv:2302.12173. https://arxiv.org/abs/2302.12173 Bears on: Module 02 rule 11 (supports).
- PS-0138 — Paula Gottlieb, "Aristotle on Non-contradiction", Stanford Encyclopedia of Philosophy (first published 2007, revised 19 Oct 2023). https://plato.stanford.edu/entries/aristotle-noncontradiction/ Bears on: Module 06 same-proposition check (06:31) and contradiction types (supports).
- PS-0139 — de Marneffe, Rafferty, Manning, 2008, "Finding Contradictions in Text", Proceedings of ACL-08: HLT, pp. 1039-1047, ACL. https://aclanthology.org/P08-1118.pdf Bears on: Module 06 same-proposition check (06:31) and contradiction types (partly).
- PS-0140 — Cattan, Jacovi, Ram, Herzig, Aharoni, Goldshtein, Ofek, Szpektor, Caciularu, 2025, "DRAGged into Conflicts: Detecting and Addressing Conflicting Sources in Search-Augmented LLMs", arXiv:2506.08500. https://arxiv.org/html/2506.08500 Bears on: Module 06 contradiction types (partly).
- PS-0141 — 15 U.S.C. §6821 (Gramm-Leach-Bliley Act, Title V Subtitle B, "Privacy protection for customer information of financial institutions"), Cornell LII copy. https://www.law.cornell.edu/uscode/text/15/6821 Bears on: Module 07 rules 4–5 (partly).
- PS-0142 — 18 U.S.C. §1030 (Computer Fraud and Abuse Act), Cornell LII copy. https://www.law.cornell.edu/uscode/text/18/1030 Bears on: Module 07 rules 4–5 (partly).
- PS-0143 — Federal Rules of Civil Procedure, Rule 45 "Subpoena", Cornell LII copy. https://www.law.cornell.edu/rules/frcp/rule_45 Bears on: Module 07 rule 4 (partly).
- PS-0144 — OHCHR and Human Rights Center, UC Berkeley School of Law, 2022, Berkeley Protocol on Digital Open Source Investigations, United Nations (HR/PUB/20/2). https://www.ohchr.org/sites/default/files/2022-04/OHCHR_BerkeleyProtocol.pdf Bears on: Module 07 rules 4–5 (partly).
- PS-0145 — Radio Television Digital News Association, "Guidelines for Hidden Cameras" (criteria credited to Black, Steele and Barney, Doing Ethics in Journalism, SPJ), RTDNA, undated page. https://www.rtdna.org/hidden-cameras Bears on: Module 07 rule 5 (contradicts).
- PS-0146 — IAASB, International Standard on Auditing 705 (Revised), "Modifications to the Opinion in the Independent Auditor's Report" (IFAC; copy hosted by IRBA). https://www.irba.co.za/upload/ISA-705-Revised.pdf Bears on: Module 10 seven-pass structure (10:23-30) and verdict scheme (partly).
- PS-0147 — PCAOB, AS 3105 "Departures from Unqualified Opinions and Other Reporting Circumstances", Public Company Accounting Oversight Board. https://pcaobus.org/oversight/standards/auditing-standards/details/AS3105 Bears on: Module 10 verdict scheme (partly).
- PS-0148 — Brooke Borel, 2023, The Chicago Guide to Fact-Checking, 2nd ed., University of Chicago Press. https://press.uchicago.edu/ucp/books/book/chicago/C/bo194938501.html Bears on: Module 10 seven-pass structure (partly).
- PS-0149 — Cleveland and McGill, 1984, "Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods", Journal of the American Statistical Association 79(387). https://isu-graphics.rbind.io/2018/04/graphical-perception--theory-experimentation-and-application-to-the-development-of-graphical-methods/ Bears on: Module 11 VISUAL_STANDARDS/VISUAL_TYPE_DECISION_MATRIX.md, named at PROMPT_MODULES/11_VISUAL_SELECTION_AND_SPECIFICATION.md:25 (partly).
- PS-0150 — Kosara and Skau, 2016, "Judgment Error in Pie Chart Variations", EuroVis 2016 Short Papers, pp. 91-95, Eurographics. https://eagereyes.org/publications/Kosara-EuroVis-2016 Bears on: Module 11 VISUAL_TYPE_DECISION_MATRIX.md (partly).
- PS-0151 — UK Government Analysis Function, "Data visualisation e-learning, module 2: choosing the right data visualisation", Analysis Function (ONS), content updated 2023. https://analysisfunction.civilservice.gov.uk/support/communicating-analysis/introduction-to-data-visualisation-e-learning/data-visualisation-e-learning-module-2-choosing-the-right-data-visualisation Bears on: Module 11 VISUAL_TYPE_DECISION_MATRIX.md (partly).
- PS-0152 — Office for National Statistics, "Axes and gridlines", ONS Service Manual, data visualisation guidance. https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines Bears on: Module 11 VISUAL_TYPE_DECISION_MATRIX.md (supports).
- PS-0153 — Shi, Yuan, Liu, Huang, Zhou, Sun, Gong, 2024, "Optimization-based Prompt Injection Attack to LLM-as-a-Judge", ACM CCS 2024 (per the arXiv record), arXiv:2403.17710. https://arxiv.org/abs/2403.17710 Bears on: Module 12 step 8 (supports).

## Sources for the right-of-reply checkpoint (DIR-0042, 2026-10-05)

Read on 2026-10-02 (records in the project's `papertrail/project/SOURCES.md`) and used on 2026-10-05 as the origin of Module 08 rule 10 and Module 10's right-of-reply check, the checkpoint CP-01.

- PS-0130 — Media Helping Media, "Fairness in journalism" (editorial ethics guide). https://mediahelpingmedia.org/ethics/fairness-in-journalism/ Read in part, through a summarizing fetch. Origin of: Module 08 rule 10 (offer the right of reply when making allegations; exceptions checked with senior editors, the source's example being an approach that could compromise a criminal arrest; a record of when, how and where the subject was approached and what they answered); Module 10's right-of-reply check.
- PS-0241 — Independent Press Standards Organisation, Editors' Code of Practice, Clause 1. https://www.ipso.co.uk/?p=349 Read in part, through a summarizing fetch. Related, not the origin: Clause 1's fair opportunity to reply concerns significant inaccuracies, a standard for correction rather than the approach before publication.

## Sources for rule application, Module 13 (DIR-0043, 2026-10-10)

Read on 2026-10-10 through a fetching tool that summarises, so each reading below is relayed, not first-hand. They continue the legal-document table's LA- series. Module 13's rules cite these ids; "Rules" names the rules each supports.

| ID | Source | Author / publisher | What it establishes | Canonical URL | Trail record | Rules |
|---|---|---|---|---|---|---|
| LA-07 | "element", Wex legal dictionary | Legal Information Institute, Cornell Law School | Role: the unit of the map. An element is an essential requirement of a claim or defence; without evidence of one element (the page's example: a legal duty in negligence) the claim fails. It states no standard of proof and does not say each element must be proven. Read in full. | https://www.law.cornell.edu/wex/element | PS-0288 | M13 r2, r7 |
| LA-08 | In re Winship, 397 U.S. 358 (1970) | US Supreme Court, via LII | Role: an example of a standard of proof fixed by law and applied fact by fact, in US criminal law. Due process requires proof beyond a reasonable doubt of every fact necessary to constitute the crime charged; LII's companion page names preponderance of the evidence as the civil standard. US criminal law only; it says nothing on how a non-lawyer maps evidence. Holding read, not the whole opinion. | https://www.law.cornell.edu/supremecourt/text/397/358 | PS-0289 | M13 r5 |
| LA-09 | Stockmeyer, "Legal Reasoning? It's All about IRAC", Student Lawyer | Norman Otto Stockmeyer; American Bar Association (page undated; first published on the WMU-Cooley Law School blog) | Role: the order of the output. Legal analysis runs issue, rule, application of the rule to the facts, conclusion; an "on the other hand" step explores alternative rules or interpretations. IRAC does not itself cover element-by-element mapping: per the reading notes, the article does not discuss breaking a rule into elements, and its examples treat the rule as one statement (LA-07 supplies the elements), and it says nothing about stopping before a conclusion. Re-read 2026-10-10. | https://www.americanbar.org/groups/law_students/resources/student-lawyer/student-essentials/legal-reasoning-its-all-about-irac/ | PS-0107 | M13 r6, r7 |
| LA-10 | Dahl, Magesh, Suzgun, Ho, "Large Legal Fictions: Profiling Legal Hallucinations in Large Language Models", Journal of Legal Analysis, 2024 (DOI 10.1093/jla/laae003; arXiv 2401.01301) | Matthew Dahl, Varun Magesh, Mirac Suzgun, Daniel E. Ho | Role: why the model supplies no law from memory and stops before a conclusion. Legal hallucination rates ran from 58% (ChatGPT 4) to 88% (Llama 2) on verifiable questions about federal court cases; models often failed to correct a user's wrong legal premise and could not tell when they were hallucinating. The models tested are 2023-era and the study tests case-law facts, not applying a rule to new facts. Abstract only read. | https://arxiv.org/abs/2401.01301 | PS-0109 | M13 r1, r8 |

Module 13 rules 3, 4 and 9 rest on the Standard (§4, §4.7–§4.8, §6 Stage 4, §15), and rule 6's deferral to counsel on logic and the Standard §1, not on these sources.

## Sources for the restating-a-finding section (DIR-0043, 2026-10-10)

`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`'s "Restating a finding" section, the same in every system. Both pages were read on 2026-10-10 through a fetching tool that summarises, at abstract level.

| ID | Source | Author / publisher | What it establishes | Canonical URL | Trail record | Rules |
|---|---|---|---|---|---|---|
| LA-11 | "The association between exaggeration in health related science news and academic press releases: retrospective observational study" | Sumner P, Vivian-Griffiths S, Boivin J et al., *BMJ* 349:g7015, 2014 | Exaggerated advice, causal claims from correlational results, and inference to humans from animal work in press releases were associated with the same exaggeration in the news stories based on them | https://www.bmj.com/content/349/bmj.g7015 | PS-0246 (re-read 2026-10-10) | CCL "Restating a finding" |
| LA-12 | "Reporting and interpretation of randomized controlled trials with statistically nonsignificant results for primary outcomes" | Boutron I et al., *JAMA* 303(20):2058–2064, 2010 | Spin — reporting that makes a treatment look beneficial despite a nonsignificant primary outcome — appeared, of 72 such trials, in 18.0% of titles, 37.5% of abstract results sections and 58.3% of abstract conclusions sections. Authors from general knowledge; the fetched page did not show them. | https://pubmed.ncbi.nlm.nih.gov/20501928/ | PS-0283 | CCL "Restating a finding" |
