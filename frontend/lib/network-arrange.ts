// Where each party sits in the relationship network, by a rule the reporter
// can read off the drawing. A force-directed drawing alone places parties by
// the layout's physics, not by anything in the records: "in a hairball,
// data is subordinate to layout -- node and edge positions and lengths
// depend as much on the layout algorithm as on the data" (Krzywinski et al.,
// "Hive plots -- rational approach to visualizing networks", Briefings in
// Bioinformatics, 2012). So each arrangement here has one rule, stated in
// the chart's header and drawn as labelled guides (bands, rings, columns):
//
//   control   Who owns and directs whom. Each owner or director sits above
//             what it owns or directs: a layered drawing (Sugiyama, Tagawa
//             and Toda, IEEE SMC 1981; laid out with dagre, as the ownership
//             chain is), whose levels are labelled "top of the chain", "1
//             step down", and so on. Other links are drawn between the
//             levels and do not move anything. Parties in no ownership or
//             directorship sit in a band of their own.
//   around    Around one party: it sits at the centre and each ring holds
//             the parties one more link away (breadth-first over every
//             link). On each ring a party sits near the parties it links to
//             on the ring inside, which keeps links short.
//   kind      By kind: one column per kind of party (people, companies,
//             organisations, ...), most-linked at the top of each -- the
//             hive plot's rule of placing by category and then by a measure.
//   clusters  Linked groups: ForceAtlas2 pulls parties that share links
//             together (lib/network-layout.ts). Its rule is weaker and the
//             header says so: closeness means shared links; direction and
//             distance between groups mean nothing.
//
// Every party is a box of its dot and its name (wrapped to two lines) and
// each arrangement spaces whole boxes, so no two names can overlap.
import dagre from '@dagrejs/dagre';

import {layoutNetwork, networkGraph} from './network-layout';
import {MAX_RADIUS, degrees, mostLinked, partyBox} from './network-rules';
import type {ArrLink, ArrParty, Arrangement, Placed, Guide} from './network-rules';
import {PARTY, PARTY_ORDER} from './viz-tokens';

export {MAX_RADIUS, partyBox};
export type {ArrLink, ArrParty, Arrangement, Placed, Guide};
// ---- the four arrangements --------------------------------------------

const GAP_X = 26;
const GAP_Y = 64;
const BAND_LABEL_WIDTH = 16;        // a level's label sits on its own line at the top of its band, so only a margin is kept
const BAND_LABEL_HEIGHT = 24;


const byKindThenName = (a: ArrParty, b: ArrParty) => PARTY_ORDER.indexOf(a.kind) - PARTY_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

/** Parties in rows left to right, wrapping at `width`; returns their dot centres. */
function rows(items: ArrParty[], left: number, top: number, width: number): {positions: Record<string, {x: number; y: number}>; height: number; right: number} {
  const positions: Record<string, {x: number; y: number}> = {};
  let x = left, y = top, right = left;
  const height = partyBox('').height;
  for (const p of items) {
    const box = partyBox(p.label);
    if (x > left && x + box.width > left + width) { x = left; y += height + 12; }
    positions[p.id] = {x: x + box.width / 2, y: y + MAX_RADIUS};
    x += box.width + GAP_X;
    right = Math.max(right, x - GAP_X);
  }
  return {positions, height: items.length ? y - top + height : 0, right};
}

export function arrangeControl(parties: ArrParty[], links: ArrLink[]): Placed {
  const control = links.filter(l => l.control && l.from !== l.to);
  const inChain = new Set(control.flatMap(l => [l.from, l.to]));
  const g = new dagre.graphlib.Graph({multigraph: true});
  g.setGraph({rankdir: 'TB', nodesep: GAP_X, ranksep: GAP_Y, marginx: 0, marginy: 0});
  g.setDefaultEdgeLabel(() => ({}));
  const chain = parties.filter(p => inChain.has(p.id)).sort(byKindThenName);
  for (const p of chain) { const box = partyBox(p.label); g.setNode(p.id, {width: box.width, height: box.height}); }
  for (const l of control) g.setEdge(l.from, l.to, {}, l.id);
  if (chain.length) dagre.layout(g);
  const positions: Record<string, {x: number; y: number}> = {};
  const height = partyBox('').height;
  // Each level's band holds its label on a line of its own above the parties.
  const top = BAND_LABEL_HEIGHT + 8;
  for (const p of chain) { const n = g.node(p.id); positions[p.id] = {x: n.x + BAND_LABEL_WIDTH, y: n.y - height / 2 + top + MAX_RADIUS + 2}; }
  const levelYs = [...new Set(chain.map(p => Math.round(positions[p.id].y)))].sort((a, b) => a - b);
  const chainWidth = chain.length ? (g.graph().width ?? 0) : 0;
  const width = Math.max(chainWidth + 2 * BAND_LABEL_WIDTH, 320);
  const guides: Guide[] = levelYs.map((y, i) => ({
    type: 'band', x0: 0, x1: width, y0: y - MAX_RADIUS - 2 - top, y1: y - MAX_RADIUS - 2 + height + 6,
    label: i === 0 ? 'Top of the chain' : `${i} step${i > 1 ? 's' : ''} down`,
  }));
  const last = guides[guides.length - 1];
  let bottom = last && last.type === 'band' ? last.y1 : 0;
  const loose = parties.filter(p => !inChain.has(p.id)).sort(byKindThenName);
  if (loose.length) {
    const bandTop = bottom + 18;
    const placed = rows(loose, BAND_LABEL_WIDTH, bandTop + top, width - 2 * BAND_LABEL_WIDTH);
    Object.assign(positions, placed.positions);
    guides.push({type: 'band', x0: 0, x1: width, y0: bandTop, y1: bandTop + top + placed.height + 6, label: 'In no ownership or directorship'});
    bottom = bandTop + top + placed.height + 6;
  }
  return {positions, guides, width, height: bottom};
}

