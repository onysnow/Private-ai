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
import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, ReactElement, ReactNode} from 'react';

import {LevelChip, StatusChip, type ClaimStatus, type FlagLevel} from '../../components/status';
import {Reveal} from '../../components/ui/reveal';
import {useWheelStep} from '../case-home/wheel-step';
import {errorMessage} from '../../lib/api-client';
import {escapeTaken, onScreen, typingInto} from '../../lib/on-screen';
import {getClaimCustodyChainOptions, listClaimsOptions, recheckHashMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {ClaimDoneOut, CustodyAnchorOut, CustodyCardOut, CustodyChainOut, CustodyLogOut} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';

const COLUMNS = ['Files', 'Reading', 'Passage', 'Decision', 'The claim'] as const;
const COL: Record<CustodyCardOut['kind'], number> = {file: 0, source: 0, reading: 1, passage: 2, decision: 3};
const SOURCE_WORD: Record<string, string> = {public_record: 'Public record', document: 'Document', web: 'Web page', interview: 'Interview', social: 'Social post', other: 'Other'};
/** A source's type as an icon (globe, page, speech bubble, seal, at-sign, dot), named on reveal (Ony, 29 Oct). */
function SourceIcon({type}: {type: string}): ReactElement {
  const paths: Record<string, ReactNode> = {
    web: <><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></>,
    document: <><path d="M4 1.5h5.5l3 3v10h-8.5z"/><path d="M6 7.5h4.5M6 10h4.5"/></>,
    interview: <><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></>,
    public_record: <><circle cx="8" cy="7" r="4.5"/><path d="M5.5 10.5l-1 4 3.5-1.5 3.5 1.5-1-4"/></>,
    social: <><circle cx="8" cy="8" r="2.5"/><path d="M10.5 8v1.2a1.8 1.8 0 0 0 3.5 0V8A6 6 0 1 0 11 13.2"/></>,
  };
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
    style={{verticalAlign: 'middle'}}>{paths[type] ?? <circle cx="8" cy="8" r="2.5" fill="currentColor"/>}</svg>;
}
const AI_MODULE: Record<string, string> = {case_synthesis: 'Case synthesis', hypothesis_test: 'Theory test', presentation_draft: 'Presentation',
  research_vetting: 'Research vetting', quant_framing: 'Rival explanations', las_argument_check: 'Logic check', das_framing: 'Decision framing',
  das_options: 'Options and evidence', evidence_plan: 'Evidence plan', ehs_harm_minimisation: 'Harm assessment', ehs_public_interest: 'Public interest'};
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

/** Who acted, as a person reads it: an AI step names its module ("AI · Case synthesis"), never its code name. */
export function whoWord(who: string): string {
  const m = /^AI · (.+)$/.exec(who);
  return m ? `AI · ${AI_MODULE[m[1]] ?? m[1].replace(/_/g, ' ')}` : who;
}
/** How many AI steps are drawn under the claim before the rest fold into one "+n more" card (research §3.11, very large). */
const AI_SHOWN = 2;

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
  const rows = [['When (UTC)', 'Who', 'Kind', 'What was done'], ...c.log.map(e => [e.when, whoWord(e.who), e.actor, e.what])];
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
function Lit({text, quote, span}: {text: string; quote?: string | null; span?: {start: number; end: number} | null}): ReactElement {
  // The stored anchor's characters when there is one (ADR-0015); otherwise the words looked for, ignoring case.
  const at = span ? span.start : quote ? text.toLowerCase().indexOf(quote.toLowerCase()) : -1;
  const end = span ? span.end : at + (quote?.length ?? 0);
  if (at < 0 || end > text.length) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, end)}</mark>{text.slice(end)}</>;
}

