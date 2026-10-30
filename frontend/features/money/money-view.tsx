'use client';
// See › Money (mockup SEE_2, research §2.8): "Where did the money go, and where does it appear or vanish?"
// Loads with the view. One currency at a time (tabs), never summed across currencies. Columns (comes from →
// passes through → goes to, drawn here in SVG so missing money can be a hatched ghost and a round trip a
// return arc), Flow (the Sankey) or Ledger (the table). The integrity checks on the right are leads, never
// findings, each with what could be innocent. The ledger strip at the bottom puts the payments on a time
// axis with the €10,000 line and brackets from Red Flags (the chart never makes its own verdict).
// Keys: J / K move the lit row (and its band), L shows the ledger, Esc clears the traced set. Pointing at a band
// (mouse or Tab) lights every ledger row it carries, in the table and on the strip. A very large ledger draws its
// 20 largest flows and folds the rest into "others (n)", which opens out on a click.
// A payment's kind is its mark beside its parties, named on reveal. An amount owed (an agreed price, a fine, an order;
// the ledger's `owed`) is not money that moved: it is listed under "Owed, not paid", never drawn, added or checked.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {OWED_LINE, PaymentKindMark} from '../../components/network/marks';
import {LevelChip, StatusChip, type ClaimStatus} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {onScreen, typingInto} from '../../lib/on-screen';
import {
  createLeadEndpointMutation, getChecksQueryKey, getInvestigationFinancialFlowsOptions, getInvestigationMoneyChecksOptions,
  getInvestigationMoneyChecksQueryKey, keepMoneyCheckMutation, listLeadsQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {CurrencyMoneyChecksOut, FinancialTransactionOut, MoneyCheckOut, RedFlagOut, RoundTripOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {apiTime} from '../../lib/timestamps';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';
import {amountText, layout, pathOf, placeLabels, shortAmount, TOP_FLOWS, type Certainty, type CheckMark, type Payment} from './money-layout';

const FinancialFlowSankey = dynamic(() => import('../../components/charts/financial-flow-sankey').then(m => m.FinancialFlowSankey),
  {ssr: false, loading: () => <p className="mn-muted">Drawing the flow…</p>});

type Layout = 'columns' | 'flow' | 'ledger';
const CERTAINTY: Record<Certainty, {mark: string; word: string; status: ClaimStatus}> = {
  shown: {mark: '✓', word: 'Shown', status: 'supported'}, not_yet_shown: {mark: '○', word: 'Not yet shown', status: 'unshown'},
  disputed: {mark: '✕', word: 'Disputed', status: 'disputed'},
};
const KIND: Record<CheckMark, {icon: string; word: string; line: string}> = {
  grey_hole: {icon: '◐', word: 'Grey hole', line: 'more out than in'},
  miracle: {icon: '✱', word: 'Miracle', line: 'out with nothing in'},
  black_hole: {icon: '●', word: 'Black hole', line: 'in with nothing out'},
  round_trip: {icon: '↺', word: 'Round trip', line: 'money back to where it started'},
};
/** The reporting lines the structuring rule (Red Flags ML-021, catalogue/detection/ml.yaml) draws for each currency. */
export const REPORTING_LINE: Record<string, number> = {EUR: 10000, USD: 10000};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d: string | null) => {
  if (!d) return '—';
  const [y, m, dd] = d.split('-');
  return dd ? `${dd} ${MONTHS[+m - 1]} ${y}` : m ? `${MONTHS[+m - 1]} ${y}` : y;
};
const ran = (iso: string) => {
  const d = apiTime(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const toPayment = (t: FinancialTransactionOut): Payment => ({
  id: t.id, from: t.from, to: t.to, fromId: t.from_entity_id, toId: t.to_entity_id, amount: t.amount, date: t.dateTime ?? null,
  certainty: t.certainty, purpose: t.statedPurpose ?? null, locator: t.locator ?? null,
});

export function MoneyView({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const path = {investigation_id: investigationId};
  const enabled = Boolean(investigationId);
  const asOf = useWorkbenchStore(s => s.asOf);
  const setAsOf = useWorkbenchStore(s => s.setAsOf);
  const ledgerQ = useQuery({...getInvestigationFinancialFlowsOptions({path}), enabled});
  const checksQ = useQuery({...getInvestigationMoneyChecksOptions({path, query: asOf === null ? {} : {as_of: asOf}}), enabled});
  const flagsQ = useRedFlagsQuery(investigationId, enabled).query;
  const [chosen, setChosen] = useState<string | null>(null);
  const [view, setView] = useState<Layout>('columns');
  const [traced, setTraced] = useState<string[]>([]);
  const [lit, setLit] = useState<string | null>(null);
  const [row, setRow] = useState(0);
  const [pointed, setPointed] = useState<string | null>(null); // the band under the pointer or the keyboard focus
  const [allFlows, setAllFlows] = useState(false); // "others (n)" opened out

  const all = useMemo(() => (ledgerQ.data?.transactions ?? [])
    .filter(t => asOf === null || !t.dateTime || Number(t.dateTime.slice(0, 4)) <= asOf), [ledgerQ.data, asOf]);
  const owed = useMemo(() => (ledgerQ.data?.owed ?? [])
    .filter(t => asOf === null || !t.dateTime || Number(t.dateTime.slice(0, 4)) <= asOf), [ledgerQ.data, asOf]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const t of all) c.set(t.currency, (c.get(t.currency) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);
  const currency = chosen && counts.some(([c]) => c === chosen) ? chosen : counts[0]?.[0] ?? null;
  const txs = useMemo(() => all.filter(t => t.currency === currency), [all, currency]);
  const allPayments = useMemo(() => txs.map(toPayment), [txs]);
  // Scroll over the flow to replay it in date order: the picture is drawn up to one payment date at a time.
  const dates = useMemo(() => [...new Set(allPayments.map(p => p.date).filter((d): d is string => Boolean(d)))].sort(), [allPayments]);
  const [upTo, setUpTo] = useState<number | null>(null);
  const cutoff = upTo === null ? null : dates[upTo] ?? null;
  const payments = useMemo(() => cutoff === null ? allPayments : allPayments.filter(p => !p.date || p.date <= cutoff), [allPayments, cutoff]);
  const figureRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = figureRef.current;
    if (!el || !dates.length) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      setUpTo(now => {
        const at = now === null ? dates.length - 1 : now;
        const next = Math.max(0, Math.min(dates.length - 1, at + (e.deltaY > 0 ? 1 : -1)));
        return next === dates.length - 1 ? null : next;
      });
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  });
  const drawnTo = cutoff ?? dates[dates.length - 1] ?? null;
  const checks: CurrencyMoneyChecksOut | undefined = checksQ.data?.currencies.find(c => c.currency === currency);
  const picture = useMemo(() => {
    if (!currency || !payments.length) return null;
    const marks: Record<string, CheckMark[]> = {};
    const ghosts: Record<string, number> = {};
    for (const c of cutoff === null ? checks?.checks ?? [] : []) {
      marks[c.party_id] = [...(marks[c.party_id] ?? []), c.kind];
      if (c.kind === 'grey_hole') ghosts[c.party_id] = c.gap;
    }
    for (const t of cutoff === null ? checks?.round_trips ?? [] : []) marks[t.party_id] = [...(marks[t.party_id] ?? []), 'round_trip'];
    return layout(payments, currency, {closers: (checks?.round_trips ?? []).map(t => t.returning_payment_id), marks, ghosts,
      top: allFlows ? undefined : TOP_FLOWS});
  }, [payments, currency, checks, cutoff, allFlows]);
  const tracedSet = new Set(traced);
  const tracedTotal = payments.filter(p => tracedSet.has(p.id));
  const litPayment = lit ? payments.find(p => p.id === lit) : undefined;
  const pointedBand = pointed ? picture?.bands.find(b => b.key === pointed) : undefined;
  const litBand = pointedBand ?? picture?.bands.find(b => litPayment && b.ids.includes(litPayment.id));
  // The ledger rows that light: every payment of the band pointed at, else the row J / K (or the pointer) is on.
  const litRows = useMemo(() => new Set(pointedBand ? pointedBand.ids : lit ? [lit] : []), [pointedBand, lit]);
  const lightPath = litBand && picture ? pathOf(picture, litBand.key) : null;
  const others = counts.filter(([c]) => c !== currency);
  const flagsOn = (flagsQ.data?.flags ?? []).filter(f => f.status === 'open' && f.links.some(id => allPayments.some(p => p.id === id)));
  const structuring = flagsOn.filter(f => f.indicator_id === 'ML-021');
  const flaggedIds = new Set(structuring.flatMap(f => f.links));

  // Keys: J / K walk the ledger rows (date order), L shows the ledger, Esc clears what is traced.
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!onScreen(rootRef.current) || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingInto(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'k') {
        if (!txs.length) return;
        e.preventDefault();
        const next = Math.max(0, Math.min(txs.length - 1, row + (k === 'j' ? 1 : -1)));
        setRow(next);
        setLit(txs[next].id);
      } else if (k === 'l') { e.preventDefault(); setView('ledger'); }
      else if (e.key === 'Escape' && traced.length) { setTraced([]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, txs, row, traced.length]);

  // Marks drawn in the picture that are revealed on hover, focus or click: an HTML layer over the SVG, placed in the
  // picture's own units (Ony, 29 Oct; an SVG <title> reaches neither keyboard nor touch).
  const placed = picture ? placeLabels(picture, payments, currency ?? '') : null;
  const labels = placed?.labels ?? [];
  // The labels may need more height than the bars (a crowded column runs on below): the picture grows to hold them.
  const tall = placed?.height ?? 0;
  const labelOf = new Map(labels.map(l => [l.nodeId, l]));
  const hot: Array<{key: string; x: number; y: number; w: number; h: number; label: string; detail: ReactNode}> = [];
  const toggle = (ids: string[]) => setTraced(now => ids.every(id => now.includes(id)) ? now.filter(id => !ids.includes(id)) : [...new Set([...now, ...ids])]);
  const status = ledgerQ.isError ? errorMessage(ledgerQ.error, 'Could not read the ledger') : ledgerQ.isPending ? 'Reading the ledger…' : '';

  return <section className="mn" aria-label="Where the money went" ref={rootRef}>
    <header className="mn-head">
      <div className="mn-titles">
        <h2>Where did the money go, and where does it appear or vanish?</h2>
        {/* "EUR only" stays: it keeps a total from being misread; the sentence is revealed on it. */}
        {currency && <p><Reveal detail={others.length
          ? `${currencyName(currency)} payments only. The ${others.map(([c, n]) => `${n} ${currencyName(c).toLowerCase()} payment${n === 1 ? '' : 's'}`).join(' and ')} ${others.reduce((s, [, n]) => s + n, 0) === 1 ? 'is' : 'are'} kept apart and never added to these.`
          : `${currencyName(currency)} payments: the only currency in this case's ledger.`}><span className="mn-only">{currency} only</span></Reveal>
          {asOf !== null && <span className="mn-chip">As of end of {asOf} <button type="button" aria-label={`Clear: as of end of ${asOf}`} onClick={() => setAsOf(null)}>✕</button></span>}</p>}
      </div>
      <div className="mn-controls">
        {counts.length > 0 && <div className="mn-tabs" role="tablist" aria-label="Currency">
          {counts.map(([c, n]) => <button key={c} type="button" role="tab" aria-selected={c === currency} className={c === currency ? 'on' : ''}
            onClick={() => { setChosen(c); setTraced([]); setLit(null); setRow(0); setUpTo(null); setPointed(null); setAllFlows(false); }}>{c} · {n}</button>)}
        </div>}
        <div className="mn-seg" role="radiogroup" aria-label="Layout">
          {(['columns', 'flow', 'ledger'] as const).map(v => <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''}
            onClick={() => setView(v)}>{v === 'columns' ? 'Columns' : v === 'flow' ? 'Flow' : 'Ledger'}</button>)}
        </div>
        <div className="mn-traced" aria-live="polite">
          <span>Traced so far</span>
          <Reveal detail={`${tracedTotal.length} payment${tracedTotal.length === 1 ? '' : 's'}`}>
            <b>{currency ? amountText(tracedTotal.reduce((s, p) => s + p.amount, 0), currency) : '—'}</b></Reveal>
          <button type="button" onClick={() => setTraced([])} disabled={!traced.length}>Clear</button>
        </div>
      </div>
    </header>

    {status && <p className="mn-muted">{status}</p>}
    {!status && !payments.length && <div className="mn-empty">
      <b>No payment has an amount yet.</b>
      <span>Add one from a bank statement: a payment with a payer, a payee, an amount and its currency.</span>
      {(ledgerQ.data?.incomplete.length ?? 0) > 0 && <span>{ledgerQ.data!.incomplete.length} payment{ledgerQ.data!.incomplete.length === 1 ? ' is' : 's are'} missing something, listed under Not charted below.</span>}
      {owed.length > 0 && <span>{owed.length} amount{owed.length === 1 ? ' is' : 's are'} owed, not paid, listed below.</span>}
    </div>}

    {currency && payments.length > 0 && <div className="mn-body">
      <div className="mn-main">
        {view === 'columns' && picture && <figure className="mn-figure" ref={figureRef}>
          <div className="mn-svg-wrap">
          <svg viewBox={`0 0 ${picture.width} ${tall}`} role="img" aria-label={`Money in ${currency}, from where it comes to where it goes`}>
            <defs>
              <pattern id="mn-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" className="mn-hatch-bg"/><line x1="0" y1="0" x2="0" y2="7" className="mn-hatch-line"/>
              </pattern>
            </defs>
            {picture.columns.map(c => <text key={c.x} x={c.x + 6} y={14} className="mn-col" textAnchor="middle">{c.title.toUpperCase()}</text>)}
            {picture.bands.map(b => {
              const on = lightPath ? lightPath.has(b.key) : null;
              const isTraced = b.ids.every(id => tracedSet.has(id));
              const act = () => b.certainty === 'others' ? setAllFlows(true) : b.certainty !== 'worked_out' && toggle(b.ids);
              return <path key={b.key} d={b.d} className={`mn-band mn-${b.certainty}${isTraced ? ' traced' : ''}${on === false ? ' dim' : ''}${on ? ' lit' : ''}`}
                fill={b.certainty === 'worked_out' ? 'url(#mn-hatch)' : undefined}
                tabIndex={0} role="button" aria-label={bandWords(b, picture)} aria-pressed={b.certainty === 'worked_out' || b.certainty === 'others' ? undefined : isTraced}
                onMouseEnter={() => setPointed(b.key)} onMouseLeave={() => setPointed(null)}
                onFocus={() => setPointed(b.key)} onBlur={() => setPointed(null)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } }}
                onClick={act}>
                <title>{bandWords(b, picture)}</title>
              </path>;
            })}
            {picture.returns.map(r => <g key={r.id} className="mn-return">
              <path d={r.d}/><text x={r.labelX} y={r.labelY + 12} textAnchor="middle">↺ {r.label}</text>
            </g>)}
            {labels.map(l => l.leader && <path key={`lead${l.nodeId}`} d={l.leader} className="mn-leader"/>)}
            {chips(picture.bands, labels.map(l => ({x: l.x - 2, y: l.top - 2, w: l.w + 4, h: l.h + 4})), picture.nodes.map(n => ({x: n.x - 2, y: n.y, w: 16, h: n.h})), tall).map(c => <g key={`c${c.key}`} className={`mn-chip-band mn-chip-${c.certainty}`} transform={`translate(${c.x} ${c.y})`}>
              <rect x={0} y={-13} width={c.w} height={c.sub ? 34 : 19} rx={5}/>
              <text x={8} y={0}>{c.text}</text>{c.sub && <text x={8} y={15} className="sub">{c.sub}</text>}</g>)}
            {picture.nodes.map(n => {
              const last = n.col === picture.columns.length - 1;
              const first = n.col === 0;
              // Each name sits right of its bar, in its column's lane, placed by placeLabels so none overlaps another
              // (mockup SEE_2). Marks: left of a source, at the right edge on an end's label, above a middle bar.
              const l = labelOf.get(n.id);
              const owner = n.ghost ? picture.nodes.find(x => `ghost:${x.id}` === n.id) : undefined;
              const markAt = (i: number) => first ? {x: n.x - 14 - i * 20, y: n.y + Math.min(n.h / 2, 10)}
                : last && l ? {x: picture.width - 12 - i * 20, y: l.top + 7} : {x: n.x + 6 - i * 20, y: n.y - 14}; // a middle bar's marks run left, away from its label
              // The worked-out sum's "=" explanation is revealed on its line; a party's exact totals, its count of
              // payments and its full name on its label; each check mark is named on reveal.
              if (l && n.ghost) {
                const sumAt = l.lines.findIndex(x => x.kind === 'sum');
                hot.push({key: `f:${n.id}`, x: l.x, y: l.top + sumAt * 14, w: l.w, h: 14, label: l.lines[sumAt].text,
                  detail: <><b>ƒ {amountText(n.amountOut, currency)} · worked out</b><span className="rv-row">= what left {owner?.name ?? 'it'} minus what came in</span></>});
              } else if (l) {
                const k = n.others ? picture.folded?.payments ?? 0 : payments.filter(p => p.fromId === n.id).length;
                hot.push({key: `l:${n.id}`, x: l.x, y: l.top, w: l.w, h: l.h, label: n.name, detail: <><b>{n.name}</b>
                  {n.amountIn > 0 && <span className="rv-row">in {amountText(n.amountIn, currency)}</span>}
                  {(n.amountOut > 0 || n.marks.includes('black_hole')) && <span className="rv-row">out {amountText(n.amountOut, currency)}</span>}
                  {k > 0 && <span className="rv-row">{k} payment{k === 1 ? '' : 's'} out</span>}
                  {n.marks.includes('miracle') && <span className="rv-row">nothing seen coming in</span>}</>});
              }
              n.marks.forEach((m, i) => { const at = markAt(i); hot.push({key: `m:${n.id}:${m}`, x: at.x - 9, y: at.y - 9, w: 18, h: 18, label: KIND[m].word,
                detail: <><b>{KIND[m].word}</b><span className="rv-row">{KIND[m].line}</span></>}); });
              return <g key={n.id} className={`mn-node${n.ghost ? ' ghost' : ''}${n.others ? ' others' : ''}`}>
                <rect x={n.x} y={n.y} width={12} height={n.h} rx={2} fill={n.ghost ? 'url(#mn-hatch)' : undefined}/>
                {n.ghost && owner && <rect x={n.x} y={n.y} width={owner.x - n.x} height={n.h} className="mn-ghost-box"/>}
                {n.marks.map((m, i) => { const at = markAt(i); return <g key={m} className={`mn-mark mn-mark-${m}`} transform={`translate(${at.x} ${at.y})`}>
                  <circle r={8}/><text y={4} textAnchor="middle">{KIND[m].icon}</text></g>; })}
                {l && <rect x={l.x - 3} y={l.top - 1} width={l.w + 6} height={l.h + 2} rx={3} className="mn-label-bg"/>}
                {l?.lines.map((line, i) => <text key={i} x={l.x} y={l.top + 11 + i * 14} className={line.kind === 'sum' ? 'mn-node-sum' : 'mn-node-name'}>{line.text}
                  {line.tail && <tspan className="mn-node-sum" dx={8}>{line.tail}</tspan>}</text>)}
              </g>;
            })}
          </svg>
          {hot.map(h => <span key={h.key} className="mn-hot" style={{left: `${(h.x / picture.width) * 100}%`, top: `${(h.y / tall) * 100}%`,
            width: `${(h.w / picture.width) * 100}%`, height: `${(h.h / tall) * 100}%`}}>
            <Reveal className="mn-hot-rv" label={h.label} detail={h.detail}><span/></Reveal></span>)}
          </div>
          <ul className="sr-only" aria-label="The payments, in order">
            {picture.bands.filter(b => b.certainty !== 'worked_out').map(b => <li key={b.key}>{bandWords(b, picture)}</li>)}
          </ul>
          <figcaption>
            {/* The state ("to Mar 2016") and the counts show; how to use the picture, and its key, are revealed. */}
            <span><Reveal detail={<><span className="rv-row">Scroll over the flow to replay it in date order.</span>
              <span className="rv-row">Click a band to add it to “Traced so far”.</span><span className="rv-row">Key: <kbd>L</kbd> list view</span></>}>
              <span>To {drawnTo ? day(drawnTo.slice(0, 7)) : '—'}</span></Reveal>{upTo !== null && <> · <button type="button" className="mn-link" onClick={() => setUpTo(null)}>all</button></>}</span>
            <Reveal detail={<span className="mn-key"><i className="k-shown"/>shown <i className="k-unshown"/>not yet shown{payments.some(p => p.certainty === 'disputed') && <><i className="k-disputed"/>disputed</>} <i className="k-worked"/>ƒ worked out{picture.folded && <> <i className="k-others"/>others, folded</>}</span>}>
              <span className="mn-key-mark">Key</span></Reveal>
            {picture.folded && <span className="mn-fold"><Reveal detail={`The ${TOP_FLOWS} largest of ${picture.flows} flows are drawn; others (${picture.folded.flows}) holds the other ${picture.folded.payments} payments, ${amountText(picture.folded.amount, currency)}. Totals count every payment.`}>
              <span>{TOP_FLOWS} of {picture.flows} flows</span></Reveal> <button type="button" className="mn-link" onClick={() => setAllFlows(true)}>Show all {picture.flows} flows</button></span>}
            {allFlows && picture.flows > TOP_FLOWS && <span className="mn-fold">All {picture.flows} flows are drawn. <button type="button" className="mn-link" onClick={() => { setAllFlows(false); setPointed(null); }}>Fold to the {TOP_FLOWS} largest</button></span>}
          </figcaption>
        </figure>}
        {view === 'flow' && <div className="mn-figure"><FinancialFlowSankey height={360}
          fold={{top: TOP_FLOWS, all: allFlows, onAll: all => { setAllFlows(all); if (!all) setPointed(null); }}} transactions={txs.map(t => ({
          id: t.id, dateTime: t.dateTime || '', from: t.from, to: t.to, amount: t.amount, currency: t.currency,
          statedPurpose: t.statedPurpose || undefined, evidence: t.evidence || undefined, status: t.status || undefined, flowType: t.flowType,
        }))}/></div>}
        {view === 'ledger' && <LedgerTable txs={txs} lit={litRows} flagged={flaggedIds} traced={tracedSet} onLight={(id, i) => { setLit(id); setRow(i); }} full/>}

        <div className="mn-strip">
          <LedgerStrip txs={txs} currency={currency} lit={litRows} flags={structuring}/>
          {view !== 'ledger' && <div className="mn-table-side">
            {[...structuring, ...flagsOn.filter(f => !structuring.includes(f) && f.links.length === 1 && /round/i.test(f.summary))].slice(0, 2).map(f => <p key={f.id} className="mn-flag"><LevelChip level={f.level as 'faint' | 'strong' | 'textbook'}/> <span>{f.summary}</span></p>)}
            {flagsOn.length > 2 && <p className="mn-muted mn-more-flags">{flagsOn.length} open Red Flags touch these payments · <a href="#red-flags" className="mn-link">see them in Act</a></p>}
            <LedgerTable txs={txs} lit={litRows} flagged={flaggedIds} traced={tracedSet} onLight={(id, i) => { setLit(id); setRow(i); }}/>
          </div>}
        </div>
        {(ledgerQ.data?.incomplete.length ?? 0) > 0 && <details className="mn-incomplete">
          <summary>Not charted: {ledgerQ.data!.incomplete.length} payment{ledgerQ.data!.incomplete.length === 1 ? '' : 's'} missing something</summary>
          <ul>{ledgerQ.data!.incomplete.map(r => <li key={r.id}>{r.from || '?'} → {r.to || '?'}: {r.problems.join('; ')}</li>)}</ul>
        </details>}
      </div>
      <ChecksPanel investigationId={investigationId} currency={currency} checks={checks} ranAt={checksQ.data?.ran_at} asOf={asOf}
        error={checksQ.isError ? errorMessage(checksQ.error, 'Could not run the checks') : ''}/>
    </div>}
    {!status && <OwedList owed={owed}/>}
  </section>;
}

