// @vitest-environment jsdom
// One notch of the wheel is one step, whether the device reports pixels, lines or pages (Copilot review of PR 60).
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import type {WheelEvent} from 'react';

import {useWheelStep} from '../features/case-home/wheel-step';

function wheel(deltaY: number, deltaMode: number): WheelEvent {
  return {deltaY, deltaMode} as unknown as WheelEvent;
}

function setup() {
  const setIndex = vi.fn();
  const {result} = renderHook(() => useWheelStep(5, 2, setIndex));
  act(() => result.current.onPointerEnter());
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000); // past the dwell
  return {result, setIndex};
}

describe('useWheelStep', () => {
  it('steps after 60 pixels in pixel mode', () => {
    const {result, setIndex} = setup();
    act(() => result.current.onWheel(wheel(30, 0)));
    expect(setIndex).not.toHaveBeenCalled();
    act(() => result.current.onWheel(wheel(40, 0)));
    expect(setIndex).toHaveBeenCalledWith(3);
  });

  it('steps on a few lines in line mode, not a hundred turns', () => {
    const {result, setIndex} = setup();
    act(() => result.current.onWheel(wheel(4, 1)));
    expect(setIndex).toHaveBeenCalledWith(3);
  });

  it('steps once on one page in page mode, and up for a negative page', () => {
    const {result, setIndex} = setup();
    act(() => result.current.onWheel(wheel(-1, 2)));
    expect(setIndex).toHaveBeenCalledWith(1);
  });
});
