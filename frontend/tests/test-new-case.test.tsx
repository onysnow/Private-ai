// @vitest-environment jsdom
// Starting a case: name and question, the kinds of case, and what you have so far decides where you land.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {NewCaseSetup} from '../features/new-case/new-case-setup';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push}), usePathname: () => '/', useSearchParams: () => new URLSearchParams()}));

const area = (key: string, name: string) => ({key, name, scope: '', summary: `${name} in a line`, indicators: 3, verified: 2, terms: 4});
const CASE = {id: 'inv-9', name: 'Harbour', description: null, question: null, is_demo: false, type_areas: null, created_at: '2026-10-12T00:00:00'};

beforeEach(() => { connectGeneratedClient(new ApiClient('http://api.test')); push.mockReset(); });
afterEach(() => cleanup());

describe('NewCaseSetup', () => {
  it('creates the case, keeps the kinds chosen, and lands where what you have goes', async () => {
    const api = mockApi({
      'GET /api/catalogue/areas': [area('ML', 'Money laundering'), area('BO', 'Hidden ownership and shell companies'), area('HT', 'Human trafficking and forced labour')],
      'POST /api/investigations': CASE,
      'PUT /api/investigations/inv-9/type': {set_by: 'reporter', areas: [], suggested: []},
      'GET /api/investigations': [CASE],
    });
    const onCreated = vi.fn();
    render(<QueryProvider><NewCaseSetup onCreated={onCreated}/></QueryProvider>);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', {name: 'Name'}), 'Harbour');
    await user.type(screen.getByRole('searchbox', {name: 'Find a kind of case'}), 'shell');
    expect(screen.queryByRole('button', {name: 'Money laundering'})).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', {name: 'Hidden ownership and shell companies'}));
    await user.click(screen.getByRole('radio', {name: /Names to look up/}));
    await user.click(screen.getByRole('button', {name: 'Start the case'}));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('inv-9'));
    expect(api.lastBody('PUT /api/investigations/inv-9/type')).toEqual({areas: ['BO']});
    expect(push).toHaveBeenCalledWith('/bring-in?inv=inv-9#investigation-search');
    expect(useWorkbenchStore.getState().investigationId).toBe('inv-9');
  });
});