/** Amounts owed, not paid (an agreed price, a fine, an order): each with its kind's mark, in every currency, none added. */
function OwedList({owed}: {owed: FinancialTransactionOut[]}): ReactElement | null {
  if (!owed.length) return null;
  return <details className="mn-incomplete mn-owed">
    <summary><Reveal tabbable={false} detail={OWED_LINE}><span>Owed, not paid: {owed.length}</span></Reveal></summary>
    <ul aria-label="Amounts owed, not paid">{owed.map(t => <li key={t.id}><PaymentKindMark kind={t.paymentKind}/> {t.dateTime ? day(t.dateTime) : t.dateEnd ? `by ${day(t.dateEnd)}` : day(null)} · {t.from} → {t.to} · {amountText(t.amount, t.currency)}</li>)}</ul>
  </details>;
}

/** The band chips, each in a free place near its band, never over a bar or a party's label. */
function chips(bands: ReturnType<typeof layout>['bands'], avoid: Array<{x: number; y: number; w: number; h: number}> = [],
  bars: Array<{x: number; y: number; w: number; h: number}> = [], height = Infinity): Array<{key: string; certainty: string; text: string; sub: string | null; x: number; y: number; w: number}> {
  const placed: Array<{x: number; y: number; w: number; h: number}> = [...avoid];
  // A chip with no free place near its band is left out rather than laid over a name or moved far from its band
  // (the band still says it in its title and in the list; the mockup's €60,000 band has no chip either).
  return bands.filter(b => b.chip.text).sort((a, b) => a.chip.y - b.chip.y).flatMap(b => {
    const w = Math.max(b.chip.text.length, (b.chip.sub ?? '').length) * 6.3 + 16;
    const h = b.chip.sub ? 34 : 19;
    // Try the chip's own place, then the rows next to it, then to the right; never over a bar or a name, and
    // inside the picture (under the column titles, above its foot), so a chip is never cut off.
    const free = (x: number, top: number) => top >= 20 && top + h <= height && [...placed, ...bars].every(p => !(x < p.x + p.w + 6 && x + w > p.x && top < p.y + p.h && top + h > p.y));
    const spots = [0, -1, 1, -2].flatMap(r => [0, 1, 2, 3, -1].map(s => ({x: b.chip.x + s * 60, top: b.chip.y - 13 + r * (h + 4)})));
    const at = spots.find(s => free(s.x, s.top));
    if (!at) return [];
    placed.push({x: at.x, y: at.top, w, h});
    return [{key: b.key, certainty: b.certainty, text: b.chip.text, sub: b.chip.sub, x: at.x, y: at.top + 13, w}];
  });
}

