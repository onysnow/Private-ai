'use client';
// Reading the Red Flags never runs the rules (GET .../red-flags reads what they last found); running them is its
// own request (POST .../red-flags/run, mockup ACT_1 "Reading never writes"). Every screen that shows flags reads
// them through here. When the records have changed since the rules last ran (`stale`), the first screen to notice
// runs them once and puts the fresh answer in place for all, so each screen still shows the flags as of now.
import {useIsMutating, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {QueryClient, UseMutationResult, UseQueryResult} from '@tanstack/react-query';
import {useEffect} from 'react';

import {getRedFlagsOptions, getRedFlagsQueryKey, getStandingQueryKey, runRedFlagsMutation} from '../../lib/generated/@tanstack/react-query.gen';
import type {Options} from '../../lib/generated/sdk.gen';
import type {GetRedFlagsError, RedFlagsOut, RunRedFlagsData, RunRedFlagsError} from '../../lib/generated/types.gen';

// Each (case, last run) is run at most once per page, so a run whose answer still reads stale (a reader without
// write access, or records changing underneath) cannot start another and another.
const tried = new WeakMap<QueryClient, Set<string>>();
const triedFor = (client: QueryClient): Set<string> => {
  let seen = tried.get(client);
  if (!seen) { seen = new Set(); tried.set(client, seen); }
  return seen;
};
const runKey = (investigationId: string, ranAt: string | null | undefined) => `${investigationId}@${ranAt ?? 'never'}`;
export const runMutationKey = (investigationId: string): string[] => ['red-flags-run', investigationId];

export type RedFlagsRead = {
  query: UseQueryResult<RedFlagsOut, GetRedFlagsError>;
  run: UseMutationResult<RedFlagsOut, RunRedFlagsError, Options<RunRedFlagsData>>;
  /** The rules are running (or about to, the records having changed since they last ran). */
  running: boolean;
  /** Nothing to show yet: the read is on its way, or the rules have never run and are running now. */
  waiting: boolean;
};

export function useRedFlagsQuery(investigationId: string, enabled = true): RedFlagsRead {
  const queryClient = useQueryClient();
  const path = {investigation_id: investigationId};
  const on = enabled && Boolean(investigationId);
  const query = useQuery({...getRedFlagsOptions({path}), enabled: on});
  const run = useMutation({
    ...runRedFlagsMutation(), mutationKey: runMutationKey(investigationId),
    onSuccess: data => {
      if (data.stale) triedFor(queryClient).add(runKey(investigationId, data.ran_at));
      queryClient.setQueryData(getRedFlagsQueryKey({path}), data);
      // Case home's standing counts read the stored flags.
      void queryClient.invalidateQueries({queryKey: getStandingQueryKey({path})});
    },
  });
  const busy = useIsMutating({mutationKey: runMutationKey(investigationId)}) > 0;
  const data = query.data;
  const due = Boolean(on && data?.stale && !triedFor(queryClient).has(runKey(investigationId, data.ran_at)));
  useEffect(() => {
    if (!due || !data) return;
    const seen = triedFor(queryClient);
    const key = runKey(investigationId, data.ran_at);
    if (seen.has(key)) return;
    seen.add(key);
    run.mutate({path: {investigation_id: investigationId}});
  }, [due, data, investigationId, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = busy || due;
  return {query, run, running, waiting: query.isPending || (running && !data?.ran_at)};
}
