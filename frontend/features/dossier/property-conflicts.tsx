'use client';
// A property with several values is never resolved by the dossier itself:
// the reporter says whether the values are a change over time, both valid,
// one preferred, or still unresolved, and gives a rationale in a
// confirmation dialog before the decision is recorded.
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import type {DossierPropertyConflictOut} from '../../lib/generated/types.gen';

/** The decision a reporter picked, held until the rationale dialog confirms it. */
export type PendingConflict = {prop: string; values: string[]; decision: string; preferred_value?: string};

type Props = {
  conflicts: DossierPropertyConflictOut[];
  onDecide: (pending: PendingConflict) => void;
};

export function PropertyConflicts({conflicts, onDecide}: Props): ReactElement {
  const decide = (c: DossierPropertyConflictOut, decision: string, preferred_value?: string) =>
    onDecide({prop: c.prop, values: c.values.map(v => v.value), decision, preferred_value});
  return <div>
    <b>Property conflicts</b>
    {conflicts.length === 0 ? <p className="muted">No unresolved multi-value property conflicts detected.</p> : conflicts.slice(0, 8).map(c => <div className="statement" key={c.prop}>
      <div>
        <b>{c.prop}</b> <small>· {c.status}{c.preferred_value ? ` · preferred: ${c.preferred_value}` : ' · no reporter-preferred value'}</small>
        {c.latest_decision?.rationale && <div><small>Reporter rationale: {c.latest_decision.rationale}</small></div>}
        <div className="actions">
          <Button onClick={() => decide(c, 'temporal_change')}>Temporal change</Button>
          <Button onClick={() => decide(c, 'both_valid')}>Both valid</Button>
          <Button onClick={() => decide(c, 'unresolved')}>Unresolved</Button>
          {c.values.map(v => <Button key={`prefer-${v.value}`} onClick={() => decide(c, 'preferred', v.value)}>Prefer {v.value}</Button>)}
        </div>
        {c.values.map(v => <div key={v.value}>
          {v.value} <small>· {v.canonical ? 'canonical statement' : 'external assessment'} · {v.support_count} support · {v.conflict_count} conflict</small>
          {v.canonical_statements.map(st => <div key={st.id}><small>{st.dataset}{st.origin ? ` · ${st.origin}` : ''}</small></div>)}
        </div>)}
      </div>
    </div>)}
  </div>;
}
