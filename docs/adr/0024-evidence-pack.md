# ADR-0024: The evidence pack

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instruction to work through the task list (mockup ACT_2's Export sheet, where the pack
was shown as not built; research §11 "Exports").

## Context

An editor, a lawyer or a partner needs a file that stands on its own: the story, its sources, and proof the sources
were kept intact. The research (§11) lists what goes in: the write-up, an exhibits list from its citations, each cited
passage with its page and the fingerprint of its file, the chain of custody of each claim, the readiness record, the
gaps, and the limit of what fingerprints prove. Two questions stay open for Ony there: a PDF renderer (its own ADR)
and whether packs are signed with a local key.

## Decision

- `GET /investigations/{id}/evidence-pack.zip` (`app/services/evidence_pack.py`) makes the pack on this computer from
  the story's write-up. Nothing is sent anywhere.
- **Inside:** `index.html` (the write-up, each citation a link to its exhibits; a page any browser opens, light paper),
  `writeup.docx` (the existing export), `exhibits.csv` and `exhibits/NNN/` (one exhibit per piece of evidence the text
  rests on, numbered in the order the text first cites it; a cited claim brings the evidence linked to it, for and
  against: the quote, where, the source and its address, the file, the SHA-256 recorded when it was added, the
  fingerprint checked again now, when it was added, the Is it real? status a person set, the claims it is cited for,
  the passage, and a picture of its page), `custody/` (each cited claim's chain of custody and Done rules),
  `readiness.json` (the gates, who decided, when), `gaps.txt` (citations whose record is gone, files that changed or
  are missing), `README.txt` with the limit, `MANIFEST.sha256` and `VERIFY.txt`.
- **Original files are not included**; their fingerprints are. A picture is shown as a **viewing copy** drawn again
  with its metadata removed (no EXIF, XMP, GPS, camera serial or content credentials), so a pack never carries where a
  photo was taken by accident. A **source-protected** item (ADR-0023) is not pictured at all.
- **Checks before an outward export** (every sentence has a source, single-source statements, innocent explanations,
  right of reply, legal read) never stop the pack: while one is open the pack is stamped "Export as draft" on every
  page and in its name, and the Export sheet's button says so.
- **No PDF yet and no signature.** The write-up goes as HTML and .docx until the PDF renderer is decided; the manifest
  shows the pack is whole, not who made it, until Ony decides on signing and who keeps the key.

## Consequences

- A reader can check every sentence: citation → exhibit → page → fingerprint, and the manifest checks the pack.
- A large case makes a large pack in one request; progress steps can come later if packs grow slow.

## Later (29 Oct 2026)

The pack is also a PDF and its list is signed (DECISIONS_LOG 3): `evidence-pack.pdf`, `MANIFEST.sha256.sig` and
`PUBLIC_KEY.pem`. Each pack made is recorded (`evidence_packs`) so Check a pack can compare one sent back with the
list made here.
