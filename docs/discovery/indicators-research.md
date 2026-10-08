# Indicator research: deep-research report (8 October 2026)

Made with the deep-research workflow: 5 search angles, 23 sources read, 113 claims extracted, 25 checked by three independent verifiers each (all 25 confirmed, none refuted), merged into the findings below. Sources are linked under each finding.

## Summary

The verified evidence answers question (1) best, on indicator catalogues; covers part of (2), on journalist danger; and contains nothing verified for (3), on source-reliability grading, or (4), on training material. For (1): there is no single authoritative cross-crime catalogue. The largest systematic study, Akartuna, Johnson and Thornton (2024), found 2,565 red-flag indicators across 105 FATF, FATF-style regional body and AUSTRAC reports. However, 757 were duplicates, only 68 of the reports contained indicators at all, and the paper does not publish the indicators as structured data. Two domains already have machine-usable indicator sets. In procurement, the Open Contracting Partnership's 2024 guide defines 73 red flags mapped to OCDS fields with formulas, and its open-source Cardinal library computes some of them. In disinformation, the DISARM framework (CC-BY-SA-4.0) is published on GitHub as xlsx, CSV, SQLite and STIX, and the 2025 DISINFOX preprint models disinformation incidents in it. Cross-crime links are documented in primary sources: FATF/APG financial red flags for human trafficking (2018, Annex B); UNODC on wildlife crime being linked to fraud, corruption and money laundering, and sharing smuggling routes with drug, human and weapons trafficking; and the ILO's 11 forced-labour indicators. Every source frames its indicators as probabilistic signals, not proof, so an app should flag combinations of signs rather than verdicts. For (2), the verified material is limited to CPJ's database schema. It sorts deaths into crossfire, dangerous assignment and murder; codes seven suspected-perpetrator types; and records whether the journalist was threatened, taken captive or tortured before being killed. Those fields map directly onto app data fields.

## Findings

**High confidence.** The most systematic review of money-laundering red flags (Akartuna, Johnson & Thornton, Journal of Experimental Criminology, 2024, open access, doi 10.1007/s11292-024-09623-y) followed PRISMA-ScR. It covered 105 typology reports published 2000-2021 by FATF, the nine FATF-style regional bodies (e.g. GIABA, MENAFATF, CFATF, MONEYVAL) and AUSTRAC. It found 16 typologies, more than 200 value instruments, more than 200 actors/entities and 2,565 red-flag indicators, and counted six kinds of insight per report: actors/entities, value instruments, risk indicators, typologies, methods and techniques.

Evidence: Abstract: 'The review identified 16 typologies, over 200 value instruments, over 200 actors/entities and 2565 red-flag indicators'. Methods: '105 relevant reports published between 2000 and 2021'. Supplement Table 3 lists the six insight types per report.

Sources: <https://link.springer.com/10.1007/s11292-024-09623-y> · <https://media.springernature.com/original/springer-static/esm/art%3A10.1007%2Fs11292-024-09623-y/MediaObjects/11292_2024_9623_MOESM1_ESM.pdf>

**High confidence.** Existing money-laundering indicator lists overlap heavily and are inconsistent. 757 of the 2,565 indicators are duplicates in substance, and only 68 of the 105 reports contained any indicators. The authors name the lack of standardisation as the root problem and call for a standardised, cross-typological way of reporting financial intelligence. The supplementary material gives only counts per category. It does not list the indicators, so the 2,565 are not available as structured data, and the scope is money laundering only, not all crime types.

Evidence: Paper: '2565 red-flag indicators (including 757 duplicates...)'; 'Of the 105 reports, only 68 contained indicators'; 'the problem of data standardisation is a common denominator to all these issues.' Verifier read the whole supplementary PDF: no table lists the risk indicators, and the typology tables are PDF only.

Sources: <https://link.springer.com/10.1007/s11292-024-09623-y> · <https://media.springernature.com/original/springer-static/esm/art%3A10.1007%2Fs11292-024-09623-y/MediaObjects/11292_2024_9623_MOESM1_ESM.pdf>

