'use client';
// A recording's sound tools (mockup MEDIA_2; media research §2.8, §5): Clean and cut, a spectrogram of a stretch with
// A/B (the original or the cleaned copy: the mains hum lines go), the clip window cut from either, the cleaning chain
// a person picks with the loudness before and after; and Sync, lining up another recording of the same event by
// matching their sound, kept once a person accepts the offset. Cleaning makes a copy to listen to; the words quoted
// are always checked against the original.
// Converted to the 29 Oct rule: how to read the spectrogram, how to mark a clip, the tool that matched the sound and
// how sure the match is in numbers are on hover; the loudness, the hum found, the offset and whether it is a clear
// match stay on screen.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {getDocumentTranscriptOptions, getSoundOptions, getSoundQueryKey, listDerivedQueryKey, listDocumentsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import {acceptDocumentSync, findDocumentSync, makeCleanedCopy, makeClip} from '../../lib/generated/sdk.gen';
import type {DerivedFileOut, DocumentDetailOut, SyncOut} from '../../lib/generated/types.gen';
import {timeWords} from '../../lib/timestamps';

export const clockOf = (s: number): string => {
  const m = Math.floor(s / 60), sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};
const WINDOW = 60;

/** How clear a match is, in words. FilmCraft's find_offset gives the peak's height over the background (`confidence`)
 *  and over the next best lag (`distinct`); it calls a match reliable at 8× and 1.5×. */
export function matchWords(found: Pick<SyncOut, 'confidence' | 'reliable'> & {distinct?: number | null}): string {
  if (!found.reliable) return 'not a clear match';
  const next = found.distinct != null && Number.isFinite(found.distinct) ? `, ${found.distinct.toFixed(1)}× the next best` : '';
  return `${(found.distinct ?? 0) >= 3 ? 'clear' : 'reliable'} match (peak ${Math.round(found.confidence)}× the background${next})`;
}

function Spectrogram({doc, start, end, cleaned}: {doc: DocumentDetailOut; start: number; end: number; cleaned: boolean}): ReactElement {
  const png = useQuery({queryKey: ['spectrogram', doc.id, start, end, cleaned],
    queryFn: () => api.blob(`/api/documents/${doc.id}/spectrogram.png?start=${start}&end=${end}${cleaned ? '&cleaned=true' : ''}`), staleTime: Infinity, retry: false});
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!png.data) return undefined;
    const made = URL.createObjectURL(png.data);
    setHref(made);
    return () => URL.revokeObjectURL(made);
  }, [png.data]);
  if (png.isError) return <p className="snd-wait" role="alert">{errorMessage(png.error, 'Could not draw the sound')}</p>;
  // eslint-disable-next-line @next/next/no-img-element -- a blob URL of a picture this app drew
  return href ? <img className="snd-spectro" src={href} alt={`The sound from ${clockOf(start)} to ${clockOf(end)}, ${cleaned ? 'cleaned copy' : 'original'}: 0 to 4 kHz`} draggable={false}/>
    : <p className="snd-wait" role="status"><span>Drawing the sound…</span></p>;
}

type Props = {doc: DocumentDetailOut; duration: number; files: DerivedFileOut[]; onStatus: (s: string) => void};

