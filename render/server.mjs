// The render service: draws an ECharts option as SVG with no browser
// (ADR-0005, line 2). The Python backend posts the option it built
// (backend/app/visuals/echarts.py) and gets an SVG back; vl-convert on the
// Python side turns that into the PNG that PowerPoint and Word accept.
//
// Plain node:http on purpose: two routes need no framework, and a smaller
// dependency list is easier to audit for a service that runs beside the
// reporters' data. Nothing here reads the database or the network; the
// only input is the option in the request body.
//
// ECharts server-side rendering, as its handbook documents it
// (https://echarts.apache.org/handbook/en/how-to/cross-platform/server/):
// init with no DOM, renderer 'svg', ssr true, a fixed width and height;
// setOption; renderToSVGString(); then dispose(). The dispose matters: an
// SSR chart that is never disposed keeps a timer alive and the process
// never exits (verified while building this).

import http from 'node:http';
import * as echarts from 'echarts';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ECHARTS_VERSION = JSON.parse(readFileSync(join(HERE, 'node_modules', 'echarts', 'package.json'), 'utf8')).version;

export const DEFAULT_WIDTH = 960;
export const DEFAULT_HEIGHT = 540;
export const MAX_SIDE = 4000;      // an export never needs more; a stray 1e9 must not allocate
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export class BadRequest extends Error {}

function dimension(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SIDE) {
    throw new BadRequest(`width and height must be whole numbers between 1 and ${MAX_SIDE}`);
  }
  return n;
}

// Draw one option as an SVG document string. Exported so the tests can call
// it without a socket.
export function renderSvg(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequest('the request body must be a JSON object with an "option"');
  }
  const option = body.option;
  if (!option || typeof option !== 'object' || Array.isArray(option)) {
    throw new BadRequest('"option" must be an ECharts option object');
  }
  const width = dimension(body.width, DEFAULT_WIDTH);
  const height = dimension(body.height, DEFAULT_HEIGHT);
  // A server has no frames to animate: with animation left on, the SVG is the
  // first frame of the animation (empty bars). The backend turns it off too;
  // this keeps a hand-written option honest.
  const settled = {...option, animation: false};
  const chart = echarts.init(null, null, {renderer: 'svg', ssr: true, width, height});
  try {
    chart.setOption(settled);
    return chart.renderToSVGString();
  } finally {
    chart.dispose();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BadRequest(`request body over ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(payload));
}

export async function handle(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {ok: true, echarts: ECHARTS_VERSION, node: process.version});
    return;
  }
  if (req.method === 'POST' && req.url === '/echarts') {
    try {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch (err) {
        throw new BadRequest(`request body is not JSON: ${err.message}`);
      }
      const svg = renderSvg(body);
      res.writeHead(200, {'content-type': 'image/svg+xml; charset=utf-8', 'x-echarts-version': ECHARTS_VERSION});
      res.end(svg);
    } catch (err) {
      if (err instanceof BadRequest) {
        sendJson(res, 400, {error: err.message});
      } else {
        // An option ECharts itself cannot draw (a series type that does not
        // exist, for example) is still the caller's problem, not an outage.
        sendJson(res, 422, {error: `ECharts could not draw this option: ${err.message}`});
      }
    }
    return;
  }
  sendJson(res, 404, {error: 'not found: GET /health or POST /echarts'});
}

export function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => sendJson(res, 500, {error: err.message}));
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const port = Number(process.env.PORT || 8070);
  const host = process.env.HOST || '0.0.0.0';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`render service listening on http://${host}:${port} (echarts ${ECHARTS_VERSION})`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
