# Media tools mockups (for Ony's review)

Three screens at 1440 x 900 in Rain Noir: the first screens for what the native module already does (ADR-0021), from
`docs/research/media-suite/MEDIA_SUITE_RESEARCH.md` (§2.1, §2.8, §2.9, §3, §5 ideas 1, 2, 5, 6 and 7) and
`CRAFT_REPOS.md` (28 Oct 2026). Nothing in the app has changed. Every name, file, hash, time and place is invented
sample data on the Kestrel SA sample case; the photo and the sound are drawn, not recorded.

Open `index.html` in a browser. Keys: `1` to `3` switch screens, `N` shows the "Needs / open questions" layer.

| Screen | Picture | What it is |
|---|---|---|
| MEDIA_1 A photo | `MEDIA_1-a-photo.png` | What the file claims about itself (time and which tag it came from, camera, software, GPS and how far from the plot, colour profile) shown as a claim until another record agrees; the machine's proposals beside the picture (sign text, 2 faces found by a detector only, a proposed place), each kept or rejected by a person; a wipe comparing the original with the selected copy; Make a copy (blur faces, remove metadata, crop, redact an area, turn); the edit trail as a tree from the original, each copy naming its tool, commit and person. |
| MEDIA_2 A recording | `MEDIA_2-a-recording.png` | A spectrogram with A/B (original / cleaned: the mains hum lines go), the clip window, the cleaning chain (hum, room noise, loudness with before and after), cutting a clip from the original or the cleaned copy with its `media:#t=` place, and syncing the phone recording with the council's own video by matching sound (offset +2.48 s), accepted by a person. |
| MEDIA_3 A PDF | `MEDIA_3-a-pdf.png` | Redact before sharing: boxes you drew with a reason each, proposed boxes (a phone number found by pattern, a councillor's name that is usually kept) to accept or reject, hidden data to remove from the copy, the original's hash and the promise that these tools cannot write it, and the new file's name. Tabs for hidden data, compare, PDF/A and sign. |

`states/` holds the original recording with its hum, the faces proposal lit on the photo, a proposed redaction
accepted, and each screen with the notes layer open.

## Open questions (also on each notes layer; several are from the research's §6)
1. Faces: blur on export on by default and no face recognition, as drawn? "Same person" clustering left out?
2. Should GPS in a photo become a proposed place?
3. A name for the media tools? The research suggested "The Darkroom"; drawn with no name.
4. Model downloads: a "media starter pack" on first run, or each model on first use?
5. Exports: attach C2PA credentials saying what was done?
6. Storage: clean up old derived files automatically, or never?
7. Should a redaction need a reason, as drawn?
8. Signing PDFs: a key per reporter made at "Sign your work" (ACCOUNT_1), or none for now?
9. PdfCraft's OCR could not be tried in the cloud (its models were refused): try it on your PC?
