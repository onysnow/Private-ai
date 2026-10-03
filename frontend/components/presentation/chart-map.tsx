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
import {PLACE_RADIUS, basemapStyle, dotName, placesBounds} from '../../lib/basemap-style';
import type {PlaceMarks} from '../../lib/basemap-style';
import {getBasemapStatusOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {BasemapStatusOut} from '../../lib/generated/types.gen';

/** One place as the option carries it. */
export type MapPlace = {name: string; longitude: number; latitude: number; radius?: number; label?: {text?: string; fontWeight?: string}};
export type MapOption = {places: MapPlace[]; top: number; bottom: number};

// The view the render service picks (render/map.mjs fitView): the places
// with 60 px to spare, never more than two zoom levels past the base map's
// own, and a city-scale view for a single place.
const FIT_PADDING = 60;
const MAX_OVERZOOM = 2;
const ONE_PLACE_ZOOM = 8;

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

function PlacesArea({status, places}: {status: BasemapStatusOut; places: MapPlace[]}): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!container.current || !places.length) return;
    ensureBasemapProtocol();
    const limit = (status.max_zoom ?? 6) + MAX_OVERZOOM;
    const bounds = placesBounds(places);
    const one = bounds !== null && bounds[0] === bounds[2] && bounds[1] === bounds[3];
    const made = new MapLibreMap({
      container: container.current, style: basemapStyle(status, chartMarks(places), {everyName: true}),
      ...(one || !bounds ? {center: [places[0].longitude, places[0].latitude], zoom: Math.min(ONE_PLACE_ZOOM, limit)}
        : {bounds, fitBoundsOptions: {padding: FIT_PADDING, maxZoom: limit}}),
      interactive: false, attributionControl: false,
    });
    drawDotsOnDemand(made);
    return () => { made.remove(); };
  }, [status, places]);
  return <div ref={container} style={{position: 'absolute', inset: 0}} data-testid="chart-map-area"/>;
}

/** The map chart at its design size: the frame, and the places in the area the option gives them. */
export function ChartMap({option, width, height, ariaLabel}: {option: Record<string, unknown>; width: number; height: number; ariaLabel: string}): ReactElement {
  const map = mapOf(option);
  const frame = useMemo(() => Object.fromEntries(Object.entries(option).filter(([key]) => key !== 'map')) as EChartsOption, [option]);
  const statusQuery = useQuery(getBasemapStatusOptions());
  const status = statusQuery.data;
  const places = map?.places ?? [];
  return <div style={{position: 'relative', width, height}}>
    <Chart option={frame} height={height} ariaLabel={ariaLabel} theme={null}/>
    {map && <div style={{position: 'absolute', left: 0, right: 0, top: map.top, bottom: map.bottom}}>
      {status?.available ? <PlacesArea status={status} places={places}/>
        : status && <p data-testid="chart-map-no-basemap" style={{margin: 0, padding: 16, fontSize: 13}}>
          No base map is installed here, so the places are listed in the data table only. Install it once with the compose
          profile <code>maps</code> (see DEPLOYMENT.md).</p>}
    </div>}
  </div>;
}
