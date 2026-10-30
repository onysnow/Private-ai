// The routes app/page.tsx requests on load, for the route-keyed fetch stub
// in ./mock-api.ts (ADR-0005, line 15).
//
// On mount the page asks for the settings status, the investigation list
// and the connector names, then opens the first investigation (or the one
// named in ?inv=): every panel loads the case's records it shows through
// the shared cache -- findings, entities, graph, timeline, sources,
// evidence, documents, claims, leads queue and AI reasoning queue. Those
// loads run side by side, so a test says what the server holds for the
// case and never in what order the page asks. The replies are in the
// generated shapes (lib/generated/types.gen.ts), which the panels check.
//
// Usage:
//   const api = mockApi(pageRoutes({investigations: [investigation], leads: [leadFixture()]}));
//   api.add({'POST /api/leads': {id: 'lead-2'}});           // a route the test's action needs
//   api.add({...investigationRoutes('inv-restored')});       // a case opened later
import type {BasemapStatusOut, ClaimDoneByStatusOut, CorpusSearchOut, CorpusStatusOut, DocumentFormatsOut, DossierExternalOut, DossierSummaryOut, InvestigationOut, OwnershipChainOut, PostMergeReconciliationOut} from '../lib/generated/types.gen';
import type {Routes} from './mock-api';
import {dropBody} from './library';

/** A reply as a test writes it: the generated shape, with whatever a test overrides. */
export type Fixture = Record<string, unknown>;

/** The settings status every page test boots with: local-only access, no
 * connectors configured, no denials, the AI layer switched off. In the
 * generated SettingsStatusOut shape, which the page's access check checks. */
export const validSettingsStatus = {
  environment: 'test',
  database: 'sqlite',
  document_storage_dir: '/tmp/docs',
  limits: {max_document_bytes: 52428800, max_backup_bytes: 262144000, max_backup_uncompressed_bytes: 1073741824, max_backup_files: 10000},
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
      tessdata: null,
      requested_languages: [],
      missing_languages: [],
      detail: 'not checked',
    },
  },
  access: {
    remote_api_enabled: false,
    mode: 'local_only',
    token_configured: false,
    persisted_identity_count: 0,
    investigation_scope_configured: false,
  },
  cors_allowed_origins: [],
  security: {
    window_hours: 24, since: '2026-10-01T00:00:00+00:00', total_denials: 0, by_event: {access_denied: 0, auth_rate_limited: 0, browser_write_denied: 0, request_rejected: 0},
    remote_hosts: [], recent: [], attention_threshold: 20, needs_attention: false, records_scanned: 0, malformed_lines: 0, read_error: false,
  },
  ai: {
    enabled: false, provider: null, provider_key_configured: false, endpoints_callable: false, model: null, runs_on_this_computer: null, remote_endpoint_allowed: false,
    limits: {runs_per_minute_per_actor: 6, max_concurrent_runs: 2, request_timeout_seconds: 120, max_output_tokens: 8192},
    authority_suite: {present: false, source: null, tas_version: null, modules: {}, control_surface: {spec_file: 'systems/tas/CORE/CONTROL_SURFACE.md', available: false, flags: {}}},
  },
  connectors: {},
};

/** An investigation as the list reports it (the generated InvestigationOut shape). */
export function investigationRecord(row: {id: string; name: string; is_demo?: boolean}): InvestigationOut {
  return {description: null, is_demo: false, created_at: '2026-10-01T00:00:00', ...row};
}

/** A canonical entity as the list reports it (the generated EntityOut shape). */
export function entityFixture(id: string, caption: string, schema: string, overrides: Fixture = {}): Fixture & {id: string} {
  return {id, investigation_id: 'inv-1', ftm_id: `ftm-${id}`, schema, caption, properties: {}, canonical_id: null, merged_into_entity_id: null, created_at: '2026-10-01T00:00:00', ...overrides};
}

/** The advisory of a relationship nothing has been said about yet. */
export function plainAdvisory(overrides: Fixture = {}): Fixture {
  return {
    needs_review: false, support_state: 'no_claim_dependency', has_independent_support: false, healthy_supporting_claim_count: 0, challenged_supporting_claim_count: 0,
    disputed_claim_count: 0, rejected_claim_count: 0, claim_dependencies: [], relationship_evidence_review: null, relationship_evidence_needs_review: false,
    relationship_evidence_attachment_count: 0, relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0},
    presentation_aggregate: false, ...overrides,
  };
}

/** A relationship edge in the generated RelationshipOut shape, which the
 * graph and the relationship routes check: Kestrelwood Holdings owned by Jane Doe. */
