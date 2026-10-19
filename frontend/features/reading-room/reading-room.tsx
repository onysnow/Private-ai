'use client';
// The reading room (Bring in; mockup INTAKE_2, research §6–8): one document read calmly,
// a page at a time. On the left a strip of its pages, drawn, with a mark for each page that
// still asks for a decision; in the middle the page's text in a narrow serif column, each
// passage numbered (¶) and what was found underlined, dashed while it waits (no fill over
// the words); on the right the page's proposals, each saying who proposed it and how sure,
// with the one question it needs answered inside it (what kind of name, already in the
// case, whose address) before it can be accepted. A leader line joins the chosen card to
// its words. Select words to keep them: E evidence, C a claim, N a name, X to check, T a
// tag, from a bar at the selection. J and K move between proposals, A accepts, R rejects,
// 1–4 answer the card's question, U undoes the last decision (each waits 6 s before it is
// sent). Evidence kept here shows its clip: the quote with 32 characters either side, the
// file's fingerprint and where it is, checked against the stored text.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {ReactElement, ReactNode} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {
  getDocumentOptions, getExtractionCandidateExplanationOptions, getExtractionEntityMatchesOptions, getIdentifierTargetsOptions, getSameAnswerCandidatesOptions, getTagsOptions,
  listDocumentCandidatesEndpointOptions, listDocumentsOptions, listInvestigationsOptions,
} from '../../lib/generated/@tanstack/react-query.gen';
import {
  createClaimEndpoint, createEntity, createEvidenceEndpoint, createLeadEndpoint, linkClaimEvidenceEndpoint, reviewExtractionCandidate, tagARecord,
} from '../../lib/generated/sdk.gen';
import type {DocumentChunkOut, DocumentDetailOut, ExtractionCandidateOut} from '../../lib/generated/types.gen';
import {singleKeysOn} from '../../lib/shortcuts';
import {useWorkbenchStore} from '../../lib/workbench-store';
import {PagePicture} from '../case-home/decision-card';
import {FEATURE_OPEN_EVENT, SHUTTER_EVENT} from '../effects/board-effects';
import {confidenceBand} from '../documents/confidence';
import {DocumentTranslation} from '../documents/document-translation';
import {needsSchemaAnswer} from '../documents/schema-question';
import {identityFields, sameAsOptions, type IdentityChoice} from '../documents/entity-identity';
import {proposerName} from './proposers';

type Tab = 'text' | 'original' | 'translation' | 'details';
type Span = {start: number; end: number; id: string; kind: string; status: string; primary: boolean};
type Picked = {chunk: DocumentChunkOut; start: number; end: number; quote: string; x: number; y: number};
export type Clip = {quote: string; before: string; after: string; fingerprint: string; anchor: string; checked: boolean; page: number | null; evidenceId: string};
type Answer = {schema?: string; identity?: IdentityChoice; owner?: string};
type Held = {c: ExtractionCandidateOut; decision: 'accept' | 'reject'; body: Record<string, unknown>; until: number};
/** The same answer applied to other mentions of a name, held 6 s like one decision. */
type BatchHeld = {ids: string[]; record: string; body: Record<string, unknown>; until: number};

const CLIP_CONTEXT = 32;
const HOLD_MS = 6000;
const KIND_WORD: Record<string, string> = {entity: 'Name', claim: 'Claim', evidence: 'Quote', relationship: 'Link', event: 'Date', identifier: 'Email address'};
const SCHEMA_WORD: Record<string, string> = {Person: 'Person', Company: 'Company', Organization: 'Organisation', LegalEntity: 'Not sure'};

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
}

function spanOf(payload: Record<string, unknown>): {start: number; end: number} | null {
  const span = payload.span as {start_char?: number; end_char?: number} | undefined;
  return span && typeof span.start_char === 'number' && typeof span.end_char === 'number' ? {start: span.start_char, end: span.end_char} : null;
}

/** What a proposal says, in a line. */
export function proposalText(c: ExtractionCandidateOut): string {
  const p = c.payload as Record<string, unknown>;
  return String(p.caption ?? p.text ?? p.quote ?? p.value ?? p.title ?? c.candidate_type);
}

/** Who proposed it, in a reporter's words (research §1: "Name-finder (rules)", "OpenAleph", "You"). */
export function proposerOf(c: ExtractionCandidateOut): string {
  const rule = String(((c.payload as {rationale?: {rule?: string}}).rationale ?? {}).rule ?? '');
  return proposerName(rule);
}

/** The schema choices a name's question offers, in the order the payload lists them. */
export function schemaChoices(c: ExtractionCandidateOut): string[] {
  const listed = (c.payload as {schema_choices?: unknown}).schema_choices;
  const base = Array.isArray(listed) && listed.every(x => typeof x === 'string') && listed.length ? listed as string[] : ['Person', 'Company', 'Organization'];
  return [...new Set([...base, 'LegalEntity'])].slice(0, 4);
}

/** Whether a proposal still waits for an answer before it can be accepted, and which. */
export function openQuestion(c: ExtractionCandidateOut, a: Answer, strongMatch: boolean): 'schema' | 'identity' | 'owner' | null {
  if (c.candidate_type === 'entity' && needsSchemaAnswer(c) && !a.schema) return 'schema';
  if (c.candidate_type === 'entity' && strongMatch && !a.identity) return 'identity';
  if (c.candidate_type === 'identifier' && !a.owner) return 'owner';
  return null;
}

const wordsOf = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Why a record may be what the name names, in words (research §8: "Same name: 'Ltd' and 'Limited' read as one"). */
export function sameReason(caption: string, other: string, why: string): string {
  const a = wordsOf(caption), b = wordsOf(other);
  const lower = (xs: string[]) => new Set(xs.map(x => x.toLowerCase()));
  const onlyA = a.filter(w => !lower(b).has(w.toLowerCase())), onlyB = b.filter(w => !lower(a).has(w.toLowerCase()));
  if (why.startsWith('the same name')) {
    if (!onlyA.length && !onlyB.length) return 'Same name, word for word';
    if (onlyA.length && onlyB.length && onlyA.length <= 2 && onlyB.length <= 2) return `Same name: “${onlyA.join(' ')}” and “${onlyB.join(' ')}” read as one`;
  }
  return why.charAt(0).toUpperCase() + why.slice(1);
}

type ImpactContext = {locator: string; mentions: number; record?: string | null; strong?: string | null; owner?: string | null};

/** What accepting a proposal adds to the case, before it is accepted (research §6 "What changes if I accept"). Read
 * from the answers on the card and what review_candidate does with each kind (app/services/documents.py). */
