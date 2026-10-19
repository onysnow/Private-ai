# Source Index

*Part of Quantitative Analysis System (QAS).*

Every source below was read for DIR-0043 (run RL-0023, 2026-10-10), except
QS-22 to QS-24, read for DIR-0045 (run RL-0024, the same day), and QS-25 to
QS-39, read for DIR-0046 (run RL-0025, the same day). "Trail record" is the
source's PS- id in the project's source records. "Rules" names the rules that
cite it (M03 r2 = Module 03 rule 2; P r3 = rule 3 of
`CORE/DATA_SOURCE_AND_QUALITY_POLICY.md`); "CCL" is
`CORE/CALIBRATED_CONFIDENCE_LANGUAGE.md`; "Rubric" is
`EVALUATION/PROMPT_QA_RUBRIC.md`. A source is cited for no more than its
reading notes say.

| ID | Source | Author / publisher | What it establishes | Canonical URL | Trail record | Rules |
|---|---|---|---|---|---|---|
| QS-01 | "Statistical tests, P values, confidence intervals, and power: a guide to misinterpretations" | Greenland S, Senn SJ, Rothman KJ, Carlin JB, Poole C, Goodman SN, Altman DG; *European Journal of Epidemiology* 31:337–350, 2016 | A p-value is not the probability the hypothesis is true or that chance produced the result; p > 0.05 is not "no effect"; significance is not importance; a 95% CI has no 95% chance of holding the true value for one study; overlapping CIs do not show no difference; p tests all model assumptions; report estimates, limits, exact p and all analyses | https://minerva-access.unimelb.edu.au/server/api/core/bitstreams/ef052cd6-1fb7-520e-9cef-c14da6a02ea7/content | PS-0250 | M04 r5, r8; M05 r1, r3, r5, r6, r7, r8, r11; M07 r8 |
| QS-02 | "The garden of forking paths" (unpublished manuscript, 14 Nov 2013) | Gelman A, Loken E; Columbia University | Data-contingent choices create multiple comparisons without deliberate fishing; preregister where feasible; report data-dependent choices; treat unreplicated results as exploratory | https://sites.stat.columbia.edu/gelman/research/unpublished/p_hacking.pdf | PS-0251 | M01 r9; M03 r1; M04 r1, r2, r4, r6, r10; M07 r5, r6 |
| QS-03 | "False-positive psychology" | Simmons JP, Nelson LD, Simonsohn U; *Psychological Science* 22(11):1359–1366, 2011 | Undisclosed analytic flexibility raises false positives well above 5%; decide stopping rules in advance; report results with excluded observations and without covariates | https://journals.sagepub.com/doi/full/10.1177/0956797611417632 | PS-0252 | M02 r6; M04 r1, r7; M07 r7 |
| QS-04 | "Data Organization in Spreadsheets" | Broman KW, Woo KH; *The American Statistician* 72(1):2–10, 2018 | Keep the primary data file pristine, with no calculations, and work on a copy; keep a data dictionary; rearrange data with code, not copy-and-paste | https://tysonbarrett.com/EDUC-6050/Readings/Broman_DataSpreadsheets_2017.pdf | PS-0253 | M01 r6; M02 r3, r4, r7; M07 r4 |
| QS-05 | "Tidy Data" | Wickham H; *Journal of Statistical Software* 59(10):1–23, 2014 | One variable per column, one observation per row, one kind of unit per table; what counts as an observation can depend on the question | https://vita.had.co.nz/papers/tidy-data.pdf | PS-0254 | M01 r3; M02 r8 |
| QS-06 | "The Method of Multiple Working Hypotheses" | Chamberlin TC; *Science* 15:92, 1890 (reprinted 1965) | A single early explanation hardens into a ruling theory; keeping several explanations open reduces that; phenomena can have several interacting causes | https://www.whoi.edu/cms/files/chamberlin65sci_72744.pdf | PS-0255 | M03 r2, r9; M06 r6 |
| QS-07 | "Strong Inference" | Platt JR; *Science* 146(3642):347–353, 1964 | The steps: alternative hypotheses, a test whose outcomes exclude some, a clean result, recycle; ask what result would disprove a hypothesis | https://www.whoi.edu/cms/files/platt64sci_72743.pdf | PS-0234 | M01 r8; M03 r4, r5, r7, r9 |
| QS-08 | "The Environment and Disease: Association or Causation?" | Hill AB; *Proceedings of the Royal Society of Medicine* 58 (volume not shown in the copy read):295–300, 1965 | Nine viewpoints, none a sine qua non, none decisive; their use is to ask whether another explanation fits as well; significance tests do not answer causation; "no significant difference" is often misread as "no difference" | https://usrtk.org/wp-content/uploads/2017/10/Bradford-Hill-1965.pdf | PS-0256 | M05 r5; M06 r5, r6, r7; M07 r9 |
| QS-09 | "Causal knowledge as a prerequisite for confounding evaluation" | Hernán MA, Hernández-Díaz S, Werler MM, Mitchell AA; *American Journal of Epidemiology* 155(2):176–184, 2002 | Statistical confounder selection can add bias; adjusting for a collider or a variable affected by exposure can create spurious association; causal diagrams should guide adjustment; under uncertain structure, run several analyses and state assumptions | https://educa.saludpublica.uchile.cl/espsystem/files/t/asignaturas_bibliografia/4522/archivos/5_Hernan_Hernandez_Causal_Knowledge1.pdf | PS-0257 | M03 r2; M04 r3; M06 r2, r3, r4; M07 r9; Std §9 (plausible structure; re-read 2026-10-10) |
| QS-10 | "Simpson's paradox in psychological science: a practical guide" | Kievit RA, Frankenhuis WE, Waldorp LJ, Borsboom D; *Frontiers in Psychology* 4:513, 2013 | An association can reverse within every subgroup; state the level a claim operates at; between-person data do not license within-person claims; test for subgroup structure | https://www.frontiersin.org/articles/10.3389/fpsyg.2013.00513/full | PS-0258 | M01 r5; M05 r10; M06 r8 |
| QS-11 | "Paradoxes of probability and other statistical strangeness" | *The Conversation* (author not captured; URL indicates 2017) | Base-rate fallacy with a worked screening example (4% prevalence, 25% false flags, about 13% of positives ill); composition of compared groups can reverse a comparison | https://theconversation.com/paradoxes-of-probability-and-other-statistical-strangeness-74440 | PS-0259 | M03 r2; M05 r9, r10 |
| QS-12 | "The New Statistics: Why and How" | Cumming G; *Psychological Science* 25(1):7–29, 2014 | Effect sizes and CIs; prespecify where possible; distinguish planned from exploratory; p varies widely across replications; each study is one contribution. Its advice to drop NHST is the author's position | https://lists.ime.usp.br/archives/abe/attachments/20150307/f2357225/attachment-0005.pdf | PS-0260 | M03 r1; M04 r1, r4, r10; M05 r1, r2, r12; M07 r6 |
| QS-13 | "The ASA's Statement on p-Values: Context, Process, and Purpose" | Wasserstein RL, Lazar NA; *The American Statistician* 70(2):129–133, 2016 | Six principles: p is not the probability the hypothesis is true; no conclusion on a threshold alone; full reporting; p does not measure size or importance; disclose all analyses; other methods may supplement or replace p. It does not ban p-values | https://www.stat.berkeley.edu/~aldous/Real_World/ASA_statement.pdf | PS-0235 | M04 r5, r8; M05 r2, r3, r4, r6, r11; M07 r7, r8 |
| QS-14 | "Accounting for Methods: Spreadsheets, Scripts and Programming Notebooks", in *The Data Journalism Handbook* (2021), ch. 19 | Leon S; Bounegru L, Gray J (eds), Amsterdam University Press | Spreadsheets hide process; scripts and notebooks record every step from raw data to result; state where data came from | https://datajournalism.com/read/handbook/two/working-with-data/accounting-for-methods-in-data-journalism-spreadsheets-scripts-and-programming-notebooks | PS-0261 | M02 r1, r4, r5; M04 r9; M07 r4 |
| QS-15 | "The Weakness of Strong Inference" | O'Donohue W, Buchanan JA; *Behavior and Philosophy* 29:1–20, 2001 | Platt did not show the method is used more in successful sciences; a complete set of alternatives cannot be listed; by Duhem–Quine, crucial experiments are logically inconclusive | https://cornerstone.lib.mnsu.edu/psyc_fac_pubs/37 | PS-0262 | M03 r3, r6, r7, r9 |
| QS-16 | "Fifty years of J. R. Platt's strong inference" | Fudge DS; *Journal of Experimental Biology* 217(8):1202–1204, 2014 | A badly designed crucial test misleads; the process is iterative; descriptive data work did not need strong inference and feeds it later; listing predictions and disproving tests remain valuable | https://journals.biologists.com/jeb/article/217/8/1202/13095/Fifty-years-of-J-R-Platt-s-strong-inference | PS-0263 | M03 r1, r4, r7, r8 |
| QS-17 | Intelligence Community Directive 203, "Analytic Standards" (2 Jan 2015) | Office of the Director of National Intelligence | Seven bands, two alternative terms for each; do not mix the two sets; keep confidence level and likelihood out of one sentence | https://archive.dni.gov/files/documents/ICD/ICD-203.pdf | PS-0099 | CCL; M07 r11 |
| QS-18 | "Variability in the interpretation of Dutch probability phrases — a risk for miscommunication" (arXiv:1901.09686, 2019) | Willems SJW, Albers CJ, Smeets I | Most probability phrases had reader ranges 30–40 points wide; advise numbers or verbal-plus-numeric | https://ar5iv.arxiv.org/html/1901.09686 | PS-0286 | CCL |
| QS-19 | "Improving communication of uncertainty in the IPCC reports" (Oslo, Feb 2016) | Budescu DV; IPCC Expert Meeting on Communication | Readers matched IPCC's defined ranges about 26% of the time; pairing each term with its range improved agreement | https://www.ipcc.ch/site/assets/uploads/2016/02/Budescu_IPCC_Communication_Meeting_OSLO_February_2016.pdf | PS-0287 | CCL; M07 r11 |
| QS-20 | "The association between exaggeration in health related science news and academic press releases" | Sumner P, Vivian-Griffiths S, Boivin J, et al.; *BMJ* 349:g7015, 2014 | 33% of press releases exaggerated causal claims from correlational research; news exaggeration was strongly associated with press-release exaggeration | https://www.bmj.com/content/349/bmj.g7015 | PS-0246 | CCL; M06 r11; M07 r10 |
| QS-21 | "Reporting and interpretation of randomized controlled trials with statistically nonsignificant results for primary outcomes" | Boutron I, Dutton S, Ravaud P, Altman DG (authors from general knowledge; not shown on the page read); *JAMA* 303(20):2058–2064, 2010 | Spin in 58.3% of abstract conclusions of 72 trials with nonsignificant primary outcomes | https://pubmed.ncbi.nlm.nih.gov/20501928/ | PS-0283 | CCL; M07 r10 |
| QS-22 | "CONSORT 2010 Explanation and Elaboration: updated guidelines for reporting parallel group randomised trials" | Moher D, Hopewell S, Schulz KF, et al.; *BMJ* 340:c869, 2010 | Item 6a: the primary outcome is "the pre-specified outcome considered to be of greatest importance to relevant stakeholders"; several primary outcomes are not recommended; item 6b: changes to outcomes after the trial began are reported, and changes made on unblinded data are much more problematic | https://www.bmj.com/content/340/bmj.c869 | PS-0297 | Std §9 (central claim) |
| QS-23 | ICH E9, Statistical Principles for Clinical Trials, §2.2.2 | International Council for Harmonisation (EMA copy, CPMP/ICH/363/96) | The primary variable gives the most relevant and convincing evidence for the primary objective; there should generally be only one; it is specified in the protocol; redefining it after unblinding is almost always unacceptable | https://www.ema.europa.eu/en/documents/scientific-guideline/ich-e-9-statistical-principles-clinical-trials-step-5_en.pdf | PS-0298 | Std §9 (central claim) |
| QS-24 | "COMPare: Qualitative analysis of researchers' responses to critical correspondence on a cohort of 58 misreported trials" | Goldacre B, Drysdale H, Marston C, et al.; *Trials* 20:124, 2019 | Of 58 trials whose reported outcomes differed from those pre-specified, eight teams clearly acknowledged a discrepancy and one trial was corrected | https://pmc.ncbi.nlm.nih.gov/articles/PMC6374909 | PS-0299 | Std §9 (central claim); limit |
| QS-25 | "The Code of Practice for Statistics", edition 3.0 (published 3 Nov 2025) | Office for Statistics Regulation / UK Statistics Authority | The Code is built on core principles of Trustworthiness, Quality and Value; Quality principles 5 "Prioritise quality", 6 "Be rigorous", 7 "Be open about quality"; the regulator says compliance gives confidence that published government statistics are high quality | https://osr.statisticsauthority.gov.uk/publications/the-code-of-practice-for-statistics/ | PS-0301 | P r3 |
| QS-26 | "Administrative Data Quality Assurance Toolkit" (2015, updated 21 May 2026) and "Quality Assurance of Administrative Data (QAAD) – Setting the standard" (2015, updated 15 Dec 2022) | Office for Statistics Regulation / UK Statistics Authority | Assurance levels A0 no assurance, A1 basic, A2 enhanced, A3 comprehensive, across four areas of practice; the level is set from the likelihood of quality concerns in the administrative data and the public interest the statistics serve; some statistics need greater assurance than others | https://osr.statisticsauthority.gov.uk/publication/administrative-data-quality-assurance-toolkit/pages/4 | PS-0302 | P r5 |
| QS-27 | *Principles and Practices for a Federal Statistical Agency*, eighth edition (2025) | National Academies of Sciences, Engineering, and Medicine, Committee on National Statistics | Five principles, among them credibility among data users and independence from undue influence; agencies must have credibility with those who use their data; an agency's value rests on the accuracy and credibility of its data products | https://www.nationalacademies.org/read/27934/chapter/5 | PS-0303 | P r3 |
| QS-28 | European Statistics Code of Practice, revised edition November 2017 (Eurostat web page) | European Statistical System / Eurostat | Output principles 11–15: relevance; accuracy and reliability; timeliness and punctuality; coherence and comparability; accessibility and clarity | https://ec.europa.eu/eurostat/web/quality/european-quality-standards/european-statistics-code-of-practice | PS-0304 | P r3, r17 |
| QS-29 | "Data Quality Assessment Framework (DQAF) for National Accounts Statistics" (May 2012) | International Monetary Fund, Statistics Department | Prerequisites of quality as institutional preconditions (fetch paraphrase); dimensions: assurances of integrity, methodological soundness, accuracy and reliability, serviceability (consistent statistics with a predictable revisions policy), accessibility | https://dsbb.imf.org/content/pdfs/dqrs_nag.pdf | PS-0305 | P r3, r16 |
| QS-30 | "Total Survey Error: Past, Present, and Future" | Groves RM, Lyberg L; *Public Opinion Quarterly* 74(5):849–879, 2010 | Total survey error is a framework for the error properties of survey statistics; nonsampling error sources (as listed by Biemer and Lyberg 2003): specification, frame, nonresponse, measurement, processing; specification error arises when the concept asked about differs from the concept that should be measured; nonobservation errors usually include coverage error | https://academic.oup.com/poq/article/74/5/849/1817502 | PS-0306 | P r7, r17 |
| QS-31 | "Administrative data (part 1)", Quality assurance of administrative data: case examples (date not shown) | Office for Statistics Regulation / UK Statistics Authority | Administrative data are a by-product of systems developed primarily for operational purposes; problem sources include unstandardised collection, variability in suppliers' procedures and the number of suppliers; these need investigation and clear communication of limits to users | https://osr.statisticsauthority.gov.uk/guidance/administrative-data-and-official-statistics/quality-assurance-of-administrative-data-case-examples/administrative-data-part-1 | PS-0307 | P r2, r5 |
| QS-32 | "Total Error in a Big Data World: Adapting the TSE Framework to Big Data" | Amaya A, Biemer PP, Kinyon D; *Journal of Survey Statistics and Methodology* 8(1):89–119, 2020 | Big Data is not without error; undercoverage distorts the population represented; missing data are often confounded with undercoverage; size may give false confidence in accuracy; one-directional measurement error biases estimates; in the case study third-party records had high coverage error and one vendor did not standardise addresses | https://academic.oup.com/jssam/article/8/1/89/5741669 | PS-0308 | P r9 |
| QS-33 | "Become Data Literate in 3 Simple Steps", *The Data Journalism Handbook* (first edition, per URL) | Kayser-Bril N; DataJournalism.com | Ask "How was the data collected?" and "How reliable is the information?"; take distribution and base rate into account; verify a suspicious figure; compare victimisation surveys with police data (fetch paraphrase) | https://datajournalism.com/read/handbook/one/understanding-data/become-data-literate-in-3-simple-steps | PS-0309 | P r15, r21 |
| QS-34 | "Datasheets for Datasets" (arXiv:1803.09010 v8, 2021) | Gebru T, Morgenstern J, Vecchione B, Wortman Vaughan J, Wallach H, Daumé III H, Crawford K | No standardised process for documenting datasets; seven question sections (motivation, composition, collection process, preprocessing/cleaning/labeling, uses, distribution, maintenance); the questions are not prescriptive and not a complete solution | https://arxiv.org/abs/1803.09010 | PS-0310 | P r12, r14 |
| QS-35 | "Basic Statistical Reporting for Articles Published in Biomedical Journals: The SAMPL Guidelines" (2013) | Lang T, Altman DG; in Smart P, Maisonneuve H, Polderman A (eds), *Science Editors' Handbook*, European Association of Science Editors | Avoid relying solely on hypothesis tests such as P values; describe methods in enough detail for a knowledgeable reader; report a measure of precision such as the 95% CI; confirm test assumptions were met; report how missing data were treated | https://www.equator-network.org/wp-content/uploads/2013/03/SAMPL-Guidelines-3-13-13.pdf | PS-0311 | Rubric |
| QS-36 | "Ethical Guidelines for Statistical Practice" (approved 1 Feb 2022) | American Statistical Association | Principle B: communicate data sources and fitness for use, including generation and collection processes and known biases; communicate processing and missing-data handling; be transparent about assumptions; disclose multiple comparisons and adjustments | https://www.amstat.org/your-career/ethical-guidelines-for-statistical-practice | PS-0312 | P r1, r20; Rubric |
| QS-37 | "Quality under challenge: Regulating statistics and data from the Labour Force Survey" (blog, 12 Dec 2024) | Office for Statistics Regulation (Head of Assessment) | LFS response rates had been steadily declining and the pandemic worsened them; the regulator removed accreditation from LFS-based estimates and datasets in November 2023; the statistics inform key economic decisions | https://osr.statisticsauthority.gov.uk/blog/quality-under-challenge-regulating-statistics-and-data-from-the-labour-force-survey | PS-0313 | P r4, r7, r10; limit 8 |
| QS-38 | "World Bank Group to Discontinue Doing Business Report" (statement, 16 Sep 2021) | World Bank Group | After data irregularities on Doing Business 2018 and 2020 were reported internally, the next report was paused, reviews and audits begun, and the report discontinued | https://www.worldbank.org/en/news/statement/2021/09/16/world-bank-group-to-discontinue-doing-business-report | PS-0314 | P r10; limit 8 |
| QS-39 | "Relation of completeness of reporting of health research to journals' endorsement of reporting guidelines: systematic review" | Stevens A, Shamseer L, Weinstein E, et al.; *BMJ* 348:g3804, 2014 | Reporting guideline items were assessed by few evaluations; insufficient evidence exists to determine the relation between journals' endorsement and completeness of reporting | https://www.bmj.com/content/348/bmj.g3804 | PS-0315 | Rubric; limit 9 |

