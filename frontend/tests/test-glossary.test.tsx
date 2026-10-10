// @vitest-environment jsdom
// The glossary page (app/glossary/page.tsx): search, a filter by area, and an
// indicator opened in full from a term or from ?indicator=.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import GlossaryPage from '../app/glossary/page';
import {mockApi} from '../test-support/mock-api';

const term = {term: 'Beneficial owner', definition: 'The person who in the end owns or controls a company.', examples: ['A nominee holds shares for her'],
  source_url: 'https://example.test/bo', cases: ['Panama Papers'], related: ['Nominee'], indicators: ['BO-001'], areas: ['BO']};
const indicator = {id: 'BO-001', name: 'Circular ownership', definition: 'Companies own each other in a loop.', areas: ['BO'], area_name: 'Hidden ownership',
  typology: null, status: 'verified', sources: [{title: 'Loopholes', publisher: 'Tax Justice Network', year: '2020', url: 'https://example.test/tjn', locator: null,
    quote: 'company A owns company C', quote_verified: true, licence: null, checked: null}], examples: [], cases: [
    {name: 'Case X', year: '2019', jurisdiction: 'UK', what_happened: 'A loop hid the owner.', outcome: 'alleged_in_reporting', outcome_verified: true, source_url: 'https://example.test/c', source_title: 'Report'}],
  data_needed: ['Ownership'], checkable: 'records', lookup_sources: [], levels: {faint: 'To be set', strong: 'To be set', textbook: 'Meets the published definition as worded', threshold_source: 'none'},
  threshold_verified: true, cross_hints: [], innocent_explanations: ['Group cross-holdings.'], jurisdictions: null, version: 1};

beforeEach(() => { window.history.replaceState(null, '', '/glossary'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Glossary page', () => {
  it('searches, filters by area, and opens an indicator from a term', async () => {
    const api = mockApi({
      'GET /api/catalogue/areas': [{key: 'BO', name: 'Hidden ownership', scope: 'Shells', summary: 'Hiding who owns a company.', indicators: 63, verified: 63, terms: 58}],
      'GET /api/catalogue/glossary': {total: 1, terms: [term]},
      'GET /api/catalogue/indicators/BO-001': indicator,
    });
    render(<GlossaryPage/>);
    expect(await screen.findByRole('heading', {level: 3, name: /Beneficial owner/})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search the glossary'), 'owner');
    await waitFor(() => expect(api.lastUrl('GET /api/catalogue/glossary').searchParams.get('q')).toBe('owner'));
    await user.click(screen.getByRole('button', {name: 'Hidden ownership · 58'}));
    await waitFor(() => expect(api.lastUrl('GET /api/catalogue/glossary').searchParams.get('area')).toBe('BO'));
    await user.click(screen.getByRole('button', {name: 'BO-001'}));
    expect(await screen.findByRole('heading', {level: 2, name: 'Circular ownership'})).toBeInTheDocument();
    expect(screen.getByText('Alleged in published reporting')).toBeInTheDocument();
    expect(window.location.search).toContain('indicator=BO-001');
  });
});
