'use client';
// "What lives where" (mockup KEEP-safety-and-data, research Keep §7): This computer as a bordered region holding the
// six stores, each with its count, where it is and whether it is in backups; outside the border, the services the case
// can reach, each with its mode chip (Off / Ask first / Automatic) and a line labelled with what is sent and how many
// times. Lines that are off are dotted and grey; a blocked one carries ✕. Pointing at a line lists its last requests;
// pointing at a store shows its path and size. A table twin says the same for a screen reader.
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import type {SafetyServiceOut, SafetySummaryOut, SettingsStatusOut} from '../../lib/generated/types.gen';
import {bytes, count, dayMonthYear, lineLabel, lineState, logTime, MODE_WORDS, plural, startedBy} from './format';

type Props = {
  summary: SafetySummaryOut;
  status: SettingsStatusOut | undefined;
  /** Mode changes go to the server; the screen refreshes from its reply. */
  onMode: (service: string, mode: SafetyServiceOut['mode']) => void;
  /** Pointing at a line and choosing it filters the outbound log to that service. */
  onPickService: (service: string) => void;
  pickedService: string | null;
  /** Services whose count went up since the last reply: their line pulses once. */
  pulsing: Set<string>;
  checking: boolean;
};

type Store = {key: string; icon: string; name: string; figures: string; where: string; backup: ReactNode; path?: string; size?: string};

function stores(summary: SafetySummaryOut, status: SettingsStatusOut | undefined): Store[] {
  const s = summary.stores;
  const backups = s.backups;
  const ai = s.private_ai;
  const aiFigures = !ai.enabled || !ai.provider ? 'Off' : ai.on_this_computer ? 'Local model · on' : `${ai.provider} · not on this computer`;
  return [
    {key: 'records', icon: '▦', name: 'Case records', figures: `${plural(s.records.total, 'record')} · ${plural(s.records.claims, 'claim')}`,
      where: 'Database on this machine', backup: <>In every backup <span aria-hidden="true">✓</span></>, path: status?.database || undefined},
    {key: 'documents', icon: '▢', name: 'Documents & pictures', figures: s.documents.files ? `${plural(s.documents.files, 'file')} · ${bytes(s.documents.size_bytes)}` : 'empty',
      where: s.documents.missing ? `Kept as received, checksummed · ${plural(s.documents.missing, 'file')} missing` : 'Kept as received, checksummed',
      backup: <>In every backup <span aria-hidden="true">✓</span></>, path: status?.document_storage_dir || undefined, size: bytes(s.documents.size_bytes)},
    {key: 'backups', icon: '⟲', name: 'Backups', figures: backups.count && backups.last_at ? `${plural(backups.count, 'copy', 'copies')} · ${dayMonthYear(backups.last_at)}` : 'none yet',
      where: 'Wherever you saved the file',
      backup: backups.encrypted ? <>Encrypted</> : <span className="sd-warn"><span aria-hidden="true">▲</span> Not encrypted: keep it safe</span>,
      size: backups.last_size_bytes != null ? `last ${bytes(backups.last_size_bytes)}` : undefined},
    {key: 'keys', icon: '⚿', name: 'Service keys', figures: `${count(s.service_keys.set)} of ${count(s.service_keys.total)} set`,
      where: 'Stored here, never shown again', backup: 'Not in backups'},
    {key: 'log', icon: '≡', name: 'Security log', figures: s.security_log.events == null ? `${s.security_log.keep_days} days kept` : `${plural(s.security_log.events, 'event')} · ${s.security_log.keep_days} days`,
      where: 'Who asked what, never the content', backup: 'Not in backups', size: s.security_log.size_bytes != null ? bytes(s.security_log.size_bytes) : undefined},
    {key: 'ai', icon: '◇', name: 'Private AI', figures: aiFigures,
      where: ai.outside_allowed ? 'Outside AI allowed on this server' : 'Outside AI not allowed', backup: null},
  ];
}

function ModeChip({service, onMode}: {service: SafetyServiceOut; onMode: Props['onMode']}): ReactElement {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  const cls = `sd-mode sd-mode-${service.mode.toLowerCase()}`;
  if (service.locked_reason) return <span className={cls} title={`${service.locked_reason}: it stays Off`}>{MODE_WORDS[service.mode]}</span>;
  return <span className="sd-mode-box" ref={box}>
    <button type="button" className={cls} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}
      aria-label={`${service.name}: ${MODE_WORDS[service.mode]}. Change`}>{MODE_WORDS[service.mode]}</button>
    {open && <span className="sd-mode-menu" role="radiogroup" aria-label={`${service.name}: what may leave`}>
      {(['OFF', 'ASK', 'AUTOMATIC'] as const).map(m => <label key={m} className={service.mode === m ? 'on' : ''}>
        <input type="radio" name={`mode-${service.service}`} checked={service.mode === m} onChange={() => { onMode(service.service, m); setOpen(false); }}/>
        <span>{MODE_WORDS[m]}</span>
        <small>{m === 'OFF' ? 'Nothing is sent' : m === 'ASK' ? 'Only what you start' : 'Your requests and automatic checks'}</small>
      </label>)}
    </span>}
  </span>;
}

type Geometry = {width: number; height: number; x0: number; lines: {service: string; y: number; x1: number}[]};

