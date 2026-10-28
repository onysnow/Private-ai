'use client';
// Links & captures (The Drop's second tab; mockup INTAKE_3, ADR-0018): a pasted link becomes a source. Left, the link
// field, the links this case has captured and what leaves this computer; middle, the chosen capture: its lane (each
// stage with its seconds), who captured it with what and when, what was sent and what came back, and its receipt (the
// picture with its clock band, the SHA-256, each kept file, what the page displayed, "content verified: not done by
// this system"); right, capture before use. A login wall is "not seen" and a page that could not be kept is "link only",
// each with its reason: outcomes, not gaps. Captures run as jobs; the list follows them while one is running.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {UseQueryResult} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {api} from '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getCapturesOptions, getCapturesQueryKey, getDropQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createCapture} from '../../lib/generated/sdk.gen';
import type {CaptureOut, CaptureStageOut, GetCapturesError} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';

/** One http or https address with a host and no spaces: what the link field and a paste into the drop capture. */
export function isWebAddress(text: string): boolean {
  const clean = text.trim();
  if (!clean || /\s/.test(clean)) return false;
  try {
    const url = new URL(clean);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch { return false; }
}

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src)$/i;

/** The address as it is compared with the case's captures: tracking parts, the fragment and a trailing slash removed,
 *  the host in lower case (mockup INTAKE_3, "Already in the case"). */
export function sameLink(text: string): string {
  try {
    const url = new URL(text.trim());
    [...url.searchParams.keys()].filter(k => TRACKING.test(k)).forEach(k => url.searchParams.delete(k));
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/(\?|$)/, '$1');
  } catch { return text.trim(); }
}

const running = (c: CaptureOut) => c.status === 'queued' || c.status === 'capturing';
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const shortUrl = (url: string) => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname}${u.search}`; } catch { return url; } };

/** The chip and glyph a capture shows: its outcome, or that it is still going or stopped. */
export function captureState(c: CaptureOut): {word: string; tone: 'ok' | 'bad' | 'amber' | 'teal'; glyph: string} {
  if (c.status === 'failed') return {word: 'Stopped', tone: 'bad', glyph: '✕'};
  if (running(c)) return {word: c.status === 'queued' ? 'Waiting' : 'Capturing', tone: 'teal', glyph: '…'};
  if (c.outcome === 'saved') return {word: 'Saved', tone: 'ok', glyph: '✓'};
  if (c.outcome === 'not_seen') return {word: 'Not seen', tone: 'amber', glyph: '○'};
  return {word: 'Link only', tone: 'bad', glyph: '!'};
}

export function captureTitle(c: CaptureOut): string {
  // A page that could not be kept has no title of its own: an error page's title is not the page's.
  if (c.outcome === 'link_only') return 'Title not available';
  return c.displayed.title || (c.outcome === 'saved' ? host(c.final_url || c.url) : 'Title not available');
}

/** What the lane's caption says: the total when done, where it stopped, or that it is working. */
export function laneSummary(c: CaptureOut): string {
  if (running(c)) return c.status === 'queued' ? 'Waiting to start' : 'Capturing';
  const stopped = c.stages.find(s => s.state === 'stopped');
  if (stopped) return `Stopped at “${stopped.label}”`;
  if (c.outcome !== 'saved' && (c.http_status ?? 0) >= 400) return `Stopped at “Page fetched” · ${c.http_status}`;
  const total = c.stages.reduce((sum, s) => sum + (s.seconds ?? 0), 0);
  return `Done · ${total.toFixed(1)} s`;
}

const utc = (iso?: string | null) => iso ? `${apiTime(iso).toISOString().replace('T', ' ').slice(0, 19)} UTC` : '–';
const clock = (iso?: string | null) => iso ? `${apiTime(iso).toISOString().slice(11, 19)} UTC` : '–';
const size = (n: number) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const collectorName = (c: CaptureOut) => (!c.collector || c.collector === 'local-owner' ? 'you' : c.collector);
const spaced = (hash: string) => `${hash.slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ')} …${hash.slice(-8, -4)} ${hash.slice(-4)}`;

function Stage({stage, live, refused}: {stage: CaptureStageOut; live: boolean; refused?: number | null}): ReactElement {
  // The site answered with an error (404, 403): the page itself was not fetched, whatever was kept of the reply.
  if (refused && stage.key === 'fetched') return <li className="cp-st stopped"><span className="cp-k">{stage.label}</span><span className="cp-v">✕ {refused}</span></li>;
  const state = live ? 'live' : stage.state;
  const mark = {done: '✓ ', stopped: '✕ ', live: '… ', waiting: '', skipped: ''}[state];
  const value = stage.state === 'done' && stage.seconds !== null && stage.seconds !== undefined ? `${stage.seconds.toFixed(1)} s`
    : stage.state === 'skipped' ? 'not run' : stage.state === 'stopped' ? 'stopped' : live ? 'working' : '';
  return <li className={`cp-st ${state}`}><span className="cp-k">{stage.label}</span><span className="cp-v">{mark}{value}</span></li>;
}

function Download({capture, name, children}: {capture: CaptureOut; name: string; children: ReactElement | string}): ReactElement {
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      const blob = await api.blob(`/api/captures/${capture.id}/files/${encodeURIComponent(name)}`);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), {href: url, download: name});
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (e) { setError(errorMessage(e, 'Could not get the file')); }
  };
  return <><button type="button" className="cp-file" onClick={() => void save()}>{children}</button>{error && <span role="alert" className="cp-err">{error}</span>}</>;
}

