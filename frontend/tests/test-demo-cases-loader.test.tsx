// @vitest-environment jsdom
// The small real cases on Settings (features/demo/demo-cases-loader): each is
// listed with what it downloads, loads as its own case, and says when loading
// failed.
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {DemoCasesLoader} from '../features/demo/demo-cases-loader';
import {QueryProvider} from '../lib/query-client';
import {mockApi} from '../test-support/mock-api';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const idle = {state: 'idle', not_downloaded: []};
const item = (id: string, title: string, progress: Record<string, unknown> = idle) => ({
  id, title, question: 'Q?', description: `${title} from public records.`, documents: 1, bytes: 249686,
  publishers: ['www.justice.gov'], progress,
});

describe('Small real demo cases', () => {
  it('loads a case as its own investigation and opens it', async () => {
    let loaded = false;
    const opened = vi.fn();
    const api = mockApi({
      'GET /api/demo/cases': () => [
        item('us-v-anise-structuring', 'Demo · real case: United States v. Anise',
          loaded ? {state: 'ready', investigation_id: 'inv-anise', documents: 1, read: 1, failed: 0, claims: 4, leads: 2, not_downloaded: []} : idle),
        item('deripaska-en-rusal', 'Demo · real case: Deripaska, En+ and Rusal'),
      ],
      'POST /api/demo/cases/us-v-anise-structuring': () => { loaded = true; return {state: 'reading', investigation_id: 'inv-anise', not_downloaded: []}; },
      'GET /api/investigations': [],
    });
    render(<QueryProvider><DemoCasesLoader onOpen={opened}/></QueryProvider>);
    await screen.findByText('Demo · real case: United States v. Anise.');
    expect(screen.getAllByText(/Downloads 1 document \(250 KB\) from www.justice.gov/)).toHaveLength(2);
    await userEvent.setup().click(screen.getAllByRole('button', {name: 'Load this case'})[0]);
    expect(opened).toHaveBeenCalledWith('inv-anise');
    expect(await screen.findByText(/Loaded: 1 document, 4 claims, 2 leads/)).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Open the case'})).toBeInTheDocument();
    expect(api.calls('POST /api/demo/cases/us-v-anise-structuring')).toHaveLength(1);
  });

  it('says why a case could not be loaded', async () => {
    mockApi({
      'GET /api/demo/cases': [item('deripaska-en-rusal', 'Demo · real case: Deripaska, En+ and Rusal')],
      'POST /api/demo/cases/deripaska-en-rusal': {state: 'failed', error: 'Could not download the notice', not_downloaded: []},
    });
    render(<QueryProvider><DemoCasesLoader/></QueryProvider>);
    await userEvent.setup().click(await screen.findByRole('button', {name: 'Load this case'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download the notice');
  });
});
