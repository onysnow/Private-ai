// @vitest-environment jsdom
// Places (features/places/places-panel.tsx, components/places-map.tsx,
// lib/basemap-style.ts; backend app/services/places.py and basemap.py).
// MapLibre needs WebGL, which jsdom does not have, so it is replaced by a
// fake that keeps what the component hands it: the style, the view, the
// event handlers and the protocol. Drawing pixels is MapLibre's.
import {act, cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
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

type Handler = (event: {features?: {properties: Record<string, unknown>}[]}) => void;
const {maps, protocols} = vi.hoisted(() => ({maps: [] as FakeMapInstance[], protocols: [] as string[]}));
type FakeMapInstance = {options: {style: {sources: Record<string, unknown>; layers: {id: string}[]}; bounds?: number[]; center?: number[]};
  handlers: Record<string, Handler>; removed: boolean; data: unknown[]; images: Record<string, {image: {width: number}; options: unknown}>; resolver: (id: string) => void};

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
    remove() { this.removed = true; }
  }
  return {Map: FakeMap, NavigationControl: class {}, addProtocol: (name: string) => protocols.push(name), setWorkerUrl: () => undefined};
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('next/dynamic', async () => {
  const placesMap = await import('../components/places-map');
  return {default: () => placesMap.PlacesMap};
});

const place = (id: string, caption: string, latitude: number, longitude: number, extra: Partial<PlaceOut> = {}): PlaceOut => ({
  entity_id: id, caption, schema: 'RealEstate', latitude, longitude, address: null, country: null, links: [], ...extra});
const VILLA = place('villa', 'Villa Kyrenia', 35.3364, 33.3199, {country: 'cy', links: [
  {relationship_id: 'r1', schema: 'Ownership', direction: 'incoming', entity_id: 'voss', caption: 'Alaric Voss', entity_schema: 'Person'}]});
const OFFICE = place('office', 'Meridian registered office', 51.5072, -0.1276, {schema: 'Address', address: '1 Example Street, London'});
const STATUS = basemapStatusBody(true);

beforeEach(() => { maps.length = 0; connectGeneratedClient(new ApiClient('http://api.test')); useWorkbenchStore.setState({investigationId: 'inv-1', dossier: null}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

  it('lists every place with where it is and what is linked, and draws them when a base map is installed', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [OFFICE, VILLA]), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    const table = within(await screen.findByRole('table', {name: 'Places'}));
    const rows = table.getAllByRole('row').slice(1).map(r => r.textContent);
    expect(rows).toEqual(['Meridian registered office · Address1 Example Street, London · 51.5072° N, 0.1276° W—',
      'Villa Kyrenia · RealEstate35.3364° N, 33.3199° E · CYAlaric Voss · Ownership']);
    expect(await screen.findByRole('region')).toBeInTheDocument();
    expect(screen.getByText(/Map data © OpenStreetMap contributors \(ODbL\), Protomaps build 4\.15\.2 of 2026-10-03/)).toBeInTheDocument();
    await userEvent.setup().click(table.getByRole('button', {name: 'Alaric Voss'}));
    expect(useWorkbenchStore.getState().dossier?.entityId).toBe('voss');
  });

  it('lists the places without a map when no base map is installed, and says how to install one', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1', [VILLA], [{entity_id: 'x', caption: 'Typo address', schema: 'Address',
      reason: "the latitude 'abc' is not a number"}]), 'GET /api/basemap': basemapStatusBody(false)});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByTestId('no-basemap')).toHaveTextContent('compose profile maps');
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText(/the latitude 'abc' is not a number/)).toBeInTheDocument();
  });

  it('says so when no record holds coordinates', async () => {
    mockApi({'GET /api/investigations/inv-1/places': placesBody('inv-1'), 'GET /api/basemap': STATUS});
    wrap(<PlacesPanel investigationId="inv-1"/>);
    expect(await screen.findByText(/No record in this investigation holds both a latitude and a longitude/)).toBeInTheDocument();
  });
});
