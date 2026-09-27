// @vitest-environment jsdom
// Issue #40 wiring: the "Investigation timeline" section renders the
// reusable <CaseTimeline> chart above the existing event list whenever the
// investigation has timeline events. The ECharts wrapper (<Chart>) is
// stubbed -- jsdom has no canvas -- so this asserts the chart option the page
// ends up building from the loaded events, matching
// tests/test-case-timeline.test.tsx.
import {cleanup, render, screen} from '@testing-library/react';
import type {ReactElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const {chartSpy} = vi.hoisted(() => ({chartSpy: vi.fn()}));
vi.mock('../components/charts/chart', () => ({
  Chart: (props: Record<string, unknown>) => {
    chartSpy(props);
    return <div data-testid="chart-stub" />;
  },
}));

beforeEach(() => {
  chartSpy.mockClear();
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

const investigation = {id: 'inv-1', name: 'Kestrelwood filings'};

const timelineEvent = {
  id: 'ev-t1', kind: 'reporter_event', title: 'Board approves transfer', date_start: '2024-03-02',
  precision: 'day', verification_status: 'verified', provenance: {}, refs: {},
};

async function bootstrap(events: unknown[]): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(validSettingsStatus)) // GET settings/status
    .mockResolvedValueOnce(jsonResponse([investigation])) // GET investigations
    .mockResolvedValueOnce(jsonResponse({providers: ['aleph']})) // GET connectors
    .mockResolvedValueOnce(jsonResponse([])) // GET connector-findings
    .mockResolvedValueOnce(jsonResponse([])) // GET entities
    .mockResolvedValueOnce(jsonResponse({nodes: [], edges: [], schemas: [], reconciliation: {collapsed_by_default: true, suppressed_duplicate_count: 0, underlying_edge_count: 0, visible_edge_count: 0}})) // GET graph
    .mockResolvedValueOnce(jsonResponse({events, verification_counts: {verified: events.length}})) // GET timeline
    .mockResolvedValueOnce(jsonResponse({items: []})) // GET leads/queue
    .mockResolvedValueOnce(jsonResponse([])) // GET claims
    .mockResolvedValueOnce(jsonResponse([])) // GET evidence
    .mockResolvedValueOnce(jsonResponse([])) // GET sources
    .mockResolvedValueOnce(jsonResponse([])) // GET documents
    .mockResolvedValueOnce(jsonResponse({candidates: []})); // AiReasoningPanel
  vi.stubGlobal('fetch', fetchMock);
  const Home = await importHome();
  render(<Home />);
  await screen.findByText('Kestrelwood filings');
}

describe('Home investigation timeline chart', () => {
  it('renders the case timeline chart from the loaded events, above the unchanged event list', async () => {
    await bootstrap([timelineEvent]);
    await screen.findByText('2024-03-02 · Board approves transfer');
    expect(await screen.findByTestId('chart-stub')).toBeInTheDocument();
    const option = chartSpy.mock.calls.at(-1)?.[0].option as {series: Array<{data: unknown[][]}>};
    expect(option.series[0].data[0]).toEqual([Date.parse('2024-03-02'), 0, NaN, 'verified']);
  });

  it('does not render the chart when there are no events', async () => {
    await bootstrap([]);
    expect(screen.queryByTestId('chart-stub')).not.toBeInTheDocument();
  });
});