/** About 150 characters of a passage for its card, starting a little before the quote so the card shows it lit. */
function excerpt(text: string, span: {start: number; end: number} | null): {text: string; span: {start: number; end: number} | null} {
  const LEN = 150;
  if (!span || span.end > text.length) return {text: text.length > LEN ? `${text.slice(0, LEN)}…` : text, span: null};
  let from = Math.max(0, span.start - 40);
  if (from > 0) { const space = text.indexOf(' ', from); from = space >= 0 && space < span.start ? space + 1 : from; }
  const to = Math.max(from + LEN, Math.min(span.end, from + LEN * 2));
  const lead = from > 0 ? '…' : '';
  return {text: `${lead}${text.slice(from, to)}${to < text.length ? '…' : ''}`, span: {start: span.start - from + lead.length, end: Math.min(span.end, to) - from + lead.length}};
}

const spanOf = (a: CustodyAnchorOut | null | undefined) => a && a.start != null && a.end != null ? {start: a.start, end: a.end} : null;

/** The server counts characters (code points); JavaScript strings count UTF-16 units, so a character outside the
 * basic plane before or inside the quote would shift the highlight. Turn a stored span into this text's units. */
export function unitSpan(text: string, span: {start: number; end: number} | null): {start: number; end: number} | null {
  if (!span) return null;
  const unit = (points: number) => {
    let i = 0;
    for (let n = 0; n < points && i < text.length; n += 1) i += (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
    return i;
  };
  return {start: unit(span.start), end: unit(span.end)};
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
      else if (e.key === 'Escape' && chosen && !escapeTaken(e, rootRef.current)) openClaim(chosen);
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

  return <section className="cc" data-calm-zone="" aria-label="Chain of Custody" ref={rootRef}>
    <header className="cc-head">
      {/* Ony, 29 Oct: the direction is revealed on the title (the column heads say it too); the keys on their buttons. */}
      <h2><Reveal detail="Read from file → to sentence: each row is one piece of evidence, its steps left to right into the claim.">How this fact got here</Reveal></h2>
      {chain && <p className="cc-seal"><Reveal tabbable={false} detail="Click to copy for a write-up's methods note"><button type="button" className="cc-seal-btn" onClick={() => void copySeal()}
        aria-label={`The custody seal: ${sealLine(chain)}. Copy it for a write-up's methods note`}><Seal chain={chain}/></button></Reveal>
        {copied && <span className="cc-copied" role="status">{copied}</span>}</p>}
      <div className="cc-tools">
        <button type="button" className="cc-btn" aria-pressed={fit} onClick={() => setFit(v => !v)}>Fit</button>
        <Reveal tabbable={false} detail={<>Key: <kbd>L</kbd></>}><button type="button" className="cc-btn" aria-pressed={asList} onClick={() => setAsList(v => !v)} aria-keyshortcuts="L">Log as list</button></Reveal>
        {chosen && <Reveal tabbable={false} detail={<>Key: <kbd>Esc</kbd></>}><button type="button" className="cc-btn" onClick={() => openClaim(chosen)} aria-keyshortcuts="Escape">Back to the claim</button></Reveal>}
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
        <section className="cc-log" aria-label="Custody log" ref={logRef}
          onWheel={wheel.onWheel} onPointerEnter={() => { wheel.onPointerEnter(); enteredLog.current = Date.now(); }}
          onMouseLeave={() => { setStep(null); setLit(null); }}>
          <header><h3><Reveal detail={<><span className="rv-row">Who held it · what was done · when</span>
            <span className="rv-row">Scroll over the log to replay it step by step.</span></>}>Custody log</Reveal></h3>
            <button type="button" onClick={exportLog}>Export for an editor or lawyer ›</button></header>
          <table>
            <tbody>{chain.log.map((e, i) => <tr key={i} className={`${lit === e.card ? 'lit' : ''}${step === i ? ' now' : ''} actor-${e.actor}`}
              aria-current={step === i ? 'step' : undefined}
              onMouseEnter={() => stepTo(i)} onClick={() => e.card.includes(':') && setPicked(e.card)}>
              <td className="cc-mono">{short(e.when)}</td><td>{whoWord(e.who)}</td><td>{e.what}</td>
            </tr>)}</tbody>
          </table>
        </section>
      </div>
      {card && <Detail card={card} chain={chain} onOpen={(doc, page) => openDocument(doc, page)} breaks={breaks} onBreaks={() => setBreaks(v => !v)}
        recheck={fileOf(card) ? {
          run: () => recheck.mutate({path: {document_id: fileOf(card)!}}),
          result: recheck.data && recheck.data.document_id === fileOf(card) ? recheck.data.matches : undefined,
          pending: recheck.isPending,
          error: recheck.isError && recheck.variables?.path.document_id === fileOf(card) ? errorMessage(recheck.error, 'the server did not answer') : null,
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
  // Fit: the whole chain at once, scaled down to the width it has.
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const host = box.current;
    if (!host || !fit) { setScale(1); return; }
    setScale(Math.min(1, host.clientWidth / host.scrollWidth, (window.innerHeight * 0.62) / host.scrollHeight));
  }, [fit, chain]);
  // More AI steps than fit under the claim fold into one card; it opens them all.
  const [allAi, setAllAi] = useState(false);
  useEffect(() => { setAllAi(false); }, [chain.claim.id]);
  const aiShown = useMemo(() => (allAi || chain.ai.length <= AI_SHOWN + 1 ? chain.ai : chain.ai.slice(0, AI_SHOWN)), [allAi, chain.ai]);
  const aiFolded = (id: string | null) => Boolean(id?.startsWith('ai:') && id !== 'ai:more' && !aiShown.some(a => `ai:${a.id}` === id));
  // The lines are drawn between the cards where they actually sit (measured after layout and on resize). Under Fit
  // the box is zoomed: the page sees zoomed sizes, the lines are drawn in the box's own units, so each is divided back.
  useLayoutEffect(() => {
    const host = box.current;
    if (!host) return;
    const measure = () => {
      const r0 = host.getBoundingClientRect();
      const k = host.offsetWidth ? r0.width / host.offsetWidth : 1;
      const rect = (id: string) => {
        const r = host.querySelector<HTMLElement>(`[data-card="${id}"]`)?.getBoundingClientRect();
        return r && {left: r0.left + (r.left - r0.left) / k, right: r0.left + (r.right - r0.left) / k, top: r0.top + (r.top - r0.top) / k,
          bottom: r0.top + (r.bottom - r0.top) / k, width: r.width / k, height: r.height / k};
      };
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
          // A row marked superseded by a newer record still runs to the claim, faded, and says so: it counts for nothing.
          const words = next ? '' : row.superseded ? 'superseded' : c.wire.style === 'against' ? `✕ against${c.lines.some(l => l && l !== 'typed in by a person') ? ' · answered' : ''}` : c.wire.words;
          // A row against the claim is red from its first step (mockup CHECK_2).
          out.push({key: `${c.id}>${next?.id ?? 'claim'}`, d: `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`, style: row.superseded ? 'gone' : against ? 'against' : c.wire.style, words,
            x: mx, y: (y1 + y2) / 2 - 5});
        });
      }
      // The claim's "used in" line down to each AI step.
      [...aiShown.map(a => `ai:${a.id}`), ...(aiShown.length < chain.ai.length ? ['ai:more'] : [])].forEach(id => {
        const ai = rect(id);
        if (!claim || !ai) return;
        const x = claim.left + claim.width / 2 - r0.left;
        out.push({key: `claim>${id}`, d: `M${x},${claim.bottom - r0.top}L${x},${ai.top - r0.top}`, style: 'ai', words: 'used in', x: x + 26, y: (claim.bottom + ai.top) / 2 - r0.top + 3});
      });
      setLines(out);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(host);
    return () => ro?.disconnect();
  }, [chain, fit, scale, aiShown]);
  const downstream = new Set(breaking ? chain.rows.filter(r => r.cards.some(c => c.id === breaking)).flatMap(r => r.cards.slice(r.cards.findIndex(c => c.id === breaking))).map(c => c.id) : []);
  const claimStatus = STATUS[chain.claim.status] ?? 'unshown';
  // The wires draw in from the file to the sentence when a chain opens: motion that explains the direction. With
  // reduced motion they are drawn at once (the stylesheet holds the same fallback).
  const [draw] = useState(() => !calmNow());
  // A step lights the wires on both its sides.
  const wireLit = (key: string) => Boolean(lit && (key.startsWith(`${lit}>`) || key.endsWith(`>${lit}`)));
  // Only the columns a card stands in are drawn (a source typed in by hand has no reading or passage step), so the
  // steps sit side by side into the claim instead of across empty columns; with no evidence yet, all five show.
  const used = chain.rows.length ? [0, 1, 2, 3].filter(i => chain.rows.some(r => r.cards.some(c => COL[c.kind] === i))) : [0, 1, 2, 3];
  const at = (col: number) => used.indexOf(col) + 1;
  const claimAt = used.length + 1;
  const gridStyle: CSSProperties = {gridTemplateColumns: `repeat(${used.length}, minmax(140px, ${used.length < 4 ? '250px' : '1fr'})) ${used.length < 4 ? 'minmax(220px, 300px)' : 'minmax(200px, 1.2fr)'}`,
    ...(used.length < 4 ? {justifyContent: 'space-between'} : {}),
    ...(scale < 1 ? {zoom: scale} : {})};
  return <div className={`cc-wires${breaking ? ' breaking' : ''}${draw ? ' draw' : ''}`} ref={box} style={gridStyle} data-columns={used.length + 1}>
    <svg key={chain.claim.id} className={`cc-lines${draw ? ' draw' : ''}`} aria-hidden="true">
      {lines.map(l => <g key={l.key} className={`cc-wire w-${l.style}${wireLit(l.key) ? ' lit' : ''}`}>
        <path d={l.d}/>{l.words && <text x={l.x} y={l.y - (l.words.includes(' · ') ? 6 : 0)} textAnchor="middle">
          {l.words.split(' · ').map((w, i) => <tspan key={i} x={l.x} dy={i ? 11 : 0}>{w}</tspan>)}</text>}</g>)}
    </svg>
    {COLUMNS.map((c, i) => (i === 4 || used.includes(i)) && <p key={c} className="cc-col" style={{gridColumn: i === 4 ? claimAt : at(i)}}>{c.toUpperCase()}</p>)}
    {chain.rows.map((row, r) => row.cards.map(c => <CardBox key={c.id} card={c} row={r + 2} column={at(COL[c.kind])} picked={picked === c.id} lit={lit === c.id} falls={downstream.has(c.id)}
      against={row.stance === 'contradicts'} gone={Boolean(row.superseded)} anchor={spanOf(row.anchor)} onPick={() => onPick(c.id)} onLight={onLight}/>))}
    <article className={`cc-card cc-claim st-${claimStatus}${breaking ? ' falls' : ''}${lit === 'claim' ? ' lit' : ''}`} data-card="claim" style={{gridColumn: claimAt, gridRow: `2 / span ${Math.max(1, chain.rows.length)}`}}
      aria-label={`The claim: ${chain.claim.text}`}>
      <StatusChip status={claimStatus}/>
      <b>{chain.claim.text}</b>
      <DoneList done={chain.done}/>
    </article>
    {/* An AI step: the plum AI mark; "not accepted yet" is the dashed outline (solid once accepted), its words and time
        revealed on the mark. */}
    {aiShown.map((a, i) => <article key={a.id} className={`cc-card cc-ai${a.status === 'accepted' ? ' accepted' : ''}${lit === `ai:${a.id}` ? ' lit' : ''}`} data-card={`ai:${a.id}`} style={{gridColumn: claimAt, gridRow: chain.rows.length + 2 + i}} aria-label="AI step">
      <span className="cc-ai-top"><Reveal label={`AI step, ${a.status === 'accepted' ? 'accepted' : 'not accepted yet'}`} detail={<><b>AI step · {a.status === 'accepted' ? 'accepted' : 'not accepted yet'}</b>
        <span className="rv-row">{short(a.when)}</span></>}><span className="ai-notice" aria-hidden="true">AI</span></Reveal>
        <b>{AI_MODULE[a.module] ?? a.module} draft quoted this claim</b></span>
      {a.run_id && <button type="button" className="cc-watch" onClick={() => onWatch(a.run_id!)}>Watch the run →</button>}
    </article>)}
    {aiShown.length < chain.ai.length && <button type="button" className={`cc-card cc-ai cc-ai-more${aiFolded(lit) ? ' lit' : ''}`} data-card="ai:more" style={{gridColumn: claimAt, gridRow: chain.rows.length + 2 + aiShown.length}}
      onClick={() => setAllAi(true)} aria-label={`Show ${chain.ai.length - aiShown.length} more AI steps that quoted this claim`}>
      <span className="ai-notice" aria-hidden="true">AI</span><b>+{chain.ai.length - aiShown.length} more AI drafts quoted this claim</b><small>Show them all</small>
    </button>}
    {!chain.rows.length && <p className="cc-muted" style={{gridColumn: `1 / ${claimAt}`, gridRow: 2}}>
      This claim has no evidence linked to it yet, so there is no chain to draw. Link a quote to it in Claims to make it traceable.</p>}
  </div>;
}

