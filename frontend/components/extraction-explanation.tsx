// #190: "Why was this proposed?" for one document-extraction proposal.
//
// The review pipeline stays propose-then-confirm; this component only renders
// the backend's per-part explanation (app/services/extraction_explanations.py)
// so the reporter can see, for every part of a proposal, what it says, which
// rule or provider produced it and why, and exactly where it came from —
// including the matched text highlighted inside its source chunk. Composite
// proposals (a staged relationship) arrive already broken into parts.
import type {ReactElement} from 'react';

import type {ExtractionRationaleBasis} from '../lib/api-types';

// The view asks only for what it draws, so an explanation fits whether it
// came through the generated API client (ExtractionExplanationOut) or the
// hand-written types the review pages still use (ExtractionExplanation).
export type ExplanationExcerptView = {before: string; match: string; after: string; start_char: number; end_char: number};
export type ExplanationSourceView = {
  kind: string;
  id?: string | null;
  label?: string | null;
  locator?: string | null;
  url?: string | null;
  excerpt?: ExplanationExcerptView | null;
  // Each kind of source adds its own detail (a chunk's extraction method, a
  // provider's record ids, a document's hash).
  [key: string]: unknown;
};
export type ExplanationPartView = {id: string; label: string; value?: unknown; reasoning: string[]; sources: ExplanationSourceView[]};
export type ExplanationView = {
  summary: string;
  method: {label: string; description: string; automated: boolean};
  rationale_basis: ExtractionRationaleBasis;
  confidence: {value?: number | null; basis: string};
  parts: ExplanationPartView[];
  sources: ExplanationSourceView[];
  caveats: string[];
  review_rule: string;
};

export const RATIONALE_BASIS_LABEL: Record<ExtractionRationaleBasis, string> = {
  recorded: 'reasoning recorded by the extractor',
  reconstructed: 'reasoning reconstructed with current rules',
  provider: 'reported by the provider',
  reporter: 'chosen by a reporter',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function sourceLine(s: ExplanationSourceView): string {
  const bits: string[] = [];
  bits.push(s.kind);
  if (s.label) bits.push(String(s.label));
  if (s.locator) bits.push(String(s.locator));
  if (s.kind === 'chunk' && s.extraction_method) bits.push(String(s.extraction_method));
  if (s.kind === 'provider' && s.provider_entity_id) bits.push(`provider entity ${String(s.provider_entity_id)}`);
  if (s.kind === 'provider' && s.collection_id) bits.push(`collection ${String(s.collection_id)}`);
  if (s.kind === 'document' && s.sha256) bits.push(`SHA-256 ${String(s.sha256).slice(0, 12)}…`);
  if (s.kind === 'claim' && s.status) bits.push(`status ${String(s.status)}`);
  return bits.join(' · ');
}

function Source({source}: {source: ExplanationSourceView}): ReactElement {
  return (
    <li data-testid={`explanation-source-${source.kind}`}>
      <small>{sourceLine(source)}</small>
      {source.url && <> <a href={String(source.url)} target="_blank" rel="noreferrer"><small>open</small></a></>}
      {source.excerpt && (
        <blockquote className="explanation-excerpt">
          <small>chars {source.excerpt.start_char}–{source.excerpt.end_char}: </small>
          {source.excerpt.before}<mark>{source.excerpt.match}</mark>{source.excerpt.after}
        </blockquote>
      )}
    </li>
  );
}

export function ExtractionExplanationView({explanation}: {explanation: ExplanationView}): ReactElement {
  const {method, confidence} = explanation;
  return (
    <details className="explanation" data-testid="extraction-explanation">
      {/* The whole explanation opens on click (Ony, 29 Oct: sub-text is revealed on hover or click); the summary keeps
          only the method and, as an alert, how many caveats there are. */}
      <summary>
        Why this was proposed: {method.label}{explanation.caveats.length ? <span className="explanation-caveats" aria-label={`${explanation.caveats.length} caveat(s)`}> ⚠ {explanation.caveats.length}</span> : null}
      </summary>
      <div><small>{RATIONALE_BASIS_LABEL[explanation.rationale_basis]}{explanation.caveats.length ? ` · ${explanation.caveats.length} caveat(s)` : ''}</small></div>
      <div><b>{explanation.summary}</b></div>
      <div><small>{method.automated ? 'Automated' : 'Not automated'}: {method.description}</small></div>
      {explanation.parts.length > 0 && (
        <ol className="explanation-parts">
          {explanation.parts.map(part => (
            <li key={part.id} data-testid={`explanation-part-${part.id}`}>
              <div><b>{part.label}:</b> {formatValue(part.value)}</div>
              {part.reasoning.length > 0 && <ul>{part.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>}
              {part.sources.length > 0 && <ul className="explanation-sources">{part.sources.map((s, i) => <Source key={`${s.kind}-${s.id ?? i}`} source={s}/>)}</ul>}
            </li>
          ))}
        </ol>
      )}
      <div><small><b>Confidence{typeof confidence.value === 'number' ? ` ${Math.round(confidence.value * 100)}%` : ''}:</b> {confidence.basis}</small></div>
      {explanation.sources.length > 0 && (
        <div><small><b>Sources</b></small><ul className="explanation-sources">{explanation.sources.map((s, i) => <Source key={`${s.kind}-${s.id ?? i}`} source={s}/>)}</ul></div>
      )}
      {explanation.caveats.length > 0 && (
        <div><small><b>Caveats</b></small><ul>{explanation.caveats.map((c, i) => <li key={i}><small>{c}</small></li>)}</ul></div>
      )}
      <div><small>{explanation.review_rule}</small></div>
    </details>
  );
}