/** A check's kind as its icon; its name and line are revealed. */
function CheckIcon({kind}: {kind: CheckMark}): ReactElement {
  const k = KIND[kind];
  return <Reveal label={k.word} detail={<><b>{k.word}</b><span className="rv-row">{k.line}</span></>}>
    <span className="mn-check-icon" aria-hidden="true">{k.icon}</span></Reveal>;
}

function currencyName(c: string): string {
  return ({EUR: 'Euro', USD: 'Dollar', GBP: 'Sterling'} as Record<string, string>)[c] ?? c;
}

function bandWords(b: ReturnType<typeof layout>['bands'][number], picture: ReturnType<typeof layout>): string {
  if (b.certainty === 'others') return `${b.label}: the smaller flows, folded together (open to show them all)`;
  const from = picture.nodes.find(n => n.id === b.fromId)?.name; const to = picture.nodes.find(n => n.id === b.toId)?.name;
  const how = b.certainty === 'worked_out' ? 'worked out, not a payment' : CERTAINTY[b.certainty].word.toLowerCase();
  return `${from} to ${to}: ${b.label} (${how})`;
}

const COMPACT_ROWS = 6;

function LedgerTable({txs, lit, flagged, traced, onLight, full = false}: {
  txs: FinancialTransactionOut[]; lit: Set<string>; flagged: Set<string>; traced: Set<string>; onLight: (id: string, i: number) => void; full?: boolean;
}): ReactElement {
  // The compact table shows six rows and moves only when a lit row is outside them, so the rows a band carries come into view.
  const [start, setStart] = useState(0);
  const firstLit = txs.findIndex(t => lit.has(t.id));
  const want = full || firstLit < 0 || (firstLit >= start && firstLit < start + COMPACT_ROWS) ? start
    : Math.max(0, Math.min(firstLit, txs.length - COMPACT_ROWS));
  if (want !== start) setStart(want);
  const from = full ? 0 : Math.min(want, Math.max(0, txs.length - COMPACT_ROWS));
  const shown = full ? txs : txs.slice(from, from + COMPACT_ROWS);
  const hidden = full ? 0 : txs.filter((t, i) => lit.has(t.id) && (i < from || i >= from + COMPACT_ROWS)).length;
  return <div className={`mn-table${full ? ' full' : ''}`}>
    <table aria-label="The ledger, in date order">
      <thead><tr><th scope="col">Date</th><th scope="col">From → to</th><th scope="col" className="num">Amount{txs[0] ? ` · ${txs[0].currency}` : ''}</th><th scope="col">How sure</th><th scope="col">Source</th>
        {full && <th scope="col">Purpose</th>}</tr></thead>
      <tbody>{shown.map((t, i) => {
        const c = CERTAINTY[t.certainty];
        const on = lit.has(t.id);
        return <tr key={t.id} className={`${on ? 'lit' : ''}${flagged.has(t.id) ? ' flagged' : ''}${traced.has(t.id) ? ' traced' : ''}`} onMouseEnter={() => onLight(t.id, from + i)}
          aria-current={on ? 'true' : undefined}>
          <td>{t.dateTime ? day(t.dateTime) : t.dateEnd ? `by ${day(t.dateEnd)}` : day(null)}{t.dateTime && t.dateEnd ? ` to ${day(t.dateEnd)}` : ''}</td><td><PaymentKindMark kind={t.paymentKind}/>{t.paymentKind ? ' ' : ''}{t.from} → {t.to}</td><td className="num">{t.amount.toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          <td><StatusChip status={c.status} label={c.word}/></td>
          <td>{t.locator ?? <span className="mn-muted">none attached</span>}</td>
          {full && <td>{t.statedPurpose ?? <span className="mn-muted">none stated</span>}</td>}
        </tr>;
      })}</tbody>
    </table>
    {!full && txs.length > shown.length && <p className="mn-muted"><Reveal detail={<>
      <span className="rv-row">{txs.length - shown.length} more rows{from > 0 ? ` (${from} above)` : ''}{hidden > 0 ? `, ${hidden} of them lit` : ''}</span>
      <span className="rv-row">Keys: <kbd>J</kbd> / <kbd>K</kbd> move the lit row, and the same band lights above</span></>}>
      <span>{txs.length - shown.length} more</span></Reveal></p>}
  </div>;
}

/** Payments on a time axis, height on a log scale (stated on the axis), the reporting line, and Red Flags' brackets. */
function LedgerStrip({txs, currency, lit, flags}: {txs: FinancialTransactionOut[]; currency: string; lit: Set<string>; flags: RedFlagOut[]}): ReactElement | null {
  const dated = txs.filter(t => t.dateTime);
  if (!dated.length) return null;
  const W = 420; const H = 150; const L = 8; const B = 20;
  const time = (d: string) => new Date(`${d.length === 4 ? `${d}-07-01` : d.length === 7 ? `${d}-15` : d}T00:00:00Z`).getTime();
  const ts = dated.map(t => time(t.dateTime!));
  const y0 = new Date(Date.UTC(new Date(Math.min(...ts)).getUTCFullYear(), 0, 1)).getTime();
  const y1 = new Date(Date.UTC(new Date(Math.max(...ts)).getUTCFullYear() + 1, 0, 1)).getTime();
  const x = (t: number) => L + ((t - y0) / (y1 - y0)) * (W - 2 * L);
  const maxLog = Math.log10(Math.max(...dated.map(t => t.amount), 10));
  const h = (a: number) => (Math.log10(Math.max(a, 1)) / maxLog) * (H - B - 26);
  const line = REPORTING_LINE[currency];
  // The line's name goes in the widest stretch with no bar, so it never sits on one.
  const xsAll = [L, ...dated.map(t => x(time(t.dateTime!))).sort((a, b) => a - b), W - L];
  const gapX = xsAll.slice(1).reduce((best, xv, i) => (xv - xsAll[i] > best.w ? {w: xv - xsAll[i], x: (xv + xsAll[i]) / 2} : best), {w: 0, x: W / 2}).x;
  const years = Array.from({length: new Date(y1).getUTCFullYear() - new Date(y0).getUTCFullYear()}, (_, i) => new Date(y0).getUTCFullYear() + i);
  return <figure className="mn-ledger-strip">
    <figcaption>The ledger, in date order · {currency}</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Each payment in ${currency} by date; bar height on a log scale`}>
      {years.map(yr => <text key={yr} x={x(Date.UTC(yr, 6, 1))} y={H - 4} textAnchor="middle" className="mn-axis">{yr}</text>)}
      {line && line < 10 ** maxLog && <g className="mn-line"><line x1={L} x2={W - L} y1={H - B - h(line)} y2={H - B - h(line)}/>
        <text x={gapX} y={H - B - h(line) - 4} textAnchor="middle">{amountText(line, currency)} line</text></g>}
      {flags.map(f => {
        const ids = new Set(f.links);
        const xs = dated.filter(t => ids.has(t.id)).map(t => x(time(t.dateTime!)));
        if (!xs.length) return null;
        const top = H - B - h(line ?? 10000) - 18;
        return <g key={f.id} className="mn-bracket"><path d={`M${Math.min(...xs) - 4},${top + 8}V${top}H${Math.max(...xs) + 4}V${top + 8}`}/></g>;
      })}
      {dated.map(t => <rect key={t.id} x={x(time(t.dateTime!)) - 3} width={6} y={H - B - h(t.amount)} height={h(t.amount)}
        className={`mn-bar mn-bar-${t.certainty}${lit.has(t.id) ? ' lit' : ''}`}><title>{day(t.dateTime ?? null)}{t.dateEnd ? ` to ${day(t.dateEnd)}` : ''} · {t.from} → {t.to} · {amountText(t.amount, currency)}</title></rect>)}
      {stripValues(dated.map(t => ({id: t.id, x: x(time(t.dateTime!)), top: H - B - h(t.amount), amount: t.amount})), currency, W, H - B,
        line && line < 10 ** maxLog ? {x: gapX - 34, y: H - B - h(line) - 14, w: 68, h: 12} : null, line ?? 10000)
        .map(v => <text key={`v${v.id}`} x={v.x} y={v.y} textAnchor={v.anchor} className="mn-bar-value">{v.text}</text>)}
    </svg>
    <p className="mn-muted mn-axis-note"><Reveal detail={`Bar height: amount, on a log scale${flags.length ? '' : ` · no structuring flag on these ${currency} payments`}`}><span>log scale</span></Reveal></p>
  </figure>;
}

/** The values written on the strip's largest bars: largest first, each where it overlaps no other value, no bar and
 *  not the line's name; one that finds no free place is left to its bar's own title (the mockup names only a few). */
export function stripValues(bars: Array<{id: string; x: number; top: number; amount: number}>, currency: string, width: number, base: number,
  lineBox: {x: number; y: number; w: number; h: number} | null, line: number): Array<{id: string; x: number; y: number; anchor: 'start' | 'end'; text: string}> {
  const CH = 5.8; const TH = 11;
  const taken: Array<{x: number; y: number; w: number; h: number}> = lineBox ? [lineBox] : [];
  const rects = bars.map(b => ({id: b.id, x: b.x - 3, y: b.top, w: 6, h: base - b.top}));
  const out: Array<{id: string; x: number; y: number; anchor: 'start' | 'end'; text: string}> = [];
  for (const b of [...bars].filter(v => v.amount >= 10 * line).sort((a, c) => c.amount - a.amount)) {
    const text = shortAmount(b.amount, currency);
    const w = text.length * CH;
    // Right of the bar's top, left of it, then just above it.
    const spots = [{x: b.x + 5, y: b.top + 9, anchor: 'start' as const, bx: b.x + 5}, {x: b.x - 5, y: b.top + 9, anchor: 'end' as const, bx: b.x - 5 - w},
      {x: b.x + 2, y: b.top - 3, anchor: 'start' as const, bx: b.x + 2}, {x: b.x - 2, y: b.top - 3, anchor: 'end' as const, bx: b.x - 2 - w}];
    const at = spots.find(s => {
      const box = {x: s.bx, y: s.y - TH + 2, w, h: TH};
      return box.x >= 0 && box.x + w <= width && box.y >= 0
        && [...taken, ...rects.filter(r => r.id !== b.id)].every(o => !(box.x < o.x + o.w && box.x + box.w > o.x && box.y < o.y + o.h && box.y + box.h > o.y));
    });
    if (!at) continue;
    taken.push({x: at.bx, y: at.y - TH + 2, w, h: TH});
    out.push({id: b.id, x: at.x, y: at.y, anchor: at.anchor, text});
  }
  return out;
}

function ChecksPanel({investigationId, currency, checks, ranAt, asOf, error}: {
  investigationId: string; currency: string; checks: CurrencyMoneyChecksOut | undefined; ranAt: string | undefined; asOf: number | null; error: string;
}): ReactElement {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const lead = useMutation({...createLeadEndpointMutation(), onSuccess: () => queryClient.invalidateQueries({queryKey: listLeadsQueryKey({path})})});
  // Kept in To check once (POST .../checks/money); the reply is To check's own list, so that panel shows it at once.
  const keep = useMutation({...keepMoneyCheckMutation(), onSuccess: data => {
    queryClient.setQueryData(getChecksQueryKey({path}), data);
    void queryClient.invalidateQueries({queryKey: getInvestigationMoneyChecksQueryKey({path})});
  }});
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [keepProblem, setKeepProblem] = useState('');
  const [made, setMade] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState(false);
  const [how, setHow] = useState(false);
  const found = checks?.checks ?? [];
  const firstOfKind = (['grey_hole', 'miracle', 'black_hole'] as const).flatMap(k => found.filter(c => c.kind === k).slice(0, 1));
  const shown = more ? found : firstOfKind;
  const makeLead = (key: string, title: string, detail: string) => lead.mutate({body: {investigation_id: investigationId, title, detail}},
    {onSuccess: () => setMade(m => ({...m, [key]: true}))});
  const card = (c: MoneyCheckOut | RoundTripOut, key: string) => {
    const k = KIND[c.kind];
    const numbers = c.kind === 'round_trip' ? `${c.path.join(' → ')}: ${amountText(c.gap, currency)} comes back.`
      : c.kind === 'grey_hole' ? `${amountText(c.amount_in, currency)} recorded in, ${amountText(c.amount_out, currency)} out: ${amountText(c.gap, currency)} has no recorded source.`
      : c.kind === 'miracle' ? `Pays ${amountText(c.amount_out, currency)}. Nothing is recorded coming in.`
      : `Receives ${amountText(c.amount_in, currency)}. Nothing is recorded leaving.`;
    const title = `${k.word}: ${c.party}`;
    const inToCheck = Boolean(c.to_check_id) || kept[key];
    const addToCheck = () => keep.mutate({path, body: {currency, kind: c.kind, party_id: c.party_id, as_of: asOf,
      returning_payment_id: c.kind === 'round_trip' ? c.returning_payment_id : null}}, {
      onSuccess: () => { setKept(m => ({...m, [key]: true})); setKeepProblem(''); },
      onError: e => setKeepProblem(errorMessage(e, 'Could not add it to To check')),
    });
    // The check's kind is its icon, named with its line on reveal; the lead idea is revealed on Make a lead. Could be
    // innocent stays (an indicator, never a finding).
    return <article key={key} className={`mn-check mn-check-${c.kind}`} aria-label={title}>
      <header><CheckIcon kind={c.kind}/><b>{c.party}</b></header>
      <p>{numbers}</p>
      <p><b>Could be innocent:</b> {c.innocent}.</p>
      <div className="mn-check-acts">
        <Reveal tabbable={false} detail={`Lead idea: ${c.lead_idea}`}><button type="button" disabled={made[key] || lead.isPending} onClick={() => makeLead(key, `${title} (${currency})`, `${numbers} Could be innocent: ${c.innocent}. Lead idea: ${c.lead_idea}.`)}>
          {made[key] ? 'Lead made ✓' : 'Make a lead'}</button></Reveal>
        <button type="button" disabled={inToCheck || keep.isPending} onClick={addToCheck}>{inToCheck ? 'In To check ✓' : 'Add to To check'}</button>
      </div>
    </article>;
  };
  return <aside className="mn-checks" aria-label="Does the money add up?">
    <p className="mn-eyebrow">Does the money add up? · 4 checks</p>
    <h3>Where money appears or vanishes</h3>
    {/* Kept once: each check is a question to chase, not a finding. How it was worked out is revealed on the ƒ. */}
    <p className="mn-muted"><Reveal label="Worked out by the app" detail={`Worked out by the app from the ${currencyName(currency).toLowerCase()} ledger only.`}><i aria-hidden="true">ƒ</i></Reveal> Each one is a question to chase, not a finding.</p>
    {error && <p className="mn-muted">{error}</p>}
    {keepProblem && <p className="mn-muted" role="alert">{keepProblem}</p>}
    {!checks && !error && <p className="mn-muted">Running the checks…</p>}
    {checks && <>
      {/* The four checks in a row: filled when something was found, hollow when not, each named on reveal. */}
      <p className="mn-check-row" aria-label="What the checks found">{(['grey_hole', 'miracle', 'black_hole', 'round_trip'] as const).map(k => {
        const n = k === 'round_trip' ? checks.round_trips.length : found.filter(c => c.kind === k).length;
        return <Reveal key={k} label={`${KIND[k].word}: ${n ? `${n} found` : 'none found'}`} detail={<><b>{KIND[k].word}: {n ? `${n} found` : 'none found'}</b>
          <span className="rv-row">{KIND[k].line}</span>{k === 'round_trip' && !n && <span className="rv-row">No {currencyName(currency).toLowerCase()} chain returns to its payer.</span>}</>}>
          <span className={`mn-check-icon mn-icon-${k}${n ? ' found' : ''}`} aria-hidden="true">{KIND[k].icon}</span></Reveal>;
      })}</p>
      {shown.map((c, i) => card(c, `${c.kind}:${c.party_id}:${i}`))}
      {found.length > firstOfKind.length && <button type="button" className="mn-more" onClick={() => setMore(m => !m)}>
        {more ? 'Show one of each' : `${found.length - firstOfKind.length} more ›`}</button>}
      {checks.round_trips.map((t, i) => card(t, `rt:${i}`))}
    </>}
    {ranAt && <p className="mn-ran"><Reveal tabbable={false} detail={`Checks re-run when the ledger or the year changes · last run ${ran(ranAt)}`}>
      <button type="button" className="mn-link" aria-expanded={how} onClick={() => setHow(h => !h)}>How these work</button></Reveal></p>}
    {how && <ul className="mn-how">
      <li><b>Grey hole:</b> a party sent more than the case shows it received; the difference is worked out, never a payment.</li>
      <li><b>Miracle:</b> a party sent money and nothing is recorded coming in.</li>
      <li><b>Black hole:</b> a party received money and nothing is recorded leaving.</li>
      <li><b>Round trip:</b> a chain of payments returns to the party it started from.</li>
      <li>One currency at a time, from the payments in this case only, up to the year chosen.</li>
    </ul>}
  </aside>;
}
