// The money view's picture, worked out apart from React so it can be tested (research §2.8, mockup SEE_2).
// Columns: "Comes from → passes through → goes to". Each party is a bar as tall as the money through it;
// each band is as wide as what it carried. Payments are layered by how many steps they are from a party
// that receives nothing. A payment that closes a round trip is taken out of the layering and drawn as a
// return arc under the columns, so a cycle never stops the picture being drawn. Money a party sent beyond
// what came in is a hatched ghost band from "No recorded source": worked out, never a payment.

export type Certainty = 'shown' | 'not_yet_shown' | 'disputed';
export type Payment = {
  id: string; from: string; to: string; fromId: string; toId: string; amount: number; date: string | null;
  certainty: Certainty; purpose: string | null; locator: string | null;
};
export type CheckMark = 'grey_hole' | 'miracle' | 'black_hole' | 'round_trip';

export type Node = {
  id: string; name: string; col: number; x: number; y: number; h: number;
  amountIn: number; amountOut: number; ghost: boolean; marks: CheckMark[];
};
export type Band = {
  key: string; fromId: string; toId: string; ids: string[]; amount: number; certainty: Certainty | 'worked_out';
  d: string; width: number; midX: number; midY: number; label: string;
  /** The chip on the band (mockup SEE_2): what it carried in words, and where it is shown. */
  chip: {text: string; sub: string | null; x: number; y: number};
};
export type ReturnArc = {id: string; fromId: string; toId: string; amount: number; d: string; labelX: number; labelY: number; label: string};
export type Picture = {width: number; height: number; columns: {x: number; title: string}[]; nodes: Node[]; bands: Band[]; returns: ReturnArc[]};

export const SIGN: Record<string, string> = {EUR: '€', USD: '$', GBP: '£'};

/** Amounts as the mockup writes them: €9,800 · €71,400 · €1,250,000. */
export function amountText(amount: number, currency: string): string {
  const sign = SIGN[currency];
  const n = Math.round(amount).toLocaleString('en-GB');
  return sign ? `${sign}${n}` : `${n} ${currency}`;
}

const W = 1000;
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
} = {}): Picture {
  const height = opts.height ?? 340;
  const closers = cycleClosers(payments, opts.closers);
  const flow = payments.filter(p => !closers.has(p.id));
  const names = new Map<string, string>();
  for (const p of payments) { names.set(p.fromId, p.from); names.set(p.toId, p.to); }
  const amountIn = new Map<string, number>(); const amountOut = new Map<string, number>();
  for (const p of payments) {
    amountOut.set(p.fromId, (amountOut.get(p.fromId) ?? 0) + p.amount);
    amountIn.set(p.toId, (amountIn.get(p.toId) ?? 0) + p.amount);
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
  }
  const valueOf = (n: string) => Math.max(
    (amountIn.get(n) ?? 0) + (ghosts.find(([g]) => g === n)?.[1] ?? 0),
    amountOut.get(n) ?? 0,
  );
  const cols = last + 1;
  // Labels of the first column sit right of their bars, on the bands (mockup SEE_2), so the picture starts near the edge.
  const xs = Array.from({length: cols}, (_, i) => 56 + i * ((W - 56 - 230) / (cols - 1)));
  const byCol: string[][] = Array.from({length: cols}, () => []);
  for (const n of names.keys()) byCol[depth.get(n)!].push(n);
  const usable = height - TOP - 20;
  const scale = Math.min(...byCol.map(c => c.length ? (usable - GAP * (c.length - 1)) / c.reduce((s, n) => s + valueOf(n), 0) : Infinity));
  const nodes = new Map<string, Node>();
  const allBands = [...flow.map(p => ({...p, worked: false})),
    ...ghosts.map(([id, gap]) => ({id: ghostId(id), from: 'No recorded source', to: names.get(id)!, fromId: ghostId(id), toId: id, amount: gap,
      date: null, certainty: 'shown' as Certainty, purpose: null, locator: null, worked: true}))];
  // Place columns left to right; each party sits near the parties that pay it (fewer crossings).
  for (let c = 0; c < cols; c++) {
    const centre = (n: string) => {
      const ins = allBands.filter(b => b.toId === n && nodes.has(b.fromId));
      if (!ins.length) return -valueOf(n);
      const w = ins.reduce((s, b) => s + b.amount, 0);
      return ins.reduce((s, b) => s + (nodes.get(b.fromId)!.y + nodes.get(b.fromId)!.h / 2) * b.amount, 0) / w;
    };
    const order = byCol[c].sort((a, b) => (a.startsWith('ghost:') ? -1 : 0) - (b.startsWith('ghost:') ? -1 : 0) || centre(a) - centre(b));
    const total = order.reduce((s, n) => s + valueOf(n) * scale, 0) + GAP * Math.max(0, order.length - 1);
    let y = TOP + Math.max(0, (usable - total) / 2);
    for (const n of order) {
      const h = Math.max(4, valueOf(n) * scale);
      nodes.set(n, {id: n, name: names.get(n)!, col: c, x: xs[c], y, h, amountIn: amountIn.get(n) ?? 0, amountOut: amountOut.get(n) ?? 0,
        ghost: n.startsWith('ghost:'), marks: opts.marks?.[n] ?? []});
      y += h + GAP;
    }
  }
  // Bands: one per payer, payee and certainty; stacked at each end in the order of the other end.
  const groups = new Map<string, typeof allBands>();
  for (const b of allBands) {
    const key = `${b.fromId}>${b.toId}>${b.worked ? 'worked_out' : b.certainty}`;
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
    const same = group.length > 1 && group.every(b => b.amount === group[0].amount);
    const purpose = group.find(b => b.purpose)?.purpose;
    const label = worked ? `ƒ ${amountText(amount, currency)} · worked out`
      : same ? `${group.length} × ${amountText(group[0].amount, currency)}`
      : `${amountText(amount, currency)}${purpose ? ` · ${purpose}` : ''}`;
    const certainty = worked ? 'worked_out' as const : group[0].certainty;
    const mark = certainty === 'shown' ? '✓' : certainty === 'disputed' ? '✕' : certainty === 'worked_out' ? 'ƒ' : '○';
    const chipText = worked ? ''
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
    bands.push({key, fromId: from.id, toId: to.id, ids: group.map(b => b.id), amount, width,
      certainty, d: ribbon(x1, y1, x2, y2, width),
      midX: x1 + (x2 - x1) * at, midY: y1 + (y2 - y1) * ease + width / 2, label,
      chip: {text: chipText, sub: locator, x: cx, y: cy}});
  }
  const floor = Math.max(...[...nodes.values()].map(n => n.y + n.h));
  const returns: ReturnArc[] = payments.filter(p => closers.has(p.id)).map((p, i) => {
    const a = nodes.get(p.fromId)!; const b = nodes.get(p.toId)!;
    const dip = floor + 26 + i * 18;
    const x1 = a.x + NODE_W / 2; const x2 = b.x + NODE_W / 2;
    return {id: p.id, fromId: p.fromId, toId: p.toId, amount: p.amount,
      d: `M${x1},${a.y + a.h}C${x1},${dip} ${x2},${dip} ${x2},${b.y + b.h}`, labelX: (x1 + x2) / 2, labelY: dip + 4,
      label: `returns to ${p.to} · ${amountText(p.amount, currency)}`};
  });
  const columns = xs.map((x, i) => ({x, title: i === 0 ? 'Comes from' : i === cols - 1 ? 'Goes to' : 'Passes through'}));
  return {width: W, height: returns.length ? floor + 40 + returns.length * 18 : height, columns, nodes: [...nodes.values()], bands, returns};
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