**High confidence.** Procurement fraud and corruption red flags exist as structured, machine-computable data. The Open Contracting Partnership's 2024 guide 'Red Flags in Public Procurement' describes 73 indicators. For each it gives a definition, type, procurement stage (planning, tender, award, contract, implementation), why it is a red flag, the required OCDS data fields, a calculation method and a unit of analysis. The indicators are also published as a filterable spreadsheet. The guide builds on OCP's 2016 Red Flags for Integrity Guide, whose OCDS mapping is in a public Google Sheet.

Evidence: Guide: 'In the annex, you will find a detailed description of 73 red flags indicators... We then mapped these fields into OCDS and developed formulas for each indicator.' The 2016 guide was 'mapped to the OCDS'.

Sources: <https://open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf> · <https://www.open-contracting.org/2024/06/12/cardinal-an-open-source-library-to-calculate-public-procurement-red-flags/>

**High confidence.** Cardinal is OCP's free, open-source library and command-line tool (open-contracting/cardinal-rs; docs at cardinal.readthedocs.io). It computes procurement red flags from OCDS data and outputs JSON scores. At launch in June 2024 it supported 10 indicators: collusion R003, R024, R025, R028 and R058, and supplier risk R035, R036, R038, R030 and R048. Eight more were planned. The Dominican Republic's procurement agency (DGCP) uses it in a live dashboard.

Evidence: 'Cardinal is an open-source library and command-line tool that uses OCDS data to... Automatically calculate procurement indicators and red flags.' 'Currently Cardinal supports 10 indicators. We are in the process of incorporating eight more in the short term.'

Sources: <https://www.open-contracting.org/2024/06/12/cardinal-an-open-source-library-to-calculate-public-procurement-red-flags/> · <https://open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf>

**High confidence.** For disinformation, the DISARM Red Framework is an open, shared vocabulary of influence-operation tactics and techniques, modelled on MITRE ATT&CK. It is published on GitHub (DISARMFoundation/DISARMframeworks) as xlsx, CSV, SQLite and a STIX bundle (v1.6), and is bundled with MISP, so it can be used directly as structured data. A 2025 arXiv preprint (DISINFOX) modelled more than 100 real disinformation incidents in DISARM and mapped them to STIX2.

Evidence: 'The DISARM Red Framework provides a common language for documenting influence operations... open-source, published under a CC-BY-SA-4.0 license.' The repo has a master xlsx and generated CSV, SQLite and STIX files. The preprint covers 'modeling of disinformation incidents with the DISARM framework... a custom mapping to STIX2'.

Sources: <https://www.disarm.foundation/framework> · <https://github.com/DISARMFoundation/DISARMframeworks> · <https://arxiv.org/pdf/2502.20997>

**High confidence.** Financial red flags can point to non-financial crime. The 2018 FATF/APG report 'Financial Flows from Human Trafficking' sets out the financial information that can identify trafficking for sexual exploitation or forced labour. Its Annex B lists red-flag indicators for people laundering trafficking proceeds. The report also notes possible links to profits from organ trafficking and to terrorist financing.

Evidence: 'aims to raise awareness about the type of financial information that can identify human trafficking for sexual exploitation or forced labour... includes red flag indicators (see Annex B)... highlights potential links between human trafficking and terrorist financing.'

Sources: <https://www.fatf-gafi.org/en/publications/methodsandtrends/documents/human-trafficking.html>

**Medium confidence.** Environmental crime crosses into other crime areas. UNODC says wildlife and forest crime is frequently linked to fraud, corruption and money laundering, and often moves along the same routes and infrastructure as drug, human and weapons trafficking. That lets financial and route indicators signal several crime types at once. UNODC also recommends working with banks and other financial institutions to identify suspicious-transaction indicators.

Evidence: 'frequently linked to other forms of serious crime such as fraud, corruption and money laundering'; 'often by means of existing infrastructures and well-developed routes used for the trafficking of drugs, people, weapons'. Primary UN source, but a single undated 4-page brief. The cross-indicator point is an inference.

Sources: <https://unodc.org/lpomex/es/publicaciones/documentos/crimen/Financial_Flow_Wildlife_Crime.html>

