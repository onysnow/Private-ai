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

export const HOLD_MS = 8000;
export type DecisionKind = DecisionItemOut['kind'];
export type DecisionOrder = 'consequence' | 'source' | 'oldest';

export const KIND_LABEL: Record<DecisionKind, string> = {
  to_check: 'To check', missing: 'Missing', proposal: 'Proposals', match: 'Matches', outside: 'Outside', ai: 'AI drafts', watchlist: 'Watchlist',
};

/** Kinds whose endpoint keeps a note with the answer. */
const TAKES_NOTE = new Set<DecisionKind>(['to_check', 'missing', 'proposal', 'match', 'ai']);

export type Decided = {item: DecisionItemOut; choice: DecisionChoiceOut; note: string; at: number; state: 'held' | 'saving' | 'saved' | 'failed'; error?: string};

/** The reason chips under No, per kind (FEATURE_CHECK §2 rule 3): a chip, typing optional. */
export const NO_REASONS: Record<DecisionKind, string[]> = {
  to_check: ['Not in this passage', 'Different party', 'Different date', 'Misread'],
  missing: ['Not public', 'Not recorded anywhere', 'The source would not say'],
  proposal: ['Misread', 'Wrong party', 'Not in this passage', 'Not a name'],
  match: ['Different person', 'Different company', 'Same name only'],
  outside: [],
  ai: ['Cites the wrong record', 'Overstates the evidence', 'Misses what weakens it'],
  watchlist: ['Someone else with this name', 'Not relevant'],
};

export type DecisionQueue = {
  query: UseQueryResult<CaseDecisionsOut, GetDecisionsError>; items: DecisionItemOut[]; counts: Record<string, number>; decided: Decided[];
  decide: (item: DecisionItemOut, choice: DecisionChoiceOut, note?: string) => void; undo: (itemId?: string) => boolean;
  retry: (itemId: string) => void; held: Decided | null;
};

export function useDecisions(investigationId: string, {kind, order = 'consequence', enabled = true}: {kind?: DecisionKind; order?: DecisionOrder; enabled?: boolean} = {}): DecisionQueue {
  const queryClient = useQueryClient();
  const query = useQuery({
    ...getDecisionsOptions({path: {investigation_id: investigationId}, query: {order, ...(kind ? {kind} : {})}}),
    enabled: enabled && Boolean(investigationId),
  });
  const [decided, setDecided] = useState<Decided[]>([]);
  const timers = useRef(new Map<string, number>());
  const decidedRef = useRef(decided);
  decidedRef.current = decided;

  // A decision can change claims, records, flags, links and counts: every query is marked stale; the shown ones reload.
  const refresh = useCallback(async () => { await queryClient.invalidateQueries(); }, [queryClient]);

  const send = useCallback(async (key: string) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    const entry = decidedRef.current.find(d => d.item.id === key);
    if (!entry || entry.state !== 'held') return;
    setDecided(list => list.map(d => (d.item.id === key ? {...d, state: 'saving'} : d)));
    const body = {...entry.choice.body, ...(entry.note && TAKES_NOTE.has(entry.item.kind) ? {note: entry.note} : {})};
    try {
      await api.unknown(entry.choice.path, {method: entry.choice.method, body});
      setDecided(list => list.map(d => (d.item.id === key ? {...d, state: 'saved'} : d)));
      void refresh();
    } catch (error) {
      setDecided(list => list.map(d => (d.item.id === key ? {...d, state: 'failed', error: errorMessage(error, 'The server did not answer')} : d)));
    }
  }, [refresh]);

  const decide = useCallback((item: DecisionItemOut, choice: DecisionChoiceOut, note = '') => {
    setDecided(list => [{item, choice, note: note.trim(), at: Date.now(), state: 'held' as const}, ...list.filter(d => d.item.id !== item.id)].slice(0, 30));
    timers.current.set(item.id, window.setTimeout(() => { void send(item.id); }, HOLD_MS));
  }, [send]);

  const undo = useCallback((itemId?: string) => {
    const target = itemId ?? decidedRef.current.find(d => d.state === 'held')?.item.id;
    if (!target) return false;
    const entry = decidedRef.current.find(d => d.item.id === target);
    if (!entry || (entry.state !== 'held' && entry.state !== 'failed')) return false;
    window.clearTimeout(timers.current.get(target));
    timers.current.delete(target);
    setDecided(list => list.filter(d => d.item.id !== target));
    return true;
  }, []);

  const retry = useCallback((itemId: string) => {
    setDecided(list => list.map(d => (d.item.id === itemId ? {...d, state: 'held', error: undefined} : d)));
    window.setTimeout(() => { void send(itemId); }, 0);
  }, [send]);

  // Leaving sends what is held.
  useEffect(() => {
    const flush = () => { for (const key of [...timers.current.keys()]) void send(key); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [send]);

  const hidden = useMemo(() => new Set(decided.filter(d => d.state !== 'failed').map(d => d.item.id)), [decided]);
  const items = useMemo(() => (query.data?.items ?? []).filter(i => !hidden.has(i.id)), [query.data, hidden]);
  const counts = query.data?.counts ?? {};
  return {query, items, counts, decided, decide, undo, retry, held: decided.find(d => d.state === 'held') ?? null};
}

/** The words of an excerpt with the matched terms marked. */
export function markTerms(text: string, terms: string[]): {text: string; hit: boolean}[] {
  const wanted = terms.map(t => t.trim()).filter(Boolean);
  if (!wanted.length || !text) return [{text, hit: false}];
  const escaped = wanted.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(pattern).filter(Boolean).map(part => ({text: part, hit: wanted.some(t => t.toLowerCase() === part.toLowerCase())}));
}
