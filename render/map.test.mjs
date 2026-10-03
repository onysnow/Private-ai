// The map route's own parts (map.mjs, server.mjs mapRequest): the view that
// fits the places, the style, what is answered from the base map files and
// what is refused, and the checks on a request. Drawing pixels is MapLibre
// Native's; a live draw needs its GL libraries and the base map, so it is
// checked where those are (the render image; README).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {FIT_PADDING, ONE_PLACE_ZOOM, PLACE_RADIUS, PLACE_RING, TILE_SIZE, answer, dotImage, dotName, fitView, mapStyle, nameRoom} from './map.mjs';
import {BadRequest, MAX_PLACES, mapRequest} from './server.mjs';

const LONDON = {longitude: -0.1276, latitude: 51.5072, label: 'Meridian registered office'};
const KYRENIA = {longitude: 33.3199, latitude: 35.3364, label: 'Villa Kyrenia'};

const pixels = zoom => ({
  x: lon => (lon + 180) / 360 * TILE_SIZE * 2 ** zoom,
  y: lat => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom; },
});

test('the view puts every place and its name inside the picture with the padding to spare', () => {
  for (const width of [880, 384]) {
    const height = 495;
    const {center, zoom} = fitView([LONDON, KYRENIA], width, height, 6);
    const {x, y} = pixels(zoom);
    const ends = [];
    for (const place of [LONDON, KYRENIA]) {
      const left = x(place.longitude) - x(center[0]) + width / 2, dy = Math.abs(y(place.latitude) - y(center[1]));
      // The dot is FIT_PADDING inside the left edge, the end of its name FIT_PADDING inside the right.
      assert.ok(left >= FIT_PADDING - 1e-6 && left + nameRoom(place) <= width - FIT_PADDING + 1e-6, `${place.label} at ${width}px`);
      assert.ok(dy <= height / 2 - FIT_PADDING + 1e-6, place.label);
      ends.push(left + nameRoom(place));
    }
    // One side fits exactly: the zoom is as close as the picture allows (here the villa's name reaches the right padding).
    const spanY = Math.abs(y(LONDON.latitude) - y(KYRENIA.latitude));
    assert.ok(Math.abs(Math.max(...ends) - (width - FIT_PADDING)) < 1e-6 || Math.abs(spanY - (height - 2 * FIT_PADDING)) < 1e-6, `${width}px`);
  }
  // Only the name that ends furthest right sets the scale: London's long name, at the western edge, does not.
  assert.ok(fitView([LONDON, KYRENIA], 384, 495, 6).zoom > Math.log2((384 - 2 * FIT_PADDING - nameRoom(LONDON))
    / ((KYRENIA.longitude - LONDON.longitude) / 360 * TILE_SIZE)));
});

test('a name\'s room is its characters at 0.6 em, up to the 14 em it wraps at, past the 0.9 em gap from its dot', () => {
  assert.equal(nameRoom({label: 'Villa Kyrenia'}), Math.ceil((0.9 + 13 * 0.6) * 13));
  assert.equal(nameRoom({label: 'Villa Kyrenia', picked: true}), Math.ceil((0.9 + 13 * 0.6) * 15));
  assert.equal(nameRoom({label: 'x'.repeat(80)}), Math.ceil((0.9 + 14) * 13));
});

test('one place gets a city-scale view; the zoom never passes the base map by more than two levels', () => {
  const one = fitView([LONDON], 800, 450, 6);
  assert.equal(one.zoom, ONE_PLACE_ZOOM);
  // The place and its name are centred together: the dot sits half the name's room left of the centre.
  const {x} = pixels(one.zoom);
  assert.ok(Math.abs(x(one.center[0]) - x(LONDON.longitude) - nameRoom(LONDON) / 2) < 1e-6 && Math.abs(one.center[1] - LONDON.latitude) < 1e-9);
  assert.equal(fitView([LONDON], 800, 450, 4).zoom, 6);
  const near = [LONDON, {...LONDON, longitude: -0.1275, label: 'next door'}];
  assert.equal(fitView(near, 800, 450, 6).zoom, 8);
});

