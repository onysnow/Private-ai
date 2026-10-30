// @vitest-environment jsdom
// Add by hand (mockup ENTRY_1): a link written as a sentence; a blank finds the case's parties; a new party's kind is
// picked, never guessed; where it comes from is required; what it changes and what the case holds are shown first.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {AddByHand, linkProperties, precisionOf} from '../features/by-hand/add-by-hand';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

beforeEach(() => connectGeneratedClient(new ApiClient('http://api.test')));
afterEach(() => cleanup());

describe('Add by hand', () => {
  it('reads a date’s precision from its form and names the link’s properties as FollowTheMoney does', () => {
    expect([precisionOf('2019'), precisionOf('2019-03'), precisionOf('2019-03-03'), precisionOf('March')]).toEqual(['year', 'month', 'day', null]);
    expect(linkProperties('Payment', '29,400', 'eur', '2019-03-03', '')).toEqual({amount: ['29400'], currency: ['EUR'], date: ['2019-03-03']});
    expect(linkProperties('Ownership', '60', 'EUR', '2018', '')).toEqual({percentage: ['60'], startDate: ['2018']});
  });

  it('writes a link to a new party with no source yet, after showing what it changes', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/by-hand/suggest': ({url}: {url: URL}) => (url.searchParams.get('q')?.toLowerCase().startsWith('fern')
        ? [{id: 'e-fern', caption: 'Fernhill Ltd', schema: 'Company', matched: 'Fernhill Ltd', as: 'its name', country: 'gb'}] : []),
      'POST /api/investigations/inv-1/by-hand/preview': {already: [], waiting: [{kind: 'proposal', id: 'c1', caption: 'Fernhill Ltd → Marsh Holdings', schema: 'Payment'}],
        changes: ['Raises the Red Flag “Circular payment” (Strong)']},
      'POST /api/investigations/inv-1/by-hand': {status: 201, body: {record_type: 'link', record_id: 'r1', evidence_id: null, lead_id: 'l1', parties: ['e-new']}},
      'GET /api/investigations/inv-1/documents': [],
    });
    render(<QueryProvider><AddByHand investigationId="inv-1"/></QueryProvider>);
    // Before the blanks are filled the right column is its titles, not placeholders.
    expect(screen.getByRole('region', {name: 'What it changes'})).toHaveTextContent('once the blanks are filled');
    expect(screen.getByRole('region', {name: 'Already in the case?'})).not.toHaveTextContent('Fill in the blanks');
    const user = userEvent.setup();
    const [first, second] = screen.getAllByLabelText('party');
    await user.type(first, 'Fern');
    await user.click(await screen.findByRole('option', {name: /Fernhill Ltd/}));
    await user.type(second, 'Marsh Holdings');
    const add = within(screen.getByRole('group', {name: 'Add “Marsh Holdings” as a new party'})).getByRole('button', {name: 'a company'});
    await user.click(add);
    await user.type(screen.getByLabelText('Amount'), '29,400');
    await user.type(screen.getByLabelText('Date'), '2019-03-03');
    const changes = screen.getByRole('region', {name: 'What it changes'});
    expect(await within(changes).findByText('Raises the Red Flag “Circular payment” (Strong)')).toBeInTheDocument();
    expect(screen.getByRole('region', {name: 'Already in the case?'})).toHaveTextContent('waits in Decide as a payment: answer that one instead?');
    // Where it comes from is required: a passage needs its document and words.
    expect(screen.getByRole('button', {name: 'Add the link'})).toBeDisabled();
    await user.click(screen.getByRole('radio', {name: /I know it, no source yet/}));
    await user.click(screen.getByRole('button', {name: 'Add the link'}));
    await waitFor(() => expect(api.calls('POST /api/investigations/inv-1/by-hand')).toHaveLength(1));
    expect(api.calls('POST /api/investigations/inv-1/by-hand')[0].body).toEqual({kind: 'link', source: {mode: 'none'}, link: {schema: 'Payment',
      source: {entity_id: 'e-fern'}, target: {new: {caption: 'Marsh Holdings', schema: 'Company'}},
      properties: {amount: ['29400'], currency: ['EUR'], date: ['2019-03-03']}}});
    expect(await screen.findByRole('status')).toHaveTextContent('Added: the link, and a lead to find its source, and 1 new party.');
  });

  it('says plainly when no link joins the two parties yet', async () => {
    mockApi({
      'GET /api/investigations/inv-1/by-hand/suggest': ({url}: {url: URL}) => (url.searchParams.get('q')?.toLowerCase().startsWith('good')
        ? [{id: 'e-gs', caption: 'Good Star Limited', schema: 'Company', matched: 'Good Star Limited', as: 'its name'}]
        : [{id: 'e-ab', caption: 'Aabar Investments PJS Limited', schema: 'Company', matched: 'Aabar Investments PJS Limited', as: 'its name'}]),
      'POST /api/investigations/inv-1/by-hand/preview': {already: [], waiting: [], changes: []},
      'GET /api/investigations/inv-1/documents': [],
    });
    render(<QueryProvider><AddByHand investigationId="inv-1"/></QueryProvider>);
    const user = userEvent.setup();
    const [first, second] = screen.getAllByLabelText('party');
    await user.type(first, 'Good');
    await user.click(await screen.findByRole('option', {name: /Good Star Limited/}));
    await user.type(second, 'Aabar');
    await user.click(await screen.findByRole('option', {name: /Aabar Investments/}));
    expect(await within(screen.getByRole('region', {name: 'Already in the case?'})).findByText('No link between these two yet.')).toBeInTheDocument();
    expect(screen.getAllByLabelText('in the case')).toHaveLength(2);
  });
});
