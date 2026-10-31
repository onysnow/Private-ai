'use client';
// Safety & data (Keep; mockup KNOWLEDGE_KEEP_2, ADR-0015): "What lives on this computer, and what leaves it". The
// totals (zeroes stated) and the period switch; the six places the case lives inside a bordered "This computer"; the
// services it can reach outside, each with the line out labelled with what was sent and how often (dotted when off);
// four cards to keep it safe (Backup, Who can reach it, Housekeeping, Delete this case); and the outbound log, word for
// word, scrolling inside. Everything on it comes from the server's own rows (backend app/services/safety_data.py): a
// thing the app does not record is not drawn. The diagram has a table twin for screen readers, and each line to a
// service is a focusable item whose last requests show in the log filter. The page never scrolls.
// Pointing at a service (a pause, as every hover card here) shows its last requests in a card that stays while the
// pointer is on it and closes with Esc; a request that left since the last look makes its line pulse once (motion
// explains a change; with reduced or calm motion the line is marked without moving). Hide screen is on the page.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement} from 'react';

import {hideScreen} from '../../components/frame/app-frame';
import {Reveal} from '../../components/ui/reveal';
import '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getSafetyDataOptions, getSigningKeyOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {OutboundRequestOut, SafetyDataOut, SafetyServiceOut, SafetyStoreOut} from '../../lib/generated/types.gen';
import {apiTime, shortStamp} from '../../lib/timestamps';
import {YourSafety} from './your-safety';

type Period = SafetyDataOut['period'];
const PERIODS: [Period, string][] = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']];

const STATE: Record<SafetyServiceOut['state'], string> = {off: 'OFF', ask_first: 'ASK FIRST', automatic: 'AUTOMATIC', on_request: 'ON REQUEST', local: 'LOCAL'};
/** How long a pointer rests on a line before its card opens (the research's dwell for hover cards). */
const DWELL_MS = 250;
/** Every 20 s while the page shows, so a request that leaves while you watch appears and its line pulses. */
const REFRESH_MS = 20_000;
const PULSE_MS = 1600;
// The AI store is the plum AI mark (◇ is a proposal elsewhere in the app).
export const STORE_MARK: Record<string, string> = {records: '≡', documents: '▤', backups: '⟲', keys: '⚿', log: '≣', ai: 'AI'};
/** A service's mode as a shape, named on hover: ⊘ off, ? ask first, ↻ automatic, ↗ on request, ⌂ local. */
const STATE_MARK: Record<SafetyServiceOut['state'], string> = {off: '⊘', ask_first: '?', automatic: '↻', on_request: '↗', local: '⌂'};

export const bytesInWords = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

