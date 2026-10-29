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

import {Reveal} from '../../components/ui/reveal';
import {api} from '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getCapturesOptions, getCapturesQueryKey, getDropQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {collectCaptureMedia, createCapture} from '../../lib/generated/sdk.gen';
import type {CaptureOut, CaptureStageOut, GetCapturesError} from '../../lib/generated/types.gen';
import {apiTime} from '../../lib/timestamps';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {FingerprintMark} from './kind-marks';

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

function Stage({stage, live, refused}: {stage: CaptureStageOut; live: boolean; refused?: number | null}): ReactElement {
  // The site answered with an error (404, 403): the page itself was not fetched, whatever was kept of the reply.
  if (refused && stage.key === 'fetched') return <li className="cp-st stopped"><span className="cp-k">{stage.label}</span><span className="cp-v">✕ {refused}</span></li>;
  const state = live ? 'live' : stage.state;
  const mark = {done: '✓', stopped: '✕', live: '…', waiting: '', skipped: '–'}[state];
  const value = stage.state === 'done' && stage.seconds !== null && stage.seconds !== undefined ? `${stage.seconds.toFixed(1)} s`
    : stage.state === 'skipped' ? 'not run' : stage.state === 'stopped' ? 'stopped' : live ? 'working' : '';
  // The stage's mark shows; its seconds (or "not run") are on hover.
  return <li className={`cp-st ${state}`}><span className="cp-k">{stage.label}</span>
    {value ? <Reveal className="cp-v" detail={value}><span aria-hidden="true">{mark}</span></Reveal> : <span className="cp-v">{mark}</span>}</li>;
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
    {(() => {
      const stopped = !running(capture) && (capture.stages.some(s => s.state === 'stopped') || (capture.outcome !== 'saved' && (capture.http_status ?? 0) >= 400));
      const glyph = running(capture) ? '…' : stopped ? '✕' : '✓';
      return <p className="cp-cap">Capture lane <Reveal label={laneSummary(capture)} detail={laneSummary(capture)}>
        <span className={`cp-glyph ${running(capture) ? 'teal' : stopped ? 'bad' : 'ok'}`} aria-hidden="true">{glyph}</span></Reveal></p>;
    })()}
    <ol className="cp-lane" aria-label="Capture stages">{capture.stages.map((s, i) => <Stage key={s.key} stage={s} live={i === firstWaiting} refused={capture.outcome !== 'saved' && (capture.http_status ?? 0) >= 400 ? capture.http_status : null}/>)}</ol>
    {/* Who captured it with what and when, and the headers, are custody facts kept one hover away; that no login was
        used stays on screen, an editor relies on it. */}
    <p className="cp-marks">
      <Reveal detail="Signed in? No · a fresh browser, no stored cookies"><span className="cp-chip ok">no login</span></Reveal>
      <Reveal label="Who, with what, when" detail={<>
        <span className="rv-row">Tool <b>{capture.tool?.replace('Journalism Workbench web capture: ', '') || '–'}</b></span>
        <span className="rv-row">Collector <b>{collectorName(capture)} · this computer</b></span>
        <span className="rv-row">Started <b>{utc(capture.started_at ?? capture.requested_at)}</b></span>
        <span className="rv-row">Ended <b>{utc(capture.finished_at)}</b></span>
        <span className="rv-row">Clock shown in capture <b>{clock(capture.captured_at)}</b></span>
      </>}><span className="cp-chip dash" aria-hidden="true">who · when</span></Reveal>
      {(sent || back) && <Reveal label="Headers sent and received" detail={<>
        <span className="rv-row"><b>What was sent</b></span>
        <span className="rv-row rv-mono">{sent && <><b>{sent.method}</b> {sent.target}{sent.headers.map(([k, v]) => <span key={k}><br/><b>{k}:</b> {v}</span>)}</>}</span>
        <span className="rv-row"><b>What came back</b> · as served, not verified</span>
        <span className="rv-row rv-mono">{back && <><b>{back.status}</b>{back.headers.map(([k, v]) => <span key={k}><br/><b>{k}:</b> {v}</span>)}</>}</span>
      </>}><span className="cp-chip dash" aria-hidden="true">headers</span></Reveal>}
      {capture.robots_disallowed && <Reveal detail="The site’s robots.txt asks robots not to fetch this page. A one-off capture notes it and goes ahead.">
        <span className="cp-chip amber">robots.txt</span></Reveal>}
    </p>
  </section>;
}

