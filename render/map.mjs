// Maps for PowerPoint and Word (ADR-0005, line 18): the investigation's
// places drawn on the self-hosted base map with MapLibre Native
// (@maplibre/maplibre-gl-native, BSD-2), as the app draws them with MapLibre
// GL JS (frontend/components/places-map.tsx, frontend/lib/basemap-style.ts).
//
// Nothing here uses the network. The base map is the PMTiles file and the
// fonts and sprites the compose profile `maps` put in BASEMAP_DIR (mounted
// read-only); MapLibre Native's `request` hook answers every tile, glyph and
// sprite request from those files and refuses anything else. MapLibre Native
// needs an OpenGL context: on a server, Mesa's software renderer under an X
// virtual frame buffer (the image runs `xvfb-run`).
//
// MapLibre Native's render() takes a centre and a zoom, not bounds, so the
// view that fits the places is worked out here in Web Mercator, the
// projection both MapLibre libraries draw in.

import {open, readFile, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {PNG} from 'pngjs';
import {PMTiles} from 'pmtiles';
import {layers, namedFlavor} from '@protomaps/basemaps';

const require = createRequire(import.meta.url);

export const TILE_SIZE = 512;            // MapLibre's vector tile size, in px at zoom 0
export const PIXEL_RATIO = 2;            // drawn at twice the size, for print
export const FIT_PADDING = 60;           // px kept clear around the places
export const MAX_OVERZOOM = 2;           // zoom levels past the base map's own, where its tiles are stretched
export const ONE_PLACE_ZOOM = 8;         // the zoom for a single place (capped by the overzoom)
// The same marks as the app (frontend/lib/basemap-style.ts): a dark brick
// red, 3.3:1 against the grayscale water and 5.2:1 against its land, ringed
// in white, each place named beside it.
export const PLACE_COLOUR = '#8A2F1E';
export const PLACE_LABEL_FONT = ['Noto Sans Medium'];
export const PLACE_RADIUS = 7;           // px; a picked place's dot is drawn larger (the backend says how much)
export const PLACE_RING = 2;             // px of white around each dot
const SPRITE_FLAVOR = 'grayscale';

/**
 * A place's dot as an image: a filled circle of `radius` px in PLACE_COLOUR
 * ringed in PLACE_RING px of white, edges smoothed, drawn at `pixelRatio`.
 * RGBA, not premultiplied (what MapLibre's addImage takes).
 *
 * The dot is an image on a symbol layer rather than a circle layer because
 * symbols take part in MapLibre's label placement: the base map's own labels
 * (a city's name, say) then give way to a place's dot instead of being drawn
 * under it. Circle layers are drawn without regard to labels.
 * frontend/lib/basemap-style.ts draws the same dot for the app.
 */
export function dotImage(radius, pixelRatio) {
  const outer = radius + PLACE_RING;
  const size = Math.ceil(2 * outer * pixelRatio) + 2;
  const data = new Uint8Array(size * size * 4);
  const centre = size / 2;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(PLACE_COLOUR.slice(i, i + 2), 16));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - centre, y + 0.5 - centre) / pixelRatio;   // in px
      const cover = Math.max(0, Math.min(1, outer - d + 0.5));
      const fill = Math.max(0, Math.min(1, radius - d + 0.5));                  // 1 inside the dot, 0 on the ring
      const i = (y * size + x) * 4;
      data[i] = Math.round(r * fill + 255 * (1 - fill));
      data[i + 1] = Math.round(g * fill + 255 * (1 - fill));
      data[i + 2] = Math.round(b * fill + 255 * (1 - fill));
      data[i + 3] = Math.round(255 * cover);
    }
  }
  return {width: size, height: size, data};
}

/** The image name for a dot of `radius` px. */
export function dotName(radius) {
  return `place-dot-${radius}`;
}

export class NoBasemap extends Error {}

export function basemapDir() {
  return process.env.BASEMAP_DIR || '/basemap';
}

class FileSource {
  constructor(handle, key) { this.handle = handle; this.key = key; }
  getKey() { return this.key; }
  async getBytes(offset, length) {
    const buffer = Buffer.alloc(length);
    await this.handle.read(buffer, 0, length, offset);
    return {data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length)};
  }
}

let opened = null;   // {path, mtime, archive, header}

async function archive() {
  const path = join(basemapDir(), 'world.pmtiles');
  let info;
  try {
    info = await stat(path);
  } catch {
    throw new NoBasemap(`no base map at ${path}: run the compose profile 'maps' once to install it`);
  }
  if (opened && opened.path === path && opened.mtime === info.mtimeMs) return opened;
  const handle = await open(path, 'r');
  const tiles = new PMTiles(new FileSource(handle, path));
  opened = {path, mtime: info.mtimeMs, archive: tiles, header: await tiles.getHeader()};
  return opened;
}

// --- the view: Web Mercator ---------------------------------------------------

