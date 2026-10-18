// @vitest-environment jsdom
// Hover cards for glossary terms (features/glossary/glossary-text.tsx): a term
// written in the app's text is marked the first time it appears, as a whole
// word; acronyms and the app's own names only as written; pointing at it shows
// its definition and the term opens its glossary entry.
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {GlossaryText, buildTermIndex, findTerms} from '../features/glossary/glossary-text';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

const hints = [
  {term: 'Beneficial owner', definition: 'The real person who owns or controls a company.', areas: ['BO'], names: [{text: 'Beneficial owner', exact: false}]},
  {term: 'Nominee', definition: 'Someone who holds a post or shares in name for another.', areas: ['BO'], names: [{text: 'Nominee', exact: false}]},
  {term: 'PEP (politically exposed person)', definition: 'Someone in a prominent public role.', areas: ['CO'],
    names: [{text: 'PEP', exact: true}, {text: 'politically exposed person', exact: false}]},
  {term: 'Strong', definition: 'The second level of a Red Flag.', areas: ['APP'], names: [{text: 'Strong', exact: true}]},
];

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('findTerms', () => {
  const index = buildTermIndex(hints)!;
  const marked = (text: string, skip?: string) => findTerms(index, text, skip).filter(p => typeof p !== 'string').map(p => (p as {text: string}).text);

  it('marks whole words once each, in any case unless the name is exact', () => {
    expect(marked('The beneficial owner used a nominee; the nominee signed.')).toEqual(['beneficial owner', 'nominee']);
    expect(marked('Nominees and pep talks')).toEqual(['Nominees']);
    expect(marked('Nominated, PEPs')).toEqual(['PEPs']);
    expect(marked('A PEP, a Politically Exposed Person')).toEqual(['PEP']);
    expect(marked('a strong case; Strong level')).toEqual(['Strong']);
  });

  it('keeps every letter of the text and leaves out the term being defined', () => {
    const text = 'A nominee for the Beneficial owner.';
    expect(findTerms(index, text).map(p => (typeof p === 'string' ? p : p.text)).join('')).toBe(text);
    expect(marked(text, 'Nominee')).toEqual(['Beneficial owner']);
  });
});

describe('GlossaryText', () => {
  it('shows the definition when pointed at and links to the full entry', async () => {
    mockApi({'GET /api/catalogue/terms': hints});
    render(<QueryProvider><p>Held through a <GlossaryText text="nominee director."/></p></QueryProvider>);
    const term = await screen.findByRole('link', {name: 'nominee'});
    expect(term).toHaveAttribute('href', '/glossary?q=Nominee');
    const card = screen.getByRole('tooltip', {hidden: true});
    expect(card).not.toBeVisible();
    expect(term).toHaveAccessibleDescription(/Someone who holds a post/);
    fireEvent.mouseEnter(term);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Nominee Someone who holds a post or shares in name for another.');
    fireEvent.mouseLeave(term);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('is plain text when the terms cannot be loaded', async () => {
    const api = mockApi({});
    render(<QueryProvider><GlossaryText text="nominee director"/></QueryProvider>);
    await vi.waitFor(() => expect(api.calls('GET /api/catalogue/terms').length).toBeGreaterThan(0));
    expect(screen.getByText('nominee director')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
