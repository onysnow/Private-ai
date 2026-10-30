'use client';
// The mapping the app proposes for a table when it arrives (backend app/services/table_proposals.py; DECISIONS_LOG 39).
// The machine proposes, a person decides: "Looks like payments", each column's role as a chip whose strength is how
// sure the app is (the number and the reason on hover), the first row as it would be read, and one action to accept
// it. Edit changes which column is which (and how numbers and dates are written); Dismiss stops offering it. Accepting
// runs the column mapping, so every party and payment arrives as a proposal to review, as with a mapping made by hand.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import type {ChangeEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {
  acceptTableProposalMutation, dismissTableProposalMutation, getTableProposalOptions, getTableProposalQueryKey,
} from '../../lib/generated/@tanstack/react-query.gen';
import type {ProposalRoleOut, ProposedRowOut, TableProposalOut, TableProposalViewOut} from '../../lib/generated/types.gen';
import {timeWords} from '../../lib/timestamps';

const SCHEMA_WORDS: Record<string, string> = {Person: 'people', Company: 'companies', LegalEntity: 'people or companies',
  Organization: 'organisations', PublicBody: 'public bodies'};

/** What the proposal says the table is, as its title: "Looks like payments", "Looks like a list of companies". */
export function proposalTitle(p: Pick<TableProposalOut, 'kind' | 'schema' | 'shape'>): string {
  if (p.kind === 'payments') return p.shape === 'statement' ? "Looks like one account's payments" : 'Looks like payments';
  return `Looks like a list of ${SCHEMA_WORDS[p.schema ?? 'LegalEntity'] ?? 'people or companies'}`;
}

/** How sure the app is, in three steps a chip shows by its strength. */
export function sureness(confidence: number | null | undefined): 'high' | 'mid' | 'low' | 'person' {
  if (confidence === null || confidence === undefined) return 'person';
  return confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'mid' : 'low';
}

const amountWords = (amount?: string | null): string => {
  if (!amount) return '';
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString('en-GB', {maximumFractionDigits: 2}) : amount;
};

/** The first row as the proposal reads it: "30,000,000 USD · 1MDB → Good Star Limited · 2011-05-20". */
export function sampleLine(row: ProposedRowOut, kind: TableProposalOut['kind'], holder: string): string {
  if (kind === 'parties') return row.name ?? '';
  const payer = row.payer || holder || 'the account holder';
  const payee = row.payee || holder || 'the account holder';
  const money = [amountWords(row.amount), row.currency].filter(Boolean).join(' ');
  return [money, `${payer} → ${payee}`, row.date].filter(Boolean).join(' · ');
}

/** What accepting made: "3 parties and 3 payments to review; 1 row left out". */
export function madeWords(kind: TableProposalOut['kind'], entities: number, links: number, skipped: number): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const made = kind === 'payments'
    ? `${plural(entities, 'party', 'parties')} and ${plural(links, 'payment', 'payments')} to review`
    : `${plural(entities, 'record', 'records')} to review`;
  return skipped ? `${made}; ${plural(skipped, 'value or row', 'values or rows')} left out` : made;
}

