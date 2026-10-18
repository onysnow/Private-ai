// The live run record as Server-Sent Events (GET …/ai-runs/{run_id}/events/stream, ADR-0012). Each step is merged into
// the same query the screen reads, so the map, lanes and log need no second source. On a dropped connection it
// reconnects from the last event it has (?after=n, which the route reads like Last-Event-ID; a custom header would need
// a CORS change) and says which event it is catching up from; after three failures in a row the
// screen falls back to polling …/events?after=n.
import {useQueryClient} from '@tanstack/react-query';
import {useEffect, useState} from 'react';

import {api} from '../../lib/api-instance';
import {listAiRunEventsQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {AiRunEventOut, AiRunEventsOut} from '../../lib/generated/types.gen';

export type StreamState = {mode: 'off' | 'live' | 'reconnecting' | 'polling'; from: number};

/** Split a Server-Sent Events buffer into whole messages; the rest waits for more bytes. */
export function parseSse(buffer: string): {messages: Array<{id?: string; event: string; data: string}>; rest: string} {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const messages = parts.filter(Boolean).map(block => {
    const m: {id?: string; event: string; data: string} = {event: 'message', data: ''};
    for (const line of block.split('\n')) {
      const at = line.indexOf(':');
      if (at <= 0) continue;
      const field = line.slice(0, at), value = line.slice(at + 1).replace(/^ /, '');
      if (field === 'id') m.id = value; else if (field === 'event') m.event = value; else if (field === 'data') m.data += value;
    }
    return m;
  });
  return {messages, rest};
}

export function useRunStream(investigationId: string, runId: string | null, live: boolean): StreamState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>({mode: 'off', from: 0});
  useEffect(() => {
    if (!runId || !investigationId || !live || typeof ReadableStream === 'undefined') { setState({mode: 'off', from: 0}); return; }
    const key = listAiRunEventsQueryKey({path: {investigation_id: investigationId, run_id: runId}, query: {after: 0}});
    const ctrl = new AbortController();
    let failures = 0;
    let stopped = false;
    const lastN = () => Math.max(0, ...((queryClient.getQueryData<AiRunEventsOut>(key)?.events ?? []).map(e => e.n)));
    const merge = (step: AiRunEventOut) => queryClient.setQueryData<AiRunEventsOut>(key, old => {
      if (!old || old.events.some(e => e.n === step.n)) return old;
      return {...old, events: [...old.events, step].sort((a, b) => a.n - b.n)};
    });
    const connect = async (): Promise<void> => {
      const from = lastN();
      try {
        const res = await api.stream(`/api/investigations/${encodeURIComponent(investigationId)}/ai-runs/${encodeURIComponent(runId)}/events/stream?after=${from}`,
          {signal: ctrl.signal});
        if (!res.body) throw new Error('no body');
        setState({mode: 'live', from});
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
            if (m.event === 'step') { try { merge(JSON.parse(m.data) as AiRunEventOut); } catch { /* a malformed step is skipped; polling catches up */ } }
            else if (m.event === 'end') { stopped = true; void queryClient.invalidateQueries({queryKey: key}); setState({mode: 'off', from: lastN()}); return; }
          }
        }
        throw new Error('closed');
      } catch {
        if (ctrl.signal.aborted || stopped) return;
        failures += 1;
        if (failures >= 3) { setState({mode: 'polling', from: lastN()}); return; }
        setState({mode: 'reconnecting', from: lastN()});
        await new Promise(r => window.setTimeout(r, 1000 * 2 ** (failures - 1)));
        if (!ctrl.signal.aborted) void connect();
      }
    };
    void connect();
    return () => { ctrl.abort(); };
  }, [investigationId, runId, live, queryClient]);
  return state;
}