## Limits found by the disconfirming searches

1. **Rivals can be listed only as far as they can be identified, and one test
   rarely settles them alone.** A complete set of alternatives cannot be
   enumerated, and by the Duhem–Quine thesis a "crucial" test is logically
   inconclusive (QS-15). Bounds Module 03 rules 3, 6 and 7; Standard §2 principle 3.
   Test Q03.
2. **Strong inference fits the testing stage, not exploration.** Descriptive
   data work proceeded without it (QS-16); exploratory and confirmatory work
   are kept apart (QS-02, QS-12). Module 03 rule 1 allows a labelled
   exploratory phase whose patterns are not reported as tested. Test Q04.
3. **Platt and Chamberlin are cited for the practice, not as proof that it
   speeds progress.** Platt's historical claim was asserted, not shown
   (QS-15). Bounds Module 03 rule 9. Test Q05.
4. **No Hill viewpoint is required; time order rests on logic.** Hill calls
   none of the nine a sine qua non (QS-08). Module 06 rule 1 rests time order
   on logic and rule 5 treats the viewpoints as considerations. Test Q10.
5. **P-values are not banned.** The ASA statement does not ban them (QS-13);
   Cumming's advice to stop using NHST is one position (QS-12). Bounds Module
   05 rule 2; Standard §2 principle 6. Test Q08.