export function acceptImpact(c: ExtractionCandidateOut, a: Answer, ctx: ImpactContext): string[] {
  const caption = proposalText(c);
  const where = ctx.mentions > 1 ? `the ${ctx.mentions} places this document names it` : ctx.locator;
  switch (c.candidate_type) {
    case 'entity': {
      const schema = a.schema ?? String((c.payload as {suggested_schema?: unknown}).suggested_schema ?? 'LegalEntity');
      if (a.identity?.kind === 'same' && ctx.record) return [`Adds ${where} to ${ctx.record}; no new record`, 'The name is kept as it is written here, traced to these words'];
      return [`Adds “${caption}” as a new record: ${SCHEMA_WORD[schema] ?? schema}`, `Traced to ${where}`,
        ...(ctx.strong ? [`Kept apart from ${ctx.strong}: you said it is a different one`] : [])];
    }
    case 'claim': return ['Adds the claim to test, Not yet shown', `Keeps these words, ${ctx.locator}, as its supporting evidence`];
    case 'evidence': return [`Keeps the exact words, ${ctx.locator}, as evidence from this document`];
    case 'identifier': return [ctx.owner ? `Adds ${caption} to ${ctx.owner}` : `Adds ${caption} to the record you choose`, `Traced to ${ctx.locator}`];
    case 'relationship': return ['Adds the link between the two records', `With ${ctx.locator} as its evidence`];
    default: return [`Adds it to the case with ${ctx.locator} as its source`];
  }
}

/** The words kept as evidence, with their surroundings, checked against the stored text. */
export function clipOf(chunk: {text: string; locator: string; page_number?: number | null}, start: number, end: number, quote: string, fingerprint: string, evidenceId = ''): Clip {
  return {quote, before: chunk.text.slice(Math.max(0, start - CLIP_CONTEXT), start), after: chunk.text.slice(end, end + CLIP_CONTEXT),
    fingerprint, anchor: `${chunk.locator} · characters ${start + 1}–${end}`, checked: chunk.text.slice(start, end) === quote, page: chunk.page_number ?? null, evidenceId};
}

/** A chunk's text with its proposals and find matches marked. */
function Marked({text, spans, find, focus, onFocus}: {text: string; spans: Span[]; find: string; focus: string | null; onFocus: (id: string) => void}): ReactElement {
  const cuts = new Set([0, text.length]);
  for (const s of spans) { cuts.add(Math.max(0, s.start)); cuts.add(Math.min(text.length, s.end)); }
  const lower = text.toLowerCase();
  const needle = find.trim().toLowerCase();
  const found: {start: number; end: number}[] = [];
  if (needle.length > 1) for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + needle.length)) { found.push({start: i, end: i + needle.length}); cuts.add(i); cuts.add(i + needle.length); }
  const points = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [a, b] = [points[i], points[i + 1]];
    let piece: ReactNode = text.slice(a, b);
    if (found.some(f => f.start <= a && f.end >= b)) piece = <mark className="rr-find">{piece}</mark>;
    // The innermost proposal marks the words (a name inside a claim is the name); every
    // proposal that starts here still gets its anchor, for its margin card.
    const s = spans.filter(x => x.start <= a && x.end >= b).sort((x, y) => (x.end - x.start) - (y.end - y.start))[0];
    if (s) piece = <span className={`rr-span rr-${s.kind} rr-${s.status}${focus === s.id ? ' on' : ''}`} onClick={() => onFocus(s.id)}>{piece}</span>;
    out.push(<span key={a}>{spans.filter(x => x.start === a && x.primary).map(x => <span key={x.id} id={`rr-anchor-${x.id}`} className="rr-anchor"/>)}{piece}</span>);
  }
  return <>{out}</>;
}

function OriginalPage({documentId, page}: {documentId: string; page: number}): ReactElement {
  const image = useQuery({queryKey: ['page-image', documentId, page, ''], queryFn: () => api.blob(`/api/documents/${documentId}/page-image?page=${page}&width=900`),
    staleTime: Infinity, retry: false});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.data) return undefined;
    const made = URL.createObjectURL(image.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image.data]);
  if (image.isError) return <p className="rr-quiet">{errorMessage(image.error, 'This document has no pages to show as they look')}</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="rr-original" src={url} alt={`Page ${page} as it looks`}/> : <div className="rr-original rr-wait" aria-busy="true"/>;
}

function Why({candidateId}: {candidateId: string}): ReactElement {
  const why = useQuery({...getExtractionCandidateExplanationOptions({path: {candidate_id: candidateId}})});
  if (why.isPending) return <p className="rr-quiet">Reading why…</p>;
  if (why.isError) return <p className="rr-quiet">{errorMessage(why.error, 'Could not say why')}</p>;
  return <div className="rr-why"><p>{why.data.summary}</p>{why.data.parts.slice(0, 3).map(p => <p key={p.id}><b>{p.label}:</b> {p.reasoning.join(' ')}</p>)}</div>;
}

function Dots({confidence}: {confidence: number}): ReactElement | null {
  const band = confidenceBand(confidence);
  if (!band) return null;
  const n = band === 'high' ? 3 : band === 'medium' ? 2 : 1;
  return <span className="rr-dots" title={`${Math.round(confidence * 100)}%`}><i aria-hidden="true">{'●'.repeat(n)}{'○'.repeat(3 - n)}</i>{band.charAt(0).toUpperCase() + band.slice(1)}</span>;
}

