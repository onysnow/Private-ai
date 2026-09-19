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
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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

const validSettingsStatus = {
  environment: 'test',
  database: 'sqlite',
  document_storage_dir: '/tmp/docs',
  limits: {},
  restore_api_enabled: true,
  document_extraction: {
    pdf_ocr_enabled: false,
    pdf_ocr_language: 'eng',
    pdf_ocr_dpi: 300,
    pdf_ocr_min_native_chars: 200,
    local_entity_suggestions_enabled: false,
    entity_extraction_owner: 'workbench_local',
    ocr_runtime: {
      available: false,
      requested_languages: [],
      missing_languages: [],
      detail: 'not checked',
    },
  },
  access: {
    remote_api_enabled: false,
    mode: 'local_only',
    token_configured: false,
  },
  cors_allowed_origins: [],
  connectors: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../app/page');
  return mod.default;
}

describe('Home API-access bootstrap', () => {
  it('bootstraps successfully and shows the local-only access message with no token gate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET /api/settings/status
      .mockResolvedValueOnce(jsonResponse([])) // GET /api/investigations (empty -> no cascade of per-investigation loads)
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})); // GET /api/connectors
    vi.stubGlobal('fetch', fetchMock);

    const Home = await importHome();
    render(<Home />);

    await screen.findByText(
      'Local-only API access. No bearer token is required on loopback.',
    );
    expect(
      screen.queryByPlaceholderText('Bearer token for this session'),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shows the token gate on a 401, then authenticates successfully with a bearer token', async () => {
    const fetchMock = vi
      .fn()
      // Round 1 (on mount, no token yet): settings/status rejects with 401.
      .mockResolvedValueOnce(
        jsonResponse({detail: 'Missing bearer token'}, 401),
      )
      // Round 2 (after authenticateApi() sets the token and re-bootstraps):
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']}));
    vi.stubGlobal('fetch', fetchMock);

    const Home = await importHome();
    render(<Home />);

    const tokenInput = await screen.findByPlaceholderText(
      'Bearer token for this session',
    );
    const connectButton = screen.getByRole('button', {name: 'Connect'});
    expect(connectButton).toBeDisabled();

    const user = userEvent.setup();
    await user.type(tokenInput, 'test-token-123');
    expect(connectButton).toBeEnabled();
    await user.click(connectButton);

    await screen.findByText(
      'Authenticated for this browser session. Token is held only in memory.',
    );
    expect(
      screen.queryByPlaceholderText('Bearer token for this session'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Clear session token'}),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    // The second settings/status call (index 1) is the one made with the
    // freshly-entered token attached as a bearer credential.
    const secondCallHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(secondCallHeaders.get('authorization')).toBe(
      'Bearer test-token-123',
    );
    // The first, pre-auth call must NOT have carried any credential.
    const firstCallHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(firstCallHeaders.get('authorization')).toBeNull();
  });

  it('clearApiSession drops the token and re-runs the bootstrap unauthenticated', async () => {
    const fetchMock = vi
      .fn()
      // Initial mount: authenticate straight away by having settings/status
      // succeed (local-only, no token needed yet) -- simplest path to reach
      // the authenticated `Clear session token` control for this test's
      // purpose is instead to drive it through the same 401 -> connect path.
      .mockResolvedValueOnce(jsonResponse({detail: 'no token'}, 401))
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']}))
      // After Clear session token: bootstrap re-runs with no token, and this
      // fixture's settings/status has access.mode 'local_only', so it comes
      // back authenticated-free (api.hasAuthToken() is false again).
      .mockResolvedValueOnce(jsonResponse(validSettingsStatus))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({providers: ['aleph']}));
    vi.stubGlobal('fetch', fetchMock);

    const Home = await importHome();
    render(<Home />);

    const user = userEvent.setup();
    const tokenInput = await screen.findByPlaceholderText(
      'Bearer token for this session',
    );
    await user.type(tokenInput, 'another-token');
    await user.click(screen.getByRole('button', {name: 'Connect'}));
    await screen.findByRole('button', {name: 'Clear session token'});

    await user.click(screen.getByRole('button', {name: 'Clear session token'}));

    await screen.findByText(
      'Local-only API access. No bearer token is required on loopback.',
    );
    expect(
      screen.queryByRole('button', {name: 'Clear session token'}),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
    // The post-clear settings/status call (index 4) must not carry the
    // cleared token forward.
    const postClearHeaders = fetchMock.mock.calls[4][1]?.headers as Headers;
    expect(postClearHeaders.get('authorization')).toBeNull();
  });
});
