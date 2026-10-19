// Practise in Learn, the data side (research Knowledge §6; backend app/services/learning.py): the reporter's flip
// cards, kept per reporter and not per case, on a fixed ladder of days. "Practise · n due" reads the summary;
// "My case's areas" is a deck named by the open case's areas (the case layer).
import {useQuery} from '@tanstack/react-query';
import type {QueryClient, UseQueryResult} from '@tanstack/react-query';

import {learningSummaryOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {LearningSummaryOut} from '../../lib/generated/types.gen';

export type DeckKey = 'all' | 'case' | 'area' | 'terms' | 'safety';
export type Deck = {deck: DeckKey; area?: string};

export const DECK_LABEL: Record<Exclude<DeckKey, 'area'>, string> = {
  all: 'All my cards', case: 'My case’s areas', terms: 'Terms I opened', safety: 'Safety',
};

/** The answer buttons, in the Anki manual's order ([R4]): Again / Good by default, Hard / Easy behind a setting. */
export const ANSWERS = ['again', 'hard', 'good', 'easy'] as const;
export type AnswerKey = typeof ANSWERS[number];
export const ANSWER_LABEL: Record<AnswerKey, string> = {again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy'};

/** The answers shown: two in the simple mode, four with Hard / Easy on. Keys 1–2 (or 1–4) pick them in this order. */
export function shownAnswers(four: boolean): AnswerKey[] {
  return four ? [...ANSWERS] : ['again', 'good'];
}

const FOUR_KEY = 'pai:practise-four-answers';
/** The setting "Hard / Easy too": per viewer, in the browser; Again / Good when it cannot be read. */
export function readFourAnswers(): boolean {
  try { return window.localStorage.getItem(FOUR_KEY) === '1'; } catch { return false; }
}
export function writeFourAnswers(on: boolean): void {
  try { window.localStorage.setItem(FOUR_KEY, on ? '1' : '0'); } catch { /* the setting lasts this visit only */ }
}

/** When a card comes back after an answer, in words: "now", "1 day", "3 days". */
export function intervalWords(days: number): string {
  if (days <= 0) return 'now';
  return days === 1 ? '1 day' : `${days} days`;
}

/** How long until a time, in words: "in 2 days", "in 5 hours", "in a few minutes". */
export function untilWords(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  // The API sends UTC, sometimes without the offset.
  const at = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  const minutes = Math.max(0, Math.round((at - now.getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? 'in a minute' : `in ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'in an hour' : `in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

/** The first sentence of a text: a sign's definition as a short scene for the front of a card. */
export function firstSentence(text: string): string {
  const match = /^([\s\S]+?[.!?])(?=\s+[A-Z“"(]|$)/.exec(text.trim());
  return (match ? match[1] : text).trim();
}

/** "Practise · n due": the summary, with the open case's areas for the "My case's areas" deck. */
export function usePractiseSummary(caseAreas: string[], enabled = true): UseQueryResult<LearningSummaryOut, unknown> {
  return useQuery({...learningSummaryOptions({query: {areas: caseAreas.join(',')}}), staleTime: 30_000, enabled});
}

/** Every learning reply (the summary, every deck, a card looked up by its indicator) is read again after a change. */
export function invalidateLearning(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({predicate: q => {
    const id = (q.queryKey[0] as {_id?: unknown} | undefined)?._id;
    return typeof id === 'string' && /learning/i.test(id);
  }});
}
