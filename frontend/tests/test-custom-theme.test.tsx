// @vitest-environment jsdom
// "+ Make your own" (mockup HOME_2): the contrast check every theme passes (lib/contrast), themes of your own kept
// in this browser (lib/custom-theme) and applied over their base theme (lib/theme), and the maker in
// Settings › Appearance: a failing pair is named and refuses Save; a saved theme is tried, kept and deleted.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AppearancePanel, TryingBar} from '../features/appearance/appearance-panel';
import {checkPalette, COLOUR_TOKENS, contrastRatio, ratioText} from '../lib/contrast';
import {BASE_PALETTES, CUSTOM_KEY, customThemes, deleteCustomTheme, paletteVars, saveCustomTheme} from '../lib/custom-theme';
import {APPEARANCE_BOOT_SCRIPT, applyAppearance, currentAppearance, keepAppearance, keptAppearance, THEMES, tryTheme} from '../lib/theme';
import {QueryProvider} from '../lib/query-client';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn()}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings',
}));

const html = document.documentElement;
beforeEach(() => {
  window.localStorage.clear(); window.sessionStorage.clear();
  applyAppearance();
  html.removeAttribute('style');
});
afterEach(() => cleanup());

/** styles/themes.css, block by block: each theme's custom properties. */
const css = readFileSync(join(__dirname, '../styles/themes.css'), 'utf8');
const cssVars = (id: string): Record<string, string> => {
  const body = new RegExp(`\\[data-theme='${id}'\\] \\{([^}]*)\\}`).exec(css)![1];
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+): ([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};

const night = (): Parameters<typeof saveCustomTheme>[0] => ({name: 'Night desk', base: 'rain-noir', colours: {...BASE_PALETTES['rain-noir'], 'accent-1': '#E0A040'}});

describe('the contrast check', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
    expect(ratioText(4.6599)).toBe('4.66:1');
    expect(ratioText(4.4999, true)).toBe('4.49:1');
  });

  it('passes every built-in theme, and each one’s lowest pair is the one its card shows', () => {
    for (const t of THEMES) {
      const check = checkPalette(BASE_PALETTES[t.id]);
      expect(check.failing, t.id).toEqual([]);
      expect(ratioText(check.lowest.ratio), t.id).toBe(t.lowestContrast);
    }
  });

  it('keeps the built-in palettes and their derived variables equal to styles/themes.css', () => {
    for (const t of THEMES) {
      const vars = cssVars(t.id);
      const mine = paletteVars(BASE_PALETTES[t.id]);
      for (const {token} of COLOUR_TOKENS) expect(mine[`--${token}`].toUpperCase(), `${t.id} ${token}`).toBe(vars[`--${token}`].toUpperCase());
      // The shadcn/ui variables: within a point of rounding of the hand-written ones.
      for (const name of ['--background', '--card', '--popover', '--primary', '--secondary', '--muted-foreground', '--input', '--destructive']) {
        const a = mine[name].split(/[ %]+/).filter(Boolean).map(Number);
        const b = vars[name].split(/[ %]+/).filter(Boolean).map(Number);
        a.forEach((x, i) => expect(Math.abs(x - b[i]), `${t.id} ${name}`).toBeLessThanOrEqual(1));
      }
    }
  });
});

describe('themes of your own', () => {
  it('refuses a failing pair by name, or no name, and keeps a passing theme in this browser', () => {
    const bad = saveCustomTheme({...night(), colours: {...night().colours, 'text-muted': '#55504A'}});
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toMatch(/^Quiet text on the ground is \d\.\d\d:1; it needs 4.5:1\.$/);
    expect(saveCustomTheme({...night(), name: '  '})).toMatchObject({ok: false, reason: 'Give it a name first.'});
    expect(customThemes()).toEqual([]);
    const ok = saveCustomTheme(night());
    expect(ok.ok).toBe(true);
    expect(customThemes()).toMatchObject([{name: 'Night desk', base: 'rain-noir'}]);
  });

  it('never reads back a stored theme that fails the check or is malformed', () => {
    const good = saveCustomTheme(night());
    const stored = JSON.parse(window.localStorage.getItem(CUSTOM_KEY)!);
    stored.push({...stored[0], id: 'own-bad', colours: {...stored[0].colours, text: '#222222'}}, {id: 'own-x', name: 'x', base: 'nope', colours: {}});
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(stored));
    expect(customThemes().map(t => t.id)).toEqual([good.ok && good.theme.id]);
  });

  it('is tried and kept over its base theme, with its colours on the page, and leaves when deleted', () => {
    const saved = saveCustomTheme(night());
    if (!saved.ok) throw new Error(saved.reason);
    const id = saved.theme.id;
    tryTheme('rain-noir', id);
    expect(currentAppearance()).toMatchObject({theme: 'rain-noir', custom: id});
    expect(keptAppearance().custom).toBeNull();
    expect(html.dataset.theme).toBe('rain-noir');
    expect(html.style.getPropertyValue('--accent-1')).toBe('#E0A040');
    keepAppearance({theme: 'rain-noir', custom: id});
    expect(keptAppearance()).toMatchObject({theme: 'rain-noir', custom: id});
    expect(html.dataset.custom).toBe(id);
    // A built-in theme chosen afterwards leaves it.
    keepAppearance({theme: 'archive'});
    expect(keptAppearance().custom).toBeNull();
    expect(html.style.getPropertyValue('--accent-1')).toBe('');
    keepAppearance({custom: id});
    expect(keptAppearance().theme).toBe('rain-noir');
    deleteCustomTheme(id);
    keepAppearance({});
    expect(keptAppearance()).toMatchObject({theme: 'rain-noir', custom: null});
    expect(html.dataset.custom).toBeUndefined();
  });

  it('is set before the first paint by the boot script', () => {
    const saved = saveCustomTheme(night());
    if (!saved.ok) throw new Error(saved.reason);
    keepAppearance({custom: saved.theme.id});
    html.removeAttribute('style');
    html.dataset.theme = 'case-night';
    new Function(APPEARANCE_BOOT_SCRIPT)();
    expect(html.dataset.theme).toBe('rain-noir');
    expect(html.style.getPropertyValue('--accent-1')).toBe('#E0A040');
    expect(html.style.getPropertyValue('--card')).toBe(paletteVars(saved.theme.colours)['--card']);
  });
});

