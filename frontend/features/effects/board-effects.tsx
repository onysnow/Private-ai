'use client';
// Rain Noir's board effects, from the OnySnow Studios effect system (vendor/onysnow-effects:
// BokehField, CameraIris, Neon, and the shutter-frame rules of its stylesheet), as the redesign
// asks (chapter 03, §04.11): bokeh lights on the board, the iris when a whole-screen feature opens, shutter corners when evidence is saved, and a
// steady neon title on an opened Textbook flag. Each is on the board or a transition only,
// never over text that is being read, and each has its own switch in Settings › Appearance;
// Effects Off turns them all off, Effects Light keeps only the still ones, and Calm motion or
// the computer's reduced-motion setting stops every moving one.
// The rain pane is features/effects/rain-pane.tsx (ADR-0009).
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {BokehField} from '@fx/components/site/BokehField';
import {CameraIris} from '@fx/components/site/CameraIris';
import {Neon} from '@fx/components/site/Neon';

import {currentAppearance, onAppearanceChange, type NamedEffect} from '../../lib/theme';

/** Fired by anything that opens a whole-screen feature (the reading room). */
export const FEATURE_OPEN_EVENT = 'pai:feature-open';
/** Fired when evidence or a snapshot is saved. */
export const SHUTTER_EVENT = 'pai:shutter';

const reducedMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Whether a named effect shows now: its theme, the Effects level, Calm motion and its own switch. */
export function effectOn(name: NamedEffect, moving: boolean): boolean {
  if (typeof window === 'undefined') return false;
  const a = currentAppearance();
  if (a.theme !== 'rain-noir' || a.effects === 'off' || a.off.includes(name)) return false;
  if (moving && (a.effects === 'light' || a.motion === 'calm' || reducedMotion())) return false;
  return true;
}

/** Re-renders when the appearance changes anywhere. */
function useAppearanceTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => onAppearanceChange(() => setTick(t => t + 1)), []);
  return tick;
}

/** A heading that is neon when the switch is on and the theme carries it, plain text otherwise. */
export function NeonTitle({text}: {text: string}): ReactElement {
  const tick = useAppearanceTick();
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(effectOn('neon', false)); }, [tick]);
  // Neon gas (the red-orange), steady; it lights nothing, the workbench has no light scene.
  return on ? <Neon gas="neon" flicker="steady" lights={false}>{text}</Neon> : <>{text}</>;
}

/** The board's layers and the two transitions, mounted once by the app frame. */
export function BoardEffects(): ReactElement | null {
  useAppearanceTick();
  const [mounted, setMounted] = useState(false);
  const [iris, setIris] = useState(0);
  const [shutter, setShutter] = useState(0);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const open = () => { if (effectOn('iris', true)) setIris(n => n + 1); };
    const save = () => { if (effectOn('shutter', true)) setShutter(n => n + 1); };
    window.addEventListener(FEATURE_OPEN_EVENT, open);
    window.addEventListener(SHUTTER_EVENT, save);
    return () => { window.removeEventListener(FEATURE_OPEN_EVENT, open); window.removeEventListener(SHUTTER_EVENT, save); };
  }, []);
  if (!mounted) return null;
  return <>
    {effectOn('bokeh', false) && <BokehField className="board-bokeh"/>}
    {iris > 0 && <div key={`i${iris}`} className="iris-open" aria-hidden="true" onAnimationEnd={e => { if (e.target === e.currentTarget) setIris(0); }}>
      <CameraIris/></div>}
    {shutter > 0 && <div key={`s${shutter}`} className="shutter-frame" data-firing="" aria-hidden="true" onAnimationEnd={() => setShutter(0)}>
      <span/><span/><span/><span/></div>}
  </>;
}
