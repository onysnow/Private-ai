'use client';
// Appearance's before/after (mockup HOME_2): the real Case home of the open case, drawn
// twice, once in the theme you use and once in the theme you are looking at, split by a
// divider you drag (react-compare-slider; arrow keys move it). Both copies are pictures
// only: inert, hidden from assistive technology, their keys switched off. A theme of your own is drawn as its base
// theme with its colours set on the copy (lib/custom-theme), as the app sets them on the whole page.
import {useQuery} from '@tanstack/react-query';
import {ReactCompareSlider} from 'react-compare-slider';
import {useCallback, useRef, useState} from 'react';
import type {CSSProperties, ReactElement} from 'react';

import {CaseHome} from '../case-home/case-home';
import {listInvestigationsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {Palette} from '../../lib/contrast';
import {paletteVars} from '../../lib/custom-theme';
import {THEMES, type ThemeId} from '../../lib/theme';
import {useWorkbenchStore} from '../../lib/workbench-store';

const SCREEN_W = 1440;
const SCREEN_H = 900;

/** The scale that fits a full screen into the box, measured whenever the box appears or resizes. */
function useScale(): [(el: HTMLDivElement | null) => void, number] {
  const [scale, setScale] = useState(0.5);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    if (el.clientWidth) setScale(el.clientWidth / SCREEN_W);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / SCREEN_W));
    observer.current.observe(el);
  }, []);
  return [ref, scale];
}

/** One side of the divider: a built-in theme, or one of your own (its base theme, its colours and its name). */
export type Look = {theme: ThemeId; colours?: Palette | null; name?: string};

export function ThemeCompare({before, after, afterWord = 'trying'}: {before: Look; after: Look; afterWord?: string}): ReactElement {
  const inv = useWorkbenchStore(state => state.investigationId);
  const cases = useQuery(listInvestigationsOptions()).data ?? [];
  const investigation = cases.find(c => c.id === inv) ?? cases[0] ?? null;
  const [box, scale] = useScale();
  const name = (look: Look) => look.name ?? THEMES.find(t => t.id === look.theme)?.name ?? look.theme;
  if (!investigation) return <p className="ap-live-none">Open or start a case to see its Case home here in each theme.</p>;
  const shot = (look: Look) => <div className="ap-live" data-theme={look.theme} inert aria-hidden="true"
    style={look.colours ? paletteVars(look.colours) as CSSProperties : undefined}>
    <div className="ap-live-screen" style={{width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})`}}>
      <CaseHome investigation={investigation} investigations={cases} onSwitch={() => undefined} loading={false} active={false} preview/>
    </div>
  </div>;
  return <figure className="ap-compare">
    <figcaption className="ap-pane-head"><h2>Your case, live</h2><span>{investigation.name} · Case home</span></figcaption>
    <div ref={box} className="ap-compare-box" style={{aspectRatio: `${SCREEN_W} / ${SCREEN_H}`}}>
      <ReactCompareSlider itemOne={shot(before)} itemTwo={shot(after)} defaultPosition={50}
        aria-label={`Divider between ${name(before)} and ${name(after)}`}/>
      <span className="ap-corner ap-corner-l" aria-hidden="true">{name(before)} · now</span>
      <span className="ap-corner ap-corner-r" aria-hidden="true">{name(after)} · {afterWord}</span>
    </div>
  </figure>;
}
