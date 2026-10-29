'use client';
// How far OpenAleph has got with the investigation's files (ADR-0006, Wave A):
// jobs waiting, running and finished per stage, from
// GET /api/investigations/{id}/corpus/status. The documents panel shows it
// while anything is in flight. It asks again every few seconds while a file
// is being read or OpenAleph still has work, and stops once OpenAleph is idle
// (TanStack Query's refetchInterval, which may be a function of the last
// answer: https://tanstack.com/query/v5/docs/framework/react/reference/useQuery).
import {useQuery} from '@tanstack/react-query';
import {useEffect, useRef} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {getCorpusStatusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {CorpusStageOut, CorpusStatusOut} from '../../lib/generated/types.gen';

/** How often to ask while work is in flight. OpenAleph answers from a count
 * over its job table, cheap enough to read every few seconds. */
export const CORPUS_STATUS_POLL_MS = 3000;

type Props = {
  investigationId: string;
  /** The panel knows a file is still being read (a document is queued or being read). */
  watch: boolean;
  /** Called when OpenAleph goes from working to idle, so the panel can reload what changed. */
  onIdle?: () => void;
  pollMs?: number;
};

export function corpusStatusPollMs(status: CorpusStatusOut | undefined, watch: boolean, every = CORPUS_STATUS_POLL_MS): number | false {
  return watch || status?.active ? every : false;
}

function stageLine(stage: CorpusStageOut): string {
  const parts = [`${stage.pending} waiting`, `${stage.running} in progress`, `${stage.finished} done`];
  if (stage.failed) parts.push(`${stage.failed} failed`);
  return parts.join(' · ');
}

export function CorpusStatus({investigationId, watch, onIdle, pollMs = CORPUS_STATUS_POLL_MS}: Props): ReactElement | null {
  const query = useQuery({
    ...getCorpusStatusOptions({path: {investigation_id: investigationId}}),
    enabled: Boolean(investigationId),
    refetchInterval: q => corpusStatusPollMs(q.state.data, watch, pollMs),
  });
  const status = query.data;
  // The newest callback, so a panel can pass a fresh function each render.
  const latestOnIdle = useRef(onIdle);
  useEffect(() => { latestOnIdle.current = onIdle; }, [onIdle]);
  const wasActive = useRef(false);
  useEffect(() => {
    if (!status) return;
    if (wasActive.current && status.state === 'idle') latestOnIdle.current?.();
    wasActive.current = status.active;
  }, [status]);

  if (status?.state === 'working') {
    return <div className="candidate" role="status" aria-label="OpenAleph progress">
      <b>OpenAleph is working on this investigation’s files</b>
      {/* Each stage is a small stacked bar (done, in progress, waiting, failed); its numbers on hover. Failures show. */}
      <ul className="co-stages">{status.stages.map(stage => {
        const total = Math.max(1, stage.pending + stage.running + stage.finished + stage.failed);
        return <li key={stage.queue}><Reveal detail={`${stage.label}: ${stageLine(stage)}`}><span>{stage.label}</span>
          <span className="co-bar" aria-hidden="true"><i className="done" style={{flexGrow: stage.finished}}/><i className="run" style={{flexGrow: stage.running}}/>
            <i className="wait" style={{flexGrow: stage.pending}}/><i className="fail" style={{flexGrow: stage.failed}}/></span>
          <small>{stage.finished}/{total}</small></Reveal>{stage.failed > 0 && <small className="co-warn"> · {stage.failed} failed</small>}</li>;
      })}</ul>
    </div>;
  }
  if (watch && status?.state === 'unreachable') {
    return <p className="muted" role="status">OpenAleph’s progress is unknown: {status.detail}.</p>;
  }
  return null;
}
