// @vitest-environment jsdom
// The operator console page: renders the overview, tables, routes, test status
// and logs from stubbed API responses, runs a read-only query, and surfaces a
// refused write as the backend's message.
import {cleanup, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import ConsolePage from '../app/console/page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

const overview = {
  database: {url: 'sqlite:///./journalism.db', dialect: 'sqlite', modeled_tables: 42, live_tables: 42, missing_tables: [], extra_tables: [], adminer_can_open: false},
  app_log_file: './data/logs/app.jsonl', console_dir: './data/console', pytest_available: true, python: '3.12.14',
  links: {swagger: '/docs', redoc: '/redoc', openapi: '/openapi.json', adminer: 'http://127.0.0.1:8081/', openaleph_ui: null},
  test_run: {status: 'idle'},
};
const tables = {tables: [{name: 'investigations', rows: 3, columns: [{name: 'id', type: 'VARCHAR', primary_key: true, nullable: false}], foreign_keys: []}, {name: 'entities', rows: 0, columns: [], foreign_keys: ['investigations']}]};
const routes = {routes: [{path: '/api/investigations', methods: ['GET', 'POST'], name: 'list', summary: 'List investigations', path_params: [], query_params: []}, {path: '/api/console/sql', methods: ['POST'], name: 'sql', summary: '', path_params: [], query_params: []}]};
const testStatus = {status: 'failed', summary: '1 failed, 297 passed in 40.0s', failed_tests: ['FAILED tests/test_x.py::test_y'], tail: ['...', '1 failed, 297 passed in 40.0s'], started_at: '2026-09-22T12:00:00+00:00', database_url: 'sqlite:///data/console/console-tests.db'};
const logs = {records: [{ts: '2026-09-22T12:00:01+00:00', level: 'ERROR', message: 'unhandled exception', request_id: 'abc123', exception: 'Traceback...\nRuntimeError: kaboom'}], returned: 1, file_bytes: 10, scanned_bytes: 10, truncated: false};
const security = {window_hours: 24, since: 'x', total_denials: 0, by_event: {}, remote_hosts: [], recent: [], attention_threshold: 20, needs_attention: false, records_scanned: 0, malformed_lines: 0, read_error: false};

function stubInitialLoads(extra: Record<string, () => Response> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/console/overview')) return jsonResponse(overview);
    if (url.includes('/api/console/tables/investigations')) return jsonResponse({table: 'investigations', columns: ['id', 'name'], rows: [{id: 'inv-1', name: 'First case'}], returned: 1, total: 3, offset: 0, limit: 50});
    if (url.includes('/api/console/tables')) return jsonResponse(tables);
    if (url.includes('/api/console/routes')) return jsonResponse(routes);
    if (url.includes('/api/console/tests/status')) return jsonResponse(testStatus);
    if (url.includes('/api/console/logs')) return jsonResponse(logs);
    if (url.includes('/api/settings/security/alerts')) return jsonResponse(security);
    for (const [needle, make] of Object.entries(extra)) if (url.includes(needle)) return make();
    return jsonResponse({detail: `unexpected ${url}`}, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ConsolePage', () => {
  it('renders the backend overview, tables, routes, last test run and log records', async () => {
    stubInitialLoads();
    render(<ConsolePage />);
    await screen.findByText(/sqlite:\/\/\/\.\/journalism\.db/);
    expect(screen.getByText(/Adminer cannot open it/)).toBeInTheDocument();
    expect(within(screen.getByTestId('console-tables')).getByText('investigations')).toBeInTheDocument();
    expect(within(screen.getByTestId('console-endpoints')).getByText('/api/investigations')).toBeInTheDocument();
    expect(within(screen.getByTestId('console-test-status')).getAllByText(/1 failed, 297 passed/).length).toBeGreaterThan(0); // summary line + tail
    expect(within(screen.getByTestId('console-logs')).getByText(/RuntimeError: kaboom/)).toBeInTheDocument();
    expect(screen.getByTestId('console-security')).toHaveTextContent('Access denials, last 24h: 0');
  });

  it('pages through a table and runs a read-only query, surfacing a refused write', async () => {
    const user = userEvent.setup();
    let sqlCalls = 0;
    const fetchMock = stubInitialLoads({
      '/api/console/sql': () => (++sqlCalls === 1
        ? jsonResponse({columns: ['name'], rows: [['First case']], returned: 1, truncated: false, duration_ms: 1.2})
        : jsonResponse({detail: 'only SELECT / WITH / EXPLAIN statements are allowed here; use Adminer for changes'}, 400)),
    });
    render(<ConsolePage />);
    await screen.findByText(/Adminer cannot open it/);
    await user.click(within(screen.getByTestId('console-tables')).getByRole('button', {name: /investigations/}));
    await screen.findByText('First case');

    await user.click(screen.getByRole('button', {name: 'Run query'}));
    await waitFor(() => expect(within(screen.getByTestId('console-sql')).getAllByText('First case').length).toBeGreaterThan(0));
    const sqlCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/api/console/sql'));
    expect(JSON.parse(String(sqlCall![1]?.body))).toEqual({sql: 'SELECT name, created_at FROM investigations ORDER BY created_at DESC', max_rows: 200});

    await user.clear(screen.getByLabelText('SQL'));
    await user.type(screen.getByLabelText('SQL'), 'DELETE FROM investigations');
    await user.click(screen.getByRole('button', {name: 'Run query'}));
    await waitFor(() => expect(screen.getByTestId('console-sql-error')).toHaveTextContent(/use Adminer for changes/));
  });

  it('probes endpoints and starts a test run', async () => {
    const user = userEvent.setup();
    stubInitialLoads({
      '/api/console/checks/endpoints': () => jsonResponse({base_url: 'http://x/', checked: 2, ok: 1, failed: 1, at: '2026-09-22T12:00:00', results: [{method: 'GET', path: '/api/health', status_code: 200, ok: true, error: null, duration_ms: 3}, {method: 'GET', path: '/api/integrations/openaleph/status', status_code: 502, ok: false, error: null, duration_ms: 40}]}),
      '/api/console/tests/run': () => jsonResponse({status: 'running', started_at: '2026-09-22T12:01:00', selection: 'tests/test_health_endpoint.py', database_url: 'sqlite:///x'}),
    });
    render(<ConsolePage />);
    await screen.findByText(/Adminer cannot open it/);
    await user.click(screen.getByRole('button', {name: 'Probe endpoints'}));
    await screen.findByText(/1\/2 answered 2xx/);
    expect(within(screen.getByTestId('console-probe')).getByText(/✗ GET \/api\/integrations\/openaleph\/status → 502/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Test selection'), 'tests/test_health_endpoint.py');
    await user.click(screen.getByRole('button', {name: 'Run tests'}));
    await waitFor(() => expect(screen.getByRole('button', {name: 'Running…'})).toBeDisabled());
  });
});
