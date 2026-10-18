// A sample run for the empty state (research AI §4 "States": "Play a sample run", labelled "sample — not a real run",
// as the suite's own viewer does). It is shaped exactly like a recorded run (ADR-0012) and never written anywhere.
import type {AiRunEventOut, AiRunOut} from '../../lib/generated/types.gen';

const at = (s: number) => new Date(Date.UTC(2026, 9, 10, 14, 2, s)).toISOString();
let n = 0;
const ev = (o: Partial<AiRunEventOut> & Pick<AiRunEventOut, 'kind' | 'node' | 'text'>, s: number): AiRunEventOut => ({
  n: ++n, at: at(s), system: 'app', rule: null, status: 'neutral', verdict: null, refs: [], parent: null, self_reported: false, detail: null, ...o,
});
const doc41 = {record_type: 'document', record_id: 'sample-document-41'};
const doc58 = {record_type: 'document', record_id: 'sample-document-58'};

export const SAMPLE_EVENTS: AiRunEventOut[] = [
  ev({kind: 'TURN', node: 'run', text: 'Case synthesis asked: Who controlled Fernhill Ltd between 2016 and 2023, and how?'}, 0),
  ev({kind: 'SETTING', node: 'controls', system: 'umbrella', rule: 'source_tier_floor', verdict: 'D', text: 'source_tier_floor = d', parent: 1}, 0),
  ev({kind: 'SETTING', node: 'controls', system: 'umbrella', rule: 'severity_floor', verdict: 'ALL', text: 'severity_floor = all', parent: 1}, 0),
  ev({kind: 'SETTING', node: 'controls', system: 'umbrella', rule: 'devils_advocate', verdict: 'ON', text: 'devils_advocate = on (default off)', parent: 1}, 0),
  ev({kind: 'SETTING', node: 'controls', system: 'umbrella', rule: 'live_events', verdict: 'SUMMARY', text: 'live_events = summary', parent: 1}, 0),
  ev({kind: 'ROUTE', node: 'router', system: 'tas', rule: 'AGENTS.md trigger table row 2', status: 'good', text: 'TAS: the answer states facts about real people, firms and documents', parent: 1}, 1),
  ev({kind: 'LOAD', node: 'tas/08', system: 'tas', rule: 'AG-050', status: 'good', text: 'Loaded 08_CASE_SYNTHESIS.md', parent: 6}, 1),
  ev({kind: 'CHECK', node: 'retrieval', rule: 'TAS Stage 0 scope and intake', status: 'good', text: 'Packet built: 30 records from this case', parent: 6, refs: [doc41, doc58], detail: {records: 30}}, 2),
  ev({kind: 'CHECK', node: 'model', verdict: 'STARTED', text: 'Model call: ollama qwen2.5:32b-instruct', parent: 8}, 3),
  ev({kind: 'CHECK', node: 'model', status: 'good', verdict: 'ANSWERED', text: 'The model answered after 41 s', parent: 9, detail: {model: 'qwen2.5:32b-instruct', seconds: 41}}, 44),
  ev({kind: 'CHECK', node: 'gate:schema', rule: 'TAS README: validate against the schemas', status: 'good', verdict: 'PASS', text: 'Shape matches the output contract', parent: 10}, 45),
  ev({kind: 'CHECK', node: 'gate:citation', rule: 'AG-033', status: 'good', verdict: 'PASS', text: 'Every citation is in the packet', parent: 11}, 45),
  ev({kind: 'RULE', node: 'tas/class', system: 'tas', rule: 'TAS Standard §4', status: 'good', verdict: 'CORROBORATED_FACT', self_reported: true, refs: [doc41, doc58],
    text: 'Harbour Nominees held 62% of Fernhill Ltd from March 2017', parent: 12, detail: {thought: 'CLM-0008'}}, 46),
  ev({kind: 'CHECK', node: 'gate:citation', status: 'good', verdict: 'PASS', text: 'All 2 cited records are in the packet', parent: 13, refs: [doc41, doc58], detail: {thought: 'CLM-0008'}}, 46),
  ev({kind: 'RULE', node: 'tas/class', system: 'tas', rule: 'TAS Standard §4', status: 'partial', verdict: 'ALLEGATION', self_reported: true, refs: [doc58],
    text: 'Kestrel SA controlled Fernhill Ltd through Harbour Nominees', parent: 12, detail: {thought: 'CLM-0009'}}, 47),
  ev({kind: 'CHECK', node: 'gate:citation', status: 'good', verdict: 'PASS', text: 'All 1 cited records are in the packet', parent: 15, refs: [doc58], detail: {thought: 'CLM-0009'}}, 47),
  ev({kind: 'FLAG', node: 'tas/corroboration', system: 'tas', rule: 'tas/02', status: 'partial', verdict: 'ATTRIBUTED_BUT_UNCORROBORATED',
    text: 'One source names Kestrel', parent: 15, detail: {thought: 'CLM-0009', capped_to: 'roughly even chance (45–55%)'}}, 48),
  ev({kind: 'CHECK', node: 'cp-01', system: 'umbrella', status: 'partial', text: 'Right of reply needed before publication (CP-01)', parent: 15, detail: {thought: 'CLM-0009'}}, 49),
  ev({kind: 'BLOCK', node: 'gate:citation', status: 'bad', verdict: 'NOT_IN_PACKET', text: '"Beneficial owner": no passage says it', parent: 15, detail: {thought: 'CLM-0009'}}, 50),
  ev({kind: 'RULE', node: 'tas/08', system: 'tas', rule: 'Module 08 gaps', status: 'neutral', verdict: 'GAP', self_reported: true, text: '2017 owner filing missing', parent: 12, detail: {thought: 'GAP-0004'}}, 51),
  ev({kind: 'WRITE', node: 'candidate', status: 'good', verdict: 'PROPOSED', text: 'Saved as a sample: proposed for your review', parent: 12}, 72),
  ev({kind: 'TURN', node: 'run', status: 'good', verdict: 'PROPOSED', text: 'Proposed for your review', parent: 1}, 72),
];

export const SAMPLE_RUN: AiRunOut = {
  run_id: 'sample', status: 'succeeded', finished: true, module: 'case_synthesis', question: 'Who controlled Fernhill Ltd between 2016 and 2023, and how?',
  working_theory: null, created_at: at(0), started_at: at(0), finished_at: at(72), candidate_id: null, review_status: null,
  events: SAMPLE_EVENTS.length, problems: 3, message: 'sample — not a real run', error: null,
};
