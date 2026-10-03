// The app's tree-shaken ECharts (lib/echarts-setup.ts) draws every chart kind
// the backend builds (visuals passes 3 and 4). Each option is the backend's own,
// kept in test-support/chart-kinds.json (backend/tests/test_visuals_kinds.py
// fails if the drawing drifts from that file). ECharts skips a series whose
// chart type was never registered and draws the rest without a word (checked
// by leaving PieChart out: the donut came back without its slices), so each
// test reads the drawn SVG for text only that kind's series writes. The
// drawing is ECharts' server-side SVG (its handbook's cross-platform/server
// page): jsdom has no canvas, and SVG text can be read.
import {afterEach, describe, expect, it} from 'vitest';
import {SVGRenderer} from 'echarts/renderers';
import type {ECharts, EChartsCoreOption} from 'echarts/core';

import {echarts} from '../lib/echarts-setup';
import kinds from '../test-support/chart-kinds.json';

echarts.use([SVGRenderer]);

type Fixture = {option: EChartsCoreOption, width: number, height: number, text: {alt_text: string}};
const fixtures = kinds as unknown as Record<string, Fixture>;

let chart: ECharts | null = null;
afterEach(() => { chart?.dispose(); chart = null; });

function draw(fixture: Fixture): string {
  chart = echarts.init(null, null, {renderer: 'svg', ssr: true, width: fixture.width, height: fixture.height});
  chart.setOption(fixture.option);
  return chart.renderToSVGString();
}

describe('every chart kind draws with the app\'s registered ECharts parts', () => {
  it('has a fixture for each drawn kind', () => {
    expect(Object.keys(fixtures).sort()).toEqual(['area', 'bar', 'column', 'donut', 'histogram', 'line', 'map', 'sankey', 'scatter', 'stacked_bar_100',
      'timeline', 'treemap']);
  });

  // A map's places are MapLibre's (components/presentation/chart-map.tsx); ECharts draws its frame.
  it.each(Object.keys(kinds).filter(kind => kind !== 'map'))('draws a %s with its title, its labels and its source line', kind => {
    const svg = draw(fixtures[kind]);
    expect(svg.startsWith('<svg')).toBe(true);
    const text = svg.replace(/&#36;/g, '$').replace(/&#39;/g, "'");
    const title = (fixtures[kind].option as {title: {text: string}[]}).title;
    expect(text).toContain(title[0].text);
    expect(text).toContain('Source: ');
    // A part, a point or a bin is named on the chart, not only in a key.
    const named = {line: '$52K', area: '$52K', column: '$52K', histogram: '$500K', scatter: 'Meridian Holdings Ltd',
      sankey: 'Bellcastle Trading Group', timeline: 'Alaric Voss appointed director'}[kind] ?? 'Alaric Voss';
    expect(text).toContain(named);
  });

  it('draws a map\'s frame -- its title, unit and source line -- and leaves the places to MapLibre', () => {
    const {map, ...frame} = fixtures.map.option as Record<string, unknown> & {map: {places: {name: string}[]; top: number; bottom: number}};
    const text = draw({...fixtures.map, option: frame}).replace(/&#39;/g, "'");
    expect(text).toContain('The money ended up in a villa in Cyprus');
    expect(text).toContain('Each place where its record puts it');
    expect(text).toContain('Map data © OpenStreetMap contributors');
    expect(map.places.map(p => p.name)).toEqual(['Meridian registered office', 'Villa Kyrenia']);
    expect([map.top, map.bottom]).toEqual([84, 44]);
  });

  it('writes each event\'s date and status beside it on a timeline', () => {
    const text = draw(fixtures.timeline);
    expect(text).toContain('11 Jun 2019 · verified');
    expect(text).toContain('1 Mar 2022 – 31 Aug 2023 · asserted');
  });

  it('writes a flow\'s amount on its band', () => {
    expect(draw(fixtures.sankey).replace(/&#36;/g, '$')).toContain('$2.4M · 2 payments');
  });

  it('writes the donut\'s total in its centre and keeps the 100% bar to one bar', () => {
    expect(draw(fixtures.donut).replace(/&#36;/g, '$')).toContain('$2.7M');
    const whole = fixtures.stacked_bar_100.option as {series: {stack: string}[]};
    expect(new Set(whole.series.map(s => s.stack))).toEqual(new Set(['whole']));
  });
});
