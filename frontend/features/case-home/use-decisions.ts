'use client';
// The one list of decisions only a person can make (backend
// app/services/case_home.py), shared by the Next up card on Case home and the
// Decide screen. A choice is held for a few seconds before it is sent, so Undo
// works for every kind, including the ones the server cannot undo; leaving the
// page sends what is held at once.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {UseQueryResult} from '@tanstack/react-query';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {getDecisionsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {CaseDecisionsOut, DecisionChoiceOut, DecisionItemOut, GetDecisionsError} from '../../lib/generated/types.gen';
import {useRedFlagsQuery} from '../red-flags/use-red-flags-query';

export const HOLD_MS = 10_000;
export type DecisionKind = DecisionItemOut['kind'];
export type DecisionOrder = 'consequence' | 'source' | 'oldest';

export const KIND_LABEL: Record<DecisionKind, string> = {
  to_check: 'To check', missing: 'Missing', proposal: 'Proposals', match: 'Matches', outside: 'Outside', ai: 'AI drafts', watchlist: 'Watchlist',
};

/** Each kind's mark (the decision-kind vocabulary Inbox and Case home reuse) and, for its reveal, what it is. */
export const KIND_ICON: Record<DecisionKind, string> = {to_check: '?', missing: '∅', proposal: '◇', match: '⇄', outside: '◎', ai: 'AI', watchlist: '◉'};
export const KIND_MEANING: Record<DecisionKind, string> = {
  to_check: 'A check only a person can make.', missing: 'A value the records do not hold yet.', proposal: 'Something read from a document, waiting for you.',
  match: 'Two records that may be the same.', outside: 'A finding from outside records, to review.', ai: 'Drafted by AI, to review.', watchlist: 'A name on your watchlist turned up.',
};

/** Kinds whose endpoint keeps a note with the answer (checks, extraction review, cross-references, AI review). */
export const TAKES_NOTE = new Set<DecisionKind>(['to_check', 'missing', 'proposal', 'match', 'ai']);

export type Decided = {
  item: DecisionItemOut; choice: DecisionChoiceOut; note: string; at: number; state: 'held' | 'saving' | 'saved' | 'failed' | 'reopening';
  error?: string; batch?: string;
};

/** The reason chips under No, per kind (FEATURE_CHECK §2 rule 3): a chip, typing optional. Only kinds whose
 *  endpoint stores a note offer them; a watchlist hit's dismiss keeps no reason, so its No answers at once. */
export const NO_REASONS: Record<DecisionKind, string[]> = {
  to_check: ['Not in this passage', 'Different party', 'Different date', 'Misread'],
  missing: ['Not public', 'Not recorded anywhere', 'The source would not say'],
  proposal: ['Misread', 'Wrong party', 'Not in this passage', 'Different date'],
  match: ['Different person', 'Different company', 'Same name only'],
  outside: [],
  ai: ['Cites the wrong record', 'Overstates the evidence', 'Misses what weakens it'],
  watchlist: [],
};

/** Why an answer in the Last 10 strip cannot be taken back, or null when it can. One still held (or that
 *  failed) is simply dropped; a saved To check item or missing value goes back to open on the server
 *  (POST …/decide {status: 'open'}). No other kind's endpoint takes an answer back, and chasing a missing
 *  value opened a lead that reopening would leave behind. */
export function undoBlocked(d: Decided): string | null {
  if (d.state === 'held' || d.state === 'failed') return null;
  if (d.state === 'saving' || d.state === 'reopening') return 'Being sent; wait a moment.';
  if (d.item.kind !== 'to_check' && d.item.kind !== 'missing') return `Saved. ${KIND_LABEL[d.item.kind]} cannot be taken back once sent.`;
  if (d.choice.body.status === 'chasing') return 'Saved. Chasing opened a lead; close the lead in Leads instead.';
  return null;
}

/** A proposal that can be accepted with others in one go ("Accept all n high"): rated high, and its Yes
 *  answers no question first (a name with a record of the same name asks same-or-new, so it is left out). */
export function acceptsInBulk(item: DecisionItemOut): boolean {
  const yes = item.choices.find(c => c.key === 'yes');
  return item.kind === 'proposal' && item.confidence_band === 'high' && yes !== undefined && !('entity_identity_decision' in yes.body);
}

export type DecisionQueue = {
  query: UseQueryResult<CaseDecisionsOut, GetDecisionsError>; items: DecisionItemOut[]; counts: Record<string, number>; decided: Decided[];
  decide: (item: DecisionItemOut, choice: DecisionChoiceOut, note?: string) => void; undo: (itemId?: string) => boolean;
  /** Holds Yes for each item; they are sent together after the wait, and undone as one. */
  acceptAll: (items: DecisionItemOut[]) => void; undoBatch: (batch: string) => void;
  retry: (itemId: string) => void; held: Decided | null; undoError: string | null;
};

