// @vitest-environment jsdom
// Red Flags (features/red-flags/red-flags-panel.tsx): each card puts the
// innocent explanations first, cites where the pattern was documented, shows
// how it ranks and why, and lets the reporter add it to leads or set it aside
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
  links: ['l1', 'l2'], facts: {}, not_shown: ['whether there was a business reason'], summary: 'Ownership runs in a loop: A Ltd → B Ltd → A Ltd.',
  first_seen_at: '2026-10-10T00:00:00', last_seen_at: '2026-10-10T00:00:00', gone_at: null,
  indicator: {id: 'BO-001', name: 'Circular ownership', definition: 'Companies own each other in a loop.', area: 'BO', area_name: 'Hidden ownership and shell companies',
    levels: {faint: 'To be set', strong: 'To be set', textbook: 'Meets the published definition as worded', threshold_source: 'none', threshold_note: 'Applies in the UK only.'},
    sources: [{title: 'Concealment of Beneficial Ownership', publisher: 'FATF and Egmont Group', url: 'https://example.test/fatf', locator: 'Annex E', quote: 'circular ownership'}],
    innocent_explanations: ['Group cross-holdings or treasury shares.'], cross_hints: [{target_area: 'ML', reason: 'Loops are used to layer funds.', source_url: 'https://example.test/x'}], version: 1},
};
const boPick = {key: 'BO', name: 'Hidden ownership and shell companies', reasons: ['Red Flag: Circular ownership (BO-001)']};
const appType = {set_by: 'app', areas: [boPick], suggested: [boPick]};
const body = (flags: unknown[], investigation_type: unknown = appType) =>
  ({investigation_id: 'inv-1', rules: [{indicator_id: 'BO-001', version: 1, name: 'Circular ownership'}, {indicator_id: 'ML-021', version: 1, name: 'Structuring'}],
    cannot_run: [{indicator_id: 'ML-021', name: 'Structuring', reason: 'Needs Payment records; none in this case yet.'}], flags, gone: [], investigation_type});