/** The Done checklist for Supported (server, app/services/claim_done.py): each rule met, not met, or not checkable
 * here, with what it waits on. Shape and word, never colour alone. */
function DoneList({done}: {done: ClaimDoneOut}): ReactElement {
  // The head is the name and one mark (✓ every checkable rule met); what is left stays in sight, an alert. The
  // summary in words is revealed on the name (Ony, 29 Oct), so the card keeps to the checks themselves.
  const summary = done.met ? `${done.unknown ? '✓ every checkable rule met' : '✓ every rule met'}${done.unknown ? ` · ○ ${done.unknown} not checkable here` : ''}`
    : `${done.left} left${done.unknown ? ` · ○ ${done.unknown} not checkable here` : ''}`;
  return <div className="cc-done" aria-label="Done for Supported">
    <p className="cc-done-head"><Reveal detail={<><b>Done for Supported</b><span className="rv-row">{summary}</span>
      <span className="rv-row">The rules a review to Supported is held to.</span></>}>Done for Supported</Reveal>
      {done.met ? <span className="ok" aria-hidden="true"> ✓</span> : <span className="bad"> · {done.left} left</span>}</p>
    {/* A publication gate: the rules stay; each rule's full wording and what it waits on are revealed on its name. */}
    <ul>{done.rules.map(r => <li key={r.key} className={`done-${r.state}`}
      aria-label={`${r.label}: ${DONE_STATE[r.state].word}. ${r.detail}`}>
      <span className="cc-done-mark" aria-hidden="true">{DONE_STATE[r.state].mark}</span>{' '}<Reveal detail={<><b>{r.label}</b>
        <span className="rv-row">{r.state === 'not_met' ? 'waits on: ' : ''}{r.detail}</span></>}>{DONE_SHORT[r.key] ?? r.label}</Reveal>
    </li>)}</ul>
  </div>;
}

