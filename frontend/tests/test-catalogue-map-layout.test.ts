// The catalogue map's layout (features/knowledge/map-layout.ts) and families (features/knowledge/families.ts):
// every one of the catalogue's 42 areas sits in exactly one family; circles never overlap and stay on the map;
// a bigger area gets a bigger circle; an area no family names yet still gets a circle, under "Other".
import {describe, expect, it} from 'vitest';

import {buildLayer} from '../features/knowledge/case-layer';
import {FAMILIES, familyOf, readingOrder, shortAreaName} from '../features/knowledge/families';
import {MAP_H, MAP_W, layoutMap, radius} from '../features/knowledge/map-layout';

// The catalogue's 42 areas and their indicator counts (catalogue/indicators/*.yaml, 19 Oct 2026).
const COUNTS: Record<string, number> = {
  AF: 52, AG: 40, AN: 31, BO: 63, CA: 88, CF: 58, CG: 30, CO: 119, CP: 61, CT: 28, CY: 88, DA: 48, DT: 50, EF: 47, EN: 113, ES: 73, FR: 153, HC: 51,
  HO: 157, HR: 205, HT: 97, IN: 112, KX: 25, LE: 67, MA: 56, ML: 98, OC: 153, OH: 27, PD: 66, PL: 38, PM: 42, PP: 128, PS: 38, SA: 42, SF: 100, SP: 32,
  SV: 46, TH: 23, TR: 17, VA: 47, VE: 93, WS: 44,
};

describe('families', () => {
  it('put each of the 42 areas in exactly one family, with Your safety apart', () => {
    const listed = FAMILIES.flatMap(f => f.areas);
    expect(listed).toHaveLength(42);
    expect(new Set(listed)).toEqual(new Set(Object.keys(COUNTS)));
    expect(FAMILIES).toHaveLength(6);
    expect(familyOf('SA')).toMatchObject({name: 'Your safety', safety: true});
    expect(familyOf('ZZ').name).toBe('Other');
  });

  it('step through the areas family by family', () => {
    const order = readingOrder(Object.keys(COUNTS));
    expect(order.slice(0, 3)).toEqual(['PP', 'SF', 'CT']);
    expect(order[order.length - 1]).toBe('SA');
    expect(readingOrder(['ZZ', 'BO'])).toEqual(['BO', 'ZZ']);
  });

  it('shorten a name for the breadcrumb only up to its first comma or "and"', () => {
    expect(shortAreaName('Hidden ownership and shell companies')).toBe('Hidden ownership');
    expect(shortAreaName('Terrorist financing, proliferation financing and sanctions evasion')).toBe('Terrorist financing');
    expect(shortAreaName('Money laundering')).toBe('Money laundering');
  });
});

describe('layoutMap', () => {
  const {bubbles, labels} = layoutMap(COUNTS);

  it('places every area once, on the map, without overlaps', () => {
    expect(bubbles.map(b => b.key).sort()).toEqual(Object.keys(COUNTS).sort());
    for (const b of bubbles) {
      expect(b.x - b.r).toBeGreaterThanOrEqual(0);
      expect(b.x + b.r).toBeLessThanOrEqual(MAP_W);
      expect(b.y - b.r).toBeGreaterThanOrEqual(0);
      expect(b.y + b.r).toBeLessThanOrEqual(MAP_H);
    }
    for (const a of bubbles) for (const b of bubbles) {
      if (a.key < b.key) expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.key} and ${b.key} overlap`).toBeGreaterThanOrEqual(a.r + b.r);
    }
  });

  it('sizes circles by indicator count and labels each family, the same every time', () => {
    const r = Object.fromEntries(bubbles.map(b => [b.key, b.r]));
    expect(r.HR).toBeGreaterThan(r.BO);
    expect(r.BO).toBeGreaterThan(r.TR);
    expect(radius(1)).toBe(12);
    expect(labels.map(l => l.name)).toEqual(FAMILIES.map(f => f.name));
    expect(labels.find(l => l.safety)?.name).toBe('Your safety');
    expect(layoutMap(COUNTS)).toEqual({bubbles, labels});
  });

  it('gives an area no family names yet a circle under "Other"', () => {
    const out = layoutMap({BO: 63, ZZ: 5});
    expect(out.bubbles.find(b => b.key === 'ZZ')?.family).toBe('other');
    expect(out.labels.map(l => l.name)).toEqual(['Money & companies', 'Other']);
  });
});

describe('buildLayer', () => {
  const flag = (id: string, indicator: string, level: string, weight: number, status = 'open') => ({id, indicator_id: indicator, level, status, weight}) as never;
  it('keeps open flags by indicator, strongest first; counts what fires per area; knows which rules ran', () => {
    const layer = buildLayer({investigation_id: 'i', flags: [flag('a', 'BO-033', 'faint', 1), flag('b', 'BO-033', 'strong', 0.5), flag('c', 'ML-021', 'faint', 1, 'dismissed'),
      flag('d', 'ML-023', 'textbook', 1)], gone: [], rules: [{indicator_id: 'BO-001', version: 1, name: ''}, {indicator_id: 'BO-033', version: 1, name: ''}],
    cannot_run: [{indicator_id: 'BO-001', name: '', reason: 'needs ownership'}], investigation_type: {} as never} as never);
    expect(layer.flags.get('BO-033')?.map(f => f.id)).toEqual(['b', 'a']);
    expect(layer.flags.has('ML-021')).toBe(false);
    expect(Object.fromEntries(layer.firesByArea)).toEqual({BO: 1, ML: 1});
    expect([...layer.ran]).toEqual(['BO-033']);
    expect(buildLayer(undefined).flags.size).toBe(0);
  });
});
