# Tutorial notes (11 Oct 2026)

The tutorial will be built on top of the 1MDB demo investigation. Ony doesn't want a whole demo
case for one indicator ("that's not good design"), so a red flag that 1MDB can't raise is kept
here, ready for the tutorial to show, not loaded as its own case.

## BO-001 · Ownership loop (Jardine cross-holding)
- **What it shows:** two companies that own each other. 1MDB has no loop.
- **The record:** Supreme Court of Bermuda, *In the Matter of Jardine Strategic Holdings
  Limited*, 2021 Nos. 107-126, judgment of Hargun CJ, 12 Nov 2021 (37 pages, sha256
  `994d28fa…81c1`), published on gov.bm. The address, hash and size are in
  `tutorial/bo-001-jardine/documents.json`.
- **The loop, quoted exactly:**
  - page 3, para. 3: "Prior to the Amalgamation, amongst other interests in the Group, Jardine
    Matheson held, indirectly, approximately 84.9% of the shares in the Company." ("the Company"
    is Jardine Strategic Holdings Limited, page 2, para. 1.)
  - page 3, para. 5: "The Group's structure included a cross-holding structure between the two
    listed companies. The Company owned, directly and indirectly, 59.3% of the shares in Jardine
    Matheson."
- **Around it:** Jardine Strategic's stakes in Hong Kong Land (50.4%), Dairy Farm (77.6%),
  Mandarin Oriental (79.5%) and Jardine Cycle & Carriage (75%); four dated events (8 Mar 2021
  plan, 12 Apr vote, 14 Apr amalgamation, 12 Nov judgment); claims and two leads.
- **Files:** `tutorial/bo-001-jardine/case.json` (all records with their quotes, in the demo-case
  format, so it can be loaded again if wanted), `documents.json`, and `page-text.json` (the
  judgment's page text, formerly the test fixture).
- **Checked when it was a case:** loaded, the engine raised exactly one BO-001 naming both
  companies and nothing else.

## Still a case (Settings → demo cases)
Anise (ML-021), Vekselberg (BO-002, BO-032) and Deripaska (BO-032). Ony chose to remove only
Jardine.
