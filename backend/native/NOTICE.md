# What the native module is built from

`workbench_native` compiles code from the ArtCraft apps (https://getartcraft.com), taken from Ony's forks at the commits
pinned in `Cargo.toml`. Each is licensed MIT OR Apache-2.0; their licence texts are in each fork
(`LICENSE-MIT`, `LICENSE-APACHE`) and their copyright is "ArtCraft Team and the <app> contributors".

| Crate | From | Used for |
|---|---|---|
| `filmcraft-audio-dsp` | onysnow/filmcraft `0800a8b` | clip sync, DeHum, DeNoise, DeReverb and other restoration effects, EBU R128 loudness |
| `lightcraft-meta`, `lightcraft-raw`, `lightcraft-heif`, `lightcraft-faces` (detector only) | onysnow/lightcraft `76b5377` | photo metadata, RAW previews, HEIC decoding, face detection |
| `pdfcraft-automation` and the PdfCraft crates under it | onysnow/pdfcraft `fb3fa5d` | redaction, hidden-data removal, compare, PDF/A, signing, pages |
| `hayro`, `hayro-interpret`, `hayro-syntax`, `hayro-jbig2`, `lopdf` (PdfCraft's patched copies) | onysnow/pdfcraft `fb3fa5d` (`vendor/`) | PDF reading and rendering (Apache-2.0 / MIT) |

Notes carried over from the forks:
- **HEIC** uses heic-rs (HEVC). HEVC is a patent-pool format; the code licence does not grant patent licences.
- **YuNet** face-detector weights (MIT, opencv_zoo) are not bundled. Face blurring is not in the app yet; when it is,
  setup fetches them once and checks the SHA-256 LightCraft pins (`8f2383e4…2552fa4`).
- **symphonia** (audio decoding, MPL-2.0) is used unmodified where a crate pulls it in.
- The ArtCraft brand files are not open source and are not used.