type MediaFacts = {status?: string; reason?: string; platform?: string; account?: string; title?: string; duration?: number;
  uploaded?: string; route?: string};

/** The video or audio on a captured page (backend app/services/media_links.py): one item, collected logged out,
 *  kept with the capture and transcribed like any recording. */
function MediaPanel({capture, investigationId}: {capture: CaptureOut; investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const [error, setError] = useState('');
  const media = capture.media as MediaFacts;
  const collect = async () => {
    setError('');
    try {
      await collectCaptureMedia({path: {capture_id: capture.id}, throwOnError: true});
      await Promise.all([queryClient.invalidateQueries({queryKey: getCapturesQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})})]);
    } catch (e) { setError(errorMessage(e, 'Could not collect the video or audio')); }
  };
  const length = media.duration ? ` · ${Math.floor(media.duration / 60)}:${String(Math.round(media.duration % 60)).padStart(2, '0')}` : '';
  return <section className="cp-panel" aria-label="Video or audio on this page">
    <p className="cp-cap">Video or audio on this page</p>
    {media.status === 'collected' ? <>
      <p><Reveal detail={<>
        <span className="rv-row">{[media.platform, media.account].filter(Boolean).join(' · ')}{length}{media.uploaded ? ` · uploaded ${media.uploaded}` : ''}</span>
        <span className="rv-row">Collected {media.route}; kept with this capture as {capture.files.filter(f => f.name.startsWith('media.')).map(f => f.name).join(' and ')}, and transcribed on this computer.</span>
      </>}><b>{media.title}</b></Reveal></p>
      {capture.media_document_id && <div className="cp-acts"><button type="button" className="p" onClick={() => openDocument(capture.media_document_id!)}>Listen &amp; read</button></div>}
    </> : media.status === 'collecting' ? <p className="cp-note" role="status">Looking for the video or audio, then collecting it, logged out…</p>
      : <>
        {media.status === 'failed' && <p className="cp-note"><b>Not collected.</b> {media.reason}</p>}
        <div className="cp-acts"><button type="button" onClick={() => void collect()}>{media.status === 'failed' ? 'Try again' : 'Collect the video or audio'}</button>
          {/* What leaves this computer stays on screen, beside the button; the sentence on hover. */}
          <Reveal className="cp-egress" detail="One item, logged out, with no cookies. The page’s site sees one more visit from this computer, written in the outbound log first.">
            <span>↗ 1 visit · logged out</span></Reveal></div>
      </>}
    {error && <p role="alert" className="cp-err">{error}</p>}
  </section>;
}

function Receipt({capture}: {capture: CaptureOut}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const warc = capture.files.find(f => f.name === 'page.warc.gz') ?? capture.files[0];
  const {author, published} = capture.displayed;
  return <section className="cp-panel" aria-label="Capture receipt">
    <div className="cp-cap">Capture receipt
      <span className="cp-acts">{capture.document_id && <button type="button" className="p" onClick={() => openDocument(capture.document_id!)}>Open in reading room</button>}</span></div>
    <div className="cp-rcpt">
      <Shot capture={capture}/>
      <dl className="cp-kv">
        {warc && <><dt>SHA-256</dt><dd><FingerprintMark hash={warc.sha256} of={warc.name}/></dd></>}
        <dt>Captured</dt><dd><Reveal detail={<><span className="rv-row">By this computer’s clock.</span>
          <span className="rv-row">{utc(capture.captured_at ?? capture.finished_at).slice(0, 16)} captured on this computer by {collectorName(capture)}; kept unaltered, in the case’s records.</span></>}>
          {utc(capture.captured_at ?? capture.finished_at)}</Reveal></dd>
        <dt>Kept as</dt><dd className="cp-files">{capture.files.length ? capture.files.map(f => <div key={f.name}>
          <Reveal tabbable={false} detail={`${size(f.bytes)} · ${f.role}`}><Download capture={capture} name={f.name}>{f.name}</Download></Reveal></div>) : 'Nothing: no page came back'}</dd>
        <dt>Time proof</dt><dd><Reveal detail={`Local clock only (${clock(capture.captured_at)}). Independent proof not asked for.`}>Local clock only</Reveal></dd>
        {(author || published) && <><dt>Displayed</dt><dd><Reveal detail="as displayed, not verified"><span className="cp-displayed">{author ? `By “${author}”` : ''}{author && published ? ' · ' : ''}{published ?? ''}</span></Reveal></dd></>}
      </dl>
    </div>
    {/* A custody statement: the verdict stays on screen; what a capture shows is on hover. */}
    <p className="cp-cv"><b>Content verified</b><Reveal detail="A capture shows what was at the address, not that it is genuine."><strong>{capture.content_verified}.</strong></Reveal></p>
  </section>;
}

