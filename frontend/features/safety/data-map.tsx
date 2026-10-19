'use client';
// Keep › Safety & data, left: "What lives where" (mockup KEEP-safety-and-data; research §7). This computer as a bordered region
// holding six stores, each with a count, a plain line on where it is and whether it is in backups; outside the border
// the services the case can reach, each with its mode and a line labelled with what is sent and how many times.
// A line that carries nothing is dotted and grey; a blocked one carries a cross. Pointing at a service lists its
// last requests. Everything shown is read from what the app stores; what it does not log says "not counted yet".
import type {ReactElement} from 'react';

import type {OutboundEntryOut, SafetyAndDataOut, SafetyServiceOut} from '../../lib/generated/types.gen';
import {MODE_LABEL, PERIODS, ago, bytes, count, dayLabel, lineLabel, lineState, logTime, plural, privateAiLine} from './format';
import type {Period} from './format';

function Store({icon, name, big, line, note, warn}: {icon: string; name: string; big: string; line: string; note: string; warn?: boolean}): ReactElement {
  return <li className="sd-store">
    <p className="sd-store-name"><span aria-hidden="true">{icon}</span> {name}</p>
    <p className="sd-store-big">{big}</p>
    <p className="sd-muted">{line}</p>
    <p className={warn ? 'sd-warn' : 'sd-muted'}>{note}</p>
  </li>;
}

function Lines({services}: {services: SafetyServiceOut[]}): ReactElement {
  const n = services.length;
  const y = (i: number) => (i + 0.5) * 100;
  const from = (i: number) => n === 1 ? 50 * n : 100 * n * (0.16 + 0.68 * (i / (n - 1)));
  return <div className="sd-lines" aria-hidden="true">
    <svg viewBox={`0 0 100 ${n * 100}`} preserveAspectRatio="none">
      {services.map((s, i) => <path key={s.key} className={`sd-line is-${lineState(s)}`} d={`M0,${from(i)} C55,${from(i)} 45,${y(i)} 100,${y(i)}`} fill="none" vectorEffect="non-scaling-stroke"/>)}
    </svg>
    {services.map((s, i) => <span key={s.key} className={`sd-line-label is-${lineState(s)}`} style={{top: `${((i + 0.5) / n) * 100}%`}}>
      {lineState(s) === 'blocked' && '✕ '}{lineLabel(s)}</span>)}
  </div>;
}

function Service({s, recent, now}: {s: SafetyServiceOut; recent: OutboundEntryOut[]; now: Date}): ReactElement {
  return <li className={`sd-svc-card is-${lineState(s)}`} tabIndex={0} aria-label={`${s.label}, ${MODE_LABEL[s.mode] ?? s.mode}. ${lineLabel(s)}.`}>
    <p className="sd-svc-name">{s.label}</p>
    {s.role && <p className="sd-muted">{s.role}</p>}
    <span className={`sd-chip is-${s.mode}`}>{MODE_LABEL[s.mode] ?? s.mode}</span>
    <div className="sd-pop" role="tooltip">
      <p className="sd-muted">{s.why}</p>
      {s.host && <p className="sd-mono sd-muted sd-clip">{s.host}</p>}
      {recent.length > 0
        ? <ul>{recent.slice(0, 3).map(e => <li key={e.id}><span className="sd-mono">{logTime(e.at, now)}</span> <q>{e.value_sent.length > 60 ? `${e.value_sent.slice(0, 60)}…` : e.value_sent}</q></li>)}</ul>
        : <p className="sd-muted">{s.counted ? 'No requests in this period.' : 'This service’s traffic is not logged yet.'}</p>}
    </div>
  </li>;
}

export function DataMap({data, recent, period, onPeriod, now}: {
  data: SafetyAndDataOut; recent: OutboundEntryOut[]; period: Period; onPeriod: (p: Period) => void; now: Date;
}): ReactElement {
  const {stores, totals, services} = data;
  const ai = privateAiLine(stores.private_ai);
  return <section className="sd-panel sd-map" aria-labelledby="sd-map-h">
    <h2 id="sd-map-h" className="sd-visually-hidden">What lives where</h2>
    <div className="sd-totals">
      <dl>
        <div><dt>requests left this computer</dt><dd>{count(totals.requests_left)}</dd></div>
        <div><dt>services reached</dt><dd>{count(totals.services_reached)}</dd></div>
        <div><dt>documents sent out</dt><dd>{count(totals.documents_sent_out)}</dd></div>
        <div><dt>AI calls outside</dt><dd>{count(totals.ai_calls_outside)}</dd></div>
      </dl>
      <div className="sd-period" role="group" aria-label="Period">
        {PERIODS.map(p => <button key={p.key} type="button" aria-pressed={period === p.key} onClick={() => onPeriod(p.key)}>{p.label}</button>)}
      </div>
    </div>
    <div className="sd-diagram">
      <div className="sd-region">
        <p className="sd-eyebrow sd-amber">This computer · local only</p>
        <ul className="sd-stores">
          <Store icon="▤" name="Case records" big={`${count(stores.case_records.records)} records · ${plural(stores.case_records.claims, 'claim')}`}
            line="Database on this machine" note={stores.case_records.in_backups ? 'In every backup ✓' : 'Not in backups'}/>
          <Store icon="▣" name="Documents & pictures" big={`${plural(stores.documents.files, 'file')} · ${bytes(stores.documents.bytes)}`}
            line="Kept as received, checksummed" note={stores.documents.in_backups ? 'In every backup ✓' : 'Not in backups'}/>
          <Store icon="⟲" name="Backups" big={stores.backups.count === 0 ? 'None made yet' : `${count(stores.backups.count)} made · last ${dayLabel(stores.backups.last ?? '')}`}
            line="Wherever you saved the file" note={stores.backups.encrypted ? 'Encrypted' : 'Not encrypted: keep it safe'} warn={!stores.backups.encrypted}/>
          <Store icon="⚿" name="Service keys" big={`${stores.service_keys.set} of ${stores.service_keys.total} set`}
            line="Stored here, never shown again" note="Not in backups"/>
          <Store icon="≡" name="Security log" big={`${plural(stores.security_log.events, 'event')}${stores.security_log.since ? ` · since ${dayLabel(stores.security_log.since)}` : ''}`}
            line="Who asked what, never the content" note={bytes(stores.security_log.bytes)}/>
          <Store icon="◇" name="Private AI" big={ai.title} line={ai.detail} note={stores.private_ai.model ?? ''}/>
        </ul>
      </div>
      <Lines services={services}/>
      <ul className="sd-services" aria-label="Outside services the case can reach">
        {services.map(s => <Service key={s.key} s={s} now={now} recent={recent.filter(e => e.service === s.key)}/>)}
      </ul>
    </div>
    <p className="sd-muted sd-foot">Point at a service for its last requests.</p>
  </section>;
}

export {ago};
