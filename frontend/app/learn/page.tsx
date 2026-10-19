'use client';
// Learn › Red Flags catalogue (mockup KNOWLEDGE_KEEP_1; features/knowledge/learn-screen.tsx).
// ?area=BO&indicator=BO-007&view=map|table|cards open a place; ?inv= lays a case over it.
import type {ReactElement} from 'react';

import {LearnScreen} from '../../features/knowledge/learn-screen';
import {QueryProvider} from '../../lib/query-client';

export default function LearnPage(): ReactElement {
  return <QueryProvider><LearnScreen tab="catalogue"/></QueryProvider>;
}
