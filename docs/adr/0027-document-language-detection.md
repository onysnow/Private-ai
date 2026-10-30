# ADR-0027: A document's language, detected on this computer

**Status:** Accepted (2026-10-30)
**Deciders:** Claude, on Ony's instruction (CLAUDE.md, 29 Oct) to decide open questions on what is best for the app and
log them. The question: BACKLOG "Documents have no kind or language field", and MOCKUP_BUILD_LIST INTAKE_2 ("Language
not detected … the app's own reader detects none, and a detector of its own would be a new package and needs an ADR").

## Context

A document's language is known today only when OpenAleph read it (its `detectedLanguage`, kept on the proposals'
provenance) or when a recording was transcribed (faster-whisper detects the language it hears). A file read by the
Workbench's own reader (PDF, DOCX, text, HTML, OCR) has none, so the reading room's chip says "Language not detected"
for most of a case on a computer without OpenAleph. A reporter sorting foreign-language judgments, or choosing what to
translate, needs it, and the OCR and the name-finder are language-dependent.

Options checked (30 Oct 2026, licences from each package's metadata):

| Package | Licence | Size | Notes |
| --- | --- | --- | --- |
| **py3langid 0.4.0** | BSD-3-Clause | 4.5 MB wheel, needs numpy only | langid.py's model (140 labels, 114 of them with a two-letter code) as a compressed numpy file, loaded without pickle; deterministic; 0.8 s to load, milliseconds per document |
| langdetect | Apache-2.0 | 1 MB | random unless seeded; slow on long text |
| lingua-language-detector | Apache-2.0 | about 100 MB of models | most accurate on short text; far larger than needed for whole documents |
| fastText lid.176 | MIT code, CC-BY-SA-3.0 model | 126 MB (or 917 kB compressed, less accurate) | needs the fasttext build; share-alike model |

## Decision

- **py3langid 0.4.0** detects the language of a document's text after it is read (`app/services/document_facts.py`),
  restricted to the languages with a two-letter ISO 639-1 code (the model's few others are dialects and historical
  languages a case's text is likelier to be mistaken for). A guess under 80 % sure, or text with fewer than 40
  letters, is not kept: the document's language stays not known. The first 20,000 characters are read.
- It runs on this computer only, and nothing is sent anywhere.
- **What wins.** A person's value is never replaced. What the source's record states is not replaced by a detection.
  Detections replace each other in the order they come: OpenAleph's (when it analyses the document) and
  faster-whisper's (for a recording) come after the app's own and replace it.
- Each value keeps how it was set (`reader`, `source`, `detected`, `person`), who or what set it (the tool, or the
  person's name) and, for a detection, how sure the tool was.
- Without the package installed, no language is detected and nothing else changes (a warning in the log).

## Consequences

- New package: `py3langid==0.4.0` (BSD-3-Clause; numpy, already pinned). About 4.5 MB.
- Documents already in a case get their language detected once, in migration `a8d2f6c4e913`.
- Not done: a language per page or passage (a document in two languages gets the one most of its text is in;
  OpenAleph's list of every language it found is still shown beside it in the reading room).
