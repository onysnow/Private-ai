'use client';
// Listen & read (the reading room for a recording; mockup INTAKE_4, ADR-0020). The transcript made on this computer,
// timecoded, beside the recording itself: each spoken part with its time, words the machine was unsure of dotted,
// the parts with no speech kept apart (crossed through, never quotable: words there may be invented). A line, or words
// chosen in it, is pinned as a quote with its place in the recording (media:#t=start,end); the quote stays locked until
// the reporter has played that part through and says "I heard this" (the server holds the same rule). Along the
// bottom, the player: play, five seconds back or on, the time, the recording's outline with the spoken parts above it.
// Keys: Space plays or pauses, ← → move five seconds, P pins the line playing, H "I heard this", E saves as evidence.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {getDocumentTranscriptOptions, listDocumentCandidatesEndpointOptions, listDocumentCandidatesEndpointQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {createEvidenceEndpoint} from '../../lib/generated/sdk.gen';
import type {DocumentDetailOut, TranscriptOut, TranscriptSegmentOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';

const STEP = 5;
/** The stretch of the recording the detailed outline shows at once. */
const WINDOW = 180;

export const isRecording = (doc: {mime_type?: string | null; filename?: string | null}): boolean =>
  /^(audio|video)\//i.test(doc.mime_type ?? '') || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|mp4|m4v|mov|webm|mkv)$/i.test(doc.filename ?? '');

/** Seconds as the transcript shows them: 12:04.2, or 1:02:04.2 past an hour. */
export function clock(seconds: number, tenths = true): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const sec = tenths ? rest.toFixed(1).padStart(4, '0') : String(Math.floor(rest)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export type Pinned = {segmentId: string; start: number; end: number; text: string; unsure: string[]};

/** Whisper gives "4" and ".2", "Kestrel" and ","): a word that opens with punctuation joins the word before it. */
const joinsBefore = (word: string) => /^[.,;:!?%’')\]]/.test(word);
export const joinWords = (words: {w: string}[]): string => words.map((w, i) => (i && !joinsBefore(w.w) ? ' ' : '') + w.w).join('');
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The part of a segment a reader chose: the words of the selection found in order among the segment's words, with
 *  the time from the first to the last. The whole segment when nothing (or nothing that matches) was chosen. */
export function partOf(segment: TranscriptSegmentOut, chosen: string, unsureBelow: number): Pinned {
  const words = segment.words;
  const wanted = chosen.split(/\s+/).map(norm).filter(Boolean);
  const whole = (): Pinned => ({segmentId: segment.id, start: segment.start, end: segment.end, text: segment.text,
    unsure: words.filter(w => w.p < unsureBelow).map(w => w.w)});
  if (!wanted.length || !words.length) return whole();
  const tokens = words.map(w => norm(w.w));
  for (let i = 0; i + wanted.length <= tokens.length; i++) {
    if (wanted.every((w, k) => tokens[i + k] === w || (k === 0 && tokens[i + k].endsWith(w)) || (k === wanted.length - 1 && tokens[i + k].startsWith(w)))) {
      const part = words.slice(i, i + wanted.length);
      return {segmentId: segment.id, start: part[0].s, end: part[part.length - 1].e, text: joinWords(part),
        unsure: part.filter(w => w.p < unsureBelow).map(w => w.w)};
    }
  }
  return whole();
}

/** Where a quote sits in the recording, in the W3C Media Fragments form the evidence keeps. */
export const placeOf = (p: {start: number; end: number}): string => `t=${p.start.toFixed(1)},${p.end.toFixed(1)}`;

function Words({segment, unsureBelow, now}: {segment: TranscriptSegmentOut; unsureBelow: number; now: number}): ReactElement {
  if (!segment.words.length) return <>{segment.text}</>;
  return <>{segment.words.map((w, i) => {
    const unsure = w.p < unsureBelow;
    const said = now >= w.s;
    return <span key={i} className={`lr-w${unsure ? ' lc' : ''}${said ? ' said' : ''}`}
      title={unsure ? `Machine unsure: ${Math.round(w.p * 100)}%. Listen before quoting it.` : undefined}>{i && !joinsBefore(w.w) ? ' ' : ''}{w.w}</span>;
  })}</>;
}

function Outline({t, now, duration, pinned, onSeek}: {t: TranscriptOut; now: number; duration: number; pinned: Pinned | null;
  onSeek: (seconds: number) => void}): ReactElement {
  const from = duration > WINDOW ? Math.min(Math.max(0, now - WINDOW / 3), duration - WINDOW) : 0;
  const to = duration > WINDOW ? from + WINDOW : duration;
  const span = Math.max(to - from, 0.001);
  const x = (s: number) => ((s - from) / span) * 1000;
  const step = t.outline_step || duration / Math.max(t.outline.length, 1);
  const first = Math.max(0, Math.floor(from / step));
  const last = Math.min(t.outline.length, Math.ceil(to / step));
  const peaks = t.outline.slice(first, last);
  const bar = peaks.length ? 1000 / peaks.length : 0;
  const seekFrom = (e: ReactPointerEvent<SVGSVGElement>, scaleFrom: number, scaleSpan: number) => {
    const box = e.currentTarget.getBoundingClientRect();
    onSeek(scaleFrom + ((e.clientX - box.left) / Math.max(box.width, 1)) * scaleSpan);
  };
  return <div className="lr-wf">
    <svg className="lr-ovw" viewBox="0 0 1000 10" preserveAspectRatio="none" role="presentation" onPointerDown={e => seekFrom(e, 0, duration)}>
      <rect x={0} y={0} width={1000} height={10} rx={5} className="lr-ovw-bg"/>
      <rect x={(from / duration) * 1000} y={0} width={(span / duration) * 1000} height={10} rx={4} className="lr-ovw-win"/>
      <rect x={(now / duration) * 1000 - 1} y={0} width={2} height={10} className="lr-ovw-ph"/>
    </svg>
    <p className="lr-wf-cap">Whole file {clock(duration, false)} · showing {clock(from, false)}–{clock(to, false)}
      <span><i className="lr-key pin"/>pinned quote <i className="lr-key unsure"/>machine unsure <i className="lr-key ns"/>no speech</span></p>
    <svg className="lr-wave" viewBox="0 0 1000 120" preserveAspectRatio="none" role="slider" tabIndex={-1} aria-label="Position in the recording"
      aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(now)} aria-valuetext={clock(now)}
      onPointerDown={e => seekFrom(e, from, span)}>
      {t.segments.filter(s => s.end > from && s.start < to).map(s => s.kind === 'no_speech'
        ? <rect key={s.id} className="lr-ns" x={x(s.start)} y={22} width={Math.max(1, x(s.end) - x(s.start))} height={92}/>
        : <g key={s.id}>
          <rect className="lr-sp" x={x(s.start)} y={4} width={Math.max(1, x(s.end) - x(s.start) - 2)} height={8} rx={4}/>
          {s.words.filter(w => w.p < t.unsure_below).map((w, i) => <circle key={i} className="lr-unsure" cx={x((w.s + w.e) / 2)} cy={17} r={2.5}/>)}
        </g>)}
      {pinned && <rect className="lr-pin" x={x(pinned.start)} y={22} width={Math.max(2, x(pinned.end) - x(pinned.start))} height={92}/>}
      {peaks.map((p, i) => <rect key={i} className={(first + i) * step < now ? 'lr-bar on' : 'lr-bar'} x={i * bar} y={68 - p * 44} width={Math.max(bar * 0.7, 0.5)} height={Math.max(p * 88, 1)}/>)}
      <line className="lr-ph" x1={x(now)} x2={x(now)} y1={0} y2={120}/>
    </svg>
  </div>;
}

/** The reading room for a recording. `doc` is the document as the reading room fetched it. */
export function ListenRoom({doc, caseName, decideHref, onClose}: {doc: DocumentDetailOut; caseName: string; decideHref: string; onClose: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const transcript = useQuery({...getDocumentTranscriptOptions({path: {document_id: doc.id}}), enabled: doc.extraction_status === 'complete', retry: false});
  const t = transcript.data;
  // Names and claims found in the transcript wait in Decide, like any document's.
  const waiting = (useQuery({...listDocumentCandidatesEndpointOptions({path: {document_id: doc.id}})}).data ?? [])
    .filter(c => c.review_status === 'proposed').length;
  const media = useQuery({queryKey: ['document-media', doc.id], queryFn: () => api.blob(`/api/documents/${doc.id}/media`), staleTime: Infinity, retry: false});
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!media.data) return undefined;
    const made = URL.createObjectURL(media.data);
    setSrc(made);
    return () => URL.revokeObjectURL(made);
  }, [media.data]);
  const player = useRef<HTMLMediaElement | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<'listen' | 'details'>('listen');
  const [find, setFind] = useState('');
  const [pinned, setPinned] = useState<Pinned | null>(null);
  // The pinned part has been played from its start to its end: "I heard this" may be said.
  const [playedThrough, setPlayedThrough] = useState(false);
  const [heard, setHeard] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const partStart = useRef<number | null>(null);
  const stopAt = useRef<number | null>(null);
  const lines = useRef<HTMLDivElement>(null);
  const duration = t?.duration ?? player.current?.duration ?? 0;
  const segments = useMemo(() => t?.segments ?? [], [t]);
  const current = segments.find(s => now >= s.start && now < s.end && s.kind === 'speech') ?? null;
  const findLower = find.trim().toLowerCase();
  const found = findLower.length > 1 ? segments.filter(s => s.kind === 'speech' && s.text.toLowerCase().includes(findLower)) : [];

  // The playhead follows the recording smoothly while it plays; a part played to its end stops there.
  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    const tick = () => {
      const el = player.current;
      if (el) {
        setNow(el.currentTime);
        if (pinned && partStart.current !== null && partStart.current <= pinned.start + 0.3 && el.currentTime >= pinned.end - 0.05) setPlayedThrough(true);
        if (stopAt.current !== null && el.currentTime >= stopAt.current) { el.pause(); stopAt.current = null; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, pinned]);

  const seek = useCallback((seconds: number) => {
    const el = player.current;
    const to = Math.min(Math.max(0, seconds), duration || seconds);
    if (el) el.currentTime = to;
    setNow(to);
    partStart.current = to;
  }, [duration]);
  const toggle = useCallback(() => {
    const el = player.current;
    if (!el) return;
    if (el.paused) { partStart.current = el.currentTime; stopAt.current = null; void el.play().catch(() => setStatus('The recording could not be played here')); }
    else el.pause();
  }, []);
  const playPart = () => {
    if (!pinned || !player.current) return;
    seek(pinned.start);
    stopAt.current = pinned.end;
    void player.current.play().catch(() => setStatus('The recording could not be played here'));
  };
  const pin = useCallback((segment: TranscriptSegmentOut | null, chosen = '') => {
    if (!segment || segment.kind !== 'speech' || !t) return;
    setPinned(partOf(segment, chosen, t.unsure_below));
    setPlayedThrough(false);
    setHeard(false);
    setSaved(null);
    setStatus('');
  }, [t]);
  const save = async () => {
    if (!pinned || !heard) return;
    try {
      const ev = (await createEvidenceEndpoint({body: {source_id: doc.source_id, quote: pinned.text, locator: placeOf(pinned), heard: true}, throwOnError: true})).data;
      setSaved(ev.id);
      setStatus('Saved as evidence, heard by you. Link it to a claim from Decide or the claim itself.');
      void queryClient.invalidateQueries({queryKey: listDocumentCandidatesEndpointQueryKey({path: {document_id: doc.id}})});
    } catch (error) { setStatus(errorMessage(error, 'Could not save the quote')); }
  };
  const pinSelection = () => {
    const sel = window.getSelection();
    const row = sel?.anchorNode ? (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement)?.closest<HTMLElement>('[data-segment]') : null;
    const chosen = sel?.toString().trim() ?? '';
    if (row && chosen) pin(segments.find(s => s.id === row.dataset.segment) ?? null, chosen);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)))) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); seek(now - STEP); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); seek(now + STEP); return; }
      if (e.key === 'Escape') { onClose(); return; }
      if (!singleKeysOn()) return;
      const k = e.key.toLowerCase();
      if (k === 'p') { e.preventDefault(); pin(current ?? segments.filter(s => s.kind === 'speech' && s.start <= now).at(-1) ?? null); }
      if (k === 'h' && pinned && playedThrough && !saved) { e.preventDefault(); setHeard(true); }
      if (k === 'e' && heard && !saved) { e.preventDefault(); void save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });  // eslint-disable-line react-hooks/exhaustive-deps -- reads the latest state on each key

  // The line playing stays in view.
  useEffect(() => {
    if (!playing || !current) return;
    lines.current?.querySelector<HTMLElement>(`[data-segment="${current.id}"]`)?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
  }, [current, playing]);

  const kindWord = t?.kind === 'video' ? 'Video' : 'Audio';
  const spoken = segments.filter(s => s.kind === 'speech');
  const silent = segments.filter(s => s.kind === 'no_speech');
  const unsureCount = t ? spoken.reduce((n, s) => n + s.words.filter(w => w.p < t.unsure_below).length, 0) : 0;
  const about = (t?.transcript ?? {}) as {tool?: string; model?: string; language?: string; language_probability?: number; ran_at?: string};
  const title = doc.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  const MediaTag = t?.kind === 'video' ? 'video' : 'audio';
  const events = {onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onEnded: () => setPlaying(false),
    onTimeUpdate: (e: {currentTarget: HTMLMediaElement}) => setNow(e.currentTarget.currentTime)};
  // A video plays in the left column, its picture beside the transcript; audio has no picture and sits in the player.
  const mediaElement = !src ? null : MediaTag === 'video'
    ? <video ref={el => { player.current = el; }} className="lr-video-el" src={src} preload="metadata" playsInline {...events}/>
    : <audio ref={el => { player.current = el; }} src={src} preload="metadata" {...events}/>;
  const onLineKey = (e: ReactKeyboardEvent<HTMLDivElement>, s: TranscriptSegmentOut) => {
    if (e.key === 'Enter') { e.preventDefault(); seek(s.start); }
  };

  return <div className="rr lr" data-calm-zone="" role="dialog" aria-modal="true" aria-label={`Reading room: ${doc.filename}`}>
    <header className="rr-top">
      <nav className="rr-crumbs" aria-label="You are here"><span>{caseName}</span><span>Bring in</span><span>Reading room</span><b>{title}</b></nav>
      <div role="tablist" aria-label="Views of this recording" className="rr-tabs">
        <button type="button" role="tab" aria-selected={tab === 'listen'} onClick={() => setTab('listen')}>Listen &amp; read</button>
        <button type="button" role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Details</button>
      </div>
      <span className="rr-find-box"><input type="search" className="rr-find-input" aria-label="Find in this recording" placeholder="Find in this recording" value={find}
        onChange={e => setFind(e.target.value)} onKeyDown={e => {
          if (e.key !== 'Enter' || !found.length) return;
          const next = found.find(s => s.start > now + 0.1) ?? found[0];
          seek(next.start);
        }}/></span>
      {findLower.length > 1 && <small className="rr-quiet">{found.length} found</small>}
      <span className="lr-badge">{kindWord} · {t ? clock(t.duration, false) : '…'}</span>
      <button type="button" className="rr-close" onClick={onClose} aria-label="Close the reading room">×</button>
    </header>

    <aside className="lr-left" aria-label="This recording">
      {MediaTag === 'video' && <section className="lr-panel lr-video" aria-label="Picture">{mediaElement ?? <p className="lr-note">Opening…</p>}</section>}
      <section className="lr-panel">
        <p className="lr-cap">In this recording</p>
        <dl className="lr-facts">
          <div><dt>Spoken parts</dt><dd>{spoken.length}</dd></div>
          <div><dt>No speech</dt><dd>{silent.length}</dd></div>
          <div><dt>Machine unsure</dt><dd>{unsureCount} word{unsureCount === 1 ? '' : 's'}</dd></div>
          <div><dt>Language</dt><dd>{about.language ? `${about.language} · ${Math.round((about.language_probability ?? 0) * 100)}%` : '–'}</dd></div>
        </dl>
        {waiting > 0 && <p className="lr-note"><a href={decideHref}>{waiting} proposal{waiting === 1 ? '' : 's'} from this transcript</a> wait in Decide.</p>}
      </section>
      <section className="lr-panel">
        <p className="lr-cap">Voices</p>
        <p className="lr-note">Speakers are not told apart yet: that needs a speaker model, a later step. When it comes, its lanes are guesses and the names are yours.</p>
      </section>
    </aside>

    <main className="lr-read" aria-label="Transcript">
      {tab === 'details' ? <dl className="rr-details">
        <div><dt>File</dt><dd>{doc.filename}</dd></div>
        <div><dt>Fingerprint</dt><dd><code>{doc.sha256}</code></dd></div>
        <div><dt>Streams</dt><dd>{(t?.streams ?? []).map((s, i) => <span key={i}>{String(s.type)} · {String(s.codec ?? '')}{s.sample_rate ? ` · ${String(s.sample_rate)} Hz` : ''}{s.width ? ` · ${String(s.width)}×${String(s.height)}` : ''}<br/></span>)}</dd></div>
        <div><dt>Transcribed</dt><dd>{about.tool} · {about.model} · on this computer{about.ran_at ? ` · ${about.ran_at.slice(0, 16).replace('T', ' ')} UTC` : ''}</dd></div>
        {(doc.extraction_issues ?? []).map(i => <div key={i}><dt>Note</dt><dd>{i}</dd></div>)}
      </dl> : <>
        <div className="lr-rbar">
          <span className="lr-seg"><span aria-current="true">Our transcription</span></span>
          <p className="lr-meta">{about.tool} · {about.model} · run on this computer{about.ran_at ? ` ${about.ran_at.slice(0, 16).replace('T', ' ')} UTC` : ''}
            {about.language ? ` · ${about.language} ${Math.round((about.language_probability ?? 0) * 100)}%` : ''}</p>
        </div>
        <div ref={lines} className="lr-lines" onMouseUp={pinSelection}>
          {doc.extraction_status !== 'complete' ? <p className="rr-quiet">{doc.extraction_status === 'failed' ? `Not transcribed: ${doc.extraction_error ?? ''}` : 'Being transcribed on this computer…'}</p>
            : transcript.isError ? <p role="alert">{errorMessage(transcript.error, 'Could not open the transcript')}</p>
            : !t ? <p className="rr-quiet">Opening the transcript…</p>
            : segments.map(s => s.kind === 'no_speech'
              ? <div key={s.id} data-segment={s.id} className="lr-sg ns" role="group" aria-label={`No speech, ${clock(s.start)} to ${clock(s.end)}`}>
                <button type="button" className="lr-tc" onClick={() => seek(s.start)}>{clock(s.start)}</button>
                <span className="lr-sp">No speech</span>
                <span className="lr-tx">{s.text ? <s>{s.text}</s> : null}
                  <span className="lr-nsflag"><i aria-hidden="true">!</i>No speech was found from {clock(s.start)} to {clock(s.end)}.
                    {s.text ? ' Words here may be invented by the model.' : ''} They are kept apart and never used as evidence.</span></span>
              </div>
              : <div key={s.id} data-segment={s.id} tabIndex={0} onKeyDown={e => onLineKey(e, s)}
                className={`lr-sg${current?.id === s.id ? ' now' : ''}${pinned?.segmentId === s.id ? ' pin' : ''}${found.includes(s) ? ' hit' : ''}`}
                aria-current={current?.id === s.id ? 'true' : undefined}>
                <button type="button" className="lr-tc" onClick={() => seek(s.start)} aria-label={`Play from ${clock(s.start)}`}>{clock(s.start)}</button>
                <span className="lr-sp">{s.speaker ?? ''}</span>
                <span className="lr-tx"><Words segment={s} unsureBelow={t.unsure_below} now={now}/></span>
                <button type="button" className="lr-pinbtn" onClick={() => pin(s)} aria-label={`Pin the line at ${clock(s.start)}`}>Pin</button>
              </div>)}
        </div>
      </>}
    </main>

    <aside className="lr-right" aria-label="Pinned quote and files">
      <section className={`lr-panel lr-pinned${pinned ? ' hot' : ''}`} aria-label="Pinned quote">
        <p className="lr-cap">Pinned quote {pinned && <span className={`lr-chip ${saved ? 'ok' : heard ? 'teal' : 'amber'}`}>
          {saved ? 'Saved · heard by you' : heard ? 'Heard by you' : 'Transcribed · not yet heard'}</span>}</p>
        {pinned ? <>
          <blockquote className="lr-quote">“{pinned.text}”</blockquote>
          <dl className="lr-kv">
            <dt>Place</dt><dd><code>media:#{placeOf(pinned)}</code></dd>
            <dt>From</dt><dd>{doc.filename} · the original, as uploaded</dd>
          </dl>
          <ol className="lr-steps" aria-label="Before it is evidence">
            <li className="ok">1 Machine ✓</li>
            <li className={heard ? 'ok' : 'cur'}>2 Heard by you{heard ? ' ✓' : ''}</li>
            <li className={saved ? 'cur' : ''}>3 In a claim</li>
          </ol>
          {pinned.unsure.length > 0 && <p className="lr-note">The machine was unsure of <b>{pinned.unsure.join(', ')}</b>. Listen before you quote.</p>}
          <div className="lr-acts">
            <button type="button" className="t" onClick={playPart} disabled={!src}>▶ Play this part · {(pinned.end - pinned.start).toFixed(1)} s</button>
            <button type="button" onClick={() => setHeard(true)} disabled={!playedThrough || heard || Boolean(saved)}
              title={playedThrough ? undefined : 'Play the part through first'}>I heard this <kbd>H</kbd></button>
          </div>
          <div className="lr-acts">
            <button type="button" className="p" onClick={() => void save()} disabled={!heard || Boolean(saved)}>Save as evidence <kbd>E</kbd></button>
          </div>
          <p className="lr-note">Evidence stays locked until you have heard the part yourself. Machines can invent words.</p>
        </> : <p className="lr-note">Pin a line with its Pin button or <kbd>P</kbd> while it plays, or choose words in it. A quote from a recording is saved only once you have heard it.</p>}
        {status && <p role="status" className="lr-status">{status}</p>}
      </section>
      <section className="lr-panel" aria-label="Files">
        <p className="lr-cap">Files <span>original kept unaltered</span></p>
        <div className="lr-file orig"><span className="lr-chip teal">Original</span> <b>{doc.filename}</b><small>SHA-256 {doc.sha256.slice(0, 4)} {doc.sha256.slice(4, 8)} …{doc.sha256.slice(-4)}</small></div>
        <p className="lr-note">The transcript was made from a 16 kHz copy decoded in memory; no derived file is kept. Quotes play from the original.</p>
      </section>
    </aside>

    <footer className="lr-player" aria-label="Player">
      <div className="lr-tport">
        <div className="lr-btns">
          <button type="button" className="lr-pbtn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} disabled={!src}>{playing ? '❚❚' : '▶'}</button>
          <button type="button" className="lr-pbtn ghost" onClick={() => seek(now - STEP)} aria-label="Back 5 seconds">−5</button>
          <button type="button" className="lr-pbtn ghost" onClick={() => seek(now + STEP)} aria-label="Forward 5 seconds">+5</button>
        </div>
        <p className="lr-time" aria-live="off">{clock(now).replace(/\.\d$/, '')}<small>.{clock(now).slice(-1)}</small></p>
      </div>
      {t ? <Outline t={t} now={now} duration={duration || t.duration} pinned={pinned} onSeek={seek}/> : <div className="lr-wf"/>}
      {MediaTag === 'audio' && mediaElement}
      {media.isError && <p role="alert" className="lr-status">{errorMessage(media.error, 'Could not load the recording')}</p>}
    </footer>
  </div>;
}
