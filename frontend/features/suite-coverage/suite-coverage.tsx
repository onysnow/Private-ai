'use client';
// What the app's values mean in the Authority System Suite (backend app/ai/suite_map.py).
// A value the app needs that the suite does not define is a problem, shown first; then the
// values the suite defines only nearly; then what the suite requires that the app does not
// record yet, and what it now records; then the values the suite defines.
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getSuiteCoverageOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {SuiteMappingOut} from '../../lib/generated/types.gen';

function Row({m}: {m: SuiteMappingOut}): ReactElement {
  return <li className={`sc-row sc-${m.match}`}>
    <span className="sc-value"><small>{m.vocabulary_name}</small><b>{m.value.replace(/_/g, ' ')}</b></span>
    <span className="sc-term">{m.suite_term ? <><code>{m.suite_term}</code><small>{m.file}{m.found === false ? ' · no longer in the suite' : ''}</small></> : <em>The suite has no term for this.</em>}</span>
    <span className="sc-note">{m.note}</span>
  </li>;
}

export function SuiteCoverage(): ReactElement {
  const query = useQuery(getSuiteCoverageOptions());
  if (query.isError) return <p role="alert">{errorMessage(query.error, 'Could not read the suite coverage')}</p>;
  const c = query.data;
  if (!c) return <p className="sc-quiet" aria-busy="true">Reading the suite…</p>;
  const none = c.mappings.filter(m => m.match === 'none');
  const close = c.mappings.filter(m => m.match === 'close');
  const same = c.mappings.filter(m => m.match === 'same');
  const lacks = c.suite_requires_app_lacks.filter(m => !m.recorded_in);
  const recorded = c.suite_requires_app_lacks.filter(m => m.recorded_in);
  return <section className="sc" aria-labelledby="sc-title" data-testid="suite-coverage">
    <h3 id="sc-title">The app’s values in the Authority System Suite</h3>
    <p className="sc-quiet">Every value the app decides with is matched to the suite term that defines it ({c.source?.replace(/^.*@/, 'commit ')}, TAS {c.tas_version}).
      A value the suite does not define is a problem for the suite; something the suite requires that the app does not record is a problem for the app.</p>
    <ul className="sc-counts" aria-label="Coverage">
      <li className="sc-none"><b>{c.counts.none + c.counts.unmapped}</b> the suite does not define</li>
      <li className="sc-close"><b>{c.counts.close}</b> defined only nearly</li>
      <li className="sc-lacks"><b>{c.counts.app_lacks}</b> the suite needs, the app does not record</li>
      <li className="sc-same"><b>{c.counts.same}</b> defined</li>
      {c.counts.drifted > 0 && <li className="sc-none"><b>{c.counts.drifted}</b> terms gone from the suite</li>}
    </ul>
    <details open><summary>The suite does not define ({none.length + c.unmapped.length})</summary>
      <ul className="sc-list">{none.map(m => <Row key={`${m.vocabulary}:${m.value}`} m={m}/>)}
        {c.unmapped.map(u => <li key={`${u.vocabulary}:${u.value}`} className="sc-row sc-none"><span className="sc-value"><small>{u.vocabulary}</small><b>{u.value}</b></span>
          <span className="sc-term"><em>Not mapped yet.</em></span><span className="sc-note">A value the app added without checking the suite.</span></li>)}</ul>
    </details>
    <details><summary>Defined only nearly ({close.length})</summary><ul className="sc-list">{close.map(m => <Row key={`${m.vocabulary}:${m.value}`} m={m}/>)}</ul></details>
    <details><summary>The suite needs, the app does not record ({lacks.length})</summary>
      <ul className="sc-list">{lacks.map(m => <li key={m.what} className="sc-row sc-lacks">
        <span className="sc-value"><b>{m.what}</b></span><span className="sc-term"><code>{m.suite_term}</code><small>{m.file}</small></span><span className="sc-note">{m.why}</span>
      </li>)}</ul>
    </details>
    <details><summary>The suite needs, the app now records ({recorded.length})</summary>
      <ul className="sc-list">{recorded.map(m => <li key={m.what} className="sc-row sc-same">
        <span className="sc-value"><b>{m.what}</b></span><span className="sc-term"><code>{m.suite_term}</code><small>{m.file}</small></span><span className="sc-note">Recorded in <code>{m.recorded_in}</code>.</span>
      </li>)}</ul>
    </details>
    <details><summary>Defined ({same.length})</summary><ul className="sc-list">{same.map(m => <Row key={`${m.vocabulary}:${m.value}`} m={m}/>)}</ul></details>
  </section>;
}
