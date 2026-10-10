// The five stages of the work, in the order the page follows them
// (docs/discovery/README.md, "Colour roles" and the page mockup). A stage's
// colour is used only for the rail number, the section number and the
// section rule: it says where you are, nothing else.
import {SWATCH} from './viz-tokens';

export type StageKey = 'collect' | 'verify' | 'map' | 'report' | 'keep';

export type StagePart = {label: string; anchor: string};

export type Stage = {key: StageKey; n: number; name: string; line: string; colour: string; parts: StagePart[]};

export const STAGES: Stage[] = [
  {key: 'collect', n: 1, name: 'Collect', line: 'Bring material in. Nothing here is a finding until it is reviewed.', colour: SWATCH.steelBlue, parts: [
    {label: 'Search', anchor: 'investigation-search'},
    {label: 'Documents', anchor: 'document-ingestion'},
    {label: 'Sources & evidence', anchor: 'source-capture'},
    {label: 'Connectors', anchor: 'connectors'},
    {label: 'OpenAleph corpus', anchor: 'corpus'},
  ]},
  {key: 'verify', n: 2, name: 'Verify', line: 'Decide what the evidence shows. Colour here is always how sure: green supported, red disputed, brown not yet shown.', colour: SWATCH.sage, parts: [
    {label: 'Claims', anchor: 'claim-verification'},
    {label: 'Connector findings', anchor: 'review-queue'},
  ]},
  {key: 'map', n: 3, name: 'Map', line: 'The reviewed records drawn four ways. Each chart says its rule and has its own key.', colour: SWATCH.amber, parts: [
    {label: 'Relationships', anchor: 'relationship-graph'},
    {label: 'Timeline', anchor: 'timeline'},
    {label: 'Money', anchor: 'money-flows'},
    {label: 'Places', anchor: 'places'},
  ]},
  {key: 'report', n: 4, name: 'Report', line: 'What to chase next, and what to publish from.', colour: SWATCH.copper, parts: [
    {label: 'Leads', anchor: 'leads'},
    {label: 'Charts', anchor: 'chart-builder'},
    {label: 'AI drafts', anchor: 'ai-reasoning-panel'},
  ]},
  {key: 'keep', n: 5, name: 'Keep', line: 'Take the investigation with you, or remove it.', colour: SWATCH.taupe, parts: [
    {label: 'Backup & restore', anchor: 'backup-restore'},
    {label: 'Delete', anchor: 'deletion'},
    {label: 'Access', anchor: 'access'},
  ]},
];
