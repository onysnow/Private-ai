// Issue #39: input types for <EntityGraph>. Deliberately generic (id/label/
// schema/status) rather than importing CanonicalEntity/Relationship
// directly, so a caller can map any of Module 04's reasoning-layer output,
// the existing GraphResponse (app/page.tsx's current /graph endpoint
// result), or a future canonical-entity view into the same shape without
// this component depending on either representation's exact fields.

/**
 * TAS-aligned evidentiary status for a node or edge, used purely for visual
 * encoding (color/line style) -- the graph never infers or changes this
 * itself, it only renders what the caller supplies.
 */
export type EvidenceStatus =
  | 'documented'
  | 'corroborated'
  | 'alleged'
  | 'inferred'
  | 'hypothesized'
  | 'contested'
  | 'unknown';

export type EntityGraphNode = {
  id: string;
  label: string;
  /** FollowTheMoney schema (Person, Company, ...), shown as a subtitle/tooltip. */
  schema?: string;
  status?: EvidenceStatus;
  /** Free-form extra detail shown in the node's tooltip. */
  title?: string;
};

export type EntityGraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  status?: EvidenceStatus;
  title?: string;
};
