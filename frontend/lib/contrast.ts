// The contrast check every theme passes (research §04.2: "the loader runs the same checks as look_contrast.py
// and refuses a failing theme"; LOOK §D2 contrast floors). WCAG 2.2 relative luminance and contrast ratio, and
// the pairs a theme's colours are used in: text 4.5:1 (AA, success criterion 1.4.3), interface marks 3:1 (1.4.11).
// The pairs are the ones the research computed for Rain Noir ("text on ground 15.51, panel 14.35, selected 11.44;
// muted on selected 6.38; amber 6.72 and teal 6.72 as text; Supported 8.68, Disputed 5.90 ...; outline vs panel
// 3.51"), so each built-in theme's lowest pair here is the one its card shows (tests/test-custom-theme).

/** A theme's colour tokens, as styles/themes.css names them (without the leading "--"). */
export type ColourToken =
  | 'ground' | 'surface-1' | 'surface-2' | 'surface-3' | 'text' | 'text-muted' | 'line' | 'accent-1' | 'accent-2'
  | 'status-supported' | 'status-disputed' | 'status-unshown' | 'flag-faint' | 'flag-strong'
  | 'flag-textbook-fill' | 'flag-textbook-edge' | 'ai-mark';
export type Palette = Record<ColourToken, string>;

/** Every token, in the order the theme maker lists them, with the word the mockups use for it. */
export const COLOUR_TOKENS: {token: ColourToken; name: string; group: 'Surfaces' | 'Text and lines' | 'Accents' | 'Status and flags'}[] = [
  {token: 'ground', name: 'Ground', group: 'Surfaces'},
  {token: 'surface-1', name: 'Panel', group: 'Surfaces'},
  {token: 'surface-2', name: 'Card', group: 'Surfaces'},
  {token: 'surface-3', name: 'Selected', group: 'Surfaces'},
  {token: 'text', name: 'Text', group: 'Text and lines'},
  {token: 'text-muted', name: 'Quiet text', group: 'Text and lines'},
  {token: 'line', name: 'Outline', group: 'Text and lines'},
  {token: 'accent-1', name: 'Accent', group: 'Accents'},
  {token: 'accent-2', name: 'Accent 2', group: 'Accents'},
  {token: 'ai-mark', name: 'AI mark', group: 'Accents'},
  {token: 'status-supported', name: 'Supported', group: 'Status and flags'},
  {token: 'status-disputed', name: 'Disputed', group: 'Status and flags'},
  {token: 'status-unshown', name: 'Not yet shown', group: 'Status and flags'},
  {token: 'flag-faint', name: 'Faint flag', group: 'Status and flags'},
  {token: 'flag-strong', name: 'Strong flag', group: 'Status and flags'},
  {token: 'flag-textbook-fill', name: 'Textbook fill', group: 'Status and flags'},
  {token: 'flag-textbook-edge', name: 'Textbook edge', group: 'Status and flags'},
];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** One pair a theme's colours meet in. A literal colour is one the stylesheet fixes (the Strong chip's dark ink). */
export type ContrastPair = {fg: ColourToken | `#${string}`; bg: ColourToken; min: 4.5 | 3; what: string};

const SURFACES: [ColourToken, string][] = [['ground', 'the ground'], ['surface-1', 'a panel'], ['surface-2', 'a card'], ['surface-3', 'a selected row']];

export const CONTRAST_PAIRS: ContrastPair[] = [
  ...SURFACES.map(([bg, on]): ContrastPair => ({fg: 'text', bg, min: 4.5, what: `Text on ${on}`})),
  ...SURFACES.map(([bg, on]): ContrastPair => ({fg: 'text-muted', bg, min: 4.5, what: `Quiet text on ${on}`})),
  {fg: 'accent-1', bg: 'surface-1', min: 4.5, what: 'Accent as text on a panel'},
  {fg: 'accent-2', bg: 'surface-1', min: 4.5, what: 'Accent 2 as text on a panel'},
  {fg: 'ground', bg: 'accent-1', min: 4.5, what: 'Button words on the accent'},
  {fg: 'status-supported', bg: 'surface-2', min: 4.5, what: 'Supported on a card'},
  {fg: 'status-disputed', bg: 'surface-2', min: 4.5, what: 'Disputed on a card'},
  {fg: 'status-unshown', bg: 'surface-2', min: 4.5, what: 'Not yet shown on a card'},
  {fg: 'flag-faint', bg: 'surface-2', min: 4.5, what: 'Faint flag on a card'},
  {fg: 'flag-strong', bg: 'surface-2', min: 4.5, what: 'Strong flag on a card'},
  {fg: '#1b1b1b', bg: 'flag-strong', min: 4.5, what: 'Ink on the Strong chip'},
  {fg: 'ai-mark', bg: 'surface-2', min: 4.5, what: 'AI mark on a card'},
  {fg: 'text', bg: 'flag-textbook-fill', min: 4.5, what: 'Text on the Textbook fill'},
  {fg: 'line', bg: 'surface-1', min: 3, what: 'Outline against a panel'},
  {fg: 'flag-textbook-edge', bg: 'surface-2', min: 3, what: 'Textbook edge against a card'},
];

export type CheckedPair = ContrastPair & {ratio: number; ok: boolean};
export type PaletteCheck = {pairs: CheckedPair[]; failing: CheckedPair[]; lowest: CheckedPair};

const colourOf = (p: Palette, c: ColourToken | `#${string}`): string => (c.startsWith('#') ? c : p[c as ColourToken]);

/** Every pair of a palette, checked; `lowest` is the lowest text pair (the "Lowest pair" on a theme's card). */
export function checkPalette(p: Palette): PaletteCheck {
  const pairs = CONTRAST_PAIRS.map(pair => {
    const ratio = contrastRatio(colourOf(p, pair.fg), colourOf(p, pair.bg));
    return {...pair, ratio, ok: ratio >= pair.min};
  });
  const text = pairs.filter(x => x.min === 4.5);
  const lowest = text.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return {pairs, failing: pairs.filter(x => !x.ok), lowest};
}

/**
 * A ratio written as the cards write it: "5.90:1", rounded to two places. A pair that fails is written rounded
 * down (`failing`), so a 4.496 that fails never reads as "4.50:1".
 */
export const ratioText = (ratio: number, failing = false): string => `${(failing ? Math.floor(ratio * 100) / 100 : ratio).toFixed(2)}:1`;
