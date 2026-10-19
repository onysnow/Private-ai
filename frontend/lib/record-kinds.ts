// Colour roles for records outside the charts (docs/discovery/README.md,
// "Colour roles"): the kind of record (the left edge of a result card and its
// group), how sure a record is, and the reporter's tag swatches. Each meaning
// has one colour across the app; the chart colours stay in viz-tokens.ts.
import {SWATCH} from './viz-tokens';

export type RecordKind = 'party' | 'link' | 'evidence' | 'claim_event' | 'lead_task' | 'document' | 'outside';

export type KindLook = {edge: string; name: string; plural: string};

/** Each kind of record: its edge colour and its names. Outside findings are
 * plum: the card is filled with plum, and its edge and text use a lighter tint
 * (#9a83a8) so the mark meets 3:1 against the card. */
export const KIND: Record<RecordKind, KindLook> = {
  party: {edge: SWATCH.gold, name: 'Party', plural: 'Parties'},
  link: {edge: SWATCH.amber, name: 'Link', plural: 'Links between parties'},
  evidence: {edge: SWATCH.parchment, name: 'Evidence', plural: 'Evidence and sources'},
  claim_event: {edge: SWATCH.sage, name: 'Claim or event', plural: 'Claims and events'},
  lead_task: {edge: SWATCH.copper, name: 'Lead or task', plural: 'Leads and tasks'},
  document: {edge: SWATCH.parchment, name: 'Document', plural: 'Documents'},
  outside: {edge: '#9a83a8', name: 'Outside finding', plural: 'Outside findings'},
};

export const KIND_ORDER: RecordKind[] = ['party', 'link', 'evidence', 'claim_event', 'lead_task', 'document', 'outside'];

/** What each search result type is called on its card. */
export const TYPE_LABEL: Record<string, string> = {
  entity: 'Party', statement: 'Party detail', relationship: 'Link', evidence: 'Evidence', source: 'Source',
  claim: 'Claim', timeline_event: 'Event', lead: 'Lead', reporting_task: 'Task', document: 'Document',
  document_chunk: 'Document text', extraction_candidate: 'Proposal', connector_finding: 'Outside finding',
};

export type Sure = 'supported' | 'not_yet' | 'disputed' | 'rejected';

export type SureLook = {fill: string; text: string; name: string; mark: string};

/** How sure: supported, not yet shown, disputed, rejected. */
export const SURE: Record<Sure, SureLook> = {
  supported: {fill: SWATCH.forest, text: SWATCH.ink, name: 'Supported or verified', mark: '✓'},
  not_yet: {fill: SWATCH.umber, text: SWATCH.ink, name: 'Not yet shown', mark: '○'},
  disputed: {fill: SWATCH.brick, text: SWATCH.ink, name: 'Disputed', mark: '!'},
  rejected: {fill: '#672c1a', text: SWATCH.ink, name: 'Rejected', mark: '×'},
};

export const SURE_ORDER: Sure[] = ['supported', 'not_yet', 'disputed', 'rejected'];

/** The eight swatches a reporter's tag can use (the backend accepts only
 * these: app/services/annotations.py TAG_COLOURS). */
export const TAG_SWATCHES = ['#314d65', '#3a5c52', '#8d692b', '#663306', '#89352a', '#61503e', '#3e6181', '#966926'] as const;
