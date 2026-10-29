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

const inboxRow = (key: string, kind: string, title: string, extra: Record<string, unknown> = {}) => ({
  key, kind, title, reason: '', href: '/decide?kind=to_check', created_at: '2026-10-09T10:00:00', level: null, actor: 'Red Flags', actor_kind: 'app', route: 'needs', ...extra,
});
const inbox = (needs: unknown[], rest: unknown[] = []) => ({investigation_id: 'inv-1', interrupt: [], needs, else: rest, week: {}, quiet_while_reading: true, desktop: false});

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  useWorkbenchStore.setState({investigationId: 'inv-1'});
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('Inbox', () => {
  it('lists what needs you, then everything else, and snoozes a row on this computer', async () => {
    mockApi({
      'GET /api/investigations/inv-1/inbox': inbox(
        [inboxRow('d:to_check:c1', 'to_check', 'Does page 4 show the nominee?'), inboxRow('d:to_check:c2', 'to_check', 'Is Bellcastle the same company?')],
        [inboxRow('c:documents:3', 'documents', '3 documents added this week', {actor: '', actor_kind: 'person', route: 'else'})]),
    });
    render(<QueryProvider><Inbox open onClose={vi.fn()}/></QueryProvider>);
    const needs = await screen.findByRole('tabpanel', {name: 'Needs you'});
    expect(await within(needs).findByText('Does page 4 show the nominee?')).toBeInTheDocument();
    const user = userEvent.setup();
    const row = within(needs).getByText('Does page 4 show the nominee?').closest('li')!;
    // Who sent a row is on hover or focus; its kind is Decide's mark.
    expect(within(row).getByText('Red Flags').closest('[hidden]')).not.toBeNull();
    expect(row.querySelector('.dc-kind-to_check')).not.toBeNull();
    await user.click(within(row).getByRole('button', {name: 'Snooze a day'}));
    expect(within(needs).queryByText('Does page 4 show the nominee?')).not.toBeInTheDocument();
    // The count shows; what snoozing means is on hover or focus (Ony, 29 Oct).
    expect(screen.getByText('1 snoozed')).toBeInTheDocument();
    expect(screen.getByText('Snoozed on this computer; each comes back by itself.').closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('tab', {name: /Needs you/})).toHaveTextContent('1');
    await user.click(screen.getByRole('tab', {name: /Everything else/}));
    expect(await screen.findByText('3 documents added this week')).toBeInTheDocument();
  });
});

describe('Inbox rows from Settings › Notifications', () => {
  it('shows a changed watch with what changed and marks it seen', async () => {
    const api = mockApi({
      'GET /api/investigations/inv-1/inbox': inbox([inboxRow('w:wa1:disputed', 'watch', 'Kestrel SA bought the harbour land', {reason: 'Lead → Disputed', actor: 'You watch this', href: '/check#claim-verification'})]),
      'POST /api/watches/wa1/seen': {id: 'wa1'},
    });
    render(<QueryProvider><Inbox open onClose={vi.fn()}/></QueryProvider>);
    // A watched fact's change is the news itself: it stays on screen.
    expect((await screen.findByText('Lead → Disputed')).closest('[hidden]')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Seen'}));
    expect(api.calls('POST /api/watches/wa1/seen')).toHaveLength(1);
    expect(screen.getByRole('link', {name: 'Choose what goes where'})).toHaveAttribute('href', '/settings#notifications');
  });
});
