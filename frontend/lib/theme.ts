// Themes, effects and format (Workbench-redesign-2026.pdf, chapter 03; Ony, 10 Oct 2026: "there can be entirely
// different website formats/themes"). Three separate choices, each a personal, per-browser setting:
// - theme: colours and type (styles/themes.css, on <html data-theme>);
// - effects: the decorative layer on the board behind panels — full, light or off (never over text);
// - motion: normal, or calm (every movement becomes a short fade; the operating system's setting also counts).
// "Try, then keep": a theme can be tried for this session only; nothing changes for good until Keep.
// Every storage access is wrapped, as in lib/demo-preference.ts: blocked storage falls back to the defaults.

export type ThemeId = 'case-night' | 'rain-noir' | 'archive' | 'forest-ledger' | 'indigo-clarity';
export type Effects = 'full' | 'light' | 'off';
export type Motion = 'normal' | 'calm';
export type Format = 'board' | 'editorial' | 'desk' | 'story';

export type ThemeInfo = {id: ThemeId; name: string; mood: string; swatches: string[]; fonts: string; lowestContrast: string; effects: string;
  /** Where the effects may never go. */ calm: string; /** What the effects cost the computer. */ cost: string};

/** The five themes; every text and interface pair passed the contrast check (lowest pair shown). */
export const THEMES: ThemeInfo[] = [
  {id: 'case-night', name: 'Case Night', mood: 'The newsroom after dark: navy, cream paper, an amber lamp.',
    swatches: ['#14263A', '#1E3448', '#26425A', '#2E4D67', '#F5ECDA', '#E8A95B', '#7FB7E0'], fonts: 'IBM Plex Sans · Source Serif 4 · Plex Mono', lowestContrast: '4.66:1', effects: 'A faint hairline grid on the board', calm: 'Panels and reading areas are plain; the grid stays on the board.', cost: 'Next to none: one still background.'},
  {id: 'rain-noir', name: 'Rain Noir', mood: 'A city at night through a wet window: the work stays dry.',
    swatches: ['#18120F', '#211A16', '#2A221E', '#342C27', '#F0EAE1', '#DD9231', '#3AB3AD'], fonts: 'Manrope · Jost 300 titles · Source Serif 4 · Plex Mono', lowestContrast: '5.90:1', effects: 'Drifting bokeh lights, rain on the case-title glass, film grain on the board', calm: 'Lights, rain and grain stay on the board, never over text.', cost: 'Bokeh drift and one rain pane (WebGL); none with Effects Light or Off.'},
  {id: 'archive', name: 'Archive', mood: 'A records room: manila folders, a desk lamp.',
    swatches: ['#221A15', '#2C221B', '#3A2D24', '#54463A', '#F3E7CF', '#D9945A', '#7CC0B4'], fonts: 'Public Sans · Domine · Plex Mono', lowestContrast: '4.72:1', effects: 'Paper grain on the board', calm: 'Grain stays on the board, never under text.', cost: 'Next to none: one still texture.'},
  {id: 'forest-ledger', name: 'Forest Ledger', mood: 'A quiet library for long sessions. No effects.',
    swatches: ['#0F272B', '#163338', '#1D3F45', '#264C53', '#F4EEDC', '#D4B06A', '#B5C98A'], fonts: 'Inter · Newsreader · Plex Mono', lowestContrast: '4.84:1', effects: 'None: depth from shadow only', calm: 'No effects, so nothing to keep away from text.', cost: 'None.'},
  {id: 'indigo-clarity', name: 'Indigo Clarity', mood: 'High clarity, low motion. For tired eyes and bright rooms.',
    swatches: ['#121233', '#1B1B45', '#272757', '#33336A', '#FBF6EA', '#FFD166', '#A6D4FF'], fonts: 'Inclusive Sans · Lexend · Plex Mono', lowestContrast: '6.39:1', effects: 'None', calm: 'No effects, so nothing to keep away from text.', cost: 'None.'},
];

