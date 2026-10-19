'use client';
// Every stage on one page (CaseWorkbench view="all"), with its own data
// cache: what the page tests render.
import type {ReactElement} from 'react';

import {QueryProvider} from '../../lib/query-client';
import {CaseWorkbench} from './case-workbench';

export default function Home(): ReactElement {
  return <QueryProvider><CaseWorkbench view="all"/></QueryProvider>;
}
