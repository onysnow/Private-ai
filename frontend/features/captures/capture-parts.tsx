'use client';
// The pieces of a capture the screen shows (mockup INTAKE_3): the capture lane, what was sent and what came back, the
// receipt with its files and fingerprints. Every value is read from the capture's record; nothing is worked out here.
import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';

import {api} from '../../lib/api-instance';
import type {CaptureOut} from '../../lib/generated/types.gen';
import {bytesWords, displayedDate, hostOf, shortHash, utcWords} from './format';

const MARK: Record<string, string> = {done: '✓', skipped: '–', failed: '✕'};

export function Lane({capture}: {capture: CaptureOut}): ReactElement {
  const seconds = capture.steps.reduce((sum, s) => sum + s.seconds, 0);
  return <section className="cp-card" aria-label="Capture lane">
    <header className="cp-eyebrow"><span>Capture lane</span><span className={`cp-pill ${capture.outcome === 'saved' ? 'good' : 'warn'}`}>{capture.outcome === 'saved' ? `Done · ${seconds.toFixed(1)} s` : 'Stopped'}</span></header>
    <ol className="cp-steps">{capture.steps.map(s => <li key={s.key} className={`cp-step ${s.state}`} title={s.detail}>
      <span className="cp-step-name">{s.label}</span>
      <b><i aria-hidden="true">{MARK[s.state] ?? '·'}</i> {s.state === 'skipped' ? 'skipped' : `${s.seconds.toFixed(1)} s`}</b>
      <span className="cp-sr">{s.state}. {s.detail}</span>
    </li>)}</ol>
    {capture.steps.filter(s => s.state === 'skipped' && s.detail).map(s => <p key={s.key} className="cp-note">{s.label}: {s.detail}</p>)}
    <dl className="cp-facts">
      <div><dt>Tool</dt><dd>{capture.collector.browser ? `${String(capture.collector.browser)} · ${String(capture.collector.browser_version ?? '')}` : String(capture.collector.tool ?? '')}
        {capture.collector.browser ? <small>{String(capture.collector.version ?? '')}</small> : null}</dd></div>
      <div><dt>Collector</dt><dd>{String(capture.collector.runs_on ?? 'this computer')}</dd></div>
      <div><dt>Signed in?</dt><dd>{capture.collector.signed_in ? 'Yes' : 'No'} · {capture.collector.cookies_sent ? 'cookies sent' : 'no cookies sent'}</dd></div>
      <div><dt>Started</dt><dd>{utcWords(capture.started_at)}</dd></div>
      <div><dt>Ended</dt><dd>{utcWords(capture.ended_at)}</dd></div>
    </dl>
    <Wire capture={capture}/>
  </section>;
}

type Headers = [string, string][];
const pairs = (value: unknown): Headers => (Array.isArray(value) ? (value as Headers) : []);

/** The request as sent and the answer as served, word for word. What came back is the site's own claim, not verified. */
function Wire({capture}: {capture: CaptureOut}): ReactElement | null {
  const req = capture.request;
  const res = capture.response;
  if (!req) return null;
  const pick = (headers: Headers, names: string[]) => names.flatMap(n => headers.filter(([k]) => k.toLowerCase() === n).map(([k, v]) => [k, v] as const));
  const sent = pick(pairs(req.headers), ['accept-language', 'accept', 'user-agent']);
  const came = res ? pick(pairs(res.headers), ['content-type', 'last-modified', 'etag', 'location']) : [];
  const redirects = res && Array.isArray(res.redirects) ? (res.redirects as [number, string][]) : [];
  return <div className="cp-wire">
    <div>
      <p className="cp-eyebrow">What was sent</p>
      <pre aria-label="What was sent">{String(req.line)}{'\n'}{sent.map(([k, v]) => `${k}: ${v}`).join('\n')}{'\n'}Cookie: (none)</pre>
    </div>
    <div>
      <p className="cp-eyebrow">What came back <small>as served, not verified</small></p>
      <pre aria-label="What came back">{res ? `${String(res.http_version)} ${String(res.status)} ${String(res.reason)}` : 'Nothing came back.'}
        {redirects.map(([code, to]) => `\n${code} → ${to}`).join('')}{came.length ? '\n' : ''}{came.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
    </div>
  </div>;
}

function useFileUrl(investigationId: string, capture: CaptureOut, name: string, enabled: boolean): string | null {
  const blob = useQuery({queryKey: ['capture-file', capture.id, name], enabled,
    queryFn: () => api.blob(`/api/investigations/${investigationId}/captures/${capture.id}/files/${encodeURIComponent(name)}`), staleTime: Infinity});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const made = URL.createObjectURL(blob.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob.data]);
  return url;
}

function Copy({value, label}: {value: string; label: string}): ReactElement {
  const [done, setDone] = useState(false);
  return <button type="button" className="cp-mini" aria-label={label} onClick={() => {
    void navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => undefined);
  }}>{done ? 'copied' : 'copy'}</button>;
}

export function Receipt({capture, investigationId, onOpen, onCheck, checking}: {
  capture: CaptureOut; investigationId: string; onOpen: () => void; onCheck: () => void; checking: boolean;
}): ReactElement {
  const shot = capture.files.find(f => f.role === 'screenshot');
  const shotUrl = useFileUrl(investigationId, capture, shot?.name ?? '', Boolean(shot));
  const shown = capture.displayed ?? {};
  const bits = [shown.byline, shown.published].filter((x): x is string => typeof x === 'string' && x !== '');
  return <section className="cp-card" aria-label="Capture receipt">
    <header className="cp-eyebrow"><span>Capture receipt</span>
      <span className="cp-actions">
        {capture.document_id && <button type="button" className="cp-btn p" onClick={onOpen}>Open in reading room</button>}
        <button type="button" className="cp-btn" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : 'Re-check now'}</button>
      </span></header>
    <div className="cp-receipt">
      <div className="cp-thumb">{shotUrl
        // A picture made on this computer and read back as a blob: next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={shotUrl} alt={`Screenshot of ${capture.title ?? hostOf(capture.url)}, as the browser drew it`}/>
        : <p>{shot ? 'Loading the screenshot…' : 'No screenshot: the page was fetched without a browser.'}</p>}</div>
      <dl>
        <div><dt>SHA-256</dt><dd><code>{shortHash(capture.page_sha256)}</code> <Copy value={capture.page_sha256 ?? ''} label="Copy the page fingerprint"/></dd></div>
        <div><dt>Captured</dt><dd>{utcWords(capture.ended_at ?? capture.started_at)} by this computer’s clock</dd></div>
        <div><dt>Kept as</dt><dd><ul className="cp-files">{capture.files.map(f => <li key={f.name}>
          <code>{f.name}</code> <span>{bytesWords(f.size)}</span> <span className="cp-quiet">{f.note}</span>
          <Copy value={f.sha256} label={`Copy the fingerprint of ${f.name}`}/></li>)}</ul></dd></div>
        <div><dt>Displayed</dt><dd>{bits.length ? <>By {String(shown.byline ?? 'an unnamed author')}{shown.published ? ` · ${displayedDate(String(shown.published))}` : ''} <span className="cp-tag">As displayed, not verified</span></>
          : <span className="cp-quiet">The page shows no author or date.</span>}</dd></div>
      </dl>
    </div>
    <p className="cp-verify"><b>Content verified</b> <span><b>not done by this system.</b> A capture shows what was at the address, not that it is genuine.</span></p>
  </section>;
}
