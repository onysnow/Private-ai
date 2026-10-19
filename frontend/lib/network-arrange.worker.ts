// Lays out the relationship network off the page's main thread (lib/use-arrangement.ts):
// the same arrange() the page would run, so the drawing is the same.
import {arrange} from './network-arrange';
import type {ArrLink, ArrParty, Arrangement} from './network-rules';

export type ArrangeRequest = {id: number; arrangement: Arrangement; parties: ArrParty[]; links: ArrLink[]; focus: string | null};

const scope = self as unknown as {onmessage: ((event: MessageEvent<ArrangeRequest>) => void) | null; postMessage: (message: unknown) => void};
scope.onmessage = event => {
  const {id, arrangement, parties, links, focus} = event.data;
  scope.postMessage({id, placed: arrange(arrangement, parties, links, {focus})});
};
