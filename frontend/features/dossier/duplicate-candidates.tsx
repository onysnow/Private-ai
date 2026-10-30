'use client';
// Records that may be the same party as the open one. A decision is a reporter's judgement on record; only a "same"
// decision unlocks a merge, and a merge is previewed and confirmed from its digest. Each candidate is one row: its
// kind as a mark, its name (which opens its own dossier beside this one, to compare), the match score, the latest
// review as a shape; Same / Different / Unsure and Preview merge are icon actions on hover or focus. A previewed merge
// shows what would move and the one primary action, Merge.
import {Check, CircleQuestionMark, Merge, X} from 'lucide-react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import type {CanonicalDuplicateCandidateOut, CanonicalMergePreviewOut} from '../../lib/generated/types.gen';
import {PartyMark} from '../the-drop/kind-marks';
import {IconAct} from './dossier-parts';

export type DuplicateDecision = 'same' | 'different' | 'unsure';

const DECISION_MARK: Record<string, {mark: string; tone: string}> = {
  same: {mark: '✓', tone: 'yes'}, different: {mark: '✕', tone: 'no'}, unsure: {mark: '?', tone: 'maybe'},
};

type Props = {
  candidates: CanonicalDuplicateCandidateOut[];
  previews: Record<string, CanonicalMergePreviewOut>;
  onDecide: (otherId: string, decision: DuplicateDecision) => void;
  onPreviewMerge: (otherId: string) => void;
  onExecuteMerge: (otherId: string) => void;
  /** Opens the other record's dossier beside this one; without it the name is plain text. */
  onOpen?: (otherId: string) => void;
};

export function DuplicateCandidates({candidates, previews, onDecide, onPreviewMerge, onExecuteMerge, onOpen}: Props): ReactElement | null {
  if (candidates.length === 0) return null;
  return <div className="dsr-group">
    <Reveal detail="Review only: marking records as the same party does not merge or delete either record. A merge is previewed first, and every merge is kept in the history.">
      <h4 className="dsr-group-title">Same party?</h4></Reveal>
    <ul className="dsr-rows">
      {candidates.slice(0, 8).map(c => {
        const preview = previews[c.entity_id];
        const latest = c.latest_decision;
        const mark = latest ? DECISION_MARK[latest.decision] : undefined;
        const foundBy = c.found_by?.includes('openaleph_xref') ? `Found by OpenAleph cross-referencing${c.found_by.includes('name_overlap') ? ' and by name' : ''}` : 'Found by name';
        return <li className={`dsr-row${preview ? ' held' : ''}`} key={c.entity_id}>
          <div className="dsr-line">
            <PartyMark schema={c.schema} tabbable={false}/>
            {onOpen ? <button type="button" className="dsr-party" onClick={() => onOpen(c.entity_id)} aria-label={`Open ${c.caption}`}>{c.caption}</button>
              : <span className="dsr-text">{c.caption}</span>}
            <Reveal detail={<><b>{Math.round(c.score * 100)}% alike</b><span className="rv-row">{foundBy}</span></>}>
              <span className="dsr-score">{Math.round(c.score * 100)}%</span></Reveal>
            {latest && <Reveal label={`Latest review: ${latest.decision}`} detail={`Latest review: ${latest.decision} · ${Math.round(latest.confidence * 100)}%`}>
              <span className={`dsr-decided ${mark?.tone ?? ''}`} aria-hidden="true">{mark?.mark ?? '·'}</span></Reveal>}
            <span className="dsr-acts">
              <IconAct icon={Check} label="Same entity" tone="yes" pressed={latest?.decision === 'same'} onClick={() => onDecide(c.entity_id, 'same')}/>
              <IconAct icon={X} label="Different" tone="no" pressed={latest?.decision === 'different'} onClick={() => onDecide(c.entity_id, 'different')}/>
              <IconAct icon={CircleQuestionMark} label="Unsure" pressed={latest?.decision === 'unsure'} onClick={() => onDecide(c.entity_id, 'unsure')}/>
              <IconAct icon={Merge} label="Preview merge into this record" onClick={() => onPreviewMerge(c.entity_id)} disabled={latest?.decision !== 'same'}/>
            </span>
          </div>
          {preview && <div className="dsr-preview">
            <Reveal detail={preview.blockers.length ? preview.blockers.map(b => <span className="rv-row" key={b.code}>{b.message}</span>) : 'Nothing stands in the way.'}>
              <span>{preview.total_references} reference(s) would move · {preview.blockers.length} blocker(s)</span></Reveal>
            <button type="button" className="dsr-pri" aria-label="Execute previewed merge" onClick={() => onExecuteMerge(c.entity_id)} disabled={!preview.can_execute}>
              <Merge size={14} aria-hidden="true"/> Merge</button>
          </div>}
        </li>;
      })}
    </ul>
  </div>;
}
