'use client';
// Places: the investigation's records that say where they are, on the
// self-hosted base map (ADR-0005, line 18), and as a list that names each
// place, what is linked to it, and where it is. The list is the map in words
// and works without a base map. Coordinates come only from the records
// (FollowTheMoney's latitude and longitude); nothing is looked up, so no
// address leaves the machine. Records whose coordinates cannot be used are
// listed with why. Under the map, a strip of the dated events at each place
// picks a stretch of time, and the map and the list keep the places with an
// event in it (places-timeline.tsx).
import {useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import {useState} from 'react';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {FamilyMark, PartyMark} from '../../components/network/marks';
import {Reveal} from '../../components/ui/reveal';
import {errorMessage} from '../../lib/api-client';
import {getBasemapStatusOptions, getInvestigationPlacesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {PlaceOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {placesInWindow} from '../../lib/place-times';
import {ChartFrame, FootStat, KeyRow, KeySection} from '../../components/charts/chart-frame';

// The map's dot colour (lib/basemap-style.ts PLACE_COLOUR), named here so the key does not load the base map style.
const PLACE_DOT = '#8A2F1E';
import type {TimeWindow} from '../../lib/place-times';

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

export function PlacesPanel({investigationId}: Props): ReactElement {
  const openDossier = useWorkbenchStore(state => state.openDossier);
  const placesQuery = useQuery({...getInvestigationPlacesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const all = placesQuery.data?.places ?? [];
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const places = placesInWindow(all, timeWindow);
  const pick = (entityId: string) => { setPicked(entityId); openDossier(entityId); };
  // Whether a base map is installed matters only once there is a place to draw.
  const statusQuery = useQuery({...getBasemapStatusOptions(), enabled: all.length > 0});
  const omitted = placesQuery.data?.omitted ?? [];
  const status = statusQuery.data;
  const linked = all.reduce((n, p) => n + p.links.length, 0);
  return <Card>
    <CardHeader>
      {/* Ony, 29 Oct: the card's explanation is revealed on its title. */}
      <CardTitle><Reveal detail="Records that say where they are, and what is linked to them.">Places</Reveal></CardTitle>
    </CardHeader>
    <CardContent>
      {placesQuery.isError && <p className="muted">{errorMessage(placesQuery.error, 'Could not read the places')}</p>}
      {placesQuery.data && all.length === 0 && <p className="muted">No record in this investigation holds both a latitude and a longitude.
        An Address or a RealEstate record with coordinates shows here.</p>}
      {all.length > 0 && <ChartFrame kind="places" title="Where things are"
        rule={{label: 'On the map:', text: 'each dot sits at the latitude and longitude its record gives; nothing is looked up, so no address leaves this machine. Under the map, pick a stretch of time to keep the places with an event in it.'}}
        legend={<>
          <KeySection title="Places" channel="dot: a place a record gives">
            <KeyRow swatch={<svg width="22" height="22"><circle cx="11" cy="11" r="7" fill={PLACE_DOT} stroke="#ffffff" strokeWidth="2"/></svg>}>A place, named beside its dot</KeyRow>
            <KeyRow swatch={<svg width="24" height="24"><circle cx="12" cy="12" r="10" fill={PLACE_DOT} stroke="#ffffff" strokeWidth="2"/></svg>}>The place you picked: a larger dot, a larger name</KeyRow>
          </KeySection>
          <KeySection title="Time" channel="the strip under the map">
            <KeyRow swatch={<svg width="36" height="14"><rect x="1" y="2" width="34" height="10" fill={PLACE_DOT} opacity=".22"/></svg>}>The stretch of time picked</KeyRow>
          </KeySection>
        </>}
        footer={<>
          <FootStat value={places.length === all.length ? all.length : `${places.length} of ${all.length}`}>places</FootStat>
          <FootStat value={linked}>links to them</FootStat>
          {omitted.length > 0 && <FootStat value={omitted.length}>records with unusable coordinates, listed below</FootStat>}
          {/* The licence asks for the attribution on the map: it stays; the build is revealed on it. */}
          {status?.available && <Reveal detail={`Map data © OpenStreetMap contributors (ODbL), Protomaps build ${status.version}${status.built ? ` of ${status.built.slice(0, 10)}` : ''}.`}>
            <span>© OpenStreetMap contributors</span></Reveal>}
        </>}>
        {status?.available && <PlacesMap status={status} places={places} onPlace={pick} picked={picked}/>}
        {status && !status.available && <p className="muted p-4" data-testid="no-basemap">
          No base map is installed here, so the places are listed only. To draw them on a map, install the base map once with the
          compose profile <code>maps</code> (see DEPLOYMENT.md).</p>}
        <div style={{padding: '4px 12px 8px'}}><PlacesTimeline places={all} picked={picked} timeWindow={timeWindow} onWindow={setTimeWindow} onPick={pick}/></div>
        {timeWindow && places.length < all.length && <p className="muted text-sm px-4 pb-2" data-testid="places-window">
          {places.length} of {all.length} places have an event in this stretch of time; the others are hidden until you show all dates.</p>}
      </ChartFrame>}
      {places.length > 0 && <table className="oc-table" aria-label="Places">
        <thead><tr><th scope="col">Place</th><th scope="col">Where</th><th scope="col">Linked</th></tr></thead>
        <tbody>{places.map(place => <tr key={place.entity_id}>
          {/* A place's kind is its party icon, a link's its family line, each named on reveal; the coordinates are revealed
              on the address (shown when there is no address). */}
          <th scope="row"><span className="inline-flex items-center gap-1"><PartyMark schema={place.schema} size={14}/>
            <Button variant="link" size="sm" onClick={() => pick(place.entity_id)}>{place.caption}</Button></span></th>
          <td>{place.address ? <Reveal detail={coordinates(place)}><span>{place.address}</span></Reveal> : coordinates(place)}{place.country ? ` · ${place.country.toUpperCase()}` : ''}</td>
          <td>{place.links.length === 0 ? '—' : place.links.map(link => <div key={`${link.relationship_id}-${link.direction}`} className="inline-flex items-center gap-1">
            <FamilyMark schema={link.schema}/>
            <Button variant="link" size="sm" onClick={() => openDossier(link.entity_id)}>{link.caption}</Button>
          </div>)}</td>
        </tr>)}</tbody>
      </table>}
      {omitted.length > 0 && <div style={{marginTop: 12}}>
        <b>Coordinates that cannot be used</b>
        {omitted.map(o => <div key={o.entity_id}><small><Button variant="link" size="sm" onClick={() => openDossier(o.entity_id)}>{o.caption}</Button>: {o.reason}</small></div>)}
      </div>}
    </CardContent>
  </Card>;
}
