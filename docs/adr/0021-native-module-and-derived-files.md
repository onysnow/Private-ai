# ADR-0021: The ArtCraft apps' code in the Workbench, and files made from case files

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instructions: build the media suite from the craft repos' code ("we are using their
code", not their apps); evidence files are never overwritten, with an edit trail; non-evidence files may be.

## Context

`docs/research/media-suite/CRAFT_REPOS.md` maps the 22 onysnow craft repos (forks of the ArtCraft apps, MIT OR
Apache-2.0) against the media suite's build items. Built and tried on real files on 28 Oct, these worked: PdfCraft's
redaction (the words are gone from the text and the file's bytes), hidden-data removal, compare, PDF/A check and signing;
FilmCraft's clip sync (1.2340 s found for a 1.234 s offset), hum and noise removal and loudness; LightCraft's RAW
previews (Canon CR2, iPhone DNG), metadata (camera, serial, lens, capture time, GPS), HEIC decoding and the YuNet face
detector. The Workbench also refused HEIC and every camera RAW format, and read no photo metadata at all.

## Decision

- **One native module, built from the forks' code.** `backend/native` is a Rust crate compiled into one Python
  extension, `workbench_native`, with three parts: `audio` (FilmCraft `audio-dsp`), `photo` (LightCraft `meta`, `raw`,
  `heif`, `faces`) and `pdf` (PdfCraft `automation`). The crates come from Ony's forks as source dependencies pinned to
  a commit (`backend/native/Cargo.toml`); nothing calls the ArtCraft apps, and nothing carries their names or brand
  files. PdfCraft's own fixed copies of hayro and lopdf are named again in the module's `[patch.crates-io]`.
  `backend/native/NOTICE.md` records what is used and its licences.
- **Only what the Workbench may do is exposed.** LightCraft's face code also matches faces against named people; only
  the YuNet *detector* is exposed (media research §4.5).
- **Evidence files are never written over.** Whatever is made from a case file is a new file under
  `<storage>/<case>/derived/<document>/`, named by its SHA-256, with a `derived_files` row: the edit trail. Each row
  holds the exact bytes it was made from (`parent_sha256`, and `parent_id` when made from another derived file), its own
  SHA-256, the operation and every setting, the code (tool and commit) and any model with its SHA-256, who asked, when
  and the job. `write_derived` holds the case lock, rechecks that the case is still there, and refuses a path that is
  the case file's own. A PDF job opens a *copy* of the evidence in its own folder, the only folder its tools may
  touch; in that session every file it started with or opened is protected: a save or `out` naming one is refused,
  and after any tool that can write, each is checked unchanged (else the call is an error and its result unused).
  Non-evidence files (drafts, write-ups, decks) keep being edited in place as today.
- **HEIC and camera RAW photos** (`.heic .heif .dng .cr2 .cr3 .nef .nrw .arw .raf .rw2 .pef .orf`, up to
  `MAX_MEDIA_BYTES`) are accepted and kept as they came. The reading job makes a viewable JPEG (a derived file,
  operation `preview`): for RAW, the camera's own embedded preview, turned the way the file says; for HEIC, the picture
  decoded, both carrying the photo's colour profile. The app shows that copy wherever it shows a JPEG (the documents
  list's picture view, picture evidence, exports; the reading view's Original tab shows only PDFs, for JPEGs too) and
  reads text in it with the existing OCR; the original is what is hashed, exported and backed up. No person asks for
  this copy: its trail row says it was made by the Workbench while reading the file, with the job.
  Like recordings (ADR-0020), these are read here whichever reader reads the rest: OpenAleph reads neither format,
  so they are the second exception to ADR-0006's "the Workbench reads nothing OpenAleph cannot".
- **What a photo claims about itself** is kept for every photo, JPEG and PNG included, in `document_photos`: camera,
  serial, software, lens, capture time, GPS, orientation, and `date_tag`, the tag the time came from ("Date/Time
  Modified" alone is weaker than "Date/Time Original"; the tag is the one whose value is the time read, not merely one
  that is present). These are claims, never findings; showing them and turning them
  into proposals (a Place from GPS, a date) waits for its mockup.
- **Built at setup.** The Docker image builds the module in its own stage and installs only the wheel. CI builds it for
  the tests. The Windows setup scripts build it when Rust is installed (https://rustup.rs, which also installs the
  Microsoft C++ build tools Rust needs). The launcher checks for the module on every start, so installing Rust later and
  launching again builds it; a failed build is not retried until "Repair developer setup" is run. Without the module
  the app runs, and a HEIC or RAW photo fails its read saying what to run.

## Consequences

- New tables `derived_files` and `document_photos`; both travel in a backup with the derived files themselves (checked
  against the SHA-256 their trail recorded) and go when the case is deleted.
- The upload size check let only `MAX_DOCUMENT_BYTES` through to `/api/documents/upload`, so recordings over 51 MB were
  refused before the route's 500 MB limit (ADR-0020); it now lets the larger limit through and the route checks each
  file's own.
- Not yet in the app (each needs its screen, mockup first): the photo's claims and the edit trail shown; redacting,
  cleaning, blurring, syncing and clipping from the reading view; PDF signing and PDF/A. The module already does each.
- Not done: PdfCraft's OCR (its pinned models could not be downloaded from here, and the copies that could gave nonsense);
  RAW development beyond the camera's preview; MP4 and MKV metadata.
