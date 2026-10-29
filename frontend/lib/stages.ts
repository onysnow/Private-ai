// The five stages of the work, in the order the page follows them
// (docs/discovery/README.md, "Colour roles" and the page mockup). A stage's
// colour is used only for the rail number, the section number and the
// section rule: it says where you are, nothing else.
import {SWATCH} from './viz-tokens';

export type StageKey = 'collect' | 'verify' | 'map' | 'report' | 'keep';

export type StagePart = {label: string; anchor: string};

export type Stage = {key: StageKey; n: number; name: string; line: string; colour: string; parts: StagePart[];
  /** The stage's own whole-screen page (app/(case)/). */
  route: string};

export const STAGES: Stage[] = [
  {key: 'collect', route: '/bring-in', n: 1, name: 'Bring in', line: 'Bring material in. Nothing here is a finding until it is reviewed.', colour: SWATCH.steelBlue, parts: [
    {label: 'The Drop', anchor: 'the-drop'},
    {label: 'Search', anchor: 'investigation-search'},
    {label: 'Library', anchor: 'document-ingestion'},
    {label: 'Sources & evidence', anchor: 'source-capture'},
    {label: 'Connectors', anchor: 'connectors'},
    {label: 'OpenAleph corpus', anchor: 'corpus'},
  ]},
  {key: 'verify', route: '/check', n: 2, name: 'Check', line: 'Decide what the evidence shows. Every status shows a shape and a word: ✓ Supported, ✕ Disputed, ○ Not yet shown.', colour: SWATCH.sage, parts: [
    {label: 'Claims', anchor: 'claim-verification'},
    {label: 'To check', anchor: 'to-check'},
    {label: 'Connector findings', anchor: 'review-queue'},
    {label: 'Is it real?', anchor: 'is-it-real'},
    {label: 'Chain of Custody', anchor: 'chain-of-custody'},
    {label: 'Check a pack', anchor: 'check-a-pack'},
  ]},
  {key: 'map', route: '/see', n: 3, name: 'See', line: 'The reviewed records drawn four ways. Each chart says its rule and has its own key.', colour: SWATCH.amber, parts: [
    {label: 'The Wire', anchor: 'the-wire'},
    {label: 'Timeline', anchor: 'timeline'},
    {label: 'Money', anchor: 'money-flows'},
    {label: 'Places', anchor: 'places'},
    {label: 'Add by hand', anchor: 'add-by-hand'},
  ]},
  {key: 'report', route: '/act', n: 4, name: 'Act', line: 'What to chase next, and what to publish from.', colour: SWATCH.copper, parts: [
    {label: 'Red Flags', anchor: 'red-flags'},
    {label: 'Story', anchor: 'story'},
    {label: 'Leads', anchor: 'leads'},
    {label: 'Charts', anchor: 'chart-builder'},
    {label: 'Decks', anchor: 'decks'},
    {label: 'AI drafts', anchor: 'ai-reasoning-panel'},
  ]},
  {key: 'keep', route: '/keep', n: 5, name: 'Keep', line: 'Take the investigation with you, or remove it.', colour: SWATCH.taupe, parts: [
    {label: 'Safety & data', anchor: 'safety-data'},
    {label: 'Backup & restore', anchor: 'backup-restore'},
    {label: 'Delete', anchor: 'deletion'},
    {label: 'Access', anchor: 'access'},
  ]},
];

/** The stage whose page holds this anchor. */
export function stageOfAnchor(anchor: string): Stage | undefined {
  return STAGES.find(s => s.parts.some(p => p.anchor === anchor));
}

/** Where an anchor lives: its stage's page, at the anchor. */
export function hrefOfAnchor(anchor: string): string {
  const stage = stageOfAnchor(anchor);
  return stage ? `${stage.route}#${anchor}` : `/#${anchor}`;
}
