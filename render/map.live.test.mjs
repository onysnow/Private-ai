// A live map draw (map.mjs renderMap): MapLibre Native draws the places on
// the installed base map. It needs what the render image has -- MapLibre
// Native's GL libraries, an X display (xvfb-run) and a base map in
// BASEMAP_DIR -- so it is skipped wherever one of those is missing (a plain
// `npm test` on a developer machine or in render-ci). Run it as the image
// runs the service:
//   BASEMAP_DIR=/path/to/basemap xvfb-run -a node --test map.live.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {PNG} from 'pngjs';

import {PIXEL_RATIO, basemapDir, renderMap} from './map.mjs';

function missing() {
  if (!process.env.DISPLAY) return 'no X display (run under xvfb-run)';
  if (!existsSync(join(basemapDir(), 'world.pmtiles'))) return `no base map in ${basemapDir()}`;
  try {
    createRequire(import.meta.url)('@maplibre/maplibre-gl-native');
  } catch (err) {
    return `MapLibre Native does not load here: ${err.message.split('\n')[0]}`;
  }
  return null;
}

const skip = missing();

test('MapLibre Native draws the places in the place colour on the base map', {skip: skip ?? false}, async () => {
  const width = 480, height = 270;
  const places = [
    {longitude: -0.1276, latitude: 51.5072, label: 'Meridian registered office'},
    {longitude: 33.3199, latitude: 35.3364, label: 'Villa Kyrenia', radius: 10, picked: true},
  ];
  const png = PNG.sync.read(await renderMap({places, width, height}));
  assert.equal(png.width, width * PIXEL_RATIO);
  assert.equal(png.height, height * PIXEL_RATIO);
  // Every place has its dot: pixels of the place colour (#8A2F1E) near where
  // the view puts each one, and the base map (grays) around them.
  let red = 0, gray = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (Math.abs(r - 0x8a) < 12 && Math.abs(g - 0x2f) < 12 && Math.abs(b - 0x1e) < 12) red++;
    else if (Math.abs(r - g) < 6 && Math.abs(g - b) < 6) gray++;
  }
  const area = (radius) => Math.PI * (radius * PIXEL_RATIO) ** 2;
  assert.ok(red > 0.6 * (area(7) + area(10)), `place-coloured pixels: ${red}`);
  assert.ok(gray > 0.5 * png.width * png.height, `base map pixels: ${gray}`);
});
