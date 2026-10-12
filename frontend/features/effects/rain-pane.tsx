'use client';
// Rain Noir's rain pane (research §04.11, chapter 03: "one clear-glass Pane with WaterDrops behind the
// case title band ... One pane only"). The pane and the rain are the OnySnow Studios effect system's own
// (vendor/onysnow-effects: effects/react/Pane, components/site/WaterDrops), not a copy of them.
// The rain draws under the band's words, never over them. The system rains only on a pane with a
// photograph behind it, so the band stands over the reporter's own picture (lib/hero-photo, chosen in
// Settings › Appearance). It is there only in Rain Noir, with Effects Full, the Rain switch on, a
// photograph chosen, and Calm motion and the computer's reduced-motion setting both off. Anywhere else,
// or when this computer has no WebGL, the band is a plain dry element.
import {useEffect, useState} from 'react';
import type {ElementType, ReactElement, ReactNode} from 'react';

import {ON_BY_DEFAULT, resetPreviews} from '@fx/effects/engine/preview';
import {Pane} from '@fx/effects/react/Pane';
import {applySiteTuning, SAVED_TUNING_VERSION} from '@fx/lib/tuning';
import {WaterDrops} from '@fx/components/site/WaterDrops';

import {loadHeroPhoto, onHeroPhotoChange} from '../../lib/hero-photo';
import {onAppearanceChange} from '../../lib/theme';
import {effectOn} from './board-effects';
import {webglAvailable} from './webgl';

/**
 * The workbench's settings for the system, in its own saved-tuning form: the band's words stand off the
 * glass (typeOnGlass 0), so the water is drawn under them, never on the letters (research: no rain over
 * text). Steady rain (rainType 2) is the system's default and the research's choice.
 */
const WORKBENCH_TUNING = JSON.stringify({v: SAVED_TUNING_VERSION, css: {typeOnGlass: 0, rainType: 2}});

/**
 * The effect system turns its rain on through its preview list (the site's `?try=drops`). The
 * workbench's own Rain switch is what decides here, so the list is set to the system's defaults
 * plus the rain, and put on the root element as the system's stylesheet expects.
 */
function letItRain(): void {
  const list = [...ON_BY_DEFAULT, 'drops' as const];
  resetPreviews(list);
  document.documentElement.dataset['try'] = list.join(' ');
  applySiteTuning(WORKBENCH_TUNING);
}

export function RainPane({as = 'div', className, still = false, children}: {
  as?: ElementType; className?: string;
  /** A picture of the page (Appearance's before/after): always the plain band, so the rain runs once. */
  still?: boolean;
  children: ReactNode;
}): ReactElement {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const check = () => {
      const rain = !still && effectOn('rain', true) && webglAvailable();
      if (!rain) { setPhoto(null); return; }
      void loadHeroPhoto().then(p => {
        if (!live) return;
        if (p) letItRain();
        setPhoto(p?.url ?? null);
      });
    };
    check();
    const offA = onAppearanceChange(check);
    const offP = onHeroPhotoChange(check);
    return () => { live = false; offA(); offP(); };
  }, [still]);
  if (!photo) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  return <div className="rain-scene" data-photo="">
    {/* Decoration the reporter chose, never evidence; the system reads a real <img> for the drops' lens. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="rain-photo" src={photo} alt="" aria-hidden="true"/>
    <Pane as={as} className={`${className ?? ''} rain-pane`} material="optical-crown" layers={{smudge: 0.4, scratch: 0.2}}>{children}</Pane>
    <WaterDrops/>
  </div>;
}
