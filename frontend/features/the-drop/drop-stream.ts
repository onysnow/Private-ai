// The Drop's per-file event stream (GET …/drop/stream, ADR-0014), in place of polling the whole drop every 2 s.
// Each `lane` event is one file whose lane changed (the first look sends every file), `gone` a file removed, and
// `summary` the rest of the drop with the order of its files; all are merged into the same query the screen
// reads, so nothing else changes. The stream ends (`end`) once no file is being read. On a dropped connection it
// reconnects (the server sends every file again on a new connection); after three failures in a row the screen
// falls back to polling, as before.
import {useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';

import {api} from '../../lib/api-instance';
import {getDropQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {DropLaneOut, DropOut} from '../../lib/generated/types.gen';
import {parseSse} from '../ai/run-stream';

export type DropStreamMode = 'off' | 'live' | 'reconnecting' | 'polling';
type Summary = Omit<DropOut, 'lanes'> & {order: string[]};

/** Merge one stream message into the drop as last read; files keep their place until a summary gives the order. */
export function mergeDropEvent(old: DropOut | undefined, event: string, data: unknown): DropOut | undefined {
  if (event === 'summary') {
    const {order, ...rest} = data as Summary;
    const lanes = new Map((old?.lanes ?? []).map(l => [l.document_id, l]));
    return {...rest, lanes: order.map(id => lanes.get(id)).filter((l): l is DropLaneOut => Boolean(l))};
  }
  if (!old) return old;
  if (event === 'lane') {
    const lane = data as DropLaneOut;
    const at = old.lanes.findIndex(l => l.document_id === lane.document_id);
    return {...old, lanes: at < 0 ? [...old.lanes, lane] : old.lanes.map((l, i) => (i === at ? lane : l))};
  }
  if (event === 'gone') {
    const id = (data as {document_id: string}).document_id;
    return {...old, lanes: old.lanes.filter(l => l.document_id !== id)};
  }
  return old;
}

export function useDropStream(investigationId: string, live: boolean): DropStreamMode {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DropStreamMode>('off');
  useEffect(() => {
    if (!investigationId || !live || typeof ReadableStream === 'undefined') { setMode('off'); return undefined; }
    const key = getDropQueryKey({path: {investigation_id: investigationId}});
    const ctrl = new AbortController();
    let failures = 0;
    let ended = false;
    // Every file as this connection last heard of it: the summary puts them in order, even before the drop was read.
    let known = new Map<string, DropLaneOut>();
    const apply = (event: string, data: unknown) => {
      if (event === 'lane') known.set((data as DropLaneOut).document_id, data as DropLaneOut);
      if (event === 'gone') known.delete((data as {document_id: string}).document_id);
      queryClient.setQueryData<DropOut>(key, old => mergeDropEvent(event === 'summary' ? {...(old as DropOut), lanes: [...known.values()]} : old, event, data));
    };
    const connect = async (): Promise<void> => {
      known = new Map((queryClient.getQueryData<DropOut>(key)?.lanes ?? []).map(l => [l.document_id, l]));
      try {
        const res = await api.stream(`/api/investigations/${encodeURIComponent(investigationId)}/drop/stream`, {signal: ctrl.signal});
        if (!res.body) throw new Error('no body');
        setMode('live');
        failures = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          const {messages, rest} = parseSse(buffer);
          buffer = rest;
          for (const m of messages) {
            if (m.event === 'end') { ended = true; setMode('off'); void queryClient.invalidateQueries({queryKey: key}); return; }
            try { apply(m.event, JSON.parse(m.data)); } catch { /* a malformed message is skipped; the next look sends it again */ }
          }
        }
        throw new Error('closed');
      } catch {
        if (ctrl.signal.aborted || ended) return;
        failures += 1;
        if (failures >= 3) { setMode('polling'); return; }
        setMode('reconnecting');
        await new Promise(r => window.setTimeout(r, 1000 * 2 ** (failures - 1)));
        if (!ctrl.signal.aborted) void connect();
      }
    };
    void connect();
    return () => { ctrl.abort(); };
  }, [investigationId, live, queryClient]);
  return mode;
}
