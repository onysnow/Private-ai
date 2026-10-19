'use client';
// A map chart (backend/app/visuals/echarts.py, _map) in the app. Its frame --
// the title, the unit and the source line -- is the checked ECharts option
// drawn as every other kind is; the places are drawn on the self-hosted base
// map with MapLibre GL JS in the area between, where the export puts the
// render service's picture of them (backend/app/visuals/render_client.py,
// render/map.mjs). The area's place comes from the option, so both put it
// in the same spot. The chart is a picture the reporter approves, scaled to
// fit like every other chart, so the map neither pans nor zooms, and every
// place keeps its name. Loaded on demand, client-side only: it needs WebGL.
import {useQuery} from '@tanstack/react-query';
import {Map as MapLibreMap} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {EChartsOption} from 'echarts';
import {useEffect, useMemo, useRef} from 'react';
import type {ReactElement} from 'react';

import {Chart} from '../charts/chart';
import {ensureBasemapProtocol, drawDotsOnDemand} from '../places-map';
import {PLACE_RADIUS, basemapStyle, dotName, placesView} from '../../lib/basemap-style';
import type {PlaceMarks} from '../../lib/basemap-style';
import {getBasemapStatusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {BasemapStatusOut} from '../../lib/generated/types.gen';

/** One place as the option carries it. */
export type MapPlace = {name: string; longitude: number; latitude: number; radius?: number; label?: {text?: string; fontWeight?: string}};
export type MapOption = {places: MapPlace[]; top: number; bottom: number};

/** The option's places as the base map style's marks. */
export function chartMarks(places: MapPlace[]): PlaceMarks {
  return {
    type: 'FeatureCollection',
    features: places.map(p => ({type: 'Feature', geometry: {type: 'Point', coordinates: [p.longitude, p.latitude]},
      properties: {caption: p.label?.text || p.name, dot: dotName(p.radius ?? PLACE_RADIUS), picked: p.label?.fontWeight === 'bold'}})),
  };
}

/** The option's map, or null when the option is not a map's. */
export function mapOf(option: unknown): MapOption | null {
  const map = (option as {map?: unknown} | null)?.map;
  if (!map || typeof map !== 'object' || !Array.isArray((map as MapOption).places)) return null;
  return map as MapOption;
}

function PlacesArea({status, places, width, height}: {status: BasemapStatusOut; places: MapPlace[]; width: number; height: number}): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!container.current || !places.length) return;
    ensureBasemapProtocol();
    // The view the render service picks for the export (render/map.mjs fitView), so the two show the same.
    const view = placesView(places.map(p => ({longitude: p.longitude, latitude: p.latitude, name: p.label?.text || p.name,
      picked: p.label?.fontWeight === 'bold'})), width, height, status.max_zoom ?? 6);
    const made = new MapLibreMap({
      container: container.current, style: basemapStyle(status, chartMarks(places), {everyName: true}),
      center: view.center, zoom: view.zoom, interactive: false, attributionControl: false,
    });
    drawDotsOnDemand(made);
    return () => { made.remove(); };
  }, [status, places, width, height]);
  return <div ref={container} style={{position: 'absolute', inset: 0}} data-testid="chart-map-area"/>;
}

// The timeline's share of the width (backend app/visuals/echarts.py BESIDE_SHARE):
// it writes text on both sides of its plot; the map needs room only for its places.
export const BESIDE_SHARE = 0.6;

/** The timeline drawn beside a map (the "Map with its timeline" preset), or null. */
export function besideOf(option: unknown): EChartsOption | null {
  const beside = (option as {beside?: unknown} | null)?.beside;
  return beside && typeof beside === 'object' ? beside as EChartsOption : null;
}

/** The map chart at its design size: the frame, and the places in the area
 * the option gives them. With its timeline, the map takes the left 40% and
 * the timeline the rest, as the export places the two pictures
 * (backend/app/visuals/render_client.py, render_pair_png). */
export function ChartMap({option, width, height, ariaLabel}: {option: Record<string, unknown>; width: number; height: number; ariaLabel: string}): ReactElement {
  const beside = besideOf(option);
  if (!beside) return <MapPicture option={option} width={width} height={height} ariaLabel={ariaLabel}/>;
  const right = Math.round(width * BESIDE_SHARE);
  const own = Object.fromEntries(Object.entries(option).filter(([key]) => key !== 'beside'));
  return <div style={{display: 'flex', width, height}} data-testid="chart-map-with-timeline">
    <MapPicture option={own} width={width - right} height={height} ariaLabel={ariaLabel}/>
    <div style={{width: right, height}}>
      <Chart option={beside} height={height} ariaLabel="Timeline of the dated events at the places on the map, each naming its place" theme={null}/>
    </div>
  </div>;
}

function MapPicture({option, width, height, ariaLabel}: {option: Record<string, unknown>; width: number; height: number; ariaLabel: string}): ReactElement {
  const map = mapOf(option);
  const frame = useMemo(() => Object.fromEntries(Object.entries(option).filter(([key]) => key !== 'map')) as EChartsOption, [option]);
  const statusQuery = useQuery(getBasemapStatusOptions());
  const status = statusQuery.data;
  const places = map?.places ?? [];
  return <div style={{position: 'relative', width, height}}>
    <Chart option={frame} height={height} ariaLabel={ariaLabel} theme={null}/>
    {map && <div style={{position: 'absolute', left: 0, right: 0, top: map.top, bottom: map.bottom}}>
      {status?.available ? <PlacesArea status={status} places={places} width={width} height={height - map.top - map.bottom}/>
        : status && <p data-testid="chart-map-no-basemap" style={{margin: 0, padding: 16, fontSize: 13}}>
          No base map is installed here, so the places are listed in the data table only. Install it once with the compose
          profile <code>maps</code> (see DEPLOYMENT.md).</p>}
    </div>}
  </div>;
}
