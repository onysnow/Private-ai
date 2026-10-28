# The craft repos: what the media suite can take from them

Surveyed 28 Oct 2026, on Ony's instruction: before building the media suite, go through every `*craft` repo and use
their code for it. All 22 onysnow forks were cloned (shallow) and read crate by crate. Nothing was built or run, so
"complete" below means what the code, its tests and its docs show, not a measured result.

## Short answer

- **The repos are pure-Rust desktop apps.** Each has a command-line tool (`*-cli`) and an MCP server that drive the
  whole app headless; the web builds are the whole app drawn on a canvas, with no components to embed. None has
  Python bindings. So the code reaches the Workbench in one of three ways:
  1. **Run the craft CLI as a subprocess** from a background job (JSON out). Works today, no Rust build in our image
     beyond installing the binary.
  2. **A small Python module in Rust (PyO3 + maturin)** around the few self-contained crates. Needs a Rust toolchain
     in the Docker image and in the Windows setup.
  3. **Port the algorithm** to Python or TypeScript where it is short and textbook (a few hundred lines).
- **Strongest reuse, in order:** pdfcraft (redaction, signing, PDF/A, compare, Bates, OCR layer), filmcraft
  `audio-dsp` (clip sync, noise and hum removal, loudness), lightcraft (RAW/HEIC decoding, metadata, YuNet face
  detector for blurring), effectcraft (forensic filters, tracking, blur), wordcraft, gridcraft and deckcraft (story,
  spreadsheets, deck).
- **Not in any repo:** perceptual hashing (PDQ/pHash), C2PA reading (except in artcraft-services, below), error-level
  or clone-detection forensics, scene-text OCR beyond Latin, open-vocabulary detection with a permissive model, sound
  event tagging, ML voice/background separation, ENF analysis. These stay with the Python tools named in
  `MEDIA_SUITE_RESEARCH.md` §4.

## Built and tried (28 Oct)

Ony: build them and use what works; licensing is his to settle later. Each app's CLI was built (release, Rust 1.97)
and its code tried on real files; what worked is now in the Workbench as its own native module (ADR-0021).

