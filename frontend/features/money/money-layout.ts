// The money view's picture, worked out apart from React so it can be tested (research §2.8, mockup SEE_2).
// Columns: "Comes from → passes through → goes to". Each party is a bar as tall as the money through it;
// each band is as wide as what it carried. Payments are layered by how many steps they are from a party
// that receives nothing. A payment that closes a round trip is taken out of the layering and drawn as a
// return arc under the columns, so a cycle never stops the picture being drawn. Money a party sent beyond
// what came in is a hatched ghost band from "No recorded source": worked out, never a payment.
// A very large ledger draws its 20 largest flows (payer to payee) and folds the rest into one band,
// "others (n)", from the first column to the last; each party's label keeps its exact totals.

export type Certainty = 'shown' | 'not_yet_shown' | 'disputed';
export type Payment = {
  id: string; from: string; to: string; fromId: string; toId: string; amount: number; date: string | null;
  certainty: Certainty; purpose: string | null; locator: string | null;
};
export type CheckMark = 'grey_hole' | 'miracle' | 'black_hole' | 'round_trip';

export type Node = {
  id: string; name: string; col: number; x: number; y: number; h: number;
  amountIn: number; amountOut: number; ghost: boolean; marks: CheckMark[];
  /** One end of the "others (n)" band: the flows folded away, not a party. */
  others: boolean;
};
export type Band = {
  key: string; fromId: string; toId: string; ids: string[]; amount: number; certainty: Certainty | 'worked_out' | 'others';
  d: string; width: number; midX: number; midY: number; label: string;
  /** The chip on the band (mockup SEE_2): what it carried in words, and where it is shown. */
  chip: {text: string; sub: string | null; x: number; y: number};
};
export type ReturnArc = {id: string; fromId: string; toId: string; amount: number; d: string; labelX: number; labelY: number; label: string};
export type Picture = {
  width: number; height: number; columns: {x: number; title: string}[]; nodes: Node[]; bands: Band[]; returns: ReturnArc[];
  /** How many flows (payer to payee) the payments make, and what was folded into "others (n)", if anything. */
  flows: number; folded: {flows: number; payments: number; amount: number} | null;
  /** A column holds so many parties that their names get one line each and a chip goes only where it fits. */
  crowded: boolean;
};

/** The flows drawn one by one before the rest fold into "others (n)" (MOCKUP_BUILD_LIST §5, SEE_2). */
export const TOP_FLOWS = 20;
const OTHERS_IN = 'others:in';
const OTHERS_OUT = 'others:out';

export const SIGN: Record<string, string> = {EUR: '€', USD: '$', GBP: '£'};

/** Amounts as the mockup writes them: €9,800 · €71,400 · €1,250,000. */
export function amountText(amount: number, currency: string): string {
  const sign = SIGN[currency];
  const n = Math.round(amount).toLocaleString('en-GB');
  return sign ? `${sign}${n}` : `${n} ${currency}`;
}

const W = 1000;
const RIGHT = 280;
const NODE_W = 12;
const TOP = 34;
const GAP = 22;

/** Payments that close a cycle (the latest in each), found by a walk when the checks did not name them. */
export function cycleClosers(payments: Payment[], named: string[] = []): Set<string> {
  const closers = new Set(named);
  const kept = () => payments.filter(p => !closers.has(p.id));
  for (;;) {
    const out = new Map<string, Payment[]>();
    for (const p of kept()) out.set(p.fromId, [...(out.get(p.fromId) ?? []), p]);
    const state = new Map<string, 0 | 1 | 2>();
    let back: Payment[] | null = null;
    const walk = (n: string, path: Payment[]): void => {
      if (back) return;
      state.set(n, 1);
      for (const p of out.get(n) ?? []) {
        const s = state.get(p.toId);
        if (s === 1) { back = [...path.slice(path.findIndex(q => q.fromId === p.toId)), p]; return; }
        if (s === undefined) walk(p.toId, [...path, p]);
        if (back) return;
      }
      state.set(n, 2);
    };
    for (const p of kept()) if (!state.has(p.fromId)) walk(p.fromId, []);
    if (!back) return closers;
    const cycle: Payment[] = back;
    closers.add(cycle.reduce((a, b) => ((b.date ?? '') > (a.date ?? '') ? b : a)).id);
  }
}

