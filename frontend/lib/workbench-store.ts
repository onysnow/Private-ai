// The few values every panel shares (Foundation Fixes fix 3): the selected
// investigation, the selected canonical entity, and the requests one panel
// makes of another -- a provenance trace, a claim to open, a dossier to
// open, a relationship to open, a document to open. Server data does not go here -- it lives in
// TanStack Query.
import {create} from 'zustand';

import type {RelationshipOut} from './generated/types.gen';

/** What a panel asks the provenance trace panel to follow. Any panel can
 * ask; only the provenance panel loads anything. */
export type ProvenanceRequest = {
  title: string;
  kind: string;
  sourceId?: string;
  sourceUrl?: string;
  locator?: string;
  detail?: string;
  entityId?: string;
  extractionCandidateId?: string;
  acceptedRecordType?: 'entity' | 'claim' | 'evidence';
  acceptedRecordId?: string;
  documentId?: string;
  traceRecordType?: 'relationship' | 'lead' | 'task';
};

/** The relationship another panel asks the graph panel to open. The dossier
 * passes its own copy of the record (its relationship list is the entity's
 * view, which the graph may not hold); the claims panel knows only the id. */
export type RelationshipRequest = {relationshipId: string; record?: RelationshipOut};

type WorkbenchState = {
  investigationId: string;
  setInvestigationId: (id: string) => void;
  /** The canonical entity the connectors panel has selected: what "Open
   * dossier" and the enrich buttons act on. The graph moves it when a node
   * is clicked; the dossier moves it to the surviving record after a merge
   * or when a merged alias resolves to another record. */
  entityId: string;
  setEntityId: (id: string) => void;
  /** The current trace request, with a serial so asking for the same record
   * twice still re-runs the trace. */
  provenance: {serial: number; request: ProvenanceRequest} | null;
  openProvenance: (request: ProvenanceRequest) => void;
  clearProvenance: () => void;
  /** The claim the verification workspace was last asked to open (from its
   * own list or from a dossier), with a serial so asking for the same claim
   * twice still reopens it. The workspace itself decides whether it holds
   * that claim. */
  claim: {serial: number; claimId: string} | null;
  openClaim: (claimId: string) => void;
  /** The entity whose dossier was last asked for (the "Open dossier" button,
   * a graph node, a relationship endpoint, the record a merge kept). */
  dossier: {serial: number; entityId: string} | null;
  openDossier: (entityId: string) => void;
  /** The relationship the graph panel was last asked to open. */
  relationship: {serial: number; request: RelationshipRequest} | null;
  openRelationship: (request: RelationshipRequest) => void;
  /** The document the documents panel was last asked to open (a corpus
   * search hit, a similar document), at the page that matched if known. */
  document: {serial: number; documentId: string; pageNumber: number | null} | null;
  openDocument: (documentId: string, pageNumber?: number | null) => void;
  /** The investigation's year slider (lib/as-of.ts): the year every chart
   * shows the state as of, or null for all time. */
  asOf: number | null;
  setAsOf: (year: number | null) => void;
  /** The party pointed at in any chart: every other chart lights it too. */
  pointedParty: string | null;
  setPointedParty: (id: string | null) => void;
};

// Every request gets a serial no earlier request had, even after a new case
// cleared the last one: a panel remembers the serial it answered, so a
// request must never repeat one.
let lastSerial = 0;
const nextSerial = (): number => ++lastSerial;

export const useWorkbenchStore = create<WorkbenchState>(set => ({
  investigationId: '',
  // A new case means a new trace, claim, dossier and relationship: nothing from the old one applies.
  setInvestigationId: id => set(state => (state.investigationId === id ? {investigationId: id}
    : {investigationId: id, entityId: '', provenance: null, claim: null, dossier: null, relationship: null, document: null, asOf: null, pointedParty: null})),
  entityId: '',
  setEntityId: id => set({entityId: id}),
  provenance: null,
  openProvenance: request => set({provenance: {serial: nextSerial(), request}}),
  clearProvenance: () => set({provenance: null}),
  claim: null,
  openClaim: claimId => set({claim: {serial: nextSerial(), claimId}}),
  dossier: null,
  // Opening a dossier also selects its entity, as clicking a graph node did.
  openDossier: entityId => set({entityId, dossier: {serial: nextSerial(), entityId}}),
  relationship: null,
  openRelationship: request => set({relationship: {serial: nextSerial(), request}}),
  document: null,
  openDocument: (documentId, pageNumber = null) => set({document: {serial: nextSerial(), documentId, pageNumber}}),
  asOf: null,
  setAsOf: year => set({asOf: year}),
  pointedParty: null,
  setPointedParty: id => set(state => (state.pointedParty === id ? state : {pointedParty: id})),
}));