export function arrangeAround(parties: ArrParty[], links: ArrLink[], focus: string): Placed {
  const hop = new Map<string, number>([[focus, 0]]);
  const neighbours = new Map<string, string[]>(parties.map(p => [p.id, []]));
  for (const l of links) { neighbours.get(l.from)?.push(l.to); neighbours.get(l.to)?.push(l.from); }
  let frontier = [focus];
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) for (const other of neighbours.get(id) ?? []) {
      if (!hop.has(other)) { hop.set(other, (hop.get(id) as number) + 1); next.push(other); }
    }
    frontier = next;
  }
  const byId = new Map(parties.map(p => [p.id, p]));
  const rings = Math.max(0, ...hop.values());
  const ringOf = (k: number) => parties.filter(p => hop.get(p.id) === k);
  const share = (p: ArrParty) => partyBox(p.label).width + GAP_X;
  // Each ring is big enough for its boxes side by side, one box height and
  // more beyond the ring inside, and at least 150 px a ring.
  // A ring also clears the ring inside it: its radius is at least the inner
  // ring's plus half the widest box on each, plus a gap (boxes are wider than
  // tall, so width is the larger reach).
  const widest = (members: ArrParty[]) => Math.max(0, ...members.map(p => partyBox(p.label).width));
  const radii: number[] = [0];
  for (let k = 1; k <= rings; k += 1) {
    const members = ringOf(k), inner = k === 1 ? parties.filter(p => p.id === focus) : ringOf(k - 1);
    const circumference = members.reduce((sum, p) => sum + share(p), 0);
    radii.push(Math.max(radii[k - 1] + (widest(inner) + widest(members)) / 2 + GAP_X, circumference / (2 * Math.PI), k * 150));
  }
  const angle = new Map<string, number>();
  const meanAngle = (ids: string[]) => {
    const known = ids.filter(id => angle.has(id)).map(id => angle.get(id) as number);
    if (!known.length) return null;
    return Math.atan2(known.reduce((s, a) => s + Math.sin(a), 0), known.reduce((s, a) => s + Math.cos(a), 0));
  };
  // Place a ring: each party at the angle it wants (or in kind-and-name
  // order when it wants none), then pushed along just enough that no two
  // boxes meet.
  const placeRing = (k: number, wants: (p: ArrParty) => number | null) => {
    const members = ringOf(k);
    const r = radii[k];
    const full = members.reduce((s, p) => s + share(p), 0);
    const room = Math.max(1, (2 * Math.PI * r) / full);           // spare room, shared out
    const wanted = members.map((p, i) => ({p, a: wants(p) ?? -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, members.length)}))
      .sort((x, y) => x.a - y.a || byKindThenName(x.p, y.p));
    const gaps = wanted.map(({p}) => (share(p) / r) * Math.min(room, 1.6));
    let at = wanted.map(w => w.a);
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 1; i < at.length; i += 1) {
        const need = (gaps[i - 1] + gaps[i]) / 2;
        if (at[i] - at[i - 1] < need) at[i] = at[i - 1] + need;
      }
      // Wrapped round: if the last runs into the first, shift the whole ring back by half the overrun.
      const overrun = at.length > 1 ? at[at.length - 1] - (at[0] + 2 * Math.PI) + (gaps[at.length - 1] + gaps[0]) / 2 : 0;
      if (overrun > 0) at = at.map((a, i) => a - (overrun * (i + 1)) / at.length);
    }
    wanted.forEach(({p}, i) => angle.set(p.id, at[i]));
  };
  // Ring 1 first in kind-and-name order, then each outer ring near its
  // links inward; then one sweep back (the barycentre heuristic of layered
  // drawing, Sugiyama et al. 1981): ring 1 re-ordered by where its outer
  // neighbours ended up, and the outer rings placed again.
  const inward = (k: number) => (p: ArrParty) => meanAngle((neighbours.get(p.id) ?? []).filter(n => hop.get(n) === k - 1));
  placeRing(1, () => null);
  for (let k = 2; k <= rings; k += 1) placeRing(k, inward(k));
  if (rings > 1) {
    placeRing(1, p => meanAngle((neighbours.get(p.id) ?? []).filter(n => hop.get(n) === 2)));
    for (let k = 2; k <= rings; k += 1) placeRing(k, inward(k));
  }
  const positions: Record<string, {x: number; y: number}> = {};
  for (const [id, a] of angle) { const r = radii[hop.get(id) as number]; positions[id] = {x: Math.cos(a) * r, y: Math.sin(a) * r}; }
  positions[focus] = {x: 0, y: 0};
  const reach = (radii[radii.length - 1] ?? 0) + partyBox('').width;
  const guides: Guide[] = radii.slice(1).map((r, i) => ({type: 'ring', cx: 0, cy: 0, r, label: `${i + 1} link${i ? 's' : ''} away`}));
  // Parties no link reaches from the focus: a band under the rings.
  const unreached = parties.filter(p => !hop.has(p.id)).sort(byKindThenName);
  let height = 2 * reach;
  if (unreached.length) {
    const top = reach + 20;
    const placed = rows(unreached, -reach + BAND_LABEL_WIDTH, top + BAND_LABEL_HEIGHT + 8, 2 * reach - 2 * BAND_LABEL_WIDTH);
    Object.assign(positions, placed.positions);
    guides.push({type: 'band', x0: -reach, x1: reach, y0: top, y1: top + BAND_LABEL_HEIGHT + 8 + placed.height + 6, label: `Not linked to ${byId.get(focus)?.label ?? 'it'}`});
    height += BAND_LABEL_HEIGHT + 8 + placed.height + 26;
  }
  return shift({positions, guides, width: 2 * reach, height}, reach, reach);
}