const ribbon = (x1: number, y1: number, x2: number, y2: number, w: number): string => {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}L${x2},${y2 + w}C${mx},${y2 + w} ${mx},${y1 + w} ${x1},${y1 + w}Z`;
};

const RANK: Record<Certainty, number> = {shown: 0, not_yet_shown: 1, disputed: 2};

export function layout(payments: Payment[], currency: string, opts: {
  closers?: string[]; marks?: Record<string, CheckMark[]>; ghosts?: Record<string, number>; height?: number;
  /** Draw only this many of the largest flows and fold the rest into "others (n)"; unset draws them all. */
  top?: number;
} = {}): Picture {
  const height = opts.height ?? 340;
  const closers = cycleClosers(payments, opts.closers);
  let flow = payments.filter(p => !closers.has(p.id));
  let returning = payments.filter(p => closers.has(p.id));
  const pair = (p: Payment) => `${p.fromId}>${p.toId}`;
  const pairAmount = new Map<string, number>();
  for (const p of flow) pairAmount.set(pair(p), (pairAmount.get(pair(p)) ?? 0) + p.amount);
  // The largest flows are drawn; the rest (and any return whose parties are no longer drawn) fold into one band.
  const folded: Payment[] = [];
  if (opts.top !== undefined && pairAmount.size > opts.top) {
    const keep = new Set([...pairAmount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, opts.top).map(([k]) => k));
    folded.push(...flow.filter(p => !keep.has(pair(p))));
    flow = flow.filter(p => keep.has(pair(p)));
    const kept = new Set(flow.flatMap(p => [p.fromId, p.toId]));
    folded.push(...returning.filter(p => !kept.has(p.fromId) || !kept.has(p.toId)));
    returning = returning.filter(p => kept.has(p.fromId) && kept.has(p.toId));
  }
  const drawn = folded.length ? [...flow, ...returning] : payments;
  const names = new Map<string, string>();
  for (const p of drawn) { names.set(p.fromId, p.from); names.set(p.toId, p.to); }
  // Labels carry each party's exact totals; bars and bands are sized by the money drawn.
  const amountIn = new Map<string, number>(); const amountOut = new Map<string, number>();
  for (const p of payments) {
    amountOut.set(p.fromId, (amountOut.get(p.fromId) ?? 0) + p.amount);
    amountIn.set(p.toId, (amountIn.get(p.toId) ?? 0) + p.amount);
  }
  const drawnIn = new Map<string, number>(); const drawnOut = new Map<string, number>();
  for (const p of drawn) {
    drawnOut.set(p.fromId, (drawnOut.get(p.fromId) ?? 0) + p.amount);
    drawnIn.set(p.toId, (drawnIn.get(p.toId) ?? 0) + p.amount);
  }
  // Layers: steps from a party that receives nothing (in the payments that are drawn as bands).
  const preds = new Map<string, string[]>();
  for (const p of flow) preds.set(p.toId, [...(preds.get(p.toId) ?? []), p.fromId]);
  const depth = new Map<string, number>();
  const depthOf = (n: string, seen: Set<string> = new Set()): number => {
    if (depth.has(n)) return depth.get(n)!;
    if (seen.has(n)) return 0;
    const d = Math.max(-1, ...(preds.get(n) ?? []).map(m => depthOf(m, new Set([...seen, n])))) + 1;
    depth.set(n, d);
    return d;
  };
  const ids = [...names.keys()];
  ids.forEach(n => depthOf(n));
  let last = Math.max(1, ...depth.values());
  const sends = new Set(flow.map(p => p.fromId));
  // A party that sends nothing on goes to the last column: where the money ends up.
  for (const n of ids) if (!sends.has(n) && (preds.get(n)?.length ?? 0) > 0) depth.set(n, last);
  // Ghosts: "No recorded source" for each party that sent more than came in, one column before it.
  const ghosts = Object.entries(opts.ghosts ?? {}).filter(([id, gap]) => gap > 0 && names.has(id));
  for (const [id] of ghosts) if (depth.get(id) === 0) { for (const n of ids) depth.set(n, depth.get(n)! + 1); last += 1; }
  last = Math.max(1, ...depth.values());
  const ghostId = (id: string) => `ghost:${id}`;
  for (const [id, gap] of ghosts) {
    names.set(ghostId(id), 'No recorded source');
    depth.set(ghostId(id), depth.get(id)! - 1);
    amountOut.set(ghostId(id), gap);
    drawnOut.set(ghostId(id), gap);
  }
  const foldedAmount = folded.reduce((s, p) => s + p.amount, 0);
  const foldedFlows = new Set(folded.map(pair)).size;
  if (folded.length) {
    for (const end of [OTHERS_IN, OTHERS_OUT]) names.set(end, `others (${foldedFlows})`);
    depth.set(OTHERS_IN, 0);
    depth.set(OTHERS_OUT, last);
    amountOut.set(OTHERS_IN, foldedAmount); drawnOut.set(OTHERS_IN, foldedAmount);
    amountIn.set(OTHERS_OUT, foldedAmount); drawnIn.set(OTHERS_OUT, foldedAmount);
  }
  const valueOf = (n: string) => Math.max(
    (drawnIn.get(n) ?? 0) + (ghosts.find(([g]) => g === n)?.[1] ?? 0),
    drawnOut.get(n) ?? 0,
  );
  const cols = last + 1;
  // Labels of the first column sit right of their bars, on the bands (mockup SEE_2), so the picture starts near the edge;
  // the last column keeps a gutter wide enough for a name and its amount (placeLabels fits them in it).
  const xs = Array.from({length: cols}, (_, i) => 56 + i * ((W - 56 - RIGHT) / (cols - 1)));
  const byCol: string[][] = Array.from({length: cols}, () => []);
  for (const n of names.keys()) byCol[depth.get(n)!].push(n);
  // A crowded column (a large ledger) packs its parties closer and makes the picture taller, never thinner than a line.
  const crowd = Math.max(...byCol.map(c => c.length));
  const crowded = crowd > 8;
  const space = crowded ? 10 : GAP;
  // In a crowded column every bar is at least a line of text tall, so the names (one line each) never overlap.
  const minH = crowded ? 8 : 0;
  const usable = crowded ? Math.max(height - TOP - 20, crowd * (minH + space) + 200) : height - TOP - 20;
  const scale = Math.min(...byCol.map(c => c.length ? (usable - space * (c.length - 1) - minH * c.length) / c.reduce((s, n) => s + valueOf(n), 0) : Infinity));
  const nodes = new Map<string, Node>();
  const allBands = [...flow.map(p => ({...p, worked: false, ids: [p.id]})),
    ...ghosts.map(([id, g]) => ({id: ghostId(id), from: 'No recorded source', to: names.get(id)!, fromId: ghostId(id), toId: id, amount: g,
      date: null, certainty: 'shown' as Certainty, purpose: null, locator: null, worked: true, ids: [ghostId(id)]})),
    ...(folded.length ? [{id: 'others', from: names.get(OTHERS_IN)!, to: names.get(OTHERS_OUT)!, fromId: OTHERS_IN, toId: OTHERS_OUT,
      amount: foldedAmount, date: null, certainty: 'shown' as Certainty, purpose: null, locator: null, worked: false, ids: folded.map(p => p.id)}] : [])];
  // Place columns left to right; each party sits near the parties that pay it (fewer crossings).
  for (let c = 0; c < cols; c++) {
    const centre = (n: string) => {
      const ins = allBands.filter(b => b.toId === n && nodes.has(b.fromId));
      if (!ins.length) return -valueOf(n);
      const w = ins.reduce((s, b) => s + b.amount, 0);
      return ins.reduce((s, b) => s + (nodes.get(b.fromId)!.y + nodes.get(b.fromId)!.h / 2) * b.amount, 0) / w;
    };
    // The ghost of missing money sits first in its column, "others (n)" last.
    const rank = (n: string) => n.startsWith('ghost:') ? -1 : n.startsWith('others:') ? 1 : 0;
    const order = byCol[c].sort((a, b) => rank(a) - rank(b) || centre(a) - centre(b));
    const total = order.reduce((s, n) => s + valueOf(n) * scale, 0) + space * Math.max(0, order.length - 1);
    let y = TOP + Math.max(0, (usable - total) / 2);
    for (const n of order) {
      const h = Math.max(4, minH + valueOf(n) * scale);
      nodes.set(n, {id: n, name: names.get(n)!, col: c, x: xs[c], y, h, amountIn: amountIn.get(n) ?? 0, amountOut: amountOut.get(n) ?? 0,
        ghost: n.startsWith('ghost:'), marks: opts.marks?.[n] ?? [], others: n.startsWith('others:')});
      y += h + space;
    }
  }
  // Bands: one per payer, payee and certainty; stacked at each end in the order of the other end.
  const groups = new Map<string, typeof allBands>();
  for (const b of allBands) {
    const key = b.fromId === OTHERS_IN ? 'others' : `${b.fromId}>${b.toId}>${b.worked ? 'worked_out' : b.certainty}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const outOff = new Map<string, number>(); const inOff = new Map<string, number>();
  // Into a party, the worked-out ghost comes in first (top), then the recorded money, so they never cross.
  const entries = [...groups.entries()].sort(([, a], [, b]) =>
    nodes.get(a[0].toId)!.y - nodes.get(b[0].toId)!.y || Number(b[0].worked) - Number(a[0].worked) || RANK[a[0].certainty] - RANK[b[0].certainty]);
  const bands: Band[] = [];
  for (const [key, group] of entries) {
    const from = nodes.get(group[0].fromId)!; const to = nodes.get(group[0].toId)!;
    const amount = group.reduce((s, b) => s + b.amount, 0);
    const width = Math.max(1.5, amount * scale);
    const y1 = from.y + (outOff.get(from.id) ?? 0);
    outOff.set(from.id, (outOff.get(from.id) ?? 0) + width);
    // Into a grey-hole party, the ghost comes in first (top), then the recorded money.
    const y2 = to.y + (inOff.get(to.id) ?? 0);
    inOff.set(to.id, (inOff.get(to.id) ?? 0) + width);
    const x1 = from.x + NODE_W; const x2 = to.x;
    const worked = group[0].worked;
    const others = key === 'others';
    const same = group.length > 1 && group.every(b => b.amount === group[0].amount);
    const purpose = group.find(b => b.purpose)?.purpose;
    const label = worked ? `ƒ ${amountText(amount, currency)} · worked out`
      : others ? `others (${foldedFlows}) · ${amountText(amount, currency)} in ${folded.length} payment${folded.length === 1 ? '' : 's'}`
      : same ? `${group.length} × ${amountText(group[0].amount, currency)}`
      : `${amountText(amount, currency)}${purpose ? ` · ${purpose}` : ''}`;
    const certainty = worked ? 'worked_out' as const : others ? 'others' as const : group[0].certainty;
    const mark = certainty === 'shown' ? '✓' : certainty === 'disputed' ? '✕' : certainty === 'worked_out' ? 'ƒ' : '○';
    // "others (n)" is named on its own bar, so it needs no chip.
    const chipText = worked || others ? ''
      : same ? `${mark} ${group.length} × ${amountText(group[0].amount, currency)}`
      : certainty === 'shown' && purpose ? `${mark} ${purpose}`
      : `${mark} ${amountText(amount, currency)}${purpose ? ` “${purpose}”` : ''}`;
    const locator = certainty === 'shown' ? group.find(b => b.locator)?.locator ?? null : null;
    // The label sits on the band: halfway for a band to the next column, near its start for one that
    // skips a column (so it is never under a party's bar). y follows the band's own curve.
    const at = to.col - from.col > 1 ? 0.16 : 0.5;
    const ease = 3 * at * at - 2 * at * at * at;
    // The chip sits near the start of a wide band (top-left, as the mockup draws "✓ land price"), and just under
    // a thin one, where it cannot fit inside.
    const thin = width <= 40;
    const cx = x1 + (x2 - x1) * (thin ? (to.col - from.col > 1 ? 0.1 : 0.2) : to.col - from.col > 1 ? 0.12 : 0.22);
    const ce = (() => { const a = (cx - x1) / (x2 - x1); return 3 * a * a - 2 * a * a * a; })();
    const cy = y1 + (y2 - y1) * ce + (thin ? -14 : 22);
    bands.push({key, fromId: from.id, toId: to.id, ids: group.flatMap(b => b.ids), amount, width,
      certainty, d: ribbon(x1, y1, x2, y2, width),
      midX: x1 + (x2 - x1) * at, midY: y1 + (y2 - y1) * ease + width / 2, label,
      chip: {text: chipText, sub: locator, x: cx, y: cy}});
  }
  const floor = Math.max(...[...nodes.values()].map(n => n.y + n.h));
  const returns: ReturnArc[] = returning.map((p, i) => {
    const a = nodes.get(p.fromId)!; const b = nodes.get(p.toId)!;
    const dip = floor + 26 + i * 18;
    const x1 = a.x + NODE_W / 2; const x2 = b.x + NODE_W / 2;
    return {id: p.id, fromId: p.fromId, toId: p.toId, amount: p.amount,
      d: `M${x1},${a.y + a.h}C${x1},${dip} ${x2},${dip} ${x2},${b.y + b.h}`, labelX: (x1 + x2) / 2, labelY: dip + 4,
      label: `returns to ${p.to} · ${amountText(p.amount, currency)}`};
  });
  const columns = xs.map((x, i) => ({x, title: i === 0 ? 'Comes from' : i === cols - 1 ? 'Goes to' : 'Passes through'}));
  return {width: W, height: returns.length ? floor + 40 + returns.length * 18 : Math.max(height, usable + TOP + 20), columns,
    nodes: [...nodes.values()], bands, returns,
    flows: pairAmount.size, folded: folded.length ? {flows: foldedFlows, payments: folded.length, amount: foldedAmount} : null, crowded};
}