export function CleanAndCut({doc, duration, files, onStatus}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {document_id: doc.id};
  const sound = useQuery({...getSoundOptions({path}), retry: false});
  const [from, setFrom] = useState(0);
  const to = Math.min(duration || WINDOW, from + WINDOW);
  const [b, setB] = useState(false);
  const [clip, setClip] = useState<{start: number; end: number} | null>(null);
  const [hum, setHum] = useState(true);
  const [noise, setNoise] = useState<'off' | 'light' | 'medium'>('medium');
  const [even, setEven] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const cleaned = [...files].reverse().find(f => f.operation === 'speech_cleaned');
  const cp = (cleaned?.params ?? {}) as {loudness_before_lufs?: number | null; loudness_after_lufs?: number | null};
  const humWords = sound.data?.hum.hz ? `${sound.data.hum.hz} Hz + ${sound.data.hum.harmonics} harmonic${sound.data.hum.harmonics === 1 ? '' : 's'}` : 'none found';

  const refresh = async () => {
    await queryClient.invalidateQueries({queryKey: listDerivedQueryKey({path})});
    await queryClient.invalidateQueries({queryKey: getSoundQueryKey({path})});
  };
  const clean = useMutation({
    mutationFn: async () => (await makeCleanedCopy({path, body: {hum, noise, loudness_target: even ? -16 : null}, throwOnError: true})).data,
    onSuccess: async () => { setB(true); onStatus('A cleaned copy was made for listening. The recording is unchanged.'); await refresh(); },
    onError: error => onStatus(errorMessage(error, 'Could not make the cleaned copy')),
  });
  const cut = useMutation({
    mutationFn: async (fromCleaned: boolean) => clip && (await makeClip({path, body: {start: clip.start, end: clip.end, from_cleaned: fromCleaned}, throwOnError: true})).data,
    onSuccess: async () => { onStatus('The clip was kept as its own file, with its place in the original.'); await refresh(); },
    onError: error => onStatus(errorMessage(error, 'Could not cut the clip')),
  });

  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    return r ? from + Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (to - from) : from;
  };
  const drag = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const a = at(ev.clientX);
    setClip({start: a, end: a});
    const move = (m: PointerEvent) => { const z = at(m.clientX); setClip({start: Math.min(a, z), end: Math.max(a, z)}); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const ticks = Array.from({length: 7}, (_, i) => from + (i * (to - from)) / 6);
  const good = clip && clip.end - clip.start >= 0.5;

  return <div className="snd">
    <section className="snd-sound" aria-label="Sound">
      <div className="snd-head">
        <p className="tl2-cap"><Reveal detail={`The amber window is the clip you are cutting. ${sound.data?.hum.hz ? `The lines at ${sound.data.hum.hz}, ${sound.data.hum.hz * 2} and ${sound.data.hum.hz * 3} Hz are mains hum; on B they are gone.` : 'No mains hum was found.'}`}>
          Sound · {clockOf(from)} – {clockOf(to)}</Reveal></p>
        <div className="tl2-views" role="group" aria-label="A or B">
          <button aria-pressed={!b} onClick={() => setB(false)}>A · original</button>
          <button aria-pressed={b} onClick={() => setB(true)} disabled={!cleaned}>B · cleaned</button>
        </div>
        <span className="snd-move">
          <button className="tl2-plain" onClick={() => setFrom(f => Math.max(0, f - WINDOW))} disabled={from <= 0} aria-label="An earlier minute">‹</button>
          <button className="tl2-plain" onClick={() => setFrom(f => (f + WINDOW < duration ? f + WINDOW : f))} disabled={from + WINDOW >= duration} aria-label="A later minute">›</button>
        </span>
      </div>
      <div ref={box} className="snd-frame" onPointerDown={drag} role="slider" aria-label="Drag to mark the clip" aria-valuemin={0} aria-valuemax={duration}
        aria-valuenow={clip?.start ?? from} tabIndex={0}>
        <Spectrogram doc={doc} start={Math.floor(from)} end={Math.ceil(to)} cleaned={b && Boolean(cleaned)}/>
        <span className="snd-hz" aria-hidden>{[[4000, '4 kHz'], [2000, '2 kHz'], [1000, '1 kHz'], [150, '150 Hz']].map(([f, w]) =>
          <i key={w} style={{top: `${(1 - Math.sqrt(Number(f) / 4000)) * 100}%`}}>{w}</i>)}</span>
        {clip && clip.end > clip.start && <span className="snd-clip" style={{left: `${((clip.start - from) / (to - from)) * 100}%`, width: `${((clip.end - clip.start) / (to - from)) * 100}%`}}>
          <b>clip {clockOf(clip.start)} – {clockOf(clip.end)}</b></span>}
      </div>
      <div className="snd-ticks" aria-hidden>{ticks.map(t => <span key={t}>{clockOf(t)}</span>)}</div>
    </section>

    <aside className="snd-side">
      <section className="snd-panel" aria-label="Clean">
        <p className="tl2-cap"><Reveal detail="One copy for listening. The recording is unchanged and quotes are checked against it.">Clean</Reveal></p>
        <label className="snd-step"><input type="checkbox" checked={hum} onChange={e => setHum(e.target.checked)}/> Remove mains hum <em>{humWords}</em></label>
        <div className="snd-step"><span>Reduce room noise</span>
          <span className="tl2-views" role="group" aria-label="Room noise">{(['off', 'light', 'medium'] as const).map(n =>
            <button key={n} aria-pressed={noise === n} onClick={() => setNoise(n)}>{n}</button>)}</span></div>
        <label className="snd-step"><input type="checkbox" checked={even} onChange={e => setEven(e.target.checked)}/> Even out loudness <em>-16 LUFS</em></label>
        <div className="snd-step off"><span>Isolate one voice</span><Reveal detail="Needs a model: not yet."><em>not yet</em></Reveal></div>
        <p className="snd-loud">Loudness before → after <b>{(cp.loudness_before_lufs ?? sound.data?.loudness_lufs)?.toFixed(1) ?? '—'} → {cp.loudness_after_lufs != null ? cp.loudness_after_lufs.toFixed(1) : '—'} LUFS</b></p>
        <button className="tl2-play snd-wide" onClick={() => clean.mutate()} disabled={clean.isPending || (!hum && noise === 'off' && !even)}>{clean.isPending ? 'Making the cleaned copy…' : 'Make the cleaned copy'}</button>
      </section>
      <section className="snd-panel" aria-label="Clip">
        <p className="tl2-cap">{good ? <>Clip <Reveal detail={`A clip keeps its place: media:#t=${clip!.start.toFixed(1)},${clip!.end.toFixed(1)} in the original.`}>
          <span>{clockOf(clip!.start)} – {clockOf(clip!.end)} · {(clip!.end - clip!.start).toFixed(1)} s</span></Reveal></>
          : <Reveal detail="Drag over the sound to mark one.">Clip</Reveal>}</p>
        <div className="tl2-acts">
          <button onClick={() => cut.mutate(false)} disabled={!good || cut.isPending}>Cut from the original</button>
          <button onClick={() => cut.mutate(true)} disabled={!good || !cleaned || cut.isPending}>Cut from the cleaned copy</button>
        </div>
      </section>
    </aside>
  </div>;
}