export function arrangeByKind(parties: ArrParty[], links: ArrLink[]): Placed {
  const degree = degrees(parties, links);
  const kinds = PARTY_ORDER.filter(kind => parties.some(p => p.kind === kind));
  const positions: Record<string, {x: number; y: number}> = {};
  const guides: Guide[] = [];
  const height = partyBox('').height;
  let x = 0, bottom = 0;
  for (const kind of kinds) {
    const members = parties.filter(p => p.kind === kind)
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    const width = Math.max(...members.map(p => partyBox(p.label).width)) + 2 * GAP_X + 40;
    members.forEach((p, i) => { positions[p.id] = {x: x + width / 2, y: 44 + MAX_RADIUS + i * (height + 14)}; });
    const columnBottom = 44 + members.length * (height + 14) + 10;
    guides.push({type: 'column', x0: x + 6, x1: x + width - 6, y0: 0, y1: columnBottom, label: PARTY[kind].plural, colour: PARTY[kind].ring});
    bottom = Math.max(bottom, columnBottom);
    x += width + 16;
  }
  for (const g of guides) if (g.type === 'column') g.y1 = bottom;
  return {positions, guides, width: Math.max(0, x - 16), height: bottom};
}

export function arrangeClusters(parties: ArrParty[], links: ArrLink[], aspect = 16 / 9): Placed {
  const graph = networkGraph(parties.map(p => ({id: p.id, label: p.label})), links.map(l => ({id: l.id, from: l.from, to: l.to})));
  // A circle round the whole box, centred on the dot (which sits at the top
  // of the box, the name under it): circles kept apart keep the boxes apart.
  const footprint = new Map(parties.map(p => {
    const box = partyBox(p.label);
    return [p.id, Math.hypot(box.width / 2, Math.max(MAX_RADIUS + 2, box.height - MAX_RADIUS - 2))];
  }));
  const placed = layoutNetwork(graph, {aspect, footprint: id => footprint.get(id) as number});
  const positions = Object.fromEntries(Object.entries(placed).map(([id, p]) => [id, {x: p.x, y: p.y}]));
  let maxX = 0, maxY = 0;
  for (const [id, p] of Object.entries(positions)) { const f = footprint.get(id) as number; maxX = Math.max(maxX, p.x + f); maxY = Math.max(maxY, p.y + f); }
  return {positions, guides: [], width: maxX, height: maxY};
}

function shift(placed: Placed, dx: number, dy: number): Placed {
  const positions = Object.fromEntries(Object.entries(placed.positions).map(([id, p]) => [id, {x: p.x + dx, y: p.y + dy}]));
  const guides = placed.guides.map(g => g.type === 'ring' ? {...g, cx: g.cx + dx, cy: g.cy + dy}
    : g.type === 'band' ? {...g, x0: g.x0 + dx, x1: g.x1 + dx, y0: g.y0 + dy, y1: g.y1 + dy}
      : {...g, x0: g.x0 + dx, x1: g.x1 + dx, y0: g.y0 + dy, y1: g.y1 + dy});
  return {...placed, positions, guides};
}

/** The parties placed by the arrangement asked for. */
export function arrange(arrangement: Arrangement, parties: ArrParty[], links: ArrLink[], options: {focus?: string | null; aspect?: number} = {}): Placed {
  if (!parties.length) return {positions: {}, guides: [], width: 0, height: 0};
  switch (arrangement) {
    case 'control': return arrangeControl(parties, links);
    case 'around': return arrangeAround(parties, links, options.focus && parties.some(p => p.id === options.focus) ? options.focus : mostLinked(parties, links));
    case 'kind': return arrangeByKind(parties, links);
    case 'clusters': return arrangeClusters(parties, links, options.aspect);
  }
}

