# Data Source and Quality Policy

*Part of Quantitative Analysis System (QAS).*

## 1. Purpose

This policy governs how far a dataset can be relied on for the question in
the QFRM record. It exists to prevent two failures: taking a dataset's
quality from the name of the body that published it, and using a dataset for
a question it does not fit. Module 02 records where a dataset came from and
every change made to it; this policy decides how much weight the dataset can
carry, and the QDAT record's `assurance` block holds the result
(`EVALUATION/OUTPUT_SCHEMAS.md`).

Rules are numbered through the whole policy and cited as "Policy rule n".
Each ends with the `SOURCE_INDEX.md` id it rests on, or "(logic)",
"(design)" or "(Standard §n)" as Standard §8 defines them.

## 2. Reliance is question-specific

1. Judge reliance for the question in the QFRM record, not for the dataset in
   general: the same file can be fit for one question and unfit for another
   (logic). A statistician communicates a source's fitness for use, with how
   the data were generated and collected and its known biases. (QS-36)

## 3. The producer and the assurance behind it

2. Record how the data were collected: SURVEY (a sample or census of people
   or units asked or measured for statistical purposes), ADMINISTRATIVE (a
   by-product of a system run for operational purposes, QS-31), FOUND (data
   gathered by a platform, vendor or scrape for some other purpose; this
   category is this system's own), or OTHER with a description. Record
   separately whether the data are published as official statistics.
   (design)
3. For official statistics, record the code of practice the producer works
   under, the status the producer or its regulator publishes for this
   dataset, and the date that status was checked. A code states principles,
   not a measured quality: the UK code rests on trustworthiness, quality and
   value (QS-25); the European code's output principles are relevance,
   accuracy and reliability, timeliness and punctuality, coherence and
   comparability, and accessibility and clarity (QS-28); the IMF framework
   treats institutional prerequisites as pointers to quality, apart from
   accuracy and reliability (QS-29, as relayed); the National Academies'
   principles for a federal statistical agency require credibility with data
   users and rest an agency's value on the accuracy of its data products
   (QS-27). Record in `official_statistics.principles_relied_on` which of
   these the question depends on, and what the producer publishes about it.
   (QS-25, QS-27, QS-28, QS-29)
4. Check the status at the time of use. Accreditation can be removed: the UK
   statistics regulator removed it from Labour Force Survey estimates in
   November 2023, after response rates had been declining (QS-37). A status
   recorded earlier, or the producer's standing, does not stand in for the
   status on the date of use. (QS-37)
5. For administrative data, record the operational purpose and the system
   the data come from, and the problems such systems carry: collection
   applied unevenly, suppliers' procedures differing, and the number of
   suppliers (QS-31). Where the producer publishes an assurance level for
   statistics built on the data, record it; the UK regulator's levels run
   from A0 (no assurance) through A1 basic and A2 enhanced to A3
   comprehensive, set from the risk of quality concerns and the public
   interest the statistics serve (QS-26). (QS-26, QS-31)
6. Do not assign an assurance level the producer has not published. Record
   the risk factors found under Policy rule 5 instead. (design)
7. For survey data, record the error sources besides sampling: specification,
   frame or coverage, nonresponse, measurement and processing (QS-30); and the
   response rate, with its trend where published (QS-37). (QS-30, QS-37)
8. An interval computed from sampling variation does not include the other
   error sources in Policy rule 7. State, beside the interval, which sources
   it covers. (logic)
9. For found data, record what the data were collected for, and who is in
   them and who is not, against the QFRM target population. Size does not
   cure coverage: undercoverage distorts the population a large source
   represents, missing data in such sources are often confounded with
   undercoverage, and size can give false confidence in the accuracy of
   estimates (QS-32). Record how records were linked to any other source and
   how many linked (logic); in one published case study a vendor's records
   did not standardise addresses (QS-32).
10. A producer's reputation does not settle a dataset's quality. Record each
    known quality event for the dataset (a withdrawn status, a correction, a
    discontinuation, reported irregularities) and the period it affects. A
    major international producer discontinued a flagship report after data
    irregularities in two editions were reported (QS-38); accredited labour
    statistics lost their accreditation (QS-37). (QS-37, QS-38)
11. Record whether the body that produced the data, or whose work the data
    measure, has a stake in what the data show (an agency reporting its own
    performance). (logic)

## 4. Documentation

12. Answer, from the dataset's own documentation, the questions a datasheet
    asks under its seven headings (motivation; composition; collection
    process; preprocessing, cleaning and labelling; uses; distribution;
    maintenance), among them how the data for each instance were acquired,
    whether there are errors, sources of noise or redundancies, and whether
    there are tasks the dataset should not be used for. (QS-34)
13. Write "not documented" for a question the documentation does not answer.
    An unanswered question is a limit reported beside the result, not a gap
    filled by assumption. (logic)
14. Answers describe a dataset; they do not make it fit. The datasheet
    questions are offered as not prescriptive and not a complete solution
    (QS-34). Fitness is judged under section 5. (QS-34)
15. Before relying on a dataset, ask how it was collected and how reliable it
    is, and check a figure that looks wrong against an independent source.
    Where another dataset measures the same quantity by a different
    collection (a victimisation survey beside police-recorded crime), compare
    the two and record the difference. (QS-33; the independent check and the
    comparison as relayed)
16. Record the release or version used (the vintage) and its date. Figures
    published under a revisions policy (QS-29) can change after use; the
    vintage lets the result be re-run as it was. (QS-29; logic)

## 5. Fitness for the question

17. Compare the dataset with the QFRM record and record, for each item
    below, MATCH, MISMATCH, or UNKNOWN where the documentation does not
    answer: concept (whether the variable measures what the question
    names; a gap here is specification error, QS-30); coverage against the
    target population; period; unit of analysis; and the quality the
    question needs most. That quality is one of the European code's output
    dimensions after relevance: accuracy and reliability, timeliness and
    punctuality, coherence and comparability, or accessibility and clarity
    (QS-28). It is chosen from the QFRM answer form: timeliness for a current
    level, coherence and comparability for a trend or a comparison across
    places or groups, and otherwise accuracy and reliability, unless the
    record names another dimension with its reason (logic). (QS-28, QS-30)
18. Give each dataset one reliance level for the question, with reasons:
    RELY (every item of Policy rule 17 is MATCH, the documentation answers
    the questions the result depends on, and no known quality event covers
    the period used); RELY_WITH_LIMITS (usable, with each named limit stated
    beside every result that uses the dataset; an item recorded UNKNOWN is
    such a limit and excludes RELY); DO_NOT_RELY (the concept does not
    match, a quality event covers the period used, or no bound on the share
    of the target population a coverage gap leaves out can be stated from
    the documentation or an independent source). Where a quality event
    covers only part of the period used, judge each part on its own: the
    part it covers is DO_NOT_RELY and the rest takes its own level, each
    recorded in `reliance_by_period`. A correction already applied in the
    vintage used is a limit, not a ground for DO_NOT_RELY. A reliance level
    is a stated judgement, not a likelihood term, and carries no band.
    (design)
19. A dataset marked DO_NOT_RELY supports no central claim (Standard §9). A
    result from it is reported with its DO_NOT_RELY reason beside it. The
    word "exploratory" keeps the meaning Standard §2 principle 4 gives it.
    (design)
20. Report with the results each dataset's source, how it was collected, its
    known biases and how missing data were handled (QS-36), with its reliance
    level and limits (design); Module 05 rule 14 puts them beside each result.

## 6. Conflicting datasets

21. When two datasets measuring the same quantity disagree, keep both
    results, record each one's `assurance` block, link the two through
    `assurance.conflicts_with`, and explain the difference by how each was
    collected (QS-33, as relayed). When the two blocks show no difference in
    collection that accounts for the gap, record the difference as
    unexplained (logic). Do not average them or keep only the convenient
    one. (QS-33; logic)

## 7. Quality search log

22. Record in `assurance.quality_search` where quality information was
    looked for (the producer's quality or methods report, the regulator's
    status page, corrections and revisions notices) and what was found. "No
    quality event found" means none was found in the places recorded, not
    that none exists. (logic)

## 8. Material received from earlier work

23. A dataset or record received with a status given by the work that
    established it keeps that status in `assurance.upstream_status`: one
    entry per status, naming the system and the record that gave it and the
    status spelled as that system spells it, so that no reader has to guess
    which system issued a value. The hand-off rules are in Standard §10.
    (Standard §10; design)
