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
