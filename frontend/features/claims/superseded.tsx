'use client';
// A claim's evidence marked superseded by a newer record (backend app/services/claims.py supersede_claim_evidence):
// a later judgment replaces an indictment's figure, a corrected filing replaces the first. The link stays, struck and
// faded, with the stance it had; it no longer counts toward the claim. What replaced it, why, who marked it and when
// are revealed on the struck quote. The form asks for the reason (required) and the record that replaces it, offered
// from the claim's own evidence first, then the rest of the case; "not in the case yet" is a choice.
import {useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import type {ClaimEvidenceRowOut, ClaimEvidenceSupersededOut, EvidencePoolRow} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';

/** How many records from the rest of the case the "replaced by" choice offers. */
export const REPLACEMENT_CHOICES = 40;

/** What a superseded mark reveals: what replaced it (or that it is not in the case), why, who and when. */
export function supersededDetail(mark: ClaimEvidenceSupersededOut): ReactNode {
  const by = mark.by_label ? `${mark.by_label}${mark.by_locator ? `, ${mark.by_locator}` : ''}` : null;
  return <>
    <b>Superseded{by ? ` by ${by}` : ''}</b>
    {!by && <span className="rv-row">The record that replaces it is not in the case.</span>}
    <span className="rv-row">{mark.reason}</span>
    <span className="rv-row">Marked by {mark.decided_by_name || 'a person'} · {apiTime(mark.at).toLocaleDateString()}</span>
    <span className="rv-row">Shown, not counted toward the claim.</span>
  </>;
}

const quoteOf = (q?: string | null, notes?: string | null): string => {
  const text = (q || notes || 'Evidence record').trim();
  return text.length > 70 ? `${text.slice(0, 69)}…` : text;
};

type Props = {
  row: ClaimEvidenceRowOut;
  /** The claim's other linked evidence: offered first as what replaces it. */
  linked: ClaimEvidenceRowOut[];
  /** The case's evidence, most like the claim first. */
  pool: EvidencePoolRow[];
  busy: boolean;
  onSave: (reason: string, byEvidenceId: string | null) => void;
  onCancel: () => void;
};

export function SupersedeForm({row, linked, pool, busy, onSave, onCancel}: Props): ReactElement {
  const mark = row.superseded;
  const [reason, setReason] = useState(mark?.reason ?? '');
  const [by, setBy] = useState(mark?.by_evidence_id ?? '');
  const own = row.evidence?.id;
  const mine = linked.filter(r => r.evidence && r.evidence.id !== own && !r.superseded);
  const mineIds = new Set(mine.map(r => r.evidence?.id));
  const rest = pool.filter(r => r.evidence.id !== own && !mineIds.has(r.evidence.id)).slice(0, REPLACEMENT_CHOICES);
  const save = () => { if (reason.trim()) onSave(reason.trim(), by || null); };
  return <form className="cl-sup-form" aria-label="Mark superseded" onSubmit={e => { e.preventDefault(); save(); }}>
    <label className="cl-sup-field"><span>Replaced by</span>
      <select value={by} onChange={e => setBy(e.target.value)}>
        <option value="">Not in the case yet</option>
        {mine.length > 0 && <optgroup label="Linked to this claim">
          {mine.map(r => <option key={r.id} value={r.evidence!.id}>{r.source?.title ?? 'Typed in'} · {quoteOf(r.evidence?.quote, r.evidence?.notes)}</option>)}</optgroup>}
        {rest.length > 0 && <optgroup label="Elsewhere in the case">
          {rest.map(r => <option key={r.evidence.id} value={r.evidence.id}>{r.source.title} · {quoteOf(r.evidence.quote, r.evidence.notes)}</option>)}</optgroup>}
      </select></label>
    <label className="cl-sup-field grow"><span>Why</span>
      <input value={reason} onChange={e => setReason(e.target.value)} required autoFocus
        placeholder="e.g. The 2020 judgment corrected the figure"/></label>
    <div className="cl-sup-acts">
      <button type="submit" className="cw-btn on" disabled={busy || !reason.trim()}>{mark ? 'Save' : 'Mark superseded'}</button>
      <button type="button" className="cw-btn" onClick={onCancel}>Cancel</button>
    </div>
  </form>;
}
