// @vitest-environment jsdom
// Red Flags (features/red-flags/red-flags-panel.tsx): each card puts the
// innocent explanations first, cites where the pattern was documented, shows
// how it ranks and why, and lets the reporter make it a lead or set it aside
// with a reason. Pointing at a party lights it in every chart.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {RedFlagsPanel} from '../features/red-flags/red-flags-panel';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', pointedParty: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const flag = {
  id: 'f-1', indicator_id: 'BO-001', rule_version: 1, level: 'textbook', status: 'open', dismissed_reason: null, lead_id: null,
  weight: 0.95, weight_parts: [{why: 'one flag', value: 1}, {why: '1 other open flag on the same parties', value: 0.25},
    {why: 'rests on a link not yet supported by reviewed claims or evidence', value: -0.3}],
  parties: [{id: 'a', name: 'A Ltd', schema: 'Company'}, {id: 'b', name: 'B Ltd', schema: 'Company'}],
  links: ['l1', 'l2'], facts: {}, summary: 'Ownership runs in a loop: A Ltd → B Ltd → A Ltd.',
  first_seen_at: '2026-10-10T00:00:00', last_seen_at: '2026-10-10T00:00:00', gone_at: null,
  indicator: {id: 'BO-001', name: 'Circular ownership', definition: 'Companies own each other in a loop.', area: 'BO', area_name: 'Hidden ownership and shell companies',
    levels: {faint: 'To be set', strong: 'To be set', textbook: 'Meets the published definition as worded', threshold_source: 'none'},
    sources: [{title: 'Concealment of Beneficial Ownership', publisher: 'FATF and Egmont Group', url: 'https://example.test/fatf', locator: 'Annex E', quote: 'circular ownership'}],
    innocent_explanations: ['Group cross-holdings or treasury shares.'], cross_hints: [{target_area: 'ML', reason: 'Loops are used to layer funds.', source_url: 'https://example.test/x'}], version: 1},
};
const body = (flags: unknown[]) => ({investigation_id: 'inv-1', rules: [{indicator_id: 'BO-001', version: 1, name: 'Circular ownership'}], flags, gone: []});

describe('RedFlagsPanel', () => {
  it('shows the flag with its innocent explanations, source, level and ranking, and lights a party when pointed at', async () => {
    mockApi({'GET /api/investigations/inv-1/red-flags': body([flag])});
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    const card = await screen.findByRole('article', {name: 'Red Flag: Circular ownership'});
    expect(within(card).getByText('Textbook · it meets the published definition or threshold')).toBeInTheDocument();
    expect(card).toHaveClass('level-textbook');
    expect(within(card).getByText(/Group cross-holdings/)).toBeInTheDocument();
    expect(within(card).getByRole('link', {name: /FATF and Egmont Group/})).toHaveAttribute('href', 'https://example.test/fatf');
    expect(within(card).getByText(/-0.3 rests on a link not yet supported/)).toBeInTheDocument();
    expect(screen.getByRole('heading', {level: 4, name: 'Hidden ownership and shell companies'})).toBeInTheDocument();
    await userEvent.setup().hover(within(card).getByRole('button', {name: 'A Ltd'}));
    expect(useWorkbenchStore.getState().pointedParty).toBe('a');
  });

  it('sets a flag aside only with a reason, and makes one a lead', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/red-flags': body([flag]),
      'POST /api/red-flags/f-1/dismiss': body([{...flag, status: 'dismissed', dismissed_reason: 'Known group structure'}]),
      'POST /api/red-flags/f-1/lead': {id: 'lead-1'},
    });
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Not relevant'}));
    expect(screen.getByRole('button', {name: 'Set aside'})).toBeDisabled();
    await user.type(screen.getByLabelText('Why it is not relevant'), 'Known group structure');
    await user.click(screen.getByRole('button', {name: 'Set aside'}));
    await waitFor(() => expect(api.lastBody('POST /api/red-flags/f-1/dismiss')).toEqual({reason: 'Known group structure'}));
    expect(await screen.findByText('Known group structure')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Make it a lead'}));
    await waitFor(() => expect(api.calls('POST /api/red-flags/f-1/lead')).toHaveLength(1));
  });
});
