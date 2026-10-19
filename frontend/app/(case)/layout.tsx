'use client';
// The case's own addresses (/, /bring-in, /check, /see, /act, /keep, /decide)
// share this layout, so the workbench and its panels stay mounted while the
// reporter moves between them (components/case/case-workbench.tsx).
import type {ReactElement, ReactNode} from 'react';

import {CaseWorkbench} from '../../components/case/case-workbench';
import {QueryProvider} from '../../lib/query-client';

export default function CaseLayout({children}: {children: ReactNode}): ReactElement {
  return <QueryProvider>
    <CaseWorkbench/>
    {children}
  </QueryProvider>;
}
