// The few values every panel shares (Foundation Fixes fix 3): the selected
// investigation, the record the provenance panel has been asked to trace,
// and the claim the verification workspace has been asked to open. Server
// data does not go here -- it lives in TanStack Query.
import {create} from 'zustand';

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

type WorkbenchState = {
  investigationId: string;
  setInvestigationId: (id: string) => void;
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
};

export const useWorkbenchStore = create<WorkbenchState>(set => ({
  investigationId: '',
  // A new case means a new trace and a new claim: nothing from the old one applies.
  setInvestigationId: id => set(state => (state.investigationId === id ? {investigationId: id} : {investigationId: id, provenance: null, claim: null})),
  provenance: null,
  openProvenance: request => set(state => ({provenance: {serial: (state.provenance?.serial ?? 0) + 1, request}})),
  clearProvenance: () => set({provenance: null}),
  claim: null,
  openClaim: claimId => set(state => ({claim: {serial: (state.claim?.serial ?? 0) + 1, claimId}})),
}));
