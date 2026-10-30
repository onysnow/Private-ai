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
export const PLACE_RADIUS = 7;    // px
export const PLACE_RING = 2;      // px of white around each dot
export const PLACE_LABEL_PX = 13;
export const PICKED_LABEL_PX = 15;   // a picked place's name: the base map's fonts have no bold face
// A name runs to the right of its dot, NAME_OFFSET_EM off it and wrapped at
// NAME_MAX_EM. A chart's view keeps every name inside the picture, as the
// render service does (render/map.mjs nameRoom, fitView: 0.6 em a character,
// an average for Noto Sans).
export const NAME_OFFSET_EM = 0.9;
export const NAME_MAX_EM = 14;
export const NAME_EM_PER_CHAR = 0.6;
export const TILE_SIZE = 512;      // MapLibre's tile size, px a world-width at zoom 0
export const VIEW_PADDING = 60;    // px kept clear around a chart's places
export const MAX_OVERZOOM = 2;     // zoom levels past the base map's own
export const ONE_PLACE_ZOOM = 8;   // a single place's view

/** The px a place's name takes to the right of its dot. */
export function nameRoom(name: string, picked: boolean): number {
  const size = picked ? PICKED_LABEL_PX : PLACE_LABEL_PX;
  return Math.ceil((NAME_OFFSET_EM + Math.min(name.length * NAME_EM_PER_CHAR, NAME_MAX_EM)) * size);
}

const mercatorX = (lon: number): number => (lon + 180) / 360;
const mercatorY = (lat: number): number => {
  const s = Math.sin(Math.max(-85.0511287, Math.min(85.0511287, lat)) * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};

/** A chart map's view: every place with VIEW_PADDING px to spare and its
 * name inside the picture, as render/map.mjs fitView picks it for the export. */
export function placesView(places: {longitude: number; latitude: number; name: string; picked: boolean}[], width: number, height: number,
  maxZoom: number): {center: [number, number]; zoom: number} {
  const xs = places.map(p => mercatorX(p.longitude)), ys = places.map(p => mercatorY(p.latitude));
  const x0 = Math.min(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const names = places.map(p => nameRoom(p.name, p.picked));
  const across = width - 2 * VIEW_PADDING;
  const limit = maxZoom + MAX_OVERZOOM;
  const scales = xs.map((x, i) => (x > x0 ? Math.max(across - names[i], 0) / (x - x0) : Infinity));
  scales.push(y1 > y0 ? (height - 2 * VIEW_PADDING) / (y1 - y0) : Infinity);
  const fitted = Math.min(...scales);
  const zoom = Number.isFinite(fitted) ? Math.max(0, Math.min(Math.log2(fitted / TILE_SIZE), limit)) : Math.min(ONE_PLACE_ZOOM, limit);
  const scale = TILE_SIZE * 2 ** zoom;
  const reach = Math.max(...xs.map((x, i) => (x - x0) * scale + names[i]));
  const centreY = (y0 + y1) / 2;
  return {center: [(x0 + reach / 2 / scale) * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * centreY))) * 180 / Math.PI], zoom};
}

/** A dot's image name, by its radius; places-map.tsx makes the image when MapLibre first asks for it. */
export function dotName(radius: number): string {
  return `place-dot-${radius}`;
}

/** The radius a dot's image name asks for, or null for an image that is not a dot. */
export function dotRadius(name: string): number | null {
  const match = /^place-dot-(\d+(?:\.\d+)?)$/.exec(name);
  return match ? Number(match[1]) : null;
}

export const PLACE_DOT = dotName(PLACE_RADIUS);

/** What each place on a map carries: its name, its dot, and whether it is picked out. */
export type PlaceMark = {entity_id?: string; caption: string; dot: string; picked: boolean; sure?: string; marked?: boolean};
export type PlaceMarks = GeoJSON.FeatureCollection<GeoJSON.Point, PlaceMark>;

/**
 * A place's dot as an image: a filled circle of `radius` px in PLACE_COLOUR
 * ringed in PLACE_RING px of white, edges smoothed, drawn at `pixelRatio`;
 * RGBA, not premultiplied (what MapLibre's addImage takes). The dot is an
 * image on a symbol layer rather than a circle layer because symbols take
 * part in MapLibre's label placement: the base map's own labels (a city's
 * name, say) then give way to a place's dot instead of being drawn under it.
 * render/map.mjs draws the same dot for exported maps.
 */
export function dotImage(radius: number, pixelRatio: number): {width: number; height: number; data: Uint8Array} {
  const outer = radius + PLACE_RING;
  const size = Math.ceil(2 * outer * pixelRatio) + 2;
  const data = new Uint8Array(size * size * 4);
  const centre = size / 2;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(PLACE_COLOUR.slice(i, i + 2), 16));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - centre, y + 0.5 - centre) / pixelRatio;
      const cover = Math.max(0, Math.min(1, outer - d + 0.5));
      const fill = Math.max(0, Math.min(1, radius - d + 0.5));   // 1 inside the dot, 0 on the ring
      const i = (y * size + x) * 4;
      data[i] = Math.round(r * fill + 255 * (1 - fill));
      data[i + 1] = Math.round(g * fill + 255 * (1 - fill));
      data[i + 2] = Math.round(b * fill + 255 * (1 - fill));
      data[i + 3] = Math.round(255 * cover);
    }
  }
  return {width: size, height: size, data};
}

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

