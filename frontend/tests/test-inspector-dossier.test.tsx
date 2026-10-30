// @vitest-environment jsdom
// A party clicked anywhere opens its dossier in the inspector slot over the screen the reporter is on, never by
// jumping to Bring in (BACKLOG "Asked for: navigation"; DECISIONS_LOG 16 and 32): it opens over the current stage
// with no navigation, focus moves in and goes back on close, Esc and × close it, the browser's Back closes it, the
// address names the party so a reload opens it, and "Open in Bring in › Connectors" is the one way to go there.
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {InspectorSlot} from '../features/inspector/inspector-slot';
import {ApiClient} from '../lib/api-client';
import {connectGeneratedClient} from '../lib/api-generated';
import {QueryProvider} from '../lib/query-client';
import {useWorkbenchStore} from '../lib/workbench-store';
import {mockApi} from '../test-support/mock-api';
import {dossierFixture, dossierRoutes, entityFixture, pageRoutes} from '../test-support/page-routes';

const push = vi.fn();
vi.mock('next/navigation', () => ({useRouter: () => ({push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn()}), usePathname: () => '/see',
  useSearchParams: () => new URLSearchParams()}));

const wrap = (node: ReactElement) => render(<QueryProvider>{node}</QueryProvider>);
const entity = entityFixture('ent-1', 'Kestrelwood Holdings Ltd', 'Company');
const slotOf = (): HTMLElement => document.querySelector<HTMLElement>('aside[aria-label="Inspector"]')!;
const partyInAddress = () => new URL(window.location.href).searchParams.get('dossier');

beforeEach(() => {
  connectGeneratedClient(new ApiClient('http://api.test'));
  window.history.replaceState(null, '', '/see?inv=inv-1#the-wire');
  useWorkbenchStore.setState({investigationId: 'inv-1', entityId: '', provenance: null, inspector: [], claim: null, dossier: null, relationship: null});
  push.mockReset();
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false})) as unknown as typeof window.matchMedia;
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Party(): ReactElement {
  return <button type="button" onClick={() => useWorkbenchStore.getState().openDossier('ent-1')}>Kestrelwood</button>;
}

describe('a party opened in the inspector slot', () => {
  it('moves focus in, names the party in the address, and Esc closes it and gives focus back', async () => {
    mockApi(dossierRoutes('ent-1', dossierFixture(entity)));
    wrap(<><Party/><InspectorSlot investigationId="inv-1"/></>);
    expect(slotOf()).not.toBeVisible();

    const user = userEvent.setup();
    const party = screen.getByRole('button', {name: 'Kestrelwood'});
    await user.click(party);
    expect(slotOf()).toBeVisible();
    expect(await screen.findByText('Kestrelwood Holdings Ltd dossier')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Close the inspector'})).toHaveFocus();
    expect(partyInAddress()).toBe('ent-1');
    expect(window.location.pathname).toBe('/see');

    await user.keyboard('{Escape}');
    expect(slotOf()).not.toBeVisible();
    expect(party).toHaveFocus();
    await waitFor(() => expect(partyInAddress()).toBeNull());
  });

  it('closes with ×, and the browser\'s Back closes it too', async () => {
    mockApi(dossierRoutes('ent-1', dossierFixture(entity)));
    wrap(<><Party/><InspectorSlot investigationId="inv-1"/></>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Kestrelwood'}));
    await user.click(screen.getByRole('button', {name: 'Close the inspector'}));
    expect(slotOf()).not.toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Kestrelwood'}));
    expect(slotOf()).toBeVisible();
    expect(window.history.state?.wbSlot).toBe(true);
    // Back: the entry before the slot opened.
    act(() => {
      window.history.replaceState(null, '', '/see?inv=inv-1#the-wire');
      window.dispatchEvent(new PopStateEvent('popstate', {state: null}));
    });
    expect(slotOf()).not.toBeVisible();
    expect(useWorkbenchStore.getState().inspector).toEqual([]);
  });

  it('opens the party named in the address once the case is known', async () => {
    window.history.replaceState({wbSlot: true}, '', '/see?inv=inv-1&dossier=ent-1');
    mockApi(dossierRoutes('ent-1', dossierFixture(entity)));
    wrap(<InspectorSlot investigationId="inv-1"/>);
    expect(await screen.findByText('Kestrelwood Holdings Ltd dossier')).toBeInTheDocument();
    expect(useWorkbenchStore.getState().inspector).toMatchObject([{kind: 'dossier', entityId: 'ent-1'}]);
  });

  it('offers Bring in › Connectors only for a party', async () => {
    mockApi(dossierRoutes('ent-1', dossierFixture(entity)));
    const onOpenInConnectors = vi.fn();
    wrap(<InspectorSlot investigationId="inv-1" onOpenInConnectors={onOpenInConnectors}/>);
    act(() => useWorkbenchStore.getState().openProvenance({title: 'A claim', kind: 'claim'}));
    expect(screen.queryByRole('link', {name: 'Open in Bring in › Connectors'})).toBeNull();
    act(() => useWorkbenchStore.getState().openDossier('ent-1'));
    await userEvent.setup().click(screen.getByRole('link', {name: 'Open in Bring in › Connectors'}));
    expect(onOpenInConnectors).toHaveBeenCalledTimes(1);
    expect(slotOf()).toBeVisible();
  });
});

describe('dossier requests in the case screens', () => {
  it('opens over the current stage without navigating; the Connectors link is the one that goes to Bring in', async () => {
    mockApi({...pageRoutes({investigations: [{id: 'inv-1', name: 'Kestrelwood filings'}], entities: [entity]}), ...dossierRoutes('ent-1', dossierFixture(entity))});
    const {CaseWorkbench} = await import('../components/case/case-workbench');
    wrap(<CaseWorkbench/>);
    act(() => useWorkbenchStore.getState().openDossier('ent-1'));
    expect(await screen.findByText('Kestrelwood Holdings Ltd dossier')).toBeInTheDocument();
    expect(slotOf()).toBeVisible();
    expect(push).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('link', {name: 'Open in Bring in › Connectors'}));
    expect(push).toHaveBeenCalledWith('/bring-in?inv=inv-1#connectors');
    expect(useWorkbenchStore.getState().entityId).toBe('ent-1');
  });
});
