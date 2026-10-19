'use client';
// Keep › Safety & data (mockup KEEP-safety-and-data; features/safety/safety-screen.tsx). ?inv= opens a case.
import type {ReactElement} from 'react';

import '../../../styles/safety.css';
import {SafetyScreen} from '../../../features/safety/safety-screen';
import {QueryProvider} from '../../../lib/query-client';

export default function SafetyPage(): ReactElement {
  return <QueryProvider><SafetyScreen/></QueryProvider>;
}
