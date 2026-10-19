// @vitest-environment jsdom
// "Linked groups" is laid out in a Web Worker so a large case does not hold the page
// (lib/use-arrangement.ts); the other arrangements, and places without workers, stay on the page.
import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {arrange} from '../lib/network-arrange';
import {useArrangement} from '../lib/use-arrangement';
import type {ArrLink, ArrParty} from '../lib/network-rules';

const parties: ArrParty[] = [{id: 'a', label: 'Meridian Holdings', kind: 'company'}, {id: 'b', label: 'Bellcastle Trading', kind: 'company'},
  {id: 'c', label: 'Alaric Voss', kind: 'person'}];
const links: ArrLink[] = [{id: 'l1', from: 'c', to: 'a', control: true}, {id: 'l2', from: 'a', to: 'b', control: false}];

/** A stand-in Worker that runs the same arrange() when told to answer. */
class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  request: Record<string, unknown> | null = null;
  terminated = false;
  constructor() { FakeWorker.made.push(this); }
  postMessage(request: Record<string, unknown>) { this.request = request; }
  terminate() { this.terminated = true; }
  answer() {
    const {id, arrangement, parties: p, links: l, focus} = this.request as never;
    this.onmessage?.({data: {id, placed: arrange(arrangement, p, l, {focus})}} as MessageEvent);
  }
}

afterEach(() => { vi.unstubAllGlobals(); FakeWorker.made = []; });

describe('useArrangement', () => {
  it('lays out "Linked groups" in a worker: nothing placed until it answers, then the same places', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const {result} = renderHook(() => useArrangement('clusters', parties, links));
    expect(result.current).toEqual({placed: null, laying: true});
    await waitFor(() => expect(FakeWorker.made.at(-1)?.request).not.toBeNull());
    act(() => FakeWorker.made.at(-1)!.answer());
    expect(result.current.laying).toBe(false);
    expect(result.current.placed).toEqual(arrange('clusters', parties, links));
  });

  it('keeps the quick arrangements on the page, and everything where there are no workers', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const control = renderHook(() => useArrangement('control', parties, links)).result.current;
    expect(control.laying).toBe(false);
    expect(control.placed).toEqual(arrange('control', parties, links));
    expect(FakeWorker.made).toHaveLength(0);
    vi.unstubAllGlobals();
    vi.stubGlobal('Worker', undefined);
    const clusters = renderHook(() => useArrangement('clusters', parties, links)).result.current;
    expect(clusters).toEqual({placed: arrange('clusters', parties, links), laying: false});
  });

  it('stops the work for a drawing no longer asked for', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const {rerender, unmount} = renderHook(({l}) => useArrangement('clusters', parties, l), {initialProps: {l: links}});
    await waitFor(() => expect(FakeWorker.made.length).toBeGreaterThan(0));
    const first = FakeWorker.made.at(-1)!;
    rerender({l: links.slice(0, 1)});
    expect(first.terminated).toBe(true);
    unmount();
    expect(FakeWorker.made.at(-1)!.terminated).toBe(true);
  });
});
