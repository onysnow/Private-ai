'use client';
// The investigation's places on the self-hosted base map, drawn with MapLibre
// GL JS (BSD-3; ADR-0005, line 18). Loaded on demand, client-side only: it
// needs WebGL. Each place is a dot named beside it; clicking one opens its
// record. The map opens on the places (or the whole world when there are
// none) and keeps the reporter's pan and zoom when the places change.
import {Map as MapLibreMap, NavigationControl, addProtocol, setWorkerUrl} from 'maplibre-gl';
import type {AddProtocolAction, GeoJSONSource, MapLayerMouseEvent} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {useEffect, useRef} from 'react';
import type {ReactElement} from 'react';

import {api} from '../lib/api-instance';
import {BASEMAP_PROTOCOL, PLACES_SOURCE, basemapLoader, basemapStyle, placesBounds, placesGeoJson} from '../lib/basemap-style';
import type {BasemapStatusOut, PlaceOut} from '../lib/generated/types.gen';

let protocolAdded = false;

/** Where MapLibre's worker is served: scripts/copy-maplibre-worker.mjs puts
 * it, with the shared module it imports, in public/maplibre/ before every
 * build. */
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

/** Once for the page: the `workbench` protocol, so every map request goes
 * through the app's API client; and where MapLibre's worker is (MapLibre 6
 * looks beside its own module, which a bundle does not keep). */
export function ensureBasemapProtocol(): void {
  if (protocolAdded) return;
  setWorkerUrl(new URL(MAPLIBRE_WORKER_URL, window.location.href).href);
  addProtocol(BASEMAP_PROTOCOL, basemapLoader(api) as AddProtocolAction);
  protocolAdded = true;
}

type Props = {
  status: BasemapStatusOut;
  places: PlaceOut[];
  onPlace?: (entityId: string) => void;
  height?: number;
};

export function PlacesMap({status, places, onPlace, height = 420}: Props): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  // The map itself, made once per base map.
  useEffect(() => {
    if (!container.current) return;
    ensureBasemapProtocol();
    const bounds = placesBounds(places);
    const made = new MapLibreMap({
      container: container.current, style: basemapStyle(status, places),
      ...(bounds ? {bounds, fitBoundsOptions: {padding: 60, maxZoom: Math.min(10, (status.max_zoom ?? 6) + 2)}} : {center: [0, 20], zoom: 1}),
      attributionControl: {compact: false},
    });
    made.addControl(new NavigationControl({showCompass: false}), 'top-right');
    made.on('click', 'places-dot', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.entity_id;
      if (typeof id === 'string') onPlaceRef.current?.(id);
    });
    made.on('mouseenter', 'places-dot', () => { made.getCanvas().style.cursor = 'pointer'; });
    made.on('mouseleave', 'places-dot', () => { made.getCanvas().style.cursor = ''; });
    map.current = made;
    return () => { made.remove(); map.current = null; };
    // The places reach a made map through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // New places replace the dots without moving the reporter's view.
  useEffect(() => {
    const source = map.current?.getSource(PLACES_SOURCE) as GeoJSONSource | undefined;
    source?.setData(placesGeoJson(places));
  }, [places]);

  return <div ref={container} style={{height}} role="region"
    aria-label={`Map of ${places.length} place${places.length === 1 ? '' : 's'}; the list below names each one`}/>;
}
