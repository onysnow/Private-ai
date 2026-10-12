// @vitest-environment jsdom
// Rain Noir's board effects (ported from the OnySnow Studios site): bokeh on the board, the iris
// when a feature opens, shutter corners on save, neon on a Textbook title; each with its switch,
// all off with Effects Off, the moving ones off with Effects Light or Calm motion.
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {BoardEffects, FEATURE_OPEN_EVENT, NeonTitle, SHUTTER_EVENT, effectOn} from '../features/effects/board-effects';
import {keepAppearance} from '../lib/theme';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => cleanup());

describe('board effects', () => {
  it('belong to Rain Noir, follow the Effects level, Calm motion and each switch', () => {
    keepAppearance({theme: 'case-night'});
    expect(effectOn('bokeh', false)).toBe(false);
    keepAppearance({theme: 'rain-noir'});
    expect(effectOn('bokeh', false)).toBe(true);
    expect(effectOn('iris', true)).toBe(true);
    expect(effectOn('neon', false)).toBe(false);  // off until switched on
    keepAppearance({effects: 'light'});
    expect(effectOn('bokeh', false)).toBe(true);
    expect(effectOn('iris', true)).toBe(false);
    keepAppearance({effects: 'full', motion: 'calm'});
    expect(effectOn('shutter', true)).toBe(false);
    keepAppearance({motion: 'normal', off: ['bokeh']});
    expect(effectOn('bokeh', false)).toBe(false);
    keepAppearance({effects: 'off', off: []});
    expect(effectOn('neon', false)).toBe(false);
  });

  it('draws the bokeh, plays the iris and the shutter corners when asked', () => {
    keepAppearance({theme: 'rain-noir', effects: 'full', motion: 'normal', off: []});
    const {container} = render(<BoardEffects/>);
    expect(container.querySelectorAll('.bokeh')).toHaveLength(6);
    act(() => { window.dispatchEvent(new Event(FEATURE_OPEN_EVENT)); });
    expect(container.querySelectorAll('.iris-blade')).toHaveLength(8);
    act(() => { window.dispatchEvent(new Event(SHUTTER_EVENT)); });
    expect(container.querySelector('.shutter-frame[data-firing]')).not.toBeNull();
  });

  it('sets a Textbook title in neon only when its switch is on, and keeps its words for screen readers', () => {
    keepAppearance({theme: 'rain-noir', effects: 'full', off: []});
    render(<h3><NeonTitle text="Circular ownership"/></h3>);
    expect(screen.getByRole('heading', {name: 'Circular ownership'}).querySelector('.neon__gas')).not.toBeNull();
    act(() => keepAppearance({off: ['neon']}));
    expect(screen.getByRole('heading', {name: 'Circular ownership'}).querySelector('.neon')).toBeNull();
  });
});
