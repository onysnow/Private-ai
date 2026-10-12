'use client';
// Check › Chain of Custody (mockup CHECK_2, research §3.11): "How this fact got here", read left to right from the
// file to the sentence. One row per piece of evidence (for, then against); each card is a custodian step with
// who acted, when and its check; the lines between them carry what was done in the status grammar's line
// styles (solid confirmed by a person, dashed proposed, dotted worked out by the app, red against the claim,
// plum an AI step). The seal at the top can be pasted into a write-up's methods note. A detail panel on the
// right shows the chosen card in full, with Re-check hash; the custody log along the bottom is the same history
// as a dated list, exportable for an editor or a lawyer. Keys: L shows the log as a plain list, Esc back to the claim.
import {useMutation, useQuery} from '@tanstack/react-query';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {StatusChip, type ClaimStatus} from '../../components/status';
import {errorMessage} from '../../lib/api-client';
import {getClaimCustodyChainOptions, listClaimsOptions, recheckHashMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {CustodyCardOut, CustodyChainOut, CustodyLogOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

const COLUMNS = ['Files', 'Reading', 'Passage', 'Decision', 'The claim'] as const;
const COL: Record<CustodyCardOut['kind'], number> = {file: 0, source: 0, reading: 1, passage: 2, decision: 3};
const KIND_WORD: Record<CustodyCardOut['kind'], string> = {file: 'File', source: 'Source', reading: 'Reading', passage: 'Passage', decision: 'Decision'};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (iso?: string | null) => {
  if (!iso) return 'not recorded';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const STATUS: Record<string, ClaimStatus> = {supported: 'supported', disputed: 'disputed', rejected: 'ruled_out', ruled_out: 'ruled_out'};

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
  const mark = ok === true ? '✓' : ok === false ? '✕' : '?';
  return <span className={`cc-check ${ok === true ? 'ok' : ok === false ? 'bad' : 'unknown'}`}><span aria-hidden="true">{mark}</span> {label}</span>;
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
  const [asList, setAsList] = useState(false);
  const [copied, setCopied] = useState('');
  const recheck = useMutation({...recheckHashMutation()});
  const cards = useMemo(() => chain?.rows.flatMap(r => r.cards) ?? [], [chain]);
  const card = cards.find(c => c.id === picked) ?? cards.find(c => c.kind === 'passage') ?? cards[0];
  /** The file behind a step: any step in a row with a file can re-check it. */
  const fileOf = (c: CustodyCardOut) => chain?.rows.find(r => r.cards.some(x => x.id === c.id))?.cards.find(x => x.kind === 'file')?.document_id ?? null;
  useEffect(() => { setPicked(null); recheck.reset(); }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setAsList(v => !v); }
      else if (e.key === 'Escape' && chosen) openClaim(chosen);
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

  return <section className="cc" aria-label="Chain of Custody">
    <header className="cc-head">
      <div>
        <h2>How this fact got here</h2>
        {chain && <p className="cc-seal" aria-label="The custody seal"><span>{sealLine(chain)}</span>
          <button type="button" onClick={() => void copySeal()}>{copied || 'Copy for the methods note'}</button></p>}
      </div>
      <div className="cc-tools">
        {(claims.data?.length ?? 0) > 0 && <label className="cc-pick">Claim
          <select value={chosen} onChange={e => setClaimId(e.target.value)} aria-label="Which claim">
            {claims.data!.map(c => <option key={c.id} value={c.id}>{c.text.length > 70 ? `${c.text.slice(0, 70)}…` : c.text}</option>)}
          </select></label>}
        <button type="button" className="cc-btn" aria-pressed={asList} onClick={() => setAsList(v => !v)}><kbd>L</kbd> log as list</button>
        {chosen && <button type="button" className="cc-btn" onClick={() => openClaim(chosen)}><kbd>Esc</kbd> back to the claim</button>}
      </div>
    </header>
    {status && <p className="cc-muted">{status}</p>}
    {chain && <div className="cc-body">
      <div className="cc-main">
        {asList ? <LogList log={chain.log}/> : <Wires chain={chain} picked={card?.id ?? null} lit={lit} onPick={setPicked} onLight={setLit}/>}
        <section className="cc-log" aria-label="Custody log">
          <header><h3>Custody log <small>who held it · what was done · when</small></h3>
            <button type="button" onClick={exportLog}>Export for an editor or lawyer</button></header>
          <table>
            <tbody>{chain.log.map((e, i) => <tr key={i} className={`${lit === e.card ? 'lit' : ''} actor-${e.actor}`}
              onMouseEnter={() => setLit(e.card)} onMouseLeave={() => setLit(null)} onClick={() => e.card.includes(':') && setPicked(e.card)}>
              <td className="cc-mono">{when(e.when)}</td><td>{e.who}</td><td>{e.what}</td>
            </tr>)}</tbody>
          </table>
        </section>
      </div>
      {card && <Detail card={card} chain={chain} onOpen={(doc, page) => openDocument(doc, page)}
        recheck={fileOf(card) ? {
          run: () => recheck.mutate({path: {document_id: fileOf(card)!}}),
          result: recheck.data && recheck.data.document_id === fileOf(card) ? recheck.data.matches : undefined,
          pending: recheck.isPending,
        } : null}/>}
    </div>}
  </section>;
}

function Wires({chain, picked, lit, onPick, onLight}: {
  chain: CustodyChainOut; picked: string | null; lit: string | null; onPick: (id: string) => void; onLight: (id: string | null) => void;
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
        row.cards.forEach((c, i) => {
          const a = rect(c.id);
          const next = row.cards[i + 1];
          const b = next ? rect(next.id) : claim;
          if (!a || !b) return;
          const x1 = a.right - r0.left; const y1 = a.top + a.height / 2 - r0.top;
          const x2 = b.left - r0.left; const y2 = next ? b.top + b.height / 2 - r0.top : Math.min(Math.max(y1, b.top - r0.top + 24), b.bottom - r0.top - 24);
          const mx = (x1 + x2) / 2;
          out.push({key: `${c.id}>${next?.id ?? 'claim'}`, d: `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`, style: c.wire.style, words: c.wire.words,
            x: mx, y: (y1 + y2) / 2 - 5});
        });
      }
      setLines(out);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(host);
    return () => ro?.disconnect();
  }, [chain]);
  const claimStatus = STATUS[chain.claim.status] ?? 'unshown';
  return <div className="cc-wires" ref={box}>
    <svg className="cc-lines" aria-hidden="true">
      {lines.map(l => <g key={l.key} className={`cc-wire w-${l.style}${lit && l.key.startsWith(lit) ? ' lit' : ''}`}>
        <path d={l.d}/>{l.words && <text x={l.x} y={l.y} textAnchor="middle">{l.words}</text>}</g>)}
    </svg>
    {COLUMNS.map((c, i) => <p key={c} className="cc-col" style={{gridColumn: i + 1}}>{c.toUpperCase()}</p>)}
    {chain.rows.map((row, r) => row.cards.map(c => <CardBox key={c.id} card={c} row={r + 2} picked={picked === c.id} lit={lit === c.id}
      against={row.stance === 'contradicts'} onPick={() => onPick(c.id)} onLight={onLight}/>))}
    <article className={`cc-card cc-claim st-${claimStatus}`} data-card="claim" style={{gridColumn: 5, gridRow: `2 / span ${Math.max(1, chain.rows.length)}`}}
      aria-label={`The claim: ${chain.claim.text}`}>
      <StatusChip status={claimStatus}/>
      <b>{chain.claim.text}</b>
      <ul>
        <li>✓ {chain.seal.sources_for} source{chain.seal.sources_for === 1 ? '' : 's'} for it</li>
        <li>{chain.seal.hashes_checked === 0 ? '○ no file to hash' : chain.seal.hashes_intact ? '✓ hashes intact' : '✕ a hash does not match'}</li>
        <li>{chain.seal.against ? `✕ ${chain.seal.against} against` : '✓ nothing against it yet'}</li>
        <li>{chain.seal.ai_uses ? `◇ used by AI ${chain.seal.ai_uses}×` : '✓ not AI-only'}</li>
      </ul>
    </article>
    {chain.ai.map((a, i) => <article key={a.id} className="cc-card cc-ai" style={{gridColumn: 5, gridRow: chain.rows.length + 2 + i}} aria-label="AI step">
      <span className="cc-kind">AI</span><b>{a.module} draft quoted this claim</b><small>{when(a.when)} · {a.status === 'accepted' ? 'accepted' : 'not accepted yet'}</small>
    </article>)}
    {!chain.rows.length && <p className="cc-muted" style={{gridColumn: '1 / 5', gridRow: 2}}>
      This claim has no evidence linked to it yet, so there is no chain to draw. Link a quote to it in Claims to make it traceable.</p>}
  </div>;
}

