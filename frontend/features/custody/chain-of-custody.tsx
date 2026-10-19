'use client';
// Check › Chain of Custody (mockup CHECK_2, research §3.11): "How this fact got here", read left to right from the
// file to the sentence. One row per piece of evidence (for, then against); each card is a custodian step with
// who acted, when and its check; the lines between them carry what was done in the status grammar's line
// styles (solid confirmed by a person, dashed proposed, dotted worked out by the app, red against the claim,
// plum an AI step). The seal at the top can be pasted into a write-up's methods note. A detail panel on the
// right shows the chosen card in full, with Re-check hash; the custody log along the bottom is the same history
// as a dated list, exportable for an editor or a lawyer. Keys: L shows the log as a plain list, Esc back to the claim.
// The claim card carries its Done checklist for Supported, from the server (the rules a review to Supported is held
// to). Scrolling over the log replays it a step at a time, lighting each step's card and wires; the wires draw in
// from the file to the sentence when the chain opens (drawn at once with reduced motion).
import {useMutation, useQuery} from '@tanstack/react-query';
import {useRouter} from 'next/navigation';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {StatusChip, type ClaimStatus} from '../../components/status';
import {useWheelStep} from '../case-home/wheel-step';
import {errorMessage} from '../../lib/api-client';
import {onScreen, typingInto} from '../../lib/on-screen';
import {getClaimCustodyChainOptions, listClaimsOptions, recheckHashMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {ClaimDoneOut, CustodyCardOut, CustodyChainOut, CustodyLogOut} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';

const COLUMNS = ['Files', 'Reading', 'Passage', 'Decision', 'The claim'] as const;
const COL: Record<CustodyCardOut['kind'], number> = {file: 0, source: 0, reading: 1, passage: 2, decision: 3};
const SOURCE_WORD: Record<string, string> = {public_record: 'Public record', document: 'Document', web: 'Web page', interview: 'Interview', social: 'Social post', other: 'Other'};
const AI_MODULE: Record<string, string> = {case_synthesis: 'Case synthesis', hypothesis_test: 'Theory test', presentation_draft: 'Presentation'};
const KIND_WORD: Record<CustodyCardOut['kind'], string> = {file: 'File', source: 'Source', reading: 'Reading', passage: 'Passage', decision: 'Decision'};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The cards' and the log's short form, as the mockup writes it: "2 Oct 09:14". */
const short = (iso?: string | null) => {
  if (!iso) return 'not recorded';
  const d = apiTime(iso);   // shown in UTC on purpose: the custody log is kept in UTC
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const STATUS: Record<string, ClaimStatus> = {supported: 'supported', disputed: 'disputed', rejected: 'ruled_out', ruled_out: 'ruled_out'};
/** The Done rules' short names on the claim card (the rules themselves, and their full wording, come from the server). */
const DONE_SHORT: Record<string, string> = {supporting: 'evidence linked for it', says_it: 'quotes say it', locator: 'each says where',
  file: 'hashes intact', contradictions: 'against answered', not_leads_only: 'not on leads alone', independent: 'independent sources'};
const DONE_STATE: Record<ClaimDoneOut['rules'][number]['state'], {mark: string; word: string}> = {
  met: {mark: '✓', word: 'met'}, not_met: {mark: '✕', word: 'not met'}, unknown: {mark: '○', word: 'cannot be checked here'}};
/** How long the pointer rests on the log before the wheel replays it (as features/case-home/wheel-step.ts). */
const LOG_DWELL_MS = 220;
/** Motion off: the person's calm setting or the system's reduced motion. */
function calmNow(): boolean {
  if (typeof window === 'undefined') return true;
  return document.documentElement.dataset.motion === 'calm' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** The seal: one line a write-up's methods note can carry. */
export function sealLine(c: CustodyChainOut): string {
  const s = c.seal;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const hash = s.hashes_checked === 0 ? 'no file to hash' : s.hashes_intact ? 'hashes intact' : 'a hash does not match';
  return [n(s.steps, 'step', 'steps'), n(s.people, 'person', 'people'), n(s.app_services, 'app service', 'app services'),
    n(s.outside_services, 'outside service', 'outside services'), hash, n(s.ai_uses, 'AI use', 'AI uses')].join(' · ');
}

/** The custody log as a plain table for an editor or a lawyer (tab-separated, one row per step). */
export function logTable(c: CustodyChainOut): string {
  const rows = [['When (UTC)', 'Who', 'Kind', 'What was done'], ...c.log.map(e => [e.when, e.who, e.actor, e.what])];
  return `Chain of Custody: ${c.claim.text}\n${sealLine(c)}\n\n${rows.map(r => r.join('\t')).join('\n')}\n`;
}

function Check({label, ok}: {label: string; ok?: boolean | null}): ReactElement {
  // Read by OCR is a caution even when it worked: the words were read from a picture of the page.
  const caution = ok === true && label === 'OCR';
  const mark = caution ? '!' : ok === true ? '✓' : ok === false ? '✕' : '?';
  return <span className={`cc-check ${caution ? 'warn' : ok === true ? 'ok' : ok === false ? 'bad' : 'unknown'}`}><span aria-hidden="true">{mark}</span> {label}</span>;
}

/** The seal as it is shown: the hash part in the status colour. */
function Seal({chain}: {chain: CustodyChainOut}): ReactElement {
  const s = chain.seal;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  return <span className="cc-seal-line">
    {[n(s.steps, 'step', 'steps'), n(s.people, 'person', 'people'), n(s.app_services, 'app service', 'app services'), n(s.outside_services, 'outside service', 'outside services')].join(' · ')} ·{' '}
    <b className={s.hashes_checked === 0 ? '' : s.hashes_intact ? 'ok' : 'bad'}>{s.hashes_checked === 0 ? 'no file to hash' : s.hashes_intact ? '✓ hashes intact' : '✕ a hash does not match'}</b>
    {' · '}<span className="ai">{n(s.ai_uses, 'AI use', 'AI uses')}{s.ai_uses ? ' (downstream)' : ''}</span>
  </span>;
}

/** The quote lit in its passage. */
function Lit({text, quote}: {text: string; quote?: string | null}): ReactElement {
  if (!quote) return <>{text}</>;
  const at = text.toLowerCase().indexOf(quote.toLowerCase());
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + quote.length)}</mark>{text.slice(at + quote.length)}</>;
}

export function ChainOfCustody({investigationId, active = true}: {investigationId: string; active?: boolean}): ReactElement {
  const asked = useWorkbenchStore(s => s.chain);
  const openDocument = useWorkbenchStore(s => s.openDocument);
  const openClaimInStore = useWorkbenchStore(s => s.openClaim);
  const openAiRun = useWorkbenchStore(s => s.openAiRun);
  // Within the app (not a page load), so the run asked for is still there when AI runs opens.
  const router = useRouter();
  const watchRun = (runId: string) => { openAiRun(runId); router.push(`/act?inv=${encodeURIComponent(investigationId)}#ai-runs`); };
  const [fit, setFit] = useState(false);
  const [breaks, setBreaks] = useState(false);
  // Back to the claim: its card in Check › Claims.
  const openClaim = (id: string) => { openClaimInStore(id); window.location.hash = 'claim-verification'; };
  const claims = useQuery({...listClaimsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const [claimId, setClaimId] = useState<string>('');
  useEffect(() => { if (asked) setClaimId(asked.claimId); }, [asked]);
  const chosen = claimId || claims.data?.find(c => c.status === 'supported')?.id || claims.data?.[0]?.id || '';
  const chainQ = useQuery({...getClaimCustodyChainOptions({path: {claim_id: chosen}}), enabled: Boolean(chosen)});
  const chain = chainQ.data;
  const [picked, setPicked] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  // The log entry the replay stands on (scrolling over the log, or hovering a row); its card and wires light.
  const [step, setStep] = useState<number | null>(null);
  const log = useMemo(() => chain?.log ?? [], [chain]);
  const stepTo = (i: number) => { setStep(i); setLit(log[i]?.card ?? null); };
  const wheel = useWheelStep(log.length, step ?? -1, stepTo);
  // Scrolling over the log moves the replay, not the page (FEATURE_HOME §1 "Scroll-over"): once the pointer has
  // rested on it (the same dwell as useWheelStep), the wheel is held while there is a step to move to (the first
  // notch always lands on an entry); at either end
  // of the log the page scrolls on. React's wheel listener is passive, so this one is attached by hand.
  const logRef = useRef<HTMLElement | null>(null);
  const enteredLog = useRef(0);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const hold = (e: WheelEvent) => {
      if (log.length < 2 || Date.now() - enteredLog.current < LOG_DWELL_MS) return;
      const at = step ?? -1;
      if (at < 0 || (e.deltaY > 0 && at < log.length - 1) || (e.deltaY < 0 && at > 0)) e.preventDefault();
    };
    el.addEventListener('wheel', hold, {passive: false});
    return () => el.removeEventListener('wheel', hold);
  }, [log.length, step, chain]);
  const [asList, setAsList] = useState(false);
  const [copied, setCopied] = useState('');
  const recheck = useMutation({...recheckHashMutation()});
  const cards = useMemo(() => chain?.rows.flatMap(r => r.cards) ?? [], [chain]);
  const card = cards.find(c => c.id === picked) ?? cards.find(c => c.kind === 'passage') ?? cards[0];
  /** The file behind a step: any step in a row with a file can re-check it. */
  const fileOf = (c: CustodyCardOut) => chain?.rows.find(r => r.cards.some(x => x.id === c.id))?.cards.find(x => x.kind === 'file')?.document_id ?? null;
  useEffect(() => { setPicked(null); setStep(null); recheck.reset(); }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!onScreen(rootRef.current) || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typingInto(e.target)) return;
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setAsList(v => !v); }
      else if (e.key === 'Escape' && chosen && !document.querySelector('[role="dialog"]:not([hidden])')) openClaim(chosen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportLog = () => {
    if (!chain) return;
    const blob = new Blob([logTable(chain)], {type: 'text/tab-separated-values'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chain-of-custody-${chain.claim.id.slice(0, 8)}.tsv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copySeal = async () => {
    if (!chain) return;
    try { await navigator.clipboard.writeText(sealLine(chain)); setCopied('Copied'); } catch { setCopied('Select the line to copy it'); }
  };

  const status = !investigationId ? 'Open a case first.' : claims.isPending ? 'Reading the claims…'
    : !claims.data?.length ? 'No claim yet. A Chain of Custody starts from a claim: add one in Claims.'
    : chainQ.isError ? errorMessage(chainQ.error, 'Could not trace this claim') : chainQ.isPending ? 'Tracing the claim…' : '';

  return <section className="cc" aria-label="Chain of Custody" ref={rootRef}>
    <header className="cc-head">
      <h2>How this fact got here</h2>
      {chain && <p className="cc-seal"><button type="button" className="cc-seal-btn" onClick={() => void copySeal()}
        aria-label={`The custody seal: ${sealLine(chain)}. Copy it for a write-up's methods note`} title="Click to copy for a write-up's methods note"><Seal chain={chain}/></button>
        {copied && <span className="cc-copied" role="status">{copied}</span>}</p>}
      <div className="cc-tools">
        <span className="cc-dir">From file → to sentence</span>
        <button type="button" className="cc-btn" aria-pressed={fit} onClick={() => setFit(v => !v)}>Fit</button>
        <button type="button" className="cc-btn" aria-pressed={asList} onClick={() => setAsList(v => !v)}><kbd>L</kbd> log as list</button>
        {chosen && <button type="button" className="cc-btn" onClick={() => openClaim(chosen)}><kbd>Esc</kbd> back to the claim</button>}
      </div>
    </header>
    {(claims.data?.length ?? 0) > 1 && <label className="cc-pick">Claim
      <select value={chosen} onChange={e => setClaimId(e.target.value)} aria-label="Which claim">
        {claims.data!.map(c => <option key={c.id} value={c.id}>{c.text.length > 90 ? `${c.text.slice(0, 90)}…` : c.text}</option>)}
      </select></label>}
    {status && <p className="cc-muted">{status}</p>}
    {chain && <div className="cc-body">
      <div className="cc-main">
        {asList ? <LogList log={chain.log}/> : <Wires chain={chain} picked={card?.id ?? null} lit={lit} fit={fit} breaking={breaks ? card?.id ?? null : null}
          onPick={id => { setPicked(id); setBreaks(false); }} onLight={setLit} onWatch={watchRun}/>}
        <section className="cc-log" aria-label="Custody log" title="Scroll over the log to replay it step by step" ref={logRef}
          onWheel={wheel.onWheel} onPointerEnter={() => { wheel.onPointerEnter(); enteredLog.current = Date.now(); }}
          onMouseLeave={() => { setStep(null); setLit(null); }}>
          <header><h3>Custody log <small>who held it · what was done · when</small></h3>
            <button type="button" onClick={exportLog}>Export for an editor or lawyer ›</button></header>
          <table>
            <tbody>{chain.log.map((e, i) => <tr key={i} className={`${lit === e.card ? 'lit' : ''}${step === i ? ' now' : ''} actor-${e.actor}`}
              aria-current={step === i ? 'step' : undefined}
              onMouseEnter={() => stepTo(i)} onClick={() => e.card.includes(':') && setPicked(e.card)}>
              <td className="cc-mono">{short(e.when)}</td><td>{e.who}</td><td>{e.what}</td>
            </tr>)}</tbody>
          </table>
        </section>
      </div>
      {card && <Detail card={card} chain={chain} onOpen={(doc, page) => openDocument(doc, page)} breaks={breaks} onBreaks={() => setBreaks(v => !v)}
        recheck={fileOf(card) ? {
          run: () => recheck.mutate({path: {document_id: fileOf(card)!}}),
          result: recheck.data && recheck.data.document_id === fileOf(card) ? recheck.data.matches : undefined,
          pending: recheck.isPending,
        } : null}/>}
    </div>}
  </section>;
}

function Wires({chain, picked, lit, fit, breaking, onPick, onLight, onWatch}: {
  chain: CustodyChainOut; picked: string | null; lit: string | null; fit: boolean; breaking: string | null;
  onPick: (id: string) => void; onLight: (id: string | null) => void; onWatch: (runId: string) => void;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{key: string; d: string; style: string; words: string; x: number; y: number}[]>([]);
  // The lines are drawn between the cards where they actually sit (measured after layout and on resize).
  useLayoutEffect(() => {
    const host = box.current;
    if (!host) return;
    const measure = () => {
      const r0 = host.getBoundingClientRect();
      const rect = (id: string) => host.querySelector<HTMLElement>(`[data-card="${id}"]`)?.getBoundingClientRect();
      const out: typeof lines = [];
      const claim = rect('claim');
      for (const row of chain.rows) {
        const against = row.stance === 'contradicts';
        row.cards.forEach((c, i) => {
          const a = rect(c.id);
          const next = row.cards[i + 1];
          const b = next ? rect(next.id) : claim;
          if (!a || !b) return;
          const x1 = a.right - r0.left; const y1 = a.top + a.height / 2 - r0.top;
          const x2 = b.left - r0.left; const y2 = next ? b.top + b.height / 2 - r0.top : Math.min(Math.max(y1, b.top - r0.top + 24), b.bottom - r0.top - 24);
          const mx = (x1 + x2) / 2;
          // Only the line into the claim says what it does (as the mockup draws it); the others speak by their style.
          const words = next ? '' : c.wire.style === 'against' ? `✕ against${c.lines.some(l => l && l !== 'typed in by a person') ? ' · answered' : ''}` : c.wire.words;
          // A row against the claim is red from its first step (mockup CHECK_2).
          out.push({key: `${c.id}>${next?.id ?? 'claim'}`, d: `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`, style: against ? 'against' : c.wire.style, words,
            x: mx, y: (y1 + y2) / 2 - 5});
        });
      }
      // The claim's "used in" line down to each AI step.
      chain.ai.forEach(a => {
        const ai = rect(`ai:${a.id}`);
        if (!claim || !ai) return;
        const x = claim.left + claim.width / 2 - r0.left;
        out.push({key: `claim>ai:${a.id}`, d: `M${x},${claim.bottom - r0.top}L${x},${ai.top - r0.top}`, style: 'ai', words: 'used in', x: x + 26, y: (claim.bottom + ai.top) / 2 - r0.top + 3});
      });
      setLines(out);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(host);
    return () => ro?.disconnect();
  }, [chain, fit]);
  // Fit: the whole chain at once, scaled down to the width it has.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const host = box.current;
    if (!host || !fit) { setScale(1); return; }
    setScale(Math.min(1, host.clientWidth / host.scrollWidth, (window.innerHeight * 0.62) / host.scrollHeight));
  }, [fit, chain]);
  const downstream = new Set(breaking ? chain.rows.filter(r => r.cards.some(c => c.id === breaking)).flatMap(r => r.cards.slice(r.cards.findIndex(c => c.id === breaking))).map(c => c.id) : []);
  const claimStatus = STATUS[chain.claim.status] ?? 'unshown';
  // The wires draw in from the file to the sentence when a chain opens: motion that explains the direction. With
  // reduced motion they are drawn at once (the stylesheet holds the same fallback).
  const [draw] = useState(() => !calmNow());
  // A step lights the wires on both its sides.
  const wireLit = (key: string) => Boolean(lit && (key.startsWith(`${lit}>`) || key.endsWith(`>${lit}`)));
  return <div className={`cc-wires${breaking ? ' breaking' : ''}`} ref={box} style={scale < 1 ? {zoom: scale} : undefined}>
    <svg key={chain.claim.id} className={`cc-lines${draw ? ' draw' : ''}`} aria-hidden="true">
      {lines.map(l => <g key={l.key} className={`cc-wire w-${l.style}${wireLit(l.key) ? ' lit' : ''}`}>
        <path d={l.d}/>{l.words && <text x={l.x} y={l.y - (l.words.includes(' · ') ? 6 : 0)} textAnchor="middle">
          {l.words.split(' · ').map((w, i) => <tspan key={i} x={l.x} dy={i ? 11 : 0}>{w}</tspan>)}</text>}</g>)}
    </svg>
    {COLUMNS.map((c, i) => <p key={c} className="cc-col" style={{gridColumn: i + 1}}>{c.toUpperCase()}</p>)}
    {chain.rows.map((row, r) => row.cards.map(c => <CardBox key={c.id} card={c} row={r + 2} picked={picked === c.id} lit={lit === c.id} falls={downstream.has(c.id)}
      against={row.stance === 'contradicts'} onPick={() => onPick(c.id)} onLight={onLight}/>))}
    <article className={`cc-card cc-claim st-${claimStatus}${breaking ? ' falls' : ''}${lit === 'claim' ? ' lit' : ''}`} data-card="claim" style={{gridColumn: 5, gridRow: `2 / span ${Math.max(1, chain.rows.length)}`}}
      aria-label={`The claim: ${chain.claim.text}`}>
      <StatusChip status={claimStatus}/>
      <b>{chain.claim.text}</b>
      <DoneList done={chain.done}/>
    </article>
    {chain.ai.map((a, i) => <article key={a.id} className={`cc-card cc-ai${lit === `ai:${a.id}` ? ' lit' : ''}`} data-card={`ai:${a.id}`} style={{gridColumn: 5, gridRow: chain.rows.length + 2 + i}} aria-label="AI step">
      <span className="cc-kind">AI</span><b>{AI_MODULE[a.module] ?? a.module} draft quoted this claim</b>
      <small>{short(a.when)} · {a.status === 'accepted' ? 'accepted' : 'not accepted yet'}</small>
      {a.run_id && <button type="button" className="cc-watch" onClick={() => onWatch(a.run_id!)}>Watch the run →</button>}
    </article>)}
    {!chain.rows.length && <p className="cc-muted" style={{gridColumn: '1 / 5', gridRow: 2}}>
      This claim has no evidence linked to it yet, so there is no chain to draw. Link a quote to it in Claims to make it traceable.</p>}
  </div>;
}

/** The Done checklist for Supported (server, app/services/claim_done.py): each rule met, not met, or not checkable
 * here, with what it waits on. Shape and word, never colour alone. */
function DoneList({done}: {done: ClaimDoneOut}): ReactElement {
  return <div className="cc-done" aria-label="Done for Supported">
    <p className="cc-done-head">Done for Supported · <span className={done.met ? 'ok' : 'bad'}>{done.met ? '✓ every rule met' : `${done.left} left`}</span>
      {done.unknown ? <span className="unknown"> · ○ {done.unknown} not checkable here</span> : null}</p>
    <ul>{done.rules.map(r => <li key={r.key} className={`done-${r.state}`} title={`${r.label}: ${r.detail}`}
      aria-label={`${r.label}: ${DONE_STATE[r.state].word}. ${r.detail}`}>
      <span aria-hidden="true">{DONE_STATE[r.state].mark}</span> {DONE_SHORT[r.key] ?? r.label}
      {r.state !== 'met' && <small>{r.state === 'not_met' ? 'waits on: ' : ''}{r.detail}</small>}
    </li>)}</ul>
  </div>;
}

function CardBox({card, row, picked, lit, falls, against, onPick, onLight}: {
  card: CustodyCardOut; row: number; picked: boolean; lit: boolean; falls: boolean; against: boolean; onPick: () => void; onLight: (id: string | null) => void;
}): ReactElement {
  const head = card.kind === 'decision' ? (card.title === 'Answered' ? 'Linked against' : card.title)
    : card.kind === 'passage' ? `Passage${card.page ? ` · p.${card.page}` : ''}` : KIND_WORD[card.kind];
  return <button type="button" data-card={card.id} className={`cc-card k-${card.kind} a-${card.actor}${picked ? ' picked' : ''}${lit ? ' lit' : ''}${falls ? ' falls' : ''}${against ? ' against' : ''}`}
    style={{gridColumn: COL[card.kind] + 1, gridRow: row}} onClick={onPick} onMouseEnter={() => onLight(card.id)} onMouseLeave={() => onLight(null)}
    aria-label={`${KIND_WORD[card.kind]}: ${card.title}. ${card.checks.map(c => `${c.label} ${c.ok === true ? 'passed' : c.ok === false ? 'failed' : 'not known'}`).join(', ')}`}>
    {card.kind === 'file' && <span className="cc-thumb" aria-hidden="true"><i/><i/><i/><i/></span>}
    <span className="cc-card-top"><span className="cc-kind">{head}</span>{card.checks.map(c => <Check key={c.label} {...c}/>)}</span>
    {card.kind === 'passage' ? (card.text ? <span className="cc-text"><Lit text={card.text.length > 150 ? `${card.text.slice(0, 150)}…` : card.text} quote={card.quote}/></span> : <b>{card.title}</b>)
      : card.kind === 'reading' ? <b>{card.title}{card.lines[0] ? `, ${card.lines[0]}` : ''}</b>
      : card.kind === 'decision' ? <b>{card.title === 'Answered' ? `Answer: ${card.lines[0]}` : card.title === 'Quote saved' ? 'Typed in by a person' : card.lines[0]}</b>
      : <b className={card.kind === 'file' ? 'cc-file' : undefined}>{card.title}</b>}
    {card.quote && card.kind === 'source' && <span className="cc-text">“{card.quote}”</span>}
    {card.kind === 'decision' && card.title === 'Proposed' && card.lines[1] && <small className={card.lines[1].startsWith('accepted') ? 'cc-ok' : ''}>{card.lines[1].startsWith('accepted') ? `✓ ${card.lines[1].replace(/^a/, 'A')}` : card.lines[1]}</small>}
    {(card.kind === 'file' || card.kind === 'source') && card.lines.map((l, i) => <small key={i}>{l}</small>)}
    {card.kind !== 'passage' && (card.when || card.kind !== 'source') && <small className="cc-when">{card.kind === 'file' && card.who ? `uploaded by ${card.who} · ` : card.who ? `${card.who.charAt(0).toLowerCase()}${card.who.slice(1)} · ` : ''}{short(card.when)}</small>}
  </button>;
}

function Detail({card, chain, onOpen, recheck, breaks, onBreaks}: {
  card: CustodyCardOut; chain: CustodyChainOut; onOpen: (documentId: string, page: number | null) => void;
  recheck: {run: () => void; result: boolean | null | undefined; pending: boolean} | null; breaks: boolean; onBreaks: () => void;
}): ReactElement {
  const row = chain.rows.find(r => r.cards.some(c => c.id === card.id));
  const all = row?.cards ?? [card];
  const n = all.findIndex(c => c.id === card.id) + 1;
  const file = all.find(c => c.kind === 'file');
  const reading = all.find(c => c.kind === 'reading');
  const passage = all.find(c => c.kind === 'passage');
  const decision = all.find(c => c.kind === 'decision');
  const says = passage?.checks.find(c => c.label === 'says it');
  const hash = file?.checks.find(c => c.label === 'hash');
  const item = (label: string, body: ReactNode) => <div><dt>{label}</dt><dd>{body}</dd></div>;
  const chip = (ok: boolean | null | undefined, words: string, warn = false) => <Check label={words} ok={warn ? true : ok}/>;
  const src = row?.source;
  const rests = row?.rests_on ?? [];
  const title = card.kind === 'passage' ? `${src?.title ?? card.title}${card.page ? `, page ${card.page}` : ''}` : card.title;
  const sha = file?.sha256 ? `${file.sha256.slice(0, 4)} ${file.sha256.slice(4, 8)} … ${file.sha256.slice(-4)}` : null;
  return <aside className="cc-detail" aria-label={`Step ${n} of ${all.length}: ${KIND_WORD[card.kind]}`}>
    <p className="cc-eyebrow">Step {n} of {all.length} · {KIND_WORD[card.kind]}</p>
    <h3>{title}</h3>
    {file && <p className="cc-mono cc-muted">{file.title}{passage?.page ? ` · page ${passage.page}` : ''}</p>}
    {(passage?.text || card.quote) && <blockquote><Lit text={passage?.text ?? card.quote ?? ''} quote={card.quote ?? passage?.quote}/></blockquote>}
    <dl>
      {src && item('Source', <span className="cc-checks plain">
        <Check label={SOURCE_WORD[src.source_type] ?? src.source_type} ok={true}/>
        {src.tier ? <Check label={`Tier ${src.tier}`} ok={true}/> : <Check label="tier not set" ok={null}/>}
        <Check label={src.issuer ? `by ${src.issuer}` : 'interested party?'} ok={src.issuer ? true : null}/></span>)}
      {file && item('File', <span className="cc-checks plain">{chip(hash?.ok, hash?.ok ? 'hash matches' : hash?.ok === false ? 'hash differs' : 'hash not checked')}
        {reading && reading.checks[0]?.label === 'OCR' ? <Check label="read by OCR" ok={true}/> : reading ? chip(reading.checks[0]?.ok, 'text layer') : null}</span>)}
      {passage && item('Content', <span className="cc-checks plain">{chip(says?.ok, says?.ok ? 'says it · exact' : says?.ok === false ? 'does not say it' : 'not checked')}</span>)}
      {row?.anchor && item('Anchor', `${row.anchor.exact ? 'exact' : 'same words, different case'} quote at characters ${row.anchor.start}–${row.anchor.end} of the passage (found now, not stored)`)}
      {sha && item('SHA-256', <span className="cc-mono">{sha}
        {recheck?.result !== undefined ? <> · {recheck.result ? '✓ re-checked now' : '✕ does not match the file now'}</> : <> · {hash?.ok ? '✓ re-checked when opened' : ''}</>}</span>)}
      {decision && item('Decided', `${decision.title === 'Proposed' ? decision.lines.join(' · ') : decision.title === 'Answered' ? `Answered: ${decision.lines[0]}` : 'Typed in by a person'} · ${short(decision.when)}`)}
      {row && item('Rests on it', rests.length ? <span className="cc-checks">
        {(['claim', 'link'] as const).map(k => { const c = rests.filter(r => r.kind === k).length; return c ? <span key={k} className="cc-rest">{c} {k}{c === 1 ? '' : 's'}</span> : null; })}
        {rests.filter(r => r.kind === 'flag').map(f => <span key={f.id} className="cc-rest">{f.label} {f.level && <LevelMark level={f.level}/>}</span>)}</span> : 'nothing else yet')}
    </dl>
    {breaks && row && <div className="cc-breaks" role="status"><b>If this step breaks</b>, everything after it in this row falls, and with it:
      <ul>{rests.map(r => <li key={r.id}>{r.kind === 'claim' ? 'Claim' : r.kind === 'link' ? 'Link' : 'Flag'}: {r.label}</li>)}</ul></div>}
    <div className="cc-key" aria-label="Key">
      <p className="cc-eyebrow">Key</p>
      <span className="cc-k-confirmed">confirmed by a person</span><span className="cc-k-proposed">proposed, not yet confirmed</span>
      <span className="cc-k-worked">worked out by the app</span><span className="cc-k-against">against the claim · ✕ check failed</span><span className="cc-k-ai">AI step (plum)</span>
    </div>
    <div className="cc-acts">
      {file?.document_id && <button type="button" className="primary" onClick={() => onOpen(file.document_id!, passage?.page ?? null)}>
        {passage?.page ? `Open page ${passage.page}` : 'Open the file'}</button>}
      {recheck && <button type="button" onClick={recheck.run} disabled={recheck.pending}>{recheck.pending ? 'Checking…' : 'Re-check hash'}</button>}
      <button type="button" aria-pressed={breaks} onClick={onBreaks}>What if this breaks?</button>
    </div>
  </aside>;
}

function LevelMark({level}: {level: string}): ReactElement {
  const n = level === 'textbook' ? 3 : level === 'strong' ? 2 : 1;
  return <span className={`cc-level l-${level}`} aria-label={level}>{'▮'.repeat(n)}{'▯'.repeat(3 - n)} {level.toUpperCase()}</span>;
}

function LogList({log}: {log: CustodyLogOut[]}): ReactElement {
  return <ol className="cc-list" aria-label="The chain as a list">
    {log.map((e, i) => <li key={i}><span className="cc-mono">{short(e.when)}</span> · {e.who}: {e.what}</li>)}
  </ol>;
}