/** The parties and bands upstream and downstream of a band: what lights with it. */
export function pathOf(picture: Picture, key: string): Set<string> {
  const band = picture.bands.find(b => b.key === key);
  if (!band) return new Set();
  const lit = new Set([key]);
  const up = (n: string) => picture.bands.filter(b => b.toId === n && !lit.has(b.key)).forEach(b => { lit.add(b.key); up(b.fromId); });
  const down = (n: string) => picture.bands.filter(b => b.fromId === n && !lit.has(b.key)).forEach(b => { lit.add(b.key); down(b.toId); });
  up(band.fromId);
  down(band.toId);
  return lit;
}

/** Amounts in a party's label: exact below `from` (€1,250,000), shortened from it (€646m, $1.59bn); the exact sum is
 *  revealed on the label. */
export function shortAmount(amount: number, currency: string, from = 1e7): string {
  const a = Math.abs(amount);
  if (a < from) return amountText(amount, currency);
  const [n, unit] = a >= 1e9 ? [amount / 1e9, 'bn'] : [amount / 1e6, 'm'];
  const num = `${Number(n.toPrecision(3))}${unit}`;
  const sign = SIGN[currency];
  return sign ? `${sign}${num}` : `${num} ${currency}`;
}

// Text widths in the picture's own units (1000 wide, drawn at about 1:1): names 600 12.5px, sums 11px mono.
const NAME_CH = 6.7;
const SUM_CH = 6.6;
const LINE = 14;
const PAD = 4;
/** Room for each check mark drawn at the right edge on an end's label. */
const MARK_W = 26;

