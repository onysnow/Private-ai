'use client';
// Links & captures (The Drop's second tab; mockup INTAKE_3, ADR-0018): a pasted link becomes a source. Left, the link
// field, the links this case has captured and what leaves this computer; middle, the chosen capture: its lane (each
// stage with its seconds), who captured it with what and when, what was sent and what came back, and its receipt (the
// picture with its clock band, the SHA-256, each kept file, what the page displayed, "content verified: not done by
// this system"); right, capture before use. A login wall is "not seen" and a page that could not be kept is "link only",
// each with its reason: outcomes, not gaps. Captures run as jobs; the list follows them while one is running.
// Check again later / Re-check now (app/services/capture_follow.py): a Following page monitor tied to the capture;
// version 1 is the page as captured, a different live text is "changed since capture" (words only, as served), an
// address that now answers 404 is "gone". A check keeps nothing as evidence: Capture version 2 is a new capture.
// Outside witnesses (app/services/capture_witness.py, ADR-0025), each asked for by a person, said first and logged:
// a time server signs the fingerprint (only the SHA-256 goes), a public web archive keeps its own copy (only the
// address goes), and for a page not kept here, the archive says whether it holds a copy. None for a protected item.
// Converted to the 29 Oct rule (CLAUDE.md, "Show only what matters"): outcomes and stages are their glyphs, hashes a
// fingerprint icon, seconds, clocks, tools and explanations on hover, focus or click. What leaves this computer, the
// custody verdict, what may be quoted and every error stay on screen.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {UseQueryResult} from '@tanstack/react-query';
import {useEffect, useMemo, useState} from 'react';
import type {FormEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {api} from '../../lib/api-instance';
import {errorMessage} from '../../lib/api-client';
import {getCaptureQuotesOptions, getCaptureQuotesQueryKey, getCapturesOptions, getCapturesQueryKey, getDropQueryKey, platformForUrlOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {captureLatest, captureLookElsewhere, captureSecondWitness, captureTimeProof, collectCaptureMedia, createCapture, followCapture, markCaptureChanged, recheckCapture, refindCaptureQuotes, updateCapture} from '../../lib/generated/sdk.gen';
import type {CaptureArchiveOut, CaptureFollowOut, CaptureOut, CaptureQuoteOut, CaptureStageOut, CaptureTimeProofOut, GetCapturesError} from '../../lib/generated/types.gen';
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
  if (c.outcome === 'saved' && c.follow?.state === 'changed') return {word: 'Changed since capture', tone: 'amber', glyph: 'Δ'};
  if (c.outcome === 'saved' && c.follow?.state === 'gone') return {word: 'Gone', tone: 'bad', glyph: '✕'};
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
  const mark = {done: '✓', stopped: '✕', live: '…', waiting: '', skipped: '–'}[state];
  const value = stage.state === 'done' && stage.seconds !== null && stage.seconds !== undefined ? `${stage.seconds.toFixed(1)} s`
    : stage.state === 'skipped' ? 'not run' : stage.state === 'stopped' ? 'stopped' : live ? 'working' : '';
  // The stage's mark shows; its seconds (or "not run") are on hover.
  return <li className={`cp-st ${state}`}><span className="cp-k">{stage.label}</span>
    {value ? <Reveal className="cp-v" detail={value}><span aria-hidden="true">{mark}</span></Reveal> : <span className="cp-v">{mark}</span>}</li>;
}

function Download({capture, name, children, 'aria-describedby': describedBy}: {capture: CaptureOut; name: string; children: ReactElement | string;
  'aria-describedby'?: string}): ReactElement {
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
  return <><button type="button" className="cp-file" aria-describedby={describedBy} onClick={() => void save()}>{children}</button>{error && <span role="alert" className="cp-err">{error}</span>}</>;
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

/** Says exactly what would go and where, then asks once (INTAKE_3: outside services "ask first"). */
function AskFirst({label, sends, onSend, protectedItem}: {label: string; sends: ReactElement; onSend: () => Promise<void>; protectedItem: boolean}): ReactElement {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (protectedItem) return <Reveal tabbable={false} detail="Source-protected: nothing is sent from here">
    <button type="button" className="cp-ask" disabled>{label} <span className="cp-chip dash">source-protected</span></button></Reveal>;
  if (!open) return <button type="button" className="cp-ask" onClick={() => setOpen(true)}>{label} <span className="cp-chip dash">asks first</span></button>;
  return <span className="cp-confirm" role="group" aria-label={label}>
    <span>{sends} Written in the outbound log before it goes.</span>
    <span className="cp-acts" style={{marginLeft: 0}}>
      <button type="button" className="p" disabled={busy} onClick={() => { setBusy(true); void onSend().finally(() => { setBusy(false); setOpen(false); }); }}>{busy ? 'Asking…' : 'Send it'}</button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button></span>
  </span>;
}

/** How long after the capture, in words: "3 h 23 min", "2 days". */
function later(minutes: number): string {
  if (minutes >= 2 * 24 * 60) return `${Math.floor(minutes / (24 * 60))} days`;
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

/** The receipt's time proof line: the time server's clock, or this computer's alone (mockup INTAKE_3). A proof asked
 *  for after the capture proves only that the file existed by then, and says so. */
export function timeProofWords(proof: CaptureTimeProofOut | null | undefined, capturedAt?: string | null): {stamped: boolean; text: string; check?: string; gap?: string} {
  if (proof?.state === 'stamped') {
    const minutes = proof.time && capturedAt ? Math.round((apiTime(proof.time).getTime() - apiTime(capturedAt).getTime()) / 60000) : 0;
    return {stamped: true, text: `RFC 3161 token, ${clock(proof.time)}${proof.signer ? ` by ${proof.signer}` : ''}. Sent: the fingerprint only.`,
      check: proof.check === 'checked' ? 'Checked here: its signature, its chain to the time server’s root, this fingerprint and this request.'
        : proof.check_detail ?? 'Not checked here.',
      gap: minutes >= 2 ? `Asked ${later(minutes)} after the capture: it proves the kept file existed by then, not when the page was captured.` : undefined};
  }
  if (proof?.state === 'failed') return {stamped: false, text: `Not stamped: ${proof.reason ?? 'the time server did not answer'}`};
  return {stamped: false, text: ''};
}

function Receipt({capture, investigationId}: {capture: CaptureOut; investigationId: string}): ReactElement {
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const openRealness = useWorkbenchStore(state => state.openRealness);
  const openProvenance = useWorkbenchStore(state => state.openProvenance);
  const act = useCaptureAction(investigationId);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const recheck = async () => {
    setChecking(true);
    setError(await act(() => recheckCapture({path: {capture_id: capture.id}, throwOnError: true}), 'Could not check the page again'));
    setChecking(false);
  };
  const warc = capture.files.find(f => f.name === 'page.warc.gz') ?? capture.files[0];
  const {author, published} = capture.displayed;
  const proof = timeProofWords(capture.witnesses.time_proof, capture.captured_at);
  const archive = capture.witnesses.archive;
  const ask = async (run: () => Promise<unknown>, fallback: string) => setError(await act(run, fallback));
  return <section className="cp-panel" aria-label="Capture receipt">
    <div className="cp-cap">Capture receipt
      <span className="cp-acts">{capture.document_id && <button type="button" className="p" onClick={() => openDocument(capture.document_id!)}>Open in reading room</button>}
        {(capture.media_document_id ?? capture.document_id) && <button type="button" onClick={() => openRealness((capture.media_document_id ?? capture.document_id)!)}>Is it real? →</button>}
        <button type="button" disabled={checking} onClick={() => void recheck()}>{checking ? 'Checking…' : 'Re-check now'}</button>
        {capture.document_id && <button type="button" onClick={() => openProvenance({title: captureTitle(capture), kind: 'document', documentId: capture.document_id!, sourceUrl: capture.final_url || capture.url})}>Trace</button>}</span></div>
    {error && <p role="alert" className="cp-err">{error}</p>}
    <div className="cp-rcpt">
      <Shot capture={capture}/>
      <dl className="cp-kv">
        {warc && <><dt>SHA-256</dt><dd><FingerprintMark hash={warc.sha256} of={warc.name}/></dd></>}
        <dt>Captured</dt><dd><Reveal detail={<><span className="rv-row">By this computer’s clock.</span>
          <span className="rv-row">{utc(capture.captured_at ?? capture.finished_at).slice(0, 16)} captured on this computer by {collectorName(capture)}; kept unaltered, in the case’s records.</span></>}>
          {utc(capture.captured_at ?? capture.finished_at)}</Reveal></dd>
        <dt>Kept as</dt><dd className="cp-files">{capture.files.length ? capture.files.map(f => <div key={f.name}>
          <Reveal tabbable={false} detail={`${size(f.bytes)} · ${f.role}`}><Download capture={capture} name={f.name}>{f.name}</Download></Reveal></div>) : 'Nothing: no page came back'}</dd>
        {/* A stamp is its chip, what was sent and how it was checked on hover; a stamp asked for late says so on screen,
            since it changes what the stamp proves. */}
        <dt>Time proof</dt><dd>{proof.stamped ? <><Reveal detail={<><span className="rv-row">{proof.text}</span><span className="rv-row">{proof.check}</span></>}>
            <span className="cp-chip ok">Stamped</span></Reveal>{proof.gap && <><br/><small><b>{proof.gap}</b></small></>}</>
          : <>{proof.text ? <>{proof.text}. </> : <><Reveal detail={`Local clock only (${clock(capture.captured_at)}). Independent proof not asked for.`}>Local clock only</Reveal> </>}
            {warc?.name === 'page.warc.gz' && <AskFirst label={proof.text ? 'Ask the time server again…' : 'Ask a time server…'} protectedItem={capture.source_protected ?? false}
              sends={<>Sends the 64-character fingerprint <code>{spaced(warc.sha256)}</code> to {capture.time_server}. Not the page.</>}
              onSend={() => ask(() => captureTimeProof({path: {capture_id: capture.id}, throwOnError: true}), 'Could not ask the time server')}/>}</>}</dd>
        <dt>Second witness</dt><dd>{archive?.state === 'saved' ? <><Reveal detail={`${archive.service} asked ${clock(archive.asked_at)}. Sent: the link only.`}>{archive.service}</Reveal>{' '}
          {archive.url && <a href={archive.url} target="_blank" rel="noopener noreferrer">Its copy{archive.archived_at ? `, ${utc(archive.archived_at).slice(0, 16)}` : ''} ↗</a>}</>
          : <>{archive?.state === 'failed' ? <>Not kept by the archive: {archive.reason} </> : <small>Not asked. </small>}
            <AskFirst label={archive ? 'Ask the archive again…' : 'Ask a public web archive…'} protectedItem={capture.source_protected ?? false}
              sends={<>Sends this page’s address, <code>{capture.final_url || capture.url}</code>, to the Internet Archive, which visits the page itself and keeps its own copy. It will know this page interests someone.</>}
              onSend={() => ask(() => captureSecondWitness({path: {capture_id: capture.id}, throwOnError: true}), 'Could not ask the archive')}/></>}</dd>
        {(author || published) && <><dt>Displayed</dt><dd><Reveal detail="as displayed, not verified"><span className="cp-displayed">{author ? `By “${author}”` : ''}{author && published ? ' · ' : ''}{published ?? ''}</span></Reveal></dd></>}
      </dl>
    </div>
    {/* A custody statement: the verdict stays on screen; what a capture shows is on hover. */}
    <p className="cp-cv"><b>Content verified</b><Reveal detail="A capture shows what was at the address, not that it is genuine."><strong>{capture.content_verified}.</strong></Reveal></p>
  </section>;
}

/** Calls one capture action, then reads the case's captures again; returns the error to show, if any. */
function useCaptureAction(investigationId: string): (run: () => Promise<unknown>, fallback: string) => Promise<string> {
  const queryClient = useQueryClient();
  return async (run, fallback) => {
    try {
      await run();
      await Promise.all([queryClient.invalidateQueries({queryKey: getCapturesQueryKey({path: {investigation_id: investigationId}})}),
        queryClient.invalidateQueries({queryKey: getDropQueryKey({path: {investigation_id: investigationId}})})]);
      return '';
    } catch (e) { return errorMessage(e, fallback); }
  };
}

const VERDICT: Record<string, string> = {first: '', same: 'same text', layout: 'layout only'};

/** The re-check: one visit, the live page's main text compared with version 1 (mockup INTAKE_3, changed since capture). */
function Recheck({capture, follow}: {capture: CaptureOut; follow: CaptureFollowOut}): ReactElement {
  const asked = follow.checks[0];
  const changed = follow.state === 'changed';
  const gone = follow.state === 'gone' || follow.state === 'broken';
  const latest = follow.versions[follow.versions.length - 1];
  const differ = latest && latest.number > 1 ? latest.lines_changed : 0;
  // A box shows its mark and number; how long it took is on hover.
  const box = (key: string, label: string, state: string, value: string, more?: string) => <li key={key} className={`cp-st ${state}`}><span className="cp-k">{label}</span>
    {more ? <Reveal className="cp-v" detail={more}>{value}</Reveal> : <span className="cp-v">{value}</span>}</li>;
  const after = changed ? 'waiting' : 'skipped';
  return <section className="cp-panel" aria-label="Re-check">
    <p className="cp-cap">Re-check <span className="cp-r">{follow.last_checked_at
      ? <Reveal detail={`${utc(follow.last_checked_at)} · by this computer`}>{utc(follow.last_checked_at).slice(0, 16)}</Reveal> : 'not checked yet'}</span></p>
    {follow.last_checked_at && <ol className="cp-lane" aria-label="Re-check stages">
      {box('checked', 'Link checked', 'done', '✓')}
      {box('fetched', 'Page fetched', gone ? 'stopped' : 'done', asked?.status ? `${gone ? '✕' : '✓'} ${asked.status}` : (gone ? '✕' : '✓'),
        asked?.seconds !== null && asked?.seconds !== undefined ? `${asked.seconds.toFixed(1)} s` : undefined)}
      {box('text', 'Text read', gone ? 'skipped' : 'done', gone ? 'not run' : '✓')}
      {box('compared', 'Compared with v1', gone ? 'skipped' : changed ? 'warn' : 'done', gone ? 'not run' : changed ? `! ${differ} line${differ === 1 ? '' : 's'} differ` : `✓ ${VERDICT.same}`)}
      {box('shot', 'Screenshot', after, changed ? '…' : '–', changed ? 'waiting for you' : 'not needed')}
      {box('warc', 'Archive (WARC)', after, changed ? '…' : '–', changed ? 'waiting for you' : 'not needed')}
      {box('hash', 'Fingerprint', after, changed ? '…' : '–', changed ? 'waiting for you' : 'not needed')}
    </ol>}
    <ol className="cp-versions" aria-label="Versions">{follow.versions.map(v => <li key={v.number} className={v.captured ? 'ok' : 'amber'}>
      <b>Version {v.number}</b> · {v.captured ? `captured ${utc(v.capture_id === capture.id ? (capture.captured_at ?? v.seen_at) : v.seen_at).slice(0, 16)}` : `seen ${utc(v.seen_at).slice(0, 16)}, not captured`}
      {v.captured ? <span><FingerprintMark hash={v.text_sha256} label="Text fingerprint"/></span> : <span>Text fingerprint differs. Nothing is saved until you say so.</span>}
    </li>)}</ol>
    {follow.state === 'gone' && <p className="cp-note"><b>Gone.</b> The address now answers {asked?.status}. The capture stays as evidence of what was there; mark the source so.</p>}
    {follow.state === 'broken' && <p className="cp-note"><b>Not read.</b> {follow.health_detail}</p>}
    {follow.state === 'same' && <p className="cp-note">The live page’s main text is the same as the captured version.</p>}
  </section>;
}

function WhatChanged({capture, follow, investigationId, onPick}: {capture: CaptureOut; follow: CaptureFollowOut; investigationId: string; onPick: (id: string) => void}): ReactElement {
  const act = useCaptureAction(investigationId);
  const [error, setError] = useState('');
  const [both, setBoth] = useState(false);
  const latest = follow.versions[follow.versions.length - 1];
  const marked = follow.marked_changed as {at?: string} | null | undefined;
  const take = async () => {
    let made = '';
    setError(await act(async () => { made = (await captureLatest({path: {capture_id: capture.id}, throwOnError: true})).data.id; }, 'Could not capture the page'));
    if (made) onPick(made);
  };
  return <section className="cp-panel" aria-label="What changed">
    <p className="cp-cap"><Reveal detail={<><span className="rv-row">Words only, as served.</span>
      <span className="rv-row">A change is evidence too. Quotes from version 1 still match the saved copy; they do not match the live page.</span></>}>
      {follow.state === 'gone' ? 'What is left' : 'What changed'}</Reveal></p>
    {follow.state === 'changed' && (both
      ? <div className="cp-both"><div><p className="cp-k">Version 1 · captured</p><pre>{follow.captured_text}</pre></div><div><p className="cp-k">Version {latest?.number} · live</p><pre>{follow.live_text}</pre></div></div>
      : <div className="cp-diff">{follow.changes.map((block, i) => block.unchanged
        ? <p key={i} className="cp-same">{block.unchanged} line{block.unchanged === 1 ? '' : 's'} unchanged</p>
        : <p key={i}>{block.segments.map((s, j) => s.op === 'same' ? <span key={j}>{s.text}</span> : s.op === 'del' ? <del key={j}>{s.text}</del> : <ins key={j}>{s.text}</ins>)}</p>)}</div>)}
    <div className="cp-acts" style={{marginLeft: 0}}>
      {follow.state === 'changed' && <button type="button" className="p" onClick={() => void take()}>Capture version {latest?.number} · keeps both</button>}
      <button type="button" disabled={Boolean(marked)} onClick={() => void act(() => markCaptureChanged({path: {capture_id: capture.id}, throwOnError: true}), 'Could not mark the source').then(setError)}>
        {marked ? `Source marked “${follow.state === 'gone' ? 'gone' : 'changed'}” ✓` : `Mark source “${follow.state === 'gone' ? 'gone' : 'changed'}”`}</button>
      {follow.state === 'changed' && <button type="button" aria-pressed={both} onClick={() => setBoth(b => !b)}>{both ? 'Changes only' : 'Side by side'}</button>}
    </div>
    {error && <p role="alert" className="cp-err">{error}</p>}
  </section>;
}

/** Where a quote stands, in words (INTAKE_3): found again in the saved copy, and on the live page once it was checked. */
export function quoteStanding(q: CaptureQuoteOut): {tone: 'ok' | 'amber' | 'bad'; text: string} {
  const saved = q.saved;
  const how = saved ? `${saved.match === 'exact' ? 'exact match' : saved.match === 'case' ? 'same words, other capitals' : 'same words, other spacing'}, ${saved.occurrences === 1 ? '1 of 1' : `1 of ${saved.occurrences}`}` : '';
  if (!saved) return {tone: 'bad', text: 'Not found again in the saved copy. It stays in the tray, tied to the capture it was taken from.'};
  if (q.live && !q.live.found) return {tone: 'amber', text: `Not on the live page. Still found in version ${q.captured_version}, the saved copy: ${how}.`};
  if (q.live?.found && !q.live.same_as_saved) return {tone: 'ok', text: `Found again in the saved copy (${how}) and on the live page, version ${q.live.version}.`};
  return {tone: 'ok', text: `Found again in the saved copy: ${how}.`};
}

function PinQuote({capture}: {capture: CaptureOut}): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const key = getCaptureQuotesQueryKey({path: {capture_id: capture.id}});
  const found = useQuery({...getCaptureQuotesOptions({path: {capture_id: capture.id}}), enabled: capture.outcome === 'saved'});
  const [showTray, setShowTray] = useState(false);
  const [error, setError] = useState('');
  const all = found.data ?? [];
  const tray = all.filter(q => q.unanchored);
  const shown = all.find(q => !q.unanchored) ?? all[0];
  const reread = async () => {
    setError('');
    try { queryClient.setQueryData(key, (await refindCaptureQuotes({path: {capture_id: capture.id}, throwOnError: true})).data); }
    catch (e) { setError(errorMessage(e, 'Could not read the page again')); }
  };
  return <section className="cp-card" aria-label="Pin a quote">
    <Reveal className="dp-eyebrow" detail="A pinned quote finds itself again after every re-read.">Pin a quote</Reveal>
    {!shown ? (capture.outcome === 'saved'
      ? <p className="dp-quiet"><Reveal detail="Choose words in the reading room: a quote keeps the words either side, so it finds itself again after every re-read.">Nothing pinned from this page yet.</Reveal></p>
      : <p className="dp-quiet">Nothing to pin. A quote needs a capture of the page first.</p>)
      : <>
        {/* The quote shows; its length, the words around it and its place are on hover. */}
        <Reveal className="cp-quote" detail={<>
          <span className="rv-row">Exact <b>{shown.characters} characters</b></span>
          {shown.saved && <><span className="rv-row">Around <b>{shown.saved.prefix.length} before · {shown.saved.suffix.length} after</b></span>
            <span className="rv-row">Place <b>{shown.saved.place}</b></span></>}
        </>}>{shown.saved?.prefix ? <span className="cp-ctx">…{shown.saved.prefix}</span> : null}<mark>{shown.quote}</mark>{shown.saved?.suffix ? <span className="cp-ctx">{shown.saved.suffix}…</span> : null}</Reveal>
        {/* Found again is its ✓, the words on hover; a quote that is not found again says so on screen. */}
        {(() => { const s = quoteStanding(shown); return s.tone === 'ok'
          ? <p className={`cp-standing ${s.tone}`}><Reveal label="Found again" detail={s.text}><span className={`cp-glyph ${s.tone}`} aria-hidden="true">✓</span></Reveal></p>
          : <p className={`cp-standing ${s.tone}`}><span className={`cp-glyph ${s.tone}`} aria-hidden="true">!</span>{s.text}</p>; })()}
      </>}
    {capture.outcome === 'saved' && <div className="cp-acts" style={{marginLeft: 0}}>
      <Reveal tabbable={false} detail="Runs after every re-read."><button type="button" onClick={() => void reread()}>Re-read the page</button></Reveal>
      {capture.document_id && <button type="button" onClick={() => openDocument(capture.document_id!)}>Pin a quote in the reading room</button>}</div>}
    {tray.length > 0 && <div className="cp-tray">
      <p><Reveal detail="A quote it cannot find again goes to a tray, never lost."><span className="cp-chip amber">Unanchored · {tray.length}</span></Reveal></p>
      <p className="dp-quiet">{tray.length} quote{tray.length === 1 ? '' : 's'} from {captureTitle(capture)} {tray.length === 1 ? 'no longer matches' : 'no longer match'} {tray.some(q => q.saved) ? 'the live page' : 'the saved copy'}.
        <button type="button" className="cp-linkbtn" aria-expanded={showTray} onClick={() => setShowTray(s => !s)}>{showTray ? 'Hide' : 'Show'}</button></p>
      {showTray && <ul className="cp-traylist">{tray.map(q => <li key={q.evidence_id}><Reveal detail={quoteStanding(q).text}>“{q.quote}”</Reveal></li>)}</ul>}
    </div>}
    {error && <p role="alert" className="cp-err">{error}</p>}
  </section>;
}

const AGAIN: [CaptureFollowOut['every'], string][] = [['never', 'Never'], ['weekly', 'Weekly'], ['daily', 'Daily']];

function CheckAgain({capture, investigationId}: {capture: CaptureOut; investigationId: string}): ReactElement {
  const act = useCaptureAction(investigationId);
  const [error, setError] = useState('');
  const every = capture.follow?.every ?? 'never';
  const site = host(capture.final_url || capture.url);
  return <section className="cp-card" aria-label="Check again later">
    <Reveal className="dp-eyebrow" detail={<><span className="rv-row">A changed page is marked <b>changed since capture</b>; a removed one, <b>gone</b>. Both are kept as evidence.</span>
      {capture.follow?.next_check_at && <span className="rv-row">Next check {utc(capture.follow.next_check_at).slice(0, 16)}.</span>}</>}>Check again later</Reveal>
    <div className="cp-seg" role="radiogroup" aria-label="Check this page again">{AGAIN.map(([key, label]) =>
      <button key={key} type="button" role="radio" aria-checked={every === key}
        onClick={() => void act(() => followCapture({path: {capture_id: capture.id}, body: {every: key}, throwOnError: true}), 'Could not change when it is checked').then(setError)}>{label}</button>)}</div>
    {/* What leaves this computer stays on screen. */}
    <p className="cp-marks"><span className="cp-egress">↗ 1 visit to {site} each re-check</span></p>
    {error && <p role="alert" className="cp-err">{error}</p>}
  </section>;
}

const REASONS: [NonNullable<CaptureOut['reason_kind']>, string][] = [['dead_link', 'Dead link'], ['blocked', 'Blocked'], ['timed_out', 'Timed out'], ['tool_error', 'Tool error']];

/** What the archive said it holds of a page not kept here; a copy it holds can be captured like any page. */
function Elsewhere({found, investigationId, onPick}: {found?: CaptureArchiveOut | null; investigationId: string; onPick: (id: string) => void}): ReactElement | null {
  const act = useCaptureAction(investigationId);
  const [error, setError] = useState('');
  if (!found) return null;
  const take = async () => {
    let made = '';
    setError(await act(async () => { made = (await createCapture({path: {investigation_id: investigationId}, body: {url: found.url!}, throwOnError: true})).data.id; }, 'Could not capture that copy'));
    if (made) onPick(made);
  };
  return <div className="cp-elsewhere" role="status">
    {found.state === 'found' && found.url ? <>
      <p><span className="cp-chip teal">Copy elsewhere</span> {found.service} holds a copy{found.archived_at ? ` from ${utc(found.archived_at).slice(0, 16)}` : ''}{found.archived_status ? ` (the page answered ${found.archived_status} then)` : ''}. Asked {utc(found.asked_at).slice(0, 16)}; it is the archive’s copy, not this computer’s.</p>
      <div className="cp-acts" style={{marginLeft: 0}}><button type="button" className="p" onClick={() => void take()}>Capture that copy</button>
        <a href={found.url} target="_blank" rel="noopener noreferrer">Open it ↗</a></div>
    </> : found.state === 'none' ? <p>{found.service} holds no copy of this address (asked {utc(found.asked_at).slice(0, 16)}).</p>
      : <p>Asked {utc(found.asked_at).slice(0, 16)}. Not answered: {found.reason}</p>}
    {error && <p role="alert" className="cp-err">{error}</p>}
  </div>;
}

function Outcome({capture, onAddFile, investigationId, onPick}: {capture: CaptureOut; onAddFile: () => void; investigationId: string; onPick: (id: string) => void}): ReactElement {
  const act = useCaptureAction(investigationId);
  const [error, setError] = useState('');
  const wall = capture.outcome === 'not_seen';
  return <section className="cp-panel" aria-label={wall ? 'Not seen' : 'Link only'}>
    <p className="cp-out"><span className={`cp-chip big ${wall ? 'amber' : 'bad'}`}>{wall ? 'Not seen' : capture.status === 'failed' ? 'Stopped' : 'Link only'}</span>
      <Reveal detail={wall ? <>What was kept is what the site showed instead, marked <b>not seen</b>, never “shown”. This app signs in to nothing: no accounts, no stored cookies, no saved sessions.</>
        : <>That is an <b>outcome, not a gap</b>: it is logged with its reason and time.</>}>
        <b>{wall ? 'A login wall, paywall or block was in the way' : 'Saved as a link, with the reason'}</b></Reveal></p>
    <p>{capture.reason}</p>
    {!wall && capture.status !== 'failed' && <div className="cp-seg" role="radiogroup" aria-label="Why it could not be kept">{REASONS.map(([key, label]) =>
      <button key={key} type="button" role="radio" aria-checked={capture.reason_kind === key}
        onClick={() => void act(() => updateCapture({path: {capture_id: capture.id}, body: {reason_kind: key}, throwOnError: true}), 'Could not set the reason').then(setError)}>{label}</button>)}
      <small>{capture.reason_kind_by ? `set by ${capture.reason_kind_by === 'local-owner' ? 'you' : capture.reason_kind_by}` : 'read from the reply'}</small></div>}
    {!wall && <p>Nothing can be quoted from this link.</p>}
    <dl className="cp-kv">
      <dt>Kept</dt><dd>{capture.files.length ? <>The address, the time, and what the site sent instead: {capture.files.map(f => f.name).join(', ')}</> : 'The address as pasted and the time'}</dd>
      <dt>Can be quoted</dt><dd>{wall ? 'As what the site showed, not as the page' : 'Nothing'}</dd>
    </dl>
    {capture.follow?.state === 'answers'
      ? <p className="cp-note"><b>The address answers again</b> (seen {utc(capture.follow.last_checked_at).slice(0, 16)}). Its page waits in Following; nothing is kept until you capture it.</p>
      : capture.follow?.next_check_at ? <p className="cp-note">Asked again {utc(capture.follow.next_check_at).slice(0, 16)}: one visit to {host(capture.url)}.</p> : null}
    <div className="cp-acts" style={{marginLeft: 0}}>
      {capture.follow?.state === 'answers'
        ? <button type="button" className="p" onClick={() => void act(() => captureLatest({path: {capture_id: capture.id}, throwOnError: true}), 'Could not capture the page').then(setError)}>Capture it now</button>
        : !capture.follow?.next_check_at && <button type="button" className="p" onClick={() => void act(() => followCapture({path: {capture_id: capture.id}, body: {every: 'weekly'}, throwOnError: true}), 'Could not ask again').then(setError)}>Ask again in 7 days</button>}
      <Reveal tabbable={false} detail="A file you add is kept as one you supplied, with you as its source.">
        <button type="button" onClick={onAddFile}>Add a file I saved (PDF, screenshot, .html)</button></Reveal>
      <AskFirst label="Look for a copy elsewhere…" protectedItem={capture.source_protected ?? false}
        sends={<>Sends the address, <code>{capture.url}</code>, to the Internet Archive’s lookup, which says whether it holds a copy.</>}
        onSend={() => act(() => captureLookElsewhere({path: {capture_id: capture.id}, throwOnError: true}), 'Could not ask the archive').then(setError)}/>
    </div>
    <Elsewhere found={capture.witnesses.elsewhere} investigationId={investigationId} onPick={onPick}/>
    {error && <p role="alert" className="cp-err">{error}</p>}
  </section>;
}

export type Witnesses = {time_proof: boolean; second_witness: boolean};
const NO_WITNESS: Witnesses = {time_proof: false, second_witness: false};

export function CaptureLinkField({investigationId, captures, onCaptured, witnesses = NO_WITNESS, onStarted}: {investigationId: string; captures: CaptureOut[];
  onCaptured: (id: string) => void; witnesses?: Witnesses; onStarted?: () => void}): ReactElement {
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
      const made = (await createCapture({path: {investigation_id: investigationId}, body: {url: url.trim(), ...witnesses}, throwOnError: true})).data;
      onStarted?.();
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
    <PlatformWarning url={text}/>
    {already && <div className="cp-already" role="status">
      <p><Reveal detail={`captured ${utc(already.captured_at ?? already.finished_at)}`}><span className="cp-chip teal">Already in the case</span></Reveal></p>
      <div className="cp-acts"><button type="button" className="p" onClick={() => { onCaptured(already.id); setAlready(null); setText(''); }}>Open that one</button>
        <button type="button" onClick={() => void capture(text || already.url, true)}>Capture again as a new version</button></div>
    </div>}
    {status && <p role="status" className="dp-status">{status}</p>}
  </section>;
}

/** Does it work today? (WORKS_1): a pasted link on a platform that was broken or partly working at its last check says
 *  so before it is saved. Nothing is asked of the platform here: the answer is the app's own last check. */
function PlatformWarning({url}: {url: string}): ReactElement | null {
  const ok = isWebAddress(url);
  const platform = useQuery({...platformForUrlOptions({query: {url: url.trim()}}), enabled: ok, staleTime: 60_000}).data;
  if (!ok || !platform || !platform.state || platform.state === 'works') return null;
  return <p className={`cp-platform ${platform.state}`} role="status"><b aria-hidden="true">{platform.state === 'broken' ? '✕' : '◐'}</b>
    {platform.name} {platform.state === 'broken' ? 'is broken' : 'works only in part'} at its last check{platform.checked_at ? ` (${platform.checked_at.slice(0, 10)})` : ''}: {platform.detail?.toLowerCase()}.
    {platform.state === 'broken' ? ' The capture will keep what a logged-out visitor sees; you can also save the post yourself and drop the file.' : ''}</p>;
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
  // Per capture and off by default: the next capture asks them once its page is kept, then they are off again.
  const [witnesses, setWitnesses] = useState<Witnesses>(NO_WITNESS);
  const asked = (witnesses.second_witness ? 1 : 0) + (witnesses.time_proof ? 1 : 0);
  return <>
    <div className="dp-left">
      <CaptureLinkField investigationId={investigationId} captures={captures} onCaptured={onPick} witnesses={witnesses} onStarted={() => setWitnesses(NO_WITNESS)}/>
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
        {asked ? <p className="cp-warn"><b>{asked} outside service{asked > 1 ? 's' : ''} will be asked.</b>{' '}
          {[witnesses.second_witness && 'The link goes to a public web archive.', witnesses.time_proof && 'The 64-character fingerprint, not the page, goes to a time server.'].filter(Boolean).join(' ')}{' '}
          Once the page is kept here, for the next capture only.</p>
          : <Reveal detail={<><span className="rv-row">The page is fetched from this computer.</span><span className="rv-row">The page’s site sees one visit from this computer’s address, and so does every other site the page loads from (images, scripts, trackers): each is listed in page.har. The visit is written in Safety &amp; data’s outbound log before it goes.</span></>}>
            <p className="cp-safe"><b>✓ Nothing third-party is contacted.</b></p></Reveal>}
        <label className="cp-switch"><input type="checkbox" role="switch" checked={witnesses.second_witness} onChange={e => setWitnesses(w => ({...w, second_witness: e.target.checked}))}/> Second witness: a public web archive saves it too</label>
        <label className="cp-switch"><input type="checkbox" role="switch" checked={witnesses.time_proof} onChange={e => setWitnesses(w => ({...w, time_proof: e.target.checked}))}/> Time proof: a time server signs the fingerprint</label>
        <p className="cp-marks"><Reveal className="cp-egress" detail="Off means off. Route: this computer’s own connection."><span>↗ direct</span></Reveal></p>
      </section>
    </div>

    <div className="dp-line cp-main" role="region" aria-label="The chosen capture">
      {chosen && state ? <>
        <header className="cp-panel cp-head"><span><h2>{captureTitle(chosen)}</h2>
          <Reveal detail={<span className="rv-mono">{chosen.final_url && chosen.final_url !== chosen.url ? `${chosen.url} → ${chosen.final_url}` : chosen.url}</span>}><code>{host(chosen.final_url || chosen.url)}</code></Reveal></span>
          <Reveal label={state.word} detail={state.word}><span className={`cp-glyph big ${state.tone}`} aria-hidden="true">{state.glyph}</span></Reveal></header>
        {chosen.outcome === 'saved' && chosen.follow && ['changed', 'gone', 'broken'].includes(chosen.follow.state)
          ? <><Recheck capture={chosen} follow={chosen.follow}/>{chosen.follow.state !== 'broken' && <WhatChanged capture={chosen} follow={chosen.follow} investigationId={investigationId} onPick={onPick}/>}</>
          : <Lane capture={chosen}/>}
        {running(chosen) ? <p className="cp-note" role="status"><Reveal detail="Visiting the page once, from this computer, in a fresh browser with no stored cookies. The receipt appears when it is kept.">Capturing…</Reveal></p>
          : chosen.outcome === 'saved' ? <>{chosen.follow?.state === 'same' && <Recheck capture={chosen} follow={chosen.follow}/>}<Receipt capture={chosen} investigationId={investigationId}/><MediaPanel capture={chosen} investigationId={investigationId}/></>
          : <Outcome capture={chosen} onAddFile={onAddFile} investigationId={investigationId} onPick={onPick}/>}
      </> : <div className="cp-none"><Reveal detail="A pasted link becomes a source: the page as it was, when, and proof it has not changed since."><h2>Capture a web page</h2></Reveal></div>}
      {query.isError && <p role="alert">{errorMessage(query.error, 'Could not list the captures')}</p>}
    </div>

    <div className="dp-right">
      {chosen && !running(chosen) && <PinQuote capture={chosen}/>}
      <section className="cp-card" aria-label="Capture before use">
        <Reveal className="dp-eyebrow" detail="Text on a captured page is data. It can never give an instruction to the app or to AI.">Capture before use</Reveal>
        {chosen?.outcome === 'saved' ? <>
          <Reveal detail="You can quote this page: quotes are made in the reading room, from the captured copy, never the live page.">
            <p className="cp-safe"><b>✓ Capture exists ({clock(chosen.captured_at)}).</b></p></Reveal>
          {chosen.document_id && <div className="cp-acts"><button type="button" className="p" onClick={() => openDocument(chosen.document_id!)}>Quote it in the reading room</button></div>}
        </> : <p className="dp-quiet">{chosen && running(chosen) ? 'A quote can be made once the capture is kept.'
          : 'Nothing to quote. A quote needs a capture of the page first.'}</p>}
      </section>
      {chosen && !running(chosen) && chosen.status !== 'failed' && <CheckAgain capture={chosen} investigationId={investigationId}/>}
    </div>
  </>;
}
