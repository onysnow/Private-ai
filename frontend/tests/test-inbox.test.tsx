// @vitest-environment jsdom
// The inbox behind the bell: what needs you apart from everything else, and snooze.
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Inbox} from '../features/inbox/inbox';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';

vi.mock('next/navigation', () => ({useRouter: () => ({push: vi.fn()}), usePathname: () => '/', useSearchParams: () => new URLSearchParams()}));

const item = (id: string, question: string) => ({
  kind: 'to_check', id, question, proposal: 'p', actor: 'Red Flags', actor_kind: 'app', created_at: '2026-10-09T10:00:00', rank: 1, reason: 'r',
  level: null, group: {key: 'g', label: 'g'}, evidence: null, parties: [], consequences: [], choices: [], open: {href: '/check', label: 'Open'},
});

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1'});
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('Inbox', () => {
  it('lists what needs you, then everything else, and snoozes a row on this computer', async () => {
    mockApi({
      'GET /api/investigations/inv-1/decisions': {investigation_id: 'inv-1', counts: {to_check: 2}, total: 2, offset: 0,
        items: [item('c1', 'Does page 4 show the nominee?'), item('c2', 'Is Bellcastle the same company?')]},
      'GET /api/investigations/inv-1/since': {investigation_id: 'inv-1', after: '2026-10-05T00:00:00',
        changes: [{key: 'ai', count: 3, label: 'AI drafts to review', actor_kind: 'ai', href: '/decide?kind=ai', level: null}]},
    });
    render(<QueryProvider><Inbox open onClose={vi.fn()}/></QueryProvider>);
    const needs = await screen.findByRole('tabpanel', {name: 'Needs you'});
    expect(await within(needs).findByText('Does page 4 show the nominee?')).toBeInTheDocument();
    const user = userEvent.setup();
    const row = within(needs).getByText('Does page 4 show the nominee?').closest('li')!;
    await user.click(within(row).getByRole('button', {name: 'Snooze a day'}));
    expect(within(needs).queryByText('Does page 4 show the nominee?')).not.toBeInTheDocument();
    expect(screen.getByText('1 snoozed on this computer; each comes back by itself.')).toBeInTheDocument();
    expect(screen.getByRole('tab', {name: /Needs you/})).toHaveTextContent('1');
    await user.click(screen.getByRole('tab', {name: /Everything else/}));
    expect(await screen.findByText('3 AI drafts to review')).toBeInTheDocument();
  });
});
