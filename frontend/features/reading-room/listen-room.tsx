'use client';
// Listen & read (the reading room for a recording; mockup INTAKE_4, ADR-0020). The transcript made on this computer,
// timecoded, beside the recording itself: each spoken part with its time, words the machine was unsure of dotted,
// the parts with no speech kept apart (crossed through, never quotable: words there may be invented). A line, or words
// chosen in it, is pinned as a quote with its place in the recording (media:#t=start,end); the quote stays locked until
// the reporter has played that part through and says "I heard this" (the server holds the same rule). Along the
// bottom, the player: play, five seconds back or on, the time, the recording's outline with the spoken parts above it.
// Keys: Space plays or pauses, ← → move five seconds, P pins the line playing, H "I heard this", E saves as evidence.
// From the episode's feed (when it came through Following): its parts, and the publisher's own transcript, shown on its
// own and beside ours (Compare: the words that differ are outlined on both sides; neither is right by default). Files
// made from the recording (a cleaned copy for listening, each saved quote's part as a clip) are new files with their
// edit trail (ADR-0021); the recording itself is never changed and quotes play from the original.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {compareTranscriptsOptions, getDocumentTranscriptOptions, getDocumentTranscriptQueryKey, listDerivedOptions, listDerivedQueryKey,
  listDocumentCandidatesEndpointOptions, listDocumentCandidatesEndpointQueryKey, listEntitiesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {createEvidenceEndpoint, findVoices, makeCleanedCopy, makeClip, nameVoice} from '../../lib/generated/sdk.gen';