export function TableProposal({documentId, onAccepted}: {documentId: string; onAccepted?: () => void}): ReactElement | null {
  const queryClient = useQueryClient();
  const options = getTableProposalOptions({path: {document_id: documentId}});
  const view = useQuery({...options, retry: false});
  const accepting = useMutation({...acceptTableProposalMutation()});
  const dismissing = useMutation({...dismissTableProposalMutation()});
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<Record<string, string | null> | null>(null);
  const [holder, setHolder] = useState<string | null>(null);
  const [decimal, setDecimal] = useState<'.' | ',' | null>(null);
  const [dateOrder, setDateOrder] = useState<'DMY' | 'MDY' | null>(null);
  const [status, setStatus] = useState('');

  const data: TableProposalViewOut | undefined = view.data;
  if (!data || !data.proposal) return null;
  const p = data.proposal;
  const decided = data.decision;
  if (data.status === 'accepted' && decided) {
    return <p className="tp-done" aria-label="Mapping proposal">
      <Reveal detail={<>Accepted{decided.decided_by ? ` by ${decided.decided_by}` : ''}, {timeWords(decided.decided_at)}{decided.changed ? ', changed first' : ''}.
        <span className="rv-row">What it made waits in the file's proposals.</span></>}>
        <span><i aria-hidden="true">✓</i> {p.kind === 'payments' ? 'Payments mapped' : 'List mapped'}</span></Reveal>
      {status && <span role="status" className="tp-quiet"> {status}</span>}
    </p>;
  }
  if (data.status === 'dismissed' && decided) {
    return <p className="tp-done tp-quiet" aria-label="Mapping proposal">
      <Reveal detail={`${proposalTitle(p)}: dismissed${decided.decided_by ? ` by ${decided.decided_by}` : ''}, ${timeWords(decided.decided_at)}. Map it by hand with Map columns to entities.`}>
        <span>Mapping proposal dismissed</span></Reveal></p>;
  }
  if (data.status !== 'proposed') return null;

  const roleOf = (column: string, proposed: string | null | undefined): string | null => (roles && column in roles ? roles[column] : proposed ?? null);
  const shownHolder = holder ?? p.account_holder ?? '';
  const statement = p.kind === 'payments' && p.shape === 'statement';
  const holderColumn = p.columns.some(c => roleOf(c.column, c.role) === 'holder');
  const needsHolder = statement && !holderColumn && !shownHolder.trim();
  const mapped = p.columns.filter(c => roleOf(c.column, c.role));
  const leftOut = p.columns.filter(c => !roleOf(c.column, c.role));
  const labelOf = (role: string): string => data.roles.find((r: ProposalRoleOut) => r.role === role)?.label ?? role;
  const first = p.sample[0];

  const refresh = () => queryClient.invalidateQueries({queryKey: getTableProposalQueryKey({path: {document_id: documentId}})});
  const accept = async () => {
    setStatus('');
    try {
      const reply = await accepting.mutateAsync({path: {document_id: documentId}, body: {
        sheet: p.sheet,
        ...(roles ? {columns: p.columns.map(c => ({column: c.column, role: roleOf(c.column, c.role)}))} : {}),
        ...(shownHolder.trim() && shownHolder !== (p.account_holder ?? '') ? {account_holder: shownHolder.trim()} : {}),
        ...(decimal ? {decimal} : {}), ...(dateOrder ? {date_order: dateOrder} : {}),
      }});
      setStatus(madeWords(p.kind, reply.run.entities_proposed, reply.run.links_proposed, reply.run.skipped.length));
      setEditing(false);
      await refresh();
      onAccepted?.();
    } catch (error) { setStatus(errorMessage(error, 'Could not accept the proposal')); }
  };
  const dismiss = async () => {
    setStatus('');
    try {
      await dismissing.mutateAsync({path: {document_id: documentId}, body: {sheet: p.sheet}});
      await refresh();
    } catch (error) { setStatus(errorMessage(error, 'Could not dismiss the proposal')); }
  };

  return <section className="tp" aria-label="Mapping proposal">
    <p className="tp-title"><Reveal detail={<>The app read the header and the first rows{p.sheet ? ` of the sheet “${p.sheet}”` : ''}.
      {p.confidence !== null && p.confidence !== undefined ? <span className="rv-row">How sure: {Math.round(p.confidence * 100)}%</span> : null}
      <span className="rv-row">Nothing is made until you accept; then each party and payment is a proposal to review.</span></>}>
      <b>{proposalTitle(p)}</b></Reveal></p>

    {!editing && <ul className="tp-cols" aria-label="Which column is which">
      {mapped.map(c => <li key={c.column} className={`tp-chip tp-${sureness(c.confidence)}`}>
        <Reveal detail={<>{c.confidence !== null && c.confidence !== undefined ? <b>{Math.round(c.confidence * 100)}% sure</b> : <b>Chosen by you</b>}
          {c.why ? <span className="rv-row">{c.why}</span> : null}</>}>
          <span>{c.column} <i aria-hidden="true">→</i> {labelOf(roleOf(c.column, c.role) ?? '')}</span></Reveal>
      </li>)}
      {leftOut.length > 0 && <li className="tp-chip tp-out"><Reveal detail={<>Left out (kept in each row's evidence): {leftOut.map(c => c.column).join(', ')}</>}>
        <span>+{leftOut.length} left out</span></Reveal></li>}
    </ul>}

    {editing && <div className="tp-edit" role="group" aria-label="Change which column is which">
      {p.columns.map(c => <label key={c.column}><span>{c.column}</span>
        <select aria-label={`${c.column}: what it is`} value={roleOf(c.column, c.role) ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setRoles(cur => ({...(cur ?? {}), [c.column]: e.target.value || null}))}>
          <option value="">left out</option>
          {data.roles.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}
        </select></label>)}
      {p.kind === 'payments' && <>
        <label><span>Numbers</span><select aria-label="How numbers are written" value={decimal ?? p.decimal}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setDecimal(e.target.value as '.' | ',')}>
          <option value=".">1,234.56</option><option value=",">1.234,56</option></select></label>
        <label><span>Dates</span><select aria-label="How dates are written" value={dateOrder ?? p.date_order}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setDateOrder(e.target.value as 'DMY' | 'MDY')}>
          <option value="DMY">day first (31/01)</option><option value="MDY">month first (01/31)</option></select></label>
      </>}
    </div>}

    {statement && !holderColumn && <label className={`tp-holder${needsHolder ? ' tp-need' : ''}`}><span>Whose account?</span>
      <input aria-label="Account holder" placeholder="The account holder's name" value={shownHolder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setHolder(e.target.value)}/></label>}

    {first && !editing && <p className="tp-sample"><Reveal detail={<>{p.sample.map(row => <span key={row.number} className="rv-row">Row {row.number}: {sampleLine(row, p.kind, shownHolder)}
      {row.problems.length ? ` (${row.problems.join('; ')})` : ''}</span>)}</>}>
      <span><small>Row {first.number}</small> {sampleLine(first, p.kind, shownHolder)}</span></Reveal></p>}

    <div className="tp-acts">
      <button type="button" className="p" onClick={() => void accept()} disabled={needsHolder || accepting.isPending}>
        {accepting.isPending ? 'Accepting…' : 'Accept'}</button>
      <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
      <button type="button" onClick={() => void dismiss()} disabled={dismissing.isPending}>Dismiss</button>
    </div>
    {status && <p role="status" className="tp-quiet">{status}</p>}
  </section>;
}
