# ADR-0020: Audio and video become documents, transcribed on this computer

**Status:** Accepted (2026-10-28)
**Deciders:** Claude, on Ony's instruction to build source intake before the media suite (`DECISIONS.md`, calls 5, 9, 10)

## Context

An audio or video file dropped in The Drop is refused (415; BACKLOG: "MP3, WAV and MP4 give a 415"). Mockup INTAKE_4
("Listen and read along") and the research (`SOURCE_INTAKE_RESEARCH.md` §3.2, §3.4, §4, §8.3–8.4, §10 Phase 2) ask for a
recording to be read like a document: a timecoded transcript made here, words the machine was unsure of marked, parts
with no speech kept apart and never used as evidence, a quote pinned to its time (`media:#t=731.8,740.2`, the W3C Media
Fragments form), and evidence locked until the reporter has heard the part themselves. The original is kept unaltered;
anything derived from it is marked derived. The suite's EGS rules on capture and custody apply as for any file.

## Decision

- **Accepted files.** `.mp3 .wav .m4a .aac .ogg .oga .opus .flac .mp4 .m4v .mov .webm .mkv`, up to
  `MAX_MEDIA_BYTES` (500 MB). The original is stored and hashed like every upload.
- **Decoding: PyAV** (BSD-3; its wheels carry their own FFmpeg libraries), so no FFmpeg install is needed on Windows.
  The audio is decoded to 16 kHz mono in memory for transcription; nothing is written over the original.
- **Transcription: faster-whisper** (MIT, on CTranslate2, MIT) with Whisper weights (MIT), on this computer's CPU, with
  word timestamps and word probabilities and its voice-activity filter. Model `TRANSCRIPTION_MODEL` (default `small`,
  multilingual); the language is detected unless `TRANSCRIPTION_LANGUAGE` is set.
- **No download during a read.** The model is fetched once at setup (the Docker image and the Windows setup scripts
  run `python -m app.tools.fetch_transcription_model`, which writes the download to the outbound log) and loaded with
  `local_files_only`; a read never contacts a server. A missing model fails the read with what to run.
- **What a transcript is, stored** (ADR-0019, app tables):
  - each spoken segment is a passage (`DocumentChunk`, locator `t=731.8,740.2`), so search, proposals and quotes work
    as for any document;
  - `transcript_segments` keeps each segment's start and end, its words with their times and probabilities, the
    model's own confidence measures, and its kind: `speech`, or `no_speech` (a silence the voice-activity filter found,
    or a segment Whisper itself rates as probably not speech). A `no_speech` segment is never a passage: words there may
    be invented by the model, so they are shown apart and cannot be quoted;
  - `document_media` keeps the file's kind, duration and streams, a waveform outline for the player, and the
    transcription's tool, model, version, language and its probability, and when it ran.
- **Unsure words.** A word with probability under 0.5 is marked "machine unsure" wherever the transcript is shown.
- **Heard before quoted.** Evidence from a recording is saved only after the reporter marks the part as heard; who and
  when is kept with the quote (Phase 2b, the Listen & read view).
- **Media from links (Phase 2c).** On a captured page the reporter can collect its video or audio: yt-dlp (Unlicense,
  2026.8.19), one item (no playlists), logged out, no cookie file, every connection through the capture's guard proxy
  (public addresses only, within `MAX_MEDIA_BYTES`), single-file formats only so no FFmpeg is needed. The file and
  yt-dlp's `info.json` are kept with the capture, each with its SHA-256, and written to the outbound log first; the file
  becomes a recording under the page's document and is transcribed. Each item records its platform, its id there, the
  account, the title, upload date, duration, live status, the tool and the route ("yt-dlp, logged out"). A second
  request on the same page returns what was collected; a new visit is a new capture.
- **Speakers are not named by the machine here.** Speaker lanes need a diarization model (pyannote) whose weights sit
  behind a Hugging Face login: left for later, with "Name this voice" in the reporter's hands.

## Consequences

- New packages: `faster-whisper` 1.2.1, `ctranslate2`, `av` 17.0.0 (pinned: PyAV 19 removed an argument faster-whisper
  1.2.1 passes; tested 28 Oct). The `small` model is about 480 MB on disk.
- Transcribing runs inside the reading job, in this process (not the reader subprocess, whose result carries only
  passages), with progress per segment and Stop honoured between segments.
- Media files are not sent to OpenAleph for reading (ingest-file does not transcribe); a reader of the case sees the
  same transcript whichever reader is configured.
- A site that offers only separate picture and sound streams (much of YouTube at its higher qualities) is collected at
  the best single-file quality it offers, or refused with that reason; joining streams needs FFmpeg, not installed.
- Not yet: a per-platform "works today" check (extractors break when sites change), derived files kept on disk
  (a cleaned copy, a clip of a pinned quote), a publisher's transcript and Compare, speaker diarization.