export function relationshipFixture(overrides: Fixture = {}): Fixture {
  return {
    id: 'rel-1',
    investigation_id: 'inv-1',
    relationship_entity_id: 'rel-entity-1',
    ftm_id: 'ftm-1',
    schema: 'Ownership',
    source_prop: 'owner',
    target_prop: 'asset',
    caption: 'Ownership',
    properties: {},
    source: {id: 'ent-1', ftm_id: 'ftm-ent-1', caption: 'Kestrelwood Holdings Ltd', schema: 'Company'},
    target: {id: 'ent-2', ftm_id: 'ftm-ent-2', caption: 'Jane Doe', schema: 'Person'},
    statements: [],
    provenance: {statement_count: 0, sources: [], evidence_review_history: [], evidence_attachments: []},
    advisory: plainAdvisory(),
    created_at: '2026-10-01T00:00:00',
    ...overrides,
  };
}

/** A connector finding in the generated ConnectorFindingOut shape. */
export function findingFixture(overrides: Fixture = {}): Fixture {
  return {
    id: 'find-1', investigation_id: 'inv-1', run_id: 'run-1', provider: 'aleph', provider_record_id: 'aleph-1', caption: 'Kestrelwood Holdings',
    schema: 'Company', properties: {}, source_url: null, raw: {}, review_status: 'unreviewed', created_at: '2026-10-01T00:00:00', ...overrides,
  };
}

/** An entity dossier in the generated EntityDossierOut shape: an entity
 * with nothing linked to it. Every list is empty unless overridden. */
export function dossierFixture(entity: Fixture & {id: string}, overrides: Fixture = {}): Fixture & {summary: DossierSummaryOut; external: DossierExternalOut} {
  return {
    entity,
    alias_resolution: null,
    identity_history: {canonical_entity_id: entity.id, aliases: [], canonical_decisions: [], merge_audits: [], unresolved_decision_count: 0},
    summary: {
      statement_count: 0, property_conflict_count: 0, identity_alias_count: 0, identity_decision_count: 0, identity_unresolved_count: 0,
      relationship_count: 0, relationship_underlying_count: 0, relationship_suppressed_duplicate_count: 0, relationship_schemas: {},
      relationship_review_advisory_count: 0, relationship_mixed_support_count: 0, claim_count: 0, claim_statuses: {}, evidence_count: 0, lead_count: 0,
      task_count: 0, timeline_event_count: 0, external_finding_count: 0, external_finding_statuses: {}, enrichment_session_count: 0, unresolved_external_count: 0,
    },
    statement_history: [],
    property_conflicts: [],
    relationships: [],
    claims: [],
    evidence: [],
    leads: [],
    tasks: [],
    timeline: [],
    external: {findings: [], resolution_decisions: [], statement_assessments: [], promotions: [], enrichment_sessions: [], enrichment_links: [], cross_provider_decisions: []},
    ...overrides,
  };
}

/** A post-merge reconciliation with no duplicate pairs. */
export function emptyReconciliation(entityId = 'ent-1'): PostMergeReconciliationOut {
  return {
    entity_id: entityId,
    statement_duplicates: [],
    relationship_duplicates: [],
    summary: {statement_pairs: 0, relationship_pairs: 0, unresolved_pairs: 0},
  };
}

/** An ownership chain with no links (GET /api/entities/{id}/ownership-chain). */
export function emptyOwnershipChain(entityId: string): OwnershipChainOut {
  return {entity_id: entityId, nodes: [{id: entityId, caption: 'Entity', schema: 'Company', level: 0, is_subject: true}], links: [], owners: [], max_depth: 6, truncated: false};
}

/** The routes opening an entity's dossier requests. */
export function dossierRoutes(entityId: string, dossier: unknown, duplicates: unknown[] = [], reconciliation: unknown = emptyReconciliation(entityId),
  chain: unknown = emptyOwnershipChain(entityId)): Routes {
  return {
    [`GET /api/entities/${entityId}/dossier`]: dossier,
    [`GET /api/entities/${entityId}/duplicate-candidates`]: duplicates,
    [`GET /api/entities/${entityId}/post-merge-reconciliation`]: reconciliation,
    [`GET /api/entities/${entityId}/ownership-chain`]: chain,
  };
}

/** The case-wide reads a dossier works its own share out of (its party's Red Flags and payments): none by default. */
export function dossierCaseRoutes(investigationId: string, flags: unknown[] = [], transactions: unknown[] = []): Routes {
  const base = `/api/investigations/${investigationId}`;
  return {
    [`GET ${base}/red-flags`]: {investigation_id: investigationId, rules: [], flags, gone: [], cannot_run: [], investigation_type: {set_by: 'app', areas: [], suggested: []}},
    [`GET ${base}/financial-flows`]: {investigation_id: investigationId, transactions, incomplete: [], currencies: [], flow_type_rule: '', duplicate_rule: ''},
  };
}

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

