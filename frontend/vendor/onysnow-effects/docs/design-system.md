# OnySnow Studios — Design System

**Status:** Proposed
**Date:** 2026-09-21
**Scope:** Tokens, layout primitives, component inventory, and patterns for every feature named so far.

---

## Part 1 — Audit

**Components reviewed:** 58 (46 shadcn/ui, 12 site) · **Issues found:** 6 · **Score: 61/100**

### Token coverage

| Category | Defined | Violations found |
|---|---|---|
| Colors | 22 semantic tokens (OKLCH) | **1** hardcoded hex (`#1a1815`) |
| Typography | 2 families, no formal scale | 4 arbitrary `text-[…]` values |
| Spacing | Tailwind default only | **20 distinct** vertical padding values |
| Radius | 4 tokens | 0 |
| Motion | None defined | durations inline throughout |
| Elevation | shadcn defaults | 0 |

Colour discipline is genuinely good — one stray hex in the whole site. **Spacing is where the system fails.**

### The finding that explains the "clunky, misaligned" complaint

Every section re-declares its own geometry by hand:

| Repeated by hand | Occurrences |
|---|---|
| `px-5 sm:px-8 lg:px-12` (the gutter trio) | 20 |
| `mx-auto max-w-screen-2xl` | 13 |
| Distinct vertical rhythm values | 20 (`py-24`, `py-36`, `pb-28`, `pb-18`, `pt-44`, `py-20`…) |

Nothing enforces agreement, so sections drift apart by a few pixels each and the page reads as subtly broken. This is not sloppiness in any one file — it's a **missing abstraction**. There are no layout primitives, so geometry is copy-pasted, and copies diverge.

The second half of the complaint — "child elements not aligned, different vertical heights" — has the same root. Across all page files there is exactly **one** use of `h-full`, `flex-col` + `mt-auto`, or `items-stretch` combined. Cards in a row size to their own content, so a two-line title pushes its button lower than its neighbour's.

### Priority actions

1. **Introduce layout primitives** (`Section`, `Container`, `Grid`, `Card`) and delete hand-written geometry. Fixes both halves of the complaint structurally, not cosmetically.
2. **Formalise the type and rhythm scales** as tokens so "too big" can never recur by drift.
3. **Define motion tokens** before the blog and parallax work multiply inline durations.

---

## Part 2 — Tokens

### Colour — keep as-is

The OKLCH semantic set is correct. Teal and amber as a film-grading pair, warm charcoal rather than pure black. One addition:

| Token | Value | Use |
|---|---|---|
| `--overlay-scrim` | `oklch(0.12 0.01 55 / 65%)` | Text-over-photograph legibility |
| `--glass-bg` | `oklch(0.145 0.011 55 / 35%)` | Frosted surfaces (header, filter bar) |
| `--glass-border` | `oklch(1 0 0 / 10%)` | Hairline on frosted surfaces |

Replace `#1a1815` with `--card`.

### Typography

Barlow Condensed (display) + Manrope (body). Formalise the ramp so sizes stop being invented per-page:

| Token | Mobile → Desktop | Use |
|---|---|---|
| `display-hero` | 2.75rem → 4.5rem | Homepage hero only |
| `display-1` | 2.25rem → 3.75rem | Page titles |
| `display-2` | 1.75rem → 2.5rem | Section headings |
| `display-3` | 1.25rem → 1.5rem | Card titles |
| `body-lg` | 1.125rem | Lead paragraphs |
| `body` | 1rem / 1.7 | Default |
| `body-sm` | 0.875rem | Captions, meta |
| `eyebrow` | 0.7rem, `0.2em` tracking, uppercase | Section labels |

Display face carries `font-weight: 600–700` and `letter-spacing: -0.02em`; condensed faces need the weight to hold presence at reduced sizes.

### Spacing rhythm — collapse 20 values to 4

| Token | Mobile | Desktop | Use |
|---|---|---|---|
| `--space-section` | 4rem | 7rem | Standard section padding |
| `--space-section-lg` | 5rem | 9rem | Feature/hero-adjacent sections |
| `--space-section-sm` | 2.5rem | 4rem | Dense sections (filter bars, strips) |
| `--gutter` | 1.25rem → 2rem → 3rem | | Horizontal page gutter |