**High confidence.** The ILO publishes eleven forced-labour indicators for front-line actors: abuse of vulnerability, deception, restriction of movement, isolation, physical and sexual violence, intimidation and threats, retention of identity documents, withholding of wages, debt bondage, abusive working and living conditions, and excessive overtime. The first edition is from 2012 and a revised edition came out in November 2025. The ILO describes them as the 'most common signs or clues' that point to the possible existence of forced labour, not as proof.

Evidence: 'These indicators are intended to help front-line criminal law enforcement officials, labour inspectors, trade union officers, NGO workers and others... The booklet presents the eleven indicators.' 'The indicators represent the most common signs or clues that point to the possible existence of a forced labour case.'

Sources: <https://www.ilo.org/publications/ilo-indicators-forced-labour> · <https://www.ilo.org/publications/ilo-indicators-forced-labour-1>

**High confidence.** All the authorities treat red flags as prompts for scrutiny, not evidence, and say combinations of signs matter. AUSTRAC's list of about 85 ML/TF indicators, taken from its 2007 typologies report, says indicators alone are not evidence of suspicious activity and that several together raise the urgency. COPE says editors spot paper-mill (fake) academic papers, at submission and after publication, by looking for a combination of specific indicators. The app should therefore score clusters of signs, not single hits.

Evidence: AUSTRAC: 'indicators alone are not automatically evidence of suspicious activity... Individual cases can show more than one indicator, which may increase the urgency.' COPE: 'Fake papers can be detected during submission and after publication, with editors looking for a combination of specific indicators.'

Sources: <https://www.austrac.gov.au/business/how-comply-guidance-and-resources/guidance-resources/typologies-paper-austrac-money-laundering-and-terrorism-financing-indicators> · <https://publicationethics.org/resources/research/paper-mills-research> · <https://www.ilo.org/publications/ilo-indicators-forced-labour>

**High confidence.** CPJ's database schema gives a ready-made structure for modelling danger to journalists. It sorts confirmed work-related deaths into three types: crossfire/combat, dangerous assignment (protests, riots, clashes, mobs) and murder (targeted killing in direct relation to the journalist's work). Murders are coded by suspected perpetrator: political groups, government officials (including police), military officials, paramilitary groups, criminal groups, mob violence, and local residents inspired by coverage. CPJ also records whether the journalist was threatened at any time beforehand, taken captive just before, or tortured, which are warning-sign fields that came before killings.

Evidence: The page lists the three death categories word for word, the seven perpetrator categories ('Categories include: political groups... local residents'), and 'Threatened: This refers to all forms of threats at any time before a journalist was murdered.' Page updated 2026-02-24. It is one source, but it is the authority on its own database.

Sources: <https://cpj.org/data-terminology/>

## Gaps and caveats

Coverage is very uneven across the four questions. No claims survived verification on: which investigation subjects (e.g. corruption, organised crime, environment) correlate with killings, from RSF, UNESCO, Forbidden Stories or academic studies; SLAPP and spyware evidence (Citizen Lab); UNODC witness-protection guidance; newsroom safety risk-assessment frameworks; the Admiralty Code / NATO source-reliability grading and alternatives (question 3); and training material from GIJN, ICIJ, OCCRP, Bellingcat, the Berkeley Protocol or university courses (question 4). Indicator catalogues for sanctions evasion, hidden/beneficial ownership, document forgery, organised crime in general and cybercrime were also not verified. The absence of verified claims means these were not covered, not that the material does not exist. Time-sensitivity: the Akartuna corpus ends in 2021, so post-2021 FATF work (virtual assets, the 2022 migrant-smuggling report) is missing. The FATF/APG trafficking report is from 2018 and the AUSTRAC list from 2007. Cardinal's count of 10 indicators reflects June 2024, so check readthedocs for the current set. The ILO indicators have a revised 2025 edition, which should be the one cited. The DISARM repo was last committed in February 2025, and its licence is stated inconsistently (the README says CC-BY-4.0, the LICENSE file says CC-BY-SA-4.0), so treat share-alike as the binding terms. The UNODC wildlife brief is undated. The DISINFOX STIX2 mapping is a custom one in a non-peer-reviewed preprint. CPJ's threatened/captive/tortured fields cover confirmed murders only, so they show what came before killings, not how often threats lead to them.

## Open questions