import type {DerivedFileOut, DocumentDetailOut, TranscriptCompareRowOut, TranscriptOut, TranscriptSegmentOut, VoiceOut,
  VoicesOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {FingerprintMark} from '../the-drop/kind-marks';
import {CleanAndCut, SyncPanel} from './sound-tools';
import {useWorkbenchStore} from '../../lib/workbench-store';

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

/** A voice as the screen names it: the name a person gave it, else "Voice 2", a guess. */
export function voiceLabel(voice: string | null | undefined, voices: VoiceOut[]): {text: string; named: boolean} | null {
  if (!voice) return null;
  const v = voices.find(x => x.voice === voice);
  return v?.name ? {text: v.name, named: true} : {text: `Voice ${voice}`, named: false};
}

/** A voice's tag: its colour and name, "?" while it is a guess; who named it (and `more`) on hover. Focusable only where
 *  it stands alone (the Voices list), not on every transcript line. */
function VoiceTag({voice, voices, more, tabbable = false}: {voice: string | null | undefined; voices: VoiceOut[]; more?: string; tabbable?: boolean}): ReactElement {
  const label = voiceLabel(voice, voices);
  if (!label) return <span className="lr-sp"/>;
  return <Reveal tabbable={tabbable} className={`lr-sp lr-v${(Number(voice) - 1) % 6 + 1}`}
    detail={<><b>{label.named ? `${label.text}, named by a person` : 'A guess by the speaker model'}</b>{more ? <span className="rv-row">{more}</span> : null}</>}>
    <i aria-hidden="true"/>{label.text}{label.named ? '' : ' ?'}</Reveal>;
}

const spoken = (seconds: number) => seconds >= 60 ? `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s` : `${Math.round(seconds)} s`;
const voiceClass = (voice: string | number | null | undefined) => `lr-v${(Number(voice) - 1) % 6 + 1}`;
/** Past this many voices, the ones heard for only a moment fold away behind one row. */
const MANY_VOICES = 6;
const BRIEF = 5;

/** Voices (INTAKE_4, ADR-0026): the voices the machine told apart in this recording, as guesses, and the names a
 *  person gave them. One row each: its colour, its name or "Voice 2 · a guess"; a click on the row names it there.
 *  Naming one as a party of the case links it; nothing is matched across recordings. */
function Voices({doc, v, onChanged, onListening}: {doc: DocumentDetailOut; v: VoicesOut | null | undefined; onChanged: (words: string) => void;
  onListening: () => void}): ReactElement {
  const [naming, setNaming] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [allShown, setAllShown] = useState(false);
  const parties = useQuery({...listEntitiesOptions({path: {investigation_id: doc.investigation_id}, query: {limit: 500}}), enabled: naming !== null}).data ?? [];
  const voices = v?.voices ?? [];
  // The voices heard longest first; when there are many, the ones heard for a moment fold behind one row.
  const ordered = [...voices].sort((a, b) => b.spoken - a.spoken);
  const brief = voices.length > MANY_VOICES ? ordered.filter(x => x.spoken < BRIEF && !x.name && x.voice !== naming) : [];
  const shown = allShown ? ordered : ordered.filter(x => !brief.includes(x));
  const give = async (voice: string, words: string) => {
    const party = parties.find(p => p.caption.toLowerCase() === words.trim().toLowerCase());
    setBusy(true);
    try {
      await nameVoice({path: {document_id: doc.id, voice}, body: party ? {entity_id: party.id} : {name: words.trim() || null}, throwOnError: true});
      onChanged(words.trim() ? `Voice ${voice} is now “${party?.caption ?? words.trim()}”${party ? ', a party of the case' : ''}. Named by you.` : `Voice ${voice}'s name was cleared; the old name is kept in its history.`);
      setNaming(null); setTyped('');
    } catch (error) { onChanged(errorMessage(error, 'Could not name the voice')); }
    setBusy(false);
  };
  const listen = async () => {
    setBusy(true);
    try { await findVoices({path: {document_id: doc.id}, throwOnError: true}); onChanged('Listening for voices on this computer. They appear here when found.'); onListening(); }
    catch (error) { onChanged(errorMessage(error, 'Could not listen for voices')); }
    setBusy(false);
  };
  return <section className="lr-panel" aria-label="Voices">
    <p className="lr-cap"><Reveal detail="Lanes are guesses by a speaker model, in this recording only. Names are yours; a voice is never matched to another recording. Click a voice to name it.">Voices</Reveal>
      {v?.found_by && <span>⌂ on this computer</span>}</p>
    {voices.length ? <ul className="lr-voices">{shown.map(x => <li key={x.voice} className={voiceClass(x.voice)}>
      {naming === x.voice ? <form className="lr-name" onSubmit={e => { e.preventDefault(); void give(x.voice, typed); }}>
        <i aria-hidden="true"/>
        <input autoFocus list={`lr-parties-${doc.id}`} value={typed} onChange={e => setTyped(e.target.value)} aria-label={`Name voice ${x.voice}`}
          placeholder="A party, or a name" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); } }}/>
        <datalist id={`lr-parties-${doc.id}`}>{parties.map(p => <option key={p.id} value={p.caption}/>)}</datalist>
        <span className="lr-acts">
          <button type="submit" disabled={busy}>Name it</button>
          {x.name && <button type="button" onClick={() => void give(x.voice, '')} disabled={busy}>Clear</button>}
          <button type="button" onClick={() => setNaming(null)}>Cancel</button>
        </span>
      </form>
      : <Reveal tabbable={false} detail={<><b>{x.name ? `${x.name}, named by ${by(x.named_by)}` : `Voice ${x.voice}, a guess by the speaker model`}</b>
        <span className="rv-row">{x.turns} turn{x.turns === 1 ? '' : 's'} · {spoken(x.spoken)}</span>
        <span className="rv-row">Click to {x.name ? 'rename it' : 'name it'}.</span></>}>
        <button type="button" className="lr-vrow" onClick={() => { setNaming(x.voice); setTyped(x.name ?? ''); }}
          aria-label={x.name ? `${x.name}: rename this voice` : `Voice ${x.voice}, a guess: name this voice`}>
          <i aria-hidden="true"/><b>{x.name ?? `Voice ${x.voice}`}</b><small>{x.name ? `named by ${by(x.named_by)}` : 'a guess'}</small><em aria-hidden="true">✎</em>
        </button></Reveal>}
    </li>)}
      {brief.length > 0 && <li><button type="button" className="lr-vrow more" onClick={() => setAllShown(!allShown)} aria-expanded={allShown}>
        {allShown ? 'Fold the brief voices' : <><b>+{brief.length}</b><small>heard for under {BRIEF} s</small></>}</button></li>}
    </ul>
    : v?.unavailable ? <p className="lr-note">Voices are not told apart yet: {v.unavailable}.</p>
    : <div className="lr-acts"><button type="button" onClick={() => void listen()} disabled={busy || doc.extraction_status !== 'complete'}>Listen for voices</button></div>}
    {voices.length > 0 && v?.found_by && <details className="lr-note"><summary>How they were found</summary>
      {String(v.found_by.tool ?? '')} · {String(v.found_by.segmentation ?? '')} · {String(v.found_by.embedding ?? '')}
      {(v.history ?? []).length > 0 && <ul>{(v.history ?? []).map((h, i) => <li key={i}>{String(h.at ?? '').slice(0, 16).replace('T', ' ')} · voice {String(h.voice)}: “{String(h.name ?? '')}” {String(h.what ?? '')}</li>)}</ul>}
      <div className="lr-acts"><button type="button" onClick={() => void listen()} disabled={busy}>Listen again (names are cleared, kept in history)</button></div>
    </details>}
  </section>;
}

export type Part = {start: number; title: string; voice?: string; noSpeech?: boolean};
/** A floor this long, held by one voice, starts a part of its own. */
const FLOOR = 20;

/** The parts of a recording: the ones its feed names; else, honestly derived, where one voice takes the floor for
 *  {FLOOR} s or more (from the speaker turns) and where a long stretch has no speech, each titled by its first words.
 *  None when neither is known. */
