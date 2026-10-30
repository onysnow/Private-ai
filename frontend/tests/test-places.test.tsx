// @vitest-environment jsdom
// Places (features/places/places-panel.tsx, components/places-map.tsx,
// lib/basemap-style.ts; backend app/services/places.py and basemap.py).
// MapLibre needs WebGL, which jsdom does not have, so it is replaced by a
// fake that keeps what the component hands it: the style, the view, the
// event handlers and the protocol. Drawing pixels is MapLibre's.
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Suspense, lazy} from 'react';
import type {ComponentType, ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PlacesMap} from '../components/places-map';
import {PlacesPanel, coordinates} from '../features/places/places-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {BASEMAP_PROTOCOL, PLACE_DOT, PLACE_RADIUS, PLACE_RING, basemapLoader, basemapStyle, dotImage, dotName, placesBounds, placesGeoJson} from '../lib/basemap-style';
import type {PlaceOut} from '../lib/generated/types.gen';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {basemapStatusBody, placesBody} from '../test-support/page-routes';
import {placeEventWhen} from '../features/places/places-timeline';

type Handler = (event: {features?: {properties: Record<string, unknown>; geometry?: {type: string; coordinates: number[]}}[]}) => void;
const {maps, protocols, popups} = vi.hoisted(() => ({maps: [] as FakeMapInstance[], protocols: [] as string[], popups: [] as {text: string; at: unknown; shown: boolean}[]}));
type FakeMapInstance = {options: {style: {sources: Record<string, unknown>; layers: {id: string}[]}; bounds?: number[]; center?: number[]};
  handlers: Record<string, Handler>; removed: boolean; data: unknown[]; fitted: {points: number[][]}[]; images: Record<string, {image: {width: number}; options: unknown}>; resolver: (id: string) => void};

vi.mock('maplibre-gl', () => {
  class FakeMap {
    handlers: Record<string, Handler> = {};
    removed = false;
    data: unknown[] = [];
    images: Record<string, {image: {width: number}; options: unknown}> = {};
    constructor(public options: unknown) { maps.push(this as unknown as FakeMapInstance); }
    addControl() { return this; }
    on(event: string, layer: string, handler: Handler) { this.handlers[`${event}:${layer}`] = handler; return this; }
    resolver: ((id: string) => void) | null = null;
    setMissingStyleImageResolver(resolver: (id: string) => void) { this.resolver = resolver; return this; }
    hasImage(id: string) { return id in this.images; }
    addImage(id: string, image: {width: number}, options: unknown) { this.images[id] = {image, options}; }
    getCanvas() { return {style: {cursor: ''}}; }
    getSource() { return {setData: (d: unknown) => this.data.push(d)}; }
    fitted: unknown[] = [];
    fitBounds(bounds: unknown) { this.fitted.push(bounds); return this; }
    remove() { this.removed = true; }
  }
  class FakePopup {
    text = ''; at: unknown = null; shown = false;
    constructor() { popups.push(this); }
    setLngLat(at: unknown) { this.at = at; return this; }
    setText(text: string) { this.text = text; return this; }
    addTo() { this.shown = true; return this; }
    remove() { this.shown = false; return this; }
  }
  class FakeBounds { points: number[][] = []; extend(p: number[]) { this.points.push(p); return this; } }
  return {Map: FakeMap, NavigationControl: class {}, Popup: FakePopup, LngLatBounds: FakeBounds, addProtocol: (name: string) => protocols.push(name), setWorkerUrl: () => undefined};
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
// next/dynamic resolves the import as React.lazy would, so the tests see the real components once loaded.
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<Record<string, unknown>>>) => {
    const Lazy = lazy(() => loader().then(component => ({default: component})));
    return (props: Record<string, unknown>) => <Suspense fallback={null}><Lazy {...props}/></Suspense>;
  },
}));

const place = (id: string, caption: string, latitude: number, longitude: number, extra: Partial<PlaceOut> = {}): PlaceOut => ({
  entity_id: id, caption, schema: 'RealEstate', latitude, longitude, address: null, country: null, links: [], ...extra});
const VILLA = place('villa', 'Villa Kyrenia', 35.3364, 33.3199, {country: 'cy', links: [
  {relationship_id: 'r1', schema: 'Ownership', direction: 'incoming', entity_id: 'voss', caption: 'Alaric Voss', entity_schema: 'Person'}]});
const OFFICE = place('office', 'Meridian registered office', 51.5072, -0.1276, {schema: 'Address', address: '1 Example Street, London'});
const STATUS = basemapStatusBody(true);

