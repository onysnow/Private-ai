// The three confidence bands proposals are read in (design doc "Document
// Ingestion & Review System Design", Phase 3, after the AWS human-review
// reference architecture): high is proposed as is, medium is proposed and
// marked, low waits for the reporter's answer before it can be accepted
// (backend/app/services/entity_signals.py sets the values).
export type ConfidenceBand = 'high' | 'medium' | 'low';

export const HIGH_FROM = 0.85;
export const MEDIUM_FROM = 0.5;

export function confidenceBand(confidence: number | null | undefined): ConfidenceBand | null {
  if (typeof confidence !== 'number') return null;
  return confidence >= HIGH_FROM ? 'high' : confidence >= MEDIUM_FROM ? 'medium' : 'low';
}

/** "82% confidence · medium", for a proposal's heading. */
export function confidenceLabel(confidence: number | null | undefined): string {
  const band = confidenceBand(confidence);
  return band === null ? '' : `${Math.round((confidence as number) * 100)}% confidence · ${band}`;
}