/** The card's one question, in its own words, with numbered answers. */
function Question({c, answer, setAnswer, active, onAcceptFirst}: {c: ExtractionCandidateOut; answer: Answer; setAnswer: (a: Answer) => void; active: boolean;
  onAcceptFirst: (candidateId: string, caption: string, schema: string) => Promise<string>}): ReactElement | null {
  const isName = c.candidate_type === 'entity';
  const matches = useQuery({...getExtractionEntityMatchesOptions({path: {candidate_id: c.id}}), enabled: isName && c.review_status === 'proposed'});
  const targets = useQuery({...getIdentifierTargetsOptions({path: {candidate_id: c.id}}), enabled: c.candidate_type === 'identifier' && c.review_status === 'proposed'});
  const strong = matches.data?.strong_match ?? null;
  const options = sameAsOptions(matches.data?.matches ?? [], [], strong?.entity_id ?? null).slice(0, 2);
  const caption = proposalText(c);
  const pick = (choices: (() => void)[]) => (e: KeyboardEvent) => {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) { e.preventDefault(); choices[n - 1](); }
  };
  const choices: (() => void)[] = [];
  let body: ReactElement | null = null;
  if (isName && needsSchemaAnswer(c)) {
    const list = schemaChoices(c);
    list.forEach(s => choices.push(() => setAnswer({...answer, schema: s})));
    body = <div className="rr-q" role="group" aria-label={`What is “${caption}”?`}>
      <p>What is “{caption}”? {c.payload.schema_question === true ? 'OpenAleph found the name but not what it is.' : 'The text does not say.'}</p>
      <div className="rr-q-choices">{list.map((s, i) => <button key={s} type="button" aria-pressed={answer.schema === s} onClick={() => setAnswer({...answer, schema: s})}>
        {SCHEMA_WORD[s] ?? s} <kbd>{i + 1}</kbd></button>)}</div>
    </div>;
  }
  if (isName && options.length && (!body || answer.schema)) {
    const qChoices: (() => void)[] = [...options.map(o => () => setAnswer({...answer, identity: {kind: 'same' as const, entityId: o.entityId}})), () => setAnswer({...answer, identity: {kind: 'new'}})];
    if (!body) choices.push(...qChoices);
    body = <>{body}<div className="rr-q" role="group" aria-label="Is this already in the case?">
      <p>Is this already in the case?{strong ? '' : ' (optional)'}</p>
      {options.map((o, i) => {
        const facts = matches.data?.matches.find(m => m.entity_id === o.entityId)?.facts;
        const reason = sameReason(caption, o.caption, o.why);
        return <div key={o.entityId} className="rr-match">
        <span className="rr-known" aria-label={`Already in the case: ${o.caption}`}><b>{o.caption}</b>
          <small>{SCHEMA_WORD[o.schema] ?? o.schema}{typeof facts === 'number' ? ` · ${facts} fact${facts === 1 ? '' : 's'} in the case` : ''}</small>
          <small className={o.why.startsWith('the same name') ? 'rr-agree' : 'rr-near'}><span aria-hidden="true">{o.why.startsWith('the same name') ? '✓ ' : '≈ '}</span>{reason}</small></span>
        <button type="button" aria-pressed={answer.identity?.kind === 'same' && answer.identity.entityId === o.entityId}
          onClick={() => setAnswer({...answer, identity: {kind: 'same', entityId: o.entityId}})}>Same as this {!body || answer.schema ? <kbd>{i + 1}</kbd> : null}</button>
      </div>;
      })}
      <button type="button" className="rr-new" aria-pressed={answer.identity?.kind === 'new'} onClick={() => setAnswer({...answer, identity: {kind: 'new'}})}>
        A new record <kbd>{options.length + 1}</kbd></button>
    </div></>;
  }
  if (c.candidate_type === 'identifier') {
    const data = targets.data;
    const people = data?.document_entities ?? [];
    const waiting = (data?.document_proposals ?? []).filter(p => !p.schema_question);
    people.forEach(p => choices.push(() => setAnswer({...answer, owner: p.entity_id})));
    body = <div className="rr-q" role="group" aria-label="Whose is it?">
      <p>Whose is it?</p>
      <div className="rr-q-choices">
        {people.map((p, i) => <button key={p.entity_id} type="button" aria-pressed={answer.owner === p.entity_id} onClick={() => setAnswer({...answer, owner: p.entity_id})}>
          {p.caption} <kbd>{i + 1}</kbd></button>)}
        {waiting.map(p => <button key={p.candidate_id} type="button" onClick={() => void onAcceptFirst(p.candidate_id, p.caption, p.suggested_schema)
          .then(id => { if (id) setAnswer({...answer, owner: id}); })}>Accept “{p.caption}” first, then link</button>)}
        {(data?.other_entities ?? []).length > 0 && <select aria-label="Someone else" value={(data?.other_entities ?? []).some(o => o.entity_id === answer.owner) ? answer.owner : ''}
          onChange={e => setAnswer({...answer, owner: e.target.value})}>
          <option value="">Someone else…</option>
          {(data?.other_entities ?? []).map(o => <option key={o.entity_id} value={o.entity_id}>{o.caption}</option>)}
        </select>}
      </div>
      {targets.isPending && <p className="rr-quiet">Finding who it could belong to…</p>}
    </div>;
  }
  useEffect(() => {
    if (!active || !choices.length) return undefined;
    const onKey = (e: KeyboardEvent) => { if (!e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && singleKeysOn()) pick(choices)(e); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });  // eslint-disable-line react-hooks/exhaustive-deps -- the latest choices on each key
  if (c.candidate_type === 'claim') return <p className="rr-becomes">Becomes a claim to test. <span className="st st-unshown"><span aria-hidden="true">○</span>Not yet shown</span> until evidence is linked.</p>;
  return body;
}

/** Answer once, apply to the batch (research §8): once this name is said to be a record already in the case, the
 * other waiting mentions of the same name in its drop are offered the same answer, listed; nothing is applied
 * until you say so, and then it waits 6 s with Undo like any decision. */
function SameAnswer({c, record, recordId, schema, onApply}: {c: ExtractionCandidateOut; record: string; recordId: string; schema: string;
  onApply: (b: BatchHeld) => void}): ReactElement | null {
  const same = useQuery({...getSameAnswerCandidatesOptions({path: {candidate_id: c.id}})});
  const [dismissed, setDismissed] = useState(false);
  const list = same.data?.candidates ?? [];
  if (dismissed || !list.length) return null;
  const where = same.data?.scope === 'drop' ? 'in this drop' : 'in this case';
  return <div className="rr-batch" role="group" aria-label="Same answer for the others">
    <p>Same answer for {list.length} more mention{list.length === 1 ? '' : 's'} {where}? <b>{proposalText(c)}</b> = <b>{record}</b></p>
    <ul>{list.slice(0, 6).map(x => <li key={x.candidate_id}>“{x.caption}” · {x.filename}{x.locator ? `, ${x.locator}` : ''}</li>)}
      {list.length > 6 && <li>and {list.length - 6} more</li>}</ul>
    <div className="rr-batch-acts">
      <button type="button" onClick={e => { e.stopPropagation(); setDismissed(true);
        onApply({ids: list.map(x => x.candidate_id), record, body: {decision: 'accept', entity_schema: schema, entity_identity_decision: 'same', matched_entity_id: recordId}, until: Date.now() + HOLD_MS}); }}>
        Apply to these {list.length}</button>
      <button type="button" onClick={e => { e.stopPropagation(); setDismissed(true); }}>No, one at a time</button>
    </div>
  </div>;
}