beforeEach(() => { maps.length = 0; popups.length = 0; connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', dossier: null}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('placeEventWhen', () => {
  it('says a date at the precision it was recorded, never inventing a day', () => {
    expect(placeEventWhen({date_start: '2009', date_end: '2013'})).toBe('2009 – 2013');
    expect(placeEventWhen({date_start: '2014-05', date_end: null})).toBe('May 2014');
    expect(placeEventWhen({date_start: '2014-05-03', date_end: '2014-05-03'})).toBe('3 May 2014');
  });
});

describe('the base map style', () => {
  it('asks only this app for tiles, fonts and sprites, in the grayscale flavor, with every place named', () => {
    const style = basemapStyle(STATUS, placesGeoJson([VILLA]));
    expect(style.glyphs).toBe(`${BASEMAP_PROTOCOL}://api/basemap/fonts/{fontstack}/{range}.pbf`);
    expect(style.sprite).toBe(`${BASEMAP_PROTOCOL}://api/basemap/sprites/grayscale`);
    expect(style.sources.protomaps).toMatchObject({type: 'vector', tiles: [`${BASEMAP_PROTOCOL}://api/basemap/tiles/{z}/{x}/{y}.mvt`], maxzoom: 6,
      attribution: '© OpenStreetMap'});
    const json = JSON.stringify(style);
    expect(json).not.toMatch(/https?:\/\//);          // no other host is asked for anything
    const names = style.layers.map(l => l.id);
    expect(names.slice(-2)).toEqual(['places-dot', 'places-name']);
    // The dot is a symbol, so the base map's labels give way to it.
    expect(style.layers.at(-2)).toMatchObject({type: 'symbol', layout: {'icon-image': ['get', 'dot']}});
    expect(style.layers.at(-1)).toMatchObject({layout: {'text-allow-overlap': false}});   // names wait for a closer zoom here
    expect(basemapStyle(STATUS, placesGeoJson([VILLA]), {everyName: true}).layers.at(-1)).toMatchObject({layout: {'text-allow-overlap': true}});
    expect(placesBounds([VILLA, OFFICE])).toEqual([-0.1276, 35.3364, 33.3199, 51.5072]);
    expect(placesBounds([])).toBeNull();
    expect(coordinates(OFFICE)).toBe('51.5072° N, 0.1276° W');
  });

  it('draws a dot in the place colour, ringed in white, clear outside', () => {
    const dot = dotImage(PLACE_RADIUS, 2);
    expect(dot.width).toBe(Math.ceil(2 * (PLACE_RADIUS + PLACE_RING) * 2) + 2);
    const at = (x: number, y: number) => Array.from(dot.data.slice((y * dot.width + x) * 4, (y * dot.width + x) * 4 + 4));
    const c = Math.floor(dot.width / 2);
    expect(at(c, c)).toEqual([0x8a, 0x2f, 0x1e, 255]);
    expect(at(c + (PLACE_RADIUS + 1) * 2, c)).toEqual([255, 255, 255, 255]);
    expect(at(0, 0)[3]).toBe(0);
  });

  it('fetches a map request through the app\'s API client', async () => {
    const blob = vi.fn(async () => new Blob(['{"a":1}']));
    const load = basemapLoader({blob});
    const abort = new AbortController();
    expect((await load({url: `${BASEMAP_PROTOCOL}://api/basemap/sprites/grayscale.json`, type: 'json'}, abort)).data).toEqual({a: 1});
    await load({url: `${BASEMAP_PROTOCOL}://api/basemap/tiles/3/4/2.mvt`, type: 'arrayBuffer'}, abort);
    expect(blob).toHaveBeenLastCalledWith('/api/basemap/tiles/3/4/2.mvt', {signal: abort.signal});
  });
});

describe('PlacesMap', () => {
  it('opens on the places, opens a record on a click, keeps the view for new places, and stops on unmount', () => {
    const onPlace = vi.fn();
    const {rerender, unmount} = render(<PlacesMap status={STATUS} places={[VILLA, OFFICE]} onPlace={onPlace}/>);
    expect(protocols).toEqual([BASEMAP_PROTOCOL]);
    expect(maps).toHaveLength(1);
    expect(maps[0].options.bounds).toEqual([-0.1276, 35.3364, 33.3199, 51.5072]);
    act(() => maps[0].handlers['click:places-dot']({features: [{properties: {entity_id: 'villa'}}]}));
    expect(onPlace).toHaveBeenCalledWith('villa');
    // Every dot can be named: hovering it names it, even where its label gave way to another's.
    act(() => maps[0].handlers['mouseenter:places-dot']({features: [{properties: {caption: 'Villa Kyrenia'}, geometry: {type: 'Point', coordinates: [33.3199, 35.3364]}}]}));
    expect(popups.at(-1)).toMatchObject({text: 'Villa Kyrenia', at: [33.3199, 35.3364], shown: true});
    act(() => maps[0].handlers['mouseleave:places-dot']({}));
    expect(popups.at(-1)!.shown).toBe(false);
    // MapLibre asks for the dot once it draws the places; it is made then, once.
    maps[0].resolver(PLACE_DOT);
    maps[0].resolver(PLACE_DOT);
    maps[0].resolver(dotName(10));
    maps[0].resolver('something-else');
    expect(Object.keys(maps[0].images)).toEqual([PLACE_DOT, dotName(10)]);
    rerender(<PlacesMap status={STATUS} places={[VILLA]} onPlace={onPlace}/>);
    expect(maps).toHaveLength(1);                     // the same map: the reporter's view stays
    expect(maps[0].data.at(-1)).toMatchObject({features: [{properties: {entity_id: 'villa'}}]});
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'Map of 1 place; the list below names each one');
    unmount();
    expect(maps[0].removed).toBe(true);
  });
});