/** A Lanes reply (the generated TimelineLanesOut shape). Events given in the plain timeline shape are filled in as
 * Lanes draws them: no parties, typed in the app, and one mark derived as the backend does for a verified date
 * (shown), a disputed one, or else not yet shown. */
export function lanesBody(investigationId: string, events: unknown[] = [], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const filled: Array<Record<string, unknown>> = events.map(raw => {
    const e = raw as Record<string, unknown>;
    const fact = e.fact ?? (e.verification_status === 'verified' ? 'shown' : e.verification_status === 'disputed' ? 'disputed' : 'not_yet');
    return {parties: [], source_key: 'you', source_label: 'Typed by you', fact, fact_note: null, placeholder: false, grade: null, ...e};
  });
  const facts: Record<string, number> = {};
  for (const e of filled) facts[e.fact as string] = (facts[e.fact as string] ?? 0) + 1;
  const years = filled.map(e => String(e.date_start).slice(0, 4)).sort();
  return {
    investigation_id: investigationId, events: filled, parties: [], periods: [], sequence: [],
    steps: filled.map(e => ({key: e.id, title: e.title, claim_id: null, claim_status: null, event_ids: [e.id], date_start: e.date_start,
      date_end: e.date_end ?? null, precision: e.precision, unresolved: e.fact !== 'shown'})), steps_from: 'events', steps_undated: 0,
    not_placed: [], not_placed_total: 0, undated: [], undated_total: 0, facts,
    span: {first: years[0] ?? null, last: years[years.length - 1] ?? null, busiest: years[0] ?? null},
    opens_on: (filled.find(e => e.fact !== 'shown')?.id as string | undefined) ?? null,
    ...extra,
  };
}

export type LeadQueueBody = {investigation_id: string; total: number; counts: Record<string, number>; items: unknown[]};

/** A lead queue reply in the generated LeadQueueOut shape, which the leads
 * panel checks; its counts are tallied from the leads given. */
/** A lead as the API returns it (the generated LeadOut shape): an unreviewed
 * question with no links, tasks or triage signals, unless a test says otherwise. */
/** The investigation's watchlist (GET /api/investigations/{id}/watchlist). */
export function watchlistBody(investigationId: string, entries: Fixture[] = []): Fixture {
  return {investigation_id: investigationId, entries};
}

export function leadBody(overrides: Fixture = {}): Fixture {
  return {
    id: 'lead-1', investigation_id: 'inv-1', title: 'Who approved this contract?', status: 'unreviewed', priority: 'normal', owner: null,
    detail: null, provider: null, provider_record_id: null, kind: 'question', next_action: null, created_at: '2026-10-01T00:00:00',
    links: [], tasks: [], history: [],
    triage: {
      needs_attention: false, attention_score: 0, stance_counts: {supports: 0, contradicts: 0, context: 0}, linked_claim_count: 0, disputed_claim_count: 0,
      relationship_evidence_review_counts: {supports: 0, contradicts: 0, context: 0, superseded: 0, unresolved: 0, unreviewed: 0}, reasons: [],
    },
    ...overrides,
  };
}

export function leadQueueBody(investigationId: string, leads: unknown[] = []): LeadQueueBody {
  return {investigation_id: investigationId, total: leads.length, counts: tally(leads, 'status'), items: leads};
}

/** What uploads accept, in the generated DocumentFormatsOut shape: the
 * Workbench's own reader's list unless a test says otherwise. */
export function documentFormatsBody(overrides: Partial<DocumentFormatsOut> = {}): DocumentFormatsOut {
  return {
    reader: 'workbench', extensions: ['csv', 'docx', 'htm', 'html', 'md', 'pdf', 'txt'], mime_types: [], openaleph_only_extensions: [],
    accept: '.csv,.docx,.htm,.html,.md,.pdf,.txt', max_bytes: 52428800, ingest_file_image: null, ...overrides,
  };
}

/** OpenAleph's search of the case's corpus, in the generated CorpusSearchOut
 * shape: nothing found unless a test says otherwise. */
export function corpusSearchBody(investigationId: string, overrides: Partial<CorpusSearchOut> = {}): CorpusSearchOut {
  return {investigation_id: investigationId, query: '', state: 'ok', detail: null, total: 0, results: [], ...overrides};
}

