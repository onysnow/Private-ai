'use client';
// Scrolling over a module moves inside it, never the page (Ony's rule; FEATURE_HOME §1
// "Scroll-over"). A module takes the wheel only after the pointer has rested on it a
// moment, so a quick pass on the way elsewhere changes nothing; one notch is one step.
import {useCallback, useRef} from 'react';
import type {WheelEvent} from 'react';

const DWELL_MS = 220;
const NOTCH = 60;
// A wheel reports its distance in pixels, lines or pages (event.deltaMode); a mouse set to lines or a page-mode
// device would otherwise need a hundred turns to reach one notch.
const LINE_PX = 16;
const PAGE_PX = 800;

export function useWheelStep(count: number, index: number, setIndex: (i: number) => void): {onPointerEnter: () => void; onWheel: (event: WheelEvent) => void} {
  const enteredAt = useRef(0);
  const carried = useRef(0);
  const onPointerEnter = useCallback(() => { enteredAt.current = Date.now(); carried.current = 0; }, []);
  const onWheel = useCallback((event: WheelEvent) => {
    if (count < 2 || Date.now() - enteredAt.current < DWELL_MS) return;
    carried.current += event.deltaY * (event.deltaMode === 1 ? LINE_PX : event.deltaMode === 2 ? PAGE_PX : 1);
    if (Math.abs(carried.current) < NOTCH) return;
    const step = carried.current > 0 ? 1 : -1;
    carried.current = 0;
    const next = Math.min(count - 1, Math.max(0, index + step));
    if (next !== index) setIndex(next);
  }, [count, index, setIndex]);
  return {onPointerEnter, onWheel};
}