- Which published, verifiable datasets (CPJ, RSF, UNESCO Observatory, Forbidden Stories, Citizen Lab, CASE/SLAPP databases) can be linked to investigation topic, so that the app can turn 'subject X raises risk to journalist/source' into a quantified signal? And which newsroom safety risk-assessment templates (e.g. from CPJ, RSF, IWMF, ACOS Alliance) are free to adapt?
- How exactly is the Admiralty/NATO A-F / 1-6 source-reliability and information-credibility grading defined in current doctrine (e.g. NATO AJP-2.1, UK College of Policing 3x5x2 / 5x5x5), and what grading systems do newsrooms or OSINT groups actually use instead?
- Which free courses and guides (GIJN resource centre, ICIJ/OCCRP training, Bellingcat guides, the Berkeley Protocol, university MOOCs) have licences that allow adapting them into in-app learning guides, and which are kept up to date?
- Is there any structured, machine-readable red-flag catalogue for sanctions evasion, beneficial-ownership concealment, document forgery or cybercrime comparable to OCP's 73 OCDS-mapped indicators or DISARM's STIX bundle, or would the app need to build a unified, de-duplicated indicator schema itself, as Akartuna et al. recommend?

## All sources read

- <https://link.springer.com/10.1007/s11292-024-09623-y> (primary; Crime indicator catalogues and structured data)
- <https://media.springernature.com/original/springer-static/esm/art%3A10.1007%2Fs11292-024-09623-y/MediaObjects/11292_2024_9623_MOESM1_ESM.pdf> (primary; Crime indicator catalogues and structured data)
- <https://www.fatf-gafi.org/en/publications/methodsandtrends/documents/human-trafficking.html> (primary; Crime indicator catalogues and structured data)
- <https://www.ilo.org/publications/ilo-indicators-forced-labour> (primary; Crime indicator catalogues and structured data)
- <https://www.open-contracting.org/2024/06/12/cardinal-an-open-source-library-to-calculate-public-procurement-red-flags/> (primary; Crime indicator catalogues and structured data)
- <https://www.austrac.gov.au/business/how-comply-guidance-and-resources/guidance-resources/typologies-paper-austrac-money-laundering-and-terrorism-financing-indicators> (primary; Crime indicator catalogues and structured data)
- <https://open-contracting.org/wp-content/uploads/2024/12/OCP2024-RedFlagProcurement-1.pdf> (primary; Non-financial indicator frameworks)
- <https://www.disarm.foundation/framework> (primary; Non-financial indicator frameworks)
- <https://publicationethics.org/resources/research/paper-mills-research> (primary; Non-financial indicator frameworks)
- <https://arxiv.org/pdf/2502.20997> (primary; Non-financial indicator frameworks)
- <https://unodc.org/lpomex/es/publicaciones/documentos/crimen/Financial_Flow_Wildlife_Crime.html> (primary; Non-financial indicator frameworks)
- <https://www.elsevier.com/connect/paper-mills-see-the-wood-for-the-trees-part-2> (secondary; Non-financial indicator frameworks)
- <https://cpj.org/data-terminology/> (primary; Journalist and witness danger evidence)
- <https://articles.unesco.org/sites/default/files/medias/fichiers/2024/05/PR_UNESCO-report-reveals-70-environmental-journalists-have-been-attacked-for-their-work_en.pdf> (primary; Journalist and witness danger evidence)
- <https://globalfreedomofexpression.columbia.edu/publications/case-2024-report-on-slapps-in-europe-mapping-trends-and-cases/> (secondary; Journalist and witness danger evidence)
- <https://cpj.org/2018/09/basic-preparedness-risk-assessment/> (primary; Newsroom safety risk assessment and witness protection)
- <https://rorypecktrust.org/wp-content/uploads/2025/04/0342-Rory-Peck-PDF-Risk-Assessment-Security-Protocol-04_240521.pdf> (primary; Newsroom safety risk assessment and witness protection)
- <https://www.unodc.org/documents/middleeastandnorthafrica/organised-crime/Good_Practices_for_the_Protection_of_Witnesses_in_Criminal_Proceedings_Involving_Organized_Crime.pdf> (primary; Newsroom safety risk assessment and witness protection)
- <https://www.acosalliance.org/safety-management> (primary; Newsroom safety risk assessment and witness protection)
- <https://pangearesearch.substack.com/p/the-admiralty-code-nato-6x6-system> (blog; Source reliability grading and investigative training)
- <https://www.blockint.nl/intel-analysis/critical-review-of-the-admiralty-code/> (blog; Source reliability grading and investigative training)
- <https://www.ohchr.org/sites/default/files/2024-01/OHCHR_BerkeleyProtocol.pdf> (primary; Source reliability grading and investigative training)
- <https://gijn.org/academy/> (primary; Source reliability grading and investigative training)

