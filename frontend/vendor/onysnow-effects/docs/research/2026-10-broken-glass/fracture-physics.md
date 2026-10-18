# How window glass really breaks under impact: annealed float glass and laminated glass

Research for the OnySnow Studios broken-glass effect, 2 October 2026. The goal is a generator that a glass person would not reject. The owner's complaints were that the current cracks are "not how glass cracks", too repetitive and too consistent, do not go through the thickness or show on the pane's edges, and lack small debris. Every section below is written against those four complaints.

**How to read the tags**

- **[S]** is stated by the linked source. The wording is close to the source's.
- **[C]** is computed here, and the method is given. Most [C] numbers come from my own measurement of the 60 traced fracture patterns in the NIJ report (Appendix A of this document).
- **[O]** is something I saw in the reference photographs. The photo is named, and the list is in `reference-photos.md`.
- **[I]** is my inference from sourced mechanics. It is not directly stated anywhere I could read.
- **[U]** is unverified: I could not confirm it from a readable source.

The best single source was G. D. Quinn, *Fractography of Ceramics and Glasses*, 3rd ed., NIST SP 960-16e3 (2020), which is free ([PDF](https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.960-16e3.pdf)). It is cited below as "Quinn" with the guide's own page numbers.

---

## 0. The short version: what a generator must reproduce

These are the rules, with numbers. Sections 1 to 3 give the evidence.

**Against "repetitive and too consistent"**