/** A name wrapped into at most `max` lines of `width`, the last cut with an ellipsis if it still does not fit. */
export function wrapName(name: string, width: number, max = 2): {lines: string[]; cut: boolean} {
  const per = Math.max(4, Math.floor(width / NAME_CH));
  const all: string[] = [];
  let cur = '';
  for (let word of name.split(/\s+/).filter(Boolean)) {
    if (cur && `${cur} ${word}`.length <= per) { cur = `${cur} ${word}`; continue; }
    if (cur) all.push(cur);
    while (word.length > per) { all.push(word.slice(0, per)); word = word.slice(per); }
    cur = word;
  }
  if (cur) all.push(cur);
  if (all.length <= max) return {lines: all, cut: false};
  // The last line keeps as much of the rest of the name as fits, cut mid-word if need be, then "…".
  const lines = all.slice(0, max);
  lines[max - 1] = `${all.slice(max - 1).join(' ').slice(0, per - 1).replace(/[\s,.(-]+$/, '')}…`;
  return {lines, cut: true};
}

export type LabelLine = {text: string; kind: 'name' | 'sum'; tail?: string};
/** A party's label, placed so no two overlap: right of its bar inside its column's lane, moved up or down (with a
 *  leader back to the bar) when a neighbour's label is in the way. */
