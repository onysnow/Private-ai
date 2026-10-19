// @vitest-environment jsdom
// Rain under Calm motion (research §04.2): the system's "After the rain" weather drawn once, hidden, its picture
// kept as a still frame under the band's words, and the water stopped, so nothing moves. Reduced motion does
// the same; Effects Light stays dry. The water itself is stood in for here (jsdom has no WebGL).
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const photo = vi.hoisted(() => ({value: null as {name: string; url: string} | null}));
const tuning = vi.hoisted(() => ({last: ''}));
vi.mock('../lib/hero-photo', () => ({
  loadHeroPhoto: () => Promise.resolve(photo.value),
  onHeroPhotoChange: () => () => {},
}));
vi.mock('../features/effects/webgl', () => ({webglAvailable: () => true}));
vi.mock('@fx/components/site/WaterDrops', () => ({WaterDrops: () => <i data-testid="water"/>}));
vi.mock('@fx/lib/tuning', async importOriginal => ({
  ...(await importOriginal<typeof import('@fx/lib/tuning')>()),
  applySiteTuning: (raw: string) => { tuning.last = raw; },
}));

import {RainPane, rainMode, STILL_GIVE_UP_MS, STILL_SETTLE_MS} from '../features/effects/rain-pane';
import {keepAppearance} from '../lib/theme';

let n = 0;
beforeEach(() => {
  window.localStorage.clear(); window.sessionStorage.clear();
  // A new photograph each time, so no test reuses another's kept frame.
  photo.value = {name: 'night.jpg', url: `blob:night-${++n}`};
  vi.useFakeTimers({shouldAdvanceTime: true});
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,STILL');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const band = () => render(<RainPane as="header" className="ch-top"><h1>Case</h1></RainPane>);
/** The system's water layer, as WaterDrops puts it on the pane once it has drawn. */
const drawWater = (container: HTMLElement) => {
  const layer = document.createElement('canvas');
  layer.setAttribute('data-layer', 'pane:water');
  container.querySelector('header.glass')!.appendChild(layer);
};

describe('rain under Calm motion', () => {
  it('chooses the still frame under Calm motion or reduced motion, never under Effects Light', () => {
    keepAppearance({theme: 'rain-noir', off: []});
    expect(rainMode()).toBe('rain');
    keepAppearance({motion: 'calm'});
    expect(rainMode()).toBe('still');
    keepAppearance({motion: 'normal', effects: 'light'});
    expect(rainMode()).toBeNull();
    keepAppearance({effects: 'full'});
    vi.stubGlobal('matchMedia', (q: string) => ({matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {}}));
    expect(rainMode()).toBe('still');
  });

  it('draws After the rain once, hidden, keeps its picture under the words, and stops the water', async () => {
    keepAppearance({theme: 'rain-noir', off: [], motion: 'calm'});
    const {container, queryByTestId} = band();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const scene = container.querySelector('.rain-scene')!;
    expect(scene).toHaveAttribute('data-still', 'taking');
    expect(JSON.parse(tuning.last).css.rainType).toBe(5);
    expect(queryByTestId('water')).not.toBeNull();
    expect(container.querySelector('.rain-still')).toBeNull();
    drawWater(container);
    await act(async () => { await vi.advanceTimersByTimeAsync(STILL_SETTLE_MS + 400); });
    expect(scene).toHaveAttribute('data-still', 'taken');
    const still = container.querySelector('header.glass img.rain-still')!;
    expect(still).toHaveAttribute('src', 'data:image/png;base64,STILL');
    expect(still).toHaveClass('glass__water');
    expect(Number((still as HTMLElement).style.zIndex)).toBeLessThan(0);
    expect(queryByTestId('water')).toBeNull();
    expect(container.querySelector('header.glass h1')).toHaveTextContent('Case');
  });

  it('shows the dry photograph if the water never draws', async () => {
    keepAppearance({theme: 'rain-noir', off: [], motion: 'calm'});
    const {container, queryByTestId} = band();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(container.querySelector('.rain-scene')).toHaveAttribute('data-still', 'taking');
    await act(async () => { await vi.advanceTimersByTimeAsync(STILL_GIVE_UP_MS + 400); });
    expect(container.querySelector('.rain-scene')).toHaveAttribute('data-still', 'taken');
    expect(container.querySelector('.rain-still')).toBeNull();
    expect(container.querySelector('.rain-photo')).not.toBeNull();
    expect(queryByTestId('water')).toBeNull();
  });

  it('rains again, Steady, when Calm motion is turned off', async () => {
    keepAppearance({theme: 'rain-noir', off: [], motion: 'calm'});
    const {container, queryByTestId} = band();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    drawWater(container);
    await act(async () => { await vi.advanceTimersByTimeAsync(STILL_SETTLE_MS + 400); });
    expect(queryByTestId('water')).toBeNull();
    await act(async () => { keepAppearance({motion: 'normal'}); await vi.advanceTimersByTimeAsync(0); });
    expect(queryByTestId('water')).not.toBeNull();
    expect(container.querySelector('.rain-still')).toBeNull();
    expect(container.querySelector('.rain-scene')).not.toHaveAttribute('data-still');
    expect(JSON.parse(tuning.last).css.rainType).toBe(2);
  });
});