function Card({c, focus, locator, held, answer, setAnswer, onFocus, onDecide, onUndo, onAcceptFirst, onApplyBatch}: {
  c: ExtractionCandidateOut; focus: boolean; locator: string; held: Held | null; answer: Answer; setAnswer: (a: Answer) => void; onFocus: () => void;
  onDecide: (decision: 'accept' | 'reject', caption?: string) => void; onUndo: () => void;
  onAcceptFirst: (candidateId: string, caption: string, schema: string) => Promise<string>;
  onApplyBatch: (b: BatchHeld) => void;
}): ReactElement {
  const [why, setWhy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(proposalText(c));
  const matches = useQuery({...getExtractionEntityMatchesOptions({path: {candidate_id: c.id}}), enabled: c.candidate_type === 'entity' && c.review_status === 'proposed'});
  const targets = useQuery({...getIdentifierTargetsOptions({path: {candidate_id: c.id}}), enabled: c.candidate_type === 'identifier' && c.review_status === 'proposed'});
  const open = c.review_status === 'proposed' && !held;
  const ask = openQuestion(c, answer, Boolean(matches.data?.strong_match));
  const blocked = ask !== null || (c.candidate_type === 'entity' && matches.isPending);
  const kind = KIND_WORD[c.candidate_type] ?? c.candidate_type;
  const sameId = answer.identity?.kind === 'same' ? answer.identity.entityId : null;
  const record = sameId ? matches.data?.matches.find(m => m.entity_id === sameId)?.caption ?? null : null;
  const owners = [...(targets.data?.document_entities ?? []), ...(targets.data?.other_entities ?? [])];
  const impact = acceptImpact(c, answer, {locator, mentions: ((c.payload as {mentions?: unknown[]}).mentions ?? []).length, record,
    strong: answer.identity?.kind === 'new' ? matches.data?.strong_match?.caption ?? null : null,
    owner: owners.find(o => o.entity_id === answer.owner)?.caption ?? null});
  const impactId = `rr-impact-${c.id}`;
  return <article id={`rr-card-${c.id}`} className={`rr-card rr-${c.candidate_type}${focus ? ' on' : ''}${open ? '' : ' done'}`}
    aria-label={`${kind}: ${proposalText(c)}`} onClick={onFocus}>
    <header>
      <b>{kind}</b>
      {c.review_status === 'proposed' ? <span className="rr-chip">Proposed</span> : <span className={`rr-chip ${c.review_status}`}>{c.review_status === 'accepted' ? '✓ Accepted' : '✕ Rejected'}</span>}
      <Dots confidence={c.confidence}/>
      <small>{proposerOf(c)} · {locator}</small>
    </header>
    {editing ? <input className="rr-edit" aria-label="Edit the name" value={caption} onChange={e => setCaption(e.target.value)} onClick={e => e.stopPropagation()}/>
      : <p className="rr-card-text">{caption}</p>}
    {held ? <p className="rr-held" role="status">{held.decision === 'accept' ? '✓ Accepted' : '✕ Rejected'}: saved in a moment.
      <button type="button" onClick={e => { e.stopPropagation(); onUndo(); }}>Undo <kbd>U</kbd></button></p>
      : open ? <>
        <Question c={c} answer={answer} setAnswer={setAnswer} active={focus} onAcceptFirst={onAcceptFirst}/>
        <div className="rr-answers" role="group" aria-label="Your answer">
          <span className="rr-accept-wrap">
            <button type="button" className="p" disabled={blocked} onClick={e => { e.stopPropagation(); onDecide('accept', editing ? caption : undefined); }}
              aria-keyshortcuts={focus ? 'A' : undefined} aria-describedby={impactId}>Accept <kbd>A</kbd></button>
            <span id={impactId} role="tooltip" className="rr-impact"><b>What changes if you accept</b>
              {impact.map(line => <span key={line}>{line}</span>)}<span className="rr-quiet">Nothing else in the case changes.</span></span>
          </span>
          <button type="button" onClick={e => { e.stopPropagation(); onDecide('reject'); }} aria-keyshortcuts={focus ? 'R' : undefined}>Reject <kbd>R</kbd></button>
          {c.candidate_type === 'entity' && <button type="button" onClick={e => { e.stopPropagation(); setEditing(v => !v); }} aria-pressed={editing}>Edit</button>}
          {blocked && ask && <small className="rr-why-not">{ask === 'owner' ? 'Say whose it is first' : 'Answer the question first'}</small>}
          <button type="button" className="rr-why-btn" onClick={e => { e.stopPropagation(); setWhy(w => !w); }} aria-expanded={why}>Why? ›</button>
        </div>
        {sameId && record && <SameAnswer c={c} record={record} recordId={sameId} onApply={onApplyBatch}
          schema={answer.schema ?? String((c.payload as {suggested_schema?: unknown}).suggested_schema ?? 'LegalEntity')}/>}
      </> : null}
    {why && <Why candidateId={c.id}/>}
  </article>;
}

function Room({investigationId, documentId, startPage, onClose}: {investigationId: string; documentId: string; startPage: number | null; onClose: () => void}): ReactElement {
  const queryClient = useQueryClient();
  const openDocument = useWorkbenchStore(state => state.openDocument);
  const detail = useQuery({...getDocumentOptions({path: {document_id: documentId}})});
  const candidatesKey = listDocumentCandidatesEndpointOptions({path: {document_id: documentId}});
  const candidates = useQuery(candidatesKey);
  const docs = useQuery({...listDocumentsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data ?? [];
  const tags = useQuery({...getTagsOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)}).data;
  const caseName = useQuery({...listInvestigationsOptions()}).data?.find(i => i.id === investigationId)?.name ?? 'Case';
  const [tab, setTab] = useState<Tab>('text');
  const [find, setFind] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState('');
  const [tagMenu, setTagMenu] = useState(false);
  const [filter, setFilter] = useState<'all' | 'questions'>('all');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [held, setHeld] = useState<Held | null>(null);
  const heldRef = useRef<Held | null>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{x1: number; y1: number; x2: number; y2: number} | null>(null);
  const doc: DocumentDetailOut | undefined = detail.data;
  const chunks = useMemo(() => doc?.chunks ?? [], [doc]);
  const all = useMemo(() => candidates.data ?? [], [candidates.data]);
  const byChunk = useMemo(() => {
    const map = new Map<string, Span[]>();
    for (const c of all) {
      if (c.candidate_type === 'evidence' || !c.chunk_id) continue;
      const span = spanOf(c.payload as Record<string, unknown>);
      if (!span) continue;
      map.set(c.chunk_id, [...(map.get(c.chunk_id) ?? []), {...span, id: c.id, kind: c.candidate_type, status: c.review_status, primary: true}]);
      // A name found again further on is marked there too (its card stays beside the first).
      for (const m of ((c.payload as {mentions?: {chunk_id?: string; span?: Record<string, unknown>}[]}).mentions ?? []).slice(1)) {
        const at = m.span ? spanOf({span: m.span}) : null;
        if (m.chunk_id && at) map.set(m.chunk_id, [...(map.get(m.chunk_id) ?? []), {...at, id: c.id, kind: c.candidate_type, status: c.review_status, primary: false}]);
      }
    }
    return map;
  }, [all]);
  const order = useMemo(() => new Map(chunks.map(ch => [ch.id, ch.ordinal])), [chunks]);
  const cards = useMemo(() => all.filter(c => c.candidate_type !== 'evidence' && c.chunk_id && byChunk.get(c.chunk_id)?.some(s => s.id === c.id))
    .sort((a, b) => (order.get(a.chunk_id!) ?? 0) - (order.get(b.chunk_id!) ?? 0)), [all, byChunk, order]);
  const unanchored = all.filter(c => c.candidate_type !== 'evidence' && c.review_status === 'proposed' && !cards.includes(c)).length;
  const pageOf = useCallback((chunkId: string | null | undefined) => chunks.find(ch => ch.id === chunkId)?.page_number ?? 0, [chunks]);
  const pages = useMemo(() => {
    const seen = new Map<number, {page: number; marks: number}>();
    for (const ch of chunks) {
      const p = ch.page_number ?? 0;
      const entry = seen.get(p) ?? {page: p, marks: 0};
      entry.marks += (byChunk.get(ch.id) ?? []).filter(s => s.status === 'proposed' && s.primary).length;
      seen.set(p, entry);
    }
    return [...seen.values()].sort((a, b) => a.page - b.page);
  }, [chunks, byChunk]);
  const paged = pages.some(p => p.page > 0);
  const [page, setPage] = useState<number>(startPage ?? 0);
  const current = pages.find(p => p.page === page)?.page ?? pages[0]?.page ?? 0;
  const pageChunks = chunks.filter(ch => (ch.page_number ?? 0) === current);
  const paraOf = (chunkId: string | null | undefined) => {
    const ch = chunks.find(x => x.id === chunkId);
    const same = chunks.filter(x => (x.page_number ?? 0) === (ch?.page_number ?? 0));
    return same.findIndex(x => x.id === chunkId) + 1;
  };
  const locatorOf = (c: ExtractionCandidateOut) => `${paged ? `p.${pageOf(c.chunk_id)} ` : ''}¶${paraOf(c.chunk_id)}`;
  const pageCards = cards.filter(c => (pageOf(c.chunk_id)) === current);
  const strongOf = (id: string) => Boolean(queryClient.getQueryData<{strong_match?: unknown}>(getExtractionEntityMatchesOptions({path: {candidate_id: id}}).queryKey)?.strong_match);
  const shownCards = filter === 'questions' ? pageCards.filter(c => c.review_status === 'proposed' && openQuestion(c, answers[c.id] ?? {}, strongOf(c.id))) : pageCards;
  const pageClips = clips.filter(cl => (cl.page ?? 0) === current);
  const counts = useMemo(() => {
    const c = {accepted: 0, rejected: 0, waiting: 0};
    for (const x of all) { if (x.review_status === 'accepted') c.accepted += 1; else if (x.review_status === 'rejected') c.rejected += 1; else if (x.review_status === 'proposed') c.waiting += 1; }
    return c;
  }, [all]);
  const tops0 = docs.filter(d => !d.parent_document_id);
  const index = tops0.findIndex(d => d.id === documentId);
  const ocr = pageChunks.some(ch => /\(OCR\)/i.test(ch.locator));
  const isPdf = /\.pdf$/i.test(doc?.filename ?? '');

  // Focus the first waiting proposal of the page once there is one.
  useEffect(() => {
    if (focus && cards.some(c => c.id === focus)) return;
    const first = pageCards.find(c => c.review_status === 'proposed') ?? pageCards[0];
    if (first) setFocus(first.id);
  }, [pageCards, cards, focus]);

  // The leader line from the chosen card to its words.
  useLayoutEffect(() => {
    if (tab !== 'text' || !focus || !roomRef.current) { setLine(null); return undefined; }
    const draw = () => {
      const anchor = document.getElementById(`rr-anchor-${focus}`);
      const card = document.getElementById(`rr-card-${focus}`);
      const room = roomRef.current?.getBoundingClientRect();
      if (!anchor || !card || !room) { setLine(null); return; }
      const a = anchor.getBoundingClientRect();
      const paper = anchor.closest('.rr-paper')?.getBoundingClientRect();
      const b = card.getBoundingClientRect();
      if (!paper || a.top < paper.top || a.top > paper.bottom || b.bottom < room.top) { setLine(null); return; }
      setLine({x1: paper.right - room.left - 12, y1: a.top - room.top + a.height / 2, x2: b.left - room.left, y2: b.top - room.top + 22});
    };
    draw();
    const scrollers = roomRef.current.querySelectorAll('.rr-paper-scroll, .rr-side-list');
    scrollers.forEach(s => s.addEventListener('scroll', draw));
    window.addEventListener('resize', draw);
    return () => { scrollers.forEach(s => s.removeEventListener('scroll', draw)); window.removeEventListener('resize', draw); };
  }, [focus, tab, current, shownCards.length, find, held]);

  useEffect(() => { document.getElementById(`rr-card-${focus}`)?.scrollIntoView?.({block: 'nearest'}); }, [focus]);

  const candidatesQueryKey = candidatesKey.queryKey;
  const send = useCallback(async (h: Held) => {
    try {
      await reviewExtractionCandidate({path: {candidate_id: h.c.id}, body: {decision: h.decision, ...h.body}, throwOnError: true});
      setStatus(h.decision === 'accept' ? `✓ ${proposalText(h.c)} added to the case.` : `✕ Rejected: ${proposalText(h.c)}`);
    } catch (error) { setStatus(errorMessage(error, 'Not saved: try again')); }
    await queryClient.invalidateQueries({queryKey: candidatesQueryKey});
  }, [documentId, queryClient]);  // eslint-disable-line react-hooks/exhaustive-deps -- the key follows documentId
  const sendRef = useRef(send);
  sendRef.current = send;

  // A decision waits HOLD_MS before it is sent, so U can take it back; closing sends it.
  useEffect(() => {
    heldRef.current = held;
    if (!held) return undefined;
    const timer = window.setTimeout(() => { setHeld(null); heldRef.current = null; void send(held); }, Math.max(0, held.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [held, send]);
  // Closing the room sends a decision still held.
  useEffect(() => () => { if (heldRef.current) void sendRef.current(heldRef.current); }, []);

  // The same answer for other mentions of a name: held like one decision, then sent one by one.
  const [heldBatch, setHeldBatch] = useState<BatchHeld | null>(null);
  const heldBatchRef = useRef<BatchHeld | null>(null);
  const sendBatch = useCallback(async (b: BatchHeld) => {
    let done = 0;
    const failed: string[] = [];
    for (const id of b.ids) {
      try { await reviewExtractionCandidate({path: {candidate_id: id}, body: b.body as never, throwOnError: true}); done += 1; }
      catch (error) { failed.push(errorMessage(error, 'not saved')); }
    }
    setStatus(`✓ ${done} more mention${done === 1 ? '' : 's'} added to ${b.record}.${failed.length ? ` ${failed.length} not saved: ${failed[0]}` : ''}`);
    await queryClient.invalidateQueries();
  }, [queryClient]);
  const sendBatchRef = useRef(sendBatch);
  sendBatchRef.current = sendBatch;
  useEffect(() => {
    heldBatchRef.current = heldBatch;
    if (!heldBatch) return undefined;
    const timer = window.setTimeout(() => { setHeldBatch(null); heldBatchRef.current = null; void sendBatch(heldBatch); }, Math.max(0, heldBatch.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [heldBatch, sendBatch]);
  useEffect(() => () => { if (heldBatchRef.current) void sendBatchRef.current(heldBatchRef.current); }, []);
  const undoBatch = () => { if (heldBatchRef.current) setStatus(`Undone: the ${heldBatchRef.current.ids.length} other mentions still wait.`); setHeldBatch(null); heldBatchRef.current = null; };

  const decide = useCallback((c: ExtractionCandidateOut, decision: 'accept' | 'reject', caption?: string) => {
    if (heldRef.current && heldRef.current.c.id !== c.id) void send(heldRef.current);
    const p = c.payload as Record<string, unknown>;
    const a = answers[c.id] ?? {};
    const body: Record<string, unknown> = {};
    if (decision === 'accept' && c.candidate_type === 'entity') {
      body.entity_schema = a.schema ?? String(p.suggested_schema ?? 'LegalEntity');
      Object.assign(body, identityFields(a.identity, null));
      if (caption && caption.trim() !== proposalText(c)) body.caption = caption.trim();
    }
    if (decision === 'accept' && c.candidate_type === 'identifier') body.target_entity_id = a.owner;
    const next: Held = {c, decision, body, until: Date.now() + HOLD_MS};
    setHeld(next);
    heldRef.current = next;
    const at = cards.indexOf(c);
    const after = [...cards.slice(at + 1), ...cards.slice(0, at)].find(x => x.review_status === 'proposed' && x.id !== c.id);
    if (after) { setFocus(after.id); setPage(pageOf(after.chunk_id)); }
  }, [answers, cards, pageOf, send]);

  const undo = () => { if (heldRef.current) { setStatus(`Undone: ${proposalText(heldRef.current.c)} still waits.`); setFocus(heldRef.current.c.id); setPage(pageOf(heldRef.current.c.chunk_id)); } setHeld(null); heldRef.current = null; };

  const acceptFirst = async (candidateId: string, caption: string, schema: string): Promise<string> => {
    try {
      const reply = (await reviewExtractionCandidate({path: {candidate_id: candidateId}, body: {decision: 'accept', caption, entity_schema: schema}, throwOnError: true})).data;
      await queryClient.invalidateQueries();
      setStatus(`✓ ${caption} added to the case.`);
      return typeof reply.record?.id === 'string' ? reply.record.id : '';
    } catch (error) { setStatus(errorMessage(error, `Accept “${caption}” in its own card first`)); return ''; }
  };

  const readSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { setPicked(null); return; }
    const range = sel.getRangeAt(0);
    const host = (range.startContainer.parentElement)?.closest('[data-chunk]') as HTMLElement | null;
    const end = (range.endContainer.parentElement)?.closest('[data-chunk]') as HTMLElement | null;
    const chunk = chunks.find(ch => ch.id === host?.dataset.chunk);
    if (!host || host !== end || !chunk) { setPicked(null); setStatus('Select words within one passage.'); return; }
    const before = document.createRange();
    before.setStart(host, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const quote = range.toString();
    if (!quote.trim()) { setPicked(null); return; }
    const box = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
    const room = roomRef.current?.getBoundingClientRect();
    setPicked({chunk, start, end: start + quote.length, quote, x: box && room ? box.left - room.left : 0, y: box && room ? box.top - room.top : 0});
  };

  const keep = async (what: 'evidence' | 'claim' | 'name' | 'check') => {
    if (!picked || !doc) return;
    const {chunk, start, end, quote} = picked;
    try {
      if (what === 'evidence' || what === 'claim') {
        const ev = (await createEvidenceEndpoint({body: {source_id: doc.source_id, quote, locator: chunk.locator, ...(isPicture(doc) ? {document_id: doc.id} : {})}, throwOnError: true})).data;
        setClips(cs => [clipOf(chunk, start, end, quote, doc.sha256, ev.id), ...cs]);
        window.dispatchEvent(new Event(SHUTTER_EVENT));
        if (what === 'claim') {
          const claim = (await createClaimEndpoint({body: {investigation_id: investigationId, text: quote, status: 'unverified', confidence: 0.5}, throwOnError: true})).data;
          await linkClaimEvidenceEndpoint({path: {claim_id: claim.id}, body: {evidence_id: ev.id, stance: 'supports'}, throwOnError: true});
          setStatus('Kept as a claim, with these words as its evidence.');
        } else setStatus('Kept as evidence.');
      } else if (what === 'name') {
        await createEntity({body: {investigation_id: investigationId, schema: 'LegalEntity', caption: quote.trim(), properties: {name: [quote.trim()]}}, throwOnError: true});
        setStatus(`Kept as a name: ${quote.trim()}.`);
      } else {
        await createLeadEndpoint({body: {investigation_id: investigationId, title: `Check: ${quote.trim().slice(0, 140)}`,
          detail: `${doc.filename}, ${chunk.locator}: “${quote.trim()}”`}, throwOnError: true});
        setStatus('Kept as something to check (a lead).');
      }
      window.getSelection()?.removeAllRanges();
      setPicked(null);
      await queryClient.invalidateQueries();
    } catch (error) { setStatus(errorMessage(error, 'Could not keep it')); }
  };
  const tag = async (tagId: string) => {
    setTagMenu(false);
    try {
      await tagARecord({path: {investigation_id: investigationId}, body: {tag_id: tagId, record_type: 'document', record_id: documentId}, throwOnError: true});
      setStatus('Tagged the document.');
    } catch (error) { setStatus(errorMessage(error, 'Could not tag it')); }
  };

  const move = (step: number) => {
    const open = cards.filter(c => c.review_status === 'proposed' || c.id === focus);
    if (!open.length) return;
    const at = open.findIndex(c => c.id === focus);
    const next = open[Math.min(open.length - 1, Math.max(0, (at < 0 ? -1 : at) + step))];
    setFocus(next.id);
    setPage(pageOf(next.chunk_id));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (picked) setPicked(null); else onClose(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); findRef.current?.focus(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || !singleKeysOn()) return;
      const k = e.key.toLowerCase();
      if (picked && ['e', 'c', 'n', 'x', 't'].includes(k)) {
        e.preventDefault();
        if (k === 't') setTagMenu(true);
        else void keep(k === 'e' ? 'evidence' : k === 'c' ? 'claim' : k === 'n' ? 'name' : 'check');
        return;
      }
      if (k === 'j') { e.preventDefault(); move(1); return; }
      if (k === 'k') { e.preventDefault(); move(-1); return; }
      if (k === 'u' && heldBatchRef.current) { e.preventDefault(); undoBatch(); return; }
      if (k === 'u' && heldRef.current) { e.preventDefault(); undo(); return; }
      const card = cards.find(c => c.id === focus);
      if (!card || card.review_status !== 'proposed' || held?.c.id === card.id) return;
      if (k === 'a') {
        const blocked = openQuestion(card, answers[card.id] ?? {}, strongOf(card.id)) !== null;
        if (blocked) { setStatus('Answer the question on the card first.'); return; }
        e.preventDefault(); decide(card, 'accept');
      }
      if (k === 'r') { e.preventDefault(); decide(card, 'reject'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });  // eslint-disable-line react-hooks/exhaustive-deps -- reads the latest state on each key

  const findCount = useMemo(() => {
    const n = find.trim().toLowerCase();
    if (n.length < 2) return 0;
    return chunks.reduce((sum, ch) => sum + (ch.text.toLowerCase().split(n).length - 1), 0);
  }, [chunks, find]);

  const title = (doc?.filename ?? '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return <div ref={roomRef} className="rr" role="dialog" aria-modal="true" aria-label={`Reading room: ${doc?.filename ?? 'document'}`}>
    <header className="rr-top">
      <nav className="rr-crumbs" aria-label="You are here"><span>{caseName}</span><span>Bring in</span><span>Reading room</span><b>{doc?.filename ?? 'Opening…'}</b></nav>
      <div role="tablist" aria-label="How to read it" className="rr-tabs">
        {(['text', 'original', 'translation', 'details'] as Tab[]).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
          {t === 'text' ? 'Text' : t === 'original' ? 'Original' : t === 'translation' ? 'Translation' : 'Details'}</button>)}
      </div>
      <span className="rr-find-box"><input ref={findRef} type="search" className="rr-find-input" aria-label="Find in this document" placeholder="Find in this document" value={find} onChange={e => setFind(e.target.value)}/>
        <kbd aria-hidden="true">⌘F</kbd></span>
      {find.trim().length > 1 && <small className="rr-quiet">{findCount} found</small>}
      {index >= 0 && <span className="rr-nav">
        <button type="button" disabled={index <= 0} onClick={() => openDocument(tops0[index - 1].id)} aria-label="Previous document">‹</button>
        Document {index + 1} of {tops0.length}
        <button type="button" disabled={index >= tops0.length - 1} onClick={() => openDocument(tops0[index + 1].id)} aria-label="Next document">›</button>
      </span>}
      <button type="button" className="rr-close" onClick={onClose} aria-label="Close the reading room">×</button>
    </header>

    <nav className="rr-pages" aria-label="Pages">
      <ol>{pages.map(p => <li key={p.page}><button type="button" aria-current={current === p.page ? 'true' : undefined} onClick={() => { setPage(p.page); if (tab === 'details' || tab === 'translation') setTab('text'); }}
        aria-label={`${paged ? `Page ${p.page}` : 'The text'}${p.marks ? `, ${p.marks} waiting` : ''}`}>
        <span className="rr-page-n">{paged ? p.page : '¶'}</span>
        <span className="rr-thumb">{isPdf && paged ? <PagePicture documentId={documentId} page={p.page} width={120} alt=""/> : <i className="rr-lines" aria-hidden="true"/>}</span>
        {p.marks > 0 && <span className="rr-marks" aria-hidden="true">{Array.from({length: Math.min(p.marks, 4)}, (_, i) => <i key={i}/>)}</span>}
      </button></li>)}</ol>
      <p className="rr-strip-counts">{pages.length} {paged ? `page${pages.length === 1 ? '' : 's'}` : 'text'}<br/>{counts.waiting} waiting<br/>{unanchored} unanchored</p>
    </nav>

    <main className="rr-main">
      {detail.isError ? <p role="alert">{errorMessage(detail.error, 'Could not open the document')}</p>
        : tab === 'text' ? <div className="rr-paper">
          <div className="rr-paper-scroll" onMouseUp={readSelection} onKeyUp={e => { if (e.shiftKey) readSelection(); }}>
            <p className="rr-chips">
              {paged && <span>Page {current} of {pages.length}</span>}
              {pageChunks.length > 0 && <span>{ocr ? 'Read by OCR' : 'Read from the file’s own text'}</span>}
              {paged && <small>p. {current}</small>}
            </p>
            <h2 className="rr-doc-title">{title}</h2>
            {pageChunks.map((ch, i) => <div key={ch.id} className="rr-para">
              <span className="rr-pilcrow" aria-hidden="true">¶{i + 1}</span>
              <p className="rr-passage" data-chunk={ch.id} title={ch.locator}>
                <Marked text={ch.text} spans={byChunk.get(ch.id) ?? []} find={find} focus={focus} onFocus={setFocus}/></p>
            </div>)}
            {!chunks.length && <p className="rr-quiet">{doc ? 'No text was read from this document.' : 'Opening…'}</p>}
            {(doc?.extraction_issues ?? []).map(issue => <p key={issue} className="rr-issue"><span className="st st-unshown"><span aria-hidden="true">○</span>Note</span> {issue}</p>)}
          </div>
        </div>
        : tab === 'original' ? <div className="rr-orig-wrap">{paged
          ? <OriginalPage documentId={documentId} page={current}/> : <p className="rr-quiet">Only a PDF has pages to show as they look.</p>}</div>
        : tab === 'translation' ? <div className="rr-orig-wrap"><DocumentTranslation documentId={documentId}/></div>
        : <dl className="rr-details">
          <div><dt>File</dt><dd>{doc?.filename}</dd></div>
          <div><dt>Fingerprint</dt><dd><code>{doc?.sha256}</code></dd></div>
          <div><dt>Read</dt><dd>{doc?.extraction_status}{doc?.extraction_error ? ` · ${doc.extraction_error}` : ''}</dd></div>
          <div><dt>Passages</dt><dd>{chunks.length}</dd></div>
          {(doc?.extraction_issues ?? []).map(i => <div key={i}><dt>Note</dt><dd>{i}</dd></div>)}
        </dl>}
    </main>

    <aside className="rr-side" aria-label="What was found on this page">
      <header className="rr-side-head">
        <p><b>{paged ? `Page ${current}` : 'This text'}</b> · {pageCards.length} proposal{pageCards.length === 1 ? '' : 's'} · {pageClips.length} clip{pageClips.length === 1 ? '' : 's'}</p>
        <span role="radiogroup" aria-label="Show">
          <button type="button" role="radio" aria-checked={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          <button type="button" role="radio" aria-checked={filter === 'questions'} onClick={() => setFilter('questions')}>Questions only</button>
        </span>
      </header>
      <div className="rr-side-list">
        {heldBatch && <p className="rr-held rr-batch-held" role="status">✓ {heldBatch.ids.length} more mention{heldBatch.ids.length === 1 ? '' : 's'} go to {heldBatch.record} in a moment.
          <button type="button" onClick={undoBatch}>Undo <kbd>U</kbd></button></p>}
        {pageClips.map(cl => <section key={cl.evidenceId || cl.anchor} className="rr-clip" aria-label="Evidence clip">
          <p className="rr-eyebrow">Evidence clip <span className="rr-quiet">saved just now</span>
            <span className="st st-unshown"><span aria-hidden="true">○</span>Not yet shown</span></p>
          <div className="rr-clip-body">
            <blockquote><span className="rr-ctx">…{cl.before}</span><mark>{cl.quote}</mark><span className="rr-ctx">{cl.after}…</span></blockquote>
            {isPdf && cl.page ? <span className="rr-clip-scan"><PagePicture documentId={documentId} page={cl.page} passage={cl.quote} width={160} alt={`Page ${cl.page}, the words marked`}/></span> : null}
          </div>
          <p className="rr-clip-meta">{cl.anchor} · <code title={cl.fingerprint}>SHA-256 {cl.fingerprint.slice(0, 6)}…{cl.fingerprint.slice(-4)}</code>{' '}
            {cl.checked ? <span className="rr-ok">✓ the words are in the stored text</span> : <span className="rr-bad">✕ the words differ from the stored text</span>}</p>
        </section>)}
        {shownCards.map(c => <Card key={c.id} c={c} focus={focus === c.id} locator={locatorOf(c)} held={held?.c.id === c.id ? held : null}
          answer={answers[c.id] ?? {}} setAnswer={a => setAnswers(prev => ({...prev, [c.id]: a}))} onFocus={() => setFocus(c.id)}
          onDecide={(d, caption) => decide(c, d, caption)} onUndo={undo} onAcceptFirst={acceptFirst} onApplyBatch={b => { setHeldBatch(b); heldBatchRef.current = b; }}/>)}
        {!shownCards.length && !pageClips.length && <p className="rr-quiet">{filter === 'questions' ? 'No question waits on this page.'
          : pageCards.length ? '' : `Nothing waits on this ${paged ? 'page' : 'text'}.`}{counts.waiting && !pageCards.some(c => c.review_status === 'proposed') ? ' Others wait elsewhere: J moves to the next.' : ''}</p>}
      </div>
    </aside>

    {line && <svg className="rr-leader" aria-hidden="true"><circle cx={line.x1} cy={line.y1} r={3}/>
      <path d={`M${line.x1},${line.y1} C${(line.x1 + line.x2) / 2},${line.y1} ${(line.x1 + line.x2) / 2},${line.y2} ${line.x2},${line.y2}`}/></svg>}

    {picked && <div className="rr-selbar" role="toolbar" aria-label="Keep the selected words"
      style={picked.x || picked.y ? {left: Math.max(8, picked.x), top: Math.max(8, picked.y - 48)} : undefined}>
      <button type="button" className="p" onClick={() => void keep('evidence')}>Evidence <kbd>E</kbd></button>
      <button type="button" onClick={() => void keep('claim')}>Claim <kbd>C</kbd></button>
      <button type="button" onClick={() => void keep('name')}>Name <kbd>N</kbd></button>
      <button type="button" onClick={() => void keep('check')}>To check <kbd>X</kbd></button>
      <button type="button" onClick={() => setTagMenu(m => !m)} aria-expanded={tagMenu}>Tag <kbd>T</kbd></button>
      {tagMenu && <span className="rr-tags">{(tags?.tags ?? []).length ? (tags?.tags ?? []).map(t => <button key={t.id} type="button" onClick={() => void tag(t.id)}>{t.name}</button>)
        : <small>No tags yet; make them in Keep.</small>}</span>}
    </div>}

    <footer className="rr-foot">
      <span className="rr-keys"><kbd>J</kbd><kbd>K</kbd> move · <kbd>A</kbd><kbd>R</kbd> decide · <kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>E</kbd> clip · <kbd>U</kbd> undo · <kbd>?</kbd></span>
      <span><b>{counts.accepted}</b> accepted · <b>{counts.rejected}</b> rejected · <b>{counts.waiting}</b> waiting</span>
      <span aria-live="polite" className="rr-status">{status}</span>
      {index >= 0 && index < tops0.length - 1 && <button type="button" className="rr-next" onClick={() => openDocument(tops0[index + 1].id)}>Next ›</button>}
    </footer>
  </div>;
}

/** The reading room, open while a document is asked for (the workbench store's document). */
// The backend takes document_id on evidence only for an uploaded picture (it also
// stores the picture's date). For text the source and the locator already say where
// the words are, so sending the id made "Keep as evidence" fail with a 400.
const isPicture = (doc: {mime_type?: string | null}) => (doc.mime_type ?? '').toLowerCase().startsWith('image/');

export function ReadingRoom({investigationId}: {investigationId: string}): ReactElement | null {
  const request = useWorkbenchStore(state => state.document);
  const close = useWorkbenchStore(state => state.closeDocument);
  // The reading room is a whole-screen feature: opening it plays the iris (Rain Noir).
  const opened = request ? `${request.documentId}:${request.serial}` : '';
  useEffect(() => { if (opened) window.dispatchEvent(new Event(FEATURE_OPEN_EVENT)); }, [opened]);
  if (!request || !investigationId) return null;
  return <Room key={`${request.documentId}:${request.serial}`} investigationId={investigationId} documentId={request.documentId} startPage={request.pageNumber} onClose={close}/>;
}
