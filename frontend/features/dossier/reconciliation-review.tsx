'use client';
// After a merge, statements and edges that say the same thing twice are shown as pairs for the reporter to review.
// Nothing is deleted: a "duplicate" decision only names which record the compact views prefer. One row per pair: what
// it says, its two origins on hover, the review as a mark; prefer the first, prefer the second, keep separate and
// unsure are icon actions on hover or focus.
import {CircleQuestionMark, Split} from 'lucide-react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {PostMergeReconciliationOut} from '../../lib/generated/types.gen';
import {LINK, linkFamily} from '../../lib/viz-tokens';
import {IconAct, propWords} from './dossier-parts';

export type ReconciliationRecordType = 'statement' | 'relationship';
export type ReconciliationDecision = 'duplicate' | 'keep_separate' | 'unsure';

type Props = {
  reconciliation: PostMergeReconciliationOut;
  onDecide: (recordType: ReconciliationRecordType, a: string, b: string, decision: ReconciliationDecision, preferredRecordId?: string) => void;
};

/** "1" or "2" as an icon: which of the pair to prefer. */
const First = () => <b className="dsr-digit" aria-hidden="true">1</b>;
const Second = () => <b className="dsr-digit" aria-hidden="true">2</b>;

export function ReconciliationReview({reconciliation, onDecide}: Props): ReactElement | null {
  const s = reconciliation.summary;
  if (s.statement_pairs + s.relationship_pairs <= 0) return null;
  const actions = (recordType: ReconciliationRecordType, a: string, b: string) => <span className="dsr-acts">
    <IconAct icon={First} label="Duplicate · prefer first" onClick={() => onDecide(recordType, a, b, 'duplicate', a)}/>
    <IconAct icon={Second} label="Duplicate · prefer second" onClick={() => onDecide(recordType, a, b, 'duplicate', b)}/>
    <IconAct icon={Split} label="Keep separate" onClick={() => onDecide(recordType, a, b, 'keep_separate')}/>
    <IconAct icon={CircleQuestionMark} label="Unsure" onClick={() => onDecide(recordType, a, b, 'unsure')}/>
  </span>;
  const reviewed = (decision?: string | null) => <Reveal label={decision ? `Reviewed: ${decision}` : 'Not reviewed yet'} detail={decision ? `Reviewed: ${decision.replace(/_/g, ' ')}` : 'Not reviewed yet'}>
    <span className={`dsr-decided${decision ? ' yes' : ' open'}`} aria-hidden="true">{decision ? '✓' : '○'}</span></Reveal>;
  return <div className="dsr-group">
    <Reveal detail={<>
      <span className="rv-row">{`${s.statement_pairs} statement pair(s) · ${s.relationship_pairs} relationship pair(s) · ${s.unresolved_pairs} unresolved`}</span>
      <span className="rv-row">Potential duplicates are never deleted automatically. Say whether each pair is the same assertion or link, or should stay separate; both provenance histories are kept.</span>
    </>}><h4 className="dsr-group-title">Repeated after the merge <span className="dsr-sec-n">{s.unresolved_pairs}</span></h4></Reveal>
    <ul className="dsr-rows">
      {reconciliation.statement_duplicates.slice(0, 6).map(p => <li className="dsr-row" key={`${p.record_a.id}:${p.record_b.id}`}>
        <div className="dsr-line">
          <Reveal className="dsr-grow" detail={`${p.record_a.dataset}${p.record_a.origin ? ` · ${p.record_a.origin}` : ''} ↔ ${p.record_b.dataset}${p.record_b.origin ? ` · ${p.record_b.origin}` : ''}`}>
            <span className="dsr-text"><span className="dsr-prop">{propWords(p.record_a.prop)}</span> {p.record_a.value}</span></Reveal>
          {reviewed(p.latest_decision?.decision)}
          {actions('statement', p.record_a.id, p.record_b.id)}
        </div>
      </li>)}
      {reconciliation.relationship_duplicates.slice(0, 6).map(p => <li className="dsr-row" key={`${p.record_a.id}:${p.record_b.id}`}>
        <div className="dsr-line">
          <Reveal className="dsr-grow" detail={`${p.record_a.schema}: ${p.record_a.source?.caption ?? ''} → ${p.record_a.target?.caption ?? ''}. Both link records and their own provenance stay intact.`}>
            <span className="dsr-text"><i className="ds-line" style={{background: LINK[linkFamily(p.record_a.schema)].colour}} aria-hidden="true"/> {p.record_a.source?.caption} → {p.record_a.target?.caption}</span></Reveal>
          {reviewed(p.latest_decision?.decision)}
          {actions('relationship', p.record_a.id, p.record_b.id)}
        </div>
      </li>)}
    </ul>
  </div>;
}
