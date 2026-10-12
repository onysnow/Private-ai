'use client';
// Rain Noir's board effects, ported from the OnySnow Studios site (onysnow/onysnow-studios,
// src/components/site/BokehField.tsx, CameraIris.tsx and the shutter-frame and neon rules in
// src/styles.css), as the redesign asks (chapter 03, §04.11): bokeh lights on the board, the
// iris when a whole-screen feature opens, shutter corners when evidence is saved, and a
// steady neon title on an opened Textbook flag. Each is on the board or a transition only,
// never over text that is being read, and each has its own switch in Settings › Appearance;
// Effects Off turns them all off, Effects Light keeps only the still ones, and Calm motion or
// the computer's reduced-motion setting stops every moving one.
// The rain pane and the glass panes need the site's WebGL engine and are not ported here
// (ADR-0009).
import {useEffect, useId, useState} from 'react';
import type {CSSProperties, ReactElement} from 'react';

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

// BokehField: a fixed table, so the server and client render the same; each light drifts on its own clock.
type Light = {left: number; top: number; size: number; tint: 'amber' | 'teal'; alpha: number; dx: number; dy: number; duration: number; delay: number};
const LIGHTS: Light[] = [
  {left: 6, top: 18, size: 17, tint: 'amber', alpha: 0.34, dx: 3.5, dy: -2.2, duration: 26, delay: 0},
  {left: 22, top: 66, size: 11, tint: 'teal', alpha: 0.3, dx: -2.6, dy: -3, duration: 31, delay: -7},
  {left: 41, top: 12, size: 9, tint: 'teal', alpha: 0.22, dx: 2.2, dy: 2.8, duration: 23, delay: -14},
  {left: 58, top: 72, size: 15, tint: 'amber', alpha: 0.28, dx: -3.2, dy: -1.8, duration: 29, delay: -4},
  {left: 76, top: 28, size: 20, tint: 'amber', alpha: 0.3, dx: 2.8, dy: 2.4, duration: 34, delay: -19},
  {left: 90, top: 60, size: 12, tint: 'teal', alpha: 0.26, dx: -2.4, dy: -2.6, duration: 27, delay: -11},
];

export function BokehField({className}: {className?: string}): ReactElement {
  return <div aria-hidden="true" className={`bokeh-field ${className ?? ''}`}>
    {LIGHTS.map((l, i) => <span key={i} className="bokeh" style={{
      left: `${l.left}%`, top: `${l.top}%`, width: `${l.size}rem`, height: `${l.size}rem`, marginLeft: `${-l.size / 2}rem`, marginTop: `${-l.size / 2}rem`,
      '--bokeh-tint': l.tint === 'amber' ? 'var(--accent-1)' : 'var(--accent-2)', '--bokeh-alpha': l.alpha, '--bokeh-dx': `${l.dx}rem`, '--bokeh-dy': `${l.dy}rem`,
      '--bokeh-dur': `${l.duration}s`, '--bokeh-delay': `${l.delay}s`,
    } as CSSProperties}/>)}
  </div>;
}

/** CameraIris: eight blades, each hinged on the housing, so the opening is a polygon. */
const BLADES = [0, 45, 90, 135, 180, 225, 270, 315];
export function CameraIris({className}: {className?: string}): ReactElement {
  const housing = `iris-housing-${useId().replace(/:/g, '')}`;
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <clipPath id={housing}><circle cx="50" cy="50" r="46"/></clipPath>
    <g clipPath={`url(#${housing})`}>
      {BLADES.map(angle => <g key={angle} transform={`rotate(${angle} 50 50)`}><path className="iris-blade" d="M 50,4 A 46,46 0 0,1 82.5,17.5 L 50,50 Z"/></g>)}
    </g>
  </svg>;
}

/** Neon: the glass tube, always there, and the gas burning in it; steady, never flickering. */
export function Neon({text, className}: {text: string; className?: string}): ReactElement {
  return <span className={`neon ${className ?? ''}`} aria-label={text}>
    <span className="neon__tube" aria-hidden="true">{text}</span>
    <span className="neon__gas" aria-hidden="true">{text}</span>
  </span>;
}

/** A heading that is neon when the switch is on and the theme carries it, plain text otherwise. */
export function NeonTitle({text}: {text: string}): ReactElement {
  const tick = useAppearanceTick();
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(effectOn('neon', false)); }, [tick]);
  return on ? <Neon text={text}/> : <>{text}</>;
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
