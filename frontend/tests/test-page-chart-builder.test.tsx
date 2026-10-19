// @vitest-environment jsdom
// The chart builder on the workbench page (app/page.tsx): a reporter can
// make a chart without the AI. The panel sits in its own error boundary
// and asks for nothing until it is opened, so the page's first load and
// every other panel's requests stay as they were; opening it asks for this
// investigation's chart catalogue.
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {mockApi} from '../test-support/mock-api';
import {pageRoutes} from '../test-support/page-routes';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function importHome(): Promise<() => ReactElement> {
  vi.resetModules();
  const mod = await import('../components/case/workbench-all');
  return mod.default;
}

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};
const CATALOG = 'GET /api/investigations/inv-1/visuals/catalog';

describe('Home chart builder', () => {
  it('is on the page, asks for nothing until opened, then loads this investigation\'s chart catalogue', async () => {
    const api = mockApi({...pageRoutes({investigations: [investigation]}), [CATALOG]: {
      investigation_id: 'inv-1', queries: [], kinds: ['bar'], drawn_kinds: ['bar'],
      questions: [{id: 'ranking', label: 'Ranking', description: 'Where an item sits in an ordered list.', kinds: ['bar'], drawn_kinds: ['bar'], queries: []}],
    }});
    const Home = await importHome();
    render(<Home/>);
    await screen.findByRole('heading', {level: 1, name: 'Kestrelwood filings'});
    expect(screen.getByText('Chart builder')).toBeInTheDocument();
    expect(api.calls(CATALOG)).toHaveLength(0);

    await userEvent.setup().click(screen.getByRole('button', {name: 'Build a chart'}));
    expect(await screen.findByRole('button', {name: 'Ranking'})).toBeInTheDocument();
    await waitFor(() => expect(api.calls(CATALOG)).toHaveLength(1));
  });
});
