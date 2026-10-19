// @vitest-environment jsdom
// Rain Noir's frosted panels: the effect system's Glass on the board's panels, only in Rain Noir with Effects Full,
// never in a picture of the page, at most FROST_LIMIT at once (GlassLight's cost grows per pane), and the system's
// GlassLight pass mounted once while they show, except under Calm motion or reduced motion.
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../features/effects/webgl', () => ({webglAvailable: () => true}));
vi.mock('@fx/components/site/GlassLight', () => ({GlassLight: () => <i data-testid="glass-light"/>}));
// The bokeh's own component is not what is tested here.
vi.mock('@fx/components/site/BokehField', () => ({BokehField: () => null}));

import {BoardEffects, glassLightOn} from '../features/effects/board-effects';
import {FROST_LIMIT, FrostPanel, FrostStill, frostedPanels, frostOn} from '../features/effects/frost-panel';
import {contrastRatio} from '../lib/contrast';
import {BASE_PALETTES} from '../lib/custom-theme';
import {keepAppearance} from '../lib/theme';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const tick = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const panel = (key: number | string = 1) => <FrostPanel key={key} className="ch-mod" label={`Panel ${key}`}><h2>Bring in</h2></FrostPanel>;

describe('frosted panels', () => {
  it('are the system’s glass in Rain Noir with Effects Full, keeping the panel’s name and words', async () => {
    keepAppearance({theme: 'rain-noir'});
    const {container} = render(panel());
    await tick();
    const pane = container.querySelector('section.glass.ch-mod.frost-panel')!;
    expect(pane).toHaveAttribute('aria-label', 'Panel 1');
    expect(pane).toHaveAttribute('data-material', 'frosted-float');
    expect(pane.querySelector('h2')).toHaveTextContent('Bring in');
  });

  it('are plain panels in other themes, with Effects Light or Off, and in a picture of the page', async () => {
    for (const a of [{theme: 'case-night' as const}, {theme: 'archive' as const}, {theme: 'rain-noir' as const, effects: 'light' as const}, {theme: 'rain-noir' as const, effects: 'off' as const}]) {
      keepAppearance(a);
      const r = render(panel());
      await tick();
      expect(r.container.querySelector('.glass'), JSON.stringify(a)).toBeNull();
      expect(r.container.querySelector('section.ch-mod')).toHaveAttribute('aria-label', 'Panel 1');
      r.unmount();
    }
    keepAppearance({theme: 'rain-noir', effects: 'full'});
    const still = render(<FrostStill.Provider value>{panel()}</FrostStill.Provider>);
    await tick();
    expect(still.container.querySelector('.glass')).toBeNull();
    expect(frostedPanels()).toBe(0);
  });

  it('stay frosted under Calm motion (still glass), and turn plain and back as the theme changes', async () => {
    keepAppearance({theme: 'rain-noir', motion: 'calm'});
    expect(frostOn()).toBe(true);
    const {container} = render(panel());
    await tick();
    expect(container.querySelector('.glass')).not.toBeNull();
    await act(async () => { keepAppearance({theme: 'forest-ledger'}); });
    expect(container.querySelector('.glass')).toBeNull();
    expect(frostedPanels()).toBe(0);
    await act(async () => { keepAppearance({theme: 'rain-noir'}); });
    expect(container.querySelector('.glass')).not.toBeNull();
  });

  it('are never more than FROST_LIMIT at once; the rest stay plain', async () => {
    keepAppearance({theme: 'rain-noir'});
    const r = render(<>{Array.from({length: FROST_LIMIT + 2}, (_, i) => panel(i))}</>);
    await tick();
    expect(r.container.querySelectorAll('.glass.frost-panel')).toHaveLength(FROST_LIMIT);
    expect(r.container.querySelectorAll('section.ch-mod:not(.glass)')).toHaveLength(2);
    expect(frostedPanels()).toBe(FROST_LIMIT);
    r.unmount();
    expect(frostedPanels()).toBe(0);
  });

  it('keep text readable over the brightest bokeh behind them (panel fill 76% over ground plus the strongest light)', () => {
    const p = BASE_PALETTES['rain-noir'];
    const rgb = (h: string) => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16));
    const hex = (c: number[]) => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v * t + rgb(b)[i] * (1 - t)));
    for (const light of [p['accent-1'], p['accent-2']]) {
      // BokehField's strongest disc is 0.34 alpha at its centre, before the frost blurs it.
      const behind = mix(light, p.ground, 0.34);
      const fill = mix(p['surface-1'], behind, 0.76);
      for (const fg of ['text', 'text-muted', 'accent-1', 'accent-2', 'status-supported', 'status-disputed', 'status-unshown'] as const)
        expect(contrastRatio(p[fg], fill), `${fg} over ${light}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the glass light pass', () => {
  it('runs once with the frosted panels, and stops under Calm motion, reduced motion and Effects Light', async () => {
    keepAppearance({theme: 'rain-noir'});
    expect(glassLightOn()).toBe(true);
    const {queryAllByTestId} = render(<BoardEffects/>);
    await tick();
    expect(queryAllByTestId('glass-light')).toHaveLength(1);
    await act(async () => { keepAppearance({motion: 'calm'}); });
    expect(queryAllByTestId('glass-light')).toHaveLength(0);
    await act(async () => { keepAppearance({motion: 'normal', effects: 'light'}); });
    expect(queryAllByTestId('glass-light')).toHaveLength(0);
    keepAppearance({effects: 'full', theme: 'indigo-clarity'});
    expect(glassLightOn()).toBe(false);
    keepAppearance({theme: 'rain-noir'});
    vi.stubGlobal('matchMedia', (q: string) => ({matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {}}));
    expect(glassLightOn()).toBe(false);
  });
});
