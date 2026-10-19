// @vitest-environment jsdom
// The clarifying question a name asks when nothing in the text says what it
// is (features/documents/schema-question.tsx), and the confidence bands
// proposals are read in (features/documents/confidence.ts).
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {confidenceBand, confidenceLabel} from '../features/documents/confidence';
import {SchemaQuestion, needsSchemaAnswer} from '../features/documents/schema-question';

afterEach(cleanup);

const name = (payload: Record<string, unknown>, confidence: number) => ({id: 'cand-1', candidate_type: 'entity', confidence, payload: {caption: 'Harborline Civic', ...payload}});

describe('SchemaQuestion', () => {
  it('offers every kind when the text says nothing, the guess marked as suggested', async () => {
    const onAnswer = vi.fn();
    const candidate = name({suggested_schema: 'Person', schema_choices: ['Person', 'Organization', 'Company', 'LegalEntity']}, 0.4);
    expect(needsSchemaAnswer(candidate)).toBe(true);
    render(<SchemaQuestion candidate={candidate} answer={undefined} onAnswer={onAnswer}/>);
    expect(screen.getByText(/What kind of entity is "Harborline Civic"\? Nothing in the text says\./)).toBeInTheDocument();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Person (suggested)', 'Organization', 'Company', 'Not sure (LegalEntity)']);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Company'}));
    expect(onAnswer).toHaveBeenCalledWith('Company');
  });

  it('asks nothing when the text says what the name is', () => {
    expect(needsSchemaAnswer(name({suggested_schema: 'Company'}, 0.9))).toBe(false);
    expect(needsSchemaAnswer(name({suggested_schema: 'Person'}, 0.85))).toBe(false);
  });

  it('keeps the two-way question for proposals made before the choices were listed', () => {
    render(<SchemaQuestion candidate={name({suggested_schema: 'Person'}, 0.4)} answer={undefined} onAnswer={vi.fn()}/>);
    expect(screen.getByText(/Is "Harborline Civic" a Person or an Organization\?/)).toBeInTheDocument();
  });
});

describe('confidence bands', () => {
  it('reads a value as high, medium or low', () => {
    expect([0.9, 0.85, 0.84, 0.5, 0.49, 0.2].map(confidenceBand)).toEqual(['high', 'high', 'medium', 'medium', 'low', 'low']);
    expect(confidenceBand(undefined)).toBeNull();
    expect(confidenceLabel(0.4)).toBe('40% confidence · low');
    expect(confidenceLabel(null)).toBe('');
  });
});