/** How OpenAleph's work on the case stands, in the generated CorpusStatusOut
 * shape: idle, with no stages, unless a test says otherwise. */
export function corpusStatusBody(investigationId: string, overrides: Partial<CorpusStatusOut> = {}): CorpusStatusOut {
  return {
    investigation_id: investigationId, collection_id: null, state: 'idle', active: false, stages: [], detail: null,
    checked_at: '2026-10-02T00:00:00', ...overrides,
  };
}

/** The "Corpus sync" line in the generated CorpusSyncOut shape: OpenAleph
 * integration disabled and nothing sent, unless overridden. */
export function corpusSyncBody(investigationId: string, overrides: Fixture = {}): Fixture {
  return {
    investigation_id: investigationId, enabled: false, background: false, collection_id: null, collection_label: null, pushed_records: 0,
    pending: {to_send: 0, to_remove: 0, judgements: 0, cannot_send: []},
    push: {status: 'never', started_at: null, finished_at: null, message: null, error: null, sent: 0, removed: 0, unchanged: 0, removals_waiting: 0,
      judgements_sent: 0, judgements_failed: 0},
    cross_reference: {status: 'never', requested_at: null, finished_at: null, error: null, results: 0, new: 0, updated: 0, duplicates: 0, open: 0},
    consecutive_failures: 0, failures: [],
    ...overrides,
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
  /** Leads, in the generated LeadOut shape. */
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
    // The Wire (See; in the single-page view since it took over the Relationships panel).
    [`GET ${base}/wire`]: {investigation_id: id, entities: [], links: [], events: []},
    [`GET ${base}/record-tags`]: {investigation_id: id, rows: []},
    // Act › Charts asks for its catalogue as it opens (in the single-page view, with the page).
    [`GET ${base}/visuals/catalog`]: {investigation_id: id, queries: [], kinds: [], drawn_kinds: [], questions: []},
    [`GET ${base}/timeline`]: timelineBody(id, records.events ?? []),
    [`GET ${base}/timeline/lanes`]: lanesBody(id, records.events ?? []),
    [`GET ${base}/leads/queue`]: leadQueueBody(id, records.leads ?? []),
    [`GET ${base}/claims`]: records.claims ?? [],
    [`GET ${base}/evidence`]: records.evidence ?? [],
    [`GET ${base}/sources`]: records.sources ?? [],
    [`GET ${base}/documents`]: records.documents ?? [],
    [`GET ${base}/corpus/status`]: corpusStatusBody(id),
    // The Drop's line, which the Library reads for where each file is in its reading.
    [`GET ${base}/drop`]: dropBody(id),
    [`GET ${base}/ai-analysis-candidates`]: {candidates: records.aiCandidates ?? []},
    [`GET ${base}/corpus/sync`]: corpusSyncBody(id),
    [`GET ${base}/cross-references`]: [],
    [`GET ${base}/watchlist`]: watchlistBody(id),
    [`GET ${base}/corpus/entity-sets`]: [],
    [`GET ${base}/places`]: placesBody(id),
    [`GET ${base}/tags`]: tagsBody(id),
    [`GET ${base}/collections`]: {investigation_id: id, collections: []},
    [`GET ${base}/red-flags`]: {investigation_id: id, rules: [], flags: [], gone: []},
    [`GET ${base}/checks`]: {investigation_id: id, items: [], gone: []},
    // See › Money loads with the view (features/money): no payments yet.
    [`GET ${base}/financial-flows`]: {investigation_id: id, transactions: [], incomplete: [], currencies: [], flow_type_rule: '', duplicate_rule: ''},
    [`GET ${base}/money-checks`]: {investigation_id: id, as_of: null, ran_at: '2026-10-12T00:00:00Z', rule: '', currencies: []},
  };
}

/** The tags reply (GET /api/investigations/{id}/tags): none yet, and the eight swatches. */
export function tagsBody(id: string, tags: unknown[] = []): {investigation_id: string; colours: string[]; tags: unknown[]} {
  return {investigation_id: id, colours: ['#314d65', '#3a5c52', '#8d692b', '#663306', '#89352a', '#61503e', '#3e6181', '#966926'], tags};
}

/** The places reply (GET /api/investigations/{id}/places): none by default. */
export function placesBody(id: string, places: unknown[] = [], omitted: unknown[] = []): {investigation_id: string; places: unknown[]; omitted: unknown[]} {
  return {investigation_id: id, places, omitted};
}

