# Demo cases: what they hold and what is still missing (11 Oct 2026)

Ony: "how the hell are we supposed to test everything if we don't HAVE everything?" His decisions:
- copyrighted material (news, press photos, video, podcast) is fetched at load and never stored in the repo;
- emails are rebuilt word for word from the filings and labelled as rebuilt;
- rules 1MDB can't trigger get small real cases.

## 1MDB (backend/app/demo/one_mdb: documents.json + more.json + files/)
- **Documents:** 104 in all (11 core + 93 more).
  - 21 photos as picture evidence with dates (the Equanimity in 2014 vs 2018 gives a before/after pair).
  - 1 video and the WNYC podcast.
  - 19 articles, 6 of them contradicting the official account; 6 social posts (sources only).
  - Judgments: Malaysian (some scanned, one in Malay), Swiss (French and German), Singapore.
  - 15 rebuilt emails plus an .mbox thread and a .zip; a .docx; the payments table as CSV and XLSX.
  - 60 registry and Wikipedia pages cited by party values, kept as links.
- **Records:**
  - 84 payments in 6 currencies (USD 47, MYR 12, SGD 9, GBP 8, CHF 5, EUR 3).
  - 21 places with coordinates.
  - Claims: 21 confirmed, 10 rejected, 9 disputed, plus graded ones.
  - Evidence stances: 54 contradicting on claims and 18 on links; 3 superseded on links.
  - 97 events, including ranges, month and year dates, and disputed dates.
  - Party data: 17 LEIs, 24 registration numbers, 7 PEPs, red notices, birth dates for public figures, the yacht's IMO and MMSI numbers.
  - Merge candidates: Najib vs "Malaysian Official 1", TIA vs 1MDB, account 9694 vs AMPRIVATE-MR.
- **Red flags:** 37 (BO-033 ×31, BO-031 ×4, ML-023 ×2).
- **Research behind it:** docs/research/demo-data/ (parties.json, records.json and the manifests).

## Small real cases (backend/app/demo/<id>, services/demo_cases.py, Settings → demo cases)
- **us-v-anise-structuring** (D.N.J. indictment): 144 cash deposits. Raises ML-021.
- **vekselberg-shell-network** (SDNY complaint, Tango affidavit, OFAC Federal Register notice):
  - six-layer chains raise BO-002 (strong and faint);
  - a shared Isle of Man address raises BO-032;
  - payments in USD and EUR.
- **deripaska-en-rusal** (OFAC notice, Treasury letter to Congress): sanctions, PEPs and ownership percentages.
  - BO-032 for the Jersey address written two ways and a Moscow address written three ways.
- **jardine-cross-holding** (Supreme Court of Bermuda judgment, 12 Nov 2021):
  - Jardine Matheson owns about 84.9% of Jardine Strategic, which owns 59.3% back;
  - raises BO-001.

## Still not covered
- **File formats:** email, .mbox, .zip, video, audio and .xlsx are read only through OpenAleph. Without it, 20 documents end as "failed"; the email headers are pre-filled on each source.
- **Media analysis:** none yet (see docs/research/media-suite/).
- **Downloads:**
  - MAS blocks automated downloads, so its pages are links only;
  - Singapore eLitigation PDFs change on every download, so they are recorded by fingerprint.
- **Red flags:** BO-031 and ML-023 fire only on 1MDB.

## App findings
- **Fixed:**
  - a scanned page with a filing stamp is OCR'd;
  - a flag summary no longer doubles the full stop after "S.A.";
  - BO-032 matches an address written two ways;
  - one demo loads at a time, and a failed load is cleaned up.
- **Open:**
  - BO-033 raises one flag per payment (144 on Anise);
  - documents have no kind or language field;
  - claim evidence can't be "superseded";
  - payments can't be typed as a fine, judgment debt or agreed price.
