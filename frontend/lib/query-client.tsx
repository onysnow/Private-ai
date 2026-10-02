'use client';
// Server data lives in TanStack Query, keyed by investigation (Foundation
// Fixes fix 3). A panel that saves something marks the related queries stale
// instead of calling other panels' reload functions.
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {useState} from 'react';
import type {ReactNode} from 'react';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // A failed request shows its error at once, as hand-written calls do;
      // the reporter decides whether to try again.
      queries: {retry: false, refetchOnWindowFocus: false, staleTime: 30_000},
      mutations: {retry: false},
    },
  });
}

export function QueryProvider({children}: {children: ReactNode}): ReactNode {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
