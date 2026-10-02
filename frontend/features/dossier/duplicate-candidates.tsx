'use client';
// Canonical records that may be the same entity as the open one. A
// decision is a reporter's judgement on record; only a "same" decision
// unlocks a merge, and a merge is previewed and confirmed from its digest.
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import type {CanonicalDuplicateCandidateOut, CanonicalMergePreviewOut} from '../../lib/generated/types.gen';

export type DuplicateDecision = 'same' | 'different' | 'unsure';

type Props = {
  candidates: CanonicalDuplicateCandidateOut[];
  previews: Record<string, CanonicalMergePreviewOut>;
  onDecide: (otherId: string, decision: DuplicateDecision) => void;
  onPreviewMerge: (otherId: string) => void;
  onExecuteMerge: (otherId: string) => void;
};

export function DuplicateCandidates({candidates, previews, onDecide, onPreviewMerge, onExecuteMerge}: Props): ReactElement | null {
  if (candidates.length === 0) return null;
  return <div>
    <b>Possible canonical duplicates</b>
    <p className="muted">Review only: marking records as the same entity does not silently merge or delete either canonical record.</p>
    {candidates.slice(0, 8).map(c => {
      const preview = previews[c.entity_id];
      return <div className="statement" key={c.entity_id}>
        <div>
          <b>{c.caption}</b> · {c.schema} · {Math.round(c.score * 100)}%
          {c.latest_decision && <div><small>Latest review: {c.latest_decision.decision} · {Math.round(c.latest_decision.confidence * 100)}%</small></div>}
        </div>
        <div className="actions">
          <Button onClick={() => onDecide(c.entity_id, 'same')}>Same entity</Button>
          <Button onClick={() => onDecide(c.entity_id, 'different')}>Different</Button>
          <Button onClick={() => onDecide(c.entity_id, 'unsure')}>Unsure</Button>
          <Button onClick={() => onPreviewMerge(c.entity_id)} disabled={c.latest_decision?.decision !== 'same'}>Preview merge into this record</Button>
          {preview && <>
            <small>{preview.total_references} reference(s) would move · {preview.blockers.length} blocker(s)</small>
            <Button onClick={() => onExecuteMerge(c.entity_id)} disabled={!preview.can_execute}>Execute previewed merge</Button>
          </>}
        </div>
      </div>;
    })}
  </div>;
}