6. **Adjustment follows stated causal assumptions.** Adjusting for the wrong
   variable can create bias, so "control for everything" is not safe (QS-09).
   Bounds Module 04 rule 3 and Module 06 rules 2–4. Test Q11.

7. **A primary designation can be switched after the fact.** Pre-specifying a primary
   outcome does not stop it being changed; in the COMPare cohort few teams acknowledged a
   discrepancy (QS-24). Bounds Standard §9's "central claim": the designation counts only as
   the plan recorded it before outcomes were seen (QPLN `written_before_outcome_seen`), and a
   later change is reported as a change. Test Q30.

8. **A producer's standing does not settle a dataset's quality.** Accredited
   labour statistics lost their accreditation after response rates fell
   (QS-37), and a major international producer discontinued a flagship
   report after data irregularities in two editions (QS-38). Neither source
   says how often this happens. Bounds Policy rules 3, 4 and 10: status is
   checked on the date of use and quality events are searched for. Tests
   Q13, Q14.
9. **Whether checklists improve the work they check is not established.**
   Evidence on journals' endorsement of reporting guidelines is insufficient
   (QS-39); this shows the evidence is thin, not that checklists fail.
   Bounds `EVALUATION/PROMPT_QA_RUBRIC.md`: a rubric score is not evidence
   that an analysis is right. No test: the limit bounds how a score is
   read, not a model's output.

