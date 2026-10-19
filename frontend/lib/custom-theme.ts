// "+ Make your own" (mockup HOME_2; research §04.2: "A sixth card: 'Make your own', which starts from any theme and
// refuses colours that fail the contrast floor"; "a custom theme that fails contrast cannot be saved and names the
// failing pair"). A theme of your own is a built-in theme's fonts, effects and calm rules with your colours. It is
// kept in this browser only, like the photograph behind the glass (lib/hero-photo), and never with a case. Every
// read checks it again (lib/contrast), so a stored theme that fails is never applied.
import type {ThemeId} from './theme';
import {checkPalette, COLOUR_TOKENS, isHex, ratioText, type Palette, type PaletteCheck} from './contrast';

/** Each built-in theme's colours, as styles/themes.css sets them (tests/test-custom-theme keeps the two equal). */
export const BASE_PALETTES: Record<ThemeId, Palette> = {
  'case-night': {
    ground: '#14263A', 'surface-1': '#1E3448', 'surface-2': '#26425A', 'surface-3': '#2E4D67', text: '#F5ECDA', 'text-muted': '#C6BBA5',
    line: '#6F8AA3', 'accent-1': '#E8A95B', 'accent-2': '#7FB7E0', 'status-supported': '#9CC5A1', 'status-disputed': '#F39882',
    'status-unshown': '#CBC3B2', 'flag-faint': '#E9AFA8', 'flag-strong': '#F6966A', 'flag-textbook-fill': '#8E2420', 'flag-textbook-edge': '#FF8070', 'ai-mark': '#B7A6E0',
  },
  'rain-noir': {
    ground: '#18120F', 'surface-1': '#211A16', 'surface-2': '#2A221E', 'surface-3': '#342C27', text: '#F0EAE1', 'text-muted': '#B9B0A3',
    line: '#796F69', 'accent-1': '#DD9231', 'accent-2': '#3AB3AD', 'status-supported': '#88D1A2', 'status-disputed': '#F47C6B',
    'status-unshown': '#C5BCB0', 'flag-faint': '#E8ACAB', 'flag-strong': '#F57E4D', 'flag-textbook-fill': '#831B16', 'flag-textbook-edge': '#FF6557', 'ai-mark': '#C3A6E0',
  },
  archive: {
    ground: '#221A15', 'surface-1': '#2C221B', 'surface-2': '#3A2D24', 'surface-3': '#54463A', text: '#F3E7CF', 'text-muted': '#C9B9A0',
    line: '#8C7A66', 'accent-1': '#D9945A', 'accent-2': '#7CC0B4', 'status-supported': '#B3D196', 'status-disputed': '#F0806C',
    'status-unshown': '#CBBD93', 'flag-faint': '#DCA1A1', 'flag-strong': '#F47E6C', 'flag-textbook-fill': '#8B0000', 'flag-textbook-edge': '#FF746C', 'ai-mark': '#C9B2E6',
  },
  'forest-ledger': {
    ground: '#0F272B', 'surface-1': '#163338', 'surface-2': '#1D3F45', 'surface-3': '#264C53', text: '#F4EEDC', 'text-muted': '#B4C2BA',
    line: '#6E8E8C', 'accent-1': '#D4B06A', 'accent-2': '#B5C98A', 'status-supported': '#8EC9E8', 'status-disputed': '#F59078',
    'status-unshown': '#CFC6AE', 'flag-faint': '#F2A7A0', 'flag-strong': '#F78D62', 'flag-textbook-fill': '#8A2420', 'flag-textbook-edge': '#FF7B6B', 'ai-mark': '#C4B4EA',
  },
  'indigo-clarity': {
    ground: '#121233', 'surface-1': '#1B1B45', 'surface-2': '#272757', 'surface-3': '#33336A', text: '#FBF6EA', 'text-muted': '#D2D2E6',
    line: '#9A9AC4', 'accent-1': '#FFD166', 'accent-2': '#A6D4FF', 'status-supported': '#94E6AE', 'status-disputed': '#FFA08F',
    'status-unshown': '#E2DCCB', 'flag-faint': '#F8C0C6', 'flag-strong': '#FF9466', 'flag-textbook-fill': '#A0182A', 'flag-textbook-edge': '#FF9090', 'ai-mark': '#D3C6F5',
  },
};

export type CustomTheme = {id: string; name: string; base: ThemeId; colours: Palette};

/** How many of your own a browser keeps. */
export const MAX_CUSTOM_THEMES = 12;
export const MAX_NAME = 40;
export const CUSTOM_KEY = 'pai:custom-themes';
export const CUSTOM_EVENT = 'pai:custom-themes';

const isBase = (v: unknown): v is ThemeId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BASE_PALETTES, v);

