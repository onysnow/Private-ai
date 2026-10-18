// What colour, line and shape mean in the investigation's charts: one
// table, used by every network, grid and structure chart, so a colour means
// the same thing wherever it appears.
//
// Every colour is from the Dark Academia palette the app is built on (the
// palette image Ony supplied: thirty swatches with their hex codes). Which
// channel carries which meaning follows the rankings in Munzner,
// "Visualization Analysis and Design" (2014), ch. 5: for telling categories
// apart, spatial region and colour hue rank first, then shape; for "how
// much", position, length and area. And, for how sure a link is, the
// results of MacEachren et al., "Visual Semiotics & Uncertainty
// Visualization: An Empirical Study" (IEEE TVCG 2012): hue and shape were
// judged not intuitive for uncertainty, while fuzziness, value and pattern
// arrangement were. So:
//
//   what a party is          -> hue of its dot, and an icon (shape) in it
//   what a link is           -> hue of its line
//   how sure a link is       -> its line pattern: solid, dashed, and a red
//                               "!" when a supporting claim is challenged
//   how many links / money   -> dot area; line thickness
//
// Lines and rings must stand out from the card they are drawn on: every
// colour used for one has at least 3:1 contrast against the card (#1a2328),
// WCAG 2.2 success criterion 1.4.11 (non-text contrast). Of the thirty
// swatches, ten pass; the darker ones are used only as the fill inside a
// ring that passes (tests/test-viz-tokens.test.ts checks every pair).

/** The palette swatches used here, named by what they look like. */
export const SWATCH = {
  card: '#1a2328',
  slate: '#393941',
  umber: '#4e4234',
  bark: '#45271f',
  rust: '#743a2f',
  deepBlue: '#314d65',
  forest: '#3a5c52',
  steelBlue: '#4d7a9b',
  gold: '#b98d34',
  amber: '#d4a152',
  sage: '#baac91',
  parchment: '#caaf9c',
  tan: '#bc9574',
  copper: '#a16948',
  taupe: '#927e5d',
  brick: '#9f3632',
  ink: '#f3e9d7',
  night: '#010005',
} as const;

export type PartyKind = 'person' | 'company' | 'organisation' | 'vehicle' | 'property' | 'other';

export type PartyLook = {fill: string; ring: string; name: string; plural: string};

/** Each kind of party: a dark fill and a light ring and icon of one palette family. */
export const PARTY: Record<PartyKind, PartyLook> = {
  person: {fill: SWATCH.deepBlue, ring: SWATCH.steelBlue, name: 'Person', plural: 'People'},
  company: {fill: SWATCH.umber, ring: SWATCH.gold, name: 'Company', plural: 'Companies'},
  organisation: {fill: SWATCH.forest, ring: SWATCH.sage, name: 'Organisation or public body', plural: 'Organisations'},
  vehicle: {fill: SWATCH.rust, ring: SWATCH.copper, name: 'Vessel, aircraft or vehicle', plural: 'Vessels and vehicles'},
  property: {fill: SWATCH.bark, ring: SWATCH.tan, name: 'Property or other asset', plural: 'Property'},
  other: {fill: SWATCH.slate, ring: SWATCH.taupe, name: 'Other record', plural: 'Other'},
};

/** The order kinds are listed and placed in, people first. */
export const PARTY_ORDER: PartyKind[] = ['person', 'company', 'organisation', 'vehicle', 'property', 'other'];

// FollowTheMoney schema -> kind. In the FtM model Company and PublicBody
// extend Organization; Vessel and Airplane extend Vehicle; RealEstate and
// Security extend Asset. A bare LegalEntity, which Person extends too, could
// be a person or a body, so it is "other": no kind claims more than the
// record says.
const KIND_OF_SCHEMA: Record<string, PartyKind> = {
  Person: 'person',
  Company: 'company',
  Organization: 'organisation', PublicBody: 'organisation',
  Vessel: 'vehicle', Airplane: 'vehicle', Vehicle: 'vehicle',
  RealEstate: 'property', Asset: 'property', Security: 'property',
};

export function partyKind(schema: string | null | undefined): PartyKind {
  return (schema && KIND_OF_SCHEMA[schema]) || 'other';
}

export type LinkFamily = 'owns' | 'runs' | 'money' | 'family' | 'other';

export type LinkLook = {colour: string; name: string};

/** Each family of link: the hue of its line. */
export const LINK: Record<LinkFamily, LinkLook> = {
  owns: {colour: SWATCH.amber, name: 'Owns'},
  runs: {colour: SWATCH.sage, name: 'Directs, works for or belongs to'},
  money: {colour: SWATCH.copper, name: 'Paid or owes'},
  family: {colour: SWATCH.steelBlue, name: 'Family or associate'},
  other: {colour: SWATCH.taupe, name: 'Other link'},
};

export const LINK_ORDER: LinkFamily[] = ['owns', 'runs', 'money', 'family', 'other'];

