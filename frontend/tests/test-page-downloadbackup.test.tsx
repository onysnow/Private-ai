// @vitest-environment jsdom
// STRUCT-0015 remainder, cycle 8: the "Download backup" half of app/page.tsx's
// backup card (previewBackup/restoreBackup were covered in cycle 5;
// downloadBackup was deliberately left for its own cycle there because it
// needs an investigation selected AND jsdom object-URL/anchor-click
// plumbing, a different kind of setup than fetch mocking alone). Unlike
// previewBackup/restoreBackup, downloadBackup has an `if(!inv)return` guard,
// so it needs an investigation opened by loadAppBootstrap()'s auto-select,
// same pattern as cycles 4/6/7 (test-support/page-routes.ts holds the routes
// that opening a case requests; replies are keyed by route, not by call
// order -- ADR-0005, line 15).
//
// downloadBackup calls api.blob(), which resolves the raw Response and
// calls .blob() on it -- jsdom's fetch/Response support that natively, no
// special mocking needed there. What jsdom does NOT implement is
// URL.createObjectURL/revokeObjectURL (absent entirely, not just stubbed),
// so those are assigned directly onto the global URL class for the
// duration of each test. HTMLAnchorElement.prototype.click is spied on
// (not just left to jsdom) because jsdom logs a "not implemented:
// navigation" error when a real click on an <a href="blob:..."> tries to
// navigate -- the spy lets the test capture the link's href/download
// attributes at the moment of the (synthetic) click, before
// downloadBackup's own `link.remove()` call removes it from the DOM.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import type {MockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

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
  vi.restoreAllMocks();
  delete (URL as unknown as {createObjectURL?: unknown}).createObjectURL;
  delete (URL as unknown as {revokeObjectURL?: unknown}).revokeObjectURL;
});

function blobResponse(bytes: string, status = 200): Response {
  // A jsdom-environment `new Blob(...)` isn't the same class undici's
  // Response/`.blob()` expect (`object.stream is not a function`), so pass
  // the body as a plain string instead -- Response accepts that natively,
  // and downloadBackup only cares that `.blob()` on the received Response
  // resolves to *a* Blob, not about its exact source construction.
  return new Response(bytes, {
    status,
    headers: {'content-type': 'application/zip'},
  });
}

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../components/case/workbench-all');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};
const EXPORT = 'GET /api/investigations/inv-1/export';

async function bootstrapWithSelectedInvestigation(): Promise<MockApi> {
  const api = mockApi(pageRoutes({investigations: [investigation]}));

  const Home = await importHome();
  render(<Home />);
  await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});
  await waitFor(() => expect(screen.getByRole('button', {name: 'Download backup'})).not.toBeDisabled());
  return api;
}

describe('Home portable backup download', () => {
  it('is disabled until an investigation is selected', async () => {
    // No investigation: nothing beyond the three bootstrap routes is requested.
    const api = mockApi(pageRoutes());

    const Home = await importHome();
    render(<Home />);
    await screen.findByRole('heading', {name: 'Keep a copy off this computer, bring one back'});

    expect(screen.getByRole('button', {name: 'Download backup'})).toBeDisabled();
    expect(api.calls(EXPORT)).toHaveLength(0);
  });

  it('downloads the backup archive and triggers a browser save via an object URL', async () => {
    const api = await bootstrapWithSelectedInvestigation();

    // A Response body can be read once, so the route makes a fresh one per request.
    api.add({[EXPORT]: () => blobResponse('zip-bytes')});

    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    (URL as unknown as {createObjectURL: typeof createObjectURL}).createObjectURL = createObjectURL;
    (URL as unknown as {revokeObjectURL: typeof revokeObjectURL}).revokeObjectURL = revokeObjectURL;

    let capturedHref = '';
    let capturedDownload = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedHref = this.href;
      capturedDownload = this.download;
    });

    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));

    await screen.findByText('Backup downloaded.');

    expect(api.calls(EXPORT)).toHaveLength(1);
    expect(api.lastUrl(EXPORT).searchParams.get('include_documents')).toBe('true');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // The Blob passed to createObjectURL comes back from undici's
    // Response.blob(), a different realm/class than jsdom's global `Blob`
    // (see blobResponse's comment above) -- `toBeInstanceOf(Blob)` doesn't
    // hold across that boundary, so check duck-typed shape instead.
    const downloadedBlob = createObjectURL.mock.calls[0][0] as Blob;
    expect(downloadedBlob.size).toBe('zip-bytes'.length);
    expect(capturedHref).toBe('blob:mock-url');
    expect(capturedDownload).toBe('investigation-inv-1.jwbackup.zip');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // downloadBackup appends the link, clicks it, then removes it -- it
    // should not be left behind in the document.
    expect(document.querySelectorAll('a[download]').length).toBe(0);
  });

  it('shows an error status when the export request fails', async () => {
    const api = await bootstrapWithSelectedInvestigation();

    // The request itself fails (no reply at all), as when the API is unreachable.
    api.add({[EXPORT]: () => { throw new Error('export endpoint unreachable'); }});

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    (URL as unknown as {createObjectURL: typeof createObjectURL}).createObjectURL = createObjectURL;
    (URL as unknown as {revokeObjectURL: (url: string) => void}).revokeObjectURL = vi.fn();

    await userEvent.setup().click(screen.getByRole('button', {name: 'Download backup'}));

    await screen.findByText('export endpoint unreachable');
    expect(api.calls(EXPORT)).toHaveLength(1);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
