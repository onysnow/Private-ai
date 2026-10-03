'use client';
// Places: the investigation's records that say where they are, on the
// self-hosted base map (ADR-0005, line 18), and as a list that names each
// place, what is linked to it, and where it is. The list is the map in words
// and works without a base map. Coordinates come only from the records
// (FollowTheMoney's latitude and longitude); nothing is looked up, so no
// address leaves the machine. Records whose coordinates cannot be used are
// listed with why.
import {useQuery} from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import type {ReactElement} from 'react';

import {Button} from '@/components/ui/button';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {errorMessage} from '../../lib/api-client';
import {getBasemapStatusOptions, getInvestigationPlacesOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {PlaceOut} from '../../lib/generated/types.gen';
import {useWorkbenchStore} from '../../lib/workbench-store';

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
  const places = placesQuery.data?.places ?? [];
  // Whether a base map is installed matters only once there is a place to draw.
  const statusQuery = useQuery({...getBasemapStatusOptions(), enabled: places.length > 0});
  const omitted = placesQuery.data?.omitted ?? [];
  const status = statusQuery.data;
  return <Card>
    <CardHeader>
      <CardTitle>Places</CardTitle>
      <CardDescription>Records with a latitude and a longitude, and what is linked to them. Places come only from the records; nothing is looked up.</CardDescription>
    </CardHeader>
    <CardContent>
      {placesQuery.isError && <p className="muted">{errorMessage(placesQuery.error, 'Could not read the places')}</p>}
      {placesQuery.data && places.length === 0 && <p className="muted">No record in this investigation holds both a latitude and a longitude.
        An Address or a RealEstate record with coordinates shows here.</p>}
      {places.length > 0 && status?.available && <PlacesMap status={status} places={places} onPlace={openDossier}/>}
      {places.length > 0 && status && !status.available && <p className="muted" data-testid="no-basemap">
        No base map is installed here, so the places are listed only. To draw them on a map, install the base map once with the
        compose profile <code>maps</code> (see DEPLOYMENT.md).</p>}
      {places.length > 0 && <table className="text-sm" aria-label="Places">
        <thead><tr><th scope="col">Place</th><th scope="col">Where</th><th scope="col">Linked</th></tr></thead>
        <tbody>{places.map(place => <tr key={place.entity_id}>
          <th scope="row"><Button variant="link" size="sm" onClick={() => openDossier(place.entity_id)}>{place.caption}</Button>
            <small> · {place.schema}</small></th>
          <td>{place.address ? `${place.address} · ` : ''}{coordinates(place)}{place.country ? ` · ${place.country.toUpperCase()}` : ''}</td>
          <td>{place.links.length === 0 ? '—' : place.links.map(link => <div key={`${link.relationship_id}-${link.direction}`}>
            <Button variant="link" size="sm" onClick={() => openDossier(link.entity_id)}>{link.caption}</Button>
            <small> · {link.schema}</small>
          </div>)}</td>
        </tr>)}</tbody>
      </table>}
      {status?.available && places.length > 0 && <p className="muted text-xs">Map data © OpenStreetMap contributors (ODbL), Protomaps build {status.version}
        {status.built ? ` of ${status.built.slice(0, 10)}` : ''}.</p>}
      {omitted.length > 0 && <div>
        <b>Coordinates that cannot be used</b>
        {omitted.map(o => <div key={o.entity_id}><small><Button variant="link" size="sm" onClick={() => openDossier(o.entity_id)}>{o.caption}</Button>: {o.reason}</small></div>)}
      </div>}
    </CardContent>
  </Card>;
}
