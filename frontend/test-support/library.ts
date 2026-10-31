// The Drop's line as the Library reads it (GET /api/investigations/{id}/drop): where each file is in its reading.
// Tests of the Library (features/documents/documents-panel.tsx) answer it with these.
const STAGES: [string, string][] = [['received', 'Received'], ['checked', 'Checked'], ['read', 'Read'], ['passages', 'Split into passages'],
  ['inside', 'Files inside'], ['names', 'Names & facts'], ['ready', 'Ready for you']];

export function dropLane(documentId: string, filename: string, overrides: Record<string, unknown> = {}, receipt: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    document_id: documentId, filename, problem: false, in_progress: false, issues: [], note: 'Read cleanly', waiting: 0, stalled_minutes: null,
    stages: STAGES.map(([key, label]) => ({key, label, state: 'done', detail: ''})),
    receipt: {fingerprint: 'ab'.repeat(32), pages: null, how_read: null, passages: 0, proposals: {}, waiting: {}, watchlist_hits: 0, flags_fed: [],
      files_inside: 0, by_proposer: [], ...receipt},
    children: [],
    ...overrides,
  };
}

export function dropBody(investigationId: string, lanes: unknown[] = []): Record<string, unknown> {
  return {
    investigation_id: investigationId, stages: STAGES.map(([key, label]) => ({key, label})), lanes,
    totals: {files: lanes.length, files_inside: 0, read: lanes.length, unread: 0, reading: 0, problems: 0, passages: 0, waiting: 0, by_stage: {}, started_at: null},
    ready_for_you: {}, ready_from: 0, ready_unsure: 0, watchlist: {hits: 0, names: []},
  };
}