export function WhatLivesWhere({summary, status, onMode, onPickService, pickedService, pulsing, checking}: Props): ReactElement {
  const board = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const [geo, setGeo] = useState<Geometry | null>(null);
  const measure = useCallback(() => {
    const b = board.current?.getBoundingClientRect();
    const r = region.current?.getBoundingClientRect();
    if (!b || !r) return;
    const lines = summary.services.flatMap(s => {
      const c = cards.current.get(s.service)?.getBoundingClientRect();
      return c ? [{service: s.service, y: c.top + c.height / 2 - b.top, x1: c.left - b.left}] : [];
    });
    setGeo({width: b.width, height: b.height, x0: r.right - b.left, lines});
  }, [summary.services]);
  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined' || !board.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(board.current);
    return () => ro.disconnect();
  }, [measure]);

  const list = stores(summary, status);
  const byService = new Map(summary.services.map(s => [s.service, s]));
  return <div className={`sd-map${checking ? ' checking' : ''}`} ref={board}>
    <div className="sd-region" ref={region} aria-label="This computer, local only" role="group">
      <p className="sd-region-name">This computer · local only</p>
      <ul className="sd-stores">
        {list.map(st => <li key={st.key} className={`sd-store sd-store-${st.key}`} tabIndex={0} aria-describedby={`sd-tip-${st.key}`}>
          <h3><span className="sd-icon" aria-hidden="true">{st.icon}</span>{st.name}</h3>
          <p className="sd-fig">{st.figures}</p>
          <p className="sd-where">{st.where}</p>
          {st.backup && <p className="sd-where">{st.backup}</p>}
          <span className="sd-tip" role="tooltip" id={`sd-tip-${st.key}`}>
            {st.path ? <><b>Where</b> <code>{st.path}</code></> : <><b>Where</b> {st.where}</>}
            {st.size && <><br/><b>Size</b> {st.size}</>}
          </span>
        </li>)}
      </ul>
    </div>

    {geo && <svg className="sd-lines" width={geo.width} height={geo.height} aria-hidden="true">
      {geo.lines.map(l => {
        const s = byService.get(l.service);
        if (!s) return null;
        const state = lineState(s);
        const mid = (geo.x0 + l.x1) / 2;
        return <g key={l.service} className={`sd-line sd-line-${state}${pulsing.has(l.service) ? ' pulse' : ''}${pickedService === l.service ? ' picked' : ''}`}>
          <path d={`M ${geo.x0} ${l.y} C ${mid} ${l.y}, ${mid} ${l.y}, ${l.x1} ${l.y}`}/>
          <circle cx={geo.x0} cy={l.y} r={4}/>
        </g>;
      })}
    </svg>}
    {geo && geo.lines.map(l => {
      const s = byService.get(l.service);
      if (!s) return null;
      return <span key={l.service} className="sd-line-label-box" style={{left: geo.x0 + 12, top: l.y - 22, width: Math.max(60, l.x1 - geo.x0 - 20)}}>
        <button type="button" className={`sd-line-label sd-line-label-${lineState(s)}`} aria-describedby={`sd-last-${s.service}`}
          aria-pressed={pickedService === s.service} onClick={() => onPickService(s.service)}
          aria-label={`${s.name}: ${lineLabel(s)}. Show only its requests in the log`} title={lineLabel(s)}>{lineLabel(s)}</button>
        <span className="sd-tip sd-tip-line" role="tooltip" id={`sd-last-${s.service}`}>
          {s.last.length ? <>
            <b>Last requests to {s.name}</b>
            {s.last.map(r => <span key={r.id} className="sd-tip-row"><span className="sd-mono">{logTime(r.created_at)}</span> <q>{r.value_sent.length > 70 ? `${r.value_sent.slice(0, 70)}…` : r.value_sent}</q> · {startedBy(r)}</span>)}
          </> : <>Nothing sent to {s.name} in this period.</>}
        </span>
      </span>;
    })}

    <ul className="sd-services">
      {summary.services.map(s => <li key={s.service} className={`sd-service sd-service-${lineState(s)}`} ref={el => { if (el) cards.current.set(s.service, el); else cards.current.delete(s.service); }}>
        <h3>{s.name}</h3>
        <p>{s.locked_reason ?? (s.configured === false ? `${s.line} · no key set` : s.line)}</p>
        <ModeChip service={s} onMode={onMode}/>
      </li>)}
      <li className="sd-point" aria-hidden="true">Point at a line for its requests</li>
    </ul>

    <div className="sr-only">
      <table><caption>Stores on this computer</caption>
        <thead><tr><th scope="col">Store</th><th scope="col">Where</th><th scope="col">Size</th><th scope="col">In backups</th></tr></thead>
        <tbody>{list.map(st => <tr key={st.key}><th scope="row">{st.name}</th><td>{st.path ?? st.where}</td><td>{st.figures}</td>
          <td>{st.key === 'records' || st.key === 'documents' ? 'Yes' : st.key === 'backups' ? 'It is the backup' : st.key === 'ai' ? '—' : 'No'}</td></tr>)}</tbody>
      </table>
      <table><caption>Outside services</caption>
        <thead><tr><th scope="col">Service</th><th scope="col">Mode</th><th scope="col">What is sent</th><th scope="col">Count</th></tr></thead>
        <tbody>{summary.services.map(s => <tr key={s.service}><th scope="row">{s.name}</th><td>{MODE_WORDS[s.mode]}{s.locked_reason ? ` (${s.locked_reason})` : ''}</td>
          <td>{s.sent_kinds.map(k => k.value_kind).join(', ') || 'nothing'}</td><td>{count(s.sent_count)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>;
}