test('the style is the grayscale base map with every place named beside a ringed dot', () => {
  const style = mapStyle([LONDON, {...KYRENIA, radius: 10}], 6);
  const json = JSON.stringify(style);
  assert.ok(!/https?:\/\//.test(json), 'nothing is asked of another host');
  assert.equal(style.sources.protomaps.maxzoom, 6);
  const [dot, name] = style.layers.slice(-2);
  // A symbol, so the base map's labels give way to the dot.
  assert.equal(dot.type, 'symbol');
  assert.deepEqual(style.sources.places.data.features.map(f => f.properties.dot), [dotName(PLACE_RADIUS), dotName(10)]);
  assert.equal(name.layout['text-field'][1], 'label');
  assert.equal(name.layout['text-allow-overlap'], true);   // every place keeps its name in a picture
});

test('a dot is the place colour inside, white on its ring and clear outside', () => {
  const ratio = 2;
  const dot = dotImage(PLACE_RADIUS, ratio);
  assert.equal(dot.width, Math.ceil(2 * (PLACE_RADIUS + PLACE_RING) * ratio) + 2);
  const at = (x, y) => Array.from(dot.data.slice((y * dot.width + x) * 4, (y * dot.width + x) * 4 + 4));
  const c = Math.floor(dot.width / 2);
  assert.deepEqual(at(c, c), [0x8A, 0x2F, 0x1E, 255]);
  assert.deepEqual(at(c + Math.round((PLACE_RADIUS + 1) * ratio), c), [255, 255, 255, 255]);
  assert.equal(at(0, 0)[3], 0);
});

test('the base map answers from its files and refuses anything else', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'basemap-'));
  mkdirSync(join(dir, 'fonts', 'Noto Sans Medium'), {recursive: true});
  writeFileSync(join(dir, 'fonts', 'Noto Sans Medium', '0-255.pbf'), 'glyphs');
  mkdirSync(join(dir, 'sprites', 'v4'), {recursive: true});
  writeFileSync(join(dir, 'sprites', 'v4', 'grayscale@2x.json'), '{}');
  writeFileSync(join(dir, '..', 'secret.pbf'), 'not a font');
  process.env.BASEMAP_DIR = dir;
  assert.equal((await answer('basemap://fonts/Arial%20Unicode%20MS,Noto%20Sans%20Medium/0-255.pbf')).toString(), 'glyphs');
  assert.equal(await answer('basemap://fonts/Noto%20Sans%20Medium/256-511.pbf'), null);
  assert.equal(await answer('basemap://fonts/..%2F..%2Fsecret/0-255.pbf'), null);
  assert.equal((await answer('basemap://sprites/grayscale@2x.json')).toString(), '{}');
  await assert.rejects(answer('https://tiles.example.com/1/2/3.pbf'), /refused/);
  await assert.rejects(answer('basemap://tiles/0/0/0'), /no base map/);
});

test('a map request needs places with coordinates on the globe and a label', () => {
  assert.deepEqual(mapRequest({places: [LONDON]}), {places: [LONDON], width: 960, height: 540});
  assert.throws(() => mapRequest({places: []}), BadRequest);
  assert.throws(() => mapRequest({places: Array.from({length: MAX_PLACES + 1}, () => LONDON)}), BadRequest);
  assert.throws(() => mapRequest({places: [{...LONDON, latitude: 91}]}), /latitude/);
  assert.throws(() => mapRequest({places: [{...LONDON, label: 7}]}), /label/);
  assert.deepEqual(mapRequest({places: [{...LONDON, radius: 10, picked: true}]}).places, [{...LONDON, radius: 10, picked: true}]);
  assert.throws(() => mapRequest({places: [{...LONDON, radius: 99}]}), /radius/);
  assert.throws(() => mapRequest({places: [LONDON], width: 1e9}), BadRequest);
});
