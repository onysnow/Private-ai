'use client';
// The pictures of a place (mockup PLACE_1, "Pictures of this place"): the photos in the case taken at or of the place
// and the captured pages that name its address, as a strip of thumbnails in the place card. Each one opens its source
// in one click; how it matched is a small mark on the thumbnail (a pin for its own GPS, a chain for a person's link, a
// quote for a caption or page naming the address), named with what it rests on when hovered or focused. Nothing is
// guessed: the backend lists a picture only by one of its three stated rules (app/services/place_pictures.py), and the
// rules are stated behind the `?`. The time window under the map greys the pictures taken outside it; an undated
// picture is never greyed. With two dated pictures of different years, Compare sets the earliest beside the latest.
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Reveal} from '../../components/ui/reveal';
import {dateWords} from '../../lib/dates';
import type {PlacePictureMatchOut, PlacePictureOut} from '../../lib/generated/types.gen';
import {pictureInWindow} from '../../lib/place-times';
import type {TimeWindow} from '../../lib/place-times';
import {useBlobUrl} from '../reading-room/photo-room';

export const RULE: Record<PlacePictureMatchOut['rule'], {word: string; glyph: ReactElement}> = {
  gps: {word: 'Taken here, by its own GPS', glyph: <path d="M7 13s4.5-4.2 4.5-7.3A4.5 4.5 0 0 0 2.5 5.7C2.5 8.8 7 13 7 13Z M7 4.2a1.6 1.6 0 1 1 0 3.2a1.6 1.6 0 0 1 0-3.2Z"/>},
  linked: {word: 'Tied to this place by a person', glyph: <path d="M5.8 8.2l2.4-2.4 M4.6 6.4L3.4 7.6a2.2 2.2 0 0 0 3.1 3.1l1.2-1.2 M9.4 7.6l1.2-1.2a2.2 2.2 0 0 0-3.1-3.1L6.3 4.5"/>},
  named: {word: 'Its caption or page names the address', glyph: <path d="M3 4.5h3v3.2C6 9.4 5 10.5 3.6 11 M8 4.5h3v3.2C11 9.4 10 10.5 8.6 11"/>},
};

const TAKEN_FROM: Record<string, string> = {source: 'dated by its source', camera: 'dated by the camera’s own clock', capture: 'the day the page was captured'};

/** When a picture was taken, at the precision known: "Jun 2017", "14 Aug 2019", or "no date". */
export function pictureWhen(picture: Pick<PlacePictureOut, 'taken'>): string {
  return picture.taken ? dateWords(picture.taken) : 'no date';
}

/** The earliest and the latest dated pictures, when they were taken in different years; otherwise null. */
export function comparePair(pictures: PlacePictureOut[]): [PlacePictureOut, PlacePictureOut] | null {
  const dated = pictures.filter(p => p.first_day).sort((a, b) => (a.first_day ?? '').localeCompare(b.first_day ?? ''));
  if (dated.length < 2) return null;
  const first = dated[0], last = dated[dated.length - 1];
  return (first.first_day ?? '').slice(0, 4) === (last.first_day ?? '').slice(0, 4) ? null : [first, last];
}

const RULES_TEXT = <>
  <b>A picture is listed here only by one of three rules</b>
  <span className="rv-row">Its own GPS (what the file claims) is within 250 m of the place, 500 m for a street, 5 km for a town.</span>
  <span className="rv-row">A person tied it to the place: evidence for a link or an event here, or the file the place was read from.</span>
  <span className="rv-row">Its caption, or a captured page, names the house number and street.</span>
</>;

type Props = {pictures: PlacePictureOut[]; timeWindow: TimeWindow | null; onOpen: (documentId: string) => void};

export function PlacePictures({pictures, timeWindow, onOpen}: Props): ReactElement {
  const [comparing, setComparing] = useState(false);
  const pair = comparePair(pictures);
  const year = (p: PlacePictureOut) => (p.first_day ?? '').slice(0, 4);
  return <section className="plp" aria-label="Pictures of this place">
    <p className="tl2-cap">Pictures of this place · {pictures.length}
      <Reveal className="plp-q" detail={RULES_TEXT}><span className="tl2-q" aria-hidden="true">?</span></Reveal></p>
    {pictures.length === 0 ? <p className="tl2-none">No picture in the case is of this place.</p> : <>
      {comparing && pair ? <div className="plp-compare" data-testid="place-compare">
        {pair.map(p => <Thumb key={p.document_id} picture={p} big inside={true} onOpen={onOpen}/>)}
      </div> : <ul className="plp-strip">
        {pictures.map(p => <li key={p.document_id}><Thumb picture={p} inside={pictureInWindow(p, timeWindow) !== false} onOpen={onOpen}/></li>)}
      </ul>}
      {pair && <div className="plp-acts">
        <button type="button" aria-pressed={comparing} onClick={() => setComparing(v => !v)}>
          {comparing ? 'Back to all' : <>Compare {year(pair[0])} ↔ {year(pair[1])}</>}</button></div>}
    </>}
  </section>;
}

function Thumb({picture, inside, big = false, onOpen}: {picture: PlacePictureOut; inside: boolean; big?: boolean; onOpen: (documentId: string) => void}): ReactElement {
  const url = picture.kind === 'page'
    ? (picture.capture_id ? `/api/captures/${picture.capture_id}/files/screenshot.png` : null)
    : `/api/documents/${picture.document_id}/picture`;
  const src = useBlobUrl(picture.kind === 'page' ? `shot:${picture.capture_id}` : `doc:${picture.document_id}`, url);
  const when = pictureWhen(picture);
  const rules = Array.from(new Set(picture.matches.map(m => m.rule)));
  const detail = <>
    <b>{picture.title}</b>
    {picture.matches.map((m, i) => <span key={i} className="rv-row">{RULE[m.rule].word}: {m.detail}</span>)}
    <span className="rv-row">{picture.taken ? `${when}, ${TAKEN_FROM[picture.taken_from ?? ''] ?? 'dated'}` : 'No date is known for it'}</span>
    {!inside && <span className="rv-row">Taken outside the dates picked under the map</span>}
    <span className="rv-row">Click to open {picture.kind === 'page' ? 'the captured page' : 'the photo'}</span>
  </>;
  return <Reveal tabbable={false} detail={detail}>
    <button type="button" className={`plp-thumb${big ? ' big' : ''}${inside ? '' : ' out'}`} onClick={() => onOpen(picture.document_id)}
      aria-label={`${picture.title}, ${when}: open ${picture.kind === 'page' ? 'the captured page' : 'the photo'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt=""/> : <span className="plp-none" aria-hidden="true">{picture.kind === 'page' ? 'page' : 'photo'}</span>}
      <span className="plp-rules" aria-hidden="true">{rules.map(r => <svg key={r} className={`plp-rule r-${r}`} width="14" height="14" viewBox="0 0 14 14">{RULE[r].glyph}</svg>)}</span>
      <span className="plp-when">{when}</span>
    </button>
  </Reveal>;
}
