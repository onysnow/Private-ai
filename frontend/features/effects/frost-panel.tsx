'use client';
// Rain Noir's frosted panels (research chapter 03 and §04.11: "frosted panels (blur 30 px, saturate 150%) over the
// BokehField"). The pane is the OnySnow Studios effect system's own Glass (vendor/onysnow-effects; its `.glass`
// rule is that blur and saturation), and the system's GlassLight pass draws the glass's resting edges and side
// faces once, then sleeps (board-effects.tsx mounts it). GlassLight's cost grows with every pane it draws, so only
// FROST_LIMIT board panels on a screen are glass; any more stay plain. Only in Rain Noir with Effects Full:
// with Light or Off, in any other theme, and in a picture of the page, a panel is the plain element it always was.
// The calm surfaces (reading room, tables, claims, Chain of Custody, To check, Next up) never use this.
// Frost is still glass, so Calm motion and reduced motion leave it; they stop GlassLight, as the system itself does.
import {createContext, useContext, useEffect, useRef, useState} from 'react';
import type {ElementType, ReactElement, ReactNode} from 'react';

import {Glass} from '@fx/components/site/Glass';
import {DEFAULT_MATERIAL, MATERIAL_ATTR} from '@fx/effects/materials/presets';

import {effectiveAppearance, onAppearanceChange} from '../../lib/theme';

/** How many board panels may be glass at once (with the rain pane, GlassLight draws at most this plus one). */
export const FROST_LIMIT = 4;

let held = 0;

/** Set around a picture of the page (Appearance's before/after), whose panels never take a pane. */
export const FrostStill = createContext(false);

/** How many frosted panels are on screen now (tests). */
export const frostedPanels = (): number => held;

/** Whether the board's panels are frosted now: Rain Noir with Effects Full. */
export function frostOn(): boolean {
  if (typeof window === 'undefined') return false;
  const a = effectiveAppearance();
  return a.theme === 'rain-noir' && a.effects === 'full';
}

export function FrostPanel({as = 'section', className, label, still = false, attrs, children}: {
  as?: ElementType; className?: string; label?: string;
  /** Plain attributes for the element (a data- name, a tabIndex), glass or not. */
  attrs?: Record<string, string | number>;
  /** A picture of the page (Appearance's before/after): always plain, so it never takes a pane. */
  still?: boolean;
  children: ReactNode;
}): ReactElement {
  const [glass, setGlass] = useState(false);
  const mine = useRef(false);
  const plain = useContext(FrostStill) || still;
  useEffect(() => {
    const check = () => {
      const want = !plain && frostOn();
      if (want && !mine.current && held < FROST_LIMIT) { held += 1; mine.current = true; }
      if (!want && mine.current) { held -= 1; mine.current = false; }
      setGlass(mine.current);
    };
    check();
    const off = onAppearanceChange(check);
    return () => {
      off();
      if (mine.current) { held -= 1; mine.current = false; }
    };
  }, [plain]);
  if (!glass) {
    const Tag = as;
    return <Tag className={className} aria-label={label} {...attrs}>{children}</Tag>;
  }
  // The pane's own attributes go through `causes`, which Glass puts on the element (as Pane does with its material).
  const causes: Record<string, string | number> = {...attrs, [MATERIAL_ATTR]: DEFAULT_MATERIAL};
  if (label) causes['aria-label'] = label;
  return <Glass as={as} className={`${className ?? ''} frost-panel`} causes={causes}>{children}</Glass>;
}
