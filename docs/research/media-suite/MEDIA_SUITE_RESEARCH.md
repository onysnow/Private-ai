# Media Suite: design research

For the Journalism Workbench (Private-ai). Researched 11 October 2026.

Ony asked for a media suite for going through photos, video and audio: cleaning them, isolating sounds, and recognising sounds, places, context, accents and languages. This document reviews how serious verification teams work, which open-source tools can run on his own machine, what each tool can and cannot tell a journalist, and how the suite could fit the app. It ends with a build order, an architecture sketch, interaction ideas, and open questions.

**What the app does today.** It OCRs text in images. It stores a photo as dated picture evidence, but the date is typed by hand. It shows before/after pairs. Video and audio only come in through OpenAleph and get no analysis. There is no EXIF reading and no transcription.

**How to read the tables.** "Licence" is the code licence unless model weights are listed separately. Where weights carry a different licence, that is noted, because weights are often the stricter part. "Checked" means I confirmed the licence from PyPI, Hugging Face or the project page on 11 Oct 2026. "Check" means I could not confirm it and it must be verified before use. Accuracy figures are the publishers' own benchmark numbers. They are not field accuracy and real material will usually do worse.

---

## Contents

1. [How serious teams do it](#1-how-serious-teams-do-it)
2. [Capabilities, tools and pitfalls](#2-capabilities-tools-and-pitfalls)
   - 2.1 Metadata, hashes and provenance
   - 2.2 Photo forensics
   - 2.3 Reverse image search
   - 2.4 AI-generated and deepfake detection
   - 2.5 Geolocation and chronolocation
   - 2.6 Context recognition (objects, text, symbols, vehicles)
   - 2.7 Video
   - 2.8 Audio
   - 2.9 Faces
3. [Chain of custody](#3-chain-of-custody)
4. [Recommendation for the app](#4-recommendation-for-the-app)
5. [Interaction ideas (proposals)](#5-interaction-ideas-proposals)
6. [Open questions for Ony](#6-open-questions-for-ony)
7. [Sources](#7-sources)

---

## 1. How serious teams do it

Every team below uses the same basic method. Machines extract clues, and a person checks each clue against the outside world: maps, satellite images, weather, other footage, witnesses. No team treats one tool's output as proof. That matches the Workbench's propose-then-confirm rule.

### Berkeley Protocol on Digital Open Source Investigations (OHCHR and UC Berkeley Human Rights Center)
This is the international standard for open-source evidence that may end up in court. It launched in December 2020, and OHCHR's publication page is dated 3 January 2022 (sales no. E.20.XIV.4). Its rules shape section 3. In short:

- **Collect** in native format, or as close to it as possible, and document any change the collection caused (para. 154). For each item, record the URL, HTML source, full-page capture, embedded media, embedded metadata, context, the collector's details and a timestamp from an NTP-synced clock, and a hash value. The first three items are the minimum standard for court (para. 155).
- **Preserve** an untouched *evidentiary copy* and do all work on separate *working copies*. Document every change, including making copies. Store the two kinds of copy separately where possible (paras. 168–169). Check hashes regularly to detect degradation, and keep three copies on two kinds of storage, one of them off-site (paras. 171–172).
- **Chain of custody** means "chronological documentation of the sequence of custodians … and documentation of the control, date and time, transfer, analysis and disposition" (para. 167).
- **Verify** in three parts: source analysis, technical analysis (metadata, EXIF, source code) and content analysis (unique identifiers, objectively verifiable facts like weather, geolocation, chronolocation, completeness, internal consistency, external corroboration) (paras. 176–194).
- **Process only working copies**, document all processing, and be aware of bias when using algorithms or deep learning (para. 197). Investigators "should record any tools or software used", and automated processes "must be understood by users and be explainable in court" (para. 25).
- **Faces.** Identifying a person from human features needs a trained forensic expert. Lay analysis "can be inaccurate, prejudicial and/or otherwise problematic" (para. 188 and footnote 159).
- Annex IV has an online data collection form: collector, IP, start and end time, URL, HTML, screenshot, collection package hash list, and the software, time, IP and WHOIS services used.

Sources: https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source · PDF: https://www.ohchr.org/sites/default/files/2024-01/OHCHR_BerkeleyProtocol.pdf

### Bellingcat
Bellingcat publishes a free, community-maintained **Online Investigations Toolkit** (https://bellingcat.gitbook.io/toolkit, launched September 2024: https://bellingcat.com/resources/2024/09/24/bellingcat-online-investigations-toolkit). It also releases its own open-source tools, three of which matter here:

- **ShadowFinder** (MIT, checked on PyPI). Given an object's height, its shadow's length, and a date and time, it draws the ring of places on Earth where the sun stood at that angle. Two images taken at different times can narrow the ring to a few places. Its limits: it needs a known time, a level surface, and an object and shadow roughly side-on to the camera. https://bellingcat.com/resources/2024/08/22/shadow-geolocate-geolocation-locate-image-tool-open-source-bellingcat-measure · method background: https://www.bellingcat.com/resources/2021/05/18/unsure-when-a-video-or-photo-was-taken-how-to-tell-by-measuring-the-length-of-shadows/
- **OpenStreetMap Search** finds places where several mapped features sit near each other, for example "a church within 200 m of a petrol station and a bridge". https://bellingcat.com/resources/how-tos/2023/05/08/finding-geolocation-leads-with-bellingcats-openstreetmap-search-tool
- **Auto Archiver** (MIT, checked on PyPI). It downloads media and metadata from links, with optional hashing and timestamping enrichers "for chain of custody validations", and with perceptual hashing for deduplication in its 2025 version. Bellingcat says it has preserved more than 150,000 items. https://www.bellingcat.com/resources/2025/08/13/the-open-source-tool-that-has-preserved-150000-pieces-of-online-evidence/

### InVID-WeVerify verification plugin
This is a free browser extension built by EU research projects and AFP, and the most common verification "Swiss army knife". According to Bellingcat's toolkit entry (https://bellingcat.gitbook.io/toolkit/more/all-tools/invid.md), it does the following:

- **Video:** contextual analysis of YouTube and Facebook videos, keyframe extraction for reverse search, thumbnails, rights information, metadata.
- **Image:** a magnifier (zoom, sharpen, flip), metadata, forensic filters, OCR with translation, C2PA provenance checks.
- **Restricted features** (for registered users only): synthetic-image and deepfake detection, a voice-clone detector, and a geolocaliser.
- **Reverse search** buttons for Google, Lens, Bing, TinEye, Yandex, Baidu and others.

Several of its tools call outside services that are not open source. The lesson for the Workbench is how it bundles many small checks into one place and leaves the judgement to the journalist. Its features are a good checklist.

### Amnesty International Citizen Evidence Lab
Amnesty's digital investigations team. It combines testimony with open-source research, digital reconstruction, remote sensing, crowdsourcing and data science. Its **Digital Verification Corps** trains university students worldwide to authenticate social-media video and images. https://citizenevidence.org/about-us/

### New York Times Visual Investigations
Malachy Browne describes the team's habits (https://gijn.org/my-favorite-tools-malachy-browne):

- EXIF is read but "never relied on alone", because it can be altered.
- InVID is used for upload times and keyframes.
- Timestamped footage is ordered into a timeline.
- Satellite archives (Planet, Maxar) and Street View are used for change and location.
- Scenes are rebuilt with drone photogrammetry (RealityCapture) and Blender, then cameras are placed in the model to recreate the moment of filming. This was done with Forensic Architecture for the Gaza project.

The team's audio work on gunfire has drawn on acoustics experts such as Robert Maher of Montana State University (see 2.8).

### BBC Verify
Launched in May 2023 with about 60 journalists drawn from BBC's user-generated content hub, Monitoring, disinformation and data teams. Its stated principle is "transparency": showing audiences the evidence and workings behind a verification. https://pressgazette.co.uk/news/bbc-verify/ . This is close to the Workbench's "AI shows its reasoning" principle. A media finding should always come with its workings.

### Forensic Architecture
A research agency at Goldsmiths, University of London. Its methods include:

- spatial and 3D reconstruction;
- synchronising many videos into one timeline;
- audio ballistics. For the killing of Shireen Abu Akleh, its audio report measured a gap of about 300 ms between the bullet's supersonic crack and the muzzle blast. With the bullet's velocity, that gave a shooter distance of about 180 m. https://content.forensic-architecture.org/wp-content/uploads/2022/11/2022.11.02_Final-Audio-and-Acoustic-Analysis-SAA-Report.pdf (researcher in charge: Lawrence Abu Hamdan, who leads the audio-investigation group Earshot);
- machine learning trained on *synthetic* images to find rare objects, such as specific tear-gas canisters, in large video sets ("Objects of violence", https://arxiv.org/abs/2004.01030).

It has released open-source research tooling, such as mtriage for batch-processing media. I did not confirm its licence or current state.

### WITNESS
A human-rights video organisation. Its *Video as Evidence* field guide covers filming, preserving and presenting video so that it can be used in court. Its key points are to keep originals, keep metadata, and document custody. https://vae.witness.org/ and https://library.witness.org/product/video-as-evidence-compiled-sections/ . WITNESS has also worked for years on deepfake preparedness, consistently arguing against relying on detectors alone and for provenance and context.

### Verification Handbook
Edited by Craig Silverman and published free by the European Journalism Centre / DataJournalism.com. The third edition covers disinformation and media manipulation. https://datajournalism.com/read/handbook/verification-3

### What this means for the design
1. Keep originals untouched and hash them on arrival.
2. Every machine output is a clue, not a fact. It should be stored with the tool, version and settings that produced it, and confirmed or rejected by a person.
3. The strongest results combine several weak signals: shadow plus weather plus map plus another video. The UI should make combining them easy and show when signals disagree.
4. Show the workings, so a finding can be explained to an editor, a lawyer or the audience.

---

## 2. Capabilities, tools and pitfalls

### 2.1 Metadata, hashes and provenance

**What it tells a journalist.** Metadata can show:
- the camera or phone model, lens and settings;
- capture time, and sometimes time zone;
- GPS position and sometimes compass direction;
- the editing software used, and whether the file was re-saved;
- for video, the encoder and creation time from the container, and sometimes the device.

C2PA "Content Credentials" are a cryptographically signed record of capture and edits. Google's Pixel 10 signs every Pixel Camera JPEG, and Google Photos adds credentials to edited images (https://blog.google/security/pixel-android-trusted-images-c2pa-content-credentials/). Hashes prove a file has not changed since collection. Perceptual hashes find the same picture after resizing or recompression, which helps find duplicates and earlier copies.

| Tool | What it does | Licence | Self-hostable | Hardware |
|---|---|---|---|---|
| ExifTool (Phil Harvey) | Reads and writes EXIF, XMP, IPTC, GPS, maker notes and video metadata. The reference tool. | Same terms as Perl (Artistic or GPL) | Yes, CLI | CPU, trivial |
| PyExifTool | Python wrapper for ExifTool | GPLv3+ or BSD (checked) | Yes | CPU |
| pyexiv2 | Python bindings for Exiv2 (EXIF, IPTC, XMP) | GPLv3 (checked) | Yes | CPU |
| ffprobe (FFmpeg) | Video and audio container metadata, streams, codecs, creation_time | LGPL/GPL depending on build | Yes | CPU |
| MediaInfo / pymediainfo | Container and stream metadata | MediaInfo BSD-2 (check); pymediainfo MIT (checked) | Yes | CPU |
| c2pa-rs / c2patool / c2pa-python (Content Authenticity Initiative) | Reads and validates C2PA manifests (who signed, which actions, ingredients) | c2pa-python: MIT OR Apache-2.0 (checked) | Yes | CPU |
| hashlib (SHA-256) | Cryptographic file hash | Python stdlib | Yes | CPU |
| imagehash | aHash, pHash, dHash and wHash perceptual hashes | BSD-2 (checked) | Yes | CPU |
| PDQ (Meta ThreatExchange) / pdqhash | 256-bit perceptual hash compared by Hamming distance. Meta also publishes TMK+PDQF for video. | pdqhash: MIT (checked); ThreatExchange repo: check | Yes | CPU |
| videohash | Near-duplicate video hash | MIT (checked) | Yes | CPU |
| imagededup | CNN-based and hash-based duplicate finder | Apache-2.0 (checked) | Yes | CPU, GPU optional |

**Pitfalls**
- **Metadata is easy to fake and is often stripped.** Social platforms remove most EXIF and transcode video, so the metadata then describes the platform's file, not the original. The Berkeley Protocol says exactly this (para. 184). Show metadata as "claims the file makes about itself", never as facts.
- **EXIF times are camera-clock times,** often in an unknown time zone and sometimes years off. Newer cameras write OffsetTime tags. Older ones don't.
- **GPS can be stale** (last fix) or inaccurate indoors. Some phones write the GPS direction (where the camera faced), which is very useful when present.
- **C2PA proves a chain of signatures, not truth.** No credential does not mean fake: most media has none. A valid credential shows who signed and what they declared. It does not show that the scene was real. Credentials are also lost when platforms strip them.
- **Perceptual hashes give false matches** on similar scenes (two photos of the same building) and miss heavy crops or mirroring. Treat a match as "possibly the same image" and show the two side by side.
- **Use SHA-256 as the fixity hash.** The Berkeley Protocol says to follow the currently accepted standard (it points to NIST). MD5 or SHA-1 can be stored as well, for compatibility with other tools.

### 2.2 Photo forensics

**What it tells a journalist.** Where in an image the compression, noise or texture is inconsistent, which can be a sign of splicing, cloning or local edits. It also tells whether the file was saved more than once.

| Tool | What it does | Licence | Self-hostable | Hardware |
|---|---|---|---|---|
| Sherloq | Desktop toolkit: ELA, JPEG ghosts, quality estimation, double compression, noise separation, PRNU, copy-move (clone), splicing, resampling, median filtering | GPL-3.0 (from project page) | Yes. Code to learn from or call, not a library. The author calls it an educational tool. | CPU |
| Error level analysis (simple to build with Pillow) | Re-saves a JPEG and shows the difference | n/a | Yes | CPU |
| OpenCV / scikit-image | Building blocks for noise maps and copy-move matching (keypoints) | Apache-2.0 / BSD (checked) | Yes | CPU |
| TruFor (GRIP, University of Naples; CVPR 2023) | Learned forgery localisation: per-pixel heatmap, a whole-image integrity score, and a *reliability map* showing where its own output may be wrong | "Informational and nonprofit purposes" only (project page). Check the full LICENSE. | Yes (Docker) | GPU recommended |

**Pitfalls**
- **ELA is widely misread.** FotoForensics' own tutorial (https://fotoforensics.com/tutorial-ela.php) warns about several things:
  - high-contrast edges light up even in untouched images;
  - whole-image edits (resize, recolour, noise) raise error everywhere;
  - many re-saves flatten ELA to black and hide edits;
  - Photoshop's save-time sharpening looks like editing;
  - ELA "is not conclusive alone".
- **Social media recompression destroys most forensic traces.** These tools work best on originals, which journalists often don't have.
- **Learned detectors produce confident-looking heatmaps on clean images.** TruFor's reliability map helps. Always show it, and never show a heatmap without saying how unreliable it can be.
- **Licence.** TruFor's terms restrict it to non-profit and informational use. That may be fine for Ony personally, but it must be checked before the app is distributed or sold.

### 2.3 Reverse image search

**What it tells a journalist.** Whether a picture or video frame appeared online earlier, which is the most common way old images get recycled as "new". It can also lead to the original uploader and better-quality copies.

| Engine or approach | API | Self-hostable | Notes |
|---|---|---|---|
| Google Images / Lens | No official public API. Third-party scraping APIs are paid and against Google's terms. | No | Usually the strongest for general content. Open in the browser. |
| Bing | The **Bing Search APIs were retired on 11 August 2025** (https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement). I could not confirm from that page whether Visual Search was included. Assume no API. | No | Open in the browser |
| Yandex | No official reverse-image API | No | Strong for faces and Eastern Europe. Raises ethical questions with faces. |
| TinEye | Paid API. MatchEngine is a separate paid product for matching against your own collection. https://services.tineye.com/MatchEngine | No (hosted) | Good at finding exact or modified copies and sorting by oldest |
| Own corpus: CLIP/SigLIP embeddings + FAISS | You build it | Yes | Finds similar images *within the investigation and OpenAleph collections only*. open_clip MIT, FAISS MIT, SigLIP weights Apache-2.0 (all checked). |

**Recommendation.** Inside the app, do *local* similarity search over everything in the investigation and in OpenAleph, using perceptual hashes plus embeddings. For the open web, add "search this frame on…" buttons that open the engines in the user's own browser, so nothing is sent automatically. Attach these buttons to the existing per-investigation outside-lookup toggle, because uploading an image to Google or Yandex *discloses it* to that company. For sensitive material, that is a source-protection risk.

### 2.4 AI-generated and deepfake detection

**What it tells a journalist.** At best, a probability that an image, video or voice was synthesised or manipulated.

**The evidence on reliability is poor.** The *Deepfake-Eval-2024* benchmark collected deepfakes that circulated online in 2024. Open-source detectors lost about **50% (video), 48% (audio) and 45% (image)** of their AUC compared with older academic benchmarks (https://arxiv.org/abs/2503.02857). In audio, *Does Audio Deepfake Detection Generalize?* (Interspeech 2022) found that detectors degraded by "up to one thousand percent" on real-world recordings of public figures (https://arxiv.org/abs/2203.16263).

| Kind | Examples | Licence | Notes |
|---|---|---|---|
| Image "AI or not" classifiers on Hugging Face | e.g. umm-maybe/AI-image-detector (CC-BY-4.0), Organika/sdxl-detector (CC-BY-NC-3.0) (checked) | varies | Trained on particular generators. They fail on new generators and on recompressed images. |
| Forensic localisation | TruFor (above) | non-profit use | Shows edited regions better than it shows wholly generated images |
| Voice spoofing (ASVspoof family) | AASIST and similar research models | check | Lab EERs look excellent, but in-the-wild performance collapses (see above) |
| Provenance instead of detection | C2PA (2.1) | open | Positive proof when present. Says nothing when absent. |

**Recommendation.** Do **not** ship a "fake / real" verdict. If a detector is included at all:
- label it "experimental signal";
- show its known failure modes next to every score;
- never let it raise a flag on its own.

Put the effort into what actually works: provenance (C2PA, earliest copy found), consistency checks (shadows, weather, geography, audio-visual sync) and corroboration. WITNESS's position is the same.

### 2.5 Geolocation and chronolocation

**What it tells a journalist.** Where a photo or video was taken (geolocation) and when (chronolocation), corroborated against independent facts. The Berkeley Protocol names both as content-analysis steps (paras. 190–191).

| Tool or model | What it does | Licence | Self-hostable | Hardware | Published accuracy |
|---|---|---|---|---|---|
| **GeoCLIP** (NeurIPS 2023) | Image to top-k GPS guesses with probabilities. Trained on MP-16 (4.7 M images). | MIT (checked on PyPI) | Yes | GPU helpful, CPU possible | Im2GPS3k: 14.1% within 1 km, 34.5% within 25 km, 50.7% within 200 km, 69.7% within 750 km, 83.8% within 2,500 km (paper, Table 1) |
| **StreetCLIP** | Zero-shot country, region and city classification for street-level photos (CLIP ViT-L/336) | **CC-BY-NC-4.0** (checked) | Yes | GPU helpful | IM2GPS3K: 22.4% within 25 km, 80.4% within 2,500 km. Biased toward the West; India and China not in training data. The card says geolocating private images is out of scope. |
| PIGEON / PIGEOTTO (CVPR 2024) | State-of-the-art planet-scale geolocation (over 40% within 25 km on its Street View task) | Code released, **weights not released** (README) | No usable model | n/a | n/a |
| Local vision-language model through Ollama (e.g. Qwen2.5-VL-7B, Apache-2.0, checked) | Describes clues in words: script on signs, side of the road cars drive on, vegetation, architecture, plate format | Apache-2.0 for the 7B (the 3B has no licence tag on Hugging Face, so check) | Yes, through the app's existing Ollama adapter | 8 GB+ VRAM for a 7B quantised model (rough guide) | No geolocation benchmark. Treat as a brainstorming aid. |
| **SunCalc** (mourner/suncalc, JS) | Sun azimuth and elevation for any place and time | BSD-2 (check) | Yes, runs in the browser | none | astronomical, exact |
| pvlib / astral / ephem (Python) | Same calculations server-side | BSD-3 / Apache-2.0 / MIT (checked) | Yes | none | |
| **ShadowFinder** (Bellingcat) | Shadow ratio plus time, giving a ring of possible locations | MIT (checked) | Yes | CPU | method, not ML |
| **Open-Meteo** historical weather API | Hourly past weather for any coordinate (about 80 years claimed) | Code AGPL-3.0, data CC-BY-4.0 (attribution required) | Yes, Docker self-host possible (https://github.com/open-meteo/open-meteo) | server | reanalysis grid, not a station reading |
| **Overpass API** (OpenStreetMap) | Queries for map features ("mosque within 300 m of a railway bridge") | Overpass AGPL-3.0 (check); OSM data ODbL | Yes, but a full planet instance needs large disk. A regional extract is practical. | server/disk | n/a |
| overpy / osmnx | Python clients for Overpass and OSM | MIT (checked) | Yes | CPU | |

**What is realistic offline**
- **Fully offline and reliable:** sun position and shadow maths; reading GPS from EXIF; OSM queries against a downloaded *regional* extract (for example Indiana, or one country); a VLM listing visible clues.
- **Offline but weak:** GeoCLIP, StreetCLIP. Useful for suggesting a region to search, not for pinning a place. A 1 km hit rate of about 14% on a benchmark means most guesses are wrong at street level.
- **Needs the network (behind the outside-lookup toggle):** historical weather, satellite imagery, Street View and Mapillary, and a full planet OSM.

**Pitfalls**
- Benchmarks such as Im2GPS3k are skewed toward famous, touristy places. Ordinary streets in Gary, Indiana are much harder.
- Shadow methods need a level surface, a known object height (or a ratio) and a camera roughly side-on. Lens distortion adds error.
- Weather data is a model grid, often around 10 km or more. "Reanalysis says it was dry" does not prove a local shower didn't happen.
- Geolocating private people's photos raises ethics and safety questions (StreetCLIP's own card discourages it).

### 2.6 Context recognition (objects, text, symbols, vehicles)

**What it tells a journalist.** What is in the frame: objects, weapons, vehicles, uniforms, flags, logos, shop signs, plates, and readable text in any script. These clues lead to place, time, unit, organisation and identity.

| Tool or model | What it does | Licence | Hardware | Notes |
|---|---|---|---|---|
| **OWLv2** (Google) | Open-vocabulary detection: type "police car", "flag", "rifle" and get boxes | Apache-2.0 (checked) | GPU helpful | Good for user-typed queries |
| **Grounding DINO** | Open-vocabulary detection | Apache-2.0 (checked) | GPU | |
| **Florence-2** (Microsoft) | Captioning, detection, OCR, region description in one small model | MIT (checked) | GPU or strong CPU | |
| SAM 2 (Meta) | Segmentation: click an object to get its exact outline | Apache-2.0 (checked) | GPU | For precise masks, blurring and measuring |
| Ultralytics YOLO | Fast fixed-class detection | **AGPL-3.0** (checked) | CPU/GPU | The licence matters if the app is ever distributed commercially. Prefer the Apache/MIT options above. |
| Local VLM (Qwen2.5-VL-7B or Qwen3-VL-8B, both Apache-2.0, checked) | "Describe everything that could help place or date this image", with region references | Apache-2.0 | 8–16 GB VRAM (rough guide) | Hallucinates. Every claim must point to a region the user can check. |
| **PaddleOCR** | OCR for many scripts (80+ languages per project docs), including scene text | Apache-2.0 (checked) | CPU/GPU | Strong on photographed signs |
| **EasyOCR** | OCR, 80+ languages | Apache-2.0 (checked) | CPU/GPU | Simple to use |
| Tesseract | OCR of documents, 100+ languages | Apache-2.0 | CPU | Probably what the app uses now. Weak on scene text. |
| Surya | OCR and layout | Code Apache-2.0 on PyPI (checked). Weights historically had separate commercial terms, so check. | GPU | |
| CLIP / SigLIP zero-shot | "Which of these flags or uniforms or logos is this?" against a list the user supplies | MIT / Apache-2.0 | CPU/GPU | Works only for well-known symbols. Needs a reference gallery for niche insignia. |

**Plates, logos, uniforms, flags.** There is no trustworthy, licence-clean, general open model for each of these. The practical design is:
1. open-vocabulary detection to find the plate, patch or flag;
2. OCR, or zero-shot matching against a **reference gallery** the journalist builds per investigation (for example the patches of the local police departments);
3. a person confirms.

Vehicle make and model classifiers exist in research but go out of date quickly. A VLM description plus a person comparing against reference photos is more honest.

**Pitfalls**
- **Open-vocabulary detectors find what you ask for,** including things that aren't there ("rifle" finds umbrellas). Show the crop and the score, and ask for confirmation.
- **Licence plates are personal data** in many places. Treat plate readings like faces: store them as investigation notes, never as a searchable plate database (see 2.9).
- **OCR of non-Latin scripts** often mixes up similar characters. Show the crop next to the text.

### 2.7 Video

**What it tells a journalist.** The key frames to reverse-search, where cuts and edits are, a steadier and clearer view of a detail, and timing: how long something took, how fast something moved, and the order of events across several cameras.

| Tool | What it does | Licence | Hardware |
|---|---|---|---|
| FFmpeg | Decode, extract frames, scene-change filter, `vidstab` stabilisation filters, `deshake` | LGPL/GPL (vidstab needs a GPL build) | CPU |
| **PySceneDetect** | Shot and cut detection, keyframe export | BSD-3 (checked) | CPU |
| TransNetV2 | Learned shot-boundary detection | check (believed MIT) | GPU helpful |
| vidstab (Python) | Simple stabilisation | MIT (checked) | CPU |
| **Real-ESRGAN** | Upscaling (super-resolution) | BSD-3 (checked) | GPU |
| OpenCV | Optical flow, frame differencing, measurements | Apache-2.0 | CPU |
| Frame-rate tools (ffprobe) | Real vs nominal frame rate, variable frame rate, dropped frames | | CPU |

**Speed and time estimation.** The standard OSINT method:
1. find two fixed points of known distance, using map measurement or OSM;
2. count frames between the moments an object passes them;
3. divide distance by frame count over frame rate.

The pitfalls are variable frame rate in phone video, which you must read from per-frame timestamps and not from the nominal fps; perspective; and rolling shutter. The app can make this a guided tool: mark point A, mark point B, enter the distance or pick it on the map, mark frames, and get a speed with an error range.

**Multi-camera synchronisation.** Line up clips on a shared timeline using shared sounds (gunshots, sirens, speech), which can be found automatically by audio cross-correlation, and shared visual events. The NYT and Forensic Architecture do this by hand. The app can propose offsets and let the journalist confirm them.

**Pitfalls**
- **Enhancement invents detail.** Super-resolution "hallucinates" plausible texture. An upscaled face or plate is **not** evidence of what the face or plate looked like. Every enhanced frame must be labelled as derived, never used to read text or identify a person, and kept linked to its original. Courts and editors will ask about this.
- Stabilisation crops and warps. Measurements must be taken on the original frames.
- Platform re-encodes change the frame rate and drop frames.

### 2.8 Audio

**What it tells a journalist.**
- What was said, by whom and when (transcript, speaker turns, word timestamps).
- Which language. Weakly, which accent.
- What else can be heard: sirens, gunfire, explosions, call to prayer, trains, crowds.
- Timing: gaps between shots; with ENF, possibly when the recording was made.
- Whether audio and video belong together.

#### Cleaning and isolating

| Tool | What it does | Licence | Hardware | Notes |
|---|---|---|---|---|
| **DeepFilterNet** | Speech denoising (full-band 48 kHz) | MIT (checked) | CPU real-time | Best first choice for "make the speech clearer" |
| **RNNoise** (Xiph) | Lightweight speech denoising | BSD-3 | CPU | Very fast, lower quality |
| noisereduce | Spectral gating (classic DSP) | MIT (checked) | CPU | Predictable and explainable. Good for "remove this hum". |
| **Demucs** (Meta) | Source separation: vocals, drums, bass, other. Hybrid Transformer gives 9.0 dB SDR on MUSDB HQ. | MIT (checked) | 3–7 GB GPU, or CPU at about 1.5× track length (README) | **Repo archived 1 Jan 2025, unmaintained.** A fork at adefossez/demucs gets only important fixes. Built for music. Voice vs background works, but "isolate the siren" does not. |
| Spleeter (Deezer) | 2, 4 or 5-stem music separation | MIT (checked) | CPU/GPU | Older, music only |
| audio-separator | Wrapper for many UVR / MDX / Demucs models | MIT wrapper (checked); model licences vary | GPU | Check each model's licence |
| Text-queried separation (e.g. AudioSep, "separate anything you describe") | "Extract the dog barking" | check | GPU | Research quality. Interesting for the paint-a-sound idea. Treat as experimental. |

**Pitfall.** Every cleaning step changes the evidence. Cleaned audio is a *derived* file. Transcribe the original and the cleaned version, and show both. Denoisers can also remove quiet speech or invent speech-like sounds.

#### Speech to text

| Tool | What it does | Licence | Hardware | Notes |
|---|---|---|---|---|
| **Whisper** (OpenAI) | Multilingual speech recognition and translation to English. About 99 languages. | Code MIT. large-v3 weights Apache-2.0, large-v3-turbo MIT (checked). | GPU for large models. CPU works for small ones. | |
| **faster-whisper** (CTranslate2) | Same models, faster and with less memory. int8 on CPU. | MIT (checked) | CPU or GPU | The README claims up to 4× faster than openai/whisper at the same accuracy. Recommended engine. |
| **WhisperX** | Adds word-level timestamps (wav2vec2 forced alignment), VAD and pyannote diarization | BSD-2 (checked) | GPU recommended | Word timestamps are what make "exact quote + locator" possible for audio |
| whisper.cpp | C/C++ port, runs well on CPU and Apple silicon | MIT | CPU | Alternative engine |
| Silero VAD | Finds speech regions | MIT (checked) | CPU | Run first to skip silence and reduce hallucination |
| NVIDIA Parakeet / Canary | Strong English and EU-language ASR | CC-BY-4.0 (checked) | GPU, NeMo stack | Heavier dependency |

**Pitfalls**
- **Whisper hallucinates.** *Careless Whisper* (FAccT 2024) found that about 1% of transcriptions contained whole invented phrases, some of them violent (https://www.news.cornell.edu/stories/2024/06/ai-speech-text-can-hallucinate-violent-language ; paper https://arxiv.org/abs/2402.08021). Hallucinations cluster in silence and noise. Mitigations: run VAD first; show per-word confidence; flag segments with no speech energy; never let a transcript quote become evidence without a person listening to that clip.
- Accuracy drops for accented, overlapping, far-field and low-resource-language speech.
- Translation to English is a separate machine output and must be labelled as such.

#### Speaker diarization (who spoke when)

| Tool | Licence | Hardware | Published accuracy |
|---|---|---|---|
| **pyannote.audio 4.x + speaker-diarization-community-1** | Library MIT; community-1 weights **CC-BY-4.0** (checked). A Hugging Face token is needed to *download* once, after which it runs fully offline from a local copy. | CPU works, GPU faster | DER: AMI 17.0%, VoxConverse 11.2%, CALLHOME 26.7% (model card). The paid "precision-2" model is better. |
| pyannote speaker-diarization-3.1 (legacy) | MIT, gated | CPU/GPU | slightly worse |
| SpeechBrain ECAPA speaker embeddings | Apache-2.0 (checked) | CPU | Compare voices across files. See the ethics note. |

**Pitfalls.** Diarization labels voices "Speaker 1, 2…" within a file. It does not name anyone. Matching a voice *across* recordings to a named person is voice biometrics. Treat it like face recognition (2.9).

#### Language and accent identification

| Tool | What it does | Licence | Published accuracy | Notes |
|---|---|---|---|---|
| Whisper language detection | Built into Whisper | MIT/Apache | not separately benchmarked here | Free by-product of transcription |
| **SpeechBrain lang-id-voxlingua107-ecapa** | 107 languages | Apache-2.0 (checked) | 6.7% error on the VoxLingua107 dev set | The card warns: worse on small languages, women's speech, children, and **speech with a foreign accent**. Some codes are outdated (iw→he, jw→jv). |
| Meta MMS-LID | Over 100 languages (126 to thousands, depending on the model) | **CC-BY-NC-4.0** (checked) | | Non-commercial |
| **CommonAccent** (Jzuluaga/accent-id-commonaccent_ecapa) | 16 English accents (African, Australian, Bermudian, Canadian, English, Hong Kong, Indian, Irish, Malaysian, New Zealand, Philippine, Scottish, Singaporean, South Atlantic, US, Welsh) | MIT (checked) | 87% on its own test set | Most errors are between close accents (US vs Canadian). Only English. Common Voice is read speech from volunteers. |

**Reliability and ethics of accent detection.** Accent ID is the weakest and most dangerous capability on Ony's list.
- Accent is not nationality, ethnicity or origin. People move, mix and code-switch.
- Benchmarks use clean read speech, and real recordings are noisy and spontaneous.
- Machine "accent analysis" for asylum decisions (LADO) is criticised by linguists, and similar tools used by migration authorities have drawn heavy criticism.

A published claim like "the speaker has an X accent, so they are from Y" would be very hard to defend.

**Recommendation.** Include language ID as a normal proposal. Include accent ID **only** as an opt-in "listening aid" that:
- proposes a few broad possibilities with scores;
- shows the model's coverage (16 English accents only) and its known confusions;
- cannot become a confirmed fact about a person without a note naming a human expert (a linguist or native speaker) who agreed.

The UI wording should say "sounds similar to recordings labelled …", not "is from …".

#### Sound event recognition and search

| Tool | What it does | Licence | Published accuracy | Notes |
|---|---|---|---|---|
| **YAMNet** (Google) | 521 AudioSet classes (gunshot, siren, speech, vehicle, explosion…) every ~0.5 s. MobileNet-v1, 16 kHz. | Apache-2.0 (TF models repo; check the TF Hub page for the model itself) | | Small, fast on CPU. Good default tagger. |
| **PANNs** (CNN14 etc.) / panns-inference | AudioSet tagging and sound event detection | MIT (checked) | | Stronger than YAMNet, still CPU-friendly |
| AST (MIT/ast-finetuned-audioset) | Audio Spectrogram Transformer tagging | BSD-3 (checked) | AudioSet mAP 0.459 (in model name) | GPU helpful |
| BEATs (Microsoft) | Strong AudioSet tagger | MIT (unilm repo, check) | | |
| **CLAP** (LAION) | Text-to-audio search: type "call to prayer" or "helicopter" and get matching moments | Repo CC0-1.0, HF weights Apache-2.0 (checked) | ESC-50 ~90–93% R@1 reported, but the authors note that run included ESC-50 data in training | Best fit for "find every siren in 40 hours of audio". Real recordings will score lower. |
| msclap (Microsoft CLAP) | Same idea | MIT (checked) | | Alternative |

**Pitfalls**
- AudioSet labels come from YouTube clips. **"Gunshot" is often confused with fireworks, door slams, car backfires and construction.** Treat every hit as "listen here".
- Tagging scores are not calibrated probabilities. Show the ranking and let the journalist set a threshold.
- Rare, culturally specific sounds (a particular call to prayer, a specific siren pattern) need the user's own reference clips. Use CLAP or embedding similarity against those clips.

#### Gunshot and explosion acoustics
The established methods are physics, not machine learning:
- **Shooter distance** from the gap between a supersonic bullet's shock wave ("crack") and the muzzle blast ("bang"), given bullet speed and the speed of sound. Forensic Architecture used this for Shireen Abu Akleh, and Robert Maher's papers explain the physics and its limits (e.g. https://www.montana.edu/rmaher/publications/maher_ieeedsp_0906_257-261.pdf).
- **Rate of fire and shot count** from onset times, which separates automatic from semi-automatic fire.
- **Explosion distance** from the delay between seeing a flash or smoke and hearing it (speed of sound about 343 m/s at 20 °C).

The app can provide a **guided calculator**:
1. mark the crack and the bang on the waveform;
2. pick or enter an ammunition velocity, with a range;
3. enter the temperature (from historical weather);
4. get a distance with an error band.

Pitfalls: echoes, microphone clipping, phone audio processing (automatic gain, noise suppression), and unknown ammunition. Results must carry their assumptions and should be checked by an acoustics expert before publication.

#### Electrical network frequency (ENF)
Mains hum (50 or 60 Hz) wanders slightly over time, and recordings near mains power or plugged into it can capture that pattern. Matching it against a grid's frequency log can, in principle, date a recording and indicate which grid it was made on (research overview: https://drum.lib.umd.edu/handle/1903/14790).
- **Reference data:** Great Britain's NESO publishes **1-second grid frequency data since January 2020** under its open data licence (https://www.neso.energy/data-portal/system-frequency-data). I did not find an equivalent free, open, second-by-second public archive for the US interconnections. Research networks such as FNET/GridEye exist, but I did not confirm public access, so this is an open question.
- **Pitfalls:** many recordings, especially battery-powered phone recordings outdoors, have no usable ENF; compression removes it; and matching needs long clips (minutes). This is specialist work.

**Recommendation:** a later "advanced" item at most. A simple "hum detector" (is there a 50 or 60 Hz trace, and which?) is cheap, though, and already tells you which grid region the recording is consistent with.

#### Audio-visual sync and voice-clone detection
- **Sync:** SyncNet-style lip-sync models (research code, licence to check) score whether lips match speech. Simpler, explainable checks: line up visible events (a door slam, a muzzle flash) with audio onsets, and show the offset.
- **Voice cloning:** see 2.4. Detectors generalise badly. Prefer provenance and context (who released the clip, the earliest copy, whether the person or their staff confirm or deny it, room acoustics consistency, breathing and edit points in the spectrogram).

### 2.9 Faces

**What is safe and useful**
- **Face *detection* for blurring** to protect bystanders, sources and minors in published or shared material. Tools:
  - **deface** (MIT, checked), automatic face anonymisation for images and video;
  - **MediaPipe** face detector (Apache-2.0, checked);
  - **YuNet** in OpenCV Zoo (licence to check).
- **Within-investigation clustering without names** ("these 14 frames show the same unknown person, A"). This helps a journalist follow one person through footage. It is still biometric processing, so make it opt-in per investigation, keep it local, and never link clusters across investigations.

**What to exclude**
- **Face *recognition* against outside databases or the web** (Clearview-style, PimEyes-style).

**Why**
- **GDPR Art. 9** classes "biometric data for the purpose of uniquely identifying a natural person" as special-category data. **Art. 85** leaves journalism exemptions to each member state, so protection varies.
- The **EU AI Act** bans building facial-recognition databases by untargeted scraping.
- In the US, **Illinois BIPA** creates private lawsuits over biometric identifiers. Indiana's Consumer Data Protection Act took effect on 1 January 2026, treats biometric data as sensitive, and applies to for-profit businesses that handle data of 100,000 or more Indiana consumers (https://www.hunton.com/privacy-and-information-security-law/indiana-privacy-law-to-take-effect-january-1-2026). It probably doesn't reach a solo journalist, but it would matter for a future multi-user or community product.
- The **Berkeley Protocol** says identification from human features needs a trained forensic expert (para. 188).
- The **SPJ Code of Ethics** says to minimise harm.

**Model licences**
- InsightFace's **code is MIT, but its pretrained models are for non-commercial research only.** Its buffalo_l recognition pack and face-swap models need a commercial licence (project README). That is another reason to leave recognition out.
- deepface (MIT wrapper) downloads models with mixed licences.

**Recommendation**
- **Build:** face detection for blurring (on by default when exporting media), and an anonymous within-investigation "same person?" helper as an opt-in.
- **Exclude:** naming people from faces, outside face search, cross-investigation face indexes, and emotion, age or "ethnicity" estimation. All are unreliable, and some are illegal in places.
- **If Ony ever wants identification:** a person does it by comparing against public, sourced photos, and records the reasoning as a normal evidence proposal.

---

## 3. Chain of custody

This builds on the app's existing **Chain of Custody** feature and follows the Berkeley Protocol (section 1).

### Rules
1. **Originals are never modified.**
   - On arrival (through The Drop, an upload, or OpenAleph), compute SHA-256 and store the bytes content-addressed, for example `originals/sha256/ab/cd/<hash>`, on a read-only path.
   - Record who added it, when (NTP-synced server time), how (upload, URL capture, OpenAleph id), the source URL and capture method, and the original filename.
   - This is the *evidentiary copy* (Protocol paras. 168–169).
2. **Everything else is a derived file.**
   - Thumbnails, proxies, extracted audio, keyframes, denoised audio, separated stems, stabilised video and enhanced frames are all derived.
   - Each derived file stores its parent hash, its own hash, the operation, all parameters, and the tool, version and model with the model file's hash.
   - The UI labels derived files clearly ("Derived: DeepFilterNet 3, from original ab12…").
   - Derived files can be deleted and rebuilt.
3. **Every machine output is a proposal.**
   - Proposals include a transcript segment, a sound tag, a detected object, a language guess, a GeoCLIP region and a metadata date.
   - Each stores the model name, version and weights hash, the parameters, the job id, the run time, the device (CPU/GPU) and a confidence where the model gives one.
   - Each has a **locator** into the original: time range, bounding box, frequency band, page, or word indices.
   - It stays "proposed" until a person confirms, edits or rejects it. This is the same flow the app already uses for documents.
4. **Runs can be repeated.** Pin model versions. A "re-run with the same settings" button shows whether the output matches. A "re-run with a newer model" button keeps both runs and shows the differences. Store random seeds where models use them.
5. **Fixity checks.** A scheduled job re-hashes a sample of originals and reports any mismatch (para. 172). Support the 3-2-1 backup guidance in the docs.
6. **Collection record.** For URL captures, store what Annex IV asks for: URL, HTML, screenshot, collection package hash list, and the tools and time service used. Auto Archiver's approach (MIT) is a useful reference. It could be called or vendored for link capture.
7. **Export package.** One click produces a folder or ZIP for an editor or lawyer. It contains the original, the chosen derivatives, a manifest (JSON plus a readable PDF) listing every hash, step, model and version, the confirmed findings with their locators, and the custody log. This is the "explainable in court" requirement (para. 25). Optionally the app can add its own C2PA manifest to exported derived files, so others can see they were processed.

### Suggested data model (sketch)

| Table | Key fields |
|---|---|
| `media_original` | id, sha256 (unique), size, mime, duration/dimensions, storage_path, acquired_at, acquired_by, acquisition_method, source_url, openaleph_entity_id, original_filename |
| `media_derivative` | id, parent_id (original or derivative), sha256, operation, params_json, tool, tool_version, model_id, model_sha256, job_id, created_at |
| `analysis_run` | id, media_id, analyzer (e.g. `asr.faster_whisper`), model_id, model_version, model_sha256, params_json, device, started/finished, status, log |
| `media_observation` (a proposal) | id, run_id, kind (transcript_segment, sound_event, object, text, language, accent, geo_guess, metadata_claim, duplicate_of, face_cluster…), value_json, confidence, locator_json (t_start, t_end, bbox, freq_lo/hi, words), reasoning, status (proposed / confirmed / edited / rejected), reviewed_by/at, review_note |
| `custody_event` | id, media_id, actor, action (acquired, hashed, viewed, exported, derived, verified_fixity…), at, details_json |

Confirmed observations then feed the existing objects (section 4.4).

---

## 4. Recommendation for the app

### 4.1 Build order

**Phase 1: Foundations.** Cheap, CPU-only, and needed by everything after.
1. **Original intake and custody.** SHA-256, content-addressed originals, the derivative table, custody events, and a proxy and thumbnails for the browser.
2. **Metadata reader.**
   - Tools: ExifTool, ffprobe, c2patool/c2pa-python.
   - Shown as "the file claims…" proposals: capture date (pre-fills the picture-evidence date that is now typed by hand), GPS (proposes a Place), device, software, C2PA status.
   - Includes warnings: "platform-stripped", "time zone unknown", "edited with …".
3. **Duplicates and near-duplicates.** PDQ or pHash for images, videohash or keyframe hashes for video. Proposes "same as" links across the investigation and OpenAleph.
4. **Transcription with word timestamps.**
   - Pipeline: Silero VAD, then faster-whisper, with optional WhisperX alignment.
   - Language ID comes free.
   - Transcript quotes become **exact quotes with time locators**, the audio equivalent of document quotes, and are confirmed by listening.
5. **Keyframes and shots.** PySceneDetect plus FFmpeg, with a contact sheet and per-keyframe "search on…" buttons.

**Phase 2: Listening and looking.**
6. **Speaker diarization** (pyannote community-1), shown as speaker lanes on the transcript.
7. **Cleaning.** DeepFilterNet for speech, noisereduce for hum and steady noise, Demucs for voice vs background. All produce derived files.
8. **Sound events.** YAMNet or PANNs timeline tags, plus **CLAP text search** ("find sirens") across all media in the investigation.
9. **OCR upgrade for scene text.** PaddleOCR next to the existing OCR, with multi-script support. Applies to keyframes too.
10. **Open-vocabulary "find in frames".** OWLv2 or Grounding DINO: type "flag" or "police car" and get boxes across frames.
11. **Face blur on export** (deface or MediaPipe).

**Phase 3: Placing and timing.**
12. **Sun and shadow tool.** SunCalc in the browser, plus ShadowFinder logic.
13. **Weather check** through Open-Meteo, behind the outside-lookup toggle.
14. **Map feature search** through Overpass: public instance behind the toggle, or a regional extract offline.
15. **GeoCLIP "region hint"** (MIT), clearly labelled as weak. StreetCLIP only if the non-commercial licence is acceptable.
16. **VLM clue lister** through the existing Ollama adapter (Qwen2.5-VL / Qwen3-VL, Apache-2.0). Every clue must point to a box.
17. **Guided calculators:** speed from frames, shooter distance from crack and bang, explosion distance.
18. **Multi-clip sync** by audio cross-correlation.

**Phase 4: Experimental or specialist.** Opt-in, clearly labelled.
19. Accent ID (CommonAccent), with the safeguards in 2.8.
20. Forensic filters: ELA, noise, clone detection, plus TruFor if its licence allows.
21. AI-generated or voice-clone "signals", never verdicts.
22. Hum and ENF detection; full ENF matching only with GB data, or US data if a source is found.
23. Anonymous within-investigation face clustering.
24. Text-queried sound separation ("isolate this sound"). This is research quality today.

### 4.2 Architecture sketch

This fits what exists: FastAPI, PostgreSQL, Procrastinate background jobs, the Ollama adapter with its local-only guard, and Docker + OpenAleph.

```
           The Drop / upload / OpenAleph entity / URL capture
                              │
                     ┌────────▼────────┐
                     │  intake job     │  SHA-256, store original read-only,
                     │  (CPU, fast)    │  custody event, ffprobe/ExifTool/C2PA,
                     └────────┬────────┘  proxy + thumbnails, perceptual hash
                              │ enqueue per-media "analysis plan"
         ┌────────────────────┼─────────────────────────┐
         ▼                    ▼                         ▼
  media-cpu queue       media-gpu queue            lookup queue
  (always on)           (only if GPU worker       (only if outside lookups
  VAD, faster-whisper   registered; else falls     are on for this
  int8 small/medium,    back to CPU or waits)      investigation):
  YAMNet/PANNs,         whisper large-v3(-turbo),  Open-Meteo, Overpass,
  DeepFilterNet,        pyannote, Demucs, OWLv2,   reverse-search links
  PySceneDetect,        CLAP index, GeoCLIP,
  PaddleOCR, hashes     VLM via Ollama
         │                    │                         │
         └──────────┬─────────┴─────────────────────────┘
                    ▼
     analysis_run + media_observation rows (status = proposed)
     derived files → media_derivative (content-addressed)
                    │
                    ▼
     Review UI → confirm / edit / reject → evidence, claims, events, places
```

**Design points**
- **A separate media worker container** (`media-worker`) with its own Python environment. Torch, CTranslate2 and FFmpeg are heavy and should not bloat the API image. It has two profiles, `cpu` (default) and `gpu` (NVIDIA; on Windows this means Docker Desktop with WSL2 GPU support). Jobs say what they need. Procrastinate queues route them.
- **Models download on demand into a `models/` volume,** with a manifest (name, version, source URL, licence, SHA-256, size). The first use of a model shows a card: "This needs Whisper large-v3-turbo (1.6 GB, MIT). Download?" Once downloaded, runs are fully offline. pyannote's one-time token step is handled the same way. Settings → Models lists everything installed, its licence and its disk use. This fits Ony's wish to see and operate the backend from the app.
- **All local by default.** Nothing leaves the machine unless the investigation's outside-lookup toggle allows it, and every outside call is logged in Paper Trail like other lookups.
- **Hardware tiers** (rough guide, to be measured on Ony's machine):
  - CPU only: metadata, hashes, VAD, faster-whisper small/medium int8 (slower than real time on long files), YAMNet/PANNs, DeepFilterNet, OCR, SunCalc.
  - 8 GB GPU: adds large-v3-turbo, pyannote, Demucs, OWLv2, CLAP, GeoCLIP, a 7B VLM quantised.
  - 16 GB+ GPU: larger VLMs and faster everything.
- **Long media:** chunk the work, store partial results, allow resume, and show progress in the existing jobs view.
- **Analysis plans are presets.** "Quick look" covers metadata, hashes, keyframes and language. "Full listen" covers transcript, speakers, sound tags and CLAP index. "Place it" covers VLM clues, GeoCLIP, sun and weather. The AI assistant can *propose* a plan and give its reasoning ("this is a 40-minute Arabic-language video with gunfire, so I suggest …"), and Ony approves it under the three research-automation settings he chose.

### 4.3 How the suite relates to OpenAleph
OpenAleph stays the core ingestion and search store, as decided. The media worker reads the original from the Workbench's own content-addressed store (or fetches it from OpenAleph once and hashes it). Confirmed transcripts can be written back to OpenAleph as text, so they become searchable alongside documents. Whether the installed OpenAleph version already offers any transcription should be checked, to avoid doing the work twice.

### 4.4 How outputs become app objects
| Media output (after confirmation) | Becomes |
|---|---|
| Transcript span with word timestamps | **Evidence** with exact quote + locator `media:<sha>#t=812.4-819.9`. Supports or contradicts **claims**. |
| Speaker label, named by a person | Link from evidence to a **party** (named by a human, never by voice matching) |
| EXIF/C2PA capture time; chronolocation result | **Event** date or time, with uncertainty range and a "how we know" note. Disputed if sources disagree. |
| GPS / geolocation result | **Place** with coordinates and a precision radius. The method is recorded (EXIF, matched skyline, OSM features + sun). |
| Duplicate / earlier copy found | Link "same media as" between sources. Earliest-known-copy note in Chain of Custody. |
| Sound event ("gunfire at 00:13:02, 7 shots") | **Event** candidate + evidence clip |
| OCR'd sign, plate or uniform text | Evidence with bbox locator. Can support a place or a party. |
| Detected object / symbol | Evidence with bbox. Can feed **Red Flags** indicators (e.g. a uniform or insignia linked to a unit). |
| Language (and, opt-in, accent hint) | Attribute on the media and the transcript, not on the person, unless a human confirms with a named expert note |
| Enhanced / cleaned file | **Derived media** attached to the original, never evidence by itself |

### 4.5 What to leave out
- Face recognition or identity search against outside sources, and emotion, age, gender or ethnicity estimation.
- A "fake / real" verdict from any detector.
- Automatic outside reverse-image uploads.
- Voice-print matching of a named person across recordings, unless a person does it with an expert.
- Using enhanced or super-resolved images to read plates or text, or to identify people.
- Ultralytics YOLO (AGPL) and non-commercial models (StreetCLIP, MMS, TruFor, InsightFace models) *unless* Ony decides the app will never be commercial or redistributed. This affects the planned community product.

---

## 5. Interaction ideas (proposals)

These are proposals for mockups, in keeping with the redesign direction: dark but never black, cream text, one screen, motion. Nothing is decided.

1. **Evidence strip.** One horizontal, scrubbable strip shows every media item in the investigation on a shared real-world clock: photos as ticks at their (claimed or confirmed) times, and videos and audio as bars. Scrubbing plays every overlapping item at that moment. Uncertain times show as a soft blur along the strip, not a hard tick. Confirmed sync offsets snap clips together with a small animation. This is the media lane of Ony's "very dynamic timeline".
2. **Paint-to-isolate spectrogram.** Show audio as a spectrogram. The journalist paints over a sound (a siren's rising band, a voice) with a brush. The app plays only the painted region (a classic spectral mask, so it is explainable) and offers "find more like this" (CLAP or embedding search) and "make a derived clip". The painted mask is saved as the locator.
3. **Skyline drag.** On a map, drop a pin and drag it. A 3D terrain or building outline (from OSM building heights and elevation, where available) is drawn from that viewpoint and laid over the photo's skyline. The match score rises as the outlines line up. It confirms a place with a visible "why".
4. **Sun-dial overlay.** On a photo, the journalist draws a line along one object and its shadow. A sun-dial ring on the map, and a time-of-day dial, show every place and time that fits. Moving the date animates the ring. Adding a second shadow narrows it. Historical weather icons appear on the dial for the candidate hours (behind the lookup toggle).
5. **Proposal margin.** Next to any media, a slim margin lists the machine's proposals ("possible siren 02:14", "text: 'POLICE' at top left", "language: Arabic 0.91"). Hovering lights up the exact region or moment. One key confirms and another rejects. This is the propose-then-confirm flow, brought to media.
6. **Transcript you can hear the confidence of.** Low-confidence words are underlined faintly, segments with no speech energy (possible hallucination) are marked, and clicking any word plays from that point. Confirmed quotes turn into evidence chips that can be dragged onto a claim.
7. **Derivation tree.** For any file, a small tree shows the original at the root and each derived file as a branch, labelled with tool and version. Clicking a branch compares it with the original by wipe. Exporting the tree gives the custody manifest.
8. **"Where did this come from?" ripple.** When a near-duplicate or earlier copy is found, the strip draws a ripple from the earliest copy to later ones, showing how the image travelled.
9. **Clue board for a single frame.** A frame is pinned in the centre and clues orbit it (sign text, flag, shadow angle, vegetation, VLM notes). The journalist drags clues onto map, time or party targets. Clues that disagree drift apart and show a red thread. This makes "combine weak signals" visible.
10. **Listen-and-mark gunfire.** The waveform zooms to impulses automatically. The journalist taps crack and bang, and the distance calculator shows the result as a ring on the map around the camera position, with an error band.

---

## 6. Open questions for Ony

1. **Hardware.** What GPU does the main machine have, if any, and how much VRAM? (Docker on Windows needs WSL2 for NVIDIA GPU passthrough.) This sets which models are realistic and how fast transcription will be.
2. **Licences and the future.** Will the Workbench ever be sold, offered as a hosted service, or redistributed to the planned community? If yes, leave out non-commercial models (StreetCLIP, MMS-LID, TruFor, InsightFace models) and AGPL components (Ultralytics, and possibly Overpass and Open-Meteo if self-hosted), or keep them as optional user-installed add-ons.
3. **Faces.** Do you agree with: blur on export (on by default), opt-in anonymous "same person" clustering within one investigation, and no face recognition? Or do you want clustering left out too?
4. **Accent ID.** Include it as an opt-in, heavily caveated "listening aid", or leave it out until a better, wider model exists? Today the main open model covers only 16 English accents.
5. **Reverse image search.** Is "open in your browser" buttons (nothing sent automatically) acceptable? Or do you want an optional paid TinEye API key, like the other paid sources?
6. **Model downloads.** Should the first-run tutorial offer a "media starter pack" download (about a few GB: Whisper turbo, pyannote, YAMNet, DeepFilterNet, OCR) or download each model on first use?
7. **Storage.** Originals are kept forever and derived files can be rebuilt. Is there a disk budget? Should old derived files be cleaned up automatically?
8. **URL capture.** Should the suite also *collect* media from links (social posts, YouTube) with a Berkeley-style collection record, for example by wrapping Bellingcat's Auto Archiver or yt-dlp? Or is that out of scope, with only uploads and OpenAleph?
9. **Languages.** Which languages matter most for your work (English, Spanish, Arabic…)? That decides model sizes and whether to add a stronger English-only engine.
10. **Name.** Should the media suite get one of the few slang names reserved for main features? One possible candidate is **"The Darkroom"**, which fits a photographer-journalist and the idea of developing evidence. This is only a suggestion.
11. **Exports.** When cleaned audio or blurred video is published, should the app attach C2PA credentials saying what was done, so others can see it was processed?
12. **ENF.** Is timing recordings from mains hum worth pursuing for US material, given I found no free public US second-by-second grid archive? (GB data is public.)

---

## 7. Sources

Standards and newsroom practice
- Berkeley Protocol, OHCHR publication page: https://www.ohchr.org/en/publications/policy-and-methodological-publications/berkeley-protocol-digital-open-source · PDF: https://www.ohchr.org/sites/default/files/2024-01/OHCHR_BerkeleyProtocol.pdf · Berkeley HRC page: https://humanrights.berkeley.edu/programs-projects/tech-human-rights-program/berkeley-protocol-digital-open-source-investigations
- Bellingcat toolkit: https://bellingcat.gitbook.io/toolkit · launch: https://bellingcat.com/resources/2024/09/24/bellingcat-online-investigations-toolkit
- Bellingcat ShadowFinder: https://bellingcat.com/resources/2024/08/22/shadow-geolocate-geolocation-locate-image-tool-open-source-bellingcat-measure · shadows method: https://www.bellingcat.com/resources/2021/05/18/unsure-when-a-video-or-photo-was-taken-how-to-tell-by-measuring-the-length-of-shadows/
- Bellingcat OSM Search: https://bellingcat.com/resources/how-tos/2023/05/08/finding-geolocation-leads-with-bellingcats-openstreetmap-search-tool
- Bellingcat Auto Archiver: https://www.bellingcat.com/resources/2025/08/13/the-open-source-tool-that-has-preserved-150000-pieces-of-online-evidence/
- InVID-WeVerify (Bellingcat toolkit entry): https://bellingcat.gitbook.io/toolkit/more/all-tools/invid.md
- Amnesty Citizen Evidence Lab: https://citizenevidence.org/about-us/
- NYT Visual Investigations (Malachy Browne's tools): https://gijn.org/my-favorite-tools-malachy-browne
- BBC Verify: https://pressgazette.co.uk/news/bbc-verify/
- Forensic Architecture, Shireen Abu Akleh audio report: https://content.forensic-architecture.org/wp-content/uploads/2022/11/2022.11.02_Final-Audio-and-Acoustic-Analysis-SAA-Report.pdf · synthetic data paper: https://arxiv.org/abs/2004.01030
- WITNESS Video as Evidence: https://vae.witness.org/ · https://library.witness.org/product/video-as-evidence-compiled-sections/
- Verification Handbook 3: https://datajournalism.com/read/handbook/verification-3

Provenance, forensics, detection
- C2PA open-source SDKs: https://opensource.contentauthenticity.org/docs/introduction
- Google Pixel 10 C2PA: https://blog.google/security/pixel-android-trusted-images-c2pa-content-credentials/
- FotoForensics ELA tutorial: https://fotoforensics.com/tutorial-ela.php
- Sherloq: https://github.com/GuidoBartoli/sherloq
- TruFor: https://github.com/grip-unina/TruFor · paper https://arxiv.org/abs/2212.10957
- Deepfake-Eval-2024: https://arxiv.org/abs/2503.02857
- Audio deepfake generalisation: https://arxiv.org/abs/2203.16263
- Bing Search API retirement: https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement
- TinEye MatchEngine: https://services.tineye.com/MatchEngine

Geolocation and chronolocation
- GeoCLIP: https://github.com/VicenteVivan/geo-clip · paper https://arxiv.org/abs/2309.16020
- StreetCLIP: https://huggingface.co/geolocal/StreetCLIP
- PIGEON: https://arxiv.org/abs/2307.05845 · repo (weights not released): https://github.com/LukasHaas/PIGEON
- Open-Meteo: https://github.com/open-meteo/open-meteo

Audio
- Demucs (archived): https://github.com/facebookresearch/demucs
- pyannote community-1: https://huggingface.co/pyannote/speaker-diarization-community-1
- SpeechBrain VoxLingua107 language ID: https://huggingface.co/speechbrain/lang-id-voxlingua107-ecapa
- CommonAccent: https://huggingface.co/Jzuluaga/accent-id-commonaccent_ecapa
- YAMNet: https://www.tensorflow.org/hub/tutorials/yamnet
- LAION CLAP: https://github.com/LAION-AI/CLAP
- Whisper hallucinations (Careless Whisper): https://arxiv.org/abs/2402.08021 · https://www.news.cornell.edu/stories/2024/06/ai-speech-text-can-hallucinate-violent-language
- Gunshot acoustics (R. Maher): https://www.montana.edu/rmaher/publications/maher_ieeedsp_0906_257-261.pdf
- ENF research overview: https://drum.lib.umd.edu/handle/1903/14790 · GB grid frequency data: https://www.neso.energy/data-portal/system-frequency-data

Faces and law
- InsightFace licence terms: https://github.com/deepinsight/insightface
- Indiana Consumer Data Protection Act: https://www.hunton.com/privacy-and-information-security-law/indiana-privacy-law-to-take-effect-january-1-2026

Licences marked "checked" were read from PyPI (`pypi.org/pypi/<package>/json`) or Hugging Face (`huggingface.co/api/models/<id>`) on 11 Oct 2026. Items marked "check" were not confirmed.