function CardBox({card, row, picked, lit, against, onPick, onLight}: {
  card: CustodyCardOut; row: number; picked: boolean; lit: boolean; against: boolean; onPick: () => void; onLight: (id: string | null) => void;
}): ReactElement {
  return <button type="button" data-card={card.id} className={`cc-card k-${card.kind} a-${card.actor}${picked ? ' picked' : ''}${lit ? ' lit' : ''}${against ? ' against' : ''}`}
    style={{gridColumn: COL[card.kind] + 1, gridRow: row}} onClick={onPick} onMouseEnter={() => onLight(card.id)} onMouseLeave={() => onLight(null)}
    aria-label={`${KIND_WORD[card.kind]}: ${card.title}. ${card.checks.map(c => `${c.label} ${c.ok === true ? 'passed' : c.ok === false ? 'failed' : 'not known'}`).join(', ')}`}>
    <span className="cc-card-top"><span className="cc-kind">{KIND_WORD[card.kind]}</span>{card.checks.map(c => <Check key={c.label} {...c}/>)}</span>
    {card.kind === 'file' && <span className="cc-thumb" aria-hidden="true"><i/><i/><i/></span>}
    <b>{card.title}</b>
    {card.kind === 'passage' && card.text ? <span className="cc-text"><Lit text={card.text.length > 160 ? `${card.text.slice(0, 160)}…` : card.text} quote={card.quote}/></span>
      : card.quote && card.kind === 'source' ? <span className="cc-text">“{card.quote}”</span> : null}
    {card.lines.map((l, i) => <small key={i}>{l}</small>)}
    <small className="cc-when">{card.who ? `${card.who} · ` : ''}{when(card.when)}</small>
  </button>;
}

