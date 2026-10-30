'use client';
// The investigation's places on the self-hosted base map, drawn with MapLibre
// GL JS (BSD-3; ADR-0005, line 18). Loaded on demand, client-side only: it
// needs WebGL. Each place is a dot named beside it (where names collide, the
// name waits for a closer zoom, and hovering the dot names it); clicking one
// picks it. The map opens on the places (or the whole world when there are
// none) and keeps the reporter's pan and zoom when the places change.
import {LngLatBounds, Map as MapLibreMap, NavigationControl, Popup, addProtocol, setWorkerUrl} from 'maplibre-gl';
import type {AddProtocolAction, GeoJSONSource, MapLayerMouseEvent} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {useEffect, useRef} from 'react';
import type {ReactElement} from 'react';

import {api} from '../lib/api-instance';
import {BASEMAP_PROTOCOL, PATH_SOURCE, PLACES_SOURCE, basemapLoader, basemapStyle, dotImage, dotRadius, pathGeoJson, placesBounds, placesGeoJson} from '../lib/basemap-style';
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

/** Makes a place's dot when MapLibre first asks for it, sharp at the
 * screen's pixel ratio, rather than shipping it as a file (MapLibre 6's
 * missing-image resolver; its `styleimagemissing` event cannot answer the
 * request). */
export function drawDotsOnDemand(map: MapLibreMap): void {
  map.setMissingStyleImageResolver(id => {
    const radius = dotRadius(id);
    if (radius === null || map.hasImage(id)) return;
    const ratio = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
    map.addImage(id, dotImage(radius, ratio), {pixelRatio: ratio});
  });
}

type Props = {
  status: BasemapStatusOut;
  places: PlaceOut[];
  onPlace?: (entityId: string) => void;
  /** The place picked on the map or the timeline: its dot is drawn larger. */
  picked?: string | null;
  /** A number of px, or a CSS height ('100%' fills the box the map sits in). */
  height?: number | string;
  /** A party's path, hop by hop, as [longitude, latitude] points in date order. */
  path?: [number, number][];
  /** The dark map under a dark theme; grayscale (the default) for light themes and exports. */
  flavor?: 'grayscale' | 'dark';
  /** The places a picked party was seen at: ringed, and the view moves to show them all. */
  marked?: string[];
};

export function PlacesMap({status, places, onPlace, picked = null, height = 420, path = [], flavor = 'grayscale', marked = []}: Props): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;
  const pathRef = useRef(path);
  pathRef.current = path;

  // The map itself, made once per base map.
  useEffect(() => {
    if (!container.current) return;
    ensureBasemapProtocol();
    const bounds = placesBounds(places);
    const made = new MapLibreMap({
      container: container.current, style: basemapStyle(status, placesGeoJson(places, picked), {flavor}),
      ...(bounds ? {bounds, fitBoundsOptions: {padding: 60, maxZoom: Math.min(10, (status.max_zoom ?? 6) + 2)}} : {center: [0, 20], zoom: 1}),
      attributionControl: {compact: false},
    });
    made.addControl(new NavigationControl({showCompass: false}), 'top-right');
    drawDotsOnDemand(made);
    made.on('click', 'places-dot', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.entity_id;
      if (typeof id === 'string') onPlaceRef.current?.(id);
    });
    made.on('load', () => (made.getSource(PATH_SOURCE) as GeoJSONSource | undefined)?.setData(pathGeoJson(pathRef.current)));
    // Every dot can be named: hovering it names it, even where its label gave way to another. Text, never HTML: the
    // names come from the records.
    const tip = new Popup({closeButton: false, closeOnClick: false, offset: 12, className: 'pl-tip'});
    made.on('mouseenter', 'places-dot', (event: MapLayerMouseEvent) => {
      made.getCanvas().style.cursor = 'pointer';
      const feature = event.features?.[0];
      const caption = feature?.properties?.caption;
      if (typeof caption !== 'string' || feature?.geometry.type !== 'Point') return;
      tip.setLngLat(feature.geometry.coordinates as [number, number]).setText(caption).addTo(made);
    });
    made.on('mouseleave', 'places-dot', () => { made.getCanvas().style.cursor = ''; tip.remove(); });
    map.current = made;
    return () => { made.remove(); map.current = null; };
    // The places reach a made map through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, flavor]);

  const markedKey = marked.join(',');
  // New places, or a new pick, replace the dots without moving the reporter's view.
  useEffect(() => {
    const source = map.current?.getSource(PLACES_SOURCE) as GeoJSONSource | undefined;
    source?.setData(placesGeoJson(places, picked, marked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, picked, markedKey]);

  // A party picked on the Path: the view moves to show every place it was seen at.
  useEffect(() => {
    const seen = places.filter(p => marked.includes(p.entity_id));
    if (!map.current || seen.length < 2) return;
    const bounds = new LngLatBounds();
    for (const p of seen) bounds.extend([p.longitude, p.latitude]);
    map.current.fitBounds(bounds, {padding: 90, maxZoom: Math.min(10, (status.max_zoom ?? 6) + 2), duration: 600});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markedKey]);

  // A party's path, drawn when picked and cleared when not.
  const pathKey = JSON.stringify(path);
  useEffect(() => {
    const line = map.current?.getSource(PATH_SOURCE) as GeoJSONSource | undefined;
    line?.setData(pathGeoJson(path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  return <div ref={container} style={{height}} role="region"
    aria-label={`Map of ${places.length} place${places.length === 1 ? '' : 's'}; the list below names each one`}/>;
}