// FollowTheMoney link schemas -> family. Directions are FtM's own (edge
// source -> target): Ownership owner -> asset, Directorship director ->
// organization, Employment employee -> employer, Membership member ->
// organization, Representation agent -> client, Payment payer ->
// beneficiary, Debt debtor -> creditor. Family, Associate and UnknownLink
// are undirected in FtM, so they are drawn without an arrowhead.
const FAMILY_OF_SCHEMA: Record<string, LinkFamily> = {
  Ownership: 'owns',
  Directorship: 'runs', Employment: 'runs', Membership: 'runs', Representation: 'runs',
  Payment: 'money', Debt: 'money',
  Family: 'family', Associate: 'family',
};
const UNDIRECTED = new Set(['Family', 'Associate', 'UnknownLink']);

export function linkFamily(schema: string | null | undefined): LinkFamily {
  return (schema && FAMILY_OF_SCHEMA[schema]) || 'other';
}

export function isDirected(schema: string | null | undefined): boolean {
  return !schema || !UNDIRECTED.has(schema);
}

/** Links whose direction says who controls whom: an owner above what it
 * owns, a director above what it directs. */
export function isControl(schema: string | null | undefined): boolean {
  return schema === 'Ownership' || schema === 'Directorship';
}

export type Certainty = 'supported' | 'unsupported' | 'contested';

export const CERTAINTY: Record<Certainty, {name: string; dash: string | undefined}> = {
  supported: {name: 'Supported by a reviewed claim or evidence', dash: undefined},
  unsupported: {name: 'Not yet supported by reviewed claims or evidence', dash: '6 5'},
  contested: {name: 'A supporting claim is disputed or rejected, or evidence contradicts it', dash: '6 5'},
};

/** What the Workbench's own review advisory says of a link (backend
 * app/services/relationships.py): contested when a supporting claim is
 * disputed or rejected or reviewed evidence contradicts it; supported when a
 * healthy supporting claim or a reviewed supporting piece of evidence holds
 * it up; otherwise not yet supported. Nothing is inferred beyond those
 * fields. */
export function certaintyOf(advisory: {
  needs_review?: boolean;
  has_independent_support?: boolean;
  relationship_evidence_review_counts?: Record<string, number>;
} | null | undefined): Certainty {
  if (!advisory) return 'unsupported';
  const counts = advisory.relationship_evidence_review_counts ?? {};
  if (advisory.needs_review || (counts.contradicts ?? 0) > 0) return 'contested';
  if (advisory.has_independent_support || (counts.supports ?? 0) > 0) return 'supported';
  return 'unsupported';
}

/** Text colours on the card, each at least 4.5:1 (WCAG 1.4.3): parchment
 * 7.7:1, tan 5.9:1. (Taupe, 4.1:1, is too faint for small text.) */
export const TEXT = {strong: SWATCH.parchment, muted: SWATCH.tan, ink: SWATCH.ink};

// ---- the timeline -------------------------------------------------------

/** Each kind of dated event: its row's name in words and its colour (every
 * one 3:1 or more on the card). Kinds are backend app/services/timeline.py's. */
export const EVENT_KIND: Record<string, {name: string; colour: string}> = {
  reporter_event: {name: 'Events you recorded', colour: SWATCH.amber},
  relationship_date: {name: 'Dates of relationships', colour: SWATCH.sage},
  entity_date: {name: 'Dates in records', colour: SWATCH.gold},
  property_temporal_interval: {name: 'Reviewed periods', colour: SWATCH.tan},
  statement_observed: {name: 'When data was seen', colour: SWATCH.taupe},
  source_date: {name: 'Dates of sources', colour: SWATCH.steelBlue},
};
export const EVENT_KIND_ORDER = ['reporter_event', 'relationship_date', 'entity_date', 'property_temporal_interval', 'source_date', 'statement_observed'];

export function eventKind(kind: string): {name: string; colour: string} {
  return EVENT_KIND[kind] ?? {name: kind.replace(/_/g, ' '), colour: SWATCH.taupe};
}

/** How sure the date is (the event's verification status), drawn as the
 * mark's fill and outline -- not its hue, which says the kind (MacEachren
 * et al. 2012: fill value and pattern read as certainty, hue does not). */
export const EVENT_STATUS: Record<string, {name: string; fill: 'solid' | 'half' | 'none'; dashed: boolean; contested: boolean}> = {
  verified: {name: 'Verified', fill: 'solid', dashed: false, contested: false},
  asserted: {name: 'Asserted, not yet verified', fill: 'half', dashed: false, contested: false},
  approximate: {name: 'Approximate', fill: 'none', dashed: true, contested: false},
  unresolved: {name: 'Unresolved', fill: 'none', dashed: false, contested: false},
  disputed: {name: 'Disputed', fill: 'solid', dashed: false, contested: true},
};

export function eventStatus(status: string): {name: string; fill: 'solid' | 'half' | 'none'; dashed: boolean; contested: boolean} {
  return EVENT_STATUS[status] ?? {name: status.replace(/_/g, ' '), fill: 'half', dashed: false, contested: false};
}
