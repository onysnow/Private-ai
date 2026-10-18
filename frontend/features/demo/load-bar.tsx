'use client';
// The loading bar for a demo case: three segments, one per stage of a load —
// downloading the documents, adding the records, reading the documents — each
// filling as its stage goes, with what is happening written above it.
import type {ReactElement} from 'react';

import type {DemoCaseProgressOut} from '../../lib/generated/types.gen';

type Stage = 'download' | 'build' | 'read';
const STAGES: {id: Stage; label: string}[] = [
  {id: 'download', label: 'Download'},
  {id: 'build', label: 'Add the records'},
  {id: 'read', label: 'Read the documents'},
];

function share(done: number | null | undefined, of: number | null | undefined): number {
  return of ? Math.min(1, Math.max(0, (done ?? 0) / of)) : 0;
}

/** Where a load stands: the stage it is in and how full each segment is (0 to 1).
 * Before the server has answered, a load that was just started counts as downloading. */
export function loadStage(p: DemoCaseProgressOut | undefined, starting: boolean): {stage: Stage; fill: Record<Stage, number>; text: string} | null {
  const state = p?.state ?? (starting ? 'downloading' : 'idle');
  if (state === 'downloading' || (starting && state === 'idle' && !p?.investigation_id)) {
    const of = p?.to_fetch ?? 0;
    // `fetched` counts documents started as well as done, so the one in hand is not yet counted as done.
    const done = Math.max(0, (p?.fetched ?? 0) - 1);
    return {stage: 'download', fill: {download: share(done, of), build: 0, read: 0},
      text: of ? `Downloading the documents: ${Math.min(p?.fetched ?? 0, of)} of ${of}` : 'Starting the download…'};
  }
  if (state === 'building') {
    return {stage: 'build', fill: {download: 1, build: 0.5, read: 0}, text: p?.step ?? 'Adding the records'};
  }
  if (state === 'reading') {
    const handled = (p?.read ?? 0) + (p?.failed ?? 0);
    return {stage: 'read', fill: {download: 1, build: 1, read: share(handled, p?.documents)},
      text: `Reading the documents: ${p?.read ?? 0} of ${p?.documents ?? 0} read${p?.failed ? `, ${p.failed} could not be read` : ''}`};
  }
  return null;
}

export function LoadBar({progress, starting}: {progress: DemoCaseProgressOut | undefined; starting: boolean}): ReactElement | null {
  const at = loadStage(progress, starting);
  if (!at) return null;
  const order = STAGES.findIndex(s => s.id === at.stage);
  const total = Math.round(((order + at.fill[at.stage]) / STAGES.length) * 100);
  return <div className="load-bar" role="progressbar" aria-label={at.text} aria-valuemin={0} aria-valuemax={100} aria-valuenow={total}
    data-testid="load-bar">
    <p className="load-bar-text">{at.text}</p>
    <div className="load-bar-track">
      {STAGES.map((s, i) => <div key={s.id} className={`load-bar-seg${i < order ? ' done' : ''}${i === order ? ' now' : ''}`}>
        <span className={`load-bar-fill${s.id === 'build' && i === order ? ' working' : ''}`}
          style={{width: `${Math.round(at.fill[s.id] * 100)}%`}} />
        <small>{s.label}</small>
      </div>)}
    </div>
  </div>;
}