/** The base map's status (GET /api/basemap): not installed, unless given. */
export function basemapStatusBody(available = false): BasemapStatusOut {
  return available
    ? {available: true, min_zoom: 0, max_zoom: 6, bounds: [-180, -85.0511287, 180, 85.0511287], version: '4.15.2', built: '2026-10-03T04:00:00Z',
      attribution: '© OpenStreetMap', fonts: ['Noto Sans Medium']}
    : {available: false, reason: 'no base map at /data/basemap/world.pmtiles', fonts: []};
}

export type PageRoutesOptions = InvestigationRecords & {
  settings?: unknown;
  /** The investigation list; the page opens the first one (or the one in
   * ?inv=), and every one listed gets the same records. */
  investigations?: {id: string; name: string; is_demo?: boolean}[];
  providers?: string[];
};

/** Every route the page requests from mount through opening an investigation. */
/** What Settings reads for its sidebar values and the Notifications, Outside lookups and AI and research panes, as a fresh install answers. */
export function settingsPaneRoutes(): Routes {
  return {
    'GET /api/settings/notifications': {routes: {flag_textbook: 'interrupt'}, quiet_while_reading: true, desktop: false, backup_days: 14,
      outside: {email: {mode: 'off', address: ''}, phone: {mode: 'off', url: ''}, webpush: {mode: 'off'}},
      server: {email: false, webpush: false, webpush_key: null}, push_devices: 0,
      kinds: [{key: 'flag_textbook', label: 'Textbook Red Flag', default: 'interrupt', can_interrupt: true, route: 'interrupt'}]},
    'GET /api/settings/lookups': {sources: [], cases: [], week: [], can_change_defaults: true},
    'GET /api/settings/research': {mode: 'ask', ai_enabled: false, model: null, settings: [], defaults_reason: null, defaults_saved_at: null,
      locked: [], cases: [], can_change_defaults: true},
    'GET /api/settings/security/users': [],
  };
}

export function pageRoutes(options: PageRoutesOptions = {}): Routes {
  const {settings = validSettingsStatus, investigations = [], providers = ['aleph'], ...records} = options;
  const routes: Routes = {
    'GET /api/settings/status': settings,
    'GET /api/investigations': investigations.map(investigationRecord),
    'GET /api/document-formats': documentFormatsBody(),
    'GET /api/connectors': {providers, status: Object.fromEntries(providers.map(p => [p, {configured: true}]))},
    'GET /api/basemap': basemapStatusBody(),
    ...settingsPaneRoutes(),
  };
  for (const investigation of investigations) Object.assign(routes, investigationRoutes(investigation.id, records));
  return routes;
}

/** The Done rules a claim workspace carries (backend app/services/claim_done.py): met by default, or the first rule not met. */
export function claimDoneFixture(claimId = 'claim-1', met = true): ClaimDoneByStatusOut {
  const rules = [
    {key: 'supporting', label: 'At least one supporting item is linked', state: met ? 'met' as const : 'not_met' as const,
      detail: met ? '1 supporting item' : 'Link the evidence that shows it, with the stance Supports.'},
    {key: 'file', label: 'The file behind each item still matches its fingerprint', state: 'unknown' as const, detail: 'No supporting item has a stored file.'},
  ];
  const one = (target: 'supported' | 'confirmed') => ({claim_id: claimId, target, rules, met, left: met ? 0 : 1, unknown: 1});
  return {supported: one('supported'), confirmed: one('confirmed')};
}

/** What a Case home asks for, for an empty case: the Settings › Appearance preview draws it. */
export function emptyCaseHomeRoutes(investigationId: string): Record<string, unknown> {
  const base = `/api/investigations/${investigationId}`;
  return {
    [`GET ${base}/standing`]: {
      investigation_id: investigationId, claims: {total: 0, supported: 0, disputed: 0, unshown: 0, ruled_out: 0}, to_check: 0, missing: 0, to_decide: 0,
      to_decide_by_kind: {}, money: {currency: null, amount: 0, payments: 0, starting_payers: 0, others: []},
      timeline: {events: 0, from: null, to: null, years: []}, documents: {total: 0, unread: 0, failed: 0}, sources: 0, evidence: 0,
      network: {parties: 0, links: 0}, flags: {open: 0, textbook: 0, strong: 0, faint: 0}, leads: {open: 0}, watchlist: {names: 0, new_hits: 0},
    },
    [`GET ${base}/decisions`]: {investigation_id: investigationId, counts: {}, total: 0, offset: 0, items: []},
    [`GET ${base}/claims`]: [],
    [`GET ${base}/claim-sources`]: [],
    [`GET ${base}/red-flags`]: {investigation_id: investigationId, flags: [], gone: [], rules: [], cannot_run: [], type: null},
    [`GET ${base}/documents`]: [],
    [`GET ${base}/graph`]: emptyGraph(),
  };
}