describe('the theme maker', () => {
  const panel = () => {
    connectGeneratedClient(new ApiClient('http://api.test'));
    mockApi({'GET /api/investigations': []});
    return render(<QueryProvider><AppearancePanel/><TryingBar/></QueryProvider>);
  };

  it('checks each pair as you change colours, names the failing one, and saves only when all pass', async () => {
    panel();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: /\+ Make your own/}));
    const maker = screen.getByRole('region', {name: 'Make your own theme'});
    expect(within(maker).getByRole('combobox', {name: 'Start from'})).toHaveValue('case-night');
    await user.selectOptions(within(maker).getByRole('combobox', {name: 'Start from'}), 'rain-noir');
    expect(within(maker).getByText(/✓ Passes all 21 checks · lowest pair 5.90:1 · AA/)).toBeInTheDocument();
    const quiet = within(maker).getByRole('textbox', {name: 'Quiet text, written #rrggbb'});
    await user.clear(quiet);
    await user.type(quiet, '#55504A');
    expect(within(maker).getByText(/✕ \d+ of 21 pairs fail · cannot be saved yet/)).toBeInTheDocument();
    expect(within(maker).getAllByText(/Quiet text on the ground/)[0].closest('li')).toHaveTextContent(/✕.*fails/);
    await user.type(within(maker).getByRole('textbox', {name: 'Name'}), 'Night desk');
    await user.click(within(maker).getByRole('button', {name: 'Save and try it'}));
    expect(within(maker).getByRole('alert')).toHaveTextContent(/Quiet text on the ground is .*; it needs 4.5:1\./);
    expect(customThemes()).toEqual([]);
    await user.clear(quiet);
    await user.type(quiet, '#C8BFB2');
    await user.click(within(maker).getByRole('button', {name: 'Save and try it'}));
    expect(customThemes()).toMatchObject([{name: 'Night desk', base: 'rain-noir', colours: {'text-muted': '#C8BFB2'}}]);
    expect(screen.queryByRole('region', {name: 'Make your own theme'})).toBeNull();
    expect(screen.getByRole('radio', {name: 'Night desk theme (your own), trying'})).toBeInTheDocument();
    const bar = screen.getByRole('status', {name: ''});
    expect(bar).toHaveTextContent('Trying Night desk');
    await user.click(within(bar).getByRole('button', {name: 'Keep Night desk'}));
    expect(keptAppearance().custom).toBe(customThemes()[0].id);
    expect(html.style.getPropertyValue('--text-muted')).toBe('#C8BFB2');
  });

  it('edits and deletes a theme of your own; deleting the one in use goes back to its base theme', async () => {
    const saved = saveCustomTheme(night());
    if (!saved.ok) throw new Error(saved.reason);
    keepAppearance({custom: saved.theme.id});
    panel();
    const user = userEvent.setup();
    expect(screen.getByRole('radio', {name: 'Night desk theme (your own), in use'})).toHaveAttribute('data-theme', 'rain-noir');
    await user.click(screen.getByRole('button', {name: 'Edit'}));
    const maker = screen.getByRole('region', {name: 'Edit Night desk'});
    const name = within(maker).getByRole('textbox', {name: 'Name'});
    await user.clear(name);
    await user.type(name, 'Late desk');
    await user.click(within(maker).getByRole('button', {name: 'Save changes'}));
    expect(customThemes()).toMatchObject([{id: saved.theme.id, name: 'Late desk'}]);
    await user.click(screen.getByRole('button', {name: 'Delete…'}));
    await user.click(screen.getByRole('button', {name: 'Delete'}));
    expect(customThemes()).toEqual([]);
    expect(keptAppearance()).toMatchObject({theme: 'rain-noir', custom: null});
    expect(screen.queryByRole('radio', {name: /Late desk/})).toBeNull();
    expect(html.style.getPropertyValue('--accent-1')).toBe('');
  });
});
