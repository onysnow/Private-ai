# ADR-0026: Voices in a recording (who spoke when, named by a person)

**Status:** Accepted (2026-10-29)
**Deciders:** Claude, on Ony's instruction to keep working through the build list, within what is already decided:
ADR-0020 ("speakers are not named by the machine here … 'Name this voice' in the reporter's hands"), the media-suite
research §2.4 and §4.4–4.5 (a speaker label is named by a human, never by voice matching; no voice-print matching
across recordings), and mockup INTAKE_4 (Voices: "Lanes are guesses by a speaker model. Names are yours.").

## Context

A transcript without speakers makes a reporter work out who said each line by ear, and a quote is only usable with its
speaker. The research's choice, pyannote's community-1 pipeline (CC-BY-4.0 weights), downloads only with a Hugging
Face login and an accepted form. The craft repos' MFCC clustering needs no model but fails on similar and overlapping
voices (CRAFT_REPOS row 6).

## Decision

- **Model.** sherpa-onnx 2.0.1 (Apache-2.0, ONNX Runtime) running pyannote's segmentation-3.0 network (MIT, CNRS;
  converted to ONNX by sherpa-onnx) to find where voices start and stop, and the 3D-Speaker CAM++ embedding trained on
  VoxCeleb, 16 kHz (Apache-2.0, ModelScope card checked) to group the stretches by voice; fast clustering at a cosine
  distance of 0.5, the number of voices not given. Licences checked 29 Oct 2026. Tried on sherpa-onnx's four-speaker
  test recording: four voices, 6.5 s for 57 s of audio on a CPU.
- **Fetched once.** `python -m app.services.voices fetch` downloads the two files from sherpa-onnx's GitHub releases,
  writes each download to the outbound log and checks it against its pinned SHA-256 (a file that differs is not
  kept). Setting: `VOICES_MODEL_DIR` (default `./data/models/voices`). Finding voices only reads them from disk.
- **When.** After a recording is transcribed, when the models are on this computer; or when a person asks
  ("Listen for voices", a background job). A failure to find voices never undoes the read; the job says so.
- **What is kept.** Each spoken segment gets the voice that speaks for at least half of it (`transcript_segments.speaker`,
  "1", "2"…; none when no voice does); `document_media.voices` keeps the voices with their turns and how long each
  spoke, the turns, the tool, the two models and the threshold, and a history. Voices are numbered in the order they
  first speak.
- **Names.** Only a person names a voice (`PATCH /documents/{id}/voices/{n}`), as one of the case's parties or in
  words; who and when are kept, and every earlier name goes to the history. Finding the voices again clears the names
  (the numbers may now mean other voices), keeping them in the history. A voice is never matched to another
  recording.
- **Screen (INTAKE_4).** The Voices panel lists each voice as "Voice 2 ?" (a guess) or its name ("named by you"), with
  its turns and time, Name this voice / Rename / Clear, and how they were found; each line carries its voice in words,
  the "?" while it is a guess; the timeline's speech bars take the voice's colour; a pinned quote says "Said by", and
  saving it as evidence notes who said it and whether that is a guess.

## Consequences

- New packages: `sherpa-onnx` and `sherpa-onnx-core` 2.0.1 (Apache-2.0; wheels for Windows, macOS and Linux). Models:
  about 6 MB and 30 MB.
- CI fetches the models and runs the real model on the fixture recording.
- Not done: overlapping speech is given to the voice that speaks most; a voice named as a party does not yet link the
  evidence to that party (the note on the evidence says who said it); diarization of the cleaned copy instead of the
  original.