## Not read

Every page was read through a fetching tool that returns a model's summary of
the page, so every reading here is relayed, not first-hand. In addition:

- QS-15 (O'Donohue and Buchanan): repository abstract only; the full text was
  not opened.
- QS-17 (ICD 203): the likelihood table and its usage rules only.
- QS-18 (Willems et al.) and QS-19 (Budescu): findings and conclusions only.
- QS-20 (Sumner et al.): abstract only.
- QS-21 (Boutron et al.): PubMed abstract only.
- QS-04 (Broman and Woo): selected sections of a 2017 preprint copy.
- QS-12 (Cumming): abstract, guidelines and middle sections; the final
  sections were not read.
- QS-02 (Gelman and Loken): the 2013 unrefereed manuscript; the later
  published version was not checked.
- QS-11 (*The Conversation*): author and date not confirmed; the GP study it
  cites was not checked.
- QS-03 (Simmons et al.): the article text only; the supplementary materials
  were not read.
- QS-13 (ASA): the online supplementary commentaries were not read.
- QS-14 (Leon): Figure 19.1 and the linked notebook were not reviewed.
- QS-09 (Hernán et al.): figures and tables were partly garbled in the copy
  read.
- QS-08 (Hill): the copy read is a litigation exhibit posted by an advocacy
  organisation; the text is Hill's.
- Hernán and Robins, *Causal Inference: What If*, chapter 7: not reached; not
  cited.
- QS-22: items 6a and 6b of the explanation only. QS-23: §2.2.2 only. QS-24: the results as the article page gives them; the companion paper with the aggregate counts was not read.
- QS-25 (Code of Practice 3.0): the publication landing page, page 3's pillar
  headings and Quality principle names, and the regulator's code landing
  page; the full PDF and the Trustworthiness and Value principles were not
  read.
- QS-26 (QAAD): Toolkit pages 3 and 4, the Setting-the-standard landing page
  and page 6, and the case-examples levels page; the criteria for rating a
  dataset's risk and public-interest profile were not read, and the matrix
  cells were extracted from a table by the fetch, not checked against the
  page.
- QS-27 (NASEM): the publication page, front matter and Chapter 3's opening
  principle statements; the ten practices were not read and some principle
  statements were truncated; OMB Statistical Policy Directive No. 1 was not
  consulted.
- QS-28 (European code): the web page's summary of output principles 11–15
  only; the Code PDF and its indicators were not read, and whether the one-line
  statements are the Code's own text was not confirmed.
- QS-29 (IMF DQAF): the national-accounts framework's dimension headings and
  definitions only; the generic framework page failed to load.
- QS-30 (Groves and Lyberg): the abstract and passages returned by the fetch;
  the full article was not confirmed read; the five-source list is Biemer and
  Lyberg's (2003) as cited there.
- QS-31 (OSR administrative data): the page text as summarised; it has no
  date or author and does not discuss changes in recording practice.
- QS-32 (Amaya et al.): the first 100,000 of 109,142 characters; the end of
  the article was not read; one case study only.
- QS-33 (Kayser-Bril): the chapter as summarised; the edition year was not
  confirmed.
- QS-34 (Gebru et al.): cited as the arXiv preprint; publication in a journal
  was not confirmed.
- QS-36 (ASA): principle numbering beyond B and F, as the fetch reported it,
  was not checked.
- QS-37 (OSR blog): the count of affected outputs and the July 2023 detail are
  fetch paraphrase and are not cited.
- QS-38 (World Bank): the investigation report linked from the statement was
  not read.
- QS-39 (Stevens et al.): abstract only; CONSORT-specific evidence was not
  read.
- Not read for DIR-0046: the Code of Practice 3.0 PDF, the European code PDF,
  OMB Statistical Policy Directive No. 1, the IMF's generic DQAF page (fetch
  error), and Statistics New Zealand's page on administrative data for census
  variables (no body text returned).
