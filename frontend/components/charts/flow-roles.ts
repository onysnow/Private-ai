// What a party does in the money flows -- only pays, pays and receives, only
// receives -- and its block's colour (palette swatches; components/charts/
// financial-flow-sankey.tsx draws them). Kept apart so the panel's key does
// not load ECharts.
import {SWATCH} from '@/lib/viz-tokens';

/** What a party does in these flows, and its block's colour. */
export const FLOW_ROLE = {
  pays: {name: 'Only pays', colour: SWATCH.copper},
  both: {name: 'Pays and receives', colour: SWATCH.amber},
  receives: {name: 'Only receives', colour: SWATCH.sage},
} as const;

export function flowRole(name: string, links: {source: string; target: string}[]): keyof typeof FLOW_ROLE {
  const pays = links.some(l => l.source === name), receives = links.some(l => l.target === name);
  return pays && receives ? 'both' : pays ? 'pays' : 'receives';
}
