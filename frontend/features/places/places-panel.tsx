'use client';
// Places (mockup PLACE_1; research §2.10): "Where did it happen, and who moved where?" Every place comes from the
// case's records; nothing is looked up (geocoding stays off, DECISIONS_LOG 6 call 5), so no address leaves the
// machine. The map is drawn by the app from the records' own coordinates and works with no base map: a ring says how
// sure each place is (read from a document, approximate, not yet shown), an address holding several parties carries
// their number, a party's path is drawn hop by hop with its dates, and places far off this map are markers on its
// edge. When the self-hosted base map is installed it can be shown instead. Records that cannot be placed are listed
// with why. Under the map, one row per place picks a stretch of time (places-timeline.tsx); the right panel tells the
// picked place. The table is the List view (L).
import {useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getBasemapStatusOptions, getInvestigationPlacesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {PlaceOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {dayText, eventWindow, placesInWindow} from '../../lib/place-times';
import type {TimeWindow} from '../../lib/place-times';
import {edgeMarker, heldHere, km, onAndOff, pathOf, projector, travellers} from './places-model';

const PlacesTimeline = dynamic(() => import('./places-timeline').then(m => m.PlacesTimeline),
  {ssr: false, loading: () => <p className="muted">Loading timeline…</p>});
const PlacesMap = dynamic(() => import('../../components/places-map').then(m => m.PlacesMap),
  {ssr: false, loading: () => <p className="muted">Loading map…</p>});

type Props = {investigationId: string};

/** A coordinate pair in words: 35.3364° N, 33.3199° E. */
export function coordinates(place: Pick<PlaceOut, 'latitude' | 'longitude'>): string {
  const lat = `${Math.abs(place.latitude)}° ${place.latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(place.longitude)}° ${place.longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

export const SURE: Record<PlaceOut['sure'] & string, {word: string; chip: string}> = {
  document: {word: 'read from a document', chip: 'read from a document'},
  approximate: {word: 'approximate (a town or wider)', chip: 'approximate'},
  not_yet: {word: 'not yet shown', chip: 'not yet shown'},
};

const BOX = {w: 900, h: 470, pad: 70};

export function PlacesPanel({investigationId}: Props): ReactElement {
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const placesQuery = useQuery({...getInvestigationPlacesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const all = useMemo(() => placesQuery.data?.places ?? [], [placesQuery.data]);
  const omitted = placesQuery.data?.omitted ?? [];
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [baseMap, setBaseMap] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const places = placesInWindow(all, timeWindow);
  const statusQuery = useQuery({...getBasemapStatusOptions(), enabled: all.length > 0 && baseMap});
  const status = statusQuery.data;
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(BOX.w);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(420, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [placesQuery.data, list, baseMap]);

  const box = {...BOX, w};
  const {on, off} = useMemo(() => onAndOff(places), [places]);
  const project = useMemo(() => projector(on, box), [on, box.w]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = useMemo(() => travellers(all), [all]);
  const hops = path ? pathOf(places, path) : [];
  const countries = new Set(all.map(p => p.country).filter(Boolean));
  const sel = all.find(p => p.entity_id === picked) ?? null;
  const pick = (id: string) => setPicked(id);
  const step = (d: 1 | -1) => {
    const i = places.findIndex(p => p.entity_id === picked);
    const next = places[(i + d + places.length) % places.length];
    if (next) setPicked(next.entity_id);
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('input, select, textarea')) return;
    if (ev.key === 'l' || ev.key === 'L') { ev.preventDefault(); setList(v => !v); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); step(1); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); step(-1); }
    if (ev.key === 'Enter' && picked) { ev.preventDefault(); openDossier(picked); }
  };

  if (placesQuery.isError) return <p className="muted">{errorMessage(placesQuery.error, 'Could not read the places')}</p>;
  if (!placesQuery.data) return <p className="muted">Loading the places…</p>;
  const years = timeWindow ? `${new Date(timeWindow.from).getUTCFullYear()} and ${new Date(timeWindow.to - 1).getUTCFullYear()}` : '';

  return <section className="pl" tabIndex={-1} onKeyDown={onKey} aria-labelledby="pl-title">
    <header className="tl2-head">
      <div className="tl2-views" role="group" aria-label="Map or list">
        <button aria-pressed={!list} onClick={() => setList(false)}>Map</button>
        <button aria-pressed={list} onClick={() => setList(true)}>List <kbd>L</kbd></button>
      </div>
      <h2 id="pl-title">Where did it happen, and who moved where?</h2>
      <p>Every place comes from your records; nothing is looked up. A ring says how sure the place is.</p>
      <p className="tl2-status">{all.length} {all.length === 1 ? 'place' : 'places'} · {countries.size} {countries.size === 1 ? 'country' : 'countries'} · {omitted.length} can&apos;t be placed</p>
    </header>
    {all.length === 0 && omitted.length === 0 && <p className="tl2-empty">No record in this investigation holds both a latitude and a longitude.
      An Address or a RealEstate record with coordinates shows here; nothing is looked up from an address.</p>}

    {(all.length > 0 || omitted.length > 0) && <div className="pl-body">
      <div className="pl-main">
        {list ? <PlacesList places={places} omitted={omitted} onPick={pick} openDossier={openDossier}/> : <>
          <div className="pl-tools">
            {all.length > 0 && <div className="tl2-views" role="group" aria-label="Drawing">
              <button aria-pressed={!baseMap} onClick={() => setBaseMap(false)}>From the records</button>
              <button aria-pressed={baseMap} onClick={() => setBaseMap(true)}>On the base map</button>
            </div>}
            {people.length > 0 && <div className="tl2-views" role="group" aria-label="Path">
              <span className="tl2-cap">Path</span>
              {people.slice(0, 4).map(t => <button key={t.id} aria-pressed={path === t.id} onClick={() => setPath(p => (p === t.id ? null : t.id))}>{t.caption}</button>)}
              <button aria-pressed={path === null} onClick={() => setPath(null)}>None</button>
            </div>}
          </div>
          <div ref={wrap} className="pl-map">
            {baseMap ? <>
              {status?.available && <PlacesMap status={status} places={places} onPlace={pick} picked={picked}/>}
              {status && !status.available && <p className="muted p-4" data-testid="no-basemap">
                No base map is installed here, so the places are drawn from the records only. To show them on a map, install the base map once with the
                compose profile <code>maps</code> (see DEPLOYMENT.md).</p>}
              {status?.available && <p className="tl2-none">Map data © OpenStreetMap contributors (ODbL), Protomaps build {status.version}{status.built ? ` of ${status.built.slice(0, 10)}` : ''}.</p>}
            </> : <svg width={box.w} height={box.h} role="img" aria-label={`Places drawn from their records: ${on.length} on this map${off.length ? `, ${off.length} off it` : ''}`}>
              <defs><pattern id="pl-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" className="pl-gridline"/></pattern></defs>
              <rect width={box.w} height={box.h} fill="url(#pl-grid)" className="pl-ground"/>
              {hops.length > 1 && <g className="pl-path">
                {hops.slice(1).map((h, i) => { const a = project(hops[i].place), b = project(h.place);
                  const offA = off.includes(hops[i].place), offB = off.includes(h.place);
                  if (offA || offB) return null;
                  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 18;
                  return <g key={i}><path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} className={h.shown ? '' : 'dashed'}/>
                    <text x={mx} y={my - 4}>{i + 2} · {dayText(Date.parse(`${h.day}T00:00:00Z`))}{h.shown ? '' : ' ?'}</text></g>; })}
              </g>}
              {on.map(p => {
                const at = project(p);
                const held = heldHere(p);
                const isOn = p.entity_id === picked;
                const firstHop = hops.findIndex(h => h.place.entity_id === p.entity_id);
                return <g key={p.entity_id} className={`pl-place s-${p.sure}${isOn ? ' on' : ''}`} transform={`translate(${at.x},${at.y})`}
                  role="button" tabIndex={-1} aria-label={`${p.caption}, ${SURE[p.sure ?? 'not_yet'].word}`} onClick={() => pick(p.entity_id)}>
                  {p.sure === 'approximate' && <circle r={30} className="pl-area"/>}
                  {held >= 2 ? <><circle r={12} className="pl-held"/><text y={4} className="pl-heldn">{held}</text></>
                    : <><circle r={9} className="pl-ring"/><circle r={3.5} className="pl-dot"/></>}
                  {firstHop === 0 && <text x={-14} y={-14} className="pl-hopn">1 · {dayText(Date.parse(`${hops[0].day}T00:00:00Z`))}</text>}
                  <text x={16} y={-1} className="pl-name">{p.caption}</text>
                  <text x={16} y={13} className="pl-sub">{held >= 2 ? `${held} parties at this address` : p.sure === 'approximate' && p.precision ? `${p.precision} only` : p.address ?? (p.precision ? `exact to the ${p.precision}` : SURE[p.sure ?? 'not_yet'].word)}</text>
                </g>;
              })}
              {off.map(p => {
                const m = edgeMarker({x: box.w / 2, y: box.h / 2}, project(p), box);
                const nearest = Math.min(...on.map(o => km(o, p)));
                const right = m.x > box.w / 2;
                return <g key={p.entity_id} className="pl-edge" transform={`translate(${m.x},${m.y})`} role="button" tabIndex={-1}
                  aria-label={`${p.caption}, off this map, about ${Math.round(nearest)} km away`} onClick={() => pick(p.entity_id)}>
                  <rect x={right ? -230 : 0} y={-12} width={230} height={24} rx={12}/>
                  <text x={right ? -220 : 10} y={4}>{m.arrow} {p.caption} · {Math.round(nearest).toLocaleString('en-GB')} km · {(p.events ?? []).length} {(p.events ?? []).length === 1 ? 'event' : 'events'}</text>
                </g>;
              })}
              <text x={box.w - 10} y={box.h - 10} className="pl-small" textAnchor="end">Drawn from the records&apos; own coordinates · nothing looked up · works offline</text>
            </svg>}
            {timeWindow && <p className="pl-window" data-testid="places-window">Showing {places.length} of {all.length} places with events between {years}.
              <button className="tp-link" onClick={() => setTimeWindow(null)}>Reset dates</button></p>}
            {omitted.length > 0 && <div className="pl-cant">
              <p className="tl2-cap">Can&apos;t be placed · {omitted.length}</p>
              {omitted.slice(0, 4).map(o => <div key={o.entity_id}><b>{o.caption}</b><small>{o.reason}</small>
                <button className="tp-link" onClick={() => openDossier(o.entity_id)}>Open the record</button></div>)}
              {omitted.length > 4 && <small>and {omitted.length - 4} more in the List view</small>}
            </div>}
            {!baseMap && <div className="pl-key" aria-label="How sure is the place">
              <p className="tl2-cap">How sure is the place</p>
              <span><svg width="18" height="18"><circle cx="9" cy="9" r="6" className="pl-ring s-document"/></svg>read from a document</span>
              <span><svg width="18" height="18"><circle cx="9" cy="9" r="8" className="pl-area"/><circle cx="9" cy="9" r="3" className="pl-dot"/></svg>approximate (a town)</span>
              <span><svg width="18" height="18"><circle cx="9" cy="9" r="6" className="pl-ring s-not_yet"/></svg>not yet shown</span>
              <span className="pl-off"><svg width="18" height="18"><circle cx="9" cy="9" r="6" className="pl-ring" strokeDasharray="1 3"/></svg>worked out · lookups are off</span>
              <span><svg width="18" height="18"><circle cx="9" cy="9" r="8" className="pl-held"/></svg>one address, several parties</span>
            </div>}
          </div>
          {hops.length > 1 && <p className="pl-hops">{hops.map(h => `${h.place.caption} ${dayText(Date.parse(`${h.day}T00:00:00Z`))}`).join(' → ')}
            {hops.some(h => !h.shown) ? ' · dashed hops rest on records not yet verified' : ''}</p>}
          <div className="pl-strip"><PlacesTimeline places={all} picked={picked} timeWindow={timeWindow} onWindow={setTimeWindow} onPick={pick}/></div>
        </>}
      </div>
      <PlaceDetail place={sel} onStep={step} openDossier={openDossier} timeWindow={timeWindow}/>
    </div>}
  </section>;
}

function PlaceDetail({place, onStep, openDossier, timeWindow}: {place: PlaceOut | null; onStep: (d: 1 | -1) => void; openDossier: (id: string) => void; timeWindow: TimeWindow | null}): ReactElement {
  if (!place) return <aside className="tl2-side" aria-label="Place"><p className="tl2-cap">Place <span>← → next place · Enter opens</span></p>
    <p className="tl2-none">Click a place on the map, the list or the strip.</p></aside>;
  const events = [...(place.events ?? [])].sort((a, b) => a.first_day.localeCompare(b.first_day));
  const parties = Array.from(new Map(place.links.map(l => [l.entity_id, l])).values());
  return <aside className="tl2-side" aria-label="Place">
    <p className="tl2-cap">Place <span><button className="tp-link" onClick={() => onStep(-1)} aria-label="Previous place">←</button> <button className="tp-link" onClick={() => onStep(1)} aria-label="Next place">→</button> next place · Enter opens</span></p>
    <h3>{place.caption}</h3>
    {place.address && <p className="tl2-none">{place.address}</p>}
    <div className="tl2-chips"><span className={`tl2-chip pl-chip s-${place.sure}`}>{SURE[place.sure ?? 'not_yet'].chip}{place.precision ? ` · ${place.precision}` : ''}</span></div>
    <dl className="tl2-dl"><dt>Placed from</dt><dd>{place.placed_from ?? 'its record, with no document behind the coordinates'}</dd>
      <dt>Where</dt><dd>{coordinates(place)}{place.country ? ` · ${place.country.toUpperCase()}` : ''}</dd></dl>
    <p className="tl2-cap">What happened here · {events.length}</p>
    {events.length ? <ul className="pl-events">{events.map(e => {
      const inside = !timeWindow || (eventWindow(e).from < timeWindow.to && eventWindow(e).to > timeWindow.from);
      return <li key={e.id} className={inside ? '' : 'out'}><i className={e.verification_status === 'verified' ? 'f-shown' : 'f-notyet'}>{e.verification_status === 'verified' ? '✓' : '?'}</i>
        <time>{e.exact ? dayText(Date.parse(`${e.first_day}T00:00:00Z`)) : e.date_start}</time><span>{e.title}</span></li>; })}</ul>
      : <p className="tl2-none">No dated event on the timeline points at this place yet.</p>}
    {parties.length > 0 && <><p className="tl2-cap">Parties seen here</p>
      <div className="pl-parties">{parties.map(l => <button key={l.entity_id} onClick={() => openDossier(l.entity_id)}>{l.caption}</button>)}</div></>}
    <div className="tl2-acts"><button className="pri" onClick={() => openDossier(place.entity_id)}>Open the record</button></div>
  </aside>;
}

function PlacesList({places, omitted, onPick, openDossier}: {places: PlaceOut[]; omitted: Array<{entity_id: string; caption: string; reason: string}>; onPick: (id: string) => void; openDossier: (id: string) => void}): ReactElement {
  return <div className="pl-list">
    {places.length > 0 && <table className="oc-table" aria-label="Places">
      <thead><tr><th scope="col">Place</th><th scope="col">How sure</th><th scope="col">Where</th><th scope="col">Linked</th></tr></thead>
      <tbody>{places.map(place => <tr key={place.entity_id}>
        <th scope="row"><button className="tp-link" onClick={() => onPick(place.entity_id)}>{place.caption}</button><small> · {place.schema}</small></th>
        <td>{SURE[place.sure ?? 'not_yet'].word}</td>
        <td>{place.address ? `${place.address} · ` : ''}{coordinates(place)}{place.precision ? ` · exact to the ${place.precision}` : ''}{place.country ? ` · ${place.country.toUpperCase()}` : ''}</td>
        <td>{place.links.length === 0 ? '—' : place.links.map(link => <div key={`${link.relationship_id}-${link.direction}`}>
          <button className="tp-link" onClick={() => openDossier(link.entity_id)}>{link.caption}</button><small> · {link.schema}</small></div>)}</td>
      </tr>)}</tbody>
    </table>}
    {omitted.length > 0 && <div className="pl-cantlist"><b>Can&apos;t be placed</b>
      {omitted.map(o => <div key={o.entity_id}><small><button className="tp-link" onClick={() => openDossier(o.entity_id)}>{o.caption}</button>: {o.reason}</small></div>)}</div>}
  </div>;
}
