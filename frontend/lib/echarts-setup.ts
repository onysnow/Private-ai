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
// Infra only; not wired into any existing page (issue #40's own scope note).

import * as echarts from 'echarts/core';
import {CustomChart, LineChart, SankeyChart} from 'echarts/charts';
import {DataZoomComponent, GridComponent, LegendComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([
  SankeyChart,
  CustomChart,
  LineChart,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent,
  CanvasRenderer,
]);

export const WORKBENCH_THEME_NAME = 'workbench';

// --primary, verified-green, inferred-amber, --destructive, --muted-foreground, a secondary blue.
const CATEGORICAL_PALETTE = [
  'hsl(228, 100%, 76%)',
  '#3fbf7f',
  '#c9a227',
  'hsl(0, 72%, 51%)',
  'hsl(223, 28%, 74%)',
  '#7c8fd6',
];

echarts.registerTheme(WORKBENCH_THEME_NAME, {
  color: CATEGORICAL_PALETTE,
  backgroundColor: 'transparent',
  textStyle: {color: 'hsl(226, 100%, 97%)'},
  title: {textStyle: {color: 'hsl(226, 100%, 97%)'}},
  tooltip: {
    backgroundColor: 'hsl(222, 43%, 12%)',
    borderColor: 'hsl(223, 33%, 24%)',
    textStyle: {color: 'hsl(226, 100%, 97%)'},
  },
  legend: {textStyle: {color: 'hsl(223, 28%, 74%)'}},
  categoryAxis: {
    axisLine: {lineStyle: {color: 'hsl(223, 33%, 24%)'}},
    axisLabel: {color: 'hsl(223, 28%, 74%)'},
    splitLine: {lineStyle: {color: 'hsl(223, 33%, 24%)'}},
  },
  valueAxis: {
    axisLine: {lineStyle: {color: 'hsl(223, 33%, 24%)'}},
    axisLabel: {color: 'hsl(223, 28%, 74%)'},
    splitLine: {lineStyle: {color: 'hsl(223, 33%, 24%)'}},
  },
});

export {echarts};
