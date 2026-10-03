// The self-hosted base map as a MapLibre style (ADR-0005, lines 4 and 18).
// The layers are Protomaps' own (@protomaps/basemaps, BSD-3), in its
// grayscale flavor, so the data drawn on top carries the only colour. Every
// tile, font and sprite is asked of this app's backend (/api/basemap)
// through the `workbench` protocol, which sends the request through the
// app's API client with the reporter's sign-in, so no other host is asked
// and none learns which places are looked at.
import {layers, namedFlavor} from '@protomaps/basemaps';
import type {LayerSpecification, StyleSpecification} from 'maplibre-gl';

import type {ApiClient} from './api-client';
import type {BasemapStatusOut, PlaceOut} from './generated/types.gen';

export const BASEMAP_PROTOCOL = 'workbench';
const ROOT = `${BASEMAP_PROTOCOL}://api/basemap`;
export const PLACES_SOURCE = 'places';
// A dark brick red: 3.3:1 against the grayscale flavor's water (#a3a3a3), 5.2:1
// against its land (#cccccc) and more against everything lighter (WCAG 1.4.11
// asks 3:1 of a mark that carries information); a white ring sets it apart.
export const PLACE_COLOUR = '#8A2F1E';
export const PLACE_LABEL_FONT = ['Noto Sans Medium'];

/** The protocol's loader: a `workbench://api/...` URL fetched as `/api/...`
 * through the app's API client. MapLibre asks for JSON (a sprite index) or
 * bytes (tiles, glyphs, the sprite sheet). */
export function basemapLoader(client: Pick<ApiClient, 'blob'>) {
  return async (params: {url: string; type?: string}, abort: AbortController): Promise<{data: unknown}> => {
    const path = params.url.slice(`${BASEMAP_PROTOCOL}://`.length - 1);   // keeps the leading "/"
    const blob = await client.blob(path, {signal: abort.signal});
    if (params.type === 'json') return {data: JSON.parse(await blob.text())};
    return {data: await blob.arrayBuffer()};
  };
}

/** The places as GeoJSON points, each carrying its record's id and name. */
export function placesGeoJson(places: PlaceOut[]): GeoJSON.FeatureCollection<GeoJSON.Point, {entity_id: string; caption: string}> {
  return {
    type: 'FeatureCollection',
    features: places.map(p => ({type: 'Feature', geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]},
      properties: {entity_id: p.entity_id, caption: p.caption}})),
  };
}

/** West, south, east and north of the places, or null when there are none. */
export function placesBounds(places: PlaceOut[]): [number, number, number, number] | null {
  if (!places.length) return null;
  const lons = places.map(p => p.longitude), lats = places.map(p => p.latitude);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function basemapStyle(status: BasemapStatusOut, places: PlaceOut[]): StyleSpecification {
  const placeLayers: LayerSpecification[] = [
    {id: 'places-dot', type: 'circle', source: PLACES_SOURCE,
      paint: {'circle-radius': 7, 'circle-color': PLACE_COLOUR, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2}},
    // Every place is named beside its dot (rule 12: not by colour or position alone).
    {id: 'places-name', type: 'symbol', source: PLACES_SOURCE,
      layout: {'text-field': ['get', 'caption'], 'text-font': PLACE_LABEL_FONT, 'text-size': 13, 'text-offset': [0.9, 0],
        'text-anchor': 'left', 'text-max-width': 14},
      paint: {'text-color': '#1F1B16', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5}},
  ];
  return {
    version: 8,
    glyphs: `${ROOT}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ROOT}/sprites/grayscale`,
    sources: {
      protomaps: {type: 'vector', tiles: [`${ROOT}/tiles/{z}/{x}/{y}.mvt`], minzoom: status.min_zoom ?? 0, maxzoom: status.max_zoom ?? 6,
        attribution: status.attribution || '© OpenStreetMap'},
      [PLACES_SOURCE]: {type: 'geojson', data: placesGeoJson(places)},
    },
    layers: [...(layers('protomaps', namedFlavor('grayscale'), {lang: 'en'}) as LayerSpecification[]), ...placeLayers],
  };
}
