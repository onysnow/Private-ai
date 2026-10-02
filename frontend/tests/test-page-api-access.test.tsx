// @vitest-environment jsdom
// Second real component test in this codebase (STRUCT-0015 remainder), and the
// first against app/page.tsx itself. app/page.tsx is a single ~140-line but
// extremely dense component (60+ useState hooks, dozens of async handlers) --
// too large to decompose or fully cover in one pass (tracked as ongoing).
// This file targets the one flow that's genuinely self-contained regardless of
// the rest of the component: the API-access bootstrap gate that runs on mount
// (loadAppBootstrap) and its "enter a bearer token" recovery path
// (authenticateApi) -- the very first thing a reporter sees before any other
// feature on the page becomes reachable.
//
// Each test dynamically re-imports app/page.tsx after vi.resetModules() so the
// module-level `api` singleton (constructed once at import time in page.tsx)
// starts with a clean, unauthenticated ApiClient instance every time, rather
// than leaking a bearer token set by a previous test.
//
// The stub answers by route (ADR-0005, line 15): a server that needs a token
// answers the settings status 401 until the request carries one.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {RouteCall} from '../test-support/mock-api';
import {pageRoutes, validSettingsStatus} from '../test-support/page-routes';

// jsdom doesn't implement matchMedia; the `sonner` toast library (rendered
// unconditionally via <Toaster/>) reads it during mount. Polyfill defensively
// so an unrelated dependency's environment assumption can't fail this file's
// actual target (the API-access flow).
beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

const SETTINGS = 'GET /api/settings/status';

/** The bearer credential a request carried, if any. */
function authorization(call: RouteCall): string | null {
  return new Headers(call.init.headers).get('authorization');
}

/** A settings status that needs a token: 401 without one, the status with it. */
function settingsBehindToken(call: RouteCall): unknown {
  return authorization(call) ? validSettingsStatus : {status: 401, body: {detail: 'Missing bearer token'}};
}

describe('Home API-access bootstrap', () => {
  it('bootstraps successfully and shows the local-only access message with no token gate', async () => {
    // An empty investigation list: no per-investigation loads follow.
    const api = mockApi(pageRoutes());

    const Home = await importHome();
    render(<Home />);

    await screen.findByText(
      'API: local access',
    );
    expect(
      screen.queryByPlaceholderText('Bearer token for this session'),
    ).not.toBeInTheDocument();
    // Exactly the three bootstrap routes, once each, and nothing else.
    expect(api.calls(SETTINGS)).toHaveLength(1);
    expect(api.calls('GET /api/investigations')).toHaveLength(1);
    expect(api.calls('GET /api/connectors')).toHaveLength(1);
    expect(api.fetch).toHaveBeenCalledTimes(3);
    expect(api.unmatched()).toEqual([]);
  });

  it('shows the token gate on a 401, then authenticates successfully with a bearer token', async () => {
    const api = mockApi({...pageRoutes(), [SETTINGS]: settingsBehindToken});

    const Home = await importHome();
    render(<Home />);

    const tokenInput = await screen.findByPlaceholderText(
      'Bearer token for this session',
    );
    const connectButton = screen.getByRole('button', {name: 'Connect'});
    expect(connectButton).toBeDisabled();
    // Round 1 (on mount, no token yet): the bootstrap stops at the 401.
    expect(api.calls(SETTINGS)).toHaveLength(1);
    expect(api.calls('GET /api/investigations')).toHaveLength(0);

    const user = userEvent.setup();
    await user.type(tokenInput, 'test-token-123');
    expect(connectButton).toBeEnabled();
    await user.click(connectButton);

    await screen.findByText(
      'API: session active',
    );
    expect(
      screen.queryByPlaceholderText('Bearer token for this session'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Clear session token'}),
    ).toBeInTheDocument();

    // Round 2 (after authenticateApi() sets the token and re-bootstraps): the
    // second settings/status call is the one made with the freshly-entered
    // token attached as a bearer credential; the first, pre-auth call must
    // NOT have carried any credential.
    expect(api.calls(SETTINGS).map(authorization)).toEqual([null, 'Bearer test-token-123']);
    expect(api.calls('GET /api/investigations')).toHaveLength(1);
    expect(api.calls('GET /api/connectors')).toHaveLength(1);
    expect(api.fetch).toHaveBeenCalledTimes(4);
    expect(api.unmatched()).toEqual([]);
  });

  it('clearApiSession drops the token and re-runs the bootstrap unauthenticated', async () => {
    // Initial mount: the simplest path to reach the authenticated `Clear
    // session token` control is to drive it through the same 401 -> connect
    // path.
    const api = mockApi({...pageRoutes(), [SETTINGS]: settingsBehindToken});

    const Home = await importHome();
    render(<Home />);

    const user = userEvent.setup();
    const tokenInput = await screen.findByPlaceholderText(
      'Bearer token for this session',
    );
    await user.type(tokenInput, 'another-token');
    await user.click(screen.getByRole('button', {name: 'Connect'}));
    await screen.findByRole('button', {name: 'Clear session token'});

    // After Clear session token: bootstrap re-runs with no token, and this
    // fixture's settings/status has access.mode 'local_only', so it comes
    // back authenticated-free (api.hasAuthToken() is false again).
    api.add({[SETTINGS]: validSettingsStatus});
    await user.click(screen.getByRole('button', {name: 'Clear session token'}));

    await screen.findByText(
      'API: local access',
    );
    expect(
      screen.queryByRole('button', {name: 'Clear session token'}),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(7));
    // The post-clear settings/status call must not carry the cleared token
    // forward.
    expect(api.calls(SETTINGS).map(authorization)).toEqual([null, 'Bearer another-token', null]);
    expect(api.calls('GET /api/investigations')).toHaveLength(2);
    expect(api.calls('GET /api/connectors')).toHaveLength(2);
    expect(api.unmatched()).toEqual([]);
  });

  it('unmounting the workbench page does not clear the shared API auth token', async () => {
    // `api` (lib/api-instance.ts) is an explicitly-documented shared singleton
    // used by /, /settings, and /dashboard specifically so a settings-page auth
    // change is visible from the workbench without re-importing it. Home's own
    // mount effect must only abort its in-flight requests on unmount, not wipe
    // that shared token -- otherwise ordinary client-side navigation away from
    // `/` (e.g. to Settings) logs every other route out from under the user.
    mockApi({...pageRoutes(), [SETTINGS]: settingsBehindToken});

    vi.resetModules();
    const pageMod = await import('../app/page');
    const Home = pageMod.default;
    const {api} = await import('../lib/api-instance');

    const user = userEvent.setup();
    const {unmount} = render(<Home />);

    const tokenInput = await screen.findByPlaceholderText(
      'Bearer token for this session',
    );
    await user.type(tokenInput, 'survives-unmount-token');
    await user.click(screen.getByRole('button', {name: 'Connect'}));
    await screen.findByRole('button', {name: 'Clear session token'});

    expect(api.hasAuthToken()).toBe(true);
    unmount();
    expect(api.hasAuthToken()).toBe(true);
  });
});
