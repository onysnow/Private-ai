# ADR-0023: Is it real? (findings, then a person decides)

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instruction to continue the build order (source intake Phase 4), within the calls in
`docs/research/source-intake/DECISIONS.md` (6: detectors local only, image detectors off by default, outside checks by
hand with consent; 7: the suite shows DISPUTED until it has a synthetic value; 8: evidence of events vs the subject of
the story; 9: app tables first; 10: permissive licences).

## Context

Mockup CHECK_3 and the research (`SOURCE_INTAKE_RESEARCH.md` §9) ask the app to keep AI-made material from being used
as a source without making a machine the judge. Off-the-shelf detectors score about chance on real social-media
content and image detectors collapse on recompressed files (§9.1); content credentials prove who signed, not what is
real, and their absence proves nothing (§9.6). The suite's `Evidence.authenticity_status` has no value for synthetic.

## Decision

- **Tables** (app tables first): `authenticity_items`, one per case file (status, role, source-protected, who decided,
  when, what they checked, why, the platform's own label, the latest findings, the evidence records about the item
  itself, and each evidence record's suite value from before a synthetic decision), and `authenticity_checks`, the append-only history: every finding and every
  decision, consent and setting, with method, tool, version, the input's SHA-256, whether it was local, the details
  and the line as shown. Both travel in a case backup and go with the case.
- **Four layers, then a person** (research §9.2), recorded the first time the screen opens and again only when asked:
  1. *Provenance.* Content credentials are validated on this computer with **c2pa-python 0.38.0** (MIT OR Apache-2.0,
     the C2PA's own library) against the C2PA trust list bundled in `backend/app/trust/c2pa/` (CC BY 4.0, address,
     date and SHA-256 in its `SOURCE.md`). Remote manifests are not fetched. States: trusted, valid (signer not on the
     list), invalid, absent; the signer, the signing time and the IPTC digital source type. The file's XMP is read
     for a digital source type too. An AI source type raises a **review flag** that blocks nothing.
  2. *Source.* What the case already holds: the byline as the page displayed it and how many of the case's items carry
     it, the earliest copy with the same fingerprint. Account or domain age, ownership and content-farm lists are not
     looked up on their own; the rows say "not looked up" and "no list imported".
  3. *Hints.* No detector is installed. Images: off by default. Text under 300 words: suppressed, with why. A hint
     would never set a status (§9.3).
  4. *A person decides.* Verified origin, unverified (the default), likely synthetic, confirmed synthetic or disputed.
     A decision needs at least one thing ticked as checked and a written reason, and a different status from the one
     it has. Every decision is a history line; any status can be decided again.
- **Propagation.** Evidence from a file marked likely or confirmed synthetic is **evidence of events** unless it was
  added as **about the item itself**: evidence of events supports no claim (the Done rules,
  `app/services/claim_done.py`, leave it out, and a claim with nothing else says "Supported only by a synthetic
  source"); records restating it inherit that. Evidence about the item (that it circulated, when, posted by whom)
  keeps its support (call 8). Marking the item **the subject of the story** offers such a claim, written for the
  person to edit. The screen previews what a status would do to each claim before it is recorded.
- **The suite.** While an item is marked synthetic, its evidence of events shows the suite `DISPUTED`; their earlier values are kept and put back when the decision or the role changes (call 7). Which tier a
  synthetic item lands in stays the suite's call.
- **Outside checks** (call 6). Comparing with the case's own files runs here (a 64-bit difference hash for pictures,
  sentences of eight words or more word for word for text). A reverse-image search by the item's **public address**
  (TinEye, Google Lens) or a web search for two sentences is offered with exactly what would be sent, allowed once,
  written to the outbound log, and opened in the person's browser; the app sends nothing itself. Uploading the file
  and cloud detectors are shown and not offered, because no such service is set up. A **source-protected** item sends
  nothing; an attempt is logged as blocked.

## Consequences

- A synthetic decision changes what claims can rest on, so the Done rules read `authenticity_items`; a case with none
  is unchanged.
- The trust list ages. Updating it is replacing the two files and their line in `SOURCE.md`; the date of the list used
  is kept with each finding.
- For Ony, in the suite: a synthetic authenticity value (or an answer that DISPUTED is enough), and the research §9 as
  input to the suite's open item on detecting AI-generated sources.