function Outcome({capture, onAddFile}: {capture: CaptureOut; onAddFile: () => void}): ReactElement {
  const wall = capture.outcome === 'not_seen';
  return <section className="cp-panel" aria-label={wall ? 'Not seen' : 'Link only'}>
    <p className="cp-out"><span className={`cp-chip big ${wall ? 'amber' : 'bad'}`}>{wall ? 'Not seen' : capture.status === 'failed' ? 'Stopped' : 'Link only'}</span>
      <Reveal detail={wall ? <>What was kept is what the site showed instead, marked <b>not seen</b>, never “shown”. This app signs in to nothing: no accounts, no stored cookies, no saved sessions.</>
        : <>That is an <b>outcome, not a gap</b>: it is logged with its reason and time.</>}>
        <b>{wall ? 'A login wall, paywall or block was in the way' : 'Saved as a link, with the reason'}</b></Reveal></p>
    <p>{capture.reason}</p>
    {!wall && <p>Nothing can be quoted from this link.</p>}
    <dl className="cp-kv">
      <dt>Kept</dt><dd>{capture.files.length ? <>The address, the time, and what the site sent instead: {capture.files.map(f => f.name).join(', ')}</> : 'The address as pasted and the time'}</dd>
      <dt>Can be quoted</dt><dd>{wall ? 'As what the site showed, not as the page' : 'Nothing'}</dd>
    </dl>
    <div className="cp-acts"><Reveal tabbable={false} detail="A file you add is kept as one you supplied, with you as its source.">
      <button type="button" className="p" onClick={onAddFile}>Add a file I saved (PDF, screenshot, .html)</button></Reveal></div>
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
    <Reveal className="dp-eyebrow" detail="Links, files and pasted text share one drop: a link pasted into the drop is captured too.">Paste a link</Reveal>
    <form className="cp-linkfield" onSubmit={submit}>
      <input type="url" inputMode="url" value={text} onChange={e => { setText(e.target.value); setAlready(null); }} placeholder="https://…" aria-label="Web address to capture"/>
      <button type="submit" className="p">Capture</button>
    </form>
    {already && <div className="cp-already" role="status">
      <p><Reveal detail={`captured ${utc(already.captured_at ?? already.finished_at)}`}><span className="cp-chip teal">Already in the case</span></Reveal></p>
      <div className="cp-acts"><button type="button" className="p" onClick={() => { onCaptured(already.id); setAlready(null); setText(''); }}>Open that one</button>
        <button type="button" onClick={() => void capture(text || already.url, true)}>Capture again as a new version</button></div>
    </div>}
    {status && <p role="status" className="dp-status">{status}</p>}
  </section>;
}

