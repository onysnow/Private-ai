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
import {besideOf, chartMarks, mapOf} from '../components/presentation/chart-map';
import {asChart} from '../components/presentation/chart-data';
import {SlideCanvas, SlideStyleProvider, DEFAULT_THEME, buildCitationLookup} from '../components/presentation/slide-canvas';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import type {ChartVisual, DeckSlide, JsonObject} from '../lib/api-types';
import {dotName, nameRoom, placesView} from '../lib/basemap-style';
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

describe('a map chart\'s view', () => {
  // render/map.mjs fitView's answers for the same places (node, 2026-10-03): the app shows what the export draws.
  const london = {longitude: -0.1276, latitude: 51.5072, name: 'Meridian registered office', picked: false};
  const kyrenia = {longitude: 33.3199, latitude: 35.3364, name: 'Villa Kyrenia', picked: true};
  it.each([
    [[london, kyrenia], 384, 412, 6, [33.06841503759398, 43.96869460950151], 1.483309054847764],
    [[london], 384, 412, 6, [0.13881845703124895, 51.5072], 8],
    [[london, kyrenia], 960, 412, 15, [21.637450003430217, 43.96869460950151], 3.191480287423323],
  ])('is the render service\'s view (%#)', (places, width, height, maxZoom, center, zoom) => {
    const view = placesView(places, width, height, maxZoom);
    expect(view.zoom).toBeCloseTo(zoom, 9);
    expect(view.center[0]).toBeCloseTo(center[0], 9);
    expect(view.center[1]).toBeCloseTo(center[1], 9);
  });

  it('measures a name at 0.6 em a character up to the 14 em it wraps at, past the 0.9 em gap from its dot', () => {
    expect(nameRoom('Villa Kyrenia', false)).toBe(Math.ceil((0.9 + 13 * 0.6) * 13));
    expect(nameRoom('x'.repeat(80), true)).toBe(Math.ceil((0.9 + 14) * 15));
  });
});

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
    const options = maps[0].options as {interactive: boolean; style: {layers: {id: string; layout?: Record<string, unknown>}[]}};
    expect(options.interactive).toBe(false);               // a picture: it neither pans nor zooms
    // The view the render service picks for the export (render/map.mjs fitView): every dot and name inside.
    const view = maps[0].options as unknown as {center: [number, number]; zoom: number};
    expect(view).toMatchObject(placesView([
      {longitude: -0.1276, latitude: 51.5072, name: 'Meridian registered office', picked: false},
      {longitude: 33.3199, latitude: 35.3364, name: 'Villa Kyrenia', picked: false}], 960, 540 - 84 - 44, 6));
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

// The "Map with its timeline" preset (backend app/visuals/echarts.py,
// _beside_timeline): the option carries the timeline as `beside`, and the
// data table the events with their places.
const beside = (kinds as unknown as Record<string, JsonObject>).timeline.option as JsonObject;
const events = {columns: ['Event', 'Place', 'When', 'Status', 'Records'], rows: [
  {label: 'Villa searched', place: 'Villa Kyrenia', formatted: '14 Nov 2023', start: '2023-11-14', status: 'asserted', record_count: 1,
    record_refs: [{record_type: 'timeline_event', record_id: 'e1'}]}]};
const paired = asChart({...stored, option: {...(fixture.option as JsonObject), beside},
  text: {...(fixture.text as JsonObject), data_table: {...((fixture.text as JsonObject).data_table as JsonObject), events}}}) as ChartVisual;

describe('a map with its timeline', () => {
  it('draws the map on the left and the timeline on the right, in the shares the export gives them', async () => {
    expect(besideOf(paired.option)).toBe(beside);
    expect(besideOf(fixture.option)).toBeNull();
    mockApi({'GET /api/basemap': basemapStatusBody(true)});
    render(<QueryProvider><ChartFigure visual={paired}/></QueryProvider>);
    const pair = await screen.findByTestId('chart-map-with-timeline');
    await screen.findByTestId('chart-map-area');
    const [left, right] = Array.from(pair.children) as HTMLElement[];
    expect(left).toHaveStyle({width: '384px'});
    expect(right).toHaveStyle({width: '576px'});
    // The map's frame without the timeline, and the timeline as the backend drew it.
    expect((charts[0].option as Record<string, unknown>).beside).toBeUndefined();
    expect(charts.some(chart => chart.option === beside)).toBe(true);
  });

  it('lists the events with their places after the places', () => {
    mockApi({'GET /api/basemap': basemapStatusBody(false)});
    render(<QueryProvider><ChartFigure visual={paired}/></QueryProvider>);
    const rows = within(screen.getByTestId('chart-visual-events')).getAllByRole('row').map(r => r.textContent);
    expect(rows).toEqual(['EventPlaceWhenStatusRecords', 'Villa searchedVilla Kyrenia14 Nov 2023asserted1']);
  });

  it('lists the places and the events at them side by side on a slide too small for the pictures', async () => {
    const drawn = asChart({...(paired as unknown as JsonObject), slide_drawing: {option: null, width: 400, height: 140,
      note: 'Map not drawn at this size (rule 12). The places and the events at them are listed instead.'}}) as ChartVisual;
    const slides: DeckSlide[] = [{kind: 'content', heading: 'Where and when', bullets: [], evidence: [], visual: drawn}];
    render(<SlideStyleProvider theme={DEFAULT_THEME}><SlideCanvas slide={slides[0]} page={1} contentIndex={1} contentTotal={1} deckTitle="Money"
      lookup={buildCitationLookup(slides)} sourceCount={2}/></SlideStyleProvider>);
    const table = await screen.findByTestId('slide-chart-events');
    expect(within(table).getAllByRole('row').map(r => r.textContent)).toEqual(['EventPlaceWhen', 'Villa searchedVilla Kyrenia14 Nov 2023']);
  });
});