export const PICKED_RADIUS = 10;   // px: a picked place's dot

/** The places as GeoJSON points, each carrying its record's id and name;
 * the picked place's dot is larger and its name larger, as on a chart.
 * `marked`: the places a picked party was seen at (Places' Path), ringed. */
export function placesGeoJson(places: PlaceOut[], picked: string | null = null, marked: readonly string[] = []): PlaceMarks {
  return {
    type: 'FeatureCollection',
    features: places.map(p => ({type: 'Feature', geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]},
      properties: {entity_id: p.entity_id, caption: p.caption, dot: p.entity_id === picked ? dotName(PICKED_RADIUS) : PLACE_DOT,
        picked: p.entity_id === picked, sure: p.sure ?? 'not_yet', marked: marked.includes(p.entity_id)}})),
  };
}

/** West, south, east and north of the places, or null when there are none. */
export function placesBounds(places: Pick<PlaceOut, 'latitude' | 'longitude'>[]): [number, number, number, number] | null {
  if (!places.length) return null;
  const lons = places.map(p => p.longitude), lats = places.map(p => p.latitude);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

/**
 * The base map with the places on top. `everyName`: every place keeps its
 * name even where names collide, as in a chart (a picture cannot be zoomed);
 * the app's interactive map lets colliding names wait for a closer zoom.
 */
export const PATH_SOURCE = 'places-path';

/** A party's path, hop by hop: one line from place to place in date order. */
export function pathGeoJson(points: [number, number][]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {type: 'FeatureCollection', features: points.length > 1
    ? [{type: 'Feature', geometry: {type: 'LineString', coordinates: points}, properties: {}}] : []};
}

export function basemapStyle(status: BasemapStatusOut, marks: PlaceMarks,
  {everyName = false, flavor = 'grayscale'}: {everyName?: boolean; flavor?: 'grayscale' | 'dark'} = {}): StyleSpecification {
  const dark = flavor === 'dark';
  const placeLayers: LayerSpecification[] = [
    // A party's path (Places): under the dots, so every dot stays on top.
    {id: 'places-path', type: 'line', source: PATH_SOURCE,
      paint: {'line-color': dark ? '#E8B04B' : PLACE_COLOUR, 'line-width': 2.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9}},
    // A place known only to a town or wider: a soft area around its dot, so the dot does not claim a street.
    {id: 'places-area', type: 'circle', source: PLACES_SOURCE, filter: ['==', ['get', 'sure'], 'approximate'],
      paint: {'circle-radius': 26, 'circle-color': dark ? '#E8B04B' : PLACE_COLOUR, 'circle-opacity': 0.16,
        'circle-stroke-width': 1, 'circle-stroke-color': dark ? '#E8B04B' : PLACE_COLOUR, 'circle-stroke-opacity': 0.5}},
    // The places a picked party was seen at (Places' Path): a ring around each dot.
    {id: 'places-mark', type: 'circle', source: PLACES_SOURCE, filter: ['==', ['get', 'marked'], true],
      paint: {'circle-radius': 15, 'circle-opacity': 0, 'circle-stroke-width': 2.5, 'circle-stroke-color': dark ? '#E8B04B' : PLACE_COLOUR}},
    // Every dot is drawn, and the base map's labels give way to it (see dotImage).
    {id: 'places-dot', type: 'symbol', source: PLACES_SOURCE,
      layout: {'icon-image': ['get', 'dot'], 'icon-allow-overlap': true}},
    // Every place is named beside its dot (rule 12: not by colour or position alone).
    {id: 'places-name', type: 'symbol', source: PLACES_SOURCE,
      layout: {'text-field': ['get', 'caption'], 'text-font': PLACE_LABEL_FONT,
        'text-size': ['case', ['boolean', ['get', 'picked'], false], PICKED_LABEL_PX, PLACE_LABEL_PX], 'text-offset': [NAME_OFFSET_EM, 0],
        'text-anchor': 'left', 'text-max-width': NAME_MAX_EM, 'text-allow-overlap': everyName,
        // Where names collide, the picked place's and a marked place's name win; the others wait for a closer zoom
        // (and every dot is named on hover, places-map.tsx).
        'symbol-sort-key': ['case', ['boolean', ['get', 'picked'], false], 0, ['boolean', ['get', 'marked'], false], 1, 2]},
      paint: dark ? {'text-color': '#F2EEE6', 'text-halo-color': '#0B1220', 'text-halo-width': 1.5}
        : {'text-color': '#1F1B16', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5}},
  ];
  return {
    version: 8,
    glyphs: `${ROOT}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${ROOT}/sprites/${flavor}`,
    sources: {
      protomaps: {type: 'vector', tiles: [`${ROOT}/tiles/{z}/{x}/{y}.mvt`], minzoom: status.min_zoom ?? 0, maxzoom: status.max_zoom ?? 6,
        attribution: status.attribution || '© OpenStreetMap'},
      [PLACES_SOURCE]: {type: 'geojson', data: marks},
      [PATH_SOURCE]: {type: 'geojson', data: pathGeoJson([])},
    },
    layers: [...(layers('protomaps', namedFlavor(flavor), {lang: 'en'}) as LayerSpecification[]), ...placeLayers],
  };
}