---

# Part 2: grading sources, learning material, danger to journalists (follow-up run, 8 October 2026)

Stats: {"angles": 5, "sourcesFetched": 25, "claimsExtracted": 115, "claimsVerified": 25, "confirmed": 23, "killed": 2, "unverified": 0, "afterSynthesis": 10, "urlDupes": 0, "budgetDropped": 5, "agentCalls": 107}

## Summary

Only part of the question was verified. The 23 claims that survived checking cover the UK College of Policing 3x5x2 intelligence grading, the verification frameworks newsrooms and open-source investigators use (the Verification Handbook, First Draft, the Berkeley Protocol and Bellingcat), and the licences of GIJN, the Verification Handbook and the Berkeley Protocol. 3x5x2 is the current College of Policing standard. It grades the source 1-3 (Reliable, Untested, Not reliable), grades the information A-E by how the source knows it (from first-hand down to suspected false), and adds a P or C handling code. Newsrooms and open-source investigators do not use a letter-number grade like this. They check content against a list of elements: provenance, source, date and location in Wardle's 2014 chapter of the Verification Handbook, with First Draft later adding motivation. First Draft also treated verification as a matter of degree, using a rubric for how 'airtight' a verification is. Of the learning resources, GIJN's Resource Center, Bellingcat's Online Investigations Toolkit and guides, the Verification Handbook and the Berkeley Protocol are all free to read, but none can safely be rewritten into in-app guides without permission. The Verification Handbook is CC BY-NC-ND 4.0, which forbids sharing adapted versions. The Berkeley Protocol is 'All rights reserved' by the United Nations. GIJN says CC BY-NC 4.0 but forbids edits without its approval, and one GIJN page also shows a contradictory CC BY-ND notice. Several parts were not verified at all: the NATO Admiralty Code (A-F / 1-6) under AJP-2.1 or STANAG 2511, the 5x5x5 system beyond its replacement around 2016, the ICIJ, OCCRP and Knight Center courses, and every part of Question C (danger to journalists, SLAPPs, spyware, protecting witnesses, safety templates).

## Findings

**High confidence.** The College of Policing's current standard for grading an intelligence report is 3x5x2: source evaluation (3 grades), information or intelligence assessment (5 grades) and handling codes (2 codes, P or C). It replaced the older 5x5x5 system around 2016, so 5x5x5 should be treated as historical.

Evidence: Primary, current College of Policing guidance (APP page updated 2026-01-13): '3×5×2 ... source evaluation (3), information or intelligence assessment (5), and handling codes (2)'. Unanimous 3-0. The 5x5x5 replacement date comes from a verifier's note, not a separately checked source.

Sources: <https://www.college.police.uk/app/intelligence-management/completing-intelligence-report>

**High confidence.** How 3x5x2 grades the source: 1 = Reliable ('believed to be competent and information received is generally reliable'), 2 = Untested (has not given information to this recipient before; not necessarily unreliable, but treat with caution and corroborate before acting), 3 = Not reliable (reasonable grounds to doubt). A source can be non-human, such as CCTV.

Evidence: Verifiers matched the page wording directly. The CCTV example appears under grade 1 (Reliable).

Sources: <https://www.college.police.uk/app/intelligence-management/completing-intelligence-report>

**High confidence.** How 3x5x2 grades the information: A = known directly to the source (first-hand, e.g. witnessed); B = known indirectly but corroborated by separate, independent intelligence graded A; C = known indirectly (the source was told by someone else); D = not known (no way to assess it, e.g. anonymous sources or Crimestoppers); E = suspected to be false. The app could reuse this as a model, with a source-reliability axis and a separate axis for how the source knows.