function Detail({card, chain, onOpen, recheck}: {
  card: CustodyCardOut; chain: CustodyChainOut; onOpen: (documentId: string, page: number | null) => void;
  recheck: {run: () => void; result: boolean | null | undefined; pending: boolean} | null;
}): ReactElement {
  const row = chain.rows.find(r => r.cards.some(c => c.id === card.id));
  const all = row?.cards ?? [card];
  const n = all.findIndex(c => c.id === card.id) + 1;
  const file = all.find(c => c.kind === 'file');
  const passage = all.find(c => c.kind === 'passage');
  const item = (label: string, body: ReactNode) => <div><dt>{label}</dt><dd>{body}</dd></div>;
  return <aside className="cc-detail" aria-label={`Step ${n} of ${all.length}: ${KIND_WORD[card.kind]}`}>
    <p className="cc-eyebrow">Step {n} of {all.length} · {KIND_WORD[card.kind]}</p>
    <h3>{card.title}</h3>
    {file && <p className="cc-mono cc-muted">{file.title}{passage?.page ? ` · page ${passage.page}` : ''}</p>}
    {(passage?.text || card.quote) && <blockquote><Lit text={passage?.text ?? card.quote ?? ''} quote={card.quote ?? passage?.quote}/></blockquote>}
    <dl>
      {item('Checks', all.some(c => c.checks.length)
        ? <span className="cc-checks">{all.flatMap(c => c.checks).map(c => <Check key={c.label} {...c}/>)}</span>
        : 'none: no file in the case to check it against')}
      {file?.sha256 && item('SHA-256', <span className="cc-mono">{file.sha256.slice(0, 8)}…{file.sha256.slice(-4)}
        {recheck?.result !== undefined && <> · {recheck.result ? '✓ re-checked now' : '✕ does not match the file now'}</>}</span>)}
      {item('Decided', all.find(c => c.kind === 'decision')?.lines.join(' · ') ?? '—')}
      {item('Who · when', `${card.who ?? 'not recorded'} · ${when(card.when)}`)}
      {item('Stance', row?.stance === 'contradicts' ? '✕ against the claim' : '✓ for the claim')}
    </dl>
    <div className="cc-acts">
      {file?.document_id && <button type="button" className="primary" onClick={() => onOpen(file.document_id!, passage?.page ?? null)}>
        {passage?.page ? `Open page ${passage.page}` : 'Open the file'}</button>}
      {recheck && <button type="button" onClick={recheck.run} disabled={recheck.pending}>{recheck.pending ? 'Checking…' : 'Re-check hash'}</button>}
      <button type="button" disabled title="Not built yet: showing what rests on this step (claims, flags, chart points)">What if this breaks?</button>
    </div>
  </aside>;
}

function LogList({log}: {log: CustodyLogOut[]}): ReactElement {
  return <ol className="cc-list" aria-label="The chain as a list">
    {log.map((e, i) => <li key={i}><span className="cc-mono">{when(e.when)}</span> · {e.who}: {e.what}</li>)}
  </ol>;
}
