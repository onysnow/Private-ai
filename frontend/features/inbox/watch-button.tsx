'use client';
// "Watch": be told in the inbox when this claim's status or this Red Flag's level changes
// (Settings › Notifications, "Watches on facts"). A second press stops watching.
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {ReactElement} from 'react';

import {createWatchMutation, deleteWatchMutation, listWatchesOptions, listWatchesQueryKey} from '../../lib/generated/@tanstack/react-query.gen';

export function WatchButton({investigationId, recordType, recordId, className = 'ap-btn'}: {
  investigationId: string; recordType: 'claim' | 'red_flag'; recordId: string; className?: string;
}): ReactElement {
  const queryClient = useQueryClient();
  const key = listWatchesQueryKey({path: {investigation_id: investigationId}});
  const watches = useQuery({...listWatchesOptions({path: {investigation_id: investigationId}}), enabled: Boolean(investigationId)});
  const refresh = () => queryClient.invalidateQueries({queryKey: key});
  const add = useMutation({...createWatchMutation(), onSuccess: refresh});
  const stop = useMutation({...deleteWatchMutation(), onSuccess: refresh});
  const mine = watches.data?.find(w => w.record_type === recordType && w.record_id === recordId);
  const what = recordType === 'claim' ? 'its status' : 'its level';
  return <button type="button" className={className} aria-pressed={Boolean(mine)} disabled={add.isPending || stop.isPending || watches.isPending}
    title={mine ? 'You are told in the inbox when this changes. Press to stop.' : `Be told in the inbox when ${what} changes`}
    onClick={() => mine ? stop.mutate({path: {fact_watch_id: mine.id}}) : add.mutate({body: {record_type: recordType, record_id: recordId}})}>
    {mine ? 'Watching ✓' : 'Watch'}
  </button>;
}