export type Label = {
  nodeId: string; x: number; top: number; w: number; h: number; lines: LabelLine[];
  /** The label had to move from its bar: the leader's elbow path back to it. */
  leader: string | null;
  /** The name was shortened or wrapped short: the full name is revealed on the label. */
  cut: boolean;
};

const lineW = (l: LabelLine) => l.text.length * (l.kind === 'name' ? NAME_CH : SUM_CH) + (l.tail ? 8 + l.tail.length * SUM_CH : 0);

export function placeLabels(picture: Picture, payments: Payment[], currency: string): {labels: Label[]; height: number} {
  const cols = picture.columns.length;
  const last = cols - 1;
  const count = (id: string) => payments.filter(p => p.fromId === id).length;
  const floor = Math.max(...picture.nodes.map(n => n.y + n.h));
  const limit = picture.returns.length ? floor + 8 : picture.height - 2;
  const minTop = TOP - 8;
  // Each column's labels keep to its lane: up to the next column's bars, or in the last, up to its marks at the edge.
  const laneEnd = (c: number, n: Node) => c < last ? picture.columns[c + 1].x - 10 : W - 6 - MARK_W * n.marks.length;
  const fit = (options: string[], lane: number) => options.find(o => o.length * SUM_CH <= lane) ?? options[options.length - 1];
  // One picture writes its amounts one way: a picture with sums of eight digits or more shortens every sum from a million.
  const big = picture.nodes.some(n => Math.max(n.amountIn, n.amountOut) >= 1e7);
  const amt = (a: number) => shortAmount(a, currency, big ? 1e6 : Infinity);
  // What a label says, from the fullest (level 0: the name on two lines, every sum) to the most compact (level 2: the
  // name on one line and only what fits beside it); the rest is revealed on the label.
  const content = (n: Node, c: number, lane: number, level: number): {lines: LabelLine[]; cut: boolean} => {
    const nameLines = level === 0 ? 2 : 1;
    const named = (sums: string[]) => {
      const w = wrapName(n.name, lane, nameLines);
      return {lines: [...w.lines.map(t => ({text: t, kind: 'name' as const})), ...sums.map(t => ({text: t, kind: 'sum' as const}))], cut: w.cut};
    };
    const beside = (tail: string) => {
      const w = wrapName(n.name, lane - 8 - tail.length * SUM_CH, 1);
      return {lines: [{text: w.lines[0] ?? '', kind: 'name' as const, tail}], cut: w.cut};
    };
    if (n.ghost) return level < 2 ? named([fit([`ƒ ${amt(n.amountOut)} · worked out`, `ƒ ${amt(n.amountOut)}`], lane)]) : beside(`ƒ ${amt(n.amountOut)}`);
    if (c === 0) {
      const k = n.others ? picture.folded?.payments ?? 0 : count(n.id);
      const sum = `${amt(n.amountOut)} · ${k} payment${k === 1 ? '' : 's'}`;
      const one: LabelLine = {text: n.name, kind: 'name', tail: sum};
      if (lineW(one) <= lane) return {lines: [one], cut: false};
      return level < 2 ? named([fit([sum, amt(n.amountOut)], lane)]) : beside(amt(n.amountOut));
    }
    if (c === last) {
      if (picture.crowded || level === 2) return beside(`${amt(n.amountIn)} in`);
      const purposes = [...new Set(picture.bands.filter(b => b.toId === n.id && b.certainty !== 'worked_out')
        .map(b => payments.find(p => b.ids.includes(p.id))?.purpose).filter(Boolean))];
      const sum = n.marks.includes('black_hole') ? `${amt(n.amountIn)} in · ${amountText(0, currency)} out`
        : `${amt(n.amountIn)}${purposes.length === 1 ? ` · ${purposes[0]}` : ''}`;
      return named([fit([sum, amt(n.amountIn)], lane)]);
    }
    // Passes through: what came in and what went out; a side with nothing is left to the party's mark.
    const parts = [n.amountIn > 0 ? `in ${amt(n.amountIn)}` : '', n.amountOut > 0 ? `out ${amt(n.amountOut)}` : ''].filter(Boolean);
    const joined = parts.join(' · ');
    const arrow = n.amountIn > 0 && n.amountOut > 0 ? `${amt(n.amountIn)} → ${amt(n.amountOut)}` : joined;
    if (level === 2) return beside(fit([arrow, amt(Math.max(n.amountIn, n.amountOut))], lane / 2));
    return named(level === 0 && joined.length * SUM_CH > lane ? parts : [fit([joined, arrow], lane)]);
  };
  const labels: Label[] = [];
  let bottom = 0;
  for (let c = 0; c < cols; c++) {
    const col = picture.nodes.filter(n => n.col === c && !(n.others && c === last && c !== 0));
    if (!col.length) continue;
    // The fullest level whose labels all fit the column's height.
    let want: Array<{label: Label; desired: number; node: Node}> = [];
    for (let level = 0; level <= 2; level++) {
      want = col.map(n => {
        const x = n.x + NODE_W + 6;
        const lane = laneEnd(c, n) - x;
        const {lines, cut} = content(n, c, lane, level);
        const h = lines.length * LINE;
        const w = Math.min(lane, Math.max(...lines.map(lineW)));
        const desired = n.ghost ? n.y + 8 : n.y + Math.min(n.h / 2, 14) - 9;
        return {node: n, desired, label: {nodeId: n.id, x, top: desired, w, h, lines, leader: null, cut}};
      });
      if (want.reduce((s, it) => s + it.label.h + PAD, -PAD) <= limit - minTop) break;
    }
    // Down from the top so none overlaps the one above, then up from the foot so none runs off it; a column that
    // still cannot fit runs on below, and the picture grows to hold it.
    want.sort((a, b) => a.desired - b.desired);
    let edge = minTop;
    for (const it of want) { it.label.top = Math.max(it.desired, edge); edge = it.label.top + it.label.h + PAD; }
    if (edge - PAD > limit && want.reduce((s, it) => s + it.label.h + PAD, -PAD) <= limit - minTop) {
      edge = limit;
      for (let i = want.length - 1; i >= 0; i--) {
        const l = want[i].label;
        if (l.top + l.h > edge) l.top = edge - l.h;
        edge = l.top - PAD;
      }
    }
    for (const {node: n, desired, label: l} of want) {
      if (Math.abs(l.top - desired) > 6) {
        // Moved: indent it and draw an elbow from the nearest point of its bar to its first line.
        const ly = l.top + 7;
        const by = Math.min(n.y + n.h, Math.max(n.y, ly));
        const bx = n.x + NODE_W;
        l.x += 8;
        l.w = Math.min(l.w, laneEnd(c, n) - l.x);
        l.leader = `M${bx},${by}H${bx + 4}L${l.x - 3},${ly}`;
      }
      bottom = Math.max(bottom, l.top + l.h);
      labels.push(l);
    }
  }
  return {labels, height: Math.max(picture.height, bottom + 6)};
}