describe('PlacesPanel', () => {
  const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

  it('lists every place, how sure it is, where it is and what is linked (List, L)', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [OFFICE, {...VILLA, sure: 'document', placed_from: 'Land registry'}])});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: /^List/}));
    const table = within(screen.getByRole('table', {name: 'Places'}));
    const rows = table.getAllByRole('row').slice(1).map(r => r.textContent);
    // The kind of record and of link are marks (named on reveal), how sure is a ring, the coordinates under the address on reveal.
    expect(rows).toEqual(['Other recordAddress Meridian registered officenot yet shown1 Example Street, London51.5072° N, 0.1276° W—',
      'Property or other assetRealEstate Villa Kyreniaread from a document35.3364° N, 33.3199° EFrom the record’s own coordinates · CYOwnershipOwns Alaric Voss']);
    expect(table.getByRole('img', {name: 'Other record (Address)'})).toBeInTheDocument();
    expect(table.getByRole('img', {name: 'not yet shown'})).toBeInTheDocument();
    await user.click(table.getByRole('button', {name: 'Alaric Voss'}));
    expect(useWorkbenchStore.getState().dossier?.entityId).toBe('voss');
  });

  it('draws them on the world map, and says how far the app has got when it is still fetching the map', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [OFFICE, VILLA]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByRole('region', {name: /Map of 2 places/})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'On the base map'})).toBeNull();   // the map is the only drawing
    expect(maps.at(-1)!.options.style.sources).toHaveProperty('places-path');
    cleanup();
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [VILLA], [{entity_id: 'x', caption: 'Typo address', schema: 'Address',
      reason: "the latitude 'abc' is not a number"}]), 'GET /api/basemap': {...basemapStatusBody(false), download: 'fetching', download_done: 12e6, download_total: 45e6}});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByText('Getting the world map')).toBeInTheDocument();
    expect(screen.getByText('12 MB of 45 MB')).toBeInTheDocument();
    expect(screen.queryByRole('region', {name: /Map of/})).toBeNull();
    // What cannot be placed is one small mark on the map until it is opened.
    expect(screen.queryByText('Typo address')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', {name: /1 can.t be placed/}));
    expect(screen.getByText('Typo address')).toBeInTheDocument();
    cleanup();
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [VILLA]),
      'GET /api/basemap': {...basemapStatusBody(false), download: 'failed', reason: 'The world map could not be downloaded.'}});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByText('The world map could not be downloaded')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Try again'})).toBeInTheDocument();
  });

  it('marks each place on the map with how sure it is: a soft area for a place known only to its town', async () => {
    const near = (id: string, caption: string, lat: number, lon: number, extra: Partial<PlaceOut> = {}) => place(id, caption, lat, lon, {schema: 'Address', ...extra});
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [
      near('land', 'The harbour land', 50.35, -4.129, {sure: 'document'}),
      near('fern', 'Fernhill Ltd', 50.357, -4.139, {sure: 'approximate', precision: 'town'})]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    await screen.findByRole('region', {name: /Map of 2 places/});
    const style = maps.at(-1)!.options.style as unknown as {layers: {id: string; filter?: unknown}[]; sources: Record<string, {data?: {features: {properties: {sure: string}}[]}}>};
    expect(style.layers.find(l => l.id === 'places-area')?.filter).toEqual(['==', ['get', 'sure'], 'approximate']);
    expect(style.sources.places.data?.features.map(f => f.properties.sure)).toEqual(['document', 'approximate']);
  });

  const dated = (id: string, title: string, first: string, last = first, extra: Record<string, unknown> = {}) => ({
    id, kind: 'reporter_event', title, date_start: first, date_end: last === first ? null : last, first_day: first, last_day: last,
    exact: true, verification_status: 'verified', via: 'place' as 'place' | 'link', relationship_id: null as string | null, ...extra});
  const OFFICE_DATED = {...OFFICE, events: [dated('e1', 'Office registered', '2019-03-04')]};
  const VILLA_DATED = {...VILLA, events: [dated('e2', 'Stake starts', '2021-02-01', '2021-02-28', {exact: false, via: 'link', relationship_id: 'r1'}),
    dated('e3', 'Villa searched', '2023-11-14')]};

  it('draws a party\'s path hop by hop on the map, and says which hops are not verified', async () => {
    const council = place('council', 'Council House', 50.353, -4.133, {links: [{relationship_id: 'c1', schema: 'UnknownLink', direction: 'incoming', entity_id: 'ross', caption: 'M. Ross', entity_schema: 'Person'}],
      events: [dated('h1', 'Ross at the council', '2019-01-15', '2019-01-15', {via: 'link', relationship_id: 'c1'})]});
    const land = place('land', 'The harbour land', 50.35, -4.129, {links: [{relationship_id: 'l1', schema: 'UnknownLink', direction: 'incoming', entity_id: 'ross', caption: 'M. Ross', entity_schema: 'Person'}],
      events: [dated('h2', 'Ross walks the plot', '2019-08-14', '2019-08-14', {via: 'link', relationship_id: 'l1', verification_status: 'asserted'})]});
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [council, land]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    await screen.findByRole('region', {name: /Map of 2 places/});
    await userEvent.setup().click(within(await screen.findByRole('group', {name: 'Path'})).getByRole('button', {name: 'M. Ross'}));
    expect(screen.getByText(/^Council House 15 Jan 2019 → The harbour land 14 Aug 2019/)).toBeInTheDocument();
    expect(screen.getByText('Dashed hops rest on records not yet verified.')).toBeInTheDocument();
    const line = maps.at(-1)!.data.at(-1) as {features: {geometry: {coordinates: number[][]}}[]};
    expect(line.features[0].geometry.coordinates).toEqual([[-4.133, 50.353], [-4.129, 50.35]]);
  });

  it('draws a strip with a row per place, and two typed dates keep the places with an event between them', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [OFFICE_DATED, VILLA_DATED, place('bare', 'No dates here', 1, 1)]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    const strip = within(await screen.findByTestId('places-timeline'));
    expect(screen.getByRole('group', {name: /Timeline of 2 places with dated events, from 4 Mar 2019 to 14 Nov 2023/})).toBeInTheDocument();
    // One readable row per place with dated events, in the places' order; the rest counted in one line.
    expect(strip.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Meridian registered office', 'Villa Kyrenia']);
    expect(strip.getByText('+1 place with no dated event')).toBeInTheDocument();
    // A date known only to the month is a hollow mark.
    expect(strip.getByRole('button', {name: /^Stake starts, .*verified$/})).toHaveClass('hollow');
    expect(strip.getByText('2020')).toBeInTheDocument();   // year ticks

    // From 2021 to 2022, typed in the window's own control: only the villa had an event then.
    const user = userEvent.setup();
    await user.click(strip.getByRole('button', {name: /All dates; type/}));
    fireEvent.change(screen.getByLabelText('From'), {target: {value: '2021-01-01'}});
    fireEvent.change(screen.getByLabelText('To'), {target: {value: '2022-12-31'}});
    expect(await screen.findByTestId('places-window')).toHaveTextContent('Showing 1 of 3 places with events between 2021 and 2022');
    expect(screen.getByText(/Showing the places with an event between 1 Jan 2021 and 31 Dec 2022/)).toBeInTheDocument();
    await screen.findByRole('region', {name: /Map of 1 place/});
    // The events outside the window grey.
    expect(strip.getByRole('button', {name: /^Office registered/})).toHaveClass('out');
    expect(strip.getByRole('button', {name: /^Stake starts/})).not.toHaveClass('out');
    expect(strip.getByRole('slider', {name: 'Window starts'})).toHaveAttribute('aria-valuetext', '1 Jan 2021');

    // Reset dates.
    await user.click(screen.getByRole('button', {name: 'Reset dates'}));
    expect(screen.queryByTestId('places-window')).toBeNull();
  });

  it('moves the window\'s edges from the keyboard: a month on the arrows, the ends on Home and End', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [OFFICE_DATED, VILLA_DATED])});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    const start = await screen.findByRole('slider', {name: 'Window starts'});
    expect(start).toHaveAttribute('aria-valuetext', '4 Mar 2019');
    fireEvent.keyDown(start, {key: 'PageUp'});
    expect(screen.getByRole('slider', {name: 'Window starts'})).toHaveAttribute('aria-valuetext', '3 Mar 2020');
    expect(screen.getByRole('button', {name: /^Window 3 Mar 2020 – 14 Nov 2023/})).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('slider', {name: 'Window starts'}), {key: 'Home'});
    expect(screen.getByRole('button', {name: /All dates; type/})).toBeInTheDocument();   // the whole extent is no window
  });

  it('opens on the place with most dated events, and picks a place on the strip: the panel tells it, its dot stands out', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [OFFICE_DATED, VILLA_DATED]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    await screen.findByTestId('places-timeline');
    await screen.findByRole('region', {name: /Map of 2 places/});
    expect(screen.getByRole('heading', {name: 'Villa Kyrenia'})).toBeInTheDocument();   // two events, against the office's one
    expect(screen.getByText('What happened here · 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /^Office registered/}));
    expect(screen.getByRole('heading', {name: 'Meridian registered office'})).toBeInTheDocument();
    const dots = (maps.at(-1)!.data.at(-1) as {features: {properties: {entity_id: string; dot: string; picked: boolean}}[]}).features;
    expect(dots.find(f => f.properties.entity_id === 'office')?.properties).toMatchObject({dot: dotName(10), picked: true});
    expect(dots.find(f => f.properties.entity_id === 'villa')?.properties).toMatchObject({dot: PLACE_DOT, picked: false});
  });

  it('rings the places of a party seen at several places with no date to order them, and draws no line', async () => {
    const yacht = (id: string, caption: string, lat: number, lon: number, rel: string) => place(id, caption, lat, lon, {links: [
      {relationship_id: rel, schema: 'UnknownLink', direction: 'incoming', entity_id: 'boat', caption: 'M/Y Equanimity', entity_schema: 'Vessel'}]});
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [yacht('a', 'Villefranche', 43.7, 7.3, 'y1'), yacht('b', 'Benoa', -8.7, 115.2, 'y2')]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    await screen.findByRole('region', {name: /Map of 2 places/});
    await userEvent.setup().click(within(screen.getByRole('group', {name: 'Path'})).getByRole('button', {name: 'M/Y Equanimity'}));
    expect(screen.getByText('Seen at 2 places · no dates to order them')).toBeInTheDocument();
    const dots = (maps.at(-1)!.data.at(-1) as {features: {properties: {marked: boolean}}[]}).features;
    expect(dots.map(f => f.properties.marked)).toEqual([true, true]);
    expect(maps.at(-1)!.fitted.at(-1)!.points).toEqual([[7.3, 43.7], [115.2, -8.7]]);
    const lines = maps.at(-1)!.data.filter(d => (d as {features: {geometry: {type: string}}[]}).features.every(f => f.geometry.type === 'LineString'));
    expect((lines.at(-1) as {features: unknown[]}).features).toEqual([]);
  });

  it('reads the two dates as a stretch of time, and both ends at the events\' own as all of it', async () => {
    const {fieldWindow} = await import('../features/places/places-timeline');
    const extent = {from: Date.UTC(2020, 0, 1), to: Date.UTC(2021, 0, 1)};
    expect(fieldWindow('', '', extent)).toBeNull();
    expect(fieldWindow('2020-01-01', '2020-12-31', extent)).toBeNull();
    expect(fieldWindow('2020-06-01', '', extent)).toEqual({from: Date.UTC(2020, 5, 1), to: extent.to});
    expect(fieldWindow('', '2020-06-30', extent)).toEqual({from: extent.from, to: Date.UTC(2020, 6, 1)});
    expect(fieldWindow('2020-07-01', '2020-06-01', extent)).toBeNull();   // a To before the From picks nothing
  });

  it('says why there is no strip when no event is dated at any place', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [VILLA])});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByTestId('places-timeline-empty')).toHaveTextContent('No event on the timeline is dated at these places');
  });

  it('says so when no record holds coordinates', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1')});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByText(/No record in this investigation holds both a latitude and a longitude/)).toBeInTheDocument();
  });
});