function CardBox({card, row, column, picked, lit, falls, against, gone = false, anchor, onPick, onLight}: {
  card: CustodyCardOut; row: number; column: number; picked: boolean; lit: boolean; falls: boolean; against: boolean; gone?: boolean; anchor: {start: number; end: number} | null;
  onPick: () => void; onLight: (id: string | null) => void;
}): ReactElement {
  const id = useId();
  const shown = card.kind === 'passage' && card.text ? excerpt(card.text, unitSpan(card.text, anchor)) : null;
  // The column says what kind of step a card is; only a passage's page and lines, and a decision's title, are written.
  const head = card.kind === 'decision' ? (card.title === 'Answered' ? 'Linked against' : card.title)
    : card.kind === 'passage' ? `Passage${card.page ? ` · p.${card.page}` : ''}${lineSpan(card, 'l.')}` : '';
  // Who and when, and a file's or source's own lines, are revealed on the card (the log underneath has them all).
  const whoWhen = card.kind !== 'passage' && (card.when || card.kind !== 'source')
    ? `${card.kind === 'file' && card.who ? `uploaded by ${card.who} · ` : card.who ? `${card.who.charAt(0).toLowerCase()}${card.who.slice(1)} · ` : ''}${short(card.when)}` : '';
  const extra = card.kind === 'file' || card.kind === 'source' ? card.lines.filter(Boolean) : [];
  const detail = <><b>{KIND_WORD[card.kind]}</b>{extra.map((l, i) => <span key={i} className="rv-row rv-mono">{l}</span>)}{whoWhen && <span className="rv-row">{whoWhen}</span>}</>;
  return <button type="button" data-card={card.id} className={`cc-card k-${card.kind} a-${card.actor}${picked ? ' picked' : ''}${lit ? ' lit' : ''}${falls ? ' falls' : ''}${against ? ' against' : ''}${gone ? ' gone' : ''}`}
    style={{gridColumn: column, gridRow: row, '--col': COL[card.kind]} as CSSProperties} onClick={onPick} onMouseEnter={() => onLight(card.id)} onMouseLeave={() => onLight(null)}
    aria-label={`${KIND_WORD[card.kind]}: ${card.title}. ${card.checks.map(c => `${c.label} ${c.ok === true ? 'passed' : c.ok === false ? 'failed' : 'not known'}`).join(', ')}`}
    aria-describedby={extra.length || whoWhen ? `${id}-who` : undefined}>
    {(extra.length > 0 || whoWhen) && <span id={`${id}-who`} hidden>{[...extra, whoWhen].filter(Boolean).join(' · ')}</span>}
    <Reveal tabbable={false} describe={false} className="cc-card-rv" detail={detail}>
    {card.kind === 'file' && <span className="cc-thumb" aria-hidden="true"><i/><i/><i/><i/></span>}
    <span className="cc-card-top">{head ? <span className="cc-kind">{head}</span> : <span/>}{card.checks.map(c => <Check key={c.label} {...c}/>)}</span>
    {card.kind === 'passage' ? (shown ? <span className="cc-text"><Lit text={shown.text} quote={card.quote} span={shown.span}/></span> : <b>{card.title}</b>)
      : card.kind === 'reading' ? <b>{card.title}{card.lines[0] ? `, ${card.lines[0]}` : ''}</b>
      : card.kind === 'decision' ? <b>{card.title === 'Answered' ? `Answer: ${card.lines[0]}` : card.title === 'Quote saved' ? `Typed in by ${card.who ?? 'a person'}` : card.lines[0]}</b>
      : <b className={card.kind === 'file' ? 'cc-file' : undefined}>{card.title}</b>}
    {card.quote && card.kind === 'source' && <span className="cc-text">“{card.quote}”</span>}
    {card.kind === 'decision' && card.title === 'Proposed' && card.lines[1] && <small className={card.lines[1].startsWith('accepted') ? 'cc-ok' : ''}>{card.lines[1].startsWith('accepted') ? `✓ ${card.lines[1].replace(/^a/, 'A')}` : card.lines[1]}</small>}
    </Reveal>
  </button>;
}