function hsl(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * The CSS custom properties a palette sets: its own tokens, and the shadcn/ui variables styles/themes.css maps
 * from them (background = ground, card = panel, popover and muted = card, secondary, accent and border = selected,
 * input = outline, primary and ring = accent, destructive = Textbook fill).
 */
export function paletteVars(p: Palette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const {token} of COLOUR_TOKENS) vars[`--${token}`] = p[token];
  const fg = hsl(p.text);
  Object.assign(vars, {
    '--background': hsl(p.ground), '--foreground': fg, '--card': hsl(p['surface-1']), '--card-foreground': fg,
    '--popover': hsl(p['surface-2']), '--popover-foreground': fg, '--primary': hsl(p['accent-1']), '--primary-foreground': hsl(p.ground),
    '--secondary': hsl(p['surface-3']), '--secondary-foreground': fg, '--muted': hsl(p['surface-2']), '--muted-foreground': hsl(p['text-muted']),
    '--accent': hsl(p['surface-3']), '--accent-foreground': fg, '--destructive': hsl(p['flag-textbook-fill']), '--destructive-foreground': fg,
    '--border': hsl(p['surface-3']), '--input': hsl(p.line), '--ring': hsl(p['accent-1']),
  });
  return vars;
}

/** A stored entry as a theme, or null when it is malformed or fails the contrast check. */
function readOne(v: unknown): CustomTheme | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(o.id) || typeof o.name !== 'string' || !o.name.trim() || !isBase(o.base)) return null;
  const raw = o.colours as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const colours = {} as Palette;
  for (const {token} of COLOUR_TOKENS) {
    if (!isHex(raw[token])) return null;
    colours[token] = (raw[token] as string).toUpperCase();
  }
  if (checkPalette(colours).failing.length) return null;
  return {id: o.id, name: o.name.trim().slice(0, MAX_NAME), base: o.base, colours};
}

/** Your own themes kept in this browser; any that fail the check are left out. */
export function customThemes(): CustomTheme[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? '[]') as unknown;
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    return list.map(readOne).filter((t): t is CustomTheme => t !== null && !seen.has(t.id) && Boolean(seen.add(t.id))).slice(0, MAX_CUSTOM_THEMES);
  } catch { return []; }
}

export const customTheme = (id: string | null | undefined): CustomTheme | null => (id ? customThemes().find(t => t.id === id) ?? null : null);

function write(list: CustomTheme[]): boolean {
  try {
    // The variables go with each theme so the first-paint script (lib/theme) can set them without this module.
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(list.map(t => ({...t, vars: paletteVars(t.colours)}))));
  } catch { return false; }
  window.dispatchEvent(new Event(CUSTOM_EVENT));
  return true;
}

export type SaveResult = {ok: true; theme: CustomTheme} | {ok: false; reason: string; check?: PaletteCheck};

/** Keep a theme of your own (new, or replacing the one with the same id). Refused while any pair fails. */
export function saveCustomTheme(draft: {id?: string; name: string; base: ThemeId; colours: Palette}): SaveResult {
  const name = draft.name.trim().slice(0, MAX_NAME);
  if (!name) return {ok: false, reason: 'Give it a name first.'};
  if (!isBase(draft.base)) return {ok: false, reason: 'Start from one of the themes.'};
  const colours = {} as Palette;
  for (const {token, name: word} of COLOUR_TOKENS) {
    if (!isHex(draft.colours[token])) return {ok: false, reason: `${word} is not a colour written #rrggbb.`};
    colours[token] = draft.colours[token].toUpperCase();
  }
  const check = checkPalette(colours);
  if (check.failing.length) {
    const f = check.failing[0];
    return {ok: false, check, reason: `${f.what} is ${ratioText(f.ratio, true)}; it needs ${f.min}:1.`};
  }
  const list = customThemes();
  const id = draft.id && list.some(t => t.id === draft.id) ? draft.id : `own-${Date.now().toString(36)}`;
  if (!list.some(t => t.id === id) && list.length >= MAX_CUSTOM_THEMES) return {ok: false, reason: `This browser keeps ${MAX_CUSTOM_THEMES} of your own; delete one first.`};
  const theme: CustomTheme = {id, name, base: draft.base, colours};
  const next = list.some(t => t.id === id) ? list.map(t => (t.id === id ? theme : t)) : [...list, theme];
  return write(next) ? {ok: true, theme} : {ok: false, reason: 'This browser would not keep it (storage is blocked or full).'};
}

export function deleteCustomTheme(id: string): void {
  write(customThemes().filter(t => t.id !== id));
}

export function onCustomThemesChange(fn: () => void): () => void {
  window.addEventListener(CUSTOM_EVENT, fn);
  return () => window.removeEventListener(CUSTOM_EVENT, fn);
}
