// Per-claim review of an AI answer (research AI §2 "Per-claim decisions"; mockup AI_1's trace drawer). The parts a
// person decides one by one are a case synthesis's claims, a theory test's hypotheses, and the parts of the suite's
// other systems' answers (SUITE_ITEMS), the same list the server accepts decisions for (backend app/ai/reasoning.py
// review_items, from app/ai/systems.py SuiteModule.items). Grounded or guessed: a claim that cites a record
// in the packet the run was checked against is grounded (solid underline); one that cites none is the model's own
// wording, guessed (dashed plum). AI text stays marked until a person keeps or corrects it, or accepts the answer.
import type {AiAnalysisCandidateOut, AiClaimReviewOut, RecordRefOut} from '../../lib/generated/types.gen';

export type Decision = 'keep' | 'correct' | 'reject';
export type ReviewItem = {
  id: string; text: string; refs: RecordRefOut[]; grounded: RecordRefOut[]; classification: string | null; confidenceTerm: string | null;
  decision: AiClaimReviewOut | null;
};

/** The reasons offered when rejecting a claim (research AI §2); any other reason can be typed. */
export const REJECT_REASONS = ['source does not say it', 'overstated', 'wrong party', 'duplicate'] as const;

const refsOf = (v: unknown): RecordRefOut[] => (Array.isArray(v)
  ? v.filter((r): r is RecordRefOut => Boolean(r) && typeof r === 'object' && typeof (r as RecordRefOut).record_type === 'string' && typeof (r as RecordRefOut).record_id === 'string')
    .map(r => ({record_type: r.record_type, record_id: r.record_id}))
  : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Mirrors SuiteModule.items in backend app/ai/systems.py: where each suite answer's parts are, their id, their words
 * and the fields holding the records they cite. DAS framing has none: it is one record, decided as a whole. */
const SUITE_ITEMS: Record<string, {path: string[]; id: string; text: string; refs: string[]; kind?: string}> = {
  research_vetting: {path: ['claims'], id: 'claim_id', text: 'claim_text', refs: [], kind: 'corroboration_verdict'},
  quant_framing: {path: ['rival_set', 'rivals_identified_so_far'], id: 'rival', text: 'prediction', refs: ['evidence'], kind: 'category'},
  las_argument_check: {path: ['arguments'], id: 'arg_id', text: 'conclusion', refs: []},
  das_options: {path: ['options'], id: 'option_id', text: 'option', refs: [], kind: 'option_type'},
  evidence_plan: {path: ['plan_items'], id: 'plan_item_id', text: 'point_to_establish', refs: ['existence_evidence'], kind: 'route'},
  ehs_harm_minimisation: {path: ['harm_assessments'], id: 'harm_id', text: 'harm', refs: ['identified_in'], kind: 'category'},
  ehs_public_interest: {path: ['elements'], id: 'element', text: 'weighing', refs: ['evidence']},
};

const rowsAt = (payload: Record<string, unknown>, path: string[]): Array<Record<string, unknown>> => {
  let at: unknown = payload;
  for (const key of path) at = at && typeof at === 'object' && !Array.isArray(at) ? (at as Record<string, unknown>)[key] : undefined;
  return Array.isArray(at) ? at.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object') : [];
};

/** The answer's claims (or hypotheses), each with what it cites, which of those are in the packet, and your decision. */
export function reviewItems(candidate: Pick<AiAnalysisCandidateOut, 'module' | 'payload' | 'checked_citation_ids' | 'claim_reviews'> | undefined | null): ReviewItem[] {
  if (!candidate) return [];
  const payload = (candidate.payload ?? {}) as Record<string, unknown>;
  const packet = new Set((candidate.checked_citation_ids ?? []).map(r => `${r.record_type}:${r.record_id}`));
  const reviews = candidate.claim_reviews ?? {};
  const suite = SUITE_ITEMS[candidate.module];
  if (suite) {
    return rowsAt(payload, suite.path).filter(r => str(r[suite.id])).map(r => {
      const id = str(r[suite.id])!;
      const refs = suite.refs.flatMap(k => refsOf(r[k]));
      return {id, text: str(r[suite.text]) ?? '', refs, grounded: refs.filter(x => packet.has(`${x.record_type}:${x.record_id}`)),
        classification: suite.kind ? str(r[suite.kind]) : null, confidenceTerm: null, decision: reviews[id] ?? null};
    });
  }
  const rows: Array<Record<string, unknown>> = candidate.module === 'case_synthesis' ? (payload.claims as Array<Record<string, unknown>> | undefined) ?? []
    : candidate.module === 'hypothesis_test' ? (payload.hypothesis_matrix as Array<Record<string, unknown>> | undefined) ?? [] : [];
  const hypothesis = candidate.module === 'hypothesis_test';
  return (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object' && str(hypothesis ? r.hypothesis_id : r.claim_id)).map(r => {
    const id = str(hypothesis ? r.hypothesis_id : r.claim_id)!;
    const refs = hypothesis ? [...refsOf(r.supporting_evidence), ...refsOf(r.contradicting_evidence)] : refsOf(r.supporting_evidence);
    return {
      id, text: str(hypothesis ? r.hypothesis : r.claim) ?? '', refs, grounded: refs.filter(x => packet.has(`${x.record_type}:${x.record_id}`)),
      classification: str(hypothesis ? r.kind : r.classification), confidenceTerm: str(r.confidence_term), decision: reviews[id] ?? null,
    };
  });
}

/** A person has accepted this claim's words: kept or corrected it, or accepted the whole answer without rejecting it. */
export function acceptedByAPerson(item: ReviewItem, reviewStatus: string | undefined): boolean {
  if (item.decision) return item.decision.decision === 'keep' || item.decision.decision === 'correct';
  return reviewStatus === 'accepted';
}

/** The words of a decision, for a chip or a screen reader: "kept · you". */
export function decisionWords(d: AiClaimReviewOut | null): string {
  if (!d) return 'waits for you';
  return d.decision === 'keep' ? 'kept · you' : d.decision === 'correct' ? 'corrected · you' : 'rejected · you';
}