Evidence: Matched the primary APP page word for word, including that B needs independent corroboration. 'Hearsay' for C is a paraphrase.

Sources: <https://www.college.police.uk/app/intelligence-management/completing-intelligence-report>

**High confidence.** The original Verification Handbook (European Journalism Centre, ed. Craig Silverman, 2014) checks user-generated content on four elements: provenance (is it the original?), source (who uploaded it?), date and location. Its Chapter 9 checklist gives three steps: identify and verify the original source and content (including location, date and approximate time), triangulate and challenge the source, and get permission from the originator to use the content. The checklist starts by assuming the content is inaccurate or has been taken out of context.

Evidence: Verifiers extracted the PDF text and quotes matched word for word. The four-element framework comes from Claire Wardle's chapter, so it is one chapter's framework rather than the whole handbook's. Later editions (2020, 2024 on DataJournalism.com) cover different ground.

Sources: <https://verificationhandbook.com/downloads/verification.handbook.pdf>

**High confidence.** First Draft's verification framework has five 'pillars': Provenance, Source, Date, Location and Motivation. The same checks apply to eyewitness video, manipulated photos, sockpuppet accounts and memes, and First Draft calls Provenance the most important. It treated verification as collecting corroborating evidence, not a pass/fail result ('hardly ever foolproof'), and published a rubric for visual media that gauges how airtight a verification is. This is the closest thing newsrooms have to a grading scheme.

Evidence: Primary First Draft article (Shaydanay Urbani, 14 Oct 2019), quotes matched. The rubric is published as an image, and its levels were not extracted. First Draft closed in 2022 and its work continues at Brown University's Information Futures Lab, so the app should present this as an archived guide.

Sources: <https://firstdraftnews.org/articles/verifying-online-information-the-absolute-essentials/>

**High confidence.** The Berkeley Protocol on Digital Open Source Investigations was co-published by OHCHR and the Human Rights Center at UC Berkeley School of Law. It launched in December 2020 and the current PDF edition is dated 2022. It sets out minimum professional standards and guidance on methods for finding, collecting, preserving, verifying and analysing digital open-source information in a professional, legal and ethical way, for investigations into international criminal, human rights and humanitarian law. Bellingcat recommends it as a one-stop workflow resource covering ethics, legal issues, security, data collection and analysis.

Evidence: Both publishers' pages and Bellingcat's own article confirm it. It is guidance, not binding law, and it was written for legal and accountability investigations rather than newsroom fact-checking. A more detailed claim about how its verification stage splits into source analysis and content analysis was refuted 0-3, so the app should not repeat that split.

Sources: <https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source> · <https://www.ohchr.org/sites/default/files/2024-01/OHCHR_BerkeleyProtocol.pdf> · <https://www.bellingcat.com/resources/2021/11/09/first-steps-to-getting-started-in-open-source-research/>

**High confidence.** The Berkeley Protocol is not openly licensed. The PDF imprint reads '© 2022 United Nations All rights reserved worldwide' (HR/PUB/20/2), and asks that reproduction requests go to the Copyright Clearance Center and rights queries to Permissions@un.org. The OHCHR landing page shows only a site copyright notice. Adapting it into in-app guides needs UN permission; otherwise the app is limited to short quotation or fair-dealing summaries with citation.

Evidence: Verifiers read the imprint page directly and found no Creative Commons licence. The landing-page footer could not be re-checked because of a Cloudflare block.

Sources: <https://www.ohchr.org/sites/default/files/2024-01/OHCHR_BerkeleyProtocol.pdf> · <https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source>

**High confidence.** The original Verification Handbook is licensed CC BY-NC-ND 4.0. It may be shared unchanged, non-commercially and with credit, but rewritten or adapted in-app guides cannot be distributed without permission.

Evidence: Page 4 of the PDF: 'licensed under a Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License.' This applies to the 2014 edition only; later editions were not checked.

Sources: <https://verificationhandbook.com/downloads/verification.handbook.pdf>

