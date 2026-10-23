'use client';
// Safety & data (Keep; mockup KNOWLEDGE_KEEP_2, ADR-0015): "What lives on this computer, and what leaves it". The
// totals (zeroes stated) and the period switch; the six places the case lives inside a bordered "This computer"; the
// services it can reach outside, each with the line out labelled with what was sent and how often (dotted when off);
// four cards to keep it safe (Backup, Who can reach it, Housekeeping, Delete this case); and the outbound log, word for
// word, scrolling inside. Everything on it comes from the server's own rows (backend app/services/safety_data.py): a
// thing the app does not record is not drawn. The diagram has a table twin for screen readers, and each line to a
// service is a focusable item whose last requests show in the log filter. The page never scrolls.
import {useQuery} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import type {ReactElement} from 'react';

import '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getSafetyDataOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {OutboundRequestOut, SafetyDataOut, SafetyServiceOut, SafetyStoreOut} from '../../lib/generated/types.gen';
import {apiTime, shortStamp} from '../../lib/timestamps';

type Period = SafetyDataOut['period'];
const PERIODS: [Period, string][] = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']];

const STATE: Record<SafetyServiceOut['state'], string> = {off: 'OFF', on_request: 'ON REQUEST', local: 'LOCAL'};
const STORE_MARK: Record<string, string> = {records: '≡', documents: '▤', backups: '⟲', keys: '⚿', log: '≣', ai: '◇'};

export const bytesInWords = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