export function useDecisions(investigationId: string, {kind, order = 'consequence', enabled = true}: {kind?: DecisionKind; order?: DecisionOrder; enabled?: boolean} = {}): DecisionQueue {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...getDecisionsOptions({path: {investigation_id: investigationId}, query: {order, ...(kind ? {kind} : {})}}),
    enabled: enabled && Boolean(investigationId),
  });
  // Reading the decisions never brings the To check items up to date: when they are behind the records, this runs
  // the rules once and the run refetches the list.
  useRedFlagsQuery(investigationId, enabled);
  const [decided, setDecided] = useState<Decided[]>([]);
  const [undoError, setUndoError] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());
  const decidedRef = useRef(decided);
  decidedRef.current = decided;

  // A decision can change claims, records, flags, links and counts: every query is marked stale; the shown ones reload.
  const refresh = useCallback(async () => { await queryClient.invalidateQueries(); }, [queryClient]);

  const send = useCallback(async (key: string, reload = true) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    const entry = decidedRef.current.find(d => d.item.id === key);
    if (!entry || entry.state !== 'held') return;
    setDecided(list => list.map(d => (d.item.id === key ? {...d, state: 'saving'} : d)));
    const body = {...entry.choice.body, ...(entry.note && TAKES_NOTE.has(entry.item.kind) ? {note: entry.note} : {})};
    try {
      await api.unknown(entry.choice.path, {method: entry.choice.method, body});
      setDecided(list => list.map(d => (d.item.id === key ? {...d, state: 'saved'} : d)));
      if (reload) void refresh();
    } catch (error) {
      setDecided(list => list.map(d => (d.item.id === key ? {...d, state: 'failed', error: errorMessage(error, 'The server did not answer')} : d)));
    }
  }, [refresh]);

  // A batch is sent one answer after another, then the case reloads once.
  const sendBatch = useCallback(async (batch: string) => {
    window.clearTimeout(timers.current.get(batch));
    timers.current.delete(batch);
    const keys = decidedRef.current.filter(d => d.batch === batch && d.state === 'held').map(d => d.item.id);
    for (const key of keys) await send(key, false);
    void refresh();
  }, [refresh, send]);

  const decide = useCallback((item: DecisionItemOut, choice: DecisionChoiceOut, note = '') => {
    setDecided(list => [{item, choice, note: note.trim(), at: Date.now(), state: 'held' as const}, ...list.filter(d => d.item.id !== item.id)].slice(0, 30));
    timers.current.set(item.id, window.setTimeout(() => { void send(item.id); }, HOLD_MS));
  }, [send]);

  const acceptAll = useCallback((chosen: DecisionItemOut[]) => {
    const batch = `batch:${Date.now()}`;
    const entries: Decided[] = chosen.flatMap(item => {
      const yes = item.choices.find(c => c.key === 'yes');
      return yes ? [{item, choice: yes, note: '', at: Date.now(), state: 'held' as const, batch}] : [];
    });
    const ids = new Set(entries.map(e => e.item.id));
    setDecided(list => [...entries, ...list.filter(d => !ids.has(d.item.id))].slice(0, Math.max(30, entries.length + 10)));
    timers.current.set(batch, window.setTimeout(() => { void sendBatch(batch); }, HOLD_MS));
  }, [sendBatch]);

  const undoBatch = useCallback((batch: string) => {
    window.clearTimeout(timers.current.get(batch));
    timers.current.delete(batch);
    setDecided(list => list.filter(d => d.batch !== batch || (d.state !== 'held' && d.state !== 'failed')));
  }, []);

  // Without an id, the newest held answer goes (or its whole batch).
  const undo = useCallback((itemId?: string) => {
    const newest = decidedRef.current.find(d => d.state === 'held');
    if (!itemId && newest?.batch) { undoBatch(newest.batch); return true; }
    const target = itemId ?? newest?.item.id;
    if (!target) return false;
    const entry = decidedRef.current.find(d => d.item.id === target);
    if (!entry || undoBlocked(entry)) return false;
    if (entry.state === 'saved') {
      setUndoError(null);
      setDecided(list => list.map(d => (d.item.id === target ? {...d, state: 'reopening'} : d)));
      api.unknown(entry.choice.path, {method: 'POST', body: {status: 'open'}}).then(async () => {
        setDecided(list => list.filter(d => d.item.id !== target));
        await refresh();
      }, (error: unknown) => {
        setDecided(list => list.map(d => (d.item.id === target ? {...d, state: 'saved'} : d)));
        setUndoError(`Could not take back “${entry.choice.label}”: ${errorMessage(error, 'the server did not answer')}.`);
      });
      return true;
    }
    if (!entry.batch) {
      window.clearTimeout(timers.current.get(target));
      timers.current.delete(target);
    }
    setDecided(list => list.filter(d => d.item.id !== target));
    return true;
  }, [refresh, undoBatch]);

  const retry = useCallback((itemId: string) => {
    setDecided(list => list.map(d => (d.item.id === itemId ? {...d, state: 'held', error: undefined, batch: undefined} : d)));
    window.setTimeout(() => { void send(itemId); }, 0);
  }, [send]);

  // Leaving sends what is held.
  useEffect(() => {
    const flush = () => { for (const key of [...timers.current.keys()]) void (key.startsWith('batch:') ? sendBatch(key) : send(key)); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [send, sendBatch]);

  const hidden = useMemo(() => new Set(decided.filter(d => d.state !== 'failed').map(d => d.item.id)), [decided]);
  const items = useMemo(() => (query.data?.items ?? []).filter(i => !hidden.has(i.id)), [query.data, hidden]);
  const counts = query.data?.counts ?? {};
  return {query, items, counts, decided, decide, undo, acceptAll, undoBatch, retry, held: decided.find(d => d.state === 'held') ?? null, undoError};
}

/** The words of an excerpt with the matched terms marked. */
export function markTerms(text: string, terms: string[]): {text: string; hit: boolean}[] {
  const wanted = terms.map(t => t.trim()).filter(Boolean);
  if (!wanted.length || !text) return [{text, hit: false}];
  const escaped = wanted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(pattern).filter(Boolean).map(part => ({text: part, hit: wanted.some(t => t.toLowerCase() === part.toLowerCase())}));
}