describe('RedFlagsPanel', () => {
  it('keeps the card to what is needed and opens the rest in a drawer, innocent explanations first', async () => {
    mockApi({'GET /api/investigations/inv-1/red-flags': body([flag])});
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    const card = await screen.findByRole('article', {name: 'Red Flag: Circular ownership'});
    expect(screen.getByText('1 of 2 checks ran')).toBeInTheDocument();
    expect(screen.getByText(/Needs Payment records; none in this case yet\./)).toBeInTheDocument();
    expect(within(card).getByText('Textbook · it meets the published definition or threshold')).toBeInTheDocument();
    expect(card).toHaveClass('level-textbook');
    expect(within(card).getByText(/Group cross-holdings or treasury shares/)).toBeInTheDocument();
    expect(within(card).getByText(/whether there was a business reason/)).toBeInTheDocument();
    expect(within(card).queryByRole('link', {name: /FATF and Egmont Group/})).toBeNull();
    expect(within(card).queryByText('Applies in the UK only.')).toBeNull();
    expect(screen.getByRole('heading', {level: 4, name: 'Hidden ownership and shell companies'})).toBeInTheDocument();
    const user = userEvent.setup();
    await user.hover(within(card).getByRole('button', {name: 'A Ltd'}));
    expect(useWorkbenchStore.getState().pointedParty).toBe('a');

    await user.click(within(card).getByRole('button', {name: 'Details: Circular ownership'}));
    const drawer = screen.getByRole('complementary', {name: 'Red Flag details: Circular ownership'});
    expect(within(drawer).getAllByRole('heading', {level: 4}).map(h => h.textContent)).toEqual(['Could be innocent', 'Why it matters', 'Source', 'Ranking']);
    expect(drawer.querySelector('.rf-unknown')?.textContent).toBe("The records can't show. whether there was a business reason. A person decides that, in To check.");
    expect(within(drawer).getByText('Applies in the UK only.')).not.toBeVisible();
    await user.click(within(drawer).getByText('About the numbers'));
    expect(within(drawer).getByText('Applies in the UK only.')).toBeVisible();
    expect(within(drawer).getByRole('link', {name: /FATF and Egmont Group/})).toHaveAttribute('href', 'https://example.test/fatf');
    expect(within(drawer).getByText(/-0.3 rests on a link not yet supported/)).toBeInTheDocument();
    // A party in the details opens its dossier, as a party does in the network.
    await user.click(within(drawer).getByRole('button', {name: 'A Ltd'}));
    expect(useWorkbenchStore.getState().dossier?.entityId).toBe('a');
    await user.click(within(drawer).getByRole('button', {name: 'Close the details'}));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('sets a flag aside only with a reason, and adds one to leads', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/red-flags': body([flag]),
      'POST /api/red-flags/f-1/dismiss': body([{...flag, status: 'dismissed', dismissed_reason: 'Known group structure'}]),
      'POST /api/red-flags/f-1/lead': {id: 'lead-1'},
    });
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', {name: 'Not relevant'}));
    await user.click(screen.getByRole('button', {name: 'Set aside'}));
    expect(await screen.findByText('Write why first.')).toBeInTheDocument();
    expect(screen.getByLabelText('Why it is not relevant')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls('POST /api/red-flags/f-1/dismiss')).toHaveLength(0);
    await user.type(screen.getByLabelText('Why it is not relevant'), 'Known group structure');
    await user.click(screen.getByRole('button', {name: 'Set aside'}));
    await waitFor(() => expect(api.lastBody('POST /api/red-flags/f-1/dismiss')).toEqual({reason: 'Known group structure'}));
    expect(await screen.findByText('Known group structure')).toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Add to leads'}));
    await waitFor(() => expect(api.calls('POST /api/red-flags/f-1/lead')).toHaveLength(1));
  });

  it(`lists the investigation's own areas first and the rest under "This may also point to"; the reporter can change the type`, async () => {
    const other = {...flag, id: 'f-2', indicator_id: 'ML-023', summary: 'Money goes round.',
      indicator: {...flag.indicator, id: 'ML-023', name: 'Circular payments', area: 'ML', area_name: 'Money laundering'}};
    const chosen = {set_by: 'reporter', areas: [{key: 'ML', name: 'Money laundering', reasons: ['Chosen by the reporter']}], suggested: [boPick]};
    let current: unknown = appType;
    const api = mockApi({
      'GET /api/investigations/inv-1/red-flags': () => body([flag, other], current),
      'GET /api/catalogue/areas': [{key: 'BO', name: 'Hidden ownership and shell companies', scope: '', summary: 'Hiding who owns a company.', indicators: 58, verified: 3, terms: 1},
        {key: 'ML', name: 'Money laundering', scope: '', summary: 'Moving criminal money so it looks clean.', indicators: 79, verified: 3, terms: 1},
        {key: 'SA', name: 'Safety of investigators', scope: '', summary: 'Danger to the reporter.', indicators: 50, verified: 3, terms: 1},
        {key: 'APP', name: "The app's own names", scope: '', summary: '', indicators: 0, verified: 0, terms: 7}],
      'PUT /api/investigations/inv-1/type': () => { current = chosen; return chosen; },
    });
    wrap(<RedFlagsPanel investigationId="inv-1"/>);
    const type = await screen.findByRole('group', {name: 'Type of investigation'});
    expect(type).toHaveTextContent('TypeHidden ownership and shell companieschosen by the appChange');
    const headings = () => screen.getAllByRole('heading').map(h => h.textContent);
    expect(headings()).toEqual(['Red Flags', 'Hidden ownership and shell companies', 'Circular ownership', 'This may also point to', 'Money laundering', 'Circular payments']);
    const user = userEvent.setup();
    await user.click(within(type).getByRole('button', {name: 'Change'}));
    const suggested = within(type).getByRole('region', {name: 'Suggested'});
    const bo = within(suggested).getByRole('button', {name: /Hidden ownership and shell companies/});
    expect(bo).toHaveAttribute('aria-pressed', 'true');
    expect(bo).toHaveTextContent('Circular ownership (BO-001)');
    const ml = await within(type).findByRole('button', {name: /Money laundering/});
    expect(ml).toHaveTextContent('Moving criminal money so it looks clean.79 indicators · 1 Red Flag fired here');
    expect(within(type).queryByRole('button', {name: /Safety of investigators/})).toBeNull();
    await user.type(within(type).getByLabelText('Search areas'), 'nothing like this');
    expect(within(type).getByText('No area matches.')).toBeInTheDocument();
    await user.clear(within(type).getByLabelText('Search areas'));
    await user.click(bo);
    expect(within(type).getByRole('button', {name: 'Save'})).toBeDisabled();
    await user.click(within(type).getByRole('button', {name: /Money laundering/}));
    await user.click(within(type).getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(api.lastBody('PUT /api/investigations/inv-1/type')).toEqual({areas: ['ML']}));
    expect(await within(type).findByText('chosen by you')).toBeInTheDocument();
    await waitFor(() => expect(headings()).toEqual(['Red Flags', 'Money laundering', 'Circular payments', 'This may also point to', 'Hidden ownership and shell companies', 'Circular ownership']));
  });
});
