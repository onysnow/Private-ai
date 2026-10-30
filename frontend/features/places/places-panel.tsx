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
import {useEffect, useMemo, useState} from 'react';
import type {KeyboardEvent, ReactElement} from 'react';

import {errorMessage} from '../../lib/api-client';
import {getBasemapStatusOptions, getInvestigationPlacesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {BasemapStatusOut, PlaceOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {dayText, eventWindow, placesInWindow} from '../../lib/place-times';
import type {TimeWindow} from '../../lib/place-times';
import {pathOf, travellers} from './places-model';
import {FamilyMark, PartyMark} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {Aside, FactMark, KeysMark} from '../timeline/marks';

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


export function PlacesPanel({investigationId}: Props): ReactElement {
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const placesQuery = useQuery({...getInvestigationPlacesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const all = useMemo(() => placesQuery.data?.places ?? [], [placesQuery.data]);
  const omitted = placesQuery.data?.omitted ?? [];
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [cantOpen, setCantOpen] = useState(false);
  const places = placesInWindow(all, timeWindow);
  // The world map: the app fetches it once by itself; until it is here, how far the download has got.
  const statusQuery = useQuery({...getBasemapStatusOptions(), enabled: all.length > 0,
    refetchInterval: q => (q.state.data?.available || q.state.data?.download === 'failed' ? false : 2000)});
  const status = statusQuery.data;
  const flavor = useMapFlavor();
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
        <button aria-pressed={list} onClick={() => setList(true)}>List</button>
      </div>
      <h2 id="pl-title"><Reveal detail="Every place comes from your records. A ring says how sure the place is."><span>Where did it happen, and who moved where?</span></Reveal></h2>
      {/* What leaves the computer stays in sight (the floor): nothing is looked up. The how, on reveal. */}
      <Reveal detail="Drawn from the records’ own coordinates. Nothing is looked up, so no address leaves this computer; it works offline.">
        <span className="tl2-chip dash pl-local">⌂ nothing looked up</span></Reveal>
      <KeysMark><kbd>L</kbd> list · <kbd>←</kbd><kbd>→</kbd> next place · <kbd>Enter</kbd> opens its record</KeysMark>
      <p className="tl2-status">{all.length} {all.length === 1 ? 'place' : 'places'}{countries.size ? ` · ${countries.size} ${countries.size === 1 ? 'country' : 'countries'}` : ''}{omitted.length ? <> · {omitted.length} can&apos;t be placed</> : null}</p>
    </header>
    {all.length === 0 && omitted.length === 0 && <p className="tl2-empty">No record in this investigation holds both a latitude and a longitude.
      An Address or a RealEstate record with coordinates shows here; nothing is looked up from an address.</p>}

    {(all.length > 0 || omitted.length > 0) && <div className="pl-body">
      <div className="pl-main">
        {list ? <PlacesList places={places} omitted={omitted} onPick={pick} openDossier={openDossier}/> : <>
          {people.length > 0 && <div className="pl-tools">
            <div className="tl2-views" role="group" aria-label="Path">
              <span className="tl2-cap">Path</span>
              {people.slice(0, 4).map(t => <button key={t.id} aria-pressed={path === t.id} onClick={() => setPath(p => (p === t.id ? null : t.id))}>{t.caption}</button>)}
              <button aria-pressed={path === null} onClick={() => setPath(null)}>None</button>
            </div>
          </div>}
          <div className="pl-map">
            {status?.available ? <PlacesMap status={status} places={places} onPlace={pick} picked={picked} height="100%" flavor={flavor}
              path={hops.map(h => [h.place.longitude, h.place.latitude] as [number, number])}/>
              : <MapComing status={status} onRetry={() => void statusQuery.refetch()}/>}
            {timeWindow && <p className="pl-window" data-testid="places-window">Showing {places.length} of {all.length} places with events between {years}.
              <button className="tp-link" onClick={() => setTimeWindow(null)}>Reset dates</button></p>}
            {/* What cannot be placed: one small mark on the map's corner, the list when it is opened, so the map stays clear. */}
            {omitted.length > 0 && <div className={`pl-cant${cantOpen ? ' open' : ''}`}>
              <button type="button" className="pl-cant-toggle" aria-expanded={cantOpen} onClick={() => setCantOpen(v => !v)}>
                <b>{omitted.length}</b> can&apos;t be placed <span aria-hidden="true">{cantOpen ? '▴' : '▾'}</span></button>
              {cantOpen && <>{omitted.slice(0, 6).map(o => <div key={o.entity_id}><Reveal detail={o.reason}><b>{o.caption}</b></Reveal>
                <button className="tp-link" onClick={() => openDossier(o.entity_id)}>Open the record</button></div>)}
              {omitted.length > 6 && <button className="tp-link" onClick={() => setList(true)}>{omitted.length - 6} more in the List view</button>}</>}
            </div>}
          </div>
          {hops.length > 1 && <p className="pl-hops">{hops.map(h => `${h.place.caption} ${dayText(Date.parse(`${h.day}T00:00:00Z`))}`).join(' → ')}
            {hops.some(h => !h.shown) ? <> <Aside label="Dashed hops">Dashed hops rest on records not yet verified.</Aside></> : null}</p>}
          <div className="pl-strip"><PlacesTimeline places={all} picked={picked} timeWindow={timeWindow} onWindow={setTimeWindow} onPick={pick}/></div>
        </>}
      </div>
      <PlaceDetail place={sel} onStep={step} openDossier={openDossier} timeWindow={timeWindow}/>
    </div>}
  </section>;
}

/** The dark map under a dark theme, the grayscale one under a light theme: read from the page's ground colour. */
function useMapFlavor(): 'grayscale' | 'dark' {
  const [flavor, setFlavor] = useState<'grayscale' | 'dark'>('dark');
  useEffect(() => {
    const read = () => {
      const ground = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      setFlavor(0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2] > 128 ? 'grayscale' : 'dark');
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
    return () => watch.disconnect();
  }, []);
  return flavor;
}

/** Until the world map is here: the app is fetching it, once, by itself. */
function MapComing({status, onRetry}: {status: BasemapStatusOut | undefined; onRetry: () => void}): ReactElement {
  const done = status?.download_done ?? 0, total = status?.download_total ?? 0;
  const mb = (n: number) => `${Math.round(n / 1e6)} MB`;
  if (status?.download === 'failed') return <div className="pl-coming" role="status">
    <b>The world map could not be downloaded</b>
    <Reveal detail={status.reason ?? 'No connection to Protomaps.'}><span className="pl-coming-sub">Check the connection</span></Reveal>
    <button className="tp-link" onClick={onRetry}>Try again</button></div>;
  if (status && !status.download) return <div className="pl-coming" role="status">
    <b>No world map on this computer</b>
    <Reveal detail="Downloading the map is turned off here (BASEMAP_AUTO). The compose profile `maps` installs it."><span className="pl-coming-sub">Downloads are off</span></Reveal></div>;
  return <div className="pl-coming" role="status" aria-live="polite">
    <b>Getting the world map</b>
    <Reveal detail="Once, from Protomaps: the same public map for everyone (OpenStreetMap data). Nothing about this case is sent.">
      <span className="pl-coming-sub">{total ? `${mb(done)} of ${mb(total)}` : 'Starting…'}</span></Reveal>
    <progress max={total || 1} value={done}/></div>;
}

function PlaceDetail({place, onStep, openDossier, timeWindow}: {place: PlaceOut | null; onStep: (d: 1 | -1) => void; openDossier: (id: string) => void; timeWindow: TimeWindow | null}): ReactElement {
  if (!place) return <aside className="tl2-side" aria-label="Place"><p className="tl2-cap">Place</p>
    <p className="tl2-none">Click a place on the map, the list or the strip.</p></aside>;
  const events = [...(place.events ?? [])].sort((a, b) => a.first_day.localeCompare(b.first_day));
  const parties = Array.from(new Map(place.links.map(l => [l.entity_id, l])).values());
  return <aside className="tl2-side" aria-label="Place">
    <p className="tl2-cap">Place <span><button className="tp-link" onClick={() => onStep(-1)} aria-label="Previous place">←</button> <button className="tp-link" onClick={() => onStep(1)} aria-label="Next place">→</button></span></p>
    <h3>{place.caption}</h3>
    {place.address && <p className="tl2-none">{place.address}</p>}
    {/* How sure is the ring's colour; its word and the precision on reveal. */}
    <div className="tl2-chips"><Reveal label={SURE[place.sure ?? 'not_yet'].chip} detail={<><b>{SURE[place.sure ?? 'not_yet'].word}</b>{place.precision ? <span className="rv-row">exact to the {place.precision}</span> : null}</>}>
      <svg width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="7" className={`pl-ring s-${place.sure ?? 'not_yet'}`}/></svg></Reveal></div>
    <dl className="tl2-dl"><dt>Placed from</dt><dd>{place.placed_from ?? 'its record, with no document behind the coordinates'}</dd>
      <dt>Where</dt><dd><Reveal detail={coordinates(place)}><span>{place.country ? place.country.toUpperCase() : 'coordinates'}</span></Reveal></dd></dl>
    <p className="tl2-cap">What happened here · {events.length}</p>
    {events.length ? <ul className="pl-events">{events.map(e => {
      const inside = !timeWindow || (eventWindow(e).from < timeWindow.to && eventWindow(e).to > timeWindow.from);
      return <li key={e.id} className={inside ? '' : 'out'}><FactMark fact={e.verification_status === 'verified' ? 'shown' : 'not_yet'} note={e.verification_status}/>
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
        <th scope="row"><PartyMark schema={place.schema}/> <button className="tp-link" onClick={() => onPick(place.entity_id)}>{place.caption}</button></th>
        <td><Reveal label={SURE[place.sure ?? 'not_yet'].word} detail={SURE[place.sure ?? 'not_yet'].word}>
          <svg width="22" height="22" aria-hidden="true"><circle cx="11" cy="11" r="7" className={`pl-ring s-${place.sure ?? 'not_yet'}`}/></svg></Reveal></td>
        <td><Reveal detail={<>{place.address ? coordinates(place) : 'From the record’s own coordinates'}{place.precision ? <span className="rv-row">exact to the {place.precision}</span> : null}</>}>
          <span>{place.address ?? coordinates(place)}</span></Reveal>{place.country ? ` · ${place.country.toUpperCase()}` : ''}</td>
        <td>{place.links.length === 0 ? '—' : place.links.map(link => <div key={`${link.relationship_id}-${link.direction}`}>
          <FamilyMark schema={link.schema}/> <button className="tp-link" onClick={() => openDossier(link.entity_id)}>{link.caption}</button></div>)}</td>
      </tr>)}</tbody>
    </table>}
    {omitted.length > 0 && <div className="pl-cantlist"><b>Can&apos;t be placed</b>
      {omitted.map(o => <div key={o.entity_id}><small><button className="tp-link" onClick={() => openDossier(o.entity_id)}>{o.caption}</button>: {o.reason}</small></div>)}</div>}
  </div>;
}
