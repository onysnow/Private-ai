// @vitest-environment jsdom
// The inspector slot (features/inspector/inspector-slot.tsx; DECISIONS_LOG 16): a record's Chain of Custody and a
// party's dossier open in one slot at the right. Opening from the page replaces what is there; a link followed inside
// the slot moves along the trail; Back or Esc steps back, and from the first step Esc closes (BACKLOG P1: the old
// drawer ignored Esc).
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  return (await import('../components/case/workbench-all')).default;
}

describe('the inspector slot', () => {
  it('replaces from the page, follows a trail from inside, and steps back with Esc', async () => {
    mockApi(pageRoutes({investigations: [{id: 'inv-1', name: 'Kestrelwood filings'}]}));
    const Home = await importHome();
    const {useWorkbenchStore} = await import('../lib/workbench-store');
    render(<Home/>);
    await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});
    const slot = screen.getByLabelText('Inspector', {selector: 'aside'});
    expect(slot).not.toBeVisible();

    act(() => useWorkbenchStore.getState().openProvenance({title: 'A claim', kind: 'claim'}));
    await waitFor(() => expect(slot).toBeVisible());
    expect(within(slot).getByRole('heading', {name: 'Chain of Custody'})).toBeInTheDocument();
    // Opened from the page again: it replaces, so the trail stays one step long.
    act(() => useWorkbenchStore.getState().openProvenance({title: 'Another claim', kind: 'claim'}));
    expect(within(slot).getByRole('navigation', {name: 'Trail'}).textContent).toBe('Custody: Another claim');

    // A link inside the slot moves along the trail, and Back is offered.
    const {markSlotInteraction} = await import('../lib/workbench-store');
    act(() => { markSlotInteraction(); useWorkbenchStore.getState().openProvenance({title: 'Its source', kind: 'source'}); });
    expect(within(slot).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Custody: Another claim', 'Custody: Its source']);
    expect(useWorkbenchStore.getState().provenance?.request.title).toBe('Its source');
    expect(within(slot).getByRole('button', {name: '‹ Back'})).toBeInTheDocument();

    fireEvent.keyDown(window, {key: 'Escape'});
    expect(within(slot).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Custody: Another claim']);
    expect(useWorkbenchStore.getState().provenance?.request.title).toBe('Another claim');
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(slot).not.toBeVisible());
    expect(useWorkbenchStore.getState().provenance).toBeNull();
  });
});
