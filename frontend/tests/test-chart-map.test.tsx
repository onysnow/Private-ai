// @vitest-environment jsdom
// A map chart (components/presentation/chart-map.tsx; backend
// app/visuals/echarts.py _map) in the preview and on a slide: ECharts draws
// the checked option's frame, MapLibre the places in the area the option
// gives them, and a slide too small for the map lists the places as the
// export's table does. ECharts and MapLibre are replaced by fakes that keep
// what they are handed (jsdom has neither canvas nor WebGL).
import {cleanup, render, screen, within} from '@testing-library/react';
import {Suspense, lazy} from 'react';
import type {ComponentType} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {charts, maps} = vi.hoisted(() => ({charts: [] as Record<string, unknown>[], maps: [] as {options: Record<string, unknown>; removed: boolean}[]}));
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Record<string, unknown>) => { charts.push(props); return <canvas data-testid="echarts-canvas"/>; },
}));
vi.mock('maplibre-gl', () => {
  class FakeMap {
    removed = false;
    constructor(public options: Record<string, unknown>) { maps.push(this); }
    setMissingStyleImageResolver() { return this; }
    remove() { this.removed = true; }
  }
  return {Map: FakeMap, NavigationControl: class {}, addProtocol: () => undefined, setWorkerUrl: () => undefined};
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(() => loader().then(component => ({default: component})));
    return (props: Record<string, unknown>) => <Suspense fallback={null}><Lazy {...props}/></Suspense>;
  },
}));

import {ChartFigure} from '../components/presentation/chart-visual';
import {chartMarks, mapOf} from '../components/presentation/chart-map';
import {asChart} from '../components/presentation/chart-data';
import {SlideCanvas, SlideStyleProvider, DEFAULT_THEME, buildCitationLookup} from '../components/presentation/slide-canvas';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {ChartVisual, DeckSlide, JsonObject} from '../lib/api-types';
import {dotName} from '../lib/basemap-style';
import {QueryProvider} from '../lib/query-client';
import kinds from '../test-support/chart-kinds.json';
import {mockApi} from '../test-support/mock-api';
import {basemapStatusBody} from '../test-support/page-routes';

const fixture = (kinds as unknown as Record<string, JsonObject>).map;
const stored: JsonObject = {type: 'chart', spec: fixture.spec, data: fixture.data, report: {ok: true, errors: [], warnings: []}, text: fixture.text,
  option: fixture.option, width: fixture.width, height: fixture.height};
const visual = asChart(stored) as ChartVisual;

beforeEach(() => { charts.length = 0; maps.length = 0; connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('a map chart', () => {
  it('reads its places as the base map style\'s marks, a picked place with a larger dot', () => {
    const map = mapOf(fixture.option);
    expect(map?.top).toBe(84);
    expect(mapOf({series: []})).toBeNull();
    const marks = chartMarks([...map!.places, {name: 'Picked', longitude: 1, latitude: 2, radius: 10, label: {text: 'Picked', fontWeight: 'bold'}}]);
    expect(marks.features.map(f => f.properties)).toEqual([
      {caption: 'Meridian registered office', dot: dotName(7), picked: false},
      {caption: 'Villa Kyrenia', dot: dotName(7), picked: false},
      {caption: 'Picked', dot: dotName(10), picked: true},
    ]);
  });

  it('draws its frame with ECharts and its places with MapLibre between the title and the source line', async () => {
    mockApi({'GET /api/basemap': basemapStatusBody(true)});
    render(<QueryProvider><ChartFigure visual={visual}/></QueryProvider>);
    const area = await screen.findByTestId('chart-map-area');
    expect(area.parentElement).toHaveStyle({top: '84px', bottom: '44px'});
    // The frame is the checked option without its places, drawn as every other kind is.
    const frame = charts[0].option as Record<string, unknown>;
    expect(frame.map).toBeUndefined();
    expect(frame.title).toEqual((fixture.option as JsonObject).title);
    expect(maps).toHaveLength(1);
    const options = maps[0].options as {interactive: boolean; bounds: number[]; style: {layers: {id: string; layout?: Record<string, unknown>}[]}};
    expect(options.interactive).toBe(false);               // a picture: it neither pans nor zooms
    expect(options.bounds).toEqual([-0.1276, 35.3364, 33.3199, 51.5072]);
    expect(options.style.layers.at(-1)?.layout?.['text-allow-overlap']).toBe(true);   // every place keeps its name
  });

  it('says so in the map\'s place when no base map is installed, and the data table still lists the places', async () => {
    mockApi({'GET /api/basemap': basemapStatusBody(false)});
    render(<QueryProvider><ChartFigure visual={visual}/></QueryProvider>);
    expect(await screen.findByTestId('chart-map-no-basemap')).toHaveTextContent('compose profile maps');
    expect(maps).toHaveLength(0);
    const rows = within(screen.getByRole('table')).getAllByRole('row').map(r => r.textContent);
    expect(rows).toContain('Villa Kyrenia35.3364° N, 33.3199° E1');   // one record by what it is: no single-record mark
  });

  it('lists its places on a slide too small to draw them, as the export does', async () => {
    const drawn = asChart({...stored, slide_drawing: {option: null, width: 400, height: 140,
      note: 'Map not drawn at this size (rule 12). The places are listed instead.'}}) as ChartVisual;
    const slides: DeckSlide[] = [{kind: 'content', heading: 'Where it went', bullets: [], evidence: [], visual: drawn}];
    render(<SlideStyleProvider theme={DEFAULT_THEME}><SlideCanvas slide={slides[0]} page={1} contentIndex={1} contentTotal={1} deckTitle="Money"
      lookup={buildCitationLookup(slides)} sourceCount={2}/></SlideStyleProvider>);
    const chart = await screen.findByTestId('slide-chart');
    expect(chart.dataset.drawing).toBe('places');
    const rows = within(chart).getAllByRole('row').map(r => r.textContent);
    expect(rows).toEqual(['PlaceWhere', 'Meridian registered office51.5072° N, 0.1276° W', 'Villa Kyrenia35.3364° N, 33.3199° E']);
  });
});