`--container-max: 96rem` (today's `max-w-screen-2xl`).

### Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out-expo` | `cubic-bezier(.22,1,.36,1)` | Reveals, gallery frames |
| `--dur-fast` | 180ms | Hover, focus |
| `--dur-base` | 450ms | Reveals, fades |
| `--dur-slow` | 700ms | Image scale, parallax settle |

Every motion token is wrapped by `prefers-reduced-motion: reduce`.

---

## Part 3 — Layout primitives (new)

These four components are the fix. Once they exist, no page file writes geometry again.

### `<Section>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `size` | `sm \| base \| lg` | `base` | Vertical rhythm token |
| `bleed` | `boolean` | `false` | Skip the container for full-bleed media |
| `tone` | `default \| inverted \| bordered` | `default` | Background treatment |
| `as` | element | `section` | Semantic override |

Applies `--space-section*` and the gutter. Replaces all 20 hand-written padding variants.

### `<Container>`

Applies `mx-auto`, `--container-max`, and the gutter. `width` accepts `prose` (42rem), `content` (64rem), `wide` (96rem) — replacing the ad-hoc `max-w-2xl / 3xl / 4xl / 5xl` scatter.

### `<Grid>`

| Prop | Type | Default | Description |
|---|---|---|---|
| `cols` | `1 \| 2 \| 3 \| 4` | `3` | Desktop columns; steps down responsively |
| `gap` | `hairline \| tight \| base \| loose` | `base` | `hairline` reproduces the `gap-px bg-border` divider look |
| `stretch` | `boolean` | `true` | **Equal-height children** |

`stretch` defaults to `true`. That single default fixes the different-vertical-heights complaint everywhere at once.

### `<Card>`

Composed as `Card > CardBody > CardFooter`, internally `flex flex-col h-full` with `CardFooter` on `mt-auto`. Titles align because bodies share a baseline; buttons align because footers are pinned. **Cards never set their own height.**

---

## Part 4 — Component inventory

### Keep and document (built)

| Component | States | Variants | Docs | Score |
|---|---|---|---|---|
| `Button` | ✅ | ✅ 8 variants | ⚠️ | 8/10 |
| `Img` | ✅ blur→fade | ⚠️ no `srcset` | ✅ | 5/10 |
| `JustifiedGallery` | ✅ | ⚠️ rows only | ✅ | 8/10 |
| `PortfolioFilterBar` | ✅ | ✅ | ✅ | 9/10 |
| `ScrambleText` | ✅ reduced-motion | ✅ | ✅ | 9/10 |
| `SiteHeader` | ✅ frosted, mobile overlay | ✅ | ⚠️ | 8/10 |
| `Reveal` | ✅ | ⚠️ one direction | ❌ | 6/10 |

`Img` scores lowest and is the highest-traffic component on the site — see ADR-0001, action items 1–2.

### Delete

`Gallery.tsx` (superseded), plus twelve unused shadcn components: `chart` (drags in recharts), `carousel`, `menubar`, `context-menu`, `resizable`, `input-otp`, `drawer`, `command`, `pagination`, `breadcrumb`, `hover-card`, `navigation-menu`.

---

## Part 5 — New patterns, by feature

### 5.1 Parallax — `<ParallaxScene>`

**Problem:** the layered depth from calypsoraephotography.com — photograph and overlaid text moving at different rates.

| Prop | Type | Default | Description |
|---|---|---|---|
| `image` | `ImgSource` | — | Background photograph |
| `depth` | `subtle \| standard \| deep` | `standard` | Translation range (4% / 8% / 14% of height) |
| `scrim` | `none \| bottom \| full` | `bottom` | Legibility treatment |
| `children` | node | — | Overlaid content |

Transform-only (`translate3d`), never layout properties. Parallax is **disabled below 768px** and under reduced-motion — on phones it stutters and costs more than it gives.

### 5.2 About / brand — `<SocialRail>`

A horizontal rail of platform links, icons from `lucide-react`, labels visible on desktop and icon-only on mobile. Platforms are **driven from `site_settings`**, so adding one later is a portal edit, not a deploy. Each link carries `rel="me noopener"` — `me` is what lets platforms verify the site as yours.

### 5.3 Magazine blog

This is the most design-heavy addition, and it must **not** reuse `page_content` (see ADR-0001). Posts need ordered, typed blocks.

| Block | Renders | Use |
|---|---|---|
| `opener` | Full-bleed image, title overlaid, parallax | Post header |
| `prose` | `Container width="prose"` | Body text |
| `pull-quote` | Display-2, teal rule, asymmetric indent | Emphasis |
| `image-pair` | Two images, offset vertically | Rhythm |
| `full-bleed` | Edge-to-edge single image | Breath |
| `gallery` | `JustifiedGallery` inline | Sets within a post |
| `caption` | `body-sm`, muted | Under any image |

Stored as JSONB `blocks[]`; the admin editor is a `SortableList` (already built for photos) of typed block forms. The renderer is a switch over block type — every block composes existing primitives, so the magazine look comes from *arrangement*, not new CSS.

`<PostCard>` for the index: `stretch` grid, `Card` footer pinned, 3:2 cover, date + reading time in `body-sm`.

### 5.4 Subscribe — `<SubscribeForm>`

| Variant | Use |
|---|---|
| `inline` | End of a post |
| `banner` | Blog index footer |
| `modal` | Deferred — do not build an interstitial until there's an audience to justify it |

Single email field, `react-hook-form` + `zod`, honeypot field for spam, states: default / submitting / success / already-subscribed / error. Writes to a `subscribers` table; **rate-limit the insert** — like `inquiries`, it is a public unauthenticated write path.

### 5.5 Duo service — `<DuoFeature>` + `<InquiryForm>`

For the daddy/daughter modelling offer. The design encodes the caution we agreed rather than leaving it to copy:

| Decision | Implementation |
|---|---|
| No instant booking | Section has **no** `Button → /book`. The only action is the inquiry form. |
| No name, no age | Component takes no `name`/`age` props — the shape makes it impossible to add carelessly. |
| No location | Inquiry form collects region, never a precise address. |
| Vetted contact | Form asks for company/brand, intended usage, and shoot type as required fields. |

`InquiryForm` states: default / submitting / received / error. Success copy sets expectations plainly — that you review each enquiry personally and reply within a stated window.

This is a design-system-level choice worth naming: **constraints belong in component APIs, not in guidelines.** A prop that doesn't exist can't be misused later.

### 5.6 Booking — `<BookingEmbed>`

Replaces the current placeholder with the Cal.com embed via `@calcom/embed-react`.

| Prop | Type | Description |
|---|---|---|
| `eventSlug` | string | Cal.com event type |
| `theme` | `dark` | Matched to site tokens |

Cal.com handles Stripe, availability, timezones, reschedule and cancel links, and calendar sync — payment code stays out of this codebase entirely. Pass brand colours through the embed's theme API so it doesn't look bolted on. Render a skeleton at the embed's height while it loads, so the page doesn't jump.

### 5.7 Services — `<ServiceCard>`

`Card` with footer pinned. Session types route to `/book`; the duo service routes to its inquiry form. Price is a **display string**, not a number — "From $350" and "Enquire" must both be expressible.

---

## Implementation order

1. Layout primitives + token formalisation, then refactor existing pages onto them. *Fixes the alignment complaint at the root.*
2. `Img` `srcset` (ADR-0001 P0) — highest-traffic component, largest performance win.
3. `ParallaxScene`, `SocialRail`, About section.
4. Blog: schema, block renderer, admin editor, `PostCard`, `SubscribeForm`.
5. `DuoFeature` + `InquiryForm`.
6. `BookingEmbed` with Cal.com.

Steps 1 and 2 come before any new feature. Building the blog on top of unfixed geometry means fixing it twice.

## Open questions

- **Blog and portfolio overlap:** should a post be able to pull an existing portfolio set by category, or always carry its own images? Reuse is tidier; duplication gives per-post editorial control.
- **Subscribe delivery:** Resend is already in Lovable's connector list. Worth confirming you actually intend to write a newsletter before building the send path — collecting addresses you never email is worse than not collecting them.
- **Duo service placement:** its own route, or a section within Services? A route is more linkable for pitching to brands; a section keeps it lower-profile. This is your call and it is as much a safety decision as a navigation one.
