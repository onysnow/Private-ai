// The parts of a suite system's answer a person decides one by one (features/ai/claim-review.ts SUITE_ITEMS), the
// same lists the server takes decisions for (backend app/ai/systems.py SuiteModule.items).
import {describe, expect, it} from 'vitest';

import {reviewItems} from '../features/ai/claim-review';

const ref = {record_type: 'evidence', record_id: 'ev-1'};
const base = {checked_citation_ids: [ref], claim_reviews: {}};

describe('reviewItems for the suite systems', () => {
  it('reads each module from its own list, the nested QAS one included', () => {
    const plan = reviewItems({...base, module: 'evidence_plan', payload: {plan_items: [
      {plan_item_id: 'GPLN-0001', point_to_establish: 'who received it', existence_evidence: [ref], route: 'RECORDS_REQUEST'}]}});
    expect(plan).toEqual([expect.objectContaining({id: 'GPLN-0001', text: 'who received it', grounded: [ref], classification: 'RECORDS_REQUEST'})]);
    const rivals = reviewItems({...base, module: 'quant_framing', payload: {rival_set: {rivals_identified_so_far: [
      {rival: 'Tax planning', prediction: 'matches the filed structure', evidence: [], category: 'COMMON_CAUSE'}]}}});
    expect(rivals.map(i => [i.id, i.text, i.grounded.length])).toEqual([['Tax planning', 'matches the filed structure', 0]]);
    expect(reviewItems({...base, module: 'las_argument_check', payload: {arguments: [{arg_id: 'ARG-0001', conclusion: 'It was hidden'}]}})
      .map(i => i.id)).toEqual(['ARG-0001']);
    expect(reviewItems({...base, module: 'ehs_public_interest', payload: {elements: [{element: 'Her name', weighing: 'needed'}]}})
      .map(i => i.text)).toEqual(['needed']);
  });

  it('carries your decision, and gives nothing for a whole-record answer or a malformed list', () => {
    const decided = reviewItems({...base, module: 'das_options', claim_reviews: {'OPT-0001': {decision: 'keep', text: null, reason: null, reviewed_at: 'x'}},
      payload: {options: [{option_id: 'OPT-0001', option: 'Wait'}, {option: 'no id'}]}});
    expect(decided.map(i => [i.id, i.decision?.decision])).toEqual([['OPT-0001', 'keep']]);
    expect(reviewItems({...base, module: 'das_framing', payload: {decision_id: 'DEC-0001'}})).toEqual([]);
    expect(reviewItems({...base, module: 'quant_framing', payload: {rival_set: 'not an object'}})).toEqual([]);
  });
});
