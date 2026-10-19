'use client';
// The outbound log (mockup KEEP-safety-and-data, right bottom; research Keep §14): an append-only list of every request
// that left this computer, newest first: the time (mono), the service, the exact value sent in quotes, and a muted line
// with the kind of value, the reason and who started it. Filters by period (the screen's switch) and service (a line
// in the diagram); "Export log" saves it as CSV for a source-protection file. It scrolls inside; the page does not.
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {getOutboundLogOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {OutboundRequestOut} from '../../lib/generated/types.gen';
import {downloadBlob} from './keep-cards';
import {count, logTime, startedBy} from './format';

const PAGE = 50;

type Props = {
  investigationId: string;
  since: string | null;
  service: string | null;
  serviceName: string | null;
  /** Requests to every service in the period (the screen's total). */
  allCount: number;
  onClearService: () => void;
};

function Row({r}: {r: OutboundRequestOut}): ReactElement {
  const [open, setOpen] = useState(false);
  const long = r.value_sent.length > 160 || r.value_sent.includes('\n');
  return <li className="sd-log-row">
    <time className="sd-mono" dateTime={r.created_at}>{logTime(r.created_at)}</time>
    <span className="sd-log-svc">{r.service_name}</span>
    <span className="sd-log-what">
      {long ? <button type="button" className={`sd-quote${open ? ' open' : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}
        title={open ? 'Show less' : 'Show all of it, word for word'}>“{r.value_sent}”</button> : <q className="sd-quote">{r.value_sent}</q>}
      <span className="sd-log-meta">{[r.value_kind, r.reason, startedBy(r), r.documents_sent ? `${r.documents_sent} document passage${r.documents_sent === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
    </span>
  </li>;
}

export function OutboundLog({investigationId, since, service, serviceName, allCount, onClearService}: Props): ReactElement {
  const [limit, setLimit] = useState(PAGE);
  const query = useQuery({...getOutboundLogOptions({path: {investigation_id: investigationId},
    query: {limit, ...(since ? {since} : {}), ...(service ? {service} : {})}}), placeholderData: keepPreviousData});
  const [exportStatus, setExportStatus] = useState('');
  const data = query.data;
  const exportLog = async () => {
    setExportStatus('');
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    if (service) params.set('service', service);
    try {
      const blob = await api.blob(`/api/investigations/${encodeURIComponent(investigationId)}/outbound-log/export${params.size ? `?${params}` : ''}`);
      downloadBlob(blob, `outbound-log-${investigationId}.csv`);
    } catch (error) {
      setExportStatus(errorMessage(error, 'The log could not be exported'));
    }
  };
  return <section className="sd-panel sd-log" aria-labelledby="sd-log-title">
    <p className="sd-eyebrow">Outbound log · append-only</p>
    <h2 id="sd-log-title">What left, word for word{serviceName ? <span className="sd-small"> · {serviceName} only</span> : null}</h2>
    <div className={`sd-log-list${query.isFetching && data ? ' checking' : ''}`} tabIndex={0} aria-label="Requests that left this computer">
      {query.isError && !data ? <p className="sd-small">{errorMessage(query.error, 'The log could not be read')}</p>
        : !data ? <p className="sd-small">Checking…</p>
        : data.items.length === 0 ? <p className="sd-small">Nothing left this computer{since ? ' in this period' : ''}{serviceName ? ` for ${serviceName}` : ''}.</p>
        : <ul>{data.items.map(r => <Row key={r.id} r={r}/>)}</ul>}
      {data && data.items.length < data.total && <button type="button" className="sd-btn sd-more" onClick={() => setLimit(l => l + PAGE)}>Load older</button>}
    </div>
    <div className="sd-actions">
      <button type="button" className="sd-btn" onClick={onClearService} aria-pressed={!service}
        title={service ? 'Show every service' : 'Every service in this period'}>All {count(allCount)}</button>
      <button type="button" className="sd-btn" onClick={exportLog} disabled={!data || data.total === 0}>Export log</button>
      {exportStatus && <span className="sd-small" role="status">{exportStatus}</span>}
    </div>
  </section>;
}