function Detail({card, chain, onOpen, recheck, breaks, onBreaks}: {
  card: CustodyCardOut; chain: CustodyChainOut; onOpen: (documentId: string, page: number | null) => void;
  recheck: {run: () => void; result: boolean | null | undefined; pending: boolean; error: string | null} | null; breaks: boolean; onBreaks: () => void;
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
    {/* The file and the lines are revealed on the title. */}
    <h3>{file ? <Reveal detail={<span className="rv-mono">{file.title}{passage && lineSpan(passage, 'lines') ? ` ·${lineSpan(passage, 'lines')}` : passage?.page ? ` · page ${passage.page}` : ''}</span>}>{title}</Reveal> : title}</h3>
    {(passage?.text || card.quote) && <blockquote><Lit text={passage?.text ?? card.quote ?? ''} quote={card.quote ?? passage?.quote}
      span={passage?.text ? unitSpan(passage.text, spanOf(row?.anchor)) : null}/></blockquote>}
    <dl>
      {/* The source's type is its icon and its issuer is revealed; the tier letter and "interested party?" show. */}
      {src && item('Source', <span className="cc-checks plain">
        <Reveal label={SOURCE_WORD[src.source_type] ?? src.source_type} detail={<b>{SOURCE_WORD[src.source_type] ?? src.source_type}</b>}>
          <span className="cc-src"><SourceIcon type={src.source_type}/></span></Reveal>
        {src.tier ? <Check label={`Tier ${src.tier}`} ok={true}/> : <Check label="tier not set" ok={null}/>}
        {src.issuer ? <Reveal detail={`by ${src.issuer}`}><Check label="issuer" ok={true}/></Reveal> : <Check label="interested party?" ok={null}/>}</span>)}
      {file && item('File', <span className="cc-checks plain">{chip(hash?.ok, hash?.ok ? 'hash matches' : hash?.ok === false ? 'hash differs' : 'hash not checked')}
        {reading && reading.checks[0]?.label === 'OCR' ? <Check label="read by OCR" ok={true}/> : reading ? chip(reading.checks[0]?.ok, 'text layer') : null}</span>)}
      {passage && item('Content', <span className="cc-checks plain">{chip(says?.ok, says?.ok ? 'says it · exact' : says?.ok === false ? 'does not say it' : 'not checked')}</span>)}
      {row?.anchor && item('Anchor', <AnchorMark a={row.anchor}/>)}
      {/* The hash is revealed on its result; a failed or impossible re-check is an alert and shows. */}
      {sha && item('SHA-256', recheck?.error
        ? <span><span role="alert">✕ could not re-check: {recheck.error}</span> <Reveal detail={<span className="rv-mono">{sha}</span>}><span className="cc-mono">hash</span></Reveal></span>
        : <Reveal detail={<span className="rv-mono">{sha}</span>}><span>{recheck?.result !== undefined ? (recheck.result ? '✓ re-checked now' : '✕ does not match the file now')
          : hash?.ok ? '✓ re-checked when opened' : <span className="cc-mono">hash</span>}</span></Reveal>)}
      {decision && item('Decided', <Reveal detail={short(decision.when)}>{decision.title === 'Proposed' ? decision.lines.join(' · ') : decision.title === 'Answered' ? `Answered by ${decision.who ?? 'a person'}: ${decision.lines[0]}` : `Typed in by ${decision.who ?? 'a person'}`}</Reveal>)}
      {row && item('Rests on it', rests.length ? <span className="cc-checks">
        {(['claim', 'link'] as const).map(k => { const c = rests.filter(r => r.kind === k).length; return c ? <span key={k} className="cc-rest">{c} {k}{c === 1 ? '' : 's'}</span> : null; })}
        {rests.filter(r => r.kind === 'flag').map(f => <span key={f.id} className="cc-rest">{f.label} {isLevel(f.level) && <LevelChip level={f.level} focusable/>}</span>)}</span> : 'nothing else yet')}
    </dl>
    {breaks && row && <div className="cc-breaks" role="status"><b>If this step breaks</b>, everything after it in this row falls, and with it:
      <ul>{rests.map(r => <li key={r.id}>{r.kind === 'claim' ? 'Claim' : r.kind === 'link' ? 'Link' : 'Flag'}: {r.label}</li>)}</ul></div>}
    {/* The line key, drawn (mockup CHECK_2): each line style beside what it means. */}
    <div className="cc-key-box" aria-label="Key to the lines" role="group">
      <p className="cc-eyebrow">Key</p>
      <span className="cc-key">
        <span className="cc-k-confirmed">confirmed by a person</span><span className="cc-k-proposed">proposed, not yet confirmed</span>
        <span className="cc-k-worked">worked out by the app</span><span className="cc-k-against">against the claim · ✕ check failed</span><span className="cc-k-ai">AI step</span>
      </span></div>
    <div className="cc-acts">
      {file?.document_id && <button type="button" className="primary" onClick={() => onOpen(file.document_id!, passage?.page ?? null)}>
        {passage?.page ? `Open page ${passage.page}` : 'Open the file'}</button>}
      {recheck && <button type="button" onClick={recheck.run} disabled={recheck.pending}>{recheck.pending ? 'Checking…' : 'Re-check hash'}</button>}
      <button type="button" aria-pressed={breaks} onClick={onBreaks}>What if this breaks?</button>
    </div>
  </aside>;
}

/** "l.14–22" on a passage card, "lines 14–22" in the detail: the passage's lines, as read, that the quote spans. */
function lineSpan(card: CustodyCardOut, word: string): string {
  if (card.line_start == null) return '';
  // Joined so the span never breaks across lines ("l.14–22", not "l.14–" then "22").
  return ` ${word}${word.endsWith('.') ? '' : '\u00a0'}${card.line_start}${card.line_end != null && card.line_end !== card.line_start ? `\u2060–\u2060${card.line_end}` : ''}`;
}

const MATCH_WORD: Record<string, string> = {exact: 'exact quote', case: 'same words, different case', spacing: 'same words, different spacing'};

/** The anchor as a mark (✓ anchored, ↪ moved, ✕ lost) with its words revealed; a lost quote is an alert and shows. */
function AnchorMark({a}: {a: CustodyAnchorOut}): ReactElement {
  const lost = a.start == null || a.end == null;
  const moved = a.state === 'moved';
  const mark = lost ? '✕' : moved ? '↪' : '✓';
  const word = lost ? 'Not found' : moved ? 'Moved' : 'Anchored';
  if (lost) return <span className="cc-anchor bad" role="status"><span aria-hidden="true">{mark}</span> {anchorWords(a)}</span>;
  return <Reveal detail={<><b>{word}</b><span className="rv-row">{anchorWords(a)}</span></>}>
    <span className={`cc-anchor ${moved ? 'warn' : 'ok'}`}><span aria-hidden="true">{mark}</span> {word}</span></Reveal>;
}

/** The stored anchor as found now (ADR-0015): how the words matched, the text kept either side, the offsets, and
 * what happened to it since it was stored. */
function anchorWords(a: CustodyAnchorOut): string {
  if (a.start == null || a.end == null) {
    return a.state === 'lost' ? `the quote is no longer in the text of this passage${a.anchored_at ? ` (anchored ${short(a.anchored_at)})` : ''}` : 'the quote is not in this passage';
  }
  const around = a.before === a.after ? `${a.before} characters before and after` : `${a.before} characters before, ${a.after} after`;
  const where = `${MATCH_WORD[a.match ?? 'exact'] ?? 'quote'} + ${around}, offsets ${a.start}–${a.end}${(a.occurrences ?? 1) > 1 ? ` · 1 of ${a.occurrences} places` : ''}`;
  return a.state === 'moved' ? `${where} · moved since it was anchored (the document was read again)`
    : a.state === 'not anchored' ? `${where} · found now: saved before anchors were kept` : where;
}

const isLevel = (l: string | null | undefined): l is FlagLevel => l === 'faint' || l === 'strong' || l === 'textbook';

function LogList({log}: {log: CustodyLogOut[]}): ReactElement {
  return <ol className="cc-list" aria-label="The chain as a list">
    {log.map((e, i) => <li key={i}><span className="cc-mono">{short(e.when)}</span> · {whoWord(e.who)}: {e.what}</li>)}
  </ol>;
}
