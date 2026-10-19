// MapLibre GL JS 6 runs its tile work in a module worker,
// dist/maplibre-gl-worker.mjs, which imports ./maplibre-gl-shared.mjs from
// beside itself; there is no single-file worker build. A bundle keeps
// neither file where the worker looks, so both are copied, from the
// installed package, to public/maplibre/ (served at /maplibre/), and
// components/places-map.tsx points MapLibre there (setWorkerUrl). Run before
// every `next dev` and `next build` (package.json), so the copy always
// matches the installed version; public/maplibre/ is not committed.
import {copyFileSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve('maplibre-gl/package.json')) + '/dist';
const target = path.join(here, '..', 'public', 'maplibre');
mkdirSync(target, {recursive: true});
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(path.join(dist, name), path.join(target, name));
console.log(`MapLibre worker copied to ${path.relative(process.cwd(), target)}`);
