'use client';
// Rain Noir's rain pane (research §04.11, chapter 03: "one clear-glass Pane with WaterDrops behind the
// case title band ... One pane only"). The pane and the rain are the OnySnow Studios effect system's own
// (vendor/onysnow-effects: effects/react/Pane, components/site/WaterDrops), not a copy of them.
// The rain draws under the band's words, never over them. The system rains only on a pane with a
// photograph behind it, so the band stands over the reporter's own picture (lib/hero-photo, chosen in
// Settings › Appearance). It rains in Rain Noir, with Effects Full, the Rain switch on and a photograph chosen.
// Under Calm motion or the computer's reduced-motion setting the band shows a still "after the rain" frame
// instead (research §04.2: "under Calm motion ... the rain shows a still 'after the rain' frame"): the
// system's own "After the rain" weather is drawn once, hidden, its picture is kept, and the water stops,
// so nothing on the band moves. Anywhere else (Effects Light or Off, another theme, the Rain switch off),
// or when this computer has no WebGL, the band is a plain dry element.
import {useEffect, useRef, useState} from 'react';
import type {ElementType, ReactElement, ReactNode} from 'react';

import {layerZ} from '@fx/effects/engine/compositor';
import {ON_BY_DEFAULT, resetPreviews} from '@fx/effects/engine/preview';
import {Pane} from '@fx/effects/react/Pane';
import {applySiteTuning, SAVED_TUNING_VERSION} from '@fx/lib/tuning';
import {WaterDrops} from '@fx/components/site/WaterDrops';

import {loadHeroPhoto, onHeroPhotoChange} from '../../lib/hero-photo';
import {currentAppearance, onAppearanceChange} from '../../lib/theme';
import {effectOn} from './board-effects';
import {webglAvailable} from './webgl';

/** The system's rain types (effects/water/rain-types): Steady rain, the research's choice, and After the rain. */
const STEADY = 2;
const AFTER_THE_RAIN = 5;

/**
 * The workbench's settings for the system, in its own saved-tuning form: the band's words stand off the
 * glass (typeOnGlass 0), so the water is drawn under them, never on the letters (research: no rain over
 * text), and the rain type.
 */
const workbenchTuning = (rainType: number): string => JSON.stringify({v: SAVED_TUNING_VERSION, css: {typeOnGlass: 0, rainType}});

/**
 * The effect system turns its rain on through its preview list (the site's `?try=drops`). The
 * workbench's own Rain switch is what decides here, so the list is set to the system's defaults
 * plus the rain, and put on the root element as the system's stylesheet expects.
 */
function letItRain(rainType: number): void {
  const list = [...ON_BY_DEFAULT, 'drops' as const];
  resetPreviews(list);
  document.documentElement.dataset['try'] = list.join(' ');
  applySiteTuning(workbenchTuning(rainType));
}

/** How the band looks now: rain, the still frame, or dry (null). */
export function rainMode(): 'rain' | 'still' | null {
  if (!webglAvailable()) return null;
  if (effectOn('rain', true)) return 'rain';
  // The rain is allowed but may not move: Calm motion or reduced motion (Effects Light stays dry, as before).
  if (effectOn('rain', false) && currentAppearance().effects === 'full') return 'still';
  return null;
}

/** How long the hidden water may take to draw its first frames before the picture is taken, and the most to wait. */
export const STILL_SETTLE_MS = 1200;
export const STILL_GIVE_UP_MS = 8000;

/** The last still frame taken, kept for the same photograph at the same size, so a revisit costs nothing. */
let kept: {photo: string; width: number; url: string} | null = null;

export function RainPane({as = 'div', className, still = false, children}: {
  as?: ElementType; className?: string;
  /** A picture of the page (Appearance's before/after): always the plain band, so the rain runs once. */
  still?: boolean;
  children: ReactNode;
}): ReactElement {
  const [photo, setPhoto] = useState<string | null>(null);
  const [mode, setMode] = useState<'rain' | 'still'>('rain');
  // The still frame: being taken (the water runs, hidden), taken (its picture), or given up (the dry photograph).
  const [frame, setFrame] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const scene = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    const check = () => {
      const next = still ? null : rainMode();
      if (!next) { setPhoto(null); return; }
      void loadHeroPhoto().then(p => {
        if (!live) return;
        if (p) letItRain(next === 'still' ? AFTER_THE_RAIN : STEADY);
        setMode(next);
        setPhoto(p?.url ?? null);
        if (next === 'rain' || !p) { setFrame(null); setTaking(false); return; }
        const width = Math.round(scene.current?.getBoundingClientRect().width ?? 0);
        if (kept && kept.photo === p.url && (!width || Math.abs(kept.width - width) < 2)) { setFrame(kept.url); setTaking(false); return; }
        setFrame(null);
        setTaking(true);
      });
    };
    check();
    const offA = onAppearanceChange(check);
    const offP = onHeroPhotoChange(check);
    return () => { live = false; offA(); offP(); };
  }, [still]);

  // Taking the still frame: wait for the system to draw its water layer, let it settle, keep its picture.
  useEffect(() => {
    if (!taking || !photo) return undefined;
    const started = Date.now();
    let seen = 0;
    const timer = window.setInterval(() => {
      const layer = scene.current?.querySelector<HTMLCanvasElement>('[data-layer="pane:water"]');
      if (layer && layer.width > 0 && layer.height > 0 && !seen) seen = Date.now();
      const done = seen > 0 && Date.now() - seen >= STILL_SETTLE_MS;
      if (!done && Date.now() - started < STILL_GIVE_UP_MS) return;
      window.clearInterval(timer);
      let url: string | null = null;
      if (done && layer) {
        try { url = layer.toDataURL('image/png'); } catch { url = null; }
      }
      if (url) kept = {photo, width: Math.round(scene.current?.getBoundingClientRect().width ?? 0), url};
      setFrame(url);
      setTaking(false);
    }, 150);
    return () => window.clearInterval(timer);
  }, [taking, photo]);

  if (!photo) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const moving = mode === 'rain' || taking;
  return <div ref={scene} className="rain-scene" data-photo="" data-still={mode === 'still' ? (taking ? 'taking' : 'taken') : undefined}>
    {/* Decoration the reporter chose, never evidence; the system reads a real <img> for the drops' lens. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="rain-photo" src={photo} alt="" aria-hidden="true"/>
    <Pane as={as} className={`${className ?? ''} rain-pane`} material="optical-crown" layers={{smudge: 0.4, scratch: 0.2}}>
      {/* The still frame sits where the water layer sat, under the words (the system's class places it). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {mode === 'still' && frame && !taking && <img className="glass__water absolute rain-still" src={frame} alt="" aria-hidden="true" style={{zIndex: layerZ('pane:water')}}/>}
      {children}
    </Pane>
    {moving && <WaterDrops key={mode}/>}
  </div>;
}
