'use client';
// The API-access check the page runs on load (Foundation Fixes fix 3): the
// settings status is the first request, and what it answers decides whether
// the page may go on. 401 means the server wants a bearer token for this
// session; 403 means remote access is switched off on the server. The
// status itself is server data, so it lives in TanStack Query and the
// panels that show it (the security block, the AI panel) read the same
// cache entry.
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';

import {ApiHttpError, errorMessage} from '../../lib/api-client';
import {api} from '../../lib/api-instance';
import {settingsStatusOptions, settingsStatusQueryKey} from '../../lib/generated/@tanstack/react-query.gen';
import type {SettingsStatusOut} from '../../lib/generated/types.gen';
import {isAppLevelQuery} from '../../lib/investigation-queries';

export type ApiAccessState = 'checking' | 'local' | 'authenticated' | 'needs_token' | 'remote_disabled' | 'error';

export type ApiAccess = {
  state: ApiAccessState;
  message: string;
  /** True once the server has answered the settings status: the page may ask for everything else. */
  ready: boolean;
  settingsStatus: SettingsStatusOut | null;
  /** Uses the token for this browser session and rechecks access. */
  connectWithToken: (token: string) => Promise<void>;
  /** Forgets the token and rechecks access without it. */
  clearApiSession: () => Promise<void>;
};

export function useApiAccess(): ApiAccess {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(settingsStatusOptions());
  // Shown instead of the plain "checking" message while a cleared token is rechecked.
  const [recheckNote, setRecheckNote] = useState('');

  let state: ApiAccessState;
  let message: string;
  if (settingsQuery.isPending) {
    state = 'checking';
    message = recheckNote || 'Checking API access…';
  } else if (settingsQuery.isError) {
    const error = settingsQuery.error;
    if (error instanceof ApiHttpError && error.status === 401) {
      state = 'needs_token';
      message = 'This API requires a bearer token for non-local access. Enter it below; it will be kept only in memory for this page session.';
    } else if (error instanceof ApiHttpError && error.status === 403) {
      state = 'remote_disabled';
      message = 'Remote API access is disabled on the backend. Use the workbench locally or configure JW_API_AUTH_TOKEN on the backend.';
    } else {
      state = 'error';
      message = errorMessage(error, 'Could not connect to the API');
    }
  } else if (api.hasAuthToken()) {
    state = 'authenticated';
    message = 'Authenticated for this browser session. Token is held only in memory.';
  } else {
    state = 'local';
    message = settingsQuery.data.access.mode === 'local_only'
      ? 'Local-only API access. No bearer token is required on loopback.'
      : 'Connected from a trusted local address; remote clients require the configured bearer token.';
  }

  const connectWithToken = async (token: string) => {
    api.setAuthToken(token);
    setRecheckNote('');
    // Back to "checking", then the status is asked for again with the token.
    await queryClient.resetQueries({queryKey: settingsStatusQueryKey()});
  };

  const clearApiSession = async () => {
    api.clearAuthToken();
    setRecheckNote('Session token cleared. Rechecking API access…');
    // Everything server-wide is forgotten and asked for again without the token.
    await queryClient.resetQueries({predicate: isAppLevelQuery});
  };

  return {state, message, ready: settingsQuery.isSuccess, settingsStatus: settingsQuery.data ?? null, connectWithToken, clearApiSession};
}