export function useCaptures(investigationId: string): UseQueryResult<CaptureOut[], GetCapturesError> {
  return useQuery({...getCapturesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId),
    // A finished capture may still be reading its page (its job is not done): keep following until both are.
    refetchInterval: q => (q.state.data?.some(c => running(c) || (c.job ? !c.job.finished : false) || (c.media as MediaFacts).status === 'collecting')
      ? 1500 : false)});
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
          {/* The outcome is its glyph; its word and the address are on hover or focus. */}
          <Reveal tabbable={false} detail={<><b>{s.word}</b><span className="rv-row rv-mono">{shortUrl(c.url)}</span></>}>
          <button type="button" aria-pressed={c.id === chosen?.id} className={c.id === chosen?.id ? 'on' : ''} onClick={() => onPick(c.id)}>
            <span className={`cp-glyph ${s.tone}`} aria-hidden="true">{s.glyph}</span>
            <span className="cp-li"><b>{captureTitle(c)}</b></span>
          </button></Reveal></li>; })}</ul>
          : <p className="dp-quiet">{query.isPending ? 'Looking…' : 'No links yet. Paste one above.'}</p>}
      </section>
      <section className="cp-card" aria-label="What leaves this computer">
        <p className="dp-eyebrow cp-row">What leaves this computer <span className="cp-chip dash">ask first</span></p>
        <Reveal detail={<><span className="rv-row">The page is fetched from this computer.</span><span className="rv-row">The page’s site sees one visit from this computer’s address, and so does every other site the page loads from (images, scripts, trackers): each is listed in page.har. The visit is written in Safety &amp; data’s outbound log before it goes.</span></>}>
          <p className="cp-safe"><b>✓ No outside capture service is used.</b></p></Reveal>
        <p className="cp-marks">
          <Reveal className="cp-egress" detail="Off means off. Route: this computer’s own connection."><span>↗ 1 visit · direct</span></Reveal>
          <Reveal detail={<><span className="rv-row">A later step, off for now:</span><span className="rv-row">Second witness: a public web archive saves it too.</span>
            <span className="rv-row">Time proof: a time server signs the fingerprint.</span></>}><span className="cp-chip dash">later</span></Reveal>
        </p>
      </section>
    </div>

    <div className="dp-line cp-main" role="region" aria-label="The chosen capture">
      {chosen && state ? <>
        <header className="cp-panel cp-head"><span><h2>{captureTitle(chosen)}</h2>
          <Reveal detail={<span className="rv-mono">{chosen.final_url && chosen.final_url !== chosen.url ? `${chosen.url} → ${chosen.final_url}` : chosen.url}</span>}><code>{host(chosen.final_url || chosen.url)}</code></Reveal></span>
          <Reveal label={state.word} detail={state.word}><span className={`cp-glyph big ${state.tone}`} aria-hidden="true">{state.glyph}</span></Reveal></header>
        <Lane capture={chosen}/>
        {running(chosen) ? <p className="cp-note" role="status"><Reveal detail="Visiting the page once, from this computer, in a fresh browser with no stored cookies. The receipt appears when it is kept.">Capturing…</Reveal></p>
          : chosen.outcome === 'saved' ? <><Receipt capture={chosen}/><MediaPanel capture={chosen} investigationId={investigationId}/></>
          : <Outcome capture={chosen} onAddFile={onAddFile}/>}
      </> : <div className="cp-none"><Reveal detail="A pasted link becomes a source: the page as it was, when, and proof it has not changed since."><h2>Capture a web page</h2></Reveal></div>}
      {query.isError && <p role="alert">{errorMessage(query.error, 'Could not list the captures')}</p>}
    </div>

    <div className="dp-right">
      <section className="cp-card" aria-label="Capture before use">
        <Reveal className="dp-eyebrow" detail="Text on a captured page is data. It can never give an instruction to the app or to AI.">Capture before use</Reveal>
        {chosen?.outcome === 'saved' ? <>
          <Reveal detail="You can quote this page: quotes are made in the reading room, from the captured copy, never the live page.">
            <p className="cp-safe"><b>✓ Capture exists ({clock(chosen.captured_at)}).</b></p></Reveal>
          {chosen.document_id && <div className="cp-acts"><button type="button" className="p" onClick={() => openDocument(chosen.document_id!)}>Quote it in the reading room</button></div>}
        </> : <p className="dp-quiet">{chosen && running(chosen) ? 'A quote can be made once the capture is kept.'
          : 'Nothing to quote. A quote needs a capture of the page first.'}</p>}
      </section>
    </div>
  </>;
}