function Shot({capture}: {capture: CaptureOut}): ReactElement | null {
  const has = capture.files.some(f => f.name === 'screenshot.png');
  const image = useQuery({queryKey: ['capture-shot', capture.id], queryFn: () => api.blob(`/api/captures/${capture.id}/files/screenshot.png`),
    enabled: has, staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.data) return undefined;
    const made = URL.createObjectURL(image.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image.data]);
  if (!has || image.isError) return null;
  // A blob of the kept picture, so next/image has nothing to optimise.
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="cp-shot">{url ? <img src={url} alt={`The page as captured, under a band with its address and the clock, ${clock(capture.captured_at)}`}/> : <span className="cp-wait" aria-busy="true"/>}</span>;
}

function Lane({capture}: {capture: CaptureOut}): ReactElement {
  const firstWaiting = running(capture) ? capture.stages.findIndex(s => s.state === 'waiting') : -1;
  const sent = capture.exchange.request;
  const back = capture.exchange.response;
  return <section className="cp-panel" aria-label="Capture lane">
    <p className="cp-cap">Capture lane <span className={`cp-chip ${running(capture) ? 'teal' : capture.stages.some(s => s.state === 'stopped') ? 'bad' : 'teal'}`}>{laneSummary(capture)}</span></p>
    <ol className="cp-lane" aria-label="Capture stages">{capture.stages.map((s, i) => <Stage key={s.key} stage={s} live={i === firstWaiting} refused={capture.outcome !== 'saved' && (capture.http_status ?? 0) >= 400 ? capture.http_status : null}/>)}</ol>
    <dl className="cp-facts">
      <div><dt>Tool</dt><dd>{capture.tool?.replace('Journalism Workbench web capture: ', '') || '–'}</dd></div>
      <div><dt>Collector</dt><dd>{collectorName(capture)} · this computer</dd></div>
      <div><dt>Signed in?</dt><dd>No · no cookies sent</dd></div>
      <div><dt>Started</dt><dd>{utc(capture.started_at ?? capture.requested_at)}</dd></div>
      <div><dt>Ended</dt><dd>{utc(capture.finished_at)}</dd></div>
      <div><dt>Clock shown in capture</dt><dd>{clock(capture.captured_at)}</dd></div>
    </dl>
    {(sent || back) && <div className="cp-hdrs">
      <p><span>What was sent</span><span>What came back · as served, not verified</span></p>
      <div>{sent && <><b>{sent.method}</b> {sent.target}{sent.headers.map(([k, v]) => <span key={k}><br/><b>{k}:</b> {v}</span>)}</>}</div>
      <div>{back && <><b>{back.status}</b>{back.headers.map(([k, v]) => <span key={k}><br/><b>{k}:</b> {v}</span>)}</>}</div>
    </div>}
    {capture.robots_disallowed && <p className="cp-note">The site’s robots.txt asks robots not to fetch this page. A one-off capture notes it and goes ahead.</p>}
  </section>;
}

