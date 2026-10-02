// The routes app/page.tsx requests on load, for the route-keyed fetch stub
// in ./mock-api.ts (ADR-0005, line 15).
//
// On mount the page asks for the settings status, the investigation list
// and the connector names, then opens the first investigation (or the one
// named in ?inv=) and loads its records: findings, entities, graph, leads
// queue, claims, evidence and sources from the page itself, and the
// timeline, the sources, the documents and the AI reasoning queue from the
// panels that load their own data. Those loads run side by side, and more
// move onto TanStack Query with every panel, so a test says what the server
// holds for the case and never in what order the page asks.
//
// Usage:
//   const api = mockApi(pageRoutes({investigations: [investigation], leads: [leadFixture()]}));
//   api.add({'POST /api/leads': {id: 'lead-2'}});           // a route the test's action needs
//   api.add({...investigationRoutes('inv-restored')});       // a case opened later
import type {Routes} from './mock-api';

/** The settings status every page test boots with: local-only access, no
 * connectors configured, no AI or security blocks. */
export const validSettingsStatus = {
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

export type GraphBody = {
  nodes: unknown[];
  edges: unknown[];
  schemas: string[];
  reconciliation: {collapsed_by_default: boolean; suppressed_duplicate_count: number; underlying_edge_count: number; visible_edge_count: number};
};

/** A graph reply with the given edges and no suppressed duplicates. */
export function emptyGraph(edges: unknown[] = []): GraphBody {
  return {
    nodes: [],
    edges,
    schemas: [],
    reconciliation: {collapsed_by_default: true, suppressed_duplicate_count: 0, underlying_edge_count: 0, visible_edge_count: 0},
  };
}

export type TimelineBody = {
  investigation_id: string;
  events: unknown[];
  counts: Record<string, number>;
  verification_counts: Record<string, number>;
  total: number;
  returned: number;
  offset: number;
};

function tally(events: unknown[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const value = (event as Record<string, unknown>)[field];
    if (typeof value === 'string') counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** A timeline reply in the generated TimelineOut shape, which the timeline
 * panel checks; its counts are tallied from the events given. */
export function timelineBody(investigationId: string, events: unknown[] = []): TimelineBody {
  return {
    investigation_id: investigationId,
    events,
    counts: tally(events, 'kind'),
    verification_counts: tally(events, 'verification_status'),
    total: events.length,
    returned: events.length,
    offset: 0,
  };
}

/** What the server holds for one investigation. Anything left out is empty,
 * which every loader accepts without inspecting a row. */
export type InvestigationRecords = {
  findings?: unknown[];
  entities?: unknown[];
  graph?: GraphBody;
  /** Timeline events, in the generated TimelineEventOut shape. */
  events?: unknown[];
  leads?: unknown[];
  claims?: unknown[];
  evidence?: unknown[];
  sources?: unknown[];
  documents?: unknown[];
  /** The AI reasoning review queue. */
  aiCandidates?: unknown[];
};

/** Every route that opening an investigation requests. */
export function investigationRoutes(id: string, records: InvestigationRecords = {}): Routes {
  const base = `/api/investigations/${id}`;
  return {
    [`GET ${base}/connector-findings`]: records.findings ?? [],
    [`GET ${base}/entities`]: records.entities ?? [],
    [`GET ${base}/graph`]: records.graph ?? emptyGraph(),
    [`GET ${base}/timeline`]: timelineBody(id, records.events ?? []),
    [`GET ${base}/leads/queue`]: {items: records.leads ?? []},
    [`GET ${base}/claims`]: records.claims ?? [],
    [`GET ${base}/evidence`]: records.evidence ?? [],
    [`GET ${base}/sources`]: records.sources ?? [],
    [`GET ${base}/documents`]: records.documents ?? [],
    [`GET ${base}/ai-analysis-candidates`]: {candidates: records.aiCandidates ?? []},
  };
}

export type PageRoutesOptions = InvestigationRecords & {
  settings?: unknown;
  /** The investigation list; the page opens the first one (or the one in
   * ?inv=), and every one listed gets the same records. */
  investigations?: {id: string; name: string}[];
  providers?: string[];
};

/** Every route the page requests from mount through opening an investigation. */
export function pageRoutes(options: PageRoutesOptions = {}): Routes {
  const {settings = validSettingsStatus, investigations = [], providers = ['aleph'], ...records} = options;
  const routes: Routes = {
    'GET /api/settings/status': settings,
    'GET /api/investigations': investigations,
    'GET /api/connectors': {providers},
  };
  for (const investigation of investigations) Object.assign(routes, investigationRoutes(investigation.id, records));
  return routes;
}
