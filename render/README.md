# Render service

A small Node 22 service that draws an ECharts option as an SVG image with no
browser. It exists so the Workbench can put charts into PowerPoint and Word
files (ADR-0005, line 2): the Python backend builds the chart option
(`backend/app/visuals/echarts.py`), posts it here, gets SVG back, and turns
that into PNG with `vl-convert-python` (`backend/app/visuals/render_client.py`).

It reads no database and makes no network calls. Its only input is the
option in the request body.

## Routes

| Method and path | Body | Reply |
|---|---|---|
| `GET /health` | — | `{"ok": true, "echarts": "6.1.0", "node": "v22…"}` |
| `POST /echarts` | `{"option": {…}, "width": 960, "height": 540}` | `image/svg+xml` |

`width` and `height` are pixels, whole numbers from 1 to 4000, and default to
960 × 540. A body that is not JSON, has no `option`, or asks for an absurd
size gets a 400 with a plain message. An option ECharts itself cannot draw
gets a 422. The service always sets `animation: false` before drawing: a
server has no frames to animate, and an animated option would otherwise come
back as its empty first frame.

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

The backend's default `RENDER_SERVICE_URL` is `http://127.0.0.1:8070`, so a
locally started service is found without any configuration.

When the service is not running, exports keep today's behaviour: a native,
editable PowerPoint chart in decks, and a table in Word write-ups with a line
saying the chart image was not available (ADR-0005, line 2).

## Pinning

`package.json` pins `echarts` to the exact version the workbench screen uses
(`frontend/package.json`, major 6), so a chart looks the same in the app and
in an export. Upgrade both together.