/** "3 days ago", "today", "never": how long ago, in the words the Keep cards use. */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'never';
  const days = Math.floor((now.getTime() - apiTime(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The log as a comma-separated table for a source-protection file (research §14: "Export log"). */
export function logCsv(rows: OutboundRequestOut[]): string {
  // A cell that starts with = + - @ (or a tab or return) would be run as a formula by a spreadsheet: a ' first keeps it as text.
  const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const head = ['time', 'service', 'kind of value', 'value sent', 'why', 'who started it', 'left this computer', 'result'];
  return [head, ...rows.map(r => [r.at, r.service_name, r.kind, r.value, r.reason, r.actor === 'you' ? 'you' : 'automatic', r.leaves_computer ? 'yes' : 'no', r.outcome])]
    .map(line => line.map(cell).join(',')).join('\n');
}

function storeFigure(s: SafetyStoreOut): string {
  if (s.id === 'documents') return `${(s.count ?? 0).toLocaleString()} ${s.count === 1 ? 'file' : 'files'} · ${bytesInWords(s.bytes ?? 0)}`;
  if (s.id === 'records') return `${(s.count ?? 0).toLocaleString()} records · ${s.count_note ?? ''}`.replace(/ · $/, '');
  if (s.id === 'keys') return `${s.count} ${s.count_note ?? ''}`.trim();
  if (s.id === 'log') return `${(s.count ?? 0).toLocaleString()} events`;
  if (s.id === 'backups') return s.count ? 'Downloaded from here' : 'None made from here yet';
  return '';
}

/** A store's figure as the card shows it: the number big, its unit, and the rest of the line small. */
export function storeParts(s: SafetyStoreOut): [string, string, string] {
  const n = (s.count ?? 0).toLocaleString();
  if (s.id === 'records') return [n, s.count === 1 ? 'record' : 'records', s.count_note ?? ''];
  if (s.id === 'documents') return [n, s.count === 1 ? 'file' : 'files', bytesInWords(s.bytes ?? 0)];
  if (s.id === 'keys') return [n, s.count_note ?? 'set', ''];
  if (s.id === 'log') return [n, s.count === 1 ? 'event' : 'events', ''];
  if (s.id === 'backups') return s.count ? [n, 'downloaded from here', ''] : ['None', 'made from here yet', ''];
  if (s.id === 'ai') return [s.where, '', ''];
  return ['', '', storeFigure(s)];
}

/** A service's own requests in the log: an outside AI's rows carry their provider ("ai:…"). */
const ofService = (id: string) => (r: OutboundRequestOut) => (id === 'ai' ? r.service.startsWith('ai') : r.service === id);

const inBackups = (s: SafetyStoreOut): string => (s.in_backups === true ? 'In every backup ✓' : s.in_backups === false ? 'Not in backups' : '');

/** The key this computer signs evidence packs with: its fingerprint, to read out to whoever receives a pack. */
function SigningKey(): ReactElement {
  const key = useQuery(getSigningKeyOptions()).data;
  return <article className="sd-card" aria-label="Pack signing key">
    <p className="sd-eyebrow">Pack signing key</p>
    <h3>{key?.fingerprint ? <code className="sd-fp">{key.fingerprint}</code> : 'Made with the first evidence pack'}</h3>
    <p><Reveal detail="Each evidence pack’s list of files is signed with this computer’s key. Give this fingerprint to whoever receives a pack, so they can tell it was yours. The key never leaves this computer and is not in a case backup."><span>Read it out to whoever gets a pack</span></Reveal></p>
  </article>;
}

export function SafetyScreen({investigationId, caseName, active = true}: {investigationId: string; caseName?: string; active?: boolean}): ReactElement {
  const [period, setPeriod] = useState<Period>('7d');
  const [only, setOnly] = useState<string | null>(null);
  const query = useQuery({...getSafetyDataOptions({path: {investigation_id: investigationId}, query: {period}}), enabled: Boolean(investigationId) && active,
    refetchInterval: active ? REFRESH_MS : false});
  const data = query.data;

  const rows = useMemo(() => (data?.outbound ?? []).filter(r => !only || ofService(only)(r)), [data, only]);

  // The card on a service's line, after a pause; Esc closes it.
  const [card, setCard] = useState<string | null>(null);
  const dwell = useRef<number | undefined>(undefined);
  const point = (id: string | null) => {
    window.clearTimeout(dwell.current);
    if (id === null) { setCard(null); return; }
    dwell.current = window.setTimeout(() => setCard(id), DWELL_MS);
  };
  useEffect(() => () => window.clearTimeout(dwell.current), []);
  useEffect(() => {
    if (!card) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.shiftKey) setCard(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  // A line pulses when its count went up since the last look at the same period.
  const seen = useRef<{period: Period; counts: Record<string, number>} | null>(null);
  const [pulsing, setPulsing] = useState<string[]>([]);
  useEffect(() => {
    if (!data) return undefined;
    const counts = Object.fromEntries(data.services.map(s => [s.id, s.sent_count]));
    const before = seen.current?.period === data.period ? seen.current.counts : null;
    seen.current = {period: data.period, counts};
    const grew = before ? data.services.filter(s => s.sent_count > (before[s.id] ?? 0)).map(s => s.id) : [];
    if (!grew.length) return undefined;
    setPulsing(grew);
    const t = window.setTimeout(() => setPulsing([]), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [data]);
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
        <h2 className="sd-title"><Reveal detail={`${caseName ? `${caseName} · ` : ''}${data.exposure}${stale}`}><span>What lives on <em>this computer</em>, and what leaves it</span></Reveal></h2>
      </div>
      <span className={`sd-chip${nothingLeft ? '' : ' sd-chip-out'}`}>{nothingLeft ? '◉ no requests logged in this period' : `↗ ${t.requests_left} left in this period`}</span>
      <Reveal tabbable={false} detail="Cover the screen at once (⇧Esc)."><button type="button" className="sd-btn sd-hide" onClick={hideScreen}>◐ Hide screen</button></Reveal>
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
              {/* The figure shows; where it lives and whether backups hold it are revealed on the store. A warning stays. */}
              {/* Each store is a titled card with its number big (fill the space); the rest of its line is small. */}
              {data.stores.map(s => { const [big, unit, rest] = storeParts(s); return <li key={s.id} className={`sd-store sd-store-${s.id}`}>
                <span className="sd-store-head">
                  <span className={`sd-mark${s.id === 'ai' ? ' sd-mark-ai' : ''}`} aria-hidden="true">{STORE_MARK[s.id]}</span>
                  <Reveal detail={<><span className="rv-row rv-mono">{s.where}</span>{inBackups(s) && <span className="rv-row">{inBackups(s)}</span>}</>}><strong>{s.name}</strong></Reveal>
                  {s.in_backups === true && !s.warning && <span className="sd-inbk" aria-hidden="true">⟲</span>}
                </span>
                <span className="sd-fig"><b>{big}</b>{unit ? ` ${unit}` : ''}</span>
                {rest ? <span className="sd-rest">{rest}</span> : null}
                {s.warning ? <span className="sd-warn">▲ {s.warning}</span> : null}
              </li>; })}
            </ul>
          </div>
          <ul className="sd-services" aria-label="Services this case can reach">
            {data.services.map(s => {
              const line = s.sent_count ? `${s.sends.join(', ')} · ${s.sent_count}` : s.where === 'inside' ? '' : s.state === 'off' ? 'nothing sent' : 'never used';
              // The line is labelled only when something went down it (or it is blocked); an unused line is faint.
              const last = card === s.id ? (data.outbound ?? []).filter(ofService(s.id)).slice(0, 3) : [];
              return <li key={s.id} className={`sd-service sd-${s.state}${s.sent_count ? ' sd-used' : ''}${only === s.id ? ' picked' : ''}${pulsing.includes(s.id) ? ' sd-pulse' : ''}`}
                onPointerEnter={() => point(s.id)} onPointerLeave={() => point(null)} onFocus={() => point(s.id)}
                onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) point(null); }}>
                <span className="sd-line" aria-hidden="true">{s.blocked_note && !s.sent_count ? <i>✕ blocked</i> : s.sent_count ? <i>{line}</i> : null}</span>
                <button type="button" className="sd-box" aria-pressed={only === s.id} aria-describedby={card === s.id ? `sd-card-${s.id}` : undefined}
                  onClick={() => setOnly(only === s.id ? null : s.id)}
                  aria-label={`${s.name}: ${STATE[s.state]}. ${line || s.state_note}. ${s.sent_count ? 'Show its requests in the log.' : ''}`}>
                  <strong>{s.name}</strong>
                  {/* The mode is its shape; its name, what the service is and its note are in the card on hover or focus. */}
                  <span className="sd-state" aria-hidden="true">{STATE_MARK[s.state]}</span>
                  {s.about && s.about !== 'None' ? <span className="sd-about" aria-hidden="true">{s.about}</span> : null}
                </button>
                {card === s.id ? <div className="sd-card-hover" role="tooltip" id={`sd-card-${s.id}`}>
                  <p className="sd-eyebrow">{s.name} · {STATE[s.state].toLowerCase()}</p>
                  {s.about && <p>{s.about}</p>}
                  <p>{s.blocked_note ?? s.state_note}</p>
                  {last.length ? <ol>{last.map(r => <li key={r.id}><span className="sd-time">{shortStamp(r.at)}</span> <q>{r.value}</q> <span>{r.kind}</span></li>)}</ol>
                    : <p className="sd-quiet">Nothing sent to it in this period.</p>}
                </div> : null}
              </li>;
            })}
          </ul>
        </div>
        <p className="sd-foot"><Reveal label="Using the services" detail="A bright line has carried requests; a faint one has carried none in this period; a dotted one is off. Point at a line for its requests; press a service to filter the log to it."><span aria-hidden="true">ⓘ</span></Reveal></p>
        <table className="sd-twin">
          <caption>What lives where, and what can leave</caption>
          <thead><tr><th>Store</th><th>Where</th><th>Size</th><th>In backups</th></tr></thead>
          <tbody>{data.stores.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.where}</td><td>{storeFigure(s)}</td><td>{inBackups(s) || 'not applicable'}</td></tr>)}</tbody>
          <thead><tr><th>Service</th><th>Mode</th><th>What is sent</th><th>Count</th></tr></thead>
          <tbody>{data.services.map(s => <tr key={s.id}><td>{s.name}</td><td>{STATE[s.state]}: {s.state_note}</td><td>{s.sends.join(', ') || 'nothing'}</td><td>{s.sent_count}</td></tr>)}</tbody>
        </table>
      </section>

      <div className="sd-right">
      <YourSafety investigationId={investigationId}/>
      <section className={`sd-panel sd-log${rows.length ? '' : ' sd-log-empty'}`} aria-label="Outbound log">
        <p className="sd-eyebrow">Outbound log <Reveal label="Append-only" detail="Append-only: nothing in it can be changed or removed."><span aria-hidden="true">🔒</span></Reveal></p>
        <h3 className="sd-h3">What left, word for word</h3>
        <div className="sd-logbar">
          {/* With nothing in the log there is nothing to filter: the bar holds the empty line instead (one row, not three). */}
          {data.outbound_total > 0 || only ? <select aria-label="Service" value={only ?? ''} onChange={e => setOnly(e.target.value || null)}>
            <option value="">All services</option>
            {data.services.filter(s => s.where === 'outside' || s.sent_count > 0).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select> : null}
          {rows.length ? <span className="sd-count">{rows.length} of {data.outbound_total}</span>
            : <p className="sd-quiet sd-empty">{only ? 'Nothing has been sent to that service in this period.' : 'Nothing has left this computer in this period.'}
              {' '}<Reveal label="What appears here" detail="Each request that leaves this computer: when, to which service, the exact value sent (a name, an address, a search), why, and whether you or an automatic check started it."><span aria-hidden="true">ⓘ</span></Reveal></p>}
          <button type="button" className="sd-btn" disabled={!rows.length} onClick={() => {
            const blob = new Blob([logCsv(rows)], {type: 'text/csv'});
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `outbound-log-${investigationId}.csv`; a.click(); URL.revokeObjectURL(a.href);
          }}>Export log</button>
        </div>
        {rows.length === 0 ? null
          : <ol className="sd-rows" tabIndex={0} aria-label="Requests, newest first">
            {/* Time, service and value show; the kind, why and who started it are revealed on the value. A failure stays
                visible, and a request that stayed on this computer is the ⌂ mark. */}
            {rows.map(r => <li key={r.id} className={r.leaves_computer ? '' : 'inside'}>
              <span className="sd-time">{shortStamp(r.at)}</span>
              <span className="sd-svc">{r.service_name}</span>
              <Reveal detail={`${r.kind} · ${r.reason || 'no reason recorded'} · ${r.actor === 'you' ? 'you started it' : 'automatic'}${!r.leaves_computer ? ' · stayed on this computer' : ''}`}>
                <q className="sd-value">{r.value}</q></Reveal>
              {(r.outcome === 'failed' || !r.leaves_computer) && <span className="sd-why">{r.outcome === 'failed' && <b className="sd-failed">✕ failed on the way</b>}
                {!r.leaves_computer && <Reveal label="Stayed on this computer" detail="Stayed on this computer"><span aria-hidden="true"> ⌂</span></Reveal>}</span>}
            </li>)}
          </ol>}
      </section>
      </div>

      <section className="sd-cards" aria-label="Keep it safe">
        <article className="sd-card">
          <p className="sd-eyebrow"><Reveal detail="Records, documents and history in one file. Restore makes a separate case; never merges."><span>Backup</span></Reveal></p>
          <h3>{data.backup.last_backup_at ? `Last backup ${ago(data.backup.last_backup_at)}` : 'No backup made from here yet'}</h3>
          {data.backup.bytes != null ? <p className="sd-kept">{bytesInWords(data.backup.bytes)}{data.backup.sha256
            ? <> · <Reveal detail={<span className="rv-mono">SHA-256 {data.backup.sha256}</span>}><span>✓ checksum kept</span></Reveal></> : ''}</p> : null}
          <p className="sd-warn">{data.backup.encrypted ? '✓ Encrypted' : '▲ Not encrypted: keep it safe'}</p>
          <div className="sd-btns">
            <button type="button" className="sd-btn primary" onClick={() => go('backup-restore')}>Back up now</button>
            {data.backup.restore_enabled ? <button type="button" className="sd-btn" onClick={() => go('backup-restore')}>Restore…</button> : null}
          </div>
        </article>
        <article className="sd-card">
          <p className="sd-eyebrow">Who can reach it</p>
          <h3>{data.access.mode === 'local_only' ? 'Only this computer' : 'This computer and devices with a token'}</h3>
          <p className={data.access.log_readable ? 'sd-kept' : ''}>{data.access.log_readable ? `${data.access.refused_24h} refused · 24 h` : 'The security log could not be read'}</p>
          <button type="button" className="sd-btn" onClick={() => go('access')}>Access settings</button>
        </article>
        <article className="sd-card">
          <p className="sd-eyebrow">Housekeeping</p>
          <h3>{data.housekeeping.stray_files === null || data.housekeeping.stray_files === undefined ? 'Could not check' : `${data.housekeeping.stray_files} stray ${data.housekeeping.stray_files === 1 ? 'file' : 'files'}`}</h3>
          <p className="sd-kept">{data.housekeeping.stray_files == null ? '' : `${bytesInWords(data.housekeeping.stray_bytes ?? 0)} `}<Reveal detail="Files in the case folder that no document points to. Kept until you decide." label="About stray files"><span aria-hidden="true">ⓘ</span></Reveal></p>
          <button type="button" className="sd-btn" onClick={() => go('access')}>Look at them</button>
        </article>
        <SigningKey/>
        <article className="sd-card sd-danger">
          <p className="sd-eyebrow">Delete this case</p>
          <h3>Remove from this computer</h3>
          <p><Reveal detail="See what goes first. Shared files stay."><span>Cannot be undone.</span></Reveal></p>
          <button type="button" className="sd-btn danger" onClick={() => go('deletion')}>Preview deletion</button>
        </article>
      </section>
    </div>
  </div>;
}
