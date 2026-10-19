// @vitest-environment jsdom
// What stands out in the corpus (features/corpus/corpus-insights.tsx; backend
// app/services/openaleph_discover.py): asked for only when opened, each name
// with its documents and what it is mentioned alongside, a known record opens
// its dossier, and any other name can be made a lead -- by the reporter.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {CorpusInsights, leadDetail} from '../features/corpus/corpus-insights';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {leadBody} from '../test-support/page-routes';

const INSIGHTS = 'GET /api/investigations/inv-1/corpus/insights';
const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', dossier: null});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const term = (name: string, overrides: Record<string, unknown> = {}) => ({
  name, documents: 4, alongside: [], record_id: null, lead_id: null, lead_key: `discover:people:${name.toLowerCase()}`, ...overrides});
const insights = (groups: unknown[], overrides: Record<string, unknown> = {}) => ({
  investigation_id: 'inv-1', state: 'ok', detail: null, collection_id: '3', groups, ...overrides});

describe('CorpusInsights', () => {
  it('shows what stands out, opens a known record and makes a lead of another', async () => {
    const voss = term('Alaric Voss', {alongside: [{kind: 'companies', name: 'Meridian Holdings Ltd', documents: 3}, {kind: 'places', name: 'Limassol', documents: 2}]});
    const api = mockApi({
      [INSIGHTS]: insights([
        {kind: 'people', label: 'People', terms: [voss]},
        {kind: 'companies', label: 'Companies', terms: [term('Meridian Holdings Ltd', {record_id: 'ent-1', lead_key: 'discover:companies:meridian holdings ltd'})]},
      ]),
      'POST /api/leads': leadBody({title: 'Alaric Voss', provider: 'openaleph', provider_record_id: voss.lead_key, kind: 'connector'}),
    });
    wrap(<CorpusInsights investigationId="inv-1"/>);
    expect(api.calls(INSIGHTS)).toHaveLength(0);   // asked for only when opened
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Show what stands out'}));

    const people = within(await screen.findByRole('list', {name: 'People'}));
    expect(people.getByText('Alaric Voss')).toBeInTheDocument();
    expect(people.getByText('Alongside: Meridian Holdings Ltd (3), Limassol (2)')).toBeInTheDocument();
    await user.click(within(screen.getByRole('list', {name: 'Companies'})).getByRole('button', {name: 'Open dossier'}));
    expect(useWorkbenchStore.getState().entityId).toBe('ent-1');

    await user.click(people.getByRole('button', {name: 'Add to leads'}));
    expect(await screen.findByText('“Alaric Voss” was added to leads.')).toBeInTheDocument();
    expect(api.lastBody('POST /api/leads')).toEqual({investigation_id: 'inv-1', title: 'Alaric Voss', provider: 'openaleph',
      provider_record_id: 'discover:people:alaric voss',
      detail: "OpenAleph's analysis found “Alaric Voss” in 4 document(s) of this investigation's corpus, most often alongside Meridian Holdings Ltd, Limassol."});
    expect(api.calls(INSIGHTS)).toHaveLength(2);   // read again, so the name now shows as a lead
  });

  it('says why there is nothing to show', async () => {
    mockApi({[INSIGHTS]: insights([], {state: 'no_collection', detail: 'No document of this investigation has been sent to OpenAleph yet.', collection_id: null})});
    wrap(<CorpusInsights investigationId="inv-1"/>);
    await userEvent.setup().click(screen.getByRole('button', {name: 'Show what stands out'}));
    expect(await screen.findByText('No document of this investigation has been sent to OpenAleph yet.')).toBeInTheDocument();
  });

  it('writes the lead without an alongside list when there is none', () => {
    expect(leadDetail(term('Orrin Ltd', {documents: 1}) as never)).toBe("OpenAleph's analysis found “Orrin Ltd” in 1 document(s) of this investigation's corpus.");
  });
});