function mercatorX(lon) { return (lon + 180) / 360; }
function mercatorY(lat) {
  const s = Math.sin(Math.max(-85.0511287, Math.min(85.0511287, lat)) * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
function longitude(x) { return x * 360 - 180; }
function latitude(y) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI; }

/** The centre and zoom that show every place with FIT_PADDING px to spare. */
export function fitView(places, width, height, maxZoom) {
  const xs = places.map(p => mercatorX(p.longitude));
  const ys = places.map(p => mercatorY(p.latitude));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const centre = [longitude((x0 + x1) / 2), latitude((y0 + y1) / 2)];
  const limit = maxZoom + MAX_OVERZOOM;
  if (x1 - x0 === 0 && y1 - y0 === 0) return {center: centre, zoom: Math.min(ONE_PLACE_ZOOM, limit)};
  const fits = [x1 - x0 > 0 ? (width - 2 * FIT_PADDING) / ((x1 - x0) * TILE_SIZE) : Infinity,
    y1 - y0 > 0 ? (height - 2 * FIT_PADDING) / ((y1 - y0) * TILE_SIZE) : Infinity];
  const zoom = Math.log2(Math.min(...fits));
  return {center: centre, zoom: Math.max(0, Math.min(zoom, limit))};
}

// --- the style --------------------------------------------------------------------

export function mapStyle(places, maxZoom) {
  return {
    version: 8,
    glyphs: 'basemap://fonts/{fontstack}/{range}.pbf',
    sprite: `basemap://sprites/${SPRITE_FLAVOR}`,
    sources: {
      protomaps: {type: 'vector', tiles: ['basemap://tiles/{z}/{x}/{y}'], minzoom: 0, maxzoom: maxZoom},
      places: {type: 'geojson', data: {type: 'FeatureCollection', features: places.map(p => ({
        type: 'Feature', geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]},
        properties: {label: p.label, dot: dotName(p.radius ?? PLACE_RADIUS), picked: Boolean(p.picked)}}))}},
    },
    layers: [
      ...layers('protomaps', namedFlavor(SPRITE_FLAVOR), {lang: 'en'}),
      // Every dot is drawn, and the base map's labels give way to it (see dotImage).
      {id: 'places-dot', type: 'symbol', source: 'places',
        layout: {'icon-image': ['get', 'dot'], 'icon-allow-overlap': true}},
      {id: 'places-name', type: 'symbol', source: 'places',
        // A picked place's name is larger: the base map's fonts have no bold face.
        layout: {'text-field': ['get', 'label'], 'text-font': PLACE_LABEL_FONT, 'text-size': ['case', ['get', 'picked'], 15, 13], 'text-offset': [0.9, 0],
          'text-anchor': 'left', 'text-max-width': 14, 'text-allow-overlap': true},
        paint: {'text-color': '#1F1B16', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.5}},
    ],
  };
}

// --- answering MapLibre Native's requests from the files -----------------------------

const FONT = /^basemap:\/\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/;
const SPRITE = /^basemap:\/\/sprites\/([a-z]+(?:@2x)?\.(?:json|png))$/;
const TILE = /^basemap:\/\/tiles\/(\d+)\/(\d+)\/(\d+)$/;

/** The bytes for one request, or null for "none here" (MapLibre then draws without it). */
export async function answer(url) {
  let m = TILE.exec(url);
  if (m) {
    const {archive: tiles} = await archive();
    const tile = await tiles.getZxy(Number(m[1]), Number(m[2]), Number(m[3]));
    return tile ? Buffer.from(tile.data) : null;
  }
  m = FONT.exec(url);
  if (m) {
    // A stack lists fallbacks; the first this copy has answers.
    for (const name of decodeURIComponent(m[1]).split(',').map(s => s.trim())) {
      if (name.includes('/') || name.startsWith('.')) continue;
      try { return await readFile(join(basemapDir(), 'fonts', name, `${m[2]}.pbf`)); } catch { /* the next in the stack */ }
    }
    return null;
  }
  m = SPRITE.exec(url);
  if (m) {
    try { return await readFile(join(basemapDir(), 'sprites', 'v4', m[1])); } catch { return null; }
  }
  throw new Error(`refused: ${url} is not part of the base map`);
}

// --- drawing ---------------------------------------------------------------------

let queue = Promise.resolve();

/** A PNG of the places on the base map, `width` x `height` at PIXEL_RATIO. */
export async function renderMap({places, width, height}) {
  const {header} = await archive();
  const mbgl = require('@maplibre/maplibre-gl-native');
  const view = fitView(places, width, height, header.maxZoom);
  // One GL context at a time: renders wait their turn rather than compete for memory.
  const run = queue.then(() => new Promise((resolve, reject) => {
    const map = new mbgl.Map({
      ratio: PIXEL_RATIO,
      request: (req, callback) => {
        answer(req.url).then(data => callback(null, data ? {data} : {}), err => callback(err));
      },
    });
    map.load(mapStyle(places, header.maxZoom));
    for (const radius of new Set(places.map(p => p.radius ?? PLACE_RADIUS))) {
      const dot = dotImage(radius, PIXEL_RATIO);
      map.addImage(dotName(radius), Buffer.from(dot.data), {width: dot.width, height: dot.height, pixelRatio: PIXEL_RATIO});
    }
    map.render({...view, width, height}, (err, pixels) => {
      map.release();
      if (err) { reject(err); return; }
      const png = new PNG({width: width * PIXEL_RATIO, height: height * PIXEL_RATIO});
      png.data = Buffer.from(pixels);
      resolve(PNG.sync.write(png));
    });
  }));
  queue = run.catch(() => undefined);
  return run;
}
