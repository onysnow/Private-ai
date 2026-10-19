// Where each area's circle sits on the catalogue map (mockup KNOWLEDGE_KEEP_1, panel A): one cluster per family,
// circles sized by how many indicators the area holds (area, not radius, grows with the count), packed around the
// family's anchor. Pure and deterministic, so the map never jumps between visits and tests can check the layout.
import {FAMILIES} from './families';

export const MAP_W = 480;
export const MAP_H = 490;
const GAP = 4;

/** The anchor of each family's cluster, in the mockup's arrangement. */
const ANCHORS: Record<string, {x: number; y: number}> = {
  money: {x: 118, y: 150}, people: {x: 362, y: 150}, state: {x: 98, y: 384},
  health: {x: 262, y: 392}, information: {x: 410, y: 340}, safety: {x: 424, y: 446}, other: {x: 240, y: 280},
};

export type Bubble = {key: string; family: string; count: number; x: number; y: number; r: number};
export type Label = {family: string; name: string; x: number; y: number; safety: boolean};

export function radius(count: number): number {
  return Math.max(12, 2.15 * Math.sqrt(count));
}

/** Each circle in turn, biggest first, at the first free spot on a spiral out from the anchor. */
function pack(items: {key: string; count: number}[], at: {x: number; y: number}, family: string): Bubble[] {
  const placed: Bubble[] = [];
  for (const item of [...items].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))) {
    const r = radius(item.count);
    let spot = {x: at.x, y: at.y};
    for (let step = 0; step < 4000; step++) {
      const angle = step * 0.35;
      const dist = step * 0.45;
      const x = at.x + Math.cos(angle) * dist * 1.15;
      const y = at.y + Math.sin(angle) * dist * 0.9;
      const inside = x - r >= 4 && x + r <= MAP_W - 4 && y - r >= 30 && y + r <= MAP_H - 4;
      if (inside && placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP)) { spot = {x, y}; break; }
    }
    placed.push({key: item.key, family, count: item.count, x: Math.round(spot.x * 10) / 10, y: Math.round(spot.y * 10) / 10, r});
  }
  return placed;
}

/** Every area's circle and each family's label (above its cluster). Areas no family names go into "Other". */
export function layoutMap(counts: Record<string, number>): {bubbles: Bubble[]; labels: Label[]} {
  const known = Object.keys(counts);
  const groups = FAMILIES.map(f => ({...f, areas: f.areas.filter(a => known.includes(a))}));
  const listed = new Set(groups.flatMap(g => g.areas));
  const rest = known.filter(a => !listed.has(a));
  if (rest.length) groups.push({key: 'other', name: 'Other', areas: rest});
  const bubbles: Bubble[] = [];
  const labels: Label[] = [];
  for (const g of groups) {
    if (!g.areas.length) continue;
    const packed = pack(g.areas.map(key => ({key, count: counts[key]})), ANCHORS[g.key] ?? ANCHORS.other, g.key);
    bubbles.push(...packed);
    const top = Math.min(...packed.map(b => b.y - b.r));
    const bottom = Math.max(...packed.map(b => b.y + b.r));
    const centre = (Math.min(...packed.map(b => b.x - b.r)) + Math.max(...packed.map(b => b.x + b.r))) / 2;
    const safety = Boolean((g as {safety?: boolean}).safety);
    // Your safety's label sits under its circle, the others above their cluster (as in the mockup).
    labels.push({family: g.key, name: g.name, x: centre, y: safety ? bottom + 16 : top - 10, safety});
  }
  return {bubbles, labels};
}