| Code | Tried on | Result |
|---|---|---|
| PdfCraft redaction + hidden data | a memo naming an account and a person | Both gone from the text and from the file's bytes (checked with PyMuPDF); author metadata removed |
| PdfCraft compare | two versions of the memo | Found exactly the two changed words, with their boxes |
| PdfCraft PDF/A, signing | the memo | PDF/A-2b check named the missing XMP and the unembedded font; PAdES signature valid, unchanged since signing |
| PdfCraft OCR | a scanned page | **Not working here**: its pinned models are refused by their S3 host from this container; the Hugging Face copies differ and read "1 1 1 1" |
| FilmCraft clip sync | two copies of a recording 1.234 s apart | 1.2340 s in 0.23 s, "reliable"; against unrelated noise, "not reliable" |
| FilmCraft DeHum, DeNoise, loudness | the harbour recording with 50 Hz hum and noise added | Hum −40 dB, its 150 Hz harmonic −46 dB, 0.03 s for 19 s; SNR 1.6 → 14.2 dB with DeNoise |
| FilmCraft shot detection | a 7 s video cut at 2.0 s and 4.48 s | Exact at sensitivity 100; **none found at the default 50** (needs tuning on real footage) |
| FilmCraft clip export, transcription | the same video | A 2.5 s H.264/AAC clip PyAV opens; Whisper base transcribed it (the app's faster-whisper stays) |
| LightCraft metadata | Canon EOS 5D IV CR2, iPhone 12 Pro DNG, JPEG | Camera, serial, lens, capture time with offset, GPS; a JPEG's "modified" date is reported as the capture time, so the app records which tag it was |
| LightCraft RAW preview, HEIC | the CR2 (62 MB), the DNG (29 MB), a HEIC | Full-size embedded previews in ~0.03 s; HEIC within 1.8 levels of its source |
| LightCraft YuNet | the demo's four photos | One face in each portrait, none in the embassy graphic; small faces in crowds not tried (no such photo) |
| EffectCraft filters | a photo | Find Edges in 96 ms, correct; kept for the forensic-filter step |
| WordCraft, GridCraft, DeckCraft | the demo's .docx and .xlsx, a .pptx | Read, converted to PDF / CSV, slide drawn correctly |

## Licences

| Repos | Licence |
|---|---|
| filmcraft, soundcraft, effectcraft, lightcraft, photocraft, vectorcraft, designcraft, pdfcraft, wordcraft, deckcraft, gridcraft, cadcraft, artcraft, craft-libs, craft-fonts, craft-launcher, photocraft-corpus | MIT OR Apache-2.0. Keep their copyright and licence notices with any code taken. lightcraft `segment` is Apache-2.0 only. |
| artcraft-services | ArtCraft License (WIP), fair source. Ony's call (11 Oct): the Workbench is not a competing product, so porting from it is fine. |
| artcraftx, placeholder-artcraft, craft-repo-status-app | No licence file (artcraftx's own crate has `license = ""`). |
| craft-common-actions | GitHub workflow files only, no code for the app. |

Third-party parts to keep in mind when taking code:
- **The ArtCraft brand files** (`docs/brand/`, `LICENSE-brand.txt`) are not open source: do not copy them.
- **symphonia** (audio decoding in filmcraft, soundcraft, deckcraft) is MPL-2.0: fine to use; a changed symphonia
  file stays MPL.
- **H.264, HEVC, AAC, AC-3** decoders and encoders are patent-pool formats; the code licence does not grant patents.
  HEIC decoding in lightcraft is off by default for the same reason. PyAV, already in the app, covers decoding.
- **Model weights are downloaded, never bundled**: Whisper (MIT), YuNet (MIT), MobileSAM and MediaPipe Face (Apache-2.0),
  pdfcraft's OCR models (CC-BY-SA-4.0), SAM 3 (Meta's SAM License, not an open licence), lightcraft denoise's
  optional model (GPL-3.0 weights). GeoNames data is CC-BY 4.0 (credit required); lensfun data is CC-BY-SA.
- **artcraft's React video editor** is ported from OpenCut (MIT) and uses soundtouchjs (LGPL-2.1) and mediabunny
  (MPL-2.0); OpenCut is not credited in artcraft's NOTICE.

## By media-suite build item (`MEDIA_SUITE_RESEARCH.md` §4.1)

| # | Item | Craft code | Route | Note |
|---|---|---|---|---|
| 1 | Intake: proxy and thumbnails | lightcraft `raw` (DNG, CR2/CR3, NEF, ARW, RAF, RW2, PEF; 27k LOC, 376 tests), `codecs` (JPEG/PNG/TIFF/WebP/JXL/PSD), `heif` | `lightcraft-cli render IN -o OUT.jpg --size N`; later PyO3 | Pure Rust, no LibRaw. HEIC needs `--features heif` (patents). |
| 2 | Metadata reader | lightcraft `meta` (EXIF, XMP, IPTC, GPX; make/model/serial, software, capture time with offset, GPS); filmcraft `isobmff` and `matroska` (QuickTime location atoms, MKV DateUTC/writing app); soundcraft `audio-io` (BWF origination date) | PyO3 | Partial: no C2PA, no MakerNotes, MP4 creation time skipped. ExifTool + c2pa-python cover more. |
| 3 | Duplicates | lightcraft `pipeline/cull.rs` similar-shot signature | — | Finds bursts, not a perceptual hash. Use PDQ / imagehash. |
| 4 | Transcription | filmcraft `speech` (Whisper on candle, tiny/base/small, word times by DTW, energy VAD) | — | The app's faster-whisper is stronger; `vad.rs` could tighten word edges. |
| 5 | Keyframes and shots | filmcraft `render/scene.rs` (hard-cut detector, ~250 LOC); deckcraft `media::poster_png` | Port to Python | Small and clear. |
| 6 | Speakers | filmcraft `speech/diarize.rs` (MFCC + clustering, up to 6 voices, no model) | Port to Python | A fallback with no Hugging Face login; its docs say it fails on overlapping and similar voices. |
| 7 | Cleaning | filmcraft `audio-dsp`: DeNoise (spectral gating), DeHum (50/60 Hz, 10 harmonics), DeReverb, Enhance Speech, click removal, loudness (EBU R128); 12.6k LOC, no dependencies | PyO3, writing derived WAV files | No voice/background separation (Demucs still needed). |
| 8 | Sound events | soundcraft `dsp` transients and silent ranges | — | Features only, no tagging. |
| 9 | OCR | pdfcraft `ocr` (ocrs, Latin only) | pdfcraft CLI | For PDFs; not scene text. |
| 10 | Find in frames | lightcraft `segment` (SAM 3 text prompts); effectcraft `segment` (MobileSAM, prompted) | engine/MCP or PyO3 | SAM 3 weights are not openly licensed and heavy on CPU; MobileSAM needs a box first. |
| 11 | Face blur on export | lightcraft `faces` YuNet detector (MIT weights, 232 KB); effectcraft `segment` BlazeFace (close-up faces only); blur/mosaic in effectcraft `effects`, filmcraft `render/vfx`, photocraft `algo` | PyO3 exposing **only** `yunet::Detector::detect` | lightcraft `faces` also does recognition against named people (SFace, AuraFace, `matching.rs`): never expose it (§4.5). |
| 12, 15 | Sun, geolocation hint | lightcraft `geocode` (offline GeoNames reverse geocoding, 396 LOC); photocraft `algo` vanishing points | Port (~100 lines) | GeoNames credit required. |
| 17 | Speed and distance | effectcraft `track` (point tracking, homography, stabiliser), filmcraft `render/flow.rs` | PyO3 or CLI | OpenCV covers the same in Python. |
| 18 | Multi-clip sync | filmcraft `audio-dsp::sync::find_offset` (GCC-PHAT, sub-sample, confidence and distinctness) | PyO3 (~30 lines) or port | Exactly the item. |
| 20 | Forensic filters | effectcraft `effects` (Levels, Curves, Find Edges, Equalize, Shift Channels, Median, …; 348 effects), filmcraft `scopes`; photocraft `algo/features.rs` (ORB + RANSAC, the matching core of clone detection) | `effectcraft-cli render-frame` or PyO3 | No ELA or noise analysis anywhere. |
| 22 | Hum / ENF | filmcraft `audio-dsp` DeHum | — | Removal only, no ENF detection. |
| 23 | Anonymous face clusters | — | — | Not in any repo. |
| — | Waveform for the player | soundcraft `audio-io::peaks` (multi-resolution min/max) | Port | The Listen view draws its own outline today. |
| — | Captions | filmcraft `captions` (SRT, WebVTT with speakers, SCC, TTML, EBU STL; burn-in) | PyO3 or CLI | Export of a transcript as subtitles. |
| — | Clip of a pinned quote | `filmcraft-cli export` with in/out | subprocess | One project session per run; PyAV is simpler. |
| — | Timeline / player UI | artcraft `@storyteller/ui-video-editor` (React, 71k lines) | npm workspace copy | Check OpenCut credit and the LGPL soundtouchjs dependency first. |

## Beyond media

| Need | Craft code | Route |
|---|---|---|
| PDF drafting and editing (Ony: "absolutely needs") | **pdfcraft** v0.6.0 alpha: `redact` (removes the content under the marks, re-reads the page and fails if anything is left; sanitise hidden data), `annot`, `organize` (pages), `sign` (PAdES, RFC 3161 timestamps; no network itself), `preflight` (PDF/A-2b/3b), `compare` (word-level), `edit` (watermarks, Bates numbers), `ocr` (searchable layer), text with glyph boxes; ~100 automation tools | `pdfcraft-cli run <tool> key=val` / `--script steps.json`, with a root folder that confines paths. A permissive engine beside PyMuPDF (AGPL); replacing PyMuPDF waits until its own renderer replaces hayro. |
| Writing the story | **wordcraft**: DOCX with tracked changes and comments, legacy .doc reader, Markdown/HTML/RTF/ODT, tagged PDF export, Zotero citations (local Zotero only, 127.0.0.1) | `wordcraft-cli convert / run / zotero` |
| Money-flow spreadsheets | **gridcraft**: XLSX, XLSB, ODS, CSV read/write; ~500 functions; `eval` a formula on a file | `gridcraft-cli info --json / cat --csv / eval` |
| Story deck (deck editor mockup) | **deckcraft**: PPTX import/export, deck model and commands (`insert.picture/video/chart/table`), PDF export | `deckcraft-cli run --cmd … --export` |
| Evidence report / contact sheet | lightcraft `engine/contact_sheet.rs` (PDF), designcraft `pdf` (krilla) | CLI |

## Not useful to the app

- **artcraft, artcraftx:** their AI features call cloud services (fal, Midjourney, Sora, Grok, Higgsfield,
  Seedance…); nothing runs on this computer. Only artcraft's React video editor is a candidate (above).
- **artcraft-services:** cloud backend. Two parts are of interest: `lib/video_info` reads C2PA / AI-provenance
  marks from Sora, Veo, Seedance, Kling and Dreamina videos (useful for item 21's signals), and a deprecated local
  background-removal model (ONNX, CUDA).
- **placeholder-artcraft:** a stand-in copy (its README: while secrets are purged from history); two source files.
- **craft-libs:** one crate, an egui UI kit. **craft-fonts:** OFL fonts. **cadcraft:** DXF/DWG. **vectorcraft,
  designcraft:** nothing for a numbered item. **craft-launcher, craft-repo-status-app, craft-common-actions,
  photocraft-corpus:** tooling and test files.

## Checked and not checked

Checked: every Cargo.toml (description, dependencies, licence field), lines of code and test counts, module docs and
the key source of the crates named above, every CLI's usage text, the MCP tool lists of lightcraft and pdfcraft,
NOTICE and ATTRIBUTION files, `deny.toml` (pdfcraft only), `vendor/` folders, and greps for perceptual hashing, C2PA,
OCR, ELA and ENF. Spot-checked by hand: `audio-dsp::sync::find_offset`, pdfcraft `redact`, lightcraft `faces/yunet.rs`,
artcraftx's empty licence field, artcraft-services' licence text.

Not checked: nothing was built or run, so no claim here is measured (redaction was not tried on real files); the
licences of transitive Rust and npm dependencies (only pdfcraft runs cargo-deny); heic-rs's own licence; Kokoro's
weights; the full MCP tool lists of the other apps.
