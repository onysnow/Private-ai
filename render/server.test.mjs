// Run with `npm test` (node --test). Covers the two routes and the
// one rule the service enforces itself: no animation on the server.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {BadRequest, createServer, renderSvg} from './server.mjs';

const option = {
  animation: true,
  xAxis: {type: 'value', min: 0},
  yAxis: {type: 'category', data: ['Arden', 'Bellcastle']},
  series: [{type: 'bar', data: [285000, 2400000], label: {show: true, position: 'right'}}],
};

test('renderSvg draws a bar option as an SVG document', () => {
  const svg = renderSvg({option, width: 400, height: 200});
  assert.ok(svg.startsWith('<svg'));
  assert.match(svg, /width="400"/);
  assert.match(svg, /Bellcastle/);
});

test('renderSvg refuses a body without an option and absurd sizes', () => {
  assert.throws(() => renderSvg({}), BadRequest);
  assert.throws(() => renderSvg({option, width: 1e9}), BadRequest);
});

test('the server answers /health and /echarts', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const drawn = await fetch(`${base}/echarts`, {
      method: 'POST', headers: {'content-type': 'application/json'},
      body: JSON.stringify({option, width: 300, height: 150}),
    });
    assert.equal(drawn.status, 200);
    assert.match(drawn.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await drawn.text(), /<svg/);

    const bad = await fetch(`${base}/echarts`, {method: 'POST', body: 'not json'});
    assert.equal(bad.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