/** Peaks drawn as a mirrored band, moved right by `shift` seconds. */
function Band({outline, step, shift, span, tone, label}: {outline: number[]; step: number; shift: number; span: number; tone: string; label: string}): ReactElement {
  const w = 900, h = 44;
  const pts = outline.map((v, i) => [((i * step + shift) / span) * w, Math.max(1, v * (h / 2 - 2))] as const);
  const d = pts.length ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${(h / 2 - y).toFixed(1)}`).join(' L')} L${[...pts].reverse().map(([x, y]) => `${x.toFixed(1)},${(h / 2 + y).toFixed(1)}`).join(' L')} Z` : '';
  return <svg className="snd-band" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}><path d={d} className={tone}/></svg>;
}

export function SyncPanel({doc, investigationId}: {doc: DocumentDetailOut; investigationId: string}): ReactElement {
  const queryClient = useQueryClient();
  const path = {document_id: doc.id};
  const sound = useQuery({...getSoundOptions({path}), retry: false});
  const docs = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}})});
  const recordings = (docs.data ?? []).filter(d => d.id !== doc.id && /\.(mp3|m4a|wav|aac|ogg|opus|flac|mp4|mov|webm|mkv|m4v)$/i.test(d.filename ?? ''));
  const accepted = sound.data?.sync ?? null;
  const [other, setOther] = useState<string>('');
  const pick = other || accepted?.other_document_id || recordings[0]?.id || '';
  const [found, setFound] = useState<SyncOut | null>(null);
  const [message, setMessage] = useState('');
  const mine = useQuery({...getDocumentTranscriptOptions({path}), retry: false});
  const theirs = useQuery({...getDocumentTranscriptOptions({path: {document_id: pick}}), enabled: Boolean(pick), retry: false});
  const shown = found ?? (accepted && accepted.other_document_id === pick ? accepted : null);
  const find = useMutation({
    mutationFn: async () => (await findDocumentSync({path, body: {other_document_id: pick}, throwOnError: true})).data,
    onSuccess: r => { setFound(r); setMessage(r.offset_seconds == null ? 'Nothing lined up: these may not be recordings of the same moment.' : ''); },
    onError: error => setMessage(errorMessage(error, 'Could not compare the two recordings')),
  });
  const accept = useMutation({
    mutationFn: async () => (await acceptDocumentSync({path, body: {other_document_id: pick}, throwOnError: true})).data,
    onSuccess: async r => { setFound(r); setMessage('Accepted: the two recordings are lined up, and who accepted it is kept.'); await queryClient.invalidateQueries({queryKey: getSoundQueryKey({path})}); },
    onError: error => setMessage(errorMessage(error, 'Could not accept the offset')),
  });
  const otherName = recordings.find(r => r.id === pick)?.filename ?? 'the other recording';
  const span = Math.max(mine.data?.duration ?? 0, (theirs.data?.duration ?? 0) + Math.max(0, shown?.offset_seconds ?? 0), 1);
  return <section className="snd-sync" aria-label="Sync">
    <p className="tl2-cap"><Reveal detail="Found by matching the sound · FilmCraft find_offset.">Sync with another recording of the same event</Reveal></p>
    {recordings.length === 0 ? <p className="lr-note">There is no other recording in this case to line this one up with.</p> : <>
      <label className="snd-pick">The other recording <select value={pick} onChange={e => { setOther(e.target.value); setFound(null); }}>
        {recordings.map(r => <option key={r.id} value={r.id}>{r.filename}</option>)}</select></label>
      <div className="snd-bands">
        <span>{doc.filename}</span>
        {mine.data && <Band outline={mine.data.outline} step={mine.data.outline_step} shift={0} span={span} tone="a" label={`${doc.filename}, its loudness over time`}/>}
        <span>{otherName}{shown?.offset_seconds != null ? ` · moved ${shown.offset_seconds >= 0 ? '+' : ''}${shown.offset_seconds.toFixed(2)} s` : ''}</span>
        {theirs.data && <Band outline={theirs.data.outline} step={theirs.data.outline_step} shift={shown?.offset_seconds ?? 0} span={span} tone="b" label={`${otherName}, its loudness over time`}/>}
      </div>
      <div className="snd-result">
        {/* Whether the match is clear shows; how clear, in numbers, is on hover. */}
        {shown?.offset_seconds != null && <Reveal detail={matchWords(shown)}><span className={`snd-chip${shown.reliable ? '' : ' weak'}`}>
          Offset {shown.offset_seconds >= 0 ? '+' : ''}{shown.offset_seconds.toFixed(2)} s · {matchWords(shown).replace(/ \(.*\)$/, '')}</span></Reveal>}
        {shown?.offset_seconds != null && <p>{`${otherName} started ${Math.abs(shown.offset_seconds).toFixed(2)} s ${shown.offset_seconds >= 0 ? 'after' : 'before'} ${doc.filename}.`}
          {shown.accepted_by ? ` Accepted by ${shown.accepted_by === 'local-owner' ? 'you' : shown.accepted_by}, ${timeWords(String(shown.accepted_at))}.` : ''}</p>}
        <div className="tl2-acts">
          <Reveal tabbable={false} detail="Compares the two to find where one lines up in the other.">
            <button onClick={() => find.mutate()} disabled={!pick || find.isPending}>{find.isPending ? 'Listening…' : shown ? 'Compare again' : 'Find the offset'}</button></Reveal>
          {shown?.offset_seconds != null && !shown.accepted_by && <button className="pri" onClick={() => accept.mutate()} disabled={accept.isPending || !shown.reliable}>Accept the offset</button>}
        </div>
      </div>
      {message && <p className="lr-note" role="status">{message}</p>}
    </>}
  </section>;
}
