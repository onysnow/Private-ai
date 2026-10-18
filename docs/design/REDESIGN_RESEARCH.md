# The redesign research (October 2026)

The text of Ony's design research document, "Redesigning every part of the investigation workbench" (252 pages), pasted by Ony with the mockup pictures on 12 Oct 2026 and saved here as he sent it (extracted PDF text, so tables and line breaks are rough). It explains every mockup in `docs/design/mockups/` and the functions behind them. Read the chapter for a screen before building or checking it.

Chapters: 00 the redesign on one page · 01 rules every screen follows · 02 three formats · 03 themes and the theme setting · 04 case home, navigation, settings · 05 Bring in · 06 Check · 07 See · 08 Act · 09 the AI, live reasoning view, Authority System Suite · 10 knowledge, safety, keeping · 11 the product website · 12 decisions for Ony and the build order.

---

THE REDESIGN · OCTOBER 2026
Redesigning every part of
the investigation
workbench The design research applied, part by part: the case home, bringing material in,
checking it, seeing it, acting on it, the AI and its live reasoning view, knowledge
and safety, five themes with a theme setting, and the product website. Sixteen
new screens show how it looks.
8areas redesigned 100+ features covered 16new screens 5themes 16site pages planned
Redesigning the investigation workbench 1 / 252
CONTENTS
00 The redesign on one page
01 Rules every screen follows
02 Three formats for the app
03 Themes and the theme setting
04 The case home, navigation and settings
05 Bring in
06 Check
07 See
08 Act
09 The AI, its live reasoning view, and the Authority System
Suite
10 Knowledge, safety and keeping
11 The product website
12 Decisions for Ony, and the build order
Redesigning the investigation workbench 2 / 252
The redesign on one page
One screen per job. A calm case home that puts the next decision in the middle, every
feature one step from opening full screen, navigation hidden at the edges until it is
wanted, and every fact one click from its source.
00
Redesigning the investigation workbench 3 / 252
PART WHAT CHANGES
Format Hybrid: a one-screen case home; each part opens its feature to the whole screen with a growing transition; Esc returns. The spatial
canvas comes later as a format for See and story mode.
Navigation Each screen edge has one job (left: case and steps; top: tools; bottom: evidence filmstrip; right: the selected item), each with a thin
handle, a short pause before opening and a key. 
⌘
K works everywhere. A breadcrumb is always visible. Every opened item has its own
address.
The middle of the home One "Next up" queue that merges the eight places decisions happen today, ranked by what would change the story, with the source
beside the question and three answers on keys.
Certainty One grammar everywhere: 
✓ Supported, 
✕ Disputed, dashed 
○ Not yet shown, dotted for anything the app worked out itself; Red Flag
levels as 
▮▯▯ / 
▮▮▯ / 
▮▮▮ with words. Never colour alone.
Checking "Supported" gets a definition of done the server enforces; every cited source is checked for saying what it is cited for; a quote that
cannot be found again is flagged.
Seeing Links read as sentences on the line; one time rail drives every view; money flows show where money appears or vanishes; seven new
thinking views; the timeline is one feature with seven views on shared data.
Acting Red Flags full screen with a level ladder and an innocent-explanations checklist; leads in Now / Next / Later; a "what the story needs"
tree feeding a write-up editor with citation chips; one Export sheet.
The AI "Ask the case" in four steps; a live view of each thought travelling through the Authority System Suite as light; a trace for any thought
from input to output; run controls in plain words; nothing leaves the computer without a record.
Safety One Safety & data page with a diagram of what lives where and what leaves; backups that can be encrypted; deletion that asks for the
case name; the reporter's Safety panel last, as decided.
Look Dark colours, never black; cream text; drop shadows on panels; five themes (Case Night, Rain Noir, Archive, Forest Ledger, Indigo
Clarity), each contrast-checked; a theme setting with themes, effects and formats chosen separately and previewed on the real case.
Motion Smooth, never bouncy; the same object moves rather than reappearing; reading text, amounts and quotes never animate; every effect
has a calm version; scrolling over a part changes that part, never the page.
Website A Rain Noir home ("Every claim, traced to its source."), pages for each audience, a public Red Flags catalogue, a Safety page that states
what the maker cannot see, and an About page drafted for Ony to finish.
Redesigning the investigation workbench 4 / 252
Rules every screen follows
The status grammar, the calm zones, the navigation model, the motion system, the
scroll rule, and the checks that decide whether a source says what it is cited for. Every
area in this volume builds on these.
01
Redesigning the investigation workbench 5 / 252
✓ SUPPORTED ✕ DISPUTED
○ NOT YET SHOWN ▮▯▯ FAINT ▮▮▯ STRONG ▮▮▮ TEXTBOOK AI DRAFT
Part B — Proposals that apply to every theme
B1. A status grammar that never relies on colour
Every theme only recolours this grammar; the shapes and words
never change (WCAG 1.4.1; health.mil; 1 in 12 men).
STATUS ICON / SHAPE WORD ON CHIP EXTRA CUE
Supported
✓ in a filled circle SUPPORTED solid left edge on the claim card
Disputed
✕ in a diamond DISPUTED solid edge plus a small "!" where the network draws contested links
Not yet shown hollow dashed ring 
○
NOT YET SHOWN dashed card edge; text one step dimmer
Faint
▮▯▯ three-bar meter, one filled FAINT outline chip
Strong
▮▮▯
STRONG tinted chip
Textbook
▮▮▮
TEXTBOOK filled oxblood chip with a bright edge, cream text
Status words are small caps with extra tracking ("Typography in
design"). Red Flag levels are one warm-red family rising in weight and
fill (dusty rose 
→ vermilion 
→ filled oxblood), built on value and fill,
not three unrelated hues ("25 Shades of Red"; Munsell). Real alarm
red is only ever the Textbook fill and deletion ("What is color theory").
For homicide, trafficking and war-crimes areas the chip stays the
same but the area colour is muted (the red article's "subtle accent for
sensitive content"). Disputed (claims) and Strong (flags) sit close in
hue in some themes; they never share a shape or a word, and they
live in different places (claim cards vs flag rows).
AI-written material keeps the decided plum mark (INVENTORY §11)
in every theme, as a thin left rule plus a small "AI" tag.
B2. Tokens named by role
Following "LLM context design", one token list, named by job, used by
every component and every theme:
ground, surface-1 (panel), surface-2 (raised card), surface-3
(selected / hover), text, text-muted, line, accent-1 (main
action, focus), accent-2 (links, selection, time), status
supported, status-disputed, status-unshown, flag-faint, flag
Redesigning the investigation workbench 6 / 252
strong, flag-textbook-fill, flag-textbook-edge, ai-mark,
shadow-panel, shadow-lifted, grain-opacity, radius-*, font-ui,
font-read, font-mono, font-display, font-note, ease-*, dur-* 
.
This fixes the inventory problem "page background equals the card
colour (#1a2328)": 
ground is now always darker than 
panels over the board carry 
surface-1 
, and
shadow-panel 
. Each token gets a one-line
usage rule in the design spec ("accent-1: one per screen region;
never on decoration").
B3. Surfaces and depth
Four steps: ground (the board) 
→ panel 
→ raised card 
→ selected,
as YouTube's lighter pill does; separation by value plus shadow,
few borders (Trend 5; Hatch).
Drop shadows (Ony's decision) must be 
darker and tinted than
ground, since a grey shadow vanishes on dark: 
0 18px 40px -12px
only for the case title, story chapter titles and an opened Red Flag
("Typography in design"; Trend 4).
Three roles plus two accents per theme: interface (sans), reading
(serif, in the reading room), mono (quotes' locators, IDs, hashes,
amounts, dates in tables, machine-proposed values until a person
confirms them), display (optional), note (Caveat, reporter's own
notes on the corkboard only — the mockups already use it).
Reading room: 40–60 characters per line on a plain surface; line
height 1.5–1.7 for passages (the portfolio's body uses 1.7; the
article's 1.125–1.2 figure is for display-like settings and is too
tight for long passages on dark — my judgement, not the article's).
Tabular figures on for every amount, date and count column. No
ligatures in evidence text (
font-variant-ligatures: none in
quotes) so "fi" or "rn" never misread.
rgb(ground-darkened / .65), 0 2px 6px rgb(0 0 0 / .35) plus
a 1px inner top highlight of text colour at 5–7%, which reads as an
edge catching light.
Light documents and scans get a thin dark outline and a soft
shadow so white pages don't glare (Trend 5 notes).
Evidence images are never tinted by the theme, blended or
filtered; any viewing aid (contrast boost for a faded scan) is a
labelled, reversible view logged in the chain of custody ("Color
grading explained"; "What is RGB?").
B4. Type system
Scale from a 16px body: 12 (labels, caps), 14 (dense UI), 16
(body), 20, 24, 32, 48 (case title / full-screen headings), display
Redesigning the investigation workbench
Fallback stack for foreign names: theme font 
→ Noto Sans / Noto
Serif 
→ script-specific (Krub, Hind, Scheherazade New, Gowun
Batang).
Fonts are bundled locally (local-first; no request to Google Fonts
while working on a sensitive case). ADR needed if this uses
@fontsource/* packages.
B5. Calm zones that no theme may decorate
Reading room (documents, passages), tables, claim and source
panels, Chain of Custody, review proposals, the To-check list. In
every theme they get plain 
surface-1 
/
surface-2 
, no texture over
text, no moving refraction, no scrambled glyphs (portfolio catalogue
§5). Decoration lives on the ground (the board behind panels), on
transitions and on hero moments.
7 / 252
Part B. A shared "certainty grammar" (proposal)
Every visualisation below should use one grammar. Then a reader
learns it once, and colour is never the only signal. This follows the
line-style findings in A1, the text-with-colour findings, the Likert
ramp, the design-system badges, and the rule to keep repeated
components identical (
What is wireframing?
).
Claim and link status (supported / disputed / not yet shown):
STATUS LINE MARK GLYPH WORD
Supported solid filled
✓
"shown"
Not yet shown dashed ring (hollow) ? "not yet shown"
Disputed double or broken line half-filled with a notch ! "disputed"
Derived or inferred by the app dotted dotted outline ƒ "worked out"
The "derived" row comes from the ER finding that derived
attributes are drawn dotted (
What is an ER diagram
). It keeps
sums and inferences apart from quoted facts.
Today the network uses dashes for how sure a link is and a red "!"
for contested ones, and the timeline uses solid, half, ring, dashed
ring and "!" (INVENTORY 3). These already fit the grammar. The
proposal is to make all five chart families use the same table and
one key.
Red Flag levels (Faint / Strong / Textbook):
An ordered ramp of one, two or three ticks (
▮ 
▮▮ 
▮▮▮
), always with
the word.
Faint uses a subtle outline badge; Strong and Textbook use a solid
badge (
Design system implementation
, img_01).
The dot-rating idea comes from 
What is a stakeholder analysis?
and the fixed-ramp idea from 
What is a Likert scale?
.
Colour is a third channel only. Following the "pops of colour on
neutral" and "one accent" rules (
60 creative presentation ideas
; 
7
LinkedIn banner ideas
; 
How to make a mood board
, fintech board),
the single accent is kept for Textbook and for "disputed".
AI-written content: a plum edge and an "AI draft · date" stamp on
every AI-written item until a person accepts it. This matches the
planned plum marks (INVENTORY 11) and the AI stamp patterns in
A4.
Scroll-over rule (one rule, app-wide). Ony's decision is that scrolling
over components does things. To keep that predictable:
Time-aware views (network, money, timeline, places,
ownership): the wheel moves the as-of moment.
Lists and boards: the wheel moves the list.
Grids and matrices: the wheel moves the lit row.
Zoom goes on pinch, the +/− buttons and Ctrl+wheel.
Redesigning the investigation workbench 8 / 252
A small "scroll = time" hint shows at the pointer the first time.
With reduced motion, scrolling still changes the state but without
animation (no reduced-motion rules exist today, INVENTORY 10).
Smooth scroll-linked motion needs a motion library. None is
present today (INVENTORY 10). [ADR: Motion/Framer Motion or
GSAP ScrollTrigger]
Every view carries the frame anatomy that already exists (Chart
frame: title, question, rule, key, footer counts; INVENTORY 3). Add a
pinned focus question and an always-visible key. Exports must "stand
on their own" with a title, key, source line and the as-of date (
46
infographic examples
; 
How to write a project charter
, revision date on
top).
Redesigning the investigation workbench
9 / 252
Part C — Proposals
C1. Working rules for every screen
1. One focal point per screen, the only high-contrast item; the rest
cream at medium contrast (
What is visual hierarchy
).
2. One primary action, beside the selection. Selecting a passage,
node or card shows Supported / Disputed / To check / Open source
next to it; everything else goes into "More". This ends the 16
button rows (
Fitts' law
).
3. Same thing, same place, same look across network, timelines,
map and lists: one entity card, one status chip, one date format.
4. Nothing important exists only on hover or scroll. Every effect has
a click and keyboard path, and the content is in the DOM.
5. Undo over confirm. Reversible actions act at once with an undo
toast; confirmation only for permanent deletion.
6. Effects are never load-bearing — Ony's own ADR-0003 from the
portfolio site: anything that degrades degrades to nothing.
C2. Navigation model
1. Edge reveal (pointer). Each edge has one job; corners hold rare
things only (
Fitts' law
).
Left — the case: the four stages as large words with counts, then
the features of the current stage. A frosted panel slides over the
view, which stays visible and dimmed (The Outline; frosted layers
from 
What is skeuomorphism?
).
Top — tools for this view: search, filters and "Clear" (C40's framed
bar, Trend 13), timeline-mode switcher.
Bottom — filmstrip of the evidence in view with an "n / N" counter
(IKEA's Kuula viewer, Trend 1).
Right is kept for the selected item's detail panel, opened by
selection, not by approach.
Corners: settings and backup bottom-left; safety "hide screen"
top-right.
Rules: open after a short dwell within a few pixels of the edge, so
a flick past does not open it; close on leaving or Esc. A permanent
thin handle on each edge, labelled on first use, because hidden
menus lose clicks. On touch, handles become tappable tabs.
2. ⌘K palette — one mechanism for everything, from every screen:
documents, people, companies, claims, indicators, glossary, and
commands ("Go to To check", "New investigation", "Export write
up"); results grouped by kind with status chips. If natural-language
queries come later, the palette shows the structured filter it built (
No
code app examples
). cmdk-style package [ADR], or a native 
<dialog>
.
3. Breadcrumb, always visible top-left — the one fixed convention: Case › Stage › Feature › Item
, each crumb a link, visible even
when edges are hidden.
4. Keyboard.
G then 
1–4 for a stage; 
[ ] between features; 
J K
next and previous item; 
Enter open; 
Esc closes the top layer; 
S / 
D
/ 
T for Supported / Disputed / To check; 
? lists keys; 
Alt+←/↑/↓ open
edge panels with focus trapped. Single-key shortcuts can be turned
off and never fire while typing (WCAG 2.1.4).
Address and history. Every opened claim, dossier, relationship,
document or flag has a URL, so Back and shared links work. Cross
Redesigning the investigation workbench 10 / 252
feature jumps keep your place: the target opens as a panel over the
current view with a "Back to Red Flags" crumb (Teague's "keep
context"). Related-by navigation: around a selected party, linked
items grouped by kind of link ("same address", "same director", "paid
by"), the Arts & Culture pattern.
C3. Dashboard: "the most important parts front
and centre"
1. Content inventory first: for each feature, the one or two things
that must be visible without hover or scroll (
Mobile-first design
).
Only those earn a slot.
2. Centre = the next decision, not a stage: the top To check item or
waiting finding as a review card — evidence thumbnail with "View
full", the key fact large, party and status chip, details, tall Accept
and outlined Reject with quick-reason chips (the expense
approval screen in 
User-centered design questions
).
3. A case-numbers strip, each number clickable to its list and
carrying its source: Supported / Disputed / Not yet shown, To
check left, money traced, date span (Stripe's live figure and Flow
Ninja's divided stat row, Trend 8).
4. One module per stage, sized by importance (hierarchical grid),
each showing its single most important item: Bring in — the
document being read, with progress; Check — the next item; See
— a mini network of the most-linked parties; Act — the strongest
Red Flag match with its innocent explanation visible.
5. One alarm colour for real alarms only (Textbook-level flags, safety
warnings).
6. Scroll over a module to look inside, click to open it whole-screen;
the page never scrolls. Visible prev/next and keys too.
7. Empty states are one line and one action ("No documents yet —
Drop documents") plus a sample case labelled as a teaching case
("Demo Mode Active", 
Vibe coding examples
).
8. Cross-filtering with an "Active selections" bar and Clear, always
visible.
9. Fit test: if a module cannot show its item at a common laptop size
without scrolling, split it into steps instead of adding a scrollbar
(
Figma Exercise: How to reduce design complexity
).
C4. Motion system
Tokens. My proposal, anchored to the 100–200 ms band
(
Understanding button states
), Trend 6's short hover feedback, and the
portfolio site's proposed tokens (
ease-out-expo cubic
bezier(.22,1,.36,1)
, 180 / 450 / 700 ms).
TOKEN VALUE USED FOR
motion.press
100 ms ease-out pressed state (scale 0.98), chip toggle
motion.feedback
160 ms ease-out hover, selection, status change, tooltip
motion.reveal
240 ms ease-out-expo in; 180 ms ease-in out edge panels, popovers, detail panel, toasts
motion.transform
450 ms ease-out-expo card 
→ whole-screen feature; timeline mode switch
Redesigning the investigation workbench 11 / 252
TOKEN VALUE USED FOR
motion.story
700 ms ease-in-out story-mode steps, chapter tint change
motion.trace
300–600 ms per edge the live AI view's travelling light
motion.ambient
23–34 s linear loops (portfolio range) bokeh, rain — behind non-reading surfaces only
Smooth, never bouncy: the subject is serious (Trend 6). Exits are
shorter than entries.
Choreography rules.
1. The same object moves; it does not reappear. Timeline modes
and dashboard 
→ feature use shared-element transitions so no
fact is lost (Teague). Native View Transitions API needs no
package; a motion library (Motion/Framer Motion, GSAP) is [ADR].
2. One thing leads. The acted-on object moves first; related items
follow in a short stagger capped at a handful, the rest fade.
Selecting a person makes their timeline items, flows and pins
pulse once together (Gestalt common fate).
3. Direction means something. Panels slide from their edge; going
deeper zooms in, going back zooms out; next item slides along the
list's axis.
4. Motion covers waiting, not data. Skeleton or progress after a brief
wait; real progress bars with what is happening for OCR and
connector pulls.
5. Evidence values never animate into place. Amounts, dates,
names, quotes appear final; ScrambleText only on titles
(PORTFOLIO_COMPONENTS §5).
6. At most one ambient effect on screen; loops sleep when hidden.
7. Live AI view: a light travels parent 
→ child; the node settles into
good / bad / partial / neutral from the suite's 
status field, never
chosen by the model; events queue in order; a scrubber replays
any run; clicking a node pauses and shows its record
(AUTHORITY_SUITE §7).
What moves: edge panels, popovers, detail panel, card-to-feature
transforms, timeline mode switches, the corkboard string drawn on
scroll, story steps, network camera, the AI trace, press and hover
feedback, ambient backgrounds. What stays still: document and
passage text while reading, quotes, tables, amounts, claim and
source panels, Chain of Custody, review proposals, the breadcrumb,
focus rings — no parallax, rain, scramble or light over text.
Reduced motion (
prefers-reduced-motion plus a "Calm motion"
switch in Settings): transforms and story steps become a 120 ms
crossfade; panels fade without sliding; ambient loops, rain, bokeh,
parallax and flashes stop and the background is a still image; the AI
trace becomes nodes changing colour in order, with the event list
beside it; smooth scroll off; story mode steps discretely. Flashes
keep the portfolio's rule: one rise and decay with a cooldown, never
above 3 per second (WCAG 2.3.1).
C5. Micro-interactions and scroll-over
Scroll over a component changes the component, never the
page: year slider moves and the network shows only parties active
that year; the corkboard draws its string and slides (Ony's canvas
frames 7 and 12); dashboard modules step through items. Each
Redesigning the investigation workbench 12 / 252
shows a "scroll to move" hint the first times and its position
("2019", "4 of 12").
Wheel capture is escapable: a component takes the wheel only
after the pointer rests on it, and releases it at the ends of its
range; arrow keys do the same.
Click the object to act (Silo): click a transaction to add it to a
"traced so far" bar with a running total.
Drag with reset (Palmer): canvases have an always-visible "Reset
view" and a gesture hint like "Drag to rotate • Double-click to reset
zoom" (
Vibe coding examples
).
Context menu on right-click of a node or card, mirrored in the
detail panel and keys.
Physical cues only on movable things: paper edge, slight shadow,
small tilt on hover for evidence cards; chrome stays flat.
C6. Feedback and states
Explode each key screen into empty, loading, partial, error,
success, offline, very long, and right-to-left versions before
building.
One feedback pattern: in-line messages in the owning panel;
toasts only for actions with undo; specific words ("12 passages
added", "Marked Supported — 3 sources", "OpenCorporates did
not answer — try again").
Disabled controls say why ("Export write-up" waits until every
sentence has a source).
Status is colour + shape + word; Faint / Strong / Textbook as one
mark growing in steps (
13 core graphic design principles
,
progressive rhythm). Evidence objects use Figma's three states:
unreviewed quiet, under review patterned, confirmed or flagged in
full colour.
Freshness stamps on connector results and AI runs ("fetched 10
min ago", WSJ in 
Static vs dynamic websites
; "Last AI analysis" in Vibe coding examples
).
C7. Accessibility and keyboard
Check every cream token on every surface step: 4.5:1 body, 3:1
large text, chips, graph edges and focus; aim for 7:1 on reading
text; use the AA/AAA checker table as the test sheet.
Cream focus ring meeting SC 2.4.13 on every surface and inside
canvases.
Accessible names for all icon-only controls, especially edge
handles.
Canvases (network, corkboard, map, AI view) get ordered
keyboard traversal announcing type, name and state, and a list
view of the same data.
44×44 px hit areas via padding, including pins and nodes; labels
and map pins follow the user's text size.
Native 
<dialog> and 
popover for panels and cards, giving focus
trap and Esc for free — fixing the current drawers.
Right-to-left and non-Latin text in passages and names from the
start (
What is UI design?
).
C8. Responsiveness
Desktop first and fluid to ultrawide with 
clamp() type and a soft 8
px grid; side margins hold the detail panel and collapse first.
Tablet: edge handles become visible tabs; detail panel becomes a
bottom sheet.
Phone "field mode": one column, primary action at the bottom in
the thumb zone (HelloFresh in 
Fitts' law
) — capture photo, voice
Redesigning the investigation workbench 13 / 252
note, quote; work the To check list. Hide, don't drop: the rest stays
reachable via 
⌘
K and accordions.
C9. Trust and credibility
Every claim, chart point and AI sentence is one click from its
source passage (Stanford #1); the Chain of Custody opens beside
the item, never by scrolling away.
Polish must not make weak evidence look strong: status chips as
loud as the styling; unverified people never framed in alarm
colours.
AI is proposed, marked and editable: one AI marker until a person
accepts (Carbon's AI badge in 
12 design system examples
); "can
make mistakes" beside AI actions; the reporter picks which
sources the AI may use (LinkedIn); write-ups get an automatic AI
use note, drafted vs edited (PACED).
One line next to every input that sends data out, saying what
leaves the machine.
Equal-weight choices on deletion, backup and restore; no pre
selected destructive option, no countdowns.
Redesigning the investigation workbench 14 / 252
Part E. "Source says what it is cited for" checks
The batches kept finding the same failures, across many articles.
Proposal: a set of checks on every link-backed claim, shown on the
claim card and in Chain of Custody. Each check has a plain result
word. A failed check sets the claim to "not yet shown" (jidoka: stop
the defect from flowing into a write-up and light a signal; 
How to
create a value stream map
, Toyota page).
1. Says it? (cited page lacks the claim). The quoted words or
number must be found in the saved passage, otherwise the
citation fails. - Cornell's page does not describe the "five Rs" (
How
to take meeting notes
). - harappa never calls Starbucks or Philips
"balanced" (
What is a matrix organization
). - The 95% and 67%
figures were not visible in the HBR page (
What is strategic
planning
). - The Figma Slides blog did not show the 47% figure (
60
creative presentation ideas
).
2. Repeats, does not establish. A badge for sources that only quote a
figure from elsewhere, with a "trace back" step. - The "65% visual
learners" claim links to an EEG study of 34 students that only
repeats it (
How to create a flow chart
; 
What is a concept map
). 
The "95% of products fail" figure is attributed to Christensen with
no study (
6 stages of the product development process
).
3. Measures what? Fields for measure, sample, method and who
paid, filled from the primary source. - The "43% more persuasive
and memorable" claim comes from a 1986 study of about 35
students per group that measured planned commitment of time
and money, not memory (
46 infographic examples
, UM/3M). 
Mind-map recall was 10% higher, but the 95% CI was −1% to 22%
(
How to mind map
). - McKinsey's 40% came from 40 PMs on a
simulated case (
Using AI in product management
). - Bridges gives
no sample sizes (
Strategic planning process in 6 steps
).
4. Primary or secondary? (compare with original). Show both
values side by side with a "sources differ" marker. - Dropbox video
length and timing, and the LEGO Ideas year (2011 vs 2014) (
7 real
world concept testing examples
). - Tuckman's fifth stage is framed
differently by MIT (
Forming, storming, norming, and performing
). 
The Facebook cover is 400×150 in the guide against 851×315
recommended by Facebook (
Guide to Facebook post sizes
). - The
Google display advice is dated (
Google display ad size guide
).
5. Ratio unpacked. A derived percentage must show its numerator
and denominator, and each needs a source. Example: 59% = 3.07B
÷ 5.17B, and the denominator has no outside citation (
11
Facebook ad examples
).
6. Numbers add up. Arithmetic and internal-consistency checks on
figures quoted in the case. - The Likert mean is stated as 4.2; the
page's own weights give 3.95 (
What is a Likert scale?
). - The rack
card is 389 mm in the table and 89 mm in the text (
A complete
guide to flyer sizes
). - The portrait size 1920×1080 looks swapped
(
LinkedIn banner and post image size guide
). - The flowchart
symbol meanings conflict between two articles (
How to create a
flow chart vs 
26 popular flowchart symbols
). - The DFD levels read
reversed (
What is a context diagram?
).
7. Data source named? A chart or figure with no named data source
fails. Example: the carbon-footprint infographic's host page names
none (
46 infographic examples
).
Redesigning the investigation workbench 15 / 252
8. Link alive and well-formed. Example: the PMI "71%" link is pasted
twice and cannot be followed (
Sprint retrospective best practices
).
9. Gated / not seen. When the source is behind a form or a paywall,
the status is "not seen", never "shown". Examples: Figma's 72%
and 58% report figures and the 2025 AI report (
How to make a
mood board
; 
How to make a cinemagraph
; 
10 vibe coding tools
).
10. Interested party. Mark vendor-funded or self-published studies.
Examples: the Forrester TEI 35% (
How to increase productivity
),
Figma's 34% faster (
Design system implementation
), the Figma
customer story (
What is a customer journey map?
).
UI for these checks:
A compact row of ten small check glyphs on the claim card, each
with a word on hover (
✓ "says it", ? "not seen", ! "differs").
A "compare with original" split view.
An "AI draft" mark on any check the model ran until a person
confirms it.
Redesigning the investigation workbench 16 / 252
Three formats for the app
A single dashboard, a hybrid of a dashboard and whole-screen features, or something
new: a spatial case canvas. The recommendation is the hybrid, with the canvas offered
later as a format.
02
Redesigning the investigation workbench 17 / 252
Part D — Three app formats
All three share C2, C4, C6 and the theme setting. They differ in what
"home" is.
(a) Single dashboard
What it is. One screen per case; every feature is a live module on it;
scrolling over a module works it in place; a module can expand over
its neighbours and collapse back. Only long text gets its own reading
space.
Good at: the strongest sense of place; cross-filtering is natural; Ony's
"one screen" rule taken literally; one layout to build and test.
Bad at: density — 20+ features cannot each show something useful
on a laptop, and "if everything looks the same, you see nothing"; deep
work (a 400-page PDF, 50 proposals, the corkboard) needs the whole
screen; many visible choices slow decisions (Hick); poor on small
screens.
(b) Hybrid: dashboard + whole-screen features —
recommended
What it is. A one-screen dashboard built on C3. Each module opens
its feature whole-screen with a shared-element transform; inside,
chrome hides and the edges hold navigation (left case and stages, top
view tools, bottom filmstrip). Esc or the first crumb returns with the
reverse motion. Long text opens in its own reading space. This is the
shape of Ony's canvas frames 1–3 and 10.
Good at: meets every decision (one screen, whole-screen features,
edge navigation, front-and-centre dashboard, scroll-over
components); full screen for deep work while the dashboard stays
calm; progressive disclosure "like a film" with motion keeping
context; every feature has a URL; new features slot in easily.
Bad at: hidden navigation inside features carries the hamburger
costs, so handles, 
⌘
K, breadcrumbs and keys are mandatory; two
layouts to keep coherent; feature-to-feature moves take one extra
step; shared-element transitions on large graphs need care and a
crossfade fallback.
(c) Something new: the spatial case canvas
What it is. The case is one zoomable dark board. Documents, people,
companies, claims and leads are objects on it; stages are regions (an
intake edge where documents land, a review lane, clusters to see, a
write-up desk). Zooming out shows the whole case like an evidence
wall; zooming into a region turns it into that feature (the pile becomes
The Drop, a cluster becomes the network). The corkboard timeline is
a strip across the board; named cursors arrive later for team cases.
References: Figma's Freeform camera principle, Palmer's drag-to
explore canvas, the reporters' own pin-and-string metaphor (
What is
skeuomorphism?
).
Good at: matches how investigators already think; spatial memory
makes the case familiar; relationships visible as distance and lines;
striking identity and a natural home for the gritty, rainy, bokeh theme;
strong for presenting.
Bad at: hardest to make accessible (full keyboard traversal plus a
parallel list view of everything); hardest to keep fast on a local
Redesigning the investigation workbench 18 / 252
machine with thousands of textured objects (the portfolio's one-GL
context limit; a canvas/WebGL library would be [ADR]); weak for strict
ordered work — reading and checking one claim after another, most of
the job — which would still open as panels; free placement can make
a messy case look tidy; most to build and teach.
Recommendation. Build (b). Offer (c) first as a format in the theme
setting for the See stage and story/presenting mode, where the
network and corkboard are already canvases, and test it with
reporters before considering it as the home. Keep (a) for very small
cases and as the phone field-mode dashboard.
Redesigning the investigation workbench 19 / 252
Themes and the theme setting
Five complete themes, every text and interface pair checked against WCAG AA (Indigo
Clarity reaches AAA). A theme changes three things separately — colours and type, an
effects pack, and the layout format — and is tried on the real case before it is kept.
5 THEMES
0 CONTRAST FAILURES
3 LAYERS A THEME CAN CHANGE
03
Redesigning the investigation workbench 20 / 252
Case Night
The newsroom after dark: calm blue, warm cream paper, one amber lamp.
IBM PLEX SANS · SOURCE SERIF 4 · IBM PLEX MONO
ground · panel · card · selected · text · accent · accent 2 — #14263A #1E3448 #26425A #2E4D67 #F5ECDA #E8A95B #7FB7E0
Rain Noir
MANROPE · JOST 300 (TITLES) · SOURCE SERIF 4 · IBM PLEX MONO
A city at night through a wet window; gritty and cinematic, on calm dry surfaces. Built from the OnySnow Studios effects.
ground · panel · card · selected · text · accent · accent 2 — #18120F #211A16 #2A221E #342C27 #F0EAE1 #DD9231 #3AB3AD
Archive
A records room: manila folders, old photographs, a desk lamp.
PUBLIC SANS · DOMINE · IBM PLEX MONO
ground · panel · card · selected · text · accent · accent 2 — #221A15 #2C221B #3A2D24 #54463A #F3E7CF #D9945A #7CC0B4
Forest Ledger
A quiet library for long sessions; ledgers and brass lamps.
INTER · NEWSREADER · IBM PLEX MONO
ground · panel · card · selected · text · accent · accent 2 — #0F272B #163338 #1D3F45 #264C53 #F4EEDC #D4B06A #B5C98A
Redesigning the investigation workbench
21 / 252
Indigo Clarity
Clear and steady: AAA contrast, almost no motion.
INCLUSIVE SANS · LEXEND · IBM PLEX MONO
ground · panel · card · selected · text · accent · accent 2 — #121233 #1B1B45 #272757 #33336A #FBF6EA #FFD166 #A6D4FF
Redesigning the investigation workbench
22 / 252
Part C — Five complete themes
All values below passed the script (0 fails). "Needs" are AA 4.5:1 for
text, 3:1 for UI parts; I asked 7:1 for main text on ground and panel.
1. Case Night — the current navy/cream direction,
refined
Mood: the newsroom after dark. Calm, trustworthy blue (colour
symbolism), warm cream paper, one amber lamp.
What changed from the mockups: the mockups use #1E3448 as
both ground and panels; here the ground drops to #14263A so
panels lift; muted text is lifted (#B9AE98 measured 4.22:1 on the
selected surface, below AA; now #C6BBA5, 4.66:1); coral raised
from #E07A5F so the Disputed label passes on a card.
Tokens: ground #14263A · surface-1 #1E3448 · surface-2
#26425A · surface-3 #2E4D67 · text #F5ECDA · muted #C6BBA5
· line #6F8AA3 · accent-1 amber #E8A95B · accent-2 sky
#7FB7E0 · supported #9CC5A1 
✓ · disputed #F39882 
✕ · not yet
shown #CBC3B2 
○ dashed · Faint #E9AFA8 
▮▯▯ · Strong #F6966A ▮▮▯ · Textbook fill #8E2420 / edge #FF8070 
▮▮▮ · AI mark
#B7A6E0.
Type: IBM Plex Sans (interface; already in the mockups; "rational
yet expressive"), Source Serif 4 (reading; optical sizes, named for
long-form digital and trust in the Oswald pairing), IBM Plex Mono
(data; Plex superfamily keeps x-heights matched so an inline
amount doesn't jump). Notes in Caveat.
Texture/effects: none on panels; a very faint hairline grid on the
board (ChainGPT cell idea) at 4–6% cream; panel shadow tinted
navy.
Motion: smooth and unhurried — expo-out (.22,1,.36,1), 180 ms
hover, 450 ms panel moves, 700 ms full-screen opens.
Contrast (computed): text on ground 13.08, on panel 10.91, on
selected 7.54; muted on selected 4.66; amber as text 6.25;
Supported 5.43, Disputed 4.79, Not yet shown 5.97, Faint 5.56,
Strong 4.72 (all on raised card); cream on Textbook fill 7.38;
outline vs panel 3.56; focus ring vs selected 4.32.
2. Rain Noir — Ony's pick, built from the portfolio
Mood: a city at night through a wet window; gritty, cinematic,
bokeh lights — while the work itself sits on calm, dry surfaces.
Change from the portfolio: the portfolio ground (#0E0906) is so
close to black that it breaks "never black" in spirit. For the
workbench I lift every surface by about 0.045 L in OKLCH and keep
the hue and chroma: ground 
oklch(0.19 0.012 55)
. The
portfolio's 0.145 stays only 
inside photographs behind glass.
Tokens: ground #18120F · surface-1 #211A16 · surface-2
#2A221E · surface-3 #342C27 · text #F0EAE1 (portfolio cream) ·
muted #B9B0A3 · line #796F69 · accent-1 amber #DD9231
(portfolio) · accent-2 teal #3AB3AD (portfolio teal lifted from L
0.63 to 0.70 so it can be text) · supported #88D1A2 
✓ · disputed
#F47C6B 
✕ · not yet shown #C5BCB0 
○ · Faint #E8ACAB · Strong
#F57E4D · Textbook fill #831B16 / edge #FF6557 · AI mark plum.
Type: Manrope (interface, portfolio body), Jost 300 for display
titles only (portfolio: "the way film title cards are set"), Source
Serif 4 for the reading room (the portfolio has no reading face; Jost
300 is too thin for long reading on dark), IBM Plex Mono for data.
Redesigning the investigation workbench 23 / 252
ScrambleText on feature titles only, never on names, values or
quotes.
Texture/effects (from PORTFOLIO_COMPONENTS):
Board ground: 
BokehField (CSS only, drift 23–34s) behind frosted
panels; film grain at 3.5%.
Case home hero: one clear-glass 
Pane with 
WaterDrops ("Steady"
or "After the rain") over a night-city photograph, with glass bokeh.
One pane only (GlassLight cost grows per pane).
Opening a whole-screen feature: 
CameraIris (8-blade SVG)
transition.
Saving evidence or a snapshot: 
ShutterFlash corner brackets only
(no afterimage; the full flash is too strong for frequent saves).
Textbook flag opened full screen: a 
Neon "steady" heading. Never
flicker/dying.
Opt-in tools for the document viewer: Flashlight, Black light
(Escape to leave).
Easter eggs stay off.
Motion: cinematic and slower — 450/700 ms, expo-out; nothing
snappy except hover (180 ms). Under reduced motion the bokeh
freezes, rain shows a still "after the rain" frame or none, and the
iris becomes a fade.
Calm reading surfaces: reading room, tables, claims, Chain of
Custody, To check use plain surface-1/2 — no glass refraction, no
grain over text.
Contrast (computed): text on ground 15.51, panel 14.35, selected
11.44; muted on selected 6.38; amber 6.72 and teal 6.72 as text;
Supported 8.68, Disputed 5.90, Not yet shown 8.32, Faint 8.11,
Strong 5.92; cream on Textbook 8.23; outline vs panel 3.51. For
reference, the portfolio's original values: cream 16.56, amber
7.76, teal 5.94, destructive 4.95, input outline 3.00 on its
background — but cream on its destructive button only 3.55 (fixed
here by the darker Textbook fill).
ADR needed: porting the effects engine (scheduler, shared WebGL
context, light list) and its dependencies (framer-motion, html-to
image, the vendored liquid-glass library whose licence must be
checked, the unverified "PB glass texture" pack). Bokeh, grain, iris
and neon are CSS/SVG and need no new package.
3. Archive — umber, copper and teal
Mood: a records room; manila folders, old photographs, a desk
lamp. Brown reads as reliability and trust ("25 Shades of Brown";
UPS).
Tokens: ground #221A15 · surface-1 #2C221B · surface-2
#3A2D24 · surface-3 Taupe #54463A (from the brown article) ·
text #F3E7CF · muted #C9B9A0 · line #8C7A66 · accent-1 copper
#D9945A (Copper #C68346 lifted) · accent-2 teal #7CC0B4 (the
article: copper pairs with teal; the lattice lesson — one cool accent
in a warm field) · supported #B3D196 
✓ · disputed #F0806C 
✕ ·
not yet shown Sand #CBBD93 
○ · Faint Dusty rose #DCA1A1 ·
Strong #F47E6C · Textbook fill Garnet #8B0000 / edge Pastel red
#FF746C (all named in "25 Shades of Red").
Type: Public Sans (interface; government design system, neutral
and credible), Domine (reading; the face the articles name for
journalism and publications; sturdy serifs hold up as cream on
dark), IBM Plex Mono (data). Optional display: Domine Bold at
large size.
Texture/effects: paper grain at 3–4% on the board; evidence cards
as paper with a slight shadow and a 1–2° rest angle on the
corkboard; scans keep their own colours (Old photograph and
Night sands tones for chrome around them, not on them).
Redesigning the investigation workbench 24 / 252
Motion: tactile — cards settle with a short ease-out (250–350 ms)
as if laid on a desk; no bounce; drawers slide like file drawers.
Contrast (computed): text on ground 13.98, panel 12.68, selected
7.41; muted on selected 4.72; copper 6.17 and teal 7.44 as text;
Supported 7.89, Disputed 5.07, Not yet shown 7.11, Faint 6.11,
Strong 5.09; cream on Garnet 8.17; outline vs panel 3.77; focus vs
selected 3.60.
Contrast (computed): text on ground 13.46, panel 11.57, selected
8.08; muted on selected 5.07; brass 6.53 and sage 7.47 as text;
Supported 6.31, Disputed 4.94, Not yet shown 6.67, Faint 5.85,
Strong 4.84; cream on Textbook 7.69; outline vs panel 3.78; focus
vs selected 4.56.
5. Indigo Clarity — high clarity, low motion
4. Forest Ledger — deep teal-green for long
sessions
Mood: a quiet library; ledgers, brass lamps. Deep blue-greens read
as dependable ("25 Shades of Green"), Winter chill's #0B2E33
family.
Tokens: ground #0F272B · surface-1 #163338 · surface-2
#1D3F45 · surface-3 #264C53 · text #F4EEDC · muted #B4C2BA ·
line #6E8E8C · accent-1 brass #D4B06A · accent-2 sage #B5C98A
· supported sky #8EC9E8 
✓ (deliberately not green: green here
would sink into the ground, and green also means money in this
subject) · disputed #F59078 
✕ · not yet shown #CFC6AE 
○ · Faint
#F2A7A0 · Strong #F78D62 · Textbook fill #8A2420 / edge
#FF7B6B.
Type: Inter (interface; tabular figures, contextual alternates),
Newsreader (reading; "modern serif for screen reading; serious,
informative content"), Inconsolata (mono, "code and technical
documents") or IBM Plex Mono.
Texture/effects: none; depth from shadow and value only. Money
and timeline views gain the most from this quiet theme.
Motion: quiet — 150–250 ms fades and slides, no parallax, scroll
linked effects only where a feature is made for scrolling.
Mood: clear and steady for tired eyes, low vision, bright rooms, or
people who want no effects. Built on Blue eclipse (#272757 is
used as surface-2 unchanged).
Tokens: ground #121233 · surface-1 #1B1B45 · surface-2
#272757 · surface-3 #33336A · text #FBF6EA (a brighter cream,
as the minimalist article's "lighting conditions" note suggests) ·
muted #D2D2E6 · line #9A9AC4 · accent-1 #FFD166 (yellow
works on dark) · accent-2 #A6D4FF · supported #94E6AE 
✓ ·
disputed #FFA08F 
✕ · not yet shown #E2DCCB 
○ · Faint #F8C0C6
· Strong #FF9466 · Textbook fill #A0182A / edge #FF9090.
Type: Inclusive Sans (interface; open counters, built for
accessibility), Lexend for reading ("designed to reduce visual
stress", wide spacing) with Source Serif 4 as an option, IBM Plex
Mono. Base size 17–18px; status words never below 13px.
Texture/effects: none. Thicker focus ring (3px), underlined links,
2px control outlines.
Motion: minimal — opacity fades 
≤
120 ms, no parallax, no scroll
driven movement, no iris or flash. Respect reduced motion by
default.
Contrast (computed): text on ground 16.79, panel 15.10, selected
10.68 (AAA everywhere); muted on selected 7.74; accents 11.30
and 10.46; Supported 9.37, Disputed 7.05, Not yet shown 10.13,
Redesigning the investigation workbench
25 / 252
Faint 8.81, Strong 6.39; cream on Textbook 7.32; outline vs panel
6.04; focus vs selected 7.99.
Supported vs Disputed — what colour alone would
give
Contrast between the two status colours themselves is low in every
theme: Case Night 1.13:1, Rain Noir 1.47, Archive 1.56, Forest Ledger
1.28, Indigo Clarity 1.33. So their lightness is close, and a red-green
colour-blind reader could not tell them apart by colour. This is why
the 
✓ / 
✕ shapes and words in B1 are required, not decoration.
Print and export (not a sixth theme)
Write-ups, evidence packs and decks get a light "paper" variant of
whichever theme is active (cream page, the theme's ink colours
darkened to pass 4.5:1 on paper), because dark screens should not go
to paper ("What is CMYK?"). The existing 4 deck themes in the slide
canvas keep their own palettes.
Part D — How the theme setting should work
D1. Three layers a theme can change
1. Tokens (every theme): all colours in B2, fonts for the five roles,
type scale steps, radii, shadow recipes, grain amount, motion
durations and curves. Pure CSS variables on 
html[data-theme]
, so
a change spreads everywhere at once ("future of design systems
is semantic"). No new package.
2. Effects pack (optional per theme): decorative layers on the
ground and on transitions only — bokeh, rain pane, hairline grid,
paper grain, iris, shutter brackets, neon. Each degrades to nothing
(portfolio ADR-0003), follows the quality tier (full / lite / minimal),
and turns off under reduced motion and on phones. A separate
"Effects: full / light / off" switch lets someone keep Rain Noir's
colours without the rain.
3. Format (layout recipe): Ony wants entirely different website
formats. A format re-arranges the 
same components; it does not
change what exists. Proposed formats: - Board (default): panels
floating over a board with drop shadows; edge-revealed navigation
(the current mockups). - Editorial: the case home as a list-as
navigation of huge words separated by rules, hovering a word
previews that section behind it (Locomotive, Trend 2). - Desk /
Corkboard: the case as a dense corkboard of evidence cut-outs
with date labels at uneven heights (La Palatine, Trend 11);
selected items open as one calm card (Passweird). - Story:
chapter-by-chapter, each chapter a tint of the ground (Liquid
Death's per-slide colour, Trend 10), with a "% through" readout
(Sofi). A theme suggests a format (Rain Noir 
→ Board with the rain
hero; Archive 
→ Desk), but the two are chosen separately.
D2. What no theme or format may change
(invariants)
The status grammar (B1): icons, words, card edges.
The calm zones (B5).
Redesigning the investigation workbench 26 / 252
Contrast floors: the theme loader runs the same checks as
look_contrast.py and refuses a theme (or a user's custom
colour) that fails them.
Fixed positions of the case title and 
⌘
K search across every
format, so people know where things are with navigation hidden
("Typography in design": keep objects in the same place).
Keyboard flows and focus rings; reduced motion; no flashes over 3
per second.
Evidence images untouched.
D3. Preview pattern
Theme gallery in Settings: one specimen card per theme, built
like the articles' palette cards and pairing cards: name, mood line,
four swatches with small mono hex labels, a "HEADER / BODY
COPY / DATA" sample in the theme's three fonts, the six status
chips, and a small badge with the lowest computed contrast
("Lowest text pair 4.66:1").
Live peek: pointing at a card re-renders the 
current screen in that
theme inside a before/after divider (the app already has a before
and-after slider in chart pictures), so Ony sees his real case, not a
sample.
Try, then keep: "Try for this session" applies it everywhere with a
slim bar "Rain Noir (trying) — Keep · Go back", mirroring the
portfolio's 
?try= habit (and the same 
Nothing changes for good until Keep.
data-try attribute idea).
Per person, per device: the theme is a personal setting (later, in
multi-user, never forced on teammates); effects can also be
switched per device (a laptop on battery vs a desktop).
Custom colours: advanced users may swap status colours (the
colour symbolism article's cultural point), but only through the
contrast check.
D4. ADRs to write
Effects engine port for Rain Noir (WebGL engine, framer-motion,
html-to-image, licences).
Bundled font packages (local fonts for privacy).
Any animation library for format transitions (the inventory notes
no Framer Motion today).
Redesigning the investigation workbench
27 / 252
Settings › Appearance: the theme gallery with a before/after live preview of the real case; Rain Noir being tried.
Redesigning the investigation workbench 28 / 252
The case home, navigation and
settings
One screen: the case question, standing numbers, a module per step sized by
importance, and the next decision in the middle. Hidden edges, 
⌘
K, breadcrumbs, a
two-question new-case setup, notifications that never interrupt reading, regrouped
settings, and the theme setting.
04
Redesigning the investigation workbench 29 / 252
The case home in Case Night: the question, standing numbers, a module per step, and the next decision in the middle with its source.
Redesigning the investigation workbench 30 / 252
0. New outside research for this area (what I saw, and what each source
adds)
All captures are in 
showed.
SOURCE
R/pages/feat-home-* 
. I report only what the pages
WHAT I SAW
Linear Docs, "Inbox" (
feat
home-linear-inbox 
,
img_00)
The inbox is "your notification center". A Priority tab (4) and Other tab (12) "separates
notifications that need your attention from other updates". Keys: 
page; 
J 
/
K to move; 
U read/unread; 
H snooze; Backspace delete. Snooze hides a notification
"until the selected time", then it "reappears". "Inbox shows in-app notifications… Other
notification channels can be managed in notification settings." The screenshot: one row per
item, actor avatar with a small action badge, title, one-line reason ("Didier assigned the issue to
you"), status icon and age ("1h").
Linear Docs, "Preferences"
(
feat-home-linear-prefs 
,
text)
VS Code docs, "Themes"
(
feat-home-vscode
themes 
, img_00)
GitHub Docs, "GitHub
Command Palette" (
feat
"Default home view" setting; "Interface and theme": font size, pointer cursor, underlined links;
"Choose from our presets or create your own custom theme"; light/dark/system; "over 70
themes" shared on linear.style "where you can click to copy".
The theme picker is a command-palette list titled "Select Color Theme (Up/Down Keys to
Preview)"; moving the highlight recolours the whole editor behind the list; Enter keeps it. Light
and dark themes are grouped with labels. Settings for "Preferred Dark / Light / High Contrast
Color Theme" follow the OS scheme. Breadcrumbs (
Opens with Ctrl/
⌘
K "from anywhere"; "it shows your location at the top left and uses it as the
scope for suggestions"; Tab narrows the scope, Backspace widens it. Prefix keys: 
home-gh-palette 
, img_01,
img_02)
# issues/PRs, 
@ users/repos, 
/ files, 
! projects, 
? help. Shortcuts can be customised "in
the Accessibility section". Commands include "switch theme". The screenshot shows a scope
chip ("octo-org") outlined in the input, a "Tip: Type # to search discussions" line and "Type ? for
help and tips".
Redesigning the investigation workbench
WHAT IT ADDS TO HOME
G then 
I to reach it from any
src > vs > nls.ts
) sit under the tabs.
> commands,
Two-tab inbox (Needs you /
Everything else), snooze, 
G
sequences, one-line reason per
alert, in-app first with other
channels opt-in.
Home view is a choice;
accessibility switches live
beside themes; custom themes
can be shared as a copyable
string.
Live preview on the 
real screen
while you browse, with
keep/revert by Enter/Esc;
theme switching as a palette
command; a preferred high
contrast theme.
Palette scope = where you are
(a breadcrumb inside the
palette); prefix keys per kind; a
rotating tip line; remappable
shortcut placed under
accessibility.
31 / 252
SOURCE WHAT I SAW WHAT IT ADDS TO HOME
Aleph docs, "Creating an
investigation workspace"
(
feat-home-aleph-create
,
img_02)
New Investigation is a pop-up asking for name, description, languages of the documents
("helps Aleph extract text… especially… non-Latin characters") and "Share with". Private by
default. The new workspace home shows four large "Quick links" cards (Upload documents,
Create new entities, Sketch a network diagram, Compare with other datasets), a left list of counts
(People 576, Network diagrams 0, Timelines 0, Lists 0, Cross-reference 62, Documents 5…) and
a right column with manager, access and "Content updated" dates.
A new case asks for the
document language; the first
screen of an empty case is four
big next actions; counts in a
side list; "last updated" dates
on the case.
Arc Help, "How do you hide
the Sidebar" (WebFetch)
"Hide or reveal the Sidebar using the shortcuts Command-S on macOS or Control-S on
Windows." Nothing more on that page.
A single shortcut toggles hidden
navigation; I could not confirm
Arc's edge-hover behaviour
from its help page.
Orion browser feedback
thread, "Sidebar open/close
on hover" (WebFetch, users'
forum, not a guideline)
Users ask for an auto-hidden sidebar that returns "when your mouse touches the left side of
your screen", citing Arc and SigmaOS. One user notes Apple's guidance discourages hover
triggered expansion because "a hover isn't an intentional action" and suggests expanding on
scroll instead; the developer points to a focus mode as an alternative.
The main risk of edge reveal
(accidental opening) stated by
users; supports a dwell delay, a
visible handle and a keyboard
toggle (UX §C2).
Obsidian Help, "Themes"
(text)
Settings › Appearance › Themes › Manage; "Install and use… immediately applies it"; "To revert
back to the default theme, select Stop using this theme"; separately, CSS snippets for small
changes.
A clear "stop using" path; small
personal overrides kept apart
from whole themes.
Maltego support, "Using Case
To Do Lists" (Hunchly)
(WebFetch)
Hunchly has a to-do list inside each case; "default To Do items for each case" can be set in the
Settings panel.
A new case can start with
default checks the reporter
chose once.
Mailchimp first-visit modal
(from R/notes/trends.md, not
re-captured)
"asks only two things (industry; up to 4 goals from 8 checkboxes), explains why… and offers an
equal 'No thank you'."
The model for the skippable
two-question setup.
Pages captured and dropped: none kept beyond the above; images
limited to 
≤
2 per site.
1. The case dashboard ("Case home")
Redesigning the investigation workbench 32 / 252
Today
Two homes that disagree. "/" is the workbench: one long page
(about 9,700 px, INV §12) with a header, five "Where things stand"
tiles and five stacked stage sections holding about 20 panels
[
frontend/app/page.tsx 
; 
page.tsx 
]. "/dashboard" is a separate "quick look" with four
Tailwind number cards (open leads, claims, entities, timeline
events), "Needs attention" (up to 6 leads), "Recent activity" (the
last 6 
timeline events
, not activity), and "Open full workbench"
[
frontend/app/dashboard/page.tsx 
].
Problems.
The dashboard has its own native 
selection, not 
components/layout/workbench
<select> and its own 
useState
The job
/#investigation-search because
page.tsx 
), developer framing
The empty state sends you to 
there is no way to create a case (INV §12).
The workbench header still says "FollowTheMoney-centred
review" and the tagline sentence (
on the most-seen line.
The Verify stage line explains status by colour only: "green
supported, red disputed, brown not yet shown" (
against WCAG 1.4.1 (LOOK §A3).
lib/stages.ts 
),
When a reporter opens a case, they need to know in five seconds
what the case is about, how far it has got, what changed, and the
single next thing that needs them — then get there in one move.
?inv= 
, so the dashboard and workbench can show
different cases (
dashboard/page.tsx lines 57–65).
FEATURE (OWNER AREA)
The Drop / documents
[...stats.timeline].slice(-6) 
: the last
Its "Recent activity" is 
dated events of the story, not what changed in the case.
Its look (rounded Tailwind cards, 
text-primary numbers) is
unlike the workbench (INV §12).
The navbar title links to /dashboard while "Workbench" is a
dropdown (
navbar.tsx 
).
MUST SHOW ON CASE HOME
Front and centre (from this feature)
1. The next decision — one item that only a person can decide, with
its evidence.
2. The case question and the standing numbers (§7).
What every feature puts on the dashboard
This is the content inventory UX §C3.1 asks for. Only items in the
"Must show" column earn a place on Case home; everything else is
one click away inside the module or the feature.
WHERE ON HOME_1
The document being read now, with real progress (page n of N, OCR or native);
count of documents not read yet
Review of proposals (/review, batch triage)
Count of proposals waiting; documents with problems
Bring in module, top card
Bring in rows; feeds Next up
Redesigning the investigation workbench
33 / 252
FEATURE (OWNER AREA) MUST SHOW ON CASE HOME WHERE ON HOME_1
Sources & evidence capture Number of sources and evidence records Standing numbers strip
(documents tile tooltip)
Connectors / Paper Trail Outside findings to review; a failed or stale source ("OpenCorporates did not
answer")
Bring in rows
Watchlist New hits, by name Bring in rows; notification
Claims Supported / disputed / not yet shown counts; the most important disputed
claim
Standing strip; Check module
To check Items left; the top item as the review card Standing strip (amber, "need a
person"); Next up
Connector findings / cross-references /
duplicates / AI candidates
Merged into one "waiting for you" count Next up queue position "4 of 7"
Network The six most-linked parties drawn with link status See module
Timeline / year slider Years with event counts, flagged years lit Bottom year rail
Money flows Money traced, in the case currency, with number of payments Standing strip
Places Count only (no map on home: not one of the two most important things) Inside See module (scroll)
Ownership chain Not on home (lives in the dossier) —
Red Flags The strongest flag with its first innocent explanation visible; the newest flag Act module
Leads Open leads count; urgent ones Act module footer
Chart builder, decks, write-ups Not on home; a write-up in progress appears as "Continue writing" in 
⌘
K
suggestions
—
AI drafts / research runs One line: running or waiting for review, with the AI tag "Since" strip; AI one-liner
Chain of Custody Not a tile; every number and card opens it with Trace —
Backup "Last backup 6 days ago" only when older than the reporter's chosen interval Notification, not a tile
Redesigning the investigation workbench 34 / 252
FEATURE (OWNER AREA) MUST SHOW ON CASE HOME WHERE ON HOME_1
Safety A notice only when a Strong or Textbook safety indicator fires (INV §11) Top-right corner, alarm colour
Glossary Not on home; hover cards everywhere —
Redesign
Format and layout. The recommended hybrid format: one-screen
dashboard, each module opening its feature whole-screen (UX Part
D(b)). At 1440×900 (HOME_1):
Top band (fixed in every format, LOOK §D2): breadcrumb and case
name at top-left; 
⌘
K bar in the centre; notifications, settings and
the safety "Hide screen" button at top-right (the corner for rare
but-urgent things, UX §C2).
Question + standing strip: the case's own question in the reading
serif ("Who really owns the harbour land?"), then seven numbers
(§7).
Three columns, sized by importance (hierarchical grid, UX §A3):
Left: Bring in (document being read, waiting counts, a permanent
drop target) above Check (status bar and the claims most worth a
look).
Centre, the only lifted panel (the one focal point, UX §C1.1): Next
up — the next decision as a review card. Under it, Since you were
away.
Right: Act · Red Flags above See · who is linked.
Bottom: the year rail (time-aware modules read it) and the
Pointing at bar (active selection with Clear, UX §C3.8).
Next up card (built on the expense-approval card in UX §C3.2):
evidence thumbnail with "View full page", the question in large serif,
the excerpt with the matched words marked, locator in mono, party
chips, then three tall buttons in the To check vocabulary — 
✓ Shows it
(S), 
✕ Does not (D), 
○ Unclear (U) — each colour + shape + word (LOOK
§B1). Answering advances to the next item with an "Undo for 10 s"
toast (UX §C1.5). The queue merges every "decide this" place (INV
§12 lists 8) and is ordered by what would change the story most: an
item that would raise a Red Flag level or settle a key claim comes
first, and the card says why ("From the Textbook Red Flag Circular
ownership").
Scroll-over. Scrolling over a module moves 
inside it and never scrolls
the page (Ony's decision; VIZ §B scroll rule): Next up steps through
the queue ("4 of 7 · scroll"); Check steps through claims; Act steps
through flags; the year rail moves the as-of year, and See shows
parties active that year. A module takes the wheel only after the
pointer rests on it for a moment and releases it at either end (UX
§C5). Every scroll action has a click (dots, arrows) and keys (
J
/
K
inside the focused module).
Hover. Pointing at a party chip anywhere lights it in every module (the
existing 
pointedParty in 
workbench-store.ts
), lights its years on
the rail and fills the Pointing at bar. Pointing at a standing number
previews its list in a popover. Nothing is only on hover (UX §C1.4): a
click on the same chip pins the selection.
Motion (UX §C4). Module 
→ whole-screen feature: motion.transform 450 ms ease-out-expo shared-element transition
(the module's frame grows into the feature; the item you clicked
Redesigning the investigation workbench 35 / 252
stays in place), reverse on Esc. Step inside a module: motion.feedback 160 ms slide along the list's axis. Answering a To
check item: the card slides out left, the next slides in, the standing
number ticks — numbers appear final, they do not count up (UX §C4
rule 5). Rain Noir: the opening transition is the CameraIris (PORT
§2.1). Reduced motion: a 120 ms crossfade.
States.
Empty case: Aleph's pattern — four large first actions (Drop
documents, Add a name to look up, Write the question, Open the
sample case), each one line; no whole-card empty states (INV
§12).
Loading: skeleton shapes of each module after 300 ms; the
document-progress bar is real progress.
Error: the module that failed shows one line with Retry; other
modules keep working (keeps today's per-panel error boundary).
Very large case (thousands of claims): numbers stay exact; the
mini network shows the top six by links with "+1,204 parties"; the
queue shows "1 of 312". Offline backend: the top band shows "Can't reach the workbench
server — Retry", the last loaded numbers stay with "as of 14:02".
Keyboard and screen reader.
G H home; 
1
4 focus a module; 
J
/
K
within; 
S
/
D
/
U answer the Next up card; 
Enter opens the module
whole-screen. Each module is a 
<section aria-label> with a
heading; the Next up card is announced as "To check item 4 of 7, from
Textbook Red Flag Circular ownership". Single-key shortcuts can be
turned off (WCAG 2.1.4, UX §A2).
Certainty and Red Flag levels. Claims use the 
.st chips and
dashed/solid card edges; flags use 
.lvl meters with words; the only
alarm colour on the screen is the Textbook fill (UX §C3.5, LOOK §B1).
Unverified people are never framed in alarm colour (UX §C9): Fernhill
Ltd is lit amber as "pointed at", not red.
Innovation
1. One "Next up" queue for the whole case, ranked by consequence,
not by where the item came from: "answering this would move
Circular ownership from Textbook to set aside" or "would settle
the disputed claim about the 2020 purchase". It ends the 8
separate decide-places on the home screen.
2. "Since you were away" re-entry strip computed from a real case
activity log (§8 backend), naming people, the app and AI as actors
(AI §A4, Linear's agents in the activity log), so a reporter returning
after a week with their daughter knows what moved.
3. The case question as the title of the case. The question the
reporter writes in setup (§6) sits above the numbers and is what
exports, decks and the story mode open with (VIZ §A1 "the
question goes at the top").
Built on
UX §C3 (all nine dashboard rules), §C1, §C4, §C5; Part D(b)
recommendation; VIZ §B scroll-over rule and §C12/C13/C17 tiles;
LOOK §B1 status grammar, §B3 surfaces; AI §A4 agents as named
actors; INV §2, §12. Outside: Aleph's empty-workspace quick links
and counts list; Linear's one-line reason per item.
Needs
Backend:
GET /investigations/{id}/standing (counts
computed on the server — today the frame fires 9 separate list
queries and counts in the browser, 
useStanding in 
workbench
page.tsx
); 
GET /investigations/{id}/next-up?limit= merging
Redesigning the investigation workbench 36 / 252
To check, document proposals, connector findings, cross
references, duplicates, AI candidates and watchlist hits, with a reason and 
consequence per item; a case activity log table (actor
kind person/app/AI/connector, verb, record, time) to back "Since
you were away".
Remove
/dashboard as a separate page (redirect to 
/?inv=
).
ADR: motion library vs native View Transitions for the module 
→
feature transform (UX §F).
Open questions for Ony: should Next up be ordered by
consequence (recommended) or by age? Is the To check card the
right default, or should the reporter pick which queue leads?
Should the year rail sit on Case home or only inside See?
2. The app frame and hidden edge navigation
Today
Navbar with title (
→ /dashboard), Dashboard, a "Workbench"
dropdown with a nested submenu of 6 older section anchors,
Glossary, Settings, About, a "backend console" badge and a
version badge 
DEV 1.18 while BUILD_STATE says 1.24
[
components/layout/navbar.tsx
].
Footer on every page [
footer.tsx
]; AppShell hides both only on /console [
app-shell.tsx
].
Stage rail (sticky left) with 5 stages and 18 part anchors, two of
them broken (
#money-flows
, 
#ai-reasoning-panel
)
[
lib/stages.ts
; INV §5].
Three sets of stage names: Collect/Verify/Map/Report/Keep in
code, Bring in/Check/See/Act in the redesign, an older six in the
navbar (INV §12).
Drawers appear without motion, backdrop or focus trap (
.wb
drawer
, INV §10).
The page background equals the card colour 
#1a2328
; text is khaki #baac91
, not the decided cream (
globals.css
).
The job
Let a reporter work on one thing at full screen, yet always know where
they are and reach any other part of the case in one move, by pointer
or by keyboard.
Front and centre
Nothing from the frame competes with content. Always visible: the
breadcrumb, the case name, the 
⌘
K bar, the safety button, and thin
edge handles.
Redesign
Edges, each with one job (UX §C2): left = the case and its four
steps (large words with counts, then the current step's features);
top = tools for the current view (filters, view switch, Clear);
bottom = evidence filmstrip with "n / N"; right = the selected
item's detail panel, opened by selection only.
Handles. A permanent 5 px handle on each used edge (HOME_1
shows left, top and bottom), labelled on first use ("
◂ CASE ·
STEPS"), 44 px tall hit area by padding (UX §C7). On touch they
become visible tabs.
Redesigning the investigation workbench 37 / 252
Opening rule. Open after the pointer 
dwells about 250 ms within 8
px of the edge (a flick past does not open it: the "hover isn't an
intentional action" worry from the Orion thread), or on click of the
handle, or 
Alt+←/↑/↓ (UX §C2.4), or a single toggle like Arc's 
⌘
S
(here 
⌘\ to pin the left panel open). Closes on pointer leave (300
ms grace), Esc, or choosing an item. Exact dwell to be settled by
timing tasks with reporters (UX §F).
Panel look. A frosted panel slides over the view, which stays
visible and dimmed to 60% (The Outline in UX §A2; frosted glass
in Rain Noir, PORT §2.2); the stage list uses large words between
rules (Locomotive, UX Part E image 2) with counts and a status dot
for "needs you".
Pinning. A pin in each edge panel keeps it docked (for large
monitors); the choice is remembered per device.
One set of names everywhere: Bring in, Check, See, Act, plus
Keep under Settings (UX §F decision). Rename 
lib/stages.ts
keys and labels and remove the navbar submenu.
Retire the navbar and footer inside a case. Glossary, About and the
console move to 
⌘
K and the left panel's footer; the version
moves to Settings › About.
Drawers become native 
<dialog> 
/popover with focus trap and
Esc (UX §C7), sliding from their edge (
motion.reveal 240 ms in /
180 ms out).
Motion: edge panels slide from their own edge; content behind
dims with a 160 ms fade; under reduced motion they fade without
sliding.
Screen reader: each edge is a landmark (
<nav aria-label="Case
and steps"> 
, 
<aside aria-label="Evidence filmstrip"> 
);
Redesigning the investigation workbench
aria-expanded 
; a skip link
handles are buttons with names and 
"Skip to main content" stays first in the tab order.
States: a step with nothing yet shows its count as "0" in the muted
colour and the first action ("Drop documents"); during a long job
the step shows a thin progress ring.
Innovation
1. A trail on the left edge: the last five places you opened (a claim, a
dossier, the Red Flag) listed under the steps, so "back to where I
was" is one move even across features — the history that INV §12
says is missing.
2. Edge peek counts: when the pointer is near but not dwelling, the
handle grows a little and shows only the "needs you" counts, so a
glance is enough and nothing opens by accident.
Built on
UX §C2 (edge jobs, dwell, handles, keys), §A2 hamburger-menu
costs, §C7 native dialog; Part D(b); LOOK §B3, PORT glass panes;
Orion users' thread (accidental hover), Arc's single toggle; INV §5,
§10, §12.
Needs
Frontend: a 
Footer + 
Frame component replacing 
AppShell + 
Navbar +
StageRail 
; route-level pages for each feature (see §3).
ADR: motion library (shared with §1).
Open question for Ony: should edge panels open on dwell at all, or
only on click and keys? (Recommendation: dwell on, with a
Settings switch "Open edges when I point at them".)
38 / 252
3. Breadcrumbs (and the address bar behind them)
Today
None. Opening a dossier, claim or relationship changes only zustand
state (
workbench-store.ts 
), so Back leaves the page; "Exit/Back to
workbench" from /review drops 
?inv= (INV §5, §12). Only 
lives in the address, rewritten with 
rememberInvestigation 
).
history.replaceState (
shows a return chip "
← Back to To check" (Teague's "keep
context", UX §C2). This replaces today's smooth-scroll jumps that
lose your place (INV §12).
?inv=
page.tsx
Item crumbs carry their status chip (a claim crumb shows 
DISPUTED 
), so the crumb itself says what you are looking at.
✕
Overflow: with long names, middle crumbs fold into "…", which
opens the full path.
Keyboard / screen reader:
<nav aria-label="Breadcrumb"> with
The job
Always say where I am (case › step › feature › item) and let me go up a
level or back to where I came from without losing my place.
Front and centre
The breadcrumb itself, top-left on every screen, visible even when
edges are hidden (UX §C2.3).
Redesign
Format:
Kestrel SA › Check › To check › Item 4 in 12.5 px
muted text, the last crumb in cream; each crumb a link. The case
crumb opens the case switcher (§5). In HOME_1: 
Cases ›
aria-current="page" 
; 
Alt+↑ goes up one level.
Motion: none on the crumb text (it stays still, UX §C4 "what stays
still").
Innovation
1. The breadcrumb is the ⌘K scope. Opening 
⌘
K copies the crumbs
into the palette as a scope chip (GitHub's location-as-scope);
Backspace widens it to the whole case, then to all cases.
2. A return chip that survives several jumps ("
← Back to Red Flags ·
3 steps"), backed by the trail in §2.
Kestrel SA › Home
; in HOME_2: 
Appearance 
.
Every opened thing has a URL (
Kestrel SA › Settings ›
/c/{case}/check/to-check/{id} 
,
/c/{case}/see/network?party=…&asof=2018 
) so Back, reload and
open* requests become
shared links work (UX §C2). The store's 
route pushes.
Cross-feature jumps keep context: a jump from To check to its
Red Flag opens the flag as a panel over To check, and the crumb
Built on
UX §A2 (breadcrumbs show location), §C2 address and history, §C4;
VS Code's breadcrumbs under tabs; GitHub palette scope; INV §5,
§12.
Needs
Frontend: Next.js routes per feature and item (today all features
are panels on "/"); a 
useCrumbs() hook fed by route segments and
record names.
Redesigning the investigation workbench
39 / 252
Backend: none (record names come from existing reads).
4. ⌘K search and command palette
Today
⌘K / Ctrl+K only focuses the search input, and only on "/" (
panel.tsx line 204: 
search
inputRef.current?.focus() 
); the header button
"Search records 
⌘
K" smooth-scrolls to the panel (
page.tsx
focusSearch 
). There are no commands, no overlay, and the full
search lives in Bring in (7 record kinds, facets, 75 results max).
The job
From any screen, find any record or place in the case — or do any
action — by typing a few letters, without knowing where it lives.
Front and centre
The 
⌘
K bar in the top band on every screen, with its shortcut shown.
Redesign
> 
), help (
One palette, three modes (GitHub pattern): search (default),
commands (
? 
). Prefixes by kind: 
companies, 
#
claims, 
!
Red Flags, 
$
money (payments by amount), 
@
people and
/
documents and passages,
:
glossary terms.
Layout: a centred dialog 680 px wide; scope chip(s) on the left of
the input taken from the breadcrumb; a tip line ("Type @ for
people and companies · ? for help"); results grouped by kind with
counts; each row shows the kind icon, name, the status chip (
✕ 
/
○
✓ 
/
, Faint/Strong/Textbook), one line of context and the locator
in mono; the right side previews the highlighted record (its peek
card, as today's search peek).
Actions on a result (shown on the highlighted row, keys in
brackets): Open (Enter), Trace (T), Add to leads (L), Show in
network (N), Copy citation (C). These reuse today's search-card
actions.
Commands: Go to any step or feature; New case; Switch case;
Drop documents; Add a claim; Start a research run; Export write
up (disabled with its reason until every sentence has a source, UX
§C6); Back up now; Switch theme (live preview while moving
through themes, VS Code); Calm motion on/off; Hide screen.
Natural-language queries later: if the reporter types a sentence
("payments from Fernhill in 2018"), the palette shows the
structured filter it built as editable chips before running it (UX
§C2.2, 
No-code app examples
); if an AI model builds it, the chips
carry the AI tag.
Empty palette: recent places (from the trail), "Continue: Write-up
draft", and the next up item.
States: typing shows results within 150 ms from a local index;
slower server search adds a "Searching documents…" row with a
spinner, never blocking the quick results; zero results offers
"Search outside sources…" (with the line saying what would leave
the computer, UX §C9).
Motion: opens with a 160 ms fade and 4 px drop; closes in 120 ms;
under reduced motion it just appears.
Redesigning the investigation workbench
40 / 252
Keyboard / screen reader:
role="combobox" with 
activedescendant 
; groups as 
aria
Built on
role="group" with labels; arrows,
Enter, Tab to add scope, Backspace to widen, Esc to close; the
opening shortcut is remappable in Settings › Keyboard (GitHub
puts this under Accessibility; WCAG 2.1.4).
Very large cases: 8 results per group with "Show all 214 claims"
which opens the full Search feature with the query.
Innovation
1. Palette as a lens on the dashboard: while the palette is open,
highlighting a party lights it on the dimmed dashboard behind (the
existing 
UX §C2.2 (one mechanism from every screen; [ADR] palette package),
§A2 search and shortcuts, §C6 disabled-with-reason, §C9 what
leaves the machine; GitHub command palette (scope, prefixes, help,
remappable keys, theme command); VS Code theme preview in the
palette; INV §2 search actions, §5.
Needs
ADR:
cmdk (or similar) vs a native 
<dialog> palette (UX §F).
Backend: a fast case-wide index endpoint (
GET
pointedParty 
), so you see where it sits before you go.
2. "Ask the case" stays honest: a query that cannot be answered
from records says so ("No record shows who signed in July 2017
— add to To check?") instead of guessing, and the offer creates a
To check item.
/investigations/{id}/quick-search?q=&kinds= 
) returning small
rows with status; today's search returns up to 75 rich results
grouped by 7 kinds and is too heavy for keystroke-by-keystroke
use.
Open question: which prefix letters Ony prefers; whether 
⌘K in a
text field should open the palette (GitHub uses a second shortcut
while editing Markdown).
5. Switching cases
Today
An investigation picker appears three times: the header (Radix
Select), again inside External connectors (the same element passed
down), and an unlinked native select on /dashboard (INV §5, §12).
With no 
?inv= the first listed case opens (
page.tsx 
). The demo case can be hidden per browser (
preference.ts 
). A switch resets every open trace, claim, dossier and
the as-of year (
setInvestigationId in 
Redesigning the investigation workbench
The job
Move between my cases quickly, see which one needs me, and come
back to exactly where I left each one.
Front and centre
investigationToOpen in
demo
workbench-store.ts 
).
The case name in the top-left with "Switch case 
⌘
O" (HOME_1).
41 / 252
Redesign
Cases shelf (opened by the case crumb, 
⌘
O, or 
>switch in 
⌘
K): a
panel listing every case as a row — name, the case question, the
step it is in, a "needs you" count, last opened, and a small status
bar of claims. A search box filters; the demo case is labelled
"Sample case — for practice" (UX §C3.7).
Each case remembers where you were (last route, as-of year,
pointed party) per device; switching back restores it instead of
resetting.
One picker only. Remove the copies in connectors and on
/dashboard.
All cases view (
/cases
, the planned "home for all investigations",
INV §11): the shelf at full screen as cards, each with its stage
tiles, newest flag and "changed since your last visit".
Motion: the current dashboard shrinks into its card on the shelf
(450 ms) and the chosen case grows out of its card; reduced
motion crossfades.
Keyboard / screen reader: 
⌘
O opens; type to filter; Enter opens; ⌘1
⌘9 jump to the first nine cases. The shelf is a listbox with
each row announcing "Kestrel SA, step Check, 7 need you, opened
yesterday".
States: one case 
→ the shelf still opens (to make a new one); no
cases 
→ the new-case setup (§6); a case the server no longer has
→ "This case was deleted or restored as a copy" with a link to the
list.
Innovation
1. Per-case place memory so switching is free.
2. Cross-case hints, never automatic: when a name in this case also
appears in another of your cases, the shelf shows "Fernhill Ltd is
also in Harbour Leases (2 records)" — a suggestion only, waiting
for a person (INV §11 "every link waits for a person").
Built on
UX §C2 address and history; INV §5, §11, §12; Linear's "Default home
view" preference; Aleph's per-workspace counts and "Content
updated".
Needs
Backend: 
GET /cases/summary (one row per case: question, step,
needs-you count, last activity); optional cross-case name match
endpoint (an open question in INV §11: "sharing caches between
investigations").
Open question: should cross-case hints exist at all, given privacy
between cases?
6. Creating a new case — the two-question setup (onboarding)
Today
No UI. 
POST /investigations exists with only 
name and
description (
routes_investigations.py line 337; 
schemas/api.py
InvestigationCreate
), but no button calls it. The only ways to get a
case are "Add demo data" in Settings or a backup restore (INV §12).
Redesigning the investigation workbench 42 / 252
The investigation type is chosen later in the Red Flags bar (42 area
cards, INV §12). A first-run tutorial that asks for each setting is
decided but not built (INV §11, 
docs/discovery/README.md line 251).
The job
Start a case in under a minute, with the app already pointed at the
right Red Flag areas and sources, without a long form.
Front and centre
On an empty app: one large "Start a case" card and "Open the sample
case". On the dashboard of a new case: the four first actions.
Redesign
A three-screen dialog, every screen skippable with equal-weight
buttons (Mailchimp's "No thank you"; Domino's equal choices, UX
§A8):
1. Name and question. "What are you trying to find out?" (one
sentence, becomes the case question) and a short name.
Optional: languages of the documents (Aleph — helps OCR and
name finding).
2. Question one — "What kind of case is this?" Up to three area
cards from the 42 Red Flag areas, shown as 8 common ones first
with a search for the rest (fixing the 42-card wall, INV §12). "Not
sure yet — let the app suggest" is an equal choice (today's "Let the
app choose").
3. Question two — "What do you have so far?" Tick any: documents,
a tip or a name, a company or address, a set of payments, photos,
nothing yet. Each tick decides the first screen: documents 
→ The
Drop opens; a name 
→ the lookup step with the line saying which
outside sources would be asked and what leaves the computer.
Then a summary card: "Kestrel SA · Hidden ownership, Money
laundering · starting with documents. 214 Red Flags in these areas
can now run. Default checks added: 3." Buttons: "Start" and
"Change".
Defaults per reporter (Hunchly): Settings › New-case setup holds
default To check items and default areas, and whether to ask
these questions at all.
First run of the app (no cases yet): the same dialog, plus three
settings asked once in plain words — outside lookups (off / ask /
automatic), research without asking (without approval / ask first /
off), and theme (a row of five specimen cards with live preview) —
each with a "decide later" option, completing the decided first-run
tutorial (INV §11).
Motion: screens slide left/right along the step axis
(
motion.reveal
); the summary card grows into the new
dashboard (
motion.transform
).
Keyboard / screen reader: a 
<dialog> with a step indicator "Step
2 of 3"; area cards are checkboxes; Enter continues; Esc asks
"Leave setup? The case is created with what you gave."
States: the server refuses 
→ stay on the summary with the reason
and Retry; the reporter skips everything 
→ a case named "Untitled
case — 10 Oct" with the empty-case quick actions.
Innovation
1. Follow-up questions arrive one at a time, later, from the material
(trends notes): after the first documents are read, Next up asks "Is
'J. Smith' in this email the same person as 'John Smith' in the
company record?" instead of a long setup form.
2. The setup writes the first To check items from the chosen areas'
person-only checks (e.g. "Visit the registered address"), so a
Redesigning the investigation workbench 43 / 252
brand-new case already has a next step.
Built on
Trends notes (two questions, skippable, pre-select areas and
connectors); Mailchimp's modal; Aleph's new-investigation fields and
quick links; Hunchly default to-do items; UX §A1 Hick's law, §C3.7
one-line empty states; BRAND §D voice ("records show", name the
limit next to the promise); INV §11–12.
7. Standing numbers
Today
Five "Where things stand" tiles on "/" (Claims with how-sure bar;
Evidence; Network; Timeline with year span; Leads by status) and
counts beside 7 rail parts, all computed in the browser from 9 list
queries (
useStanding 
, 
colour-only (
workbench-page.tsx 
). Problems: the bars are
SureBar sets 
aria-hidden and uses fill colour alone;
the legend uses colour dots); the lead legend shows raw status words
("unreviewed", INV §12); tiles jump with anchors; the dashboard
repeats a different set of four numbers.
The job
Show, in one glance, how much of the case is proven, what is left for a
person, and how big the case is — with every number traceable to its
list.
Needs
Backend: extend 
type_areas 
, 
InvestigationCreate with 
languages 
, 
question 
,
starting_material[] 
; add 
PATCH
/investigations/{id} (none exists) to edit name, question,
areas; an endpoint to seed default To check items.
Open questions for Ony: is the case question required or optional?
Should the first-run ask about theme, or leave theme to Settings?
Front and centre
Seven numbers in one strip (HOME_1): 
✓ claims supported · 
✕
disputed · 
○ not yet shown · to check (needs a person) · money traced
· date span · documents (unread).
Redesign
Each number: large tabular mono figure, glyph + word (never
colour alone), a caption naming what it counts. Hover or focus
previews the list; click opens it filtered.
The "needs a person" number is the one accent (amber
underline, HOME_1), because it is the reporter's work, not a fact
about the case.
Deltas since the last visit as a small "+2" beside the number, with
the actor in the tooltip ("2 decided by you, Tue").
Honesty rules: money traced counts only payments with a
supported link; a number that rests partly on unshown records
shows its share ("€29,400 · €9,800 not yet shown"); numbers
never animate into place (UX §C4.5).
Redesigning the investigation workbench
44 / 252
Very large values shorten with a full value in the tooltip (€1.2M 
→
€1,204,550.00).
Screen reader: a list with each item read as "11 claims
supported"; deltas read after the value.
Innovation
1. Numbers with a source line (BRAND §D rule 2, "every number has
a source line or does not appear"): every figure links to the query
that made it, viewable in Chain of Custody.
2. A "health" word instead of a score (VIZ §C12): "Not ready to
publish — 2 key claims not yet shown", worked out from the case
question's linked claims.
Built on
UX §C3.3 case-numbers strip (Stripe's live figure, Flow Ninja's
divided stat row); VIZ §C12–C13; LOOK §B1, §B4 tabular figures;
BRAND §D; INV §2, §12.
Needs
GET /investigations/{id}/standing with counts, deltas
Backend 
since a timestamp, and the share resting on unshown records.
8. Notifications and alerts (in-app by default)
Today
No notification system. Toasts (sonner) appear only for API payloads
of the wrong shape (
lib/report-error.ts 
); everything else is a grey
status line inside its panel (INV §4). The backend has 
GET
research run, a safety warning — without interrupting reading, and
without anything leaving my computer unless I ask.
Front and centre
/settings/security/alerts (24 h access denials) and an audit
summary with no UI (
routes_settings.py 
). Watchlist hits exist but
only show inside the corpus card. Planned: alerts per reporter, in-app
notification, a marker on the party or link in charts, the flag on Red
Flags; email and phone off by default (INV §11,
docs/discovery/indicators.md 
).
The job
The bell with a count in the top band; real alarms (Textbook flag,
safety) as the only interrupting notice.
Redesign
Inbox panel from the bell or 
G N
: two tabs — Needs you and
Everything else (Linear's Priority/Other). Each row: icon by kind,
title, one-line reason ("Watchlist: Fernhill Ltd appears in 1 new
document"), status chip or level meter, age, and the case name
when not the current case.
Tell me when something in my case changes that I should act on — a
new Strong or Textbook flag, a watchlist hit, a finished import or
Redesigning the investigation workbench
Kinds and default routes: | Event | Default | |---|---| | Textbook Red
Flag appears; safety indicator Strong/Textbook | Needs you +
45 / 252
notice in the top band (alarm colour) | | Strong flag appears;
watchlist hit; To check items added | Needs you | | Import finished;
research run finished or blocked; AI draft ready | Needs you (they
unblock work) | | Faint flag; connector refreshed; backup reminder;
security denials | Everything else |
Actions: Open (Enter), Done (E), Snooze (H: later today, tomorrow,
next week, "the week I'm back" — a custom date), Mute this kind; J
/
K to move (Linear keys).
In-chart markers: the party or link the alert is about gets a small
ring in the network and a tick on the year rail until opened (INV
§11).
Toasts only for actions you just took, with Undo (UX §C6); never
for background events while reading.
Quiet while reading: in calm zones (reader, Chain of Custody,
review) nothing pops up; the bell count changes silently (LOOK
§B5).
Other channels (desktop notification, email, phone) are off and
listed in Settings › Notifications with the line saying what each
would send and where (UX §C9).
Motion: the bell count changes with a 160 ms fade; a Needs-you
item slides into the panel if it is open; one rise-and-fall flash at
most for the Textbook notice, never repeating (PORT §1.4, WCAG
2.3.1).
Screen reader:
aria-live="polite" announces only Needs-you
arrivals, summarised ("1 new Strong Red Flag"); the inbox is a list
with each row's reason as its description.
States: empty 
→ "Nothing needs you." with the time of the last
check; very many 
→ grouped by kind with counts ("12 To check
items added by the import").
Innovation
1. "While you were away" digest instead of a flood: alerts that arrive
while the app is closed are grouped into the dashboard's Since
strip and one inbox row per kind.
2. Alert by consequence: a notification can be set on a claim or flag
change ("tell me if the 2020 purchase claim changes status"), not
only on record types — a watch on the story's key facts.
Built on
INV §11 alerts decision; UX §C6 (one feedback pattern, toasts only
with undo), §C9; LOOK §B5 calm zones; PORT §1.4 photosensitivity;
Linear Inbox (two tabs, snooze, keys, one-line reason, in-app first);
AI §A9 andon ("respond only to abnormalities").
Needs
Backend: 
notifications table (case, kind, record, reason, level,
created, read, snoozed_until, user), rules per user, emitters in the
Red Flag recompute, watchlist check, import batch end, AI run
end and safety check; 
GET /notifications?tab= and a stream
(SSE via FastAPI 
StreamingResponse
, no new package, as
proposed in AI §B4) or polling.
Open question: should a Textbook flag ever interrupt (a top-band
notice), or only count on the bell?
Redesigning the investigation workbench 46 / 252
9. Settings
Today /settings has four cards: API access (token in memory, Save, Clear),
Operator console (loopback note and link), Private AI (read-only
status), Demo mode (seed, hide per browser, delete with preview and
typed id) [
app/settings/page.tsx
]. The page says connector
credentials, backups and the audit log "are on the main workbench" —
they sit in a folded 
<details> at the bottom of Keep
[
features/security/security-panel.tsx
]. Users and roles exist only
in the backend console. AI is configured only by environment.
Planned settings not built: outside-lookups switch, research
automation, per-source keys, alert preferences, Faint/Strong
thresholds where no source gives one, first-run tutorial, regrouping
(INV §8, §11).
The job
One place to decide how the app behaves for me, for my cases, and
on this computer — each setting saying where it is stored and what it
sends out.
Front and centre
Not on the dashboard. A settings gear in the top band; any setting
reachable by name from 
⌘
K ("theme", "lookups").
Redesign (HOME_2 shows the frame)
Three groups in a left list (HOME_2): You (Appearance,
Notifications, Keyboard, Your safety); Cases (New-case setup,
Outside lookups, AI and research, Red Flag levels, Demo case);
This computer (Access and token, Connector keys, Backups,
Security log, Operator console). Each row shows its current value
on the right ("ask", "ask first", "2 of 3") so the list itself is a
summary.
Moves: connector credentials, security status, audit log and
orphan files come out of Keep into This computer; backup and
deletion stay reachable from the case (they act on one case) and
are linked here.
Every setting has: the control, one sentence of what it does,
where it is stored ("this device" / "this case" / "the server"), and
what leaves the computer if anything (UX §C9). Equal-weight
choices, no pre-selected destructive option (UX §C9).
AI and research: the run profile controls from AI §B3 (source tier
floor D, severity floor, extra passes, autonomy "ask first") as case
defaults, with the protected layers shown locked.
Settings search at the top (HOME_2), the same index 
⌘
K uses.
Security status rewritten as plain rows with status chips (not
"small grey lines with raw paths", INV §12); paths behind "Show
technical details".
States: a setting the server owns (AI provider) shows "Set on the
server — change it in the environment file" with the exact variable
name behind Details; access errors show the token form inline.
Keyboard:
G , opens Settings; arrows move through the list; each
section is a heading.
Innovation
1. Settings as a readable "what this app does with my data" page: a
generated summary at the top of This computer — "Nothing leaves
Redesigning the investigation workbench 47 / 252
this computer except: searches you send to OpenSanctions; AI
runs go to a local model" — built from the actual settings.
2. Per-case overrides shown as differences: a case that departs
from your defaults lists only what is different ("Kestrel SA:
outside lookups automatic, research depth exhaustive").
Built on
INV §8, §11–12; UX §C9, §A8 equal choices; AI §B3 run profile;
BRAND §D rule 3 (name the limit next to the promise); Linear
Preferences (default home view; accessibility switches beside
themes); Obsidian (Appearance as one place, clear revert).
10. Per-person ("user") settings
Today
Only two per-person things exist: the session token (memory only)
and "hide demo" in localStorage (
demo-preference.ts 
, wrapped in
try/catch). The backend has app users, memberships, roles and per
user tokens with no workbench UI (
routes_settings.py
/settings/security/users… 
; ADR-0002 still Proposed, INV §11).
The job
Let each reporter set how the app looks and talks to them — theme,
motion, keys, notifications, text size — without changing anything for
teammates.
Front and centre
Nothing on the dashboard; the chosen theme is simply visible.
Needs
Backend: settings persistence for case defaults and per-person
preferences (today only environment and in-memory); expose
connector-credential status and security status in one 
GET
/settings/overview 
; a per-investigation settings record (outside
lookups, research automation).
Open questions: should the operator console stay a separate
iframe or become This computer › Advanced?
Redesign
You group in Settings: Appearance (§11), Notifications (routes
from §8), Keyboard (single-key shortcuts on/off, remap 
⌘
K, the 
?
sheet), text size (90–130%), underlined links, Calm motion, Your
safety (hide-screen shortcut, quick-exit page, the SA indicators'
notice level).
Storage now: per device in localStorage with try/catch and a
working default when storage is blocked (as 
demo-preference.ts
user_preferences record so a
already does). Later (multi-user): a 
reporter's choices follow them; device-only items (effects level,
pinned edges) stay per device (LOOK §D3).
Profile (later, multi-user): name, initials colour for authorship
marks, role per case (viewer, reporter, admin), token rotate/revoke
— moving the console-only user tools into the app.
Redesigning the investigation workbench
48 / 252
Innovation
1. "Same look, different device": the theme follows the person;
effects follow the machine (Rain Noir's rain on the desktop, Light
on the laptop on battery) — LOOK §D3, made automatic.
Built on
LOOK §D3 per person, per device; UX §A2 WCAG 2.1.4; INV §6
frontend-only state, §8, §11 multi-user; Linear's interface
preferences.
Needs
Backend later: 
user_preferences (JSON per user); the frontend
keeps a typed preference store with a schema version.
11. The theme setting — themes, effects, formats, live preview
Today
One fixed palette ("Dark Academia") in 
globals.css with khaki text #baac91 on 
#1a2328
, where background equals card colour; headings
in Georgia; body in Inter. No theme switch, no reduced-motion rules
(INV §10, §12). Note for the ADR: 
@fontsource packages are already
used for deck fonts in 
app/layout.tsx (Inter, IBM Plex Sans, Source
Serif 4, Newsreader, Public Sans and others are installed), but
Manrope, Jost, IBM Plex Mono, Domine, Bricolage Grotesque and
Caveat — needed by the themes — are not.
The job
Let Ony and every reporter choose a look that suits how and where
they work — including entirely different formats — while status,
contrast and calm reading surfaces stay guaranteed.
Front and centre
Not on the dashboard. Visible only as the look itself; "Switch theme"
in 
⌘
K.
Redesign (HOME_2)
Three layers, chosen separately (LOOK §D1):
1. Theme = tokens: colours, fonts for five roles, radii, shadows,
motion speeds. Five specimen cards: Case Night, Rain Noir,
Archive, Forest Ledger, Indigo Clarity — each card drawn 
in its own
theme (the card carries 
data-theme
), with mood line, six
swatches, "Header / Body copy / €29,400" in its three fonts, the
six status chips, and the lowest computed contrast pair ("Lowest
pair 5.90:1 · AA"). A sixth card: "Make your own", which starts from
any theme and refuses colours that fail the contrast floor (LOOK
§D2–D3).
2. Effects = the optional pack on the board and transitions only:
segmented Full / Light / Off, plus switches (Rain Noir shown):
Bokeh lights on the board (CSS, 23–34 s drift), Rain on the case
home pane (WaterDrops "Steady", one pane only), Film grain 3.5%
(never on documents), Iris when a feature opens (CameraIris, 8
blades), Shutter corners on save (brackets only, no flash), Neon
title on Textbook flags (steady only, off by default) — every item
Redesigning the investigation workbench 49 / 252
from PORT §5 with its limits. "Light is chosen automatically on
battery" (portfolio quality tiers full/lite/minimal, PORT §4). Calm
motion switch, also following the OS reduced-motion setting.
3. Format = layout recipe of the same components: Board (default),
Editorial (big words as the menu), Desk (corkboard of evidence),
Story (chapter by chapter) — small thumbnails in HOME_2.
Live preview — on the real case, not a sample (LOOK §D3; VS Code's
up/down preview): pointing at (or arrowing to) a card re-renders a
miniature of the current Case home in that theme inside a
before/after divider (the app already uses 
react-compare-slider for
chart pictures, INV §4) — left "Case Night · now", right "Rain Noir ·
trying". Below it, four facts: passes every contrast check (and the
lowest pair), calm zones untouched, which fonts load on this
computer, and the cost on this device ("Rain pane ~1 ms a frame ·
sleeps when hidden").
Try, then keep: "Try" applies the theme everywhere with the slim bar
at the top — "Trying Rain Noir · nothing is saved until you keep it ·
Keep Rain Noir · Go back to Case Night (Esc)" — Ony's own 
?try=
habit (PORT §1.4) as a product feature. Nothing persists until Keep;
closing the app goes back (Obsidian's "Stop using this theme").
Rain Noir specifics (Ony's pick, LOOK §C2, PORT §5): ground #18120F (lifted from the portfolio's 
#0E0906 so it is never black),
cream 
#F0EAE1
, amber 
#DD9231
, teal 
#3AB3AD
; Manrope interface,
Jost 300 titles only, Source Serif 4 in the reading room, IBM Plex
Mono for data; frosted panels (blur 30 px, saturate 150%) over the
BokehField; one rain pane behind the case title band, over a night
city photograph; the iris on feature open; reading room, tables,
claims, Chain of Custody and review stay on plain dry surfaces.
Invariants no theme or format may change (LOOK §D2): the status
grammar, the calm zones, contrast floors (the loader runs the same
checks as 
look_contrast.py and refuses a failing theme), fixed
positions of the case title and 
⌘
K, keyboard flows and focus rings,
reduced motion, no flash above 3 per second, evidence images never
tinted.
Motion: switching theme crossfades colours over 450 ms (Rain Noir
700 ms); effects fade in after the colours; format changes use shared
element moves so each module travels to its new place (UX §C4 rule
1); under Calm motion all of this is a 120 ms crossfade and the rain
shows a still "after the rain" frame.
Keyboard and screen reader: the gallery is a radiogroup; arrows
move and preview; Enter tries; 
K keeps; Esc goes back. The divider is
a slider (
role="slider"
, 
← 
→
, value "50% Rain Noir"). Each card's
accessible name includes its lowest contrast and "has effects" when
it does.
States: a font that cannot load falls back with a note on the card ("Jost
not installed — using system sans"); WebGL unavailable 
→ the rain
switch shows "Not available on this computer" and Rain Noir still
works without it (effects "degrade to nothing", PORT ADR-0003); a
custom theme that fails contrast cannot be saved and names the
failing pair.
Innovation
1. "Your photograph behind the glass." Rain Noir's glass and rain
need a photograph behind them (PORT §2.2, §4.6). Let the
reporter choose the hero photograph — for Ony, one of his own
night shots — stored locally, marked as decoration and never
mixed with evidence.
2. Effects pause themselves when you read: opening the reader or
Chain of Custody puts the effect loop to sleep and resumes it on
Redesigning the investigation workbench 50 / 252
return, so the pack costs nothing during real work (PORT "one
loop, loops sleep when idle").
3. Shareable theme strings (Linear's linear.style copy-to-use): a
custom theme exports as a short text that another reporter can
paste — still gated by the contrast check on import.
Built on
LOOK Part C (five themes with computed contrast), Part D (three
layers, invariants, preview pattern, per person/per device, custom
colours through the check), §B1–B5; PORT §1.4 (
?try=
, effects not
load-bearing, quality tiers), §2 components, §4 porting limits, §5 Rain
Noir mapping and calm rules; UX §C4 motion tokens and reduced
motion; VS Code live theme preview and preferred high-contrast
theme; Linear custom themes; Obsidian revert.
Needs
ADR: effects engine port for Rain Noir (scheduler, shared WebGL
context, WaterDrops; framer-motion, html-to-image; licence
check of the vendored liquid-glass library and the "PB glass
texture" pack) — LOOK §D4, PORT §4. Bokeh, grain, iris and neon
are CSS/SVG and need no package.
ADR: bundled fonts — extend the existing 
@fontsource pattern to
Manrope, Jost, IBM Plex Mono, Domine, Bricolage Grotesque,
Caveat (no Google Fonts requests while working on a sensitive
case, LOOK §B4).
ADR: motion library for format transitions (shared with §1).
Frontend: tokens as CSS variables on 
html[data-theme] (as mock/tokens.css
), 
data-effects
, 
data-format
, 
data-try
;
replace the hard-coded 
globals.css palette and the 
SWATCH
constants used by tiles.
Open questions for Ony: which night photograph goes behind the
glass by default; should Rain Noir's rain be on by default or opt-in;
is Format worth building before the Board format is finished
(recommendation: build Board first, offer Story next).
12. Cross-cutting decisions this area asks Ony to make
1. One set of stage names (Bring in, Check, See, Act; Keep folds into
Settings and case actions).
2. Retire 
/dashboard
; Case home lives at 
/c/{case}
; 
/cases is the
all-cases view.
3. Edge panels: open on dwell (with a switch) or only on click and
keys.
4. Next up order: by consequence (recommended) or by age.
5. Textbook flags and safety warnings: allowed to show a top-band
notice, or bell count only.
6. Rain Noir defaults: rain on or off at first use; the default
photograph.
Redesigning the investigation workbench 51 / 252
Bring in
One drop for everything; a visible digestion line for every file; a Read receipt that
starts the chain of custody; one reading room in place of two review flows; quotes that
check themselves.
05
Redesigning the investigation workbench 52 / 252
The Drop and the digestion line: each file moving through its steps, problems first.
Redesigning the investigation workbench 53 / 252
The reading room in Rain Noir: page strip, calm serif text, proposals in the margin linked by leader lines, evidence capture.
Redesigning the investigation workbench 54 / 252
0. New outside research for this area
Each line says what I read or saw, and what it gives this area. Only
what the pages showed is reported.
SOURCE
ICIJ Datashare — docs
"Explore a document"
(
pages/feat-intake
WHAT I SAW OR READ
datashare/img_01.png 
,
img_02.png 
)
OCCRP Aleph — docs
"Uploading documents",
"Searches, filters, and
alerts", "Key terms"
DocumentCloud — help
"Uploading Documents"
Google Pinpoint — LSE
Polis article (2021)
A document opens with four tabs: Text (default, the extracted text, 
⌘
/Ctrl+F to search inside,
Enter / Shift+Enter between hits), View (the original file; only for images, PDF, CSV, XLSX,
TIFF), Metadata (each value has a search icon to find other documents with the same value;
"Y children documents" with "Search all"), Entities (people, organisations, locations, emails
with occurrence counts; hovering one shows its mentions in context; an Info tab says how it
was extracted). Full-screen view has a "Document 1 of 2" carousel to step through results.
The screenshot 
img_02.png shows raw OCR text with errors ("Priccwalcrhousc Coopers",
"Socie1c a rcs11onsabili1e limitec").
Upload by Browse or folder; "It will take a little while to process your uploaded files";
progress is "a small spinning indicator" next to the workspace name, with detail only when
you "Hover over the name of your investigation workspace". Alerts are made from a search
with Create alert, arrive by email and in a notifications tab "when new data is added … that
meet the requirements of your search". Cross-referencing compares a list's entities against
other datasets.
Drag-and-drop or "New Documents"; files must be processed before the viewer works; "all
non-PDF files are converted to PDF"; OCR with Tesseract for files without embedded text,
20+ languages, default language set per account; the help describes no on-screen progress
indicator, only an optional email when processing ends.
Accepts email archives, audio, images and handwritten documents; audio becomes
transcripts with highlighted terms and time codes; extracts names, places and institutions;
groups variants ("JFK" and "John F Kennedy") as one term; up to 200k documents per
workspace.
WHAT IT GIVES BRING IN
The reading-room tab set (Text /
Original / Translation / Email / Details);
"search inside" with Enter stepping;
the "N of M" stepper; metadata values
as pivots. The OCR screenshot is the
case for showing OCR quality honestly
next to text, not hiding it.
Aleph hides progress behind a hover
on a name. That is the opposite of what
our reporters need: progress must be
visible per file. Alerts made from a
search is the model for "Watch this" on
any search or selection.
Language choice for OCR belongs in
The Drop (per batch, defaulting from
the case). Another tool with no visible
per-file progress — our gap to fill.
Variant grouping is the "Is this name
already a record?" question surfaced
earlier, at proposal time. Audio
transcription is a future file kind
(OpenAleph already has a
"Transcribing" queue label in
openaleph_status.py 
).
Redesigning the investigation workbench
55 / 252
SOURCE
Hunchly — Maltego
Academy page and
"Hunchly Evidence Guide"
(PDF)
Hypothesis — blog "Fuzzy
anchoring"
Readwise Reader — docs
"Highlights, Tags, and
Notes"
Zotero — "Adding items to
Zotero"
Linear — docs "Triage"
(
pages/feat-intake
WHAT I SAW OR READ
"automatically captures and saves every website you visit during an investigation"; each page
saved as MHTML with UTC date, URL and title; a SHA-256 of the file shown on the dashboard;
each file GPG-signed; selectors "automatically detect key information such as names, emails
or IP addresses" across captured pages; captions on images; DOCX/PDF reports. The guide is
honest about limits: hashes can be regenerated after edits, and it recommends corroborating
with the live site or the Wayback Machine.
Each annotation stores a TextQuoteSelector (
exact 
, plus 32 characters of 
prefix and
suffix 
), a TextPositionSelector (start/end offsets) and a range; re-attachment tries range
→
position 
→ context-first fuzzy match 
→ quote-only fuzzy match (diff-match-patch, Bitap).
WHAT IT GIVES BRING IN
Source capture must keep a snapshot
with a hash and time, not just a URL
and a typed quote. Selectors = our
watchlist, applied to 
captured web
pages as well as documents. Honest
limits wording for the Read receipt.
Our evidence quotes store a locator
and a chunk span. Adding 
exact +
prefix + suffix makes a quote re
findable after re-OCR or "Find names
again", and lets the "Says it?" check
(SYN_VIZ E1) run automatically.
Up/down arrows move a focus indicator paragraph by paragraph; H highlights the focused
paragraph; selection auto-highlights (Shift+H turns it off); T tags, N notes; notes appear in the
right margin when the sidebars are hidden with 
[ and 
matched to the article still show in the Notebook tab.
] 
; highlights that could not be
The connector's save button changes its icon to the kind of page (journal article, web page);
metadata is read by site translators; "Automatically take snapshots" saves a copy as a child
item; a popup shows "which Zotero collection the item is being saved to", where you can
change it and add tags.
linear/img_00.png 
)
"Unplanned work centralized in a Triage inbox": one list, each row with title, source icon
(Intercom, Sentry, a person) and age ("6m ago"). Keys: accept 1, decline 2, duplicate 3
(choose which issue to merge into), snooze H (returns at a chosen time or on new activity).
"Triage Intelligence" suggests properties and likely duplicates.
Keyboard capture in the reading room:
J/K by passage, E saves the focused
passage as evidence. The "could not
be matched" tray is the model for
quotes whose text moved after a re
read.
One-click source capture that detects
the source type, keeps a snapshot, and
shows 
where it is being saved, with
tags, in a small confirmation — replacing
our six-field form.
One intake inbox where every outside
finding, cross-reference and watchlist
hit arrives with its source icon and age,
decided with single keys, with
"duplicate of…" as a first-class action
and "snooze until new activity" for hits.
Redesigning the investigation workbench
56 / 252
SOURCE
GitHub Actions — docs
"Using the visualization
graph" (
pages/feat
intake
ghactions/img_02.jpg 
)
WHAT I SAW OR READ
"Every workflow run generates a real-time graph"; each job a box with a status icon (tick,
spinning dot, empty ring) and a duration; lines show dependencies; a matrix of jobs collapses
to one box, "3/3 jobs are completed · Show all jobs"; zoom −/+ and full-screen.
OpenSanctions — docs
"Configuring the scoring
system", "Using the
matching API"
Results ranked by score; a 
threshold (default 0.7; 0.8–0.85 for low false-positive
tolerance); several algorithms (
logic-v2 current). On review: a hit "is not immediately
cause for alarm", common names produce frequent matches; set up "a process for human
review"; supply as many properties as you can so mismatches on birth date or nationality can
rule out a candidate.
Notes on sources: OpenCorporates is not a connector in the code
today (
backend/app/connectors/ holds 
firecrawl 
); 
aleph 
, 
opensanctions 
,
docs/discovery/sources.md (checked 5 Oct 2026)
1. One frame for the whole area
Where Bring in lives. Following SYN_UX format (b) — a one-screen
dashboard plus whole-screen features — Bring in becomes three
whole-screen features and one shared inbox:
1. The Drop — add anything (files, a link, pasted text, a photo) and
watch it digest. Mockup INTAKE_1.
2. The reading room — read one document, see its passages and
proposals, capture exact evidence. Mockup INTAKE_2. Replaces
/review 
, the inline proposals list and the per-document toggles.
3. Paper Trail — every outside source (OpenAleph, OpenSanctions,
the outside Aleph server, Firecrawl, later OpenCorporates and the
free registries) with status, freshness and what leaves the
Redesigning the investigation workbench
WHAT IT GIVES BRING IN
The digestion line: each file is a row of
stage boxes with status icons and
times; a big batch or an archive's
contents collapse into one "18 of 23
read · Show all" box.
Connector matches show the score
and which properties agree or clash,
never alarm colour; the reporter can
add properties (birth year, country) to
narrow the match before deciding.
records it as paid, with free access for journalists and NGOs on
application, planned as an optional key. Firecrawl is wired as a web
search adapter only.
machine; records by source; what stands out; the watchlist; send
outs. This is Ony's decision of 6–7 Oct
(
docs/discovery/README.md 
), replacing "External connectors" and
"OpenAleph corpus".
4. Intake inbox (a section of Paper Trail, also reachable from the
dashboard): one list for connector findings, cross-references,
cross-provider clusters and watchlist hits — fixing "Deciding is
spread over 8 places" (INVENTORY §12) for the four that start in
Bring in. Linear's triage keys.
Search stays global (
⌘
K, SYN_UX C2.2) with a "Search inside
documents" scope; inside the reading room 
⌘
F searches the open
57 / 252
document.
Dashboard module for Bring in (SYN_UX C3.4: "the document being
read, with progress"). One tile, sized medium:
Front: the digestion line in miniature — the files moving now as
thin lanes with their current stage, or, when idle, "47 documents ·
1,208 passages · 63 proposals waiting" with the oldest waiting
document's thumbnail.
One action: "Drop documents" (also a real drop target: dropping
files onto the tile starts The Drop with a shared-element transform
THING
A proposal (name, claim,
quote, identifier, link)
Confidence (how sure the
reader is, not the fact)
Confidence uses dots, Red Flag levels use bars (
▮▮▯
), so the two can
never be confused (SYN_LOOK B1 keeps bars for flags). Who
proposed it is always printed: "Name-finder (rules)", "OpenAleph",
"Column mapping", "You", or — if a model ever proposes — the plum
AI tag (SYN_LOOK B1, SYN_AI B1). Red Flags appear in Bring in only
as a consequence: a document whose passages fed a flag carries the
flag's 
into the whole-screen view).
A small row of source health dots for Paper Trail (word + shape,
not colour only: "OpenAleph 
✓ working", "OpenSanctions 
○ not
checked this week").
Scroll over the tile steps through files in flight ("3 of 7"), never
scrolls the page (SYN_UX C5).
Status grammar used across this area (extends SYN_LOOK B1;
shapes and words fixed in every theme):
PROPOSED
dashed outline, hollow 
○
,
word PROPOSED
three dots 
●●● / 
●●○ / 
●○○
with HIGH / MEDIUM / LOW
ACCEPTED
solid edge, 
✓
, ACCEPTED (then it takes the
claim grammar: SUPPORTED / NOT YET
SHOWN …)
—
REJECTED
struck through, 
✕
,
REJECTED, dimmed one
step
—
NEEDS AN ANSWER
a small "?" tab on the card
edge and the question as
text
—
"Reading files", "Finding names", "Indexing for search", "Translating",
"Transcribing", "Placing addresses on the map", "Collecting images",
"Preparing similarity search"). The digestion line uses seven
columns:
Received → Checked (fingerprint, duplicates) → Read (text or
.lvl chip in its Read receipt.
OCR) → Split into passages → Files inside → Names & facts
proposed → Ready for you
Pipeline stages as reporters' words (one vocabulary for the
digestion line, the tile, the Read receipt and the Chain of Custody).
The backend already names OpenAleph's queues in plain words
(
STAGE_LABELS in 
backend/app/services/openaleph_status.py 
:
Redesigning the investigation workbench
Optional side stages (shown only when they run): Translating,
Transcribing, Indexing for search, Similar documents.
58 / 252
2. The Drop: adding documents (INVENTORY §2 "The Drop", §9 steps 1–5)
Today. Two upload forms in one card: single (title + file + "Upload &
extract") and bulk ("Import N document(s)")
(
frontend/features/documents/documents-panel.tsx
). Problems:
Two near-identical forms (INVENTORY §12; docs/discovery/README.md page audit already asks for one drop
zone).
No drag and drop; a native file input (
<Input type="file">
).
Progress is grey sentences: "Saved. Reading the document: …",
"Importing 3 of 12: name", "Reading them: 4 of 12 finished…"
(
uploadDocument
, 
uploadBulk
).
Bulk upload, when done, 
router.push
es to 
/review/batch
, a
different plain layout (
p-6 max-w-5xl
), and "Back to workbench"
there drops 
?inv= (INVENTORY §12).
The duplicate case shows "Keep a second copy of X" only for
single upload; bulk only lists names in a sentence.
The card description is a 50-word paragraph about OpenAleph and
the Workbench reader.
A hard-coded review note "Reviewed in Next.js workbench" is
saved on every decision (
REVIEW_NOTE
), a developer string stored
in the case record.
Single upload asks for a title the user must type; bulk derives it
from the filename. Inconsistent.
The job. Put any pile of material into the case in one move and know,
at a glance, what was read well, what was read badly, and what needs
me.
Front and centre. (1) Every file's current stage, visibly moving. (2) The
count of things waiting for the reporter, with "Start reading (problems
first)".
Redesign.
Layout: a whole-screen feature (mockup INTAKE_1). Left third:
the drop field — a large target ("Drop files, a folder, a link, or paste
text") which shrinks to a 120 px strip once files arrive. Centre: the
digestion line (§3). Right: Ready for you — waiting proposals by
kind and the problems list, primary button "Open the reading room
· problems first". Bottom edge: the filmstrip of thumbnails of what
was dropped (SYN_UX C2: bottom = filmstrip, with "n / N"). One drop for everything: files and folders (native HTML drag-and
drop and 
webkitdirectory
; no package), a pasted URL becomes a
source capture with snapshot (§13), pasted text becomes a "note
document" with the reporter as source, a dropped photo becomes
picture evidence (§9). The title defaults to the filename and is
editable inline later. Before reading, one quiet line of choices (collapsed): OCR language
(default from the case; DocumentCloud sets it per account), "read
files inside archives and emails" (on), "send to OpenAleph for
name finding" (on when OpenAleph is set up) with the plain line
"Nothing leaves this computer: OpenAleph runs here" or, if it is
remote, where it runs (SYN_UX C9: one line saying what leaves
the machine). Duplicates: a duplicate row stops at Checked with a ring and the
words "Already in the case as 
Kestrel annual report 2017.pdf ·
same fingerprint", offering "Open that one" (primary) and "Keep a
second copy" (quiet). Same for single files and batches. Hover over a file row: the row lifts (shadow-lift, 160 ms) and
shows its Read receipt preview; 
scroll over the line moves through
Redesigning the investigation workbench 59 / 252
files (rows), never the page; 
click opens the file's Read receipt in
the right panel.
Motion (SYN_UX C4): a dropped file appears as a paper card at the
drop point, then travels (motion.transform 450 ms, expo-out) to
its lane's first box; each stage change moves the file's marker one
box right with motion.reveal (240 ms); a finished row settles with
a single 
✓ press (100 ms); a failure stops the marker with a short
notch, never a shake. Stagger at most 6 rows, the rest fade in.
Under reduced motion or "Calm motion": no travel, boxes swap
state instantly, and an ordered log under the line announces
changes. States:
Empty — the drop field fills the screen with one line and the
sample-case link "Try with the sample case (teaching case)".
Loading — skeleton lanes. Error on one file — the row stops at the
failed stage with the reason in plain words and "Try reading again"
(calls the existing 
retryJobEndpoint
), plus "Read with the
Workbench's own reader" when OpenAleph failed. Offline /
OpenAleph unreachable — a single in-line banner "OpenAleph is
not answering: files are saved and will be read when it is back"
(today 
CorpusStatus already detects 
unreachable
). Very large
(hundreds of files, or an archive of thousands) — see §3.
Keyboard / screen reader: the drop field is a button ("Choose files",
Enter opens the picker) and a drop target; 
O opens the picker; the
digestion line is a 
role="grid" (rows = files, columns = stages),
arrows move, Enter opens the receipt; an 
aria-live="polite"
region announces only summaries ("Kestrel annual report read:
214 passages, 37 proposals") and failures, never every stage.
Certainty and Red Flags: no flag colours here; OCR quality and
reading problems use the "needs an answer" tab and words.
Innovation.
1. Drop anything, one place — files, folders, links, pasted text and
phone photos land in one field and are routed to the right reader;
the reporter never chooses between "upload" and "capture
source".
2. Problems-first by default — the reading room opens on the files
that read badly or ask questions, then the rest (the batch page
already sorts this way via "Start review (problems first)"; this
makes it the default everywhere).
Built on. SYN_UX C2 (edges, filmstrip), C3.7 (one-line empty state +
teaching case), C4 (motion tokens, "the same object moves"), C6 (in
line messages, specific words), C9 (what leaves the machine);
SYN_LOOK B5 (calm zones); GitHub Actions graph; DocumentCloud
OCR language; Aleph's hidden progress as the anti-pattern.
Needs. No package for drag-and-drop or folders. Backend: accept a
pasted URL or text through the same intake route (or route it to
source capture on the client); an 
ocr_language option on upload.
Open question for Ony: should a dropped folder keep its folder path
as a "Found in folder" fact on each document (useful provenance for
leaks)?
3. The digestion line: following each file (INVENTORY §9 steps 5–12,
OpenAleph progress)
Redesigning the investigation workbench 60 / 252
frontend/lib/jobs.ts waitForJob 
, 1.5 s in
Today. The job is polled (
bulk); OpenAleph's stage counts are shown only while it is "working",
as a bulleted list "Reading files: 2 waiting · 1 in progress · 7 done" for
the whole investigation, not per file
(
frontend/features/documents/corpus-status.tsx 
). Problems:
Progress is per investigation and per queue, so a reporter cannot
tell which file is stuck.
Several pollers at different rates (job 1.5 s, corpus 3 s, batch 3 s).
Non-fatal reading problems ("extraction issues": blank pages,
degraded OCR, table-only DOCX, empty file) appear only on the
batch page and as a red banner on 
/review 
.
The status vanishes when OpenAleph goes idle, so there is no
record of what happened.
The job. See what the app did to each file, step by step, and catch the
one that went wrong without reading logs.
Front and centre. Each file's lane with its current stage; and a per
stage total row ("Read 38 · Reading 3 · Failed 1").
Redesign.
Layout: a grid of lanes (mockup INTAKE_1). Column heads are the
seven stages with small icons (lucide, installed) and a running
total. Each lane: file icon by kind, name (mono for the extension), a
stage track of seven boxes (done = filled with 
✓
; current = ring
with a moving arc and the live detail, e.g. "page 12 of 40, OCR";
waiting = hollow; skipped = a dash and the word "not needed";
failed = notched square 
✕ with the reason), and at the end a count
chip "37 proposals · 4 questions".
Nesting: files inside an archive or email hang under their parent
with a thin connector line (today 
document-tree.ts
nestDocuments 
); a container with more than 5 children collapses
into a matrix box "Inside harbour_bundle.zip · 18 of 23 read ·
Show all" (GitHub's matrix pattern).
Side stages (Translating, Indexing for search, Similar documents)
appear as small satellite pills under the lane only when they run.
Hover a box: a tooltip card with times ("Read in 42 s · OCR on 9
pages · 2 pages blank") and, for OpenAleph stages, its queue
name. 
Click a box: opens the Read receipt scrolled to that stage.
Totals row: across the bottom of the line, one stacked bar per
stage, so a batch of 500 reads like a Sankey that fills.
Motion: the moving arc on the current box is the only looped
animation (motion.ambient is reserved for the board). Lights do
not travel between files; each file's marker steps.
States: 
very large — above 40 files the lanes virtualise and the
view defaults to "Problems and in progress"; finished, clean files
fold into one summary lane "412 read cleanly · Show"; the totals
row stays. Stalled — a stage with no change for longer than a set
time shows "No progress for 6 min" in words and "Check"
(
retryDocumentRead path). Done — the line keeps its final state; it
becomes the batch's history, opened later from the document's
receipt.
Keyboard / SR: as §2; 
F
toggles "Problems only"; each box has an
accessible name "Fernhill board minutes, Read: in progress, page
12 of 40".
Innovation.
1. Read receipt — every document gets a one-card receipt the
moment it is read: fingerprint (SHA-256, shown short with "copy
full"), pages, how text was got (native / OCR, with the share of
pages OCR'd), OCR quality where the engine reports it, issues in
plain words, passages made, files found inside, proposals by kind,
which reader and version, what left the machine (nothing /
Redesigning the investigation workbench
61 / 252
OpenAleph on this computer / a named server), and links to "Open
in reading room" and "Trace" (Chain of Custody). It is the human
readable top of the provenance chain (Hunchly's dashboard hash,
with its honest-limits note).
Needs. Backend: one per-document stage record combining the job
(
backend/app/models/jobs.py 
), OpenAleph's per-document state
where the API gives it, chunk count and candidate counts, with
timestamps per stage; a batch stream 
GET /api/ingestion
2. Stage replay — the receipt keeps the stage timeline, so a reporter
or an editor can replay how a document entered the case
(scrubber like SYN_AI B2's, but only seven steps).
Built on. GitHub Actions graph (status icons, durations, matrix
collapse); SYN_VIZ B (certainty grammar on boxes), SYN_AI A2/B1
("show the work", step logs with counts), SYN_UX C4 rule 4 ("motion
covers waiting, not data"), C6 (stalled and error words); Hunchly
(hash and limits).
batches/{id}/events as Server-Sent Events with FastAPI's built-in
StreamingResponse (no package; SYN_AI B4.2), polling as fallback.
Job cancel is built on the server but not in the UI (INVENTORY §9
step 23): add "Stop reading" on a running box. ADR: a virtualised list
(
@tanstack/react-virtual 
) if lanes exceed a few hundred [ADR].
Open question: does OpenAleph expose per-document stage state,
or only per-collection counts? If only counts, the per-file boxes for
OpenAleph stages must say "in OpenAleph's queue" without a page
number.
4. Document list (INVENTORY §2 "Document list", 
Today. Each document is a 
.candidate box: filename, raw status
word ("complete", "extracting"), chunk count, proposal counts as
entity: 12 · claim: 3
, and an OpenAleph line with "provider
document" ids (
documents-panel.tsx 
). Problems: developer words
("chunks", "provider document", "Sync to OpenAleph"); indentation
by inline style; no thumbnails, no sorting or filtering; the list lives in
the same card as two upload forms.
document-tree.ts 
)
(SYN_VIZ D9 contact-sheet view; SYN_UX: visual evidence over
text walls), each with name, kind icon, date read, a proposals ring
(PROPOSED dashed portion vs accepted solid), and a 
✓ "nothing
waiting". A list view toggle (dense table) for big cases.
The job. Find a document again and see which ones still need me.
Front and centre. Thumbnail, name and "waiting for you" count.
Redesign.
Layout: in The Drop's whole-screen view a "Library" tab beside
"Digestion line": a contact-sheet grid of page thumbnails
Redesigning the investigation workbench
Filters across the top edge: kind (PDF, email, spreadsheet, picture,
web capture), "waiting for me", "read with problems", source
(Paper Trail source tags), date added, inside a container.
Hover: thumbnail lifts, shows the first passage; 
scroll over the grid
scrolls the grid (made for scrolling). Click opens the reading room
with the shared-element transform from thumbnail to page.
States: empty 
→ the drop field; very large 
→ virtualised grid, sticky
counts; error 
→ per-card notch with the reason.
62 / 252
/
focuses the
Keyboard: arrows across the grid, Enter opens, 
filter.
Innovation. "Read with problems" lens — one toggle greys every
clean document and leaves only those with issues, as a ladder of the
worst first (blank pages, low OCR quality, table-only text).
Built on. SYN_UX C3 (one focal point), SYN_VIZ D9 (contact sheet),
Datashare's metadata pivots (click a value 
→ documents with the
same value).
Needs. A thumbnail endpoint (first page image) — the picture
endpoint exists for pictures (
/api/documents/{id}/picture 
); PDFs
need a rendered first page (PyMuPDF on the server is already used for
OCR, 
pdf_ocr.py 
, so no new backend package).
5. Per-document actions (INVENTORY §2, 16 buttons)
Today. Up to 16 equal buttons in one row on each document: Review
proposals, Review history, OpenAleph status, Sync to OpenAleph,
Refresh OpenAleph review, Find names again, Look for files inside
again, Headers & thread, Translation, Similar documents, Map
columns to entities, Picture evidence, Trace document, Retry reading,
Check reading progress (
documents-panel.tsx 
). The INVENTORY §12
"button walls" problem.
The job. Do the next likely thing to this document; reach the rare ones
without hunting.
Front and centre. One primary action that depends on state: "Read &
decide (12 waiting)" / "Try reading again" / "Map the columns" /
"Caption the picture".
Redesign. One primary button + "More" menu (SYN_UX C1.2). The
rest become:
Tabs of the reading room (Text, Original, Translation, Email,
Details) for Headers & thread, Translation, Similar documents (in
Details), Map columns (Spreadsheet tab for tables), Picture
evidence (Original tab for pictures).
Read again submenu: "Find names again", "Look for files inside
again", "Try reading again" — each shows its run on the digestion
line.
OpenAleph submenu becomes invisible plumbing: status lives in
the Read receipt and Paper Trail; "Sync" happens automatically
(corpus sync), with a manual "Send to OpenAleph now" in More.
"Refresh OpenAleph review" disappears: OpenAleph's proposals
arrive by themselves when its analysis settles (the backend
already knows when, 
analysis_settled in
openaleph_status.py 
).
Trace stays as one icon button with the label "Trace" on every
document (Chain of Custody beside, not over, the view).
Right-click on a document card opens the same menu (SYN_UX
C5).
Innovation. State-aware primary button: the single button always
names the next step and its count, so a reporter can run down the
library pressing Enter.
Redesigning the investigation workbench
63 / 252
Built on. SYN_UX C1.2 (one primary action beside the selection),
Fitts' law; INVENTORY §12 button walls.
Needs. Server trigger to fetch OpenAleph proposals automatically on
"analysis settled" (today the reporter must press Refresh). Open
question: should "Send to OpenAleph" ever be manual, or is the
corpus sync always on?
6. Proposals and review — the reading room's right side (INVENTORY §2
inline proposals; §9 steps 10–18)
Today. Two flows:
Inline: "Review proposals" loads a document's proposals and lists
them below all documents, not under their document; no source
text; no identity check (
documents-panel.tsx
; INVENTORY §12).
/review
: one document at a time, source text left (sticky, chunks
with 
<mark> on the hovered proposal's span), proposals right,
J/K/A/R keys, then a summary "N document(s) reviewed… X
accepted, Y rejected" (
frontend/app/review/page.tsx
). It uses a
plain layout, says "chunk(s)", shows confidence bands as 
text
destructive for low (red for "low confidence", which reads as
alarm), and in fallback mode asks the server once per document
for pending proposals. Other problems: the proposal heading is a
code word (
entity proposal
); "Accept canonical relationship"
wording; a status line after each decision ("Its
document/chunk/review lineage is retained for provenance
tracing.").
The job. Decide quickly and correctly what the document really says
— which names are which records, which sentences are claims worth
testing, which quotes are evidence — always seeing the exact words.
Front and centre. The passage with the proposal's words marked, and
the proposal card with Accept / Reject and the one question it needs
answered.
Redesign (mockup INTAKE_2, right column).
Layout: the reading room is three columns in one screen: page
strip (left, 120 px), reading surface (centre, 40–60 characters per
line in the reading serif; SYN_LOOK B4), margin of proposals
(right, ~420 px). Proposals are anchored to their passages like
margin notes; the margin scrolls 
with the text (it is a feature made
for scrolling).
Proposal card: kind icon + kind in words ("Name", "Claim",
"Quote", "Email address", "Link between two records"), the text,
confidence dots and band word, who proposed it, locator in mono
("p. 3 ¶ 4"), and the action row: Accept (A) tall, Reject (R) outlined,
"Why?" fold (§7). A card that needs an answer shows the question
inline and Accept stays disabled with the reason ("Say what kind
of record this is first") — SYN_UX C6: disabled controls say why.
Linking text and card: pointing at a card lights its exact span in the
text (today's behaviour, kept) and draws a thin leader line from
card to span; pointing at marked text lights its card. Colour-linked
highlight between passage and label (SYN_VIZ A4, FigJam
img_03).
Redesigning the investigation workbench 64 / 252
Marks in the text: proposed spans get a dashed underline in the
kind's hue; accepted get a solid underline; rejected lose their
mark. No fill over text (calm zone, SYN_LOOK B5).
After a decision: the card collapses into a one-line receipt "
✓
Harbour Nominees Ltd — added to the case · Undo" for 6 s
(SYN_UX C1.5 undo over confirm); the next card takes focus
(motion.feedback 160 ms, next item slides along the list's axis).
Batch actions: "Accept all HIGH names in this passage (4)"
appears only when every one has no open question and no strong
match (SYN_AI A4: per-item Keep plus "Apply n").
Session footer: "This document: 9 accepted · 2 rejected · 5 waiting
· Document 3 of 12" with 
← 
→ for documents.
States: 
nothing waiting — the margin shows one line "Nothing
waiting in this document · Next document 
→
". Many proposals
(hundreds) — the margin groups by page, folds pages not in view,
and offers "Show only questions". Error — the card keeps the
decision and shows "Not saved — try again" in place.
Keyboard / SR: J/K next and previous proposal (scrolls the text to
its span), A accept, R reject, 
1–5 answer a question's choices, 
keys, 
?
U
undo; single-key shortcuts can be switched off and never
fire while typing (WCAG 2.1.4, SYN_UX C2.4). Each card is a
role="article" with an accessible name "Name proposal,
Harbour Nominees Ltd, high confidence, page 3"; announcing a
decision via 
aria-live 
.
Certainty / Red Flags: proposal grammar (§1); once accepted, a
claim takes the claim grammar (NOT YET SHOWN until evidence is
attached), so acceptance is never shown as proof.
Innovation.
1. Decide in the text — select any words in the passage and press 
(claim), 
E
(evidence quote), 
C
N
(name) to make your own proposal
from them; it enters with "You" as the proposer, already accepted,
with exact anchors (§13).
2. "What changes if I accept" — a hover preview on Accept: "Adds
Harbour Nominees Ltd (Company) · links to 3 passages · fires 0
Red Flags · joins 1 cross-reference", so the reporter sees
consequences before acting (Dropbox act-left/see-right, SYN_UX
A3).
3. Revision rate — the reading room tracks how many proposals of
each proposer were rejected; the Read receipt shows "Name
finder: 31 of 40 accepted" so the reporter learns which reader to
trust on which kind of file (SYN_AI B1.5).
Built on. SYN_UX C1.2, C1.5, C2.4, C6; SYN_LOOK B4–B5; SYN_VIZ
A4 (colour-linked highlights); SYN_AI A4 (Keep/Apply n), B1.5; Linear
triage keys; Readwise keyboard reading.
GET /api/investigations/{id}/pending-proposals
Needs. Backend: 
returning documents with counts in one call (fixes the one-call-per
document fallback, INVENTORY §12); per-proposal "impact preview"
(counts only) is optional. Remove 
REVIEW_NOTE developer strings;
store the client and version in a separate field if wanted. Retire the
inline proposals list and 
/review layout in favour of the reading room
(keep the URL 
kept).
7. "Why was this proposed?" (INVENTORY §2; 
/review?… as a redirect so old links work, with 
components/extraction-explanation.tsx 
)
?inv=
Redesigning the investigation workbench
65 / 252
Today. A folded explanation per proposal: method label, rationale
basis, parts with values and reasoning, confidence and its basis,
sources with the matched text, caveats. Good content; shown as
nested small text with bold labels.
The job. Trust or distrust a proposal for a stated reason.
Front and centre. The rule or provider in one line and the matched
words.
Redesign. A fold on the card that opens a small "how it was found"
strip: proposer chip 
→ rule in plain words ("A capitalised name
followed by 'Ltd'") 
→ the matched words in mono with the passage
line 
→ confidence dots with basis 
→ caveats as warnings with 
⚠ and
words. If a model ever contributes, its part has the plum AI tag and
dashed underline (SYN_AI B1.2 grounded vs guessed). Opens with
motion.reveal; content never animates in (SYN_UX C4 rule 5).
Innovation.Explain by example — "3 other proposals in this case
were found by the same rule; 2 were rejected" with links, so a weak
rule shows itself.
Built on. SYN_AI A5 (Figma MCP "Guessed" vs "Real" brackets), B1.2;
SYN_VIZ E (checks with words); Datashare's entity Info tab ("how the
entity was extracted").
Needs. None for the basic version; the "by example" line needs a
count by rule id (backend 
extraction_explanations.py already
names the method).
8. Questions asked during review (INVENTORY §2 Schema question,
Identifier owner, Is this name already a record?; §9 step 14)
Today.
Schema question (
schema-question.tsx
): "Clarifying question: Is
'X' a Person or an Organization?" with buttons, the suggestion
marked "(suggested)"; Accept waits. Wording shows "Not sure
(LegalEntity)".
Identifier owner (
identifier-owner.tsx
): "Which entity does this
email address belong to?" with the document's entities first, then
"Accept 'X' first", then a picker of all. Is this name already a record? (
entity-identity.tsx
): same
name / similar / shared words in the case, plus "Also in
OpenAleph" links; "Same as X" or "A new record"; Accept blocked
on a strong match. Used only on /review, not in the inline flow
(INVENTORY §2). Problems: the identity check is missing from
one of the two flows; "entity" and "LegalEntity" are developer
words; three different visual treatments.
The job. Answer the one thing the app cannot know, in one click,
without leaving the passage.
Front and centre. The question as a sentence and its choices as large
buttons, the suggested one pre-marked.
Redesign. One question tab component on the proposal card, three
variants, same look:
"What is 
M. Ross
?" 
→ Person · Company · Organisation · Not sure
(with icons; "Not sure" saves as an unknown kind, no code word).
Redesigning the investigation workbench 66 / 252
Keys 
1–4
.
"Is 
Harbour Nominees Ltd already in the case?" 
→ side-by-side
mini cards of the candidate record(s) with the reason in words
("Same name: 'Ltd' and 'Limited' read as one"), the properties that
agree 
✓ and clash 
✕ (OpenSanctions advice: more properties rule
out more), and "A new record". OpenAleph matches below, as
links to follow, never choosable unless in our own collection
(today's rule, kept).
"Whose is 
m.ross@fernhill-holdings.example
?" 
→ the document's
own people first, as chips; "Accept 
M. Ross first" inline; "Someone
else…" opens the 
⌘
K picker scoped to records. All three appear in
the reading room only (one flow).
Innovation.Answer once, apply to the batch — after "Harbour
Nominees Ltd = Harbour Nominees Limited", the app offers "Same
answer for 6 more mentions in this batch?" (shown with the list;
nothing applied silently; every link waits for a person — INVENTORY
§11).
Built on. Pinpoint's variant grouping ("JFK" / "John F Kennedy");
OpenSanctions human review and property-based narrowing; Linear's
"Mark as duplicate 
→ choose which"; SYN_UX C6 (disabled says why).
Needs. Backend: batch-scoped "same answer" suggestions (reuse resolution.py matching over the batch's pending proposals). Open
question for Ony: should "Not sure" be allowed to accept, or must the
kind be known before a name becomes a record?
9. Picture view and picture evidence (INVENTORY §2 Picture evidence; §9
step 21)
Today. For PNG/JPEG documents: the picture (max height 320 px),
"Caption: what the picture shows", "Date taken, as its source states
it" (
YYYY
, 
YYYY-MM or 
YYYY-MM-DD
), "Save as picture evidence"
(
picture-evidence.tsx
). Problems: the picture is small inside a
button row; no metadata shown; one picture 
→ one evidence record
covering "the whole picture" only.
The job. Look closely at a photo, say what it shows and when, and
keep exactly the part that matters.
Front and centre. The picture itself, large, untouched.
Redesign.
Layout: the reading room's Original tab becomes a light-table: the
picture fills the centre on a neutral surface (images never tinted,
SYN_LOOK B3); right margin holds the caption, date taken (with a
precision picker year / month / day instead of a format string), and
"who says so" (the source of the date). Region evidence: drag a rectangle on the picture to save a crop as
evidence (locator "region x,y,w,h of the original", the original
untouched); several regions per picture.
Viewing aids (zoom, contrast boost for a faded scan) are labelled
and reversible and never saved into the evidence (SYN_LOOK B3,
"Color grading explained").
Redesigning the investigation workbench 67 / 252
Metadata panel (Details tab): camera date, GPS and device if the
file carries them, shown as "the file says", never as fact.
Hover: a loupe on the pointer at 2× (toggle 
pictures.tsx 
) and kept as one evidence pair.
Z 
). 
Scroll over the
picture zooms (Ctrl+wheel per SYN_VIZ B scroll rule; plain wheel
pans).
States: loading 
→ blurred low-res then sharp; error 
→ "The picture
could not be shown" with the file still downloadable.
Keyboard:
+ 
/
−
zoom, arrows pan, 
R
starts a region, Enter saves.
Innovation. Before / after pair builder — two pictures with dates can
be paired right here into the existing compare slider (
chart
Built on. SYN_LOOK B3, A8 (correction not grading); Hunchly (image
captions and metadata); SYN_UX C5 (scroll rules), SYN_VIZ B.
Needs. Backend: evidence with a region locator (a JSON locator field),
EXIF read on the server (Pillow is likely present via the image reader
— to confirm in 
image_reader.py 
; if not, [ADR]). Open question:
should GPS from EXIF become a proposed place (Places map) or stay
metadata only?
10. Email view (INVENTORY §2 Headers & thread)
Today. A 
<dl> of Subject, Date, From, To, Cc, Bcc, then a numbered
thread with "Review proposals" for messages held, "not uploaded to
this investigation" otherwise (
email-view.tsx 
).
The job. Read an email as an email, see who wrote to whom and
when, and reach its attachments.
Front and centre. From 
→ To with date, and the thread position.
Redesign.
Layout: the reading room's Email tab: a header block styled as a
letterhead (From, To, Cc as person chips linked to records when
known; Date in mono with the timezone the header gives), then
the body in the reading serif, then attachments as thumbnail cards
(each its own document).
Thread rail on the left instead of the page strip: messages as dots
on a vertical line by date, the current one ringed; held messages
open in place; missing ones are hollow with "not in the case".
Who-told-whom mini: a small sequence strip of the thread
(lifelines per person, arrows per message) linking to SYN_VIZ D1's
whole-screen view.
Hover a person chip: their record peek; 
click: opens the dossier as
a panel over the reading room with a "Back to email" crumb
(SYN_UX C2).
States: thread unknown 
→ "OpenAleph could not rebuild the
thread" (today's 
thread_note 
).
Innovation. Missing-message gaps — when In-Reply-To points at a
message the case does not hold, the rail shows a hollow dot "a reply
to a message we do not have (sent 3 May 2021 by M. Ross?)" that can
become a To check item or a records request lead.
Built on. SYN_VIZ D1 (sequence diagram), SYN_UX C2 (keep your
place), Datashare "children documents".
Redesigning the investigation workbench
68 / 252
Needs. Nothing new on the backend for the basic view
(
getDocumentEmail exists); the gap dots need the referenced
Message-ID kept in the thread reply.
11. Machine translation (INVENTORY §2)
Today. A three-column table Where / Original / Translation with a
warning that quotes come from the original (
document
translation.tsx
). Good rule; dense table.
The job. Understand a foreign-language document while quoting only
the original.
Front and centre. Original and translation side by side, aligned by
passage, with the language pair.
Redesign. The reading room's Translation tab is a two-column
parallel reader: original left (the only selectable column for
evidence), translation right in a muted style with a persistent label
"Machine translation · on this computer · read only". Hovering a
passage on either side lights its pair. Selecting text in the translation
offers "Find in original" rather than "Save as evidence". Language pair
chip ("deu 
→ eng").
Innovation.Quote guard — if the reporter tries to copy from the
translation, a small note offers the original passage and its locator
instead.
Built on. The existing rule in 
document-translation.tsx
; SYN_UX C9
(what leaves the machine), SYN_AI B1.2.
Needs. None.
12. Spreadsheets: map columns to records (INVENTORY §2; §9 step 20)
Today. For CSV/TSV/XLSX: sheet picker, first rows table, entity blocks
(kind, name column, key columns, properties with date formats such
as 
%d/%m/%Y
), link blocks (kind, from, to, properties), "Preview the
first rows", "Propose for review"; links accepted only after both ends
(
table-mapper.tsx
). Problems: a long vertical form of native <select>
s; strftime date formats; "entity" wording; no picture of
what the mapping will make.
The job. Turn a register or ledger into people, companies and
payments without writing a mapping by hand.
Front and centre. The sheet's columns and the records they will
make.
Redesign.
Layout: the reading room's Spreadsheet tab, whole-screen: top
half the sheet (first 50 rows, sticky header; columns get type
badges the app guesses: name, date, amount, country, id); bottom
half a mapping canvas with record "sockets" — drag a column
header onto "Company · name", "Person · name", "Payment ·
Redesigning the investigation workbench 69 / 252
amount", etc.; links are drawn by dragging from one record socket
to another and choosing the kind from the fixed set (no free text).
Live preview: beside the canvas, the first 10 rows rendered as a
mini network (cards and arrows) using the network's own
components, updating as columns are mapped. Dates: the app proposes the format from the values ("looks like
14/03/2019 — day/month/year") with a choice, not a format string. Hover a column: lights every place it is used; 
hover a record
socket: lights its columns. States: very wide sheets 
→ column search; mixed types 
→ a 
⚠ "12
rows have no date" chip; error 
→ in place. Keyboard: a list alternative to drag ("Column 'Director' 
→ Person
name" via menus); every drag action has a menu path (SYN_UX
C1.4). Result: "Propose for review" sends rows into the reading room as
proposals (unchanged backend rule: links after both ends).
Innovation.Column fingerprint suggestions — when a column looks
like company numbers or IBANs, the app suggests the property and,
where a connector can check it, "look these up in Paper Trail" (with
what will leave the machine).
Built on. SYN_VIZ C1 (edges as readable claims), SYN_UX C1.4; the
existing FollowTheMoney mapping (unchanged).
Needs. Drag uses the installed dnd-kit (already used by the kanban).
Backend: column type guesses (can be client-side). No new package.
13. Source & exact evidence capture (INVENTORY §2 #source-capture
; §9 step 25)
Today. A form: title, URL, source type (web, document, interview,
public record, social, other), exact locator, quote, note; "Save source
+ evidence". It shows only two counts; there is no list of sources
(
source-capture-panel.tsx
; INVENTORY §12). The success line
shows a raw id: "Saved evidence {id}". No snapshot of the web page is
kept; nothing proves what the page said at capture time.
The job. Keep the exact words a source said, where it said them, and
proof that it said them then.
Front and centre. The quote, its source and when it was captured; the
list of sources with how much evidence each holds.
Redesign.
Three ways in, one record: (1) select text in the reading room and
press E (mockup INTAKE_2: the evidence clip card); (2) paste or
drop a link into The Drop or 
⌘
K "Capture a web page"; (3)
"Something someone told me" for interviews and calls (title,
who, when, the exact words, how recorded).
Evidence clip card (the visual unit of evidence everywhere): the
quote in the reading serif with no ligatures (SYN_LOOK B4), the 32
characters before and after in muted text (Hypothesis 
prefix / suffix
), locator in mono, source chip, captured time, and for
documents and web pages a small crop of the page image behind
the words (visual evidence, SYN_UX "clippings"). Status: NOT YET
SHOWN until linked to a claim.
Redesigning the investigation workbench 70 / 252
Web capture: the app fetches the page, keeps a snapshot (HTML or
MHTML + screenshot), its SHA-256 and the time, and shows them
on the source (Hunchly); a source-type icon detected from the
page (Zotero's changing save icon); a small confirmation shows
"Saving to: Harbour land case · Sources · tags: registry" with tags
editable (Zotero).
Sources list (Paper Trail 
→ "Records by source", and a Sources tab
in the library): each source as a row with type icon, title, captured
date, evidence count, claims it supports, snapshot 
✓ / "link only",
and freshness ("checked 3 days ago — still online" / "changed
since capture 
⚠
").
States: link dead at capture 
→ saved as "link only" with the reason;
page behind a login or paywall 
→ "not seen" status, never "shown"
(SYN_VIZ E9).
Keyboard: E in the reading room; 
capture.
Innovation.
⌘⇧E from anywhere opens quick
1. Self-checking quotes — because each quote stores exact + prefix
+ suffix, the app re-finds it after a re-read and runs SYN_VIZ E1
"Says it?" automatically; a quote it cannot re-find goes to an
"unanchored" tray (Readwise's Notebook for unmatched
highlights), never silently lost.
2. "Changed since capture" — for web sources, an optional re-check
compares the live page with the snapshot hash and marks the
source "changed" or "gone", which is itself evidence.
Built on. Hunchly (capture, hash, signature, limits), Hypothesis
(selectors, fuzzy re-anchoring), Zotero (one-click save, snapshot,
where-saved popup), Readwise (unmatched highlights), SYN_VIZ E
(checks 1, 8, 9), SYN_LOOK B4 (no ligatures in quotes).
Needs. Backend: 
prefix 
, 
suffix 
, 
exact and character offsets on
evidence (the chunk span already exists); a sources list endpoint with
counts (
listSources exists; add evidence and claim counts); fetch
snapshot — planned in 
docs/discovery/system-design.md as WARC +
screenshot + hash per fetch (INVENTORY §11 crawler). A headless
browser for screenshots is [ADR] (Playwright on the server, or reuse
Firecrawl when the reporter allows it — what leaves the machine
must be stated). Open question for Ony: sign snapshots with a local
key like Hunchly, or is the SHA-256 plus the Chain of Custody
enough?
14. Search inside documents (INVENTORY §2 Search, Peek card,
Documents in the corpus; §5 ⌘K)
search-panel.tsx 
) searches records (7
Today. The search panel (
kinds) with facets, 75 results, hover actions T/N/C/
↗ and a peek card;
"Documents in the corpus" runs the same query against OpenAleph's
index with highlighted snippets and page numbers (
corpus
results.tsx 
). 
⌘
K only focuses the search box on "/". Problems: two
result groups with different looks; the corpus group sits below
records; no in-document find; no way to watch a search.
The job. Find every place a name, number or phrase appears in the
documents, and jump to the exact page.
Redesigning the investigation workbench
71 / 252
Front and centre. Hits as passages with the match marked, the
document and page.
Redesign.
⌘K palette (SYN_UX C2.2) with scopes: Everything · Records ·
Inside documents · Sources · Commands. "Inside documents"
results are passage cards: document thumbnail, name, page, the
snippet with matches marked (
<mark> in the theme accent, plus
underline for colour-blind safety), and how many more hits that
document holds ("+6 in this document").
Whole-screen search (Enter on "See all"): left facets (kind of file,
source, date range with small bars — INVENTORY §11 search
extras, person/company mentioned, language); centre hit list;
right a preview of the hit page in the reading surface, so the
reporter can read without opening. In-document find: 
⌘
F in the reading room; Enter / Shift+Enter step
through hits; the page strip shows hit ticks (Datashare). Watch this search button on every search ("Tell me when new
documents match") 
→ watchlist (§17), Aleph's "Create alert". Hover a hit: the preview pane scrolls to it; 
scroll over the list moves
the lit hit (list rule, SYN_VIZ B).
States: OpenAleph unavailable 
→ "Searching only the Workbench's
own text: OpenAleph is not answering" (and results still show);
none 
→ "No document contains 'Kestrel SA' — try 'Kestrel'" with a
variant suggestion; very many 
→ counts per document, first 50
documents, "load more". Keyboard: 
⌘
K, Tab between scopes, arrows, Enter opens at the
page, 
W watches the search.
Innovation.Name variants on by default — searching "Harbour
Nominees" also finds "Harbour Nominees Limited" and "HARBOUR
NOMINEES LTD", shown as one grouped term with a toggle "exact
words only" (Pinpoint's grouping; FollowTheMoney name comparison
already used in 
resolution.py
).
Built on. SYN_UX C2.2 (one mechanism everywhere), Datashare (in
document search with Enter stepping, result carousel), Aleph (alert
from a search), Pinpoint (variants), SYN_VIZ B (scroll rule for lists).
Needs. Command palette package (cmdk) or native 
<dialog>
[ADR]
(SYN_UX F). Backend: one search endpoint that merges Workbench
passages and OpenAleph hits with a 
scope=documents and 
sources=
filter (the latter planned, INVENTORY §11).
15. Tags, notes and collections (INVENTORY §2 marks panel)
Today. A side panel of search: toggle tags, add a tag with one of 8
swatches, notes with "Add to leads", collections with ticks; marks
stay local (
marks-panel.tsx
, 
use-marks.ts
).
The job. Put my own labels and thoughts on anything I bring in, to find
it again.
Front and centre. The tags on the current item; my note.
Redesign. One marks popover opened by 
T / 
N / 
C on any selected
thing (proposal, passage, evidence clip, document, search hit), the
same in every view. Tags as chips (swatch + name, never colour only);
notes in the note font only on the corkboard, plain elsewhere
Redesigning the investigation workbench 72 / 252
(SYN_LOOK B4); collections as a checklist with "New collection…".
Notes can become leads (kept). In the reading room, a passage with a
note shows a small margin glyph.
Innovation.Tag while reading — 
T on a focused passage tags the
passage itself, and the tag travels with any evidence saved from it.
Built on. Readwise (T/N on highlights), Hunchly (tags on captured
pages), SYN_UX C1.3 (same thing, same place).
Needs. None new; edit/delete of tags and collections exist on the
server without UI (INVENTORY §11) — add them here.
16. Connectors — Paper Trail sources (INVENTORY §2 External connectors;
§9 step 26)
Today. A card with a provider picker (
aleph
, 
opensanctions
, firecrawl — raw names), the investigation picker a second time,
"Search people, companies, identifiers…" whose results go to the
Review queue in Check, not here; "Enrich a canonical entity" (pick,
Open dossier, "Enrich with X", "Enrich all providers") with a status
line "aleph: 3 finding(s)"; "Cross-provider candidates" with Same
external entity / Different / Unsure; and the entire entity dossier
rendered inline (
connectors-panel.tsx
). Problems: results appear in
another stage with no notice; the duplicate investigation picker;
developer words ("canonical"); no statement of what is sent where;
no freshness; the dossier is trapped inside this card (INVENTORY
§12). OpenCorporates is not a connector yet.
The job. Ask outside registers and lists about a person or company,
know exactly what I sent, and see what came back.
Front and centre. Each source's state (on, needs a key, last asked)
and the number of findings waiting.
Redesign (Paper Trail, whole-screen).
Sources rail (left): one row per source — your documents,
OpenAleph (this computer), outside Aleph, OpenSanctions,
Firecrawl (web search), and planned ones greyed with "planned"
(OpenCorporates "needs a key — journalists can apply",
Companies House, SEC EDGAR, GLEIF as in 
sources.md
). Each
row: icon, name, status word + shape (
✓ connected, 
○ needs a
key, 
✕ failing), licence mark where the data has one (e.g. share
alike), last asked ("fetched 10 min ago"). Ask outside (centre top): one query box with source chips pre
selected by party kind (person 
→ sanctions + PEP lists; company → registries). Under the button, always: "Sends: the name
'Harbour Nominees Ltd' and country 'GB' to OpenSanctions and
Aleph. Nothing else." (SYN_UX C9; MCP consent in SYN_AI A8).
Results arrive here
, in the intake inbox (§18), and also count on the
Check tile — never silently elsewhere.
Enrich a record: from any record (dossier, network, reading room)
the action "Look this up outside" opens the same box pre-filled
with the record's properties (more properties 
→ fewer false
matches, OpenSanctions advice), not a separate "Enrich" form.
Cross-provider clusters become a variant of the inbox card:
"OpenSanctions and Aleph may describe the same company
Redesigning the investigation workbench 73 / 252
(score 0.84)" with 
✓
/
✕ property rows and Same / Different / Not
sure.
Credentials move here from Keep 
→ Access (INVENTORY §8):
each source's row has "Add key" / "Remove key", stored locally,
never shown. States: source down 
→ its row 
✕ "OpenSanctions did not answer
— try again" (SYN_UX C6 wording); none configured 
→ one line
"No outside source is on. Your documents and OpenAleph still
work." and "Set up a source". Keyboard: G P to Paper Trail; arrows on the rail; Enter asks.
Innovation.
1. Outbound log — every request that left the machine (source, time,
exactly what was sent, how many results) listed per case and
printable for an editor or lawyer (SYN_BRAND B3: "show the list of
outbound calls a case has made").
2. Freshness stamps and re-ask — each finding shows when it was
fetched; a "re-ask all older than 30 days" action checks whether a
sanctions or registry fact has changed since.
Built on.
docs/discovery/README.md Paper Trail decisions and source
tags; SYN_UX C6 (freshness stamps), C9; SYN_AI A8 (consent, cost);
OpenSanctions (threshold, human review, "not cause for alarm");
Zotero (where it is being saved).
Needs. Backend: a request log table for outbound calls (could reuse
connector runs, which exist: "connector runs list" is built without UI,
INVENTORY §11); source router (planned build step 4);
OpenCorporates adapter later (key; licence share-alike + attribution
per 
sources.md
). Open question for Ony (already open in README):
the outside-lookups default "automatic" vs the research default "ask
first" — Bring in proposes "ask, showing what will be sent" for any
query typed by the reporter and "automatic" only for re-checks of
data already sent once.
17. Watchlist and its hits (INVENTORY §2 Watchlist; §9 step 27)
Today. Inside the OpenAleph corpus card: a name or search plus why;
Watch; Check now; each entry with last check and hits (snippet, Open
document, Add to leads, Dismiss); Stop watching (
watchlist.tsx
).
Re-checked when OpenAleph reads a new document. Problems:
buried three levels deep; hits are not visible anywhere else; only
OpenAleph documents are watched, not outside sources.
The job. Be told when a name I care about turns up in new material,
without checking by hand.
Front and centre. New hits count, and the newest hit's snippet.
Redesign.
Name: "Tripwires" is tempting but Ony's naming rule keeps plain
names for all but a few features (
docs/discovery/README.md
"Names"); keep Watchlist. Where: a section of Paper Trail, a count on the Bring in tile ("2 new
watchlist hits"), and a marker on the watched party in charts
(alerts plan, INVENTORY §11).
Watch from anywhere: "Watch this" on a search, a selected
passage name, or a record (Aleph's Create alert; Hunchly
Redesigning the investigation workbench 74 / 252
selectors). Hit card (intake inbox variant): the watched term, the document
thumbnail, the snippet with the match marked, page, "found 2 h
ago in a document you dropped"; actions Open at page, Add to
leads, Dismiss, Snooze until new activity (Linear's snooze). Scope chips per watch: My documents · OpenAleph · outside
sources (when the router exists), each saying what leaves the
machine.
States: no watches 
→ one line and an example; a watch with 0 hits → "Last checked 10 Oct 14:02 · nothing yet" (proof it ran).
Motion: a new hit arrives with one rise on the tile counter (no
flashing; one rise and decay, SYN_UX C4).
Innovation.Watch while dropping — when files are dropped,
watched names are searched as part of the digestion line, and a hit
shows on the file's lane as a small eye glyph ("mentions M. Ross"),
before the reporter even opens it.
Built on. Aleph alerts, Hunchly selectors, Linear snooze; SYN_UX C4
(no flashing); INVENTORY §11 alerts plan (in-app by default).
Needs. Backend: run watch checks per document at the end of the
read (today on OpenAleph read); a per-hit 
snoozed_until
. Open
question: should watchlist hits on outside sources (sanctions
additions) wait for the router build, or use OpenSanctions now?
18. Intake inbox — findings, cross-references, clusters, hits (INVENTORY §2
cross-references; Review queue belongs to Check)
Today. Cross-references sit inside the OpenAleph corpus card (our
record 
↔ OpenAleph's, score, method, matched properties, Open in
OpenAleph, Open dossier, note, Same / Different / Not sure) (
corpus
panel.tsx
); connector findings in Check's Review queue table;
clusters in connectors; hits in the watchlist.
The job. Decide each outside match in one place, fast, with the
reason in front of me.
Front and centre. The pair (ours 
↔ theirs) with agreeing and clashing
properties, and three decision keys.
Redesign. One inbox list in Paper Trail with filter chips by kind (Cross
reference · Connector finding · Same-thing cluster · Watchlist hit) and
by source; each row: source icon, title, age, score as a number with a
small bar (never a colour alarm), status grammar. Selecting a row
opens the pair card on the right: two columns, property rows with 
✓
agree / 
✕ clash / – missing, "Open in OpenAleph 
↗
", note, and keys 1
Same · 2 Different · 3 Not sure · H Snooze. Detailed statement
assessment (Accept / Conflict / Outdated per value) stays in Check's
evidence review, reached by "Assess values 
→
".
Innovation.Hidden score first — an option to decide before seeing
the score (score revealed after the decision), to reduce anchoring on
a number; the revision log shows how often the reporter disagreed
with high scores (SYN_VIZ A4 hidden vote then reveal, applied to one
person).
Built on. Linear triage, OpenSanctions human-review advice, SYN_UX
C3.2 (centre = the next decision card), SYN_VIZ A4.
Redesigning the investigation workbench 75 / 252
Needs. Backend: a merged inbox endpoint over cross-reference
proposals, connector findings, clusters and watchlist hits (read-only
union; decisions keep their own routes). Coordinate with the CHECK
area, which owns the Review queue.
19. OpenAleph corpus: sync, what stands out, send-outs (INVENTORY §2)
Today. "Corpus sync" box (last push, still to send, last cross
referencing, errors, "Sync now", a note when no worker runs); "What
stands out" behind a button (names found most often, document
counts, mentioned alongside; Open dossier / Add to leads);
"Diagrams, timelines and lists in OpenAleph" (send relationships as a
diagram, dated records as a timeline, make a list); all in one card
(
corpus-panel.tsx
, 
corpus-insights.tsx
, 
entity-sets.tsx
).
INVENTORY §12: "nests four tools".
The job. Keep the case's OpenAleph copy in step, and use
OpenAleph's view of the whole corpus to spot names I missed.
Front and centre. Sync health in one line; the top names I have not
yet made records.
Redesign.
Sync becomes the OpenAleph row of the sources rail (§16): "
✓ in
step · last sent 14:02" or "
○ 12 changes to send · Send now";
errors open in place. No separate box. What stands out becomes a Paper Trail tab, shown without a
button: a ranked name wall grouped People · Companies · Places
· Other, each name with a document-count bar and "not in the
case" vs 
✓ "a record" marks; hover shows "mentioned alongside"
names lit; click opens search inside documents for that name;
actions Add to leads / Make a record (goes through the reading
room's question tab). Send-outs become a "Send to OpenAleph" menu item on the
network, timeline and any collection (where the data already is),
with the list of sent sets in Paper Trail.
States: OpenAleph not set up 
→ the row says so and the tab hides.
Innovation.Missed-name prompt — names OpenAleph finds in more
than N documents that are neither records nor rejected appear once
on the Bring in tile: "Fernhill Ltd appears in 14 documents and is not
in your case."
Built on.
docs/discovery/README.md Paper Trail; SYN_UX C3 (front
and centre), SYN_VIZ C12 (counts with sourced captions).
Needs. Load "what stands out" in the background after analysis
settles (backend 
openaleph_discover.py exists). Server-built,
unused: "import evidence or entities from OpenAleph for a
document" (INVENTORY §9 step 23) — expose it as "Bring
OpenAleph's names in as proposals" on a document.
20. Batch triage page (INVENTORY §1 /review/batch
, §9 step 12)
Redesigning the investigation workbench 76 / 252
Today. A table of every document in the batch with status, issues,
proposal counts and files inside; "Show only rows with problems";
Retry; "Not imported" with reasons; "Start review (problems first)";
refresh every 3 s (
frontend/app/review/batch/page.tsx
). Problems:
own plain layout; "Back to workbench" drops 
?inv=
; duplicates the
digestion line's job.
The job / Redesign. Folded into The Drop: the digestion line 
is the
triage view (filter "Problems only" = 
F
), and "Not imported" rows are
the lanes stopped at Checked. The URL 
/review/batch?batch=
redirects to The Drop filtered to that batch, keeping 
?inv=
. Nothing is
lost: every column of today's table is on the lane or its receipt.
Built on. SYN_UX D(b) (one feature, one URL), INVENTORY §12.
Needs. A batch filter on The Drop (
?batch=
); the batch list endpoint
exists on the server without UI (INVENTORY §9 step 23) — show past
batches as a "History" menu.
21. Stage a relationship from a reviewed claim (INVENTORY §2; §9 step 19)
Today. After accepting a claim: a form with a free-text schema
("FollowTheMoney relationship schema"), source and target pickers,
"Stage proposal", and a sentence "State: reviewed evidence 
→
unverified/reporter-controlled claim 
→ staged relationship proposal → separate canonicalization." (
documents-panel.tsx
). INVENTORY
§12 calls out the free text.
The job. Turn "Fernhill Ltd transferred the parcel to Kestrel SA" into a
link between the two records.
Redesign. On an accepted claim card: "Make a link from this claim" 
→
a small sentence builder in plain words: 
[Fernhill Ltd] [transferred /
owns / paid / is director of …] [Kestrel SA] with the two records pre
filled from names accepted in the same passage, the kind from the
fixed link set, and amount/date fields when the kind needs them. It
enters as a PROPOSED link and needs one more Accept (rule kept),
shown on the card as "1 more step: accept the link".
Innovation.Pre-filled from the passage — the builder reads the
claim's own accepted names and dates so most links need two clicks.
Built on. SYN_VIZ C1 (edges as sentences with fixed link verbs),
SYN_UX C1.2.
Needs. None on the backend; replace the free-text schema with the
fixed list the network form already uses.
22. The digestion pipeline, step by step (INVENTORY §9, all 28 steps)
# STEP TODAY WHERE IT GOES IN THE REDESIGN
1 Choose files (single or bulk) One drop field (§2)
Redesigning the investigation workbench 77 / 252
# STEP TODAY WHERE IT GOES IN THE REDESIGN
2 Bulk: open a batch Every drop is a batch (one file or many), named "first file and N more", renameable
3 Upload one at a time with "Importing i of N" Lanes appear at Received with a byte progress bar per file (§3)
4 Duplicate check (SHA-256, 409) Lane stops at Checked with "Already in the case as …"; Open / Keep a second copy (§2)
5 Saved, read as a background job Received 
→ Read boxes; job id hidden, "Stop reading" available (§3)
6 Reading (OpenAleph, fallback reader, OCR, issues) Read box detail: which reader, OCR share, issues in words; "Read with the Workbench's own
reader" on OpenAleph failure (§3)
7 Following the read (three pollers) One event stream per batch, polling fallback (§3 Needs)
8 Passages (chunks) "Split into passages" box with count; the word "chunk" leaves the UI
9 Files inside "Files inside" box; children as nested lanes / matrix box (§3)
10 Proposals "Names & facts proposed" box with counts by kind (§3), reviewed in the reading room (§6)
11 Confidence bands Dots + HIGH / MEDIUM / LOW; LOW opens a question tab (§1, §8); no red for low
12 Batch triage Folded into the digestion line, "Problems only" (§20)
13 Review page The reading room (§6, INTAKE_2)
14 Questions during review One question tab, three variants (§8)
15 Keyboard review J/K/A/R kept, plus 1–4, E, C, N, T, U, ? (§6)
16 Inline review on the workbench Retired; one flow
17 "Open review queue" without a batch "Everything waiting" in the reading room, from one server call (§6 Needs)
18 What accepting does Unchanged on the server; the card says what it added and offers Undo (§6)
19 Stage a relationship from a claim Sentence builder (§21)
20 Spreadsheets Spreadsheet tab with mapping canvas (§12)
Redesigning the investigation workbench 78 / 252
# STEP TODAY WHERE IT GOES IN THE REDESIGN
21 Pictures Light-table with region evidence (§9)
22 OpenAleph per-document actions Tabs and the "Read again" menu; sync automatic (§5)
23 Built on the server, unused (import from OpenAleph, list
batches, cancel job)
"Bring OpenAleph's names in" (§19), batch History (§20), "Stop reading" (§3)
24 Retry "Try reading again" on the failed box (§3)
25 Hand-entered evidence Evidence clip from selection, web capture with snapshot, interview record (§13)
26 Outside material Paper Trail and the intake inbox (§16, §18)
27 After acceptance (corpus sync, cross-referencing,
watchlist, Red Flags, To check)
Shown as consequences: sync on the OpenAleph row, new cross-references in the inbox, watch
hits on lanes, flag chips on the Read receipt
28 Tracing "Trace" on every document, proposal and clip opens Chain of Custody beside the view; the Read
receipt is its first card
23. Out of scope, handed to other areas
The entity dossier (identity and merge history, property conflicts,
duplicate candidates, reconciliation, ownership chain) is rendered
inside the connectors card today (INVENTORY §12). It belongs to the
area that owns records and See; Bring in only needs: "Look this up
outside" and "Expand in the corpus" on the dossier, both of which
now open Paper Trail (§16, §19) with the record pre-filled. Check
owns the connector-findings Review queue and evidence ledger; §18
hands off to it with "Assess values 
→
".
25. Needs summary
New packages (each needs an ADR): Command palette (cmdk) vs native 
<dialog> — shared with
SYN_UX.
Redesigning the investigation workbench 79 / 252
Motion library vs native View Transitions — shared with SYN_UX.
@tanstack/react-virtual for very large lanes, libraries and hit
lists.
PDF page rendering in the browser for the Original tab and page
crops (
pdfjs-dist 
), unless the server renders page images with
PyMuPDF (already used for OCR) — the server route needs no new
package and keeps one renderer; preferred.
Headless browser for web snapshots (server Playwright) — or
decide to keep "link only" captures until the crawler step.
Watch checks per document at read time; snooze on hits.
Auto-fetch OpenAleph proposals when analysis settles; expose
"import from OpenAleph".
OCR language option on upload; OCR quality per page where the
engine reports it (to confirm what PyMuPDF/Tesseract returns).
Remove 
REVIEW_NOTE developer strings from stored notes.
Open questions for Ony:
Backend changes:
Per-document stage record with timestamps; batch event stream
(SSE via 
StreamingResponse 
).
pending-proposals per investigation in one call.
exact 
, 
prefix 
, 
suffix 
, offsets; region locator
Evidence anchors: 
for pictures and page crops.
Page image endpoint (thumbnail and page render) for PDFs.
Outbound request log; source list with counts; inbox union
endpoint.
1. Should a dropped folder's path be kept as provenance on each
file?
2. Can a name be accepted with "Not sure" as its kind?
3. Sign web snapshots with a local key (Hunchly-style), or rely on
SHA-256 + Chain of Custody?
4. Outside lookups: "ask, showing what is sent" for reporter-typed
queries, "automatic" only for re-checks — acceptable?
5. Should EXIF GPS on photos become proposed places?
6. Is "Send to OpenAleph" ever manual, or is corpus sync always on?
7. Watchlist on outside sources now (OpenSanctions) or after the
router?
Redesigning the investigation workbench
80 / 252
Check
One Decide screen instead of eight places to decide; the source always beside the
decision; a definition of done for "supported" that the server enforces; the chain of
custody drawn as a chain.
06
Redesigning the investigation workbench 81 / 252
Decide: one decision at a time, the source beside it, three answers on keys, and what happens if you say yes.
Redesigning the investigation workbench 82 / 252
The chain of custody for one claim, drawn as wired cards from file to claim, in Rain Noir.
Redesigning the investigation workbench 83 / 252
0. New outside research for this area (what I saw, what each gives)
SOURCE WHAT I SAW OR READ WHAT IT GIVES THIS
AREA
Linear, Triage docs (linear.app/docs/triage; screenshot pages/feat-check-linear-triage/img_02.png
)
An inbox of incoming items that sit outside the team's workflow until
reviewed. Keys: Accept 
1
, Decline 
2
, Mark as duplicate 
3 / 
MM
(attachments move to the kept issue), Snooze 
H (hidden until a time or new activity
, whichever comes first). "Triage Intelligence" uses AI to
suggest properties and likely duplicates. A "Triage responsibility" rota;
the screenshot shows a "New issues will notify" list of who is on duty,
with "Current".
One inbox for everything that
arrives from outside a person's
own work; number keys for the
three outcomes; "duplicate" as
a first-class decision that moves
attachments; snooze that
wakes on new activity; a duty
rota for team cases later.
Prodigy (Explosion), web app docs (prodi.gy/docs/api
web-app, read with WebFetch; the text-classification
page had no images, capture deleted)
One task at a time. Keys 
a accept, 
x reject, 
space ignore, backspace
/
del undo, Ctrl/
⌘
+S save. "The ten most recent
decisions are shown in the sidebar and remain editable"; clicking one
puts that task back at the front of the queue. A progress widget with
counts.
One decision on screen, three
outcomes, and a short editable
history beside it instead of a
confirm dialog.
OpenAleph, Cross-referencing
(openaleph.org/docs/user-guide/103/cross-reference; pages/feat-check-openaleph-xref/img_00.png
)
A two-column table "Reference" vs "Possible match" (contents greyed
in the doc image); on each row a vertical stack of three buttons ✓ / ? /
✕; facets on the left: "Dataset" with counts, "Entity type" with counts;
"Found 167 results", "Export", "Re-compute". Text: "Matches are
suggestive, not definitive, always verify manually."
Our own matches already arrive
from OpenAleph; the reporter
should meet the same 
✓ ? 
✕
trio and the same "ours 
↔
theirs" layout, but one pair at a
time with the evidence that
made the match.
Hypothesis, "Fuzzy anchoring"
(web.hypothes.is/blog/fuzzy-anchoring, WebFetch)
Each annotation stores three selectors: RangeSelector (XPaths +
offsets), TextPositionSelector (character offsets), TextQuoteSelector
(the exact text plus 32 characters of prefix and suffix). To re-find the
quote it tries the range, then the position, then a fuzzy search for prefix
and suffix around the expected place, then a fuzzy search for the exact
text alone (diff-match-patch, Bitap).
The technical base for the "Says
it?" check: store quote + prefix
+ suffix + offsets for every
evidence quote and re-find it in
the saved passage; an exact hit
passes, a fuzzy hit is "close,
check wording", no hit fails.
Redesigning the investigation workbench 84 / 252
SOURCE WHAT I SAW OR READ WHAT IT GIVES THIS
AREA
Hunchly, "Content, photo and attachment hashing"
(support.hunch.ly, WebFetch)
Hunchly hashes "all MHTML files, photos and attachments before
storing" with SHA-256 and shows the hash in its Dashboard for each
capture; anyone can re-hash an export and it "should ALWAYS match".
It also says hashes are "not a bulletproof means" to prove the content
was not changed before capture, and recommends further checks
(signature, live or archived source, obtaining originals legally).
Show the hash as a check that
can be re-run ("hash still
matches"), not as a raw string,
and say plainly what it does not
prove.
Berkeley Protocol on Digital Open Source
Investigations (OHCHR PDF, 102 pages, read locally then
deleted)
¶167: "Chain of custody refers to the chronological documentation of
the sequence of custodians of a piece of information or evidence, and
documentation of the control, date and time, transfer, analysis and
disposition of any such evidence." ¶155(h): at collection a hash value
should be added manually or automatically. ¶176: verification "is
broken down into three separate considerations: the source, the digital
item or file, and the content, which should be looked at collectively and
compared for consistency". Annex IV form: collector, start and end time
stamps, URL, screenshot, collection package hash list, services used.
The custody log must be chronological and per custodian
(who held it, when, what was
done) — today's drawer is a
stack of record types, not a
sequence. And every claim's
checks group into three bands:
source, file, content.
C2PA "Verify" tool docs
(opensource.contentauthenticity.org/docs/verify,
WebFetch; page had no capturable images)
Three vertical panels: left the asset title and thumbnail; centre the
ingredients "in a tree-like layout", each with a thumbnail and a "cr"
icon when it has its own credentials; right the signing information,
validation status, "Process" (app or device used, actions, ingredients,
AI-generated content), "About this Content Credential". An untrusted
signer shows "Unrecognized"; validation errors show a warning.
The model for CHECK_2: the
item at one end, its ingredients
drawn as a tree, a detail panel
for the chosen node; a badge
on each ingredient that has its
own provenance; AI steps
named in the process list.
Not used: Aleph's older cross-referencing doc page (its images show
upload and mapping, not review; deleted); Meedan Check (search
returned only add-on store pages, nothing I could read); dedupe's API
page (did not describe its labelling keys).
1. The problem in one paragraph
Today a reporter decides things in eight places (INVENTORY §12):
document proposals (inline under the whole document list, and again
on /review), the connector Review queue, OpenAleph cross
references, cross-provider clusters, duplicates and property conflicts
Redesigning the investigation workbench 85 / 252
in the dossier, To check, AI candidates, and watchlist hits — plus a
ninth that INVENTORY lists under See, relationship evidence
stances. Each uses its own words (Accept / Same entity / Same
external entity / Shows it / Accept as trusted analysis / Add to leads /
Supported / Promote), its own buttons (five equal buttons on every
property row in 
review-queue-panel.tsx L180–185; 3 + one "Prefer
X" per value in 
property-conflicts.tsx
), and its own place on a
9,700 px page. Some ask for a rationale, some hard-code one
(
dossier-panel.tsx L129 sends "Reporter-reviewed canonical
duplicate decision" for every duplicate decision, L159 and L176 the
same for merges and reconciliation). None shows the source beside
the decision except /review. And the thing all this checking is for — a
claim marked supported — has no rule behind it: the server lets any
claim become "supported" or "confirmed" with no evidence at all as
long as a rationale is typed (
backend/app/services/claims.py
review_claim L28–51), and 
PATCH /claims/{id} changes the status
with no review event (
claims.py update_claim L108–122; api/routes_claims.py L91), which quietly bypasses the "immutable
review history".
The redesign: one Decide screen for every decision, one claim card
that knows when it is done, and one Chain of Custody drawn as a
chain.
2. The unifying model: every decision is the same five-part card
Every one of the eight places becomes a 
kind of the same object, a
Decision. This is the core of the area.
PART WHAT IT IS EXAMPLE
Question One sentence, a person's words "Is 'Harbour Nominees' in this passage the company Harbour Nominees Ltd?"
Proposal What some actor suggests, with who suggested it "Name-finder · same name 0.93" / "OpenSanctions" / "AI draft · 10 Oct" (plum)
Evidence The passage, scan, record or page the proposal rests on —
always shown beside the card
p.3 of the share-transfer form, the words lit
Choices Always Yes / No / Not sure, worded for the kind, keys 
1 2
3 Same company · Different · Not sure
What
happens
A plain preview of the consequence before you choose "Creates the link Harbour Nominees 
→ owns 40% 
→ Fernhill Ltd · 2 claims gain support
· Red Flag BO-031 rises Faint 
→ Strong"
Mapping today's places onto the three choices (no backend meaning is lost; extra values stay one click away under "More" — UX-C1 rule 2):
Redesigning the investigation workbench 86 / 252
KIND (TODAY'S PLACE, FILE) YES Document proposal (/review; 
documents
1
NO Accept
panel.tsx 
)
2
Reject (+ reason
chip)
Name already a record? (
entity-identity.tsx 
)
Whose email/phone? (
identifier-owner.tsx 
)
Outside finding: same entity? (
review-queue
Same as X
Belongs to X
Same
panel.tsx resolveFinding)
Outside finding: a value (assessStatement)
Outside relationship (reviewExternalRelationship)
Cross-reference (
corpus-panel.tsx 
)
Cross-provider cluster (
connectors-panel.tsx 
)
Duplicate records (
Accept
Supported
Same entity
Same outside entity
duplicate-candidates.tsx 
) Same
After-merge pair (
reconciliation-review.tsx 
) Duplicate · keep left / keep right
(two Yes keys 
Property conflict (
property-conflicts.tsx 
)
To check (
to-check-panel.tsx 
)
AI candidate (
ai-reasoning-panel.tsx 
)
Watchlist hit (
watchlist.tsx 
)
Relationship evidence stance (
relationship
Prefer this value (per value)
Shows it
Accept as checked analysis
Add to leads
Supports
detail.tsx 
)
A new record
Reject
Different
Conflicts
Conflict
Different
Different
Different
Keep separate
1 
/
Shift+1 
)
—
Does not show
it
Reject with
reason
Dismiss
Contradicts
NOT SURE Skip for now
3
UNDER "MORE"
Edit then accept; "What kind
of entity?" answer
Not sure (new;
today missing)
Not sure
Unsure
Unresolved
Unresolved
Not sure
Unsure
Unsure
Unsure
Unresolved
Unclear
Later
Later
Unresolved
Pick another record
Pick another entity
—
Outdated
—
Note
—
Preview merge (opens the
merge step)
—
Changed over time · Both
valid
Note
Accept parts (per claim)
Open document
Context · Superseded
Redesigning the investigation workbench
87 / 252
Rules for every decision (each rests on a finding):
1. The source is always beside the card (UX-C9; Stanford #1 in
SYN_UX A8). No decision without its evidence in view; if a kind
has no passage (a cluster of outside records), the evidence pane
shows the outside records side by side, OpenAleph-style "ours 
↔
theirs".
2. Undo, not confirm (UX-C1 rule 5; Prodigy's editable last-ten
history). Each decision acts at once, shows an undo toast and
enters a "Last 10" strip. The only confirmations left: executing a
merge (it moves many references) and anything permanent.
3. A reason is a chip, typing is optional (today's hard-coded
rationales are replaced by real ones). Each "No" offers 3–4 reason
3. Feature by feature
3.1 Decide — the one review screen (replaces 8
decision places) 
→
 mockup CHECK_1
Today. Eight places as listed above. Specific problems: inline
proposals render under 
all documents, not the one they belong to,
with no source pane and no identity check (
documents-panel.tsx 
;
INVENTORY §12); /review has its own plain layout (
and "Exit to workbench" drops 
p-6 max-w-5xl 
)
?inv= (
app/review/page.tsx L333);
with no batch it asks the server once per document for pending
proposals (L116–137, slow on big cases); the review queue shows a
table plus an empty "Choose a finding." box (
review-queue
panel.tsx L158); proposals are labelled with code words ("entity
proposal", L304); AI candidates live in Act with raw JSON payloads
chips per kind ("Misread", "Wrong party", "Not in this passage",
"Different date") and a free note (
N 
). The server stores what was
chosen, never a fake sentence.
4. The proposer is always named, as an actor, the way Linear names
agents in its activity log (SYN_AI A4): Name-finder, OpenAleph,
OpenSanctions, Firecrawl, AI (plum), a teammate. Model-written
items keep the plum edge and "AI draft · date" (LOOK-B1, VIZ-B)
until a person decides.
5. Nothing links itself — the decided rule "every link waits for a
person" (INVENTORY §11) is the reason this screen exists. Scores
are shown as a word plus number ("same name · 0.93"), never as
permission.
(
ai-reasoning-panel.tsx 
); watchlist hits and cross-references hide
inside the OpenAleph corpus card.
The job. "Show me the next thing only I can decide, with the proof
next to it, and let me get through 40 of them in ten minutes without
losing anything."
Front and centre (dashboard). (1) The next decision as a live card —
question, the lit passage thumbnail, the three choices — this is the
dashboard centre UX-C3 item 2 already asks for. (2) "31 to decide"
with a tiny bar split by kind (proposals / matches / outside / to check /
AI).
Redesign.
Layout: whole-screen feature (UX Part D(b)), opened from the
dashboard card with a shared-element transform
Redesigning the investigation workbench
88 / 252
(
motion.transform 450 ms): the card grows into the right column
and the passage thumbnail grows into the reading pane. Three
columns at 1440: queue (300 px) · evidence / reading room (flex)
· decision card (420 px). Breadcrumb top-left 
case › Check › Decide › 7 of 31
. Edge handles left
(case/stages), top (filters), bottom (filmstrip of the pages of the
current source).
Queue column: filter chips with counts (All · Proposals · Matches ·
Outside · To check · AI · Watchlist), a "sort by" (oldest, by party, by
what it unlocks — see Innovation), and compact rows: kind icon,
short question, actor, age. Grouped "by source" by default so all
proposals from one document come together (keeps the reading
pane still; Gestalt common region, SYN_UX A1).
Evidence column: the calm reading room (LOOK-B5): serif, 40–60
characters a line, the proposal's span lit (built today in /review
renderChunkBody 
), other proposals in the same passage shown as
faint underlines that can be clicked to jump. For scans: the page
image with the OCR box drawn over it. For outside records: two
record cards side by side, matched properties joined by lines
(from 
corpus-panel.tsx matched_properties). Above it the
three-band check row (source · file · content; Berkeley ¶176),
see §3.9.
Decision card: kind eyebrow, the question in 20 px, the proposal
with its actor, "Why was this proposed?" folded (today's
extraction-explanation.tsx 
, reworded), the What happens box,
then three tall buttons 
1 Yes-word / 
reason chips under No, note field (
N 
). Sub-questions that today
block Accept (schema question, identity, identifier owner) appear
as a numbered step 
inside the card ("1 of 2: What kind of entity is
this? 
→ 2 of 2: Is it already a record?") instead of extra boxes.
Redesigning the investigation workbench
Kestrel harbour
2 No-word / 
3 Not sure
,
Bottom bar: session counts ("4 accepted · 2 rejected · 1 not sure ·
24 left"), the "Last 10" strip (Prodigy), key hints, Undo.
Scroll-over: the wheel over the queue moves the queue (VIZ-B list
rule); over the reading pane it scrolls the text (a feature made for
reading). It never moves to the next decision — deciding is too
important for a wheel.
Hover: a queue row shows a peek of its passage; a matched
property line lights both ends; hovering a consequence line in
"What happens" lights the affected party in the mini network if
open (linked highlighting, existing 
pointedParty 
).
Motion: after a decision the card slides out along the queue's axis
(up, 240 ms ease-in) and the next slides in from below
(
motion.reveal 
); the queue row ticks to its outcome shape and
fades into "Decided". The reading pane does not animate (calm
zone, UX-C4 "what stays still"); if the next item is in another
document the pane crossfades 120 ms. Reduced motion: all
crossfades.
States: 
empty — one line, "Nothing waits for you. 312 decisions
made in this case." plus "Drop documents" (UX-C3 item 7);
loading — skeleton card plus the reading pane's page outline;
error on one item — the card says what failed and keeps the
choice made ("Could not save: the server did not answer. Your
choice is kept — Retry"); very large (5,000 items after a bulk
import) — the queue virtualises, chips show counts, a "Decide in
bulk" step appears only for same-shaped, high-confidence
proposals from one source ("Accept all 38 names the name-finder
rated high in this document" 
→ preview list 
→ Apply, Undo all; AI
B1 "Apply n").
Keyboard:
J 
/
K
next/previous, 
1 
/
2 
/
3
decide (Linear), 
(snooze, wakes on new activity — Linear), 
open the source in its own reader, 
Z
undo, 
H
later
N
note, 
O
Enter open Chain of Custody
89 / 252
for the item, 
?
keys. Single keys can be switched off and never
fire while typing (WCAG 2.1.4, UX-C2).
Screen reader: the card is a 
region named by its question; choices
radiogroup-like button group with 
are a 
after a decision an 
aria-keyshortcuts 
;
aria-live="polite" line: "Accepted. Next: Is
M. Ross the director …, 8 of 31". The lit span in the passage has an
accessible description ("highlighted words: Harbour Nominees").
Certainty and Red Flags: proposals show the confidence band as
the grammar shape (LOOK-B1): high = solid, medium = dashed,
low = hollow ring with "asks first". When a decision would change
a Red Flag, "What happens" shows the level meter moving (
▮▯▯ 
→
▮▮▯
) with the words.
tokens), UX-C6 (specific feedback words), UX Part D(b) (whole
screen feature), LOOK-B1, LOOK-B5 (calm reading), VIZ-B (scroll
rule), AI-B1 rule 4 (named actors, Apply n); Linear Triage, Prodigy,
OpenAleph cross-reference, INVENTORY §11 "Findings to review
inbox" and "Review page redesign".
Needs.
Backend: 
GET /api/investigations/{id}/decisions?
kind=&cursor= — one normalised list read from the existing tables
(extraction candidates, connector findings, assessments, cross
reference proposals, enrichment clusters, duplicate candidates,
reconciliation pairs, property conflicts, check items, AI
candidates, watchlist hits), each 
{kind, id, question, actor,
Innovation.
evidence_ref, proposal, choices, consequences, created_at} 
.
1. Sort by what it unlocks. Each pending decision is scored by what
it would change: claims that would reach "supported", Red Flags
that would rise, links that would complete a chain. The reporter
can work the queue in "most consequence first" order. (Goes
beyond Linear and Prodigy, which order by time or model
uncertainty.)
2. Decide by source. All decisions resting on one document are
batched behind one reading of it: read the page once, decide its 12
proposals with the page still. Measured and shown: "pages read: 3
of 9".
3. Disagreement memory. When a "No" contradicts a past "Yes" on
the same pair (or a teammate's later), the card says so ("On 3 Oct
you said these were the same company"), the way Linear's snooze
wakes on new activity.
Built on. UX-C1 (one primary action beside the selection, undo over
confirm), UX-C3 item 2 (centre = next decision), UX-C4 (motion
Redesigning the investigation workbench
Decisions keep going to the existing endpoints through a small
frontend adapter per kind. This also ends the per-document fan
out in /review.
Backend: 
GET …/decisions/{kind}/{id}/consequences — the
"What happens" preview (dry run). Duplicate merges already have
a preview with a digest; the rest need a dry run.
Backend: real rationales — accept an optional 
reason code + note
on every decide endpoint; stop sending the hard-coded sentences
in 
dossier-panel.tsx 
.
Backend: a small 
H
decision_snooze table (kind, id, until,
wake_on_activity) for 
.
Add "not sure" where it is missing (entity identity on /review).
Packages: none new (the virtualised list can be plain CSS 
visibility 
); motion per the motion ADR.
content
Question for Ony: should watchlist hits and AI candidates live
here (my proposal) or stay in their own places with only a count
here?
90 / 252
3.2 Claims and the claim verification workspace
Today (
frontend/features/claims/claims-panel.tsx
). A text box
"Write a testable factual claim…" and "Add unverified claim"; a list of
claims as buttons showing raw status words; the open claim with six
statuses (lead, unverified, supported, confirmed, disputed, rejected),
two grade selects (IPCC evidence × agreement), a 0–100 %
confidence slider and a required rationale — three overlapping
measures of certainty; "Evidence balance" counts; "Dependent
canonical relationships"; "Immutable review history"; linked
evidence; then the whole case's evidence pool as a list with Supports
/ Contradicts / Context on every item (the pool grows without limit).
The card description is a paragraph; developer words ("canonical",
"idempotently", L244). Opening a claim from elsewhere changes this
panel off-screen (INVENTORY §12). The server accepts "supported"
with zero evidence and PATCH changes status without history (see
§1).
The job. "For one statement I may publish: what supports it, what
cuts against it, is it done — and if not, what exactly is missing?"
Front and centre. (1) The case's claim balance as one strip: 
✓
Supported 14 · 
✕ Disputed 3 · 
○ Not yet shown 22, each clickable (UX
C3 item 3). (2) The claim nearest to done ("1 check left: second
independent source") — the one small push that changes the story.
Redesign.
Layout: whole-screen "Claims" feature with list left (status edge
per card: solid / dashed / double, LOOK-B1), and the open claim as
the main panel: evidence for and against side by side (decided in
INVENTORY §11 "Claims redesign"), each column a stack of quote
cards with their source thumbnail; between them a thin balance
bar. Above: the claim sentence large, its chip, the Done checklist
(§3.10) as a row of glyphs. Right edge: Chain of Custody opens
beside it, never by scrolling away (UX-C9).
Adding evidence: the endless pool is replaced by "Find evidence
for this" — a search over passages and saved quotes ranked by
overlap with the claim's words and parties, plus drag-from-reader:
select words in any document and drop them on For or Against.
The stance is decided by 
where you drop it (common region). Status: the six code statuses map to the three-word grammar the
reader sees: lead + unverified 
→ NOT YET SHOWN; supported 
→
SUPPORTED; confirmed 
→ SUPPORTED with a second tick "
✓✓
CONFIRMED"; disputed 
→ DISPUTED; rejected 
→ RULED OUT
(neutral outline, struck text, leaves active lists). Changing status is
three keys (UX-C2: 
S supported, 
D disputed, 
T send to To check)
and opens a one-line rationale with chips.
Certainty: replace the free 0–100 % slider with the IPCC grid
already stored (evidence limited/medium/robust × agreement
low/medium/high) drawn as a 3×3 grid the reporter clicks once;
the cell gives the likelihood word used by the writing check (ICD
203 words, 
ai-reasoning-panel.tsx WRITING_PRACTICES). One
measure, one word. Review history: a vertical timeline in the panel's foot (from 
→ to,
who, why, when), never edited. Dependent links: "If this claim fell, these would lose support": the
relationships and Red Flags resting on it, drawn as a small fan
(hover lights them in the mini network).
Hover: a quote card shows its passage with prefix and suffix; a
source thumbnail shows the page.
Motion: status change — the chip morphs shape (ring 
→ tick) at motion.feedback 160 ms; the left edge redraws from dashed to
Redesigning the investigation workbench 91 / 252
solid. Evidence dropped into a column settles with a 240 ms ease
out (Archive theme: "laid on a desk", LOOK Part C).
States: empty — "No claims yet. Write one, or select words in a
document and press C." Loading skeleton of both columns. A claim
with 60 evidence items: columns group by source, "+12 more from
the land registry".
Keyboard / SR: J
/
K through claims, 
S
/
D
/
T status, 
E find
evidence, 
[
/
] move focus between the For and Against columns;
each quote card reads "Supports, from Land Registry extract 2016,
page 2, quote: …".
Innovation.
1. Done checklist that drives the status (§3.10): "Supported" is a
button that stays disabled and says why until the checks pass (UX
C6 "disabled controls say why"), and drops back to Not yet shown
by itself when a check later fails (jidoka, VIZ-E).
2. Claim from a selection. Select words in the reader 
→ 
C 
→ a claim
prefilled with the parties found in the words and the selection
already attached as supporting evidence with its exact anchors.
3. What would change your mind. Each claim carries one optional
"falsifier" line ("A board minute showing Ross resigned before
March 2018") which becomes a To check item and a watchlist
query — borrowed from the TAS hypothesis fields already in the AI
payload (
falsifiers
, 
missing_records
).
Built on. LOOK-B1 status grammar, VIZ-B certainty grammar, VIZ-E
checks, UX-C2 keys, UX-C6 disabled-says-why, UX-C9 trace beside
the item, INVENTORY §11 claims redesign, AI-B1 rule 2 (grounded vs
guessed — the quote cards are "grounded" by definition), Hypothesis
anchoring.
Needs. Backend: the Done rules enforced in 
review_claim (§3.10); update_claim must refuse status changes or write a review event; an
evidence-suggestion endpoint (
GET /claims/{id}/evidence
suggestions
, plain text search over chunks and evidence, no new
package); store 
falsifier on the claim (migration). Questions for
Ony: drop the 0–100 % slider in favour of the IPCC grid? Keep "lead"
as a claim status at all, or make leads only leads?
3.3 To check
Today (
frontend/features/to-check/to-check-panel.tsx
). Cards
with a Passage/Checklist tag, the question, indicator name and id, "Its
Red Flag" (smooth-scrolls to Act and loses your place, INVENTORY
§12), party chips that do nothing on click, the excerpt with terms
marked, a document link (scrolls to The Drop), Shows it / Does not /
Unclear, Undo, note; folds for Decided and "No longer called for".
Passage items need check specs, and none exist yet (INVENTORY
§11), so today only checklist items appear. Empty state takes a full
card.
The job. "Tell me what the records can't prove and only I can — and let
me answer it with the source in front of me."
Front and centre. (1) Count left, split Passage / Checklist. (2) The one
that matters most: the item whose answer would move the highest
Red Flag (Textbook > Strong > Faint), with its level meter.
Redesign. To check becomes a 
kind inside Decide (§3.1) — a filter
chip there — not its own panel. Its card shows the question, the
indicator as a glossary hover term, the Red Flag it belongs to with its
level meter (LOOK-B1), and "Answering Shows it would make this flag ▮▮▮ Textbook" in What happens. "Its Red Flag" opens the flag as a
panel over the current view with a "Back to Decide" crumb (UX-C2
cross-feature jumps keep your place). Party chips open the dossier
Redesigning the investigation workbench 92 / 252
drawer on click. For checklist items with no passage, the evidence
pane shows the flag's records and an "Attach what you saw" drop
zone (a photo, a call note, a page) so the answer has evidence. Keys 1 Shows it, 
2 Does not, 
3 Unclear. On phone ("field mode", UX-C8)
To check is the main list. States: empty one line ("Nothing only you
can check right now"); "No longer called for" stays as a fold in the
queue's Decided view.
Innovation. (1) Answer with evidence: "Shows it" asks (not forces)
for one attachment, which becomes an evidence record and links to
the flag's claim. (2) Who can answer: each checklist item can carry
"ask someone" — a drafted question to a source or official, saved as a
lead with the exact context (re-uses createLeadFromRelationshipContext pattern).
Built on. UX-C3 item 2, UX-C8 field mode, LOOK-B1, SYN_VIZ D7
(empty wedges become To check items), Berkeley ¶176 (content
checked against source and file).
Needs. Backend: check items in the decisions feed; optional evidence_id on a check decision. The check specs for passages
(INVENTORY §11) are outside this area but make this feature much
fuller.
3.4 Review queue: connector findings, evidence
review and evidence ledger
Today (
frontend/features/review-queue/review-queue-panel.tsx
).
A table (caption, provider, schema · status, Inspect) beside "Evidence
review": for a relationship, ends matched and Supported / Conflict /
Unresolved then "Promote relationship" or the developer sentence
"Canonicalize both endpoints before promotion"; for an entity, "Best
entity match … Same entity / Different / Unsure" then every asserted
value with Accept / Conflict / Outdated / Unresolved / Promote (five
buttons per value); then an "Evidence ledger" of every value with
"Canonical / External only". Errors become toasts only. Only the best
match is offered (
cands[0]
); there is no way to choose the second.
The job. "An outside database says something about my party. Is it
the same party, and which of its claims do I take into the case?"
Front and centre. (1) "5 outside findings to decide" with provider
logos-as-words (OpenSanctions, OpenCorporates, OpenAleph). (2) A
sanctions or official-register hit on a case party is promoted to the
dashboard's alarm line only after a person says "same" (UX-C3 item 5:
one alarm colour, for real alarms only).
Redesign. Two steps inside one Decide card. Step 1 — Same party?
The evidence pane shows "ours 
↔ theirs" record cards side by side
(OpenAleph layout), with matched properties joined by lines and the
score as "same name 0.93 · same registration number". All candidate
matches are listed, not just the best. Step 2 — Which values? A single
table of the finding's values with a checkbox column "Take into the
case" and per-row state words (Matches ours / New / Conflicts with
ours / Older than ours), pre-filled by comparing with the ledger; one
"Take 4 values" action, each value keeping its outside source link (the
"promotion"). "Outdated" and "Unresolved" stay in a row menu. The
evidence ledger becomes the dossier's "Where each fact comes
from" tab (§3.7), not a third column here. Developer words go:
"canonical" 
→ "in the case", "promote" 
→ "take into the case",
"canonicalize both endpoints" 
→ "First decide who each end is (2
steps)". Freshness stamp on every finding ("fetched 10 min ago", UX
C6). Errors in the card, not toasts.
Innovation. (1) Value diff: a conflicting value shows both with their
sources and dates, the way a code diff shows two lines, and offers
"Changed over time" when the dates differ — which records a
property-conflict decision at the same time (one decision, not two in
Redesigning the investigation workbench 93 / 252
two places). (2) Provider reliability line: per provider, how often the
reporter said "same" vs "different" in this case, so a noisy source is
visible.
Built on. OpenAleph 
✓ ? 
✕ layout, Linear "duplicate" as a decision,
UX-C1, UX-C6, VIZ-E check 4 ("compare with original"), INVENTORY
§11 Paper Trail (one queue of matches and findings).
Needs. Backend: findings in the decisions feed; a batch assess-and
promote endpoint (today one call per value then one per promotion);
allow choosing any candidate match, not only the first. No packages.
3.5 Extraction candidates (document proposals)
review
Today. Two flows (INVENTORY §12): the inline list under all
documents in The Drop (
documents-panel.tsx 
; no source pane, no
app/review/page.tsx 
; split pane,
identity check) and /review (
keyboard ↑↓/J K, A, R, schema question, identity, identifier owner,
summary page). Proposals shown as "entity proposal" etc.;
confidence as text colour only (
BAND_CLASS 
, red/brass — colour
alone); "Why was this proposed?" is good but wordy; the staged
relationship form has a free-text schema field.
The job. "The app read my document and guessed names, amounts,
dates and links. Let me confirm the right ones fast, with the words in
front of me."
Front and centre. (1) The document being read with its progress
(Bring in owns this, UX-C3 item 4) and, once read, "12 proposals to
confirm". (2) Nothing else — the decisions themselves show as the
dashboard's next card.
Redesign. One flow: the Decide screen grouped by source (§3.1
Innovation 2). The inline list is removed; The Drop's per-document
row shows only "12 to confirm 
→
". Confidence uses shapes plus
words (solid "high", dashed "check", hollow "asks first"). Proposal
types become words a reporter uses: Name, Company, Amount, Date,
Quote, Email/phone, Link. The relationship type is a picker with the
six link verbs ("owns", "directs", "paid", …) not free text. The schema
and identity questions become numbered steps in the card. "Why was
this proposed?" opens as a short three-line explanation (what, which
rule or service, where) with a link to the full one. Batch triage
(/review/batch) stays a Bring in feature; its "Start review" opens
Decide filtered to that import and keeps 
?inv= 
.
Innovation. (1) Accept by highlighting: in the reader, dragging over
words the app missed creates a proposal the reporter accepts in the
same gesture (the reporter as proposer, actor "you"). (2) Lookalike
sweep: after "Same as Harbour Nominees Ltd" on one name, the card
offers "Apply to the 6 other mentions of 'Harbour Nominees' in this
batch" with a preview list.
Built on. The existing /review design (kept and extended), UX-C1,
LOOK-B1, Prodigy (one task, three outcomes, editable history),
Hypothesis anchoring (the span is stored with quote, prefix and
suffix).
Needs. Remove the inline flow; fix "Exit" dropping 
?inv= 
; replace the
per-document fan-out with the decisions feed; a bulk "apply identity
to mentions" endpoint. No packages.
3.6 AI-proposed items review
frontend/components/ai-reasoning-panel.tsx 
). In Act: run
Today (
module, then a "Review queue" with a native filter select, Open, the
candidate's claims/hypotheses/conflicts as code-shaped rows (
CLM-1
· classification · confidence 
), "Supports: evidence:abc, …" ids, a
Redesigning the investigation workbench
94 / 252
raw JSON payload fold and "What the model was sent"; reviewer
note; "Accept as trusted analysis" / Reject for the whole candidate.
The job. "The AI drafted analysis from my case. Which of its
sentences are grounded in my sources, which are its own guesses,
and which do I keep?"
Front and centre. (1) "2 AI drafts to check" with a plum edge. (2) The
revision rate for the case ("you corrected 4 of 19 AI claims", AI-B1
rule 5) — small, on the AI one-liner.
Redesign. An AI candidate is a kind in Decide, opened as a two-step
card. The evidence pane shows the draft with grounded phrases
underlined solid cream and guessed phrases dashed plum (AI-B1
rule 2; the Figma MCP "Guessed / Real token" finding); clicking a
citation chip opens the cited passage beside it. The card lists each
claim or hypothesis as its own row with Keep / Drop / Edit and the
validator result as a shape ("citation checked" 
✓
, "id not in packet" 
✕
— from the app's gates, never from the model's self-report, AI-B1
rule 1). "Apply 7 of 9" at the end (AI-B1 rule 4). Kept claims become
ordinary claims marked "from AI draft · 10 Oct" until a person changes
their status. The raw payload and prompt move into "Watch the run"
(AI-B2) and Chain of Custody, not here.
Innovation.Accept parts, not wholes — today it's all or nothing; per
claim keep turns a mostly-good draft into usable claims and makes
the revision rate measurable.
Built on. AI-B1 rules 1, 2, 4, 5; AI-B2 trace drawer; LOOK-B1 plum
mark; UX-C9.
Needs. Backend: per-item review on AI candidates (
POST /ai
analysis-candidates/{id}/items/{item_id}/review
) and "make
claim from AI item" keeping the candidate id as origin. Question for
Ony: should accepted AI claims ever be allowed to reach "Supported"
without a person adding non-AI evidence? (My proposal: no — §3.10
rule 6.)
3.7 Entity dossier
Today (
frontend/features/dossier/dossier-panel.tsx
). Rendered
inline inside External connectors in Bring in, so clicking a party in the
network opens it far away with no scroll (INVENTORY §12). A deep
stack of 15+ blocks, each capped at 8 with no "more"; raw ids in
merge audits ("Merge audit: id 
→ id"); "Create question / lead with
exact context" and two more buttons on every relationship; a
summary as one grey line of counts.
The job. "Everything we know about this person or company, how
sure we are of each fact, and where each came from — on one
screen."
Front and centre. (1) The party's card: name, kind, the one-line "who
they are" (role in the case), status counts of the claims about them (
✓
4 · 
✕ 1 · 
○ 6). (2) Their highest Red Flag with level meter, and a "2
things to decide about this party" badge that opens Decide filtered to
them.
Redesign. A right-side drawer (520 px, native 
<dialog>
, focus trap,
Esc; UX-C7) that opens over any view — network, timeline, Decide —
with a shared-element move from the clicked node. It expands to
whole-screen with 
F
. Tabs (Radix Tabs, already installed): Profile
(identity: names, numbers, addresses, each value with a source count
and a conflict marker; ownership chain chart), Links (relationships
grouped by verb — owns, directs, paid, family — the Arts & Culture
"related by" pattern from UX-C2), Claims & flags, Timeline (a mini
time strip, scroll moves the as-of year, VIZ-B), Sources (where each
fact comes from — the evidence ledger, see §3.4), History (identity
decisions, merges and aliases in words: "Merged 'Harbour Nominees
Redesigning the investigation workbench 95 / 252
Limited' into this record, 3 Oct, because: same registration number").
Lists show 8 then "Show all 23". Actions live in one place: a header
row (Edit · Add to leads · Expand in the corpus · Trace) and a right
click menu on any row, mirrored in keys. Pending identity work
(duplicates, conflicts, after-merge pairs, outside findings) is 
not
decided in the dossier any more; it shows as "3 to decide" chips that
open Decide filtered to this party.
properties, note and Same / Different / Not sure (
Cross-provider clusters: score and three buttons (
corpus-panel.tsx 
).
connectors
panel.tsx 
). Five places, three vocabularies.
Innovation. (1) Fact confidence column: each property value shows
the grammar shape (shown / not yet shown / disputed / worked out)
so a reporter sees which facts about a person are solid before quoting
them. (2) "As of" header: the year slider applies to the dossier
(planned, INVENTORY §11), so the profile shows who owned and
directed what on a date.
The job. "Are these two records one party? If so, join them safely and
tell me what changes."
Front and centre. (1) "4 possible duplicates" — a count only. (2) After
a merge, "2 pairs to tidy" for 24 hours, then into Decide.
Redesign. All are kinds in Decide with the same pair card: two record
cards side by side, each property row aligned across, agreeing values
joined by a solid line, differing values by a broken line with "!" (VIZ
B), values present on one side only shown hollow. Choices 
1 Same
2
Different
Built on. UX-C2 related-by navigation and address per item, UX-C7
native dialog, VIZ-B grammar including "worked out", LOOK-B1,
INVENTORY §11 year slider over ownership.
/case/kestrel/party/<id> 
) so Back works;
Needs. URL per dossier (
dossier summary endpoint with paging per section (today capped at 8
client-side). No packages.
3 Not sure
. "Same" on two 
case records leads to a
second step Join them with the merge preview drawn as a
before/after: references that will move ("14 links, 6 claims, 9
evidence items move to Harbour Nominees Ltd"), blockers in words,
and Join — the one confirmation in the area, because it is the one
large action. The surviving record is chosen by a toggle on the cards,
not by which dossier you happened to open. After the join, the after
merge pairs appear as the next cards ("Both records said the company
was registered on 2 May 2016 — keep one?") with keys 
1
keep left,
3.8 Merge, duplicates, cross-references, property
conflicts, after-merge reconciliation
Today. Duplicates: Same / Different / Unsure, "Preview merge into
this record", "Execute previewed merge" (
duplicate
candidates.tsx 
), with a hard-coded rationale. Reconciliation: four
buttons per pair, hard-coded rationale (
reconciliation-review.tsx 
).
Property conflicts: Temporal change / Both valid / Unresolved / one
"Prefer X" per value, then the app's only modal asking for an optional
rationale (
property-conflicts.tsx 
, 
dossier-panel.tsx L288–300).
Cross-references: OpenAleph pairs with score, method, matched
Redesigning the investigation workbench
Shift+1 keep right, 
2
keep both, 
3
not sure. Property conflicts use
the value diff (§3.4) with "Changed over time" when dates differ,
which then draws both values on the dossier's timeline. Rationale:
chips plus optional note, never a modal, never a hard-coded
sentence.
Innovation. (1) Merge preview as a picture: a small network before
and after, the two dots sliding into one (
motion.transform 
), so the
reporter sees which links double up. (2) Undo a merge within the
session from the history strip — the backend keeps aliases and merge
audits already (
identity_history 
), so an "unmerge" that replays the
96 / 252
audit is possible. (Question for Ony: allow unmerge, or keep merges
final?)
Built on. OpenAleph 
✓ ? 
✕
, Linear "mark as duplicate" (attachments
move to the kept one), VIZ-B line grammar, UX-C1 undo over confirm
(merge is the exception), UX-C4 "same object moves".
Needs. Backend: optional reason codes on all five decide endpoints;
an unmerge endpoint (new, replays the merge audit) if Ony wants it;
cross-provider clusters and cross-references in the decisions feed.
3.9 "Does the source say what it is cited for?"
checks (VIZ-E)
Today. Nothing checks that an evidence quote appears in its source.
Hand-entered evidence (Source capture: title, URL, locator, quote) is
stored as typed. The citation gate for AI drafts checks that cited ids
exist in the packet (
checked_citation_ids
), not that the words are
there. The "Why was this proposed?" excerpt proves the span for
document proposals only.
The job. "Before I lean on a quote, prove the words are really in the
source, at that place, and that the source is what it says it is."
Front and centre. (1) On the claim strip: "3 citations failed a check"
in the dashboard's attention line. (2) Nothing else — the checks live
on each claim and each evidence card.
Redesign. Each evidence item gets a check row of small glyphs
grouped in three bands (Berkeley ¶176):
Source — 
Interested party? (VIZ-E 10), 
Primary or repeats? (VIZ-E
2, 4), 
Seen or gated? (VIZ-E 9).
File — 
Hash still matches (Hunchly, Berkeley ¶155(h)), 
Link alive
(VIZ-E 8), 
Read by OCR or native
.
Content — 
Says it (VIZ-E 1, the quote re-found in the saved
passage using quote + prefix + suffix, Hypothesis), 
Numbers add
up (VIZ-E 6) and 
Ratio unpacked (VIZ-E 5) for amounts, 
Measures
what? (VIZ-E 3) for statistics, 
Data source named (VIZ-E 7) for
charts. Each glyph uses the grammar: 
✓ passed, 
○ not run / not
seen, ! differs, 
✕ failed, with a word on hover and in the
accessible name. A failed Says it shows "compare with original":
the stored quote and the closest text in the source side by side
with the differences marked. A check the AI ran keeps the plum
"AI draft" mark until a person confirms it. A failed check moves the
claim back to Not yet shown with a note (jidoka, VIZ-E).
Innovation.Re-anchor on re-read: when a document is read again
(better OCR, a new version), every quote anchored to it is re-found
automatically; quotes that no longer match become Decide cards
("This quote moved or changed in the new reading — check it").
Built on. VIZ-E 1–10, Berkeley ¶155(h), ¶176, Hunchly hashing,
Hypothesis fuzzy anchoring, AI-B1 rule 1.
Needs. Backend: store quote anchors (
exact
, 
prefix
, 
suffix
, start
, 
end
, 
chunk_id
) on evidence (migration); a 
check_runs table
(evidence_id, check, result, detail, actor, run_at) — ADR for the data
model; a re-hash job comparing stored SHA-256 with the file on disk.
The fuzzy match can use Python's standard 
difflib
; a diff-match
patch port would be [ADR]. "Interested party" and "Measures what?"
are person-filled fields (no automation in v1).
3.10 Definition of done for "Supported"
Today. None. Any status can be set with only a rationale (
claims.py
L28–51); PATCH skips history (L108–122).
The job. "When the app says Supported, I can publish that sentence
and defend it to a lawyer."
Redesigning the investigation workbench 97 / 252
The proposal — a visible, agreed list (Agile "definition of done",
SYN_VIZ A3), shown on every claim as a checklist, enforced on the
server, each line with the grammar glyph:
# RULE CHECK
BAND HOW IT IS TESTED
1 At least one supporting evidence item is linked Content link count, stance = supports
2 Every supporting quote says it at its locator Content §3.9 anchor match (exact or confirmed
fuzzy)
3 Every supporting source has an exact locator and was seen (not gated) Source locator present; seen flag
4 The file behind each item still matches its hash (documents and captures) File re-hash
5 Every contradicting item has a written answer, or the claim is Disputed Content each contradicts-link has a reply note
6 At least one supporting item is not AI-written and not only an outside finding Source origin of each evidence
7 A person recorded the decision with a reason — review event (exists)
— Confirmed adds: two independent sources (different origins, neither repeating the other) 
or one
primary official record
Source origin graph; "repeats" flag
The "Supported" button reads "Supported — 2 checks left" and stays
disabled with the two named. Overriding is possible only with a
written reason that prints on any write-up using the claim ("Marked
supported without a second source, reason: …"), because some true
facts have one source. Rules 1–4 and 7 can run today on stored data
plus §3.9; rules 5–6 need the stance notes and evidence origin; the
independence test for Confirmed needs the "repeats" link (VIZ-E 2).
Built on. VIZ-E (jidoka), SYN_VIZ A3 (definition of done), UX-C6
(disabled says why), AI-B3 ("only Tier A can make a fact alone" — the
suite's tier rule maps to "one primary official record"), Berkeley ¶176.
Needs. Backend validation in 
review_claim
, block status changes in update_claim
, a 
done block in the review-workspace reply.
Questions for Ony: are these seven the right rules? Allow the written
override? Is "primary official record" a source type the reporter sets,
or the suite's Tier A?
3.11 Chain of Custody / provenance trace 
→
mockup CHECK_2
Today (
frontend/features/provenance/provenance-panel.tsx
). A
560 px right drawer, shown and hidden with no motion, no backdrop,
no focus trap, and it can sit on top of the Red Flag drawer
(INVENTORY §12). Content is a vertical stack of record-type blocks:
"Connected investigative trace" (evidence links, claim links,
relationships, lead links), "Document extraction lineage" (file, SHA
Redesigning the investigation workbench 98 / 252
256 as a raw string, exact chunk text, "entity proposal · 91%
extractor confidence", "Reporter review: accepted", "Accepted
record: evidence · "), "Evidence from this source", "Review /
promotion history". It is one level deep: a claim shows its evidence,
but not the evidence's documents' chunks unless traced again. Read
only. The card description is a 40-word sentence. The backend
already returns 
extraction_lineage and 
reconciliation inside the
trace (
schemas/responses.py L774–786), which the frontend fetches
again separately.
The job. "Show me, step by step, how this fact got from the original
file to my sentence — who touched it, when, and that nothing changed
on the way."
Front and centre. (1) On every claim, quote and chart point: a Trace
affordance one click away (UX-C9). (2) On the dashboard: "custody
intact" as a word with the count of broken links ("2 quotes need re
checking"), never a big chart.
Redesign. Two layers.
Drawer (quick look, 440 px, native 
<dialog>
, slides from the right
240 ms, Esc): the chain as a vertical list of 5–7 steps with one
glyph each — 
File → Reading → Passage → Proposal → Decision →
Evidence → Claim — and "Open full chain".
Full chain (whole-screen): the claim on the right, its sources on
the left, the steps between as wired cards (the C2PA ingredient
tree turned on its side, read left 
→ right as "from the file to the
sentence"). Each card is one custodian step: what it holds (scan
thumbnail, passage text, quote), who acted (person, app service,
outside service, AI), when, and a check glyph. Each wire carries
the action word ("read by OCR, p.3", "proposed by Name-finder
0.91", "accepted by Ony, 3 Oct", "linked as supports") and its line
style from the grammar: solid = person-confirmed, dashed =
proposed and not yet confirmed, dotted = worked out by the app,
broken with "!" = a check failed. Contradicting evidence enters
from below with a 
✕ wire, so for and against stay visible in one
picture. A detail panel on the right edge for the chosen card (the
C2PA right panel): full text, hash and "Re-check hash", source
links, the decision's reason. A custody log along the bottom: the
Berkeley chronological list (custodian, action, date-time, transfer,
analysis), filterable, and exportable as a plain table for a lawyer or
editor (pairs with the backup's checksum). Hover: a wire shows its full sentence and actor; a card lights every
wire that leads to the claim (the "one thought" focus from AI-B2
rule 5); hovering a custody-log row lights its card.
Scroll-over: the wheel over the chain moves along the log in time
(the cards light in order) — a feature made for following a
sequence (VIZ-B time rule); zoom on Ctrl+wheel and buttons. Motion: opening draws the wires from left to right once, 60 ms
stagger capped at 6 (UX-C4 rule 2), cards fade, text never
animates; reduced motion: all at once. In Rain Noir the ground
keeps its slow bokeh but cards are plain surfaces (LOOK-B5 calm
zone). States: nothing traceable — "This record was typed in by hand on 3
Oct by Ony; it has no file behind it. Add a source to make it
traceable" with an action; broken link — the wire is drawn broken
with the reason; very large (a claim with 40 evidence items) —
sources collapse by document into stacked cards "+6 passages
from this file", expand on click. Keyboard / SR: cards are focusable in chain order; arrows move
along wires, Up/Down between parallel branches; each card
announces "Step 3 of 7, Passage, page 3 of Share transfer form,
read by OCR, check: says it, passed". 
L toggles the custody log as
a plain list (the text equivalent, AI-B2 accessibility).
Redesigning the investigation workbench 99 / 252
Innovation. (1) Custody seal: one summary at the top — "7 steps · 2
people · 1 outside service · hash intact · 0 AI steps" — that can be
pasted into a write-up's methods note. (2) "What if this breaks?":
pick any card and the chain shows what falls downstream (claims,
flags, chart points) — the same impact view as the dossier's
dependent links, so a disputed scan shows its blast radius. (3) AI
steps in the same chain: an AI draft that used this quote appears as a
plum card linking to "Watch the run" (AI-B2), so human and machine
steps read as one history (Linear's agents-as-actors).
layout (dagre already used for ownership) — no new package.
Question for Ony: should the custody log export be part of the
backup, or its own "evidence pack"?
3.12 Relationship evidence assessment (lives in
See today, decided here)
Today (
frontend/features/relationship-graph/relationship
Built on. C2PA Verify (three panels, ingredient tree, badge on
ingredients with their own provenance), Berkeley ¶167 and Annex IV,
Hunchly hashing, VIZ-B line grammar, AI-B2 (focus one thought, text
log), UX-C9, LOOK-B5.
Needs. Backend: 
GET /provenance/chain?
detail.tsx 
). Under the network in See: statements with Trace, five
stances (Supports, Contradicts, Context, Superseded, Unresolved)
each needing a rationale first, "Choose investigation evidence…",
immutable assessment history.
record_type=&record_id=&depth=3 returning nodes and edges
(recursive, one call) with actor and timestamp per step; a custody-log
view joining review events, decisions, document uploads and job
runs; re-hash endpoint. Front: the chain can be drawn with React
Flow (
@xyflow/react 
, already installed) with a dagre left-to-right
4. How this sits in the app
Dashboard (Check module): the next decision card (centre), the
claim balance strip, "31 to decide", "custody intact · 2 quotes to
re-check".
Whole-screen features in Check: Decide · Claims · Chain of
Custody (full). Drawers anywhere: dossier, quick trace, claim.
Left-edge stage list for Check: Decide (31) · Claims (39) · To
check (9 — a filter of Decide) · Chain of Custody.
Redesigning the investigation workbench
The job / Redesign. A link is a claim about two parties ("Harbour
Nominees owns 40% of Fernhill"), so it uses the claim card (§3.2) —
For and Against columns, the Done checklist, history — opened as a
drawer from the network. Its pending stance decisions appear in
Decide like any other. The five stances keep their meaning;
Superseded and Context sit under "More". Needs: relationship
evidence in the decisions feed; the Done rules applied to links.
One status grammar (LOOK-B1) on every card, wire and chip in
the area; plum for AI (LOOK-B1, AI-B1).
One feedback pattern: in-card messages and undo toasts (UX
C6); the eight panels' grey status lines and payload-error toasts
go.
100 / 252
5. Backend changes, packages and ADRs (collected)
CHANGE WHY SIZE
GET /investigations/{id}/decisions (normalised
feed) + per-kind adapters
§3.1 one screen for 8 places; ends /review fan-out medium
Consequence dry-run per kind "What happens" box medium
Reason codes + note on every decide endpoint; remove
hard-coded rationales
real reasons small
decision_snooze table
H later small, migration
Done rules in 
review_claim
; refuse status in update_claim §3.10, closes the history bypass small
Evidence anchors (exact/prefix/suffix/offsets/chunk) + check_runs table + re-hash job
§3.9 medium, ADR
(data model)
GET /provenance/chain recursive + custody log §3.11 medium
Per-item AI candidate review §3.6 small
Batch assess-and-promote for findings; any candidate
match selectable
§3.4 small
Unmerge (optional) §3.8 medium
Packages None required: React Flow, dagre, Radix Tabs, lucide, zustand already present;
motion library per the app-wide motion ADR; diff-match-patch only if 
difflib
proves weak [ADR]
—
6. Open questions for Ony
1. Do watchlist hits and AI drafts belong in Decide, or only their
counts?
2. The seven Done rules (§3.10) — right list? Allow a written
override?
Redesigning the investigation workbench 101 / 252
3. Replace the 0–100 % slider with the IPCC 3×3 grid and its
likelihood word?
4. Rename "rejected" claims to "Ruled out", and drop "lead" as a
claim status?
5. Allow undoing a merge?
6. Number keys 
1 2 3 for decisions (Linear) and 
S D T for claim
status (SYN_UX) — both on by default?
7. Custody log export: in the backup, or a separate "evidence pack"
for lawyers and editors?
Redesigning the investigation workbench 102 / 252
See
One way of showing how sure, on every view; links that read as sentences; one time
rail; money flows that show where money appears or vanishes; the timeline as one
feature with seven views; seven new thinking views.
07
Redesigning the investigation workbench 103 / 252
The network full screen: links written on the lines, certainty as line style, Red Flag rings, the time rail.
Redesigning the investigation workbench 104 / 252
Money flows in Forest Ledger: comes from 
→ passes through 
→ goes to, with missing money drawn and named. (Some amounts on this screen are invented for
the mockup.)
Redesigning the investigation workbench 105 / 252
0. New outside research for this area (what I saw, and what each source
adds)
I checked these pages for this report. I describe only what the pages
or their images showed. Captures are in 
R/pages/feat-see-* 
.
SOURCE
Linkurious Enterprise, time
filtering (blog, Dec 2019, 
feat
WHAT I SAW
see-linkurious
time/img_00.png 
; user
manual 3.1 "Timeline")
Ogma (Linkurious) examples,
Timeline category
kepler.gl, Time Playback (docs,
feat-see-kepler
A date histogram. Bars inside the chosen range are solid blue and bars outside are pale.
Two handles set the range, with "Lower bound" and "Upper bound" date fields under
them. Hovering a bar shows a tooltip: "Item count: 6, Min: 2018-11-28, Max: 2018-12
03". The manual lists four counts: "Total items", "Invalid values", "Missing values" and
"Time Filter results". The blog's network image (
on nodes and unlabelled arrows.
Four examples: "Timeline" (filters the graph with a slider), "Time layout" (graph laid out
as an event timeline), "Timeline animation" (plays back how the graph changes),
"Timeline with node lifespans" (nodes with start and end dates).
playback/img_00.png 
)
Bellingcat "Civilian Harm in
Ukraine", built with Forensic
Architecture's TimeMap (
feat
A dark playback bar along the bottom of the map. It has a histogram (teal inside the
window, grey outside), two handles, a play button, a reset button, a speed readout "1x",
and the window's start and end dates above. The docs mention a "rolling time window",
speeds of 1x, 2x and 4x, and that "the mouse wheel resizes the window under the
cursor". Pinch or Ctrl/
⌘ plus scroll zooms the whole timeline, a "Showing" bar and Reset
appear when the range is narrowed, and Ctrl/
⌘ plus the arrow keys pans.
see-bellingcat
ukraine/page.png 
; TimeMap
README)
A full-screen map on a black background, with a time strip across the whole bottom
edge. Above the strip it says "Showing 2517 events that occurred between 31 JANUARY,
2022 - 31 AUGUST, 2025", with "RESET DATES" and buttons "Zoom to 1 year / 2 years /
5 years". A warning line with a triangle reads "No verified incidents are being added after
Aug 2025". The intro box has an "Editor's note" about incidents published before they
were fully verified. The README describes a timeline that "allows to zoom in and out"
and incidents shown "by tag and by category" in different styles.
Redesigning the investigation workbench
WHAT IT ADDS TO SEE
img_02.jpg 
) has small count badges
The time rail should show how many
records fall in each period and count
the undated and unreadable ones
openly. Today's year slider has no
histogram and only counts undated
records in the footer.
Playback of the network over time, and
parties with lifespans, both exist in a
commercial graph library. Our version
adds certainty styling and the
evidence behind each change.
A tested pattern for the global time
rail: histogram, window, play, speed
and Reset. Its wheel rules differ from
ours, so our rule has to be explicit
(§1.3).
A journalism map/time view that
states its count, its date range and its
own limits in plain words, on screen.
That is the model for the places view
and for the "as of" sentence.
106 / 252
SOURCE
Kumu documentation
(docs.kumu.io full text)
Maltego "Viewlets" (support
article)
OpenAleph user guide, network
diagrams
amCharts "Traceable Sankey
Diagram" (demo page, 
feat
WHAT I SAW
"Connection labels are hidden by default, but it's possible to show those labels as well."
Connections can be "Directed", "Undirected" or "Mutual". Showcase: "instead of hiding
your data, showcase will make it translucent, fading it into the background." Focus shows
"only the portion of the network within a certain number of connections". Presentations
mix slides with interactive map slides.
Viewlets resize and recolour entities by "Number of Incoming Links", "Number of
Outgoing Links" or "Number of All Links". The article says incoming suits "targets or key
focus points" and outgoing suits "propagation".
Add entities, create entities, expand with "Discover asset and shares", rearrange by
hand, "pick colors", and "Export the diagram as an image or share it with collaborators".
The page says nothing about timelines or how sure a link is.
see-amcharts
sankey/page.png 
)
Grey bands at a "Band opacity 15%" setting, and coloured node bars. The caption reads:
"point at a band and every step of that path lights up, from the first column to the last".
The "Try it" hints read "Hover a band to trace its whole path" and "Drag a node to
untangle the lines".
Already in the research and reused here, not re-checked: the
sequence, swimlane, 5 whys, fishbone, decision matrix, critical path,
context diagram and DFD sources (SYN_VIZ A1–A2, D1–D10). Also
the Silo "click the object, running total in a bar" pattern, the "Active
WHAT IT ADDS TO SEE
Our network will write the words on
every link by default (Kumu hides
them). "Showcase", meaning fade
instead of hide, is the right default for
cross-filtering. Focus by N steps is
what "Around a party" does today.
Today dot size shows the total number
of links. Offering in or out as a choice
helps the money view, where
"receives from many" and "pays many"
are different questions.
The diagrams we send out (the
OpenAleph send-outs) lose our
certainty grammar. That supports
SYN_VIZ C20: write the certainty
words into the labels we send.
The money view should trace a
payment's whole path, not only the
band under the pointer. The muted
bands with one lit path match
SYN_LOOK's "grey context, one
accent".
selections / Clear" cross-filter dashboard, and the Palmer "drag with
reset" pattern (SYN_UX A2, A3, A7).
Page captures kept: three folders with at most 2 files each. The extra
captures were deleted.
1. Shared foundations for every See view
Redesigning the investigation workbench
107 / 252
These apply to every feature below, so they are stated once.
1.1 One certainty grammar on every chart
Today each chart has its own idea of "how sure":
the network uses dashes, and the 
same dash 
'6 5' for "not yet
supported" and for "contested", which differ only by a small red "!"
(
frontend/lib/viz-tokens.ts CERTAINTY);
the timeline marks how sure the 
date is (asserted / verified /
approximate / disputed / unresolved) and separately carries a
Bellingcat grade and a linked claim status
(
frontend/features/timeline/timeline-panel.tsx
);
money uses transparency only: 0.5 for "direct", 0.2 for "inferred"
(
frontend/components/charts/financial-flow-sankey.tsx
);
the ownership chart dashes 
ended links
(
frontend/components/ownership-diagram.tsx line 73), which
clashes with dashed = not yet shown;
places have no certainty at all.
Redesign. Use one table across all See views (SYN_VIZ Part B,
SYN_LOOK B1). Shape and word carry the meaning in every theme:
MEANING LINE / BAND MARK GLYPH WORD
Shown (a reviewed source says it) solid filled
✓
shown
Not yet shown dashed hollow dashed ring
○ / ? not yet shown
Disputed (sources disagree) double line
✕ in a diamond
✕
disputed
Worked out by the app (sums, inferences, gaps) dotted with round caps; hatched fill for areas dotted outline ƒ worked out
Ended before the "as of" date faint (35%) with an end-date cap faint — ended + date
AI-written, not yet accepted plum left rule, dashed plum outline — AI tag AI draft · date
Red Flag levels on any party, link or band use the 
▮▯▯ / 
▮▮▯ / 
▮▮▮
ticks with the word (
.lvl
), as a ring around a node plus a count.
Date fuzziness stays a separate channel. A soft band covers a
month or year (this is built in 
case-timeline.tsx
). Fuzziness is
never drawn as a dash, so "the date is rough" and "the fact is not
shown" cannot be confused. The key says this in one line.
Tests: dashes and dots must survive WebGL (the Sigma view could
not draw dashes; see the 
network-view.tsx header), print, and
greyscale.
1.2 One whole-screen frame for every See view
Each view opens whole-screen from its dashboard tile with a
shared-element transform (
motion.transform
, 450 ms, SYN_UX
C4).
The edges are hidden, each with a thin handle (SYN_UX C2):
left: the case and its stages;
top: the view tools (view switch, arrangement, filters);
bottom: the time rail (§2.1);
Redesigning the investigation workbench 108 / 252
right: the detail panel, opened by selecting something.
Always visible:
breadcrumb top-left (
Kestrel SA › See › Who is linked to
whom 
);
the focus question as the page title (SYN_VIZ A1: "the question
goes at the top");
the key, pinned in a corner, collapsible to a chip but never lost
(SYN_VIZ A1; the Star Wars family-tree legend);
the counts line ("Showing 11 of 14 links held by then · 1 ended,
drawn faint · 2 undated always shown"), written like Bellingcat's
"Showing 2517 events that occurred between …".
The existing Chart frame anatomy
(
Zoom is always Ctrl/
⌘ + wheel, pinch, or the +/− buttons. This is
the only place we agree with kepler.gl.
Capture is escapable: the wheel acts only after the pointer has
rested on the view for a moment, and it is released at the ends of
the range (SYN_UX C5). The first time, a hint near the rail says
"Scroll to move time · 
⌘
+wheel zooms".
Today the case timeline uses the wheel to 
zoom (
timeline
panel.tsx footer: "Drag the bar under the chart, or scroll over it").
That changes to the rule above.
1.4 Cross-filtering (linked views)
Today.
frontend/components/charts/chart-frame.tsx 
: title, question,
rule, tools, key, footer) is kept as the data model of this frame.
Only its layout changes: the long muted rule sentence becomes a
one-line "Chosen because …" under the arrangement switch.
1.3 One scroll rule (Ony's "scrolling over
components does things")
One shared "pointed party" lights a party in the network, the
timeline list and on Red Flags (
pointedParty 
).
The year (
Nothing else is linked:
frontend/lib/workbench-store.ts
asOf 
) is a second, separate filter.
the places view has its own From/To window
(
features/places/places-panel.tsx 
, 
This is SYN_VIZ Part B, made concrete against kepler.gl, which uses
the wheel for something else:
Time-aware views (network, money, timeline lanes, places,
ownership): the wheel moves the "as of" moment one step. The
step is the finest the evidence supports: a year by default, a
quarter or month when the rail is zoomed.
Lists, boards, corkboard, story: the wheel moves through the
items.
Grids and matrices: the wheel moves the lit row.
ignores the year;
the ownership chart uses 
today
(
places-timeline.tsx 
) and
backend/app/services/ownership_chain.py
the chart builder ignores both.
today 
);
No view shows which filters are active, and nothing is kept in the
address.
The job. When a reporter picks Fernhill Ltd and 2018, every view
should answer for Fernhill in 2018, and the reporter should always
see that this is what is happening.
Redesign.
Redesigning the investigation workbench
109 / 252
One selection model in the store: as-of moment (or window), lit
parties, lit link families, source filter (the planned 
sources= 
), and
the "traced" set (§5).
One "Active" chip row under the arrangement switch on every See
view, as in SEE_1: "As of end of 2019 
✕ · Lit Kestrel SA 
✕ · Clear
all". This follows the cross-filtering dashboard with "Active
selections" and "Clear Selections" (SYN_UX A3).
Showcase, not hide: things outside the selection fade to about
25% (Kumu's showcase: "translucent, fading it into the
background"). A toggle "Hide the rest" removes them completely.
This also answers the open question in
In the address:
?asof=2019&lit=ent_…&src=… 
, so Back and shared
links keep the view (SYN_UX C2, "Address and history").
Screen readers: the chip row is a labelled toolbar. Every change is
announced once through a polite live region ("Showing the case as
of end of 2019, Kestrel SA lit; 11 of 14 links").
Innovation. "Lights elsewhere" counts. When something is selected,
each other See tile on the dashboard shows how many of its marks lit
("Timeline 6 · Money 3 · Map 1"). The reporter sees where the
selection matters before opening anything.
docs/discovery/README.md ("does a record show only its facts
from the chosen sources, or all its facts with the chosen ones
lit?"): the default lights the chosen ones, and hiding the rest is one
switch.
Common fate: selecting a party makes its marks in the open views
pulse once together (
motion.feedback 
, SYN_UX C4 rule 2).
STATE
Empty
WHAT SHOWS
Built on. SYN_UX A3 (cross-filter dashboard), C2 (address), C4
(common fate); Kumu showcase; INVENTORY §2 linked highlighting,
§11 source filter.
Needs. The store gains a selection object. The places, ownership and
chart-builder endpoints accept 
as_of 
. Question for Ony: fade or hide
by default.
1.5 States, for every view
One line plus one action ("No links yet. Add a party or a relationship", "No payment has an amount yet"), with the teaching case offered
(SYN_UX C3.7). Never a whole empty card.
Loading
Partial
Error
Very large
The frame and key appear at once. The canvas shows a skeleton of the last layout faded, or a quiet shimmer. Text "Loading…" goes away
(INVENTORY §10).
Counts say what was left out and why ("1 payment with no amount, listed under Not charted"). The pattern is already in money flows; it should
be everywhere.
An inline message in the frame that says what to do ("The ledger did not load. Try again"), with Retry. The panel error boundary stays.
Each view says its limit and switches form (network to clusters or grid; money to top 20 flows plus "others"; timeline to a density strip).
Redesigning the investigation workbench
110 / 252
STATE WHAT SHOWS
Time-filtered to
nothing
"Nothing had happened by 2016. Move later, or All time." Already worded well in 
graph.tsx
; kept.
1.6 Keyboard and screen reader, for every canvas
Ordered traversal: Tab enters the canvas. Arrow keys move
between nodes, bands or events in reading order. Enter opens.
Esc closes the top layer. 
[ and 
] step through the links between
one pair (SEE_1 shows "2 links join this pair · Tab steps through
them").
Each item announces its type, name and state, for example: "Link,
Harbour Nominees Ltd is a director of Kestrel SA since 3 July
2017, shown, 2 sources" (SYN_UX A2, the Figma screen-reader
post).
A list view of the same data is always one key away (
L
). For the
network that is today's relationship list. For money it is the ledger.
For the timeline it is the event list. For places it is the places
table.
Single-key shortcuts can be switched off and never fire while
typing (WCAG 2.1.4, SYN_UX C2).
2. Features
2.1 The year slider ("As of") 
→
 the time rail
Today.
frontend/components/charts/year-slider.tsx is a native range
input from the first to the last year any link or event names, with
"All time" and a full sentence under it.
It is sticky only inside the See section (INVENTORY §12).
It drives the network, money and timeline through 
asOf in the
store. It does not drive places, ownership, claims or charts.
Problems:
years only: 
lib/as-of.ts compares the first four digits, so two
payments in 2018 cannot be told apart in time;
a link that ended is simply removed, so the reporter cannot see
that something 
used to be there;
there is no picture of where the records fall;
"undated always shown" is easy to miss in the footer;
the slider's own year is announced, but the effect is not.
The job. Let the reporter ask "what held true on that date?" and watch
the case change as time moves, without losing sight of what is
undated or has ended.
Front and centre (dashboard). The current "as of" moment, and the
span of the case ("2016–2023, 38 dated records, 4 undated").
Redesign.
Redesigning the investigation workbench 111 / 252
Layout: a thin global time rail docked on the bottom edge of every
time-aware See view (SYN_VIZ C11). In SEE_1 it is shown open.
It holds:
the as-of moment in large type ("2019");
a histogram of records per quarter, solid before the playhead and
muted after (Linkurious, kepler.gl);
a playhead;
year labels;
"Zoom to 1 / 2 / 5 years" chips (Bellingcat);
a play button with 1×/2×/4× (kepler.gl);
Reset (Bellingcat "RESET DATES", kepler.gl Reset);
a counts line in the Linkurious way: "11 of 14 links held by then · 1
ended, drawn faint · 2 undated always shown · 1 date unreadable".
Moment or window: a single moment ("as of") by default. Shift
drag on the histogram makes a window ("between"), which
replaces the places panel's own From/To.
Precision: dates are compared at the precision they have. A date
known only to 2018 counts as "sometime in 2018". When the
playhead is inside 2018 at month resolution, it is drawn with the
fuzzy band, never as a point. This fixes the years-only rule in
Ended things: drawn faint with an end-date cap rather than
removed (§1.1), with a toggle "Hide ended". Removing them
would hide "who used to run this company", which is often the
story.
aria-valuetext "End of
Screen reader: the rail is a slider with 
2019, 11 of 14 links shown". The histogram has a table alternative.
Innovation.
1. "What changed" ticks. Small marks on the rail where the 
structure
changes: a new director, an ownership change, the first payment.
The reporter can jump between them with 
,
and 
worked out from link start and end dates (ƒ).
.
. They are
2. Two moments side by side. Alt-click sets a second playhead, and
the network or ownership view splits into "end of 2016 | end of
2019" with added links in amber and removed ones faint. This is
the UML "object diagram at one moment" idea (SYN_VIZ A2) used
as a before-and-after.
3. Undated tray. Undated records sit in a small tray at the left end of
the rail. They are never silently mixed in. Dropping a date on one
from the tray opens the evidence to confirm it (it becomes a To
check item).
lib/as-of.ts 
.
Hover: a bar shows "Q2 2018 · 3 payments, 1 filing", and the
matching marks light in the view above.
Scroll: see §1.3. Arrow keys move one step, Shift+arrows move a
year, 
A
jumps to all time.
Motion: marks fade and grow in date order as the playhead moves
(
motion.feedback 
). Amounts and names never animate into place
(SYN_UX C4 rule 5). Under reduced motion the change is instant
and the counts line still updates.
Built on. SYN_VIZ C11, Part B (scroll rule); SYN_UX C4–C5; Linkurious
(histogram, invalid/missing counts); kepler.gl (play, speed, Reset);
Bellingcat TimeMap ("Showing … between", zoom to N years); Ogma
lifespans; INVENTORY §11 (year slider over ownership and claims).
Needs.
Backend: 
as_of (and 
from 
/
to 
) on the graph, ledger, places,
ownership and claims endpoints. Precision-aware comparison on
the server.
No new package: the rail is SVG.
Redesigning the investigation workbench
112 / 252
Question for Ony: should the default be "as of today" or "all time"?
Today it is all time.
2.2 Relationships: the network as a whole-screen
view (mockup SEE_1)
Today.
a glance and open the evidence behind any line.
Front and centre (dashboard). A mini network of the 5–7 most-linked
parties with their flag rings, and one sentence: "9 parties, 11 links: 7
shown, 2 not yet shown, 1 disputed, 1 worked out."
Redesign (SEE_1).
frontend/features/relationship-graph/relationship-graph
panel.tsx stacks, in one card: an intro line about
"FollowTheMoney relationship record" (developer words,
INVENTORY §12); the network frame (
graph.tsx 
); a "Reviewed
duplicate copies" checkbox chip; the relationship detail; a folded
"Add to the network" with a party form and a relationship form
(native and Radix selects mixed, free-text role); the relationship
list table; and the money flows.
Problems:
network-view.tsx header:
link words appear only on hover (
"pointing at a party … writes each lit link's kind on it"), so a reader
cannot read the case from a still or an export;
"not yet supported" and "contested" share a dash;
clicking a party opens the dossier 
up in Bring in inside the
connectors card, with no scroll (INVENTORY §12);
in the relationship list, the link cell is a 
<span onClick> 
,
unreachable by keyboard (
relationship-graph-panel.tsx 
,
relEdge 
);
the "!" contested mark is colour plus glyph but tiny;
the key sits beside the chart and is lost on narrow screens.
The job. Show who is linked to whom, 
what each link says
, and how
sure each one is, so the reporter can read the structure of the case at
Redesigning the investigation workbench
Whole screen, in the frame from §1.2. Title: "Who controls Kestrel
SA, and how sure are we?"
The question is generated from the arrangement and the most
linked party, and the reporter can edit it.
Top centre: the arrangement switch (Who controls whom · Around
a party · By kind · Linked groups · Grid), with "Chosen because 6 of
11 links are ownership or directorship". The reason line is built
today and kept.
Under it, the Active chip row (§1.4).
Left: the pinned key. Bottom: the time rail. Right: the detail panel
for the selection.
Labelled links. Every link carries its relation in words on the line,
from a fixed set of link verbs: "owns 60%", "director since 2017",
"paid €29,400 · 3× Feb–Apr 18", "signs for", "bid for · 4 Mar 19".
Each label starts with its certainty glyph (
✓ ? 
✕ ƒ), and its pill
outline follows the line style. Every edge then reads as a claim
(concept-map propositions, SYN_VIZ A1/C1). Kumu hides labels
by default; we show them by default and drop them only when
they would overlap (labels by order of importance, with a "+3
labels" chip).
Certainty line styles from §1.1:
solid: Loop Two owns 100% of Kestrel SA;
dashed: M. Ross signs for Harbour Nominees;
double: the disputed email between M. Ross and Fernhill;
113 / 252
dotted ƒ: Kestrel SA owns 40% of Harbour Nominees, worked out
from the circular-ownership rule;
faint with an end cap: A. Weber, director until July 2017.
Long links become lettered stubs (A 
↔ A): the disputed M. Ross
Fernhill link would cross the whole drawing, so it is drawn as two
short stubs labelled "A" (on-page connectors, SYN_VIZ A1).
Pointing at one stub lights the other and draws the full line faintly.
Flag rings: a party with open Red Flags gets a ring with the level
ticks and a count, for example Kestrel SA "
▮▮▮ TEXTBOOK·2". This
builds on the existing 
partyFlags count.
Several links between one pair are drawn as separate curves, as
on Kestrel SA 
↔ Harbour Nominees: one ownership link, one
directorship link. This is the matrix-organisation finding (SYN_VIZ
C1).
Hover a party: it and its links light and the rest fade (built). New: a
mini-card shows its kind, country, flags and "3 links shown · 1 not
yet".
Hover a link: its sentence and its first source line ("Register filing ·
RCS B204417 · p.1").
Click opens the detail panel on the right, beside the graph, not up
in Bring in. The panel holds:
the link as a sentence;
its status chip and "2 sources agree · reviewed by you, 6 Oct";
the evidence itself as a scan with the quoted words highlighted
(SYN_UX: visual evidence rather than text walls);
the source lines with mono locators;
one primary action, "Open the source", then Chain of Custody and
More (SYN_UX C1.2: one primary action);
the Red Flag it belongs to, with its innocent explanation visible;
a "How is X linked to Y?" strip (§2.6). Clicking a party opens the
same panel with the dossier summary. "Open full dossier" moves
the dossier into its own whole-screen view.
Adding a party or link is a command (
⌘
K "Add a link", or 
N
on the
canvas). It opens the right panel as a form: verb picker first, then
"from" and "to" pickers with type-ahead, then the role, the
amount and date (for payments), and the evidence. Free-text
schema and role go away. The new link appears dashed ("not yet
shown") until evidence is attached and reviewed, so the grammar
teaches the workflow.
Duplicates: the "Reviewed duplicate copies" chip moves into the
top tools as "Show duplicate copies (3)". Its footnote stays in the
counts line.
Relationship list: this becomes the 
L
list view (§1.6). Proper
buttons, sortable by status, kind and date.
Motion:
changing the arrangement moves the nodes to their new places
(
motion.transform 
, 450 ms, the same object moving, SYN_UX
C4);
moving the time rail fades links in and out and lets ended links
settle to faint;
opening a party zooms the camera gently toward it while the panel
slides in from the right (
motion.reveal 240 ms);
under reduced motion, a crossfade.
States:
empty: "No links yet. Add a link (N), or drop a document to
propose some";
loading: last-known layout ghosted;
error: inline;
Redesigning the investigation workbench
114 / 252
over 150 parties: see §2.4.
Keyboard and screen reader: as in §1.6. 
link, 
[ ] links in a pair, 
S 
/
T
to mark Supported, Disputed or To
check on the selected link (SYN_UX C2.4).
Innovation.
1. "Weakest link" highlight. A toggle ("Where is this structure
weakest?") thickens the not-yet-shown and disputed links on
every path between the focus party and the top of the chain, and
counts them: "Kestrel SA's control rests on 1 unshown link: M.
Ross signs for Harbour Nominees." This is the critical-path idea
(SYN_VIZ A2) applied to proof.
2. "Cut this link" preview. Hovering a link with Alt held shows what
would fall away if it proved false. Parties that would lose every
path to the focus party fade further. This extends SYN_VIZ C6
("what would be cut off") from the ownership chart to the whole
network.
3. Topology readings as sentences under the arrangement switch:
"Ring: ownership returns to Kestrel SA in 3 steps 
→ Red Flag:
Circular ownership". The shape of the case is named and linked to
the matching Red Flag (SYN_VIZ C2).
Built on. SYN_VIZ C1–C2, A1 (labelled propositions, lettered
connectors, key on screen); SYN_LOOK B1 (status grammar); SYN_UX
C1, C2, C4, C7; Kumu (labels, showcase, focus by N steps); Maltego
viewlets (size by in or out links: offered as a "Size by" option in the
key); OpenAleph diagrams ("Discover", export as image); INVENTORY
§2, §3, §12.
Needs.
Frontend: label placement with collision handling in React Flow.
This is custom code; no new package.
J 
/
K
next and previous
D 
/
Backend:
a fixed link-verb map from FtM schema plus role to a sentence
("Directorship + role" 
→ "director of / since …");
an 
inferred_by field on worked-out links (which rule produced
"owns 40%");
endpoint dates kept for "ended".
Questions for Ony: may the app draw a worked-out link at all, or
only list it? I propose drawing it, dotted, with ƒ. Should labels
show by default even at 50+ links?
2.3 The four network arrangements
Today.
frontend/lib/network-arrange.ts and 
rules.ts provide four arrangements:
lib/network
who controls whom (dagre levels with "Top of the chain" and "N
steps down");
around a party (rings);
by kind (columns);
linked groups (force layout plus Noverlap).
One is chosen automatically, and the reason is shown. This is good
and is kept. Problems: the switch is a row of plain segments with long
titles, ring position can look like proof, and the switch gives no
preview.
The job. Show the shape of the case (who sits on top, who is central,
which groups exist), with the rule for each position stated.
Front and centre. The shape sentence ("Layered holding, 3 levels;
one ring").
Redesign.
Redesigning the investigation workbench
115 / 252
The switch sits in the top tools of SEE_1, with "Grid" as a fifth
choice.
Scrolling over the switch (or hovering a choice) previews the
arrangement: nodes move to the new layout at reduced opacity,
and they return if the pointer leaves (SYN_VIZ C2).
Around a party becomes rings split into quadrants by kind
(SYN_VIZ C2; the circular org chart image). The ring labels are "1
link away", "2 links away", never "inner circle".
Guides (bands, rings, columns) stay faint in the background and
are labelled on the right edge, as the level guides in SEE_1 are
("TOP OF THE CHAIN", "1 STEP DOWN").
Ring and level positions never imply proof. Only line style does,
and the key says so: "Position: the arrangement's rule. Line: how
sure."
Keyboard: the switch is a radio group with arrow keys (built:
chart-frame.tsx Segmented). Each choice reads its rule.
Innovation. Named topologies:
"star: one party sits on most paths";
"ring: money or ownership returns to its start";
"tree: layered holding". Each is detected (ƒ) and linked to its Red
Flags.
Built on. SYN_VIZ C2; 
What is a network diagram?
; 
10 types of
organizational charts (img_09).
Needs. Backend: a topology detector, using cycles from
ownership_chain.py
_mark_circles and centrality.
2.4 The large network (Sigma, above 150 parties)
Today.
frontend/components/entity-graph.tsx 
: WebGL with
ForceAtlas2, pictograms, halo labels, curved parallel links, and hover
that dims the rest. Only "linked groups" is available, and it cannot
draw dashes (stated in the 
network-view.tsx header). So above 150
parties the certainty grammar is lost.
The job. Find the clusters in a big case and drill into one without
losing the rest.
Front and centre. "4 groups; the largest has 62 parties around
Harbour Nominees."
Redesign.
Draw clusters as hulls labelled by their most-linked party.
Collapsed clusters are single nodes with a count.
"Open this cluster" turns it into its own SVG canvas (with full
grammar) joined to the rest by one bridge node (SYN_VIZ C3: split
rather than shrink).
In WebGL, certainty is carried by line brightness plus a glyph at
the midpoint: 
✓ ? 
✕ ƒ drawn as sprites, because dashes are not
available. The key states this.
Hover dims the rest (built). Scroll moves time (§1.3).
Very large (over 2,000 parties): a density view with only the
cluster hulls, plus search.
Innovation. Bridge parties first. The parties that join two clusters
(the only path between groups) get a gold outline and a list: "3 parties
connect the Fernhill group to the Kestrel group". These are often the
people to look into.
Built on. SYN_VIZ C3; SYN_UX C3.9 fit test; Maltego viewlets (size by
links).
Redesigning the investigation workbench
116 / 252
Needs. Decide whether a Sigma edge program for dashes is worth
writing. My view: use glyphs instead. No new package.
2.5 The connection grid
Today.
frontend/components/connection-grid.tsx is an adjacency
matrix:
most-linked first;
cells striped by kind;
dashed when unsupported, "!" when contested;
a hatched diagonal;
the row and column light on hover.
It is good and readable.
The job. For 10 to 30 parties, see exactly which pairs are linked, and
by what, with no line crossings.
Front and centre. Not on the dashboard. It is a view of the network.
Redesign.
It is the fifth choice of the arrangement switch.
Cells carry the 
✓ ? 
✕ ƒ glyphs at cell size, next to the stripes
(SYN_VIZ C4).
The wheel moves the lit row (§1.3).
Hovering a cell lists its link sentences. Clicking opens the cell's
evidence cards in the right panel.
A count badge appears where one party links to many with the
same verb, for example "director of ×14", a mass-officer hint.
Innovation.Sort by suspicion: order rows by open Red Flag weight
instead of link count, so the flagged block gathers in the top-left.
Built on. SYN_VIZ C4 (Mural dependency matrix); INVENTORY §3.
Needs. None beyond the grammar.
2.6 "How are these two connected?"
Today.
frontend/features/relationship-graph/connections.tsx
sits in a 
<details> under the network. It has two native selects and
"Show every chain", and lists chains shortest first with the weakest
link's certainty. A chosen chain lights in the network. The backend is backend/app/services/paths.py
, with up to 4 links (capped at 6).
Problems:
it is hidden in a fold;
the weakest link shows only as a border colour (
SWATCH.taupe
against 
sage
), which is colour alone;
picking two parties from long selects is slow.
The job. Find every chain between two parties and see where each
chain is weakest.
Front and centre. On the network's detail panel: the best chain
between the selected party and the case subject.
Redesign.
Shift-click a second party on the canvas (or 
⌘
K "Connect Fernhill
and Kestrel"). This follows the planned "Research in connection
with…" gesture.
Chains appear in the right panel as strips: party 
→ verb chip 
→
party. Each verb chip uses the grammar. Where a link is not yet
shown, the strip breaks visibly: "
○ The chain breaks at 'signs for':
no reviewed source yet. Add to To check 
→
". This is shown in
SEE_1 (SYN_VIZ C5).
Redesigning the investigation workbench 117 / 252
Scrolling over the list lights each chain on the network in turn.
Enter keeps it lit.
Empty: "No chain of up to 4 links joins them. Try 6, or look outside
the case." The second action opens a research run, with the plum
dashed line while it runs (INVENTORY §11).
Innovation. Chain strength in words, from the weakest link up:
"Every link shown", "Rests on 1 unshown link", "Includes a disputed
link". Chains are sorted by strength, then by length. A strong long
chain then ranks above a short weak one, which is closer to what
matters for publication.
Built on. SYN_VIZ C5; 
How to use the 5 whys
; 
Critical path method
;
INVENTORY §11 research runs.
Needs. Backend: a sort-by-strength option in 
paths.py 
.
The evidence image is first, then the sources, then a single
primary action.
Assessing (supports / contradicts / context, plus a reason)
happens in the panel, in a calm zone with no texture (SYN_LOOK
B5).
After it is saved, the line style on the canvas changes with a 160
ms transition. This is the one place where motion confirms a
judgement.
"Send to Check" makes a To check item, for reporters who would
rather decide in the Check step.
Innovation. Compare with original: when two sources give different
values (dates, shares), the panel shows both side by side with a
"sources differ" marker (SYN_VIZ Part E, check 4).
Built on. SYN_UX C1–C2, C9 (one click to the source); SYN_VIZ Part E.
Needs. None new. The existing endpoints move into the panel.
2.7 The relationship detail (evidence on a link)
Today.
frontend/features/relationship-graph/relationship
detail.tsx opens 
under the network. It is where evidence stances
are assessed with a required rationale. INVENTORY §12 notes that
assessing evidence happens in See, far from Check.
The job. See why a link is believed and change that judgement with a
reason.
Front and centre. The link's status and its strongest source.
Redesign.
It is the right-hand detail panel of SEE_1, in every See view: the
same panel for a band in money, an event on the timeline and a dot
on the map. This follows "same thing, same place, same look"
(SYN_UX C1.3).
Redesigning the investigation workbench
2.8 Money flows, Sankey and ledger (mockup
SEE_2)
Today.
frontend/features/relationship-graph/money-flows.tsx loads
only on a button ("Load money flows"). Its rail anchor 
flows is broken (INVENTORY §5).
The ledger comes from
#money
backend/app/services/financial_flows.py 
. It reads Payment
edges only. It never sums across currencies (good). It lists
incomplete payments with reasons (good). It marks a flow "direct"
only when reviewed evidence supports it, otherwise "inferred",
and states the rule.
118 / 252
components/charts/financial-flow-sankey.tsx 
:
colours parties by role (only pays, both, only receives);
shows inferred flows at 0.2 opacity, which is transparency alone;
has a currency select;
when the flows form a cycle, draws no chart at all, only a note ("a
Sankey diagram cannot draw" it). That hides exactly the round-trip
pattern a reporter most wants to see.
The ledger is a plain table, and "Not charted" is small text.
The job. Follow the money from where it comes from, through whom
it passes, to where it ends up. See at once where money appears
from nowhere or disappears, and which payments are proven.
Front and centre (dashboard).
The total traced, with its source count ("€1,321,400 traced, 4
payments, 3 shown").
The single strongest money check ("Grey hole: €1,358,600 left
Kestrel SA with no recorded source").
Redesign (SEE_2).
Loads with the view, with no button (SYN_VIZ C7). The ledger
query is cached.
Whole screen. The title is the focus question: "Where did the
money go, and where does it appear or vanish?". Under it, plainly:
"Euro payments only. The 2 sterling payments are kept apart and
never added to these."
Currency tabs with counts ("EUR · 7 | GBP · 2") replace the select.
Layout switch:
Columns (default): "Comes from 
→ Passes through 
→ Goes to",
the SIPOC-style column layout (SYN_VIZ C7);
Flow: today's Sankey;
Ledger: the full table.
Bands follow the grammar:
shown: solid fill;
not yet shown: light fill with a dashed outline (the €42,000
"deposit", from one email);
worked out: dotted outline and, for a gap, hatched fill. The "No
recorded source" block is a hatched ghost band worth €1,358,600,
labelled "ƒ worked out · = what left Kestrel SA minus what came
in". Missing money is drawn, and is clearly not a payment.
Words on bands: the main bands carry a short label with their
source ("
✓ land price · council minutes p.4", "3 × €9,800").
Integrity checks on the right, as leads, never findings (SYN_VIZ
C7, the DFD checks in A1):
Grey hole (more out than in): Kestrel SA, €71,400 in and
€1,430,000 out;
Miracle (out with nothing in): Harbour Nominees pays €60,000
with nothing recorded coming in;
Black hole (in with nothing out): Loop Two BV receives €240,000
and nothing is seen leaving;
Round trip (money back to where it started): "none found" in euro,
shown as a passed check so the reporter knows it ran. Each check
card has an icon of its own shape (half-filled circle, star, filled dot),
so colour is not the only signal. Each has a kind label, the party, the
numbers, a "Could be innocent:" line (SYN_BRAND D rule 8,
respect the accused), and the actions "Make a lead" and "Add to To
check", plus a lead idea ("ask for Kestrel SA's 2019–20 accounts").
The same icons sit on the nodes in the flow, so the panel and the
picture point at each other.
119 / 252
Redesigning the investigation workbench
Ledger strip at the bottom:
payment bars on a time axis, with height on a log scale stated on
the axis;
the €10,000 reporting line drawn dashed;
a bracket over the three €9,800 payments with "▮▮▯ STRONG · 3
payments just under €10,000 in ten weeks", and "
▮▯▯ FAINT ·
round €1,250,000" (INVENTORY §11: structuring and round
number flags on bars; the flags come from Red Flags, not from the
chart);
the table beside it: mono tabular amounts, a status chip per row,
and source locators. 
J 
/
K
moves the lit row, and the same band
lights above.
incomplete payments: "1 payment with no amount, listed under
Not charted", which opens a list with reasons and an action to fix
each;
very large: top 20 flows plus "others (n)", and the ledger stays
complete.
Keyboard and screen reader: the bands are a list in order (payer,
receiver, amount, status). Each check card is a region. 
L
gives the
ledger.
Theme: shown in Forest Ledger, the quiet theme SYN_LOOK says
suits money and timeline views. "Supported" is sky blue here, not
green, because green means money in this subject.
Innovation.
Cycles: never hide the chart. The flow is drawn with the cycle
broken at its latest payment, and that payment is drawn as a
return arc under the columns, labelled "returns to Fernhill Ltd ·
€X". The Round trip check lights.
Hover a band: the band and its whole path light (amCharts
traceable Sankey) and its ledger rows light. Click adds the band to
"Traced so far" at the top (the Silo running-total pattern, SYN_UX
C5): "€1,321,400 · 4 payments · Clear". The traced set is part of
the cross-filter (§1.4), so the timeline and the network show the
same payments.
Scroll: replays the flows in date order (SYN_VIZ C7). The rail reads
"drawn up to Dec 2021". Bands grow from the payer to the receiver
at 
motion.feedback speed. Amounts appear final, never counting
up (SYN_UX C4 rule 5).
States:
no payments: "No payment has an amount yet. Add one from a
bank statement";
payments only in many currencies: one tab each;
1. Missing money drawn as a hatched ghost with the arithmetic
written on it. The gap is a visible object that can be selected,
traced and turned into a lead. The two Sankeys I looked at
(amCharts' traceable demo and the app's own ECharts one) draw
only recorded flows.
2. Integrity checks as standing questions that re-run when the year
or currency changes ("last run 10 Oct, 14:02"). A check that found
nothing says so ("Round trip: none found"), so silence is never
mistaken for "not checked".
3. Structuring lens: a toggle draws reporting thresholds
(configurable per country: €10,000, $10,000…) across the ledger
strip and brackets runs of payments just under them. The bracket
links to the Red Flag that holds the rule. It does not invent its own
verdict.
Built on. SYN_VIZ C7 and A1 (DFD miracle, black hole, grey hole;
SIPOC columns); SYN_UX C5 (click to trace, running total); SYN_LOOK
C4 (Forest Ledger); SYN_BRAND D (innocent explanations, plain
Redesigning the investigation workbench
120 / 252
words); INVENTORY §11 (money redesign, structuring and round
number flags); amCharts traceable Sankey; 
financial_flows.py
(never summing currencies, the stated flow-type rule).
Needs.
Backend:
a 
money_checks service (grey hole, miracle, black hole, round trip)
per currency, with as-of;
flow_type widened to shown / not yet shown / disputed instead
of direct / inferred;
Debt and other money schemas included if Ony wants them.
Frontend: the column layout and the cycle return arc go beyond
the ECharts sankey (it rejects cycles). Either custom SVG
(preferred: no package, full control over hatching and the
grammar) or d3-sankey [ADR].
Questions for Ony:
Should the integrity checks become Red Flags with indicator ids,
or stay as See-only leads?
Which reporting thresholds by default?
2.9 The timeline (chart, list, add event, and the six
canvas views plus the open corkboard)
Today.
frontend/features/timeline/timeline-panel.tsx plus components/charts/case-timeline.tsx
:
an ECharts lane chart with one row per kind of event (6 kinds);
mark fill for how sure the date is;
a soft band for a date known to the month or year;
bars for ranges;
a zoom bar and wheel zoom.
Under it, a long list of every event, each with a grade picker
(reporter events), "Open source" and "Trace provenance", plus up
to six small-text context lines.
"Add an event" is a fold with free-text "YYYY-MM-DD" date entry
and three selects.
Problems:
three certainty vocabularies on one event (date status, Bellingcat
grade, linked claim status);
rows by 
kind of record (where the date came from: "Dates in
records", "Events you recorded") rather than by party or story;
the list scrolls the page;
text-heavy;
a button on every row;
the wheel zooms instead of moving time.
Canvas mockups (Ony's frames 4–9, 12, 13):
Slider: cards with arrow buttons;
Curve: a line rises under the chosen year;
Periods: four named eras, each with its own colour;
Board: an evidence board with the string drawn as you scroll;
Lanes: lots of records at once, a lane per party, with quarter bars;
Story: scroll plays the case one record at a time;
the open timeline as a corkboard (full, and clean) docked at the
bottom with the period's material above.
The discovery README adds the "stack in depth" view (Ony, 10
Oct).
Redesigning the investigation workbench 121 / 252
The job. See what happened when and in what order, how sure each
date and each fact is, and what the evidence for each moment looks
like. Build the reporter's own version of the story from it.
Front and centre (dashboard). The next unresolved moment: the
earliest event whose date or fact is not yet shown ("2017 meeting
with Fernhill: date unknown, 1 source"). Also the span, as a small
density strip ("2016–2023 · busiest: 2018").
Redesign.
One timeline feature, seven views, switched from the top edge
(Slider · Curve · Periods · Board · Lanes · Story · Stack). All share
one event store, one selection, the time rail and the right detail
panel. Switching is a shared-element transform: the selected card
flies to its place in the next view (SYN_UX C4 rule 1, "the same
object moves").
Default view by case size:
Lanes when there are more than 40 events;
Periods when the reporter has named periods;
Slider otherwise. The reason is shown, as the network does
("Chosen because 52 events").
One certainty mark per event:
the fact follows the grammar (
✓ ? 
✕ ƒ: is the event shown?);
the date follows the separate fuzziness band (day / month / year /
range);
the Bellingcat grade is shown as words in the detail panel ("Likely:
several sources, minor contradictions") and drives the fact mark
(confirmed or likely 
→ shown; weak 
→ not yet shown;
unsubstantiated or unknown 
→ not yet shown with a note). The
key says "Mark: is it shown · Band: how exact the date is". This
removes the three-vocabulary clash.
Lanes (frame 8, the working view):
one lane per party or per source, switchable;
quarter density bars on top;
evidence thumbnails as marks when zoomed in;
dependency arrows for sequences that should run in order (bid 
→
award 
→ payment). A payment before its award breaks the arrow
and offers to become a lead (SYN_VIZ C8, Gantt and critical path).
Periods (frame 6): named by the reporter ("Set-up 2016 · The
money 2018 · The bid 2019 · Cover 2021"). Each period is a tint of
the ground, with words "in this period: 3 payments, 1 filing".
Board and corkboard (frames 7, 12, 13):
the open timeline is docked at the bottom, with that period's
material above as a board;
scrolling slides to the next period and draws the string;
clean and full (polaroids, tacks, red yarn) are two styles of the
same view, picked by theme (Archive 
→ full, Indigo Clarity 
→
clean);
the "loners" tray holds undated items (SYN_VIZ D9).
Story (frame 9): beats one sentence each, each with its evidence
image; a beat with no evidence shows an empty frame that
becomes a To check item (SYN_VIZ D11). Only Strong or Textbook
flags may headline a beat.
Stack in depth (Ony, 10 Oct): built as decided in docs/discovery/README.md
:
segments as fine as the evidence allows;
one wheel notch pushes the top layer out;
empty stretches are skipped with "3 weeks later";
"sometime in March 2019" layers for fuzzy dates.
Redesigning the investigation workbench 122 / 252
Event list: becomes the 
L
list view, not a page section. Each row:
date (mono), mark, title, one source line. The actions move to the
detail panel.
Adding events:
drag any record (document passage, payment, filing) from the
bottom filmstrip onto the timeline;
or press 
N
for a form with a date field that understands "March
2019", "spring 2019", "2019" and sets the precision itself;
or place a named placeholder ("Meeting with Fernhill, 2017?")
that sits dashed until evidence is attached (INVENTORY §11
"dynamic timeline").
Hover an event: its evidence thumbnail grows and its party lights
in other views. Click: the right panel shows the evidence and
grade.
Scroll follows the §1.3 rule: Lanes, Slider and Curve move time;
Board, Story and Stack move through items.
States:
empty: "No dated records yet. Drop a document with dates, or add
an event (N)";
very large: Lanes with density bars and grouped marks ("12
payments, Q2 2018"); the others offer "Too many for this view;
showing the 40 most important" (by flag weight and evidence);
date unreadable: listed in the undated tray with why.
Keyboard and screen reader: each view is an ordered list of
events in date order. Arrow keys move through it and announce
date, precision, title and status. Story mode steps with Space.
Motion: Board and Story use 
motion.story (700 ms). Lanes use
motion.feedback 
. Text on cards never animates. Reduced motion
steps discretely.
Innovation.
1. Sequence checks on the timeline. The app knows typical orders
(company formed 
→ director appointed 
→ payments; tender 
→
award 
→ contract 
→ payment). It draws faint dependency arrows
and flags an out-of-order pair as a lead: "Payment on 6 Feb 2018
comes before any recorded contract." This turns the timeline from
a display into a checker (SYN_VIZ C8).
2. "Confidence line" over the lanes. A thin line rises and falls with
the share of shown events in each quarter, like the journey-map
emotion line with face icons (SYN_VIZ C8, 
User journey mapping
img_02). The weak periods of the story are visible at a glance.
3. My timeline vs the record. The reporter's own built timeline
(dragged events, placeholders) sits as a lane above the record
lanes. Any of their events with no record under it is outlined
dashed. The reporter sees which of their beliefs still lack
evidence.
Built on. SYN_VIZ C8, D9, D11; SYN_UX C4–C5; canvas frames 4–9,
12, 13; INVENTORY §2, §3, §11 (dynamic timeline, stack in depth,
open timeline); 
case-timeline.tsx (fuzzy band); Bellingcat grades
(ADR-0005); Ogma "Time layout".
Needs.
[ADR] motion library for the shared-element transforms and
scroll-driven board (SYN_UX F).
[ADR] only if Swiper or vis-timeline is used for Stack or Lanes. My
view: Lanes in custom SVG or the existing ECharts; Stack in CSS
3D plus the motion library.
Backend:
named periods (a small table);
placeholders (a timeline event with no date and a "planned" flag);
Redesigning the investigation workbench
123 / 252
a "sequence rules" file;
per-event fact status derived from grade plus the linked claim.
Question for Ony: which view should be the default for a new
case?
2.10 Places (map, time strip, places table, unusable
coordinates)
Today.
frontend/features/places/places-panel.tsx 
, 
timeline.tsx 
, 
components/places-map.tsx 
: a MapLibre self
hosted Protomaps base map; named dots; a fixed dot colour
#8A2F1E with a white stroke (hard-coded, not themed); its own
From/To date fields.
An ECharts strip has one row per place, with hollow marks for
fuzzy dates.
A places table and a "Coordinates that cannot be used" list.
With no base map, the notice tells the reporter to "install the base
map once with the compose profile 
Coordinates come only from records, and nothing is looked up.
This is good and is stated on screen.
Problems:
the map ignores the global year;
nothing says how sure a location is;
no movement over time;
the table and map are separate scroll blocks.
The job. See where things happened and who or what moved where,
and when, with how sure each place is.
Front and centre (dashboard). A small map with the case's places
and a count: "6 places, 2 countries; 1 place with no usable
coordinates."
Redesign.
places
maps 
" (developer words).
Whole-screen map with the time rail at the bottom, like
Bellingcat's TimeMap layout (map above, full-width time strip
below). It has a sentence in the Bellingcat way: "Showing 6 places
with events between 2016 and 2019 · Reset dates". The places
panel's own From/To becomes the rail's window.
Dots follow the grammar:
a solid ring where the location is read from a document;
dotted where it is worked out (geocoded later, if Ony allows
lookups);
a hollow dashed ring where the record is not yet shown;
a soft halo where the location is approximate (a city, not an
address). Theme tokens replace the hard-coded colours.
Movement path: pick a party or a payment and its places join hop
by hop with dates on each hop. Loops show (SYN_VIZ C9–C10,
spaghetti diagram).
Hover a dot: its evidence photos (a reader photo of the fences,
dated from metadata) and the linked parties. Click: the right detail
panel.
Scroll moves time; the path draws through time.
The places table is the 
L
list view.
"Can't be placed" becomes a tray on the left edge with a reason
per record and a "fix" action.
No base map: the dots are drawn on a plain graticule with country
outlines if available, plus a line: "No street map installed on this
computer. Places are shown on a plain grid. Ask whoever set up
Redesigning the investigation workbench
124 / 252
the app to add the map." The setup words go into the help, not the
screen.
Keyboard: arrow keys move between places in reading order
(north-west to south-east), and Enter opens. Map text follows the
user's text size (SYN_UX A6, the W3C draft on tooltip and map
text).
Innovation.
1. Same-address cluster. Several companies registered at one
address stack as a numbered pin ("7 companies, Rue du Fort").
The number links to the matching Red Flag area (hidden
ownership). Cardinality becomes a map signal.
2. Before-and-after at a place. If two dated pictures exist for a
place (the chart builder already has "pictures compared"), the pin
offers "compare 2017 
↔ 2021" in the compare slider, with images
untouched (SYN_LOOK B3).
Built on. SYN_VIZ C9–C10; Bellingcat TimeMap (layout, "Showing …
between", reset, zoom to N years, stated limits); kepler.gl (window
and play); INVENTORY §2, §3; 
basemap-style.ts
.
Needs.
Backend: 
as_of and window on the places endpoint; a location
precision field; party movement (ordered places per party with
dates).
No new package (MapLibre is there).
Question for Ony: allow optional geocoding (it sends addresses
out)? The default is off, as today.
2.11 Ownership and control chart (shown on the
dossier today)
Today.
frontend/components/ownership-diagram.tsx
, features/dossier/ownership-chain.tsx
, 
lib/ownership-layout.ts
, backend/app/services/ownership_chain.py
:
a dagre chart with owners above;
shares on ownership links and roles on directorships;
ended links dashed (clashes with the grammar);
"circular" marks;
the subject double-ringed;
an owners table;
uses 
today
, not the year slider.
It renders inside the dossier, which renders inside Bring in
(INVENTORY §12).
The job. Who ultimately controls this company, since when, and
through how many unproven steps?
Front and centre. "Ultimate owner: not yet shown. 2 of 3 steps
shown."
Redesign.
It becomes the "Who controls whom" arrangement of the
network, focused on one party (opened from any party's panel:
"Who controls this?"). There is no second chart type to learn.
Ended links are faint with an end cap.
Circular links get the Textbook ring, as in SEE_1.
Subsidiary groups collapse into nodes that open their own sub
chart (SYN_VIZ C6).
The time rail applies.
Redesigning the investigation workbench 125 / 252
_effective_shares 
) is
Effective share (already computed: 
written on the subject as "Loop Two BV: 100% direct · Harbour
Nominees 60% via Loop Two (ƒ worked out)".
Innovation. Proof depth: each owner shows "n steps, k shown", and
the topmost proven owner is marked "furthest we can prove". The
reporter knows exactly where the evidence stops.
Built on. SYN_VIZ C6 (ended links faint, collapse, cut-off preview);
INVENTORY §3, §11.
Needs.
as_of on 
ownership_chain.py 
.
2.12 Chart builder and chart pictures
Today.
frontend/features/charts/chart-builder-panel.tsx is hidden
behind "Build a chart". It is a long vertical form: 1. question (plain
buttons, no pictures); 2. data (a select with record counts); 3. kind
(buttons, first one "suggested"), plus a required title that "states
the finding".
The server cooks, draws and checks against rules 0–20
(
backend/app/visuals/spec.py 
: 7 questions including "How sure
we are"). A check report lists failed rules by number. Values trace
to records with numbered buttons. "Keep chart" writes to decks
and write-ups that nothing can open (INVENTORY §12).
Chart pictures (
components/presentation/chart-pictures.tsx 
):
before-and-after with slider, side by side or stacked (react
compare-slider).
The planned Diagram and Chart modes (free canvas, shelves,
design files) are in 
docs/discovery/chart-builder-design.md 
.
Problems: hidden; text-heavy; the question choices have no
pictures; nothing ties a chart to the year or selection; kept charts
go nowhere visible.
The job. Turn the case's own records into a checked chart that
answers one question and can go into a write-up or deck with its
sources.
Front and centre (dashboard). "Charts kept: 3 · last: 'Fernhill paid
Kestrel SA €71,400 in four payments'" with a thumbnail.
Redesign.
Whole-screen studio in three columns:
left: the question as picture cards. Each of the 7 questions shows
a tiny drawing of its kinds (ranking bars, a line over time, a Sankey,
a map, a heatmap grid). Questions with no data are greyed and say
"no records yet" (INVENTORY §12: "plain buttons without
pictures");
centre: the live chart, redrawn on every choice. There is no
"Preview" button; the server check runs on a short debounce;
right: the data choice, kind choice, title field and the check report
as plain rows with the rule's words first and its number after
("Every bar needs a label · rule 7").
Grey context, one accent by default (SYN_VIZ C15). Click a mark
to make it the accent, and the title field proposes words ("Fernhill
Ltd received the most").
The footer counts records shown, not yet shown and disputed. A
chart that rests only on unshown records carries a "draft only"
band across it and cannot be kept for publication (SYN_VIZ C15).
Kept charts carry title, key, source line and the as-of date, so they
"stand on their own" (SYN_VIZ Part B).
Redesigning the investigation workbench
126 / 252
"Chart this" from any See view: the current selection and as-of
moment open in the builder with the question pre-picked (money
→
Flow; timeline 
→ Change over time).
Chart pictures: stay as a kind under "Place", with the compare
slider. The images are never tinted. Captions carry "taken" dates
and sources.
Keep: "Keep in…" lists the actual decks and write-ups by name
(Act step), and opens them.
Keyboard: the cards are a radio grid. The chart has its data table
(built) as the list view.
Innovation.
1. Charts that update with the case. A kept chart remembers its
order slip. When the records change, its card shows "2 new
records since kept: redraw?" with a before/after. A reporter never
publishes a stale number unknowingly.
2. Small multiples by party in one click ("one per payer"), with the
encoding explained on the first card (SYN_VIZ C15).
3. A "certainty" facet on every chart: bars split shown / not yet
shown / disputed with the grammar's fills, so a total never hides
how much of it is proven.
Built on. SYN_VIZ C15–C16, Part B (exports stand alone); SYN_UX C1
(one primary action), C6 (disabled controls say why); INVENTORY §2,
§3, §11 (Diagram and Chart modes, "From a collection"); 
spec.py (FT
Visual Vocabulary questions).
Needs.
Backend: keep the order slip with its data hash for "changed since
kept"; a certainty split on the queries; the deck and write-up list
(server routes exist, no UI).
The Diagram mode (free canvas) uses React Flow, already
installed (ADR-0005 amended).
Question for Ony: should the builder be able to publish a chart that
rests on unshown records at all?
2.13 The chart frame (shared anatomy) and the
OpenAleph send-outs
Today.
components/charts/chart-frame.tsx gives every chart a title,
question, rule, tools, canvas, key and footer counts. This is good.
OpenAleph entity sets (diagram, timeline, list) are drawn by
OpenAleph's own UI (
features/corpus/entity-sets.tsx 
). The
OpenAleph guide shows diagrams with node colours and image
export, and no certainty.
Redesign.
The frame's anatomy becomes the whole-screen frame of §1.2:
the pinned question, the always-visible key, the counts line, and
"Chosen because…".
Send-outs write the certainty word into each label ("Harbour
Nominees director of Kestrel SA [shown]", "… signs for … [not yet
shown]"), so the meaning survives outside the app (SYN_VIZ
C20).
Built on. SYN_VIZ C19–C20; OpenAleph user guide.
Needs. Label text in 
openaleph_entitysets.py 
.
Redesigning the investigation workbench
127 / 252
3. New views proposed in SYN_VIZ (D1, D2, D3, D4, D5, D6, D10)
All of them open whole-screen in the §1.2 frame. They start from
records already in the case, use the grammar, and are reached from ⌘
K, from a party or claim's "More" menu, and from a "Thinking tools"
row on the See hub. None are built today.
3.1 Who-told-whom (sequence view, SYN_VIZ D1)
Today. Nothing. But the data partly exists: email documents keep from
, 
to
, 
cc
, 
bcc
, 
date
, 
subject
, 
messageId and 
inReplyTo
, and
OpenAleph can return the thread
(
backend/app/services/email_documents.py
).
The job. Who knew what, and when: the order of messages, letters
and meetings between the people in the case.
Front and centre. On the dashboard, only when emails exist: "14
messages between 4 people · 1 key exchange disputed".
Redesign.
Lifelines across the top, one per person or organisation, ordered
by first appearance.
Dated messages are arrows down the page: solid when a reply is
on record, dashed when none.
Labels quote the document ("Keep Fernhill's name off it."), never
a summary (SYN_VIZ A2: precise labels).
An activation bar shows time in a role; an X ends a lifeline (left
office, company dissolved).
"alt" boxes put two accounts of one exchange side by side, each
with its evidence and status. For example, the leaked 2 Feb 2022
email is marked 
✕ disputed because "sender not confirmed".
The wheel advances time and draws the next arrow (made for
scrolling).
Hover an arrow: the message itself as a card. Click: the document
in the right panel at that passage.
Empty: "No messages with senders and dates yet. Emails you drop
appear here."
Screen reader: an ordered list "2 Feb 2022, M. Ross to board@…,
'Keep Fernhill's name off it', disputed: sender not confirmed".
Innovation.Knowledge line: pick a fact ("the Fernhill payments") and
each lifeline turns solid from the first message that shows that
person was told. The view answers "when did M. Ross know?"
directly.
Built on. SYN_VIZ D1, A2 (
What is a sequence diagram?
, img_04).
Needs.
Backend: a 
communications view joining Email headers, letters
and meeting events to parties (name 
→ entity matching goes
through the existing review, never automatic: "every link waits for
a person").
Custom SVG. The motion falls under the motion [ADR].
3.2 Approval lanes (swimlane and blueprint,
SYN_VIZ D2)
The job. Did this decision or document follow its required path?
Redesign.
Role lanes (Council officer, Committee, Mayor, Buyer) with steps
in date order, taken from timeline events tagged with a role.
Redesigning the investigation workbench 128 / 252
A required path comes from a template ("Public land sale:
valuation 
→ advert 
→ committee vote 
→ signature"). A skipped or
out-of-order step is an empty dashed slot marked "!" with its
expected place.
Blueprint mode: a line of visibility splits public acts (minutes,
adverts) from hidden ones (emails, meetings), and the scans sit in
the top row.
The checks "authority gap" (signed by someone without the role)
and "excess hand-off" link to the procurement Red Flags with
their level ticks.
Hover a slot: what was expected and why. Click: the evidence.
Innovation. Template from the law: templates are records with their
source ("council standing orders, s.12"), so the expected path itself is
cited and can be challenged.
Two answers to one why branch into two lanes.
The bottom is a lead with an owner.
It can start from any money check, Red Flag or timeline gap ("Ask
why…").
Innovation. AI may propose a because, never fill one in: proposals
arrive as plum "AI draft" steps with the guessed-vs-grounded
underline (SYN_AI B1.2) and cannot count as shown until a person
links a passage.
Built on. SYN_VIZ D3; 
How to use the 5 whys (its stated weakness:
answers without evidence).
Needs. A 
why_chain record (steps with evidence links). It could
reuse leads plus notes.
Built on. SYN_VIZ D2; 
What is a swimlane diagram?
; 
What is a service
blueprint?
; ASQ checks.
Needs. Backend: process templates (a small catalogue like the
indicators) and a role tag on events. Question for Ony: who writes the
templates? I suggest starting with procurement and land sale.
3.3 Why chain (SYN_VIZ D3)
The job. Why did this anomaly happen, and is each step proven?
Redesign.
A staircase: the anomaly at the top ("Kestrel SA paid €1.25M with
€71,400 recorded in"), then Why 
→ Because steps.
Each "because" must link to a passage and carries its status, so
the chain breaks at the first step not yet shown. Steps below the
break are drawn faint.
3.4 Fishbone for harm (SYN_VIZ D4)
The job. What caused this harm, across people, decisions, money,
rules and oversight, equipment and environment?
Redesign.
Bones for those six categories. A cause may sit on two bones (an
interaction).
Empty bones prompt ("nothing under oversight yet").
Each cause carries a "could be innocent" field and opens its why
chain.
Status goes potential 
→ probable 
→ verified, drawn with the
grammar (not yet shown 
→ shown).
Sparse bones are visibly thin: that is where to dig.
Innovation. Red Flag areas as bone hints: the case's flagged areas
propose causes under the right bones (procurement 
→ decisions;
hidden ownership 
→ money). These are hints, not findings.
Redesigning the investigation workbench
129 / 252
Built on. SYN_VIZ D4 (KCG, ASQ).
Needs. A small record type for causes. Question for Ony: is this view
worth building before the others? It suits harm cases (safety, health,
environment) more than money cases.
3.5 Competing explanations grid (SYN_VIZ D5)
The job. Which explanation does each fact fit, including the innocent
one?
Redesign.
Columns are explanations. The innocent explanation is the
baseline column, always first (taken from the Red Flag's innocent
explanations).
Rows are evidence. Cells are + / − / S (same as the baseline), each
with a one-line reason.
Totals carry "a guide, not a verdict". No winner is declared.
Versions are kept.
The wheel lights rows. Hover shows the evidence.
In shared cases, scores stay hidden until "Reveal" (SYN_VIZ A4:
hidden vote).
The keyboard moves cell by cell; the screen reader reads the row,
column, score and reason.
Innovation.Diagnostic rows first: rows that score the same for every
explanation are folded away ("4 facts fit everything"), so the reporter
sees only the evidence that tells explanations apart.
Built on. SYN_VIZ D5 (
What is a decision matrix
, Pugh, Burge 2009).
Needs. A matrix record with versions.
3.6 Publication dependency graph (SYN_VIZ D6)
The job. What must be proven before this story runs?
Redesign.
The story is a milestone diamond on the right. The draft's claims
sit left of it, and their evidence left of those (WBS order).
The critical path is the longest chain of unshown claims, drawn
thick.
Records requests show a PERT range ("10–30 days").
A 100% check lists draft sentences that have no node ("3
sentences rest on nothing in the case").
Status colours, shapes and words follow the grammar, with a
legend (critical path image, SYN_VIZ F5).
Innovation.Days to publishable: the critical path with PERT ranges
gives "earliest we can publish: 3–6 weeks, if the Kestrel accounts
arrive", and it updates as claims become shown.
Built on. SYN_VIZ D6; 
Critical path method
; 
Work breakdown structure
.
Needs. Write-ups listed and opened (server routes exist); sentence → claim links from the AI draft citations; request records with date
ranges.
3.7 Subject in context (SYN_VIZ D10)
The job. One subject, and everything that passes across its edge:
money, documents, people, orders.
Redesign.
The subject is a circle (Kestrel SA) with a boundary line for the
organisation's edge. Outside parties sit around it.
Redesigning the investigation workbench 130 / 252
Arrows are labelled with what passed, with dates, and link to the
document.
A review list shows unsourced flows ("Loop Two BV 
→ Kestrel SA:
control, no document").
It is the "Around a party" arrangement with a boundary, and it is
easy to export as a one-slide summary.
4. The See hub and the dashboard tile
The See tile on Case home is the module SYN_UX C3.4 asks for: a
mini network of the most-linked parties, with the as-of year as a
large number. Scrolling over the tile steps the year in place (Ony's
frame 10, "Case home v2": the linked year lights across panels).
Clicking opens the network whole-screen with the shared
element transform.
The See hub (left edge, stage "See") lists the views as large words
with counts: "Network 9 · 11", "Timeline 38", "Money €1.32M
5. Motion summary for See
MOMENT
Tile 
→ whole-screen view
TOKEN
Innovation. Inside/outside split for people: directors and signatories
sit on the boundary, so "who acts for the company" is visible as its
own ring.
Built on. SYN_VIZ D10 (
What is a context diagram?
).
Needs. Nothing new beyond the network data.
traced", "Places 6", "Charts 3", then "Thinking tools: Who told
whom · Why chain · Competing explanations · …". Each word
previews its view behind the menu on hover (the Locomotive
style list-as-navigation, SYN_UX A2).
Saved views and story mode (INVENTORY §11): any See view
plus selection plus as-of is saved as a named view ("Kestrel
control, end 2019") and can be a story beat.
REDUCED MOTION
motion.transform 450 ms, shared element
Detail panel in / out
Time rail step: links fade, bands grow, dots appear
Arrangement change / timeline view change
motion.reveal 240 / 180 ms, from the right edge
motion.feedback 160 ms, staggered by date, capped
motion.transform 
, nodes move, same object
120 ms crossfade
fade
instant, counts update
crossfade
Redesigning the investigation workbench
131 / 252
MOMENT TOKEN REDUCED MOTION
Story / Board / Stack steps
motion.story 700 ms discrete steps
Selection pulse in other views one 160 ms pulse, common fate outline only
Judgement saved (line style changes) 160 ms instant
Values never animate (amounts, dates, names). There is at most one
ambient effect, and it sits on the ground behind the canvas: the Rain
Noir bokeh, never over lines or labels (SYN_LOOK B5).
6. Needs, all together
Packages (ADR).
1. Motion library for shared-element and scroll-driven transitions
(Motion/Framer Motion or GSAP), or the native View Transitions
API only. This is the same ADR as SYN_UX F.
2. d3-sankey, only if the custom SVG money layout is judged too
costly. My recommendation is custom SVG.
3. Swiper or vis-timeline, only if chosen for Stack or Lanes. My
recommendation: no new package.
Backend.
as_of (moment) and 
from
/
to (window), precision-aware, on the
graph, ledger, places, ownership, claims and chart queries.
A link-verb map (schema plus role 
→ sentence); 
inferred_by on
worked-out links.
A money checks service (grey hole, miracle, black hole, round trip;
per currency; as-of).
flow_type widened to the grammar.
Topology readings; chain strength sort in 
paths.py
.
Named periods, timeline placeholders, sequence rules, and a per
event fact status.
A location precision field, party movement paths.
A communications view from Email headers and threads.
Process templates; why-chain, cause and explanation-matrix
records.
Kept-chart data hashes for "changed since kept"; the deck and
write-up list.
Certainty words in the OpenAleph send-outs.
Frontend.
One selection model, the Active chip row, the URL state.
The time rail.
The right detail panel shared by every See view.
The 
L list views.
Label placement in React Flow.
Redesigning the investigation workbench 132 / 252
WebGL certainty glyphs in Sigma.
Open questions for Ony.
1. Should the "as of" default be all time (today) or the present?
2. Should cross-filtering fade the rest by default (my proposal) or
hide it?
3. May the app draw a link it worked out, dotted with ƒ, on the
network?
4. Should the money integrity checks become Red Flag indicators, or
stay as See leads?
5. Which reporting thresholds should the structuring lens use, by
default and per country?
6. Which timeline view should a new case open in?
7. Should optional geocoding of addresses exist at all? It would send
addresses out.
8. Which new thinking tools come first? My order: who-told-whom
(the data exists), competing explanations, why chain, publication
graph, approval lanes, subject in context, fishbone.
9. Can a chart resting only on unshown records be kept for
publication?
Redesigning the investigation workbench
133 / 252
Act
Red Flags with a level ladder and innocent explanations to rule out; leads in Now /
Next / Later; a "what the story needs" tree; a write-up editor with citation chips; one
Export sheet; one finding at every social size.
08
Redesigning the investigation workbench 134 / 252
Red Flags full screen: ranked list, the open flag with its level ladder, and "Before you call it".
Redesigning the investigation workbench 135 / 252
The story readiness tree feeding a write-up with numbered citation chips, in Archive.
Redesigning the investigation workbench 136 / 252
0. New outside research for this area
Each source was captured with 
grab.py (page or image looked at
with Read) unless marked "text only", which means I read the fetched
SOURCE
Integrity Watch: Red Flags
(Transparency International EU),
pages/feat-act
integritywatch/page.png
WHAT I SAW
text and saw no screenshot.
A welcome dialog that says flagged notices "do not necessarily entail instances
of mismanagement, fraud or corruption" and "We always advise verifying the
information before any publication". It also says the data covers only 2020–2022
and was not updated. Behind it: a year switch, a map, cross-filtering charts
including "Number of Flags per Notice" (0: 7,743; 1: 8,459; 2: 1,745; 3: 130; 4:
4) and "Top Flags Type", and a fixed bottom bar with a filter box, a live count
"18,081 out of 18,081 notices" and "Reset filters".
Everlaw Storybuilder Drafts
(support article, text only; the page
itself was behind a bot check) and
the Everlaw blog on trial witness
statements (
pages/feat-act
everlaw/text.md 
)
NotebookLM / Gemini Notebook
help, "Use chat" (
pages/feat
Typed document numbers auto-link to the evidence; when auto-link is off,
detected references are underlined and offered for conversion; an Evidence
panel on the right holds documents, highlights and testimony; a document "chip"
in the text opens a preview; an Exhibits view lists every piece of evidence the
draft cites and exports it as a bundle; Word and PDF exports keep links, and "PDF
(With Images)" appends the exhibit pages with hyperlinks to them. Drafts keep a
version history.
act-notebooklm/text.md 
; the
help page is now titled "Gemini
Notebook Help")
Hypothesis "Annotation Basics"
(
pages/feat-act
"uses direct quotes, text, and images from your sources as citations"; "hover
over any citation" for the full quote; "select a citation" to jump to the quote in
context; a saved note keeps "clickable inline citations"; the reader chooses
which sources the model may use.
hypothesis/img_03.png 
,
img_04.png 
)
A sidebar with two tabs, "Annotations 30" and "Page Notes 7"; each annotation
quotes the highlighted words above the note; small count buckets in the left
margin line up with highlights on the page; tags are typed with Tab or comma;
every annotation has its own link; a group selector and an "Only Me" choice for
privacy.
WHAT IT GIVES ACT
(1) The "a flag is not a finding" warning
belongs at the moment of publishing, not
only on the list. (2) A distribution of how
many flags each party carries is a better
overview than a flat list. (3) Say how old the
rules and data are. (4) A fixed count-and
reset bar for filters.
The write-up model: a citation is a chip, an
evidence panel beside the text, an exhibits
list made from the draft, and an evidence
pack export with the cited pages at the back
and links to them.
Citation hover = the exact quote; click = the
passage in context; the reporter picks
which records an AI draft may use (already
true in the app's record picker).
Notes anchored to a passage (quote above
note) versus notes on the whole case;
margin count buckets; private vs shared
notes for later multi-user.
Redesigning the investigation workbench
137 / 252
SOURCE
ProdPad, "Now-Next-Later
roadmap" (
pages/feat-act
WHAT I SAW
prodpad-nnl/img_00.png 
)
Hunchly Evidence Guide (PDF, text
only)
Canva resize help
Three columns Now / Next / Later with counts ("2 initiatives, 7 ideas"); each card
carries objective tags with a coloured underline, a "Blocked by: …" line,
"Dependency" chips and "Public / Internal"; a Completed / Roadmap /
Candidates switch at the top. Text: "certainty is portioned out over time
horizons"; columns "don't need to be equal in size".
A full case export is a zip with each capture as an MHTML file plus a signature
file, a public key, and a deletion log that explains gaps; SHA-256 for every
capture, photo and attachment, shown in the dashboard; the guide says hashes
"don't prove that content was unaltered before capture" and suggests
corroborating with archives or originals.
Blocked by a bot check; not used. Social sizes come from SYN_BRAND A8
instead.
1. Red Flags list (cards)
Today. One long card section in Act (
title, "N of M checks ran" (names only in a 
red-flags-panel.tsx 
): a sub
title= tooltip), the type
bar, then flags grouped by area (the case's own areas first, then "This
may also point to"), sorted by level inside each area. Problems:
The rank number is wrong across groups.
rank counts up
red-flags-panel.tsx lines
through the areas in display order (
267, 284), so a Faint flag in the first area is numbered above a
Textbook flag in the second. The server's order is by weight
(
engine.py line 221), the client re-sorts by level inside each area
only.
Opening a flag pushes the page around: the drawer is fixed, but
the card list is part of the 9,700 px page; Red Flags 
↔ To check
Redesigning the investigation workbench
WHAT IT GIVES ACT
Leads by horizon, each tied to what it is for
(a Red Flag or a claim), blocked-by lines,
and done work in a separate view instead of
two dead columns.
The evidence-pack layout (files, hashes, a
log of deletions) and the honest limit line to
print in it.
—
jump with smooth scroll and lose the reader's place (INVENTORY
§12).
Party chips do nothing on click (
light the party on hover.
PartyButtons 
, line 57): they only
Every GET reruns every rule and writes to the database
(
routes_red_flags.py
get_red_flags 
→ 
engine.recompute 
,
which commits). Reading is a write; the list cannot be cheap or
cached, and a viewer without write rights gets a different code
path.
What the engine knows but the card hides: 
facts.band_reason 
,
facts.unreviewed_links (the flag rests on a link not yet
138 / 252
supported), 
first_seen_at ("new since your last visit") and the
family version. Only the weight part mentions unreviewed links.
Empty state is a grey sentence in a full card; errors are grey 
sv
error lines.
The job. Show which published patterns the case's records match,
how far each goes (Faint 
→ Textbook), what could make it innocent,
and what a person still has to decide; then let the reporter act on one
without losing their place.
Front and centre (dashboard tile "Red Flags"). The single strongest
open flag: level chip, name, parties, and its first innocent explanation
on the face of the tile, never hidden [UX C3.4]. Under it one line: "3
Textbook · 2 Strong · 4 Faint · 2 checks could not run".
Redesign.
Whole-screen feature (mock ACT_1), opened from the tile with
the shared-element move [UX C4 rule 1]. Three regions, no page
scroll: 1. Top bar: breadcrumb 
Harbour land › Act › Red Flags
,
the investigation-type line (§4), the coverage line (§5), a level
filter (Textbook / Strong / Faint / Set aside, each a toggle chip with
count) and a count-and-reset strip borrowed from Integrity Watch
("9 of 11 flags · Reset"). 2. Left list (
≈
380 px): one global ranking
(level, then weight), not ranked inside areas. The area becomes a
small label on each row and a filter. Each row: rank, level chip
[LOOK B1], name, two party chips, "new" dot if 
first_seen_at is
after the last visit, and a small "rests on 1 unsupported link" mark
(dashed ring 
○
, the "not yet shown" glyph) when facts.unreviewed_links is non-empty. The wheel moves the
selection along the list [VIZ B scroll rule: lists]; J/K too. 3. Centre:
the open flag, large: what was found (summary with values in
mono), a small purpose-built picture of the pattern (a loop for
cycles, a band strip for count-in-band, two companies and a
shared address for shared-property), the level ladder (§3), then
actions. 4. Right column: "Before you call it": innocent
explanations as a checklist (§2), "Records can't show" items with
their To-check status, and the source quote.
Party chips act: click = select the party everywhere (filter the list
to that party's flags and light it in See); hover still lights it. A
"parties carrying flags" strip under the list shows each party with
a count ring (Integrity Watch's flags-per-notice idea turned to
parties): Harbour Nominees 4, Fernhill Ltd 3, Kestrel SA 2, M. Ross
1.
Hover a row: the open flag area previews it (crossfade 160 ms)
without changing the selection; leaving restores. Scroll over the
pattern picture: steps through the records it rests on (for ML-021,
payment by payment).
Motion: rows enter with a short stagger (max 6 items, the rest
fade) [UX C4 rule 2]; selecting a row slides the centre content
along the list's axis; Textbook gets no flashing — its fill and bright
edge carry it. Under reduced motion all of this becomes a 120 ms
crossfade.
States: loading = skeleton rows with the level chip outlines only
(no fake data); empty = "No pattern fires on these records. 7 rules
ran." plus one action "See what the rules need" (opens §5); error =
in-line in the list region with "Run the rules again"; very large
(hundreds of flags) = list virtualised, grouped by level with counts,
and the party strip becomes the main way in.
Keyboard / screen reader: the list is a 
listbox with 
aria
activedescendant
; each option's name reads "Rank 1, Textbook,
Circular ownership, Kestrel SA and 2 more"; Enter moves focus
into the open flag; Esc back to the list; 
L cycles the level filter; 
A
add to leads, 
X set aside (asks for the reason in place). Single
keys can be turned off [UX C2.4].
Redesigning the investigation workbench 139 / 252
Certainty: level by the three-bar meter plus the word [LOOK B1];
the links a flag rests on use the claim grammar (solid shown,
dashed not yet shown, "!" disputed) [VIZ B], so "a Textbook
pattern on an unproven link" is visible at once.
Backend: split 
GET /red-flags into a cheap read and a 
POST
quickest route through a big case.
3. "What changed" replay: the list remembers the last visit; a "since
8 Oct" toggle shows only new, raised, lowered and gone flags,
each with the record change that caused it (from
last_seen_at 
/
/red-flags/run (or run on record change in a job) so reading never
writes; return the coverage numbers and a 
new_since field per
reporter.
Innovation.
1. "Rests on" honesty mark: a flag that rests on an unsupported link
shows that link's dashed line in its picture and cannot reach the
dashboard headline until the link is shown. Today that fact is only
a −0.3 in the weight.
gone_at and the rule version).
Built on. UX C2/C3/C4/C5, LOOK B1, VIZ B (scroll rule, certainty
grammar) and C14 (factor rows), BRAND D rule 8 ("Respect the
accused. Always mention innocent explanations"). Outside: Integrity
Watch (flags-per-item distribution, count-and-reset bar, "verify
before publishing" warning).
Needs. Backend: read/run split; 
2. Party pressure strip: parties ranked by how many open flags they
carry and of which level, as a row of rings; clicking one is the
new_since 
; expose 
band_reason 
,
unreviewed_links and rule versions in the schema the UI reads. No
new package. Open question for Ony: does "new since last visit"
count per device now, or wait for multi-user accounts?
2. Red Flag details drawer
Today. A fixed 560 px 
wb-drawer on the right: level line, name, id and
area, link to the glossary, summary, all parties, sections Could be
innocent, Why it matters (definition, this level, "About the numbers",
cross-hints), Source (first plus fold), Ranking (weight bar plus parts),
actions. Problems:
No backdrop, no slide, no focus trap; Esc only works when focus
is already inside (
onKeyDown on the aside); it can sit on top of the
Chain of Custody drawer in the same place (INVENTORY §12).
"This level" prints catalogue placeholders: for BO-001, BO-032,
BO-033, ML-023 the Faint and Strong texts in the catalogue are
Redesigning the investigation workbench
literally "To be set by Ony", and ML-021's Strong is too; the drawer
shows 
${LEVEL.name}: ${ind.levels[level]} with no guard.
The ranking is a bare bar with "+0.25 1 other open flag…" lines —
numbers without meaning to a reporter [VIZ C14].
Only the first source shows; the server sends at most 3 verified
sources (
engine.py line 194).
The job. Everything a reporter needs to judge one flag fairly, with the
innocent side first, without leaving the list.
Front and centre. Not a separate tile; it is the centre and right of the
whole-screen view (§1). On the dashboard tile, the drawer's first
140 / 252
innocent explanation is the line shown.
Redesign.
The drawer stops being a drawer: in the whole-screen view the
details are the centre and right columns. Outside the Red Flags
screen (from a network node, a To-check item, a lead), it opens as
a native 
<dialog> side panel [UX C7] sliding from the right (240
ms in, 180 ms out), with a dimmed backdrop, focus trapped, Esc
closes, and a "Back to To check" crumb so the jump keeps your
place [UX C2 address and history]. One right panel at a time:
opening it closes Chain of Custody's panel (they share the right
edge's job [UX C2.1]).
Order: Could be innocent 
→ What the records can't show 
→ What
was found 
→ Level ladder 
→ Why it matters 
→ Sources 
→ Why it
ranks here.
Innocent explanations become a checklist: each has three states, not looked at (
○
), 
ruled out (
✓
, needs a one-line note and
optionally a record), 
could apply (!). The state is saved per flag.
This turns BRAND D8 from a writing rule into a record.
"Why it ranks here" as factor rows [VIZ C14]: "+ 2 other open
flags on Harbour Nominees (BO-031, BO-032)", "− rests on a
payment link not yet shown", each naming the record it comes
from and linking to it.
Sources: all verified sources (up to 3) as quote cards: publisher,
title, locator, the exact quote in the reading face, "Open source 
↗
".
No ligatures in quotes [LOOK B4].
Every URL change: 
?flag=<id> so Back and shared links work.
States: missing indicator (catalogue changed) = "This rule's
catalogue entry is gone (rule version 3); the flag stays until the
rules run again."
Innovation.
1. Innocent-explanation ledger as above; a flag with any explanation
still "not looked at" cannot headline a share card (§15) or be called
Strong in a write-up sentence without a warning (§8).
2. "Ask the record": next to each innocent explanation, a one-click
To-check item or a lookup ("Check whether Fernhill Ltd files group
accounts" 
→ OpenCorporates), so the drawer leads straight to
work.
Built on. UX C2, C7; VIZ C14; LOOK B1, B4; BRAND D8. Outside:
Integrity Watch's "verify before publishing" line, printed at the foot of
the panel.
Needs. Backend: a 
flag_explanations record (flag id, explanation
index or text hash, state, note, record ref, who, when) [schema
change, not a package]. Catalogue: guard or fill the "To be set by Ony"
levels (open question below).
3. Levels: the ladder (Faint / Strong / Textbook)
Today. A level band on Strong and Textbook cards, "Faint ·" inline in
small text; the drawer prints the level's meaning and its catalogue
text. The levels are three unrelated words with no sense of distance,
and the catalogue has gaps: Strong is "To be set by Ony" for at least
BO-001, BO-031, BO-032, BO-033, ML-021 and ML-023 (read from catalogue/indicators/bo.yaml
, 
ml.yaml
). The detection specs also
Redesigning the investigation workbench 141 / 252
decide levels in different ways: ML-021 has a Faint band only (
from:
2
), ML-023 is Textbook outright ("money that leaves and comes back
meets the definition as worded").
The job. Show where a flag stands, what the next rung would need,
and where the rung's wording comes from.
Front and centre. The level chip on every flag everywhere; on the
dashboard, the count per level.
Redesign.
The ladder (mock ACT_1, centre): three rungs stacked bottom-up
(Faint, Strong, Textbook), each with its catalogue wording, the
threshold source, and a state: 
met (filled meter, 
✓
), 
next (outlined,
with "What would raise it": the missing facts as To-check items or
lookups), 
not set (hatched, "No published threshold for this rung
yet" — honest instead of "To be set by Ony"), 
not reachable by
records (the parts only a person can decide).
For ML-021 in the sample case: Faint met ("4 payments between
$9,000 and $10,000"), Strong not set, Textbook needs two facts
the records cannot show ("whether the money was cash",
"whether it was split to avoid the report", both straight from the
spec's 
not_shown
).
"About the numbers" (the threshold note) sits beside the rung it
explains, not in a fold at the bottom.
Visual: one warm-red family rising in fill (outline 
→ tinted 
→ filled
oxblood with a bright edge) plus 
▮▯▯ / 
▮▮▯ / 
▮▮▮ and the word
[LOOK B1]; never colour alone. Sensitive areas (homicide,
trafficking, war crimes) keep the same chip with a muted area
colour [LOOK B1].
Motion: when a decision in To check raises a flag, the meter fills
one bar (450 ms) and the row moves up the list once; the change
is logged ("Raised to Strong after you marked 'cash' as shown, 10
Oct").
Screen reader: the ladder is a list of three items with state words
("Faint, met. Strong, no threshold set. Textbook, needs 2 facts a
person must check").
Innovation.
1. "One fact away" (planned, INVENTORY §11) made visible as the
empty rung with its named missing facts and the button that
fetches or asks for each.
2. Per-case thresholds with a trail: where no source gives a Strong
level, the reporter may set one for this case ("Strong from 4
payments"), shown with a "set by you" mark, never mixed with
catalogue wording.
Built on. LOOK B1 (status grammar, value-based ramp), VIZ B (tick
ramp, Likert), UX C6 (state words, disabled says why). Catalogue facts
from 
catalogue/indicators/*.yaml
.
Needs. Catalogue: fill or mark the unset rungs (
≈ the Faint/Strong "To
be set by Ony" entries) — open question for Ony: show unset rungs as
"not set", or hide the rung? Planned setting "Faint and Strong levels
where no source gives one" (INVENTORY §8) is where per-case
thresholds live. Backend: return per-rung state and "needs" from the
spec (
bands
, 
not_shown
).
Redesigning the investigation workbench 142 / 252
4. Investigation-type picker
Today. Closed: "Type · · chosen by the app | chosen by you · Change".
Open: suggested area cards with reasons, then every other area as a
card grid with a search box, "Let the app choose", Cancel, Save
(
InvestigationType
, lines 159–215). Problems: up to 42 equal cards
in a grid (INVENTORY §12); the reasons are shown only while editing;
the effect of the type (which areas group first) is invisible; the safety
area SA is excluded silently.
The job. Say what kind of wrongdoing this case is about, so the right
patterns lead, and let the reporter correct the app.
Front and centre. One line on the Red Flags tile and in the top bar:
"Hidden ownership · Money laundering — chosen by the app (why?)".
Redesign.
Closed: the line plus "why?" which shows the app's reasons in a
popover ("Circular ownership found among Kestrel SA, Harbour
Nominees and Fernhill Ltd"; "4 payments in the $9,000–$10,000
band").
Open: a popover sheet from the top bar (not a grid on the page),
three parts: 1. Suggested (2–4 cards) with reasons and "N flags
here". 2. Search all 41 areas as a list, not cards: name, one-line
summary, indicator count, flags fired; type to filter; arrow keys
move; Space toggles. 3. A live preview strip at the bottom: "With
this type, the list leads with 5 flags from Hidden ownership; 4
others move to 'May also point to'".
A note at the foot: "Your safety (SA) is not a type; it has its own
panel."
Keyboard: the sheet is a 
dialog
; the list is a 
listbox with multi
select; Enter saves.
Innovation.Type drift notice: when new records make the app's
suggestion differ from the type the reporter chose ("Procurement
fraud now has 3 flags; add it?"), a quiet chip appears on the type line,
never an automatic change.
Built on. UX A1 (Hick's law), C2 (one mechanism), INVENTORY §12
(42-card grid). Outside: Integrity Watch's single filter line with a live
count.
Needs. Backend: a "preview grouping for these areas" call or do it
client-side from flags already loaded. No package.
5. Checks that could not run (and "N of M checks ran", "No longer fire")
Today. "N of M checks ran" with the rule names in a 
title= tooltip; "N
could not run on these records" in a fold with the reason; "No longer
fire" in a fold at the bottom. With 7 detection specs against 2,882
verified indicators, "7 of 7 checks ran" reads as complete coverage
when it is not (INVENTORY §7).
The job. Be honest about coverage: which patterns the app can test
on records, which ones need a lookup, which only a person can
decide, and what is stopping a rule from running here.
Redesigning the investigation workbench 143 / 252
Front and centre. A coverage line in the top bar: "5 of 7 record rules
ran · 2 need data · the other 2,875 patterns in your areas need a
lookup or a person".
Redesign.
Coverage popover (from the line): three bands: 
Ran (rule names,
version), 
Could not run (each with the missing data turned into an
action: "3 payments have no amount — Add amounts" opens those
payments), 
Not testable from records (counts by method from
Freshness stamp: "Rules ran 2 min ago · catalogue v2026-10-10"
[UX C6]; Integrity Watch's stale-data notice is the reason to show
it.
Innovation. "What would let this run" turns every could-not-run
reason into a To-check or edit task, so coverage grows with work
instead of staying a fold.
detection-classification.json 
: person checklist, list lookup,
document review), each linking to the glossary filtered to the
case's areas.
"No longer fire" becomes a toggle in the level filter ("Gone (2)")
showing the record change that ended each one.
Built on. UX C6 (disabled says why, freshness), VIZ E (honest limits),
INVENTORY §7 (classification counts). Outside: Integrity Watch.
Needs. Backend: return the classification counts for the case's areas
and structured "missing" data (which records lack which property).
No package.
6. Leads (questions and reporting leads) with Now / Next / Later
Today. A form (title, priority, owner, "Add lead", detail textarea always
visible) above a 5-column dnd-kit kanban (Unreviewed, Active,
Blocked, Resolved, Rejected) that scrolls sideways (
leads-kanban
board.tsx 
). Problems:
Creating a lead is two calls (create, then a PATCH for priority and
owner; 
Lowercase internal words shown raw ("urgent", "reporter lead",
task status "in_progress"); "red_flags lead" for a flag-made lead
(
provider printed as is).
Task status 
cancelled exists on the server (
leads.py
TASK_STATUSES) but has no button; there are no due dates.
leads-panel.tsx lines 41–43): if the second fails, the lead
exists without them.
Developer words in history: status notes "Updated in Next.js
workbench" and "Task marked … in Next.js workbench" (lines 55,
79).
Errors show as muted text (
errors.
<p className="muted"> 
), not as
Redesigning the investigation workbench
Every card repeats Make claim, Make task, Trace and three task
buttons [UX C1.2]; empty columns take full width; Resolved and
Rejected are permanent columns of finished work.
A lead does not say what it is for (which flag or claim it would
move).
The job. One short, honest list of what to chase next, why each
matters to the story, and what is blocked.
144 / 252
Front and centre. The top "Now" lead with its purpose line ("would
show whether the 4 payments were cash 
→ ML-021 Textbook") and
its next task.
Redesign.
Now / Next / Later board (ProdPad's horizons; VIZ D13): three
columns of unequal width, Now capped at 5 (WIP limit, the cap
shown as "4 / 5"); status (unreviewed, active, blocked) becomes a
mark on the card, not a column. "Done" (resolved, rejected) is a
separate view toggle like ProdPad's "Completed", with the
outcome and reason.
Unreviewed inbox: leads made by connectors, watchlists, notes
and Red Flags arrive in an "Inbox" lane above Later until a person
places them (the "every link waits for a person" rule).
Card: title, priority edge (left border thickness + word, not colour
alone), "For:" line naming the flag, claim or story section it serves
with its status chip, "Blocked by:" line, owner initials, task dots (
○
todo, 
◐ in progress, 
✕ blocked, 
✓ done), and counts of supporting
/ contradicting evidence as 
✓ n · 
✕ n. Actions on hover or focus
only, in a "…" menu mirrored by keys [UX C1.2].
Drag between horizons (dnd-kit already installed) plus keyboard:
focus a card, 
M then 
1/2/3 to move; announced "Moved to Next,
position 2".
Scroll over a column moves its list; the wheel never moves the
page.
Tasks: open inside the card's detail panel (right side), with Cancel
added and an optional due date.
States: empty = "No leads yet — add one, or turn a Red Flag into a
lead"; very large = columns virtualised, Later folds by "For:" group.
Innovation.
1. "What it would change" on every lead: computed from links — a
lead linked to a flag's not-shown part says "answers 1 of 2 open
questions for ML-021"; a lead linked to an unshown claim on the
story's critical path (§7) is marked "on the critical path". This
replaces the hidden "attention score".
2. Re-entry strip: "Since 8 Oct: 2 leads moved to Now · 1 blocked by
records request" at the top [VIZ D13].
Built on. VIZ D13 (Now/Next/Later, WIP cap, re-entry strip), VIZ A3
(Eisenhower note: show the payoff at the moment of choice), UX C1,
C5. Outside: ProdPad Now-Next-Later (horizons, blocked-by,
Completed view).
Needs. Backend: a 
horizon field on leads (now, next, later, inbox)
and an order; create-with-priority-and-owner in one call; 
due_on on
tasks; drop the "Next.js workbench" notes; plain labels for 
provider
.
No package.
7. Publication readiness: "what the story needs" tree
Today. Not built. The pieces exist: claims with status and grades,
claim–evidence links, leads, To check, Red Flags, the writing check on
AI drafts (
writing_check.py
: single source, likelihood words,
headline, one main point), 
how_we_know() for drafts. Nothing joins
them into "can we run this?".
Redesigning the investigation workbench 145 / 252
The job. Answer "what must be true, and shown, before this story can
run, and what is still missing?" in one view, and feed the write-up.
Front and centre. A readiness ring on the dashboard: "Story: 9 of 14
claims shown · 3 blockers" with the top blocker named.
Redesign (mock ACT_2, left half).
A tree read left to right: the story's one-line thesis (a milestone
diamond [VIZ D6]) 
→ its sections (what we will say) 
→ each
section's claims 
→ each claim's evidence (passage chips with
document and page). Leaves are evidence; a branch is only as
strong as its weakest child, and the tree shows that: a branch line
is solid when every child is shown, dashed when any is not yet
shown, broken with "!" when any is disputed [VIZ B].
Gates on the thesis node (double-outline squares [AI B2 gates]): Every sentence has a source (the 100% check [VIZ D6]), 
Innocent
explanations addressed (§2 ledger), 
Right of reply sent (CP-01
from the suite [AI B3, visual_release_mode=publication]), 
Legal
read (a person and a date), 
Single-source statements marked
. Each
gate shows 
✓ / 
○ / ! with the count it is waiting on.
Critical path: the longest chain of unshown claims is drawn with a
thicker amber line and listed at the top: "Blocked by: whether the
4 payments were cash (To check), Fernhill Ltd's owner in 2019
(records request, 2–6 weeks)" — a range, not a date [VIZ D6
PERT].
Interactions: hover a node lights its path to the thesis and its
sentences in the write-up (same colour link between passage and
diagram, FigJam pattern [VIZ A4]); click opens the claim or
evidence in the right panel; drag a claim node into the write-up to
insert its sentence with citations (§8); the wheel over the tree
moves the lit node down the critical path.
States: no story yet = "Write the one sentence this story says" (an
input that becomes the diamond); no claims linked = sections
show "No claim yet" as hatched slots that become To-check items
[VIZ D11 empty frame]; very large = sections collapse to their
status bar; zoom with Ctrl+wheel.
Keyboard / screen reader: a 
tree role with 
aria-level
, 
aria
expanded
; each node reads "Claim, not yet shown, Harbour
Nominees paid Fernhill Ltd four times, 2 of 3 evidence shown"; a
list view toggle (
L
) gives the same as an outline.
Innovation.
1. The tree drives the write-up: every sentence in the write-up is
bound to a node; deleting the claim marks the sentence; marking a
claim disputed turns its sentence's underline to the disputed style
everywhere.
2. Readiness is a record, not a feeling: "Ready to run" can only be
set when all gates are 
✓
; the decision is stored with who and
when (RAPID's one decider, [VIZ A3]) and printed in the evidence
pack.
3. Competing account branch: the innocent explanation can be
added as a sibling branch to the thesis and filled with evidence the
same way, so the reporter sees both trees side by side [VIZ D5].
Built on. VIZ D6 (publication dependency graph, WBS 100% rule,
PERT), VIZ B (line grammar), VIZ D5 (competing explanations), AI B3
(CP-01 right of reply, visual release mode), UX C9 (one click from
source). Outside: Everlaw (draft bound to its evidence list).
Needs. Backend: 
story (thesis, sections, gate states, ready decision)
and 
story_node (section 
↔ claim ordering) tables [schema change,
ADR for the data model]; a readiness endpoint that computes branch
status from claims and evidence. Drawing: SVG in React (no package)
Redesigning the investigation workbench 146 / 252
or React Flow (already installed) for the canvas. Open questions for
Ony: one story per case or several? Which gates are required by
default (right of reply and legal read could be optional for citizen
investigators)?
8. Write-ups
Today. The server stores ProseMirror/TipTap JSON (
writeups.py
),
extracts cited records, renders .docx with numbered superscript
citations and a Sources section. But there is no editor: the docstring
points to 
frontend components/writeup-editor.tsx
, which does not
exist, and TipTap is not installed. A write-up can be created only by
promoting an AI draft or by "Keep chart 
→ A new write-up"; nothing
lists, opens, edits or deletes one in the UI (INVENTORY §11–12). The
.docx is themed "Dark Academia" in fixed colours, so the brief
preview says "The Word export isn't themed yet" (
slide-canvas.tsx
DECK
).
The job. Write the story in the app, with every sentence tied to its
evidence, and see at a glance which sentences are not yet safe to
publish.
Front and centre. The active write-up's title, word count, and "3
sentences without a source".
Redesign (mock ACT_2, right half).
A reading-room editor in the reading face (Source Serif 4 /
Domine by theme), 60–70 characters per line, line height 1.6, on a
plain surface — a calm zone, no effects [LOOK B5].
Citations are chips inline (Everlaw chips; NotebookLM): number +
short label; hover shows the exact quote, document and page;
click opens the passage beside the text in the right panel (never
scrolls away) [UX C9]. Typing 
[[ opens the record search; pasting
a quote that matches a saved passage offers to link it.
Sentence status underlines: grounded sentence = no mark;
sentence with no citation = dashed cream underline and an 
○ in
the margin; sentence citing a disputed claim = "!" in the margin;
sentence citing only one record = the existing single-source mark;
AI-written sentences keep the plum left rule and "AI draft" tag
until a person edits or accepts them [AI B1.2, LOOK B1].
Margin buckets (Hypothesis): small counts in the left margin by
paragraph — sources cited, notes — that open the paragraph's
evidence.
Evidence panel (right, Everlaw): tabs 
Cited (the exhibits list, auto
made from the text), 
Tree (§7, the current section's branch), 
Notes
.
Version history: named versions ("Before legal read") with a diff;
AI changes are their own versions [AI A4].
States: saving = a quiet "Saved 10:42" stamp; offline = "Saved on
this computer"; conflict (multi-user later) = side-by-side; empty =
"Start from the story tree" / "Start from an AI draft" / "Blank".
Keyboard: standard editor keys; 
⌘⇧C cite; 
F6 moves between
text, margin and evidence panel; citations are focusable and
announce "Citation 3, passage, Harbour register p. 4".
Innovation.
Redesigning the investigation workbench 147 / 252
1. Disabled with a reason: "Export for publication" is greyed until
every sentence has a source or is marked "opinion / analysis", and
says how many remain [UX C6].
2. Strength words follow the evidence: the writing check's
likelihood-word rule (ICD 203) runs live; a sentence saying
"shows" over a not-yet-shown claim gets a suggestion "records
suggest"; a Red Flag named in text must carry its level word and an
innocent explanation within the paragraph (BRAND D8).
3. AI-use note generated at export: "Drafted with AI: 2 of 11
paragraphs, edited by you" (NN/g PACED, [UX C9]).
Built on. UX C9, C6; LOOK B4, B5; AI B1; VIZ D6. Outside: Everlaw
Storybuilder Drafts (chips, evidence panel, exhibits list, version
history), NotebookLM (hover quote, click to context), Hypothesis
(margin buckets).
Needs.[ADR] TipTap (the server's format is already TipTap JSON, so it
is the natural choice) or ProseMirror directly; frontend
list/open/delete of write-ups (routes exist); sentence-level status
computed client-side from cited claim statuses; a themed print
variant (§11). Backend: version rows for write-ups.
9. Decks and the slide canvas (with draft preview, style panel, check
report, Keep chart)
Today. Decks exist on the server (slides JSON, kind presenting or
slidedoc, theme, charts; .pptx export with python-pptx). The client
draws slides in HTML that mirror the .pptx (
slide-canvas.tsx
,
container-query sizing, 4 themes: Dark Academia, Newsprint, Ledger,
High contrast), a filmstrip and speaker notes (
draft-preview.tsx
), a
style panel and a check report. Problems: decks can only be seen
inside the AI panel while a presentation_draft candidate is open; no
deck list, no editor, no present mode; "Keep chart" can add a slide to a
deck but says "Decks are made from an AI draft" when none exists
(
keep-chart.tsx line 86); slides are 
role="img" with an aria-label,
so their text is not readable as text by screen readers.
The job. Turn the shown parts of the story into a short deck for an
editor, a funder or a public talk, and present it.
Front and centre. The latest deck's first slide as a thumbnail with "12
slides · passes design checks".
Redesign.
Deck screen, whole-screen: the slide canvas in the middle at the
largest 16:9 that fits; the filmstrip on the bottom edge (the bottom
edge's job is a filmstrip [UX C2.1]); the style panel on the right
only when opened; speaker notes under the slide, foldable.
Every figure on a slide carries a word: shown / estimated /
alleged [VIZ C18]; slides citing unshown claims get a "draft"
corner band.
Checks (existing rules plus 5-5-5 and 7×7 [VIZ C18]) as a small
badge per slide in the filmstrip (
✓ or the number of problems).
Present mode: full screen, black-free dark (theme ground), keys ←
/
→
, a presenter view with notes and the next slide;
"Confidential" pill and revision date on the cover [BRAND A7].
Redesigning the investigation workbench 148 / 252
New deck from: the story tree (one slide per section, claims as
bullets with citation numbers), a collection (§14), or an AI draft
(today's path).
Slides become real text inside a 
figure with a 
screen readers read them.
figcaption 
, so
Scroll over the filmstrip moves through slides; scroll over the
slide does nothing (it is a reading surface).
Innovation.
1. Live link to the case: a slide's numbers re-check when the records
change; a slide whose claim was disputed since the deck was
made shows a "changed since" mark before presenting.
2. Slidedoc 
↔ presenting switch shows both versions side by side
(prose on slide vs prose in notes), using the existing deck kind.
Built on. UX C2.1 (bottom filmstrip), VIZ C18, BRAND A7 (5 Ps,
Confidential pill, print-safe variant), LOOK "Print and export". Today's
code is reused as is for drawing.
Needs. Frontend: deck list/open/edit (routes exist: list, get, patch,
delete, export); backend: create a deck without an AI candidate (no
POST /decks today, only promotion and add-chart). No package.
10. AI drafts that cite sources (AI reasoning panel, record picker, writing
check)
ai-reasoning-panel.tsx 
, 379 lines of one
Today. One dense card (
line JSX): status sentence, module select (Case synthesis,
Hypothesis test, Presentation draft), question, max results, "include
external leads", "Run module", a review queue with a native select
filter, candidate details with raw payload and "What the model was
sent", Accept / Reject with a note, promote to write-up or deck. Good:
every run is citation- and schema-checked server-side and parked for
review; nothing writes to records. Problems:
Developer words: "Case synthesis (TAS module 08)",
"ENABLE_AI_FEATURES is off", "The vendored TAS spec
(backend/app/ai/tas_spec) is not checked out", "candidate " in
status lines, citations shown as 
record_type:record_id 
.
Full card even when AI is off (INVENTORY §12); broken rail
anchor 
#ai-reasoning-panel 
.
Redesigning the investigation workbench
One progress line for a background job ("Running in the
background: …"); no plan, no cost or time estimate, no live view
[AI A11].
The download link skips the token: after promotion, "Download
.docx/.pptx" is a plain 
<a href> to 
while every API call sends 
(
/api/.../export.* (line 370),
authorization: Bearer from memory
api-client.ts line 52). In token mode the download fails; the
backup panel already does it right with 
api.blob 
.
Claims show 
confidence raw, not the grammar.
The job. Let the AI draft, summarise or test a theory over records the
reporter picks, with every sentence traceable, clearly marked as AI
until a person accepts it.
Front and centre. A one-line strip: "AI: 1 draft waiting for review · last
run 14:02" (collapses to "AI off" when off [AI A12]).
149 / 252
Redesign.
"Ask the AI" sheet (from 
⌘
K, a selection, or a story node): 
What
for (three plain choices: "Summarise what the records show",
"Test a theory", "Draft a brief or deck"), 
Which records (record
picker, defaulting to the current selection or collection;
NotebookLM's "select which sources"), 
Before you run (plan
checklist, model, where it runs, time and cost estimate, what
leaves the computer — [AI B1.3, B3]), then Run.
While running: the "Watch the run" view [AI B2] opens on
request; otherwise a progress chip with real steps ("Reading 12
records · Checking citations").
Review: the candidate opens as a write-up-like page: grounded
phrases with solid underline, model wording with dashed plum
underline [AI B1.2], citations as chips, claims with the status
grammar; per-item Keep / Undo plus "Keep n" [AI B1.4]; "can
make mistakes, please check" next to Accept [UX C9]. Raw
payload and prompt stay behind "Show what the model was sent"
for experts.
Promote to a write-up section, a deck, or story-tree nodes (claims
become "not yet shown" claims until a person links evidence).
Downloads use the authenticated 
api.blob path.
Innovation.
1. AI claims enter the tree as hollow nodes: they can help structure
the story but cannot count as shown; the tree's gates ignore them
until evidence is linked.
2. Revision rate shown per case ("You kept 6 of 14 AI claims, edited
4") [AI B1.5] — a quiet measure of how much to trust the drafts.
Built on. AI B1–B3, A5 (grounded vs guessed), A8 (cost and consent);
UX C9; INVENTORY §11 (plum marks, one-line when off). Outside:
NotebookLM (pick sources, hover quote).
Needs. Backend: plan and estimate endpoint; run events stream [AI
B4, ADR for the event table]; plain labels for modules; fix the
download to use the token. No new frontend package.
11. Exports (.docx, .pptx, evidence packs, print variant, investigation export)
Today. Server exports: write-up .docx (
render_writeup_docx
, fixed
light palette, numbered citations, a Sources list naming records),
deck .pptx, investigation export (FtM JSONL), and the backup zip. In
the UI, only the backup has a button; the .docx/.pptx link appears
once after promotion and skips the token (§10). No evidence pack, no
PDF, no print variant of what is on screen.
The job. Give an editor, lawyer or partner a file that stands on its own:
the story, its sources, and proof the sources were kept intact.
Front and centre. Not a tile; an "Export" action in every Act screen's
top bar and in 
⌘
K.
Redesign.
One Export sheet with format cards, each saying what is inside: Write-up for editing (.docx) — text, numbered citations, Sources
list, AI-use note. Write-up for reading (PDF, print variant) — the paper version of the
current theme [LOOK "Print and export"].
Redesigning the investigation workbench 150 / 252
Deck (.pptx, or PDF handout).
Evidence pack (.zip) — the write-up PDF; an exhibits list made
from its citations (Everlaw); each cited passage as a page image
plus text with document title, page, SHA-256 of the original file
and capture time; the Chain of Custody for each claim; the
readiness record (gates, who decided, when); a deletion log for
gaps (Hunchly); and a printed limit: "Hashes show the files have
not changed since they were added here; they do not prove what
happened before." (Hunchly's own limit, reworded).
Case data (FtM JSONL), 
Backup (.jwbackup.zip) — linked, with a
note that a backup is for restoring, not sharing.
Preflight list before any outward export: sentences without a
source, single-source statements, AI paragraphs not yet edited,
Red Flags named without level and innocent explanation, private
individuals named (needs a person's confirm), metadata to strip
from images [UX C6, C9]. Each is a link to fix; the export can still
proceed with "Export as draft" stamped on every page.
Progress with real steps for large packs; the file arrives through
the authenticated blob path.
12. Notes
Today. In the search side panel (
notes on a record or on the investigation; "Add to leads" on a note.
Problems: notes are reachable only from search; Delete has no undo
or confirm; a note on a record is not anchored to a passage (no quote
above it); notes on the investigation and on records are mixed in one
list when no record is chosen; status sentence "They stay on this
machine" is good but shown as body text.
Innovation.
1. Exhibit page links: in the PDF, each citation number links to the
page of its exhibit at the back (Everlaw "PDF with images"), so a
reader with paper or PDF can check every sentence.
2. Pack verifier: a small 
VERIFY.txt and a page in the app ("Check a
pack") that recomputes the hashes of an evidence pack someone
sends back.
Built on. LOOK Part C "Print and export" (light paper variant), UX
C6/C9, BRAND A7 (Confidential pill, revision date), VIZ B ("exports
must stand on their own"). Outside: Everlaw exhibits export, Hunchly
case export and its stated limits.
Needs. Backend: PDF rendering [ADR: e.g. WeasyPrint or headless
Chromium via Playwright]; evidence-pack builder (reuse 
exports.py
lineage checks); per-theme paper palettes for docx/pptx. Open
question for Ony: should packs be signed (a local key, as Hunchly
does), and who keeps the key?
marks-panel.tsx 
): add, edit, delete
The job. Jot thoughts where they arise (on a passage, a party, a flag, a
claim) and find them again.
Front and centre. Not on the dashboard except "3 notes since
yesterday" in the re-entry strip.
Redesign.
Two kinds, as in Hypothesis: 
Annotations (anchored to a quoted
passage; the quote shows above the note) and 
Case notes (on the
Redesigning the investigation workbench
151 / 252
whole case or a record). Tabs with counts in a right-edge Notes
panel available on every screen (
N
).
Selection adder: select text in a document, write-up or flag 
→ a
small bar "Note · Tag · To check · Cite"; the adder sits next to the
selection (Fitts) [UX C1.2].
Notes on the corkboard use the note face (Caveat) only there
[LOOK B4]; elsewhere the UI face.
Delete acts at once with an Undo toast [UX C1.5].
Later, multi-user: "Only me" vs "Team" per note (Hypothesis
groups; INVENTORY §11 "per-user private or shared notes").
Innovation.Note 
→ anything: a note can become a lead, a To-check
question, a claim draft, or a write-up paragraph, keeping a link back;
the note shows where it went.
Built on. UX C1, C2; LOOK B4. Outside: Hypothesis (annotations vs
page notes, quote above note, margin counts, private/group).
Needs. Backend: anchor fields on notes (document, chunk, character
span, quoted text). No package.
13. Tags
Today. Toggle tags on a search result, create a tag with one of 8
swatches (
TAG_SWATCHES
); a network layer shows tag rings. Problems:
tags can be created but not renamed or deleted in the UI (server
supports it, INVENTORY §11); tag text sits on its swatch colour with
no contrast check (
TagChip sets only 
background
); tags are
reachable only from search.
The job. Group records by the reporter's own words ("look again", "for
legal", "harbour deal") across every view.
Front and centre. Not on the dashboard; tags appear as filter chips in
every view's top bar.
Redesign.
Tags in the selection adder and on every record card; type with Tab
or comma to add several (Hypothesis).
Tag manager in the Notes panel: rename, merge, recolour, delete
(with undo), counts.
Tag chips: a small colour dot plus the name in cream on the
surface, so text contrast never depends on the swatch [LOOK B1
never colour alone].
Tag as filter: every view's top bar takes tag chips; the active
selection bar shows them with Clear [UX C3.8].
Innovation.Tag lanes: in the story tree and the timeline, a tag can
become a lane or a highlight layer ("for legal" lights the claims a
lawyer must see).
Built on. UX C3.8, LOOK B1. Outside: Hypothesis tags.
Needs. Frontend only (routes exist). No package.
Redesigning the investigation workbench 152 / 252
14. Collections
Today. Tick collections a record belongs to; add a collection; see item
counts. A collection cannot be opened (no list of its items), renamed
or deleted in the UI; planned uses (chart filter, builder source) are not
built (INVENTORY §11).
The job. Gather a set of records for one purpose (a section of the
story, a partner's briefing, a records request) and use the set
elsewhere.
Front and centre. None on the dashboard; collections show as
shelves in Act.
Redesign.
Shelves: in the Notes panel and in Act, each collection is a
horizontal shelf of record thumbnails (scans as images, parties as
chips) with a count; scroll over a shelf moves along it.
Open a collection whole-screen as a contact sheet [VIZ D9]; drag
to order; remove with undo.
Use a collection as a source: for a deck, an AI draft, a chart, an
evidence pack, or a share card (§15).
Innovation.Collection readiness: a collection used for a briefing
shows the same grammar summary as the story ("8 records · 6 shown
· 1 disputed").
Built on. VIZ D9, UX C5 (scroll-over). INVENTORY §11 (collections as
sources).
Needs. Backend: list items of a collection, rename, delete, order
(some routes exist; ordering does not). No package.
15. Sharing to social: "one finding at every size"
Today. Not built. SYN_BRAND proposes quote, stat and evidence
carousel templates previewed at every size with safe zones and an
"AI Generated" badge [BRAND A8, G].
The job. Publish one well-sourced finding as a card that is correct, fair
and recognisable at every platform size, without the app ever making
a weak finding look strong.
Front and centre. Not a dashboard tile; "Share this finding" on a
shown claim, a Strong or Textbook flag, or a chart.
Redesign.
Share sheet, whole-screen: the same finding drawn at 1:1, 4:5,
9:16 and 16:9 side by side with resolution chips and safe-zone
overlays, light and dark previews [BRAND A8, C10]; edit once, all
update.
Card anatomy (fixed by template, editable text): the finding
sentence; the evidence image (unaltered [LOOK B3]); the status
word and glyph; for a flag, its level chip and one innocent
explanation; a source line ("Harbour Registry, filing 2019-04, p.
4"); "as of" date; the case's short link or QR to a public evidence
page if the reporter publishes one; "AI-written headline" badge
when the AI drafted the text [BRAND A8].
Redesigning the investigation workbench 153 / 252
Hard rules (disabled with a reason, never hidden):
Only Strong or Textbook flags and Supported claims may
headline. Faint flags and not-yet-shown or disputed claims can
appear only as "Open question:" cards, styled as questions
(dashed edge, 
○
).
A flag card needs every innocent explanation marked (§2) before
export.
A private individual's name or face needs a person's confirm and a
reason; the default for people not marked as public figures is
initials.
Image metadata (EXIF/GPS) stripped on export; the sheet says so.
Series look: one template per case so a thread or carousel is
recognisable [BRAND A8, YouTube guide].
Export: PNG per size, a zip of all sizes, alt text written out for
each.
Innovation.
1. Size-aware cutting: in 9:16 the card stacks image over text; in
16:9 the evidence and the source line sit side by side; the source
17. ADRs and open questions
[ADR] Rich-text editor: TipTap (matches the stored format) vs raw
ProseMirror.
[ADR] PDF rendering for print variant and evidence packs:
WeasyPrint vs headless Chromium via Playwright (neither is a
dependency of the app today).
[ADR] Image rendering for share cards: html-to-image in the
browser vs server-side Playwright.
line and status word are never cropped (safe zone is checked, and
the export blocks if they would be).
2. Correction card: if the claim behind a shared card later becomes
disputed, the share history shows it and offers a matching
correction card at the same sizes.
Built on. BRAND A8, C10, D (voice rules: "Say what is shown", "Every
number has a source line", "Respect the accused"), G (social
templates); LOOK B1, B3; VIZ D11 (only Strong or Textbook may
headline a frame). Outside: Integrity Watch's "verify before any
publication" line.
Needs. Rendering cards to PNG: html-to-image or Playwright on the
server [ADR]; a share history table (what, when, which sizes, from
which records). Optional: C2PA content credentials on exported
images [ADR] (BRAND A9 notes Firefly uses them). Open questions
for Ony: should the app post directly (Postiz or platform APIs) or only
export files? Does a public "evidence page" per finding fit the local
first model?
[ADR] Story/readiness data model and AI run events (AI B4).
Optional [ADR] C2PA credentials on exported images.
Ony: unset Faint/Strong rungs — show "not set" or hide? Per-case
thresholds allowed?
Ony: one story per case or several; default gates (right of reply,
legal read) for citizen investigators.
Ony: sign evidence packs with a local key?
Redesigning the investigation workbench
154 / 252
Ony: post to social from the app, or export files only?
155 / 252
Redesigning the investigation workbench
The AI, its live reasoning view, and
the Authority System Suite
Ask the case in four steps. Watch each thought travel through the Authority System
Suite as light, nodes marking good, bad or in between by shape, word and colour.
Trace any thought from input to output. Run controls in plain words.
09
Redesigning the investigation workbench 156 / 252
Watch the run: each thought as light through the router, the app checks and the suite's systems; a trace drawer open on one thought.
Redesigning the investigation workbench 157 / 252
Run controls in Rain Noir: the suite's settings in plain words, locked limits, the editable plan, what leaves the computer.
Redesigning the investigation workbench 158 / 252
0. New research for this area (what I saw, what each gives)
# SOURCE WHAT I SAW WHAT IT GIVES THIS AREA
R1 Langfuse, "Trace Timeline View"
changelog (12 Jun 2024), frame
from its demo video
(
pages/feat-ai
langfuse/img_01.png
); "New
Trace View" changelog (19 Mar
2025, text)
A "Trace Detail" page: chips for session and user, a token chip "1,238 
→ 238 (Σ
1,476)" and a cost chip; below, "Trace Timeline": a tree on the left with typed tags
(TRACE, SPAN, GENERATION) and names (retrieval, prompt-embedding, vector-store,
generation), and on the right a waterfall of bars on a seconds axis, coloured by type.
The 2025 text says a toggle switches tree and timeline, which are "fully on par in
terms of metrics and scores"; observations can be searched by type, ID or name;
scores, comments and metrics can be shown or hidden; colour coding can be turned
on.
The trace drawer's Steps section
(tree 
⇄ timeline), the run lanes in
the transport strip, and the size
chip "words in 
→ out".
R2 TensorFlow Playground
(
pages/feat-ai
tfplay/page.png
)
One screen, left to right: DATA 
→ FEATURES 
→ HIDDEN LAYERS 
→ OUTPUT. A top
bar with reset, play and step buttons, an "Epoch 000,000" counter and the settings as
dropdowns (learning rate, activation, regularisation…). Wires between neurons vary in
thickness and in a two-colour scale; a key reads "Colors shows data, neuron and
weight values". Small handwritten-style notes point at parts: "This is the output from
one neuron. Hover to see it larger." and "The outputs are mixed with varying weights,
shown by the thickness of the lines."
The neural view's left-to-right
reading order, thickness = how
many thoughts pass, the settings
living in one bar above the run, and
first-use notes pointing at parts of
the map.
R3 Hunchly home page (text only) Records, for every page visited, the URL, a timestamp and a hash, with full-page
captures; describes "an automatic, transparent audit trail" that "lets you show every
step". Tagging and report building are manual.
The crawler and lookup log:
capture, hash and time on every
fetch automatically; the reporter
adds meaning.
R4 Apple Support, "Apple
Intelligence Report" (Mac help,
text only)
A report of "requests your Mac has sent to Private Cloud Compute". The window is 15
minutes (default), 7 days, or off. "Export Activity" saves Apple_Intelligence_Report.json
. The page does not list the report's fields.
AI privacy: a "What left this
computer" report with a time
window and an export file.
R5 OpenAI Help, "Deep research
FAQ" (text only)
Before research starts, a "proposed research plan" that "you can review and modify".
You can "follow progress as it runs and interrupt at any time", and adjust "which
sources it can access". Sites can be restricted, or prioritised "but allow full-web
search". The finished report opens full screen with a contents list, sources used and
"an activity history showing how the research progressed".
Research runs: an editable plan
first, interruption, a site list, and the
history kept with the result.
Redesigning the investigation workbench 159 / 252
#
SOURCE
R6 Maltego glossary (text only)
R7 Bellingcat, "An Investigative
Guide to LinkedIn" (2019, text
only)
R8 n8n docs, "Debug executions"
(text only)
Captures kept: 
WHAT I SAW
"A Transform is a piece of code that searches for information related to an Entity on
the graph"; Entity in, related Entities out. "Machines are the Maltego equivalent of
macros", chaining transforms. Transforms run on a server hosted by Maltego or a data
partner, or on a private server you buy. The page does not say what data is sent.
LinkedIn shows a profile's recent viewers unless the viewer uses private mode
("Anonymous LinkedIn Member"); Premium users see viewers from the past 90 days
but not those in private mode.
A failed past run offers "Debug in editor"; a successful one "Copy to editor"; either
copies the run's data into the workflow and pins it to the first node.
pages/feat-ai-langfuse/img_01.png 
, 
pages/feat
images).
ai-tfplay/page.png 
. Other pages were read as text (no useful
1. The AI reasoning panel ("Ask the case")
Today. One shadcn Card titled "AI reasoning & presentations"
(
frontend/components/ai-reasoning-panel.tsx 
, 379 lines).
WHAT IT GIVES THIS AREA
The router: every lookup is one
entity in, findings out; a research
run is a named recipe of lookups;
each lookup must say 
whose server
it runs on and what is sent, which
Maltego's page does not.
Lookups can tip off the subject.
Every outside source gets a "who
could see this" line.
"Run again from this step with the
same packet" in the trace drawer
and research pages.
A run is a background job polled every 2 s; the only progress text is
"Queued…" then "Running in the background: …", fed by one
describeAiStatus() (lines 82–92),
A status sentence from 
written in developer words ("ENABLE_AI_FEATURES is off",
"AI_PROVIDER must be anthropic, openai or ollama", "vendored
TAS spec (backend/app/ai/tas_spec) is not checked out").
A module select (Case synthesis / Hypothesis test / Presentation
draft), a question box, a "max results" number box, an "include
external leads" checkbox, a working-theory box, and "Run
module" (lines 287–300).
report(10, "The model is working on it") call
(
backend/app/jobs/handlers.py:315 
).
Problems: the card takes full size even when AI is off (INV §12);
there is no 
id="ai-reasoning-panel" 
, so the rail's "AI drafts"
frontend/lib/stages.ts 
); mixed
anchor is broken (INV §12, 
native and Radix selects and inline styles (INV §12); the panel
never sends 
severity_floor or 
source_tier_floor (SUITE §5.2),
so the run controls exist on the API only; "max results" and
"include external leads" are unexplained knobs.
Redesigning the investigation workbench
160 / 252
The job. Ask the case a question in plain words and get back
proposals that point at the records they rest on, without having to
know which "module" does what.
Front and centre (dashboard). One line: the latest run's state and
what waits ("Case synthesis · 14 claims · 9 wait for you"), or, when AI
is off, a single quiet line "AI is off — the workbench works without it ·
Turn on".
Redesign.
Dashboard tile. A slim strip inside the Act module, not a card.
States: off (one line, SYN_AI A12 decided), ready (a question field
with ghost text "Ask the case…"), running (a breathing ring and
elapsed time, never a fake percentage), done (counts by verdict
shape, SYN_LOOK B1). Clicking the strip opens "Ask the case"
whole-screen (SYN_UX D(b)).
Whole-screen "Ask the case". Four steps in a header stepper: 1 Ask
· 2 Instructions & plan · 3 Watch · 4 Review (AI_2 header). Step 1
is one large question field and three intent cards with plain names
that pick the module for the reporter:
"What does the evidence show?" 
→ case synthesis (TAS 08).
"Test a theory against the evidence" 
→ hypothesis test (TAS 06);
the working-theory box appears only here.
"Draft a brief or deck from records I pick" 
→ presentation draft
(app-local). The module name stays visible as a small mono tag
("TAS 08"), for people who know the suite.
"Max results" becomes a packet preview in step 2 (paper
thumbnails of the records that will go in, with counts by kind and
the records left out by the tier floor; AI_2 middle column).
"Include external leads" becomes a visible chip in the packet ("+ 4
outside findings, not yet reviewed") that can be removed.
Hover: hovering a packet thumbnail shows the passage; scroll over
the packet strip moves through it (SYN_VIZ B scroll rule: lists
move).
Motion: tile 
→ whole-screen with 
motion.transform (450 ms) as
a shared-element move (SYN_UX C4 rule 1); stepper steps slide
along the x axis (rule 3). Reduced motion: 120 ms crossfade.
States: off (one line + "Turn on" link to AI settings); not ready (the
reason in plain words: "No model chosen. Pick one in AI settings",
never env var names; the env names go in a "Details for whoever
runs this computer" fold); running (step 3 opens the live view);
throttled (the governor's 429, 
backend/app/ai/governor.py
,
shown as "Two runs are already going on this computer. Try again
in 5 s", with a countdown); failed (the run's own words: "The
answer was cut off at the length limit" for truncation); very large
(packet over 100 records: "the model sees 100; these 37 were left
out, by rank" with the list).
Keyboard: 
⌘
K "Ask the case…"; 
1–3 pick an intent; 
⌘↵ runs.
Screen reader: the stepper is a 
nav with 
aria-current="step"
;
status lines are 
role="status"
.
Certainty: nothing here shows certainty yet; the "AI can be wrong.
Every result waits for you" line sits by the Run button (SYN_AI A8
industry minimum; SYN_UX C9).
Innovation.
1. Suggested questions from the case's own gaps. The strip offers
two questions built from open 
GAP- records and "one fact away"
Red Flag gaps (INV §11), each marked with where it came from.
The reporter's question is never rewritten.
2. Revision-rate badge. Per investigation: "AI proposals: 31
accepted, 12 corrected, 9 rejected" (SYN_AI A4, B1.5: measure
revision rate, not volume). Clicking opens the rejected ones with
Redesigning the investigation workbench 161 / 252
reasons, which is the best way to learn what the model gets wrong
on this case.
Built on. SYN_AI A3 (plan first), A8 (disclosure), A12 (one line when
off); SYN_UX C3, C4, C6, D(b); SYN_LOOK B1; [R5] plan before run.
Needs. Frontend only for the strip and stepper. Backend: return the
governor's 
retry_after_seconds in the 429 body (it is in the
exception already). Open question for Ony: should "Ask the case" be
the AI's only entry, or should every chart and record keep its own "Ask
about this" (which would pre-fill the question and the packet)?
2. AI candidates: the review queue and one candidate
Today. Inside the same card (
ai-reasoning-panel.tsx lines 302
372):
Queue: a native select (all / proposed / accepted / rejected),
Refresh, and one box per candidate with module, status, "n
citation(s) checked", date and an Open button.
One candidate: question, summary, scope, and lists of claims
(
classification · confidence
), hypotheses (
diagnostic_value
,
falsifiers, missing records), conflicts (
CONF- ids, type with
underscores), gaps as free strings; a fold with the raw JSON
payload; a fold "What the model was sent" with the full system
and user prompts.
Review: a note box, "Accept as trusted analysis" or "Reject". After
accepting a draft: promote to write-up or deck, with a title and a
deck kind (lines 357–371).
Problems: raw JSON and prompts shown to reporters (INV §12
"raw ids and internal values leak"); 
confidence is
LOW/MEDIUM/HIGH only, which the suite says must never cross a
boundary (SUITE §5.3.3); no 
confidence_term
, no UNRESOLVED_CONFLICT
, 
CONF- instead of 
CFLT- (SUITE §5.3);
accepting is all-or-nothing for a candidate of 14 claims; AI
candidates are one of the eight separate places where deciding
happens (INV §12); decks and write-ups made by "Promote"
cannot be opened (INV §12).
The job. Decide, claim by claim, what the model got right, see why
each claim is or is not trusted, and keep the reason.
Front and centre. The count waiting ("9 AI proposals wait for you")
feeding the dashboard's centre "next decision" card (SYN_UX C3.2),
and, when one is next, that claim with its verdict shape.
Redesign.
Where. AI candidates join the single "Findings to review" inbox
(INV §11 planned) as one filter chip ("AI"), so deciding happens in
one place. The candidate itself opens whole-screen as a review
sheet: claims list on the left (one row each: verdict shape,
classification word, the claim in the reading face, its confidence
term), the selected claim's evidence on the right (the cited
passages side by side, read in the calm reading surface,
SYN_LOOK B5).
Per-claim decisions. Each row has Keep / Correct / Reject (with a
reason chip: "source does not say it", "overstated", "wrong party",
"duplicate") and the set has "Apply n" (SYN_AI A4: Cursor's Keep
All, Make Local's Discard/Apply; B1.4). Correct opens the claim
Redesigning the investigation workbench 162 / 252
text for editing; the edit is stored as the reporter's, the model's
version kept beside it.
Grounded vs guessed. In every claim, words that trace to a cited
passage get a solid cream underline; model wording gets a dashed
plum underline (SYN_AI A5, B1.2; shown in AI_1's drawer, section
3). Hover either to see the passage or "no passage says this".
Confidence. Show 
confidence_term with its band ("likely (55
80%)"), and when the weakest-link rule caps it, show both:
"model: likely 
→ capped: roughly even chance (45–55%)" (SUITE
§2.5 D2; AI_1 drawer). Old candidates without the term show "not
given (old format)", never a guess (SUITE §6.4.1). What the model was sent moves into the trace drawer (feature 4)
as the Input section, with records as tiles; the raw payload sits in a
"For the record" fold labelled as such, never on the main sheet.
Promote. After acceptance: "Make a write-up" / "Make a deck"
open the made document (fixing the "cannot be opened" gap); the
AI-use note "Drafted by AI on 10 Oct · 3 sentences edited by you"
is added automatically (SYN_UX C9, PACED in SYN_UX A8).
Hover and scroll: scroll over the claims list moves the lit row
(SYN_VIZ B grid/list rule); the evidence pane follows. Hover a
claim's party chip lights that party in every chart (the existing
shared 
pointedParty
, INV §2).
Motion: a decided row slides out of "waiting" with motion.feedback 160 ms, undo toast for 8 s (SYN_UX C1.5 undo
over confirm); no animation of the evidence text (SYN_UX C4 rule
5).
States: empty ("No AI proposals. Ask the case"), loading (skeleton
rows, not "Loading…", INV §12), error per claim (a claim whose
citation is no longer in the case: "record deleted since" in the
dashed not-yet-shown style), very large (200 claims: grouped by
verdict, problems first, andon order, SYN_AI A9).
Keyboard: 
J/K move, 
A keep, 
E correct, 
R reject with reason, ⌘↵ apply set; same keys as document review (INV §9.15). Screen
reader: each row reads "Claim 9, attributed but uncorroborated,
allegation, roughly even chance, 2 sources".
Certainty and Red Flags: verdict shapes from SYN_AI B2 inside
the SYN_LOOK B1 grammar; a claim about a party with a Textbook
Red Flag shows the flag chip, but the claim's own status is never
coloured by the flag (SYN_UX C9: polish must not make weak
evidence look strong).
Innovation.
1. "Disagree with the model" as data. Every rejection reason feeds
the revision-rate badge (feature 1) and the Judgement ledger, so
later the reporter can see whether claims the model called "likely"
held up (SUITE §2.6 Judgement ledger, scored as a Brier score).
2. Side-by-side with the case. A toggle shows, for each AI claim, the
closest existing claim in the case and whether they agree, so
duplicates are merged rather than accepted twice.
Built on. SYN_AI A4, A5, B1; SUITE §5.3, §6.2, §6.4; SYN_UX C1, C3,
C9; SYN_VIZ B, E (the "says it?" check is exactly the dashed
underline); INV §11 Findings inbox.
Needs. Backend: per-claim review (today review is per candidate; review_ai_analysis_candidate
), stored as child decisions on the
candidate. Schema changes from SUITE §6.2 first (
confidence_term
, UNRESOLVED_CONFLICT
, 
CFLT
, hypothesis 
viable
/
kind
). Frontend
must render old and new shapes. Open question: may a reporter's
correction be promoted while the model's original is shown struck
Redesigning the investigation workbench 163 / 252
through, or should a corrected claim become a fully reporter-owned
claim?
3. Record picker and draft preview (presentation drafts)
Today.
frontend/components/presentation/record-picker.tsx
(search records, add/remove, "Add all", chips, Clear) and 
draft
preview.tsx (tabs Slides / Brief / Sources; citation chips open Chain
of Custody), plus 
WritingReport (writing-check findings, lines 62
72). The slide canvas, style panel and check report belong to the
write-ups and decks area and are not redesigned here. Problems: the
picker is a search list with no view of what is already chosen by kind;
the writing report is a 
<details> list.
The job. Pick exactly the records a brief may use, then see where
every sentence of the draft came from before it goes to an editor.
Front and centre. Nothing on the dashboard of its own; drafts appear
in the review inbox like other candidates.
Redesign.
The picker becomes the packet tray in step 2 of "Ask the case": a
filmstrip of picked records as paper and photo thumbnails (AI_2
packet row; SYN_LOOK B3 light documents get a thin dark
outline), filled from search, from a collection, or by dragging a
node off a chart. Counts by kind; "Add all from collection".
The draft preview keeps its three tabs; each sentence carries the
grounded/guessed underline; removed sentences (quote, number
or writing checks, 
quote_check.py
, 
value_check.py
, writing_check.py
) are listed under the draft with the check that
removed them (research-design §3.4 "Mistakes").
Writing findings show inline as margin marks beside the sentence,
not as a separate list.
States, keys and screen reader as in feature 2.
Innovation."What this draft cannot say." Beside the draft, a short list
of claims in the case that the picked records do 
not support, so the
reporter sees what would need more records before it can be written.
Built on. SYN_AI A5; SYN_UX C9; research-design §3.4; SYN_LOOK
B3.
Needs. No backend change for the tray. The "cannot say" list needs a
server query of claims whose evidence lies outside the picked set
(small).
4. "Watch the run": the live neural-paths view (mockup AI_1)
Today. Does not exist. The app runs TAS modules 08 and 06 as one
non-streaming completion (
backend/app/ai/llm_client.py:68
),
reports progress once, and has no SSE or WebSocket endpoint (SUITE
§7.4). The suite's own Rigor Manager (
ass/viewer/index.html
) draws
Redesigning the investigation workbench 164 / 252
a doctrine map in SVG (router on top, pipeline row, support band,
then Checkpoints · Paper Trail · Judgement ledger · Audit), at most 5
module chips per system (line 290), and a 650 ms "traveller" dot from
the previous node to the next, red for BLOCK and green for WRITE
(lines 298–305, 324). Its feed sits beside the map. It removes
travellers under reduced motion (line 303). It has a "Play demo"
button that replays a sample turn marked "demo — not a recorded
session" (lines 362–395). Its event log has 1,256 lines, none of kinds
ROUTE/LOAD/RULE/CHECK/BLOCK/FLAG (SUITE §2.6).
The job. Let the reporter see what the AI did, in order, at a glance:
where it went in the Authority System Suite, what the app's checks
passed or stopped, and which thoughts need them, and open any
thought from its input to its output.
Front and centre. On the dashboard, while a run is live: a 1-line
miniature of the pipeline (five small column dots that light as they are
routed, a model ring, and a counter of problems) inside the AI strip.
Clicking it opens the full view. After a run: the four tallies (
✓ 
◆ 
✕ 
○
) of
its result.
Redesign (AI_1).
Layout, one screen, left to right like TensorFlow Playground's DATA
→
FEATURES 
→ LAYERS 
→ OUTPUT [R2]: 
INPUT (question +
CP-02, CP-03 hexagons); CP-01 sits under TAS. Bottom: the
transport strip (transport, run lanes, ledgers).
Systems not routed stay drawn at a third of their opacity with "not
triggered", so the whole suite is always visible (SYN_AI B2).
Each column shows at most 5 module chips at full size, the rest
folded into "+ n modules" (the suite viewer's rule).
Nodes, icons and shapes. As SYN_AI B2's table: router diamond,
model circle with a slow breathing ring, enforced app checks as
double-outline squares (the strongest frame, because they are
the only enforced parts, SUITE §1.2 "Honest limits"), checkpoints
as hexagons, the review node as a person ring. Icons are lucide
(installed). Every node has an icon and a word.
Lights. One light per thought (a chain of events joined by 
parent 
).
A light is a soft radial dot with a short glowing tail travelling along
the wire (SVG radial gradient + Gaussian-blur glow in the mockup;
Canvas 2D in the build, SYN_AI B5).
Streams: when more than 12 lights share a wire, they merge into
one thick stream with a count ("14 claims") that splits by verdict at
the next node, like a Sankey that fires (SYN_AI B2.2). Thickness =
how many thoughts pass, as in [R2]'s weighted wires.
packet tiles) → ROUTER + MODEL → APP CHECKS → RAS · TAS ·
QAS · LAS · DAS → OUTPUT (candidate + "Your review")
I moved the app checks to 
before the pipeline columns. SYN_AI
B2 drew them after DAS, but in the real run order the shape and
citation checks (SUITE §7.3 rows 7–8) come before the per-claim
rules and boundaries (rows 10–14), so a light reads left to right
without doubling back.
Above: the umbrella band (Boundaries · Controls with a flag
counter · Protected layers). Below: the support band (EGS, EHS,
Redesigning the investigation workbench
No fake thoughts: while the model is writing, only the model ring
breathes and a timer runs, with the words "nothing is shown while
it writes". Lights burst out of the model only when the reply is
parsed, each marked as 
model says (dashed plum) until a check
confirms it (SUITE §7.4; FABRICATION_CONTROLS via SUITE
§2.6).
Verdicts at nodes (never colour alone). good = filled circle with 
✓
;
in between = diamond, hatched; stopped = square with a cross, in
the Textbook oxblood fill with a bright edge, plus 3–4 short sparks
that fade and a 
⊘ mark that stays; a finding (gap, negative search) =
165 / 252
hollow ring; model says, not checked = dashed outline in plum.
Words come from the suite's closed lists in sentence case
("Attributed but uncorroborated"). A legend row stays on screen
(SYN_VIZ A1: the key stays on screen). Colours come from the
active theme's status tokens (SYN_LOOK B1), so the view works
in all five themes.
Andon. Good lights travel dimmer with short tails; stopped and
flagged events get full brightness, sparks and a mark that stays;
the header shows "2 problems · N" and 
N jumps to the next one
(SYN_AI A9, B2.1). The B6 membrane that stopped a
recommendation glows in the bad colour for the rest of the run
(AI_1).
Focus a thought. Click a light, a chip or a claim: everything else
dims to about 35%, the chosen path stays lit from input tile to
output, and the trace drawer opens (feature 5). The 15% SYN_AI
proposed was too dark to keep the map readable in the mockup;
35% kept context. Hover. Hover a node: tally ring segments expand into counts ("TAS
02 · 5 verified · 6 in between · 2 contradicted"). Hover a wire: its
count and the kinds of event on it. First use: TensorFlow-style
notes point at the model ring and a stream ("Lights leave the
model only after it has answered") [R2]. Scroll. The wheel zooms the map (Ctrl+wheel) and scrolls the run
lanes in time when over the strip (SYN_VIZ B scroll rule: time
aware views move time). The page never scrolls.
Transport strip. Pause, speed (0.25×–4×), Next problem, Live; a
lane per part (Router, Model, Checks, each system, Write, You)
with ticks shaped by verdict and a playhead (SYN_AI B2 scrubber;
[R1] waterfall lanes). The model lane draws one long bar for the
call, as Langfuse draws a GENERATION span [R1]. Live pause
buffers new events with "23 new". A replay is labelled "Replay of
run · 10 Oct 14:02".
Ledgers. Three slots on the right of the strip: Run record (append
only, hashed; count of events), Judgement ledger (outcomes
recorded later), Final audit ("tas/10 not run here" until the app
runs it). I renamed the suite viewer's "Paper Trail" slot to "Run
record" to avoid a clash with the app's own Paper Trail panel
(feature 10); see Needs.
Motion. This is the app's one orchestrated motion moment
(SYN_AI B5 "theme fit"; SYN_AI A9 frontend-design rule). motion.trace 300–600 ms per wire (SYN_UX C4). No node
flashes more than 3 times a second; each flash is one rise and fall
(PORTFOLIO_COMPONENTS §1.4). States. Empty (no runs: a "Play a sample run" button that replays a
demo run labelled "sample — not a real run", as the suite viewer
does); loading (the static map draws first, lights start when events
arrive); disconnected (the live pill turns to "reconnecting ·
catching up from event 23", and the client resumes with 
Last
Event-ID
); error (a failed run ends with a stopped light at the step
that failed and its plain message); very large (80 lights at most; the
rest queue and the clock speeds up, header "live · 1.6× to catch
up"; streams instead of swarms; SYN_AI B2.3). Keyboard and screen reader. Every node is focusable
(
role="button"
, 
tabindex
); arrow keys move along the pipeline;
Enter opens the trace; 
N next problem; 
L swaps the map for a
plain ordered log with the same information, which is also the
screen-reader view, announced politely at summary level only; Space pause. Accessible names read tallies ("TAS source
verification, 5 verified, 6 in between, 2 contradicted").
Reduced motion and "Calm". No travelling lights; nodes change
state with a 0 ms swap; streams become static count badges; the
Redesigning the investigation workbench 166 / 252
log and lanes carry the order (SYN_AI B2 accessibility; SYN_UX
C4).
Theme. In Rain Noir the lights read as out-of-focus highlights on a
wet board; an optional WebGL bloom only there (SYN_AI B5.3,
[ADR]). In Indigo Clarity the view defaults to Calm.
Innovation.
1. "Where it would have gone." Systems the router did 
not trigger
show, on hover, the one sentence that would have triggered them
("LAS: if the answer had drawn a conclusion beyond a source"),
taken from the router trigger table (SUITE §1.1). The reporter
learns the suite by watching it, and sees what was 
not checked.
2. Split lights at the crosswalk. A PARTIALLY VERIFIED claim visibly
splits in two at B4 (one VERIFIED, one UNVERIFIED), the only
boundary where the suite forbids rounding (SUITE §2.3 B4). This
turns a rule that is hard to explain into something seen.
3. Compare two runs. Two runs of the same question (before and
after new documents, or with different instructions) can be
overlaid: wires that changed verdict glow, unchanged ones stay
dim. Fits the Judgement ledger idea: what changed, and why.
Built on. SYN_AI A2, A9, A10, A11, B2, B4, B5; SUITE §2, §7; ass/viewer/index.html lines 239–327, 362–395; SYN_UX C4, C7;
SYN_LOOK B1; [R1], [R2].
Needs.
Backend: the event record and stream from SYN_AI B4 / SUITE
§7.2–7.3, emitted from 
run_reasoning_module() at each existing
step (validate, governor, retrieval, model start/end, schema,
citation, quote/chart/writing, candidate write, review). Server
side 
status mapping tables. 
parent on every event.
[ADR] The append-only 
ai_run_events table (data model,
migrations, backup/export).
Stream: 
GET /api/ai-runs/{run_id}/events as 
text/event
stream with FastAPI's built-in 
StreamingResponse (no package);
poll 
?after=n fallback. 
sse-starlette would be [ADR].
Frontend: SVG structure + one Canvas 2D light layer + zustand (all
present); no new package for version one (SYN_AI B5). WebGL
bloom in Rain Noir: [ADR].
Open questions for Ony: (a) The clash of names: the suite calls its
ledger "Paper Trail"; the app's glossary gives "Paper Trail" to the
sources panel (
catalogue/glossary/app.yaml
, line 30). I propose
"Run record" in the app for the suite's trail. (b) Should the suite's
full pipeline be drawn even though only TAS runs inside the app
today, or only what runs? I drew all, dimmed, so nothing is hidden.
5. The trace drawer: any thought, input to output
Today. Does not exist for AI. The closest are the candidate's "What
the model was sent" fold (raw prompts) and the Chain of Custody
drawer for records (
frontend/features/provenance/provenance
panel.tsx
), which is read-only and opens with no slide or focus trap
(INV §12).
The job. For one claim, hypothesis or blocked step, answer "what
went in, what happened, what came out, and what record did it
Redesigning the investigation workbench 167 / 252
leave?", so the reporter can trust it, correct it or cite it.
Front and centre. Not on the dashboard; one click from any AI
written sentence anywhere (SYN_UX C9: every AI sentence one click
from its source).
Redesign (AI_1 right side).
A right-edge drawer about 420 px wide over the live view, the
review sheet or a draft; the map stays visible with the path lit
(SYN_UX C2: the right edge is for the selected item). Native <dialog> semantics with focus trap and Esc (SYN_UX C7).
Header: the thought in plain words, its verdict chip in the status
grammar, the AI tag with its id (
CLM-0009
).
1 Input: the question verbatim (reading face), the brief version,
the instructions in force as chips (tier floor D, severity ALL, devil's
advocate on, events summary), the packet records it used as tiles
with id and page or paragraph; hovering a tile shows the passage,
clicking opens it side by side.
2 Steps: the chain walked through 
parent
, one row each: event
number, verdict shape, what happened in a short sentence, who
did it (app · enforced, model, you) and the rule anchor (
tas/02
, SY-036
, 
B6
), with the verdict word on the right. The current step
is highlighted. A tree 
⇄ timeline toggle as in Langfuse [R1] shows
the same rows as bars on a time axis when timing matters (model
41 s). Search the steps by kind, id or rule [R1].
3 Output: the claim with grounded/guessed underlines and a key
for them; class; confidence (model's term 
→ capped term); what
was removed and why.
4 Ledger: the records this thought produced or touched (
CLM
, GAP
, 
AIC
), and the Judgement ledger outcome when one exists
("no outcome yet").
Footer: Accept · Reject with reason · To check · Copy citation. Plus
a "Run again from this step" item in More, which replays the run
from that event with the same packet and new instructions, like
n8n's "Debug in editor" [R8]; the new run is a new record, the old
one kept.
Motion: slides in from the right, 
motion.reveal 240 ms; steps
never animate their text.
States: loading (skeleton rows), a step whose record has since
been deleted ("record removed on 12 Oct by you"), a self
reported step with no check yet (dashed plum, "not checked"), an
old candidate without events ("This run was made before steps
were recorded. Showing what was stored: question, packet,
reply.").
Keyboard: 
T on any focused AI sentence opens its trace; ↑/↓
move through steps; Enter on a step lights it on the map. Screen
reader: sections are headed landmarks; each step reads "Step 16,
source verification, attributed but uncorroborated, by the app's
rule tas 02".
Innovation.
1. Weakest link drawn. The confidence row shows a small chain of
links, one per step that bears on it, with the weakest one marked;
the cap is explained by pointing at it ("capped by step 16: one
source"). (SUITE §2.5 D2.)
2. Copy citation carries the trace. "Copy citation" puts the passage,
record id and a short link to this trace on the clipboard, so a write
up can always link back.
Built on. SYN_AI B2 "Trace drawer"; SUITE §2.6, §7.2; SYN_UX C2,
C7, C9; [R1], [R8].
Redesigning the investigation workbench 168 / 252
Needs. The same event store as feature 4. Open question for Ony:
should "Copy citation" links work outside the app (in a .docx export),
which needs a stable local URL scheme?
6. Run controls: the operating instructions (mockup AI_2)
Today. The API accepts 
severity_floor (ALL/MATERIAL/BLOCKING)
and 
source_tier_floor (default C, A–F) on the two TAS endpoints
(
backend/app/schemas/api.py:286-309
; 
reasoning.py 224–263), but
the UI sends neither (SUITE §5.2). Unknown flags are a 400
(
normalize_control_flags
). The default C contradicts the suite (D,
never below D; Tier C never counts) and the prompt wording
overstates what one source can carry (SUITE §5.3.1). The suite also
defines 
show_reasoning_chain
, 
auto_run_adversarial_gate
, visual_release_mode
, umbrella flags, commands, overlays (none
shipped) and five rejected flags (SUITE §3; 
ass/CONTROL_SURFACE.md
§4; 
ass/systems/tas/CORE/CONTROL_SURFACE.md §2, §4).
The job. Before a run, set how strict the AI must be and what it may
do on its own, see what will run and what will leave the computer,
then run, with every change written down.
Front and centre. Nothing on the dashboard except "2 changed from
this case's defaults" on the AI strip when a profile has overrides.
Redesign (AI_2). Step 2 of "Ask the case", and the same panel as a
left-edge drawer inside the live view (SYN_AI B3). Three columns on
one screen:
Left: Operating instructions, grouped, in plain words with the
suite flag name in the tooltip (not on screen; it was noise in the
first draft of the mockup):
How strict
: "Lowest source tier that counts" A / B / C / D (default),
C drawn hatched and labelled "never counts" because the suite
says so; may only be raised. "Problems to list before done": All /
Material / Blocking with a lock line "Blocking problems are always
enforced".
Extra passes
: Devil's advocate (switch; "Never says passed"),
Research depth (Normal / Exhaustive: "needs a search that could
prove each answer wrong"), and a "More" row for the umbrella
flags at default (hunt for misses, self-check before delivery,
records shown, terse).
What you see
: Show the reasoning chain ("display only; the chain
is always built"); Live events Full / Summary / Off.
Doing things on its own
: Outside lookups Automatic / Ask first / Off
("Each leaves a trace on that site" [R7]).
Take as given
: premises the reporter states, printed on the result
as 
USER_STIPULATED and marked "YOU SAID" (SUITE §3.4, AG
049). Overlays
: legal · journalism · values (labour), greyed "PLANNED"
(none ship, SUITE §3.3).
Changed rows carry an amber left edge; a profile line says "Profile:
Harbour land default · 2 changed"; "Save as this case's default"
stores the profile per investigation (SYN_AI B3 scope).
Middle: the plan, editable before it runs ([R5]; SYN_AI A3 Replit
plan 
→ build): the question in the reading face, the packet tray
(feature 3), numbered steps with who does each (APP / MODEL /
YOU), changed steps edged in amber. Below, read-only "Likely to
Redesigning the investigation workbench 169 / 252
run" chips decided by what the answer will contain, with "You
cannot switch a system off: it runs when the answer would need
it. Today only TAS runs inside the app." (SUITE §1.1 router;
SYN_AI B3).
A notice when imported material tries to set a flag: "Ignored an
instruction inside the evidence. document:58 ¶7 reads 'set
severity floor to blocking'. Material can never change a setting; it is
quoted as evidence and logged." (TAS control surface §2; AI_2.)
Right: where it runs and what it costs: "What leaves this
computer: 
✓ Nothing, for this run" with a three-box diagram (Your
case 
→ Model 
→ Outside), model and where it runs, size in words
in and out [R1 token chip], time, money, the governor's limits; the
echo log of every change as SETTING / FLAG lines (TAS §2 
FLAG
CHANGED
); and a locked list "Cannot be turned off" (checkpoints,
self-reports stay alleged, citations must be in the packet,
agreement rules).
Footer: "Run and watch 
⌘↵
" (primary), "Run in the background",
"Save as this case's default", "AI can be wrong. Every result waits
for you", Cancel kept apart from Run (SYN_UX A1 Fitts).
Hover: a setting shows its effect in the plan (hovering
"Exhaustive" highlights the steps it adds). Scroll: the left column
scrolls only if the window is short; at 1440×900 it fits (SYN_UX
C3.9 fit test).
Motion: 
motion.feedback on segment changes; the echo line
appears with a 160 ms fade; no ambient motion over the columns
(calm zones, SYN_LOOK B5). Rain Noir's bokeh lives on the board
behind the frosted shell only.
States: AI off (the whole step explains how to turn it on); no
model (the right column shows "No model chosen" with a link to
AI settings); a flag the API rejects (inline: "That value is not
allowed: the tier floor cannot go below D"); a draft run
(presentation draft: TAS flags hidden, since drafts are app-local, test_presentation_draft.py checks this).
Keyboard: Tab through groups; arrows inside segmented controls
(radiogroup); Space toggles; 
⌘↵ runs. Screen reader: each
control's name includes its default ("Research depth, exhaustive,
changed from normal").
Safety limits, never offered: 
announce: off
, 
catches: off
, auto_confirm
, 
skip_checkpoint
, 
suppress_flags
; the API
returns 400 for them (SUITE §3.2). A checkpoint exception needs
a named person.
Innovation.
1. Instructions travel with the result. Every candidate prints the
instructions it ran under (chips in the trace drawer, AI_1), so two
results made under different strictness are never compared blind.
2. Profiles per case, with a reason. Saving a default asks for one line
("why stricter for this case?"), kept in the run record, the same
way the suite asks for a reason on flips (SUITE §2.6 FLIP-).
Built on. SYN_AI A3, A7, A8, B3; SUITE §3, §5.3, §6.2; ass/CONTROL_SURFACE.md
; TAS CONTROL_SURFACE §2, §4; [R2]
settings bar above the run; [R5] editable plan; [R7].
Needs. Backend: the contract fixes in SUITE §6.2 (tier default D,
allowed A–D, prompt wording); accept the extra flags
(
auto_run_adversarial_gate
, 
show_reasoning_chain
, visual_release_mode
, 
research_depth
, 
events
) and premises; a
run-profile per investigation (a JSON column or settings table; small
migration). Echo every change as a SETTING event. Open questions
for Ony: (a) the default for outside lookups: the decided global default
is automatic (INV §8), but research automation's safest default is ask
first; the mockup uses ask first for runs, which needs Ony's word; (b)
Redesigning the investigation workbench 170 / 252
should Tier C be shown at all, since raising the floor to C has no effect
beyond D (SUITE §6.2.2)?
7. Research runs and the research trail
Today. Planned, not built. Designed in 
design.md (5 Oct) and prototyped in 
docs/discovery/research
research-prototype.html 
:
"Research in connection with…" on any chart, a dashed plum line
while it runs, steps in a side panel, pages for runs, one run's timeline,
everywhere it searched, contradictions, mistakes and corrections,
and waiting for your decision; hash-chained append-only steps;
corrections that never overwrite (research-design R1–R12, §3.1
3.6). Problems in the plan: its assumption A4 "link automatically at
0.90 or above" conflicts with the later decision "every link waits for a
person" (INV §11); "the meaning of research run" is still an open
question (INV §11).
The job. Ask the app to look into a connection (between two parties,
or around one), then see where it looked, what it found, what
disagrees and what it got wrong, and decide what to keep.
Front and centre. On the dashboard: running research as dashed
plum lines on the mini network, and "2 for you" from finished runs in
the next-decision card.
Redesign.
Start. From any chart: point at a party 
→ "Research in connection
with…" 
→ click a second party (research-design R1–R2). The chart
dims everything except reachable parties; Esc cancels. Keyboard:
Tab through parties, Enter to pick.
Plan first [R5]: a small sheet with the plan (sources picked by the
router, those that wait, those skipped and why), the lookup mode
and what each outside source will be sent. Edit or Run. In "ask
first" mode, this sheet 
is the ask.
While running. The pair's dashed plum line on the chart; the right
drawer shows live steps. The same events feed the neural view: a
research run draws the router fanning out to source nodes (one
per adapter) instead of suite columns, then matches, facts,
contradictions and conclusion, so research and reasoning share
one visual language. Interrupt any time ([R5]).
Research pages (whole-screen, tabs at the top edge): Run (step
timeline in the Langfuse tree/timeline form [R1]), Searched (every
request, inside or outside, with left-the-machine or not, cache hit,
licence), Contradictions (two values side by side, both kept,
"make a lead"), Mistakes and corrections (removed AI sentences,
reversed matches, rule versions since fixed, "made with
person_match v1, since fixed in v2", research-design §3.4),
Waiting for you.
Corrections. A reversed step shows struck through with the
correction step beside it; nothing is overwritten (R11).
Certainty: match scores shown as numbers with the field
agreements that make them; no automatic linking at any score;
every match waits (INV §11 decision, replacing A4).
States: no sources available (keys missing) lists what would be
needed; partial (
finished_with_gaps 
) names the failed sources;
cancelled; failed with steps kept; very large (hundreds of
searches: grouped by source with counts).
Redesigning the investigation workbench
171 / 252
Motion: the dashed line's dash travels slowly while running
(
motion.ambient range only while live; still under reduced
motion).
Innovation.
1. Recipes. A finished run can be saved as a recipe ("company +
director check, UK") and run on other parties, like Maltego
Machines chaining transforms [R6], with the recipe's steps visible
and versioned.
2. "What would change my mind." Each conclusion lists the one
search or record that would most change it (from the gaps and the
8. Router, lookups and crawler
Today. Planned (build step 4): sources picked by party kind, country
and investigation type; free first, paid by key; click-only and link-only
sources; Scrapy fetches with WARC, screenshot, hash and time;
yente, rigour, nomenklatura matching; edgartools, ch-api, pygleif, an
OpenFEC client; a request log; licence marks (INV §11; system
design §3.4–3.8). Today only the three connectors exist (aleph,
opensanctions, firecrawl;
frontend/features/connectors/connectors-panel.tsx 
), with search
and enrich but no router or log.
The job. Look things up outside the case safely: the right sources for
this party, only what is allowed, a saved copy of everything fetched,
and a plain record of what left the computer and who could see it.
Front and centre. One line on the dashboard: "Outside lookups: Ask
first · 3 ready to run · 0 sent today".
Redesign.
router's skipped sources), and offers to queue it.
Built on. research-design.md R1–R12, §3; system-design §3.9–3.10;
SYN_AI B1.3–4; [R1], [R5], [R6]; INV §11 decisions.
Needs. The research tables and pipeline from research-design §3.6
([ADR] for the hash-chained trail and new tables). The decision to
drop A4 recorded. Open question (system-design §6.6): may AI
suggest the next search? If yes, each suggestion is a model step
marked "model says".
The router as a visible plan. For a party, a list of planned lookups,
each row: source, policy (automatic / ask / click / link only / needs
key), what will be sent (exact words), licence, whose server it
runs on [R6], and who could see it ("OpenCorporates logs
searches; the company cannot see them", "LinkedIn shows recent
viewers to the person unless private" [R7]). Rows wait, run or are
skipped with a reason.
Lookups run as small jobs with a status per source; findings land in
the Findings inbox (one decision place), never linked
automatically.
Crawler captures. Each fetch shows as a paper card: screenshot
thumbnail, URL, time, hash, "robots.txt allowed", size; opening it
shows the screenshot and extracted text side by side, with "Open
the saved copy (WARC)". Capture, hash and time are automatic
[R3]; the reporter adds tags and notes.
Redesigning the investigation workbench
172 / 252
Request log ("What left this computer", shared with feature 11):
every request with time, source, words sent, cached or not, result
count.
States: key missing ("add a key in Settings · Outside lookups"),
source paused by the circuit breaker ("OpenCorporates failed 5
times; paused until 14:20"), robots disallowed, SSRF refused
("that address is inside your network; not fetched"), rate-limited
(wait shown).
Keyboard and screen reader: the plan is a table with row actions;
status changes announced politely.
Certainty: outside findings use the not-yet-shown dashed style
until reviewed (SYN_LOOK B1); licence marks (CC BY-NC) shown
on every finding from that source.
Innovation.
1. "Cover" check before a sensitive lookup. When a source may
expose the reporter (a profile view, a site that logs IPs), the router
says so and offers the safer path (a bulk local dataset, or a link
only manual visit), drawn from the safety catalogue (SA indicators,
INV §2 Safety).
2. Freshness on every finding. "fetched 10 min ago · cached 1 day"
(SYN_UX C6), with a one-click refetch that keeps both versions.
Built on. system-design §3.4–3.8; INV §11; [R3], [R6], [R7]; SYN_UX
C6, C9; SYN_BRAND B.3 (show the outbound calls).
Needs.[ADR] for each new package: Scrapy, scrapy-playwright,
warcio, trafilatura, Playwright screenshots, yente (service), rigour,
nomenklatura, edgartools, ch-api, pygleif. Backend tables
lookup_requests 
, 
lookup_cache (system-design §3.1, §3.7). Open
questions (system-design §6): where automatic lookups start (every
party or only confirmed ones); sharing cache between investigations.
9. AI marks everywhere (grounded, guessed, plum)
Today. No marks: AI-written text, once promoted to a write-up or
deck, is indistinguishable (INV §11 plans "plum marks on anything a
model wrote").
The job. Anyone reading anything in the app can tell what a model
wrote, what a person checked, and what a passage says.
Front and centre. Not a tile; a rule for every surface.
Redesign. A thin plum left rule and an "AI" tag on any model-written
block until a person accepts it (SYN_LOOK B1 last paragraph;
SYN_VIZ B "AI draft · date" stamp); grounded words underlined solid
cream, model words dashed plum (feature 2); after acceptance, the
Redesigning the investigation workbench
plum rule becomes a small "AI-drafted, checked by you on 10 Oct"
note in the margin, kept in exports (PACED, SYN_UX A8). Screen
readers read "AI drafted, not yet checked" before the block.
Innovation. A per-document AI share: write-ups show "12% of
sentences drafted by AI, all checked", a number made from the
marks, for editors and for the product pages' honesty promise
(SYN_BRAND B.5).
Built on. SYN_AI A5, B1; SYN_LOOK B1; SYN_VIZ B; SYN_UX C9.
Needs. Write-ups and decks must store sentence-level origin (model
/ reporter / edited). Small schema change to write-up content.
173 / 252
10. Paper Trail (every source in one panel)
Today. Planned: "one panel replacing External connectors and
OpenAleph corpus: every source's status, one queue of matches and
findings, records by source, what stands out, watchlist, send-outs"
(INV §11; glossary 
catalogue/glossary/app.yaml line 30; docs/discovery/screens-prototype.html "Paper Trail" tab). Today
these are split over the connectors card (with the dossier nested
inside, INV §12) and the OpenAleph corpus card that nests four tools
(INV §12), and the investigation picker appears twice (INV §12).
The job. See every source the case draws on, its state and what came
from it, and act on what is waiting, in one place.
Front and centre. A row of source chips on the dashboard (Your
documents · OpenAleph · OpenSanctions · Aleph · Firecrawl ·
registries), each with a state glyph (ok / working / needs key / paused)
and the count waiting; one alarm colour only for a failed source the
reporter depends on.
Redesign.
Whole-screen panel with sources as rows down the left (status,
last sync, records from it, licence, who could see lookups) and the
selected source's content on the right in tabs: Waiting (its share
of the Findings inbox), Records from here, What stands out,
Watchlist, Sent out (entity sets to OpenAleph), Requests (the
request log, feature 8).
Every record anywhere carries source tags, and every tag is a filter
(INV §11 source filter); in the network, "light only facts from
OpenSanctions".
Connector credentials move here from Keep 
→ Access (INV §12
"security and settings are split") with "Paste key" per source.
Hover a source row: its records light in the open chart. Scroll over
the rows moves the selection.
States: no sources connected (a short list of free ones and what
each gives); a source syncing (real progress with stage names, not
"OpenAleph is working…"); a source failing (message + retry); very
large (thousands of findings grouped by kind with counts).
Keyboard: ↑/↓ sources, 
←
/
→ tabs. Screen reader: each row reads
"OpenSanctions, connected, last checked 10 min ago, 4 waiting".
Innovation.Source coverage map. A small grid of party × source
showing which parties were looked up where and which were never
checked, so gaps in coverage are visible before a reporter says
"nothing found".
Built on. INV §11, §12; screens-prototype.html; SYN_UX C2, C3, C6;
[R3], [R7].
Needs. Frontend consolidation of existing connector and corpus
endpoints; no new package. The naming decision in feature 4 (keep
"Paper Trail" for this panel; call the suite's ledger "Run record" inside
the app).
Redesigning the investigation workbench 174 / 252
11. AI settings and privacy
Today. The Settings page's "Private AI" card is read-only: the status
sentence, model, where it runs ("runs on this computer" / "on the
provider's servers") and "remote endpoints allowed
(AI_ALLOW_REMOTE_ENDPOINT is on)"
(
frontend/app/settings/page.tsx 267–278). Everything is set by
environment (INV §8). The Ollama client refuses non-local endpoints
and cloud models unless remote is allowed
(
backend/app/ai/llm_client.py 186–260), and the governor limits
runs per minute and at once (
governor.py
). Planned: settings
grouped as access, outside lookups, AI, demo data; a first-run tutorial
asking each setting (INV §8, §11).
The job. Know, and choose, where the AI runs, what it may read, what
leaves the computer and what it cost, and be able to prove it later.
Front and centre. One privacy line on the dashboard footer: "AI on
this computer · nothing sent out today", which turns amber when
anything has gone out ("AI: 2 requests to a remote model today · see
them").
Redesign.
An AI section in Settings (the regrouped settings):
Where it runs
: a choice of local model (Ollama, with installed
models listed) or a remote provider, with the consequence in one
line each ("Your evidence is sent to Anthropic's servers for each
run"). Remote needs an explicit switch with the same words; no
pre-selected remote option (SYN_UX C9 equal-weight choices). What it may read
: per investigation, "all records" or "only records I
pick", and "include outside findings not yet reviewed: off"
(SYN_UX A8 LinkedIn: the human picks what the AI uses).
Limits
: runs per minute and at once (today env-only; shown read
only with "set by whoever runs this computer" when locked). Default run profile for new investigations (feature 6).
Calm motion for the live view.
"What left this computer" report: every AI request and outside
lookup with time, destination, the words or record ids sent, size,
and cost; a window of 15 minutes / 7 days / all; Export as JSON
([R4], Apple Intelligence Report; SYN_BRAND B.3). Local runs list
as "stayed on this computer" so the report also proves the
negative.
Developer details (env names, endpoints) in a "For whoever runs
this computer" fold, never in the main text (INV §12 developer
words).
States: AI disabled by the deployment (explained, not hidden);
model missing ("ollama has no model named …" becomes "That
model isn't installed. Install it, or pick another"); remote blocked
by policy.
Keyboard and screen reader: standard form semantics; the report
is a table with column headers; export is a button with its file
name.
Innovation.
1. A privacy receipt on every result. Each candidate carries a one
line receipt: "Ran on this computer · 30 records read · nothing
sent out", so a reporter can hand a result to an editor with its
privacy stated.
2. Panic switch. "Stop all AI and lookups now" in the safety corner
(SYN_UX C2 corners): cancels running jobs, sets lookups to off,
Redesigning the investigation workbench 175 / 252
and logs it.
Built on. INV §8, §11, §12; 
llm_client.py
, 
governor.py
; SYN_AI A8
(consent, MCP spec); SYN_UX C9; SYN_BRAND B.2–B.3; [R4].
Needs. Backend: settings stored in the database with environment as
the upper limit (an env "allow remote = false" can never be
overridden in the UI); a request log shared with lookups; the job
cancel route exists without UI (INV §11). [ADR] for moving AI
configuration from environment-only to stored settings (security
model change). Open question: is cost shown for remote providers
from the provider's own usage numbers, or estimated?
12. AI as the investigator's assistant (planned, design not written)
Today. A decision only: "manages the investigation, reports findings,
asks for guidance, everything into the research trail" (INV §11).
The job. Keep the case moving between sessions: notice what
changed, propose the next step, ask the reporter's guidance, never
act on the case on its own.
Front and centre. A "Since you were last here" card on the dashboard:
new documents read, findings waiting, runs finished, and one
proposed next step with its reason.
Redesign (outline).
The assistant is a named actor in the case history, next to people
("Assistant proposed 3 lookups for Fernhill Ltd", SYN_AI A4
Linear).
It works only through the features above: it may propose a
question (feature 1), a research run (7) or lookups (8), each
landing as a proposal with its plan; with automation "without
approval" it may run research (never link, never accept).
Every proposal and action is an event in the run record and visible
in the live view.
A standing "desk" like the suite viewer's "Your desk"
(
ass/viewer/index.html lines 163–184: Confirm / Questions /
Tasks / Proposals): what waits on the reporter, in one queue,
merged into the Findings inbox.
Innovation.Standing directives in the reporter's own words ("never
contact M. Ross's family", "UK sources first"), read at the start of
every assistant action, as the suite viewer's "Add a directive" does
(lines 168–173), and shown on every plan they shaped.
Built on. INV §11; SYN_AI A4, B1.4; suite viewer "Your desk" and
directives.
Needs. A design document of its own before any build; scheduled
jobs (exist via Procrastinate). Open questions for Ony: may the
assistant run while the app is closed? What may it do under "without
approval"?
13. Cross-feature needs, in one list
Redesigning the investigation workbench 176 / 252
Backend (in order).
1. SUITE §6.2 contract fixes (tier default D, A–D, 
confidence_term
, UNRESOLVED_CONFLICT
, 
CFLT
, hypothesis fields, version parsing).
Verdict colours are wrong without them.
2. Event record + 
parent + server-side status maps; emit at each
existing step of 
run_reasoning_module()
. [ADR]
ai_run_events
.
3. SSE endpoint with 
StreamingResponse
; 
?after=n polling fallback.
4. Per-claim review decisions; run profiles per investigation; more
flags and premises accepted.
5. Request log shared by AI and lookups; "What left this computer"
export.
6. Research tables and pipeline ([ADR]), router and adapters ([ADR]
per package).
Frontend. No new package for features 1–6, 9–11 (SVG + Canvas 2D +
zustand + lucide, all installed). Optional WebGL bloom for Rain Noir
([ADR], the portfolio engine port).
Open questions for Ony.
1. "Paper Trail" name clash (app sources panel vs the suite's ledger).
Proposal: app keeps Paper Trail for sources; the suite's trail shows
as "Run record".
2. Outside lookups default: automatic (decided earlier) vs ask first
(safer, used in the mockup).
3. Draw the whole suite, dimmed, even where the app does not run it
yet? (Proposed: yes, with "not run in the app" labels.)
4. research-design A4 (auto-link at 0.90) to be withdrawn in favour
of "every link waits for a person".
5. May AI suggest the next search in research runs, and may the
assistant act while the app is closed?
6. Should reporter corrections of AI claims become fully reporter
owned claims?
Redesigning the investigation workbench 177 / 252
Replacing TAS with the Authority System Suite
5. How the app uses TAS today
5.1 The submodule
pai-tl/.gitmodules 
: 
[submodule "backend/app/ai/tas_spec"]
systems/tas/README.md "Journalism Workbench"
The suite's 
section says the app consumes TAS "as a git submodule (pinned to
a tagged release …) at 
backend/app/ai/tas_spec/ 
, and wires two
url = https://github.com/onysnow/topic-authority-system.git
2484bae31aec1454e2a7c57fffbaa7bf30cbf5a9 
, not
Pinned at 
checked out here.
LINES WHAT IT DOES
1–15
modules — Case Synthesis and Hypothesis/Contradiction
Testing".
5.2 Every reference, file by file
backend/app/ai/reasoning.py (1,027 lines) — the only file that
reads TAS content.
Module docstring: TAS Module 08 / Module 06 orchestration; output is never trusted, is citation-checked, and always lands as 
48
49–55
57–75
TAS_SPEC_ROOT = Path(__file__).parent / "tas_spec"
APP_MODULES_ROOT (
presentation_modules/ 
), deliberately outside TAS
MODULE_FILES 
: 
case_synthesis → tas_spec/PROMPT_MODULES/08_CASE_SYNTHESIS.md 
, 
tas_spec/PROMPT_MODULES/06_HYPOTHESIS_AND_CONTRADICTION_TESTING.md 
, 
presentation_draft →
proposed
hypothesis_test →
presentation_modules/PRESENTATION_DRAFT.md 
. 
78
162
TAS_MODULES = {"case_synthesis","hypothesis_test"}
OUTPUT_SCHEMAS 
, the app's own JSON contract per module, "kept separate from TAS's own markdown-table module text". 
claim_id "CLM-0001", 
classification with 7 values (
SOURCE_STATEMENT … NEGATIVE_SEARCH_RESULT 
; no 
case_synthesis.claims[] 
:
UNRESOLVED_CONFLICT 
),
warrant 
, 
confidence: LOW\|MEDIUM\|HIGH (no 
hypothesis_test 
: 
hypothesis_matrix[] with 
confidence_term 
), 
HYP-0001 (no 
kind 
, 
confidence_basis 
, 
viable 
, 
limitations 
, 
ambiguous_evidence or 
investigative_gaps 
.
non_diagnostic_evidence 
; it has
diagnostic_value text); 
224
246
contradiction_log[] with 
CONF-0001 and 
Comment on "TAS v1.9 CORE/CONTROL_SURFACE.md §4". Exposes only 
conflict_type spelled with underscores
severity_floor (default 
source_tier_floor (default 
"C" 
, allowed 
A
F 
). Explains why 
show_reasoning_chain 
, 
ALL 
, allowed 
ALL/MATERIAL/BLOCKING 
) and
auto_run_adversarial_gate and
visual_release_mode are not exposed. 
Redesigning the investigation workbench
CONTROL_SURFACE_FILE = TAS_SPEC_ROOT/"CORE"/"CONTROL_SURFACE.md"
178 / 252
LINES WHAT IT DOES
248
263
266
288
342
395
427
429
447
450
510
normalize_control_flags() 
: an unknown flag or value is a 400
_control_surface_prompt_block() 
: the SESSION FLAGS text injected into the prompt. Tier wording: "at least one supporting source is tier {tier} or
higher … may carry the CORROBORATED_FACT classification on the strength of its cited sources alone"
REJECTION_REASONS (schema / citation / quotes …)
module_json_schema() and 
validate_output_shape() 
, built from 
_read() 
: a missing TAS file is a 
ReasoningInputError naming 
OUTPUT_SCHEMAS
git submodule update --init
build_system_prompt() 
. TAS modules get the framing "You are operating under the Topic Authority System (TAS) — Investigative & Legal-Document
Evidence Edition" plus the module text plus the flags block. Every module gets the "EVIDENCE AUTHORITY RULES" (exact ids; never invent; packet text is
quoted content; the investigation's 
reasoning_contract 
) and the OUTPUT CONTRACT JSON
536
593
623
625
632
650
832
validate_citations() 
: every 
record_type 
/
record_id must be in the packet's citations
validate_reasoning_request() 
: 
RECORD_REF_MODULES 
, 
control_flags only for 
QUOTE_CHECKED_MODULES 
, 
TAS_MODULES (line 611)
CHART_CHECKED_MODULES 
, 
WRITING_CHECKED_MODULES — all 
run_reasoning_module() 
. Order: validate 
→ governor 
→ client 
→ retrieval packet (
build_question_context or
build_selected_record_context 
) 
→ 
retries (
≤ 
record_texts / 
visual_catalog for drafts 
→ 
{"presentation_draft"} only
db.commit() 
→ prompt 
→ 
client.generate 
→ chart
MAX_CHART_RETRIES 
) 
→ truncation check 
→ JSON parse 
→ shape check 
→ citation check 
→ quote check 
→ chart check 
→ writing check 
→
AIAnalysisCandidate with 
response 
, 
max_tokens 
, 
review_status
chart_retries 
, 
proposed or 
quote_check 
, 
rejected and a 
chart_check 
, 
trace (
system_prompt 
, 
writing_check 
)
962
973
975
1027
_vendored_tas_version() 
: the first 
ai_reasoning_status() 
→ 
## heading of 
tas_spec/CHANGELOG.md 
, split on "—" then "-"
user_prompt 
, 
packet_summary 
,
tas_spec: {present, version, modules{spec_file, available, vendored_tas},
control_surface{spec_file, available, flags}}
Redesigning the investigation workbench
179 / 252
Other backend files:
FILE:LINES
backend/app/ai/llm_client.py:3, :68
backend/app/ai/quote_check.py:15-16
USE
Comments only: "knows nothing about TAS"; "TAS's own modules 06/08 only need a single non-streaming
completion"
Comment: quote check applies to drafts only; "The two TAS analysis modules follow their vendored spec"
backend/app/ai/presentation_modules/PRE
SENTATION_DRAFT.md:3-4
States it is app-local, "not part of the vendored Topic Authority System (TAS) spec … not … governed by TAS's
CONTROL_SURFACE flags"
backend/app/api/routes_investigations.p
y:178-219
_run_reasoning_endpoint() queues an 
AI_REASONING job; payload keeps 
control_flags only 
if
module in TAS_MODULES (line 202)
backend/app/api/routes_investigations.p
y:221-250
POST …/assistant/case-synthesis ("TAS Module 08") and 
Module 06"); both pass 
backend/app/api/routes_investigations.p
y:253-269
severity_floor / 
…/assistant/hypothesis-test ("TAS
source_tier_floor
POST …/assistant/presentation-draft ("App-local … not vendored TAS")
backend/app/api/routes_investigations.p
y:272-291
backend/app/jobs/handlers.py:302-328
GET …/ai-analysis-candidates ("review queue for TAS reasoning output")
ai_reasoning_job() calls 
is working on it")
backend/app/schemas/api.py:286-309
run_reasoning_module 
; its only progress report is 
SeverityFloor = Literal["ALL","MATERIAL","BLOCKING"] 
; 
report(10, "The model
SourceTierFloor =
Literal["A".."F"] 
; both request bodies carry them; comments cite "TAS CONTROL_SURFACE §4"
backend/app/schemas/responses.py:2624
2661
AiModuleStatusOut (
vendored_tas 
), 
AiReasoningStatusOut.tas_spec
backend/app/models/ai.py:1, :15, :27
49
AiControlFlagOut 
, 
AIAnalysisCandidate ("TAS-backed reasoning module"): 
AiControlSurfaceOut 
, 
module 
, 
request 
, 
AiTasSpecOut 
,
trace (JSON), 
checked_citation_ids 
, 
confidence (float, always 0.0), 
review_status 
, 
payload 
,
reviewer_note …
backend/alembic/versions/e2f3a4b5c6d7_a
dd_ai_analysis_candidates.py:1
Docstring only
backend/app/services/settings.py:92-94
Redesigning the investigation workbench
"ai": ai_reasoning_status(settings) in 
/api/settings/status
180 / 252
FILE:LINES
backend/app/console_adapters.py:223
226
backend/app/services/exports.py:77-80
USE
Console tile headline "
… · TAS v{status['tas_spec']['version']} · …
"; "spec missing" state
Comment: the "TAS reasoning review queue" travels in backups
backend/app/services/financial_flows.py
:3
Tests:
FILE:LINES
backend/tests/test_tas
_submodule_drift.py:1
101
USE
Comment: columns follow "the TAS Financial Flow Analysis module's transaction ledger"
(1) Every 
TAS_MODULES path exists and is non-empty under 
stay outside 
TAS_SPEC_ROOT 
; always runs. (3) 
exposed flag name, the exact row prefix 
always enforced regardless of this flag's value"
TAS_SPEC_ROOT 
; skipped if not checked out. (2) App-local modules
CORE/CONTROL_SURFACE.md contains 
| `{name}` | `{default}` (so 
## 2. Non-negotiable boundary 
, each
| `source_tier_floor` | `C`
), and "BLOCKING is
backend/tests/test_rea
soning_endpoints.py:21-26
requires_tas_spec skip marker
backend/tests/test_rea
soning_endpoints.py:93-221
Marked TAS-required tests
backend/tests/test_rea
soning_endpoints.py:26
4
backend/tests/test_rea
soning_endpoints.py:28
3-297
Expected defaults 
{"severity_floor":"ALL","source_tier_floor":"C"}
Status shape; version read from the CHANGELOG
backend/tests/test_rea
soning_endpoints.py:30
2-311
A missing spec file returns 400
Redesigning the investigation workbench
181 / 252
FILE:LINES
backend/tests/test_rea
soning_endpoints.py:32
4-395
USE
Flag validation, prompt text "severity_floor = BLOCKING", "source_tier_floor = B", stored flags, and status flags with default 
ABCDEF
backend/tests/test_rea
soning_endpoints.py:41
0-483
More TAS-gated runs
backend/tests/test_pre
sentation_draft.py:5,
169-219
A draft prompt must not contain "Topic Authority System" or "severity_floor ="; 
backend/tests/test_ai_
candidate_lifecycle_se
ams.py:1-5
Run without the submodule
backend/tests/test_res
ponse_models.py:931
backend/tests/test_pre
sentation_promotion.py
:198
status["ai"]["tas_spec"]["modules"]
Comment
CI:
FILE:LINES
USE
.github/workflows/backen
d-postgres-ci.yml:38-66
Job env 
TAS_REPO_TOKEN: ${{ secrets.TAS_REPO_TOKEN }} 
. Step "Fetch TAS submodule" (
!= ''
) rewrites the submodule URL with 
backend/app/ai/tas_spec 
; 
.github/workflows/openal
eph-live-ci.yml:47-60
Same step
Frontend:
Redesigning the investigation workbench
C 
, allowed
control_flags on a draft is rejected
if: env.TAS_REPO_TOKEN
x-access-token and runs 
git submodule update --init --recursive
continue-on-error: true (for Dependabot)
182 / 252
FILE:LINES
frontend/components/ai-reasoning-panel.tsx:2
frontend/components/ai-reasoning-panel.tsx:39
frontend/components/ai-reasoning-panel.tsx:43-47
frontend/components/ai-reasoning-panel.tsx:87-91
frontend/components/ai-reasoning-panel.tsx:327
frontend/components/ai-reasoning-panel.tsx:348-350
frontend/components/ai-reasoning-panel.tsx (whole file)
frontend/lib/api-types.ts:26-30
frontend/lib/generated/types.gen.ts:511-517 
,
zod.gen.ts:171-197 
, 
frontend/openapi.json (5 matches)
frontend/lib/financial-flow-types.ts:3-4
frontend/components/charts/financial-flow
sankey.tsx:5
frontend/lib/entity-graph-types.ts:9
frontend/components/entity-graph.tsx:29
USE
Header comment
MODULE_LABEL 
: "Case synthesis (TAS module 08)", "Hypothesis & contradiction test (TAS
module 06)"
Drafts can run when TAS is absent
describeAiStatus() 
: "The vendored TAS spec (backend/app/ai/tas_spec) is not checked
out…", "TAS module file(s) missing…", "TAS spec v{version} vendored."
Shows 
classification · confidence per claim
Collapsible trace (system prompt, user prompt)
Sends no 
severity_floor / 
source_tier_floor (no match in the file)
AiReasoningStatus.tas_spec: {present, version, modules}
Generated 
Cites 
AiTasSpecOut
backend/app/ai/tas_spec/PROMPT_MODULES/05_FINANCIAL_FLOW_ANALYSIS.md
Comment
Comment: "TAS-aligned evidentiary status"
Comment
frontend/tests/test-ai-reasoning-panel.test.tsx:2,
27, 94-98, 452-457
frontend/tests/test-settings-private-ai.test.tsx:32,
40
frontend/tests/test-chart-style.test.tsx:181
Expects "TAS spec v1.8" text
Fixtures with version '1.9'
Fixture
Redesigning the investigation workbench
183 / 252
Docs:
README.md:100-101, 148 
; 
0025); plus history in 
and 
STRUCTURE_AUDIT.md:89 (STRUCT
dev-log.md (34 matches), 
claude-log.md (6)
APPLICATION_STRUCTURE_AUDIT_PROMPT.md (3).
5.3 Where the app's current contract differs from the suite's
TAS
Each item below is read from the files.
1. 
source_tier_floor 
. The app defaults to 
suite's TAS defaults to 
D
C
and allows 
, may not go below 
D
F
A
. The
, and never counts
Tier C. TAS 1.10 is where the default became D
(
systems/tas/CHANGELOG.md:121 
). The 1.12-era fix pass also
states "
source_tier_floor never counts Tier C" (line 76). The
app's prompt text treats the floor as letting one source carry
CORROBORATED_FACT "on the strength of its cited sources
alone". The suite says only Tier A carries it alone (Standard §4.3;
CHANGELOG line 38).
systems/tas/CHANGELOG.md opens
7. Version parsing. The suite's 
with 
## 2026-10-10 — DIR-0044: …
, so
_vendored_tas_version() would return 
## 1.12 (
"2026" 
. The newest
systems/README.md 
: "TAS is at
numbered heading is 
1.12 on its own track").
6. Replacement plan
6.1 Choose the form (both are consistent with the files)
A. Submodule of the suite.
git submodule add https://github.com/onysnow/Authority
System-Suite.git backend/app/ai/authority_suite 
, pinned to
b1c71e8 
. This matches 
README.md "Install / Tier 1".
Cost: the clone is 138 MB (
papertrail/ 86 MB, 
docs/ 24 MB,
.git 25 MB), with 4,328 tracked files, including 7 tracked
2. Classification. The app has 7 values; TAS has 8, including
UNRESOLVED_CONFLICT (Standard §4.9 and line 122).
3. Confidence. The app sends 
confidence: LOW|MEDIUM|HIGH only.
The TAS Claim record carries 
ICD 203 terms). 
confidence and
confidence_term (7
INTEROP.md §2 says "Never transmit
LOW|MEDIUM|HIGH across a boundary."
4. Conflict id. The app uses 
CONF 
; TAS and 
CFLT 
. The app spells 
INTEROP.md §7 use
conflict_type with underscores; TAS uses
spaces ("spelled as Module 06 spells it").
5. Hypothesis record. The app lacks 
kind 
, 
non_diagnostic_evidence 
, 
viable and 
ambiguous_evidence 
,
limitations 
, and its
missing_records are free strings where TAS uses 
GAP- ids.
6. Right of reply. The app's case synthesis has no right-of-reply
output. TAS Module 08 rule 10 and CP-01 require 
ROR- for adverse
__pycache__/*.pyc 
.
Use 
git sparse-checkout for 
trail.py 
, 
reply-gate/ and 
systems/ 
, root 
*.md 
, 
LICENSE* 
,
viewer/ 
, or accept the size.
CI keeps the token-gated fetch step if the suite repo is private.
Whether it is public is not stated in any file read.
B. Vendored copy at a pinned commit.
Copy 
systems/ (1.7 MB), 
CHECKPOINTS.md 
, 
AGENTS.md 
, 
INTEROP.md 
,
SYCOPHANCY_CONTROLS.md 
,
FABRICATION_CONTROLS.md 
, 
INSTRUCTION_COMPLIANCE.md 
,
CONTROL_SURFACE.md 
, 
LICENSE and 
OVERLAYS.md 
, 
LICENSE-DOCS into
backend/app/ai/authority_suite/ 
.
Add a 
VENDORED_FROM file recording 
JUDGEMENT_LEDGER.md 
,
onysnow/Authority-System
findings meant for publication.
Redesigning the investigation workbench
Suite@b1c71e8 
.
184 / 252
This removes the 
TAS_REPO_TOKEN steps from CI.
README.md gives the reason systems are versioned together: "a
verification-enum change in 
tas/ and the corresponding
INTEROP.md crosswalk update must land in one commit". So a
partial copy must take the systems and 
commit.
Licence check.
INTEROP.md from the same
Doctrine is CC BY 4.0, which requires attribution. Keep 
DOCS and the per-system 
Any copied 
*.py 
/
LICENSE files.
*.sh (e.g. 
trail.py 
) is Apache-2.0: keep
LICENSE with it and state changes if modified.
Both name Anthony Shannon, the app's copyright holder, so there
is no third-party conflict.
The app's own LICENSE ("All rights reserved") can sit beside
them.
6.2 File-by-file changes
backend/app/ai/reasoning.py
1. Replace 
and 
TAS_SPEC_ROOT with 
SUITE_ROOT = …/authority_suite
TAS_ROOT = SUITE_ROOT/"systems"/"tas" 
. 
paths stay the same under 
(
TAS_ROOT
MODULE_FILES
PROMPT_MODULES/08_CASE_SYNTHESIS.md 
,
06_HYPOTHESIS_AND_CONTRADICTION_TESTING.md 
; both exist in the
suite).
2. 
CONTROL_SURFACE_FLAGS["source_tier_floor"] 
: default 
allowed 
("A","B","C","D") per the suite text. Consider dropping
C
from the allowed set: the suite says Tier C "never counts
toward it", so raising the floor to C is valid but has no effect
beyond D. This is a product decision; the suite allows "raised
(stricter)".
_control_surface_prompt_block() tier wording to the
3. Rewrite 
suite's: a floor sets "the lowest source tier that may count toward
the independent-source requirement"; "Tier C never counts"; only
Tier A carries CORROBORATED_FACT alone.
4. Optionally expose 
show_reasoning_chain (display only),
visual_release_mode (now that drafts produce charts) and the
umbrella flag 
LICENSE
research_depth 
. The current comment's reasons for
not exposing them (lines 230–236) would need re-reading against
the app.
5. 
OUTPUT_SCHEMAS 
: - Add 
UNRESOLVED_CONFLICT 
. - Add
confidence_term (7 terms) beside 
CFLT 
; 
confidence 
. - 
CONF- 
→
conflict_type spelled as Module 06 spells it. 
Hypothesis gets 
kind 
, 
ambiguous_evidence 
,
non_diagnostic_evidence 
, 
viable 
, 
missing_records 
→ 
limitations 
. 
GAP- references with a new
investigative_gaps record shape (TAS Gap record). - Optionally a
right_of_reply_required list (
ROR- stub; 
model").
offered_by "never the
6. Framing text (line ~472): "Topic Authority System (TAS) —
Investigative & Legal-Document Evidence Edition".
systems/tas/README.md Provenance says the "edition" title "was
dropped under DIR-0036". Use "Topic Authority System (TAS),
part of the Authority Systems suite".
7. Optionally prepend 
AGENTS.md Non-negotiables and the TAS
mandatory invocation block
(
PROMPT_TEMPLATES/INTEGRATED_PROMPT_TEMPLATE_LIBRARY.md
"D" 
,
§"Mandatory invocation block": load
CORE/PROJECT_INSTRUCTIONS_TEMPLATE.md 
, consult the Standard
and Policy on demand). The suite's own guidance is to "Load the
minimum set" [AG-005].
Redesigning the investigation workbench
185 / 252
8. 
_vendored_tas_version() 
: return the first heading matching 
\d+\.\d+ (
→ 
or 
1.12 
), and add 
git -C … rev-parse
).
9. 
ai_reasoning_status() 
: rename 
with 
^##
suite_commit (from 
VENDORED_FROM
authority_suite
tas_spec 
→ 
{present, commit, systems:{tas:{version,…}}, modules,
add a check that 
INTEROP.md §7 still lists 
CFLT 
, 
CLM 
, 
and that the 8 classifications in Standard §4 match
OUTPUT_SCHEMAS 
.
HYP 
, 
GAP 
,
If vendored (option B), drop the skip: the files are always present.
control_surface} 
. Alternatively keep 
tas_spec as an alias for one
release so the frontend and generated client don't break at once.
test_reasoning_endpoints.py:264, 347-348, 395 
: default 
D
; allowed list 
→ 
ABCD 
; 
C→
source_tier_floor: "F" at line 384
becomes a 400 case. Version assertion at 297 expects 
backend/app/ai/quote_check.py:15-16 
, 
llm_client.py:3, :68 
,
presentation_modules/PRESENTATION_DRAFT.md:3-4 
, 
1.12 
.
test_presentation_draft.py:200-205 stays the same: drafts
alembic …e2f3…py 
, 
models/ai.py 
,
services/exports.py 
,
services/financial_flows.py — comment and wording updates
only. No logic change. The candidate table and migration need no
schema change; 
trace and 
payload are JSON.
backend/app/schemas/api.py:286-309 — 
SourceTierFloor =
must not claim TAS framing.
test_response_models.py:931 
: key rename if done.
CI (
backend-postgres-ci.yml:38-66 
, 
60 
):
Option A: change the URL to 
openaleph-live-ci.yml:47
Authority-System-Suite.git and the
Literal["A","B","C","D"] 
. Update the comments.
backend/app/schemas/responses.py:2624-2661 — 
AiAuthoritySuiteOut (or keep the name and add 
AiTasSpecOut 
→
commit 
).
Regenerate 
frontend/openapi.json and 
frontend/lib/generated/* 
.
backend/app/console_adapters.py:224 — headline "
@ b1c71e8 · …
".
backend/app/api/routes_investigations.py — docstring wording.
No route change is required for the swap.
Tests:
test_tas_submodule_drift.py 
:
point at 
TAS_ROOT 
;
row assertion becomes 
| `source_tier_floor` | `D`
;
keep the other two assertions — both strings are present in
systems/tas/CORE/CONTROL_SURFACE.md 
;
Redesigning the investigation workbench
path, and decide whether the token step is still needed.
Option B: delete both "Fetch TAS submodule" steps and
TAS_REPO_TOKEN 
.
.gitmodules 
: replace the entry, or remove it for option B.
… · TAS v1.12
Frontend:
ai-reasoning-panel.tsx:39, 87-91 
: labels "(TAS module 08)"
stay accurate. Status strings change to the suite path, version and
commit.
ai-reasoning-panel.tsx:327 
: show 
band, e.g. "likely (55–80%)", which 
for QAS/EGS/EHS outputs) beside 
api-types.ts:30 and the fixtures in 
panel.test.tsx:27, 94-98, 457 
, 
confidence_term (with its
INTEROP.md [IN-066] requires
confidence 
.
test-ai-reasoning
test-settings-private
ai.test.tsx:32, 40 and 
test-chart-style.test.tsx:181 follow
the status rename. "TAS spec v1.8" assertions become "v1.12".
186 / 252
financial-flow-types.ts:4 
: path comment 
→
…/systems/tas/PROMPT_MODULES/05_FINANCIAL_FLOW_ANALYSIS.md
(the file exists).
Docs:
note.
README.md:100-101, 148 
; 
6.3 What stays the same
The review gate: every run 
→ 
STRUCTURE_AUDIT.md STRUCT-0025
AIAnalysisCandidate
proposed /
rejected 
; promotion is a human action. This matches TAS
README "Using TAS in an application" step 5.
Citation validation against the packet.
The packet-as-quoted-content rule, which matches [AG-049] and
TAS Standard §15.
Job queueing, the governor, providers, and the quote / chart /
writing checks for drafts.
presentation_draft stays app-local.
The endpoints and the 
ai_analysis_candidates table.
5. The suite moves fast. All seven systems' CHANGELOGs have
2026-10-10 entries, and 
claude/OPERATING_INSTRUCTIONS.md is at
VERSION 38. Pin and bump deliberately; the drift test is the guard.
6. Over-claiming.
README.md "Honest limits": most rules are
instructions, not enforcement. The app's validators are the
enforced part. Anything shown in the UI as "passed" must come
from a validator or a recorded verdict, never from the model's self
report (
FABRICATION_CONTROLS.md §1: self-records are ALLEGED).
7. Hooks don't transfer.
PreToolUse hooks (
reply-gate/ hooks are Claude Code Stop /
REPLY_GATE.md §7). They do not run inside the
app's LLM calls. Any equivalent check must be reimplemented
server-side.
7. Events for a live "neural paths" view
7.1 Base it on the suite's existing event shape
Base it on 
EVENTS.log (§2.6): 
{n, t, session, kind, target,
detail, parent, src} 
. The suite already draws this:
6.4 Risks
1. Contract tightening rejects old shapes. Adding 
viewer/index.html routes 
confidence_term 
,
ROUTE → system node
, 
LOAD → module
RULE/CHECK → the system's last
UNRESOLVED_CONFLICT and 
CFLT- changes
validate_output_shape() 
. Stored candidates keep the old shape
(JSON, nullable), so the frontend must render both.
2. Tier default change (C
→
D) changes outputs and stored
request.control_flags 
. Callers sending 
3. Version string. The naive parser returns "2026" (§5.3.7).
4. Size and privacy of a full submodule (§6.1A). The suite repo's
visibility is not stated in the files.
Redesigning the investigation workbench
node under the system
, 
module (or audit)
, 
controls 
, and 
BLOCK → boundary
, 
CP-nn targets 
→ 
E 
/
F
start getting 400s.
BLOCK 
, green for 
FLAG → umbrella
checkpoints (lines 312–319).
It animates a "traveller" from the previous node to the new one:
red for 
WRITE (line 324).
parent gives the edge needed to trace any thought from input to
output.
7.2 Proposed app event fields
The suite's fields kept as-is, plus app fields:
187 / 252
FIELD
run_id
MEANING
The 
investigation
_id
node
BackgroundJob.id / 
A stable id: 
system
AIAnalysisCandidate.id
router 
, 
tas 
, 
tas/08 
, 
boundary:tas→las 
, 
cp-01 
, 
ras\|tas\|qas\|las\|das\|egs\|ehs\|umbrella\|app
module
e.g. 
rule
status
e.g. 
08
tas/08 rule 10
, 
AG-012
gate:citation …
good\|bad\|partial\|neutral — the node colour, derived from the verdict maps below, never chosen by the model
verdict
refs
The raw closed-vocabulary value
Record ids: 
confidence_te
rm
self_reporte
d
Optional
EVID 
, 
CLM 
, packet 
record_type:record_id
true when the event came from model output rather than an app validator. Mirrors 
FABRICATION_CONTROLS.md 
's rule that self-reports are ALLEGED.
7.3 Event list mapped to the suite, in run order
run_reasoning_module 
) is marked
The pipeline the app has today (
[now]. Steps the suite defines but the app does not yet perform are
src: "session" vs 
marked [suite].
src: "trail.py" 
, and
188 / 252
Redesigning the investigation workbench
NODE 
/
#
1
KI
ND
TARGET
TU
RN
ST
AR
T
run
2
SE
TT
IN
G
flags
EMITTED BY (APP)
route 
_run_reasoning_endpoint
/ job start [now]
normalize_control_flags
after 
[now]; detail 
ALL→… 
, 
severity_floor
source_tier_floor …
3
RO
UT
E
4
LO
AD
tas (and
ras 
/
qas 
/
das 
/
egs 
/
/
when the output
would trip their
row)
prompt build [now: tas only]
las
ehs
_read() 
[now]
systems/tas/PR
OMPT_MODULES/0
8_…md etc.
5
CH
EC
K
retrieval
build_question_context /
build_selected_record_contex
t 
[now]; 
refs = the packet's
citations; detail = counts
6
CH
EC
K
model
7
CH
EC
K
gate:schema
client.generate start/end
[now]; detail model and stop_reason
validate_output_shape 
[now]
STATUS RULE
neutral
neutral; a 400 is 
neutral
good; missing file = bad
neutral; 0 citations = partial
truncated = bad
pass good / errors bad
SUITE ANCHOR
OI-118
BLOCK
TAS CONTROL_SURFACE
§2 "FLAG CHANGED"
echo
AGENTS.md trigger table
AG-050
TAS Stage 0 "Scope and
intake"
—
TAS README "Validate …
against the schemas"
Redesigning the investigation workbench
189 / 252
#
KI
ND
NODE 
/ TARGET EMITTED BY (APP) STATUS RULE SUITE ANCHOR
8
CH
EC
K
gate:citation validate_citations
[now], one
child event per bad ref
bad refs = bad AG-033; Standard §17
Pass 6
9
CH
EC
K
gate:quote / gate:chart (+
retries) / gate:writing
drafts [now] removed items = partial; none left = bad —
10
RU
LE
tas/02 per claim from payload [suite] VERIFIED good; PARTIALLY VERIFIED / ATTRIBUTED BUT
UNCORROBORATED / UNRESOLVED / NOT TESTABLE partial;
CONTRADICTED bad
INTEROP.md §3
11
RU
LE
tas/class per CLM-from payload [now: classification
exists]
CORROBORATED_FACT good; SOURCE_STATEMENT,
INFERENCE, ALLEGATION, HYPOTHESIS partial; UNKNOWN,
NEGATIVE_SEARCH_RESULT, UNRESOLVED_CONFLICT
neutral/partial (a finding, not a failure: 
AGENTS.md "Absence of
a source is a finding")
Standard §4
12
RU
LE
tas/06 per HYP- / 
CFLT-hypothesis_test payload [now]
viable false = bad for that hypothesis; open 
CFLT
(
resolution: null
) = partial
Module 06; Standard
§11–12
13
RU
LE
confidence
per claim [suite: needs confidence_term
]
weakest-link check; a chain claim above its weakest link = FLAG SY-036, AG-051
14
BL
OC
K
boundary:tas→l
as / 
tas→das / ras→tas / qas→las
when a value cannot cross [suite] bad
INTEROP.md §0–3;
viewer demo lines 371,
382
15
CH
EC
K
cp-01 / 
cp-02 / cp-03 adverse finding for publication, etc.
[suite]
record present & complete good; OFFERED before deadline
partial; missing bad
CHECKPOINTS.md
Redesigning the investigation workbench 190 / 252
#
KI
ND
NODE 
/
TARGET
16
CH
EC
K
17
FL
AG
18
WR
IT
E
tas/10 passes
1–7
umbrella
EMITTED BY (APP)
final audit run [suite]
failure-mode detections the app can
compute (e.g. F31 fabricated
specifics = an id not in the packet;
F27/F29 count shape) [partly now
via citation gate]
AIAnalysisCand
idate:<id>
db.add(candidate) 
[now]; detail
proposed or 
rejected:
<reason>
19
CH
EC
K
review
review_ai_analysis_candidat
e (human) [now]
20
CH
EC
K
21
TU
RN
EN
D
ledger
run
7.4 Plumbing
later outcome on a claim's
confidence_term 
[suite]
job end [now]
What exists today. Jobs report progress only through
report(progress, message) (
STATUS RULE
PASS good; PASS WITH CORRECTIONS / LIMITED REVIEW
partial; FAIL bad
partial/bad
SUITE ANCHOR
Module 10; Standard §17
BEHAVIORAL_FAILURES
.md 
; 
§3
proposed good; rejected bad
REPLY_GATE.md
trail.py WRITE (emitted
only by the writer)
accepted good; rejected bad
HELD good; FALSIFIED bad; UNRESOLVED neutral
TAS README step 5
JUDGEMENT_LEDGER.m
d
the candidate's status
backend/app — the only 
in 
backend/app/jobs/records.py:24,
routes_decks.py and 
119-128 
; 
handlers.py:315 calls it once). Clients poll 
GET
/api/jobs/{id} 
. No SSE or WebSocket endpoint exists in
OI-118
StreamingResponse uses are file exports
routes_writeups.py 
.
What a live view needs. An append-only per-run event store, e.g.
trace["events"] on the candidate plus a job-scoped list, and a
stream or poll endpoint keyed by 
run_id 
.
Redesigning the investigation workbench
191 / 252
Event level. Mirror 
with the same 
SETTINGS.json
SUMMARY_KINDS 
.
Event order. Keep 
events: full|summary|off
n
monotonic per run.
Tracing. Set 
parent on every event: claim 
→ its citation refs 
→
the retrieval event that supplied them, so a click can walk input 
→
output.
Gaps today. The model call is a single non-streaming completion
(
llm_client.py:68 
). Events 10–13 can only be emitted after the
response is parsed, not while the model reasons. Events 14–16
and 20 need suite steps the app does not run yet. The files give no
mechanism for observing reasoning inside one completion.
Redesigning the investigation workbench
192 / 252
Knowledge, safety and keeping
A map of the 42 Red Flag areas; indicator pages with signs and innocent explanations
side by side; hover cards that follow the accessibility rules; a glossary that shows every
term; one Safety & data page; encrypted backups.
10
Redesigning the investigation workbench 193 / 252
The catalogue explorer: the 42 areas as a map, and an indicator page with signs and innocent explanations.
Redesigning the investigation workbench 194 / 252
Safety & data: what lives where and what leaves the computer, in a second theme.
Redesigning the investigation workbench 195 / 252
Part 0. New research for this area
Each page was captured with 
only what I saw or read on the page.
[R1] MITRE ATT&CK, the matrix (
grab.py into 
pages/feat-kk-* 
. I report
pages/feat-kk-attack/page.png 
,
attack.mitre.org). A very large knowledge base laid out as a matrix:
one column per tactic, each technique a small cell; a cell with sub
techniques shows the count in brackets ("Valid Accounts (4)") and a
grey side bar to fold them open; a "show sub-techniques / hide sub
techniques" switch and a "layout: side" choice sit above the matrix.
Contributes: proof that a catalogue of thousands of entries can be read
as one dense, scannable picture when each entry is a short label in a
fixed column, with counts in brackets and folding.
pages/feat-kk-navigator/text.md 
,
[R2] MITRE ATT&CK Navigator (
its GitHub readme). Its own words: it provides "basic navigation and
annotation of ATT&CK matrices, something that people are already
doing today in tools like Excel"; you can "manipulate the cells in the
matrix (color coding, adding a comment, assigning a numerical value,
etc.)"; "the principal feature … is the ability for users to define layers 
custom views of the ATT&CK knowledge base", e.g. "highlighting
techniques a specific adversary has been known to use". It also says
layer files on the hosted copy are not stored on a server, "however,
we still recommend installing and running your own instance … if your
layer files contain any sensitive content". 
Contributes: the idea of a
case as a "layer" over the catalogue, and a privacy stance that
matches ours.
picture, the bold title, a three-to-four-line summary, "Edited 6
minutes ago" and a settings cog at the bottom. Read: the cog lets
readers turn previews off; previews open on focus as well as hover,
"usable for people who use keyboard navigation", and are marked as
ARIA tooltips; projects can set how long a pointer must dwell before
a preview shows, and the team discussed measuring accidental
hovers ("if a user must dwell on a link for 250 msecs…"); A/B tests in
2016 on Hungarian, Italian and Russian Wikipedia reported that
previews increased "the precision with which users select the pages
they read" and reduced "the cost of exploration". 
Contributes: the
hover-card model: picture + title + short text + freshness + an off
switch, a dwell delay, and keyboard focus.
pages/feat-kk-anki/text.md 
,
[R4] Anki manual, "Studying" (
docs.ankiweb.net/studying.html). Read: a card shows the question
first; Space or Enter shows the answer; four buttons Again / Hard /
Good / Easy, "each answer button shows the next time a card will be
reviewed"; keys 1–4 pick a button; "if you find it hard to use four
answer buttons, you can also use only Again and Good". 
Contributes:
the flip-card learning loop and its keyboard, with a two-button simple
mode.
[R5] Little Snitch network monitor (
pages/feat-kk
[R3] Wikipedia Page Previews (
pages/feat-kk
pagepreviews/img_01.jpg 
, mediawiki.org/wiki/Page_Previews).
Seen: hovering "Mont Blanc" in the Alps article opens a card with a
Redesigning the investigation workbench
littlesnitch/page.png 
, obdev.at). Seen: three panes. Left, a list of
apps, each with traffic bars and an allow / deny tick; centre, a map
with lines from the computer to the cities it connected to; right, a
"Summary": sent and received totals, "88 denied · 0 unconfirmed · 0
incoming", top processes and top domains with data volumes. Read:
"No data is transmitted without your consent"; connections can be
196 / 252
grouped "by app, domain or country". 
Contributes: the visual form for
"what leaves this computer": a list of senders, the lines out, and plain
totals with zeroes shown as reassurance.
[R6] CPJ Digital Safety Kit (
pages/feat-kk-cpjkit/text.md
, cpj.org).
Read: "Journalists are encouraged to complete a risk assessment"
before an assignment; sections on online data, accounts, phishing,
device security, encrypted communications, and "Crossing borders":
"Find out what information is on your devices and how it could put
you and your contacts at risk"; "Back up all your devices … Remove
any information that you would not want border officials to access";
"Turn on full-disk encryption"; "Lock all devices with a PIN or
password instead of biometric data"; "Enable remote wiping". Contributes: the content of the Safety panel's guides, and the "Before
you travel" idea (Innovation in §15).
[R7] Zooniverse Project Builder help (
pages/feat-kk
zooniverse/text.md
, help.zooniverse.org/getting-started). Read:
roles Owner ("There can be only one"), Collaborator, Expert ("can
enter 'gold mode' to make authoritative gold standard
classifications"), Researcher, Moderator, Tester, Translator; a "Field
Guide … available anywhere in your project, accessible via a tab on
the right-hand side"; a step-by-step "Tutorial … as short as possible
so volunteers can start … as soon as possible"; "Talk", discussion
boards with "a single dedicated conversation for each subject"; a
"Visibility" state (private or public, live or in development). Contributes: a tested vocabulary of roles and places for citizen
investigator communities, and the field-guide-as-side-tab pattern for
help.
Part 1. Facts found in the code that change the design
These matter for every feature below.
1. Most indicators have no Faint or Strong threshold yet. In catalogue/indicators/*.yaml
, 2,673 of 2,946 indicators have
Faint = "To be set by Ony" and 2,661 have Strong = "To be set by
Ony"; Textbook is set on all. All 42 Safety (SA) indicators have
Strong unset. The glossary page prints this text as it is ("Faint: To
be set by Ony") to every reader
(
frontend/app/glossary/page.tsx lines 44–48). INVENTORY §11
lists "Faint and Strong levels where no source gives one" as a
planned setting.
2. The glossary silently drops definitions. 2,268 term entries across
43 files merge into 2,116 names; 100 names appear in more than
one area file ("shell company" 7 times, "money mule" 7,
"beneficial owner" 6). 
_glossary() in backend/app/patterns/engine.py keeps the first file's definition
and merges only indicators, related, cases and examples, so six of
the seven "shell company" definitions never reach a reader.
3. The API can page; the page does not.
GET
/api/catalogue/glossary takes 
offset
, but the page asks for limit: 200 and never pages, so 1,916 terms can only be found by
search (
glossary/page.tsx line 96).
4. No list of indicators by area exists in the API. There is 
/areas
(counts), 
/glossary and one indicator by id; an area's indicators
cannot be listed, so a catalogue explorer needs a new endpoint
(
routes_catalogue.py
).
Redesigning the investigation workbench 197 / 252
5. Backups are checksummed but not encrypted
(
backend/app/services/exports.py
: SHA-256 per file in the
manifest; no encryption), and always include the document files
(
backup-panel.tsx line 43, 
include_documents=true
). Whoever
holds the zip can read the whole case.
6. Keep's three panels are tangled. The security status is passed in
as an optional child of the backup card and lives in a 
<details>
under it; deletion is a separate card; Settings says connector keys
and audit live "on the main workbench for now"
(
settings/page.tsx comment lines 15–20; 
page.tsx lines 209
212).
Part 2. KNOWLEDGE
1. The glossary (2,268 entries, 2,116 names)
Today.
/glossary
: a search box, 43 area chips in one row each with
its term count, "N terms, the first 200 shown", then term articles
(name, area keys, definition with hover links, examples, cases,
related, source link, "Used by" indicator ids), and an indicator panel
beside the list. Problems:
Only 200 terms render; no paging or "more" (
glossary/page.tsx
line 96; Part 1 fact 3).
43 chips in one row (INVENTORY §12); area keys like "BO · HO" in
term headers mean nothing to a newcomer.
Duplicate definitions lost (Part 1 fact 2).
"Related" and "Cases to look up" are plain joined text, not links
(lines 76–78).
Hard-coded colours in 
globals.css (
.gl-term #1c262b,
#caaf9c) outside any token set; the page uses the old long-page
layout with the navbar.
The search runs on every keystroke with no debounce and writes ?q= on each key (line 109).
The job. Let a reporter look up a word they met in a document, a Red
Flag or a source in under five seconds, see it in plain words with the
area it belongs to, and jump to the indicators that use it.
Front and centre (dashboard). Nothing as a tile: the glossary reaches
the dashboard through hover cards (§2) and 
⌘
K. The one dashboard
element is a quiet count in the Learn corner: "12 flip cards due" (§6).
Redesign.
Place: a tab of the whole-screen Learn feature ("Catalogue ·
Glossary · Practise · Guides"), reached from 
⌘
K, the left edge
(Learn under the case's stage list), and every hover card's "open".
Edge navigation hidden, thin handle shown (UX C2.1). Layout: left, an A–Z rail (letters with counts, sticky), centre a
virtualised list of term rows (one line each: term, first sentence,
area dots), right the open term as a reading card (the calm zone,
LOOK B5). This replaces the 200 cap: the list is "made for
scrolling" (Ony's rule), so wheel scroll is allowed here.
Area filter: one "Area" button opening a grouped picker (six
families from the catalogue map, §3), not 43 chips; chosen areas
Redesigning the investigation workbench 198 / 252
show as removable pills in an "Active selections" bar with Clear
(UX C3.8).
Several definitions: when areas define a term differently, the card
shows "Defined in 7 areas" with a tab per area definition, the
reader's own case areas first. Backend must stop dropping them
(Needs).
Related and cases as links: related terms are chips that open in
place; cases open a small case card with the outcome label in its
own style ("Alleged in reporting" dashed, as 
indicators.md
requires).
Hover: a row lights on pointer and shows its full definition in the
right card after a 120 ms dwell (no click needed); click pins it.
Motion: 
motion.feedback 160 ms crossfade of the card; no
movement of the text itself (LOOK B5).
States: empty search 
→ "No term matches 'nominee dirctor'. Did
you mean nominee director?" plus "Search indicators instead";
loading 
→ three skeleton rows after 300 ms; error 
→ one line in
the list with Retry; very large 
→ virtual list (2,116 rows is small for
virtualisation).
Keyboard / screen reader: / focuses search; ↑↓ or J/K move;
Enter pins; letters on the rail are a 
nav with 
aria-current
; the list
is a 
listbox with 
aria-activedescendant
; the open card is an article with a heading.
Status grammar: glossary terms have no certainty; "Alleged in
reporting" uses the not-yet-shown dashed style, never red (LOOK
B1; 
indicators.md "never as a finding").
Innovation.
1. "Words in this case": a filter that shows only terms found in the
case's own passages, with counts ("nominee director · 14
passages"); clicking a count opens those passages. It turns the
glossary into a reading aid for the case at hand.
2. Disagreement shown, not hidden: when areas define a term
differently, a one-line "Areas differ on this word" note with the
differing part highlighted, because the meaning of "shell
company" in tax fraud is not the same as in environmental crime.
Built on. UX C3.8 (active selections bar), UX C5 (scroll-over rule),
LOOK B4/B5 (reading card, mono for ids), VIZ B (certainty grammar),
BRAND D10 ("avoid jargon or explain it once"), [R1] (counts in
brackets on dense lists).
Needs. Backend: keep every definition per area (
_glossary() merge
returns 
definitions: [{area, text, source_url}]
); 
terms_in_case
endpoint (term 
→ passage ids). Frontend: a virtual list — @tanstack/react-virtual would be [ADR]; a plain windowed list by
hand needs none. Open question for Ony: should the glossary be
public on the product site (BRAND C5) with the same URLs?
2. The dictionary: hover cards for terms in text
Today.
GlossaryText finds catalogue terms in a string and marks the
first use of each with a link; pointing or tabbing shows a fixed-position
card (portal) with the term and definition and "Open it for the full
entry"; clicking goes to 
/glossary?q=…
. Used in Red Flag cards and
the drawer and on the glossary page only (
red-flags-panel.tsx
, glossary/page.tsx
). Problems
(
frontend/features/glossary/glossary-text.tsx
):
The card cannot be reached. It hides on 
mouseleave of the term
(line 69), so the pointer can never move into it; WCAG 1.4.13 asks
hover content to be hoverable, dismissible (Esc) and persistent.
No Esc handling.
Redesigning the investigation workbench 199 / 252
No dwell delay: it opens on every pass of the pointer (line 69).
[R3] notes that accidental hovers are why Wikipedia set a dwell
time.
Placement: always below the term (
top: box.bottom + 6
), so
near the bottom of the screen it runs off; width 320 px hard-coded
and 336 px in the maths (lines 65, 500 in 
globals.css 
).
document.body
One portal per marked term stays mounted in 
(line 71), so a long Red Flag list adds hundreds of hidden nodes;
the long regex is built from every name in one alternation (line
30).
href=/glossary?q= 
), losing the reader's
Clicking leaves the page (
place (UX C2 "keep your place").
Not used in documents, passages, claims, To check, Chain of
Custody, AI drafts.
The job. Explain a technical word exactly where the reporter meets it,
without leaving what they are reading.
Front and centre. Not a tile; it is everywhere text is. On the
dashboard, terms in the centre review card and in the strongest Red
Flag summary are marked.
Redesign.
Mark: a dotted underline in accent-1 (amber) only on the first use
per block, as today; in the reading room (documents), marks are
off by default and switched on with a "Explain words" toggle, so
evidence text stays unmarked (LOOK B5 calm zones).
Open: after a 300 ms dwell on pointer, at once on keyboard focus,
on tap on touch (UX A6, 
Pricing page best practices
: hover fails on
touch). Opens with 
Card contents (from [R3]): term (bold), the area it comes from, a
two-to-three-line definition, "Defined in 3 areas" if so, related
terms as small chips, and a bottom row: "
↵ open · Esc" and a cog
that links to the setting that turns hover cards off.
Behaviour: hoverable (the pointer may move into the card; it stays
while inside), dismissible (Esc), persistent until leave or Esc
(WCAG 1.4.13). Flips above the term when there is no room
below; max width 360 px; follows text size.
Open in place: Enter or click opens the term as a side panel over
the current view, with a crumb "Back to Red Flags" (UX C2 "cross
feature jumps keep your place"). Shift-click opens the full Learn
feature.
One card element: a single shared popover (native 
popover
attribute, UX C7) re-filled per term, not a portal per term.
States: terms not loaded 
→ plain text (as today, good); a term with
no definition 
→ no mark.
Screen reader: the term is a button with 
aria-describedby
role="tooltip"
pointing to the shared card's text; the card is a 
while hovering and becomes a labelled dialog when pinned.
Innovation.
1. Learn-as-you-read: each card has "
＋ Flip card"; terms a reporter
opens three times are offered as flip cards automatically (§6), so
the dictionary teaches over time.
motion.reveal (240 ms ease-out-expo fade +
4 px rise); closes 180 ms.
2. Case-aware definition: if the term names something the case
already has (e.g. "nominee director" and the case holds a
Directorship marked nominee), the card adds one line "In this
case: M. Ross, director of Harbour Nominees" linking to the
record.
Redesigning the investigation workbench
200 / 252
Built on. [R3] (Page Previews card, dwell, cog, keyboard), UX C1.4
(nothing only on hover), UX C2 (keep your place), UX C7 (native
popover), LOOK B5 (calm zones), BRAND D10 (tap tooltips).
Needs. No package (native 
popover and CSS anchor positioning with
a JS fallback). Backend: the hint endpoint returns all definitions per
term and a stable term id (today the key is the lower-cased name).
Setting: "Explain words: on / off / only in Learn". Open question:
should marks appear in AI drafts? (Proposal: yes, because drafts are
read, not evidence.)
3. The indicator catalogue: 42 areas, 2,946
indicators (the catalogue explorer)
Today. The catalogue exists as 42 YAML files and appears in five
places: the glossary's 43 chips, the indicator panel on the glossary
page, Red Flags, the investigation-type picker (42 area cards in a
grid), and To check items (INVENTORY §7). There is no page that
shows the catalogue as a whole. Problems: no overview of what the
42 areas are or how they relate; the 2,946 indicators can only be
reached one id at a time (Part 1 fact 4); the cross-hint map between
areas is "not shown anywhere" (INVENTORY §7) even though the
data holds it (e.g. HO 
→ PM 40 times, HR 
→ SF 21, FR 
→ ML 15, BO 
→
CO 8).
The job. Let a reporter see what kinds of wrongdoing the app knows
about, find the indicators that matter to their case, and understand
why each one is a sign and how it could be innocent.
Front and centre. On the dashboard's Act module: "This case touches
3 areas: Hidden ownership · Money laundering · Corruption" as three
small area dots that open the explorer filtered to those areas.
Redesign (mockup KNOWLEDGE_KEEP_1). A whole-screen feature,
Learn › Red Flags catalogue, three panels on the board with drop
shadows, edges hidden with a thin handle on the left (Case) and
bottom (filmstrip).
Panel A, the catalogue map. 42 areas as circles sized by number of
indicators, grouped into six families (Money & companies; People
& violence; State & power; Health & environment; Information;
and Your safety, set apart and dashed in accent-2 because SA is
about danger to the reporter, not wrongdoing — 
indicators.md
).
Areas that fire in this case carry a dashed Strong-coloured ring.
Selecting an area draws its "may also point to" lines to other areas
with the count on each line; unrelated areas dim. Below the map,
the area card: name, one-sentence scope, counts by how it can be
checked (records / lookups / person), and the case's flags in that
area with level chips. Panel B, the indicator list of the chosen area: id (mono), name, and
a how-checked glyph (
◫ records, 
⇄ lookups, 
◉ a person); filter
chips with counts in brackets style ("Fire here 3", "Lookups 27"); a
fired indicator shows its level meter inline. The list scrolls (made
for scrolling).
Panel C, the indicator page (§4). Top bar: breadcrumb (always visible, UX C2.3), 
⌘
K search over
indicators and terms, a Map / Table / Cards switch (Table = an
ATT&CK-style matrix, [R1]: one column per family, one cell per
indicator, counts in brackets; Cards = the flip cards), and "Practise
· 12 due".
Scroll-over: over the map, the wheel steps through areas in
reading order (each step selects and draws its lines), per the VIZ B
rule "grids and matrices: the wheel moves the lit row"; over the
Redesigning the investigation workbench 201 / 252
list, the wheel scrolls the list. A "scroll to step" hint shows the
first three times.
Hover: an area shows a small card (name, count, how many fire
here, "BO points here 7 times"); an indicator row shows its
definition as a preview in panel C after 300 ms without changing
the selection.
Motion: selecting an area: the circle fills and its lines draw from
the area outward over 
motion.transform 450 ms; unrelated
circles fade to 55% over 160 ms; panel B's rows slide in along the
list axis with a stagger capped at 8 rows (UX C4 rule 2). Reduced
motion: lines appear at once; no stagger.
States: empty filter 
→ "No indicator in Hidden ownership is
checked by a person and fires here" + Clear; loading 
→ the map
draws from cached 
/areas counts at once (the data is static) and
the list shows skeleton rows; error 
→ the map still works from
cache; very large (an area with 205, HR) 
→ the list virtualises, the
map is unchanged.
Keyboard / screen reader: the map is a 
listbox of 42 options in
family order, arrows move, Enter opens, each option reads
"Hidden ownership and shell companies, 63 indicators, 3 fire in
this case"; a "Show as list" link gives the same data as a table (UX
C7: every canvas has a list view). Tab order: map 
→ list 
→ page.
Status grammar: Faint / Strong / Textbook chips with 
▮▯▯ / 
▮▮▯ /
▮▮▮ and the word (LOOK B1); "fires in this case" is a dashed ring
plus the word in the hover card; the Safety family uses accent-2
and a dashed outline, never the flag reds.
Innovation.
1. The case as a layer ([R2]): the map and the table can be coloured
by "this case" (which indicators fire, which were checked and do
not, which cannot run yet) — a coverage view of what has and has
not been looked for, so absence of a flag is not mistaken for
absence of wrongdoing.
2. "One fact away": in the list, indicators that would fire if one more
fact were known are marked with a hollow meter and the missing
fact ("needs: registered address of Fernhill Ltd"), linked to the
lookup that would supply it (builds on the planned "one fact away"
gaps, INVENTORY §11).
3. Cross-hint walk: from an indicator, "may also point to" lines can
be followed area to area, building a breadcrumb trail of reasoning
that can be saved to Leads.
Built on. UX C2 (edge navigation, breadcrumb), UX C3.1 (content
inventory), UX C4 (motion tokens and stagger), VIZ A1 ("the key stays
on screen"; "big diagrams get split"), VIZ B (scroll-over rule, certainty
grammar), LOOK B1, BRAND C5 (42 area cards in one template, signs
vs innocent table), [R1], [R2].
GET /api/catalogue/areas/{key}/indicators (id,
GET
Needs. Backend: 
name, checkable, status, levels set or not); 
/api/catalogue/cross-hints (area 
→ area counts); 
GET
/investigations/{id}/catalogue-layer (per indicator: fires,
checked-not-shown, cannot-run with reason, one-fact-away). The six
families are new data: a small 
families.yaml (Ony to approve the
grouping). No package: the map is static SVG (42 circles, under 100
lines; AI B5 reasoning on SVG). Open question for Ony: the family
names and grouping I used.
4. The indicator page
Today. The glossary's side panel (
"pending checks", name, definition, Levels as a 
IndicatorDetail 
): id, area,
dl 
, "Numbers from:",
"About the numbers", Could be innocent, What it looks like, How it
Redesigning the investigation workbench
202 / 252
can be checked, Data needed, Sources with quotes and "Quote not
yet confirmed" in error red, Cases with outcome labels, This may also
point to, Where it applies. Also shown in part in the Red Flag drawer.
Problems:
One long column of eleven sections in a sticky aside
(
globals.css .gl-detail
), mostly text.
"To be set by Ony" printed as a level (Part 1 fact 1).
"Could be innocent" comes after the levels and before examples;
there is no visual pairing of signs and innocent explanations,
though 
indicators.md says innocent explanations are "always on
the card, above the evidence".
An unconfirmed quote is styled as an error (
sv-error
), which
reads as "something broke", not "not yet checked".
Cross-hint 
target_area shows the raw key (e.g. "CO"), and the
links are bare "source".
No "what happens if I check this": the lookup sources are listed,
but not what would leave the computer.
The job. Answer, for one sign: what it is, how strong each level is and
on whose numbers, how it could be innocent, where it comes from,
and how to check it in my case.
Front and centre. In the dashboard's Act module, the strongest Red
Flag shows its indicator name, level chip and the first innocent
explanation; that card opens this page.
Redesign (mockup KNOWLEDGE_KEEP_1, panel C).
Header: id · area · 
✓ verified (or "
○ pending checks" dashed) ·
version; the name in the display face (LOOK B4: display only for an
opened Red Flag).
Definition in the reading face with hover-card terms (§2).
In this case (only when the case has data): one line with the
record, value and source with its fetch date, and the level it
meets, followed by "Records show the address, not who is behind
it" (BRAND D1 "say what is shown").
Level ladder: three steps side by side, Faint 
▮▯▯ / Strong 
▮▮▯ /
Textbook 
▮▮▮
, each with its threshold; an unset step is a dashed
empty box saying "No published number yet. Shown as 'not set',
never guessed"; the step this case meets has a "THIS CASE" tag
and outline. "Numbers from" moves into a hover on each step. Two columns of equal weight: "
✓ Could be innocent" (left, first)
and "
▲ Signs: what it looks like" (right) — BRAND C5 ("signs /
innocent explanations two-column table"), BRAND D8 ("respect
the accused"). Checked by: records / lookups / a person, the lookup sources, and
an outbound line in accent-2 "
↗ Checking sends the address to
OpenCorporates" (UX C9: "one line next to every input that sends
data out"). Sources: the first quote in the reading face with locator in mono
and "
✓ quote confirmed" or "
○ not yet confirmed" (dashed, not
red); "4 sources" opens all. Case: name, place, year, and the outcome label in its own style ("
○
Alleged in reporting" dashed). Actions (bottom, one primary):
Check this in my case (runs or
queues the check), 
＋ Flip card, 4 sources, Suggest change
(BRAND C5 "Suggest an indicator" with required source).
Hover / scroll: the page scrolls only inside itself when long
(reading surface); terms have hover cards; sources expand on
click. Motion: opening from a list row or a Red Flag uses a shared
element move of the title (UX C4 rule 1), 450 ms; the ladder's
Redesigning the investigation workbench 203 / 252
"THIS CASE" outline draws once. Values never animate (UX C4
rule 5).
States: pending indicator 
→ a dashed banner "Pending checks: not
used for Red Flags yet"; no case data 
→ the "In this case" box is
replaced by "Not checked in this case yet · Check now"; error 
→
the cached YAML copy (the catalogue is static) with a "may be out
of date" line. Keyboard / screen reader: headings per section; the ladder is a list
of three items each read as "Strong, two of three, more than 100
companies at one address, this case meets it"; actions reachable
in order.
Innovation.
1. Innocent explanations as checkable items. Each innocent
explanation has a small "Check" that turns it into a To check item
("Is 14 Quay Street an accountant's or agent's office?"), so the
reporter tests the innocent reading as hard as the guilty one.
2. Threshold provenance in place: pointing at a threshold shows the
exact quote and page that sets it (the data already holds threshold_source and the sources' quotes), so "more than 100"
is never a number without a source (BRAND B1).
Built on. LOOK B1, B4, B5; UX C4, C9; VIZ E (check results with plain
words; "not seen" is never "shown"); BRAND C5, D1, D8; indicators.md (innocent explanations first; outcome labels).
Needs. Frontend only for layout. Backend: the "In this case" values
per indicator (from the catalogue layer, §3). Decision for Ony: how to
show the 2,673 unset Faint and 2,661 unset Strong levels. Proposal:
hide the wording "To be set by Ony" everywhere and show "not set";
in Ony's own operator view, list them as a to-do with counts per area.
5. Behind the catalogue: what is not shown
anywhere
Today. Not in the app: 64 pending indicators, 7 detection specs and
14 detector families, the 1,581-row detection classification, the
coverage report, the printed catalogue PDF
(
tools/catalogue_pdf.py
) and the cross-hint map (INVENTORY §7).
The job. Let a careful reporter (and Ony) see how the app decides:
which indicators can run on records today, which wait for lookups,
which only a person can judge, and where the catalogue's sources are
old.
Front and centre. Nothing on the dashboard; one line in the Red Flags
module stays as today ("N of M checks ran").
Redesign. A fourth tab in Learn, How it decides: (a) a stacked bar per
area of how indicators are checked (records, lookups, person) and
how many have a running rule ("BO: 5 of 19 record-checkable have a
rule"); (b) the 14 detector families as cards with the plain question
each asks ("cycle: does ownership loop back?"); (c) pending
indicators in a dashed list; (d) "Sources older than a year" from the
coverage report; (e) "Download the catalogue (PDF)". Calm, text-and
table surface, no motion beyond hover. Keyboard: tables with
headers.
Innovation.Method card per flag: every Red Flag gets a "How this
was found" link to its detector family card and spec version (the data
model already stores spec and version on each flag), which answers
an editor's "how do you know?"
Built on. BRAND B7 ("methodology in public"), VIZ A1 (one question
per diagram), UX A8 (Stanford #1: easy to verify).
Needs. Endpoints for detection specs/families and classification
(read-only). The PDF can be served as a static file. Open question:
Redesigning the investigation workbench 204 / 252
should this tab be visible to every reporter or only in an "advanced"
mode?
6. Learning and help: flip-card learning mode,
guides, first-run tutorial
Today. None built. Planned: flip-card learning mode (BRAND C5, from 30 team-building activities
), learning guides "how to be an
investigator, a journalist, an investigative journalist" (
README.md
, Ony
8 Oct: "not started; to be planned after the catalogue"), a first-run
tutorial that asks for each setting (INVENTORY §11). The only help
today is static text on 
/about and long muted descriptions under card
titles (INVENTORY §12).
The job. Let a newcomer learn the signs of wrongdoing and the
method without a newsroom, at their own pace, and let everyone find
help about the screen they are on.
Front and centre. A small "12 flip cards due" count in the dashboard's
corner (bottom-left corner holds settings, UX C2.1; Learn sits beside
it). The first-run checklist shows on the dashboard until done.
Redesign.
Practise (flip cards) in Learn. Front: the sign as a short scene ("A
company's registered address is shared with 212 other
companies"). Space flips. Back: the indicator name, level,
innocent explanations first, and the source. The reporter answers
Again / Good by default (two buttons, [R4] simple mode), with
Hard / Easy behind a setting; keys 1–4 as in [R4]. Decks: "My case's
areas", any area, "Terms I opened", "Safety". The flip is a 3D card
turn of 450 ms (
motion.transform
); reduced motion: crossfade
120 ms.
Field guide on the right edge (from [R7]): on any screen, the right
edge's handle (when nothing is selected) opens a short guide for
that screen — what it is for, the three keys that matter, and a link to
the method. Never a modal.
Guides (later, per Ony): chapters as story-mode pages (VIZ D11
storyboard; BRAND C8), each ending with "Try it on the sample
case". The sample case (Kestrel SA / Harbour Nominees) is the
textbook, labelled "teaching case" (UX C3.7).
First-run tutorial: five steps, each a real choice with equal-weight
buttons (UX C9, no pre-selected options): 1 Theme and effects; 2
Outside lookups (off / ask / automatic) with the "what leaves" line;
3 Research automation; 4 Private AI (local or none); 5 Open the
sample case or start your own. Progress dots; Skip always visible;
every choice can be changed later in Settings. Zooniverse's advice
"keep your tutorial as short as possible" ([R7]). States: no cards due 
→ "Nothing due. Next in 2 days · Practise
anyway"; empty deck 
→ "Open a term and press 
＋ Flip card". Keyboard: Space flip; 1/2 (or 1–4) answer; Esc leaves; the card's
two sides are read in order.
Innovation.
1. Cases as exercises: a deck built from the catalogue's real cases
("Leeds business centre, 2018") where the front is the case's
facts and the answer is which indicators it shows and at what
level, with the published outcome label.
2. "Teach-back" before a check: the first time a reporter decides a
To check item for an indicator, one flip card for it is shown first
(skippable) — the method is learnt at the moment it is used.
Built on. [R4], [R7], UX C3.7 (sample case), UX C4, VIZ D11, BRAND
C5, C8, D10.
Redesigning the investigation workbench 205 / 252
Needs. Store for review state (per reporter, local): a small table learning_cards (term or indicator id, due date, interval). A
scheduling algorithm: a simple fixed-interval ladder needs no
package; using an FSRS library would be [ADR]. Guides content is
Ony's to write. Open question: should practice history be in backups?
(Proposal: yes, as personal data, excluded from team sharing.)
Part 3. KEEP, SAFETY AND ADMIN
7. Safety & data: one home for Keep (mockup
KNOWLEDGE_KEEP_2)
Today. Keep is three cards at the bottom of the long page (backup,
deletion, a folded security block inside the backup card), with more
on 
/settings and in the backend console (Part 1 fact 6; INVENTORY
§12 "Security and settings are split").
The job. One place that answers, at a glance, "Is my case safe on this
computer, is it backed up, and what has left it?"
Front and centre. The dashboard's Keep chip (bottom-left corner):
"Backed up 3 days ago · 39 requests left this week · 0 documents". It
turns amber only when the backup is older than a set age or
something unusual left; it never uses the alarm red except for a
Strong or Textbook safety notice (UX C3.5 "one alarm colour").
Redesign. A whole-screen feature Keep › Safety & data with four
parts (see mockup):
What lives where (left, large): a diagram of This computer as a
bordered region holding six stores — Case records, Documents &
pictures, Backups, Service keys, Security log, Private AI — each
with a count, a plain line on where it is, and whether it is in
backups. Outside the border, the services the case can reach
(OpenCorporates, OpenSanctions, OpenAleph, outside AI), each
with its mode chip (Off / Ask first / Automatic, the planned switch,
INVENTORY §8) and a line labelled with what is sent and how
many times ("names, addresses · 31"). Lines that are off are
dotted and grey; a blocked one carries 
✕
. Above it, totals with
zeroes stated: "39 requests left this computer · 3 services · 0
documents sent out · 0 AI calls outside" ([R5] summary). A period
switch: Today / 7 days / 30 days / All.
Keep cards (bottom): Backup, Who can reach it, Housekeeping
(stray files), Delete this case — equal size, one action each (§8
§12).
Your safety (right, top): §13.
Outbound log (right, bottom): §14. Hover / scroll: pointing at a line lists its last requests in a hover
card; pointing at a store shows its path and size. The page does
not scroll; the outbound log scrolls inside.
Motion: none decorative on these surfaces (LOOK B5 extends to
safety: calm, exact — BRAND D9). In Rain Noir the bokeh stays on
the ground only. A new request draws a single short pulse along its
line (300 ms, 
motion.trace
), off under reduced motion.
States: first run 
→ stores show "empty" and lines "never used";
loading 
→ last known numbers greyed with "checking"; backend
down 
→ "Can't reach the server on this computer" with what still
works.
Redesigning the investigation workbench 206 / 252
Keyboard / screen reader: the diagram has a table twin ("Store,
where, size, in backups"; "Service, mode, what is sent, count")
and each line is a focusable item.
Corner: 
Hide screen top-right (UX C2.1), Shift+Esc: swaps the
view for a plain blank page until a key is held.
The file name uses the id, not the case name (
investigation
<uuid>.jwbackup.zip 
, line 61).
Innovation.
1. "What leaves" shown, not claimed: the line counts come from a
real request log (§14), so the promise "your files stay on your
computer" (BRAND C1) is verifiable on screen.
2. Per-case exposure score in words: "This case has sent 4 names
and 2 addresses to 2 services" — the exposure summary a reporter
can paste into a source-protection note.
Built on. [R5], UX C2.1 (corners), UX C3 (front and centre, one alarm
colour), UX C9 ("what leaves the machine"), LOOK B5, BRAND B2/B3
("local-first data, shown not claimed"), BRAND C6.
GET /api/settings/data-map (counts, sizes,
Needs. Backend: 
locations, which stores are in backups); the outbound log (§14). Open
question for Ony: should "Hide screen" also lock (require the session
token again)?
8. Backup and restore
Restore is disabled with no reason when the server's restore API
is off (line 125: 
disabled={… || !preview.restore_api_enabled} 
)
— the preview says "Restore API: disabled" in a grey line only.
Restore also needs a global admin on the server
(
routes_backups.py 
) with no message in the UI.
Developer words: "FollowTheMoney JSONL", "provenance
lineage", "destination document paths" (lines 109, 115).
The security block is nested inside this card as 
children 
.
The job. Make a complete copy of the case that can be kept
somewhere safe and brought back, and know it worked.
Front and centre. "Last backup 3 days ago · 
✓ checked" on the Keep
chip; "Back up now" one click away.
Redesign.
Card (Safety & data): "Last backup 3 days ago", size, "
✓ checksum",
one plain sentence ("Records, documents and history in one file.
Restore makes a separate case; never merges."), Back up now
(primary) and Restore… (outline).
Back up now opens a small panel: what goes in (with counts), a
choice "Protect with a passphrase" (proposed default on, see
Needs), where to save, and the name 
harbour-land-2026-10
Today. "Download backup" (always with documents) and "Restore
safely": pick a file, Preview, read counts / lineage / warnings /
conflicts, tick "I understand this creates a separate investigation",
Restore (
backup-panel.tsx 
). Problems:
Not encrypted (Part 1 fact 5); nothing says so.
No memory of when the last backup was made, so nobody can tell
if one is overdue.
Redesigning the investigation workbench
10.backup.zip 
. Progress bar with stages ("Collecting records ·
Copying 86 files · Checking"), not a spinner (UX A5).
Restore… is a three-step side panel: 1 choose file 
→ 2 what is
inside (counts by kind, documents present or missing, passes or
fails each check with a plain word) 
→ 3 restore as a new case
named "Harbour land (restored 10 Oct)". If restore is switched off
207 / 252
on the server: the Restore button stays visible but says why and
how to switch it on (UX C6 "disabled controls say why").
Success: "Restored as a new case · Open it" (toast with Open, UX
C6).
Motion: panel slides from the right (
motion.reveal
); the progress
bar is real progress.
Keyboard / screen reader: steps are a labelled list with 
aria
current="step"
; results are announced in a polite live region.
Status grammar: checks read 
✓ passes / 
✕ fails / 
○ not checked.
Innovation.
1. Backup reminder that respects the reporter: a setting "remind
me after 7 days" shows only on the Keep chip, never as a pop-up.
2. Restore drill: "Test this backup" restores into a throw-away space,
compares counts, and deletes it — so a reporter knows a backup
works before they need it.
Built on. UX A5 (progress, success words), UX C6, C9 ("equal-weight
choices on deletion, backup and restore"), [R6] ("Back up all your
devices"), BRAND B2 ("what backups keep").
Needs. Backend: store 
last_backup_at per case (a backup event); a
passphrase-encrypted archive — encryption with an existing library
(e.g. Python 
cryptography
, if not already a dependency) is [ADR]; a restore_dry_run that cleans up after itself. Open question for Ony:
encrypted by default (safer, but a lost passphrase loses the backup)?
9. Deletion
Today. "Preview deletion" (records, owned files, shared files kept,
files already missing, the OpenAleph casefile), then type the exact
investigation id (a UUID), then "Permanently delete investigation"
(
deletion-panel.tsx
). Problems:
Typing a UUID is hard and error-prone; the case name would do
the same job.
No backup offer before deleting.
"Blocked: " shows raw path errors (line 82).
The result is a long grey sentence (line 64).
Same flow duplicated for demo data on 
/settings
.
The job. Remove a case from this computer completely, knowing
exactly what goes and what stays, with no accident possible.
Front and centre. Never on the dashboard. On Safety & data: one
outlined danger card (LOOK B1: real alarm red only on Textbook and
deletion).
Redesign.
Card: "Delete this case · Remove from this computer · See what
goes first: 4,812 records, 86 files. Shared files stay. Cannot be
undone." One outlined danger button Preview deletion.
Preview panel: three columns — Goes (records by kind, files, size),
Stays (shared files, backups you saved elsewhere), Elsewhere
(the OpenAleph casefile, and what the app will ask OpenAleph to
do). Above them: "No backup in 3 days · Back up first" (equal
weight with Continue, no pre-selection; UX C9). Confirm: type the case name ("Harbour land"), not the id; the
delete button stays danger-outlined until the name matches, then
fills.
Done: "Harbour land was deleted: 4,812 records, 86 files. 3 shared
files kept." and the app opens the next case or the empty home.
Redesigning the investigation workbench 208 / 252
Motion: none on the danger step (no countdowns, UX C9); the
panel slides in 240 ms.
States: blocked by an unsafe path 
→ "One document's file is
outside the storage folder, so the app will not delete anything.
Open the file list" (plain words, a way forward).
Keyboard / screen reader: focus goes to the name field; the
button's label includes the case name.
Innovation. Delete with a sealed copy: an option "Make an encrypted
backup first, then delete" in one step, for a reporter about to travel or
hand over a laptop ([R6] "Crossing borders": back up, then remove
what you would not want accessed).
Built on. UX C1.5 ("confirmation only for permanent deletion"), UX
C9, LOOK B1, [R6], BRAND D9.
Needs. Backend: accept the case name as confirmation (or keep id
server-side and map name 
→ id in the UI); report "last backup" in the
preview. No package.
10. Access and security status
Today. A folded 
<details> "Local security/settings status" of small
grey lines: environment, database, storage path, entity-extraction
owner, allowed origins, connector key status, restore API, access
mode, token configured, denials in 24 h with lockouts and busiest
remote host (
security-panel.tsx lines 159–171). The API access
card (token) lives on 
/settings and, when needed, on the
workbench. Security alerts and an audit summary exist in the API
without a UI (INVENTORY §8). Problems: raw paths and settings
names, all equal weight; the "
⚠
" is a text prefix; it is hidden behind a
fold and exists only after the status loads (broken 
INVENTORY §5).
#access anchor,
The job. Tell the reporter, in one sentence, who can reach this case
and whether anyone tried who should not.
Front and centre. "Only this computer · 0 refused in 24 h" on the
Keep card; the alert, if any, on the Keep chip.
Redesign.
Card: "Who can reach it — Only this computer" (or "This computer
and devices with the access key"), "0 refused · 24 h", one action
"Access settings".
Access settings panel: three plain rows, each a sentence with a
status chip: "Other devices: need an access key (set)" · "Restore
from a file: allowed / switched off on the server" · "Remote access
attempts: 0 refused in 24 h". Technical details (database, origins,
storage path, extraction owner) under a "Technical details" fold, in
mono.
Alert: if denials pass a threshold, a one-line amber notice: "12
refused requests from 192.168.1.40 in the last hour · Look at the
log" — never a modal.
Session token: the API access card moves here ("Access key for
this browser: held in memory only · Forget it").
States: server unreachable 
→ "Can't reach the server on this
computer" with what to try.
Screen reader: each row is a 
dl term and value.
Innovation. "Who else could see this?" check: one button that lists,
in plain words, every way the case can be reached today (local, other
devices with a key, OpenAleph casefile if synced, backups the
reporter saved) — the reporter's own threat model in one list ([R6]
"risk assessment").
Built on. UX C6 (specific words), UX C9, LOOK B1 (status chips), [R6].
Redesigning the investigation workbench
209 / 252
Needs. Backend: security alerts and audit summary already exist
(
routes_settings.py /security/alerts
, /security/audit/summary
); a "reachability" summary endpoint. No
package.
11. Connector credentials (service keys)
Today. Inside the security fold: provider select (default "aleph"), a
password field "Paste credential", "Save local credential", "Remove
local credential", and a status sentence (
security-panel.tsx lines
173–182). Not on Settings. Problems: one select for all, no list of
which are set; "Remove" is enabled even when nothing is set; the
status sentence mentions "Active source: configured"; hidden in a
fold under Keep.
The job. Add, see and remove the keys that let the app ask outside
services, and know each key never leaves.
Front and centre. "2 of 3 set" on the Service keys store in the Safety
& data diagram.
Redesign. A list, one row per service: name, what it is for ("Company
registers"), status chip (
✓ set here / 
✓ set on the server / 
○ not set),
where it came from, last used ("2 days ago"), and one action (Add /
Replace / Remove). Adding opens an inline field with "Stored on this
computer; never shown again" beside it (UX C9). Licence and terms
link per service (BRAND B4). Lives in Settings › Outside lookups,
mirrored as a store in Safety & data.
Innovation.Key health: "OpenSanctions answered 401 twice today:
the key may have expired · Replace" — inferred from connector run
errors, shown on the row.
Built on. UX C6, C9; BRAND B4; INVENTORY §11 (settings grouped as
access, outside lookups, AI, demo).
Needs. Backend: last-used time and last error per provider
(connector runs exist). No package.
12. Unreferenced document files (stray files)
Today. "Preview retained orphan files": a count, bytes, first 20 paths,
and a warning on unsafe database paths (
security-panel.tsx lines
184–192). No way to act on them.
The job. Show leftover files the case no longer uses and let the
reporter keep, attach or remove them.
Front and centre. Only in Safety & data's Housekeeping card ("2 stray
files · 4.1 MB").
Redesign. Housekeeping card 
→ a list with file name, size, date, and a
thumbnail for pictures and PDFs; actions per file: Keep, Add back to
the case (opens The Drop with it), Delete (preview then confirm).
"Unsafe path" becomes "This file is outside the storage folder; the
app will not touch it" in plain words.
Innovation.Merge with the audit retention into one "Housekeeping"
place (stray files + log older than 90 days), so cleaning up is one calm
task.
Built on. UX C1.5, C6; INVENTORY §12 (developer words).
Needs. Backend: delete-orphan endpoint with preview; thumbnails
from existing document reading. No package.
Redesigning the investigation workbench 210 / 252
13. The reporter's Safety panel, "Your safety"
(decided: built last)
Today. Not built. The SA area (42 indicators) exists and shows only on
the glossary page. Decided (
indicators.md
): shown apart from Red
Flags so never read as findings about anyone; same engine (records,
lookups, a person); a Strong or Textbook safety indicator puts a notice
at the top of the investigation with links to safety guides; it never
blocks work; built last. All 42 SA indicators have Strong "To be set by
Ony" (Part 1 fact 1).
The job. Warn a reporter early, calmly and specifically when the story
itself raises the danger to them, their sources or witnesses, and point
them to what to do.
Front and centre. When any SA sign is Strong or Textbook: a single
slim notice at the top of the dashboard (the only place besides
Textbook flags where the alarm colour may appear, UX C3.5), e.g.
"Strong safety sign: this story concerns officials and a public land sale
· See Your safety". Otherwise nothing.
Redesign (mockup KNOWLEDGE_KEEP_2, right top).
A panel in Safety & data headed "Your safety · shown apart from
Red Flags", in accent-2 (teal), never the flag reds for its frame.
Notice at top for the highest sign: level chip + one sentence +
"This never blocks your work."
Signs from records and lookups: id, name, the evidence in one line
("From your records: Fernhill Ltd 
↔ the harbour board, 2019
sale"), level chip. Only you can say: the person-checked items (direct threats, being
followed, pressure on family, doxxing) asked as plain questions
with Yes / No / Not sure — answers stored locally, marked private,
not in backups unless the reporter chooses and never shared
with a team.
Guides: CPJ Digital Safety Kit ([R6]), "Before you travel", "Protect a
source"; links open outside only after a "this opens cpj.org in your
browser" line. Hover: each sign shows its innocent explanation ("a death may be
unrelated", from the SA scope) and its source. Motion: none; the notice appears without animation (calm).
States: no signs 
→ "No safety signs from your records. Only you
can judge the rest" + the three questions; levels unset 
→ the sign
shows "level not set" instead of a chip (until Ony sets SA levels). Keyboard / screen reader: the notice is 
role="status"
, not 
alert
,
so it does not interrupt; questions are radio groups.
Innovation.
1. Risk plan from the signs: one button builds a short safety plan
(who knows where you are, check-in times, what to do if you hear
nothing) prefilled from the signs, saved privately — CPJ's
"complete a risk assessment" ([R6]) made concrete.
2. Source exposure check (SA-033 "Source could be identified from
access, logs, devices or document traces"): before export or AI
drafting, list document metadata (author, software, device fields
the reader extracted) that could identify a source, with "Remove
from export".
Built on.
indicators.md (decided rules), [R6], UX C3.5 (one alarm
colour), UX C2.1 (Hide screen corner), LOOK B1 (status chips with
words), BRAND B2, C6, D9.
Needs. SA levels set by Ony; check specs for SA records items (none
exist; the check framework is built, 
detection-design.md
); a private
Redesigning the investigation workbench 211 / 252
answers store excluded from team sharing. Open question: should
answers to "Only you" questions be encrypted at rest separately?
14. Outbound log: what left this computer (new,
from planned router work)
Today. Not built. Planned with the router: "a request log of what left
the machine" (INVENTORY §11). The security audit log records
incoming requests (metadata only), not outgoing ones.
The job. Show, word for word, every piece of case data sent to an
outside service: when, to whom, what, why.
Front and centre. The count on the Keep chip ("39 requests this
week · 0 documents").
Redesign (mockup KNOWLEDGE_KEEP_2, right bottom). An append
only table: time (mono), service, the exact value sent in quotes
(accent-2), and a muted line with the kind of value, the reason
(indicator or lookup) and who started it ("you clicked" / "automatic
check"). Filters by service and period; "Export log" (CSV) for a source
protection file. Scrolls inside (made for scrolling).
Innovation.Redact before it leaves: in "Ask first" mode, the confirm
card shows the exact value and lets the reporter shorten it ("M. Ross"
instead of the full name) before sending.
Built on. [R5] ("No data is transmitted without your consent"; per-app
lists), UX C9, AI A8 (MCP consent: "users must consent to all data
access"), BRAND B3 ("Show the list of outbound calls a case has
made").
Needs. Backend: an 
outbound_requests table written by every
connector and AI call (service, value sent, reason, actor, time); this
changes backup/export content 
→ [ADR] for the data model. Open
question: keep the log in backups? (Proposal: yes, it is part of the
chain of custody.)
15. Security audit log
Today. Inside the fold: "Load recent security events" (100 at a time,
"Load 100 older events"), "Preview 90-day retention", type "PRUNE
SECURITY AUDIT", "Prune old audit records"; summary lines by
method and status; each event a grey line "timestamp · method path ·
status · event · local/remote" (
security-panel.tsx lines 194–215).
The backend console's Logs section also tails it.
The job. Let the reporter (or an admin) check who reached the server
and whether anything was refused, and keep the log from growing
forever.
Front and centre. Only through the access card's "0 refused · 24 h".
Redesign. The Security log store in Safety & data opens a table: time,
from (this computer / another device with address), what was asked
in plain words ("opened case list", "downloaded a backup"), result (
✓
allowed / 
✕ refused), with a filter "Refused only". Raw method and
path under a "Technical" toggle. Retention moves to Housekeeping:
"Keep the log for 90 days · 0 older entries · Remove older" — with
type-to-confirm kept, as today, since it is permanent.
Innovation.Plain-language events: map routes to sentences ("GET
/api/investigations/{id}/export" 
→ "downloaded a backup of Harbour
land"), so the log is readable by a reporter, not only a developer.
Built on. UX C6, INVENTORY §12 (developer words), BRAND D4 (one
name everywhere).
Needs. A route 
→ sentence table in the frontend (or the API). No
package.
Redesigning the investigation workbench 212 / 252
16. Settings (page) and where things move
Today.
/settings
: four cards: API access, Operator console, Private
AI (read-only status sentence), Demo mode (seed, hide per browser,
delete). Its own comment says other settings stay on the workbench
for now. Problems listed in INVENTORY §12 ("Security and settings
are split"); 
describeAiStatus shows environment-variable names to
reporters ("ENABLE_AI_FEATURES is off", "OLLAMA_MODEL must
name a model").
The job. One place to change how the app behaves, grouped by what a
reporter thinks about.
Front and centre. A cog in the bottom-left corner (UX C2.1); nothing
else.
Redesign. Settings as a whole-screen feature with four groups (the
planned grouping, INVENTORY §11) plus two: Look (theme gallery
and effects, LOOK D3), Access (§10), Outside lookups (keys §11, per
service mode, research automation), Private AI (status in plain words
— "AI drafts are off on this computer" — with the technical line under
a fold; run-profile defaults from AI B3), Learning (hover cards on/off,
flip-card reminders, single-key shortcuts on/off per WCAG 2.1.4, UX
A2), Demo data. Every setting shows one line about what it changes
and, where relevant, what leaves the computer.
Innovation.Settings search inside ⌘K ("lookups", "theme") opening
the exact row.
Built on. UX C2.2 (one 
⌘
K for everything), LOOK D3 (theme gallery),
AI B3, INVENTORY §11.
Needs. None new beyond the endpoints above.
17. The operator console (and the /console
wrapper)
Today. A separate backend-served app (12 sections: Overview, Data,
Schema, Query, API playground, Users & Roles, Backups, Tests, Logs,
Checks, Config, Activity), loopback only, embedded in 
/console as an
iframe with a top bar "JOURNALISM WORKBENCH · BACKEND
CONSOLE" and "
← workbench" (
frontend/app/console/page.tsx
; docs/opsconsole/DESIGN.md
). The navbar shows a "backend console"
badge to every user. Problems: it is a developer tool shown in the
reporter's navbar and footer; it duplicates Backups and Users that
reporters will also need; its look is its own (
console.css
); the
wrapper drops 
?inv=
.
The job. Give Ony (or a newsroom's technical person) full control of
the server; keep it out of a reporter's way.
Front and centre. Not on the dashboard. Reached only from Settings ›
Advanced › "Operator console (this computer only)" and 
⌘
K for users
with the admin role.
Redesign. Keep the console as a separate tool (it is reusable by
design, DESIGN.md §0) but: remove its badge from the navbar and
footer; open it in its own window rather than an iframe under the app
chrome; give it the active theme's tokens by passing 
data-theme (the
console reads CSS variables), so it looks like the same family; every
reporter-facing task it holds (backups, users) gets a reporter-facing
screen in the app (§8, §18) so the console is never required for
normal work. Its Activity view (before/after with undo) is a model for
the team "who changed what" view in §18.
Innovation."Explain this setting": the console's Config section links
each setting to the plain sentence the app's Settings uses for it, so
the two never drift.
Redesigning the investigation workbench 213 / 252
Built on. UX C2.1 (rare things in corners), UX A1 ("same place, same
mechanism"), LOOK D1 (tokens across surfaces).
Needs. Small: theme handshake (a query parameter or postMessage);
remove nav links. No package.
18. Multi-user, team admin and community (later)
Today. Backend has app users, investigation membership (viewer,
reporter, admin) and per-user tokens with no workbench UI (console
only); ADR-0002 still Proposed (INVENTORY §11). Decided: several
people on one investigation, per-user private or shared notes, shared
tag vocabularies, no live co-editing for now; "polish the whole app
before multi-user"; admin and project-management tools after; then
a Reddit-like community (lead investigators, roles and moderation,
open or restricted joining by locality or stats, stats and badges, posts
asking others to look, the app opening investigations on major
events) (
README.md
).
The job. Let a small team share one case safely, see who did what,
and later let the public organise around open investigations without
putting sources or accused people at risk.
Front and centre. For a team case: avatars of who is in the case on the
case title, and "Since you were last here: 6 changes by 2 people" on
the dashboard (VIZ D13 re-entry strip).
Redesign.
People in this case (Keep › People): rows of person, role (Viewer /
Reporter / Lead), last active, and actions (change role, remove,
rotate their key). One Lead per case, as Zooniverse has one Owner
([R7]); roles as plain sentences of what each can do. Invites by
one-time code (local-first: no email server required).
Private and shared: every note, tag and Safety answer shows a
small "private" or "shared" mark; Safety answers and source
identities are private by default and cannot be shared (VIZ "a
private mode for source identities").
Who changed what: a case history with person, time, before/after
and undo where allowed — modelled on the console's Activity
(§17); AI and connector actions appear as named actors (AI B1.4).
Team decisions: hidden vote then reveal for "is this claim
shown?" (VIZ A4, D12); one recorded decider per claim (VIZ
"RAPID … one recorded decider").
Community (much later): an open investigation has a lead, roles
taken from Zooniverse's tested set ([R7]): Lead, Contributor,
Expert (whose checks count as "gold"), Moderator, Tester,
Translator; a per-subject discussion like Zooniverse Talk's "single
dedicated conversation for each subject", here one thread per
claim or party; visibility states private / invited / open, live / in
development ([R7] Visibility). Stats and badges count checked
work (claims moved to supported with sources, innocent
explanations tested), never accusations.
Safety rules for community: no Red Flag about a private person can
be posted publicly; only Strong or Textbook evidence may
headline a public post (BRAND C10 "no clickbait"); a public case
shows only shared, supported material.
Innovation.
1. Field guide per open case ([R7] Field Guide): the lead writes the
case's own short guide (what we look for, what not to do, safety
rules) in a right-edge tab every member sees.
2. Badges for care, not volume: a "tested the innocent explanation"
count is the most visible stat (AI B1.5 "measure revision rate, not
volume").
Redesigning the investigation workbench 214 / 252
Built on. [R7], VIZ A4 / D12 / multi-user patterns, AI B1.4–B1.5,
BRAND C9–C10, UX C1.
Needs. ADR-0002 decision; identity and membership UI on top of the
existing API (
routes_settings.py users and memberships);
private/shared flags on notes and tags; a hosted service for
community — a new codebase and hosting are [ADR] and a policy
question (moderation, legal). Open questions for Ony: invite by code
vs by account; whether community cases live on a server Ony runs;
which stats are public.
Part 4. Dashboard summary for this area
FROM WHAT THE DASHBOARD SHOWS WHERE
Catalogue "This case touches 3 areas" as area dots Act module
Indicator page strongest flag: name, level chip, first innocent explanation Act module
Learn "12 flip cards due"; first-run checklist until done bottom-left corner
Safety & data "Backed up 3 days ago · 39 requests left · 0 documents" Keep chip, bottom-left
Your safety slim notice only at Strong or Textbook top of dashboard
Team (later) who is here; "6 changes since your last visit" case title, top strip
Part 5. Packages and ADRs for this area
Virtualised list for the glossary and long indicator lists: @tanstack/react-virtual
[ADR] or hand-written windowing (no
ADR).
Spaced-repetition scheduler: a fixed ladder (no ADR) or an FSRS
library [ADR].
Backup encryption (passphrase): crypto library on the server
[ADR] if not already present.
Outbound request log table: data-model change that touches
backups [ADR].
Community service and hosting [ADR] and policy decisions.
Everything else (catalogue map SVG, hover cards with native popover
, Safety & data diagram) uses no new package.
Redesigning the investigation workbench 215 / 252
Part 6. Questions for Ony
1. Unset levels: 2,673 Faint and 2,661 Strong are "To be set by Ony",
including all 42 SA Strong levels. Show as "not set" and keep a to
do list in your view?
2. Approve the six area families on the catalogue map, or name your
own.
3. Glossary duplicates: show every area's definition (proposed) or
pick one?
4. Encrypted backups by default, with the risk of a lost passphrase?
5. "Only you" safety answers: kept out of backups unless chosen
(proposed)?
6. Should "Hide screen" also lock the session?
7. Is the operator console only for you, or for newsroom admins too?
8. For community: invite codes or accounts; where community cases
are hosted.
Redesigning the investigation workbench 216 / 252
The product website
What the app is, the goal, who made it, and why anyone should trust it — for
journalists, citizen investigators, newsrooms, and creators. Ony's line closes every
page: “I want justice to become something we can all help deliver.”
16PAGES
12 NAME PROPOSALS
10TAGLINES
11
Redesigning the investigation workbench 217 / 252
The home page, Rain Noir hero (product name to be chosen) — part 1 of 6
Redesigning the investigation workbench 218 / 252
The home page, Rain Noir hero (product name to be chosen) — part 2 of 6
Redesigning the investigation workbench 219 / 252
The home page, Rain Noir hero (product name to be chosen) — part 3 of 6
Redesigning the investigation workbench 220 / 252
The home page, Rain Noir hero (product name to be chosen) — part 4 of 6
Redesigning the investigation workbench 221 / 252
The home page, Rain Noir hero (product name to be chosen) — part 5 of 6
Redesigning the investigation workbench 222 / 252
The home page, Rain Noir hero (product name to be chosen) — part 6 of 6
Redesigning the investigation workbench 223 / 252
About the creator — DRAFT for Ony to edit, in Archive — part 1 of 2
Redesigning the investigation workbench 224 / 252
About the creator — DRAFT for Ony to edit, in Archive — part 2 of 2
Redesigning the investigation workbench 225 / 252
0. Today
What exists: the app has one static page, 
/about
[frontend/app/about/page.tsx]: a title "About Journalism
Workbench", one paragraph, "What makes this different" (5 cards),
"The stack, and why each piece is here" (6 cards), "For
investigative journalists specifically" (one paragraph). The footer
links About, Settings, Backend console and GitHub
[frontend/components/layout/footer.tsx].
Problems:
It is out of date: it describes the first stack (FollowTheMoney,
FastAPI, Next.js, SQLite/Postgres, claims, backup) and says
nothing of OpenAleph, the Red Flags catalogue, the charts or
Private AI (INVENTORY §12).
It lives inside the app, so a person must already have installed the
app to read why they should.
It talks about technology ("The stack, and why") before it talks
about the reader's problem (SYN_BRAND A1, "Problems, not
services").
It has no creator, no mission line, no safety page, no download
path and no audience pages.
It uses the generic 
bg-card cards with no status grammar, so the
page cannot show what "supported" or "Textbook" look like.
What to keep: the honest, sourced tone of "Provenance that
survives editing" and "Local-first, operator-controlled"; both
become the Safety page and "How it works". The in-app 
/about
becomes a short "About this app" card (version, licence, link to the
website), and the website takes over the rest.
1. New research: how the best sites open, show trust and tell a mission
Captured with 
grab.py / a first-screen shot at 1440 wide on 10 Oct
2026; captures in 
R/pages/feat-site-<name>/
. I only report what I
saw or what the page text says. Raycast's page would not render in
the headless browser (screenshot timed out waiting for fonts twice),
so for Raycast I only have the page text through a fetch.
Redesigning the investigation workbench 226 / 252
SITE
Linear
(
feat
site
linear/fir
FIRST SCREEN (WHAT I SAW)
st.png 
)
Arc (
feat
site
arc/page.p
Near-black page, a two-line headline "The
product development system for teams
and agents" caught mid-animation: the
words resolve from a blur. Below, a large,
real, dimmed product screen (an issue
"Faster app launch" with its activity log)
bleeding off the bottom edge. One light
"Sign up" pill top-right.
ng 
)
Raycast (text
only)
Signal
(
feat
site
signal/pag
A grainy blue band with a wavy edge, a
serif headline "Meet Dia, the next
evolution of Arc", a subline that leads with
"Weekly security updates, SOC 2
certification", one big dark "Try Dia 
→
"
button, a product window under it. Then a
huge press quote ("Arc is the Chrome
replacement I've been waiting for.", The
Verge).
Headline "Your shortcut to everything.";
subline "A collection of powerful
productivity tools all within an extendable
launcher. Fast, ergonomic and reliable."
"Speak Freely" in heavy black, two lines
of plain subline, one "Get Signal" button,
two phones on a flat blue field.
e.png 
)
TRUST / PRIVACY
None in the hero.
Security named in the subline,
before features.
One number with its meaning:
"Reliable." "99.8% crash-free
rate." Privacy policy, Trust Center
and DPA in the footer only.
"We can't read your messages or
listen to your calls, and no one
else can either. Privacy isn't an
optional mode — it's just the way
that Signal works." "No ads. No
trackers. No kidding."
MISSION
Implicit, in the product.
No.
Section heading "It's not about
saving time."
"Signal is an independent
nonprofit. We're not tied to any
major tech companies, and we can
never be acquired by one either.
Development is supported by
grants and donations." Footer:
"For media inquiries, contact
press@signal.org", "Brand Assets".
WHAT IT GIVES US
The headline resolves from
blur (a motion we can do with
CSS, no package). The real
product screen as the hero's
second half, dimmed, cut off
by the fold, inviting the scroll.
Sections are labelled "FIG 0.1,
FIG 0.2…" like plates in a
report.
Trust in the subline, not
hidden lower. Grain texture
on a flat colour reads hand
made. Press quotes set as
large type, attributed.
One number placed as proof
under one adjective, the
hotels.ng formula again
(SYN_BRAND A1).
Privacy said as a capability
limit ("we can't"), not a
promise ("we won't"). Who
pays for it, said plainly. A
press contact and brand
assets in the footer.
Redesigning the investigation workbench
227 / 252
SITE
Proton
(
feat
site
proton/pag
FIRST SCREEN (WHAT I SAW)
e.png 
)
Obsidian
(
feat
site
obsidian/p
Centred headline "A better internet starts
with privacy and freedom", subline "Take
control of your data with end-to-end
encryption.", two CTAs (filled "Create a
free account", outline "Compare plans"), a
grid of product tiles, then a proof strip:
"Trusted by over 100 million users and
organizations", app-store rating, press
badges.
age.png 
)
Readwise
(
feat
site
readwise/p
Dark page, "Sharpen your thinking." in
heavy white, "The free and flexible app
for your private thoughts.", a purple
button that names the visitor's own
operating system ("Get Obsidian for
Linux (AppImage)") plus "More
platforms", then the real app window with
a note and its graph view, a phone
overlapping it.
age.png 
)
Warm peach card with a serif headline
"Get the 
most out of what you read", a
highlighter-yellow mark on "highlights and
annotations", one black CTA, the real
library screen, and tilted quote cards
floating at the edges.
TRUST / PRIVACY
"no one (not even Proton) has
the technical means to access
your data without your
permission"; "Swiss privacy";
"Open source and audited …
trust is earned through
transparency and peer review."
"Obsidian stores notes privately
on your device, so you can
access them quickly, even
offline. No one else can read
them, not even us." "Obsidian
uses open file formats, so you're
never locked in. You own your
data for the long term."
Not on the first screen.
MISSION
"Proton was started in 2014 by
scientists who met at CERN…";
"our primary shareholder is the
nonprofit Proton Foundation".
Light.
No.
WHAT IT GIVES US
Primary + secondary CTA side
by side (also SYN_BRAND A2).
An origin story with names
and a year. "Open source and
audited" as its own section.
We cannot copy the user
count strip: we have no users
to count, and must not
pretend.
The closest product to ours
(local files, a graph). OS
detected download button.
"Your data on your device" +
"open formats, never locked
in" as two separate promises.
The graph is shown as the real
product, not ornament
(SYN_BRAND A3).
A highlighter mark on the key
phrase: a reading-tool
gesture. For us, the gesture is
a source chip or a "supported"
mark on the key phrase. Real
quotes as floating cards with
their author under each: our
evidence clippings with their
source lines.
Redesigning the investigation workbench
228 / 252
SITE
Datashare
(ICIJ)
(
feat
site
datashare/
FIRST SCREEN (WHAT I SAW)
first.png 
)
OCCRP
Aleph Pro
(
feat
site
aleph/page
"Find stories in any files", a dark
"Download for Linux" button (OS
detected), an outline "Use the demo"
button, "All platforms and versions", flying
document icons; three cards: Extract text
and search / Find entities / Export graphs.
.png 
)
Bellingcat
(
"The global archive of research material
for investigative reporting", with "global
archive" underlined in amber; a paragraph
saying access is by application, "reviewed
individually… typically granted within 72
hours"; one amber pill CTA; a schematic
(not real) product drawing.
feat
site
bellingcat
/page.png 
)
No product hero at all: a reader quote in a
cream band with an amber left rule
("Bellingcat isn't just doing the
investigations and publishing them, but
also encouraging others to get involved.
That's a vital niche." – Bellingcat reader)
next to "Become a supporting member";
then investigations as big photo tiles with
tag lines (INDIA · USA). Top bar:
Investigations, Resources, Ukraine,
Workshops, Donate.
TRUST / PRIVACY
A "Maximum privacy" block:
"Work locally on your documents
or upload to your own server…",
"No telemetry collected", "No
third-party interference".
Requirements stated: "5 GB of
free space on disk, 4 GB of
RAM". Version and year on the
download block ("Version
21.21.0 - 2026").
Access by vetting; Acceptable
Use and Terms in the footer.
Shown through the work.
MISSION
Top bar: "It's free! Support ICIJ".
"This web of evidence helps
journalists in the OCCRP network
and across the world see
connections, find stolen funds,
spot political influence, and unveil
corruption."
The quote states it: encouraging
others to get involved. "Latest
Guides" sit right after "Latest
Investigations".
WHAT IT GIVES US
Our closest peer in purpose.
"Use the demo" beside
Download (we have a demo
case). Requirements and
version beside the download.
Privacy as three short
negatives. Two named
testimonials with country.
Say who may use it and how
long access takes. The
schematic product drawing
reads as a placeholder; real
screens are stronger (UserJot
in SYN_BRAND A1).
The mission is the closest
real thing to Ony's line
("encouraging others to get
involved"). Guides next to the
work: method is part of the
product. Evidence photos as
tiles with place tags.
Redesigning the investigation workbench
229 / 252
SITE
Framer
gallery
(
feat
site
framer/fir
FIRST SCREEN (WHAT I SAW)
A dark grid of community sites; the
strongest dark one ("Midu Studio") is a
single huge red word glowing on near
black.
st.png 
)
TRUST / PRIVACY
n/a
What the first screens have in common (my reading of the captures):
1. One headline of 3–8 words, one plain subline, one or two buttons.
Every site above does this.
2. The second half of the first screen is the real product (Linear,
Obsidian, Readwise, Datashare, Arc). Aleph's schematic drawing is
the weakest of these.
3. The download button names the visitor's platform (Obsidian,
Datashare).
2. Shared frame for every page
Built on SYN_BRAND C "Shared frame", SYN_UX C2 and C4,
SYN_LOOK B–D.
Look: Rain Noir tokens from 
mock/tokens.css (ground 
cream 
#F0EAE1 
, amber 
#DD9231 
, teal 
#18120F 
,
#3AB3AD 
), never black.
Display Jost 300; body Manrope; mono IBM Plex Mono for every
number, date and source line; Source Serif 4 for long reading
(About, Mission, Safety body).
MISSION
n/a
WHAT IT GIVES US
Confirms the dark showcase
norm; a single warm glow on
dark is the attention device.
Their cookie card offers
"Reject" and "Accept" as two
equal buttons — the fair
pattern from SYN_BRAND A10.
4. Privacy is stated as what the maker cannot do (Signal "We can't
read", Obsidian "not even us", Proton "not even Proton … technical
means"), plus short negatives (Datashare "No telemetry
collected").
5. Mission is told through who started it and who pays (Proton's
CERN origin and Foundation, Signal's nonprofit and donations,
Datashare's "It's free! Support ICIJ").
6. Journalism sites show guides next to the work (Bellingcat) and
who may use it (Aleph).
Top bar (always visible, slim): logo glyph + "[Name]" top-left (93%
convention, SYN_BRAND A1); five words: What it does · How it
works · Red Flags · Safety · Get started. Right: the Download
button (OS-detected label, Obsidian/Datashare pattern).
Right-edge full menu: a thin labelled handle ("Menu") on the right
edge. Pointer dwell at the edge or click opens a frosted half-page
panel with every page grouped: Product (What it does, How it
works, Four steps, Red Flags), For you (Journalists, Citizen
investigators, Newsrooms, Creators), Trust (Safety, Licences,
Redesigning the investigation workbench
230 / 252
Methodology), About (Mission, About Ony, Press kit, FAQ, Pricing).
Page dims behind it; Esc closes; focus trapped; it is a native <dialog> (SYN_UX C2.1, C7).
Sticky "Get started" pill appears bottom-right after the hero
leaves view; quiet (outline, amber text), never covering text
(SYN_BRAND C, 
19+ CTA examples
).
Footer on every page: Ony's line set large in Jost 300: 
"I want
justice to become something we can all help deliver." — Ony Snow;
links: Safety · Licences · Press kit · Contact · FAQ; "Last updated ";
the status vocabulary legend (
✓ Supported · 
✕ Disputed · 
○ Not
yet shown · 
▮▯▯ Faint · 
▮▮▯ Strong · 
▮▮▮ Textbook) so a visitor
learns the words once.
Rain, glass and bokeh only in heroes (Home, Four steps, For
journalists). Text, screenshots and tables sit on plain 
surface-1/2
panels with the tinted drop shadow (SYN_LOOK B3, B5).
Proof rule: every number on the site carries a mono source line on
the same card; no borrowed industry statistics (SYN_BRAND B1,
A9). The only numbers we use are our own and checkable: "2,946
indicators", "42 areas", taken from the catalogue and linked to it.
2.1 Site motion system (from SYN_UX C4 tokens,
adapted to a scrolling site)
MOVE WHERE TOKEN HOW (NO NEW PACKAGE UNLESS MARKED)
Headline resolve Every hero headline
motion.story 700
ms
Each line goes from 
filter: blur(12px); opacity:0 to sharp, 80 ms stagger per line
(seen on Linear). CSS only.
Reveal on view Section headings, cards
motion.transform
450 ms ease-out
expo
y 28
→
0, once at 16% visible (portfolio 
Reveal
). CSS scroll-driven 
animation-timeline:
view() or IntersectionObserver.
ScrambleText Page titles only, once 80–240 ms per glyph Never on numbers, names, quotes (PORTFOLIO_COMPONENTS §5).
Scroll-scrubbed
step rail
Home "four steps",
Four-steps page
tied to scroll Pinned section (
position: sticky
) 4× viewport tall; scroll progress drives which step is lit
and a "0%…100%" readout (Sofi, SYN_UX A4). Native 
animation-timeline: scroll() / view()
; fallback IntersectionObserver.
Path draw "How a fact travels"
(How it works)
tied to scroll An SVG path from source 
→ passage 
→ claim 
→ check 
→ write-up draws with 
stroke
dashoffset as you scroll (Animated Path Pro reference, INVENTORY §11). A light dot
travels along it (
motion.trace
).
Stack cards Red Flag cards, safety
promises
tied to scroll Cards pin and stack, each next card sliding over the last with a deeper shadow (Scroll Stack
Cards reference). Sticky + 
view()
.
Redesigning the investigation workbench 231 / 252
MOVE WHERE TOKEN HOW (NO NEW PACKAGE UNLESS MARKED)
Scrubbed video "See" step (network
forming, timeline mode
switch)
tied to scroll Short muted screen capture whose 
currentTime follows scroll (Scroll Video Play
reference). JS only, no package.
Claim card flip How it works hero
motion.story
One claim card moves 
○ Not yet shown 
→ 
✓ Supported as its evidence chip slides in; only
the card moves (SYN_BRAND C3).
Hover Links, cards, buttons
motion.feedback
160 ms; press 100
ms scale .98
Cards lift (shadow-lift) and tilt 
≤
1° only if they are "evidence" cards (SYN_UX C5).
Edge menu Right edge
motion.reveal
240 in / 180 out
Slides from its edge.
Ambient Hero only
motion.ambient
23–34 s
Rain on glass (WaterDrops) or CSS bokeh; one ambient effect per screen; sleeps when out of
view.
CameraIris Opening a screenshot
full-screen
450 ms 8-blade SVG iris (PORTFOLIO_COMPONENTS §5).
Reduced motion (
prefers-reduced-motion
, and a "Calm motion"
toggle in the footer): headline resolve becomes a 120 ms fade;
pinned scroll sections become ordinary stacked sections with all four
steps visible; path draws show complete; video shows its last frame;
rain shows a still "after the rain" photo; bokeh freezes (SYN_UX C4).
Scroll-scrubbed pieces never trap the wheel: the page always scrolls;
the scroll only drives the component (a site, unlike the app, may
scroll; SYN_BRAND scope note).
Packages: a scroll library (GSAP ScrollTrigger or Motion) is [ADR]; this
plan works without one using CSS scroll-driven animations
(Chrome/Edge; Safari support should be checked by the builder
before relying on it) with an IntersectionObserver fallback. Porting
WaterDrops (WebGL, shared GL context, framer-motion dependency)
is [ADR] (SYN_LOOK C2). A static site in a new repo is [ADR]
(SYN_BRAND C "Build").
2.2 Accessibility for every page
Cream on ground 15.51:1 and on panels 14.35:1, muted 6.38:1 on
selected (SYN_LOOK C2 computed values). Status chips always carry
shape + word (SYN_LOOK B1). Every icon-only control named (edge
handle "Open menu"). Headline text exists in the DOM before its
animation (screen readers get it at once). Hero rain is 
aria-hidden
;
the photo gets alt text and its real caption. Skip-link to main content.
All pinned scroll sections have headings so screen-reader users can
jump between steps.
Redesigning the investigation workbench 232 / 252
3. Pages
Each page: Goal · Sections (with copy drafts) · CTAs · Motion · Built
on. Copy follows SYN_BRAND D: plain, careful, steady, on your side;
"records show", never "expose"; every number with a source; the
limit next to the promise. All copy is a draft for Ony.
3.1 Home (C1) — mockup SITE_1
Goal: answer in order: what is this, is it for me, can I trust it; then lead
to the four steps or the download (
Storytelling with design
).
Sections and copy:
1. Hero — Rain Noir. Full-viewport pane: rain on glass (WaterDrops,
"Steady") over Ony's own night-city photograph (placeholder until
he supplies it; never AI-generated, caption "Photograph: Ony
Snow, Indianapolis" only once it is his). Over the glass, left
aligned: - Eyebrow (mono): 
[NAME] · AN INVESTIGATION
WORKBENCH - Headline (Jost 300, ~88 px): Every claim, traced to its
source. (tagline F3) - Subline: "A workbench for reporters and
citizen investigators. Bring in your documents, check every claim,
see who is linked to whom, and act on what holds up — on your
own computer." - Proof line, one number (hotels.ng formula):
2,946 Red Flag indicators from published cases, across 42
areas 
→ linked to the catalogue. - CTAs: Download for [your
system] (filled amber) · See how it works (outline). Under them:
"Your files stay on your computer." - Right side of the hero: the
four steps as thin cream pills over a grainy scanned document:
Bring in 
→ Check 
→ See 
→ Act (SYN_BRAND C1, img_00 style). 
Bottom of the hero: the real product (case home) rising from
below the fold, dimmed, cut off (Linear / Obsidian pattern).
2. The problem (Abigail Africa template, SYN_BRAND A1): "A
reporter who has a pile of records and a hunch needs to show
exactly what the records say, but has no research desk, no lawyer
on call and no time to read everything twice." Three short facts
below it as plain cards: "Documents arrive as PDFs, scans and
spreadsheets." / "Names repeat across hundreds of pages." / "One
overstated sentence can sink a story."
3. The four steps — pinned, scroll-scrubbed: huge thin numerals 1–4
on dark brown (legal template, SYN_BRAND A1) with a real
screenshot on the right that changes per step, and a "0% 
→ 100%"
readout. - 1 Bring in. "Drop in PDFs, emails, spreadsheets and
photos. Save web pages with exact quotes. Pull company,
sanctions and court records from connectors you switch on. The
app reads each document and proposes people, companies,
dates, amounts and claims." - 2 Check. "Every claim is Supported,
Disputed or Not yet shown. What only a person can confirm goes
on a To check list. Every fact keeps a chain of custody back to the
page it came from." - 3 See. "The case drawn as a network, a
timeline, money flows and a map. Move the year slider and watch
who was involved when." - 4 Act. "Red Flags compare your case
with patterns from published cases — each with its innocent
explanations. Then write it up: every sentence carries its source."
4. Red Flags, honestly — three stacked cards, each with level chip,
the pattern, the innocent explanation, and the source line. Sample
(teaching case, labelled): 
▮▮▯ STRONG "Company registered at a
formation agent's address" · 
Could be innocent: "Many small firms
use formation agents legitimately." · Source: catalogue entry ID.
Heading: "Patterns, not verdicts."
Redesigning the investigation workbench
233 / 252
5. Safety, three promises (Signal/Obsidian "we can't" form, limit
beside the promise): - "Your case lives on your computer. We have
no server that holds it, so we cannot read it." - "Nothing leaves
without you switching it on. Connectors send the name you search
to that service; the app logs every outbound call." - "AI drafts; you
decide. Anything an AI proposes waits in To check until a person
accepts it, and is marked AI until then." Link: "Read the safety
page".
6. Who it is for — four tiles: Journalists · Citizen investigators ·
Newsrooms · Creators, each one sentence and a link.
7. Creator strip — photo placeholder, "Built by Ony Snow, an
independent investigative journalist and software developer in
Indianapolis." 
→ "About Ony".
8. Closing CTA — Ony's line large, then "Download for [your system]"
· "Try the sample case". Friction line: "Free to download while in
development" 
(only if Ony confirms; otherwise omitted, see
Pricing)
.
9. Footer (shared) with "Names under consideration" (shortlist) on
this draft only.
CTAs: Download / See how it works (top); Read the safety page
(middle); Download / Try the sample case (bottom). Sharpening down
the page (Jira pattern, SYN_BRAND A2).
Motion: headline resolve from blur; rain on glass reacts to pointer and
scroll (WaterDrops wakes on pointermove); step pills light in
sequence once on load (300 ms each, 
motion.trace
); the product
screen rises 40 px as you scroll the first 300 px; four steps pinned and
scrubbed; Red Flag cards stack; safety promises reveal; ambient
stops after the hero.
Built on: SYN_BRAND C1, B2–B3, F3, A1 (hotels.ng, legal template),
A2; Linear and Obsidian (real product under the headline),
Signal/Obsidian/Proton (capability-limit privacy), Datashare (demo
next to download), SYN_UX C4.
3.2 What it does (C2)
Goal: features as problems solved.
Hero: one sentence on a flat dark card (LinkedIn card): "From a
pile of documents to a story you can stand behind." (tagline F5).
Six split rows, problem left, answer + real screenshot right,
alternating: 1. "A pile of PDFs and no team." 
→ Bring in: "Drop the
whole folder. The app reads, splits into passages and proposes
who and what is in them." 2. "A claim you can't prove yet." 
→ To
check: "It stays Not yet shown, on a list, until a source supports or
disputes it." 3. "Too many names to hold in your head." 
→
Network: "Everyone and every company, and how records link
them." 4. "Who knew what, when." 
→ Timeline: "Slider, periods,
lanes, corkboard or story — the same events, different views." 5.
"Is this normal or a red flag?" 
→ Red Flags: "Compared with
published cases, with the innocent explanations beside each
one." 6. "Writing it up without overstating." 
→ Cited drafts: "Every
sentence shows its source chip. AI drafts carry an 'AI draft – date'
stamp."
Sample case band: "Everything on this page is from a teaching
case, not a real investigation." (Demo Mode honesty, SYN_BRAND
C2).
CTAs: "See the four steps" · "Download".
Motion: each row's screenshot slides in from its side on view
(
motion.transform
); the problem text never moves. Hover a
screenshot: numbered callouts fade in (UserJot).
Built on: SYN_BRAND C2, A1 (UserJot, "problems not services");
Datashare's three-card feature row.
Redesigning the investigation workbench 234 / 252
3.3 How it works (C3)
Goal: show the method so a sceptic can judge it.
Hero: one claim card animating 
○ NOT YET SHOWN 
→ 
✓
SUPPORTED as its source chip slides in. Headline: "How a fact
earns its place."
Sections: 1. How a fact travels — scroll-drawn path: Source 
→
Passage 
→ Claim 
→ Check 
→ Write-up. At each node a short card:
"Source: the file or web page, saved with its date and a
fingerprint." "Passage: the exact words, with page and line."
"Claim: one statement drawn from a passage." "Check: a person
marks it Supported, Disputed or Not yet shown, with the
evidence." "Write-up: the sentence keeps a link back through
every step." 2. What AI does and does not do — two columns.
Does: "proposes people, dates and claims", "drafts a summary that
cites its sources". Does not: "decide what is true", "accept its own
proposals", "send your files anywhere you have not chosen". Note:
"AI can make mistakes. That is why its proposals wait for you." 3.
Chain of custody — screenshot with callouts. 4. What stays on
your computer — the local-first diagram (see Safety).
CTAs: "Read the four steps" · "Read the safety page".
Motion: path draw + travelling light (
motion.trace 300–600 ms
per edge) scrubbed by scroll; the node a reader reaches settles
into its status colour and shape (SYN_UX C4 rule 7 borrowed for
the site).
Built on: SYN_BRAND C3, B5, B7; SYN_UX C9; Animated Path Pro
reference (INVENTORY §11); Proton "trust is earned through
transparency".
3.4 The four steps (C4)
Goal: the full walk-through.
Hero: rain pane, four stacked thin numerals that open like a
gatefold onto each step (SYN_BRAND C4), "scroll · 0%" readout.
Sections: one pinned chapter per step, each: 
What you do / 
What
the app does / 
What you get
, and a scrubbed screen capture
(network forming as you scroll; timeline switching modes).
Bring in — You: "Drop files, paste a link, or search a register." App:
"Reads text, even from scans; splits passages; proposes entities."
You get: "A review queue: accept or reject each proposal with one
key."
Check — You: "Mark claims; answer To check items." App: "Keeps
the chain of custody; shows what each claim rests on." You get: "A
list of what holds up and what does not yet."
See — You: "Open the network, timeline, money or map." App:
"Draws only what your checked records show." You get: "A picture
you can explain line by line."
Act — You: "Run Red Flags; chase leads; write." App: "Compares
your case with 2,946 indicators; drafts with citations." Lead-in
beside Run Red Flags: "Nothing leaves this computer when you
run Red Flags."
CTAs (sharpening): "Try it with your own documents" 
→
"Download for [your system]".
Motion: pinned chapters (
position: sticky
, 100vh each) with
ground tint shifting per chapter (Story format, SYN_LOOK D1);
scrubbed video; numerals open on scroll.
Built on: SYN_BRAND C4; SYN_UX A4 (Sofi readout), C4; Scroll
Video Play reference.
Open question: confirm the Red Flags lead-in is true for every rule
(some planned lookups go outside; INVENTORY §11 "Router,
lookups").
Redesigning the investigation workbench 235 / 252
3.5 Red Flags catalogue, public (C5)
Goal: let anyone learn the patterns and see they are sourced.
Hero: huge 2,946 (mono, tabular) with source line 
indicators
from published cases across 42 areas · catalogue version
<date> 
; under it a framed bar: search · area · level · Clear.
Sections: 42 area cards in one template (title, one-line definition,
three example indicators, area hue on the left edge; sensitive
areas muted, SYN_LOOK B1). Indicator page: the milk-cap
catalogue layout (SYN_BRAND I1): record left (ID, area, level
chips Faint/Strong/Textbook with what each means), right a two
column table 
Signs / 
Could be innocent
, then 
Source cases with
links. Flip-card learning mode.
Copy: intro "These are patterns that appeared in published cases.
A pattern is a reason to look closer, never proof on its own. Every
indicator lists innocent explanations."
CTAs: "Check these against your own case" · "Suggest an
indicator" (form requires source case, link, level and innocent
explanations).
Motion: the count is still (evidence values never animate, SYN_UX
C4 rule 5); area cards reveal in a short stagger; flip cards turn 450
ms; Textbook indicator page title uses a steady Neon heading
(never flicker).
Built on: SYN_BRAND C5, A1 milk-cap; SYN_LOOK B1; Bellingcat
(guides beside the work).
Needs: catalogue licence decision; a static export of the catalogue
(backend).
3.6 Safety and privacy (C6)
Goal: answer "what happens to my data" exactly.
Redesigning the investigation workbench
Hero: calm plain card, no rain: "Your case lives on your
computer." Sub: "Here is exactly what stays, what leaves, and
when."
Sections and copy: 1. Diagram of the computer: inside — files,
passages index, claims, drafts, backups; outside — each connector
(OpenSanctions, OpenCorporates, OpenAleph…) with an arrow
labelled what is sent ("the name you searched"), and the AI
provider arrow labelled "only if you choose a remote model". 2.
What leaves, and when — a table: action · what is sent · to whom ·
can I switch it off. 3. AI and your files — "You choose the AI
provider. A local model keeps everything on this computer. A
remote model receives the passages you ask it about. The settings
page shows which one is on." (true per INVENTORY §8: provider,
local or remote, AI_ALLOW_REMOTE_ENDPOINT). 4. Deleting a
case — "Preview what will be deleted, type the case id, confirm. It
is permanent." (INVENTORY §8). 5. Backups — "A checksummed
archive you download. Restoring always creates a separate case."
6. Protecting sources — practice notes and links to outside
guides. 7. Honest limits — "If your computer is compromised, your
case is too. Encrypt your disk. [Name] is not audited yet." (state
only what is true at publish time). 8. Report a security problem —
contact. 9. Do / Don't table.
CTAs: "Download" · "Read the licences".
Motion: none beyond reveal; the diagram's outbound arrows draw
once when in view. Calm zone.
Built on: SYN_BRAND C6, B2–B3; Signal ("we can't"), Obsidian
("not even us"), Datashare ("No telemetry collected" — only if true
for us), Proton ("Open source and audited" — we state our status
honestly).
Needs from Ony: is any telemetry or crash reporting planned? Is
the code open? Disk encryption advice wording.
236 / 252
3.7 For journalists (C7)
Hero: visual-essay look (deep brown, cream serif, dated entry),
rain hero allowed. "You have the documents. Show what they
say."
Sections: pain 
→ answer ("No research desk" 
→ Bring in and
review queue; "Legal will ask how you know" 
→ chain of custody
export; "Right of reply" 
→ a list of claims about each person, with
status); a write-up excerpt with a source chip on every sentence;
exports incl. print-safe light variant.
CTA: "Start your first case".
Motion: source chips light one by one as the excerpt scrolls into
view.
Built on: SYN_BRAND C7, A4 (Laura Kim visual essay).
3.8 For citizen investigators (C8)
Hero:"You don't need a newsroom to ask a good question."
Sections: what counts as evidence (and what does not); staying
safe (link to Safety and outside guides); Red Flags learning mode;
"When to hand it to a journalist" — how to export a clean case file.
CTAs: "Learn the method" · "Download".
Proof: the innocent-explanations rule, stated: "The tool will not
let you mark a Red Flag without seeing its innocent explanations." (Check that this is how the app behaves before publishing.)
Motion: flip cards; reveal.
Built on: SYN_BRAND C8; Bellingcat's "encouraging others to get
involved" and guides beside investigations.
3.9 For newsrooms (C9)
Hero: a sign-off strip — Reporter recommends 
→ Legal agrees 
→
Editor decides.
Sections: local-first deployment (one machine, or the Docker
stack with Postgres, per the current About page); chain of custody
for legal review; export formats; "Planned: shared cases" marked
PLANNED (multi-user is not built, INVENTORY §11).
CTAs: "Talk to Ony" · "Download to evaluate".
Motion: the sign-off strip fills left to right on scroll.
Built on: SYN_BRAND C9, B9 (honest status); Aleph ("who may
use it").
3.10 For influencers and creators (C10)
Hero: one finding card previewed at 1:1, 4:5, 9:16 and 16:9 with
resolution chips.
Sections: a checked finding becomes a carousel with the source
on every frame; "No clickbait: only Strong or Textbook evidence
may headline a card"; the AI-draft badge; alt text prefilled from the
evidence caption.
CTA: "Make your first sourced post".
Motion: the four previews resize from one into the next as you
scroll (shared-element, SYN_UX C4 rule 1).
Built on: SYN_BRAND C10, A8.
Open question: is the share-card maker in scope for the app? It is
not in INVENTORY; mark the page PLANNED if not.
3.11 About the creator (C11) — mockup SITE_2
Goal: a named, real person behind the tool.
Redesigning the investigation workbench 237 / 252
Hero: photo placeholder (Ony's choice, captioned as his own,
Fruitful pattern), name large in Jost 300, roles in small mono:
INVESTIGATIVE JOURNALIST · SOFTWARE DEVELOPER ·
INDIANAPOLIS 
. A big DRAFT banner across the top of the page until
Ony approves.
Body (DRAFT, only from SYN_BRAND H):
"Ony Snow is an independent investigative journalist and software
developer based in Indianapolis. His work spans photography and
videography, investigative journalism, software engineering,
writing and design. He runs OnySnow Studios."
"He is building [Name] so that people can investigate the
powerful."
Pull quote: 
"I want justice to become something we can all help
deliver."
Placeholder blocks, dashed: "[Ony: why you built it, in your
words]", "[Ony: published work — links]", "[Ony: contact route]".
CTAs: "Contact" · "OnySnow Studios" · "Read the mission".
Motion: name resolves from blur; the photo frame gets the
portfolio's ShutterFlash corner brackets once on load (brackets
only); the quote reveals line by line on scroll; no rain (a reading
page).
Built on: SYN_BRAND C11, H, A4 (authenticity, Laura Kim), A1
(Fruitful caption); Proton/Signal (who made it and why).
3.12 Mission (C12)
Hero: Ony's line alone, cream on charcoal, nothing else on the
screen.
Sections:
Vision — the line. 
Mission — "We give people the tools,
the knowledge and the method to investigate the powerful: bring
in records, check every claim, see the connections, and act on
what holds up." 
Values — the voice rules as promises: show
sources; name limits; respect the accused; AI drafts, people
decide. 
What we will not do — no dark patterns, no unsourced
claims, no selling your data, no countdowns.
CTAs: "Download" · "Read the safety page".
Motion: the line resolves word by word on load (700 ms); values
cards stack on scroll.
Built on: SYN_BRAND C12, D; Bellingcat mission; Signal's "who
pays" honesty.
3.13 Pricing or free (C13)
State cost plainly once Ony decides. Until then the page says: "
[Name] is in development. Pricing is not decided." If free: say what
free means only if true. If tiers: 
≤
3, whole numbers, no decoy.
FAQ: contract, cancellation, where data lives, what happens to my
case if I stop, can I export everything.
CTAs: "Download" · "Contact for newsrooms". Motion: none
(calm).
Built on: SYN_BRAND C13, A2; Datashare "It's free! Support ICIJ"
and Signal "supported by grants and donations" as honest models
if Ony goes that way.
3.14 Download / Get started (C14)
Hero: one button naming the visitor's system ("Download for
Windows"), "All platforms" link, version and date, requirements
(Datashare pattern), privacy line beside it.
Sections: per-OS downloads; first-run checklist with progress
(open the sample case, drop a document, check a claim, draw the
network); system needs (Ony to supply); verifying the download
(checksum; engineering decision).
Redesigning the investigation workbench
238 / 252
Motion: checklist ticks animate on hover preview only. Built on:
SYN_BRAND C14; Obsidian/Datashare OS-detected button.
3.15 Press kit (C15)
One-paragraph description; logo family (SVG, both colourways);
screenshots; Ony's photo and bio; sourced facts; contact; the
name shortlist while undecided (internal link only, not public).
CTA: "Download the kit (zip)". Built on: SYN_BRAND C15; Signal
footer (press contact, brand assets).
3.16 FAQ (C16)
Accordion groups: Safety, AI, Data and sources, Cost, Teams. First
questions: Does anything leave my computer? Can AI make
mistakes, and then what? Where do the Red Flags come from? Can
I use it for a live story? Can my editor see my case? (Answer: "Not
yet. Shared cases are planned.")
CTA: "Still unsure? Contact Ony". Motion: accordion opens 240 ms;
native 
<details> 
.
3.17 Licences and Methodology (from SYN_BRAND
B4, B7)
Two short reading pages linked from the footer: app licence and code
link (Ony decides); each connector's terms as published; catalogue
licence. Methodology: how claims move between statuses, what
Faint / Strong / Textbook mean, the innocent-explanations rule. Calm
zones, no motion.
4. Innovation (beyond today and beyond the references)
1. The site passes its own Check step. Every number and claim on
the site is a claim card underneath: hover shows its status chip
and its source (e.g. "2,946 — 
✓ SUPPORTED · source:
catalogue/indicators, 10 Oct 2026"). None of the eleven sites
above shows where its own numbers come from (Proton's "100
million" and Raycast's "99.8%" carry no source on the page).
2. "Outbound calls" live specimen. On the Safety page, a small panel
replays the outbound-call log of the sample case: each call lights
5. Needs
Redesigning the investigation workbench
the arrow it used in the diagram, with what was sent. It turns
"nothing leaves without you" from a claim into something shown.
3. The rain clears where you read. On the Home hero, the glass fogs
and rain beads everywhere except a band that follows the
headline; moving the pointer wipes a clear track (WaterDrops
already supports wipes clearing fog, PORTFOLIO_COMPONENTS
§2.3). The metaphor — clearing the glass to see the city — is the
product's job, and the text is never behind moving water.
239 / 252
ADRs: static site in a new repo; porting
WaterDrops/BokehField/CameraIris from the portfolio (WebGL
engine, framer-motion, licence check of the vendored glass
library); optional scroll library (GSAP/Motion) — not needed if CSS
scroll-driven animations plus IntersectionObserver suffice; mono
font choice.
Backend / app: a static export of the Red Flags catalogue (JSON
per area); screenshots and short screen captures from the sample
case; the outbound-call log for the sample case.
From Ony: the name; his night-city photograph and portrait; links
to published work; contact route; licence and pricing decisions;
whether there is telemetry; whether the code is open;
confirmation of every safety sentence before publishing.
Open questions: is the creators page in scope (share-card maker
not in the app)? Should the site include a Guides section
(Bellingcat pattern) tied to the planned learning guides
(INVENTORY §11)?
Redesigning the investigation workbench
240 / 252
B. What a credible journalism-tool site must show
Proposal, from A1, A2, A9 and A10. The audience's first question is
"Can I trust this?" (
Storytelling with design
).
1. Sources for every number. Each stat carries its source line on the
same card, e.g. "2,946 indicators from published cases across 42
areas", linked to the catalogue. No borrowed industry statistics
without a primary source (A9 shows how often they fail); the site
should pass the app's own Check step.
2. Reporter safety, stated plainly. A safety page answering, in the
privacy-FAQ shape of 
Learn Figma: Design fundamentals
: what
data exists, where it is stored, what leaves the device and when
(connectors and AI calls only), how to delete it, what backups
keep. A one-line promise beside every download and sign-up field
(Daisy AI). No pre-selected destructive choices.
3. Local-first data, shown not claimed. A diagram of the computer:
files, index and drafts inside; connector calls (OpenSanctions,
OpenCorporates, OpenAleph) going out, each labelled with what
is sent. Show the list of outbound calls a case has made (idea from 15 of the best AI coding tools
) in screenshots.
4. Open licences and terms. The app's own licence and code link if
published (Ony decides; nothing here assumes one); each
connector's terms as the provider publishes them, linked; the Red
Flags catalogue's licence, with every indicator citing its source
case.
5. How AI is used, with limits. AI proposals land in "To check" until a
person accepts them; drafts cite sources and carry an "AI draft 
date" stamp (
X image size guide badge; "Summarized with AI 
date" in 
Using AI in product management
); say which models run
locally.
6. A named creator and contact route, with a real photo captioned
as real (Fruitful pattern).
7. Methodology in public: how claims move from "not yet shown" to
"supported", what Faint / Strong / Textbook mean, and that
innocent explanations are always listed.
8. Accessibility: cream-on-dark at AA (4.5:1 body, 3:1 large text;
WCAG, followed from 
What is visual hierarchy
), names on icon
only controls, reduced-motion fallbacks.
9. Honest status: planned features (shared cases, phone field mode)
labelled "planned".
C. Product-site plan
Shared frame for every page.
The ground is Rain Noir: warm charcoal 
oklch(0.145 0.011 55)
,
cream 
oklch(0.94 0.014 78)
, with amber and teal accents
(PORTFOLIO_COMPONENTS §5).
Display face Jost 300, body Manrope. A mono face is used for
numbers, dates and sources. Choosing that face is open; adding a
Redesigning the investigation workbench 241 / 252
new font needs an [ADR].
Logo top-left and a slim top bar of five words: What it does · How it
works · Red Flags · Safety · Get started. A fuller menu slides in
from the right edge, like The Outline's half-page panel, with the
page dimmed behind it. There is a visible edge handle and a
keyboard path, because hidden menus cost discoverability (
Guide
to designing a hamburger menu
).
One sticky, quiet "Get started" pill appears after the hero (
19+ CTA
examples
).
Rain, glass and bokeh are used only in heroes. Product
screenshots and text sit on plain cards, following the
PORTFOLIO_COMPONENTS rule that reading surfaces stay calm.
Every page ends with the same footer: the line "I want justice to
become something we can all help deliver", links to Safety,
Licences, Press kit and Contact, and a "Last updated" date.
Build.
A static site fits best: it is fast, has fewer attack surfaces and is
cheap (
Static vs. dynamic websites
).
Reusing the OnySnow Studios portfolio's rain and glass
components in a new site is a new codebase [ADR]. Adding a
scroll-animation library (GSAP or Motion) is [ADR]. A browser
native CSS scroll-driven animation needs no package.
C1. Home
Goal: answer "what is this, is it for me, can I trust it", then lead to
the four steps or the download.
Hero: rain on glass (WaterDrops pane) over Ony's own night-city
photograph, never AI-generated; behind it, thin cream pills Bring
in 
→ Check 
→ See 
→ Act over a grainy scanned document (img_00
style, 
What agentic AI means for content creation
). Headline =
tagline; subline = one plain sentence and one number (hotels.ng
formula).
Sections: the problem in Abigail Africa's template; the four steps
as huge numerals on dark brown with real screenshots; three Red
Flag cards (level, innocent explanation, source); three safety
promises; four audience tiles; creator strip; closing CTA.
CTAs: "Download the workbench" / "See how it works"; beneath:
"Your files stay on your computer."
Proof: real screenshots with numbered callouts (UserJot); counts
with source lines; the named creator.
C2. What it does
Goal / hero: features as problems solved; one big sentence on a
flat dark card (LinkedIn vision-card format).
Sections: six problem 
→ answer split rows with screenshots: "A
pile of PDFs and no team" 
→ Bring in; "A claim you can't prove yet" → To check; "Too many names to hold in your head" 
→ network;
"Who knew what, when" 
→ timeline; "Is this normal or a red flag?" → Red Flags; "Writing it up without overstating" 
→ cited drafts.
CTAs: "See the four steps", "Download". Proof: a sample case
labelled as a teaching case ("Demo Mode Active" honesty, 
10 real
world vibe coding examples
).
C3. How it works
Hero: a short loop of one claim card moving from "not yet shown"
to "supported"; only the card moves (Jira loop, 
12 website layout
ideas
; restraint from 
How to make a cinemagraph
).
Sections: how a fact travels (source 
→ passage 
→ claim 
→ check → write-up); what AI does and does not do; chain of custody;
Redesigning the investigation workbench 242 / 252
what stays local.
CTAs: "Read the four steps", "Read the safety page". Proof: chain
of-custody screenshot; AI-draft stamp.
C4. The four steps
Goal / hero: a scroll-driven storyboard, one frame per beat
(
Storyboarding
); four stacked numerals that open like a gatefold
onto each screen (
How to make a brochure
), with a Sofi-style "0%"
readout.
Sections: Bring in, Check, See, Act — what you do, what the app
does, what you get.
CTAs: sharpening down the page (Jira pattern): "Try it with your
own documents" 
→ "Download for your computer". Proof:
screenshots; the "nothing leaves this computer" lead-in by Run
Red Flags.
C5. Red Flags catalogue (public)
Hero: a huge "2,946" with the source line "indicators from
published cases across 42 areas", above a framed search + area +
level + Clear bar (C40, 
Top Web design trends
).
Sections: 42 area cards in one fixed template (title, one-line
definition, three examples; 
12 types of logos
) with a hue per area
edge; indicator pages with a signs / innocent explanations two
column table and tap "i" tooltips (Gusto); a flip-card learning mode
(
30 team-building activities
).
CTAs: "Check these against your own case"; "Suggest an indicator"
with required source case, link, level and innocent explanations
(
Design system governance
). Proof: every indicator cites its case;
catalogue licence shown.
C6. Safety and privacy
Hero: a calm plain card, no rain: "Your case lives on your
computer."
Sections: local-first diagram; what leaves and when; AI and your
files; deleting a case; backups; source-protection practice; honest
limits; reporting a security problem; DO / DON'T tables (
49 thank
you card ideas
).
CTAs: "Download", "Read the licences". Proof: outbound-call log
screenshot; "Last updated" date (
How to write a project charter
).
C7. For journalists
Hero: visual-essay look (deep green or brown, cream serif, dated
entry; 
10 personal website examples
), speaking to the solo
reporter with a pile of documents (
What is UX strategy?
).
Sections: pain 
→ answer; documents to sourced draft; right of
reply and legal review; exports incl. a print-safe light variant.
CTA: "Start your first case". Proof: a write-up excerpt where every
sentence shows its source chip.
C8. For citizen investigators
Hero: "You don't need a newsroom to ask a good question."
Sections: what counts as evidence; staying safe; Red Flags
learning mode; when to hand a case to a journalist.
CTAs: "Learn the method", "Download". Proof: the innocent
explanations rule, showing the tool does not push accusations.
C9. For newsrooms
Hero: a sign-off strip — reporter recommends, legal agrees, editor
decides (RAPID, via 
What is a RACI matrix?
).
Redesigning the investigation workbench 243 / 252
Sections: local-first deployment; chain of custody for legal review;
export formats; "Planned: shared cases" clearly marked.
CTAs: "Talk to Ony", "Download to evaluate". Proof: methodology
and licences pages.
CTAs: "Download", "Read the safety page".
C13. Pricing or free
C10. For influencers and creators
Hero: one finding card previewed at 1:1, 4:5, 9:16 and 16:9 with
resolution chips (
Guide to Facebook post sizes
; 
X image size
guide
).
State the cost plainly once Ony decides. If free, say what "free"
means only if true. If tiers ever exist: at most three, whole
numbers, no hidden fees, no decoy (
Pricing page best practices
).
Five-question FAQ. CTAs: "Download", "Contact for newsrooms".
C14. Download / Get started
C11. About the creator
Hero: Ony's own photo, captioned as real, name large, roles in
small mono (
11 LinkedIn post examples img_10). Draft text in
section H.
CTAs: "Contact", "OnySnow Studios", "Read the mission". Proof:
links to his published work, supplied by Ony.
C12. Mission
Hero: Ony's line alone, cream on charcoal. Sections: vision (the
line), mission (the four steps in one sentence), values (section D),
what we will not do (no dark patterns, no unsourced claims) —
vision vs mission split from 
12 powerful vision statement
examples
.
Sections: a checked finding becomes a carousel with sources on
every frame; "no clickbait" — only Strong or Textbook evidence
may headline a card (
YouTube Banner Size Guide
); the AI-draft
badge; alt text prefilled from the evidence caption.
CTA: "Make your first sourced post". Proof: a sample carousel with
visible source lines.
Goal: time to value (
GTM strategy
). Sections: download per
operating system; first-run checklist with progress (open the
sample case, drop a document, check a claim, draw the network;
Synthesia pattern, 
11 of the best AI design tools
); system needs;
download verification (an engineering decision for Ony). CTA: one
"Download" button with the privacy line beside it.
C15. Press kit
Modelled on Standards.site's live guide and the Airbnb newsroom
asset area: one-paragraph description, logo family (SVG, both
colourways), screenshots, Ony's photo and bio, sourced facts,
contact. CTA: "Download the kit (zip)"; optional password
protection (
16 landing page examples
, band press kit).
C16. FAQ
Accordion groups (Safety, AI, Data and sources, Cost, Teams), one
to three sentences each. Start with: Does anything leave my
computer? Can AI make mistakes, and then what? Where do the
Red Flags come from? Can I use it for a live story? Can my editor
see my case? CTA: "Still unsure? Contact Ony".
Redesigning the investigation workbench
244 / 252
D. Voice and tone rules
Proposal. These follow the style-guide structure in 
What is a style
guide
, where voice is a set of adjectives and tone shifts by channel.
Voice adjectives: plain, careful, steady, on your side.
1. Say what is shown, not what is felt. Write "Records show the
company was registered at the same address", not "Shocking links
revealed". Concrete facts, never adjectives about guilt.
2. Every number has a source line or does not appear.
3. Name the limit next to the promise. "Your files stay on your
computer. Connectors you switch on send the name you search to
that service."
4. Use the app's own words, the same everywhere: supported /
disputed / not yet shown / to check; Faint / Strong / Textbook.
"One name everywhere" (
Design system governance
).
5. Short sentences. The 5-5-5 discipline applies to slides and social
cards, not to body text.
6. No urgency tricks. No countdowns, no "Only today", no FOMO
pop-ups.
7. AI is a helper that drafts, never a judge. Write "proposes",
"drafts", "suggests". Never "finds the truth".
8. Respect the accused. Always mention innocent explanations
when describing Red Flags.
9. Tone by channel: - Site and safety pages: calm and exact. - Social
posts: warmer, first person from Ony. - Error and warning text:
direct, with the next step.
10. Avoid jargon or explain it once. Tap-tooltips cover terms like
"chain of custody" and "beneficial owner".
Words to prefer: records show, according to, not yet shown, check,
source, on your computer. Words to avoid: expose, bombshell,
guaranteed, 100% secure, military-grade, AI-powered truth.
E. Twelve product name proposals
Domain, trademark and app-store availability has not been checked
for any name. Run a USPTO search before choosing (
How to design a
logo
). Present the chosen one Rand-style: one name, its reasoning,
and how it looks in use.
# NAME WHY
1 Paper Trail The thing the tool builds; instantly understood. A common phrase, so expect conflicts.
2 Daylight Bringing things into the open; pairs with Ony's light and rain imagery.
3 Plainsight "Hidden in plain sight": the patterns are in public records. Also suggests plain language.
Redesigning the investigation workbench 245 / 252
# NAME WHY
4 Tracewell Trace + well: carefully traced facts. Unusual enough to own.
5 Common Docket "We can all help deliver" justice: a shared case file for ordinary people.
6 Groundwork Investigation is groundwork; modest, not sensational.
7 Provenance Chain of custody is the product's heart. Formal, suits newsrooms.
8 Casefile Plain and literal. Easy to say. Weak to own.
9 Ledgerlight Light on the ledgers; ties to Rain Noir's lamp and flashlight tools.
10 Corkboard The evidence board everyone recognises. Friendly to citizen investigators. Less serious for newsrooms.
11 Red String The string on the board. Memorable, but it carries a conspiracy-board connotation that may undercut trust.
12 Fair Witness A witness who reports only what was seen: the tool's discipline. Note it is an existing literary term.
F. Tagline set built around Ony's line
The anchor, used whole on Home and Mission: "I want justice to
become something we can all help deliver."
Short forms for heroes, cards and social posts:
1. Justice we can all help deliver.
2. Investigate the powerful. Show your sources.
3. Every claim, traced to its source.
4. Your case. Your computer. Your proof.
5. From a pile of documents to a story you can stand behind.
6. Bring it in. Check it. See it. Act on it.
7. Proof, not outrage.
8. The tools of an investigation, for anyone with a question.
9. Accountability is a team sport, and everyone's on the team.
10. Find the pattern. Name the source. Leave the innocent
explanation in.
Redesigning the investigation workbench 246 / 252
G. Brand system proposals (logo, style guide, decks, social)
Logo family (
How to design a logo
; 
12 types of logos
):
A wordmark for the full lockup, which the articles recommend for
media and nonprofits.
A single glyph that survives at favicon size and as the only visible
element of the edge navigation.
Test in cream on charcoal and in one colour.
A circle reading ("unity, community") suits "we can all".
A subtle dynamic state, such as the glyph's light pulsing while
documents are read, fits the animation direction without extra UI.
Style guide:
A short live page, not a PDF (Standards.site).
Sections: tokens (the Rain Noir set), type, motion rules (smooth
easing for this subject; 
≤
200 ms hover; reduced-motion fallback),
the voice rules in D, dos and don'ts, and the status vocabulary.
Keep it far under 25–35 pages. Review it every six months.
Pitch deck to editors or funders: 5 Ps, one evidence image per
slide, "Confidential" pill, a light print-safe variant (
16 inspiring
pitch deck examples
); open on one high-impact image on a dark
screen (
How to start a presentation
).
Social templates: quote card on warm brown with the source
under the quote; stat card (one number, its source); 4:5 evidence
carousel; all previewed at every size with safe zones and styled
uniformly so a series is recognisable (
YouTube Banner Size Guide
).
H. DRAFT: About the creator (for Ony to edit)
DRAFT. Written only from the facts given. Ony to edit, add
links, and confirm before publishing. Nothing below
should be expanded without his input.
Ony Snow Independent investigative journalist and software
developer · Indianapolis
Ony Snow is an independent investigative journalist and software
developer based in Indianapolis. His work spans photography and
videography, investigative journalism, software engineering, writing
and design. He runs OnySnow Studios.
He is building this workbench so that people can investigate the
powerful.
"I want justice to become something we can all help
deliver."
[Contact] · [OnySnow Studios] · [Read the mission]
(Placeholders for Ony: a photo of his choosing, captioned as his own;
links to published work; anything else he wants to say about why he
built it.)
Redesigning the investigation workbench 247 / 252
Decisions for Ony, and the build
order
What only you can decide, the packages that need a decision record before they are
added, and the order to build in so each step stands on the last.
12
Redesigning the investigation workbench 248 / 252
Decisions for Ony
TOPIC THE QUESTION
Name Pick a product name (12 proposals; availability of domains and trademarks not yet checked).
Edge navigation Open edge panels when the pointer pauses at the edge (recommended, with a switch), or only on click and keys?
Next up order Rank decisions by what would change the story (recommended) or by age?
Alerts May Textbook flags and safety warnings show a notice at the top, or only add to the bell count?
Rain Noir Is rain on at first use, and which of your night photographs goes behind the glass?
Outside lookups You chose "automatic"; the research and the suite's safest default is "ask first". Which?
Supported Are the seven "Supported" rules right, and may a written override be allowed? Replace the 0–100% slider with the IPCC evidence ×
agreement grid?
Decide screen Do watchlist hits and AI drafts live in Decide, or only show a count there?
Unset levels 2,673 indicators have Faint and 2,661 have Strong still "To be set by Ony". Show them as "not set", or hide them? May a reporter set a
Strong threshold for one case?
Glossary Show every area's own definition of a shared term (e.g. 7 definitions of "shell company") instead of the first one only?
Links the app works out May the app draw links it inferred (dotted), and do the money-flow checks become Red Flags?
Stories One story per case or several? Which of the five pre-publication checks are on by default? Should evidence packs be signed with a local
key?
Social Should the app post to social itself, or only export the cards?
Paper Trail The suite calls its ledger "Paper Trail"; the app uses that name for the sources panel. Keep "Paper Trail" for sources and call the suite's
ledger "Run record"?
Website Licence and price; whether the code is open; any telemetry; your portrait, night photo, links and contact route; confirm every safety
sentence is true.
Redesigning the investigation workbench 249 / 252
Backups Add an optional passphrase (encryption) to backups?
Redesigning the investigation workbench 250 / 252
Decision records needed before adding packages
A motion library (or browser-native transitions only)
A command-palette package
Porting the Rain Noir effects engine (WebGL, framer-motion,
html-to-image, the liquid-glass library — licences to check)
Bundling fonts locally (privacy)
A virtualised list for very large cases
An editor for write-ups (TipTap)
A PDF renderer and share-card image rendering
The AI run event store and its streaming endpoint (FastAPI built
in, no new package)
Evidence anchors and check results (data model)
Optional: d3-sankey, a timeline library, C2PA content credentials,
a headless browser for web snapshots
Build order
# STEP WHAT
1 Foundations Tokens and themes as CSS variables; the status grammar component; the app frame with edge navigation, breadcrumbs and
addresses; 
⌘
K.
2 The Authority System Suite Swap TAS for the suite at commit b1c71e8; fix the output contract (tier floor D, confidence terms, CFLT-,
UNRESOLVED_CONFLICT); tests and CI.
3 Case home and Decide One standing-numbers endpoint, the Next up queue, the unified Decide screen, the definition of done for Supported.
4 Bring in The Drop, the digestion line with per-file steps, the reading room, self-checking quotes.
5 See The shared certainty lines, the time rail, the network as sentences, money flows with integrity checks, the timeline views.
6 Act Red Flags full screen with the ladder, leads lanes, the story tree, the write-up editor, Export.
7 The AI run view Run events and the stream; Watch the run; the trace drawer; run controls.
8 Knowledge and safety Catalogue map, indicator pages, the full glossary, Safety & data, encrypted backups; the Safety panel last.
9 Themes and effects The theme setting with live preview; Rain Noir effects; the other formats.
Redesigning the investigation workbench 251 / 252
10 The website After the name, licence and photos are chosen.
Redesigning the investigation workbench 252 / 252