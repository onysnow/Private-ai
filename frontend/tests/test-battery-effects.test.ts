// @vitest-environment jsdom
// On battery, kept Full effects run as Light (lib/theme.ts): the effects themselves read the level they run at, and
// hear when charging changes; the kept choice stays Full.
import {afterEach, describe, expect, it, vi} from 'vitest';

describe('effects on battery', () => {
  afterEach(() => {
    vi.resetModules();
    delete (navigator as {getBattery?: unknown}).getBattery;
    window.localStorage.clear();
  });

  it('runs Full as Light while on battery and tells the effects when charging changes', async () => {
    let onChange: () => void = () => undefined;
    const battery = {charging: false, addEventListener: (_: string, fn: () => void) => { onChange = fn; }};
    (navigator as {getBattery?: () => Promise<typeof battery>}).getBattery = () => Promise.resolve(battery);
    const theme = await import('../lib/theme');
    const heard = vi.fn();
    theme.onAppearanceChange(heard);
    theme.applyAppearance();
    await vi.waitFor(() => expect(theme.effectiveAppearance().effects).toBe('light'));
    expect(theme.currentAppearance().effects).toBe('full');
    expect(heard).toHaveBeenCalled();
    battery.charging = true;
    onChange();
    expect(theme.effectiveAppearance().effects).toBe('full');
    expect(document.documentElement.dataset.effects).toBe('full');
  });
});