export const FORMATS: {id: Format; name: string; line: string; ready: boolean}[] = [
  {id: 'board', name: 'Board', line: 'Panels float over a board; navigation waits at the edges.', ready: true},
  {id: 'editorial', name: 'Editorial', line: 'The case home as a list of huge words; point at one to preview it.', ready: false},
  {id: 'desk', name: 'Desk', line: 'The case as a corkboard of evidence; the selected item opens as one calm card.', ready: false},
  {id: 'story', name: 'Story', line: 'Chapter by chapter, each in its own tint, with how far through you are.', ready: false},
];

/** The named board effects that can be switched off one by one (mockup HOME_2). */
export type NamedEffect = 'bokeh' | 'rain' | 'grain' | 'iris' | 'shutter' | 'neon';
export const NAMED_EFFECTS: NamedEffect[] = ['bokeh', 'rain', 'grain', 'iris', 'shutter', 'neon'];
/** Neon starts off (research §04.11: "steady only, off by default"). */
const OFF_AT_FIRST: NamedEffect[] = ['neon'];
export type Appearance = {theme: ThemeId; effects: Effects; motion: Motion; format: Format; off: NamedEffect[]};
export const DEFAULT_APPEARANCE: Appearance = {theme: 'case-night', effects: 'full', motion: 'normal', format: 'board', off: ['neon']};

const KEY = 'pai:appearance';
const TRY_KEY = 'pai:appearance-trying';
const EVENT = 'pai:appearance';

function parse(raw: string | null): Partial<Appearance> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Partial<Appearance>;
    return typeof v === 'object' && v ? v : {};
  } catch {
    return {};
  }
}

function valid(a: Partial<Appearance>): Appearance {
  return {
    theme: THEMES.some(t => t.id === a.theme) ? a.theme as ThemeId : DEFAULT_APPEARANCE.theme,
    effects: a.effects === 'light' || a.effects === 'off' ? a.effects : 'full',
    motion: a.motion === 'calm' ? 'calm' : 'normal',
    format: FORMATS.some(f => f.id === a.format && f.ready) ? a.format as Format : 'board',
    off: Array.isArray(a.off) ? NAMED_EFFECTS.filter(e => a.off!.includes(e)) : [...OFF_AT_FIRST],
  };
}

/** The kept appearance (what stays after Keep). */
export function keptAppearance(): Appearance {
  try { return valid(parse(window.localStorage.getItem(KEY))); } catch { return DEFAULT_APPEARANCE; }
}

/** The theme being tried this session, if any. */
export function tryingTheme(): ThemeId | null {
  try {
    const t = window.sessionStorage.getItem(TRY_KEY);
    return THEMES.some(x => x.id === t) ? t as ThemeId : null;
  } catch { return null; }
}

/** What the screen shows now: the kept appearance, with a theme on trial if one is. */
export function currentAppearance(): Appearance {
  const kept = keptAppearance();
  const trying = tryingTheme();
  return trying ? {...kept, theme: trying} : kept;
}

export function applyAppearance(a: Appearance = currentAppearance()): void {
  const html = document.documentElement;
  html.dataset.theme = a.theme;
  html.dataset.effects = a.effects;
  html.dataset.motion = a.motion;
  html.dataset.format = a.format;
  html.dataset.fxOff = a.off.join(' ');
}

function changed(): void {
  applyAppearance();
  window.dispatchEvent(new Event(EVENT));
}

export function keepAppearance(patch: Partial<Appearance>): void {
  const next = valid({...keptAppearance(), ...patch});
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* best effort */ }
  if (patch.theme) { try { window.sessionStorage.removeItem(TRY_KEY); } catch { /* best effort */ } }
  changed();
}

/** Try a theme for this session only; Keep makes it stay, Go back drops it. */
export function tryTheme(theme: ThemeId | null): void {
  try {
    if (theme) window.sessionStorage.setItem(TRY_KEY, theme);
    else window.sessionStorage.removeItem(TRY_KEY);
  } catch { /* best effort */ }
  changed();
}

export function onAppearanceChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/** Runs before the first paint (in <head>), so a kept theme never flashes the default. Must stay self-contained. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem('${KEY}')||'{}');var t=sessionStorage.getItem('${TRY_KEY}');var h=document.documentElement;h.dataset.theme=t||a.theme||'case-night';h.dataset.effects=a.effects||'full';h.dataset.motion=a.motion||'normal';h.dataset.format='board';h.dataset.fxOff=(a.off||['neon']).join(' ');}catch(e){}})();`;
