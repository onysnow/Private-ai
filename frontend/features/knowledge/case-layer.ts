// The open case as a layer over the catalogue (research Knowledge §3, innovation 1): which indicators fire in it,
// at which level, and which rules ran without firing. Read from the case's Red Flags (GET
// /investigations/{id}/red-flags, the same reply Act › Red Flags draws), so the two screens never disagree.
import {useQuery} from '@tanstack/react-query';
import {useMemo} from 'react';

import {getRedFlagsOptions, listInvestigationsOptions} from '../../lib/generated/@tanstack/react-query.gen';
import type {RedFlagOut, RedFlagsOut} from '../../lib/generated/types.gen';

const RANK: Record<string, number> = {textbook: 3, strong: 2, faint: 1};

export type CaseLayer = {
  investigationId: string;
  caseName: string;
  /** Open flags (not set aside) by indicator id, strongest first. */
  flags: Map<string, RedFlagOut[]>;
  /** How many indicators fire, per area key. */
  firesByArea: Map<string, number>;
  /** Indicators whose rule ran on this case (fired or not). */
  ran: Set<string>;
  /** The case's areas: its type's areas, then any other area where a flag fires (Practise's "My case's areas"). */
  areas: string[];
  loading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  refetching: boolean;
};

export function strongest(flags: RedFlagOut[] | undefined): RedFlagOut | undefined {
  return flags?.[0];
}

/** The layer from a Red Flags reply: pure, so it is tested without a server. */
export function buildLayer(reply: RedFlagsOut | undefined): Pick<CaseLayer, 'flags' | 'firesByArea' | 'ran' | 'areas'> {
  const flags = new Map<string, RedFlagOut[]>();
  for (const f of reply?.flags ?? []) {
    if (f.status === 'dismissed') continue;
    flags.set(f.indicator_id, [...(flags.get(f.indicator_id) ?? []), f]);
  }
  for (const list of flags.values()) list.sort((a, b) => (RANK[b.level] ?? 0) - (RANK[a.level] ?? 0) || b.weight - a.weight);
  const firesByArea = new Map<string, number>();
  for (const id of flags.keys()) {
    const area = id.split('-')[0];
    firesByArea.set(area, (firesByArea.get(area) ?? 0) + 1);
  }
  const cannot = new Set((reply?.cannot_run ?? []).map(c => c.indicator_id));
  const ran = new Set((reply?.rules ?? []).map(r => r.indicator_id).filter(id => !cannot.has(id)));
  const areas = [...new Set([...(reply?.investigation_type?.areas ?? []).map(a => a.key), ...firesByArea.keys()])];
  return {flags, firesByArea, ran, areas};
}

export function useCaseLayer(investigationId: string): CaseLayer {
  const enabled = Boolean(investigationId);
  const query = useQuery({...getRedFlagsOptions({path: {investigation_id: investigationId}}), enabled});
  const cases = useQuery({...listInvestigationsOptions(), enabled});
  const layer = useMemo(() => buildLayer(query.data), [query.data]);
  const caseName = cases.data?.find(c => c.id === investigationId)?.name ?? '';
  return {investigationId, caseName, ...layer, loading: enabled && query.isPending, error: query.error,
    refetch: () => query.refetch(), refetching: query.isFetching};
}
