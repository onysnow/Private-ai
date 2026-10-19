'use client';
// Keep › Safety & data, bottom right: the outbound log (mockup KEEP-safety-and-data; research §14; ADR-0015). An append-only table of
// what left this computer, word for word: when, to whom, the exact value in quotes, and a muted line with the kind of
// value, why, and who started it. It scrolls inside; "Export log" gives the whole log as a CSV for a source-protection file.
import {useMutation, useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {getOutboundLogOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {SafetyServiceOut} from '../../lib/generated/types.gen';
import {count, logTime} from './format';
import type {Period} from './format';

export function OutboundLog({investigationId, caseName, period, services, now, notCounted}: {
  investigationId: string; caseName: string; period: Period; services: SafetyServiceOut[]; now: Date; notCounted: string[];
}): ReactElement {
  const [service, setService] = useState('');
  const log = useQuery({...getOutboundLogOptions({path: {investigation_id: investigationId}, query: {period, service: service || undefined, limit: 200}}), enabled: Boolean(investigationId)});
  const [status, setStatus] = useState('');
  const exportCsv = useMutation({mutationFn: () => api.blob(`/api/investigations/${investigationId}/outbound-log.csv?period=all`)});

  const download = async () => {
    setStatus('Preparing the log…');
    try {
      const blob = await exportCsv.mutateAsync();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(caseName || 'case').replace(/[^A-Za-z0-9_-]+/g, '_')}-outbound-log.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Log saved as a CSV file.');
    } catch (error) {
      setStatus(errorMessage(error, 'The log could not be exported'));
    }
  };

  const entries = log.data?.entries ?? [];
  const shown = log.data?.total ?? 0;
  return <section className="sd-panel sd-log" aria-labelledby="sd-log-h">
    <header className="sd-log-head">
      <div>
        <p className="sd-eyebrow">Outbound log · append-only</p>
        <h2 id="sd-log-h" className="sd-h-s">What left, word for word</h2>
      </div>
      <label className="sd-filter">
        <span className="sd-visually-hidden">Show requests to</span>
        <select value={service} onChange={e => setService(e.target.value)}>
          <option value="">All services</option>
          {services.filter(s => s.counted).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
    </header>
    {log.isPending && <div className="sd-skeleton tall" aria-label="Loading the log"/>}
    {log.isError && <p className="sd-error" role="alert">The log could not be read. {errorMessage(log.error)}</p>}
    {!log.isPending && !log.isError && (entries.length === 0
      ? <p className="sd-quiet sd-empty">Nothing has left this computer {period === 'all' ? 'from this case' : 'in this period'}. A lookup or an outside AI run appears here the moment it is sent.</p>
      : <ol className="sd-log-list" aria-label="Requests that left this computer, newest first" tabIndex={0}>
        {entries.map(e => <li key={e.id} className={e.status === 'sent' ? '' : 'is-odd'}>
          <time dateTime={e.at} className="sd-mono sd-when">{logTime(e.at, now)}</time>
          <div>
            <p className="sd-log-line"><b className="sd-svc">{services.find(s => s.key === e.service)?.label ?? e.service}</b> <q className="sd-val">{e.value_sent.length > 140 ? `${e.value_sent.slice(0, 140)}…` : e.value_sent}</q></p>
            <p className="sd-muted">{e.value_kind} · {e.reason} · {e.actor}{e.status === 'failed' ? ' · failed, it may still have arrived' : ''}</p>
          </div>
        </li>)}
      </ol>)}
    {notCounted.length > 0 && <p className="sd-muted sd-log-note">Not logged yet: {notCounted.join(' ')}</p>}
    <footer className="sd-log-foot">
      <span className="sd-muted" aria-live="polite">{status || (shown > entries.length ? `Showing ${count(entries.length)} of ${count(shown)}` : `${count(shown)} ${shown === 1 ? 'request' : 'requests'}`)}</span>
      <button type="button" className="sd-btn" onClick={() => void download()} disabled={exportCsv.isPending}>Export log</button>
    </footer>
  </section>;
}
