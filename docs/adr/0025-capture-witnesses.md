# ADR-0025: A capture's outside witnesses (time proof, second witness, a copy elsewhere)

**Status:** Accepted (2026-10-29)
**Deciders:** Claude, on Ony's instruction to keep working through the build list, within the calls already made in
`docs/research/source-intake/DECISIONS.md` (call 2: a third-party archive as an optional second witness, off by default,
per capture, offered after the local capture is saved, blocked for source-protected items, logged; "snapshot signing":
an RFC 3161 time proof that sends only the hash, off by default, per capture). Mockup INTAKE_3 and its state "saved
with outside services on".

## Context

A capture made here (ADR-0018) proves what this computer's clock and files say, and nothing more. Two things make it
stronger to an editor or a court: an independent clock that signed its fingerprint at the time, and a second copy that
someone else made. A page that could not be kept may still have been kept by a public archive. ADR-0018 left all three
as "a later step"; INTAKE_3 draws them as two switches under "What leaves this computer", "Ask a time server…" on the
receipt, and "Look for a copy elsewhere… (asks first)" on a link only. Trace on the receipt opens the provenance of the
capture's document, as Trace does elsewhere.

## Decision

- **Time proof (RFC 3161).** The SHA-256 of the capture's WARC (the fingerprint on the receipt) goes to a time server
  in a time-stamp request (SHA-256, a fresh nonce, the server's certificate asked for). Only the fingerprint is sent.
  The token is kept beside the capture's files as `timestamp.tsr`, hashed and listed like them, so it travels in a
  backup and downloads from the receipt; the WARC is not touched. The token is checked here with **rfc3161-client
  1.0.9** (Trail of Bits, Apache-2.0): the signature, the certificate chain to a root bundled in `backend/app/trust/tsa/`
  (address, date and SHA-256 in its SOURCE.md), that it signs this fingerprint, and that it answers this request. A
  token that signs other bytes or another request is refused and not kept. A server with no bundled root still stamps;
  the receipt says "not checked here". Default server: FreeTSA (`https://freetsa.org/tsr`); the Sigstore time server's
  root is bundled too. Setting: `CAPTURE_TIME_SERVER`. A proof asked for after the capture proves only that the kept
  file existed by the time it signs, and the receipt says so with how long after.
- **Second witness.** The page's address goes to the Internet Archive's Save Page Now, which visits the page itself and
  keeps its own copy; the address of that copy and its time are kept on the capture. What the archive kept is the
  archive's, not evidence kept here.
- **Look for a copy elsewhere** (a link only or a page not seen). The address goes to the Internet Archive's lookup,
  which says whether it holds a copy and from when. "Capture that copy" captures the archive's page like any other
  link, as a new capture.
- **Asking.** Each is asked for by a person on one capture: the two switches apply to the next capture only and are
  run once its page is kept; the receipt and the link only ask for an existing capture, after saying exactly what goes
  and where. Each request is written to the outbound log before it goes, and marked failed if it fails. A
  source-protected capture sends nothing; the attempt is logged as blocked. A failure is one of the app's own sentences,
  never a library's error text, and leaves the capture as it was.
- **Route.** Through the capture guard (public addresses only), from this computer's own connection.
- **Data.** `captures.witnesses` (JSON): `time_proof`, `archive`, `elsewhere`, and `asked` (the switches a capture was
  started with).

## Consequences

- New package: `rfc3161-client` (Apache-2.0; its only dependency, `cryptography`, was already installed).
- The roots age. Updating one is replacing its file and its line in `SOURCE.md`.
- The archive learns that someone is looking at the page; the screen says so before it is asked.
- Not done: signing a capture with a local key (waits on the app lock's key handling, ADR-0016); other archives
  (archive.today has no API to ask); a time proof for the evidence pack as a whole.