**High confidence.** GIJN's free Resource Center held over a thousand tip sheets, videos and reporting guides in 13 languages as of 2022. GIJN says its articles and guides are 'generally' available under CC BY-NC 4.0 for non-commercial republishing. Republishers must credit GIJN and the author, link to the original, and include the line 'This story was originally published by the Global Investigative Journalism Network.' GIJN does not allow changes without its specific approval, and approved edits must be labelled as edited. Third-party reprints, conference videos and most images are excluded. A per-page notice on at least one guide says CC BY-ND 4.0, which contradicts the BY-NC statement. The app should therefore ask GIJN for permission before adapting any guide.

Evidence: GIJN's own policy pages, checked 2026-10-08. The Resource Center figures are self-reported and dated 2022. A claim that the page is simply CC BY-ND was refuted 1-2 because the page contradicts itself, which shows the licence position is unclear rather than settled.

Sources: <https://gijn.org/use-our-stuff-gijns-republishing-guidelines/> · <https://gijn.org/resource/gijns-reporting-guides-2/>

**High confidence.** Bellingcat's Online Investigations Toolkit (bellingcat.gitbook.io/toolkit, formerly the 'Digital Investigation Toolkit' at bit.ly/bcattools, relaunched in 2024) is a free, regularly updated, categorised directory of tools: satellite imagery and maps, social media, transportation, photo and video verification, archiving and more. Most of the tools listed are free. Entries are designed to include a description, common uses, cost, difficulty, requirements, limitations, ethical considerations and links to guides, so the toolkit works as learning material. It is a tool catalogue, not a verification or grading framework, and inclusion 'does not imply that Bellingcat endorses' a tool. Bellingcat also keeps a free Guides and Resources section of methodology articles.

Evidence: Checked on Bellingcat's live pages (toolkit updated 2026-10-01). Entries are community-contributed, so some lack the full set of fields. The claim about the Guides section passed 2-1; the toolkit claims passed 3-0. The licence of the toolkit and guides was not checked.

Sources: <https://bellingcat.gitbook.io/toolkit> · <https://bellingcat.com/resources/2024/09/24/bellingcat-online-investigations-toolkit> · <https://www.bellingcat.com/resources/2021/11/09/first-steps-to-getting-started-in-open-source-research/>

## Gaps and caveats

Coverage is uneven, and most of the question is unanswered. (1) Not verified at all: the NATO Admiralty Code A-F reliability and 1-6 credibility definitions in current doctrine (AJP-2.1 / STANAG 2511); the 5x5x5 system's details beyond the verifier's note that 3x5x2 replaced it around 2016; the ICIJ, OCCRP and Knight Center courses; and all of Question C, meaning RSF, UNESCO's Observatory of Killed Journalists, CPJ and academic studies on who attacks journalists, CASE coalition and Council of Europe evidence on SLAPPs, Citizen Lab and Amnesty spyware research, UNODC guidance on protecting witnesses, and the CPJ, RSF, IWMF, ACOS Alliance and Rory Peck Trust risk-assessment templates. Nothing in the app should rely on these until they are researched. (2) How current the sources are: the First Draft material dates from 2019 and the organisation closed in 2022. The Verification Handbook findings apply to the 2014 first edition only. The GIJN Resource Center figures are self-reported and from 2022. (3) Licences: GIJN's licence wording contradicts itself (BY-NC policy text versus a BY-ND page notice, plus a no-edits rule), and the licences of Bellingcat's toolkit and guides were never checked. Assume that adapting any of these resources needs permission. (4) Some checks could not be completed. The OHCHR landing page was blocked by Cloudflare, and the Firecrawl search credits ran out, which limited the search for contradicting sources on several claims. (5) Two claims were refuted. The Berkeley Protocol's verification stage splitting into 'source analysis / content analysis' (0-3) should not be used. The claim that the GIJN page is simply CC BY-ND (1-2) was too simple.

## Open questions

- What exact wording do NATO AJP-2.1 and STANAG 2511 give for the Admiralty Code grades (A-F reliability, 1-6 credibility), and is that doctrine publicly available to cite?
- Which investigation subjects and actors (organised crime, corruption, armed conflict, state actors) are most linked to journalist killings and threats in RSF, UNESCO and CPJ data, and what do the CASE coalition and Council of Europe report on SLAPPs?
- What licences apply to the free safety risk-assessment templates from CPJ, RSF, IWMF, ACOS Alliance and Rory Peck Trust, and to the training from ICIJ, OCCRP, the Knight Center and Bellingcat, and could any be adapted into in-app guides?
- Will GIJN, EJC/DataJournalism.com or UN Publications grant permission to adapt their guides, and which licence actually governs GIJN's Resource Center guides, given the conflicting BY-NC and BY-ND notices?

