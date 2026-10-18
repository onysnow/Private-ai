// @vitest-environment jsdom
// Settings › Private AI: the app's values in the Authority System Suite (features/suite-coverage).
// A value the suite does not define is shown first, then the near matches, then what the suite
// requires that the app does not record.
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {SuiteCoverage} from '../features/suite-coverage/suite-coverage';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SuiteCoverage', () => {
  it('counts and lists what the suite does not define, defines nearly, and needs from the app', async () => {
    mockApi({'GET /api/ai/suite-coverage': {
      source: 'onysnow/Authority-System-Suite@b1c71e8', tas_version: '1.12',
      counts: {same: 1, close: 1, none: 1, unmapped: 0, app_lacks: 1, drifted: 0},
      mappings: [
        {vocabulary: 'red_flag_level', vocabulary_name: 'Red Flag level', value: 'textbook', suite_term: null, file: null, match: 'none', note: 'No graded strength.', found: null},
        {vocabulary: 'claim_status', vocabulary_name: 'Claim status', value: 'confirmed', suite_term: '### 4.3 Corroborated fact', file: 'systems/tas/CORE/X.md', match: 'close', note: 'Adds a tier floor.', found: true},
        {vocabulary: 'claim_evidence_stance', vocabulary_name: 'Evidence on a claim', value: 'supports', suite_term: '"supporting_evidence"', file: 'systems/tas/EVALUATION/OUTPUT_SCHEMAS.md', match: 'same', note: 'Claim record field.', found: true},
      ],
      unmapped: [],
      suite_requires_app_lacks: [{what: 'Source tier A–F on each source', suite_term: '"source_tier": "B"', file: 'systems/tas/EVALUATION/OUTPUT_SCHEMAS.md', why: 'The floor reads it.', found: true}],
    }});
    render(<QueryProvider><SuiteCoverage/></QueryProvider>);
    const counts = await screen.findByRole('list', {name: 'Coverage'});
    expect(counts).toHaveTextContent('1 the suite does not define');
    expect(counts).toHaveTextContent('1 the suite needs, the app does not record');
    const missing = screen.getByText('The suite does not define (1)').closest('details')!;
    expect(missing).toHaveAttribute('open');
    expect(within(missing).getByText('textbook')).toBeInTheDocument();
    expect(within(missing).getByText('The suite has no term for this.')).toBeInTheDocument();
    expect(screen.getByText('### 4.3 Corroborated fact')).toBeInTheDocument();
    expect(screen.getByText('Source tier A–F on each source')).toBeInTheDocument();
  });
});
