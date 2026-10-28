// @vitest-environment jsdom
// The Chain of Custody drawer closes with Esc, as the other sheets do (BACKLOG, browser walkthrough P1: it ignored Esc).
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  return (await import('../components/case/workbench-all')).default;
}

describe('Chain of Custody drawer', () => {
  it('closes with Esc', async () => {
    mockApi(pageRoutes({investigations: [{id: 'inv-1', name: 'Kestrelwood filings'}]}));
    const Home = await importHome();
    const {useWorkbenchStore} = await import('../lib/workbench-store');
    const {container} = render(<Home/>);
    await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});
    const drawer = container.querySelector<HTMLElement>('aside.wb-drawer')!;
    expect(drawer).toHaveAttribute('aria-label', 'Chain of Custody');
    expect(drawer).not.toBeVisible();
    act(() => useWorkbenchStore.getState().openProvenance({title: 'A claim', kind: 'claim'}));
    await waitFor(() => expect(drawer).toBeVisible());
    fireEvent.keyDown(window, {key: 'Escape'});
    await waitFor(() => expect(drawer).not.toBeVisible());
    expect(useWorkbenchStore.getState().provenance).toBeNull();
  });
});