/** "3 days ago", "today", "never": how long ago, in the words the Keep cards use. */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const days = Math.floor((now.getTime() - apiTime(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The log as a comma-separated table for a source-protection file (research §14: "Export log"). */
export function logCsv(rows: OutboundRequestOut[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ['time', 'service', 'kind of value', 'value sent', 'why', 'who started it', 'left this computer', 'result'];
  return [head, ...rows.map(r => [r.at, r.service_name, r.kind, r.value, r.reason, r.actor === 'you' ? 'you' : 'automatic', r.leaves_computer ? 'yes' : 'no', r.outcome])]
    .map(line => line.map(cell).join(',')).join('\n');
}

function storeFigure(s: SafetyStoreOut): string {
  if (s.id === 'documents') return `${(s.count ?? 0).toLocaleString()} files · ${bytesInWords(s.bytes ?? 0)}`;
  if (s.id === 'records') return `${(s.count ?? 0).toLocaleString()} records · ${s.count_note ?? ''}`.replace(/ · $/, '');
  if (s.id === 'keys') return `${s.count} ${s.count_note ?? ''}`.trim();
  if (s.id === 'log') return `${(s.count ?? 0).toLocaleString()} events`;
  if (s.id === 'backups') return s.count ? 'Downloaded from here' : 'None made from here yet';
  return '';
}

const inBackups = (s: SafetyStoreOut): string => (s.in_backups === true ? 'In every backup ✓' : s.in_backups === false ? 'Not in backups' : '');

export function SafetyScreen({investigationId, caseName, active = true}: {investigationId: string; caseName?: string; active?: boolean}): ReactElement {
  const [period, setPeriod] = useState<Period>('7d');
  const [only, setOnly] = useState<string | null>(null);
  const query = useQuery({...getSafetyDataOptions({path: {investigation_id: investigationId}, query: {period}}), enabled: Boolean(investigationId) && active});
  const data = query.data;

  const rows = useMemo(() => (data?.outbound ?? []).filter(r => !only || (only === 'ai' ? r.service.startsWith('ai') : r.service === only)), [data, only]);
  const go = (anchor: string) => { window.location.hash = anchor; };

  if (query.isError && !data) return <div className="sd"><p className="sd-error" role="alert">Can’t reach the server on this computer: {errorMessage(query.error)}. Your files and records are still here; nothing is lost.
    <button type="button" className="sd-link" onClick={() => void query.refetch()}>Try again</button></p></div>;
  if (!data) return <div className="sd" aria-busy="true"><p className="sd-quiet">Checking…</p></div>;

  const t = data.totals;
  const nothingLeft = t.requests_left === 0;
  const stale = query.isFetching ? ' (checking)' : '';

  return <div className="sd" data-checking={query.isFetching || undefined}>
    <header className="sd-head">
      <div>
        <h2 className="sd-title">What lives on <em>this computer</em>, and what leaves it</h2>
        <p className="sd-sub">{caseName ? `${caseName} · ` : ''}{data.exposure}{stale}</p>
      </div>
      <span className={`sd-chip${nothingLeft ? '' : ' sd-chip-out'}`}>{nothingLeft ? '◉ nothing has left this computer' : `↗ ${t.requests_left} left in this period`}</span>
    </header>

    <div className="sd-grid">
      <section className="sd-panel sd-map" aria-label="What lives where">
        <div className="sd-totals">
          <dl className="sd-tiles">
            <div><dt>requests left this computer</dt><dd>{t.requests_left}</dd></div>
            <div><dt>services reached</dt><dd>{t.services_reached}</dd></div>
            <div><dt>documents sent out</dt><dd>{t.documents_sent_out}</dd></div>
            <div><dt>AI calls outside</dt><dd>{t.ai_calls_outside}</dd></div>
          </dl>
          <div className="sd-switch" role="group" aria-label="Period">
            {PERIODS.map(([key, label]) => <button key={key} type="button" className={period === key ? 'on' : ''} aria-pressed={period === key} onClick={() => { setPeriod(key); setOnly(null); }}>{label}</button>)}
          </div>
        </div>

        <div className="sd-diagram">
          <div className="sd-computer" role="group" aria-label="This computer, local only">
            <p className="sd-eyebrow">This computer · local only</p>
            <ul className="sd-stores">
              {data.stores.map(s => <li key={s.id} className="sd-store" tabIndex={0} title={s.where}>
                <span className="sd-mark" aria-hidden="true">{STORE_MARK[s.id]}</span>
                <strong>{s.name}</strong>
                <span>{storeFigure(s)}</span>
                <span className="sd-where">{s.where}</span>
                {s.warning ? <span className="sd-warn">▲ {s.warning}</span> : <span className="sd-where">{inBackups(s)}</span>}
              </li>)}
            </ul>
          </div>
          <ul className="sd-services" aria-label="Services this case can reach">
            {data.services.map(s => {
              const line = s.where === 'inside' ? '' : s.state === 'off' ? 'nothing sent' : s.sent_count ? `${s.sends.join(', ')} · ${s.sent_count}` : 'never used';
              return <li key={s.id} className={`sd-service sd-${s.state}${only === s.id ? ' picked' : ''}`}>
                <span className="sd-line" aria-hidden="true">{s.blocked_note ? <i>✕ blocked</i> : <i>{line}</i>}</span>
                <button type="button" className="sd-box" aria-pressed={only === s.id}
                  onClick={() => setOnly(only === s.id ? null : s.id)}
                  aria-label={`${s.name}: ${STATE[s.state]}. ${line || s.state_note}. ${s.sent_count ? 'Show its requests in the log.' : ''}`}>
                  <strong>{s.name}</strong>
                  <span>{s.about}</span>
                  <span className="sd-state" title={s.blocked_note ?? s.state_note}>{STATE[s.state]}</span>
                </button>
              </li>;
            })}
          </ul>
        </div>
        <p className="sd-foot">Press a service to filter the log to it.</p>
        <table className="sd-twin">
          <caption>What lives where, and what can leave</caption>
          <thead><tr><th>Store</th><th>Where</th><th>Size</th><th>In backups</th></tr></thead>
          <tbody>{data.stores.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.where}</td><td>{storeFigure(s)}</td><td>{inBackups(s) || 'not applicable'}</td></tr>)}</tbody>
          <thead><tr><th>Service</th><th>Mode</th><th>What is sent</th><th>Count</th></tr></thead>
          <tbody>{data.services.map(s => <tr key={s.id}><td>{s.name}</td><td>{STATE[s.state]}: {s.state_note}</td><td>{s.sends.join(', ') || 'nothing'}</td><td>{s.sent_count}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="sd-panel sd-log" aria-label="Outbound log">
        <p className="sd-eyebrow">Outbound log · append-only</p>
        <h3 className="sd-h3">What left, word for word</h3>
        <div className="sd-logbar">
          <select aria-label="Service" value={only ?? ''} onChange={e => setOnly(e.target.value || null)}>
            <option value="">All services</option>
            {data.services.filter(s => s.where === 'outside').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="sd-count">{rows.length} of {data.outbound_total}</span>
          <button type="button" className="sd-btn" disabled={!rows.length} onClick={() => {
            const blob = new Blob([logCsv(rows)], {type: 'text/csv'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `outbound-log-${investigationId}.csv`; a.click(); URL.revokeObjectURL(a.href);
          }}>Export log</button>
        </div>
        {rows.length === 0 ? <p className="sd-quiet">{only ? 'Nothing has been sent to that service in this period.' : 'Nothing has left this computer in this period.'}</p>
          : <ol className="sd-rows" tabIndex={0} aria-label="Requests, newest first">
            {rows.map(r => <li key={r.id} className={r.leaves_computer ? '' : 'inside'}>
              <span className="sd-time">{shortStamp(r.at)}</span>
              <span className="sd-svc">{r.service_name}</span>
              <q className="sd-value">{r.value}</q>
              <span className="sd-why">{r.kind} · {r.reason || 'no reason recorded'} · {r.actor === 'you' ? 'you started it' : 'automatic'}
                {r.outcome === 'failed' && ' · ✕ failed on the way'}{!r.leaves_computer && ' · stayed on this computer'}</span>
            </li>)}
          </ol>}
      </section>

      <section className="sd-cards" aria-label="Keep it safe">
        <article className="sd-card">
          <p className="sd-eyebrow">Backup</p>
          <h3>{data.backup.last_backup_at ? `Last backup ${ago(data.backup.last_backup_at)}` : 'No backup made from here yet'}</h3>
          <p>Records, documents and history in one file. Restore makes a separate case; never merges.</p>
          <p className="sd-warn">{data.backup.encrypted ? '✓ Encrypted' : '▲ Not encrypted: keep it safe'}</p>
          <button type="button" className="sd-btn primary" onClick={() => go('backup-restore')}>Back up now</button>
        </article>
        <article className="sd-card">
          <p className="sd-eyebrow">Who can reach it</p>
          <h3>{data.access.mode === 'local_only' ? 'Only this computer' : 'This computer and devices with a token'}</h3>
          <p>{data.access.log_readable ? `${data.access.refused_24h} refused · 24 h` : 'The security log could not be read'}</p>
          <button type="button" className="sd-btn" onClick={() => go('access')}>Access settings</button>
        </article>
        <article className="sd-card">
          <p className="sd-eyebrow">Housekeeping</p>
          <h3>{data.housekeeping.stray_files === null || data.housekeeping.stray_files === undefined ? 'Could not check' : `${data.housekeeping.stray_files} stray ${data.housekeeping.stray_files === 1 ? 'file' : 'files'}`}</h3>
          <p>{data.housekeeping.stray_bytes ? `${bytesInWords(data.housekeeping.stray_bytes)} no document points to. ` : ''}Kept until you decide.</p>
          <button type="button" className="sd-btn" onClick={() => go('access')}>Look at them</button>
        </article>
        <article className="sd-card sd-danger">
          <p className="sd-eyebrow">Delete this case</p>
          <h3>Remove from this computer</h3>
          <p>See what goes first. Shared files stay. Cannot be undone.</p>
          <button type="button" className="sd-btn danger" onClick={() => go('deletion')}>Preview deletion</button>
        </article>
      </section>
    </div>
  </div>;
}