## All sources read

- <https://www.college.police.uk/app/intelligence-management/completing-intelligence-report> (primary; Doctrine: Admiralty Code and UK police grading)
- <https://en.wikipedia.org/wiki/Admiralty_code> (secondary; Doctrine: Admiralty Code and UK police grading)
- <https://www.intelligencewithsteve.com/post/the-5-minute-guide-to-the-intelligence-grading-process-and-its-application-in-osint> (unreliable; Doctrine: Admiralty Code and UK police grading)
- <https://production.copweb.aws.college.police.uk/app/information-management/management-police-information/evaluation/changes> (primary; Doctrine: Admiralty Code and UK police grading)
- <https://www.sans.org/blog/enhance-your-cyber-threat-intelligence-with-the-admiralty-system> (secondary; Doctrine: Admiralty Code and UK police grading)
- <https://pangearesearch.substack.com/p/the-admiralty-code-nato-6x6-system> (blog; Doctrine: Admiralty Code and UK police grading)
- <https://www.ohchr.org/sites/default/files/2024-01/OHCHR_BerkeleyProtocol.pdf> (primary; Newsroom and OSINT verification frameworks)
- <https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source> (primary; Newsroom and OSINT verification frameworks)
- <https://verificationhandbook.com/downloads/verification.handbook.pdf> (primary; Newsroom and OSINT verification frameworks)
- <https://firstdraftnews.org/articles/verifying-online-information-the-absolute-essentials/> (primary; Newsroom and OSINT verification frameworks)
- <https://bellingcat.gitbook.io/toolkit> (primary; Newsroom and OSINT verification frameworks)
- <https://www.bellingcat.com/resources/2021/11/09/first-steps-to-getting-started-in-open-source-research/> (primary; Newsroom and OSINT verification frameworks)
- <https://gijn.org/use-our-stuff-gijns-republishing-guidelines/> (primary; Free training, publishers and licences)
- <https://gijn.org/resource/gijns-reporting-guides-2/> (primary; Free training, publishers and licences)
- <https://bellingcat.com/resources/2024/09/24/bellingcat-online-investigations-toolkit> (primary; Free training, publishers and licences)
- <https://humanrights.berkeley.edu/programs/investigations/berkeley-protocol> (primary; Free training, publishers and licences)
- <https://www.occrp.org/en/news/over-30-journalists-murdered-by-organized-crime-since-2017-rsf> (secondary; Who and what endangers journalists: killings, SLAPPs and spyware)
- <https://cpj.org/reports/2016/10/impunity-index-getting-away-with-murder-killed-justice/> (primary; Who and what endangers journalists: killings, SLAPPs and spyware)
- <https://globalfreedomofexpression.columbia.edu/publications/case-2025-report-on-slapps-in-europe> (secondary; Who and what endangers journalists: killings, SLAPPs and spyware)
- <https://www.article19.org/resources/europe-increasingly-hostile-environment-for-journalists/> (secondary; Who and what endangers journalists: killings, SLAPPs and spyware)
- <https://www.occrp.org/en/project/the-pegasus-project/israeli-made-spyware-used-to-monitor-journalists-and-activists-worldwide> (secondary; Who and what endangers journalists: killings, SLAPPs and spyware)
- <https://www.unodc.org/documents/organized-crime/Witness-protection-manual-Feb08.pdf> (primary; Witness protection and safety risk-assessment templates)
- <https://cpj.org/2018/09/basic-preparedness-risk-assessment/amp/> (primary; Witness protection and safety risk-assessment templates)
- <https://www.acosalliance.org/safetychecklist> (primary; Witness protection and safety risk-assessment templates)
- <https://rorypecktrust.org/get-help/safety/risk-assessment/getting-started-and-security-protocol/> (primary; Witness protection and safety risk-assessment templates)