1. **Identical blows do not give identical patterns.** The NIJ study broke 60 identical 203 × 203 mm window panes, nominally 3.2 mm thick, under controlled conditions. In 1,770 pairwise comparisons, no overall pattern was duplicated [S] ([Tulleners, Thornton & Baca 2013, NIJ 241445](https://www.ojp.gov/pdffiles1/nij/grants/241445.pdf)).
   - Ten panes were struck by the same 965 g round-tipped drop weight. They show 6 to 20 cracks crossing a 30 mm circle around the impact (median 6) [C].
   - The count is a wide, skewed random variable, not a constant. Most light breaks have 4 to 7 radials. A few have 15 to 20.
2. **How the pane is loaded matters as much as how hard it is hit.**
   - The same panes, held in a wooden frame and pressed slowly to failure at about 1.5 to 1.8 kN, had a median of 36 to 44 crack crossings at 20 mm and 120 to 142 at 50 mm [C].
   - The foam-backed drop-weight breaks with round and sharp tips had medians of 7 to 12 at the same radii [C]. The blunt tip, which needed the highest drops (6 to 7 ft), gave dense stars and fans from the edge: a median of 19 crossings at 10 mm and 27 at 20 mm, counting only panes where the circle fitted inside the pane [C].
   - The NIJ authors' own summary: "The fracture patterns produced using dynamic impact were much simpler than the fracture patterns produced using static pressure. The static pressure fracture patterns had more radial fractures and almost all contained concentric fractures" [S] (NIJ p. 60).
   - So a pane that bends a lot before it fails (framed, pushed, heavy blunt blow) gives a dense fan. A light, sharp or bouncing blow gives a sparse star.
3. **More speed gives only a few more radials.** For small, fast projectiles the number of radial cracks grows as the **square root of impact speed** and as the inverse cube root of fracture energy [S] ([Vandenberghe, Vermorel & Villermaux 2013, PRL abstract](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.110.174302); [APS Physics](https://physics.aps.org/articles/v6/48)). A hard blow should show up mostly as more forks, more rings, a bigger crushed zone and pieces knocked out, not as a hedgehog of radials.

**Against "glass doesn't crack this way"**

4. **Radial cracks** start at the impact on the face *opposite* the blow. They run outward, nearly straight but slightly wavy, at up to about 1.5 km/s [S].
   - Past a stress-dependent distance they **fork**. The fork distance is R_b ≈ (A_b/σ)², with A_b ≈ 2.3 MPa·m^½ for soda-lime glass. That gives about 13 mm at 20 MPa and about 2 mm at 50 MPa, and no forking at all below about 10 MPa [S, C].
   - The fork angle averages about 114° (± 16°) where the stress is equal in all directions. It falls to about 52° (± 7°) where one stress is half the other, and to about 32° (± 7°) where the stress is one-directional. Successive forks get narrower [S] (Quinn Table 4.1). Right under a central impact the far face is stressed about equally in all directions; further out, the stress becomes more one-directional [I].
   - In very energetic breaks, a swarm of close radials repel each other into a fan [S].
5. **Concentric cracks** start on the *struck* face [S]. They form only if the blow keeps pushing after the radials have formed, bending the wedge-shaped pieces [S].
   - They are short, nearly straight chords from one radial to the next. Each chord is **offset** where it meets a radial, so a "ring" is staggered, never a smooth circle [S].
   - In the framed 3.2 mm panes they clustered 20 to 45 mm from the impact (6 to 14 plate thicknesses), in the panes where the band could be measured (about 8 of 30). A second set ran parallel to the frame, just inside the rebate (about 7 of 30) [C].
   - They are rare in light breaks. The NIJ drop-weight panes "contained significantly less radial and concentric fractures" than the pressed ones [S] (NIJ p. 60), and most round- and sharp-tip tracings show none or only a few short links [O].
6. **A later crack stops where it meets an earlier one**, usually at about 90°: a T-junction. Cracks cross only when the first one had not yet gone through the whole thickness. Then the second one jogs or steps [S] ([Quinn §4.8](https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.960-16e3.pdf)).
7. **Long thin pieces between radials snap across** in bending. These are short "cross cracks" from one radial to the next [S] (Quinn Fig. 4.15).
8. **Wavy, meandering cracks belong to thermal breaks** (and to the very last stage of a break-up), not to impact radials [S].

**Against "cracks don't go through the thickness or show on the edges"**

9. **A crack that separates two pieces goes through the full thickness.**
   - Its faces are close to perpendicular to the pane. Window fragments' "cleavage surfaces were approximately perpendicular to the planar surfaces" [S] ([Fletcher, Richmond & Yelverton 1980, DTIC ADA105824](https://apps.dtic.mil/sti/pdfs/ADA105824.pdf)).
   - The faces carry curved **rib marks** (Wallner lines). On radial cracks these meet the rear face at right angles and lie nearly parallel to the front face. On concentric cracks it is the other way round [S].
   - **Twist hackle** steps appear where the crack front twisted [S].
   - Bending cracks curl into an oblique **lip** near the face that was in compression [S] ([ASTM C1256 §6.14](https://elitesafetyglass.com/wp-content/uploads/2021/04/ASTM-C1256-Standard-Practice-for-Interpreting-Glass-Fracture-Surface-Features.pdf)).
10. **The impact leaves a cone through the thickness.** For a blunt or round impactor, a ring crack forms just outside the contact and turns into the glass as a **Hertzian cone**.
    - The flank is about 22° to the surface under slow loading, about 31° at 150 m/s, and steeper still faster. The included angle is 125 to 135° when slow and 60 to 80° at 250 m/s [S].
    - The cone exits the far face as a **crater wider than the entry**. In 4.8 mm glass, steel balls at about 1 to 2 J left rear-face cones about 18 to 32 mm across around a hole only 1.3 to 2.9 mm wide [S] ([Kim et al. 2025](https://www.mdpi.com/2076-3417/15/1/386)).
    - A sharp impactor instead **crushes** the site to powder, with small fragments missing [S].
11. **Edges and sides.**
    - Where a crack reaches the pane's edge, it shows as a line across the edge face [I].
    - The pane's arris (the corner between face and edge) carries **shell-shaped conchoidal chips**. These come from contact, and very often from broken pieces rubbing against each other after the break. Such secondary chips are found on only one of two matching pieces [S] ([Quinn §4.15](https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.960-16e3.pdf); photos `cat-10-*`).

**Against "the tiny debris is missing"**

12. **Debris comes in four size classes**, each with its own source.
    - **Long daggers and needles** form between radials. In the densely cracked framed panes, the median piece larger than 20 mm² was about 5 times longer than wide, and 25 to 29% were more than 8 times longer [C].
    - **Polygonal chunks** form where rings cut radials, and next to the crushed zone [O].
    - **Grit and powder** come from the crushed zone [S].
    - A **backward spray** of fine particles: about 90% of the nearby particles measured 0.15 to 0.85 mm, 86% landed on the floor directly below the window, and the count fell 4 to 5 times every 45 cm further out [S] ([Luce, Buckle & McInnis 1991, abstract](https://ojp.gov/ncjrs/virtual-library/abstracts/study-backward-fragmentation-window-glass-and-transfer-glass)).
13. **Piece sizes follow a heavy-tailed distribution.**
    - In the NIJ tracings, piece areas span three to four decades. Between 10 and 2,000 mm² the number of pieces larger than A falls roughly as A^−0.5 in the drop-weight breaks and A^−0.8 in the framed ones. The curve bends: it is flatter for small pieces and steeper for large ones [C].
    - Thin glass plates crushed until fully fragmented give N(>m) ∝ m^−1 [S] ([Katsuragi, Sugino & Honjo 2004](https://ar5iv.arxiv.org/html/cond-mat/0409770)).
    - Near the energy needed just to break, the distribution looks log-normal instead [S].

**Laminated glass**

14. **Small stones break only the outer ply.**
    - A **bullseye** is a cone separated in the outer ply. It shows as a dark circle (trapped air) with the impact point in the middle.
    - A **half-moon** is a partial bullseye.
    - A **star break** has "legs" running out from the break.
    - A **combination break** mixes these.
    - Then there are cracks: short (≤150 mm) or long (>150 mm); edge cracks (reaching an edge); floaters (not reaching one); and stress cracks (from an edge, with no impact point).
    - All of these are defined in the US repair standard [S] ([ROLAGS definitions](https://rolags.com/definitions/); [ROLAGS 2007](https://www.nwrassn.org/documents/ROLAGS3-07.pdf)).
15. **Hard blows crack both plies.**
    - The ply on the tension (far) side goes first [S] ([Li et al. 2023, abstract](https://www.sciencedirect.com/science/article/abs/pii/S0272884222034265)).
    - Radial cracks start earlier and run faster than circular ones [S] ([Chen et al. 2013, abstract](https://www.sciencedirect.com/science/article/abs/pii/S0013794413003160)).
    - Cracks never pass through the PVB, so the two plies carry two separate, related crack networks [S, I].
    - The shards stay stuck to the PVB. Only the crushed area under the impactor sheds glass [S] ([Zemanová et al. 2020](https://proceedings.challengingglass.com/index.php/cgc/article/download/319/300/898)).
    - The result is a "spider web" of radials plus concentric rings, with a white crushed centre [S, O].

---

## 1. Annealed float window glass under a point impact

### 1.1 The material numbers that set the scales

| Quantity | Value for soda-lime-silica (window) glass | Source |
|---|---|---|
| Terminal crack speed | 1500–1600 m/s. Schardin et al. measured 1510; Kerkhof measured 1500–1520 for window and mirror glass. | [S] Quinn Table 5.1, p. 5-7; Appendix E, p. E-1 |
| Terminal speed vs. sound | "approximately one half the velocity of sound in the material" | [S] [ASTM C1256 §3.1.8](https://elitesafetyglass.com/wp-content/uploads/2021/04/ASTM-C1256-Standard-Practice-for-Interpreting-Glass-Fracture-Surface-Features.pdf) |
| Acceleration | A crack reaches half to full terminal speed "by the time the mirror-mist markings formed", within microseconds | [S] Quinn p. 5-4 |
| Ballistic impact | Individual crack segments did not exceed about 1480 m/s, but a "damage wave" of new cracks nucleated just behind the shock wave can sweep at 80–90% of the longitudinal wave speed | [S] Quinn Appendix E, pp. E-11–E-12 |
| Mirror-mist constant A_i | ≈ 1.8–2.1 MPa·m^½ (e.g. 1.89 Johnson & Holloway; 2.06 Duckworth; 1.8 Mecholsky) | [S] Quinn Appendix C, p. C-3 |
| Mist-hackle constant A_o | ≈ 2.0–2.4 MPa·m^½ | [S] same table |
| Branching constant A_b | 2.3 MPa·m^½ (Mecholsky, soda-lime silica, flexure). A_b is always larger than the mirror constants | [S] same table; Quinn p. 7-8 |
| Branching threshold | about 10 MPa. "Low stressed parts break into only two pieces"; below this there is no branching | [S] Quinn p. 7-2 and Fig. 7.1 (after Orr and Fréchette) |

**What these mean for drawing** [C]. Take the branch distance as R_b = (A_b/σ)² (Quinn eq. 7.3) and A_b = 2.3 MPa·m^½:

| Local stress σ | Run before the first fork, R_b |
|---|---|
| 10 MPa | 53 mm |
| 20 MPa | 13 mm |
| 30 MPa | 5.9 mm |
| 50 MPa | 2.1 mm |
| 100 MPa | 0.5 mm |

The mirror (smooth) zone of the fracture face is a little smaller, R_m ≈ (A_i/σ)². So a crack runs mirror-smooth for a short distance, turns misty, then hackled, and then forks.

Stress falls with distance from the impact. Forks are therefore dense near the impact and spread out further away. Out where the bending stress drops below about 10 MPa, a crack runs on unforked until it hits another crack or the frame.

### 1.2 The order of events

Two descriptions agree.

**Quinn's fractography summary** [S] ([Quinn §4.10, pp. 4-31–4-33](https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.960-16e3.pdf)):

1. "Blunt objects may create a Hertzian cone crack that penetrates partially or completely through the plate". The plate may stay essentially intact.
2. "At higher velocities, radial cracks may be generated from the impact site. Radial cracks also may be triggered by impact of sharp objects."
3. "The bending forces from the impact may cause the crack (once it is away from the immediate impact site) to run on the opposite side of the plate from the direction of impact."
4. "At even higher velocities, many radial cracks fan outward from the impact site. The continued loading of the plate causes the radially-fractured segments to bend inward, causing them to break in bending leading to circumferential secondary cracking. In these secondary fractures, the maximum tension is on the impacted side of the plate."
5. "These rings around the impact often have offsets at the radial cracks, confirming that the radial cracks occurred first." "Sometimes a secondary ring crack may step across a radial crack if the latter has not completely severed the plate."
6. A "very blunt object" may not crack the impact side at all. Bending puts the far side in tension and starts cracks from flaws there, or even from a flaw at the plate edge. "A crack runs to the impact site, and then radiates and branches repeatedly outward."

**The forensic textbook version** [S] ([Girard, *Criminalistics*, ch. 5 sample](https://samples.jbpub.com/9781284142617/9781284142617_CH05_Girard_SECURE.pdf)):

- "Radial cracks grow from the load point outward and from the unloaded side to the loaded side."
- "Tangential [concentric] cracks grow from one radial crack to another and from the loaded side to the unloaded side."
- The mechanism goes back to Matwejeff: the far side fails in tension first, giving radials. If the force is not used up, it "will push in on the radial fractures, causing tension on the near surface", giving concentric cracks "between the initial radial fractures" [S] ([NIJ 241445, pp. 18–19](https://www.ojp.gov/pdffiles1/nij/grants/241445.pdf)).
- Concentric cracks "were not invariably observed, but tended to be seen with greater applications of force". Tryhorn noted they "may be absent when the original force is insufficient to break out pieces of glass" [S] (same).

**Small blows, big blows** [S] (Quinn §4.5, p. 4-13): "A small pebble or BB gun shot creates only localized damage in a window, but a hurled brick will cause window bending in addition to localized impact damage."

**Timing** [I, from 1.1]. At about 1.5 km/s a radial crosses a 1 m pane in under 1 ms. Every crack therefore exists before the pane has visibly moved. Pieces start to fall afterwards. An animation should show the crack network appearing essentially instantly, perhaps with the concentric cracks a beat later (they form during "continued loading"), and only then the pieces moving.

### 1.3 The contact zone: Hertzian ring and cone, and the crushed zone

**Blunt or round impactors (ball, stone face, hammer face)** [S] (Quinn §6.7.5, pp. 6-39–6-43):

- "The cone crack initiates as a ring just outside the footprint of the two contacting bodies."
- "The contacting object is almost always several times larger than the observed ring size on the contacting surface."
- Ring cracks "initially pop in normal to the surface but then turn and propagate into the depth with an included angle of 125° to 135° for quasi static loading."
- "The included cone angle decreases markedly with increasing impact velocity". For example, "at 250 m/s, 0.8 mm to 1 mm diameter steel balls created 60° to 80° cone cracks in glass."
- "As load increases the footprint area may expand and generate multiple concentric ring and cone cracks."
- Oblique impacts give tilted cones, and sliding contacts give partial cones. Quinn's Fig. 6.36 is a profile sketch of each case.
- Fig. 6.39 shows real glass plates. In (a), a mild to moderate blunt impact made concentric cone cracks and the plate did not break. In (b), a severe impact made a cone plus radial cracks, and the plate broke.

**Measured cone angles.** For a 5.56 mm, 0.692 g steel sphere at 150 m/s on 3.3 mm soda-lime glass backed by polycarbonate:

- The cone-crack angle, "the angle between cone crack and the load surface", was about 31°, against about 22° under static loading [S] ([Wang et al. 2024, *Int. J. Fract.*, NSF accepted manuscript](https://par.nsf.gov/servlets/purl/10597886)).
- Two ring ("band") cracks formed on the strike face, at radii of about 4 mm and 6 mm [S] (same).

**Cone size on the far face.** In 4.8 mm low-emissivity float glass panes, 850 × 850 mm, struck by steel balls [S] ([Kim et al. 2025, *Appl. Sci.* 15:386, CC BY](https://www.mdpi.com/2076-3417/15/1/386)):

- 8 mm ball at 1.57 J: rear-face cone 32.1 × 26.9 mm, hole 2.9 × 2.8 mm.
- 10 mm ball at 0.92 J: rear-face cone 21.3 × 17.5 mm, hole 1.5 × 1.3 mm.
- Cones were slightly elliptical, with a max-to-min aspect of about 1.16 to 1.18.
- Damage became consistent above about 40 m/s for the 8 mm ball and about 21 m/s for the 10 mm ball.

A companion study on single 5 mm low-E panes, with a 4.16 g, 10 mm ball at 40 to 50 m/s (3.3 to 5.2 J [C]) [S] ([Kim 2025, *Appl. Sci.* 15:10898, CC BY](https://www.mdpi.com/2076-3417/15/20/10898)):

- At normal incidence the maximum cone diameter averaged 26.2 mm, about 5.7 to 6.4 mm per joule.
- At 80° incidence it was only 3.1 mm, and three of six panes did not break.
- The cone aspect stayed about 1.2 to 1.3 whatever the angle, while the hole elongated from 1.0 to 1.6 between 0° and 60°.
- The paper's title says "laminated", but its methods say single panes were tested.

[C] From the first study, the cone flank angle is atan(t / (R_base − r_hole)):

- 4.8 / (14.7 − 1.4) gives about 20°.
- 4.8 / (9.7 − 0.7) gives about 28°.

That fits the 22° static angle. **Rule of thumb: in 4 to 6 mm glass, a low-speed blunt hit leaves a cone whose base on the far face is about 4 to 7 plate thicknesses wide, around a much smaller hole.**

**Sharp impactors (a stone's point, a hammer's edge, a pick)** [S] (Quinn §6.7.4, pp. 6-36–6-37):

- They make median and radial cracks, and concentric "tertiary Wallner lines" on the fracture surface.
- "Median and radial cracks may penetrate deep below the impact site, which is often heavily damaged with small fragments missing."
- In the Fig. 6.33 caption: "In each case the impact site has been pulverized or crushed, unlike blunt impact sites."

**The crushed (comminuted) zone.** A review of dynamic damage in soda-lime glass describes complex patterns "including radial cracking, ring cracking and the development of a fracture conoid", and "a comminuted region of SLG with particulates and powder ahead of a projectile" [S] ([Bauer et al. 2022, *Glass Struct. Eng.* 7:569](https://link.springer.com/article/10.1007/s40940-022-00190-0), citing Chaudhri & Liangyi 1989).

- Phase-contrast imaging of impacted soda-lime-glass cylinders gave crack volume fractions of 0.9% at 72 m/s, 2.0% at 266 m/s and 3.8% at 407 m/s [S] (same).
- So the damaged volume fills with more and finer cracks as speed rises.
- I found **no source giving the crushed-zone diameter for a hammer or stone on a window** [U]. In the photographs it is a whitish disc a few millimetres to a few centimetres across, scaling with the size of the impactor [O] (`cat-03-*`).

**What this means for the generator**

- The impact point is a three-dimensional object, not a dot.
  - **Blunt hit:** a small contact ring on the struck face, a cone through the thickness, and a wider crater rim on the far face.
  - **Sharp hit:** a white pulverised pit with grit, and possibly a small hole.
- Several concentric ring and cone cracks can sit inside one another.
- The cone and pit are what most "impact star" photos show at the centre (`cat-02-*`, `cat-03-*`, `cat-12-bullseye`).

### 1.4 Radial cracks

**Where they start** [S]:

- On the face away from the blow, under bending (Quinn §4.10; Girard; Matwejeff via NIJ).
- For sharp contacts, also as median and radial cracks directly under the contact (Quinn §6.7.4).

**How many: physics.**

- Vandenberghe, Vermorel & Villermaux used a 4 mm steel cylinder at 10 to 120 m/s on glass and PMMA plates about 0.15 to 3 mm thick, filmed at 30,000 frames per second [S] ([APS Physics Focus](https://physics.aps.org/articles/v6/48); [Science News](https://www.sciencenews.org/article/counting-cracks-glass-gives-speed-projectile)).
- The number of radial cracks scaled as the square root of impact speed and the inverse cube root of fracture energy. In 1 mm PMMA there were 4 cracks at 22.2 m/s and 8 at 56.7 m/s, "with some scatter".
- The model balances bending elastic energy against fracture energy, Griffith-style [S] ([PRL abstract](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.110.174302)).
- The full scaling law, with its prefactor and plate-thickness dependence, is in the paywalled paper and **was not readable** [U].

**How many: empirical stress laws.**

- Quinn reports that the number of radial cracks rises with fracture stress [S] (Quinn §7.2.1, pp. 7-3–7-4).
  - Borosilicate disks, 76 × 5.4 mm, broken in ring-on-ring flexure: N = 0.047·σ^1.43, with σ in MPa and N counting radials that reach the rim.
  - Shand made "a similar graph counting radial cracks for 2.3 mm thick by 6 cm square window glass plates broken by impact in the middle", so a stress can be estimated from the count.
  - Shand's numbers are in a 1969 conference paper I could not read [U].
- **Shape of the law, not the numbers** [I]. Count grows faster than linearly with stress, and stress grows with deflection. For a generator: blow strength → bending stress → N, superlinear in stress but only about √ in impactor speed.

**How many: real panes.** These are my measurements on the NIJ tracings [C]; the method is in Appendix A. They are crack crossings on a circle around the impact. Merged lines make them underestimates close to the impact.

| 10 panes per series, 203 mm square, ~3.2 mm | crossings at r = 10 mm | 20 mm | 30 mm | 50 mm | 70 mm |
|---|---|---|---|---|---|
| 965 g drop weight, round tip, on 2" foam | 8 (5–21) | 7 (6–22) | 6 (6–20) | 7 (5–20) | 7 (6–17) |
| same, sharp tip (4 of 10 impacts near an edge) | 10 (6–23) | 10 (7–16) | 10 (7–16) | 12 (8–17) | 14 (10–24) |
| same, blunt tip (5 of 10 impacts near an edge)† | 19 (9–25) | 27 (13–49), 6 panes | 30 (16–51), 4 panes | 27 (18–36), 2 panes | 25, 1 pane |
| Pressed slowly in a wooden frame, blunt tip | 9 (5–21)* | 36 (21–59) | 76 (59–99) | 142 (109–163) | 121 (64–163) |
| same, round tip | 18 (4–29)* | 44 (28–66) | 70 (56–108) | 127 (65–157) | 117 (44–180) |
| same, sharp tip | 19 (7–31)* | 40 (31–62) | 72 (33–88) | 120 (29–150) | 101 (24–154) |

\* Too dense to resolve in the tracing. Lines merged into an ink blob or a hole.

† Circles that crossed the pane's edge were not counted, so the larger radii rest on few panes. Pane IDs and drop heights are from NIJ Tables 1 to 3 (pp. 51–52): A1–A10 round tip, broken from 2 to 6 ft; A11–A20 sharp tip, 5 to 6.5 ft; A21–A30 blunt tip, 6 to 7 ft.

Reading across the rows:

- **Light drop-weight breaks (round and sharp tips).** The count barely changes from 10 to 70 mm. The radials rarely fork; a few do, as in A6, A9, A15 and A16 [O]. That fits a stress near or below the roughly 10 MPa needed for branching, away from the contact [I].
- **Blunt drop-weight breaks.** These needed the biggest drops and are much denser. Six of the ten tracings (A21, A24, A25, A27–A29) show close-packed fans spreading from a point on the edge [O] (NIJ p. A-2). A26 is a central burst of several dozen short radials (roughly 50) around a small hole. They end at a nearly circular, slightly polygonal crack about a third of the pane across (roughly 75 mm). Only about a dozen radials continue past it, and staggered chords cut the outer zone into cells [O] (same). The tracing cannot show whether that circle is a concentric bending crack or the edge of the blunt tip's contact, and the report does not give the tip's size [U]. The NIJ authors: "the blunt tip produced a star-shaped fracture pattern, completely unlike the patterns produced by the sharp and round fracture tips" [S] (NIJ p. 52).
- **A disagreement to note.** The NIJ authors also wrote that "the fracture pattern produced by the sharp tip had fewer fracture lines than that of either the round or blunt tips" [S] (NIJ p. 52). In their tracings I count more for the sharp tip than for the round tip (medians of 10 to 14 crossings against 6 to 8) [C], and the sharp-tip panes were broken from higher drops [S] (NIJ Tables 1–2). Both are reported here; I trust the counts for drawing.
- **Hard, slow, framed breaks.** Crossings roughly triple between 20 and 50 mm, through forking and concentric segments. They then drop a little near the frame, where cracks have stopped against rings and against each other.
- **The scatter.** With the same weight and tip (break heights 2 to 6 ft), the round-tip count ran from about 5 to 20 radials [C], and pane A5 (round tip) has about 20 nearly uniform radials while its nine siblings have 4 to 7 [O] (NIJ Appendix A, p. A-3). The NIJ authors cite Katterwe: under identical point loads on microscope slides, "the fractures resulted in randomly distributed cracks: crack numbers, lengths, propagations, directions, shapes, and orientations" [S] (NIJ p. 23).

**Spacing and shape** [O, NIJ tracings and photos]:

- Angular spacing is irregular. Gaps of two to three times the mean sit next to tight pairs.
- Radials are nearly straight, with gentle waviness and occasional kinks where they forked or passed a flaw.
- In light breaks, branches often curve back to rejoin a neighbour, enclosing lens-shaped pieces (NIJ A11, A13, A17).
- Very energetic breaks show a **fan or swarm**. "A swarm of radial cracks can form so fast that the stable branching angle … is not achieved. Branching and rebranching occurs quickly and the radial cracks 'sense each other' causing them to repel each other. This gives rise to the swarm of closely-spaced 'fan cracks' that resemble a folding fan" [S] (Quinn p. 4-12; photos `cat-05-*`).

**Off-centre and edge impacts** [O, S]:

- When the hit is near an edge, or the origin is pulled to an edge flaw, the radials converge on a point at the edge and spread across the pane like a fan (NIJ A18, A19, A21, A24, A25, A27–A29; `cat-05-fan-from-edge-impact`). The NIJ report does not say where on each pane the tip struck, so which of the two causes applies is not known [U].
- Quinn notes that a very blunt blow can start the first crack at an edge flaw, which then runs to the impact and branches outward [S].

**Paths and junctions** [S] (Quinn §4.8, pp. 4-29–4-30):

- "The second crack approaches and is stopped at the intersection since it is unable to traverse the previously cleaved material. Intersections are commonly at 90° since the second crack moves at right angles to tensile stresses and tensile stresses cannot be carried across the previously cleaved crack."
- Crossing cracks occur only "if the first crack does not completely cleave the part". This "can easily occur with bending fractures wherein the crack leads on one side that is in tension, but does not necessarily go all the way through on the compression side". The second crack then has "a jog, or a hook around".
- Forensic sources agree: "radial fractures end when they cross paths with another existing fracture line" ([Wikipedia: Forensic glass analysis](https://en.wikipedia.org/wiki/Forensic_glass_analysis)), and a later impact's cracks "terminate at previously formed cracks" ([SWGMAT 2004, §7.2.1.1](https://www.nist.gov/system/files/documents/2016/09/22/glass_fractures.pdf)).

**Meeting the frame** [I, O]. Same mechanism as the T-junction: a free (traction-free) edge cannot carry stress normal to itself. A crack approaching an edge therefore tends to turn so it meets the edge steeply.

- In the NIJ tracings and photos, most radials reach the frame at a steep angle (`cat-01-small-star-near-frame`).
- A pane held tightly in a frame does have edge stresses. So treat "near-perpendicular at the frame" as a tendency, not a rule.
- The only sourced statement is for thermal cracks, which start "at 90° to the edge" (Quinn §4.12).

### 1.5 Concentric (circumferential) cracks

**Mechanism** [S]:

- See 1.2. Once the radials have cut the plate into wedges, continued loading bends the wedges, and they break in bending with tension on the struck face (Quinn §4.10).
- Quinn's ring-on-ring disks (Fig. 4.15, p. 4-22) show the same thing in a lab. "Short outer 'cross cracks' form after the 50–90% deep radial cracks have run out to the rim and have cut the disk into long slender triangular pieces. Cross cracks are caused by bending of the pieces." "Short inner 'cross-cracks' form at distances where the radial cracks have enough room to branch. The shallow branches curve over to other radial cracks and stop." "The final break through is very scalloped and jumbled."

**Shape** [S]:

- "Concentric cracks … are usually in straight segments that terminate in an existing radial crack" (SWGMAT §3).
- Rings have "offsets at the radial cracks" (Quinn §4.10).
- So a ring is a staggered polygon of chords, each one radial-to-radial, with a step at every radial.
- "If a pane is firmly held on all sides, concentric cracks can form around the point of impact" (SWGMAT §7.2.1.1). A pane free to flex away, like the NIJ foam-backed series, may show none.

**Where** [C, O]. Measured on the framed NIJ panes (203 mm square, about 3.2 mm thick, ½" frame lip, so roughly 89 mm free half-span):

- The fraction of crack ink running tangentially peaked in two bands. Each band stood out clearly in only about a quarter of the 30 panes (Appendix A). In the rest the tangential share stayed near zero. By eye, short concentric chords are visible in about 7 of the 10 round-tip framed tracings (NIJ p. A-6), among dense radials (a median of 44 crossings at 20 mm and 127 at 50 mm) [O, C], and the NIJ authors say almost all the pressed panes had concentric fractures [S]. So the dense radials probably swamped the measure in many panes [I].
- Inner band: 20 to 45 mm from the impact, which is about 6 to 14 plate thicknesses, or 0.2 to 0.5 of the free half-span.
- Outer band: about 80 to 95 mm, just inside the frame lip.

My reading [I]: the inner band is the classic concentric crack. The outer band is where curvature reverses at the clamped edge, which puts the struck face back in tension.

The photographs agree:

- A deer-struck window (Quinn Fig. 4.17b) shows a dense band of concentric segments about a third of the visible width across, inside very many radials.
- The windscreen and shop-window webs (`cat-13-*`) show several ring bands.

**What this means for the generator**

- 0 rings for light blows.
- 1 to 3 staggered ring bands for heavier ones, starting 6 to 15 thicknesses out.
- Ring spacing grows outward (as in Quinn's "Center impact, secondary ring cracks" sketches in Fig. 4.20).
- Optionally, cracks parallel to the frame just inside the glazing bead.

All ring segments are radial-to-radial chords, offset at each radial.

### 1.6 Branching in detail

**Angles** [S] (Quinn §4.3, Table 4.1, p. 4-9). The angle depends on the stress state. Measured first-branch angles, ± 1 standard deviation:

| Stress state | Ratio σ2/σ1 | First-branch angle | n |
|---|---|---|---|
| Equibiaxial | 1 | 113.8° ± 16.3° | 76 |
| Biaxial | 0.5 | 52.4° ± 7.2° | 66 |
| Uniaxial | 0 | 32.4° ± 7.2° | 55 |
| Torsion | −1 | 20.8° ± 6.3° | 13 |

- Tempered plates fork at 111° ± 5°.
- "If cracks trifurcate, the included branch angle of the outer branches are as much as 13° larger."
- Angles "diminish with progressive branching" outward.
- A close-up of a branch point "shows the angle starts small and then stabilizes" (Fig. 4.7). Draw a fork as two cracks peeling apart gently, then straightening.

**What a radial looks like before it forks** [S] (ASTM C1256 §6.2–6.3; Quinn §5):

- The fracture face goes from mirror (smooth) to mist (hazy) to hackle (rough, "fibrous … elongated in the direction of crack spread"), and then the crack forks.
- On the surface of the pane this barely shows. In the fracture face, the side faces, it is the main texture.
- Each new branch restarts the sequence ("at each branch, the crack slows down somewhat, then accelerates back to near terminal velocity and branches again", Quinn p. 5-26).

**Where** [S, C]:

- Forks come at intervals of R_b ≈ (A_b/σ)² (§1.1).
- Rice suggested branching tends "to split the broken component into regions of approximately similar area" (Quinn p. 4-12).
- That works against very uneven piece sizes locally, while the stress gradient makes pieces grow outward.

### 1.7 The third dimension: fracture faces and what the pane's sides show

**Faces are close to perpendicular to the pane, but not flat.**

- Window fragments' "cleavage surfaces were approximately perpendicular to the planer surfaces of the fragments" [S] (Fletcher et al. 1980).
- Rib marks (Wallner lines) are "nearly parallel to one edge of the broken glass, and nearly perpendicular to the other" [S] (Matwejeff, via NIJ p. 18).
- On radial cracks near the impact they meet the **rear** face at right angles. This is the **3R rule**, "radial cracks give rib marks which make Right angles on the Reverse side" (FBI, 1936; Girard), or SWGMAT's **4R rule**, "Ridges on Radial cracks are at Right angle to the Rear" [S].
- The orientation is reversed on concentric cracks [S] (Girard; Tryhorn via NIJ).

**Caveats** [S]:

- The 4R rule "is unreliable for laminated glass, tempered glass, and small windows tightly held in a frame" (SWGMAT §7.2.1.3).
- Tryhorn saw reversed lines on radials far from the impact, and blamed frame restraint.
- Nicholls advised trusting only the surfaces "between the point of origin and the first concentric fracture", because the pane bends "in a wave form with the reversal occurring at the wave nodes" (NIJ pp. 19–20).

**Hackle and twist hackle** [S] (ASTM C1256 §6.9–6.11; Quinn §5.3.3):

- Hackle are "lines parallel to the direction of crack propagation separating portions of the crack surface which are parallel but not coplanar".
- Twist hackle "resembles a staircase as seen from above", or a river with tributaries.
- "Plates in bending often have curved cracks that run quickly on the tension side, but do not quite break through to the opposite surface. The crack later snaps through to the opposite surface leaving twist hackle markings."
- A stress twist of only about 1 to 3° is enough to start twist hackle (Sommer 3.3°, Beauchamp 1°, Quinn p. 5-49).

**The cantilever curl** [S] (ASTM C1256 §6.14). A crack driven by bending runs "perpendicular to the free surface which is in tension". As it nears the compression face, "the plane of tension rotates … so that, by the time it intersects the opposite free surface, a ridge, or lip, has formed. That ridge is strongly tilted with respect to the general crack plane."

**What this means for drawing side faces** [I, from the above]:

- Draw each crack face as a band across the thickness.
- Radials:
  - nearly perpendicular to the pane;
  - may lean a few degrees and lip over near the struck face, which was in compression when they ran;
  - carry curved rib lines and step-like hackle.
- Concentric cracks:
  - start at the struck face and lip near the rear face;
  - lean more than radials if you want to suggest the curl. This last point is my inference; I found no measured lean angle [U].
- The Hertzian cone face is the strongly inclined exception, at 20 to 30° to the surface (§1.3).
- Near crack tips the crack may **not yet go through the thickness**. That is the bending "lead" in Quinn §4.8. A short stretch near each dangling tip could show on one face only.

**Invisible and partly visible cracks** [S] (Quinn §4.9, p. 4-31): "When a crack is created but closes quickly, as in the case of a window impact, pockets of air may be trapped between the crack faces. These pockets may be visible if light is reflected off the glass-air interface. Sometimes the light is refracted creating elusive but colorful reflections that are visible only at certain angles." Sometimes "crack segments will appear to be isolated … but they are in fact connected by invisible segments."

### 1.8 The far side: crater, spall and flakes

- "A high-speed projectile striking a piece of glass will produce a cone or crater. If the projectile passes through the glass, the opening on the exit side will be larger than the opening on the entry side." "Projectiles that pass through the glass at an angle to the surface produce an elongated hole." [S] (SWGMAT §7.2.2.1)
- "The central hole develops a pattern wherein the exit hole is invariably wider than the entrance hole." [S] (Girard)
- The direction of a high-velocity impact can be read "by observing the crater pattern that occurs on the opposite side of the glass from the impact." [S] ([Tennessee Bureau of Investigation SOP M-SOP0036](https://downloads.tbi.tn.gov/forensic-services/microanalysis/sop-manual/M_SOP0036.pdf))
- Hypervelocity impacts on silica glass leave "damage zones (crater, crush, petaloids)" [S] ([Commons file description](https://commons.wikimedia.org/wiki/File:Hypervelocity_impact_damage_on_silica_glass.jpg)). The photo shows a white crushed pit, a smooth conchoidal crater, and rings of scalloped spall flakes [O] (`cat-02-crater-spall-rings`).
- Pellet holes in window panes show the same at a small scale: a scalloped rim of shell-shaped flakes around a hole a few millimetres wide, with the radials starting at the crater rim [O] (`cat-02-pellet-crater-flakes-pixabay-*`).

**What this means for the generator**

- Model the hit on both faces. The struck face gets a small contact ring or pit. The far face gets a wider crater, ringed with flakes (spall).
- The flakes are thin, curved, conchoidal "scales" that fall out first. They are the "small rock and sand" debris that lands right below the hole [I].

### 1.9 The pane's edges

**Conchoidal edge chips** [S] (Quinn §4.15, pp. 4-45–4-49):

- "Concentrated loads near an edge can chip off a portion of the body."
- Chips "usually are curved shell-shaped fragments since fracture runs out to the free surface" (p. 6-38).
- "Edge chips are very common as secondary fractures on broken ceramic or glass fragments … They easily occur if fragments bump into each other or impact other objects during breakage." "It is quite common, especially with glasses, to have one fracture half rub against the edge of the matching fracture half, causing chips in the latter."
- A simulation of impacts near a glass edge [S] ([Hirobe et al. 2023, *Int. J. Fract.*](https://link.springer.com/article/10.1007/s10704-023-00720-z)):
  - The Hertzian cone "sharply deflected toward the chipping wall", producing a "conchoidal platelet".
  - Radial cracks ran perpendicular to the edge.
  - "The height of chip is independent of the impactor geometry while the width of chip depends on it."

**For the generator** [I, O]. Put small scalloped chips along both arrises of every crack face that has rubbed, and along the frame edge near the impact. They are wider than deep, with ripple lines (`cat-10-edge-chips-railing-*`). They are a main source of the "sand and small rock" debris.

**Cracks along the frame line** [C, O]. See §1.5: in framed panes a set of cracks runs parallel to the frame just inside the rebate.

**What the side face looks like where a crack reaches the edge** [I]. A line crosses the edge face, perpendicular to the pane for a radial, with the lean and lip described in §1.7. Edge faces between cracks show the pane's original cut or seamed edge.

### 1.10 Bending ("dish") before and during the break

- The NIJ framed panes deflected **3.4 to 3.9 mm** of crosshead travel at failure loads of **1.47 to 1.79 kN**, depending on the tip [S] (NIJ Table 4, p. 52). That is roughly one plate thickness. The figure includes the stiffness of the rig.
- A thin plate struck centrally bends into a dish. The far face is in tension under the impact, which drives the radials. The radial wedges then fold inward like petals, which drives the concentric cracks [S] (§1.2).
- In thin plates hit by cylindrical projectiles, fragment velocity "did not depend on the mass but rather on the initial position of the fragment" [S] ([Kadono, Arakawa & Mitani 2005, PRE abstract](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.72.045106)).
  - The velocity component along the projectile's direction grew with distance from the impact point.
  - "Elastic ejection" gave velocities of "at most a few tens of meters per second".

**For the generator** [I]:

- Pieces held in the frame end up slightly tilted, hinged along their outer edge. The tilt is largest near the impact, so the reflections break up there. The project's existing dish-tilt model does this.
- Loose pieces leave with speeds that depend on where they were, not on their size.

### 1.11 Fragments: kinds, sizes, where they come from, where they go

**Shapes.** Measured on the NIJ tracings [C]; the table is in Appendix A.

- **Light, sparse breaks** (drop weight, round tip): about 9 pieces per pane (4 to 12).
  - They are big wedges. The median piece is 3,300 mm², and the largest piece is about 37% of the pane.
  - Fairly blocky: the median aspect ratio is 1.9, and only 1% of pieces are longer than 8:1.
- **Dense breaks** (framed, pressed): about 140 to 170 pieces per pane.
  - The median piece is 9 to 10 mm². This is a lower limit: the tracing cannot resolve pieces under about 1 mm.
  - The median aspect ratio is about 5. **25 to 29% of pieces over 20 mm² are more than 8 times longer than wide.** These are the needle and dagger shards.
- Blast-broken windows give fragments where "most … had one or more sharp points, but there was a wide variety of shapes" [S] (Fletcher et al. 1980).

**Where each kind forms** [S, O, I]:

| Kind | Where it forms | Evidence |
|---|---|---|
| Long daggers | Between neighbouring radials, cut off by concentric or cross cracks | [S] Quinn Fig. 4.15 "long slender triangular pieces"; [O] `cat-04-radials-cross-cracks`, `cat-08-flat-shards-paving` |
| Needles and slivers | In the fan or swarm zone, where radials run a few millimetres apart; along small-angle forks far from the impact (about 30° branch angle); shaved off fracture faces when pieces rub | [S] Quinn p. 4-12 (fan), Table 4.1 (angles), p. 4-49 (rubbing); [C] aspect ratios above; [O] `cat-06-*`, `cat-05-*` |
| Small polygonal chunks | Where concentric segments cut radials near the impact; at the crushed-zone rim; spall flakes from the crater | [O] `cat-03-*`, `cat-02-*`; [S] SWGMAT, Quinn §6.7.4 |
| Grit and powder | The crushed (comminuted) zone under a sharp or fast impact; rubbing and chipping as pieces move and fall | [S] Bauer et al. 2022; Quinn §6.7.4 and §4.15 |

**Size distributions** (quantitative sources):

- **Backward spray from a broken window** [S] (Luce et al. 1991):
  - 86% of recovered fragments were on the grid "at a point directly below the frame".
  - "About 90 percent of the fragments on each grid located on the first row ranged in size between 0.15–0.85 millimeters."
  - "Fragment quantity decreased by a factor of 4–5 for every 45-centimeter distance increase."
- Nelson and Revell filmed this backward spray: "When a glass window is broken by a blow, small fragments fly off in a direction opposite to that of the force", and "numerous fragments will strike a person standing within a few feet" [S] ([Nelson & Revell 1967, abstract](https://www.sciencedirect.com/science/article/abs/pii/S001573686770376X)).
- Locke and Unikowski broke windows with a steel ball in a rig. They found smooth relationships between particle size and distance travelled, and a size-dependent spread [S] ([Part 1, 1991](https://www.sciencedirect.com/science/article/abs/pii/037907389190190T)). There was no significant effect of pane size, thickness, or plain, patterned or wired glass [S] ([Part 2, 1992](https://www.sciencedirect.com/science/article/abs/pii/037907389290152M)). The numbers are behind the paywall [U].
- **Fragmented thin glass plates** [S] (Katsuragi, Sugino & Honjo 2004, [arXiv cond-mat/0409770](https://ar5iv.arxiv.org/html/cond-mat/0409770)):
  - Plates 0.1 mm thick were sandwiched between steel and struck by a dropped weight.
  - Well-fragmented events give a power law, N(m) ∼ m^−(τ−1) with τ−1 ≈ 1.0.
  - Low-energy events cross over to log-normal-like behaviour.
- Kadono (1997) found the exponent differs between "sandwich" and lateral impact on plates [S] ([PRL abstract](https://link.aps.org/doi/10.1103/PhysRevLett.78.1444)).
- Néda et al. (1993) found "the total number of fragments is a linear function" of the impact energy density, and the crack network is fractal with dimension D = 2 − C/ε [S] ([abstract](https://www.sciencedirect.com/science/article/abs/pii/092150939390612I)).
- **NIJ tracings** [C], counting pieces over 2 mm² (smaller ones are not resolved, which is why these medians are higher than the Appendix A table's):
  - Framed, pressed panes: piece areas are log-normal-like, with a median of about 14 mm² and a geometric standard deviation of about 6.5. Each tip on its own gives 12 to 15 mm² and 6.4 to 6.7.
  - Drop-weight panes, all tips pooled: a median of about 58 mm² and a geometric SD of about 7.7. Four-fifths of these pieces come from the blunt-tip panes (alone: 41 mm², 5.7). The sharp-tip panes alone give 272 mm² and 9.7. The round-tip panes have too few pieces (82 in all) to fit.
  - Between 10 and 2,000 mm² the cumulative count falls as about A^−0.5 (drop weight, pooled) and A^−0.8 (framed, pooled). The curve bends: about A^−0.3 below 100 mm², and A^−0.6 to A^−1.3 above.
  - The small end is cut off by the tracing's resolution.
- **Blast-broken windows** (for whole-pane failures) [S] (Fletcher et al. 1980):
  - Fragment masses ranged 0.05 to 22 g, with a geometric mean of 1.06 g.
  - Velocities were 7 to 56 m/s.
  - Fragment density behind the window was 10 to 1,000 per m², depending on the blast.

**Where debris ends up** [S, I]:

- Forward (in the direction of the blow) go the knocked-out pieces. Large pieces fall and break again.
- Backward goes a fine spray, mostly within a metre and mostly straight down under the frame (Luce et al.).
- Fallen flat pieces lie on their broad faces at slight tilts. That is why each one flashes the sky or a lamp separately [O] (`cat-08-shards-reflect-sky`, `cat-08-flat-shards-paving`).
- Fine grit gathers along the bottom rail and the sill [O] (`cat-08-shards-on-sill-pexels`).

### 1.12 Holes and pieces that fall out

- At the impact, crushed fragments and small central pieces fall out, leaving a hole whose rim is the crater or the ring of concentric segments [S, O].
  - Sharp impact sites are "heavily damaged with small fragments missing" (Quinn §6.7.4).
  - About a dozen of the 30 framed NIJ panes show a white central hole in the tracing [O] (NIJ pp. A-5–A-7).
- Bigger pieces drop out when every crack around them is complete. A piece hangs on while any part of its outline is still uncut or wedged in the frame [I].
- Real holes have jagged rims of dagger points and leave remnant shards standing in the frame [O] (`cat-11-*`).

### 1.13 Thickness and pane type

- Thickness does not change the *kind* of pattern, but plate thickness enters the radial-count law [S] (Vandenberghe et al.; exponent not read [U]). Shinkai's review shows "variations also occur with plate thickness" and with how the edges are held [S] (Quinn §4.10).
- Heat-strengthened glass is about twice as strong as annealed, but "the pieces do not dice into small fragments. They break into triangular shards similar to annealed plate breaks" [S] (same).
- **Tempered glass is not our case.** It "fracture[s] into many small fragments" by repeated branching, and can stay in place as a diced sheet [S] (Quinn §4.11). This is why tempered photos are in a separate "don't confuse" category.

---

## 2. Laminated glass (windscreens)

### 2.1 Build-up

- A common architectural build is 2.5 mm glass + 0.38 mm interlayer + 2.5 mm glass, called "5.38 mm laminated glass".
- An automotive laminated panel is "around 6.5 mm" thick.
- Interlayers include PVB, EVA, ionoplast, cast resins and TPU [S] ([Wikipedia: Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass)).
- PVB "is tough and ductile, so brittle cracks will not pass from one side of the laminate to the other". It binds the shards and "undergoes plastic deformation during impact" [S] ([Wikipedia: Polyvinyl butyral](https://en.wikipedia.org/wiki/Polyvinyl_butyral)).

### 2.2 Windscreen repair damage types

Source: the US standard for repairing laminated automotive glass, ROLAGS [S] ([definitions](https://rolags.com/definitions/); [ROLAGS 2007 PDF with repairable sizes](https://www.nwrassn.org/documents/ROLAGS3-07.pdf); [inspection page](https://rolags.com/proper-repairs-and-how-to-inspect/)).

| Type | Definition (quoted) | What it looks like and why | Repairable size (ROLAGS 2007) |
|---|---|---|---|
| **Impact point** | "Location on the glass that was struck by an object and results in damage." | The small crushed pit at the centre of every break type | — |
| **Bullseye** | "A separated cone in the outer layer of glass that results in a dark circle with an impact point." | A Hertzian cone in the outer ply has separated. Air in the gap shows as a dark disc ([patent US5116441](https://patents.google.com/patent/US5116441): "a cone shaped piece of glass detached from the outer layer", apex at the impact, base toward the plastic layer). "Small radiating cracks will converge into the bullseye" (inspection page). See `cat-12-bullseye`. | ≤ 1 in (25 mm) diameter |
| **Half-moon / partial bullseye** | "Partial bullseye" | Only part of the cone ring separated. The dark area is a crescent. The [Quick Fix](https://quickfx.ca/drilling_techniques/) repair guide describes it as having an "air space". See `cat-12-half-moon-with-legs`. | ≤ 1 in (25 mm) |
| **Star break** | "Damage that exhibits a series of legs that emanate from the break." | A small pit with radial cracks ("legs") in the outer ply, usually little or no separated cone. See `cat-12-star-break` and `cat-12-star-windscreen`. | ≤ 3 in (75 mm) |
| **Combination break** | "Damage with multiple characteristics, i.e. star within a bullseye, short or long crack(s) emanating from the damage." | A cone or crescent plus legs. Several nested ring cracks are common [O]. See `cat-12-combination-break`. | ≤ 2 in (50 mm) body, legs excluded |
| **Crack** | "Single line of separation such as which may emanate from an impact point." The inspection page says "surfaced single line separation in the outer layer of glass". | A long, gently curving line, often running from a star or chip. See `cat-12-long-crack-windscreen`. | ≤ 14 in (350 mm) |
| **Short / long crack** | Short: "6 inches (150 mm) or less". Long: "more than 6 inches (150 mm)". | — | — |
| **Edge crack** | "Any crack that extends to an edge." | — | — |
| **Floater crack** | "Any crack that does not extend to an edge." | — | — |
| **Stress crack** | "Any crack that extends from an edge and lacks an impact point." | Not an impact. See §3. | Not repairable |
| **Surface pit** | "A nick in the glass associated with normal wear and tear that does not penetrate to the plastic interlayer." | A tiny crushed pit with no legs. | — |
| **Chip, ding, stone break** | Public terms with no technical definition | "Stone break/chip: sub-surfaced break on the outer layer of windshield glass, typically coin size and containing small radiating or extending cracks" (inspection page) | Stone breaks up to 2 in (50 mm) repairable ([repairable-damage page](https://rolags.com/repairable-damage/)) |

Repair technicians also use informal names: "fishhooks", "bee's wings", "baseball break" [S] ([Quick Fix](https://quickfx.ca/drilling_techniques/)).

Why these breaks look dark or bright: cracks are visible where "light rays pass the boundary between glass and air" and are bent [S] (patent). Stone breaks are "unsurfaced": they lie below the surface, or are so tight they behave that way [S] (same). Resin repair works by filling that air.

### 2.3 Hard blows: both plies, how they relate, and the order

- **Order.** Laminated plates under low-velocity impact go through three stages [S] (Li et al. 2023, abstract):
  1. an elastic stage;
  2. "total breakage of the back glass layer";
  3. "total breakage of both layers of glass".
- **Headform simulation.** For headform impacts on windscreens, "the cracking always initiates first in the outer ply at the PVB/glass interface", and this is "flexure fracture", not Hertzian [S] ([Dharani et al. 2003, SAE](https://scholarsmine.mst.edu/cgi/viewcontent.cgi?article=7297&context=mec_aereng_facwork)). The outer ply's inner face is its own tension side in bending. Both results say: each ply cracks from its tension face [I].
- **Radial before circular.** Under drop-weight loading with high-speed filming, "radial crack initiates early and propagates faster than the circular crack" [S] (Chen et al. 2013). The authors also proposed a Weibull statistical model of the macroscopic crack pattern from many repeats, so laminated patterns vary randomly too [S].
- **Pattern evolution on square plates** [S] (Zemanová et al. 2020):
  - For annealed plies, "the radial cracks were initially evenly distributed around the contact zone".
  - As the impactor penetrated further, "more cracks appeared near the diagonals creating an X-shaped band".
  - Heat-strengthened plies gave "a denser network of cracks that branch".
- **Gravel strikes** produce star cracks whose formation depends on a non-linear, damaged indented zone under the contact [S] ([Le Gourriérec et al. 2022, abstract](https://link.springer.com/article/10.1007/s40870-022-00351-w)).
- **How the two plies relate** [I, O]:
  - The plies crack separately, since cracks cannot cross the PVB. Their patterns share the impact point and roughly the same rings, because both plies bend together, but the individual radials do not line up.
  - Seen through, every crack is doubled with a slight parallax. Where the two networks overlap, the web looks denser than either ply alone.
  - I found no study quantifying the offset between the plies' patterns [U].

### 2.4 The PVB: holding, sagging, crushed glass and delamination

- **Holding.** "Most of the glass shards stayed attached on the interlayer without any visible signs of delamination. The glass was crushed and fell away only in a small area where the impactor hit the plate." [S] (Zemanová et al. 2020)
- **Punch-through.** Each of 52 9 mm pistol shots through laminated windscreen glass produced, beyond the conical spray of glass, a round "compounded fragment" of "fine glass fragments connected by a punched sheet of the PVB interlayer" [S] ([Lux et al. 2022, *Int. J. Legal Med.*, CC BY](https://link.springer.com/10.1007/s00414-022-02904-z)).
  - Mean mass 0.10 to 0.13 g; diameter 9.6 to 12.1 mm.
  - Full-metal-jacket bullets left "a central, round-shaped, prominent fracture zone of 2–3 mm diameter followed by a radiate fracture pattern".
  - In short: crushed glass powder stays bonded to the PVB, and a perforation punches out a disc of PVB carrying glass grit.
- **Direction clues on laminated glass.** These include "bulging on one side or laminate extruding out one side, or crater formation" [S] (TBI SOP).
- **Sagging.** Heavily broken laminated sheets fold and hang like stiff cloth while staying in one piece [O] (`cat-13-laminated-hanging`, `cat-13-windscreen-ice-impact`). Windscreens struck very hard bulge inward around the impact [O].
- **Whitening and delamination width.** In the photos the crushed centre reads as a white disc, most likely crushed glass plus the separated glass-PVB interface [O]. I could not read a source on PVB stress-whitening or on how wide the delamination is next to a crack [U].

### 2.5 How laminated breaks differ from plain glass

| | Annealed window | Laminated windscreen |
|---|---|---|
| Light stone hit | A star with a few radials, or a cone and hole. Pieces may fall. | A bullseye, half-moon or star in the outer ply only. Nothing falls. The inner ply is intact. [S] |
| Hard hit | Radials, a few staggered rings, pieces fall out, a hole forms. | Both plies crack. A dense web of many radials and **several** concentric rings. A white crushed centre. The sheet bulges and sags but holds. [S, O] |
| Debris | Daggers, chunks, grit and a backward spray. | Very little: grit and powder at the centre only, "fell away only in a small area". [S] |
| Each crack seen through the pane | One fracture face. | Two offset fracture faces, one per ply. [I] |

The "many concentric rings" in laminated breaks, compared with the few in annealed windows, is my observation from the photographs (`cat-13-*`, `cat-12-two-bullseyes-ring-cracks`). I found no study comparing the counts directly [U].

---

## 3. What not to draw for an impact

**Thermal stress cracks** [S] (Quinn §4.12, pp. 4-35–4-37, and Fig. 7.1; SWGMAT §7.2.3):

- "The crack starts from an edge origin in tension and initially propagates at 90° to the edge, but then changes to a meandering wavy pattern."
- "The waves are often periodic."
- "Low stress fractures (σ < 10 MPa) do not cause branching."
- Thermal fractures have "localized tensile stresses … branching may be minimal and the fracture surfaces may be relatively featureless and flat".
- "A typical heat crack is curved, has a smooth edge, and has no indication of the point of origin."
- Photo: `cat-15-thermal-crack`.

**Stress (edge) cracks in windscreens** run "from an edge and [lack] an impact point" [S] (ROLAGS).

**Tempered glass** breaks into diced small pieces, often with "butterfly" pairs of pieces at the origin. A nickel-sulphide inclusion can set it off with no impact at all [S] (Quinn §4.11, §6.6.5 and Fig. 6.18). Photos: `cat-15-*`.

**Rules that follow** [I]:

- Single wavy cracks from an edge, with no centre, are a different failure.
- So are uniform dice.
- Neither should appear in an impact break, except a little meandering in the last stage of break-up. Fréchette noted that meandering cracks "can also form in impact cases in the final stages of breakup" [S] (Quinn p. 4-36).

---

## 4. Optics notes that come straight from the fracture physics

- A crack is an air gap. Where the faces are closer than about a wavelength (tips, tight cracks) it is invisible. Trapped air pockets reflect, and interference makes "colorful reflections … visible only at certain angles" [S] (Quinn §4.9).
- Mirror-smooth faces near the origin reflect like mirrors. Mist and hackle faces further out scatter [S] (ASTM C1256 §6.2–6.3). So crack faces near the impact look whiter and rougher [I].
- The earlier project notes, `broken-glass-light.md` and `research-glass-fracture.md`, already cover total internal reflection, the green edge colour and per-shard tilt. Nothing here contradicts them.

---

## Appendix A. Measurements on the NIJ fracture tracings

**Source.** F. A. Tulleners, J. Thornton & A. C. Baca, *Determination of Unique Fracture Patterns in Glass and Glassy Polymers*, NIJ award 2010-DN-BX-K219, NCJ 241445 (2013) ([PDF](https://www.ojp.gov/pdffiles1/nij/grants/241445.pdf)).

**The tests.** Sixty 8" × 8" (203 mm) panes were cut from one sheet of "double strength glass (nominally 1/8" thick)".

- **Series A, drop weight.** The pane sat on 2" foam. A 965 g weight carried a round, sharp or blunt tip and was arrested a fraction of an inch below the surface.
  - It was dropped from 2 to 7 ft, giving 11.3 to 21.2 ft/s. That is 3.4 to 6.5 m/s and 5.7 to 20 J [C].
  - The table lists the height at which each pane broke.
- **Series B, static press.** The pane sat in a wooden frame with a ½" lip and was pressed at 10 mm/min until it broke.
  - Mean failure load: 1.47 kN (sharp tip), 1.72 kN (round), 1.79 kN (blunt).
  - Crosshead extension at failure: 3.39 to 3.93 mm.
- Ten panes per tip and method. The crack patterns were hand-traced on acetate and scanned. Appendix A of the report holds all 60 (pp. A-2–A-7).

**My method** [C]:

- I extracted the 60 tracing images, about 400 px for 203 mm, so roughly 0.5 mm per pixel.
- **Crossings.** I found the impact point as the peak of smoothed ink density and counted dark runs on circles of radius 10 to 70 mm.
- **Pieces.** I labelled the white regions as pieces, after a 1-pixel dilation of the ink, and measured area and principal-axis elongation.
- **Rings.** For the ring bands I used structure-tensor orientation and computed the share of crack ink running tangentially, in 5 mm radius bins.
- **Limits.**
  - The tracings are hand-drawn. Lines closer than about 1.5 mm merge.
  - Counts very near the impact are therefore underestimates.
  - Pieces smaller than about 1 to 2 mm² are lost or spurious.
  - Treat every figure as roughly ±20%.

**Piece statistics** [C]:

| Series | Pieces per pane, median (range) | Piece area, mm², median (10th–90th %) | Largest piece, % of pane | Aspect of pieces > 20 mm², median (90th %) | Share of pieces > 20 mm² with aspect > 4 / > 8 |
|---|---|---|---|---|---|
| Drop weight, round tip | 9 (4–12) | 3321 (9–10879) | 37 | 1.9 (4.6) | 14% / 1% |
| Drop weight, sharp tip | 20 (6–82) | 269 (4–3572) | 21 | 3.1 (7.2) | 33% / 8% |
| Drop weight, blunt tip | 162 (56–341) | 36 (3–511) | 9 | 3.2 (10.1) | 40% / 16% |
| Pressed in frame, round tip | 168 (51–402) | 10 (2–354) | 6 | 4.8 (12.5) | 62% / 25% |
| Pressed in frame, sharp tip | 144 (24–400) | 10 (2–337) | 12 | 5.1 (14.7) | 60% / 29% |
| Pressed in frame, blunt tip | 163 (97–364) | 9 (2–316) | 7 | 5.2 (12.4) | 65% / 25% |

**Ring bands** (framed series) [C]:

- The tangential share of crack ink was close to zero outside 15 mm in most panes.
- About 8 of the 30 panes showed a secondary peak of 7 to 18% at 20 to 45 mm.
- About 7 of the 30 showed a peak of 8 to 12% at 81 to 96 mm, at the frame lip.
- I did not map the extracted images back to the report's pane IDs within each page, so individual panes are not named here.

What the NIJ authors themselves concluded is in §0, item 1, and §1.4.

---

## Appendix B. Sources

**Read and used**

- G. D. Quinn, *Fractography of Ceramics and Glasses*, 3rd ed., NIST SP 960-16e3, 2020. [PDF](https://nvlpubs.nist.gov/nistpubs/specialpublications/NIST.SP.960-16e3.pdf). Used: §4.3–4.5, 4.8–4.12, 4.15; Fig. 4.15, 4.17, 4.20; §5 and Table 5.1; §6.7.4–6.7.5 and Fig. 6.33, 6.36, 6.39; §7.2–7.4; Appendices C and E.
- SWGMAT, *Glass Fractures*, 2004. [PDF](https://www.nist.gov/system/files/documents/2016/09/22/glass_fractures.pdf)
- ASTM C1256-93 (2003), *Standard Practice for Interpreting Glass Fracture Surface Features*. [copy at elitesafetyglass.com](https://elitesafetyglass.com/wp-content/uploads/2021/04/ASTM-C1256-Standard-Practice-for-Interpreting-Glass-Fracture-Surface-Features.pdf)
- Tulleners, Thornton & Baca, NIJ 241445, 2013. [PDF](https://www.ojp.gov/pdffiles1/nij/grants/241445.pdf)
- Girard, *Criminalistics*, ch. 5 (publisher sample). [PDF](https://samples.jbpub.com/9781284142617/9781284142617_CH05_Girard_SECURE.pdf)
- Tennessee Bureau of Investigation, SOP M-SOP0036. [PDF](https://downloads.tbi.tn.gov/forensic-services/microanalysis/sop-manual/M_SOP0036.pdf)
- [Wikipedia: Forensic glass analysis](https://en.wikipedia.org/wiki/Forensic_glass_analysis); [Laminated glass](https://en.wikipedia.org/wiki/Laminated_glass); [Polyvinyl butyral](https://en.wikipedia.org/wiki/Polyvinyl_butyral)
- Vandenberghe, Vermorel & Villermaux, PRL 110:174302 (2013). [Abstract](https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.110.174302) only; [APS Physics Focus](https://physics.aps.org/articles/v6/48); [Science News](https://www.sciencenews.org/article/counting-cracks-glass-gives-speed-projectile)
- Wang, Yen, Yu, Wright & Bobaru, *Int. J. Fract.* 2024. [NSF accepted manuscript](https://par.nsf.gov/servlets/purl/10597886)
- Kim, Mun, Park, Choi & Hong, *Appl. Sci.* 15:386 (2025), CC BY. [Article](https://www.mdpi.com/2076-3417/15/1/386)
- Kim, *Appl. Sci.* 15:10898 (2025), CC BY. [Article](https://www.mdpi.com/2076-3417/15/20/10898)
- Bauer et al., *Glass Struct. Eng.* 7:569–602 (2022). [Article](https://link.springer.com/article/10.1007/s40940-022-00190-0)
- Lux et al., *Int. J. Legal Med.* (2022/23), CC BY. [Article](https://link.springer.com/10.1007/s00414-022-02904-z)
- Hirobe, Sato, Takato & Oguni, *Int. J. Fract.* (2023). [Article](https://link.springer.com/article/10.1007/s10704-023-00720-z)
- Luce, Buckle & McInnis (1991). [NCJRS abstract](https://ojp.gov/ncjrs/virtual-library/abstracts/study-backward-fragmentation-window-glass-and-transfer-glass)
- Nelson & Revell (1967). [Abstract](https://www.sciencedirect.com/science/article/abs/pii/S001573686770376X)
- Locke & Unikowski, Part 1 (1991) and Part 2 (1992). [Abstract 1](https://www.sciencedirect.com/science/article/abs/pii/037907389190190T), [Abstract 2](https://www.sciencedirect.com/science/article/abs/pii/037907389290152M)
- Katsuragi, Sugino & Honjo (2004). [arXiv](https://ar5iv.arxiv.org/html/cond-mat/0409770)
- Kadono, PRL 78:1444 (1997). [Abstract](https://link.aps.org/doi/10.1103/PhysRevLett.78.1444)
- Kadono, Arakawa & Mitani, PRE 72:045106 (2005). [Abstract](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.72.045106)
- Néda, Mócsy & Bakó (1993). [Abstract](https://www.sciencedirect.com/science/article/abs/pii/092150939390612I)
- Fletcher, Richmond & Yelverton, DTIC ADA105824 (1980). [PDF](https://apps.dtic.mil/sti/pdfs/ADA105824.pdf)
- ROLAGS. [Definitions](https://rolags.com/definitions/); [2007 standard](https://www.nwrassn.org/documents/ROLAGS3-07.pdf); [inspection page](https://rolags.com/proper-repairs-and-how-to-inspect/); [repairable damage](https://rolags.com/repairable-damage/); [photo gallery](https://rolags.com/proper-repairs/)
- [Patent US5116441A](https://patents.google.com/patent/US5116441); [Quick Fix repair guide](https://quickfx.ca/drilling_techniques/)
- Dharani et al., SAE 2003. [Scholars' Mine](https://scholarsmine.mst.edu/cgi/viewcontent.cgi?article=7297&context=mec_aereng_facwork)
- Zemanová et al., Challenging Glass Conference 2020. [PDF](https://proceedings.challengingglass.com/index.php/cgc/article/download/319/300/898)
- Chen et al., *Eng. Fract. Mech.* 2013. [Abstract](https://www.sciencedirect.com/science/article/abs/pii/S0013794413003160)
- Li et al., *Ceram. Int.* 2023. [Abstract](https://www.sciencedirect.com/science/article/abs/pii/S0272884222034265)
- Le Gourriérec et al., *J. Dyn. Behav. Mater.* 2022. [Abstract](https://link.springer.com/article/10.1007/s40870-022-00351-w)

**Tried but not read.** I did not get these another way.

- Vandenberghe et al. 2013 full text:
  - [HAL copy](https://hal.science/hal-00857239/document): bot challenge (Anubis).
  - Semantic Scholar: 403.
  - [PubMed](https://pubmed.ncbi.nlm.nih.gov/23679734/): reCAPTCHA.
  - ADS: robots.txt.
  - So the full radial-count law, with its prefactor and thickness exponent, is missing.
- ROLAGS 2014 and 2022 standard PDFs (rolags.com and nwrassn.org): captcha page. The 2007 version was read instead.
- Locke & Scranage, "Breaking of flat glass" Part 3 (surface particles) and Part 4 (windscreens): ScienceDirect rate limit (HTTP 429).
- DTIC AD1161194: 403. Australian Institute of Criminology report 9-80: robots.txt timeout. NWRA "right repairs" page: 503. 916autoglassfix.com: robots.txt timeout.
- PMC article 11076080: reCAPTCHA.
- The session's web-search budget (200 searches) ran out partway through. Later items were found by following links from sources already in hand. In particular, I did not search further for:
  - crushed-zone diameters for hammer or stone hits on windows;
  - measured PVB delamination widths;
  - the lean angle of concentric crack faces.