function Receipt({capture}: {capture: CaptureOut}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const [copied, setCopied] = useState(false);
  const warc = capture.files.find(f => f.name === 'page.warc.gz') ?? capture.files[0];
  const {author, published} = capture.displayed;
  return <section className="cp-panel" aria-label="Capture receipt">
    <div className="cp-cap">Capture receipt
      <span className="cp-acts">{capture.document_id && <button type="button" className="p" onClick={() => openDocument(capture.document_id!)}>Open in reading room</button>}</span></div>
    <div className="cp-rcpt">
      <Shot capture={capture}/>
      <dl className="cp-kv">
        {warc && <><dt>SHA-256</dt><dd><code title={warc.sha256}>{spaced(warc.sha256)}</code>
          <button type="button" className="cp-copy" onClick={() => void navigator.clipboard?.writeText(warc.sha256).then(() => setCopied(true))}
            aria-label={`Copy the SHA-256 of ${warc.name}`}>{copied ? 'copied' : 'copy'}</button> <small>of {warc.name}</small></dd></>}
        <dt>Captured</dt><dd>{utc(capture.captured_at ?? capture.finished_at)} <small>by this computer’s clock</small></dd>
        <dt>Kept as</dt><dd className="cp-files">{capture.files.length ? capture.files.map(f => <div key={f.name}>
          <Download capture={capture} name={f.name}>{f.name}</Download> <em>{size(f.bytes)} · {f.role}</em></div>) : 'Nothing: no page came back'}</dd>
        <dt>Time proof</dt><dd>Local clock only ({clock(capture.captured_at)}). <small>Independent proof not asked for.</small></dd>
        {(author || published) && <><dt>Displayed</dt><dd>{author ? `By “${author}”` : ''}{author && published ? ' · ' : ''}{published ?? ''} <span className="cp-chip dash">as displayed, not verified</span></dd></>}
        <dt>Custody</dt><dd>{utc(capture.captured_at ?? capture.finished_at).slice(0, 16)} captured on this computer by {collectorName(capture)}; kept unaltered, in the case’s records.</dd>
      </dl>
    </div>
    <p className="cp-cv"><b>Content verified</b><span><strong>{capture.content_verified}.</strong> A capture shows what was at the address, not that it is genuine.</span></p>
  </section>;
}

function Outcome({capture, onAddFile}: {capture: CaptureOut; onAddFile: () => void}): ReactElement {
  const wall = capture.outcome === 'not_seen';
  return <section className="cp-panel" aria-label={wall ? 'Not seen' : 'Link only'}>
    <p className="cp-out"><span className={`cp-chip big ${wall ? 'amber' : 'bad'}`}>{wall ? 'Not seen' : capture.status === 'failed' ? 'Stopped' : 'Link only'}</span>
      <b>{wall ? 'A login wall, paywall or block was in the way' : 'Saved as a link, with the reason'}</b></p>
    <p>{capture.reason}</p>
    {wall ? <p>What was kept is what the site showed instead, marked <b>not seen</b>, never “shown”. This app signs in to nothing: no accounts, no cookies, no saved sessions.</p>
      : <p>That is an <b>outcome, not a gap</b>: it is logged with its reason and time. Nothing can be quoted from this link.</p>}
    <dl className="cp-kv">
      <dt>Kept</dt><dd>{capture.files.length ? <>The address, the time, and what the site sent instead: {capture.files.map(f => f.name).join(', ')}</> : 'The address as pasted and the time'}</dd>
      <dt>Can be quoted</dt><dd>{wall ? 'As what the site showed, not as the page' : 'Nothing'}</dd>
    </dl>
    <div className="cp-acts"><button type="button" className="p" onClick={onAddFile}>Add a file I saved (PDF, screenshot, .html)</button></div>
    <p className="cp-note">A file you add is kept as one you supplied, with you as its source.</p>
  </section>;
}

export function CaptureLinkField({investigationId, captures, onCaptured}: {investigationId: string; captures: CaptureOut[]; onCaptured: (id: string) => void}): ReactElement {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [already, setAlready] = useState<CaptureOut | null>(null);
  const capture = async (url: string, again = false) => {
    const match = again ? undefined : captures.find(c => c.outcome === 'saved' && sameLink(c.url) === sameLink(url));
    if (match) { setAlready(match); setStatus(''); return; }
    setAlready(null);
    setStatus('Starting the capture…');
    try {
      const made = (await createCapture({path: {investigation_id: investigationId}, body: {url: url.trim()}, throwOnError: true})).data;
      setText('');
      setStatus('');
      onCaptured(made.id);
      // A capture the server finished before answering has already added its page: the drop is read again too.
      await Promise.all([queryClient.invalidateQueries({queryKey: getCapturesQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})})]);
    } catch (error) { setStatus(errorMessage(error, 'Could not capture that link')); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isWebAddress(text)) { setStatus('Give a web address that starts with http:// or https://'); return; }
    void capture(text);
  };
  return <section className="cp-card cp-paste" aria-label="Paste a link">
    <p className="dp-eyebrow">Paste a link</p>
    <form className="cp-linkfield" onSubmit={submit}>
      <input type="url" inputMode="url" value={text} onChange={e => { setText(e.target.value); setAlready(null); }} placeholder="https://…" aria-label="Web address to capture"/>
      <button type="submit" className="p">Capture</button>
    </form>
    <p className="dp-quiet">Links, files and pasted text share one drop: a link pasted into the drop is captured too.</p>
    {already && <div className="cp-already" role="status">
      <p><span className="cp-chip teal">Already in the case</span> captured {utc(already.captured_at ?? already.finished_at)}</p>
      <div className="cp-acts"><button type="button" className="p" onClick={() => { onCaptured(already.id); setAlready(null); setText(''); }}>Open that one</button>
        <button type="button" onClick={() => void capture(text || already.url, true)}>Capture again as a new version</button></div>
    </div>}
    {status && <p role="status" className="dp-status">{status}</p>}
  </section>;
}

