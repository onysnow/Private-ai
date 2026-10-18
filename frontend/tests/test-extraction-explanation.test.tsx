// @vitest-environment jsdom
// #190: the per-proposal "why was this proposed" panel and its payload validator.
import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {ExtractionExplanationView} from '../components/extraction-explanation';
import type {ExtractionExplanation} from '../lib/api-types';
import {isExtractionCandidate, isExtractionExplanation} from '../lib/api-validate';

afterEach(cleanup);

function explanationFixture(overrides: Partial<ExtractionExplanation> = {}): ExtractionExplanation {
  return {
    candidate_id: 'cand-1',
    candidate_type: 'claim',
    review_status: 'proposed',
    summary: 'Claim sentence proposed from the document text',
    method: {id: 'sentence_assertion', label: 'Sentence pattern rule', description: 'Split into sentences…', automated: true},
    rationale_basis: 'recorded',
    confidence: {value: 0.55, basis: 'Fixed value of 0.55 assigned to every sentence this rule matches.'},
    parts: [{
      id: 'text',
      label: 'Claim text',
      value: 'Alice worked for Acme Inc.',
      reasoning: ['It contains the assertion verb “worked”.'],
      sources: [{
        kind: 'chunk', id: 'chunk-1', label: 'Chunk 1', locator: 'lines 1-2', extraction_method: 'native_text',
        excerpt: {before: 'Intro. ', match: 'Alice worked for Acme Inc.', after: ' Next…', start_char: 7, end_char: 33},
      }],
    }],
    sources: [
      {kind: 'document', id: 'doc-1', label: 'filing.txt', sha256: 'abcdef0123456789'},
      {kind: 'source', id: 'src-1', label: 'Filing', url: 'https://example.test/filing'},
    ],
    caveats: ['This is a text-pattern match.'],
    review_rule: 'Nothing in this proposal is in the investigation until a reporter accepts it.',
    ...overrides,
  };
}

describe('ExtractionExplanationView', () => {
  it('shows method, basis, per-part reasoning, highlighted source span, confidence meaning and caveats', () => {
    render(<ExtractionExplanationView explanation={explanationFixture()}/>);
    const panel = screen.getByTestId('extraction-explanation');
    expect(within(panel).getByText(/Why this was proposed: Sentence pattern rule/)).toBeInTheDocument();
    expect(within(panel).getByText(/reasoning recorded by the extractor · 1 caveat\(s\)/)).toBeInTheDocument();
    const part = screen.getByTestId('explanation-part-text');
    expect(within(part).getByText('It contains the assertion verb “worked”.')).toBeInTheDocument();
    const mark = part.querySelector('mark');
    expect(mark?.textContent).toBe('Alice worked for Acme Inc.');
    expect(within(part).getByText(/chars 7–33/)).toBeInTheDocument();
    expect(within(panel).getByText(/Fixed value of 0.55/)).toBeInTheDocument();
    expect(within(panel).getByText('This is a text-pattern match.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', {name: 'open'})).toHaveAttribute('href', 'https://example.test/filing');
  });

  it('renders every part of a composite (reporter-staged) proposal', () => {
    const explanation = explanationFixture({
      candidate_type: 'relationship',
      method: {id: 'reporter_staged', label: 'Reporter-staged relationship', description: 'A reporter chose…', automated: false},
      rationale_basis: 'reporter',
      confidence: {value: 0, basis: 'No extractor confidence.'},
      parts: [
        {id: 'schema', label: 'Relationship type', value: 'Employment', reasoning: ['Chosen by the reporter.'], sources: []},
        {id: 'source', label: 'From', value: 'Alice', reasoning: [], sources: [{kind: 'entity', id: 'e1', label: 'Alice', schema: 'Person'}]},
        {id: 'target', label: 'To', value: 'Acme', reasoning: [], sources: [{kind: 'entity', id: 'e2', label: 'Acme', schema: 'Company'}]},
        {id: 'evidence', label: 'Supporting evidence', value: null, reasoning: ['None attached.'], sources: []},
        {id: 'properties', label: 'Properties', value: {role: ['director']}, reasoning: [], sources: []},
      ],
    });
    render(<ExtractionExplanationView explanation={explanation}/>);
    expect(screen.getByText(/Not automated/)).toBeInTheDocument();
    expect(screen.getByText(/chosen by a reporter/)).toBeInTheDocument();
    for (const id of ['schema', 'source', 'target', 'evidence', 'properties']) expect(screen.getByTestId(`explanation-part-${id}`)).toBeInTheDocument();
    expect(within(screen.getByTestId('explanation-part-evidence')).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByTestId('explanation-part-properties')).getByText('{"role":["director"]}')).toBeInTheDocument();
  });
});

describe('isExtractionExplanation / isExtractionCandidate', () => {
  it('accepts a well-formed explanation and candidates with or without one', () => {
    expect(isExtractionExplanation(explanationFixture())).toBe(true);
    const base = {id: 'c', candidate_type: 'claim', payload: {}, review_status: 'proposed'};
    expect(isExtractionCandidate(base)).toBe(true);
    expect(isExtractionCandidate({...base, explanation: explanationFixture()})).toBe(true);
  });

  it('rejects malformed explanations', () => {
    expect(isExtractionExplanation({...explanationFixture(), rationale_basis: 'guessed'})).toBe(false);
    expect(isExtractionExplanation({...explanationFixture(), parts: [{id: 'x', label: 'X', value: 1, reasoning: [3], sources: []}]})).toBe(false);
    expect(isExtractionExplanation({...explanationFixture(), confidence: {value: 'high', basis: ''}})).toBe(false);
    const base = {id: 'c', candidate_type: 'claim', payload: {}, review_status: 'proposed'};
    expect(isExtractionCandidate({...base, explanation: {summary: 'x'}})).toBe(false);
  });
});
