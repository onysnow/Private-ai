'use client';
import type {ReactElement, ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {AppFrame} from '../frame/app-frame';
import {QueryProvider} from '../../lib/query-client';
import {LockGate} from '../../features/lock/lock-gate';

// The operator console (/console) embeds the backend's own full-height UI in
// an iframe and renders its own top bar -- it deliberately opts out of the
// app chrome so the iframe gets the whole viewport, matching how it worked
// before this shell existed.
const CHROMELESS_ROUTES = ['/console'];

export function AppShell({children}: {children: ReactNode}): ReactElement {
  const pathname = usePathname();
  const chromeless = CHROMELESS_ROUTES.some(route => pathname?.startsWith(route));

  if (chromeless) {
    return <>{children}</>;
  }

  return <QueryProvider><LockGate><AppFrame>{children}</AppFrame></LockGate></QueryProvider>;
}
