// STRUCT-0040 / issue #40: tree-shaken echarts core registration + theme.
//
// Registers only the chart types and components these visualizations need
// (Sankey for FinancialFlowSankey; Custom + Line for CaseTimeline; Tooltip,
// Grid, DataZoom, Legend; Canvas renderer) via echarts's selective-import
// entry points (echarts/core, echarts/charts, echarts/components,
// echarts/renderers), per issue #40's "Bundle Optimization: Use selective
// imports" requirement, instead of importing the full echarts bundle.
//
// The configured `echarts` module is passed into echarts-for-react's
// `echarts` prop (see components/charts/chart.tsx) together with
// `echarts-for-react/lib/core`, which -- unlike the package's default
// `echarts-for-react` entry -- does not itself import all of `echarts`.
//
// Theme colors are literal HSL values matching app/globals.css's design
// tokens (echarts renders to canvas, so CSS custom properties/`var()` are
// not usable here) and the evidence-status palette already established in
// components/entity-graph.tsx, kept consistent across both visualizations.
//
// Used via <CaseTimeline> and <FinancialFlowSankey> on app/page.tsx.
//
// Fixed 2026-09-29: this theme (and the evidence-status palette in
// entity-graph.tsx it was copied from) still held its pre-redesign blue-ish
// values after the "Redesign Phase 1: trace every palette token to its
// swatch half" commits changed globals.css's actual tokens -- the comments
// above were never wrong about the *intent*, just stale on the values. Every
// literal below now traces to the real current Dark Academia tokens.

import * as echarts from 'echarts/core';
import {BarChart, CustomChart, LineChart, SankeyChart} from 'echarts/charts';
import {AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([
  SankeyChart,
  CustomChart,
  LineChart,
  // Checked presentation charts (backend/app/visuals/echarts.py): bars, a
  // title and source line, and the aria description the checker requires.
  BarChart,
  TitleComponent,
  AriaComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent,
  CanvasRenderer,
]);

export const WORKBENCH_THEME_NAME = 'workbench';

// --primary gold, brightened --accent green (verified), --ring brighter gold
// (inferred), --destructive, --muted-foreground, --da-blue (the palette's own
// "info/link accent" token -- a real on-swatch blue, not an arbitrary one).
const CATEGORICAL_PALETTE = [
  'hsl(40, 56%, 46%)',
  'hsl(162, 55%, 45%)',
  'hsl(36, 60%, 58%)',
  'hsl(7, 53%, 35%)',
  'hsl(37, 22%, 47%)',
  'hsl(209, 35%, 37%)',
];

echarts.registerTheme(WORKBENCH_THEME_NAME, {
  color: CATEGORICAL_PALETTE,
  backgroundColor: 'transparent',
  textStyle: {color: 'hsl(25, 30%, 70%)'}, // --da-parchment
  title: {textStyle: {color: 'hsl(25, 30%, 70%)'}}, // --da-parchment
  tooltip: {
    backgroundColor: 'hsl(202, 21%, 13%)', // --card / --popover
    borderColor: 'hsl(26, 43%, 15%)', // --border
    textStyle: {color: 'hsl(25, 30%, 70%)'}, // --da-parchment
  },
  legend: {textStyle: {color: 'hsl(37, 22%, 47%)'}}, // --muted-foreground
  categoryAxis: {
    axisLine: {lineStyle: {color: 'hsl(26, 43%, 15%)'}}, // --border
    axisLabel: {color: 'hsl(37, 22%, 47%)'}, // --muted-foreground
    splitLine: {lineStyle: {color: 'hsl(26, 43%, 15%)'}}, // --border
  },
  valueAxis: {
    axisLine: {lineStyle: {color: 'hsl(26, 43%, 15%)'}}, // --border
    axisLabel: {color: 'hsl(37, 22%, 47%)'}, // --muted-foreground
    splitLine: {lineStyle: {color: 'hsl(26, 43%, 15%)'}}, // --border
  },
});

export {echarts};