export function useCaptures(investigationId: string): UseQueryResult<CaptureOut[], GetCapturesError> {
  return useQuery({...getCapturesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId),
    refetchInterval: q => (q.state.data?.some(running) ? 1500 : false)});
}

/** The tab's three columns, set in The Drop's own grid. */
export function Captures({investigationId, picked, onPick, onAddFile, notice = ''}: {investigationId: string; picked: string | null; onPick: (id: string) => void;
  onAddFile: () => void; notice?: string}): ReactElement {
  const query = useCaptures(investigationId);
  const captures = useMemo(() => query.data ?? [], [query.data]);
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const chosen = captures.find(c => c.id === picked) ?? captures[0];
  const state = chosen ? captureState(chosen) : null;
  return <>
    <div className="dp-left">
      <CaptureLinkField investigationId={investigationId} captures={captures} onCaptured={onPick}/>
      {notice && <p role="status" className="cp-card dp-status">{notice}</p>}
      <section className="cp-card" aria-label="Links in this case">
        <p className="dp-eyebrow cp-row">This case <span>{captures.length} link{captures.length === 1 ? '' : 's'}</span></p>
        {captures.length ? <ul className="cp-list">{captures.map(c => { const s = captureState(c); return <li key={c.id}>
          <button type="button" aria-pressed={c.id === chosen?.id} className={c.id === chosen?.id ? 'on' : ''} onClick={() => onPick(c.id)}>
            <span className={`cp-glyph ${s.tone}`} aria-hidden="true">{s.glyph}</span>
            <span className="cp-li"><b>{captureTitle(c)}</b><span><span className={`cp-chip ${s.tone}`}>{s.word}</span><small>{shortUrl(c.url)}</small></span></span>
          </button></li>; })}</ul>
          : <p className="dp-quiet">{query.isPending ? 'Looking…' : 'No links yet. Paste one above.'}</p>}
      </section>
      <section className="cp-card" aria-label="What leaves this computer">
        <p className="dp-eyebrow cp-row">What leaves this computer <span className="cp-chip dash">ask first</span></p>
        <p className="cp-safe"><b>✓ Nothing third-party is contacted.</b> The page is fetched from this computer.</p>
        <p className="dp-quiet">The page’s own site sees one visit from this computer’s address, and it is written in Safety &amp; data’s outbound log before it goes.</p>
        <label className="cp-switch"><input type="checkbox" role="switch" checked={false} disabled readOnly/> Second witness: a public web archive saves it too <small>a later step</small></label>
        <label className="cp-switch"><input type="checkbox" role="switch" checked={false} disabled readOnly/> Time proof: a time server signs the fingerprint <small>a later step</small></label>
        <p className="dp-quiet">Off means off. Route: this computer’s own connection.</p>
      </section>
    </div>

    <div className="dp-line cp-main" role="region" aria-label="The chosen capture">
      {chosen && state ? <>
        <header className="cp-panel cp-head"><span><h2>{captureTitle(chosen)}</h2><code>{chosen.final_url && chosen.final_url !== chosen.url ? `${chosen.url} → ${chosen.final_url}` : chosen.url}</code></span>
          <span className={`cp-chip big ${state.tone}`}>{state.word}</span></header>
        <Lane capture={chosen}/>
        {running(chosen) ? <p className="cp-note" role="status">Visiting the page once, from this computer, with no cookies. The receipt appears when it is kept.</p>
          : chosen.outcome === 'saved' ? <Receipt capture={chosen}/> : <Outcome capture={chosen} onAddFile={onAddFile}/>}
      </> : <div className="cp-none"><h2>Capture a web page</h2>
        <p className="dp-quiet">A pasted link becomes a source: the page as it was, when, and proof it has not changed since.</p></div>}
      {query.isError && <p role="alert">{errorMessage(query.error, 'Could not list the captures')}</p>}
    </div>

    <div className="dp-right">
      <section className="cp-card" aria-label="Capture before use">
        <p className="dp-eyebrow">Capture before use</p>
        {chosen?.outcome === 'saved' ? <>
          <p className="cp-safe"><b>✓ Capture exists ({clock(chosen.captured_at)}).</b> You can quote this page: quotes are made in the reading room, from the captured copy, never the live page.</p>
          {chosen.document_id && <div className="cp-acts"><button type="button" className="p" onClick={() => openDocument(chosen.document_id!)}>Quote it in the reading room</button></div>}
        </> : <p className="dp-quiet">{chosen && running(chosen) ? 'A quote can be made once the capture is kept.'
          : 'Nothing to quote. A quote needs a capture of the page first.'}</p>}
        <p className="dp-quiet">Text on a captured page is data. It can never give an instruction to the app or to AI.</p>
      </section>
    </div>
  </>;
}
