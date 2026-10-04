// @vitest-environment jsdom
// The SVG network's own arithmetic (components/network/network-view.tsx):
// how thick a payment is drawn, where a link's line runs, and when a line is
// bent round a party it does not join. React Flow's drawing itself needs a
// laid-out DOM; it is checked by eye in Chromium.
import {describe, expect, it} from 'vitest';

import {lineWidth, linkPath, passesThrough} from '../components/network/network-view';

describe('the network drawing', () => {
  it('draws a payment thicker the more it moved, on a log scale, between 1.5 and 6 px', () => {
    expect(lineWidth({family: 'owns'})).toBe(2);
    expect(lineWidth({family: 'money'})).toBe(2);                           // no amount: no weight
    expect(lineWidth({family: 'money', amount: 5_000})).toBe(1.5);
    expect(lineWidth({family: 'money', amount: 100_000})).toBeCloseTo(2.9);
    expect(lineWidth({family: 'money', amount: 1_000_000})).toBeCloseTo(4.3);
    expect(lineWidth({family: 'money', amount: 1e12})).toBe(6);
  });

  it('runs a link from the edge of one dot to just short of the other, where its arrowhead sits', () => {
    const {path, mid} = linkPath({x1: 0, y1: 0, x2: 100, y2: 0, r1: 10, r2: 10, bend: 0});
    expect(path).toBe('M13,0 L84,0');
    expect(mid).toEqual({x: 48.5, y: 0});
    expect(linkPath({x1: 0, y1: 0, x2: 100, y2: 0, r1: 10, r2: 10, bend: 0.2}).path).toMatch(/^M13,0 Q48\.5,20 84,0$/);
  });

  it('knows when a straight line would run through a party it does not join', () => {
    const positions = {a: {x: 0, y: 0}, b: {x: 0, y: 200}, c: {x: 0, y: 100}, d: {x: 80, y: 100}};
    expect(passesThrough(positions.a, positions.b, 'a', 'b', positions)).toBe(true);     // c sits on the line
    expect(passesThrough(positions.a, positions.d, 'a', 'd', positions)).toBe(false);
  });
});
