'use client';
// After a merge, statements and edges that say the same thing twice are
// shown as pairs for the reporter to review. Nothing is deleted: a
// "duplicate" decision only names which record the compact views prefer.
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import type {PostMergeReconciliationOut} from '../../lib/generated/types.gen';

export type ReconciliationRecordType = 'statement' | 'relationship';
export type ReconciliationDecision = 'duplicate' | 'keep_separate' | 'unsure';

type Props = {
  reconciliation: PostMergeReconciliationOut;
  onDecide: (recordType: ReconciliationRecordType, a: string, b: string, decision: ReconciliationDecision, preferredRecordId?: string) => void;
};

export function ReconciliationReview({reconciliation, onDecide}: Props): ReactElement | null {
  if (reconciliation.summary.statement_pairs + reconciliation.summary.relationship_pairs <= 0) return null;
  const actions = (recordType: ReconciliationRecordType, a: string, b: string) => <div className="actions">
    <Button onClick={() => onDecide(recordType, a, b, 'duplicate', a)}>Duplicate · prefer first</Button>
    <Button onClick={() => onDecide(recordType, a, b, 'duplicate', b)}>Duplicate · prefer second</Button>
    <Button onClick={() => onDecide(recordType, a, b, 'keep_separate')}>Keep separate</Button>
    <Button onClick={() => onDecide(recordType, a, b, 'unsure')}>Unsure</Button>
  </div>;
  return <div>
    <b>Post-merge duplicate review</b>
    <p className="muted">Potential duplicates are never deleted automatically. Review whether each pair is the same assertion/edge or should stay separate; both provenance histories remain preserved.</p>
    <small>{reconciliation.summary.statement_pairs} statement pair(s) · {reconciliation.summary.relationship_pairs} relationship pair(s) · {reconciliation.summary.unresolved_pairs} unresolved</small>
    {reconciliation.statement_duplicates.slice(0, 6).map(p => <div className="statement" key={`${p.record_a.id}:${p.record_b.id}`}>
      <div>
        <b>Statement:</b> {p.record_a.prop} = {p.record_a.value}<br/>
        <small>{p.record_a.dataset}{p.record_a.origin ? ` · ${p.record_a.origin}` : ''} ↔ {p.record_b.dataset}{p.record_b.origin ? ` · ${p.record_b.origin}` : ''}{p.latest_decision ? ` · reviewed: ${p.latest_decision.decision}` : ''}</small>
      </div>
      {actions('statement', p.record_a.id, p.record_b.id)}
    </div>)}
    {reconciliation.relationship_duplicates.slice(0, 6).map(p => <div className="statement" key={`${p.record_a.id}:${p.record_b.id}`}>
      <div>
        <b>Relationship:</b> {p.record_a.schema}: {p.record_a.source?.caption} → {p.record_a.target?.caption}<br/>
        <small>Both edge records and their independent provenance remain intact.{p.latest_decision ? ` Latest review: ${p.latest_decision.decision}.` : ''}</small>
      </div>
      {actions('relationship', p.record_a.id, p.record_b.id)}
    </div>)}
  </div>;
}
