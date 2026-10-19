'use client';
// Where the network's parties sit (lib/network-arrange.ts), without holding the page.
//
// "Linked groups" runs ForceAtlas2 and Noverlap, which on a large case take
// seconds: run on the page, they froze it (the browser walkthrough of 11 Oct
// timed about 20 s). That arrangement is laid out in a Web Worker
// (lib/network-arrange.worker.ts, the same arrange()), so the page stays
// usable while it is worked out; until it is, `placed` is null and the view
// says it is laying out. The other arrangements are quick and stay on the page,
// as does everything where workers are not available (tests, old browsers).
import {useEffect, useMemo, useState} from 'react';

import {arrange} from './network-arrange';
import type {ArrLink, ArrParty, Arrangement, Placed} from './network-rules';
import type {ArrangeRequest} from './network-arrange.worker';

/** The arrangements laid out off the main thread. */
export const OFF_THREAD: ReadonlySet<Arrangement> = new Set(['clusters']);

let serial = 0;

export function useArrangement(arrangement: Arrangement, parties: ArrParty[], links: ArrLink[], focus: string | null = null): {placed: Placed | null; laying: boolean} {
  const offThread = OFF_THREAD.has(arrangement) && typeof Worker !== 'undefined';
  const onPage = useMemo(() => (offThread ? null : arrange(arrangement, parties, links, {focus})), [offThread, arrangement, parties, links, focus]);
  // The answer the worker gave, for the request it answered (an older request's answer is not shown).
  const [answer, setAnswer] = useState<{request: {arrangement: Arrangement; parties: ArrParty[]; links: ArrLink[]; focus: string | null}; placed: Placed} | null>(null);
  useEffect(() => {
    if (!offThread) return;
    const id = (serial += 1);
    const request = {arrangement, parties, links, focus};
    const worker = new Worker(new URL('./network-arrange.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{id: number; placed: Placed}>) => {
      if (event.data.id === id) setAnswer({request, placed: event.data.placed});
      worker.terminate();
    };
    worker.postMessage({id, ...request} satisfies ArrangeRequest);
    // A newer request (or leaving the view) stops this one's work.
    return () => worker.terminate();
  }, [offThread, arrangement, parties, links, focus]);
  if (!offThread) return {placed: onPage, laying: false};
  const current = answer && answer.request.arrangement === arrangement && answer.request.parties === parties
    && answer.request.links === links && answer.request.focus === focus;
  return current ? {placed: answer.placed, laying: false} : {placed: null, laying: true};
}
