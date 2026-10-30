'use client';
// A photo's own page (mockup MEDIA_1; media research §2.1, §5): what the file claims about itself, shown as a claim
// until another record agrees; the machine's proposals beside the picture (faces found by a detector only, the place
// its GPS gives, the text read in it), each kept or rejected by a person; a wipe comparing the photo with the copy
// picked; Make a copy (blur faces, remove metadata, crop, redact an area with its reason, turn); and the edit trail as a
// tree from the original, each copy naming its tool and who made it. The photo itself is never written.
// Converted to the 29 Oct rule: the claims' qualifiers, the proposals' explanations, settings and times of each copy
// and the fingerprint are on hover; that the photo is kept as uploaded, what the face model fetches and every
// proposal's yes/no stay on screen.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {getPhotoOptions, getPhotoQueryKey, listDerivedOptions, listDerivedQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import {findPhotoFaces, makePhotoCopy, reviewExtractionCandidate} from '../../lib/generated/sdk.gen';
import type {DerivedFileOut, DocumentDetailOut, FaceBoxOut, PhotoOut} from '../../lib/generated/types.gen';
import {FingerprintMark} from '../the-drop/kind-marks';

type Box = {x: number; y: number; w: number; h: number};
type Draw = null | 'crop' | 'redact';

export const OPERATION_WORDS: Record<string, string> = {
  preview: 'Viewable copy', blur_faces: 'Faces blurred', strip_metadata: 'Metadata removed', crop: 'Cropped', redact: 'Area redacted',
  turn: 'Turned', cleaned: 'Cleaned copy', clip: 'Clip',
};

/** What a copy's trail row says in a line: its settings, then its tool and who made it. */
export function trailLine(row: DerivedFileOut): string {
  const p = row.params ?? {};
  const bits: string[] = [];
  if (row.operation === 'blur_faces') bits.push(`blur r=${p.radius}`, `${p.regions} ${p.regions === 1 ? 'region' : 'regions'}`);
  if (row.operation === 'redact' && typeof p.reason === 'string') bits.push(`“${p.reason}”`);
  if (row.operation === 'turn') bits.push(`${p.degrees}° clockwise`);
  if (row.operation === 'strip_metadata') bits.push('GPS, serial, software stripped');
  bits.push(row.tool.replace(/\s*\(.*\)$/, ''));
  bits.push(!row.created_by ? 'the Workbench, while reading' : row.created_by === 'local-owner' ? 'you' : row.created_by);
  return bits.join(' · ');
}

/** The trail as a tree: each copy under the one it was made from; copies made from the photo under the original. */
export function trailTree(rows: DerivedFileOut[]): Array<{row: DerivedFileOut; depth: number}> {
  const out: Array<{row: DerivedFileOut; depth: number}> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const r of rows.filter(x => (x.parent_id ?? null) === parent)) { out.push({row: r, depth}); walk(r.id, depth + 1); }
  };
  walk(null, 1);
  return out;
}

