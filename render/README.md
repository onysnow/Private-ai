# Render service

A small Node 22 service that draws, with no browser, the pictures the
Workbench puts into PowerPoint and Word files:

- charts: an ECharts option as an SVG image (ADR-0005, line 2). The Python
  backend builds the option (`backend/app/visuals/echarts.py`), posts it
  here, gets SVG back, and turns that into PNG with `vl-convert-python`
  (`backend/app/visuals/render_client.py`);
- maps: places on the self-hosted base map as a PNG, drawn with MapLibre
  Native (`map.mjs`; ADR-0005, line 18), as the app draws them with MapLibre
  GL JS.

It reads no database and makes no network calls. Its inputs are the request
body and, for maps, the base map files the compose profile `maps` installs
(mounted read-only at `BASEMAP_DIR`, `/basemap`); MapLibre Native's every
tile, glyph and sprite request is answered from those files, and anything
else is refused.

## Routes

| Method and path | Body | Reply |
|---|---|---|
| `GET /health` | — | `{"ok": true, "echarts": "6.1.0", "node": "v22…"}` |
| `POST /echarts` | `{"option": {…}, "width": 960, "height": 540}` | `image/svg+xml` |
| `POST /map` | `{"places": [{"longitude": -0.13, "latitude": 51.51, "label": "…", "radius": 10, "picked": true}], "width": 960, "height": 540}` | `image/png`, at twice the size |

`width` and `height` are pixels, whole numbers from 1 to 4000, and default to
960 × 540. A body that is not JSON, has no `option`, or asks for an absurd
size gets a 400 with a plain message. An option ECharts itself cannot draw
gets a 422. The service always sets `animation: false` before drawing: a
server has no frames to animate, and an animated option would otherwise come
back as its empty first frame.

`/map` answers 400 for places off the globe or without a label (at most 500
places), 503 when no base map is installed, and 500 when MapLibre Native
cannot draw. The view fits every place with 60 px to spare, worked out in
Web Mercator (MapLibre Native takes a centre and a zoom, not bounds), and
never zooms more than two levels past the base map's own. Each place is a
dot of `radius` px (7 unless given; the backend draws a picked place at 10
and sets `picked`, which sets its name larger) named beside it. The dot is
an image on a symbol layer, not a circle layer, so the base map's own labels
give way to it instead of being drawn underneath (symbols take part in
MapLibre's label placement; circles do not); the app draws the same dot.

MapLibre Native's Linux build (6.4.1) is made for Ubuntu 24.04 (glibc 2.38,
ICU 74), so the image runs on Ubuntu 24.04 with Node copied in, and draws
through Mesa's software OpenGL under `xvfb-run`. `xvfb-run` does not start
its program as PID 1, so compose runs the service with `init: true`. Checked
in that image on 2026-10-03: a two-place map at 880 x 495 in 1.3 s.

## Running it

In the Docker stack it is the `render` service in `docker-compose.yml` and
`docker-compose.prod.yml`; the backend reaches it at `http://render:8070`
(`RENDER_SERVICE_URL`). Outside Docker:

```
cd render
npm ci
npm start            # listens on 0.0.0.0:8070; PORT and HOST override
npm test             # node --test
```

`npm test` skips the live map draw (`map.live.test.mjs`) unless MapLibre
Native loads, an X display is up and a base map is installed; run it as the
image runs the service:
`BASEMAP_DIR=/path/to/basemap xvfb-run -a node --test map.live.test.mjs`.

Maps outside Docker need MapLibre Native's libraries (on Ubuntu 24.04:
`libopengl0 libglx0 libgl1-mesa-dri libcurl4t64 libuv1t64 libjpeg-turbo8
libpng16-16t64 libwebp7 libicu74 xvfb`), an X display (`xvfb-run -a npm
start`) and `BASEMAP_DIR` pointing at an installed base map; charts need
none of that.

The backend's default `RENDER_SERVICE_URL` is `http://127.0.0.1:8070`, so a
locally started service is found without any configuration.

When the service is not running, exports keep today's behaviour: a native,
editable PowerPoint chart in decks, and a table in Word write-ups with a line
saying the chart image was not available (ADR-0005, line 2).

## Pinning

`package.json` pins `echarts` to the exact version the workbench screen uses
(`frontend/package.json`, major 6), so a chart looks the same in the app and
in an export. Upgrade both together. Likewise `@protomaps/basemaps` (the
base map's style) matches `frontend/package.json`, and the place marks in
`map.mjs` match `frontend/lib/basemap-style.ts`.
