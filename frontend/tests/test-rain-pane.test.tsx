// @vitest-environment jsdom
// Rain Noir's rain pane: the effect system's Pane and WaterDrops over the reporter's own photograph, only
// with Rain Noir, Effects Full, the Rain switch, a photograph and WebGL; a plain dry band otherwise (Calm motion's
// still frame is tests/test-rain-still).
import {cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const photo = vi.hoisted(() => ({value: null as {name: string; url: string} | null}));
vi.mock('../lib/hero-photo', () => ({
  loadHeroPhoto: () => Promise.resolve(photo.value),
  onHeroPhotoChange: () => () => {},
}));
vi.mock('../features/effects/webgl', () => ({webglAvailable: () => true}));

import {RainPane} from '../features/effects/rain-pane';
import {keepAppearance} from '../lib/theme';

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); photo.value = null; });
afterEach(() => cleanup());

const band = () => render(<RainPane as="header" className="ch-top"><h1>Case</h1></RainPane>);

describe('rain pane', () => {
  it('stands over the chosen photograph as a pane of the effect system, in Rain Noir', async () => {
    keepAppearance({theme: 'rain-noir'});
    photo.value = {name: 'night.jpg', url: 'blob:night'};
    const {container} = band();
    await waitFor(() => expect(container.querySelector('.rain-scene[data-photo]')).not.toBeNull());
    expect(container.querySelector('.rain-photo')).toHaveAttribute('src', 'blob:night');
    expect(container.querySelector('header.glass.ch-top.rain-pane h1')).toHaveTextContent('Case');
  });

  it('is a plain dry band without a photograph, in another theme, or with the Rain switch off', async () => {
    keepAppearance({theme: 'rain-noir'});
    const dry = band();
    await new Promise(r => setTimeout(r, 0));
    expect(dry.container.querySelector('header.ch-top:not(.glass)')).not.toBeNull();
    expect(dry.container.querySelector('.rain-scene')).toBeNull();
    dry.unmount();
    photo.value = {name: 'night.jpg', url: 'blob:night'};
    for (const a of [{theme: 'case-night' as const}, {theme: 'rain-noir' as const, off: ['rain' as const]}, {theme: 'rain-noir' as const, off: [], effects: 'light' as const}, {theme: 'rain-noir' as const, effects: 'off' as const}]) {
      keepAppearance(a);
      const r = band();
      await new Promise(res => setTimeout(res, 0));
      expect(r.container.querySelector('.rain-scene')).toBeNull();
      r.unmount();
    }
  });

  it('never rains on a picture of the page', async () => {
    keepAppearance({theme: 'rain-noir'});
    photo.value = {name: 'night.jpg', url: 'blob:night'};
    const {container} = render(<RainPane as="header" className="ch-top" still><h1>Case</h1></RainPane>);
    await new Promise(r => setTimeout(r, 0));
    expect(container.querySelector('.rain-scene')).toBeNull();
  });
});