const dms = (v: number) => v.toFixed(4);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The line under a photo's title: what it is, its size, and the day by its own clock or that it gives none. */
export function photoLine(p: PhotoOut | undefined, captured: string | null): string {
  const m = captured?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const when = m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]} by its own clock` : 'no date of its own';
  const size = p?.width && p.height ? `${p.width} × ${p.height} ${p.kind}` : p?.kind ?? '';
  return ['A photo', size, when].filter(Boolean).join(' · ');
}

export function useBlobUrl(key: string, url: string | null): string | null {
  const blob = useQuery({queryKey: ['photo-blob', key], queryFn: () => api.blob(url as string), enabled: Boolean(url), staleTime: Infinity, retry: false});
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const made = URL.createObjectURL(blob.data);
    setHref(made);
    return () => URL.revokeObjectURL(made);
  }, [blob.data]);
  return href;
}

type Props = {doc: DocumentDetailOut; caseName: string; onClose: () => void; onText: () => void};

export function PhotoRoom({doc, caseName, onClose, onText}: Props): ReactElement {
  const queryClient = useQueryClient();
  const path = {document_id: doc.id};
  const photo = useQuery({...getPhotoOptions({path})});
  const trail = useQuery({...listDerivedOptions({path})});
  const rows = useMemo(() => (trail.data ?? []).filter(r => r.operation !== 'cleaned' && r.operation !== 'clip'), [trail.data]);
  const copies = rows.filter(r => r.operation !== 'preview');
  const [pickedCopy, setPickedCopy] = useState<string | null>(null);
  const copy = copies.find(r => r.id === pickedCopy) ?? copies[copies.length - 1] ?? null;
  const [tab, setTab] = useState<'picture' | 'trail'>('picture');
  const [wipe, setWipe] = useState(50);
  const [faces, setFaces] = useState<FaceBoxOut[] | null>(null);
  const [facesDismissed, setFacesDismissed] = useState(false);
  const [facesKept, setFacesKept] = useState(false);
  const [draw, setDraw] = useState<Draw>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const stage = useRef<HTMLDivElement>(null);

  const original = useBlobUrl(`doc:${doc.id}`, `/api/documents/${doc.id}/picture`);
  const copyUrl = useBlobUrl(`copy:${copy?.id ?? ''}`, copy ? `/api/derived-files/${copy.id}/file` : null);

  const refresh = async () => {
    await queryClient.invalidateQueries({queryKey: listDerivedQueryKey({path})});
    await queryClient.invalidateQueries({queryKey: getPhotoQueryKey({path})});
  };
  const make = useMutation({
    mutationFn: async (body: {operation: 'blur_faces' | 'strip_metadata' | 'crop' | 'redact' | 'turn'; params?: Record<string, unknown>; from_id?: string | null}) =>
      (await makePhotoCopy({path, body: {params: {}, ...body}, throwOnError: true})).data,
    onSuccess: async row => { setPickedCopy(row.id); setDraw(null); setBox(null); setReason(''); setMessage(`${OPERATION_WORDS[row.operation] ?? row.operation}: a new file, the photo unchanged`); await refresh(); },
    onError: error => setMessage(errorMessage(error, 'Could not make the copy')),
  });
  const look = useMutation({
    mutationFn: async () => (await findPhotoFaces({path, throwOnError: true})).data,
    onSuccess: found => { setFaces(found.faces); setFacesDismissed(false); setMessage(found.faces.length ? `${found.faces.length} ${found.faces.length === 1 ? 'face' : 'faces'} found by the detector` : 'The detector found no face'); },
    onError: error => setMessage(errorMessage(error, 'Could not look for faces')),
  });
  const decidePlace = useMutation({
    mutationFn: async (decision: 'accept' | 'reject') => {
      const id = photo.data?.place_proposal?.id;
      if (!id) return;
      await reviewExtractionCandidate({path: {candidate_id: id}, body: {decision, ...(decision === 'accept' ? {entity_schema: 'Address'} : {})}, throwOnError: true});
    },
    onSuccess: async () => { setMessage('Decided: kept in the case’s record'); await queryClient.invalidateQueries({queryKey: getPhotoQueryKey({path})}); },
    onError: error => setMessage(errorMessage(error, 'Could not decide the place')),
  });

  const at = (ev: {clientX: number; clientY: number}) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return {x: 0, y: 0};
    return {x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))};
  };
  const onDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!draw) return;
    const a = at(ev);
    setBox({x: a.x, y: a.y, w: 0, h: 0});
    const move = (m: PointerEvent) => { const b = at(m); setBox({x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)}); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const dragWipe = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    const move = (m: PointerEvent) => setWipe(at(m).x * 100);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const p: PhotoOut | undefined = photo.data;
  const c = (p?.claims ?? {}) as Record<string, unknown>;
  const gps = c.gps as {latitude?: number; longitude?: number; altitude?: number} | undefined;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const camera = [str(c.make), str(c.model)].filter(Boolean).join(' ');
  const faceBoxes = facesDismissed ? [] : faces ?? [];
  const goodBox = box && box.w > 0.01 && box.h > 0.01;
  const hasGps = gps?.latitude != null && gps.longitude != null;
  const timeTag = p?.date_tag || (c.capture_time && !c.capture_time_has_offset)
    ? `${p?.date_tag ? `from “${p.date_tag}”` : ''}${c.capture_time && !c.capture_time_has_offset ? '; no time zone in the file' : ''}` : null;
  // What the file says about itself: only the claims it makes get a row; what it leaves out is said once, in a line.
  const claimRows: Array<[string, ReactElement]> = [];
  if (str(c.capture_time)) claimRows.push(['Taken', timeTag ? <Reveal detail={timeTag}>{String(c.capture_time)}</Reveal> : <>{String(c.capture_time)}</>]);
  if (camera) claimRows.push(['Camera', <Reveal key="cam" detail={str(c.serial_number) ? `serial ${String(c.serial_number)}` : 'serial not recorded'}>{camera}</Reveal>]);
  if (str(c.software)) claimRows.push(['Software', <>{String(c.software)}</>]);
  if (hasGps) claimRows.push(['Place', <>{`${dms(gps.latitude as number)}, ${dms(gps.longitude as number)}`}
    <small>{p?.nearest_place ? `${p.nearest_place.metres.toLocaleString('en-GB')} m from ${p.nearest_place.caption}` : 'no place in the case to measure from'}</small></>]);
  const missing = [!str(c.capture_time) && 'time', !camera && 'camera', !str(c.software) && 'software', !hasGps && 'place'].filter(Boolean) as string[];
  const claimed = claimRows.length > 0;
  const claimsPanel = <aside className={`ph-claims${claimed ? '' : ' none'}`} aria-label="What the file claims">
    <p className="tl2-cap"><Reveal detail="The file’s metadata, as it says it.">What the file claims</Reveal></p>
    {claimed ? <dl className="ph-dl">{claimRows.map(([k, v]) => <div key={k} className="ph-row"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      : <p className="ph-nothing"><b>Nothing about itself</b><Reveal detail="No time, camera, software or GPS in its metadata. Stripped files often look like this: a copy saved from a site or a chat app.">
        <span className="ph-q" aria-label="Why">?</span></Reveal></p>}
    {claimed && missing.length > 0 && <p className="ph-missing">Not in the file: {missing.join(', ')}</p>}
    {/* What is known whatever the file claims: the picture's size and format, and its fingerprint. */}
    <dl className="ph-known">
      <div className="ph-row"><dt>Picture</dt><dd>{p?.width && p.height ? `${p.width} × ${p.height}` : '—'}{p?.kind ? ` · ${p.kind}` : ''}</dd></div>
      {doc.sha256 && <div className="ph-row"><dt>Fingerprint</dt><dd><FingerprintMark hash={doc.sha256} of="the photo as uploaded"/></dd></div>}
    </dl>
    {claimed && <Reveal detail="Becomes shown when another record agrees: a source dated the same day, the shadows, the place."><span className="tl2-chip dash">? claimed</span></Reveal>}
  </aside>;
  // Why no text was read, when the reading said so (an OCR engine missing on this computer, say).
  const textIssue = (doc.extraction_issues ?? []).find(i => /text in this picture could not be read|tesseract|ocr/i.test(i)) ?? null;
  const proposalCount = (p?.text.length ? 1 : 0) + (faces?.length ? 1 : 0) + (p?.place_proposal ? 1 : 0);

  return <div className="ph" data-calm-zone="" role="dialog" aria-modal="true" aria-label={`Picture: ${doc.title ?? doc.filename}`}>
    <header className="ph-top">
      <nav className="rr-crumbs" aria-label="Where"><span>{caseName}</span><span>Reading room</span><b>{doc.filename}</b></nav>
      <div className="tl2-views" role="tablist" aria-label="This photo">
        <button role="tab" aria-selected={tab === 'picture'} onClick={() => setTab('picture')}>Picture</button>
        <button role="tab" aria-selected={false} onClick={onText}>Text in it · {p?.text.length ?? 0}</button>
        <button role="tab" aria-selected={tab === 'trail'} onClick={() => setTab('trail')}>Edit trail · {copies.length}</button>
      </div>
      <p className="tl2-status">Kept as uploaded {p ? <FingerprintMark hash={p.sha256}/> : '…'}</p>
      <button className="tl2-plain" onClick={onClose}>Close</button>
    </header>
    {/* The title, then one line of what the photo is; that the file's word about itself is only a claim is on hover. */}
    <div className="tl2-head ph-head"><h2>{doc.title ?? doc.filename}</h2>
      <p><Reveal detail="What the file says about itself is a claim until something else agrees: a source dated the same day, the shadows, the place.">
        {photoLine(p, str(c.capture_time))}</Reveal></p></div>
    {message && <p className="tl2-msg" role="status">{message}</p>}
    {photo.isError && <p className="muted">{errorMessage(photo.error, 'Could not read the photo')}</p>}

    <div className={`ph-body${claimed ? '' : ' slim'}`}>
      {claimed && claimsPanel}

      <section className="ph-centre">
        {tab === 'trail' ? <TrailTree doc={doc} rows={rows} picked={copy?.id ?? null} onPick={id => { setPickedCopy(id); setTab('picture'); }} thumb={original}/> : <>
          <div ref={stage} className={`ph-stage${draw ? ' drawing' : ''}`} onPointerDown={onDown}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of a case file, served by this app */}
            {original ? <img src={original} alt={`The photo as uploaded: ${doc.filename}`} draggable={false}/> : <p className="tl2-none">Loading the picture…</p>}
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of a copy, served by this app */}
            {copyUrl && <img className="ph-copy" src={copyUrl} alt={`The copy: ${copy ? OPERATION_WORDS[copy.operation] : ''}`} draggable={false} style={{clipPath: `inset(0 0 0 ${wipe}%)`}}/>}
            {copyUrl && <Reveal tabbable={false} detail="Drag the line to compare the photo with the copy picked. Nothing in the photo changes.">
              <button className="ph-wipe" style={{left: `${wipe}%`}} onPointerDown={dragWipe} aria-label="Drag to compare the photo with the copy"
              onKeyDown={ev => { if (ev.key === 'ArrowLeft') setWipe(w => Math.max(0, w - 5)); if (ev.key === 'ArrowRight') setWipe(w => Math.min(100, w + 5)); }}>⇔</button></Reveal>}
            <span className="ph-tag left">Original{doc.filename.match(/\.(heic|heif|dng|cr2|cr3|nef|arw|raf|rw2|orf|pef|nrw)$/i) ? ' (viewable copy)' : ''}</span>
            {copy && <span className="ph-tag right">{OPERATION_WORDS[copy.operation]}</span>}
            {faceBoxes.map((f, i) => <span key={i} className="ph-face" style={{left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%`}}><b>face {i + 1}</b></span>)}
            {box && <span className={`ph-draw ${draw}`} style={{left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`}}/>}
          </div>
          {/* While a crop or redaction is being drawn, how to draw it stays on screen. */}
          {draw && <p className="tl2-none">Drag over the picture to mark the area to {draw === 'crop' ? 'keep' : 'redact'}.</p>}
          {draw && goodBox && <form className="ph-confirm" onSubmit={ev => { ev.preventDefault(); if (draw === 'redact' && !reason.trim()) return;
            make.mutate({operation: draw, params: draw === 'redact' ? {box, reason: reason.trim()} : {box}, from_id: copy?.id ?? null}); }}>
            {draw === 'redact' && <label>Why is it redacted? <input autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="a private person's car plate"/></label>}
            <button type="submit" className="tl2-play" disabled={make.isPending || (draw === 'redact' && !reason.trim())}>{draw === 'crop' ? 'Crop to it' : 'Redact it'}</button>
            <button type="button" className="tl2-plain" onClick={() => { setDraw(null); setBox(null); }}>Cancel</button>
          </form>}
          <p className="tl2-cap"><Reveal detail={`Each one is a new file with an edit-trail row${copy ? `, made from “${OPERATION_WORDS[copy.operation]}”` : ''}.`}>Make a copy</Reveal></p>
          <div className="ph-tools">
            <button onClick={() => make.mutate({operation: 'blur_faces', params: faces?.length ? {radius: 24, boxes: faces} : {radius: 24}, from_id: copy?.id ?? null})} disabled={make.isPending}>Blur faces for export</button>
            <button onClick={() => make.mutate({operation: 'strip_metadata', from_id: copy?.id ?? null})} disabled={make.isPending}>Remove metadata for export</button>
            <button aria-pressed={draw === 'crop'} onClick={() => { setDraw(d => (d === 'crop' ? null : 'crop')); setBox(null); }}>Crop</button>
            <button aria-pressed={draw === 'redact'} onClick={() => { setDraw(d => (d === 'redact' ? null : 'redact')); setBox(null); }}>Redact an area</button>
            <button onClick={() => make.mutate({operation: 'turn', params: {degrees: 90}, from_id: copy?.id ?? null})} disabled={make.isPending}>Turn</button>
            {copy && <button className="plain" onClick={() => setPickedCopy(null)} disabled={!pickedCopy}>Latest copy</button>}
          </div>
        </>}
      </section>

      <aside className="ph-side">
        {!claimed && claimsPanel}
        <section className="ph-props" aria-label="The machine proposes">
          <p className="tl2-cap"><Reveal detail="The machine proposes; you decide.">The machine proposes{proposalCount ? ` · ${proposalCount}` : ''}</Reveal></p>
          {p && p.text.length > 0 ? <div className="ph-prop"><i aria-hidden="true">T</i><p><Reveal detail="Read on the picture by OCR.">Text: “{p.text[0].slice(0, 80)}{p.text[0].length > 80 ? '…' : ''}”</Reveal></p>
            <button className="tl2-plain" onClick={onText}>Read it</button></div>
            : p && <div className={`ph-prop${textIssue ? ' alert' : ' quiet'}`}><i aria-hidden="true">T</i>
              <p>{textIssue ? <Reveal detail={textIssue}>Text in it: not read</Reveal> : <Reveal detail="OCR read the picture and found no words.">No text in it</Reveal>}
                {textIssue && <small>no OCR on this computer</small>}</p></div>}
          {/* What the face detector fetches the first time stays on screen (what leaves this computer); what it does is on hover. */}
          <div className="ph-prop"><i aria-hidden="true">☺</i>{faces === null ? <><p><Reveal detail="A detector only finds where faces are; nothing names or matches one.">Faces</Reveal>
              {p && !p.face_model_here && <Reveal className="ph-egress" detail="Its model (232 KB) is fetched the first time, then kept on this computer."><small>↙ model 232 KB, once</small></Reveal>}</p>
            <button className="tl2-plain" onClick={() => look.mutate()} disabled={look.isPending}>Look for faces</button></>
            : <><p><Reveal detail="Detector only · nobody is named or matched.">{faces.length} {faces.length === 1 ? 'face' : 'faces'} found</Reveal></p>
              {facesKept ? <small className="ph-kept">kept: blurred in a copy</small> : faces.length > 0 && !facesDismissed && <span className="ph-yn">
                <button aria-label="Yes: blur them for export" onClick={() => { setFacesKept(true); make.mutate({operation: 'blur_faces', params: {radius: 24, boxes: faces}, from_id: copy?.id ?? null}); }}>Y</button>
                <button aria-label="No: not faces" onClick={() => setFacesDismissed(true)}>X</button></span>}</>}
          </div>
          {p && !p.place_proposal && <div className="ph-prop quiet"><i aria-hidden="true">⌖</i><p><Reveal detail={hasGps ? 'Its GPS gives no place to propose.' : 'A place is proposed from the GPS the file claims; this file has none.'}>No place: {hasGps ? 'none proposed' : 'no GPS'}</Reveal></p></div>}
          {p?.place_proposal && <div className="ph-prop"><i aria-hidden="true">⌖</i><p><Reveal detail={`From the GPS claim · a proposed place for Places · ${p.place_proposal.status}`}>
            Place {p.nearest_place ? `near ${p.nearest_place.caption}` : 'from the GPS'}</Reveal>
            {p.place_proposal.status !== 'proposed' && <span className="ph-kept" aria-hidden="true"> {p.place_proposal.status === 'accepted' ? '✓' : '✕'}</span>}</p>
            {p.place_proposal.status === 'proposed' && <span className="ph-yn">
              <button aria-label="Yes: keep the place" onClick={() => decidePlace.mutate('accept')}>Y</button>
              <button aria-label="No: reject the place" onClick={() => decidePlace.mutate('reject')}>X</button></span>}</div>}
        </section>
        <TrailTree doc={doc} rows={rows} picked={copy?.id ?? null} onPick={setPickedCopy} thumb={original} compact/>
      </aside>
    </div>
  </div>;
}

function TrailTree({doc, rows, picked, onPick, thumb, compact = false}: {doc: DocumentDetailOut; rows: DerivedFileOut[]; picked: string | null; onPick: (id: string) => void;
  thumb?: string | null; compact?: boolean}): ReactElement {
  const tree = trailTree(rows);
  const manifest = () => {
    const data = {document: {id: doc.id, filename: doc.filename, sha256: doc.sha256}, made_from_it: rows, note: 'The original is never written; each copy names what it was made from.'};
    const href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a');
    a.href = href; a.download = `${doc.filename}-edit-trail.json`; a.click();
    URL.revokeObjectURL(href);
  };
  const made = rows.filter(r => r.operation !== 'preview').length;
  return <section className={`ph-trail${compact ? ' compact' : ''}${made ? '' : ' empty'}`} aria-label="Edit trail">
    <p className="tl2-cap"><Reveal detail="Each copy is a new file made from the one above it; the original is never written.">Edit trail · {made} {made === 1 ? 'copy' : 'copies'}</Reveal></p>
    <ul>
      {/* The original is kept as uploaded and never written; its fingerprint, and each copy's settings, tool, maker and
          time, are on hover. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of a case file, served by this app */}
      <li className="orig">{thumb ? <img src={thumb} alt="" aria-hidden="true"/> : <span className="ph-thumb" aria-hidden="true"/>}
        <Reveal detail="Kept as uploaded; the original is never written."><b>{doc.filename} · original</b></Reveal>
        {doc.sha256 && <FingerprintMark hash={doc.sha256}/>}</li>
      {tree.map(({row, depth}) => <li key={row.id} style={{marginLeft: depth * 14}} className={row.id === picked ? 'on' : ''}>
        <Reveal tabbable={false} detail={`${trailLine(row)} · ${String(row.created_at).slice(0, 16).replace('T', ' ')}`}>
          <button onClick={() => onPick(row.id)}><b>{OPERATION_WORDS[row.operation] ?? row.operation}</b></button></Reveal></li>)}
    </ul>
    {/* With no copy yet, the trail says where the first one comes from instead of an empty box. */}
    {made === 0 && <p className="ph-first">No copies yet: <b>Make a copy</b> under the picture starts the trail.</p>}
    <button className="tl2-plain" onClick={manifest}>Export the trail (custody manifest)</button>
  </section>;
}