export function partsOf(t: TranscriptOut): {parts: Part[]; fromFeed: boolean} {
  if ((t.parts ?? []).length) return {parts: (t.parts ?? []).map(p => ({start: p.start, title: p.title})), fromFeed: true};
  const turns = t.voices?.turns ?? [];
  if (!turns.length) return {parts: [], fromFeed: false};
  const runs: {start: number; end: number; voice: string}[] = [];
  for (const [start, end, voice] of turns) {
    const last = runs.at(-1);
    if (last && last.voice === String(voice)) last.end = Math.max(last.end, end);
    else runs.push({start, end, voice: String(voice)});
  }
  const firstWords = (from: number) => {
    const s = t.segments.find(x => x.kind === 'speech' && x.end > from + 0.3);
    if (!s) return '…';
    const words = s.text.trim().split(/\s+/);
    return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : s.text.trim();
  };
  const starts: Part[] = [];
  for (const r of runs.filter(x => x.end - x.start >= FLOOR)) starts.push({start: r.start, title: '', voice: r.voice});
  for (const s of t.segments.filter(x => x.kind === 'no_speech' && x.end - x.start >= FLOOR / 2)) starts.push({start: s.start, title: 'No speech', noSpeech: true});
  starts.sort((a, b) => a.start - b.start);
  const parts: Part[] = [];
  for (const p of starts) {
    const at = parts.length === 0 && p.start < FLOOR ? 0 : p.start;
    if (parts.length && at - parts[parts.length - 1].start < FLOOR / 2) continue;
    if (!parts.length && at > 0) parts.push({start: 0, title: firstWords(0), voice: runs[0]?.voice});
    parts.push({...p, start: at, title: p.noSpeech ? p.title : firstWords(p.start)});
  }
  return {parts: parts.length > 1 ? parts : [], fromFeed: false};
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

/** A tick every so often across the window: about eight to ten of them. */
const tickStep = (span: number) => [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800].find(s => span / s <= 10) ?? 3600;

/** Who spoke when, per voice: the speaker turns when the voices were found, else the voice on each spoken part. */
function lanesOf(t: TranscriptOut): {voice: string; start: number; end: number}[] {
  const turns = t.voices?.turns ?? [];
  if (turns.length) return turns.map(([start, end, voice]) => ({voice: String(voice), start, end}));
  return t.segments.filter(s => s.kind === 'speech' && s.speaker).map(s => ({voice: String(s.speaker), start: s.start, end: s.end}));
}

function Outline({t, now, duration, pinned, onSeek}: {t: TranscriptOut; now: number; duration: number; pinned: Pinned | null;
  onSeek: (seconds: number) => void}): ReactElement {
  const from = duration > WINDOW ? Math.min(Math.max(0, now - WINDOW / 3), duration - WINDOW) : 0;
  const to = duration > WINDOW ? from + WINDOW : duration;
  const span = Math.max(to - from, 0.001);
  const x = (s: number) => ((s - from) / span) * 1000;
  const pct = (s: number) => `${((s - from) / span) * 100}%`;
  const step = t.outline_step || duration / Math.max(t.outline.length, 1);
  const first = Math.max(0, Math.floor(from / step));
  const last = Math.min(t.outline.length, Math.ceil(to / step));
  const peaks = t.outline.slice(first, last);
  const bar = peaks.length ? 1000 / peaks.length : 0;
  const speech = t.segments.filter(s => s.kind === 'speech');
  const spokenAt = (s: number) => speech.some(x => s >= x.start && s < x.end);
  const seekFrom = (e: ReactPointerEvent<Element>, scaleFrom: number, scaleSpan: number) => {
    const box = e.currentTarget.getBoundingClientRect();
    onSeek(scaleFrom + ((e.clientX - box.left) / Math.max(box.width, 1)) * scaleSpan);
  };
  // One lane per voice heard in the window, in the order the voices are numbered; their height shares the band.
  const turns = lanesOf(t).filter(r => r.end > from && r.start < to);
  const laneVoices = [...new Set(turns.map(r => r.voice))].sort((a, b) => Number(a) - Number(b));
  const laneH = laneVoices.length ? Math.min(7, 34 / laneVoices.length) : 0;
  const laneY = (voice: string) => 2 + laneVoices.indexOf(voice) * laneH;
  const lanesEnd = 2 + laneVoices.length * laneH;
  const waveTop = lanesEnd + 10;
  const mid = waveTop + (120 - waveTop) / 2;
  const half = (120 - waveTop) / 2 - 2;
  const every = tickStep(span);
  const ticks: number[] = [];
  for (let s = Math.ceil(from / every) * every; s <= to; s += every) ticks.push(s);
  const voices = t.voices?.voices ?? [];
  return <div className="lr-wf">
    {/* The window shows; the whole length and the marks' key are on hover (Ony, 29 Oct). */}
    <p className="lr-wf-cap"><Reveal detail={<><span className="rv-row">Whole file {clock(duration, false)} · showing {clock(from, false)}–{clock(to, false)}</span>
      <span className="rv-row"><i className="lr-key pin"/>pinned quote <i className="lr-key unsure"/>machine unsure <i className="lr-key ns"/>no speech</span>
      <span className="rv-row">Above the outline, a lane for each voice.</span></>}>
      {clock(from, false)}–{clock(to, false)}</Reveal>
      <svg className="lr-ovw" viewBox="0 0 1000 10" preserveAspectRatio="none" role="presentation" onPointerDown={e => seekFrom(e, 0, duration)}>
        <rect x={0} y={4} width={1000} height={2} rx={1} className="lr-ovw-bg"/>
        {pinned && <rect x={(pinned.start / duration) * 1000} y={2} width={Math.max(3, ((pinned.end - pinned.start) / duration) * 1000)} height={6} className="lr-ovw-pin"/>}
        <rect x={(from / duration) * 1000} y={1} width={(span / duration) * 1000} height={8} rx={4} className="lr-ovw-win"/>
        <rect x={(now / duration) * 1000 - 1} y={0} width={2} height={10} className="lr-ovw-ph"/>
      </svg></p>
    <div className="lr-ticks" aria-hidden="true">{ticks.map(s => <span key={s} style={{left: pct(s)}}>{clock(s, false)}</span>)}</div>
    <div className="lr-wave-box">
      <svg className="lr-wave" viewBox="0 0 1000 120" preserveAspectRatio="none" role="slider" tabIndex={-1} aria-label="Position in the recording"
        aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(now)} aria-valuetext={clock(now)}
        onPointerDown={e => seekFrom(e, from, span)}>
        <defs><pattern id="lr-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="6" className="lr-hatch"/></pattern></defs>
        {ticks.map(s => <line key={s} className="lr-tick" x1={x(s)} x2={x(s)} y1={0} y2={120}/>)}
        {turns.map((r, i) => <rect key={i} className={`lr-lane ${voiceClass(r.voice)}`} x={x(r.start)} y={laneY(r.voice)}
          width={Math.max(1, x(r.end) - x(r.start) - 1.5)} height={Math.max(1.5, laneH - 1.5)} rx={Math.min(3, laneH / 2)}>
          <title>{voiceLabel(r.voice, voices)?.text ?? `Voice ${r.voice}`} · {clock(r.start)}–{clock(r.end)}</title></rect>)}
        {t.segments.filter(s => s.end > from && s.start < to).map(s => s.kind === 'no_speech'
          ? <rect key={s.id} className="lr-ns" x={x(s.start)} y={waveTop} width={Math.max(1, x(s.end) - x(s.start))} height={120 - waveTop}/>
          : s.words.filter(w => w.p < t.unsure_below).map((w, i) => <rect key={`${s.id}-${i}`} className="lr-unsure" x={x((w.s + w.e) / 2) - 2} y={lanesEnd + 3} width={4} height={4}
            transform={`rotate(45 ${x((w.s + w.e) / 2)} ${lanesEnd + 5})`}/>))}
        {pinned && <rect className="lr-pin" x={x(pinned.start)} y={waveTop - 2} width={Math.max(2, x(pinned.end) - x(pinned.start))} height={122 - waveTop}/>}
        {peaks.map((p, i) => { const at = (first + i) * step; return <rect key={i} className={`lr-bar${spokenAt(at) ? ' sp' : ''}${at < now ? ' on' : ''}`}
          x={i * bar} y={mid - Math.max(p * half, 0.5)} width={Math.max(bar * 0.7, 0.5)} height={Math.max(p * half * 2, 1)}/>; })}
        <line className="lr-ph" x1={x(now)} x2={x(now)} y1={0} y2={120}/>
      </svg>
      <i className="lr-ph-dot" aria-hidden="true" style={{left: pct(now)}}/>
      {pinned && pinned.end > from && pinned.start < to && <code className="lr-pin-at" style={{left: pct(pinned.start)}}>media:#{placeOf(pinned)}</code>}
    </div>
  </div>;
}

/** The reading room for a recording. `doc` is the document as the reading room fetched it. */
const mb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const fingerprint = (h: string) => `${h.slice(0, 4)} ${h.slice(4, 8)} …${h.slice(-4)}`;
const by = (who?: string | null) => (!who || who === 'local-owner' ? 'you' : who);

/** What a derived file is, in words: the cleaned copy or a clip, and what it is for. */
export function derivedLine(d: DerivedFileOut): {name: string; note: string; right: string} {
  const p = d.params as {start?: number; end?: number; from?: string; sample_rate?: number; channels?: number};
  if (d.operation === 'clip') {
    const len = (p.end ?? 0) - (p.start ?? 0);
    return {name: `clip_${(p.start ?? 0).toFixed(1)}-${(p.end ?? 0).toFixed(1)}.wav`, right: `${len.toFixed(1)} s`,
      note: `The part ${clock(p.start ?? 0)}–${clock(p.end ?? 0)}, cut from ${p.from ?? 'the original'}. Quotes play from the original.`};
  }
  if (d.operation === 'speech_cleaned') {
    const chain = (d.params as {chain?: Array<{effect: string; hz?: number; level?: string; target_lufs?: number}>}).chain ?? [];
    const said = chain.map(c => c.effect === 'dehum' ? `hum${c.hz ? ` at ${c.hz} Hz` : ''} taken out` : c.effect === 'denoise' ? `${c.level ?? 'light'} noise reduction`
      : c.effect === 'loudness' ? `loudness evened to ${c.target_lufs} LUFS` : c.effect).join(', ');
    return {name: 'speech-cleaned.wav', right: mb(d.size),
      note: `${(p.sample_rate ?? 16000) / 1000} kHz mono, ${said || 'hum taken out, light noise reduction'}. For listening only.`};
  }
  return {name: d.operation, right: mb(d.size), note: d.tool};
}

/** A derived file played from its own bytes (it is never the evidence: quotes play from the original). */
function DerivedPlayer({file}: {file: DerivedFileOut}): ReactElement {
  const blob = useQuery({queryKey: ['derived-file', file.id], queryFn: () => api.blob(`/api/derived-files/${file.id}/file`), staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return undefined;
    const made = URL.createObjectURL(blob.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob.data]);
  if (blob.isError) return <p role="alert" className="lr-note">{errorMessage(blob.error, 'Could not open the file')}</p>;
  return url ? <audio controls preload="none" src={url} aria-label={`Play ${derivedLine(file).name}`}/> : <p className="lr-note">Opening…</p>;
}

function Marked({words}: {words: {w: string; differs: boolean}[]}): ReactElement {
  return <>{words.map((w, i) => <span key={i}>{i ? ' ' : ''}{w.differs ? <mark className="lr-diff">{w.w}</mark> : w.w}</span>)}</>;
}

function Compare({rows, onSeek}: {rows: TranscriptCompareRowOut[]; onSeek: (s: number) => void}): ReactElement {
  return <div className="lr-lines lr-cmp" aria-label="Our transcription beside the publisher's">{rows.map(r => r.kind === 'no_speech'
    ? <div key={r.segment_id} className="lr-sg ns lr-cmprow" role="group" aria-label={`No speech, ${clock(r.start)}`}>
      <button type="button" className="lr-tc" onClick={() => onSeek(r.start)}>{clock(r.start)}</button><span className="lr-sp">No speech</span>
      <span className="lr-tx">{r.no_speech_text ? <s>{r.no_speech_text}</s> : null}</span>
      <span className="lr-tx theirs">{r.theirs.length ? <Marked words={r.theirs}/> : <i>(nothing written here)</i>}</span>
    </div>
    : <div key={r.segment_id} className={`lr-sg lr-cmprow${r.differs ? ' differs' : ''}`} role="group" aria-label={`${clock(r.start)}, ${r.differs} word${r.differs === 1 ? '' : 's'} differ`}>
      <button type="button" className="lr-tc" onClick={() => onSeek(r.start)}>{clock(r.start)}</button><span className="lr-sp">{r.speaker ?? ''}</span>
      <span className="lr-tx"><Marked words={r.ours}/></span>
      <span className="lr-tx theirs">{r.theirs.length ? <Marked words={r.theirs}/> : <i>(nothing written here)</i>}</span>
    </div>)}</div>;
}

export function ListenRoom({doc, caseName, decideHref, onClose}: {doc: DocumentDetailOut; caseName: string; decideHref: string; onClose: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const openRealness = useWorkbenchStore(state => state.openRealness);
  // Asked to listen for voices: the transcript is fetched again until they come (two minutes at most).
  const [listeningSince, setListeningSince] = useState<number | null>(null);
  const transcript = useQuery({...getDocumentTranscriptOptions({path: {document_id: doc.id}}), enabled: doc.extraction_status === 'complete', retry: false,
    refetchInterval: q => (listeningSince !== null && Date.now() - listeningSince < 120_000
      && q.state.data?.voices?.found_by?.ran_at === undefined ? 2000 : false)});
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
  const [tab, setTab] = useState<'listen' | 'clean' | 'sync' | 'original' | 'derived' | 'details'>('listen');
  const [which, setWhich] = useState<'ours' | 'publisher' | 'compare'>('ours');
  const derived = useQuery({...listDerivedOptions({path: {document_id: doc.id}})});
  const files = derived.data ?? [];
  const compared = useQuery({...compareTranscriptsOptions({path: {document_id: doc.id}}), enabled: which === 'compare' && Boolean(transcript.data?.publisher?.cues?.length), retry: false});
  const [making, setMaking] = useState(false);
  const refreshFiles = () => queryClient.invalidateQueries({queryKey: listDerivedQueryKey({path: {document_id: doc.id}})});
  const makeCleaned = async () => {
    setMaking(true);
    try { await makeCleanedCopy({path: {document_id: doc.id}, throwOnError: true}); await refreshFiles(); setStatus('A cleaned copy was made for listening. The recording is unchanged.'); }
    catch (error) { setStatus(errorMessage(error, 'Could not make the cleaned copy')); }
    setMaking(false);
  };
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
  const voiceList = t?.voices?.voices ?? [];
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
  const saidBy = pinned ? voiceLabel(segments.find(s => s.id === pinned.segmentId)?.speaker, voiceList) : null;
  const save = async () => {
    if (!pinned || !heard) return;
    try {
      const ev = (await createEvidenceEndpoint({body: {source_id: doc.source_id, quote: pinned.text, locator: placeOf(pinned), heard: true,
        notes: saidBy ? `Said by ${saidBy.text} (${saidBy.named ? 'named by a person' : 'a guess by the speaker model'})` : undefined}, throwOnError: true})).data;
      setSaved(ev.id);
      setStatus('Saved as evidence, heard by you. Link it to a claim from Decide or the claim itself.');
      // The part is also kept as its own file, cut from the original: a copy to hand on, never the evidence itself.
      try { await makeClip({path: {document_id: doc.id}, body: {start: pinned.start, end: pinned.end}, throwOnError: true}); await refreshFiles(); }
      catch (error) { setStatus(`Saved as evidence, heard by you. The clip could not be kept: ${errorMessage(error, 'unknown error')}`); }
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

  // A sound file is never a video, even if an older transcript called its cover art one.
  const isVideo = t?.kind === 'video' && !(doc.mime_type ?? '').startsWith('audio/');
  const kindWord = isVideo ? 'Video' : 'Audio';
  const spoken = segments.filter(s => s.kind === 'speech');
  const silent = segments.filter(s => s.kind === 'no_speech');
  const unsureCount = t ? spoken.reduce((n, s) => n + s.words.filter(w => w.p < t.unsure_below).length, 0) : 0;
  const about = (t?.transcript ?? {}) as {tool?: string; model?: string; language?: string; language_probability?: number; ran_at?: string};
  const {parts, fromFeed: partsFromFeed} = useMemo(() => (t ? partsOf(t) : {parts: [], fromFeed: false}), [t]);
  const title = doc.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  const MediaTag = isVideo ? 'video' : 'audio';
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
        <button type="button" role="tab" aria-selected={tab === 'clean'} onClick={() => setTab('clean')}>Clean and cut</button>
        <button type="button" role="tab" aria-selected={tab === 'sync'} onClick={() => setTab('sync')}>Sync</button>
        <button type="button" role="tab" aria-selected={tab === 'original'} onClick={() => setTab('original')}>Original</button>
        <button type="button" role="tab" aria-selected={tab === 'derived'} onClick={() => setTab('derived')}>Edit trail{files.length ? ` · ${files.length}` : ''}</button>
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
      <button type="button" className="rr-real" onClick={() => openRealness(doc.id)}>Is it real?</button>
      <button type="button" className="rr-close" onClick={onClose} aria-label="Close the reading room">×</button>
    </header>

    <aside className="lr-left" aria-label="This recording">
      {MediaTag === 'video' && <section className="lr-panel lr-video" aria-label="Picture">{mediaElement ?? <p className="lr-note">Opening…</p>}</section>}
      {parts.length > 0 && <section className="lr-panel" aria-label="Parts">
        <p className="lr-cap"><Reveal detail={partsFromFeed ? 'The parts the episode’s feed names.'
          : `The feed names no parts: these begin where one voice holds the floor for ${FLOOR} s or more, found from the speaker turns, each titled by its first words.`}>Parts</Reveal>
          <span>{partsFromFeed ? 'from the feed' : 'by who speaks'}</span></p>
        <ol className="lr-parts">{parts.map((part, i, all) => {
          const on = now >= part.start && (i === all.length - 1 || now < all[i + 1].start);
          return <li key={i}><button type="button" className={`${on ? 'on' : ''}${part.voice ? ` ${voiceClass(part.voice)}` : ''}${part.noSpeech ? ' ns' : ''}`}
            aria-current={on ? 'true' : undefined} onClick={() => seek(part.start)} title={part.title}>
            <span>{clock(part.start, false)}</span><b>{part.title}</b></button></li>;
        })}</ol>
      </section>}
      <Voices doc={doc} v={t?.voices} onListening={() => setListeningSince(Date.now())} onChanged={words => { setStatus(words); void queryClient.invalidateQueries({queryKey: getDocumentTranscriptQueryKey({path: {document_id: doc.id}})}); }}/>
      <section className="lr-panel lr-facts-panel" aria-label="In this recording">
        <p className="lr-cap"><Reveal detail={<dl className="lr-facts">
          <div><dt>Spoken parts</dt><dd>{spoken.length}</dd></div>
          <div><dt>No speech</dt><dd>{silent.length}</dd></div>
          <div><dt>Machine unsure</dt><dd>{unsureCount} word{unsureCount === 1 ? '' : 's'}</dd></div>
          <div><dt>Language</dt><dd>{about.language ? `${about.language.length <= 3 ? about.language.toUpperCase() : about.language} · ${Math.round((about.language_probability ?? 0) * 100)}%` : '–'}</dd></div>
        </dl>}>In this recording</Reveal>{about.language && <span>{about.language.length <= 3 ? about.language.toUpperCase() : about.language}</span>}</p>
        {waiting > 0 && <p className="lr-note"><a href={decideHref}>{waiting} proposal{waiting === 1 ? '' : 's'} from this transcript</a> wait in Decide.</p>}
      </section>
    </aside>

    <main className="lr-read" aria-label="Transcript">
      {tab === 'clean' ? <CleanAndCut doc={doc} duration={duration} files={files} onStatus={setStatus}/>
      : tab === 'sync' ? <SyncPanel doc={doc} investigationId={doc.investigation_id}/>
      : tab === 'original' ? <section className="lr-orig" aria-label="The original">
        <p className="lr-cap">The original <span>as uploaded, never changed</span></p>
        <dl className="rr-details">
          <div><dt>File</dt><dd>{doc.filename}</dd></div>
          <div><dt>SHA-256</dt><dd><FingerprintMark hash={doc.sha256}/></dd></div>
          <div><dt>Kept</dt><dd>Unaltered, in the case’s own folder. Quotes play from these bytes.</dd></div>
          <div><dt>Streams</dt><dd><Reveal detail={<>{(t?.streams ?? []).map((s, i) => <span className="rv-row" key={i}>{String(s.type)} · {String(s.codec ?? '')}{s.sample_rate ? ` · ${String(s.sample_rate)} Hz` : ''}{s.channels ? ` · ${String(s.channels)} ch` : ''}</span>)}</>}>
            {(t?.streams ?? []).map(s => String(s.type)).join(' · ') || '–'}</Reveal></dd></div>
        </dl>
        {src && <audio controls preload="metadata" src={src} aria-label={`Play the original, ${doc.filename}`}/>}
      </section>
      : tab === 'derived' ? <section className="lr-derived" aria-label="Edit trail">
        <p className="lr-cap"><Reveal detail="Each a new file, with its edit trail.">Made from this recording</Reveal></p>
        {/* Original and derived stay as words (what may be quoted); what each file is, its tool, maker and fingerprints on hover. */}
        <div className="lr-file orig"><Reveal detail="Never changed. Quotes play from these bytes."><span className="lr-chip teal">Original</span></Reveal> <b>{doc.filename}</b> <FingerprintMark hash={doc.sha256}/></div>
        {files.length ? <ol className="lr-tree">{files.map(f => { const line = derivedLine(f); return <li key={f.id} className="lr-file der">
          <span className="lr-chip plum">Derived</span> <Reveal detail={<><span className="rv-row">{line.note}</span>
            <span className="rv-row">{f.tool} · made by {by(f.created_by)}, {f.created_at.slice(0, 16).replace('T', ' ')} UTC</span>
            <span className="rv-row rv-mono">from {f.parent_id ? 'the cleaned copy' : 'the original'} {fingerprint(f.parent_sha256)} · SHA-256 {fingerprint(f.sha256)}</span></>}><b>{line.name}</b></Reveal><em>{line.right}</em>
          <DerivedPlayer file={f}/>
        </li>; })}</ol> : <p className="lr-note">Nothing has been made from this recording yet.</p>}
        <div className="lr-acts"><Reveal tabbable={false} detail="A cleaned copy takes out mains hum and some room noise so words are easier to hear. It is never quoted: a quote plays from the original.">
          <button type="button" onClick={() => void makeCleaned()} disabled={making}>{making ? 'Making the cleaned copy…' : 'Make a cleaned copy for listening'}</button></Reveal></div>
      </section>
      : tab === 'details' ? <dl className="rr-details">
        <div><dt>File</dt><dd>{doc.filename}</dd></div>
        <div><dt>Fingerprint</dt><dd><FingerprintMark hash={doc.sha256}/></dd></div>
        <div><dt>Streams</dt><dd><Reveal detail={<>{(t?.streams ?? []).map((s, i) => <span className="rv-row" key={i}>{String(s.type)} · {String(s.codec ?? '')}{s.sample_rate ? ` · ${String(s.sample_rate)} Hz` : ''}{s.width ? ` · ${String(s.width)}×${String(s.height)}` : ''}</span>)}</>}>
          {(t?.streams ?? []).map(s => String(s.type)).join(' · ') || '–'}</Reveal></dd></div>
        {/* Where it was transcribed stays on screen (what leaves this computer); the tool, model and time are on hover. */}
        <div><dt>Transcribed</dt><dd><Reveal detail={`${about.tool} · ${about.model} · on this computer${about.ran_at ? ` · ${about.ran_at.slice(0, 16).replace('T', ' ')} UTC` : ''}`}>⌂ on this computer</Reveal></dd></div>
        {(doc.extraction_issues ?? []).map(i => <div key={i}><dt>Note</dt><dd>{i}</dd></div>)}
      </dl> : <>
        <div className="lr-rbar">
          <span className="lr-seg" role="tablist" aria-label="Which transcript">
            <button type="button" role="tab" aria-selected={which === 'ours'} onClick={() => setWhich('ours')}>Our transcription</button>
            <Reveal tabbable={false} detail={t?.publisher ? 'The transcript the episode’s publisher offers' : 'The publisher offers no transcript of this recording'}>
              <button type="button" role="tab" aria-selected={which === 'publisher'} onClick={() => setWhich('publisher')} disabled={!t?.publisher}>Publisher’s transcript</button></Reveal>
            <button type="button" role="tab" aria-selected={which === 'compare'} onClick={() => setWhich('compare')} disabled={!t?.publisher?.cues?.length}>Compare</button>
          </span>
          {which === 'compare' ? <p className="lr-meta">Outlined words differ between the two. Neither is right by default: listen.</p>
            : which === 'publisher' && t?.publisher ? <p className="lr-meta"><Reveal detail={<><span className="rv-row">Fetched {t.publisher.fetched_at?.slice(0, 16).replace('T', ' ')} UTC</span>
              <span className="rv-row rv-mono">SHA-256 {t.publisher.sha256 ?? '–'}</span></>}>As its publisher offers it</Reveal></p>
            : <p className="lr-meta"><Reveal detail={`${about.tool} · ${about.model} · run on this computer${about.ran_at ? ` ${about.ran_at.slice(0, 16).replace('T', ' ')} UTC` : ''}${about.language ? ` · ${about.language} ${Math.round((about.language_probability ?? 0) * 100)}%` : ''}`}>
              ⌂ on this computer</Reveal></p>}
        </div>
        {which === 'compare' ? (compared.data ? <Compare rows={compared.data} onSeek={seek}/> : compared.isError
          ? <p role="alert">{errorMessage(compared.error, 'Could not compare the transcripts')}</p> : <p className="rr-quiet">Comparing…</p>)
        : which === 'publisher' && t?.publisher ? <div className="lr-lines" aria-label="The publisher's transcript">
          {t.publisher.error ? <p className="rr-quiet">Not read: {t.publisher.error}</p> : t.publisher.cues?.map((c, i) => <div key={i} className="lr-sg">
            <button type="button" className="lr-tc" onClick={() => seek(c.start)}>{clock(c.start)}</button>
            <span className="lr-sp">{c.speaker ?? ''}</span><span className="lr-tx">{c.text}</span></div>)}
          <p className="lr-note">The publisher’s words are a second reading, not evidence: quotes are pinned from our transcription, after you have heard them.</p>
        </div>
        : <div ref={lines} className="lr-lines" onMouseUp={pinSelection}>
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
                <VoiceTag voice={s.speaker} voices={voiceList}/>
                <span className="lr-tx"><Words segment={s} unsureBelow={t.unsure_below} now={now}/></span>
                <button type="button" className="lr-pinbtn" onClick={() => pin(s)} aria-label={`Pin the line at ${clock(s.start)}`}>Pin</button>
              </div>)}
        </div>}
      </>}
    </main>

    <aside className="lr-right" aria-label="Pinned quote and files">
      <section className={`lr-panel lr-pinned${pinned ? ' hot' : ' empty'}`} aria-label="Pinned quote">
        <p className="lr-cap">Pinned quote {pinned ? <span className={`lr-chip ${saved ? 'ok' : heard ? 'teal' : 'amber'}`}>
          {saved ? 'Saved · heard by you' : heard ? 'Heard by you' : 'Transcribed · not yet heard'}</span>
          : <Reveal detail={<>Choose words in a line, use its Pin, or press <kbd>P</kbd> while it plays. A quote from a recording is saved only once you have heard it.</>}>
            <span className="lr-empty">Nothing pinned</span></Reveal>}</p>
        {pinned ? <>
          {/* Where the quote sits, which file it plays from and who said it are on hover of the quote. */}
          <Reveal detail={<><span className="rv-row">Place <code>media:#{placeOf(pinned)}</code></span><span className="rv-row">From {doc.filename} · the original, as uploaded</span>
            {saidBy && <span className="rv-row">Said by {saidBy.text} · {saidBy.named ? 'named by you' : 'a guess by the speaker model'}</span>}</>}>
            <blockquote className="lr-quote">“{pinned.text}”</blockquote></Reveal>
          <ol className="lr-steps" aria-label="Before it is evidence">
            <li className="ok">1 Machine ✓</li>
            <li className={heard ? 'ok' : 'cur'}>2 Heard by you{heard ? ' ✓' : ''}</li>
            <li className={saved ? 'cur' : ''}>3 In a claim</li>
          </ol>
          {pinned.unsure.length > 0 && <p className="lr-note">The machine was unsure of <b>{pinned.unsure.join(', ')}</b>. Listen before you quote.</p>}
          <div className="lr-acts">
            <button type="button" className="t" onClick={playPart} disabled={!src}>▶ Play this part · {(pinned.end - pinned.start).toFixed(1)} s</button>
            <Reveal tabbable={false} detail={playedThrough ? 'Says you heard this part yourself.' : 'Play the part through first'}>
              <button type="button" onClick={() => setHeard(true)} disabled={!playedThrough || heard || Boolean(saved)}>I heard this <kbd>H</kbd></button></Reveal>
          </div>
          <div className="lr-acts">
            <Reveal tabbable={false} detail="Evidence stays locked until you have heard the part yourself. Machines can invent words.">
              <button type="button" className="p" onClick={() => void save()} disabled={!heard || Boolean(saved)}>Save as evidence <kbd>E</kbd></button></Reveal>
          </div>
          {/* A blocking state stays on screen: while the part is not yet heard, why Save is locked shows. */}
          {!heard && <p className="lr-note">Evidence stays locked until you have heard the part yourself. Machines can invent words.</p>}
        </> : null}
        {status && <p role="status" className="lr-status">{status}</p>}
      </section>
      <section className="lr-panel" aria-label="Files">
        <p className="lr-cap">Files <span>original kept unaltered</span></p>
        <div className="lr-file orig"><Reveal detail={files.length ? 'Quotes play from the original.' : 'The transcript was made from a 16 kHz copy decoded in memory. Quotes play from the original.'}>
          <span className="lr-chip teal">Original</span></Reveal> <b>{doc.filename}</b> <FingerprintMark hash={doc.sha256}/></div>
        {files.map(f => { const line = derivedLine(f); return <div key={f.id} className="lr-file der"><span className="lr-chip plum">Derived</span> <Reveal detail={line.note}><b>{line.name}</b></Reveal><em>{line.right}</em></div>; })}
        <div className="lr-acts"><button type="button" onClick={() => setTab('derived')}>{files.length ? 'Edit trail' : 'Make a cleaned copy…'}</button></div>
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
