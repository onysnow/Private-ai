'use client';
// A property with several values is never resolved by the dossier itself: the reporter says whether the values are a
// change over time, both valid, one preferred, or still unresolved, and gives a rationale in a confirmation dialog
// before the decision is recorded. One row per property: its name, its values as chips (a chip is "prefer this
// value"; where each value comes from is on its hover), the decision as a mark; the other three decisions are icon
// actions on hover or focus. Nothing is drawn when no property disagrees.
import {CircleQuestionMark, Clock, Equal} from 'lucide-react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {DossierPropertyConflictOut} from '../../lib/generated/types.gen';
import {IconAct, propWords} from './dossier-parts';

/** The decision a reporter picked, held until the rationale dialog confirms it. */
export type PendingConflict = {prop: string; values: string[]; decision: string; preferred_value?: string};

const DECIDED: Record<string, string> = {temporal_change: 'Changed over time', both_valid: 'Both valid', preferred: 'One value preferred', unresolved: 'Unresolved'};

type Props = {
  conflicts: DossierPropertyConflictOut[];
  onDecide: (pending: PendingConflict) => void;
};

export function PropertyConflicts({conflicts, onDecide}: Props): ReactElement | null {
  if (conflicts.length === 0) return null;
  const decide = (c: DossierPropertyConflictOut, decision: string, preferred_value?: string) =>
    onDecide({prop: c.prop, values: c.values.map(v => v.value), decision, preferred_value});
  return <div className="dsr-group">
    <Reveal detail="A property holding more than one value. Pick the value to prefer, or say it changed over time, both are valid, or it is still unresolved. Nothing is deleted.">
      <h4 className="dsr-group-title">Values that disagree</h4></Reveal>
    <ul className="dsr-rows">
      {conflicts.slice(0, 8).map(c => {
        const decided = c.status !== 'unresolved';
        return <li className="dsr-row" key={c.prop}>
          <div className="dsr-line">
            <span className="dsr-prop">{propWords(c.prop)}</span>
            <span className="dsr-vals">
              {c.values.map(v => <Reveal key={v.value} tabbable={false} detail={<>
                <b>{v.canonical ? 'Recorded in the case' : 'An outside assessment'}</b>
                <span className="rv-row">{v.support_count} support · {v.conflict_count} conflict</span>
                {v.canonical_statements.map(st => <span className="rv-row" key={st.id}>{st.dataset}{st.origin ? ` · ${st.origin}` : ''}</span>)}
              </>}>
                <button type="button" className={`dsr-val${c.preferred_value === v.value ? ' on' : ''}`} aria-label={`Prefer ${v.value}`}
                  aria-pressed={c.preferred_value === v.value} onClick={() => decide(c, 'preferred', v.value)}>{v.value}</button>
              </Reveal>)}
            </span>
            <Reveal label={decided ? DECIDED[c.status] ?? c.status : 'Not decided yet'} detail={<>
              <b>{decided ? DECIDED[c.status] ?? c.status : 'Not decided yet'}</b>
              {c.preferred_value && <span className="rv-row">Preferred: {c.preferred_value}</span>}
              {c.latest_decision?.rationale && <span className="rv-row">Reporter rationale: {c.latest_decision.rationale}</span>}
            </>}><span className={`dsr-decided${decided ? ' yes' : ' open'}`} aria-hidden="true">{decided ? '✓' : '○'}</span></Reveal>
            <span className="dsr-acts">
              <IconAct icon={Clock} label="Temporal change" pressed={c.status === 'temporal_change'} onClick={() => decide(c, 'temporal_change')}/>
              <IconAct icon={Equal} label="Both valid" pressed={c.status === 'both_valid'} onClick={() => decide(c, 'both_valid')}/>
              <IconAct icon={CircleQuestionMark} label="Unresolved" onClick={() => decide(c, 'unresolved')}/>
            </span>
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
