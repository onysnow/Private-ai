// @vitest-environment jsdom
// Overlays (docs/discovery/README.md, "Overlays"): the year slider's rule
// (lib/as-of.ts), the slider itself, and "How are these two connected?".
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {YearSlider} from '../components/charts/year-slider';
import {Connections} from '../features/relationship-graph/connections';
import {linkSpan, shownAsOf, yearRange} from '../lib/as-of';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {emptyGraph, relationshipFixture} from '../test-support/page-routes';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', asOf: null, pointedParty: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('as of a year', () => {
  it('shows a link that had started and not ended, and every undated record', () => {
    const span = linkSpan({startDate: ['2019-06-11'], endDate: ['2022']});
    expect([2018, 2019, 2022, 2023].map(y => shownAsOf(span, y))).toEqual([false, true, true, false]);
    expect(shownAsOf(linkSpan({date: ['2023-11-14']}), 2022)).toBe(false);
    expect(shownAsOf(linkSpan({date: ['2023-11-14']}), 2023)).toBe(true);
    expect(shownAsOf(linkSpan({role: ['director']}), 1990)).toBe(true);
    expect(shownAsOf(span, null)).toBe(true);
    expect(yearRange(['2021-02', null, '2019-06-11', 'unknown'])).toEqual({from: 2019, to: 2021});
  });
});

const graph = emptyGraph([relationshipFixture({id: 'r-1', properties: {startDate: ['2019-06-11']}})]);

describe('YearSlider', () => {
  it('runs from the first to the last year named and sets the shared year', async () => {
    mockApi({
      'GET /api/investigations/inv-1/graph': graph,
      'GET /api/investigations/inv-1/timeline': {investigation_id: 'inv-1', events: [{id: 'e', investigation_id: 'inv-1', kind: 'reporter_event', title: 'Paid',
        date_start: '2023-11-14', date_end: null, precision: 'day', verification_status: 'asserted', synthetic: false, sort_key: '2023-11-14', refs: {}, provenance: {}}],
      counts: {}, verification_counts: {}, total: 1, returned: 1, offset: 0},
    });
    wrap(<YearSlider investigationId="inv-1"/>);
    const slider = await screen.findByRole('slider', {name: 'Year'});
    expect(slider).toHaveAttribute('min', '2019');
    expect(slider).toHaveAttribute('max', '2023');
    expect(screen.getByText('all time')).toBeInTheDocument();
    fireEvent.change(slider, {target: {value: '2022'}});
    expect(useWorkbenchStore.getState().asOf).toBe(2022);
    await userEvent.setup().click(screen.getByRole('button', {name: 'All time'}));
    expect(useWorkbenchStore.getState().asOf).toBeNull();
  });
});

describe('How are these two connected?', () => {
  it('asks for every chain between two parties and lights the one chosen', async () => {
    const chain = {parties: [{id: 'a', name: 'Alaric Voss'}, {id: 'm', name: 'Meridian'}, {id: 'v', name: 'MV Fair Tern'}],
      links: [{id: 'l1', schema: 'Directorship', from: 'a', to: 'm', certainty: 'unsupported'}, {id: 'l2', schema: 'Ownership', from: 'm', to: 'v', certainty: 'supported'}],
      weakest: 'unsupported'};
    const api = mockApi({'GET /api/investigations/inv-1/paths': {from_id: 'a', to_id: 'v', max_len: 4, total: 1, truncated: false, chains: [chain]}});
    const onChain = vi.fn();
    wrap(<Connections investigationId="inv-1" parties={[{id: 'a', label: 'Alaric Voss'}, {id: 'm', label: 'Meridian'}, {id: 'v', label: 'MV Fair Tern'}]}
      chain={null} onChain={onChain}/>);
    const user = userEvent.setup();
    await user.click(screen.getByText('How are these two connected?'));
    await user.selectOptions(screen.getByLabelText('First party'), 'a');
    await user.selectOptions(screen.getByLabelText('Second party'), 'v');
    await user.click(screen.getByRole('button', {name: 'Show every chain'}));
    await waitFor(() => expect(api.lastUrl('GET /api/investigations/inv-1/paths').searchParams.get('from')).toBe('a'));
    expect(api.lastUrl('GET /api/investigations/inv-1/paths').searchParams.get('to')).toBe('v');
    const option = await screen.findByRole('button', {name: /Alaric Voss.*Directorship.*Meridian.*Ownership.*MV Fair Tern/});
    // The count shows; the weakest link is its line, its words read with the chain and revealed (Ony, 29 Oct).
    expect(option).toHaveTextContent('2 links');
    expect(option).toHaveAccessibleName(/2 links\s*· at least one link not yet supported/);
    expect(screen.getByText('1 chain')).toBeInTheDocument();
    expect(screen.getByText(/shortest first\. Choose one to light it in the network\./).closest('[hidden]')).not.toBeNull();
    await user.click(option);
    expect(onChain).toHaveBeenCalledWith(chain);
  });
});
